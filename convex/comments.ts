// Comment query helpers
import { db } from "@/lib/db"
import type { Comment, AuthorType, CommentType } from "@/lib/db/types"

/**
 * Get all comments for a task, ordered by creation time (oldest first)
 */
export function getByTask(taskId: string): Comment[] {
  const comments = db.prepare(`
    SELECT * FROM comments 
    WHERE task_id = ? 
    ORDER BY created_at ASC
  `).all(taskId) as Comment[]
  
  return comments
}

/**
 * Get a single comment by ID
 */
export function getById(commentId: string): Comment | undefined {
  return db.prepare("SELECT * FROM comments WHERE id = ?").get(commentId) as Comment | undefined
}

/**
 * Create a new comment on a task
 */
export function create(
  taskId: string,
  content: string,
  options: {
    author?: string
    authorType?: AuthorType
    type?: CommentType
  } = {}
): Comment {
  const {
    author = "system",
    authorType = "agent",
    type = "message",
  } = options
  
  const now = Date.now()
  const id = crypto.randomUUID()
  
  const comment: Comment = {
    id,
    task_id: taskId,
    author,
    author_type: authorType,
    content,
    type,
    responded_at: null,
    created_at: now,
  }
  
  db.prepare(`
    INSERT INTO comments (id, task_id, author, author_type, content, type, responded_at, created_at)
    VALUES (@id, @task_id, @author, @author_type, @content, @type, @responded_at, @created_at)
  `).run(comment)
  
  return comment
}

/**
 * Mark a comment as responded (for request_input type comments)
 */
export function markResponded(commentId: string): Comment | undefined {
  const now = Date.now()
  
  db.prepare(`
    UPDATE comments 
    SET responded_at = ?
    WHERE id = ?
  `).run(now, commentId)
  
  return getById(commentId)
}

/**
 * Delete a comment
 */
export function deleteComment(commentId: string): boolean {
  const result = db.prepare("DELETE FROM comments WHERE id = ?").run(commentId)
  return result.changes > 0
}

/**
 * Get comments by type for a task
 */
export function getByTaskAndType(taskId: string, type: CommentType): Comment[] {
  const comments = db.prepare(`
    SELECT * FROM comments 
    WHERE task_id = ? AND type = ?
    ORDER BY created_at ASC
  `).all(taskId, type) as Comment[]
  
  return comments
}

/**
 * Get unresponded input requests for a task
 */
export function getPendingInputRequests(taskId: string): Comment[] {
  const comments = db.prepare(`
    SELECT * FROM comments 
    WHERE task_id = ? 
      AND type = 'request_input'
      AND responded_at IS NULL
    ORDER BY created_at ASC
  `).all(taskId) as Comment[]
  
  return comments
}
