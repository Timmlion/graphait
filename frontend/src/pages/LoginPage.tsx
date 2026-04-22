import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res =
        mode === 'login'
          ? await authApi.login(email, password)
          : await authApi.register(orgName, orgSlug, email, password)
      await login(res.access_token)
      navigate('/board')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background w-full min-h-screen flex items-center justify-center">
      <div className="w-[400px] bg-surface-container-lowest border border-surface-container-high rounded-lg p-lg shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex flex-col gap-lg">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 bg-primary text-on-primary flex items-center justify-center rounded-sm mb-md">
            <span className="material-symbols-outlined text-[18px]">hub</span>
          </div>
          <h1 className="font-h1 text-h1 text-on-background text-center">Graphait</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs text-center">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create a new workspace'}
          </p>
        </div>

        <form className="flex flex-col gap-md" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="flex flex-col gap-xs">
                <label htmlFor="org-name" className="font-label-mono text-label-mono text-on-surface-variant uppercase">Organization name</label>
                <input
                  id="org-name"
                  className="w-full h-[32px] px-sm font-body-main text-body-main text-on-background placeholder:text-outline-variant border border-outline-variant rounded outline-none focus:border-primary-container bg-transparent transition-colors"
                  placeholder="Acme Corp"
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label htmlFor="org-slug" className="font-label-mono text-label-mono text-on-surface-variant uppercase">Org slug</label>
                <input
                  id="org-slug"
                  className="w-full h-[32px] px-sm font-body-main text-body-main text-on-background placeholder:text-outline-variant border border-outline-variant rounded outline-none focus:border-primary-container bg-transparent transition-colors"
                  placeholder="acme-corp"
                  type="text"
                  value={orgSlug}
                  onChange={e => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  required
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-xs">
            <label htmlFor="email" className="font-label-mono text-label-mono text-on-surface-variant uppercase">Email</label>
            <input
              id="email"
              className="w-full h-[32px] px-sm font-body-main text-body-main text-on-background placeholder:text-outline-variant border border-outline-variant rounded outline-none focus:border-primary-container bg-transparent transition-colors"
              placeholder="name@company.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-xs">
            <label htmlFor="password" className="font-label-mono text-label-mono text-on-surface-variant uppercase">Password</label>
            <input
              id="password"
              className="w-full h-[32px] px-sm font-body-main text-body-main text-on-background placeholder:text-outline-variant border border-outline-variant rounded outline-none focus:border-primary-container bg-transparent transition-colors"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="font-body-sm text-body-sm text-error" data-testid="auth-error">{error}</p>
          )}

          <button
            className="w-full h-[28px] mt-sm bg-primary-container text-on-primary-container font-body-main text-body-main rounded flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Workspace'}
          </button>
        </form>

        <div className="text-center font-body-sm text-body-sm text-on-surface-variant pt-md border-t border-surface-container-high">
          {mode === 'login' ? (
            <>No account? <button className="text-primary hover:underline" onClick={() => setMode('register')}>Create workspace</button></>
          ) : (
            <>Already have one? <button className="text-primary hover:underline" onClick={() => setMode('login')}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  )
}
