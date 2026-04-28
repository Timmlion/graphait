import { useState, useEffect, useRef } from 'react'
import { runsApi, type AgentRun, type RunEvent } from '../api/runs'

function initials(s: string): string {
  return s.split(/[-_\s]+/).map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('')
}

function elapsed(run: AgentRun): string {
  const secs = run.duration_seconds != null
    ? Math.round(run.duration_seconds)
    : Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

const ROLE_META: Record<string, { label: string; color: string }> = {
  user:        { label: 'Task',   color: 'rgba(99,102,241,0.10)' },
  assistant:   { label: 'Agent',  color: 'rgba(59,130,246,0.10)' },
  tool_call:   { label: 'Tool',   color: 'rgba(245,158,11,0.10)' },
  tool_result: { label: 'Result', color: 'rgba(16,185,129,0.10)' },
}

const STATUS_COLOR: Record<string, string> = {
  running: 'var(--accent)',
  done: '#10b981',
  blocked: '#f59e0b',
  error: '#ef4444',
  limit_reached: '#6b7280',
}

export default function ActivityPage() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selected, setSelected] = useState<AgentRun | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [loading, setLoading] = useState(true)
  const selectedRef = useRef<AgentRun | null>(null)
  selectedRef.current = selected

  const loadRuns = () =>
    runsApi.list().then(data => {
      setRuns(data)
      setLoading(false)
      if (selectedRef.current) {
        const updated = data.find(r => r.id === selectedRef.current!.id)
        if (updated) setSelected(updated)
      }
    }).catch(() => setLoading(false))

  const loadEvents = (runId: string) =>
    runsApi.events(runId).then(setEvents).catch(() => {})

  useEffect(() => { loadRuns() }, [])

  // Poll runs list while any run is active
  useEffect(() => {
    if (!runs.some(r => r.finished_at == null)) return
    const id = setInterval(loadRuns, 3000)
    return () => clearInterval(id)
  }, [runs])

  // Poll events while selected run is active
  useEffect(() => {
    if (!selected) return
    loadEvents(selected.id)
    if (selected.finished_at != null) return
    const id = setInterval(() => loadEvents(selected.id), 3000)
    return () => clearInterval(id)
  }, [selected?.id, selected?.finished_at])

  const selectRun = (run: AgentRun) => {
    setSelected(run)
    setEvents([])
    loadEvents(run.id)
  }

  if (loading) return (
    <div className="settings"><div style={{ color: 'var(--ink-3)' }}>Loading…</div></div>
  )

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Run list */}
      <div style={{ width: 300, borderRight: '1px solid var(--line-1)',
                    overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '16px 16px 10px' }}>
          <span className="eyebrow">Activity</span>
        </div>
        {runs.length === 0 && (
          <p style={{ padding: '8px 16px', color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>
            No runs yet. Assign a task to an AI agent to see activity here.
          </p>
        )}
        {runs.map(run => {
          const isActive = run.finished_at == null
          const isSelected = selected?.id === run.id
          return (
            <div key={run.id}
              className={`alist__row${isSelected ? ' alist__row--active' : ''}`}
              style={{ padding: '10px 16px', cursor: 'pointer' }}
              onClick={() => selectRun(run)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div className="avatar avatar--ai avatar--sm" style={{ flexShrink: 0 }}>
                  {initials(run.agent_id)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500,
                                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {run.agent_id}
                    </span>
                    {isActive && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%',
                                     background: '#10b981', flexShrink: 0,
                                     boxShadow: '0 0 0 2px rgba(16,185,129,0.3)' }} />
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)',
                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                 marginTop: 1 }}>
                    {run.task_number != null ? `#${run.task_number} ` : ''}{run.task_title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                                   letterSpacing: '0.04em',
                                   color: STATUS_COLOR[run.status] || 'var(--ink-3)' }}>
                      {run.status.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
                      {elapsed(run)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Event log */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-1)',
                          flexShrink: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{selected.agent_id}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginTop: 2 }}>
                {selected.task_number != null ? `#${selected.task_number} ` : ''}
                {selected.task_title}
                {' · '}
                {new Date(selected.started_at).toLocaleString()}
                {selected.finished_at
                  ? ` · ${elapsed(selected)}`
                  : ' · running…'}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16,
                          display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map(ev => {
                const meta = ROLE_META[ev.role] || { label: ev.role, color: 'rgba(0,0,0,0.04)' }
                return (
                  <div key={ev.id} style={{ background: meta.color, borderRadius: 6,
                                             padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                     letterSpacing: '0.06em', color: 'var(--ink-2)' }}>
                        {meta.label}
                      </span>
                      {ev.tool_name && (
                        <span className="mono"
                          style={{ fontSize: 11, background: 'rgba(0,0,0,0.08)',
                                   padding: '1px 6px', borderRadius: 3 }}>
                          {ev.tool_name}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11,
                                     color: 'var(--ink-3)' }}>
                        {new Date(ev.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre style={{ margin: 0, fontFamily: 'var(--font-mono)',
                                  fontSize: 'var(--fs-xs)', whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word', color: 'var(--ink-1)',
                                  maxHeight: 300, overflow: 'auto' }}>
                      {ev.content}
                    </pre>
                  </div>
                )
              })}
              {events.length === 0 && (
                <div style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>
                  No events yet…
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flex: 1, color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>
            Select a run to see its execution log
          </div>
        )}
      </div>
    </div>
  )
}
