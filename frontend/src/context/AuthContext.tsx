import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { authApi, type User } from '../api/auth'

interface AuthContextType {
  token: string | null
  user: User | null
  login: (token: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

const DEV_TOKEN = (import.meta.env.VITE_DEV_TOKEN as string | undefined) || null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('graphait_token') || DEV_TOKEN)
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('graphait_user') || 'null') } catch { return null }
  })
  const [loading, setLoading] = useState(!!(localStorage.getItem('graphait_token') || DEV_TOKEN) && !localStorage.getItem('graphait_user'))

  useEffect(() => {
    if (!token) { setLoading(false); return }
    if (user) { setLoading(false); return }
    authApi.me()
      .then(u => {
        setUser(u)
        localStorage.setItem('graphait_user', JSON.stringify(u))
      })
      .catch(() => { setToken(null); localStorage.removeItem('graphait_token') })
      .finally(() => setLoading(false))
  }, [token])

  const login = useCallback(async (newToken: string) => {
    localStorage.setItem('graphait_token', newToken)
    setToken(newToken)
    const u = await authApi.me()
    setUser(u)
    localStorage.setItem('graphait_user', JSON.stringify(u))
    setLoading(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('graphait_token')
    localStorage.removeItem('graphait_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/* ─── Theme ─── */
interface ThemeContextType { theme: string; toggle: () => void }
const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('graphait_theme') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('graphait_theme', theme)
  }, [theme])
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() { return useContext(ThemeContext) }
