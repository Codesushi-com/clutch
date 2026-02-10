"use client"

import { Suspense, useEffect, useState, use } from "react"
import { useSearchParams } from "next/navigation"
import { Board } from "@/components/board/board"
import { CreateTaskModal } from "@/components/board/create-task-modal"
import { TaskModal } from "@/components/board/task-modal"
import type { Task, TaskStatus, Project } from "@/lib/types"

type PageProps = {
  params: Promise<{ slug: string }>
}

/**
 * Inner component that uses useSearchParams.
 * Must be wrapped in Suspense — Next.js App Router requires it
 * to avoid the entire page de-opting to client-side rendering
 * and causing double-render on hydration.
 */
function BoardPageInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const taskIdFromUrl = searchParams.get("task")
  
  const [project, setProject] = useState<Project | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createModalStatus, setCreateModalStatus] = useState<TaskStatus>("backlog")
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  useEffect(() => {
    async function fetchProject() {
      const response = await fetch(`/api/projects/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setProject(data.project)
      }
    }
    fetchProject()
  }, [slug])

  // Handle task ID from URL query parameter
  useEffect(() => {
    async function openTaskFromUrl() {
      if (!taskIdFromUrl || !project) return
      
      try {
        const response = await fetch(`/api/tasks/${taskIdFromUrl}`)
        if (response.ok) {
          const data = await response.json()
          setSelectedTask(data.task)
          setTaskModalOpen(true)
        }
      } catch (error) {
        console.error("Failed to fetch task from URL:", error)
      }
    }
    openTaskFromUrl()
  }, [taskIdFromUrl, project])

  const handleAddTask = (status: TaskStatus) => {
    setCreateModalStatus(status)
    setCreateModalOpen(true)
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setTaskModalOpen(true)
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Board
        projectId={project.id}
        projectSlug={slug}
        githubRepo={project.github_repo}
        onTaskClick={handleTaskClick}
        onAddTask={handleAddTask}
      />
      
      <CreateTaskModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        projectId={project.id}
        initialStatus={createModalStatus}
      />
      
      <TaskModal
        task={selectedTask}
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        githubRepo={project.github_repo}
      />
    </div>
  )
}

export default function BoardPage({ params }: PageProps) {
  const { slug } = use(params)

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-secondary)]">Loading board...</div>
      </div>
    }>
      <BoardPageInner slug={slug} />
    </Suspense>
  )
}
