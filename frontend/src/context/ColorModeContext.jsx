import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'docgen.colorMode'

/** @typedef {'light' | 'dark'} ColorMode */

function readStoredMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return null
}

function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve effective mode: explicit localStorage, else prefers-color-scheme. */
export function resolveInitialColorMode() {
  const stored = readStoredMode()
  if (stored) return stored
  return systemPrefersDark() ? 'dark' : 'light'
}

const ColorModeContext = createContext(null)

/**
 * Per-user light/dark preference (localStorage), independent of org color presets.
 * Initial default follows prefers-color-scheme until the user toggles once.
 */
export function ColorModeProvider({ children }) {
  const [colorMode, setColorModeState] = useState(() => resolveInitialColorMode())
  const [hasExplicitChoice, setHasExplicitChoice] = useState(() => readStoredMode() != null)

  useEffect(() => {
    if (hasExplicitChoice) return undefined
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return undefined
    const onChange = (e) => {
      setColorModeState(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [hasExplicitChoice])

  const setColorMode = useCallback((mode) => {
    if (mode !== 'light' && mode !== 'dark') return
    setHasExplicitChoice(true)
    setColorModeState(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleColorMode = useCallback(() => {
    setColorMode(colorMode === 'dark' ? 'light' : 'dark')
  }, [colorMode, setColorMode])

  const value = useMemo(
    () => ({ colorMode, setColorMode, toggleColorMode }),
    [colorMode, setColorMode, toggleColorMode]
  )

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>
}

export function useColorMode() {
  const ctx = useContext(ColorModeContext)
  if (!ctx) throw new Error('useColorMode must be used within ColorModeProvider')
  return ctx
}
