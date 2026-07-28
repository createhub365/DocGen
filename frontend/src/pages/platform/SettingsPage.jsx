import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Space,
  Typography,
} from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import {
  readPlatformErrorDetail,
  regenerateOrgThumbnails,
} from '../../api/platformClient'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { useAppMessage } from '../../hooks/useAppMessage'
import { usePlatformPageChrome } from '../../components/PlatformLayout'

const { Title, Paragraph, Text } = Typography

export default function SettingsPage() {
  const message = useAppMessage()
  const { role } = usePlatformAuth()
  const isAdmin = role === 'org_admin'

  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          Settings
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Organization maintenance and preferences.
        </Paragraph>
      </>
    ),
    []
  )
  usePlatformPageChrome({ header })

  if (!isAdmin) {
    return <Navigate to="/platform" replace />
  }

  const onRegenerate = async () => {
    setRunning(true)
    setError(null)
    setSummary(null)
    try {
      const result = await regenerateOrgThumbnails()
      setSummary(result)
      message.success('Thumbnail check finished')
    } catch (err) {
      const detail =
        (await readPlatformErrorDetail(err)) || 'Could not regenerate thumbnails'
      setError(detail)
      message.error(detail)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Card
        title="Maintenance"
        style={{ borderRadius: 12, borderColor: '#f0e4e4' }}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Create missing document previews and refresh ones that no longer match
          the current uploaded file. Safe to run more than once.
        </Paragraph>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={running}
          onClick={onRegenerate}
        >
          Generate missing thumbnails
        </Button>

        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginTop: 16 }}
          />
        )}

        {summary && (
          <Alert
            type={summary.failed ? 'warning' : 'success'}
            showIcon
            style={{ marginTop: 16 }}
            message={
              <span>
                Checked <Text strong>{summary.total}</Text> templates —{' '}
                <Text strong>{summary.created}</Text> created,{' '}
                <Text strong>{summary.updated}</Text> updated,{' '}
                <Text strong>{summary.unchanged}</Text> already up to date
                {summary.failed ? (
                  <>
                    , <Text strong>{summary.failed}</Text> failed
                  </>
                ) : null}
              </span>
            }
            description={
              summary.failed_details?.length ? (
                <Collapse
                  size="small"
                  style={{ marginTop: 8, background: 'transparent' }}
                  items={[
                    {
                      key: 'failures',
                      label: `View ${summary.failed_details.length} failure detail(s)`,
                      children: (
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          {summary.failed_details.map((row) => (
                            <Text key={row.template_id} type="secondary" style={{ fontSize: 12 }}>
                              #{row.template_id} {row.filename}: {row.error}
                            </Text>
                          ))}
                        </Space>
                      ),
                    },
                  ]}
                />
              ) : null
            }
          />
        )}
      </Card>
    </div>
  )
}
