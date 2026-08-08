import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Result,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
// Switch already imported above — country_selector Advanced uses it.
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  NumberOutlined,
  PlusOutlined,
  SaveOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  addFieldDefinition,
  addFlowStep,
  createDraftFromPublished,
  createFlow,
  createTemplateDraftFromPublished,
  createTemplateFlow,
  deleteFieldDefinition,
  deleteFlowStep,
  getDocumentType,
  listDocumentTypes,
  listFieldDefinitions,
  listFlowSteps,
  listOptionLists,
  listOrgTemplates,
  listTemplateFlowHistory,
  publishFlow,
  readPlatformErrorDetail,
  updateDocumentType,
  deleteDocumentType,
  updateFieldDefinition,
  updateFlowStep,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import TemplatesPanel from './TemplatesPanel'
import DocTypeIconPicker, { DocTypeIconGlyph } from './DocTypeIconPicker'
import { DEFAULT_DOC_TYPE_ICON, normalizeDocTypeIcon } from './docTypeIcons'

const { Title, Paragraph, Text } = Typography

const STEP_TYPES = [
  ['text_field', 'Text field'],
  ['number_field', 'Number field'],
  ['date_field', 'Date field'],
  ['dropdown', 'Dropdown'],
  ['party_selector', 'Party selector'],
  ['country_selector', 'Country selector'],
  ['file_upload', 'File upload'],
  ['rich_text', 'Rich text'],
  ['custom_fields', 'Custom fields'],
]

/** Steps whose outputs come from FieldDefinition rows (mapping + generate). */
const STEPS_WITH_FIELD_DEFINITIONS = new Set([
  'text_field',
  'number_field',
  'date_field',
  'dropdown',
  'rich_text',
  'custom_fields',
])

const DEFAULT_FIELD_TYPE_BY_STEP = {
  text_field: 'text',
  number_field: 'number',
  date_field: 'date',
  dropdown: 'dropdown',
  rich_text: 'text',
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
]

/** Match FieldModal / backend field_key pattern: ^[a-z][a-z0-9_]*$ */
function slugifyFieldKey(label) {
  let key = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
  if (!key || !/^[a-z]/.test(key)) {
    key = `field_${key || 'value'}`.replace(/_+/g, '_')
  }
  return key.slice(0, 64)
}

const STEP_META = {
  text_field: { label: 'Text field', icon: FontSizeOutlined },
  number_field: { label: 'Number field', icon: NumberOutlined },
  date_field: { label: 'Date field', icon: CalendarOutlined },
  dropdown: { label: 'Dropdown', icon: UnorderedListOutlined },
  party_selector: { label: 'Party selector', icon: TeamOutlined },
  country_selector: { label: 'Country selector', icon: GlobalOutlined },
  file_upload: { label: 'File upload', icon: UploadOutlined },
  rich_text: { label: 'Rich text', icon: FileTextOutlined },
  custom_fields: { label: 'Custom fields', icon: FileAddOutlined },
}

function optionsToText(options) {
  if (!Array.isArray(options)) return ''
  return options
    .map((item) => (typeof item === 'string' ? item : item?.label || item?.value || ''))
    .filter(Boolean)
    .join(', ')
}

function textToOptions(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function FieldModal({
  open,
  field,
  optionLists,
  documentTypeId,
  onCancel,
  onSave,
  saving,
}) {
  const [form] = Form.useForm()
  const fieldType = Form.useWatch('field_type', form)
  const optionSource = Form.useWatch('option_source', form)
  // When adding: keep field_key in sync with label until the admin edits the key.
  const keyTouchedRef = useRef(false)
  const [barcodeStatus, setBarcodeStatus] = useState({
    loading: false,
    detected: false,
    templateCount: 0,
  })

  useEffect(() => {
    if (!open) return
    keyTouchedRef.current = Boolean(field?.field_key)
    const hasList = Boolean(field?.option_list_id)
    form.setFieldsValue({
      field_key: field?.field_key || '',
      field_label: field?.field_label || '',
      field_type: field?.field_type || 'text',
      is_required: field?.is_required || false,
      is_auto_generated: Boolean(field?.is_auto_generated),
      auto_prefix:
        (field?.auto_config_json && field.auto_config_json.prefix) || '',
      is_trade_linked_position:
        field?.auto_config_json?.kind === 'trade_linked_position' ||
        field?.auto_config_json?.kind === 'trade_linked_duties',
      duties_field_key:
        (field?.auto_config_json && field.auto_config_json.duties_field_key) ||
        'duties_block',
      option_source: hasList ? 'list' : 'inline',
      option_list_id: field?.option_list_id || undefined,
      options: optionsToText(field?.options_json),
    })
  }, [field, form, open])

  const onLabelChange = (event) => {
    if (keyTouchedRef.current) return
    form.setFieldValue('field_key', slugifyFieldKey(event.target.value))
  }

  const isAutoGenerated = Form.useWatch('is_auto_generated', form)

  useEffect(() => {
    if (!open || !isAutoGenerated || !documentTypeId) {
      setBarcodeStatus({ loading: false, detected: false, templateCount: 0 })
      return undefined
    }
    let cancelled = false
    setBarcodeStatus((prev) => ({ ...prev, loading: true }))
    listOrgTemplates(documentTypeId)
      .then((rows) => {
        if (cancelled) return
        const list = rows || []
        setBarcodeStatus({
          loading: false,
          detected: list.some((t) => t.has_ref_number_barcode),
          templateCount: list.length,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setBarcodeStatus({ loading: false, detected: false, templateCount: 0 })
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, isAutoGenerated, documentTypeId])

  return (
    <Modal
      title={field ? 'Edit field' : 'Add field'}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => {
          const isDropdown = values.field_type === 'dropdown'
          const useList = isDropdown && values.option_source === 'list'
          const isAuto = !!values.is_auto_generated
          const isTradeLinked = !isAuto && !!values.is_trade_linked_position
          const key = values.field_key.trim()
          onSave({
            field_key: key,
            field_label: values.field_label.trim(),
            field_type: values.field_type,
            is_required: isAuto ? false : !!values.is_required,
            is_auto_generated: isAuto,
            auto_config_json: isAuto
              ? { kind: 'ref_number', prefix: String(values.auto_prefix || '').trim() }
              : isTradeLinked
                ? {
                    kind: 'trade_linked_position',
                    duties_field_key: String(
                      values.duties_field_key || 'duties_block'
                    ).trim() || 'duties_block',
                  }
                : null,
            option_list_id: useList ? values.option_list_id || null : null,
            options_json: isDropdown
              ? useList
                ? field?.options_json ?? null
                : textToOptions(values.options)
              : null,
          })
        }}
      >
        <Form.Item
          name="field_label"
          label="Label"
          rules={[{ required: true, message: 'Label is required' }]}
        >
          <Input
            placeholder="Reference Number"
            onChange={onLabelChange}
          />
        </Form.Item>
        <Form.Item
          name="field_key"
          label="Field key"
          extra={
            field
              ? 'Used in mappings and generate answers — change carefully'
              : 'Prefer ref_number for auto-ref. Never use ref_number_barcode (barcode is not a separate field).'
          }
          rules={[
            { required: true, message: 'Field key is required' },
            { pattern: /^[a-z][a-z0-9_]*$/, message: 'Use lowercase letters, numbers, underscores' },
            {
              validator: async (_, value) => {
                if (String(value || '').trim().toLowerCase() === 'ref_number_barcode') {
                  throw new Error(
                    'Barcode is not a separate field — use one Auto reference number field (e.g. ref_number)'
                  )
                }
              },
            },
          ]}
        >
          <Input
            placeholder="ref_number"
            onChange={() => {
              keyTouchedRef.current = true
            }}
          />
        </Form.Item>
        <Form.Item name="field_type" label="Field type">
          <Select options={FIELD_TYPES} />
        </Form.Item>
        <Form.Item
          name="is_auto_generated"
          valuePropName="checked"
          extra="Value is computed at generate time (e.g. OLAW-2026-0001). Hidden from the generate wizard. Map both {{ref_number}} and {{ref_number_barcode}} to this field when present in the template."
        >
          <Checkbox
            onChange={(e) => {
              if (e.target.checked) {
                form.setFieldValue('is_trade_linked_position', false)
              }
            }}
          >
            Auto reference number
          </Checkbox>
        </Form.Item>
        {isAutoGenerated ? (
          <>
            <Form.Item
              name="auto_prefix"
              label="Reference prefix"
              rules={[
                { required: true, message: 'Prefix is required' },
                {
                  pattern: /^[A-Za-z0-9]{1,16}$/,
                  message: 'Use 1–16 letters or numbers',
                },
              ]}
              extra='Format: PREFIX-YEAR-SEQUENCE (e.g. "OLAW-2026-0001")'
            >
              <Input placeholder="OLAW" maxLength={16} />
            </Form.Item>
            <Alert
              type={barcodeStatus.detected ? 'success' : 'info'}
              showIcon
              style={{ marginBottom: 16 }}
              message={
                barcodeStatus.loading
                  ? 'Checking templates for barcode placeholder…'
                  : barcodeStatus.detected
                    ? 'Barcode placeholder detected in template'
                    : 'Not detected — upload a template with {{ref_number_barcode}} to include a barcode image'
              }
              description={
                barcodeStatus.loading
                  ? null
                  : barcodeStatus.detected
                    ? 'Barcode generation is automatic when the filled template contains {{ref_number_barcode}}. No separate barcode field is needed.'
                    : barcodeStatus.templateCount === 0
                      ? 'No templates uploaded for this document type yet.'
                      : 'Text reference numbers still work via {{ref_number}}. Add the barcode placeholder to a template if you need the image.'
              }
            />
          </>
        ) : null}
        {!isAutoGenerated ? (
          <>
            <Form.Item
              name="is_trade_linked_position"
              valuePropName="checked"
              extra="In Generate, this field becomes a trade search. Selecting a trade fills this field with the trade name and auto-fills the duties companion (editable). Uses the organization Trade Bank."
            >
              <Checkbox
                onChange={(e) => {
                  if (e.target.checked) {
                    form.setFieldValue('is_auto_generated', false)
                  }
                }}
              >
                Trade-linked position
              </Checkbox>
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) =>
                prev.is_trade_linked_position !== cur.is_trade_linked_position
              }
            >
              {() =>
                form.getFieldValue('is_trade_linked_position') ? (
                  <Form.Item
                    name="duties_field_key"
                    label="Duties companion field key"
                    extra="Must exist in this flow (usually duties_block). Hidden in the wizard and filled from the trade selection."
                    rules={[{ required: true, message: 'Required' }]}
                    initialValue="duties_block"
                  >
                    <Input placeholder="duties_block" />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </>
        ) : null}
        {fieldType === 'dropdown' && !isAutoGenerated && (
          <>
            <Form.Item name="option_source" label="Options source" initialValue="inline">
              <Select
                options={[
                  { value: 'inline', label: 'Inline (comma-separated)' },
                  { value: 'list', label: 'Shared option list' },
                ]}
              />
            </Form.Item>
            {optionSource === 'list' ? (
              <Form.Item
                name="option_list_id"
                label="Option list"
                rules={[{ required: true, message: 'Choose a list' }]}
              >
                <Select
                  placeholder="Select a list"
                  options={(optionLists || []).map((row) => ({
                    value: row.id,
                    label: `${row.name} (${row.slug})`,
                  }))}
                />
              </Form.Item>
            ) : (
              <Form.Item
                name="options"
                label="Options"
                extra="Comma-separated values"
                rules={[{ required: true, message: 'Add at least one option' }]}
              >
                <Input placeholder="Permanent, Fixed term, Contractor" />
              </Form.Item>
            )}
          </>
        )}
        <Form.Item name="is_required" valuePropName="checked" hidden={isAutoGenerated}>
          <Checkbox>Required</Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving} block>
          Save field
        </Button>
      </Form>
    </Modal>
  )
}

function CustomFieldsPanel({ step, editable, documentTypeId, onChanged }) {
  const message = useAppMessage()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [saving, setSaving] = useState(false)
  const [optionLists, setOptionLists] = useState([])

  useEffect(() => {
    let cancelled = false
    listOptionLists()
      .then((rows) => {
        if (!cancelled) setOptionLists(rows || [])
      })
      .catch(() => {
        if (!cancelled) setOptionLists([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openAdd = () => {
    setEditingField(null)
    setModalOpen(true)
  }

  const openEdit = (field) => {
    setEditingField(field)
    setModalOpen(true)
  }

  const saveField = async (payload) => {
    setSaving(true)
    try {
      if (editingField) await updateFieldDefinition(editingField.id, payload)
      else await addFieldDefinition(step.id, payload)
      message.success(editingField ? 'Field updated' : 'Field added')
      setModalOpen(false)
      await onChanged()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not save field')
    } finally {
      setSaving(false)
    }
  }

  const removeField = async (fieldId) => {
    try {
      await deleteFieldDefinition(fieldId)
      message.success('Field deleted')
      await onChanged()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not delete field')
    }
  }

  const listNameById = Object.fromEntries(
    (optionLists || []).map((row) => [row.id, row.name])
  )

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text strong>Fields</Text>
        {editable && (
          <Button size="small" icon={<PlusOutlined />} onClick={openAdd}>
            Add field
          </Button>
        )}
      </div>
      {step.fields?.length ? (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {step.fields.map((field) => (
            <div
              key={field.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 10px',
                background: 'var(--surface-2)',
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong>{field.field_label}</Text>{' '}
                <Tag>{field.field_key}</Tag>
                <Tag color="purple">{field.field_type}</Tag>
                {field.is_auto_generated && (
                  <Tag color="blue">
                    Auto-ref
                    {field.auto_config_json?.prefix
                      ? ` (${field.auto_config_json.prefix})`
                      : ''}
                  </Tag>
                )}
                {field.is_required && !field.is_auto_generated && (
                  <Tag color="red">Required</Tag>
                )}
                {field.field_type === 'dropdown' && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">
                      {field.option_list_id
                        ? `List: ${listNameById[field.option_list_id] || `#${field.option_list_id}`}`
                        : optionsToText(field.options_json) || 'No options'}
                    </Text>
                  </div>
                )}
              </div>
              {editable && (
                <Space size={4} wrap>
                  <Button
                    className="platform-touch-target"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(field)}
                    aria-label="Edit field"
                  />
                  <Popconfirm
                    title="Delete this field?"
                    onConfirm={() => removeField(field.id)}
                  >
                    <Button
                      className="platform-touch-target"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="Delete field"
                    />
                  </Popconfirm>
                </Space>
              )}
            </div>
          ))}
        </Space>
      ) : (
        <Text type="secondary">No fields defined.</Text>
      )}
      <FieldModal
        open={modalOpen}
        field={editingField}
        optionLists={optionLists}
        documentTypeId={documentTypeId}
        onCancel={() => setModalOpen(false)}
        onSave={saveField}
        saving={saving}
      />
    </div>
  )
}

function StepCard({
  step,
  index,
  count,
  editable,
  busy,
  documentTypeId,
  onPatch,
  onDelete,
  onMove,
  onReload,
}) {
  const { isMobile } = useBreakpoint()
  const meta = STEP_META[step.step_type] || {
    label: step.step_type,
    icon: FileTextOutlined,
  }
  const Icon = meta.icon
  const [optionsText, setOptionsText] = useState(
    optionsToText(step.config_json?.options)
  )

  useEffect(() => {
    setOptionsText(optionsToText(step.config_json?.options))
  }, [step.config_json])

  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        opacity: step.is_enabled ? 1 : 0.67,
        borderColor: editable ? 'var(--border)' : 'var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: 'var(--surface-3)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon />
        </div>
        <div
          style={{
            width: isMobile ? 'auto' : 140,
            minWidth: isMobile ? 0 : 140,
            flex: isMobile ? '1 1 120px' : '0 0 auto',
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 600 }}>{meta.label}</div>
          <Text type="secondary">Step {index + 1}</Text>
        </div>
        <Input
          value={step.label}
          disabled={!editable || busy}
          aria-label={`Label for step ${index + 1}`}
          style={{ flex: '1 1 160px', minWidth: 0 }}
          onChange={(event) => onPatch(step.id, { label: event.target.value }, false)}
          onBlur={() => onPatch(step.id, { label: step.label.trim() || meta.label }, true)}
        />
        <Tooltip title={step.is_enabled ? 'Enabled' : 'Disabled'}>
          <Switch
            checked={step.is_enabled}
            disabled={!editable || busy}
            onChange={(checked) => onPatch(step.id, { is_enabled: checked }, true)}
          />
        </Tooltip>
        {editable && (
          <Space size={4} wrap>
            <Button
              className="platform-touch-target"
              icon={<ArrowUpOutlined />}
              disabled={busy || index === 0}
              onClick={() => onMove(index, -1)}
              aria-label="Move step up"
            />
            <Button
              className="platform-touch-target"
              icon={<ArrowDownOutlined />}
              disabled={busy || index === count - 1}
              onClick={() => onMove(index, 1)}
              aria-label="Move step down"
            />
            <Popconfirm title="Delete this step and its fields?" onConfirm={() => onDelete(step.id)}>
              <Button
                className="platform-touch-target"
                danger
                icon={<DeleteOutlined />}
                disabled={busy}
                aria-label="Delete step"
              />
            </Popconfirm>
          </Space>
        )}
      </div>

      {step.step_type === 'dropdown' && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Text strong>Dropdown options</Text>
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input
              value={optionsText}
              disabled={!editable || busy}
              placeholder="Option one, Option two"
              onChange={(event) => setOptionsText(event.target.value)}
            />
            {editable && (
              <Button
                icon={<SaveOutlined />}
                disabled={busy}
                onClick={() =>
                  onPatch(
                    step.id,
                    {
                      config_json: {
                        ...(step.config_json || {}),
                        options: textToOptions(optionsText),
                      },
                    },
                    true
                  )
                }
              >
                Save
              </Button>
            )}
          </Space.Compact>
        </div>
      )}

      {step.step_type === 'country_selector' && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Text strong>Country selector</Text>
          <Paragraph type="secondary" style={{ margin: '4px 0 10px', fontSize: 12 }}>
            Off = free-text name/code. On = world list with flags.
          </Paragraph>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <Text>Use built-in world country list</Text>
              <Switch
                checked={!!step.config_json?.use_builtin_country_list}
                disabled={!editable || busy}
                onChange={(checked) =>
                  onPatch(
                    step.id,
                    {
                      config_json: {
                        ...(step.config_json || {}),
                        use_builtin_country_list: checked,
                        ...(checked
                          ? {}
                          : { include_country_code: false }),
                      },
                    },
                    true
                  )
                }
              />
            </div>
            {!!step.config_json?.use_builtin_country_list && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Text>Also submit country code (ISO)</Text>
                <Switch
                  checked={!!step.config_json?.include_country_code}
                  disabled={!editable || busy}
                  onChange={(checked) =>
                    onPatch(
                      step.id,
                      {
                        config_json: {
                          ...(step.config_json || {}),
                          include_country_code: checked,
                        },
                      },
                      true
                    )
                  }
                />
              </div>
            )}
          </Space>
        </div>
      )}

      {STEPS_WITH_FIELD_DEFINITIONS.has(step.step_type) && (
        <CustomFieldsPanel
          step={step}
          editable={editable}
          documentTypeId={documentTypeId}
          onChanged={onReload}
        />
      )}
    </Card>
  )
}

/**
 * Per-template flow editor.
 * - Standalone legacy route `/templates/:id/flow` redirects to the combined workspace.
 * - `embedded` mode: hosted inside TemplateWorkspacePage Flow tab (no page chrome).
 */
export default function FlowBuilderPage({
  embedded = false,
  onChromeChange = null,
} = {}) {
  const { id, templateId: templateIdParam } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const message = useAppMessage()
  const { isOrgAdmin } = usePlatformAuth()
  const documentTypeId = Number(id)
  const templateId =
    templateIdParam != null && templateIdParam !== ''
      ? Number(templateIdParam)
      : null
  const isTemplateScope =
    Number.isFinite(templateId) && templateId > 0

  const [documentType, setDocumentType] = useState(null)
  const [templateMeta, setTemplateMeta] = useState(null)
  const [flow, setFlow] = useState(null)
  const [steps, setSteps] = useState([])
  const [editable, setEditable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()

  // Documents-only at document-type scope (shared flow tab removed — Phase C).
  // Standalone template flow URL redirects to the combined Mapping|Flow workspace.
  const requestedTab = searchParams.get('tab')
  const staffBlockedFromFlow = !isOrgAdmin && isTemplateScope && !embedded

  useEffect(() => {
    // Drop legacy ?tab=flow deep-links to the removed shared editor
    if (!isTemplateScope && requestedTab === 'flow') {
      setSearchParams({}, { replace: true })
    }
  }, [isTemplateScope, requestedTab, setSearchParams])

  const hydrateSteps = useCallback(async (flowId) => {
    const rows = await listFlowSteps(flowId)
    const hydrated = await Promise.all(
      rows.map(async (step) => ({
        ...step,
        fields: STEPS_WITH_FIELD_DEFINITIONS.has(step.step_type)
          ? await listFieldDefinitions(step.id)
          : [],
      }))
    )
    setSteps(hydrated.sort((a, b) => a.order_index - b.order_index))
  }, [])

  const loadBuilder = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [detail, types, history, templates] = await Promise.all([
        getDocumentType(documentTypeId),
        listDocumentTypes(),
        isTemplateScope
          ? listTemplateFlowHistory(templateId)
          : Promise.resolve([]),
        listOrgTemplates(documentTypeId),
      ])
      const statusDetail = types.find((item) => item.id === documentTypeId) || detail
      setDocumentType({
        ...detail,
        ...statusDetail,
        // Used for empty-state messaging on the Documents tab
        _template_count: (templates || []).length,
      })

      if (isTemplateScope) {
        const match = (templates || []).find((t) => t.id === templateId)
        if (!match) {
          setLoadError('That document was not found for this type.')
          setTemplateMeta(null)
          setFlow(null)
          setSteps([])
          return
        }
        setTemplateMeta(match)
      } else {
        setTemplateMeta(null)
        setFlow(null)
        setSteps([])
        setEditable(false)
        return
      }

      const published = history.find((item) => item.is_published) || null
      const drafts = history
        .filter(
          (item) =>
            !item.is_published && (!published || item.version > published.version)
        )
        .sort((a, b) => b.version - a.version)
      const draft = drafts[0] || null
      const active = draft || published
      setFlow(active)
      setEditable(!!draft && isOrgAdmin)
      if (active) await hydrateSteps(active.id)
      else setSteps([])
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load flow builder')
    } finally {
      setLoading(false)
    }
  }, [documentTypeId, hydrateSteps, isOrgAdmin, isTemplateScope, templateId])

  useEffect(() => {
    loadBuilder()
  }, [loadBuilder])

  const status = useMemo(() => {
    if (isTemplateScope) {
      if (flow?.is_published) {
        return { text: 'Live', dot: '#52c41a' }
      }
      if (flow && !flow.is_published) {
        return { text: 'Draft', dot: '#faad14' }
      }
      return { text: 'Not set up', dot: '#8c8c8c' }
    }
    // Doc-type page no longer hosts a shared flow editor
    return null
  }, [flow, isTemplateScope])

  const startFlow = async () => {
    setBusy(true)
    try {
      if (isTemplateScope) {
        await createTemplateFlow(templateId)
      } else {
        await createFlow(documentTypeId)
      }
      message.success('Draft flow created')
      await loadBuilder()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not create flow')
    } finally {
      setBusy(false)
    }
  }

  const editPublished = async () => {
    setBusy(true)
    try {
      if (isTemplateScope) {
        await createTemplateDraftFromPublished(templateId)
      } else {
        await createDraftFromPublished(documentTypeId)
      }
      message.success('New draft created from the live version')
      await loadBuilder()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not create draft')
    } finally {
      setBusy(false)
    }
  }

  const patchStep = async (stepId, payload, persist) => {
    setSteps((current) =>
      current.map((item) => (item.id === stepId ? { ...item, ...payload } : item))
    )
    if (!persist) return
    setBusy(true)
    try {
      const updated = await updateFlowStep(stepId, payload)
      setSteps((current) =>
        current.map((item) => (item.id === stepId ? { ...item, ...updated } : item))
      )
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not update step')
      await hydrateSteps(flow.id)
    } finally {
      setBusy(false)
    }
  }

  const moveStep = async (index, direction) => {
    const otherIndex = index + direction
    const moving = steps[index]
    const other = steps[otherIndex]
    if (!moving || !other) return
    setBusy(true)
    try {
      // Three PATCHes avoid the unique(flow_config_id, order_index) collision.
      const temporaryIndex = Math.max(...steps.map((item) => item.order_index)) + 1000
      await updateFlowStep(moving.id, { order_index: temporaryIndex })
      await updateFlowStep(other.id, { order_index: moving.order_index })
      await updateFlowStep(moving.id, { order_index: other.order_index })
      await hydrateSteps(flow.id)
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not reorder steps')
      await hydrateSteps(flow.id)
    } finally {
      setBusy(false)
    }
  }

  const removeStep = async (stepId) => {
    setBusy(true)
    try {
      await deleteFlowStep(stepId)
      message.success('Step deleted')
      await hydrateSteps(flow.id)
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not delete step')
      await hydrateSteps(flow.id)
    } finally {
      setBusy(false)
    }
  }

  const addStep = async (values) => {
    setBusy(true)
    try {
      const maxOrder = steps.length
        ? Math.max(...steps.map((item) => item.order_index))
        : -1
      const label = values.label.trim()
      const step = await addFlowStep(flow.id, {
        step_type: values.step_type,
        label,
        is_enabled: true,
        order_index: maxOrder + 1,
        config_json: values.step_type === 'dropdown' ? { options: [] } : null,
      })
      // Single-value steps need a FieldDefinition to be mappable / fillable.
      // custom_fields is multi-field — user adds keys explicitly.
      const defaultType = DEFAULT_FIELD_TYPE_BY_STEP[values.step_type]
      if (defaultType) {
        await addFieldDefinition(step.id, {
          field_key: slugifyFieldKey(label),
          field_label: label,
          field_type: defaultType,
          is_required: true,
          options_json: values.step_type === 'dropdown' ? [] : null,
        })
      }
      message.success('Step added')
      setAddOpen(false)
      addForm.resetFields()
      await hydrateSteps(flow.id)
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not add step')
    } finally {
      setBusy(false)
    }
  }

  const publish = useCallback(async () => {
    if (!editable || !flow) return
    setBusy(true)
    try {
      await publishFlow(flow.id)
      message.success('Flow published — this version is now live')
      await loadBuilder()
    } catch (error) {
      message.error((await readPlatformErrorDetail(error)) || 'Could not publish flow')
    } finally {
      setBusy(false)
    }
  }, [editable, flow, loadBuilder, message])

  useEffect(() => {
    if (!embedded || typeof onChromeChange !== 'function') return
    onChromeChange({
      editable,
      busy,
      status,
      onPublish: isOrgAdmin ? publish : null,
      templateMeta,
      loading,
    })
  }, [
    embedded,
    onChromeChange,
    editable,
    busy,
    status,
    publish,
    isOrgAdmin,
    templateMeta,
    loading,
  ])

  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm] = Form.useForm()
  const [deleting, setDeleting] = useState(false)

  const openEdit = () => {
    editForm.setFieldsValue({
      name: documentType?.name || '',
      description: documentType?.description || '',
      icon: normalizeDocTypeIcon(documentType?.icon),
    })
    setEditOpen(true)
  }

  const saveEdit = async () => {
    try {
      const values = await editForm.validateFields()
      setEditSaving(true)
      const updated = await updateDocumentType(documentTypeId, {
        name: String(values.name || '').trim(),
        description: String(values.description || '').trim() || null,
        icon: normalizeDocTypeIcon(values.icon),
      })
      setDocumentType((prev) => ({ ...prev, ...updated }))
      setEditOpen(false)
      message.success('Document type updated')
    } catch (error) {
      if (error?.errorFields) return
      message.error((await readPlatformErrorDetail(error)) || 'Could not update document type')
    } finally {
      setEditSaving(false)
    }
  }

  const confirmDelete = async () => {
    let templateCount = 0
    let generatedCount = 0
    try {
      const templates = await listOrgTemplates(documentTypeId)
      templateCount = (templates || []).length
      generatedCount = (templates || []).reduce(
        (sum, row) => sum + (Number(row.generated_document_count) || 0),
        0
      )
    } catch {
      /* summary is optional */
    }

    const summaryBits = []
    if (templateCount) {
      summaryBits.push(
        `${templateCount} document${templateCount === 1 ? '' : 's'} (templates)`
      )
    }
    if (generatedCount) {
      summaryBits.push(
        `${generatedCount} generated document${generatedCount === 1 ? '' : 's'}`
      )
    }

    Modal.confirm({
      title: 'Delete this document type?',
      width: 480,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            This document type will be archived and hidden from your dashboard. You
            won&apos;t be able to open its flow or templates for new work.
          </p>
          <p style={{ marginBottom: summaryBits.length ? 8 : 0 }}>
            Previously generated documents remain available for download.
          </p>
          {summaryBits.length ? (
            <p style={{ marginBottom: 0, color: 'var(--text-muted)' }}>
              {summaryBits.join(', ')} will remain in history.
            </p>
          ) : null}
        </div>
      ),
      okText: 'Delete document type',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setDeleting(true)
        try {
          await deleteDocumentType(documentTypeId)
          message.success('Document type archived')
          navigate('/platform/document-types', { replace: true })
        } catch (error) {
          message.error(
            (await readPlatformErrorDetail(error)) || 'Could not delete document type'
          )
          throw error
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  if (isTemplateScope && !embedded) {
    return (
      <Navigate
        to={`/platform/document-types/${documentTypeId}/templates/${templateId}?tab=flow`}
        replace
      />
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
        <Spin size="large" description="Loading flow..." />
      </div>
    )
  }

  const chromeTitle = isTemplateScope
    ? templateMeta?.display_name ||
      templateMeta?.docx_filename ||
      'Document'
    : documentType?.name || 'Document type'

  const templateFlowBody = (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <Paragraph type="secondary" style={{ margin: 0 }}>
              {flow
                ? `Flow version ${flow.version} · this document only`
                : 'Add the steps users complete for this document'}
            </Paragraph>
            {flow?.is_published && !editable ? (
              <Button icon={<EditOutlined />} onClick={editPublished} loading={busy}>
                Edit
              </Button>
            ) : null}
          </div>

          {loadError && <Alert type="error" showIcon message={loadError} />}

          {!loadError && !flow && (
            <Card style={{ borderRadius: 16 }}>
              <Empty description="This document has no flow yet.">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={startFlow}
                  loading={busy}
                >
                  Create flow
                </Button>
              </Empty>
            </Card>
          )}

          {!loadError && flow && (
            <>
              {editable ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={
                    flow.version > 1
                      ? `Editing draft v${flow.version}; the published version remains live until you publish this draft.`
                      : `Editing first draft v${flow.version}; nothing is live yet.`
                  }
                />
              ) : (
                <Alert
                  type="success"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={`Published v${flow.version} is live. Click Edit to create a separate draft.`}
                />
              )}

              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {steps.map((step, index) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={index}
                    count={steps.length}
                    editable={editable}
                    busy={busy}
                    documentTypeId={documentTypeId}
                    onPatch={patchStep}
                    onDelete={removeStep}
                    onMove={moveStep}
                    onReload={() => hydrateSteps(flow.id)}
                  />
                ))}
              </Space>

              {!steps.length && (
                <Card style={{ borderRadius: 12 }}>
                  <Empty
                    description={
                      editable ? 'No steps yet.' : 'This live flow has no steps.'
                    }
                  />
                </Card>
              )}

              {editable && (
                <Button
                  className="platform-touch-target"
                  icon={<PlusOutlined />}
                  onClick={() => setAddOpen(true)}
                  style={{ marginTop: 16 }}
                  disabled={busy}
                  block
                >
                  Add step
                </Button>
              )}
            </>
          )}

          <Modal
            title="Add step"
            open={addOpen}
            onCancel={() => setAddOpen(false)}
            footer={null}
            destroyOnHidden
          >
            <Form
              form={addForm}
              layout="vertical"
              requiredMark={false}
              onFinish={addStep}
              initialValues={{ step_type: 'text_field' }}
            >
              <Form.Item name="step_type" label="Step type">
                <Select
                  options={STEP_TYPES.map(([value, label]) => ({ value, label }))}
                />
              </Form.Item>
              <Form.Item
                name="label"
                label="Label"
                rules={[{ required: true, message: 'Label is required' }]}
              >
                <Input placeholder="Candidate details" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={busy} block>
                Add step
              </Button>
            </Form>
          </Modal>
        </div>
  )

  if (embedded && isTemplateScope) {
    return templateFlowBody
  }

  return (
    <FlowBuilderChrome
      documentName={chromeTitle}
      iconKey={isTemplateScope ? undefined : documentType?.icon}
      status={status}
      onBack={() =>
        navigate(
          isTemplateScope
            ? `/platform/document-types/${documentTypeId}`
            : '/platform/document-types'
        )
      }
      backLabel={isTemplateScope ? 'Documents' : 'Document types'}
      onEdit={!isTemplateScope && isOrgAdmin ? openEdit : null}
      onDelete={!isTemplateScope && isOrgAdmin ? confirmDelete : null}
      deleting={deleting}
      editable={editable}
      busy={busy}
      onPublish={isOrgAdmin ? publish : null}
    >
      <Modal
        title="Edit document type"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={saveEdit}
        confirmLoading={editSaving}
        okText="Save"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" requiredMark={false}>
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
          <Form.Item label="Slug">
            <Input value={documentType?.slug || ''} disabled />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>
        </Form>
      </Modal>
      {staffBlockedFromFlow ? (
        <Result
          status="403"
          title="Not available for your role"
          subTitle="Flow setup is only available to organization admins."
          extra={
            <Button
              type="primary"
              onClick={() =>
                navigate(`/platform/document-types/${documentTypeId}`)
              }
            >
              Back to Documents
            </Button>
          }
        />
      ) : !isTemplateScope ? (
        <>
          {(documentType?._template_count ?? 0) === 0 ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Upload a document first, then configure its flow"
              description="Each document has its own Flow (open the document, then use the Flow tab). There is no shared flow for this document type."
            />
          ) : null}
          <TemplatesPanel
            documentTypeId={documentTypeId}
            documentTypeName={documentType?.name || 'this document type'}
            hasDraftFlow={false}
            hasPublishedFlow={!!documentType?.has_published_flow}
            canManage={isOrgAdmin}
            onDraftFieldsGenerated={loadBuilder}
          />
        </>
      ) : (
        templateFlowBody
      )}
    </FlowBuilderChrome>
  )
}

function FlowBuilderChrome({
  documentName,
  iconKey,
  status,
  onBack,
  backLabel = 'Document types',
  onEdit,
  onDelete,
  deleting,
  editable,
  busy,
  onPublish,
  children,
}) {
  const { isMobile } = useBreakpoint()
  const { isOrgAdmin } = usePlatformAuth()
  const header = useMemo(
    () => (
      <>
        <Button
          type="text"
          className="platform-back-btn"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          style={{
            alignSelf: 'flex-start',
            marginLeft: -8,
            height: isMobile ? 44 : 28,
            minWidth: isMobile ? 44 : undefined,
            paddingInline: 8,
          }}
        >
          {isMobile ? 'Back' : backLabel}
        </Button>
        <Space align="center" wrap style={{ maxWidth: '100%' }} size={10}>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit document type"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                lineHeight: 0,
              }}
            >
              <DocTypeIconGlyph iconKey={iconKey} size={40} iconSize={18} />
            </button>
          ) : (
            <DocTypeIconGlyph iconKey={iconKey} size={40} iconSize={18} />
          )}
          <Title
            level={isMobile ? 4 : 3}
            style={{
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isMobile ? 'min(100%, 45vw)' : undefined,
            }}
          >
            {documentName}
          </Title>
          {onEdit ? (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={onEdit}
              aria-label="Edit document type"
            >
              {!isMobile ? 'Edit' : null}
            </Button>
          ) : null}
          {isOrgAdmin && status ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--surface-3)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: status.dot || '#8c8c8c',
                  flexShrink: 0,
                }}
              />
              <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Flow: {status.text}
              </Text>
            </span>
          ) : null}
        </Space>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          {!isMobile ? (
            <Paragraph type="secondary" style={{ margin: 0 }}>
              {onEdit
                ? isOrgAdmin
                  ? 'Documents and generation flow for this type.'
                  : 'View and generate documents for this type.'
                : isOrgAdmin
                  ? 'Generation flow for this document.'
                  : 'View the generation flow for this document.'}
            </Paragraph>
          ) : (
            <span />
          )}
          {onDelete ? (
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={onDelete}
              loading={deleting}
            >
              Delete document type
            </Button>
          ) : null}
        </div>
      </>
    ),
    [
      documentName,
      iconKey,
      onBack,
      backLabel,
      onEdit,
      onDelete,
      deleting,
      status?.dot,
      status?.text,
      isMobile,
      isOrgAdmin,
    ]
  )

  const footer = useMemo(
    () =>
      onPublish ? (
      <Tooltip title={!editable ? 'Create or open a draft before publishing' : ''}>
        <span style={{ display: isMobile ? 'block' : undefined, width: isMobile ? '100%' : undefined }}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={!editable}
            loading={busy}
            onClick={onPublish}
            size="large"
            className="platform-touch-target"
            block={isMobile}
          >
            Publish
          </Button>
        </span>
      </Tooltip>
      ) : null,
    [busy, editable, onPublish, isMobile]
  )

  usePlatformPageChrome({ header, footer })
  return children
}
