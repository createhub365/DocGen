/**
 * Org-level UI theme presets.
 *
 * Color keys match design/tokens.js `colors` (camelCase). Applying a theme
 * writes the same CSS custom properties already used in global.css
 * (--primary, --sidebar-from, …) plus Ant Design token overrides.
 *
 * theme_key null / "classic" → current maroon/gold (visually identical to today).
 */

import {
  antTheme as baseAntTheme,
  colors as classicColors,
  radius,
  shadows as classicShadows,
  spacing,
  typography,
} from './tokens'

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

const classic = withCssExtras(
  { ...classicColors },
  { sidebarMid: '#4A0A0A', borderLight: '#F0E5E5' }
)

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

/**
 * @typedef {{
 *   key: string,
 *   name: string,
 *   description: string,
 *   swatch: string[],
 *   colors: Record<string, string>,
 * }} ThemePreset
 */

/** @type {ThemePreset[]} */
export const THEME_PRESETS = [
  {
    key: 'classic',
    name: 'Classic Maroon',
    description: 'Default maroon and gold',
    swatch: [classic.primary, classic.accent, classic.sidebarFrom, classic.surface2],
    colors: classic,
  },
  {
    key: 'navy',
    name: 'Deep Navy',
    description: 'Navy blue with soft gold',
    swatch: [navyColors.primary, navyColors.accent, navyColors.sidebarFrom, navyColors.surface2],
    colors: navyColors,
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
  },
  {
    key: 'slate',
    name: 'Slate',
    description: 'Neutral charcoal and silver',
    swatch: [slateColors.primary, slateColors.accent, slateColors.sidebarFrom, slateColors.surface2],
    colors: slateColors,
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
  },
]

const PRESET_BY_KEY = Object.fromEntries(THEME_PRESETS.map((p) => [p.key, p]))

/** Resolve org theme_key (null → classic). */
export function resolveThemeKey(themeKey) {
  if (themeKey == null || String(themeKey).trim() === '') return 'classic'
  const key = String(themeKey).trim().toLowerCase()
  return PRESET_BY_KEY[key] ? key : 'classic'
}

export function getThemePreset(themeKey) {
  return PRESET_BY_KEY[resolveThemeKey(themeKey)]
}

function camelToCssVar(key) {
  return `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
}

/**
 * Apply theme CSS variables to document root (same names as injectCssVariables / :root).
 */
export function applyThemeCssVariables(themeKey) {
  const preset = getThemePreset(themeKey)
  const root = document.documentElement
  const colors = preset.colors
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(camelToCssVar(key), value)
  })
  // Aliases used by global.css
  if (colors.sidebarMid) root.style.setProperty('--sidebar-mid', colors.sidebarMid)
  if (colors.borderLight) root.style.setProperty('--border-light', colors.borderLight)

  const shadows = shadowsForPrimary(colors.primary, colors.accent)
  Object.entries(shadows).forEach(([key, value]) => {
    root.style.setProperty(`--shadow-${key}`, value)
  })

  Object.entries(spacing).forEach(([key, value]) => {
    root.style.setProperty(`--space-${key}`, `${value}px`)
  })
  Object.entries(radius).forEach(([key, value]) => {
    root.style.setProperty(`--radius-${key}`, `${value}px`)
  })
  root.style.setProperty('--font-display', typography.fontDisplay)
  root.style.setProperty('--font-body', typography.fontBody)
  root.style.setProperty('--font-mono', typography.fontMono)
}

/**
 * Ant Design ConfigProvider theme derived from a preset (keeps structure of tokens.antTheme).
 */
export function buildAntTheme(themeKey) {
  const { colors } = getThemePreset(themeKey)
  const shadows = shadowsForPrimary(colors.primary, colors.accent)
  const p = hexToRgb(colors.primary)
  return {
    ...baseAntTheme,
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
        optionSelectedBg: `rgba(${p.r}, ${p.g}, ${p.b}, 0.08)`,
      },
      Table: {
        headerBg: colors.surface2,
        rowHoverBg: colors.surface2,
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
  const sample = getThemePreset('classic').colors
  Object.keys(sample).forEach((key) => {
    root.style.removeProperty(camelToCssVar(key))
  })
  root.style.removeProperty('--sidebar-mid')
  root.style.removeProperty('--border-light')
  Object.keys(classicShadows).forEach((key) => {
    root.style.removeProperty(`--shadow-${key}`)
  })
}

const DEFAULT_META_THEME_COLOR = '#8B1A1A'

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

export function getThemePrimary(themeKey) {
  return getThemePreset(themeKey).colors.primary
}
