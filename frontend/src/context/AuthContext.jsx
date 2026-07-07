import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, logout as apiLogout } from '../api/client'
import { clearWizardSession } from '../store/useDocStore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

  const refreshAuth = useCallback(() => {
    setLoading(true)
    return getMe()
      .then((res) => {
        if (!res) {
          localStorage.removeItem('role')
          localStorage.removeItem('username')
          localStorage.removeItem('name')
          setUser(null)
          return
        }
        localStorage.setItem('role', res.role)
        localStorage.setItem('username', res.username)
        localStorage.setItem('name', res.name || res.username)
        setUser(res)
      })
      .catch(() => {
        localStorage.removeItem('role')
        localStorage.removeItem('username')
        localStorage.removeItem('name')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  const loginSuccess = useCallback((data) => {
    localStorage.setItem('role', data.role)
    localStorage.setItem('username', data.username)
    localStorage.setItem('name', data.name || data.username)
    setUser({
      role: data.role,
      username: data.username,
      name: data.name || data.username,
    })
    setLoading(false)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      /* cookie cleared on server if reachable */
    }
    localStorage.removeItem('role')
    localStorage.removeItem('username')
    localStorage.removeItem('name')
    clearWizardSession()
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const authed = !!user
  const authChecked = !loading

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout,
        loginSuccess,
        refreshAuth,
        authed,
        authChecked,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
