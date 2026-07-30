import { useEffect, useMemo } from 'react'
import { ConfigProvider } from 'antd'
import { usePlatformAuth } from '../context/PlatformAuthContext'
import {
  applyThemeCssVariables,
  buildAntTheme,
  clearThemeCssVariables,
} from '../design/themes'

/**
 * Applies the org's theme_key to CSS variables + nested Ant Design theme.
 * Staff inherit the org setting automatically (no picker).
 */
export default function PlatformThemeProvider({ children }) {
  const { currentOrg, authed } = usePlatformAuth()
  const themeKey = authed ? currentOrg?.theme_key ?? null : null

  const antTheme = useMemo(() => buildAntTheme(themeKey), [themeKey])

  useEffect(() => {
    if (!authed) {
      clearThemeCssVariables()
      return undefined
    }
    applyThemeCssVariables(themeKey)
    return () => {
      clearThemeCssVariables()
    }
  }, [authed, themeKey])

  if (!authed) return children

  return <ConfigProvider theme={antTheme}>{children}</ConfigProvider>
}
