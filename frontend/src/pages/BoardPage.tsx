import { useState, useEffect, useCallback, type FormEvent } from 'react'
import Layout from '../components/Layout'
import { tasksApi, type Task, type Comment, type TaskStatus, type TaskPriority } from '../api/tasks'

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>
}

const COLUMNS: { key: TaskStatus; label: string; dot: string }[] = [
  { key: 'todo', label: 'TODO', dot: 'bg-outline' },
  { key: 'in_progress', label: 'IN PROGRESS', dot: 'bg-primary' },
  { key: 'waiting_approval', label: 'WAITING APPROVAL', dot: 'bg-tertiary-container' },
  { key: 'done', label: 'DONE', dot: 'bg-outline' },
]

const PRIORITY_DOT: Record<TaskPriority, string> = {
  critical: 'bg-error',
  high: 'bg-error',
  medium: 'bg-tertiary-container',
  low: 'bg-outline',
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function TaskCard({ task, selected, onClick }: { task: Task; selected: boolean; onClick: () => void }) {
  const isDone = task.status === 'done'
  return (
    <div
      onClick={onClick}
      className={`bg-surface-container-lowest border rounded p-3 cursor-pointer relative overflow-hidden transition-colors
        ${selected
          ? 'border-primary shadow-[0_0_0_1px_rgba(53,37,205,0.1)]'
          : 'border-surface-variant hover:border-outline-variant'
        }
        ${isDone ? 'opacity-60' : ''}
      `}
    >
      {selected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
      <div className={`flex items-start justify-between mb-2 ${selected ? 'pl-1' : ''}`}>
        <span className={`font-label-mono text-label-mono text-on-surface-variant ${isDone ? 'line-through' : ''}`}>
          #{task.number}
        </span>
        <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority]}`} title={task.priority} />
      </div>
      <h3 className={`font-body-main text-body-main font-semibold text-on-surface mb-3 leading-tight ${selected ? 'pl-1' : ''} ${isDone ? 'line-through text-on-surface-variant font-medium' : ''}`}>
        {task.title}
      </h3>
    </div>
  )
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Task) => void }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      const task = await tasksApi.create({ title: title.trim(), priority })
      onCreated(task)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-[420px] bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-lg flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <span className="font-label-mono text-label-mono text-on-surface-variant uppercase">New Task</span>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-label-mono text-label-mono text-on-surface-variant uppercase">Title</label>
            <input
              autoFocus
              className="w-full h-[32px] px-sm border border-outline-variant rounded outline-none focus:border-primary bg-transparent font-body-main text-body-main text-on-background"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title…"
              required
            />
          </div>
          <div className="flex flex-col gap-xs">
            <label className="font-label-mono text-label-mono text-on-surface-variant uppercase">Priority</label>
            <select
              className="h-[32px] px-sm border border-outline-variant rounded outline-none focus:border-primary bg-transparent font-body-main text-body-main text-on-background"
              value={priority}
              onChange={e => setPriority(e.target.value as TaskPriority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
          <div className="flex justify-end gap-sm">
            <button type="button" onClick={onClose} className="h-7 px-3 border border-outline-variant rounded font-body-sm text-body-sm text-on-surface hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="h-7 px-3 bg-primary text-on-primary rounded font-body-sm text-body-sm hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TaskDetailPanel({ task, onClose, onUpdated }: { task: Task; onClose: () => void; onUpdated: (t: Task) => void }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    tasksApi.listComments(task.id).then(setComments).catch(() => {})
  }, [task.id, task.title, task.description])

  const updateStatus = async (status: TaskStatus) => {
    const updated = await tasksApi.update(task.id, { status })
    onUpdated(updated)
  }

  const updatePriority = async (priority: TaskPriority) => {
    const updated = await tasksApi.update(task.id, { priority })
    onUpdated(updated)
  }

  const saveTitle = async () => {
    if (title.trim() && title !== task.title) {
      const updated = await tasksApi.update(task.id, { title: title.trim() })
      onUpdated(updated)
    }
  }

  const saveDescription = async () => {
    if (description !== (task.description ?? '')) {
      const updated = await tasksApi.update(task.id, { description })
      onUpdated(updated)
    }
  }

  const sendComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setSendingComment(true)
    try {
      const c = await tasksApi.addComment(task.id, commentText.trim())
      setComments(prev => [...prev, c])
      setCommentText('')
    } finally {
      setSendingComment(false)
    }
  }

  const statusLabel: Record<TaskStatus, string> = {
    todo: 'Todo',
    in_progress: 'In Progress',
    waiting_approval: 'Waiting Approval',
    done: 'Done',
  }

  return (
    <aside className="fixed top-12 right-0 w-[320px] h-[calc(100vh-48px)] bg-surface-container-lowest border-l border-surface-variant flex flex-col z-10">
      {/* Header */}
      <div className="h-14 border-b border-surface-variant flex items-center justify-between px-md shrink-0">
        <span className="font-label-mono text-label-mono text-on-surface-variant">TASK #{task.number}</span>
        <div className="flex gap-2 text-on-surface-variant">
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container transition-colors">
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-md flex flex-col gap-lg">
        {/* Title */}
        <div>
          <textarea
            className="w-full bg-transparent border-none p-0 resize-none font-h1 text-h1 font-semibold text-on-surface focus:ring-0 mb-4 min-h-[48px]"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            rows={2}
          />
          <div className="grid grid-cols-[100px_1fr] gap-y-3 items-center text-body-sm font-body-sm">
            <div className="text-on-surface-variant">Status</div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${task.status === 'in_progress' ? 'bg-primary' : task.status === 'done' ? 'bg-outline' : task.status === 'waiting_approval' ? 'bg-tertiary-container' : 'bg-outline'}`} />
              <select
                className="bg-transparent border-none p-0 text-on-surface focus:ring-0 cursor-pointer text-body-sm font-body-sm h-6"
                value={task.status}
                onChange={e => updateStatus(e.target.value as TaskStatus)}
              >
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting_approval">Waiting Approval</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div className="text-on-surface-variant">Priority</div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              <select
                className="bg-transparent border-none p-0 text-on-surface focus:ring-0 cursor-pointer text-body-sm font-body-sm h-6"
                value={task.priority}
                onChange={e => updatePriority(e.target.value as TaskPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        </div>

        <div className="w-full h-px bg-surface-variant" />

        {/* Description */}
        <div>
          <h4 className="font-body-sm text-body-sm font-medium text-on-surface mb-2">Description</h4>
          <textarea
            className="w-full bg-transparent border border-transparent hover:border-outline-variant focus:border-primary rounded p-2 resize-none font-body-main text-body-main text-on-surface-variant focus:ring-0 transition-colors min-h-[60px]"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={saveDescription}
            placeholder="Add a description…"
            rows={3}
          />
        </div>

        <div className="w-full h-px bg-surface-variant" />

        {/* Comments */}
        <div className="flex-1 flex flex-col">
          <h4 className="font-body-sm text-body-sm font-medium text-on-surface mb-4">
            Activity {comments.length > 0 && <span className="text-on-surface-variant">({comments.length})</span>}
          </h4>
          <div className="space-y-4 mb-4">
            {comments.length === 0 && (
              <p className="font-body-sm text-body-sm text-outline">No comments yet.</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label-mono text-label-mono shrink-0">
                  {c.author_id.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-body-sm text-body-sm font-medium text-on-surface">{c.author_id.slice(0, 8)}</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant text-[11px]">{relativeTime(c.created_at)}</span>
                  </div>
                  <div className="bg-surface rounded p-2 font-body-main text-body-main text-on-surface-variant border border-surface-variant">
                    {c.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comment input */}
      <div className="p-md border-t border-surface-variant bg-surface-container-lowest shrink-0">
        <form onSubmit={sendComment} className="flex flex-col gap-2">
          <div className="border border-surface-variant rounded focus-within:border-primary bg-surface transition-colors">
            <textarea
              className="w-full bg-transparent border-none p-2 font-body-main text-body-main text-on-surface placeholder-on-surface-variant focus:ring-0 resize-none"
              placeholder="Write a comment…"
              rows={2}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
            />
            <div className="flex justify-end p-1">
              <button
                type="submit"
                disabled={sendingComment || !commentText.trim()}
                className="h-6 px-3 bg-primary text-on-primary rounded font-body-sm text-body-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  )
}

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadTasks = useCallback(() => {
    tasksApi.list().then(setTasks).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  const handleUpdated = (updated: Task) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    setSelectedTask(updated)
  }

  const handleCreated = (task: Task) => {
    setTasks(prev => [...prev, task])
    setShowNewTask(false)
    setSelectedTask(task)
  }

  const grouped = (status: TaskStatus) => tasks.filter(t => t.status === status)

  return (
    <Layout>
      <div className={`flex-1 flex flex-col h-full overflow-hidden ${selectedTask ? 'mr-[320px]' : ''}`}>
        {/* Board header */}
        <div className="h-14 border-b border-surface-variant flex items-center justify-between px-lg bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-md">
            <h1 className="font-h1 text-h1 text-on-surface">Tasks</h1>
            <span className="px-2 py-0.5 bg-surface-container rounded-sm font-label-mono text-label-mono text-on-surface-variant">
              {tasks.length} total
            </span>
          </div>
          <button
            onClick={() => setShowNewTask(true)}
            className="h-7 px-3 bg-primary text-on-primary rounded font-body-sm text-body-sm font-medium hover:opacity-90 transition-opacity"
          >
            New Task
          </button>
        </div>

        {/* Kanban */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-lg flex gap-lg">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-sm text-body-sm">Loading…</div>
          ) : (
            COLUMNS.map(col => (
              <div key={col.key} className={`w-[280px] shrink-0 flex flex-col h-full ${col.key === 'done' && grouped(col.key).length === 0 ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-sm shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="font-label-mono text-label-mono text-on-surface-variant">{col.label}</span>
                    <span className="font-body-sm text-body-sm text-outline px-1">{grouped(col.key).length}</span>
                  </div>
                  {col.key !== 'done' && (
                    <button onClick={() => setShowNewTask(true)} className="text-on-surface-variant hover:text-on-surface">
                      <Icon name="add" />
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pb-lg">
                  {grouped(col.key).map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      selected={selectedTask?.id === task.id}
                      onClick={() => setSelectedTask(prev => prev?.id === task.id ? null : task)}
                    />
                  ))}
                  {grouped(col.key).length === 0 && (
                    <div className="border border-dashed border-outline-variant rounded p-3 text-center font-body-sm text-body-sm text-outline">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleUpdated}
        />
      )}

      {showNewTask && (
        <NewTaskModal onClose={() => setShowNewTask(false)} onCreated={handleCreated} />
      )}
    </Layout>
  )
}
