"use client"

import { useState, useEffect, useCallback } from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { Plus, ChevronLeft, ChevronRight, Settings2 } from "lucide-react"
import type { Task, TaskStatus } from "@/lib/types"
import { Column } from "./column"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"

interface MobileBoardProps {
  columns: { status: TaskStatus; title: string; color: string; showAdd: boolean }[]
  getTasksByStatus: (status: TaskStatus) => Task[]
  onTaskClick: (task: Task) => void
  onAddTask: (status: TaskStatus) => void
  onDragEnd: (result: DropResult) => void
  columnVisibility: Record<TaskStatus, boolean>
  onToggleColumn: (status: TaskStatus, visible: boolean) => void
  projectId: string
  githubRepo?: string | null
  totalCounts?: Record<TaskStatus, number>
  hasMore?: Record<TaskStatus, boolean>
  onLoadMore?: (status: TaskStatus) => void
}

export function MobileBoard({
  columns,
  getTasksByStatus,
  onTaskClick,
  onAddTask,
  onDragEnd,
  columnVisibility,
  onToggleColumn,
  projectId,
  githubRepo,
  totalCounts,
  hasMore,
  onLoadMore,
}: MobileBoardProps) {
  const [activeColumnIndex, setActiveColumnIndex] = useState(0)
  const activeColumn = columns[activeColumnIndex]

  // Navigate to previous column
  const goToPrevious = useCallback(() => {
    setActiveColumnIndex((prev) => (prev === 0 ? columns.length - 1 : prev - 1))
  }, [columns.length])

  // Navigate to next column
  const goToNext = useCallback(() => {
    setActiveColumnIndex((prev) => (prev === columns.length - 1 ? 0 : prev + 1))
  }, [columns.length])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        goToPrevious()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        goToNext()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [goToPrevious, goToNext])

  // Handle touch gestures for swiping between columns
  useEffect(() => {
    let startX = 0
    let startY = 0
    let isScrolling = false

    const handleTouchStart = (e: Event) => {
      const touchEvent = e as TouchEvent
      startX = touchEvent.touches[0].clientX
      startY = touchEvent.touches[0].clientY
      isScrolling = false
    }

    const handleTouchMove = (e: Event) => {
      const touchEvent = e as TouchEvent
      if (!startX || !startY) return

      const currentX = touchEvent.touches[0].clientX
      const currentY = touchEvent.touches[0].clientY
      const diffX = startX - currentX
      const diffY = startY - currentY

      // Determine if the user is scrolling vertically
      if (Math.abs(diffY) > Math.abs(diffX)) {
        isScrolling = true
        return
      }

      // Prevent horizontal scroll if we're handling the gesture
      if (Math.abs(diffX) > 10 && !isScrolling) {
        e.preventDefault()
      }
    }

    const handleTouchEnd = (e: Event) => {
      const touchEvent = e as TouchEvent
      if (!startX || !startY || isScrolling) {
        startX = 0
        startY = 0
        return
      }

      const endX = touchEvent.changedTouches[0].clientX
      const diffX = startX - endX

      // Minimum swipe distance
      if (Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swiped left - go to next column
          goToNext()
        } else {
          // Swiped right - go to previous column
          goToPrevious()
        }
      }

      startX = 0
      startY = 0
    }

    const boardElement = document.querySelector('[data-mobile-board]')
    if (boardElement) {
      boardElement.addEventListener("touchstart", handleTouchStart, { passive: true })
      boardElement.addEventListener("touchmove", handleTouchMove, { passive: false })
      boardElement.addEventListener("touchend", handleTouchEnd, { passive: true })

      return () => {
        boardElement.removeEventListener("touchstart", handleTouchStart)
        boardElement.removeEventListener("touchmove", handleTouchMove)
        boardElement.removeEventListener("touchend", handleTouchEnd)
      }
    }
  }, [activeColumnIndex, goToNext, goToPrevious])

  return (
    <div className="space-y-4" data-mobile-board>
      {/* Board Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Board
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Column Visibility Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1 px-2 bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] h-9"
              >
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 bg-[var(--bg-secondary)] border-[var(--border)] p-3" align="end">
              <div className="space-y-3">
                <div className="text-sm font-medium text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
                  Show Columns
                </div>
                <div className="space-y-2">
                  {(["backlog", "ready", "in_progress", "in_review", "blocked", "done"] as TaskStatus[]).map((status) => {
                    const colTitles: Record<TaskStatus, string> = {
                      backlog: "Backlog",
                      ready: "Ready",
                      in_progress: "In Progress",
                      in_review: "In Review",
                      blocked: "Blocked",
                      done: "Done",
                    }
                    const colColors: Record<TaskStatus, string> = {
                      backlog: "#52525b",
                      ready: "#3b82f6",
                      in_progress: "#eab308",
                      in_review: "#a855f7",
                      blocked: "#ef4444",
                      done: "#22c55e",
                    }
                    return (
                      <label
                        key={status}
                        className="flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-tertiary)] rounded px-1 py-1 transition-colors"
                      >
                        <Checkbox
                          checked={columnVisibility[status]}
                          onCheckedChange={(checked) => 
                            onToggleColumn(status, checked === true)
                          }
                          id={`mobile-col-${status}`}
                        />
                        <div className="flex items-center gap-2 flex-1">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: colColors[status] }}
                          />
                          <span className="text-sm text-[var(--text-primary)]">
                            {colTitles[status]}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Button
            onClick={() => onAddTask("backlog")}
            size="sm"
            className="flex items-center gap-2 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/90 text-white h-9"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Ticket</span>
          </Button>
        </div>
      </div>

      {/* Column Navigation */}
      <div className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] p-1">
        <button
          onClick={goToPrevious}
          className="p-2 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Previous column"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>

        <div className="flex-1 flex overflow-x-auto gap-1 scrollbar-hide">
          {columns.map((column, index) => (
            <button
              key={column.status}
              onClick={() => setActiveColumnIndex(index)}
              className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                index === activeColumnIndex
                  ? "bg-[var(--accent-blue)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              }`}
            >
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: column.color }}
              />
              <span>{column.title}</span>
              <span className="text-xs opacity-75">
                {totalCounts?.[column.status] ?? getTasksByStatus(column.status).length}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={goToNext}
          className="p-2 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Next column"
        >
          <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Current Column Display */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="min-h-[60vh]">
          <Column
            key={activeColumn.status}
            status={activeColumn.status}
            title={activeColumn.title}
            color={activeColumn.color}
            tasks={getTasksByStatus(activeColumn.status)}
            onTaskClick={onTaskClick}
            onAddTask={() => onAddTask(activeColumn.status)}
            showAddButton={activeColumn.showAdd}
            isMobile={true}
            projectId={projectId}
            githubRepo={githubRepo}
            totalCount={totalCounts?.[activeColumn.status]}
            hasMore={hasMore?.[activeColumn.status]}
            onLoadMore={onLoadMore ? () => onLoadMore(activeColumn.status) : undefined}
          />
        </div>
      </DragDropContext>

      {/* Swipe Instructions */}
      <div className="text-center text-xs text-[var(--text-muted)] py-2">
        Swipe left/right or use arrows to navigate columns
      </div>
    </div>
  )
}