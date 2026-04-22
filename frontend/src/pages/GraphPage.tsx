import { useState, useEffect, useRef, type FormEvent } from 'react'
import Layout from '../components/Layout'
import { agentsApi, schedulesApi, type Agent, type Schedule } from '../api/agents'
import { graphApi, type AgentRelationship } from '../api/graph'

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Simple circular layout for graph nodes
function computeLayout(agents: Agent[], width: number, height: number): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const n = agents.length
  if (n === 0) return positions
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) * 0.32
  agents.forEach((a, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    positions.set(a.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  })
  return positions
}

function AgentConfigPanel({
  agent,
  onClose,
  onUpdated,
}: {
  agent: Agent
  onClose: () => void
  onUpdated: (a: Agent) => void
}) {
  const [tab, setTab] = useState<'config'>('config')
  const [connectorType, setConnectorType] = useState(agent.connector_type ?? 'http')
  const [intervalSec, setIntervalSec] = useState(agent.schedule?.interval_seconds ?? 300)
  const [enabled, setEnabled] = useState(agent.schedule?.is_enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await agentsApi.update(agent.id, { connector_type: connectorType })
      if (agent.schedule) {
        await schedulesApi.update(agent.schedule.id, { interval_seconds: intervalSec, is_enabled: enabled })
      } else if (agent.type === 'ai') {
        await schedulesApi.create(agent.id, intervalSec)
      }
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-[320px] h-full border-l border-outline-variant bg-surface-container-lowest flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-label-mono text-[14px] ${
              agent.type === 'ai' ? 'bg-primary text-on-primary' : 'bg-surface-container-highest border border-outline-variant text-on-surface-variant'
            }`}>
              {initials(agent.name)}
            </div>
            <div>
              <h3 className="font-body-sm text-body-sm font-semibold text-on-surface leading-tight">{agent.name}</h3>
              <span className="font-label-mono text-label-mono text-outline">{agent.role_title}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-5 px-1.5 flex items-center bg-surface-container rounded-[2px] font-label-mono text-[10px] text-on-surface-variant border border-outline-variant/50">
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${agent.is_active ? 'bg-emerald-500' : 'bg-outline'}`} />
            {agent.is_active ? 'Active' : 'Inactive'}
          </span>
          <span className="h-5 px-1.5 flex items-center bg-surface-container rounded-[2px] font-label-mono text-[10px] text-on-surface-variant border border-outline-variant/50">
            {agent.type.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 border-b border-outline-variant">
        <button className="h-9 px-2 font-body-sm text-body-sm font-medium border-b-2 border-primary text-primary -mb-[1px]">
          Configuration
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <h4 className="font-label-mono text-label-mono text-outline uppercase tracking-wider">Scheduler / Agent Config</h4>

          {agent.type === 'ai' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="connector-type" className="font-body-sm text-body-sm text-on-surface-variant">Connector Type</label>
                <div className="relative">
                  <select
                    id="connector-type"
                    className="w-full h-8 pl-2 pr-6 border border-outline-variant rounded-[4px] bg-surface-container-lowest font-body-sm text-body-sm focus:border-primary focus:ring-0 outline-none appearance-none cursor-pointer"
                    value={connectorType}
                    onChange={e => setConnectorType(e.target.value)}
                  >
                    <option value="http">HTTP / OpenRouter</option>
                    <option value="opencode">OpenCode CLI</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-2 text-[14px] text-outline pointer-events-none">expand_more</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-body-sm text-body-sm text-on-surface-variant">Execution Interval (seconds)</label>
                <input
                  className="w-full h-8 px-2 border border-outline-variant rounded-[4px] bg-surface-container-lowest font-body-sm text-body-sm focus:border-primary focus:ring-0 outline-none"
                  type="number"
                  min={60}
                  value={intervalSec}
                  onChange={e => setIntervalSec(Number(e.target.value))}
                />
                <span className="font-label-mono text-[9px] text-outline mt-0.5">Min: 60s</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex flex-col">
                  <span className="font-body-sm text-body-sm text-on-surface">Enable Scheduler</span>
                  <span className="font-label-mono text-[9px] text-outline">Allow autonomous execution</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled(prev => !prev)}
                  className={`w-8 h-4 rounded-full relative cursor-pointer border transition-colors ${
                    enabled ? 'bg-primary border-primary' : 'bg-surface-container border-outline-variant'
                  }`}
                >
                  <div className={`w-3 h-3 bg-white rounded-full absolute top-[1px] transition-all shadow-sm ${enabled ? 'left-[17px]' : 'left-[1px]'}`} />
                </button>
              </div>
            </>
          )}

          {agent.type === 'human' && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">Human agents do not have a scheduler.</p>
          )}
        </div>

        {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
      </form>

      {/* Footer */}
      <div className="p-4 border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-7 px-3 bg-surface-container-lowest border border-outline-variant text-on-surface rounded-[4px] font-body-sm text-body-sm font-medium hover:bg-surface-container transition-colors">
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-7 px-3 bg-primary text-on-primary rounded-[4px] font-body-sm text-body-sm font-medium hover:bg-surface-tint transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Config'}
        </button>
      </div>
    </div>
  )
}

export default function GraphPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [edges, setEdges] = useState<AgentRelationship[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 500 })

  useEffect(() => {
    Promise.all([agentsApi.list(), graphApi.get()])
      .then(([agentList, graph]) => {
        setAgents(agentList)
        setEdges(graph.edges)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const e = entries[0]
      setCanvasSize({ width: e.contentRect.width, height: e.contentRect.height })
    })
    ro.observe(el)
    setCanvasSize({ width: el.offsetWidth, height: el.offsetHeight })
    return () => ro.disconnect()
  }, [])

  const positions = computeLayout(agents, canvasSize.width, canvasSize.height)
  const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()))

  const handleUpdated = (updated: Agent) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelectedAgent(updated)
  }

  const relLabel: Record<string, string> = {
    reports_to: 'reports to',
    collaborates_with: 'collaborates',
    supervises: 'supervises',
  }

  return (
    <Layout>
      <div className="flex flex-1 overflow-hidden bg-surface-container-lowest">
        {/* Agent List */}
        <div data-testid="agent-list" className="w-[240px] h-full border-r border-outline-variant flex flex-col shrink-0 bg-surface-container-lowest">
          <div className="p-3 border-b border-outline-variant flex items-center justify-between">
            <h2 className="font-body-sm text-body-sm font-semibold text-on-surface">Agents</h2>
            <span className="font-label-mono text-label-mono bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">
              {agents.length}
            </span>
          </div>
          <div className="p-2 border-b border-outline-variant">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2 top-1.5 text-[14px] text-outline">search</span>
              <input
                className="w-full h-7 pl-7 pr-2 border border-outline-variant rounded-[4px] bg-surface-container-lowest font-body-sm text-body-sm focus:border-primary focus:ring-0 outline-none placeholder:text-outline"
                placeholder="Filter agents…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar py-2 flex flex-col">
            {loading && (
              <p className="px-3 font-body-sm text-body-sm text-outline">Loading…</p>
            )}
            {filteredAgents.map(agent => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(prev => prev?.id === agent.id ? null : agent)}
                className={`flex items-center px-3 py-1.5 cursor-pointer border-l-2 transition-colors ${
                  selectedAgent?.id === agent.id
                    ? 'bg-surface-container-low border-primary'
                    : 'hover:bg-surface-container-low border-transparent'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-label-mono text-[10px] mr-3 shrink-0 ${
                  agent.type === 'ai'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-highest border border-outline-variant text-on-surface-variant'
                }`}>
                  {initials(agent.name)}
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-body-sm text-body-sm text-on-surface truncate font-medium">{agent.name}</span>
                  <span className="font-label-mono text-[9px] text-outline truncate">{agent.role_title}</span>
                </div>
              </div>
            ))}
            {!loading && agents.length === 0 && (
              <p className="px-3 font-body-sm text-body-sm text-outline">No agents yet.</p>
            )}
          </div>
        </div>

        {/* Graph Canvas */}
        <div ref={canvasRef} className="flex-1 relative bg-surface overflow-hidden">
          {/* dot grid background */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px' }}
          />

          {/* Graph controls */}
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            <button className="h-7 w-7 flex items-center justify-center bg-surface-container-lowest border border-outline-variant rounded-[4px] hover:bg-surface-container text-on-surface-variant shadow-sm">
              <Icon name="zoom_in" />
            </button>
            <button className="h-7 w-7 flex items-center justify-center bg-surface-container-lowest border border-outline-variant rounded-[4px] hover:bg-surface-container text-on-surface-variant shadow-sm">
              <Icon name="zoom_out" />
            </button>
            <button className="h-7 w-7 flex items-center justify-center bg-surface-container-lowest border border-outline-variant rounded-[4px] hover:bg-surface-container text-on-surface-variant shadow-sm ml-2">
              <Icon name="center_focus_strong" />
            </button>
          </div>

          {/* SVG edges */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {edges.map(edge => {
              const from = positions.get(edge.from_agent_id)
              const to = positions.get(edge.to_agent_id)
              if (!from || !to) return null
              const mx = (from.x + to.x) / 2
              const my = (from.y + to.y) / 2
              return (
                <g key={edge.id}>
                  <path
                    d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                    fill="none"
                    stroke="#c7c4d8"
                    strokeWidth="1.5"
                    strokeDasharray={edge.type === 'reports_to' ? undefined : '4 4'}
                  />
                  {/* edge label rendered as foreignObject for typography consistency */}
                  <foreignObject x={mx - 30} y={my - 8} width={60} height={16}>
                    <div className="font-label-mono text-[9px] text-outline bg-surface px-1 border border-outline-variant rounded-[2px] text-center overflow-hidden text-ellipsis whitespace-nowrap">
                      {relLabel[edge.type] ?? edge.type}
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </svg>

          {/* Nodes */}
          {agents.map(agent => {
            const pos = positions.get(agent.id)
            if (!pos) return null
            const isSelected = selectedAgent?.id === agent.id
            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(prev => prev?.id === agent.id ? null : agent)}
                className="absolute flex flex-col items-center gap-1 cursor-pointer group"
                style={{ left: pos.x - 16, top: pos.y - 16 }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-label-mono text-[11px] shadow-sm transition-all z-10
                  ${agent.type === 'ai'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-highest border border-outline-variant text-on-surface-variant'
                  }
                  ${isSelected
                    ? 'ring-4 ring-primary-container'
                    : 'ring-2 ring-transparent group-hover:ring-primary/30'
                  }`}
                >
                  {initials(agent.name)}
                </div>
                <span className={`font-body-sm text-[11px] font-medium bg-surface/80 px-1 rounded ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                  {agent.name}
                </span>
              </div>
            )
          })}

          {!loading && agents.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="font-body-sm text-body-sm text-outline">No agents. Create one via the API to get started.</p>
            </div>
          )}
        </div>

        {/* Config Panel */}
        {selectedAgent && (
          <AgentConfigPanel
            key={selectedAgent.id}
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            onUpdated={handleUpdated}
          />
        )}
      </div>
    </Layout>
  )
}
