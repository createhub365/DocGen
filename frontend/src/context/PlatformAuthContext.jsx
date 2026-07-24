import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearPlatformAuthToken,
  platformGetMe,
  platformLogin as apiLogin,
  platformLogout as apiLogout,
  platformSignup as apiSignup,
  storePlatformAuthToken,
} from '../api/platformClient'

const PlatformAuthContext = createContext(null)

export function PlatformAuthProvider({ children }) {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [currentOrg, setCurrentOrg] = useState(null)
  const [role, setRole] = useState(null)

  const applyMe = useCallback((res) => {
    if (!res) {
      clearPlatformAuthToken()
      setCurrentUser(null)
      setCurrentOrg(null)
      setRole(null)
      return
    }
    setCurrentOrg(res.organization || null)
    setRole(res.role || res.membership?.role || null)
    setCurrentUser({
      user_id: res.user_id,
      username: res.username,
      role: res.role || res.membership?.role,
      membership: res.membership,
    })
  }, [])

  const refreshMe = useCallback(() => {
    setIsLoading(true)
    return platformGetMe()
      .then((res) => {
        applyMe(res)
        return res
      })
      .catch(() => {
        applyMe(null)
        return null
      })
      .finally(() => setIsLoading(false))
  }, [applyMe])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  const login = useCallback(
    async (username, password) => {
      const data = await apiLogin(username, password)
      if (data.access_token) storePlatformAuthToken(data.access_token)
      await refreshMe()
      return data
    },
    [refreshMe]
  )

  const signup = useCallback(
    async (payload) => {
      const data = await apiSignup(payload)
      if (data.access_token) storePlatformAuthToken(data.access_token)
      await refreshMe()
      return data
    },
    [refreshMe]
  )

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      /* cookie cleared if reachable */
    }
    clearPlatformAuthToken()
    setCurrentUser(null)
    setCurrentOrg(null)
    setRole(null)
    navigate('/platform/login', { replace: true })
  }, [navigate])

  const authed = !!currentUser && !!currentOrg

  return (
    <PlatformAuthContext.Provider
      value={{
        currentOrg,
        currentUser,
        role,
        isLoading,
        login,
        signup,
        logout,
        refreshMe,
        authed,
      }}
    >
      {children}
    </PlatformAuthContext.Provider>
  )
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext)
  if (!ctx) throw new Error('usePlatformAuth must be used within PlatformAuthProvider')
  return ctx
}

export default PlatformAuthContext
