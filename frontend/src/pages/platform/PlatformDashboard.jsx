import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Modal,
  Space,
  Typography,
} from 'antd'
import {
  AppstoreAddOutlined,
  FileTextOutlined,
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
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformPageChrome } from '../../components/PlatformLayout'

const { Title, Paragraph } = Typography

/** Brand palette (same as PlatformLayout / design tokens). */
const BRAND = {
  maroon: '#8B1A1A',
  gold: '#D4A017',
  softMaroonBg: '#f5eded',
  border: '#f0e4e4',
  surface: '#FDF7F7',
}

/** Grid min track; cards grow up to MAX then wrap. */
const DOC_TYPE_MIN_PX = 200
const DOC_TYPE_MAX_PX = 260

function flowStatusMeta(item) {
  if (item.has_published_flow && item.has_draft_flow) {
    return { label: 'Draft pending', color: '#D48806' }
  }
  if (item.has_published_flow) {
    return { label: 'Published', color: '#389e0a' }
  }
  if (item.has_draft_flow) {
    return { label: 'Draft', color: '#D48806' }
  }
  return { label: 'No flow', color: '#8c8c8c' }
}

function FlowStatus({ item }) {
  const { label, color } = flowStatusMeta(item)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        color: '#595959',
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  )
}

function DocumentTypeCard({ item, onOpen }) {
  const desc = String(item.description || '').trim()
  return (
    <button
      type="button"
      className="platform-doc-type-tile"
      onClick={onOpen}
      style={{
        width: '100%',
        maxWidth: DOC_TYPE_MAX_PX,
        margin: 0,
        padding: 0,
        textAlign: 'left',
        cursor: 'pointer',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(107, 15, 15, 0.04)',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        font: 'inherit',
        color: 'inherit',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: BRAND.softMaroonBg,
            color: BRAND.maroon,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          aria-hidden
        >
          <FileTextOutlined style={{ fontSize: 17 }} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.3,
              color: '#1f1f1f',
              letterSpacing: '-0.01em',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {item.name}
          </div>
          <code
            style={{
              display: 'inline-block',
              marginTop: 6,
              fontSize: 11,
              lineHeight: 1.2,
              color: 'rgba(0,0,0,0.45)',
              background: BRAND.surface,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 4,
              padding: '2px 6px',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.slug}
          </code>
        </div>

        <FlowStatus item={item} />

        {desc ? (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: 'rgba(0,0,0,0.45)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {desc}
          </div>
        ) : null}
      </div>
    </button>
  )
}

export default function PlatformDashboard() {
  const navigate = useNavigate()
  const message = useAppMessage()
  const { isMobile } = useBreakpoint()
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
        <div
          className="platform-doc-type-empty"
          style={{
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(107, 15, 15, 0.04)',
            padding: isMobile ? '28px 20px' : '36px 28px',
            textAlign: 'center',
            maxWidth: 520,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: BRAND.softMaroonBg,
              color: BRAND.maroon,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
            aria-hidden
          >
            <FileTextOutlined style={{ fontSize: 20 }} />
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#1f1f1f',
              letterSpacing: '-0.01em',
              marginBottom: 6,
            }}
          >
            No document types yet
          </div>
          <Paragraph
            type="secondary"
            style={{ margin: '0 auto 18px', maxWidth: 360, fontSize: 13, lineHeight: 1.5 }}
          >
            Start from scratch or install a starter kit to create your first type and flow.
          </Paragraph>
          <Space wrap style={{ justifyContent: 'center' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Create from scratch
            </Button>
            <Button icon={<RocketOutlined />} onClick={openPresets}>
              Install starter kit
            </Button>
          </Space>
        </div>
      )}

      {!loading && types.length > 0 && (
        <Card
          title="Document types"
          styles={{
            header: isMobile
              ? { flexWrap: 'wrap', gap: 8, rowGap: 10, alignItems: 'flex-start' }
              : undefined,
          }}
          extra={
            <Space wrap size={[8, 8]} className="platform-dashboard-actions">
              <Button icon={<AppstoreAddOutlined />} onClick={openPresets}>
                Starter kit
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                New type
              </Button>
            </Space>
          }
          style={{ borderRadius: 12, borderColor: BRAND.border }}
        >
          <div
            className="platform-doc-type-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? `repeat(auto-fill, minmax(min(100%, ${DOC_TYPE_MIN_PX}px), 1fr))`
                : `repeat(auto-fill, minmax(${DOC_TYPE_MIN_PX}px, ${DOC_TYPE_MAX_PX}px))`,
              gap: 14,
              justifyContent: 'start',
            }}
          >
            {types.map((item) => (
              <DocumentTypeCard
                key={item.id}
                item={item}
                onOpen={() => navigate(`/platform/document-types/${item.id}`)}
              />
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
