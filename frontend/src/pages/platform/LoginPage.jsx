import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Typography } from 'antd'
import { FileTextOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { readPlatformErrorDetail } from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'

const { Text } = Typography

const LEGACY_ONLY_DETAIL = 'User is not a member of any organization'

export default function PlatformLoginPage() {
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState(null)
  const [legacyOnly, setLegacyOnly] = useState(false)
  const navigate = useNavigate()
  const message = useAppMessage()
  const { login, authed, isLoading } = usePlatformAuth()

  if (!isLoading && authed) {
    return <Navigate to="/platform" replace />
  }

  const onFinish = async (values) => {
    setFormError(null)
    setLegacyOnly(false)
    setLoading(true)
    try {
      await login(values.username.trim(), values.password)
      message.success('Welcome back')
      navigate('/platform', { replace: true })
    } catch (err) {
      const detail = await readPlatformErrorDetail(err)
      const status = err.response?.status
      if (status === 401 && detail === LEGACY_ONLY_DETAIL) {
        setLegacyOnly(true)
        setFormError(
          'This account exists in the legacy DocFlow system but is not a member of any platform organization. Use Platform signup to create an org, or ask an org admin to invite you.'
        )
      } else if (status === 401) {
        setFormError(detail || 'Invalid username or password')
      } else if (status === 429) {
        setFormError('Too many login attempts. Please try again later.')
      } else {
        setFormError(detail || 'Login failed. Is the backend running?')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="login-page min-h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #6B0F0F 0%, #3D0505 45%, #1A0A0A 100%)',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="login-orb login-orb--gold" />
      <div className="login-orb login-orb--maroon" />

      <div className="animate-scale-in w-full" style={{ maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.14)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <FileTextOutlined style={{ fontSize: 32, color: '#D4A017' }} />
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
            DocFlow Platform
          </h1>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
            Organization sign in
          </Text>
        </div>

        <div
          className="login-card"
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
            padding: '36px 32px 28px',
            border: '1px solid rgba(139,26,26,0.08)',
          }}
        >
          {formError && (
            <Alert
              type={legacyOnly ? 'warning' : 'error'}
              showIcon
              message={formError}
              style={{ marginBottom: 16 }}
              closable
              onClose={() => {
                setFormError(null)
                setLegacyOnly(false)
              }}
            />
          )}

          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="username"
              label="Email / username"
              rules={[{ required: true, message: 'Username is required' }]}
            >
              <Input prefix={<UserOutlined />} size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password prefix={<LockOutlined />} size="large" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Sign in
            </Button>
          </Form>

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13 }}>
            <Text type="secondary">New organization? </Text>
            <Link to="/platform/signup">Create one</Link>
          </div>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12 }}>
            <Link to="/login" style={{ color: 'var(--text-muted, #9A8080)' }}>
              Legacy immigration login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
