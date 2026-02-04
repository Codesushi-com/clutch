#!/bin/bash
# Project Work Loop Gate Script
# Usage: project-gate.sh <project_id>

set -euo pipefail

PROJECT_ID="${1:-}"
if [[ -z "$PROJECT_ID" ]]; then
    echo "Usage: $0 <project_id>"
    exit 1
fi

# Configuration
TRAP_DB="${HOME}/.trap/trap.db"
MAX_CONCURRENT_AGENTS=3
API_BASE="http://localhost:3002"

# Check if project exists and work loop is enabled
project_data=$(sqlite3 "$TRAP_DB" "SELECT name, work_loop_enabled, local_path, github_repo FROM projects WHERE id = '$PROJECT_ID'" 2>/dev/null || echo "")

if [[ -z "$project_data" ]]; then
    echo "Project $PROJECT_ID not found"
    exit 1
fi

IFS='|' read -r project_name work_loop_enabled local_path github_repo <<< "$project_data"

if [[ "$work_loop_enabled" != "1" ]]; then
    echo "Work loop disabled for project: $project_name"
    exit 0
fi

if [[ -z "$local_path" ]] || [[ -z "$github_repo" ]]; then
    echo "Project $project_name missing required configuration (local_path: $local_path, github_repo: $github_repo)"
    exit 1
fi

if [[ ! -d "$local_path" ]]; then
    echo "Local path does not exist: $local_path"
    exit 1
fi

# Check for ready tasks
ready_count=$(sqlite3 "$TRAP_DB" "SELECT COUNT(*) FROM tasks WHERE project_id = '$PROJECT_ID' AND status = 'ready' AND (dispatch_status IS NULL OR dispatch_status NOT IN ('pending', 'spawning', 'active'))" 2>/dev/null || echo "0")

if [[ "$ready_count" -eq 0 ]]; then
    echo "No ready tasks for project: $project_name"
    exit 0
fi

# Check concurrent agent limit
active_agents=$(sqlite3 "$TRAP_DB" "SELECT COUNT(*) FROM tasks WHERE project_id = '$PROJECT_ID' AND dispatch_status = 'active'" 2>/dev/null || echo "0")

if [[ "$active_agents" -ge "$MAX_CONCURRENT_AGENTS" ]]; then
    echo "Max concurrent agents reached ($active_agents/$MAX_CONCURRENT_AGENTS) for project: $project_name"
    exit 0
fi

# Check for open PRs (prevent duplicate work)
# This would require GitHub API access - for now we'll skip this check
# TODO: Add GitHub API check for open PRs

# Get the first ready task
task_data=$(sqlite3 "$TRAP_DB" "SELECT id, title FROM tasks WHERE project_id = '$PROJECT_ID' AND status = 'ready' AND (dispatch_status IS NULL OR dispatch_status NOT IN ('pending', 'spawning', 'active')) ORDER BY position, created_at LIMIT 1" 2>/dev/null || echo "")

if [[ -z "$task_data" ]]; then
    echo "No available tasks for project: $project_name"
    exit 0
fi

IFS='|' read -r task_id task_title <<< "$task_data"

echo "Project: $project_name"
echo "Task: $task_title ($task_id)"
echo "Local path: $local_path"
echo "GitHub repo: $github_repo"
echo "Ready to process: $ready_count task(s)"
echo "Active agents: $active_agents/$MAX_CONCURRENT_AGENTS"

# Spawn sub-agent to process the task
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_TEMPLATE="$SCRIPT_DIR/process-task.md"

# Read the task description
task_description=$(sqlite3 "$TRAP_DB" "SELECT description FROM tasks WHERE id = '$task_id'" 2>/dev/null || echo "")
task_priority=$(sqlite3 "$TRAP_DB" "SELECT priority FROM tasks WHERE id = '$task_id'" 2>/dev/null || echo "medium")

# Fetch full project context from API (includes AGENTS.md, README.md, etc.)
project_context_formatted=""
context_response=$(curl -s "${API_BASE}/api/projects/${PROJECT_ID}/context" 2>/dev/null || echo "{}")
if echo "$context_response" | grep -q '"formatted"'; then
    # Extract the formatted context using jq (fallback to basic info if jq unavailable)
    if command -v jq &> /dev/null; then
        project_context_formatted=$(echo "$context_response" | jq -r '.formatted // empty')
    fi
fi

# Generate the work instructions by replacing placeholders
work_instructions=$(cat "$TASK_TEMPLATE" | \
  sed "s/{project_name}/$project_name/g" | \
  sed "s|{local_path}|$local_path|g" | \
  sed "s/{github_repo}/$github_repo/g" | \
  sed "s/{project_slug}/$PROJECT_ID/g" | \
  sed "s/{task_id}/$task_id/g" | \
  sed "s/{task_title}/$task_title/g" | \
  sed "s/{task_priority}/$task_priority/g")

# Replace task description (may contain special characters, use awk)
work_instructions=$(echo "$work_instructions" | awk -v desc="$task_description" '{gsub(/{task_description}/, desc); print}')

# Append full project context if available
if [[ -n "$project_context_formatted" ]]; then
    work_instructions="${work_instructions}

---

# Project Context (Cascaded)

${project_context_formatted}"
fi

echo "$work_instructions"