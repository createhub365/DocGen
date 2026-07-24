import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  AppstoreAddOutlined,
  PlusOutlined,
  RocketOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  createDocumentType,
  getDocumentTypeGenerateReadiness,
  installPreset,
  listDocumentTypes,
  listPresets,
  readPlatformErrorDetail,
  slugifyOrgName,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'

const { Title, Paragraph } = Typography

function flowStatus(item) {
  if (item.has_published_flow && item.has_draft_flow) {
    return <Tag color="orange">Draft changes pending</Tag>
  }
  if (item.has_published_flow) return <Tag color="green">Published</Tag>
  if (item.has_draft_flow) return <Tag color="blue">Draft</Tag>
  return <Tag>No flow</Tag>
}

export default function PlatformDashboard() {
  const navigate = useNavigate()
  const message = useAppMessage()
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState([])
  const [readiness, setReadiness] = useState({})
  const [loadError, setLoadError] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm] = Form.useForm()

  const [presetOpen, setPresetOpen] = useState(false)
  const [presets, setPresets] = useState([])
  const [presetsLoading, setPresetsLoading] = useState(false)
  const [installingKey, setInstallingKey] = useState(null)

  const refreshTypes = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listDocumentTypes()
      const rows = Array.isArray(data) ? data : []
      setTypes(rows)
      const statuses = await Promise.all(
        rows.map(async (item) => {
          try {
            const status = await getDocumentTypeGenerateReadiness(item)
            return [item.id, status]
          } catch {
            return [
              item.id,
              {
                ready: false,
                reason: 'Could not check template readiness',
                completeTemplateIds: [],
              },
            ]
          }
        })
      )
      setReadiness(Object.fromEntries(statuses))
    } catch (err) {
      const detail = await readPlatformErrorDetail(err)
      setLoadError(detail || 'Failed to load document types')
      setTypes([])
      setReadiness({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshTypes()
  }, [refreshTypes])

  const openPresets = async () => {
    setPresetOpen(true)
    setPresetsLoading(true)
    try {
      const data = await listPresets()
      setPresets(Array.isArray(data) ? data : [])
    } catch (err) {
      const detail = await readPlatformErrorDetail(err)
      message.error(detail || 'Failed to load presets')
      setPresets([])
    } finally {
      setPresetsLoading(false)
    }
  }

  const onInstall = async (key) => {
    setInstallingKey(key)
    try {
      const result = await installPreset(key)
      const created = result.created?.length || 0
      const skipped = result.skipped?.length || 0
      message.success(
        created
          ? `Installed ${created} document type(s)${skipped ? ` (${skipped} skipped)` : ''}`
          : skipped
            ? 'Already installed — nothing new created'
            : 'Install complete'
      )
      setPresetOpen(false)
      await refreshTypes()
    } catch (err) {
      const detail = await readPlatformErrorDetail(err)
      message.error(detail || 'Install failed')
    } finally {
      setInstallingKey(null)
    }
  }

  const onCreate = async (values) => {
    setCreateLoading(true)
    try {
      const slug = slugifyOrgName(values.slug || values.name)
      const created = await createDocumentType({
        name: values.name.trim(),
        slug,
        description: values.description?.trim() || undefined,
      })
      message.success('Document type created')
      setCreateOpen(false)
      createForm.resetFields()
      navigate(`/platform/document-types/${created.id}`)
    } catch (err) {
      const detail = await readPlatformErrorDetail(err)
      message.error(detail || 'Could not create document type')
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0 }}>
          Create document types and manage their flow steps.
        </Paragraph>
      </div>

      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      {!loading && types.length === 0 && !loadError && (
        <Card style={{ borderRadius: 16 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                No document types yet. Start from scratch or install a starter kit.
              </span>
            }
          >
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Create a document type from scratch
              </Button>
              <Button icon={<RocketOutlined />} onClick={openPresets}>
                Install a starter kit
              </Button>
            </Space>
          </Empty>
        </Card>
      )}

      {!loading && types.length > 0 && (
        <Card
          title="Document types"
          extra={
            <Space>
              <Button icon={<AppstoreAddOutlined />} onClick={openPresets}>
                Starter kit
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                New type
              </Button>
            </Space>
          }
          style={{ borderRadius: 16 }}
        >
          <List
            dataSource={types}
            renderItem={(item) => {
              const status = readiness[item.id]
              const canGenerate = !!status?.ready
              const generateTip = canGenerate
                ? 'Start the generation wizard'
                : status?.reason || 'Not ready to generate'
              return (
                <List.Item
                  actions={[
                    <Tooltip key="generate" title={generateTip}>
                      <span>
                        <Button
                          type="link"
                          icon={<ThunderboltOutlined />}
                          disabled={!canGenerate}
                          onClick={() =>
                            navigate(`/platform/document-types/${item.id}/generate`)
                          }
                        >
                          Generate
                        </Button>
                      </span>
                    </Tooltip>,
                    <Button
                      key="open"
                      type="link"
                      onClick={() => navigate(`/platform/document-types/${item.id}`)}
                    >
                      Open
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <span>{item.name}</span>
                        <Tag>{item.slug}</Tag>
                        {flowStatus(item)}
                      </Space>
                    }
                    description={item.description || 'No description'}
                  />
                </List.Item>
              )
            }}
          />
        </Card>
      )}

      <Modal
        title="Create document type"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate} requiredMark={false}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Offer Letter" />
          </Form.Item>
          <Form.Item name="slug" label="Slug (optional)" extra="Auto-derived from name if left blank">
            <Input placeholder="offer-letter" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={createLoading} block>
            Create
          </Button>
        </Form>
      </Modal>

      <Modal
        title="Install a starter kit"
        open={presetOpen}
        onCancel={() => setPresetOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Paragraph type="secondary">
          Structure only — document types and draft flows. No legacy data or template files are copied.
        </Paragraph>
        <List
          loading={presetsLoading}
          dataSource={presets}
          locale={{ emptyText: 'No presets available' }}
          renderItem={(p) => (
            <List.Item
              actions={[
                <Button
                  key="install"
                  type="primary"
                  loading={installingKey === p.key}
                  onClick={() => onInstall(p.key)}
                >
                  Install
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={p.name}
                description={p.description}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  )
}
