import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Typography } from 'antd'
import { FileTextOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { login } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useAppMessage } from '../hooks/useAppMessage'

const { Text } = Typography

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const message = useAppMessage()
  const { loginSuccess } = useAuth()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const data = await login(values.username, values.password)
      loginSuccess(data)
      message.success(data.name ? `Welcome, ${data.name}!` : 'Welcome back!')
      navigate('/dashboard')
    } catch (err) {
      const detail = err.response?.data?.detail
      const status = err.response?.status
      if (status === 500) {
        message.error('Server error — is the backend running on port 8000?')
      } else {
        message.error(detail || 'Invalid username or password')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #6B0F0F 0%, #3D0505 45%, #1A0A0A 100%)',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="login-orb login-orb--gold" />
      <div className="login-orb login-orb--maroon" />

      <div
        className="animate-scale-in w-full"
        style={{ maxWidth: 420, position: 'relative', zIndex: 1 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
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
            DocFlow
          </h1>
          <div
            style={{
              width: 40,
              height: 3,
              background: 'linear-gradient(90deg, #8B1A1A, #D4A017)',
              margin: '10px auto 10px',
              borderRadius: 2,
            }}
          />
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
            Immigration Document Automation
          </Text>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
            padding: '36px 32px 28px',
            border: '1px solid rgba(139,26,26,0.08)',
          }}
        >
          <p style={{ margin: '0 0 24px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            Sign in to your account
          </p>

          <Form layout="vertical" onFinish={onFinish} autoComplete="off" className="docflow-input">
            <Form.Item
              name="username"
              label={<span className="docflow-form-label">User ID</span>}
              rules={[{ required: true, message: 'Please enter your user ID' }]}
              style={{ marginBottom: 16 }}
            >
              <Input
                size="large"
                placeholder="Enter user ID"
                prefix={<UserOutlined style={{ color: 'var(--text-muted)' }} />}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label={<span className="docflow-form-label">Password</span>}
              rules={[{ required: true, message: 'Please enter your password' }]}
              style={{ marginBottom: 24 }}
            >
              <Input.Password
                size="large"
                placeholder="Enter password"
                prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={loading}
                style={{
                  height: 46,
                  fontWeight: 700,
                  fontSize: 15,
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #8B1A1A 0%, #A52A2A 100%)',
                  border: 'none',
                }}
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  )
}
