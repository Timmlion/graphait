import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, ThemeProvider, useAuth } from './context/AuthContext'
import { Sidebar } from './components/Layout'
import LoginPage from './pages/LoginPage'
import BoardPage from './pages/BoardPage'
import GraphPage from './pages/GraphPage'
import SettingsPage from './pages/SettingsPage'
import InboxPage from './pages/InboxPage'
import SkillsPage from './pages/SkillsPage'
import { useEffect } from 'react'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!loading && !token) navigate('/login', { replace: true })
  }, [token, loading, navigate])
  if (loading) return null
  if (!token) return null
  return <>{children}</>
}

function Shell({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <div className="app app--auth">{children}</div>
  return (
    <div className="app app--shell">
      <Sidebar />
      <main className="app__main">{children}</main>
    </div>
  )
}

function AppRoutes() {
  const { token } = useAuth()
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/board" replace /> : <LoginPage />} />
        <Route path="/board"    element={<RequireAuth><BoardPage /></RequireAuth>} />
        <Route path="/agents"   element={<RequireAuth><GraphPage /></RequireAuth>} />
        <Route path="/inbox"    element={<RequireAuth><InboxPage /></RequireAuth>} />
        <Route path="/skills"   element={<RequireAuth><SkillsPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to={token ? '/board' : '/login'} replace />} />
      </Routes>
    </Shell>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
