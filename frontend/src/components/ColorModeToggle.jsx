import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useColorMode } from '../context/ColorModeContext'

/**
 * Light/dark toggle. `variant="sidebar"` matches nav item styling;
 * `variant="floating"` is for login/signup chrome.
 */
export default function ColorModeToggle({ variant = 'sidebar', onNavigate }) {
  const { colorMode, toggleColorMode } = useColorMode()
  const isDark = colorMode === 'dark'
  const label = isDark ? 'Light mode' : 'Dark mode'

  if (variant === 'floating') {
    return (
      <button
        type="button"
        className="color-mode-toggle color-mode-toggle--floating"
        onClick={toggleColorMode}
        aria-label={label}
        title={label}
      >
        {isDark ? <SunOutlined /> : <MoonOutlined />}
      </button>
    )
  }

  return (
    <button
      type="button"
      className="docflow-nav-item"
      onClick={() => {
        onNavigate?.()
        toggleColorMode()
      }}
      aria-label={label}
      title={label}
      style={{ width: '100%' }}
    >
      {isDark ? <SunOutlined className="nav-icon" /> : <MoonOutlined className="nav-icon" />}
      <span style={{ fontSize: 13 }}>{label}</span>
    </button>
  )
}
