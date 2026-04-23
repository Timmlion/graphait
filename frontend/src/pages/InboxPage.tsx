import { useState, useEffect } from 'react'
import { tasksApi, type Task, type TaskStatus, type TaskPriority } from '../api/tasks'
import { agentsApi, type Agent } from '../api/agents'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo:             'To Do',
  in_progress:      'In Progress',
  in_review:        'In Review',
  waiting_approval: 'Waiting Approval',
  approved:         'Approved',
  rejected:         'Rejected',
  done:             'Done',
  cancelled:        'Cancelled',
}
const STATUS_DOT: Record<TaskStatus, string> = {
  todo:             'var(--st-todo)',
  in_progress:      'var(--st-progress)',
  in_review:        'var(--st-review)',
  waiting_approval: 'var(--st-waiting)',
  approved:         'var(--st-approved)',
  rejected:         'var(--st-rejected)',
  done:             'var(--st-done)',
  cancelled:        'var(--st-cancelled)',
}
const PRIO_ORDER: Record<TaskPriority, number> = { urgent:0, high:1, medium:2, low:3 }

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

const ACTIVE_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'waiting_approval']

export default function InboxPage() {
  const { user } = useAuth()
  const [tasks, setTasks]       = useState<Task[]>([])
  const [agents, setAgents]     = useState<Agent[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<string>('__all__')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')

  useEffect(() => {
    Promise.all([tasksApi.list(), agentsApi.list()])
      .then(([t, a]) => { setTasks(t); setAgents(a) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const humanAgents = agents.filter(a => a.type === 'human')
  const agentMap    = new Map(agents.map(a => [a.id, a]))

  const visibleTasks = tasks
    .filter(t => {
      if (!t.assignee_id) return false
      const assignee = agentMap.get(t.assignee_id)
      if (!assignee || assignee.type !== 'human') return false
      if (selected !== '__all__' && t.assignee_id !== selected) return false
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(t.status)) return false
      return true
    })
    .sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority])

  return (
    <div className="inbox">
      <header className="topbar">
        <div className="topbar__title">Inbox</div>
        <span className="topbar__crumb mono">{(user as any)?.org_slug || 'workspace'}.graphait / inbox</span>
        <div className="topbar__right">
          <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}} className="mono">
            {visibleTasks.length} task{visibleTasks.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      <div className="inbox__layout">
        <aside className="inbox__sidebar">
          <div className="inbox__section-label eyebrow">Agents</div>
          <nav className="inbox__nav">
            <button
              className={`inbox__agent-btn${selected === '__all__' ? ' inbox__agent-btn--active' : ''}`}
              onClick={() => setSelected('__all__')}
            >
              <Icon name="human" size={13}/>
              <span>All humans</span>
              <span className="mono inbox__badge">{tasks.filter(t => {
                const a = t.assignee_id ? agentMap.get(t.assignee_id) : null
                return a?.type === 'human'
              }).length}</span>
            </button>
            {humanAgents.map(a => {
              const count = tasks.filter(t => t.assignee_id === a.id).length
              return (
                <button
                  key={a.id}
                  className={`inbox__agent-btn${selected === a.id ? ' inbox__agent-btn--active' : ''}`}
                  onClick={() => setSelected(a.id)}
                >
                  <span className="avatar avatar--human avatar--xs">{a.name.slice(0,1).toUpperCase()}</span>
                  <span className="inbox__agent-name">{a.name}</span>
                  <span className="mono inbox__badge">{count}</span>
                </button>
              )
            })}
          </nav>

          <div className="inbox__section-label eyebrow" style={{marginTop:20}}>Filter</div>
          <div className="inbox__filters">
            <button
              className={`inbox__filter-btn${statusFilter === 'active' ? ' inbox__filter-btn--active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >Active only</button>
            <button
              className={`inbox__filter-btn${statusFilter === 'all' ? ' inbox__filter-btn--active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >All statuses</button>
          </div>
        </aside>

        <main className="inbox__main">
          {loading ? (
            <div className="inbox__empty">Loading…</div>
          ) : visibleTasks.length === 0 ? (
            <div className="inbox__empty">
              <Icon name="check" size={24} />
              <span>No tasks</span>
            </div>
          ) : (
            <div className="inbox__list">
              {visibleTasks.map(t => {
                const assignee = t.assignee_id ? agentMap.get(t.assignee_id) : null
                return (
                  <article key={t.id} className="inbox__item">
                    <div className="inbox__item-left">
                      <span className="inbox__num mono">#{t.number}</span>
                      <span
                        className="inbox__dot"
                        style={{ background: STATUS_DOT[t.status] }}
                        title={STATUS_LABEL[t.status]}
                      />
                    </div>
                    <div className="inbox__item-body">
                      <div className="inbox__item-title">{t.title}</div>
                      <div className="inbox__item-meta">
                        <span className="badge badge--dot" style={{'--dot': STATUS_DOT[t.status]} as React.CSSProperties}>
                          {STATUS_LABEL[t.status]}
                        </span>
                        <span className="inbox__prio" data-level={t.priority}>{t.priority}</span>
                        {assignee && (
                          <span className="agent-chip">
                            <span className="avatar avatar--human avatar--xs">{assignee.name.slice(0,1).toUpperCase()}</span>
                            <span className="agent-chip__name">{assignee.name}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="inbox__item-right">
                      <span className="mono" style={{fontSize:'var(--fs-xs)',color:'var(--ink-4)'}}>{timeAgo(t.updated_at)}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
