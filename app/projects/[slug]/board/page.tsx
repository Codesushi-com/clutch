"use client"

import { useEffect, useState, use } from "react"
import { Board } from "@/components/board/board"
import { CreateTaskModal } from "@/components/board/create-task-modal"
import type { Task, TaskStatus, Project } from "@/lib/db/types"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function BoardPage({ params }: PageProps) {
  const { slug } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createModalStatus, setCreateModalStatus] = useState<TaskStatus>("backlog")
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

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

  const handleAddTask = (status: TaskStatus) => {
    setCreateModalStatus(status)
    setCreateModalOpen(true)
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    // TODO: Open task modal (implemented in #51)
    console.log("Task clicked:", task.title)
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Board 
        projectId={project.id}
        onTaskClick={handleTaskClick}
        onAddTask={handleAddTask}
      />
      
      <CreateTaskModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        projectId={project.id}
        initialStatus={createModalStatus}
      />
    </>
  )
}
