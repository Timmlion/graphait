import { NavLink } from 'react-router-dom'
import { useAuth, useTheme } from '../context/AuthContext'
import Icon from './Icon'

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

function SideNavLink({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `navlink${isActive ? ' navlink--active' : ''}`}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {badge != null && <span className="navlink__badge mono">{badge}</span>}
    </NavLink>
  )
}

export function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()

  const initial = (user?.email || 'U').slice(0, 1).toUpperCase()

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <div className="brand">
          <BrandMark size={22} />
          <div>
            <div className="brand__name">graphait</div>
            <div className="brand__org mono">{(user as any)?.org_slug || 'workspace'}.graphait</div>
          </div>
        </div>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__label eyebrow">Workspace</div>
        <nav className="sidebar__nav">
          <SideNavLink to="/board"  icon="board"  label="Board" />
          <SideNavLink to="/agents" icon="agents" label="Agents" />
          <SideNavLink to="/inbox"  icon="human"  label="Inbox" />
          <SideNavLink to="/skills"    icon="spark"     label="Skills" />
          <SideNavLink to="/activity"  icon="activity"  label="Activity" />
        </nav>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__label eyebrow">System</div>
        <nav className="sidebar__nav">
          <SideNavLink to="/settings" icon="settings" label="Settings" />
        </nav>
      </div>

      <div className="sidebar__spacer" />

      <div className="sidebar__bottom">
        <button className="theme-toggle" onClick={toggle} title="Toggle theme">
          <span className="theme-toggle__track">
            <span className="theme-toggle__thumb" data-side={theme} />
            <span className="theme-toggle__lbl theme-toggle__lbl--d mono">DRK</span>
            <span className="theme-toggle__lbl theme-toggle__lbl--l mono">LHT</span>
          </span>
        </button>

        <div className="userchip">
          <div className="avatar avatar--human avatar--sm" style={{ background: '#a78bfa', color: '#0a0a0b', borderColor: 'transparent' }}>
            {initial}
          </div>
          <div className="userchip__meta">
            <div className="userchip__email">{user?.email}</div>
            <div className="userchip__role mono">{user?.role}</div>
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={logout} title="Log out">
            <Icon name="logout" size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
