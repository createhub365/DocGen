import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Shared async-action loading pattern for platform pages.
 *
 * Single actions: use `run` + `loading` on the triggering Button.
 * Named actions: use `runNamed(key, fn)` + `isLoading(key)` when a page
 * has several independent busy states (upload vs delete, etc.).
 *
 * Bulk endpoints today return one synchronous response — use
 * `loading` with an indeterminate Progress (AsyncBusyBar), not fake %.
 */
export function useAsyncAction() {
  const [loading, setLoading] = useState(false)
  const [flags, setFlags] = useState({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async (fn) => {
    setLoading(true)
    try {
      return await fn()
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const runNamed = useCallback(async (key, fn) => {
    setFlags((prev) => ({ ...prev, [key]: true }))
    try {
      return await fn()
    } finally {
      if (mounted.current) {
        setFlags((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    }
  }, [])

  const isLoading = useCallback((key) => Boolean(flags[key]), [flags])

  const anyLoading = loading || Object.keys(flags).length > 0

  return {
    loading,
    run,
    runNamed,
    isLoading,
    anyLoading,
    setLoading,
  }
}
