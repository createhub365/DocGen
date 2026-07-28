import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Typography,
} from 'antd'
import {
  AppstoreAddOutlined,
  PlusOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import {
  createDocumentType,
  installPreset,
  listDocumentTypes,
  listPresets,
  readPlatformErrorDetail,
  slugifyOrgName,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import { usePlatformPageChrome } from '../../components/PlatformLayout'

const { Title, Paragraph, Text } = Typography

/** Square tile size for document-type cards (CSS Grid minmax). */
const DOC_TYPE_TILE_PX = 240

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
      setTypes(Array.isArray(data) ? data : [])
    } catch (err) {
      const detail = await readPlatformErrorDetail(err)
      setLoadError(detail || 'Failed to load document types')
      setTypes([])
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

  const draftName = Form.useWatch('name', createForm)
  const nearDuplicateTypes = useMemo(() => {
    const q = String(draftName || '').trim().toLowerCase()
    if (!q || types.length === 0) return []
    return types.filter((t) => String(t.name || '').trim().toLowerCase() === q)
  }, [draftName, types])

  const closeCreateAndBrowse = () => {
    setCreateOpen(false)
    createForm.resetFields()
    // Soft nudge: stay on dashboard list so the user can Open an existing type
    message.info('Open an existing type, then use its Templates tab to add another file.')
  }

  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Create document types and manage their flow steps.
        </Paragraph>
      </>
    ),
    []
  )
  usePlatformPageChrome({ header })

  return (
    <div>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${DOC_TYPE_TILE_PX}px, ${DOC_TYPE_TILE_PX}px))`,
              gap: 16,
              justifyContent: 'start',
            }}
          >
            {types.map((item) => (
              <Card
                key={item.id}
                size="small"
                hoverable
                onClick={() => navigate(`/platform/document-types/${item.id}`)}
                style={{
                  width: DOC_TYPE_TILE_PX,
                  height: DOC_TYPE_TILE_PX,
                  borderRadius: 12,
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
                styles={{
                  body: {
                    height: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 16,
                  },
                }}
              >
                <Text
                  strong
                  style={{
                    fontSize: 15,
                    lineHeight: 1.35,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.name}
                </Text>
                <Space size={[4, 4]} wrap style={{ flexShrink: 0 }}>
                  <Tag style={{ margin: 0 }}>{item.slug}</Tag>
                  {flowStatus(item)}
                </Space>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    marginTop: 'auto',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.description || 'No description'}
                </Text>
              </Card>
            ))}
          </div>
        </Card>
      )}

      <Modal
        title="Create document type"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        {types.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Already have a document type for this? Open it and add another template instead of creating a new type."
            action={
              <Button size="small" type="link" onClick={closeCreateAndBrowse}>
                Browse existing types
              </Button>
            }
          />
        )}
        {nearDuplicateTypes.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`A document type named “${nearDuplicateTypes[0].name}” already exists.`}
            description="If you only need another file variant, open that type and add a template — you can still create a new type if the fields must differ."
            action={
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setCreateOpen(false)
                  createForm.resetFields()
                  navigate(`/platform/document-types/${nearDuplicateTypes[0].id}`)
                }}
              >
                Open existing
              </Button>
            }
          />
        )}
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
