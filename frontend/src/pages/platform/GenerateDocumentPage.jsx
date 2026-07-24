import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  downloadGeneratedDocument,
  generateOrgDocument,
  getDocumentType,
  getDocumentTypeGenerateReadiness,
  getPublishedFlow,
  listFieldDefinitions,
  listFlowSteps,
  readPlatformErrorDetail,
} from '../../api/platformClient'
import { useAppMessage } from '../../hooks/useAppMessage'

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input

function optionsFromJson(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return { value: item, label: item }
      if (item && typeof item === 'object') {
        const v = item.value ?? item.label
        if (v == null) return null
        return { value: String(v), label: String(item.label ?? v) }
      }
      return null
    })
    .filter(Boolean)
}

function FieldInput({ field, disabled, value, onChange, ...rest }) {
  const type = field.field_type
  if (type === 'number') {
    return (
      <InputNumber
        style={{ width: '100%' }}
        disabled={disabled}
        value={value}
        onChange={onChange}
        {...rest}
      />
    )
  }
  if (type === 'date') {
    return (
      <DatePicker
        style={{ width: '100%' }}
        disabled={disabled}
        value={value}
        onChange={onChange}
        {...rest}
      />
    )
  }
  if (type === 'dropdown') {
    return (
      <Select
        allowClear
        options={optionsFromJson(field.options_json)}
        disabled={disabled}
        placeholder="Select"
        value={value}
        onChange={onChange}
        {...rest}
      />
    )
  }
  return (
    <Input disabled={disabled} value={value} onChange={onChange} {...rest} />
  )
}

function collectFieldsPayload(values) {
  const out = {}
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (dayjs.isDayjs(value)) {
      out[key] = value.format('YYYY-MM-DD')
      return
    }
    if (typeof value === 'string' && !value.trim()) return
    out[key] = value
  })
  return out
}

export default function GenerateDocumentPage() {
  const { id } = useParams()
  const documentTypeId = Number(id)
  const navigate = useNavigate()
  const message = useAppMessage()
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [documentType, setDocumentType] = useState(null)
  const [steps, setSteps] = useState([])
  const [templateId, setTemplateId] = useState(null)
  const [missingFields, setMissingFields] = useState([])
  const [submitError, setSubmitError] = useState(null)
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setResult(null)
    setSubmitError(null)
    setMissingFields([])
    try {
      const detail = await getDocumentType(documentTypeId)
      const readiness = await getDocumentTypeGenerateReadiness({
        ...detail,
        has_published_flow: true,
      })
      // Prefer list flags when available from a fresh types list; fall back to published GET.
      let published
      try {
        published = await getPublishedFlow(documentTypeId)
      } catch (error) {
        if (error.response?.status === 404) {
          setLoadError('Publish a flow first before generating.')
          setDocumentType(detail)
          return
        }
        throw error
      }

      if (!readiness.ready) {
        setLoadError(readiness.reason || 'Not ready to generate')
        setDocumentType(detail)
        return
      }

      const flowSteps = await listFlowSteps(published.id)
      const enabled = flowSteps
        .filter((step) => step.is_enabled !== false)
        .sort((a, b) => a.order_index - b.order_index)

      const hydrated = await Promise.all(
        enabled.map(async (step) => ({
          ...step,
          fields: await listFieldDefinitions(step.id),
        }))
      )

      setDocumentType(detail)
      setSteps(hydrated)
      const preferredTemplateId =
        readiness.completeTemplateIds.at(-1) ||
        readiness.completeTemplateIds[0] ||
        null
      setTemplateId(preferredTemplateId)
    } catch (error) {
      setLoadError(
        (await readPlatformErrorDetail(error)) || 'Could not load generation wizard'
      )
    } finally {
      setLoading(false)
    }
  }, [documentTypeId])

  useEffect(() => {
    load()
  }, [load])

  const requiredKeys = useMemo(() => {
    const keys = new Set()
    for (const step of steps) {
      for (const field of step.fields || []) {
        if (field.is_required) keys.add(field.field_key)
      }
    }
    return keys
  }, [steps])

  const onFinish = async (values) => {
    setSubmitting(true)
    setSubmitError(null)
    setMissingFields([])
    setResult(null)
    try {
      const fields = collectFieldsPayload(values)
      const missingClient = [...requiredKeys].filter((key) => {
        const v = fields[key]
        return v === undefined || v === null || (typeof v === 'string' && !String(v).trim())
      })
      if (missingClient.length) {
        setMissingFields(missingClient)
        missingClient.forEach((key) => {
          form.setFields([{ name: key, errors: ['Required'] }])
        })
        setSubmitError(`Missing required fields: ${missingClient.join(', ')}`)
        return
      }

      if (!templateId) {
        setSubmitError(
          'No complete template selected. Open Templates, finish mapping, then return here.'
        )
        return
      }

      const data = await generateOrgDocument(documentTypeId, {
        template_id: templateId,
        fields,
      })
      setResult(data)
      message.success('Document generated')
    } catch (error) {
      const detail = error.response?.data?.detail
      if (detail && typeof detail === 'object' && Array.isArray(detail.missing_fields)) {
        setMissingFields(detail.missing_fields)
        detail.missing_fields.forEach((key) => {
          form.setFields([{ name: key, errors: ['Required by server'] }])
        })
        setSubmitError(
          `Missing required fields: ${detail.missing_fields.join(', ')}`
        )
      } else if (
        detail &&
        typeof detail === 'object' &&
        Array.isArray(detail.unmapped_placeholders)
      ) {
        setSubmitError(
          `Template placeholder mappings are incomplete: ${detail.unmapped_placeholders
            .map((p) => `{{${p}}}`)
            .join(', ')}`
        )
      } else {
        setSubmitError(
          (await readPlatformErrorDetail(error)) || 'Generation failed'
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  const renderStep = (step) => {
    if (step.step_type === 'file_upload') {
      // Platform fill_template is placeholder-text only; no file inputs in this pipeline.
      return null
    }

    if (step.step_type === 'country_selector') {
      const options = optionsFromJson(step.config_json?.options)
      return (
        <Card key={step.id} title={step.label || 'Country'} style={{ borderRadius: 12 }}>
          <Form.Item
            name="country.name"
            label="Country name"
            rules={[{ required: false }]}
          >
            {options.length ? (
              <Select allowClear options={options} placeholder="Select country" />
            ) : (
              <Input placeholder="e.g. New Zealand" />
            )}
          </Form.Item>
          <Form.Item name="country.code" label="Country code" extra="Maps to country.code">
            <Input placeholder="e.g. NZ" />
          </Form.Item>
        </Card>
      )
    }

    if (step.step_type === 'party_selector') {
      return (
        <Card key={step.id} title={step.label || 'Party'} style={{ borderRadius: 12 }}>
          <Form.Item name="party.name" label="Name">
            <Input placeholder="Employer / party name" />
          </Form.Item>
          <Form.Item name="party.email" label="Email">
            <Input type="email" placeholder="contact@example.com" />
          </Form.Item>
          <Form.Item name="party.address" label="Address">
            <TextArea rows={2} placeholder="Street, city, country" />
          </Form.Item>
        </Card>
      )
    }

    if (step.step_type === 'custom_fields') {
      return (
        <Card key={step.id} title={step.label || 'Fields'} style={{ borderRadius: 12 }}>
          {(step.fields || []).map((field) => (
            <Form.Item
              key={field.id}
              name={field.field_key}
              label={field.field_label || field.field_key}
              rules={
                field.is_required
                  ? [{ required: true, message: `${field.field_label || field.field_key} is required` }]
                  : undefined
              }
              validateStatus={missingFields.includes(field.field_key) ? 'error' : undefined}
            >
              <FieldInput field={field} />
            </Form.Item>
          ))}
          {!step.fields?.length && (
            <Text type="secondary">No field definitions on this step.</Text>
          )}
        </Card>
      )
    }

    // text_field / number_field / date_field / dropdown / rich_text
    const fields = step.fields || []
    if (fields.length) {
      return (
        <Card key={step.id} title={step.label || step.step_type} style={{ borderRadius: 12 }}>
          {fields.map((field) => (
            <Form.Item
              key={field.id}
              name={field.field_key}
              label={field.field_label || field.field_key}
              rules={
                field.is_required
                  ? [{ required: true, message: 'Required' }]
                  : undefined
              }
              validateStatus={missingFields.includes(field.field_key) ? 'error' : undefined}
            >
              {step.step_type === 'rich_text' && field.field_type === 'text' ? (
                <TextArea rows={4} />
              ) : (
                <FieldInput field={field} />
              )}
            </Form.Item>
          ))}
        </Card>
      )
    }

    const configKey = step.config_json?.field_key
    if (!configKey) {
      // No resolvable field_key — skip (backend mapping cannot use this step).
      return null
    }

    if (step.step_type === 'rich_text') {
      return (
        <Card key={step.id} title={step.label || 'Text'} style={{ borderRadius: 12 }}>
          <Form.Item name={configKey} label={step.label || configKey}>
            <TextArea rows={4} />
          </Form.Item>
        </Card>
      )
    }

    if (step.step_type === 'dropdown') {
      return (
        <Card key={step.id} title={step.label || 'Dropdown'} style={{ borderRadius: 12 }}>
          <Form.Item name={configKey} label={step.label || configKey}>
            <Select
              allowClear
              options={optionsFromJson(step.config_json?.options)}
              placeholder="Select"
            />
          </Form.Item>
        </Card>
      )
    }

    const pseudoField = {
      field_type:
        step.step_type === 'number_field'
          ? 'number'
          : step.step_type === 'date_field'
            ? 'date'
            : 'text',
    }
    return (
      <Card key={step.id} title={step.label || configKey} style={{ borderRadius: 12 }}>
        <Form.Item name={configKey} label={step.label || configKey}>
          <FieldInput field={pseudoField} />
        </Form.Item>
      </Card>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
        <Spin size="large" description="Loading wizard..." />
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

      <Title level={3} style={{ marginTop: 0 }}>
        Generate — {documentType?.name || 'Document'}
      </Title>
      <Paragraph type="secondary">
        Fill the published flow steps. Disabled steps are hidden automatically.
      </Paragraph>

      {loadError && <Alert type="error" showIcon message={loadError} />}

      {!loadError && result && (
        <Card style={{ borderRadius: 16, marginBottom: 16 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space>
              <CheckCircleOutlined style={{ color: '#389e0a', fontSize: 22 }} />
              <Text strong>Document generated successfully</Text>
            </Space>
            <Text type="secondary">id {result.document_id}</Text>
            <Space wrap>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => downloadGeneratedDocument(result.document_id, 'docx')}
              >
                Download DOCX
              </Button>
              {result.pdf_available && (
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => downloadGeneratedDocument(result.document_id, 'pdf')}
                >
                  Download PDF
                </Button>
              )}
              <Button
                icon={<FileTextOutlined />}
                onClick={() => navigate('/platform/generated')}
              >
                View all generated documents
              </Button>
              <Button
                onClick={() => {
                  setResult(null)
                  form.resetFields()
                }}
              >
                Generate another
              </Button>
            </Space>
          </Space>
        </Card>
      )}

      {!loadError && !result && (
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
          onValuesChange={(changed) => {
            const changedKeys = Object.keys(changed)
            if (!changedKeys.length) return
            setMissingFields((prev) => prev.filter((key) => !changedKeys.includes(key)))
          }}
        >
          {submitError && (
            <Alert
              type="error"
              showIcon
              message={submitError}
              style={{ marginBottom: 16 }}
            />
          )}

          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {steps.map((step) => renderStep(step))}
          </Space>

          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            size="large"
            style={{ marginTop: 20 }}
          >
            Generate document
          </Button>
        </Form>
      )}
    </div>
  )
}
