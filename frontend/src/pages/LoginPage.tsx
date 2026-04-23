import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/auth'
import Icon from '../components/Icon'

const POSTER_NODES = [
  { id: 'a', x: 120, y: 90,  t: 'human', label: 'Alex',   role: 'Ops' },
  { id: 'b', x: 340, y: 60,  t: 'human', label: 'Nadia',  role: 'Product' },
  { id: 'c', x: 540, y: 140, t: 'ai',    label: 'Scout',  role: 'Research' },
  { id: 'd', x: 220, y: 280, t: 'ai',    label: 'Ledger', role: 'Finance' },
  { id: 'e', x: 440, y: 330, t: 'human', label: 'Omar',   role: 'Eng' },
  { id: 'f', x: 620, y: 260, t: 'ai',    label: 'Triage', role: 'Support' },
  { id: 'g', x: 100, y: 420, t: 'ai',    label: 'Vault',  role: 'Docs' },
  { id: 'h', x: 360, y: 480, t: 'human', label: 'June',   role: 'Legal' },
  { id: 'i', x: 580, y: 460, t: 'ai',    label: 'Pricer', role: 'Pricing' },
]
const POSTER_EDGES = [
  ['a','b','collab'], ['b','a','reports'],
  ['c','b','reports'], ['d','a','reports'],
  ['e','a','reports'], ['f','e','reports'],
  ['g','h','collab'],  ['h','a','collab'],
  ['i','d','collab'],  ['c','g','collab'],
  ['f','c','collab'],  ['d','i','collab'],
]
const nodeById = Object.fromEntries(POSTER_NODES.map(n => [n.id, n]))

function edgePath(a: typeof POSTER_NODES[0], b: typeof POSTER_NODES[0]) {
  const dx = b.x - a.x
  const mx = a.x + dx * 0.55
  return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`
}

function AuthPoster() {
  return (
    <div className="poster">
      <svg className="poster__grid" width="100%" height="100%" viewBox="0 0 720 580" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--line-1)"/>
          </pattern>
        </defs>
        <rect width="720" height="580" fill="url(#dots)"/>
        {POSTER_EDGES.map(([from, to, kind], i) => {
          const a = nodeById[from], b = nodeById[to]
          return (
            <g key={i} className={`poster__edge poster__edge--${kind}`} style={{ animationDelay: `${i * 120}ms` }}>
              <path d={edgePath(a, b)} />
            </g>
          )
        })}
        {POSTER_NODES.map((n, i) => (
          <g key={n.id} className="poster__node" style={{ animationDelay: `${600 + i * 80}ms` }}>
            {n.t === 'ai' ? (
              <rect x={n.x - 10} y={n.y - 10} width="20" height="20" fill="var(--bg-0)" stroke="var(--accent)" strokeWidth="1.5"/>
            ) : (
              <circle cx={n.x} cy={n.y} r="10" fill="var(--bg-0)" stroke="var(--human)" strokeWidth="1.5"/>
            )}
            <text x={n.x + 16} y={n.y - 2} className="poster__label">{n.label}</text>
            <text x={n.x + 16} y={n.y + 10} className="poster__sub">{n.role}</text>
          </g>
        ))}
      </svg>
      <div className="poster__overlay">
        <div className="poster__tag eyebrow">Live org graph</div>
        <div className="poster__title">Humans and agents, on one canvas.</div>
        <div className="poster__body">Assign work. Route approvals. Watch autonomous agents do the routine work while the humans keep the wheel.</div>
        <div className="poster__stats">
          <div><span className="mono">11</span><label>agents</label></div>
          <div><span className="mono">13</span><label>relationships</label></div>
          <div><span className="mono">18</span><label>tasks in flight</label></div>
        </div>
      </div>
    </div>
  )
}

function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="3" fill="var(--accent)"/>
      <circle cx="7"  cy="7"  r="1.8" fill="var(--accent-ink)"/>
      <circle cx="17" cy="7"  r="1.8" fill="var(--accent-ink)"/>
      <circle cx="17" cy="17" r="1.8" fill="var(--accent-ink)"/>
      <circle cx="7"  cy="17" r="1.8" fill="var(--accent-ink)"/>
      <circle cx="12" cy="12" r="1.8" fill="var(--accent-ink)"/>
      <path d="M7 7L17 17M7 17L17 7M7 7H17M7 17H17" stroke="var(--accent-ink)" strokeWidth="1" opacity="0.6"/>
    </svg>
  )
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ email: '', password: '', org_name: '', org_slug: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) return setError('Email and password are required.')
    if (mode === 'register') {
      if (!form.org_name || !form.org_slug) return setError('Organization name and slug are required.')
      if (!/^[a-z0-9-]+$/.test(form.org_slug)) return setError('Slug must be lowercase letters, digits, or dashes.')
    }
    setLoading(true)
    try {
      const res = mode === 'login'
        ? await authApi.login(form.email, form.password)
        : await authApi.register(form.org_name, form.org_slug, form.email, form.password)
      await login(res.access_token)
      navigate('/board')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__panel">
        <div className="auth__brand">
          <BrandMark size={26} />
          <span className="auth__brand-name">graphait</span>
        </div>

        <div className="auth__heading">
          <div className="eyebrow">{mode === 'login' ? 'Sign in' : 'Create organization'}</div>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Start a new workspace.'}</h1>
          <p>
            {mode === 'login'
              ? 'Sign in to coordinate your team of humans and AI agents.'
              : 'Set up an organization. The first account becomes the admin.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth__form">
          {mode === 'register' && (
            <div className="auth__row">
              <div className="field">
                <label className="label">Organization name</label>
                <input className="input" value={form.org_name} onChange={e => set('org_name', e.target.value)} placeholder="Acme Robotics" />
              </div>
              <div className="field">
                <label className="label">Slug</label>
                <div className="auth__slug">
                  <input className="input" value={form.org_slug} onChange={e => set('org_slug', e.target.value.toLowerCase())} placeholder="acme" />
                  <span className="auth__slug-suffix mono">.graphait</span>
                </div>
              </div>
            </div>
          )}

          <div className="field">
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@acme.co" autoComplete="email" />
          </div>
          <div className="field">
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>

          {error && (
            <div className="auth__error">
              <Icon name="alert" size={13} /><span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn--primary btn--lg auth__submit" disabled={loading}>
            {loading ? <span className="mono">CONNECTING…</span> : (
              <>{mode === 'login' ? 'Sign in' : 'Create organization'}<Icon name="arrowRight" size={14} /></>
            )}
          </button>

          <div className="auth__toggle">
            {mode === 'login' ? (
              <>No account yet? <button type="button" onClick={() => setMode('register')}>Create an organization</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => setMode('login')}>Sign in</button></>
            )}
          </div>
        </form>

        <div className="auth__foot">
          <div className="mono">v0.5.0</div>
          <div>Graphait — AI + human workflow</div>
        </div>
      </div>

      <div className="auth__poster">
        <AuthPoster />
      </div>
    </div>
  )
}
