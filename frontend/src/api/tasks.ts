import { apiFetch } from './client'

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'waiting_approval' | 'approved' | 'rejected' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  org_id: string
  number: number
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  creator_id: string
  parent_task_id: string | null
  created_at: string
  updated_at: string
  outcome: string | null
  subtasks: Task[]
}

export interface Comment {
  id: string
  task_id: string
  author_id: string
  content: string
  created_at: string
}

export const tasksApi = {
  list: () => apiFetch<Task[]>('/tasks'),
  create: (body: { title: string; description?: string; priority?: TaskPriority; assignee_id?: string }) =>
    apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority; assignee_id?: string }) =>
    apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),
  listComments: (id: string) => apiFetch<Comment[]>(`/tasks/${id}/comments`),
  addComment: (id: string, content: string) =>
    apiFetch<Comment>(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
  approve: (id: string) => apiFetch<Task>(`/tasks/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => apiFetch<Task>(`/tasks/${id}/reject`, { method: 'POST' }),
  createSubtask: (parentId: string, body: { title: string; description?: string; priority?: TaskPriority; assignee_id?: string }) =>
    apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify({ ...body, parent_task_id: parentId }) }),
}
