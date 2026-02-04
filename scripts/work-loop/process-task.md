# Project Work Loop - Task Processor

You are processing a task from the automated work loop for project **{project_name}**.

## Task Details
- **ID:** {task_id}
- **Title:** {task_title}
- **Priority:** {task_priority}
- **Project:** {project_name}
- **Working Directory:** `{local_path}`
- **GitHub Repo:** {github_repo}

## Description

{task_description}

## Instructions

1. **Move task to in_progress status:**
   ```bash
   curl -s -X PATCH http://localhost:3002/api/tasks/{task_id} \
     -H 'Content-Type: application/json' \
     -d '{"status": "in_progress", "dispatch_status": "active"}'
   ```

2. **Work in the project directory:**
   ```bash
   cd {local_path}
   ```

3. **Implement the task:**
   - Read the task description carefully
   - Understand what needs to be built/fixed
   - Follow project conventions (see Project Files section below)
   - Write clean, working code
   - Test your changes

4. **Create a pull request:**
   - Make commits with clear messages
   - Push to a feature branch
   - Create PR with descriptive title and body
   - Link the task in the PR description

5. **Move task to in_review status:**
   ```bash
   curl -s -X PATCH http://localhost:3002/api/tasks/{task_id} \
     -H 'Content-Type: application/json' \
     -d '{"status": "in_review", "dispatch_status": "completed"}'
   ```

6. **Post completion comment:**
   ```bash
   curl -s -X POST http://localhost:3002/api/tasks/{task_id}/comments \
     -H 'Content-Type: application/json' \
     -d '{
       "content": "✓ Task completed and PR created: [PR_LINK_HERE]",
       "author": "work-loop",
       "author_type": "agent", 
       "type": "completion"
     }'
   ```

## Error Handling

If you encounter issues:

1. **Post a blocker comment:**
   ```bash
   curl -s -X POST http://localhost:3002/api/tasks/{task_id}/comments \
     -H 'Content-Type: application/json' \
     -d '{
       "content": "❌ Unable to complete task: [REASON]",
       "author": "work-loop",
       "author_type": "agent",
       "type": "status_change"
     }'
   ```

2. **Move task back to ready (for retry):**
   ```bash
   curl -s -X PATCH http://localhost:3002/api/tasks/{task_id} \
     -H 'Content-Type: application/json' \
     -d '{"status": "ready", "dispatch_status": "failed"}'
   ```

## Success Criteria

- Task implementation matches the description
- Code follows project standards (check AGENTS.md if present)
- Tests pass (if applicable)  
- PR is created and linked
- Task status updated to in_review
- Clear completion comment posted

Work efficiently and autonomously. Focus on delivering working code that meets the requirements.
