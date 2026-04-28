import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { tasksApi, type Task, type Comment, type TaskStatus, type TaskPriority } from '../api/tasks'
import { agentsApi, type Agent } from '../api/agents'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'

const STATUS_META: Record<TaskStatus, { label: string; group: string; dot: string }> = {
  todo:             { label: 'To Do',            group: 'Backlog',   dot: 'var(--st-todo)'      },
  in_progress:      { label: 'In Progress',      group: 'Active',    dot: 'var(--st-progress)'  },
  in_review:        { label: 'In Review',        group: 'Review',    dot: 'var(--st-review)'    },
  waiting_approval: { label: 'Waiting Approval', group: 'Review',    dot: 'var(--st-waiting)'   },
  approved:         { label: 'Approved',         group: 'Resolved',  dot: 'var(--st-approved)'  },
  rejected:         { label: 'Rejected',         group: 'Resolved',  dot: 'var(--st-rejected)'  },
  done:             { label: 'Done',             group: 'Resolved',  dot: 'var(--st-done)'      },
  cancelled:        { label: 'Cancelled',        group: 'Resolved',  dot: 'var(--st-cancelled)' },
}

const STATUS_ORDER: TaskStatus[] = ['todo','in_progress','in_review','waiting_approval','approved','rejected','done','cancelled']
const GROUP_ORDER = ['Backlog','Active','Review','Resolved']
const GROUP_STATUSES: Record<string, TaskStatus[]> = GROUP_ORDER.reduce((a, g) => {
  a[g] = STATUS_ORDER.filter(s => STATUS_META[s].group === g)
  return a
}, {} as Record<string, TaskStatus[]>)

const PRIORITIES: TaskPriority[] = ['low','medium','high','urgent']

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

function PriorityPip({ level }: { level: TaskPriority }) {
  return (
    <span className="prio" data-level={level} title={`Priority: ${level}`}>
      <span className="prio__bars"><i/><i/><i/></span>
    </span>
  )
}

function AgentChip({ agent }: { agent: Agent }) {
  return (
    <span className="agent-chip">
      <span className={`avatar avatar--${agent.type} avatar--xs`}>
        {agent.name.slice(0,1).toUpperCase()}
      </span>
      <span className="agent-chip__name">{agent.name}</span>
    </span>
  )
}

function AgentPicker({ value, agents, onChange, placeholder = '— Unassigned' }: {
  value: string | null; agents: Agent[]; onChange: (id: string | null) => void; placeholder?: string
}) {
  return (
    <select
      className="select"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {agents.map(a => (
        <option key={a.id} value={a.id}>
          {a.name} · {a.role_title} ({a.type === 'ai' ? 'AI' : 'Human'})
        </option>
      ))}
    </select>
  )
}

function TaskCard({ task, agentMap, onOpen }: {
  task: Task; agentMap: Map<string, Agent>; onOpen: (t: Task) => void
}) {
  const assignee = task.assignee_id ? agentMap.get(task.assignee_id) : null
  return (
    <article className="taskcard" onClick={() => onOpen(task)}>
      <header className="taskcard__head">
        <span className="taskcard__num mono">#{task.number}</span>
        <PriorityPip level={task.priority} />
      </header>
      <h3 className="taskcard__title">{task.title}</h3>
      <footer className="taskcard__foot">
        {assignee
          ? <AgentChip agent={assignee} />
          : <span className="taskcard__unassigned">Unassigned</span>
        }
        <span className="taskcard__spacer" />
        <span className="taskcard__time mono">{timeAgo(task.updated_at)}</span>
      </footer>
    </article>
  )
}

function Column({ status, tasks, agentMap, onOpen, onCreate, dragOver, onDragOver, onDragLeave, onDrop }: {
  status: TaskStatus; tasks: Task[]; agentMap: Map<string, Agent>
  onOpen: (t: Task) => void; onCreate: (s: TaskStatus) => void
  dragOver: boolean; onDragOver: () => void; onDragLeave: () => void; onDrop: () => void
}) {
  const meta = STATUS_META[status]
  return (
    <div className={`col${dragOver ? ' col--over' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
    >
      <header className="col__head">
        <div className="col__head-l">
          <span className="badge badge--dot col__badge" style={{ '--dot': meta.dot } as React.CSSProperties}>
            {meta.label}
          </span>
          <span className="col__count mono">{tasks.length}</span>
        </div>
        <button className="btn btn--ghost btn--icon btn--sm" title={`New in ${meta.label}`} onClick={() => onCreate(status)}>
          <Icon name="plus" size={12} />
        </button>
      </header>
      <div className="col__body">
        {tasks.map(t => (
          <div key={t.id} draggable onDragStart={e => {
            e.dataTransfer.setData('text/plain', t.id);
            (window as any).__dragTaskId = t.id
          }}>
            <TaskCard task={t} agentMap={agentMap} onOpen={onOpen} />
          </div>
        ))}
        {tasks.length === 0 && <div className="col__empty mono">—</div>}
      </div>
    </div>
  )
}

function GroupRail({ group, tasks, agentMap, collapsed, onToggle, onOpen, onCreate, dragOver, onDragOver, onDragLeave, onMove }: {
  group: string; tasks: Task[]; agentMap: Map<string, Agent>; collapsed: boolean; onToggle: () => void
  onOpen: (t: Task) => void; onCreate: (s: TaskStatus) => void
  dragOver: string | null; onDragOver: (s: TaskStatus) => void; onDragLeave: () => void
  onMove: (taskId: string, status: TaskStatus) => void
}) {
  const statuses = GROUP_STATUSES[group]
  const total = statuses.reduce((a, s) => a + tasks.filter(t => t.status === s).length, 0)
  const subnames = statuses.map(s => STATUS_META[s].label).join(' · ')

  return (
    <section className={`rail rail--${group.toLowerCase()}${collapsed ? ' rail--collapsed' : ''}`}>
      <header className="rail__head" onClick={onToggle}>
        <div className="rail__head-l">
          <Icon name={collapsed ? 'chevRight' : 'chevDown'} size={12} />
          <span className="rail__name">{group}</span>
          <span className="rail__count mono">{total}</span>
          <span className="rail__subnames">{subnames}</span>
        </div>
      </header>
      {!collapsed && (
        <div className="rail__cols">
          {statuses.map(s => (
            <Column
              key={s}
              status={s}
              tasks={tasks.filter(t => t.status === s)}
              agentMap={agentMap}
              onOpen={onOpen}
              onCreate={onCreate}
              dragOver={dragOver === s}
              onDragOver={() => onDragOver(s)}
              onDragLeave={onDragLeave}
              onDrop={() => {
                const id = (window as any).__dragTaskId
                if (id) onMove(id, s)
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CreateTaskModal({ agents, onClose, onCreated, defaultStatus }: {
  agents: Agent[]; onClose: () => void; onCreated: (t: Task) => void; defaultStatus?: TaskStatus
}) {
  const [title, setTitle]           = useState('')
  const [priority, setPriority]     = useState<TaskPriority>('medium')
  const [status, setStatus]         = useState<TaskStatus>(defaultStatus || 'todo')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      const task = await tasksApi.create({
        title: title.trim(),
        priority,
        assignee_id: assigneeId ?? undefined,
      })
      if (status !== 'todo') {
        const updated = await tasksApi.update(task.id, { status })
        onCreated(updated)
      } else {
        onCreated(task)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel">
        <div className="modal__head">
          <div className="eyebrow">New task</div>
          <h2>Create a task</h2>
          <button className="btn btn--ghost btn--icon btn--sm modal__close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal__body">
            <div className="field">
              <label className="label">Title</label>
              <input autoFocus className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…" required />
            </div>
            <div className="modal__grid">
              <div className="field">
                <label className="label">Priority</label>
                <select className="select" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Status</label>
                <select className="select" value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="label">Assign to</label>
              <AgentPicker value={assigneeId} agents={agents} onChange={setAssigneeId} />
            </div>
            {error && <div className="auth__error"><Icon name="alert" size={13}/><span>{error}</span></div>}
          </div>
          <div className="modal__foot">
            <div />
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function TaskDrawer({ task, agents, onClose, onUpdated }: {
  task: Task; agents: Agent[]; onClose: () => void; onUpdated: (t: Task) => void
}) {
  const [comments, setComments]     = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sending, setSending]       = useState(false)
  const [title, setTitle]           = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    tasksApi.listComments(task.id).then(setComments).catch(() => {})
  }, [task.id])

  const update = async (patch: Parameters<typeof tasksApi.update>[1]) => {
    const updated = await tasksApi.update(task.id, patch)
    onUpdated(updated)
  }

  const saveTitle = async () => {
    if (title.trim() && title !== task.title) await update({ title: title.trim() })
  }
  const saveDesc = async () => {
    if (description !== (task.description ?? '')) await update({ description })
  }

  const sendComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setSending(true)
    try {
      const c = await tasksApi.addComment(task.id, commentText.trim())
      setComments(prev => [...prev, c])
      setCommentText('')
    } finally { setSending(false) }
  }

  return (
    <>
      <div className="drawer__scrim" onClick={onClose} />
      <div className="drawer">
        <div className="drawer__head">
          <div className="drawer__crumbs">
            <span className="mono">#{task.number}</span>
            <span style={{color:'var(--ink-4)'}}>·</span>
            <span className="badge badge--dot" style={{'--dot': STATUS_META[task.status].dot} as React.CSSProperties}>
              {STATUS_META[task.status].label}
            </span>
          </div>
          <div className="drawer__actions">
            <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose} title="Close">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <div className="drawer__scroll">
          <div className="drawer__titlewrap">
            <textarea
              className="drawer__title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={saveTitle}
              rows={2}
            />
          </div>

          <div className="drawer__metarow">
            <div className="metafield">
              <div className="label">Status</div>
              <select className="select" value={task.status} onChange={e => update({ status: e.target.value as TaskStatus })}>
                {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div className="metafield">
              <div className="label">Priority</div>
              <select className="select" value={task.priority} onChange={e => update({ priority: e.target.value as TaskPriority })}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div className="metafield">
              <div className="label">Assignee</div>
              <AgentPicker
                value={task.assignee_id}
                agents={agents}
                onChange={id => update({ assignee_id: id ?? undefined })}
              />
            </div>
          </div>

          <div className="drawer__section">
            <div className="eyebrow">Description</div>
            <textarea
              className="drawer__desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={saveDesc}
              placeholder="Add a description…"
              rows={4}
            />
          </div>

          <div className="drawer__section">
            <div className="drawer__subhead">
              <div className="eyebrow">Activity</div>
              {comments.length > 0 && <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>{comments.length}</span>}
            </div>
            <div className="comments">
              {comments.length === 0 && <p style={{color:'var(--ink-3)',fontSize:'var(--fs-sm)'}}>No comments yet.</p>}
              {comments.map(c => (
                <div key={c.id} className="comment">
                  <div className="avatar avatar--human avatar--sm">{c.author_id.slice(0,1).toUpperCase()}</div>
                  <div className="comment__body">
                    <header>
                      <span className="comment__author">{c.author_id.slice(0,8)}</span>
                      <span className="comment__time">{timeAgo(c.created_at)}</span>
                    </header>
                    <div className="comment__text">{c.content}</div>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={sendComment}>
              <div className="compose">
                <textarea
                  className="compose__input"
                  placeholder="Write a comment…"
                  rows={2}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                <div className="compose__foot">
                  <button type="submit" className="btn btn--primary btn--sm" disabled={sending || !commentText.trim()}>
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

export default function BoardPage() {
  const { user } = useAuth()
  const [tasks, setTasks]     = useState<Task[]>([])
  const [agents, setAgents]   = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [creating, setCreating]         = useState<TaskStatus | null>(null)
  const [collapsed, setCollapsed]       = useState<Record<string, boolean>>({})
  const [dragOver, setDragOver]         = useState<TaskStatus | null>(null)

  const agentMap = new Map(agents.map(a => [a.id, a]))

  const loadTasks = useCallback(() => {
    tasksApi.list().then(setTasks).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadTasks()
    agentsApi.list().then(setAgents).catch(() => {})
  }, [loadTasks])

  const handleUpdated = (updated: Task) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    setSelectedTask(updated)
  }

  const handleCreated = (task: Task) => {
    setTasks(prev => [...prev, task])
    setCreating(null)
    setSelectedTask(task)
  }

  const moveTask = async (taskId: string, status: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === status) return
    const updated = await tasksApi.update(taskId, { status }).catch(() => null)
    if (updated) setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    setDragOver(null)
  }

  const toggleGroup = (g: string) => setCollapsed(c => ({ ...c, [g]: !c[g] }))

  const openTaskCount = tasks.filter(t => !['done','cancelled','approved','rejected'].includes(t.status)).length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', minHeight:0 }}>
      <header className="topbar">
        <div className="topbar__title">Board</div>
        <span className="topbar__crumb mono">{(user as any)?.org_slug || 'workspace'}.graphait / board</span>
        <div className="topbar__right">
          <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}} className="mono">{openTaskCount} open</span>
          <button className="btn btn--sm" onClick={() => { setSelectedTask(null); loadTasks() }} title="Refresh">
            <Icon name="spark" size={12}/>Refresh
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setCreating('todo')}>
            <Icon name="plus" size={12}/>New task
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink-3)' }}>Loading…</div>
      ) : (
        <div className="board">
          {GROUP_ORDER.map(group => (
            <GroupRail
              key={group}
              group={group}
              tasks={tasks}
              agentMap={agentMap}
              collapsed={!!collapsed[group]}
              onToggle={() => toggleGroup(group)}
              onOpen={t => setSelectedTask(prev => prev?.id === t.id ? null : t)}
              onCreate={setCreating}
              dragOver={dragOver}
              onDragOver={setDragOver}
              onDragLeave={() => setDragOver(null)}
              onMove={moveTask}
            />
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskDrawer
          key={selectedTask.id}
          task={selectedTask}
          agents={agents}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleUpdated}
        />
      )}

      {creating !== null && (
        <CreateTaskModal
          agents={agents}
          defaultStatus={creating}
          onClose={() => setCreating(null)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
