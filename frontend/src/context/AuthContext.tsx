import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi, type User } from '../api/auth'

interface AuthContextType {
  token: string | null
  user: User | null
  login: (token: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('graphait_token'))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('graphait_token'))

  useEffect(() => {
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(setUser)
      .catch(() => { setToken(null); localStorage.removeItem('graphait_token') })
      .finally(() => setLoading(false))
  }, [token])

  const login = async (newToken: string) => {
    localStorage.setItem('graphait_token', newToken)
    setToken(newToken)
    const u = await authApi.me()
    setUser(u)
    setLoading(false)
  }

  const logout = () => {
    localStorage.removeItem('graphait_token')
    setToken(null)
    setUser(null)
  }

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
