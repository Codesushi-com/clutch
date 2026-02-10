import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateTaskModal } from '@/components/board/create-task-modal'
import { TaskCard } from '@/components/board/task-card'
import { TaskModal } from '@/components/board/task-modal'
import type { Task } from '@/lib/types'
import { DragDropContext, Droppable } from '@hello-pangea/dnd'
import React from 'react'

// Mock the task store
vi.mock('@/lib/stores/task-store', () => ({
  useTaskStore: (selector: ((store: { createTask: unknown; updateTask: unknown; deleteTask: unknown }) => unknown) | undefined) => {
    const store = {
      createTask: vi.fn().mockResolvedValue(undefined),
      updateTask: vi.fn().mockResolvedValue(undefined),
      deleteTask: vi.fn().mockResolvedValue(undefined),
    }
    return selector ? selector(store) : store
  },
  useCreateTask: () => vi.fn().mockResolvedValue(undefined),
  useUpdateTask: () => vi.fn().mockResolvedValue(undefined),
  useDeleteTask: () => vi.fn().mockResolvedValue(undefined),
  useMoveTask: () => vi.fn().mockResolvedValue(undefined),
}))

// Mock the dependencies hook
vi.mock('@/lib/hooks/use-dependencies', () => ({
  useDependencies: () => ({
    dependencies: { depends_on: [], blocks: [] },
    refresh: vi.fn(),
  }),
}))

// Mock the session status hook
vi.mock('@/lib/hooks/use-session-status', () => ({
  useSingleSessionStatus: () => ({
    sessionStatus: null,
  }),
  getSessionStatusIndicator: () => ({ emoji: '', color: '', title: '' }),
}))

describe('Role Selector Feature', () => {
  describe('CreateTaskModal', () => {
    const mockOnOpenChange = vi.fn()

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('renders role selector with all options', () => {
      render(
        <CreateTaskModal
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId="test-project"
        />
      )

      const roleSelect = screen.getByLabelText(/role/i)
      expect(roleSelect).toBeInTheDocument()

      // Check all role options are present
      expect(screen.getByText('Auto')).toBeInTheDocument()
      expect(screen.getByText('PM')).toBeInTheDocument()
      expect(screen.getByText('Dev')).toBeInTheDocument()
      expect(screen.getByText('Research')).toBeInTheDocument()
      expect(screen.getByText('Reviewer')).toBeInTheDocument()
    })

    it('defaults to "Auto" role', () => {
      render(
        <CreateTaskModal
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId="test-project"
        />
      )

      const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement
      expect(roleSelect.value).toBe('')
    })

    it('allows selecting different roles', () => {
      render(
        <CreateTaskModal
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId="test-project"
        />
      )

      const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement

      // Change to Dev
      fireEvent.change(roleSelect, { target: { value: 'dev' } })
      expect(roleSelect.value).toBe('dev')

      // Change to Research
      fireEvent.change(roleSelect, { target: { value: 'research' } })
      expect(roleSelect.value).toBe('research')

      // Change to PM
      fireEvent.change(roleSelect, { target: { value: 'pm' } })
      expect(roleSelect.value).toBe('pm')
    })
  })

  describe('TaskCard', () => {
    const createMockTask = (role: string | null): Task => ({
      id: 'test-task-id',
      project_id: 'test-project',
      title: 'Test Task',
      description: null,
      status: 'backlog',
      priority: 'medium',
      role: role as Task['role'],
      assignee: null,
      requires_human_review: 0,
      tags: null,
      session_id: null,
      prompt_version_id: null,
      dispatch_status: null,
      dispatch_requested_at: null,
      dispatch_requested_by: null,
      agent_session_key: null,
      agent_spawned_at: null,
      agent_retry_count: null,
      triage_sent_at: null,
      triage_acked_at: null,
      auto_triage_count: null,
      escalated: null,
      escalated_at: null,
      cost_total: null,
      branch: null,
      pr_number: null,
      review_comments: null,
      review_count: null,
      resolution: null,
      position: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      completed_at: null,
    })

    const renderWithDnd = (task: Task) => {
      return render(
        <DragDropContext onDragEnd={() => {}}>
          <Droppable droppableId="test">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                <TaskCard
                  task={task}
                  index={0}
                  onClick={() => {}}
                  projectId="test-project"
                  columnTasks={[task]}
                />
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )
    }

    it('displays role badge for dev role', () => {
      const task = createMockTask('dev')
      renderWithDnd(task)

      expect(screen.getByText('Dev')).toBeInTheDocument()
    })

    it('does not display role badge for reviewer role (not a card badge)', () => {
      const task = createMockTask('reviewer')
      renderWithDnd(task)

      expect(screen.queryByText('Reviewer')).not.toBeInTheDocument()
    })

    it('displays role badge for pm role', () => {
      const task = createMockTask('pm')
      renderWithDnd(task)

      expect(screen.getByText('PM')).toBeInTheDocument()
    })

    it('displays role badge for research role', () => {
      const task = createMockTask('research')
      renderWithDnd(task)

      expect(screen.getByText('Research')).toBeInTheDocument()
    })

    it('does not display role badge for any/null role', () => {
      const task = createMockTask(null)
      renderWithDnd(task)

      expect(screen.queryByText('PM')).not.toBeInTheDocument()
      expect(screen.queryByText('Dev')).not.toBeInTheDocument()
      expect(screen.queryByText('Research')).not.toBeInTheDocument()
      expect(screen.queryByText('Reviewer')).not.toBeInTheDocument()
    })

    it('does not display role badge when role is null', () => {
      const task = createMockTask(null)
      renderWithDnd(task)

      // Should not show any role-specific text
      expect(screen.queryByText('Dev')).not.toBeInTheDocument()
      expect(screen.queryByText('PM')).not.toBeInTheDocument()
      expect(screen.queryByText('Research')).not.toBeInTheDocument()
    })
  })

  describe.skip('TaskModal', () => {
    const mockTask: Task = {
      id: 'test-task-id',
      project_id: 'test-project',
      title: 'Test Task',
      description: 'Test description',
      status: 'backlog',
      priority: 'medium',
      role: 'dev',
      assignee: null,
      requires_human_review: 0,
      tags: null,
      session_id: null,
      prompt_version_id: null,
      dispatch_status: null,
      dispatch_requested_at: null,
      dispatch_requested_by: null,
      agent_session_key: null,
      agent_spawned_at: null,
      agent_retry_count: null,
      triage_sent_at: null,
      triage_acked_at: null,
      auto_triage_count: null,
      escalated: null,
      escalated_at: null,
      cost_total: null,
      branch: null,
      pr_number: null,
      review_comments: null,
      review_count: null,
      resolution: null,
      position: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      completed_at: null,
    }

    beforeEach(() => {
      vi.clearAllMocks()
      // Mock fetch for comments
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ comments: [] }),
      })
    })

    it('renders role selector in edit mode', () => {
      render(
        <TaskModal
          task={mockTask}
          open={true}
          onOpenChange={() => {}}
        />
      )

      const roleLabels = screen.getAllByText(/role/i)
      expect(roleLabels.length).toBeGreaterThan(0)
    })

    it('pre-selects the current task role', async () => {
      const { container } = render(
        <TaskModal
          task={mockTask}
          open={true}
          onOpenChange={() => {}}
        />
      )

      // Find the role select dropdown by looking for the one with 'dev' option selected
      const selects = container.querySelectorAll('select')
      const roleSelect = Array.from(selects).find(select => {
        const selectedOption = select.querySelector('option:checked')
        return selectedOption?.getAttribute('value') === 'dev'
      })

      expect(roleSelect).toBeTruthy()
    })

    it('allows changing the role', () => {
      render(
        <TaskModal
          task={mockTask}
          open={true}
          onOpenChange={() => {}}
        />
      )

      // Get all selects and find the role one
      const selects = document.querySelectorAll('select')
      const roleSelect = Array.from(selects).find(select => {
        const options = select.querySelectorAll('option')
        return Array.from(options).some(opt => opt.value === 'qa')
      })

      expect(roleSelect).toBeTruthy()

      if (roleSelect) {
        fireEvent.change(roleSelect, { target: { value: 'qa' } })
        expect(roleSelect.value).toBe('qa')
      }
    })

    it('includes all role options', () => {
      render(
        <TaskModal
          task={mockTask}
          open={true}
          onOpenChange={() => {}}
        />
      )

      // Find the role select by looking for options
      const options = document.querySelectorAll('option')
      const optionValues = Array.from(options).map(opt => opt.value)

      expect(optionValues).toContain('any')
      expect(optionValues).toContain('pm')
      expect(optionValues).toContain('dev')
      expect(optionValues).toContain('qa')
      expect(optionValues).toContain('research')
      expect(optionValues).toContain('security')
    })
  })
})