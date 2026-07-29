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
  Spin,
  Tooltip,
  Typography,
} from 'antd'
import {
  AppstoreAddOutlined,
  FileTextOutlined,
  PlusOutlined,
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
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import DocTypeIconPicker, { DocTypeIconGlyph } from './DocTypeIconPicker'
import { DEFAULT_DOC_TYPE_ICON } from './docTypeIcons'

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
const DOC_TYPE_MIN_PX = 180
const DOC_TYPE_MAX_PX = 220

function DocumentTypeCard({ item, onOpen }) {
  const tipParts = []
  if (item.slug) tipParts.push(item.slug)
  if (String(item.description || '').trim()) tipParts.push(String(item.description).trim())
  const tip = tipParts.join(' — ') || undefined

  const card = (
    <button
      type="button"
      className="platform-doc-type-tile"
      onClick={onOpen}
      style={{
        width: '100%',
        maxWidth: DOC_TYPE_MAX_PX,
        margin: 0,
        padding: 0,
        textAlign: 'center',
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
          padding: '20px 14px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <DocTypeIconGlyph iconKey={item.icon} size={56} iconSize={26} />
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
            maxWidth: '100%',
          }}
        >
          {item.name}
        </div>
      </div>
    </button>
  )

  return tip ? <Tooltip title={tip}>{card}</Tooltip> : card
}

export default function PlatformDashboard() {
  const navigate = useNavigate()
  const message = useAppMessage()
  const { isMobile } = useBreakpoint()
  const { isOrgAdmin } = usePlatformAuth()
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

  const openCreate = () => {
    createForm.setFieldsValue({ icon: DEFAULT_DOC_TYPE_ICON })
    setCreateOpen(true)
  }

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
        icon: values.icon || DEFAULT_DOC_TYPE_ICON,
      })
      message.success('Document type created')
      setCreateOpen(false)
      createForm.resetFields()
      navigate(`/platform/document-types/${created.id}`)
    } catch (err) {
      const status = err?.response?.status
      const detail = await readPlatformErrorDetail(err)
      if (status === 409) {
        message.error(
          detail ||
            'A document type with this name already exists. Choose a different name.'
        )
      } else {
        message.error(detail || 'Could not create document type')
      }
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
    message.info('Open an existing type, then use its Templates tab to add another file.')
  }

  const header = useMemo(
    () => (
      <>
        <Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Title>
      </>
    ),
    []
  )
  usePlatformPageChrome({ header })

  return (
    <div className="platform-page-enter">
      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spin size="large" />
        </div>
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
            {isOrgAdmin
              ? 'Create a type or install a starter kit to begin.'
              : 'Ask an organization admin to create a document type.'}
          </Paragraph>
          {isOrgAdmin ? (
            <Space wrap style={{ justifyContent: 'center' }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Create from scratch
              </Button>
              <Button icon={<AppstoreAddOutlined />} onClick={openPresets}>
                Install starter kit
              </Button>
            </Space>
          ) : null}
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
            isOrgAdmin ? (
              <Space wrap size={[8, 8]} className="platform-dashboard-actions">
                <Button icon={<AppstoreAddOutlined />} onClick={openPresets}>
                  Starter kit
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  New type
                </Button>
              </Space>
            ) : null
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
            message="Need another file with the same fields? Open that type and add a template there."
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
            message={`“${nearDuplicateTypes[0].name}” already exists.`}
            description="Open it to add another file, or create a new type if the fields must differ."
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
        <Form
          form={createForm}
          layout="vertical"
          onFinish={onCreate}
          requiredMark={false}
          initialValues={{ icon: DEFAULT_DOC_TYPE_ICON }}
        >
          <Form.Item name="icon" label="Icon">
            <DocTypeIconPicker />
          </Form.Item>
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
          Structure only — types and draft flows. No template files.
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
              <List.Item.Meta title={p.name} description={p.description} />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  )
}
