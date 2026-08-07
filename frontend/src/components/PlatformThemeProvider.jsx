import { useEffect, useMemo } from 'react'
import { ConfigProvider } from 'antd'
import { useColorMode } from '../context/ColorModeContext'
import { usePlatformAuth } from '../context/PlatformAuthContext'
import {
  DEFAULT_THEME_KEY,
  applyThemeCssVariables,
  buildAntTheme,
  getThemePrimary,
  setDocumentThemeColor,
} from '../design/themes'

/**
 * Applies the org's theme_key to CSS variables + nested Ant Design theme.
 * Staff inherit the org setting automatically (no picker).
 *
 * When logged out, applies Ledger Mist (platform default) so login/signup
 * match the product visual language — org theme is unknown pre-auth.
 *
 * Light/dark comes from ColorModeProvider (per-user, localStorage).
 *
 * Also updates <meta name="theme-color"> for the session (browser chrome tint).
 * Does not rewrite manifest.webmanifest (static / shared across orgs).
 */
export default function PlatformThemeProvider({ children }) {
  const { currentOrg, authed } = usePlatformAuth()
  const { colorMode } = useColorMode()
  const themeKey = authed ? currentOrg?.theme_key ?? null : DEFAULT_THEME_KEY

  const antTheme = useMemo(
    () => buildAntTheme(themeKey, colorMode),
    [themeKey, colorMode]
  )

  useEffect(() => {
    applyThemeCssVariables(themeKey, colorMode)
    setDocumentThemeColor(getThemePrimary(themeKey, colorMode))
  }, [themeKey, colorMode])

  return <ConfigProvider theme={antTheme}>{children}</ConfigProvider>
}
