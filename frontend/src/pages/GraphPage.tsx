import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { agentsApi, type Agent } from '../api/agents'
import { graphApi, type GraphEdge } from '../api/graph'
import { skillsApi, type SkillRead } from '../api/skills'
import Icon from '../components/Icon'
import { AGENT_TEMPLATES, SENIORITY_LABEL, type AgentTemplate, type Seniority } from '../data/agentTemplates'

/* ─── Layout helpers ─── */
function computeLayout(agents: Agent[], edges: GraphEdge[]) {
  const parent: Record<string, string> = {}
  edges.forEach(e => {
    if (e.type === 'reports_to' && !parent[e.from_agent_id]) parent[e.from_agent_id] = e.to_agent_id
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

  const edgeData = edges.map(e => ({ id: e.id, from: e.from_agent_id, to: e.to_agent_id, type: e.type }))
  return { nodes, edgeData, width, height }
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

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/* ─── Agent Graph ─── */
function AgentGraph({ agents, edges, selectedId, onSelect }: {
  agents: Agent[]; edges: GraphEdge[]; selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const layout = computeLayout(agents, edges)
  const { nodes, edgeData, width, height } = layout

  return (
    <div className="graph">
      <div className="graph__toolbar">
        <div className="eyebrow">Organization graph · {agents.length} agents · {edges.length} edges</div>
        <div className="graph__legend">
          <span><span style={{display:'inline-block',width:16,height:2,background:'var(--accent-line)'}}/>reports_to</span>
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

          {edgeData.map(e => {
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

          {agents.map(a => {
            const n = nodes[a.id]
            if (!n) return null
            const isSel = a.id === selectedId
            const w = 152, h = 52
            return (
              <g key={a.id}
                className={`gnode${a.type === 'ai' ? ' gnode--ai' : ' gnode--human'}${isSel ? ' gnode--selected' : ''}`}
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
function AgentListView({ agents, selectedId, onSelect }: {
  agents: Agent[]; selectedId: string | null; onSelect: (id: string) => void
}) {
  return (
    <div className="alist">
      <div className="alist__head">
        <span className="label">Agent</span>
        <span className="label">Role</span>
        <span className="label">Type</span>
        <span className="label">Reports to</span>
        <span className="label">Schedule</span>
      </div>
      <ul className="alist__body">
        {agents.map(a => {
          const parent = a.reports_to ? agents.find(x => x.id === a.reports_to) : null
          return (
            <li key={a.id} className={`alist__row${selectedId === a.id ? ' alist__row--active' : ''}`} onClick={() => onSelect(a.id)}>
              <span className="alist__cell">
                <div className={`avatar${a.type === 'ai' ? ' avatar--ai' : ' avatar--human'} avatar--sm`}>{initials(a.name)}</div>
                <span>{a.name}</span>
              </span>
              <span className="alist__cell alist__cell--dim">{a.role_title}</span>
              <span className="alist__cell"><span className={`tag-type tag-type--${a.type}`}>{a.type}</span></span>
              <span className="alist__cell alist__cell--dim">{parent?.name || '—'}</span>
              <span className="alist__cell mono">{a.schedule_enabled ? `${a.schedule_interval}s` : '—'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ─── Agent Config panel ─── */
const AVAILABLE_TOOLS = [
  'read_file', 'write_file', 'list_directory', 'web_search', 'fetch_url'
]

function AgentConfig({ agent, agents, skills, onUpdate, onSave, onDelete, onClose }: {
  agent: Agent; agents: Agent[]; skills: SkillRead[]
  onUpdate: (patch: Partial<Agent>) => void
  onSave: (agent: Agent) => Promise<void>
  onDelete: () => void; onClose: () => void
}) {
  const [tab, setTab] = useState<'general' | 'model' | 'tools' | 'skills' | 'schedule'>('general')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<'ok' | 'err' | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => { setConfirmDelete(false); setRunResult(null); setDirty(false); setSavedAt(null) }, [agent.id])

  const isAI = agent.type === 'ai'

  const update = (patch: Partial<Agent>) => { onUpdate(patch); setDirty(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(agent)
      setDirty(false)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    try { await agentsApi.run(agent.id); setRunResult('ok') }
    catch { setRunResult('err') }
    finally { setRunning(false); setTimeout(() => setRunResult(null), 3000) }
  }

  const tabs = ['general', ...(isAI ? ['model', 'tools', 'skills', 'schedule'] : [])] as const

  return (
    <aside className="agent-cfg">
      <header className="agent-cfg__head">
        <div className="agent-cfg__identity">
          <div className={`avatar${isAI ? ' avatar--ai' : ' avatar--human'} avatar--xl`}>{initials(agent.name)}</div>
          <div className="agent-cfg__id-text">
            <input className="agent-cfg__name" value={agent.name}
              onChange={e => update({ name: e.target.value })} />
            <input className="agent-cfg__role" value={agent.role_title}
              onChange={e => update({ role_title: e.target.value })} />
            <span className={`tag-type tag-type--${agent.type}`}>{agent.type}</span>
          </div>
          <button className="btn btn--ghost btn--icon btn--sm agent-cfg__close" onClick={onClose}>
            <Icon name="close" size={14}/>
          </button>
        </div>
        <nav className="agent-cfg__tabs">
          {tabs.map(t => (
            <button key={t} className={`agent-cfg__tab${tab === t ? ' agent-cfg__tab--active' : ''}`}
              onClick={() => setTab(t as any)}>{t}</button>
          ))}
        </nav>
      </header>

      <div className="agent-cfg__body">
        {tab === 'general' && (
          <>
            <div className="field">
              <span className="label">ID</span>
              <code className="mono" style={{fontSize:'var(--fs-xs)',color:'var(--ink-2)',
                background:'var(--bg-inset)',border:'1px solid var(--line-1)',
                padding:'5px 8px',borderRadius:3,display:'inline-block'}}>{agent.id}</code>
            </div>
            <div className="field">
              <label className="label">System prompt</label>
              <textarea className="agent-cfg__prompt" rows={10}
                value={agent.system_prompt}
                onChange={e => update({ system_prompt: e.target.value })}
                placeholder="Describe this agent's role, personality, constraints…"/>
            </div>
            <div className="field">
              <label className="label">Reports to</label>
              <select className="select"
                value={agent.reports_to ?? ''}
                onChange={e => update({ reports_to: e.target.value || null })}>
                <option value="">— None (top-level)</option>
                {agents.filter(a => a.id !== agent.id).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {tab === 'model' && isAI && (
          <>
            <div className="field">
              <label className="label">Model</label>
              <input className="input mono" value={agent.model}
                onChange={e => update({ model: e.target.value })}
                placeholder="anthropic/claude-sonnet-4-5"/>
              <p className="settings__hint">OpenRouter model ID. Leave blank to use org default.</p>
            </div>
            <div className="field">
              <label className="label">API Key (optional)</label>
              <input className="input" type="password"
                value={agent.api_key ?? ''}
                onChange={e => update({ api_key: e.target.value || null })}
                placeholder="Overrides org key if set" autoComplete="off"/>
            </div>
            <div className="field">
              <label className="label">Working directory</label>
              <input className="input mono" value={agent.working_dir}
                onChange={e => update({ working_dir: e.target.value })}
                placeholder="./workspaces/agent-id"/>
            </div>
          </>
        )}

        {tab === 'tools' && isAI && (
          <div className="field">
            <label className="label">Optional tools</label>
            <p className="settings__hint">Always-on: post_comment, update_status, create_task, assign_task</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {AVAILABLE_TOOLS.map(tool => (
                <label key={tool} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={agent.tools.includes(tool)}
                    onChange={e => {
                      const tools = e.target.checked
                        ? [...agent.tools, tool]
                        : agent.tools.filter(t => t !== tool)
                      update({ tools })
                    }}/>
                  <span className="mono" style={{ fontSize: 'var(--fs-sm)' }}>{tool}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {tab === 'skills' && isAI && (
          <div className="field">
            <label className="label">Assigned skills</label>
            {skills.length === 0
              ? <p className="settings__hint">No skills defined yet. Add skills on the Skills page.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {skills.map(skill => (
                    <label key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox"
                        checked={agent.skills.includes(skill.id)}
                        onChange={e => {
                          const updated = e.target.checked
                            ? [...agent.skills, skill.id]
                            : agent.skills.filter(s => s !== skill.id)
                          update({ skills: updated })
                        }}/>
                      <span>{skill.name}</span>
                    </label>
                  ))}
                </div>
              )}
          </div>
        )}

        {tab === 'schedule' && isAI && (
          <>
            <div className="field">
              <label className="label">Schedule enabled</label>
              <span className="toggle" data-on={agent.schedule_enabled ? 'true' : 'false'}
                onClick={() => update({ schedule_enabled: !agent.schedule_enabled })}/>
            </div>
            <div className="field">
              <label className="label">Interval (seconds)</label>
              <input type="number" min={30} className="input"
                value={agent.schedule_interval}
                onChange={e => update({ schedule_interval: Number(e.target.value) })}/>
              <p className="settings__hint">How often the agent checks for pending tasks.</p>
            </div>
          </>
        )}
      </div>

      <footer className="agent-cfg__foot">
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={!dirty || saving}>
            <Icon name="check" size={12}/>
            {saving ? 'Saving…' : savedAt ? 'Saved ✓' : 'Save'}
          </button>
          {isAI && (
            <button className="btn btn--sm" onClick={runNow} disabled={running || dirty}>
              <Icon name={running ? 'pause' : 'play'} size={12}/>
              {running ? 'Running…' : runResult === 'ok' ? 'Triggered ✓' : runResult === 'err' ? 'Error ✗' : 'Run now'}
            </button>
          )}
        </div>
        {confirmDelete ? (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{fontSize:'var(--fs-xs)',color:'var(--ink-3)'}}>Delete?</span>
            <button className="btn btn--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="btn btn--danger btn--sm" onClick={onDelete}>Delete</button>
          </div>
        ) : (
          <button className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={12}/>Delete
          </button>
        )}
      </footer>
    </aside>
  )
}

/* ─── Create agent modal ─── */
const SENIORITY_COLOR: Record<Seniority, string> = {
  executive: 'var(--accent)',
  senior: 'var(--ink-1)',
  junior: 'var(--ink-3)',
}

const TIERS: { key: Seniority; label: string }[] = [
  { key: 'executive', label: 'Executive' },
  { key: 'senior',    label: 'Senior' },
  { key: 'junior',    label: 'Junior' },
]

type CreateForm = {
  id: string; name: string; role_title: string
  type: 'ai' | 'human'; working_dir: string
  model: string; system_prompt: string
}

function CreateAgentModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (data: CreateForm) => void
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)
  const [form, setForm] = useState<CreateForm>({
    id: '', name: '', role_title: '', type: 'ai', working_dir: '', model: '', system_prompt: ''
  })

  const applyTemplate = (tpl: AgentTemplate) => {
    setSelectedTemplate(tpl)
    setForm({
      id: tpl.id,
      name: tpl.name,
      role_title: tpl.role_title,
      type: 'ai',
      working_dir: `./workspaces/${tpl.id}`,
      model: tpl.model,
      system_prompt: tpl.system_prompt,
    })
  }

  const clearTemplate = () => {
    setSelectedTemplate(null)
    setForm({ id: '', name: '', role_title: '', type: 'ai', working_dir: '', model: '', system_prompt: '' })
  }

  const set = (k: keyof CreateForm, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'id' && !selectedTemplate) next.working_dir = v ? `./workspaces/${v}` : ''
      return next
    })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.id.trim() || !form.name.trim() || !form.role_title.trim()) return
    onCreate({
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      role_title: form.role_title.trim(),
      working_dir: form.working_dir.trim() || `./workspaces/${form.id.trim()}`,
    })
  }

  return (
    <div className="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel" style={{ maxWidth: 640 }}>
        <header className="modal__head">
          <div className="eyebrow">New agent</div>
          <h2>Add agent to organization</h2>
          <button className="btn btn--ghost btn--icon btn--sm modal__close" onClick={onClose}><Icon name="close" size={14}/></button>
        </header>

        <form onSubmit={submit} className="modal__body" style={{ gap: 20 }}>
          {/* Template picker */}
          <div className="field" style={{ gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="label">Start from template</span>
              {selectedTemplate && (
                <button type="button" className="btn btn--ghost btn--sm" style={{ fontSize: 'var(--fs-xs)' }} onClick={clearTemplate}>
                  Clear
                </button>
              )}
            </div>
            {TIERS.map(tier => (
              <div key={tier.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {tier.label}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AGENT_TEMPLATES.filter(t => t.seniority === tier.key).map(tpl => (
                    <button
                      type="button"
                      key={tpl.id}
                      onClick={() => selectedTemplate?.id === tpl.id ? clearTemplate() : applyTemplate(tpl)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 4,
                        border: `1px solid ${selectedTemplate?.id === tpl.id ? SENIORITY_COLOR[tier.key] : 'var(--line-2)'}`,
                        background: selectedTemplate?.id === tpl.id ? 'var(--bg-inset)' : 'transparent',
                        color: selectedTemplate?.id === tpl.id ? SENIORITY_COLOR[tier.key] : 'var(--ink-2)',
                        fontSize: 'var(--fs-sm)',
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Type picker — only shown for blank agents */}
          {!selectedTemplate && (
            <div className="typepicker">
              {(['ai','human'] as const).map(t => (
                <button type="button" key={t} className={`typepicker__opt${form.type === t ? ' typepicker__opt--active' : ''}`} onClick={() => set('type', t)}>
                  <Icon name={t} size={18}/>
                  <span className="typepicker__lbl">{t === 'ai' ? 'AI agent' : 'Human'}</span>
                  <span className="typepicker__sub">{t === 'ai' ? 'Autonomous, runs on schedule' : 'Teammate, approves & reviews'}</span>
                </button>
              ))}
            </div>
          )}

          <div className="modal__grid">
            <div className="field">
              <label className="label">ID *</label>
              <input className="input mono" autoFocus value={form.id} onChange={e => set('id', e.target.value)} placeholder="e.g. scout-agent" required />
            </div>
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder={form.type === 'ai' ? 'e.g. Scout' : 'Alex Mercier'} required />
            </div>
            <div className="field">
              <label className="label">Role *</label>
              <input className="input" value={form.role_title} onChange={e => set('role_title', e.target.value)} placeholder={form.type === 'ai' ? 'Research Agent' : 'Head of Operations'} required />
            </div>
            <div className="field">
              <label className="label">Working directory</label>
              <input className="input mono" value={form.working_dir} onChange={e => set('working_dir', e.target.value)} placeholder="./workspaces/agent-id" />
            </div>
            {selectedTemplate && (
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label className="label">Model</label>
                <input className="input mono" value={form.model} onChange={e => set('model', e.target.value)} placeholder="anthropic/claude-sonnet-4-5"/>
                <p className="settings__hint">Suggested for {SENIORITY_LABEL[selectedTemplate.seniority].toLowerCase()} tier. Edit freely.</p>
              </div>
            )}
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

/* ─── Main page ─── */
export default function GraphPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [skills, setSkills] = useState<SkillRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'ai' | 'human'>('all')
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([graphApi.get(), skillsApi.list().catch(() => [] as SkillRead[])])
      .then(([data, skillList]) => {
        setAgents(data.nodes)
        setEdges(data.edges)
        setSkills(skillList)
      })
      .catch(() => { setError('Failed to load graph. Please refresh.') })
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

  const updateAgentLocal = useCallback((id: string, patch: Partial<Agent>) => {
    setAgents(as => as.map(a => a.id === id ? { ...a, ...patch } : a))
    if ('reports_to' in patch) {
      setEdges(es => {
        const withoutOld = es.filter(e => !(e.from_agent_id === id && e.type === 'reports_to'))
        if (patch.reports_to) {
          return [...withoutOld, { id: `${id}_reports_to_${patch.reports_to}`, from_agent_id: id, to_agent_id: patch.reports_to, type: 'reports_to' }]
        }
        return withoutOld
      })
    }
  }, [])

  const saveAgent = useCallback(async (id: string, agent: Agent) => {
    await agentsApi.update(id, agent)
  }, [])

  const deleteAgent = useCallback(async (id: string) => {
    await agentsApi.delete(id).catch(() => {})
    setAgents(as => as.filter(a => a.id !== id))
    setEdges(es => es.filter(e => e.from_agent_id !== id && e.to_agent_id !== id))
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const createAgent = useCallback(async (data: {
    id: string; name: string; role_title: string; type: 'ai' | 'human'
    working_dir: string; model: string; system_prompt: string
  }) => {
    const a = await agentsApi.create(data).catch(() => null)
    if (a) { setAgents(as => [...as, a]); setSelectedId(a.id) }
    setCreating(false)
  }, [])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', minHeight:0 }}>
      <header className="topbar">
        <div className="topbar__title">Agents</div>
        <span className="topbar__crumb mono">graphait / agents</span>
        <div className="topbar__right">
          <div className="viewtoggle">
            <button className={`viewtoggle__btn${view === 'graph' ? ' viewtoggle__btn--active' : ''}`} onClick={() => setView('graph')}><Icon name="graph" size={13}/>Graph</button>
            <button className={`viewtoggle__btn${view === 'list' ? ' viewtoggle__btn--active' : ''}`} onClick={() => setView('list')}><Icon name="list" size={13}/>List</button>
          </div>
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
                className={`agent-row${selectedId === a.id ? ' agent-row--active' : ''}`}
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
        <section className="agents__canvas" style={{ position: 'relative' }}>
          {view === 'graph' ? (
            <AgentGraph agents={agents} edges={edges} selectedId={selectedId} onSelect={id => setSelectedId(i => i === id ? null : id)} />
          ) : (
            <AgentListView agents={filtered} selectedId={selectedId} onSelect={id => setSelectedId(i => i === id ? null : id)} />
          )}
          {error && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                          color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>
              {error}
            </div>
          )}
        </section>

        {/* Config panel */}
        {selected && (
          <AgentConfig
            key={selected.id}
            agent={selected}
            agents={agents}
            skills={skills}
            onUpdate={patch => updateAgentLocal(selected.id, patch)}
            onSave={agent => saveAgent(selected.id, agent)}
            onDelete={() => deleteAgent(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {creating && <CreateAgentModal onClose={() => setCreating(false)} onCreate={createAgent} />}
    </div>
  )
}
