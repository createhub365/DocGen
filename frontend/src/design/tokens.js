export const colors = {
  primary: '#8B1A1A',
  primaryLight: '#A52A2A',
  primaryDark: '#5C0F0F',
  accent: '#D4A017',
  accentLight: '#F0C040',
  surface: '#FFFFFF',
  surface2: '#FDF7F7',
  surface3: '#F5EDED',
  border: '#E8D8D8',
  textPrimary: '#1A0A0A',
  textSecondary: '#5A4040',
  textMuted: '#9A8080',
  success: '#0D7C4A',
  warning: '#D97706',
  error: '#C0392B',
  maroon: '#8B1A1A',
  maroonLight: '#A52A2A',
  maroonDark: '#5C0F0F',
  purple: '#4A1942',
  green: '#1B4332',
  sidebarFrom: '#6B0F0F',
  sidebarTo: '#2D0505',
  previewBg: '#1E0A0A',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
}

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
}

export const shadows = {
  sm: '0 1px 3px rgba(139,26,26,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  md: '0 4px 12px rgba(139,26,26,0.10), 0 2px 4px rgba(0,0,0,0.06)',
  lg: '0 10px 30px rgba(139,26,26,0.12), 0 4px 8px rgba(0,0,0,0.08)',
  xl: '0 20px 60px rgba(139,26,26,0.15), 0 8px 20px rgba(0,0,0,0.10)',
  glow: '0 0 20px rgba(212,160,23,0.25)',
  maroon: '0 0 20px rgba(139,26,26,0.30)',
}

export const typography = {
  fontDisplay: "'Inter', system-ui, sans-serif",
  fontBody: "'Inter', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', monospace",
}

export const layout = {
  sidebarExpanded: 240,
  sidebarCollapsed: 64,
  drawerWidth: 480,
}

export const breakpoints = {
  mobile: 768,
  tablet: 1024,
  laptop: 1280,
}

export const antTheme = {
  token: {
    colorPrimary: colors.primary,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.error,
    colorText: colors.textPrimary,
    colorTextSecondary: colors.textSecondary,
    colorBorder: colors.border,
    colorBgContainer: colors.surface,
    colorBgLayout: colors.surface2,
    borderRadius: radius.md,
    borderRadiusLG: radius.lg,
    fontFamily: typography.fontBody,
    controlHeight: 40,
    // Must sit above custom AppDrawer (1100/1101) so Select/Picker popups stay visible
    zIndexPopupBase: 1200,
  },
  components: {
    Button: {
      primaryShadow: shadows.sm,
      fontWeight: 600,
    },
    Input: {
      activeBorderColor: colors.primary,
      hoverBorderColor: colors.primaryLight,
    },
    Select: {
      optionSelectedBg: 'rgba(139, 26, 26, 0.08)',
    },
    Table: {
      headerBg: colors.surface2,
      rowHoverBg: colors.surface2,
    },
    Drawer: {
      paddingLG: spacing.lg,
    },
  },
}

export function injectCssVariables() {
  const root = document.documentElement
  Object.entries(colors).forEach(([key, value]) => {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
    root.style.setProperty(`--${cssKey}`, value)
  })
  Object.entries(spacing).forEach(([key, value]) => {
    root.style.setProperty(`--space-${key}`, `${value}px`)
  })
  Object.entries(radius).forEach(([key, value]) => {
    root.style.setProperty(`--radius-${key}`, `${value}px`)
  })
  Object.entries(shadows).forEach(([key, value]) => {
    root.style.setProperty(`--shadow-${key}`, value)
  })
  root.style.setProperty('--font-display', typography.fontDisplay)
  root.style.setProperty('--font-body', typography.fontBody)
  root.style.setProperty('--font-mono', typography.fontMono)
}
