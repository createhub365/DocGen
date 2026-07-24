import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Typography } from 'antd'
import { FileTextOutlined, LockOutlined, MailOutlined, BankOutlined } from '@ant-design/icons'
import { readPlatformErrorDetail, slugifyOrgName } from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'

const { Text } = Typography

export default function PlatformSignupPage() {
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState(null)
  const [form] = Form.useForm()
  const orgName = Form.useWatch('name', form)
  const derivedSlug = useMemo(() => slugifyOrgName(orgName), [orgName])
  const navigate = useNavigate()
  const message = useAppMessage()
  const { signup, authed, isLoading } = usePlatformAuth()

  if (!isLoading && authed) {
    return <Navigate to="/platform" replace />
  }

  const onFinish = async (values) => {
    setFormError(null)
    setLoading(true)
    try {
      const slug = slugifyOrgName(values.name)
      if (!slug) {
        setFormError('Organization name must include letters or numbers to form a URL slug.')
        return
      }
      // Backend signup sets the org JWT cookie and returns access_token — session is live immediately.
      await signup({
        name: values.name.trim(),
        slug,
        username: values.username.trim().toLowerCase(),
        password: values.password,
      })
      message.success('Organization created')
      navigate('/platform', { replace: true })
    } catch (err) {
      const detail = await readPlatformErrorDetail(err)
      const status = err.response?.status
      if (status === 409) {
        setFormError(detail || 'Organization or username already exists')
      } else if (status === 422) {
        setFormError(detail || 'Please check the form fields')
      } else if (status === 429) {
        setFormError('Too many signup attempts. Please try again later.')
      } else {
        setFormError(detail || 'Signup failed. Is the backend running?')
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

      <div className="animate-scale-in w-full" style={{ maxWidth: 440, position: 'relative', zIndex: 1 }}>
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
            Create your organization
          </Text>
        </div>

        <div
          className="login-card"
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
            padding: '32px 28px 24px',
            border: '1px solid rgba(139,26,26,0.08)',
          }}
        >
          {formError && (
            <Alert
              type="error"
              showIcon
              message={formError}
              style={{ marginBottom: 16 }}
              closable
              onClose={() => setFormError(null)}
            />
          )}

          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="name"
              label="Organization name"
              rules={[{ required: true, message: 'Organization name is required' }]}
            >
              <Input prefix={<BankOutlined />} placeholder="Acme Immigration" size="large" />
            </Form.Item>

            {derivedSlug ? (
              <div style={{ marginTop: -8, marginBottom: 16, fontSize: 12, color: 'var(--text-muted, #9A8080)' }}>
                URL slug: <code>{derivedSlug}</code>
              </div>
            ) : null}

            <Form.Item
              name="username"
              label="Admin email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
              extra="Stored as your login username"
            >
              <Input prefix={<MailOutlined />} placeholder="admin@acme.com" size="large" autoComplete="username" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password prefix={<LockOutlined />} size="large" autoComplete="new-password" />
            </Form.Item>

            <Form.Item
              name="confirm"
              label="Confirm password"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve()
                    return Promise.reject(new Error('Passwords do not match'))
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} size="large" autoComplete="new-password" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Create organization
            </Button>
          </Form>

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13 }}>
            <Text type="secondary">Already have an account? </Text>
            <Link to="/platform/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
