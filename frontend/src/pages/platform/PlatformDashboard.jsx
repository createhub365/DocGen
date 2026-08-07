import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Spin,
  Typography,
} from 'antd'
import {
  AppstoreOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import {
  downloadGeneratedDocument,
  listDocumentTypes,
  listGeneratedDocuments,
  listOrgTemplates,
  readPlatformErrorDetail,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import { usePlatformAuth } from '../../context/PlatformAuthContext'

const { Title, Paragraph, Text } = Typography

const BRAND = {
  border: 'var(--border)',
  surface: 'var(--surface-2)',
  softBg: 'var(--surface-3)',
  primary: 'var(--primary)',
}

const RECENT_LIMIT = 5

function basename(path) {
  if (!path) return 'document.docx'
  const parts = String(path).split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function greetingForNow(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({ title, value, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="platform-dashboard-stat"
      style={{
        width: '100%',
        margin: 0,
        padding: 0,
        textAlign: 'left',
        cursor: 'pointer',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
        font: 'inherit',
        color: 'inherit',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
      }}
    >
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: BRAND.softBg,
            color: BRAND.primary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          aria-hidden
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            {value}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{title}</div>
        </div>
      </div>
    </button>
  )
}

export default function PlatformDashboard() {
  const navigate = useNavigate()
  const message = useAppMessage()
  const { isMobile } = useBreakpoint()
  const { currentOrg, isOrgAdmin, currentUser } = usePlatformAuth()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [stats, setStats] = useState({
    documentTypes: 0,
    templates: 0,
    generated: 0,
    publishedFlows: 0,
  })
  const [recent, setRecent] = useState([])
  const [downloadingId, setDownloadingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Client-side aggregation from existing list endpoints (no new backend surface).
      const [types, generated] = await Promise.all([
        listDocumentTypes(),
        listGeneratedDocuments(),
      ])
      const typeList = Array.isArray(types) ? types : []
      const genList = Array.isArray(generated) ? generated : []

      let templateCount = 0
      if (typeList.length > 0) {
        const templateLists = await Promise.all(
          typeList.map((t) =>
            listOrgTemplates(t.id).catch(() => [])
          )
        )
        templateCount = templateLists.reduce(
          (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
          0
        )
      }

      setStats({
        documentTypes: typeList.length,
        templates: templateCount,
        generated: genList.length,
        publishedFlows: typeList.filter((t) => t.has_published_flow).length,
      })
      setRecent(
        genList.slice(0, RECENT_LIMIT).map((doc) => ({
          ...doc,
          document_type_name:
            doc.document_type_name || `Template #${doc.template_id}`,
        }))
      )
    } catch (err) {
      setLoadError(
        (await readPlatformErrorDetail(err)) || 'Could not load dashboard'
      )
      setStats({
        documentTypes: 0,
        templates: 0,
        generated: 0,
        publishedFlows: 0,
      })
      setRecent([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onDownload = async (docId) => {
    setDownloadingId(docId)
    try {
      await downloadGeneratedDocument(docId, 'docx')
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  const orgName = currentOrg?.name || 'your organization'
  const firstName =
    String(currentUser?.full_name || currentUser?.email || '')
      .trim()
      .split(/\s+/)[0] || null

  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {greetingForNow()}
          {firstName ? `, ${firstName}` : ''} · {orgName}
        </Paragraph>
      </>
    ),
    [firstName, orgName]
  )
  usePlatformPageChrome({ header })

  return (
    <div className="platform-page-enter">
      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Space direction="vertical" size={isMobile ? 16 : 20} style={{ width: '100%' }}>
          <Row gutter={[14, 14]}>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Document Types"
                value={stats.documentTypes}
                icon={<FileTextOutlined style={{ fontSize: 18 }} />}
                onClick={() => navigate('/platform/document-types')}
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Templates"
                value={stats.templates}
                icon={<AppstoreOutlined style={{ fontSize: 18 }} />}
                onClick={() => navigate('/platform/document-types')}
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Generated"
                value={stats.generated}
                icon={<FileDoneOutlined style={{ fontSize: 18 }} />}
                onClick={() => navigate('/platform/generated')}
              />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard
                title="Published Flows"
                value={stats.publishedFlows}
                icon={<ThunderboltOutlined style={{ fontSize: 18 }} />}
                onClick={() => navigate('/platform/document-types')}
              />
            </Col>
          </Row>

          <Row gutter={[14, 14]}>
            <Col xs={24} lg={14}>
              <Card
                title="Recent activity"
                extra={
                  <Button type="link" onClick={() => navigate('/platform/generated')}>
                    View all
                  </Button>
                }
                style={{ borderRadius: 12, borderColor: BRAND.border, height: '100%' }}
              >
                {!recent.length ? (
                  <Empty
                    description="No generated documents yet."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  >
                    <Button
                      type="primary"
                      onClick={() => navigate('/platform/document-types')}
                    >
                      Go to document types
                    </Button>
                  </Empty>
                ) : (
                  <List
                    dataSource={recent}
                    renderItem={(item) => (
                      <List.Item
                        className="platform-generated-list-item"
                        actions={[
                          <Button
                            key="dl"
                            type="link"
                            className="platform-touch-target"
                            icon={<DownloadOutlined />}
                            loading={downloadingId === item.id}
                            onClick={() => onDownload(item.id)}
                          >
                            Download
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space wrap>
                              <Text strong>{basename(item.docx_filename)}</Text>
                              <Text type="secondary">#{item.id}</Text>
                            </Space>
                          }
                          description={`${item.document_type_name} · ${formatDate(item.created_at)}`}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card
                title="Quick actions"
                style={{ borderRadius: 12, borderColor: BRAND.border, height: '100%' }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {isOrgAdmin ? (
                    <Button
                      block
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => navigate('/platform/document-types?new=1')}
                    >
                      Create document type
                    </Button>
                  ) : null}
                  <Button
                    block
                    icon={<FileTextOutlined />}
                    onClick={() => navigate('/platform/document-types')}
                  >
                    Browse document types
                  </Button>
                  <Button
                    block
                    icon={<FileDoneOutlined />}
                    onClick={() => navigate('/platform/generated')}
                  >
                    Generated documents
                  </Button>
                  {isOrgAdmin ? (
                    <Button
                      block
                      icon={<UserAddOutlined />}
                      onClick={() => navigate('/platform/users')}
                    >
                      Invite user
                    </Button>
                  ) : null}
                </Space>
              </Card>
            </Col>
          </Row>
        </Space>
      )}
    </div>
  )
}
