import { useState, useEffect, useCallback, type FormEvent, type CSSProperties } from 'react'
import { tasksApi, type Task, type Comment, type TaskStatus, type TaskPriority } from '../api/tasks'
import { agentsApi, type Agent } from '../api/agents'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'

const STATUS_META: Record<TaskStatus, { label: string; group: string; dot: string }> = {
  todo:             { label: 'To Do',            group: 'Backlog',   dot: 'var(--st-todo)'      },
  in_progress:      { label: 'In Progress',      group: 'Active',    dot: 'var(--st-progress)'  },
  blocked:          { label: 'Blocked',          group: 'Blocked',   dot: 'var(--st-blocked)'   },
  in_review:        { label: 'In Review',        group: 'Review',    dot: 'var(--st-review)'    },
  waiting_approval: { label: 'Waiting Approval', group: 'Review',    dot: 'var(--st-waiting)'   },
  approved:         { label: 'Approved',         group: 'Resolved',  dot: 'var(--st-approved)'  },
  rejected:         { label: 'Rejected',         group: 'Resolved',  dot: 'var(--st-rejected)'  },
  done:             { label: 'Done',             group: 'Resolved',  dot: 'var(--st-done)'      },
  cancelled:        { label: 'Cancelled',        group: 'Resolved',  dot: 'var(--st-cancelled)' },
}

const STATUS_ORDER: TaskStatus[] = ['todo','in_progress','blocked','in_review','waiting_approval','approved','rejected','done','cancelled']
const GROUP_ORDER = ['Backlog','Active','Blocked','Review','Resolved']
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

function taskNum(task: Task, taskById?: Map<string, Task>): string {
  if (task.parent_task_id && task.sub_number != null && taskById) {
    const parent = taskById.get(task.parent_task_id)
    if (parent?.number != null) return `#${parent.number}.${task.sub_number}`
  }
  return `#${task.number}`
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
        {task.subtasks.length > 0 && (
          <span className="mono" style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)',display:'flex',alignItems:'center',gap:3}}>
            <Icon name="board" size={10} />
            {task.subtasks.length}
          </span>
        )}
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
  const [description, setDescription] = useState('')
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
        description: description.trim() || undefined,
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
            <div className="field">
              <label className="label">Description <span style={{color:'var(--ink-3)',fontWeight:400}}>(optional)</span></label>
              <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="What needs to be done…" style={{resize:'vertical'}} />
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

  const resolveAuthor = (authorId: string | null, isSystem?: boolean): { name: string; isAgent: boolean } => {
    if (isSystem || authorId === 'system' || !authorId) return { name: 'System', isAgent: false }
    const agent = agents.find(a => a.id === authorId)
    if (agent) return { name: agent.name, isAgent: agent.type === 'ai' }
    return { name: 'You', isAgent: false }
  }
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [orchestrationOpen, setOrchestrationOpen] = useState(false)

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

  const createSubtask = async (e: FormEvent) => {
    e.preventDefault()
    if (!newSubtaskTitle.trim()) return
    setAddingSubtask(true)
    try {
      const sub = await tasksApi.createSubtask(task.id, { title: newSubtaskTitle.trim() })
      onUpdated({ ...task, subtasks: [...task.subtasks, sub] })
      setNewSubtaskTitle('')
    } finally { setAddingSubtask(false) }
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
            {task.blocked_by_agent_id && (
              <span className="badge" style={{background:'var(--accent-warn,#f59e0b)',color:'#fff',fontSize:'var(--fs-xs)',padding:'2px 7px'}}>
                ⏳ Waiting for @{task.blocked_by_agent_id}
              </span>
            )}
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

          {task.outcome && (
            <div className="drawer__section">
              <div className="eyebrow">Outcome</div>
              <div style={{
                padding: '10px 12px',
                background: 'color-mix(in srgb, var(--st-done) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--st-done) 30%, transparent)',
                borderRadius: '6px',
                fontSize: 'var(--fs-sm)',
                lineHeight: '1.5',
                color: 'var(--ink-1)',
                whiteSpace: 'pre-wrap',
              }}>{task.outcome}</div>
            </div>
          )}

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
              <div className="eyebrow">Subtasks</div>
              {task.subtasks.length > 0 && <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>{task.subtasks.length}</span>}
            </div>
            {task.subtasks.length > 0 && (
              <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
                {task.subtasks.map(sub => (
                  <div key={sub.id} style={{
                    display:'flex',alignItems:'center',gap:8,
                    padding:'6px 10px',
                    background:'var(--surface-2)',
                    borderRadius:4,
                    fontSize:'var(--fs-sm)',
                  }}>
                    <span className="badge badge--dot" style={{'--dot': STATUS_META[sub.status].dot, fontSize:'var(--fs-xs)'} as CSSProperties}>
                      {STATUS_META[sub.status].label}
                    </span>
                    <span style={{flex:1,fontFamily:'var(--font-mono)',fontSize:'var(--fs-xs)',color:'var(--ink-3)',minWidth:40}}>
                      #{task.number}.{sub.sub_number ?? sub.number}
                    </span>
                    <span style={{flex:1}}>{sub.title}</span>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={createSubtask}>
              <div className="compose">
                <input
                  className="compose__input"
                  style={{padding:'6px 10px',fontSize:'var(--fs-sm)'}}
                  placeholder="Add subtask…"
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                />
                <div className="compose__foot">
                  <button type="submit" className="btn btn--primary btn--sm" disabled={addingSubtask || !newSubtaskTitle.trim()}>
                    {addingSubtask ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {task.subtasks.length > 0 && (
            <div className="drawer__section">
              <button
                className="drawer__subhead"
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setOrchestrationOpen(o => !o)}
              >
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-4)', transition: 'transform 0.15s', display: 'inline-block', transform: orchestrationOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                <div className="eyebrow">Orchestration</div>
              </button>
              {orchestrationOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                  <div className="metafield">
                    <div className="label" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginBottom: 4 }}>
                      Orchestrator — triggered when all subtasks complete
                    </div>
                    <AgentPicker
                      value={task.orchestrator_id}
                      agents={agents}
                      onChange={id => update({ orchestrator_id: id ?? null })}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={task.human_review_required}
                      onChange={e => update({ human_review_required: e.target.checked })}
                    />
                    Requires human review (Inbox notification instead of auto-trigger)
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="drawer__section">
            <div className="drawer__subhead">
              <div className="eyebrow">Activity</div>
              {comments.length > 0 && <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>{comments.length}</span>}
            </div>
            <div className="comments">
              {comments.length === 0 && <p style={{color:'var(--ink-3)',fontSize:'var(--fs-sm)'}}>No comments yet.</p>}
              {comments.map(c => {
                const { name, isAgent } = resolveAuthor(c.author_id, c.is_system)
                return (
                  <div key={c.id} className="comment">
                    <div className={`avatar avatar--sm ${isAgent ? 'avatar--agent' : 'avatar--human'}`}>
                      {name.slice(0,1).toUpperCase()}
                    </div>
                    <div className="comment__body">
                      <header>
                        <span className="comment__author">{name}</span>
                        <span className="comment__time">{timeAgo(c.created_at)}</span>
                      </header>
                      <div className="comment__text">{c.content}</div>
                    </div>
                  </div>
                )
              })}
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

function TaskListView({ tasks, agents, agentMap, onOpen }: {
  tasks: Task[]; agents: Agent[]; agentMap: Map<string, Agent>; onOpen: (t: Task) => void
}) {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')

  const taskById = new Map(tasks.map(t => [t.id, t]))
  const rootTasks = tasks.filter(t => !t.parent_task_id)
  const subtasksByParent = new Map<string, Task[]>()
  tasks.filter(t => t.parent_task_id).forEach(t => {
    const arr = subtasksByParent.get(t.parent_task_id!) ?? []
    arr.push(t)
    subtasksByParent.set(t.parent_task_id!, arr)
  })

  const rows: Array<{ task: Task; isSubtask: boolean }> = []
  rootTasks.forEach(r => {
    rows.push({ task: r, isSubtask: false })
    ;(subtasksByParent.get(r.id) ?? []).sort((a, b) => (a.sub_number ?? 0) - (b.sub_number ?? 0))
      .forEach(s => rows.push({ task: s, isSubtask: true }))
  })

  const filtered = rows.filter(({ task }) => {
    if (filterStatus !== 'all' && task.status !== filterStatus) return false
    if (filterAssignee !== 'all' && task.assignee_id !== filterAssignee) return false
    return true
  })

  return (
    <div className="tasklist">
      <div className="tasklist__filters">
        <select className="select" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
          <option value="all">All statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
          <option value="all">All assignees</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', alignSelf: 'center', marginLeft: 4 }}>
          {filtered.length} tasks
        </span>
      </div>
      <div className="tasklist__head">
        <span>#</span><span>Title</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Updated</span>
      </div>
      <ul style={{ margin: 0, padding: 0 }}>
        {filtered.map(({ task, isSubtask }) => {
          const assignee = task.assignee_id ? agentMap.get(task.assignee_id) : null
          return (
            <li key={task.id} className={`tasklist__row${isSubtask ? ' tasklist__row--sub' : ''}`} onClick={() => onOpen(task)}>
              <span className="tasklist__num mono">{taskNum(task, taskById)}</span>
              <span className="tasklist__title-cell">
                {isSubtask && <span className="tasklist__subtag">subtask</span>}
                <span className="tasklist__title-text">{task.title}</span>
              </span>
              <span>
                <span className="badge badge--dot" style={{ '--dot': STATUS_META[task.status].dot } as CSSProperties}>
                  {STATUS_META[task.status].label}
                </span>
              </span>
              <span><PriorityPip level={task.priority} /></span>
              <span>{assignee ? <AgentChip agent={assignee} /> : <span style={{ color: 'var(--ink-4)' }}>—</span>}</span>
              <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>{timeAgo(task.updated_at)}</span>
            </li>
          )
        })}
        {filtered.length === 0 && <li className="tasklist__empty">No tasks match filters.</li>}
      </ul>
    </div>
  )
}

export default function BoardPage() {
  const { user } = useAuth()
  const [tasks, setTasks]     = useState<Task[]>([])
  const [agents, setAgents]   = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [creating, setCreating]         = useState<TaskStatus | null>(null)
  const [collapsed, setCollapsed]       = useState<Record<string, boolean>>({ Resolved: true })
  const [dragOver, setDragOver]         = useState<TaskStatus | null>(null)
  const [view, setView]                 = useState<'board' | 'list'>('board')

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

  const rootTasks = tasks.filter(t => !t.parent_task_id)
  const openTaskCount = rootTasks.filter(t => !['done','cancelled','approved','rejected'].includes(t.status)).length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', minHeight:0 }}>
      <header className="topbar">
        <div className="topbar__title">Board</div>
        <span className="topbar__crumb mono">{(user as any)?.org_slug || 'workspace'}.graphait / board</span>
        <div className="topbar__right">
          <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}} className="mono">{openTaskCount} open</span>
          <div className="viewtoggle">
            <button className={`viewtoggle__btn${view === 'board' ? ' viewtoggle__btn--active' : ''}`} onClick={() => setView('board')}><Icon name="board" size={12}/>Board</button>
            <button className={`viewtoggle__btn${view === 'list' ? ' viewtoggle__btn--active' : ''}`} onClick={() => setView('list')}><Icon name="list" size={12}/>List</button>
          </div>
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
      ) : view === 'board' ? (
        <div className="board">
          {GROUP_ORDER.map(group => (
            <GroupRail
              key={group}
              group={group}
              tasks={rootTasks}
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
      ) : (
        <TaskListView
          tasks={tasks}
          agents={agents}
          agentMap={agentMap}
          onOpen={t => setSelectedTask(prev => prev?.id === t.id ? null : t)}
        />
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
