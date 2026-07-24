import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AuditOutlined,
  DashboardOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  LogoutOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { usePlatformAuth } from '../context/PlatformAuthContext'
import FullPageSpinner from './ui/FullPageSpinner'

const NAV_ITEMS = [
  { key: '/platform', icon: DashboardOutlined, label: 'Dashboard', exact: true },
  { key: '/platform/document-types', icon: FileTextOutlined, label: 'Document Types' },
  { key: '/platform/generated', icon: FileDoneOutlined, label: 'Generated' },
  { key: '/platform/users', icon: TeamOutlined, label: 'Users' },
  { key: '/platform/audit-log', icon: AuditOutlined, label: 'Audit Log' },
]

function isSelected(pathname, item) {
  if (item.exact) return pathname === item.key || pathname === '/platform/dashboard'
  return pathname === item.key || pathname.startsWith(`${item.key}/`)
}

export function ProtectedPlatformRoute({ children }) {
  const { authed, isLoading } = usePlatformAuth()
  if (isLoading) return <FullPageSpinner tip="Loading platform..." />
  if (!authed) return <Navigate to="/platform/login" replace />
  return children
}

export default function PlatformLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentOrg, currentUser, role, logout } = usePlatformAuth()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface2, #FDF7F7)' }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          background: 'linear-gradient(180deg, #6B0F0F 0%, #2D0505 100%)',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 18px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
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
            }}
          >
            <FileTextOutlined style={{ fontSize: 17, color: '#D4A017' }} />
          </div>
          <div className="min-w-0">
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              DocFlow
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(212,160,23,0.70)',
                marginTop: 3,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Platform
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 18px 8px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Organization
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
            {currentOrg?.name || '—'}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(({ key, icon: Icon, label, exact }) => {
            const active = isSelected(location.pathname, { key, exact })
            return (
              <button
                key={key}
                type="button"
                className={`docflow-nav-item ${active ? 'active' : ''}`}
                onClick={() => navigate(key)}
              >
                <Icon className="nav-icon" />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
              </button>
            )
          })}
        </nav>

        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ padding: '0 8px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser?.username || '—'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {role ? String(role).replace('_', ' ') : ''}
            </div>
          </div>
          <button
            type="button"
            className="docflow-nav-item"
            onClick={() => logout()}
            style={{ color: 'rgba(255,100,100,0.75)', width: '100%' }}
          >
            <LogoutOutlined className="nav-icon" />
            <span style={{ fontSize: 13 }}>Sign Out</span>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 28 }}>
        <Outlet />
      </main>
    </div>
  )
}
