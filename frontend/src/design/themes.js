/**
 * Org-level UI theme presets + per-user light/dark color mode.
 *
 * Color keys match design/tokens.js `colors` (camelCase). Applying a theme
 * writes the same CSS custom properties already used in global.css
 * (--primary, --sidebar-from, …) plus Ant Design token overrides.
 *
 * theme_key null / unset → Ledger Mist (platform default).
 * Explicit preset keys (classic, navy, …) are unchanged for orgs that selected them.
 *
 * Light/dark is a separate dimension (see ColorModeContext) — each preset
 * keeps its primary/accent hue in dark mode; surfaces/text/borders invert.
 */

import { theme as antdTheme } from 'antd'
import {
  antTheme as baseAntTheme,
  colors as classicColors,
  radius,
  shadows as classicShadows,
  spacing,
  typography,
} from './tokens'

/** Fallback when org theme_key is null/blank/unknown. */
export const DEFAULT_THEME_KEY = 'ledger-mist'

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function shadowsForPrimary(primaryHex, accentHex) {
  const p = hexToRgb(primaryHex)
  const a = hexToRgb(accentHex)
  return {
    sm: `0 1px 3px rgba(${p.r},${p.g},${p.b},0.08), 0 1px 2px rgba(0,0,0,0.06)`,
    md: `0 4px 12px rgba(${p.r},${p.g},${p.b},0.10), 0 2px 4px rgba(0,0,0,0.06)`,
    lg: `0 10px 30px rgba(${p.r},${p.g},${p.b},0.12), 0 4px 8px rgba(0,0,0,0.08)`,
    xl: `0 20px 60px rgba(${p.r},${p.g},${p.b},0.15), 0 8px 20px rgba(0,0,0,0.10)`,
    glow: `0 0 20px rgba(${a.r},${a.g},${a.b},0.25)`,
    maroon: `0 0 20px rgba(${p.r},${p.g},${p.b},0.30)`,
  }
}

/** Extra CSS-only keys used by global.css but not in tokens.colors */
function withCssExtras(colors, extras) {
  return {
    ...colors,
    sidebarMid: extras.sidebarMid,
    borderLight: extras.borderLight,
  }
}

/**
 * Dark variant: keep primary/accent/(status) hues; invert canvas + ink.
 * Optional overrides tune undertone per preset (warm classic, cool navy, …).
 */
function makeDarkColors(light, overrides = {}) {
  const {
    sidebarMid: sidebarMidOverride,
    borderLight: borderLightOverride,
    ...colorOverrides
  } = overrides
  const merged = {
    ...light,
    surface: '#0F172A',
    surface2: '#111827',
    surface3: '#1E293B',
    border: '#334155',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    previewBg: '#020617',
    ...colorOverrides,
  }
  return withCssExtras(merged, {
    sidebarMid: sidebarMidOverride || light.sidebarMid || '#0B1220',
    borderLight: borderLightOverride || '#1F2937',
  })
}

const classic = withCssExtras(
  { ...classicColors },
  { sidebarMid: '#4A0A0A', borderLight: '#F0E5E5' }
)

const classicDark = makeDarkColors(classic, {
  surface: '#140808',
  surface2: '#1A0A0A',
  surface3: '#2A1010',
  border: '#5C2A2A',
  textPrimary: '#FDF8F8',
  textSecondary: '#E8D0D0',
  textMuted: '#B89898',
  previewBg: '#0A0404',
  sidebarMid: '#3A0808',
  borderLight: '#241010',
})

const navyColors = withCssExtras(
  {
    primary: '#1E3A5F',
    primaryLight: '#2E5A8F',
    primaryDark: '#0F1F35',
    accent: '#C4A35A',
    accentLight: '#E0C878',
    surface: '#FFFFFF',
    surface2: '#F4F7FB',
    surface3: '#E8EEF5',
    border: '#D0DBE8',
    textPrimary: '#0B1524',
    textSecondary: '#3D5169',
    textMuted: '#7A8FA8',
    success: '#0D7C4A',
    warning: '#D97706',
    error: '#C0392B',
    maroon: '#1E3A5F',
    maroonLight: '#2E5A8F',
    maroonDark: '#0F1F35',
    purple: '#2A3A5C',
    green: '#1B4332',
    sidebarFrom: '#152A45',
    sidebarTo: '#0A1524',
    previewBg: '#0C1829',
  },
  { sidebarMid: '#102038', borderLight: '#E6EDF5' }
)

const navyDark = makeDarkColors(navyColors, {
  surface: '#0A1220',
  surface2: '#0F1A2C',
  surface3: '#162438',
  border: '#2A3F5C',
  primaryLight: '#4A7AB5',
  sidebarMid: '#0C1829',
  borderLight: '#121C2C',
})

const forestColors = withCssExtras(
  {
    primary: '#1B4332',
    primaryLight: '#2D6A4F',
    primaryDark: '#081C15',
    accent: '#D4A373',
    accentLight: '#E8C4A0',
    surface: '#FFFFFF',
    surface2: '#F5F8F6',
    surface3: '#E8F0EB',
    border: '#C9D9CF',
    textPrimary: '#0A1610',
    textSecondary: '#3A5346',
    textMuted: '#7A9486',
    success: '#0D7C4A',
    warning: '#D97706',
    error: '#C0392B',
    maroon: '#1B4332',
    maroonLight: '#2D6A4F',
    maroonDark: '#081C15',
    purple: '#2C3E50',
    green: '#1B4332',
    sidebarFrom: '#143528',
    sidebarTo: '#071510',
    previewBg: '#0A1A12',
  },
  { sidebarMid: '#0E241A', borderLight: '#E6F0EA' }
)

const forestDark = makeDarkColors(forestColors, {
  surface: '#071510',
  surface2: '#0A1A12',
  surface3: '#143528',
  border: '#2A4A3A',
  primaryLight: '#40916C',
  sidebarMid: '#0A1A12',
  borderLight: '#0C1C14',
})

const slateColors = withCssExtras(
  {
    primary: '#334155',
    primaryLight: '#475569',
    primaryDark: '#1E293B',
    accent: '#94A3B8',
    accentLight: '#CBD5E1',
    surface: '#FFFFFF',
    surface2: '#F8FAFC',
    surface3: '#F1F5F9',
    border: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    success: '#0D7C4A',
    warning: '#D97706',
    error: '#C0392B',
    maroon: '#334155',
    maroonLight: '#475569',
    maroonDark: '#1E293B',
    purple: '#3F3F46',
    green: '#1B4332',
    sidebarFrom: '#1E293B',
    sidebarTo: '#0F172A',
    previewBg: '#111827',
  },
  { sidebarMid: '#162032', borderLight: '#EEF2F6' }
)

const slateDark = makeDarkColors(slateColors, {
  surface: '#0B1220',
  surface2: '#0F172A',
  surface3: '#1E293B',
  border: '#334155',
  primaryLight: '#64748B',
  accent: '#CBD5E1',
  sidebarMid: '#111827',
  borderLight: '#111827',
})

const terracottaColors = withCssExtras(
  {
    primary: '#9A3412',
    primaryLight: '#C2410C',
    primaryDark: '#7C2D12',
    accent: '#D97706',
    accentLight: '#F59E0B',
    surface: '#FFFFFF',
    surface2: '#FFF7F3',
    surface3: '#FFEDE5',
    border: '#F0D5C8',
    textPrimary: '#1C0A04',
    textSecondary: '#6B3F2E',
    textMuted: '#A87864',
    success: '#0D7C4A',
    warning: '#D97706',
    error: '#C0392B',
    maroon: '#9A3412',
    maroonLight: '#C2410C',
    maroonDark: '#7C2D12',
    purple: '#7C2D12',
    green: '#1B4332',
    sidebarFrom: '#7C2D12',
    sidebarTo: '#431407',
    previewBg: '#2A1008',
  },
  { sidebarMid: '#5C220E', borderLight: '#F8EBE4' }
)

const terracottaDark = makeDarkColors(terracottaColors, {
  surface: '#1A0C06',
  surface2: '#221008',
  surface3: '#3A1A0C',
  border: '#6B3A22',
  textPrimary: '#FFF7F3',
  textSecondary: '#F0D5C8',
  textMuted: '#C4A090',
  primaryLight: '#EA580C',
  sidebarMid: '#2A1008',
  borderLight: '#1A0C06',
})

/** Ledger Mist — docs/design/STITCH_DESIGN.md (authoritative brand palette). */
const ledgerMistColors = withCssExtras(
  {
    primary: '#0F766E',
    primaryLight: '#14B8A6',
    primaryDark: '#005C55',
    accent: '#C2410C',
    accentLight: '#EA580C',
    surface: '#FFFFFF',
    surface2: '#F8FAFC',
    surface3: '#F1F5F9',
    border: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#1E293B',
    textMuted: '#64748B',
    success: '#0D7C4A',
    warning: '#D97706',
    error: '#BA1A1A',
    maroon: '#0F766E',
    maroonLight: '#14B8A6',
    maroonDark: '#005C55',
    purple: '#1E293B',
    green: '#0F766E',
    sidebarFrom: '#1E293B',
    sidebarTo: '#0F172A',
    previewBg: '#0F172A',
  },
  { sidebarMid: '#162032', borderLight: '#EEF2F6' }
)

const ledgerMistDark = makeDarkColors(ledgerMistColors, {
  surface: '#0B1220',
  surface2: '#0F172A',
  surface3: '#1E293B',
  border: '#334155',
  primaryLight: '#2DD4BF',
  sidebarMid: '#111827',
  borderLight: '#111827',
})

const ledgerMistTypography = {
  fontDisplay: "'Manrope', system-ui, sans-serif",
  fontBody: "'IBM Plex Sans', system-ui, sans-serif",
  fontMono: typography.fontMono,
}

/** 8px base radius for Ledger Mist (Stitch design system). */
const ledgerMistRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
}

/**
 * @typedef {{
 *   key: string,
 *   name: string,
 *   description: string,
 *   swatch: string[],
 *   colors: Record<string, string>,
 *   darkColors: Record<string, string>,
 *   typography?: { fontDisplay: string, fontBody: string, fontMono: string },
 *   radius?: Record<string, number>,
 * }} ThemePreset
 */

/** @type {ThemePreset[]} */
export const THEME_PRESETS = [
  {
    key: 'ledger-mist',
    name: 'Ledger Mist',
    description: 'Default — teal and slate',
    swatch: [
      ledgerMistColors.primary,
      ledgerMistColors.accent,
      ledgerMistColors.sidebarFrom,
      ledgerMistColors.surface2,
    ],
    colors: ledgerMistColors,
    darkColors: ledgerMistDark,
    typography: ledgerMistTypography,
    radius: ledgerMistRadius,
  },
  {
    key: 'classic',
    name: 'Classic Maroon',
    description: 'Maroon and gold',
    swatch: [classic.primary, classic.accent, classic.sidebarFrom, classic.surface2],
    colors: classic,
    darkColors: classicDark,
  },
  {
    key: 'navy',
    name: 'Deep Navy',
    description: 'Navy blue with soft gold',
    swatch: [navyColors.primary, navyColors.accent, navyColors.sidebarFrom, navyColors.surface2],
    colors: navyColors,
    darkColors: navyDark,
  },
  {
    key: 'forest',
    name: 'Forest',
    description: 'Deep green with warm bronze',
    swatch: [
      forestColors.primary,
      forestColors.accent,
      forestColors.sidebarFrom,
      forestColors.surface2,
    ],
    colors: forestColors,
    darkColors: forestDark,
  },
  {
    key: 'slate',
    name: 'Slate',
    description: 'Neutral charcoal and silver',
    swatch: [slateColors.primary, slateColors.accent, slateColors.sidebarFrom, slateColors.surface2],
    colors: slateColors,
    darkColors: slateDark,
  },
  {
    key: 'terracotta',
    name: 'Terracotta',
    description: 'Warm clay with amber accent',
    swatch: [
      terracottaColors.primary,
      terracottaColors.accent,
      terracottaColors.sidebarFrom,
      terracottaColors.surface2,
    ],
    colors: terracottaColors,
    darkColors: terracottaDark,
  },
]

const PRESET_BY_KEY = Object.fromEntries(THEME_PRESETS.map((p) => [p.key, p]))

/** Resolve org theme_key (null → Ledger Mist default). */
export function resolveThemeKey(themeKey) {
  if (themeKey == null || String(themeKey).trim() === '') return DEFAULT_THEME_KEY
  const key = String(themeKey).trim().toLowerCase()
  return PRESET_BY_KEY[key] ? key : DEFAULT_THEME_KEY
}

export function getThemePreset(themeKey) {
  return PRESET_BY_KEY[resolveThemeKey(themeKey)]
}

/** @param {'light' | 'dark'} [colorMode] */
export function getThemeColors(themeKey, colorMode = 'light') {
  const preset = getThemePreset(themeKey)
  if (colorMode === 'dark') return preset.darkColors || preset.colors
  return preset.colors
}

function camelToCssVar(key) {
  return `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
}

/**
 * Apply theme CSS variables to document root (same names as injectCssVariables / :root).
 * @param {string | null | undefined} themeKey
 * @param {'light' | 'dark'} [colorMode]
 */
export function applyThemeCssVariables(themeKey, colorMode = 'light') {
  const preset = getThemePreset(themeKey)
  const root = document.documentElement
  const colors = getThemeColors(themeKey, colorMode)
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(camelToCssVar(key), value)
  })
  if (colors.sidebarMid) root.style.setProperty('--sidebar-mid', colors.sidebarMid)
  if (colors.borderLight) root.style.setProperty('--border-light', colors.borderLight)

  const shadows = shadowsForPrimary(colors.primary, colors.accent)
  Object.entries(shadows).forEach(([key, value]) => {
    root.style.setProperty(`--shadow-${key}`, value)
  })

  Object.entries(spacing).forEach(([key, value]) => {
    root.style.setProperty(`--space-${key}`, `${value}px`)
  })
  const radiusTokens = preset.radius || radius
  Object.entries(radiusTokens).forEach(([key, value]) => {
    root.style.setProperty(`--radius-${key}`, `${value}px`)
  })
  const fonts = preset.typography || typography
  root.style.setProperty('--font-display', fonts.fontDisplay)
  root.style.setProperty('--font-body', fonts.fontBody)
  root.style.setProperty('--font-mono', fonts.fontMono || typography.fontMono)

  root.setAttribute('data-color-mode', colorMode === 'dark' ? 'dark' : 'light')
  root.style.colorScheme = colorMode === 'dark' ? 'dark' : 'light'
}

/**
 * Ant Design ConfigProvider theme derived from a preset + color mode.
 * @param {string | null | undefined} themeKey
 * @param {'light' | 'dark'} [colorMode]
 */
export function buildAntTheme(themeKey, colorMode = 'light') {
  const preset = getThemePreset(themeKey)
  const colors = getThemeColors(themeKey, colorMode)
  const shadows = shadowsForPrimary(colors.primary, colors.accent)
  const p = hexToRgb(colors.primary)
  const fonts = preset.typography || typography
  const radiusTokens = preset.radius || radius
  const isDark = colorMode === 'dark'
  return {
    ...baseAntTheme,
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      ...baseAntTheme.token,
      colorPrimary: colors.primary,
      colorSuccess: colors.success,
      colorWarning: colors.warning,
      colorError: colors.error,
      colorText: colors.textPrimary,
      colorTextSecondary: colors.textSecondary,
      colorBorder: colors.border,
      colorBgContainer: colors.surface,
      colorBgLayout: colors.surface2,
      colorBgElevated: colors.surface,
      borderRadius: radiusTokens.md,
      borderRadiusLG: radiusTokens.lg,
      fontFamily: fonts.fontBody,
    },
    components: {
      ...baseAntTheme.components,
      Button: {
        ...baseAntTheme.components?.Button,
        primaryShadow: shadows.sm,
      },
      Input: {
        activeBorderColor: colors.primary,
        hoverBorderColor: colors.primaryLight,
      },
      Select: {
        optionSelectedBg: `rgba(${p.r}, ${p.g}, ${p.b}, ${isDark ? 0.22 : 0.08})`,
      },
      Table: {
        headerBg: colors.surface2,
        rowHoverBg: colors.surface3,
      },
      Drawer: {
        ...baseAntTheme.components?.Drawer,
      },
    },
  }
}

/** Reset inline theme overrides so :root stylesheet defaults apply again. */
export function clearThemeCssVariables() {
  const root = document.documentElement
  const sample = getThemePreset(DEFAULT_THEME_KEY).colors
  Object.keys(sample).forEach((key) => {
    root.style.removeProperty(camelToCssVar(key))
  })
  root.style.removeProperty('--sidebar-mid')
  root.style.removeProperty('--border-light')
  Object.keys(classicShadows).forEach((key) => {
    root.style.removeProperty(`--shadow-${key}`)
  })
  root.removeAttribute('data-color-mode')
  root.style.removeProperty('color-scheme')
}

const DEFAULT_META_THEME_COLOR = '#0F766E'

/**
 * Update <meta name="theme-color"> for the current browser session
 * (address-bar tint on supporting mobile browsers). Does not rewrite
 * manifest.webmanifest — installed PWA chrome still uses the static manifest.
 */
export function setDocumentThemeColor(hex) {
  if (typeof document === 'undefined') return
  const value = hex || DEFAULT_META_THEME_COLOR
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', value)
}

export function getThemePrimary(themeKey, colorMode = 'light') {
  return getThemeColors(themeKey, colorMode).primary
}
