import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Dropdown } from 'antd'
import {
  DashboardOutlined,
  FileAddOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  FileTextOutlined,
  MenuOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { layout, breakpoints } from '../design/tokens'
import useBreakpoint from '../hooks/useBreakpoint'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { key: '/dashboard', icon: DashboardOutlined, label: 'Dashboard', mobileLabel: 'Home' },
  { key: '/create', icon: FileAddOutlined, label: 'Generate Document', mobileLabel: 'Generate' },
  { key: '/documents', icon: FileTextOutlined, label: 'Documents', mobileLabel: 'Docs' },
  { key: '/employers', icon: TeamOutlined, label: 'Employers', mobileLabel: 'Employers' },
]

const PAGE_META = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview' },
  '/create': { title: 'Generate', subtitle: 'New document' },
  '/documents': { title: 'Documents', subtitle: 'History' },
  '/employers': { title: 'Employers', subtitle: 'Master data' },
  '/admin': { title: 'Admin', subtitle: 'Settings' },
}

function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function SidebarContent({ collapsed, selectedKey, onNavigate, role, displayName, username, onLogout, onToggle }) {
  return (
    <>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 18px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            background: 'rgba(212,160,23,0.18)',
            border: '1px solid rgba(212,160,23,0.30)',
            borderRadius: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <FileTextOutlined style={{ fontSize: 17, color: '#D4A017' }} />
        </div>
        {!collapsed && (
          <div className="animate-slide-in-right min-w-0">
            <div style={{ fontSize: 17, fontWeight: 800, color: 'white', letterSpacing: '-0.3px', lineHeight: 1 }}>
              DocFlow
            </div>
            <div style={{ fontSize: 10, color: 'rgba(212,160,23,0.70)', marginTop: 3, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              Doc Automation
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div style={{ padding: '16px 18px 6px', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
            Navigation
          </span>
        </div>
      )}

      <nav
        style={{
          flex: 1,
          padding: collapsed ? '12px 8px' : '4px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {NAV_ITEMS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            className={`docflow-nav-item ${selectedKey === key ? 'active' : ''}`}
            onClick={() => onNavigate(key)}
            title={collapsed ? label : undefined}
            style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <Icon className="nav-icon" />
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>}
          </button>
        ))}

        {role === 'admin' && (
          <>
            {!collapsed && (
              <div style={{ padding: '12px 4px 4px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  Admin
                </span>
              </div>
            )}
            <button
              type="button"
              className={`docflow-nav-item ${selectedKey === '/admin' ? 'active' : ''}`}
              onClick={() => onNavigate('/admin')}
              title={collapsed ? 'Admin Panel' : undefined}
              style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              <SettingOutlined className="nav-icon" />
              {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>Admin Panel</span>}
            </button>
          </>
        )}
      </nav>

      <div
        style={{
          padding: collapsed ? '8px 8px 12px' : '8px 10px 12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          className="docflow-nav-item"
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <RightOutlined className="nav-icon" />
          ) : (
            <>
              <LeftOutlined className="nav-icon" />
              <span style={{ fontSize: 13 }}>Collapse</span>
            </>
          )}
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255,255,255,0.05)',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(212,160,23,0.35) 0%, rgba(139,26,26,0.50) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: 'white',
              flexShrink: 0,
              border: '1.5px solid rgba(212,160,23,0.25)',
            }}
          >
            {getInitials(displayName)}
          </div>
          {!collapsed && (
            <div className="min-w-0 animate-fade-in-up">
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {username !== displayName ? username : null}
                {username !== displayName && role ? ' · ' : ''}
                {role ? role.charAt(0).toUpperCase() + role.slice(1) : ''}
              </div>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            type="button"
            className="docflow-nav-item"
            onClick={onLogout}
            style={{ color: 'rgba(255,100,100,0.65)' }}
          >
            <LogoutOutlined className="nav-icon" />
            <span style={{ fontSize: 13 }}>Sign Out</span>
          </button>
        )}
      </div>
    </>
  )
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { isMobile, isTablet } = useBreakpoint()
  const role = user?.role
  const username = user?.username
  const displayName = user?.name || user?.username

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const w = window.innerWidth
    return w >= breakpoints.tablet && w < breakpoints.laptop
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  const isCreatePage = location.pathname.startsWith('/create')
  const isAdminPage = location.pathname.startsWith('/admin')

  const selectedKey = isCreatePage
    ? '/create'
    : location.pathname.startsWith('/documents')
      ? '/documents'
      : location.pathname.startsWith('/employers')
        ? '/employers'
        : isAdminPage
          ? '/admin'
          : '/dashboard'

  const pageMeta = PAGE_META[selectedKey] || PAGE_META['/dashboard']

  useEffect(() => {
    document.body.classList.toggle('mobile-app', isMobile)
    return () => document.body.classList.remove('mobile-app')
  }, [isMobile])

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      if (w >= breakpoints.tablet && w < breakpoints.laptop) {
        setCollapsed(true)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  const handleNavigate = (key) => {
    navigate(key)
    setMobileOpen(false)
  }

  const sidebarWidth = collapsed ? layout.sidebarCollapsed : layout.sidebarExpanded
  const showMobileBottomNav = isMobile && !isCreatePage

  const userMenuItems = {
    items: [
      {
        key: 'profile',
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{username}</div>
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'logout',
        label: 'Sign Out',
        icon: <LogoutOutlined />,
        danger: true,
        onClick: handleLogout,
      },
    ],
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--surface-2)' }}>
      {!isMobile && !isTablet && (
        <aside
          className="docflow-sidebar flex flex-col flex-shrink-0 sticky top-0 h-screen z-[100]"
          style={{ width: sidebarWidth }}
        >
          <SidebarContent
            collapsed={collapsed}
            selectedKey={selectedKey}
            onNavigate={handleNavigate}
            role={role}
            displayName={displayName}
            username={username}
            onLogout={handleLogout}
            onToggle={() => setCollapsed((c) => !c)}
          />
        </aside>
      )}

      {isTablet && mobileOpen && (
        <>
          <div
            className="docflow-drawer-overlay"
            onClick={() => setMobileOpen(false)}
            role="presentation"
          />
          <aside
            className="docflow-sidebar fixed top-0 left-0 h-full z-[1001] flex flex-col"
            style={{ width: layout.sidebarExpanded }}
          >
            <SidebarContent
              collapsed={false}
              selectedKey={selectedKey}
              onNavigate={handleNavigate}
              role={role}
              displayName={displayName}
              username={username}
              onLogout={handleLogout}
              onToggle={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {isMobile && (
          <header className="mobile-top-bar">
            <div className="mobile-top-bar__brand min-w-0">
              <FileTextOutlined style={{ color: '#D4A017', fontSize: 18, flexShrink: 0 }} />
              <div className="min-w-0">
                <h1 className="mobile-top-bar__title">{pageMeta.title}</h1>
                <p className="mobile-top-bar__subtitle">{pageMeta.subtitle}</p>
              </div>
            </div>
            <Dropdown menu={userMenuItems} trigger={['click']} placement="bottomRight">
              <button type="button" className="mobile-top-bar__avatar" aria-label="Account menu">
                {getInitials(displayName)}
              </button>
            </Dropdown>
          </header>
        )}

        {isTablet && (
          <header
            className="flex items-center gap-3 px-4 flex-shrink-0"
            style={{
              height: 56,
              background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 20,
                color: 'var(--primary)',
                padding: 8,
                minWidth: 44,
                minHeight: 44,
              }}
            >
              <MenuOutlined />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileTextOutlined style={{ color: '#D4A017', fontSize: 18 }} />
              <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 16 }}>DocFlow</span>
            </div>
          </header>
        )}

        <main
          className="flex-1 min-h-0"
          style={{
            padding: isMobile ? (isAdminPage ? 0 : 16) : 28,
            paddingBottom: showMobileBottomNav ? 88 : isMobile ? 16 : 28,
            overflow: isCreatePage || isAdminPage ? 'hidden' : 'auto',
            display: isCreatePage || isAdminPage ? 'flex' : 'block',
            flexDirection: 'column',
          }}
        >
          <div
            key={location.pathname}
            className={isCreatePage || isAdminPage ? 'route-enter-flex' : 'route-enter'}
            style={isCreatePage || isAdminPage ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : { minHeight: '100%' }}
          >
            <Outlet />
          </div>
        </main>
      </div>

      {showMobileBottomNav && (
        <nav className="mobile-bottom-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ key, icon: Icon, mobileLabel }) => (
            <button
              key={key}
              type="button"
              className={`mobile-bottom-nav-item ${selectedKey === key ? 'active' : ''}`}
              onClick={() => handleNavigate(key)}
            >
              <Icon style={{ fontSize: 22 }} />
              <span>{mobileLabel}</span>
            </button>
          ))}
          {role === 'admin' && (
            <button
              type="button"
              className={`mobile-bottom-nav-item ${selectedKey === '/admin' ? 'active' : ''}`}
              onClick={() => handleNavigate('/admin')}
            >
              <SettingOutlined style={{ fontSize: 22 }} />
              <span>Admin</span>
            </button>
          )}
        </nav>
      )}
    </div>
  )
}
