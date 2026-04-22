import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import BoardPage from './pages/BoardPage'
import GraphPage from './pages/GraphPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center text-on-surface-variant text-body-sm">Loading…</div>
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/board" element={<RequireAuth><BoardPage /></RequireAuth>} />
          <Route path="/agents" element={<RequireAuth><GraphPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/board" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
