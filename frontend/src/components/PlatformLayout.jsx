import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AuditOutlined,
  DashboardOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Button, Drawer } from 'antd'
import { usePlatformAuth } from '../context/PlatformAuthContext'
import { useBreakpoint } from '../hooks/useBreakpoint'
import FullPageSpinner from './ui/FullPageSpinner'

const NAV_ITEMS = [
  { key: '/platform', icon: DashboardOutlined, label: 'Dashboard', exact: true },
  { key: '/platform/document-types', icon: FileTextOutlined, label: 'Document Types' },
  { key: '/platform/option-lists', icon: UnorderedListOutlined, label: 'Option Lists' },
  { key: '/platform/generated', icon: FileDoneOutlined, label: 'Generated' },
  { key: '/platform/users', icon: TeamOutlined, label: 'Users' },
  { key: '/platform/audit-log', icon: AuditOutlined, label: 'Audit Log' },
  {
    key: '/platform/settings',
    icon: SettingOutlined,
    label: 'Settings',
    adminOnly: true,
  },
]

const RIGHT_RAIL_WIDTH = 52
const SIDEBAR_WIDTH = 240

const PlatformPageChromeContext = createContext(null)

/**
 * Register fixed header/footer chrome with PlatformLayout.
 * Omitting or passing null for header/footer collapses that strip (no dead space).
 * Clears automatically on unmount / route change.
 */
export function usePlatformPageChrome({ header = null, footer = null } = {}) {
  const ctx = useContext(PlatformPageChromeContext)
  if (!ctx) {
    throw new Error('usePlatformPageChrome must be used within PlatformLayout')
  }
  const { setChrome } = ctx

  useEffect(() => {
    setChrome({ header, footer })
    return () => setChrome({ header: null, footer: null })
  }, [header, footer, setChrome])
}

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

function SidebarBrand() {
  return (
    <div
      style={{
        height: 64,
        flexShrink: 0,
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
          flexShrink: 0,
        }}
      >
        <FileTextOutlined style={{ fontSize: 17, color: '#D4A017' }} />
      </div>
      <div className="min-w-0">
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: '-0.3px',
            lineHeight: 1.1,
          }}
        >
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
  )
}

function SidebarNavBody({ onNavigate }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentOrg, currentUser, role, isOrgAdmin, logout } = usePlatformAuth()

  const go = (key) => {
    navigate(key)
    onNavigate?.()
  }

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.adminOnly || isOrgAdmin
  )

  return (
    <>
      <div style={{ padding: '16px 18px 8px', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.28)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Organization
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.92)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {currentOrg?.name || '—'}
        </div>
      </div>

      <nav
        style={{
          flex: 1,
          minHeight: 0,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
        }}
      >
        {visibleNav.map(({ key, icon: Icon, label, exact }) => {
          const active = isSelected(location.pathname, { key, exact })
          return (
            <button
              key={key}
              type="button"
              className={`docflow-nav-item ${active ? 'active' : ''}`}
              onClick={() => go(key)}
            >
              <Icon className="nav-icon" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
            </button>
          )
        })}
      </nav>

      <div
        style={{
          padding: 12,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '0 8px 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {currentUser?.username || '—'}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
              marginTop: 2,
            }}
          >
            {role ? String(role).replace('_', ' ') : ''}
          </div>
        </div>
        <button
          type="button"
          className="docflow-nav-item"
          onClick={() => {
            onNavigate?.()
            logout()
          }}
          style={{ color: 'rgba(255,100,100,0.75)', width: '100%' }}
        >
          <LogoutOutlined className="nav-icon" />
          <span style={{ fontSize: 13 }}>Sign Out</span>
        </button>
      </div>
    </>
  )
}

export default function PlatformLayout() {
  const { isMobile } = useBreakpoint()
  const [chrome, setChromeState] = useState({ header: null, footer: null })
  const [drawerOpen, setDrawerOpen] = useState(false)

  const setChrome = useCallback((next) => {
    setChromeState({
      header: next?.header ?? null,
      footer: next?.footer ?? null,
    })
  }, [])

  const chromeApi = useMemo(() => ({ setChrome }), [setChrome])

  // Close drawer on route change / when leaving mobile
  const location = useLocation()
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false)
  }, [isMobile])

  const showHeader = chrome.header != null
  const showFooter = chrome.footer != null
  const edgePad = isMobile ? 16 : 28
  const railPad = isMobile ? 0 : RIGHT_RAIL_WIDTH

  const sidebarInner = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #6B0F0F 0%, #2D0505 100%)',
        color: 'white',
      }}
    >
      <SidebarBrand />
      <SidebarNavBody onNavigate={() => setDrawerOpen(false)} />
    </div>
  )

  return (
    <PlatformPageChromeContext.Provider value={chromeApi}>
      <div
        className="platform-shell"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          background: 'var(--surface2, #FDF7F7)',
        }}
      >
        {isMobile && (
          <div
            className="platform-mobile-bar"
            style={{
              flexShrink: 0,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 12px',
              background: 'linear-gradient(90deg, #6B0F0F 0%, #2D0505 100%)',
              color: 'white',
              zIndex: 20,
            }}
          >
            <Button
              type="text"
              aria-label="Open navigation menu"
              icon={<MenuOutlined style={{ fontSize: 20, color: '#D4A017' }} />}
              onClick={() => setDrawerOpen(true)}
              className="platform-touch-target"
              style={{
                width: 44,
                height: 44,
                color: '#D4A017',
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: '-0.3px',
                  lineHeight: 1.1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                DocFlow
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(212,160,23,0.70)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Platform
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {!isMobile && (
            <aside
              style={{
                width: SIDEBAR_WIDTH,
                flexShrink: 0,
                height: '100%',
                overflow: 'hidden',
              }}
            >
              {sidebarInner}
            </aside>
          )}

          <Drawer
            placement="left"
            open={isMobile && drawerOpen}
            onClose={() => setDrawerOpen(false)}
            width={Math.min(SIDEBAR_WIDTH, typeof window !== 'undefined' ? window.innerWidth - 48 : SIDEBAR_WIDTH)}
            styles={{
              body: { padding: 0, background: 'transparent' },
              header: { display: 'none' },
              wrapper: { background: 'transparent' },
            }}
            destroyOnClose={false}
          >
            {sidebarInner}
          </Drawer>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {showHeader && (
              <header
                className="platform-shell-header"
                style={{
                  flexShrink: 0,
                  minHeight: isMobile ? 56 : 72,
                  padding: `${isMobile ? 10 : 14}px ${edgePad}px`,
                  paddingRight: edgePad + railPad,
                  borderBottom: '1px solid #f0e4e4',
                  background: 'rgba(253, 247, 247, 0.98)',
                  boxShadow: '0 1px 0 rgba(107, 15, 15, 0.04)',
                  zIndex: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 4,
                  overflow: 'hidden',
                }}
              >
                {chrome.header}
              </header>
            )}

            <div
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              <main
                className="platform-shell-main"
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  padding: edgePad,
                }}
              >
                <Outlet />
              </main>

              {!isMobile && (
                <aside
                  aria-hidden="true"
                  style={{
                    width: RIGHT_RAIL_WIDTH,
                    flexShrink: 0,
                    height: '100%',
                    borderLeft: '1px solid #f0e4e4',
                    background: 'rgba(253, 247, 247, 0.7)',
                  }}
                />
              )}
            </div>

            {showFooter && (
              <footer
                className="platform-shell-footer"
                style={{
                  flexShrink: 0,
                  padding: `${isMobile ? 12 : 14}px ${edgePad}px`,
                  paddingRight: edgePad + railPad,
                  paddingBottom: `max(${isMobile ? 12 : 14}px, env(safe-area-inset-bottom))`,
                  borderTop: '1px solid #f0e4e4',
                  background: 'rgba(253, 247, 247, 0.98)',
                  boxShadow: '0 -1px 0 rgba(107, 15, 15, 0.04)',
                  zIndex: 2,
                  display: 'flex',
                  justifyContent: isMobile ? 'stretch' : 'flex-end',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  className="platform-footer-actions"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    width: isMobile ? '100%' : 'auto',
                    justifyContent: isMobile ? 'stretch' : 'flex-end',
                  }}
                >
                  {chrome.footer}
                </div>
              </footer>
            )}
          </div>
        </div>
      </div>
    </PlatformPageChromeContext.Provider>
  )
}
