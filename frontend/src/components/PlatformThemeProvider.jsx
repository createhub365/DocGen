import { useEffect, useMemo } from 'react'
import { ConfigProvider } from 'antd'
import { usePlatformAuth } from '../context/PlatformAuthContext'
import {
  applyThemeCssVariables,
  buildAntTheme,
  getThemePrimary,
  setDocumentThemeColor,
} from '../design/themes'

/**
 * Applies the org's theme_key to CSS variables + nested Ant Design theme.
 * Staff inherit the org setting automatically (no picker).
 *
 * When logged out, intentionally applies classic (default) so login/signup
 * match the product visual language — org theme is unknown pre-auth.
 *
 * Also updates <meta name="theme-color"> for the session (browser chrome tint).
 * Does not rewrite manifest.webmanifest (static / shared across orgs).
 */
export default function PlatformThemeProvider({ children }) {
  const { currentOrg, authed } = usePlatformAuth()
  const themeKey = authed ? currentOrg?.theme_key ?? null : 'classic'

  const antTheme = useMemo(() => buildAntTheme(themeKey), [themeKey])

  useEffect(() => {
    applyThemeCssVariables(themeKey)
    setDocumentThemeColor(getThemePrimary(themeKey))
  }, [themeKey])

  return <ConfigProvider theme={antTheme}>{children}</ConfigProvider>
}
