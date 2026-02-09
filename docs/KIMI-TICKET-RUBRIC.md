# Kimi Ticket Rubric

What makes a ticket ready for Kimi (or any sub-agent) to execute successfully.

## Required Elements

### 1. Clear Title
**Format:** Action verb + specific target

| ✅ Good | ❌ Bad |
|--------|--------|
| "Add password reset flow to auth modal" | "Auth improvements" |
| "Fix memory leak in WebSocket reconnect handler" | "Bug fixes" |
| "Extract reusable Button component from Header" | "Refactor UI" |

### 2. Scope — One Logical Change
A ticket should be completable in **<2 hours of focused work**.

**Split when:**
- Requires changes to >5 files
- Touches >2 unrelated features
- Has multiple distinct acceptance criteria sets

### 3. Files to Modify
Explicit list of files that need changes. This prevents Kimi from hunting.

```
Files to modify:
- src/components/AuthModal.tsx
- src/hooks/useAuth.ts
- src/lib/api/auth.ts
```

**For new files:** Explicitly say "Create new file: src/components/Button.tsx"

### 4. Implementation Approach
Not just *what* to do, but *how* to do it.

**Include:**
- Specific functions/methods to add or modify
- Data structures and types
- Error handling expectations
- State management approach
- API endpoints or external dependencies

### 5. Acceptance Criteria
Checkbox format. Defines "done."

```markdown
## Acceptance Criteria
- [ ] Feature works in browser (manual verification required)
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] PR created and ready for review
```

## Anti-Patterns

| Pattern | Why It Fails | Fix |
|---------|--------------|-----|
| "Improve X" | No measurable outcome | Define specific improvement and metric |
| Multiple unrelated changes | Scope creep, hard to review | Split into separate tickets |
| Missing file paths | Agent wastes tokens exploring | List expected files upfront |
| No acceptance criteria | Subjective "done" | Explicit checklist |
| Requires human judgment calls | Blocks agent, needs escalation | Provide decision criteria or default |
| "Research and implement X" | Two distinct phases | Separate research ticket first |
| References external docs without summary | Context switching cost | Paste relevant excerpt or summary |

## Ticket Templates

### Standard Feature
```markdown
## Summary
Add [feature] to [location] so [user benefit].

## Files to Modify
- src/components/X.tsx (add Y)
- src/lib/X.ts (create Z function)

## Implementation Details
1. Add state for [thing] using useState
2. Call [api] on mount, handle loading/error states
3. Render [ui] with [specific props]
4. Style with [approach — Tailwind classes, CSS module, etc.]

## Acceptance Criteria
- [ ] Works in browser at [route/location]
- [ ] Loading state shown while fetching
- [ ] Error state handled gracefully
- [ ] No TypeScript/lint errors
- [ ] PR created
```

### Bug Fix
```markdown
## Summary
[Thing] is broken: [observed behavior]. Should be: [expected behavior].

## Reproduction
1. Go to [route]
2. Click [thing]
3. Observe [bad behavior]

## Root Cause (if known)
[brief explanation or "investigate"]

## Files to Modify
- src/[file] — fix [specific function/line]

## Acceptance Criteria
- [ ] Bug no longer reproduces
- [ ] [Related functionality] still works
- [ ] PR created
```

### Refactor
```markdown
## Summary
Extract [component/logic] from [location] to improve [maintainability/testability/performance].

## Files to Modify
- src/[old-location].tsx — remove [thing]
- src/components/[NewThing].tsx — create with [props]
- src/components/[NewThing].test.tsx — add tests

## Implementation Details
- Preserve existing behavior exactly
- Props interface: [list them]
- Keep tests passing, add new ones if needed

## Acceptance Criteria
- [ ] All existing tests pass
- [ ] New component renders identically
- [ ] No lint/type errors
- [ ] PR created
```

## Examples

### ✅ Good Example: "Add loading spinner to submit button"

```markdown
## Summary
Show a loading spinner in the submit button while form is submitting to prevent double-submits.

## Files to Modify
- src/components/SubmitButton.tsx (modify)
- Optionally create src/components/Spinner.tsx if it doesn't exist

## Implementation Details
- Accept new prop: `isLoading?: boolean`
- When `isLoading` is true:
  - Show Spinner component inside button (left side)
  - Disable button
  - Keep button text visible
- Spinner: use existing one from `src/components/icons/Spinner.tsx` or create simple CSS spinner
- Button should not shrink when spinner appears (maintain width)

## Acceptance Criteria
- [ ] Spinner shows during form submission
- [ ] Button disabled while loading
- [ ] Works in browser at /login and /signup
- [ ] No visual layout shift
- [ ] PR created
```

**Why it's good:** Specific, bounded scope, clear file targets, visual behavior defined, testable criteria.

---

### ❌ Bad Example: "Improve the button component"

```markdown
## Summary
The button component needs some improvements. Make it better and more reusable.

## Acceptance Criteria
- [ ] Button is improved
```

**Why it's bad:** No specific changes defined, no files listed, subjective criteria, could mean anything from adding an icon to rewriting the entire design system.

---

### ✅ Good Example: "Fix race condition in chat message sending"

```markdown
## Summary
Rapidly sending messages can result in out-of-order delivery. Ensure messages are sent sequentially.

## Files to Modify
- src/hooks/useChat.ts (likely location of `sendMessage`)

## Implementation Details
- Current bug: `sendMessage` doesn't await previous send before accepting new input
- Solution: Add queue or lock mechanism
- Pseudocode:
  ```
  isSending = false
  messageQueue = []
  
  sendMessage(msg):
    if isSending:
      queue.push(msg)
      return
    isSending = true
    await api.send(msg)
    isSending = false
    if queue.length > 0:
      sendMessage(queue.shift())
  ```
- Preserve existing error handling (retry logic, etc.)

## Acceptance Criteria
- [ ] Rapid clicks on send button queue messages correctly
- [ ] Messages sent in order they were typed
- [ ] Error handling still works (failed sends retry, etc.)
- [ ] PR created
```

**Why it's good:** Identifies specific bug, gives implementation sketch, preserves existing behavior, testable with clear scenario.

---

### ❌ Bad Example: "Fix chat issues and improve UX"

```markdown
## Summary
Users reported some problems with chat. Fix the issues and make the experience smoother.

## Implementation Details
- Review chat code
- Fix any bugs found
- Polish the UX

## Files to Modify
- src/chat/* (probably)

## Acceptance Criteria
- [ ] Chat works better
```

**Why it's bad:** Multiple distinct tasks (bug fixes + UX improvements), vague file reference, no specific bugs listed, subjective success criteria.

---

### ✅ Good Example: "Extract TaskCard component from KanbanBoard"

```markdown
## Summary
KanbanBoard.tsx is 400+ lines. Extract the task card rendering into a reusable TaskCard component.

## Files to Modify
- src/components/KanbanBoard.tsx — remove inline task card JSX (lines ~120-180)
- src/components/TaskCard.tsx — create new component

## Implementation Details
TaskCard props interface:
```typescript
interface TaskCardProps {
  task: Task;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onClick?: (task: Task) => void;
}
```

- Move drag-and-drop handlers from inline to TaskCard
- Keep existing styling (copy Tailwind classes exactly)
- Keep existing click/keyboard handlers
- No behavior changes — pure extraction

## Acceptance Criteria
- [ ] KanbanBoard.tsx under 300 lines
- [ ] TaskCard renders identically to before
- [ ] Drag-and-drop still works
- [ ] Click to open detail still works
- [ ] No type/lint errors
- [ ] PR created
```

**Why it's good:** Clear motivation (file too large), specific line range, exact props defined, behavior explicitly preserved, measurable outcome (line count).

---

### ❌ Bad Example: "Clean up the Kanban code"

```markdown
## Summary
The Kanban board code is messy. Clean it up and refactor as needed.

## Acceptance Criteria
- [ ] Code is cleaner
```

**Why it's bad:** No specific issues identified, no files listed, no scope boundaries (could be 30 min or 3 days), subjective success criteria.

## PM Checklist

Before moving ticket to `ready`:

- [ ] Title is action-oriented and specific
- [ ] Scope fits in <2 hours
- [ ] All relevant files listed
- [ ] Implementation approach described (or "research first" ticket created)
- [ ] Acceptance criteria are checkbox format and objective
- [ ] No human judgment calls required (or criteria provided)

## Escalation Triggers

If Kimi encounters any of these, escalate to human:

- Requirements contradict existing code or other tickets
- Implementation approach unclear (multiple valid options)
- Acceptance criteria impossible with current architecture
- Security or performance implications not addressed
- Requires access to external systems/credentials not listed
