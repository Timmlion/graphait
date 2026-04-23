import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { agentsApi, schedulesApi, type Agent, type Schedule } from '../api/agents'
import { graphApi, type AgentRelationship } from '../api/graph'
import { loadSettings, OPENROUTER_MODELS } from '../api/settings'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'

/* ─── Layout helpers ─── */
function computeLayout(agents: Agent[], relationships: AgentRelationship[]) {
  const parent: Record<string, string> = {}
  relationships.forEach(r => {
    if (r.type === 'reports_to' && !parent[r.from_agent_id]) parent[r.from_agent_id] = r.to_agent_id
  })

  const level: Record<string, number> = {}
  const resolve = (id: string, visiting = new Set<string>()): number => {
    if (level[id] != null) return level[id]
    if (visiting.has(id)) return 0
    visiting.add(id)
    const p = parent[id]
    if (!p) return (level[id] = 0)
    return (level[id] = resolve(p, visiting) + 1)
  }
  agents.forEach(a => resolve(a.id))

  const byLevel: Record<number, Agent[]> = {}
  agents.forEach(a => {
    const lv = level[a.id] || 0;
    (byLevel[lv] = byLevel[lv] || []).push(a)
  })
  Object.values(byLevel).forEach(arr => arr.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'human' ? -1 : 1))

  const colWidth = 200, rowHeight = 140, padX = 40, padY = 40
  const levels = Object.keys(byLevel).map(Number).sort((a,b) => a - b)
  const maxCount = Math.max(1, ...levels.map(l => byLevel[l].length))
  const width = padX * 2 + maxCount * colWidth
  const height = padY * 2 + levels.length * rowHeight + 40

  const nodes: Record<string, { x: number; y: number }> = {}
  levels.forEach(lv => {
    const row = byLevel[lv]
    const totalW = row.length * colWidth
    const startX = (width - totalW) / 2 + colWidth / 2
    row.forEach((a, i) => { nodes[a.id] = { x: startX + i * colWidth, y: padY + lv * rowHeight + 30 } })
  })

  const edges = relationships.map(r => ({ id: r.id, from: r.from_agent_id, to: r.to_agent_id, type: r.type }))
  return { nodes, edges, width, height }
}

function clipToRect(center: { x: number; y: number }, toward: { x: number; y: number }, w: number, h: number, pad = 2) {
  const dx = toward.x - center.x, dy = toward.y - center.y
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y }
  const hw = w / 2 + pad, hh = h / 2 + pad
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx)
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: center.x + dx * s, y: center.y + dy * s }
}

function orthogonalPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dy = b.y - a.y
  if (Math.abs(dy) < 10) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  const midY = a.y + dy * 0.5
  return `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`
}

function formatInterval(s: number) {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`
  return `${(s / 86400).toFixed(1)}d`
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/* ─── Agent Graph ─── */
function AgentGraph({ agents, relationships, selectedId, onSelect, onDeleteRelation }: {
  agents: Agent[]; relationships: AgentRelationship[]; selectedId: string | null
  onSelect: (id: string) => void; onDeleteRelation: (id: string) => void
}) {
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const layout = computeLayout(agents, relationships)
  const { nodes, edges, width, height } = layout

  return (
    <div className="graph">
      <div className="graph__toolbar">
        <div className="eyebrow">Organization graph · {agents.length} agents · {relationships.length} edges</div>
        <div className="graph__legend">
          <span><span style={{display:'inline-block',width:16,height:2,background:'var(--accent-line)'}}/>reports_to</span>
          <span><span style={{display:'inline-block',width:16,height:0,borderTop:'2px dashed var(--line-3)'}}/>collaborates_with</span>
        </div>
      </div>
      <div className="graph__scroll">
        <svg className="graph__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <pattern id="agents-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="var(--line-1)" strokeWidth="1"/>
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"/>
            </marker>
          </defs>
          <rect width={width} height={height} fill="url(#agents-grid)"/>

          {edges.map(e => {
            const aC = nodes[e.from], bC = nodes[e.to]
            if (!aC || !bC) return null
            const isSel = selectedId && (e.from === selectedId || e.to === selectedId)
            const a = clipToRect(aC, bC, 152, 52)
            const b = clipToRect(bC, aC, 152, 52)
            const path = orthogonalPath(a, b)
            const kind = e.type === 'reports_to' ? 'reports' : 'collab'
            return (
              <g key={e.id} className={`gedge gedge--${kind}${isSel ? ' gedge--active' : ''}${hoverEdge === e.id ? ' gedge--hover' : ''}`}>
                <path d={path} className="gedge__hit" onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)}/>
                <path d={path} className="gedge__line" markerEnd={kind === 'reports' ? 'url(#arrow)' : undefined} style={{ pointerEvents: 'none' }}/>
              </g>
            )
          })}

          {hoverEdge && (() => {
            const e = edges.find(x => x.id === hoverEdge)
            if (!e) return null
            const aC = nodes[e.from], bC = nodes[e.to]
            if (!aC || !bC) return null
            const mx = (aC.x + bC.x) / 2, my = (aC.y + bC.y) / 2
            return (
              <g key={`menu-${e.id}`} transform={`translate(${mx - 52}, ${my - 12})`}
                onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)}>
                <rect width="104" height="22" rx="3" fill="var(--bg-1)" stroke="var(--line-2)"/>
                <text x="8" y="14" className="gedge__menu-lbl">{e.type.replace('_', ' ')}</text>
                <g style={{ cursor: 'pointer' }} onClick={ev => { ev.stopPropagation(); onDeleteRelation(e.id) }}>
                  <rect x="84" y="4" width="16" height="14" rx="2" fill="transparent"/>
                  <path d="M88 8 l8 6 M96 8 l-8 6" stroke="var(--ink-3)" strokeWidth="1.2"/>
                </g>
              </g>
            )
          })()}

          {agents.map(a => {
            const n = nodes[a.id]
            if (!n) return null
            const isSel = a.id === selectedId
            const w = 152, h = 52
            return (
              <g key={a.id}
                className={`gnode${a.type === 'ai' ? ' gnode--ai' : ' gnode--human'}${isSel ? ' gnode--selected' : ''}${!a.is_active ? ' gnode--inactive' : ''}`}
                transform={`translate(${n.x - w/2}, ${n.y - h/2})`}
                onClick={() => onSelect(a.id)}
              >
                <ellipse className="gnode__glow" cx={w/2} cy={h/2} rx={w/2+4} ry={h/2+4}/>
                <rect width={w} height={h} rx={a.type === 'ai' ? 0 : 26} className="gnode__bg"/>
                <rect width={w} height={h} rx={a.type === 'ai' ? 0 : 26} className="gnode__border"/>
                <g transform={`translate(12, ${h/2})`}>
                  {a.type === 'ai' ? (
                    <rect x="-10" y="-10" width="20" height="20" className="gnode__avatar--ai" fill="transparent" stroke="var(--accent)" strokeWidth="1.2"/>
                  ) : (
                    <circle r="10" fill="var(--human)" stroke="none"/>
                  )}
                  <text x="0" y="3" className="gnode__initials" fill={a.type === 'ai' ? 'var(--accent)' : '#0a0a0b'}>
                    {initials(a.name)}
                  </text>
                </g>
                <text x="32" y="22" className="gnode__name">{a.name}</text>
                <text x="32" y="36" className="gnode__role">{a.role_title}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

/* ─── List view ─── */
function AgentListView({ agents, relationships, selectedId, onSelect }: {
  agents: Agent[]; relationships: AgentRelationship[]; selectedId: string | null; onSelect: (id: string) => void
}) {
  return (
    <div className="alist">
      <div className="alist__head">
        <span className="label">Agent</span>
        <span className="label">Role</span>
        <span className="label">Type</span>
        <span className="label">Reports to</span>
        <span className="label">Schedule</span>
        <span className="label">Status</span>
      </div>
      <ul className="alist__body">
        {agents.map(a => {
          const reportsTo = relationships.find(r => r.from_agent_id === a.id && r.type === 'reports_to')
          const parent = reportsTo ? agents.find(x => x.id === reportsTo.to_agent_id) : null
          return (
            <li key={a.id} className={`alist__row${selectedId === a.id ? ' alist__row--active' : ''}`} onClick={() => onSelect(a.id)}>
              <span className="alist__cell">
                <div className={`avatar${a.type === 'ai' ? ' avatar--ai' : ' avatar--human'} avatar--sm`}>{initials(a.name)}</div>
                <span>{a.name}</span>
              </span>
              <span className="alist__cell alist__cell--dim">{a.role_title}</span>
              <span className="alist__cell"><span className={`tag-type tag-type--${a.type}`}>{a.type}</span></span>
              <span className="alist__cell alist__cell--dim">{parent?.name || '—'}</span>
              <span className="alist__cell mono">{a.schedule ? `${a.schedule.interval_seconds}s` : '—'}</span>
              <span className="alist__cell">
                <span className="badge badge--dot" style={{'--dot': a.is_active ? 'var(--ok)' : 'var(--ink-4)'} as React.CSSProperties}>
                  {a.is_active ? 'active' : 'paused'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ─── Config panel ─── */
const DEFAULT_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

function ConnectorConfig({ agent, onUpdate }: { agent: Agent; onUpdate: (patch: Partial<Agent>) => void }) {
  const globalSettings = loadSettings()
  const cfg = (agent.connector_config || {}) as Record<string, string>

  const [apiKey, setApiKey]     = useState(cfg.api_key ?? globalSettings.openrouter_api_key ?? '')
  const [model, setModel]       = useState(cfg.model ?? globalSettings.default_model ?? 'anthropic/claude-sonnet-4-5')
  const [apiUrl, setApiUrl]     = useState(cfg.api_url ?? DEFAULT_API_URL)
  const [showKey, setShowKey]   = useState(false)
  const [customModel, setCustomModel] = useState('')

  const isCustomModel = !OPENROUTER_MODELS.some(m => m.id === model && m.id !== '__custom__')

  useEffect(() => {
    const c = (agent.connector_config || {}) as Record<string, string>
    setApiKey(c.api_key ?? globalSettings.openrouter_api_key ?? '')
    setModel(c.model ?? globalSettings.default_model ?? 'anthropic/claude-sonnet-4-5')
    setApiUrl(c.api_url ?? DEFAULT_API_URL)
  }, [agent.id])

  const save = () => {
    const finalModel = model === '__custom__' ? customModel.trim() : model
    onUpdate({
      connector_config: {
        api_key: apiKey,
        model: finalModel || 'anthropic/claude-sonnet-4-5',
        api_url: apiUrl || DEFAULT_API_URL,
      },
    })
  }

  return (
    <div className="connector-cfg">
      <div className="field">
        <label className="label">Model</label>
        <select className="select" value={isCustomModel ? '__custom__' : model}
          onChange={e => setModel(e.target.value)}>
          {OPENROUTER_MODELS.map(m => (
            <option key={m.id} value={m.id}>
              {m.provider ? `${m.provider} — ${m.label}` : m.label}
            </option>
          ))}
        </select>
      </div>
      {(model === '__custom__' || isCustomModel) && (
        <div className="field">
          <label className="label">Custom model ID</label>
          <input className="input mono" value={customModel || (isCustomModel ? model : '')}
            onChange={e => setCustomModel(e.target.value)} placeholder="provider/model-name" spellCheck={false} />
        </div>
      )}
      <div className="field">
        <label className="label">API Key</label>
        <div className="settings__key-wrap">
          <input className="input" type={showKey ? 'text' : 'password'} value={apiKey}
            onChange={e => setApiKey(e.target.value)} placeholder="sk-or-v1-…" autoComplete="off" spellCheck={false} />
          <button className="btn btn--ghost btn--icon btn--sm settings__eye" type="button"
            onClick={() => setShowKey(v => !v)}>
            <Icon name={showKey ? 'eyeOff' : 'eye'} size={13} />
          </button>
        </div>
        {!apiKey && globalSettings.openrouter_api_key && (
          <p className="settings__hint">
            <button className="btn btn--ghost btn--sm" style={{padding:'0 4px',height:'auto'}}
              onClick={() => setApiKey(globalSettings.openrouter_api_key)}>
              Use key from Settings
            </button>
          </p>
        )}
      </div>
      <div className="field">
        <label className="label">API URL</label>
        <input className="input mono" value={apiUrl} onChange={e => setApiUrl(e.target.value)}
          placeholder={DEFAULT_API_URL} spellCheck={false} />
      </div>
      <button className="btn btn--primary btn--sm" onClick={save}>Save connector config</button>
    </div>
  )
}

function AgentConfig({ agent, relationships, agents, onUpdate, onDelete, onClose, onUpsertSchedule, onDeleteRelation, onCreateRelation }: {
  agent: Agent; relationships: AgentRelationship[]; agents: Agent[]
  onUpdate: (patch: Partial<Agent>) => void; onDelete: () => void; onClose: () => void
  onUpsertSchedule: (patch: Partial<Schedule>) => void
  onDeleteRelation: (id: string) => void; onCreateRelation: (data: Omit<AgentRelationship, 'id'>) => void
}) {
  const [tab, setTab] = useState<'general' | 'connector' | 'prompt' | 'scope' | 'schedule' | 'relations'>('general')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [scopeDraft, setScopeDraft] = useState(() => JSON.stringify(agent.authority_scope || {}, null, 2))
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<'ok' | 'err' | null>(null)

  useEffect(() => {
    setScopeDraft(JSON.stringify(agent.authority_scope || {}, null, 2))
    setConfirmDelete(false)
    setRunResult(null)
  }, [agent.id])

  const isAI = agent.type === 'ai'
  const myRelations = relationships.filter(r => r.from_agent_id === agent.id || r.to_agent_id === agent.id)

  const saveScope = async () => {
    try {
      const parsed = JSON.parse(scopeDraft)
      await onUpdate({ authority_scope: parsed } as any)
    } catch { alert('Invalid JSON in authority_scope') }
  }

  const save = async (patch: Partial<Agent>) => {
    setSaving(true)
    try { await onUpdate(patch) } finally { setSaving(false) }
  }

  const runNow = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      await agentsApi.run(agent.id)
      setRunResult('ok')
    } catch {
      setRunResult('err')
    } finally {
      setRunning(false)
      setTimeout(() => setRunResult(null), 3000)
    }
  }

  return (
    <aside className="agent-cfg">
      <header className="agent-cfg__head">
        <div className="agent-cfg__identity">
          <div className={`avatar${isAI ? ' avatar--ai' : ' avatar--human'} avatar--xl`}>{initials(agent.name)}</div>
          <div className="agent-cfg__id-text">
            <input className="agent-cfg__name" value={agent.name} onChange={e => onUpdate({ name: e.target.value })} onBlur={e => save({ name: e.target.value })} />
            <input className="agent-cfg__role" value={agent.role_title} onChange={e => onUpdate({ role_title: e.target.value })} onBlur={e => save({ role_title: e.target.value })} />
            <div className="agent-cfg__tags">
              <span className={`tag-type tag-type--${agent.type}`}>{agent.type}</span>
              <label className="agent-cfg__toggle-wrap" style={{ display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                <span className="label">Active</span>
                <span className="toggle" data-on={agent.is_active ? 'true' : 'false'} onClick={() => save({ is_active: !agent.is_active })} />
              </label>
            </div>
          </div>
          <button className="btn btn--ghost btn--icon btn--sm agent-cfg__close" onClick={onClose}><Icon name="close" size={14}/></button>
        </div>
        <nav className="agent-cfg__tabs">
          {(['general', ...(isAI ? ['connector', 'prompt'] : []), 'scope', ...(isAI ? ['schedule'] : []), 'relations'] as const).map(t => (
            <button key={t} className={`agent-cfg__tab${tab === t ? ' agent-cfg__tab--active' : ''}`} onClick={() => setTab(t as any)}>
              {t === 'relations' ? <>{t} <span className="mono">{myRelations.length}</span></> : t}
            </button>
          ))}
        </nav>
      </header>

      <div className="agent-cfg__body">
        {tab === 'general' && (
          <>
            <div className="field"><span className="label">ID</span><code className="mono" style={{fontSize:'var(--fs-xs)',color:'var(--ink-2)',background:'var(--bg-inset)',border:'1px solid var(--line-1)',padding:'5px 8px',borderRadius:3,display:'inline-block'}}>{agent.id}</code></div>
            {isAI && (
              <div className="field">
                <label className="label">Connector type</label>
                <select className="select" value={agent.connector_type || ''} onChange={e => save({ connector_type: e.target.value || null as any })}>
                  <option value="">— None</option>
                  <option value="http">http (OpenRouter / OpenAI-compatible)</option>
                  <option value="opencode">opencode (headless CLI)</option>
                </select>
                {agent.connector_type === 'http' && (
                  <p className="settings__hint">Configure model and API key in the <strong>connector</strong> tab.</p>
                )}
              </div>
            )}
            {!isAI && <div className="agent-cfg__note">Humans don't have connector settings. Use the Relations tab to wire this person into the graph.</div>}
          </>
        )}

        {tab === 'connector' && isAI && (
          <ConnectorConfig agent={agent} onUpdate={patch => save(patch)} />
        )}

        {tab === 'prompt' && isAI && (
          <div className="field">
            <label className="label">System prompt</label>
            <textarea className="agent-cfg__prompt" rows={14} value={agent.system_prompt || ''} onChange={e => onUpdate({ system_prompt: e.target.value })} onBlur={e => save({ system_prompt: e.target.value })} placeholder="Describe this agent's role, voice, constraints…" />
            <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>{(agent.system_prompt || '').length} characters · saved on blur</span>
          </div>
        )}

        {tab === 'scope' && (
          <div className="field">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <label className="label">Authority scope (JSON)</label>
              <button className="btn btn--sm" onClick={saveScope}>Save</button>
            </div>
            <textarea className="agent-cfg__prompt" style={{fontFamily:'var(--font-mono)'}} rows={10} spellCheck={false} value={scopeDraft} onChange={e => setScopeDraft(e.target.value)} />
            <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>Define what this agent is allowed to do without human approval.</span>
          </div>
        )}

        {tab === 'schedule' && isAI && (
          <>
            {!agent.schedule ? (
              <div className="agent-cfg__empty">
                <div className="eyebrow">No schedule</div>
                <p>This agent will not run on a schedule. Create one to run it automatically on an interval.</p>
                <button className="btn btn--primary btn--sm" onClick={() => onUpsertSchedule({ interval_seconds: 300, is_enabled: true })}>
                  <Icon name="clock" size={12}/>Create schedule
                </button>
              </div>
            ) : (
              <>
                <div className="agent-cfg__sched-row">
                  <div className="field">
                    <label className="label">Interval</label>
                    <div className="agent-cfg__interval">
                      <input type="number" min={30} className="input" value={agent.schedule.interval_seconds}
                        onChange={e => onUpsertSchedule({ interval_seconds: Number(e.target.value) })} />
                      <span className="mono" style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>seconds</span>
                    </div>
                    <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>≈ every {formatInterval(agent.schedule.interval_seconds)}</span>
                  </div>
                  <div className="field">
                    <label className="label">Enabled</label>
                    <span className="toggle" data-on={agent.schedule.is_enabled ? 'true' : 'false'} onClick={() => onUpsertSchedule({ is_enabled: !agent.schedule?.is_enabled })} />
                  </div>
                </div>
                <div className="agent-cfg__sched-meta">
                  <div><span className="label">Last run</span><span className="mono" style={{fontSize:'var(--fs-xs)'}}>{agent.schedule.last_run_at || '—'}</span></div>
                  <div><span className="label">Next run</span><span className="mono" style={{fontSize:'var(--fs-xs)'}}>{agent.schedule.next_run_at || '—'}</span></div>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'relations' && (
          <div className="agent-cfg__relations">
            <div className="agent-cfg__rel-head">
              <span className="label">Connections</span>
              <button className="btn btn--sm" onClick={() => {
                const other = agents.find(x => x.id !== agent.id)
                if (other) onCreateRelation({ from_agent_id: agent.id, to_agent_id: other.id, type: 'collaborates_with' })
              }}><Icon name="plus" size={11}/>Add</button>
            </div>
            <ul className="rel-list">
              {myRelations.map(r => {
                const isOut = r.from_agent_id === agent.id
                const otherId = isOut ? r.to_agent_id : r.from_agent_id
                const other = agents.find(a => a.id === otherId)
                return (
                  <li key={r.id} className="rel">
                    <span className="rel__dir mono">{isOut ? '→' : '←'}</span>
                    <Icon name={r.type === 'reports_to' ? 'reportsTo' : 'collab'} size={13}/>
                    <span className="rel__type mono">{r.type}</span>
                    <div className={`avatar${other?.type === 'ai' ? ' avatar--ai' : ' avatar--human'} avatar--sm`}>{initials(other?.name || '?')}</div>
                    <span className="rel__other">{other?.name}</span>
                    <button className="btn btn--ghost btn--icon btn--sm" title="Remove" onClick={() => onDeleteRelation(r.id)}><Icon name="close" size={11}/></button>
                  </li>
                )
              })}
              {myRelations.length === 0 && <li className="rel-list__empty">No relationships yet.</li>}
            </ul>
          </div>
        )}
      </div>

      <footer className="agent-cfg__foot">
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {isAI && agent.connector_type && (
            <button
              className="btn btn--primary btn--sm"
              onClick={runNow}
              disabled={running}
              title="Trigger agent run now"
            >
              <Icon name={running ? 'pause' : 'play'} size={12}/>
              {running ? 'Running…' : runResult === 'ok' ? 'Triggered ✓' : runResult === 'err' ? 'Error ✗' : 'Run now'}
            </button>
          )}
        </div>
        {confirmDelete ? (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>Delete agent?</span>
            <button className="btn btn--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="btn btn--danger btn--sm" onClick={onDelete}>Delete</button>
          </div>
        ) : (
          <button className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={12}/>Delete</button>
        )}
      </footer>
    </aside>
  )
}

/* ─── Create agent modal ─── */
function CreateAgentModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (data: { name: string; role_title: string; type: 'ai' | 'human' }) => void
}) {
  const [form, setForm] = useState({ name: '', role_title: '', type: 'ai' as 'ai' | 'human' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.role_title.trim()) return
    onCreate({ name: form.name.trim(), role_title: form.role_title.trim(), type: form.type })
  }

  return (
    <div className="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel">
        <header className="modal__head">
          <div className="eyebrow">New agent</div>
          <h2>Add agent to organization</h2>
          <button className="btn btn--ghost btn--icon btn--sm modal__close" onClick={onClose}><Icon name="close" size={14}/></button>
        </header>
        <form onSubmit={submit} className="modal__body">
          <div className="typepicker">
            {(['ai','human'] as const).map(t => (
              <button type="button" key={t} className={`typepicker__opt${form.type === t ? ' typepicker__opt--active' : ''}`} onClick={() => set('type', t)}>
                <Icon name={t} size={18}/>
                <span className="typepicker__lbl">{t === 'ai' ? 'AI agent' : 'Human'}</span>
                <span className="typepicker__sub">{t === 'ai' ? 'Autonomous, runs on schedule' : 'Teammate, approves & reviews'}</span>
              </button>
            ))}
          </div>
          <div className="modal__grid">
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder={form.type === 'ai' ? 'e.g. Scout' : 'Alex Mercier'} required />
            </div>
            <div className="field">
              <label className="label">Role *</label>
              <input className="input" value={form.role_title} onChange={e => set('role_title', e.target.value)} placeholder={form.type === 'ai' ? 'Research Agent' : 'Head of Operations'} required />
            </div>
          </div>
        </form>
        <div className="modal__foot">
          <div/>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={submit}>Create agent</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Create relation modal ─── */
function CreateRelationModal({ agents, onClose, onCreate }: {
  agents: Agent[]; onClose: () => void
  onCreate: (data: Omit<AgentRelationship, 'id'>) => void
}) {
  const [from, setFrom] = useState(agents[0]?.id || '')
  const [to, setTo] = useState(agents[1]?.id || '')
  const [type, setType] = useState<'reports_to' | 'collaborates_with'>('reports_to')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!from || !to || from === to) return
    onCreate({ from_agent_id: from, to_agent_id: to, type })
  }

  return (
    <div className="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel">
        <header className="modal__head">
          <div className="eyebrow">New relationship</div>
          <h2>Create a connection</h2>
          <button className="btn btn--ghost btn--icon btn--sm modal__close" onClick={onClose}><Icon name="close" size={14}/></button>
        </header>
        <form onSubmit={submit} className="modal__body">
          <div className="relbuilder">
            <div className="field">
              <label className="label">From</label>
              <select className="select" value={from} onChange={e => setFrom(e.target.value)}>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="relbuilder__arrow">
              <Icon name="arrowRight" size={16}/>
            </div>
            <div className="field">
              <label className="label">To</label>
              <select className="select" value={to} onChange={e => setTo(e.target.value)}>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label">Relationship type</label>
            <div className="segmented">
              {(['reports_to','collaborates_with'] as const).map(t => (
                <button key={t} type="button" className={`segmented__btn${type === t ? ' segmented__btn--active' : ''}`} onClick={() => setType(t)}>
                  <Icon name={t === 'reports_to' ? 'reportsTo' : 'collab'} size={13}/>{t.replace('_',' ')}
                </button>
              ))}
            </div>
          </div>
        </form>
        <div className="modal__foot">
          <div/>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={submit}>Create</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main page ─── */
export default function GraphPage() {
  const { user } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [relationships, setRelationships] = useState<AgentRelationship[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'ai' | 'human'>('all')
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [creating, setCreating] = useState(false)
  const [creatingRel, setCreatingRel] = useState(false)

  useEffect(() => {
    Promise.all([agentsApi.list(), graphApi.get()])
      .then(([agentList, graph]) => { setAgents(agentList); setRelationships(graph.edges) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const byId = Object.fromEntries(agents.map(a => [a.id, a]))
  const selected = selectedId ? byId[selectedId] : null

  const filtered = agents.filter(a => {
    if (filterType !== 'all' && a.type !== filterType) return false
    const q = query.trim().toLowerCase()
    if (q && !(a.name.toLowerCase().includes(q) || a.role_title.toLowerCase().includes(q))) return false
    return true
  })

  const updateAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setAgents(as => as.map(a => a.id === id ? { ...a, ...patch } : a))
    agentsApi.update(id, patch).catch(() => {})
  }, [])

  const deleteAgent = useCallback(async (id: string) => {
    await agentsApi.delete(id).catch(() => {})
    setAgents(as => as.filter(a => a.id !== id))
    setRelationships(rs => rs.filter(r => r.from_agent_id !== id && r.to_agent_id !== id))
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const createAgent = useCallback(async (data: { name: string; role_title: string; type: 'ai' | 'human' }) => {
    const a = await agentsApi.create(data).catch(() => null)
    if (a) { setAgents(as => [...as, a]); setSelectedId(a.id) }
    setCreating(false)
  }, [])

  const deleteRelation = useCallback(async (id: string) => {
    setRelationships(rs => rs.filter(r => r.id !== id))
    graphApi.deleteRelationship(id).catch(() => {})
  }, [])

  const createRelation = useCallback(async (data: Omit<AgentRelationship, 'id'>) => {
    const r = await graphApi.createRelationship(data.from_agent_id, data.to_agent_id, data.type).catch(() => null)
    if (r) setRelationships(rs => [...rs, r])
    setCreatingRel(false)
  }, [])

  const upsertSchedule = useCallback(async (agentId: string, patch: Partial<Schedule>) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return
    if (agent.schedule) {
      const updated = await schedulesApi.update(agent.schedule.id, patch).catch(() => null)
      if (updated) updateAgent(agentId, { schedule: updated } as any)
    } else {
      const created = await schedulesApi.create(agentId, patch.interval_seconds || 300).catch(() => null)
      if (created) updateAgent(agentId, { schedule: created } as any)
    }
  }, [agents, updateAgent])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', minHeight:0 }}>
      <header className="topbar">
        <div className="topbar__title">Agents</div>
        <span className="topbar__crumb mono">{(user as any)?.org_slug || 'workspace'}.graphait / agents</span>
        <div className="topbar__right">
          <div className="viewtoggle">
            <button className={`viewtoggle__btn${view === 'graph' ? ' viewtoggle__btn--active' : ''}`} onClick={() => setView('graph')}><Icon name="graph" size={13}/>Graph</button>
            <button className={`viewtoggle__btn${view === 'list' ? ' viewtoggle__btn--active' : ''}`} onClick={() => setView('list')}><Icon name="list" size={13}/>List</button>
          </div>
          <button className="btn btn--sm" onClick={() => setCreatingRel(true)}><Icon name="link" size={12}/>New relationship</button>
          <button className="btn btn--primary btn--sm" onClick={() => setCreating(true)}><Icon name="plus" size={12}/>New agent</button>
        </div>
      </header>

      <div className="agents" style={{ flex:1 }}>
        {/* Left rail */}
        <aside className="agents__rail">
          <div className="agents__search">
            <div className="searchbox" style={{ width:'100%' }}>
              <Icon name="search" size={12}/>
              <input className="searchbox__input" placeholder="Filter agents…" value={query} onChange={e => setQuery(e.target.value)}/>
            </div>
          </div>
          <div className="agents__filter">
            <button className={`chip${filterType === 'all' ? ' chip--active' : ''}`} onClick={() => setFilterType('all')}>All<span className="mono chip__count">{agents.length}</span></button>
            <button className={`chip${filterType === 'ai' ? ' chip--active' : ''}`} onClick={() => setFilterType('ai')}><Icon name="ai" size={11}/>AI<span className="mono chip__count">{agents.filter(a=>a.type==='ai').length}</span></button>
            <button className={`chip${filterType === 'human' ? ' chip--active' : ''}`} onClick={() => setFilterType('human')}><Icon name="human" size={11}/>Human<span className="mono chip__count">{agents.filter(a=>a.type==='human').length}</span></button>
          </div>
          <ul className="agents__list">
            {loading && <li style={{padding:12,color:'var(--ink-3)',fontSize:'var(--fs-sm)'}}>Loading…</li>}
            {filtered.map(a => (
              <li key={a.id}
                className={`agent-row${selectedId === a.id ? ' agent-row--active' : ''}${!a.is_active ? ' agent-row--inactive' : ''}`}
                onClick={() => setSelectedId(id => id === a.id ? null : a.id)}
              >
                <div className={`avatar${a.type === 'ai' ? ' avatar--ai' : ' avatar--human'}`}>{initials(a.name)}</div>
                <div className="agent-row__meta">
                  <div className="agent-row__name">{a.name}</div>
                  <div className="agent-row__role">{a.role_title}</div>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  <span className={`tag-type tag-type--${a.type}`}>{a.type}</span>
                </div>
              </li>
            ))}
            {!loading && filtered.length === 0 && <li className="agents__empty">No agents match.</li>}
          </ul>
        </aside>

        {/* Canvas */}
        <section className="agents__canvas">
          {view === 'graph' ? (
            <AgentGraph agents={agents} relationships={relationships} selectedId={selectedId} onSelect={id => setSelectedId(i => i === id ? null : id)} onDeleteRelation={deleteRelation} />
          ) : (
            <AgentListView agents={filtered} relationships={relationships} selectedId={selectedId} onSelect={id => setSelectedId(i => i === id ? null : id)} />
          )}
        </section>

        {/* Config panel */}
        {selected && (
          <AgentConfig
            key={selected.id}
            agent={selected}
            relationships={relationships}
            agents={agents}
            onUpdate={patch => updateAgent(selected.id, patch)}
            onDelete={() => deleteAgent(selected.id)}
            onClose={() => setSelectedId(null)}
            onUpsertSchedule={patch => upsertSchedule(selected.id, patch)}
            onDeleteRelation={deleteRelation}
            onCreateRelation={createRelation}
          />
        )}
      </div>

      {creating && <CreateAgentModal onClose={() => setCreating(false)} onCreate={createAgent} />}
      {creatingRel && agents.length >= 2 && <CreateRelationModal agents={agents} onClose={() => setCreatingRel(false)} onCreate={createRelation} />}
    </div>
  )
}
