import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>
}

function NavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive
          ? 'flex items-center gap-3 px-3 py-2 bg-surface-container-lowest border-l-4 border-primary text-primary font-body-sm text-body-sm font-medium'
          : 'flex items-center gap-3 px-3 py-2 text-on-surface-variant ml-1 hover:bg-surface-container transition-all cursor-pointer duration-150 font-body-sm text-body-sm'
      }
    >
      <Icon name={icon} size={16} />
      {label}
    </NavLink>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()

  const initials = user?.email.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 bg-surface-container-lowest h-12 border-b border-surface-variant">
        <div className="flex items-center gap-md">
          <span className="text-lg font-bold tracking-tight text-primary font-h1">Graphait</span>
        </div>
        <div className="flex items-center gap-sm text-on-surface-variant">
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container transition-colors">
            <Icon name="notifications" size={18} />
          </button>
          <button
            onClick={logout}
            title="Log out"
            className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label-mono text-label-mono ml-sm hover:opacity-80 transition-opacity cursor-pointer"
          >
            {initials}
          </button>
        </div>
      </header>

      <div className="flex pt-12 h-screen w-full">
        {/* Sidebar */}
        <nav className="fixed top-12 left-0 h-[calc(100vh-48px)] flex flex-col pt-4 pb-4 bg-surface w-[240px] border-r border-surface-variant">
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <ul className="space-y-1">
              <li><NavItem to="/board" icon="view_kanban" label="Board" /></li>
              <li><NavItem to="/agents" icon="smart_toy" label="Agents" /></li>
            </ul>
          </div>
          <div className="mt-auto pt-4 border-t border-surface-variant px-0">
            <ul className="space-y-1">
              <li>
                <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant ml-1 hover:bg-surface-container transition-all cursor-pointer duration-150 font-body-sm text-body-sm" href="#">
                  <Icon name="help" size={16} /> Help
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {/* Main content slot */}
        <main className="ml-[240px] flex-1 flex h-full overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
