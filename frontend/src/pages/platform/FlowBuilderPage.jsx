import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  NumberOutlined,
  PlusOutlined,
  SaveOutlined,
  SendOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  addFieldDefinition,
  addFlowStep,
  createDraftFromPublished,
  createFlow,
  deleteFieldDefinition,
  deleteFlowStep,
  getDocumentType,
  listDocumentTypes,
  listFieldDefinitions,
  listFlowHistory,
  listFlowSteps,
  publishFlow,
  readPlatformErrorDetail,
  updateFieldDefinition,
  updateFlowStep,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'
import TemplatesPanel from './TemplatesPanel'

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
  country_selector: { label: 'Country selector', icon: TeamOutlined },
  file_upload: { label: 'File upload', icon: UploadOutlined },
  rich_text: { label: 'Rich text', icon: FileTextOutlined },
  custom_fields: { label: 'Custom fields', icon: FileAddOutlined },
}

function statusFor(type) {
  if (type?.has_published_flow && type?.has_draft_flow) {
    return { text: 'Draft changes pending', color: 'orange' }
  }
  if (type?.has_published_flow) return { text: 'Published', color: 'green' }
  if (type?.has_draft_flow) return { text: 'Draft', color: 'blue' }
  return { text: 'No flow', color: 'default' }
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

function FieldModal({ open, field, onCancel, onSave, saving }) {
  const [form] = Form.useForm()
  const fieldType = Form.useWatch('field_type', form)
  // When adding: keep field_key in sync with label until the admin edits the key.
  const keyTouchedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    keyTouchedRef.current = Boolean(field?.field_key)
    form.setFieldsValue({
      field_key: field?.field_key || '',
      field_label: field?.field_label || '',
      field_type: field?.field_type || 'text',
      is_required: field?.is_required || false,
      options: optionsToText(field?.options_json),
    })
  }, [field, form, open])

  const onLabelChange = (event) => {
    if (keyTouchedRef.current) return
    form.setFieldValue('field_key', slugifyFieldKey(event.target.value))
  }

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
        onFinish={(values) =>
          onSave({
            field_key: values.field_key.trim(),
            field_label: values.field_label.trim(),
            field_type: values.field_type,
            is_required: !!values.is_required,
            options_json:
              values.field_type === 'dropdown' ? textToOptions(values.options) : null,
          })
        }
      >
        <Form.Item
          name="field_label"
          label="Label"
          rules={[{ required: true, message: 'Label is required' }]}
        >
          <Input
            placeholder="Candidate name"
            onChange={onLabelChange}
          />
        </Form.Item>
        <Form.Item
          name="field_key"
          label="Field key"
          extra={
            field
              ? 'Used in mappings and generate answers — change carefully'
              : 'Auto-filled from the label; edit if you need a different key'
          }
          rules={[
            { required: true, message: 'Field key is required' },
            { pattern: /^[a-z][a-z0-9_]*$/, message: 'Use lowercase letters, numbers, underscores' },
          ]}
        >
          <Input
            placeholder="candidate_name"
            onChange={() => {
              keyTouchedRef.current = true
            }}
          />
        </Form.Item>
        <Form.Item name="field_type" label="Field type">
          <Select options={FIELD_TYPES} />
        </Form.Item>
        {fieldType === 'dropdown' && (
          <Form.Item
            name="options"
            label="Options"
            extra="Comma-separated values"
            rules={[{ required: true, message: 'Add at least one option' }]}
          >
            <Input placeholder="Permanent, Fixed term, Contractor" />
          </Form.Item>
        )}
        <Form.Item name="is_required" valuePropName="checked">
          <Checkbox>Required</Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving} block>
          Save field
        </Button>
      </Form>
    </Modal>
  )
}

function CustomFieldsPanel({ step, editable, onChanged }) {
  const message = useAppMessage()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [saving, setSaving] = useState(false)

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

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0e4e4' }}>
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
                background: '#faf7f7',
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong>{field.field_label}</Text>{' '}
                <Tag>{field.field_key}</Tag>
                <Tag color="purple">{field.field_type}</Tag>
                {field.is_required && <Tag color="red">Required</Tag>}
                {field.field_type === 'dropdown' && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">
                      {optionsToText(field.options_json) || 'No options'}
                    </Text>
                  </div>
                )}
              </div>
              {editable && (
                <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(field)} />
                  <Popconfirm
                    title="Delete this field?"
                    onConfirm={() => removeField(field.id)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </>
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
  onPatch,
  onDelete,
  onMove,
  onReload,
}) {
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
        borderColor: editable ? '#e8d8d8' : '#e5e5e5',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: '#f5eded',
            color: '#8B1A1A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon />
        </div>
        <div style={{ width: 140, flexShrink: 0 }}>
          <div style={{ fontWeight: 600 }}>{meta.label}</div>
          <Text type="secondary">Step {index + 1}</Text>
        </div>
        <Input
          value={step.label}
          disabled={!editable || busy}
          aria-label={`Label for step ${index + 1}`}
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
          <Space size={4}>
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={busy || index === 0}
              onClick={() => onMove(index, -1)}
              aria-label="Move step up"
            />
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={busy || index === count - 1}
              onClick={() => onMove(index, 1)}
              aria-label="Move step down"
            />
            <Popconfirm title="Delete this step and its fields?" onConfirm={() => onDelete(step.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={busy} />
            </Popconfirm>
          </Space>
        )}
      </div>

      {step.step_type === 'dropdown' && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0e4e4' }}>
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

      {STEPS_WITH_FIELD_DEFINITIONS.has(step.step_type) && (
        <CustomFieldsPanel step={step} editable={editable} onChanged={onReload} />
      )}
    </Card>
  )
}

export default function FlowBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const message = useAppMessage()
  const documentTypeId = Number(id)

  const [documentType, setDocumentType] = useState(null)
  const [flow, setFlow] = useState(null)
  const [steps, setSteps] = useState([])
  const [editable, setEditable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()
  const [activeTab, setActiveTab] = useState('flow')

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
      const [detail, types, history] = await Promise.all([
        getDocumentType(documentTypeId),
        listDocumentTypes(),
        listFlowHistory(documentTypeId),
      ])
      const statusDetail = types.find((item) => item.id === documentTypeId) || detail
      setDocumentType({ ...detail, ...statusDetail })

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
      setEditable(!!draft)
      if (active) await hydrateSteps(active.id)
      else setSteps([])
    } catch (error) {
      setLoadError((await readPlatformErrorDetail(error)) || 'Could not load flow builder')
    } finally {
      setLoading(false)
    }
  }, [documentTypeId, hydrateSteps])

  useEffect(() => {
    loadBuilder()
  }, [loadBuilder])

  const status = useMemo(() => statusFor(documentType), [documentType])

  const startFlow = async () => {
    setBusy(true)
    try {
      await createFlow(documentTypeId)
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
      await createDraftFromPublished(documentTypeId)
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

  const publish = async () => {
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
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
        <Spin size="large" description="Loading flow..." />
      </div>
    )
  }

  return (
    <div>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/platform/document-types')}
        style={{ marginBottom: 12 }}
      >
        Document types
      </Button>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div>
          <Space align="center">
            <Title level={3} style={{ margin: 0 }}>
              {documentType?.name || 'Document type'}
            </Title>
            <Tag color={status.color}>{status.text}</Tag>
          </Space>
          <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            Configure the generation flow and Word templates for this type.
          </Paragraph>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'flow',
            label: 'Flow',
            children: (
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
                      ? `Flow version ${flow.version}`
                      : 'Define the steps users complete'}
                  </Paragraph>
                  <Space>
                    {documentType?.has_published_flow && !documentType?.has_draft_flow && (
                      <Button icon={<EditOutlined />} onClick={editPublished} loading={busy}>
                        Edit
                      </Button>
                    )}
                    <Tooltip
                      title={!editable ? 'Create or open a draft before publishing' : ''}
                    >
                      <span>
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          disabled={!editable}
                          loading={busy}
                          onClick={publish}
                        >
                          Publish
                        </Button>
                      </span>
                    </Tooltip>
                  </Space>
                </div>

                {loadError && <Alert type="error" showIcon message={loadError} />}

                {!loadError && !flow && (
                  <Card style={{ borderRadius: 16 }}>
                    <Empty description="This document type has no flow yet.">
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
                          documentType?.has_published_flow
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
                        icon={<PlusOutlined />}
                        onClick={() => setAddOpen(true)}
                        style={{ marginTop: 16 }}
                        disabled={busy}
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
            ),
          },
          {
            key: 'templates',
            label: 'Templates',
            children: (
              <TemplatesPanel
                documentTypeId={documentTypeId}
                hasDraftFlow={!!documentType?.has_draft_flow}
                onGoToFlow={() => setActiveTab('flow')}
                onDraftFieldsGenerated={loadBuilder}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
