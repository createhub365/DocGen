import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Typography } from 'antd'
import { FileTextOutlined, LockOutlined, MailOutlined, BankOutlined } from '@ant-design/icons'
import { readPlatformErrorDetail, slugifyOrgName } from '../../api/platformClient'
import ColorModeToggle from '../../components/ColorModeToggle'
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
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <ColorModeToggle variant="floating" />
      <div className="login-orb login-orb--accent" />
      <div className="login-orb login-orb--primary" />

      <div className="animate-scale-in w-full" style={{ maxWidth: 440, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="login-brand-mark" aria-hidden>
            <FileTextOutlined />
          </div>
          <h1 className="login-brand-title">DocFlow Platform</h1>
          <Text className="login-brand-sub">Create your organization</Text>
        </div>

        <div className="login-card" style={{ padding: '32px 28px 24px' }}>
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
              <div style={{ marginTop: -8, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
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
