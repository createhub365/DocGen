import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Steps,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  downloadGeneratedDocument,
  fetchGeneratedDocumentBlob,
  generateOrgDocument,
  getDocumentType,
  listFieldDefinitions,
  listFlowSteps,
  listOrgTemplates,
  readPlatformErrorDetail,
  resolvePublishedFlowForTemplate,
  listOrgTrades,
} from '../../api/platformClient'
import { usePlatformPageChrome } from '../../components/PlatformLayout'
import { useAppMessage } from '../../hooks/useAppMessage'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import {
  findWorldCountry,
  worldCountrySelectOptions,
} from '../../data/worldCountries'
import InAppPdfViewerModal from './InAppPdfViewerModal'
import ShareGeneratedDocumentModal from './ShareGeneratedDocumentModal'
import { renderPdfPagesToImages } from '../../utils/pdfPageRenderer'
import {
  TRADE_LINKED_DUTIES_KIND,
  TRADE_LINKED_POSITION_KIND,
  dutiesFieldKeyForPosition,
  hiddenDutiesCompanionKeys,
  isTradeLinkedPositionField,
  tradeLinkedKind,
  tradeOptionFilter,
  tradeSelectOptions,
} from '../../utils/tradeLinkedPosition'
import { colors } from '../../design/tokens'
/** flag-icons CSS sprite — works on Windows (emoji flags do not). */
function WorldCountryFlag({ code, size = 18 }) {
  const cls = String(code || '')
    .trim()
    .toLowerCase()
  if (!/^[a-z]{2}$/.test(cls)) return null
  const fontSize = Math.round(size / 1.333333)
  return (
    <span
      className={`fi fi-${cls}`}
      role="img"
      aria-hidden
      style={{
        fontSize,
        lineHeight: 1,
        borderRadius: 2,
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        overflow: 'hidden',
      }}
    />
  )
}

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input

/** Review is always the last wizard page (even for a single enabled step). */
const REVIEW_PAGE = 'review'

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
        options={optionsFromJson(field.effective_options ?? field.options_json)}
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

/** @deprecated use isTradeLinkedPositionField — kept for tests/imports */
export function isTradeLinkedDutiesField(field) {
  return isTradeLinkedPositionField(field)
}

/**
 * Legacy: trade selector bound to a duties field (old trade_linked_duties kind).
 * Kept for any pre-pairing flows until migrated.
 */
function TradeLinkedDutiesInput({ value, onChange, disabled }) {
  const [trades, setTrades] = useState([])
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    listOrgTrades()
      .then((rows) => {
        if (!cancelled) {
          setTrades(rows || [])
          setLoadError(null)
        }
      })
      .catch(async (error) => {
        if (!cancelled) {
          setTrades([])
          setLoadError(
            (await readPlatformErrorDetail(error)) || 'Could not load trades'
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const tradeById = useMemo(() => {
    const map = new Map()
    for (const t of trades || []) {
      map.set(t.id, t)
    }
    return map
  }, [trades])

  const options = useMemo(() => tradeSelectOptions(trades), [trades])

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {loadError ? (
        <Alert type="warning" showIcon message={loadError} />
      ) : null}
      <Select
        showSearch
        allowClear
        disabled={disabled}
        placeholder="Select a trade to auto-fill duties"
        optionFilterProp="searchText"
        filterOption={tradeOptionFilter}
        options={options}
        onChange={(tradeId) => {
          if (tradeId == null) {
            if (typeof onChange === 'function') onChange('')
            return
          }
          const match = tradeById.get(tradeId)
          if (match && typeof onChange === 'function') {
            onChange(match.duties_text || '')
          }
        }}
        style={{ width: '100%' }}
      />
      <Input.TextArea
        rows={6}
        disabled={disabled}
        value={value}
        onChange={onChange}
        placeholder="Duties / job responsibilities (editable)"
      />
    </Space>
  )
}

/**
 * Trade-linked position: one Select fills position (name) + duties companion.
 * Duties renders under Position — not as a separate wizard column.
 */
function TradeLinkedPositionGroup({ positionField, disabled, missingFields }) {
  const form = Form.useFormInstance()
  const dutiesKey = dutiesFieldKeyForPosition(positionField)
  const positionKey = positionField.field_key
  const [trades, setTrades] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [selectedTradeId, setSelectedTradeId] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    listOrgTrades()
      .then((rows) => {
        if (!cancelled) {
          setTrades(rows || [])
          setLoadError(null)
        }
      })
      .catch(async (error) => {
        if (!cancelled) {
          setTrades([])
          setLoadError(
            (await readPlatformErrorDetail(error)) || 'Could not load trades'
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const tradeById = useMemo(() => {
    const map = new Map()
    for (const t of trades || []) {
      map.set(t.id, t)
    }
    return map
  }, [trades])

  const options = useMemo(() => tradeSelectOptions(trades), [trades])
  const positionValue = Form.useWatch(positionKey, form)

  useEffect(() => {
    if (!positionValue || !trades.length) return
    const match = trades.find(
      (t) =>
        String(t.name || '').toLowerCase() === String(positionValue).toLowerCase()
    )
    if (match) setSelectedTradeId(match.id)
  }, [positionValue, trades])

  const onTradeChange = (tradeId) => {
    setSelectedTradeId(tradeId)
    if (tradeId == null) {
      form.setFieldsValue({
        [positionKey]: undefined,
        [dutiesKey]: undefined,
      })
      return
    }
    const match = tradeById.get(tradeId)
    if (!match) return
    form.setFieldsValue({
      [positionKey]: match.name || '',
      [dutiesKey]: match.duties_text || '',
    })
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {loadError ? (
        <Alert
          type="warning"
          showIcon
          message={loadError}
          style={{ marginBottom: 8 }}
        />
      ) : null}
      <Form.Item
        label={positionField.field_label || 'Position'}
        required={!!positionField.is_required}
        validateStatus={missingFields?.includes(positionKey) ? 'error' : undefined}
        style={{ marginBottom: 8 }}
      >
        <Select
          showSearch
          allowClear
          disabled={disabled}
          placeholder="Search trade name or synonym"
          optionFilterProp="searchText"
          filterOption={tradeOptionFilter}
          options={options}
          value={selectedTradeId}
          onChange={onTradeChange}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item
        name={positionKey}
        hidden
        rules={
          positionField.is_required
            ? [{ required: true, message: 'Required' }]
            : undefined
        }
      >
        <Input />
      </Form.Item>
      <Form.Item name={dutiesKey} label="Duties" style={{ marginBottom: 0 }}>
        <Input.TextArea
          rows={6}
          disabled={disabled}
          placeholder="Not available"
        />
      </Form.Item>
    </div>
  )
}

export function collectFieldsPayload(values) {
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

/** Fields shown as wizard inputs (hides auto-ref, barcode, duties companions). */
export function wizardVisibleFields(fields) {
  const hiddenDuties = hiddenDutiesCompanionKeys(fields)
  return (fields || []).filter((f) => {
    if (f?.is_auto_generated) return false
    const key = String(f?.field_key || '').toLowerCase()
    if (key === 'ref_number_barcode') return false
    if (hiddenDuties.has(key)) return false
    return true
  })
}

/** Field keys owned by a step (for per-page validation). */
export function fieldKeysForStep(step) {
  if (!step || step.step_type === 'file_upload') return []
  if (step.step_type === 'country_selector') {
    const keys = ['country.name']
    if (step.config_json?.use_builtin_country_list) {
      if (step.config_json?.include_country_code) keys.push('country.code')
    } else {
      keys.push('country.code')
    }
    return keys
  }
  if (step.step_type === 'party_selector') {
    return ['party.name', 'party.email', 'party.address']
  }
  const fromDefs = wizardVisibleFields(step.fields)
    .filter((f) => f.is_required)
    .map((f) => f.field_key)
  if (fromDefs.length) return fromDefs
  const configKey = step.config_json?.field_key
  return configKey ? [configKey] : []
}

export function requiredKeysForStep(step) {
  if (!step) return []
  return wizardVisibleFields(step.fields)
    .filter((f) => f.is_required)
    .map((f) => f.field_key)
}

function formatDisplayValue(value) {
  if (value === undefined || value === null || value === '') return '—'
  if (dayjs.isDayjs(value)) return value.format('YYYY-MM-DD')
  return String(value)
}

export default function GenerateDocumentPage() {
  const { id, templateId: templateIdParam } = useParams()
  const documentTypeId = Number(id)
  const routeTemplateId = templateIdParam ? Number(templateIdParam) : null
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [inlinePages, setInlinePages] = useState([])
  const [inlineLoading, setInlineLoading] = useState(false)
  /** Index into `wizardPages` (steps + review). */
  const [pageIndex, setPageIndex] = useState(0)
  const [pageError, setPageError] = useState(null)
  const watchedCountryName = Form.useWatch('country.name', form)

  const loadPdfBlob = useCallback(async () => {
    if (!result?.document_id) throw new Error('No document')
    return fetchGeneratedDocumentBlob(result.document_id, 'pdf')
  }, [result?.document_id])

  useEffect(() => {
    if (!result?.pdf_available || !result?.document_id) {
      setInlinePages([])
      setInlineLoading(false)
      return undefined
    }
    let cancelled = false
    setInlineLoading(true)
    setInlinePages([])
    ;(async () => {
      try {
        const blob = await fetchGeneratedDocumentBlob(result.document_id, 'pdf')
        if (cancelled) return
        const pages = await renderPdfPagesToImages(blob, 640)
        if (cancelled) return
        setInlinePages(pages)
      } catch {
        if (!cancelled) setInlinePages([])
      } finally {
        if (!cancelled) setInlineLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [result?.document_id, result?.pdf_available])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setResult(null)
    setSubmitError(null)
    setMissingFields([])
    setPageIndex(0)
    setPageError(null)
    try {
      const [detail, templates] = await Promise.all([
        getDocumentType(documentTypeId),
        listOrgTemplates(documentTypeId),
      ])
      setDocumentType(detail)

      const complete = (templates || []).filter((t) => t.is_complete)

      let resolvedId = null
      if (routeTemplateId) {
        const match = (templates || []).find((t) => t.id === routeTemplateId)
        if (!match) {
          setLoadError(
            'That document was not found for this type. Pick one from the Documents tab.'
          )
          return
        }
        if (!match.is_complete) {
          setLoadError(
            'This document’s mapping is incomplete. Open it and finish mapping before generating.'
          )
          return
        }
        resolvedId = match.id
      } else if (complete.length === 1) {
        // Old bookmark without template id — only auto-resolve when unambiguous
        resolvedId = complete[0].id
      } else {
        // Multiple or zero complete docs: send user to pick explicitly
        navigate(`/platform/document-types/${documentTypeId}`, { replace: true })
        message.info(
          complete.length
            ? 'Choose which document to generate from the Documents tab.'
            : 'Upload and map a document before generating.'
        )
        return
      }

      let published
      try {
        const resolved = await resolvePublishedFlowForTemplate(
          resolvedId,
          documentTypeId
        )
        published = resolved.flow
      } catch (error) {
        if (error?.response?.status === 404) {
          setLoadError('Publish a flow first before generating.')
          return
        }
        throw error
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

      setSteps(hydrated)
      setTemplateId(resolvedId)
    } catch (error) {
      setLoadError(
        (await readPlatformErrorDetail(error)) || 'Could not load generation wizard'
      )
    } finally {
      setLoading(false)
    }
  }, [documentTypeId, routeTemplateId, navigate]) // message toast is fire-and-forget

  useEffect(() => {
    load()
  }, [load])

  const wizardPages = useMemo(() => {
    const pages = steps
      .filter((s) => s.step_type !== 'file_upload')
      .map((step) => ({ kind: 'step', step }))
    pages.push({ kind: REVIEW_PAGE })
    return pages
  }, [steps])

  const currentPage = wizardPages[pageIndex] || null
  const isReview = currentPage?.kind === REVIEW_PAGE
  const totalSteps = Math.max(wizardPages.length - 1, 1)

  const requiredKeys = useMemo(() => {
    const keys = new Set()
    for (const step of steps) {
      for (const field of wizardVisibleFields(step.fields)) {
        if (field.is_required) keys.add(field.field_key)
      }
    }
    return keys
  }, [steps])

  const findPageIndexForField = useCallback(
    (fieldKey) => {
      for (let i = 0; i < wizardPages.length; i += 1) {
        const page = wizardPages[i]
        if (page.kind !== 'step') continue
        const keys = [
          ...requiredKeysForStep(page.step),
          ...fieldKeysForStep(page.step),
          ...(page.step.fields || []).map((f) => f.field_key),
        ]
        if (keys.includes(fieldKey)) return i
      }
      return 0
    },
    [wizardPages]
  )

  const validateCurrentPage = async () => {
    setPageError(null)
    if (!currentPage || currentPage.kind !== 'step') return true
    const step = currentPage.step
    const req = requiredKeysForStep(step)
    if (!req.length) return true
    try {
      await form.validateFields(req)
      return true
    } catch {
      setPageError('Please fill required fields on this step before continuing.')
      return false
    }
  }

  const goNext = async () => {
    const ok = await validateCurrentPage()
    if (!ok) return
    setPageIndex((i) => Math.min(i + 1, wizardPages.length - 1))
  }

  const goBack = () => {
    setPageError(null)
    setPageIndex((i) => Math.max(i - 1, 0))
  }

  const onFinish = async (values) => {
    setSubmitting(true)
    setSubmitError(null)
    setMissingFields([])
    setResult(null)
    try {
      const fields = collectFieldsPayload(values)
      // Builtin country list: drop country.code unless include_country_code
      for (const step of steps) {
        if (
          step.step_type === 'country_selector' &&
          step.config_json?.use_builtin_country_list &&
          !step.config_json?.include_country_code
        ) {
          delete fields['country.code']
        }
      }

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
        setPageIndex(findPageIndexForField(missingClient[0]))
        return
      }

      if (!templateId) {
        setSubmitError(
          'No complete document selected. Open Documents, finish mapping, then generate from that document.'
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
        setPageIndex(findPageIndexForField(detail.missing_fields[0]))
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

  const renderCountrySelector = (step) => {
    const useBuiltin = !!step.config_json?.use_builtin_country_list
    const includeCode = !!step.config_json?.include_country_code

    if (useBuiltin) {
      const selectOptions = worldCountrySelectOptions({ includeCode }).map((o) => ({
        value: o.value,
        code: o.code,
        name: o.name,
        // Plain text kept for filter; visual label uses CSS flag images
        searchText: o.label,
        label: (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <WorldCountryFlag code={o.code} size={18} />
            <span>{o.label}</span>
          </span>
        ),
      }))
      return (
        <Card key={step.id} title={step.label || 'Country'} style={{ borderRadius: 12 }}>
          <Form.Item name="country.name" hidden>
            <Input />
          </Form.Item>
          {includeCode && (
            <Form.Item name="country.code" hidden>
              <Input />
            </Form.Item>
          )}
          <Form.Item label="Country" required={false}>
            <Select
              showSearch
              allowClear
              placeholder="Search country"
              optionFilterProp="searchText"
              filterOption={(input, option) => {
                const q = String(input || '').trim().toLowerCase()
                if (!q) return true
                return (
                  String(option?.searchText || '')
                    .toLowerCase()
                    .includes(q) ||
                  String(option?.name || '')
                    .toLowerCase()
                    .includes(q) ||
                  String(option?.code || '')
                    .toLowerCase()
                    .includes(q)
                )
              }}
              options={selectOptions}
              value={findWorldCountry(watchedCountryName)?.code}
              onChange={(code) => {
                const found = findWorldCountry(code)
                if (!found) {
                  form.setFieldsValue({
                    'country.name': undefined,
                    ...(includeCode ? { 'country.code': undefined } : {}),
                  })
                  return
                }
                form.setFieldsValue({
                  'country.name': found.name,
                  ...(includeCode ? { 'country.code': found.code } : {}),
                })
              }}
            />
          </Form.Item>
          {!includeCode && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Submits country.name only (ISO code not included).
            </Text>
          )}
        </Card>
      )
    }

    // Backward-compatible free-text path (default)
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

  const renderStep = (step) => {
    if (step.step_type === 'file_upload') return null

    if (step.step_type === 'country_selector') {
      return renderCountrySelector(step)
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
          {wizardVisibleFields(step.fields).map((field) => {
            const kind = tradeLinkedKind(field)
            if (kind === TRADE_LINKED_POSITION_KIND) {
              return (
                <TradeLinkedPositionGroup
                  key={field.id}
                  positionField={field}
                  missingFields={missingFields}
                />
              )
            }
            return (
              <Form.Item
                key={field.id}
                name={field.field_key}
                label={field.field_label || field.field_key}
                rules={
                  field.is_required
                    ? [
                        {
                          required: true,
                          message: `${field.field_label || field.field_key} is required`,
                        },
                      ]
                    : undefined
                }
                validateStatus={
                  missingFields.includes(field.field_key) ? 'error' : undefined
                }
              >
                {kind === TRADE_LINKED_DUTIES_KIND ? (
                  <TradeLinkedDutiesInput />
                ) : (
                  <FieldInput field={field} />
                )}
              </Form.Item>
            )
          })}
          {!wizardVisibleFields(step.fields).length && (
            <Text type="secondary">No field definitions on this step.</Text>
          )}
        </Card>
      )
    }

    const fields = wizardVisibleFields(step.fields)
    if (fields.length) {
      return (
        <Card key={step.id} title={step.label || step.step_type} style={{ borderRadius: 12 }}>
          {fields.map((field) => {
            const kind = tradeLinkedKind(field)
            if (kind === TRADE_LINKED_POSITION_KIND) {
              return (
                <TradeLinkedPositionGroup
                  key={field.id}
                  positionField={field}
                  missingFields={missingFields}
                />
              )
            }
            return (
              <Form.Item
                key={field.id}
                name={field.field_key}
                label={field.field_label || field.field_key}
                rules={
                  field.is_required
                    ? [{ required: true, message: 'Required' }]
                    : undefined
                }
                validateStatus={
                  missingFields.includes(field.field_key) ? 'error' : undefined
                }
              >
                {kind === TRADE_LINKED_DUTIES_KIND ? (
                  <TradeLinkedDutiesInput />
                ) : step.step_type === 'rich_text' && field.field_type === 'text' ? (
                  <TextArea rows={4} />
                ) : (
                  <FieldInput field={field} />
                )}
              </Form.Item>
            )
          })}
        </Card>
      )
    }

    // Fall through for steps with no visible (non-auto) field definitions
    if ((step.fields || []).length && !fields.length) {
      return (
        <Card key={step.id} title={step.label || step.step_type} style={{ borderRadius: 12 }}>
          <Text type="secondary">
            Reference numbers are filled in automatically.
          </Text>
        </Card>
      )
    }
    const configKey = step.config_json?.field_key
    if (!configKey) return null

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

  const reviewItems = () => {
    const values = form.getFieldsValue(true)
    const items = []
    for (const step of steps) {
      if (step.step_type === 'file_upload') continue
      const keys =
        step.step_type === 'country_selector' || step.step_type === 'party_selector'
          ? fieldKeysForStep(step)
          : wizardVisibleFields(step.fields)
              .map((f) => f.field_key)
              .concat(
                step.config_json?.field_key ? [step.config_json.field_key] : []
              )
      const unique = [...new Set(keys)].filter(Boolean)
      if (!unique.length) continue
      items.push({
        step,
        rows: unique.map((key) => ({
          key,
          label:
            (step.fields || []).find((f) => f.field_key === key)?.field_label || key,
          value: formatDisplayValue(values[key]),
        })),
      })
    }
    return items
  }

  const headerTitle = useMemo(() => {
    if (result) return `Generate — ${documentType?.name || 'Document'}`
    if (isReview) return 'Review & generate'
    return currentPage?.step?.label || documentType?.name || 'Generate'
  }, [result, isReview, currentPage, documentType])

  const headerSubtitle = useMemo(() => {
    if (result) return 'Document ready to download.'
    if (loadError) return null
    if (isReview) return 'Confirm the values below, then generate.'
    const n = Math.min(pageIndex + 1, totalSteps)
    return `Step ${n} of ${totalSteps}`
  }, [result, loadError, isReview, pageIndex, totalSteps])

  const showWizardChrome = !loadError && !result

  let footerActions = null
  if (showWizardChrome) {
    if (isReview) {
      footerActions = (
        <Space className="platform-wizard-footer" wrap style={{ width: '100%' }}>
          <Button size="large" className="platform-touch-target" onClick={goBack} disabled={submitting}>
            Back
          </Button>
          <Button
            type="primary"
            size="large"
            className="platform-touch-target"
            loading={submitting}
            onClick={() => form.submit()}
          >
            Generate document
          </Button>
        </Space>
      )
    } else {
      footerActions = (
        <Space className="platform-wizard-footer" wrap style={{ width: '100%' }}>
          <Button
            size="large"
            className="platform-touch-target"
            onClick={goBack}
            disabled={pageIndex === 0 || submitting}
          >
            Back
          </Button>
          <Button
            type="primary"
            size="large"
            className="platform-touch-target"
            onClick={goNext}
            disabled={submitting}
          >
            Next
          </Button>
        </Space>
      )
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
        <Spin size="large" description="Loading wizard..." />
      </div>
    )
  }

  return (
    <GenerateDocumentChrome
      onBack={() => navigate('/platform/document-types')}
      title={headerTitle}
      subtitle={headerSubtitle}
      progress={
        showWizardChrome ? (
          <WizardStepsProgress
            steps={steps}
            pageIndex={pageIndex}
            isReview={isReview}
            totalSteps={totalSteps}
          />
        ) : null
      }
      footer={footerActions}
    >
      {loadError && <Alert type="error" showIcon message={loadError} />}

      {!loadError && result && (
        <Card style={{ borderRadius: 16, marginBottom: 16 }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space>
              <CheckCircleOutlined style={{ color: 'var(--success)', fontSize: 22 }} />
              <Text strong>Document generated successfully</Text>
            </Space>
            <Text type="secondary">id {result.document_id}</Text>

            {result.pdf_available ? (
              <div
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--surface-2)',
                  maxHeight: 420,
                  overflowY: 'auto',
                }}
              >
                {inlineLoading && (
                  <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
                    <Spin tip="Loading preview…" />
                  </div>
                )}
                {!inlineLoading && inlinePages.length > 0 && (
                  <div>
                    {inlinePages.map((page) => (
                      <img
                        key={page.page}
                        src={page.image}
                        alt={`Page ${page.page}`}
                        style={{
                          width: '100%',
                          height: 'auto',
                          display: 'block',
                          borderBottom:
                            page.page < inlinePages.length
                              ? `1px solid ${colors.border}`
                              : undefined,
                        }}
                      />
                    ))}
                  </div>
                )}
                {!inlineLoading && inlinePages.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <Text type="secondary">
                      Preview unavailable — use View to retry, or download the file.
                    </Text>
                  </div>
                )}
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message="PDF preview unavailable for this run — download DOCX instead."
              />
            )}

            <Space wrap>
              {result.pdf_available && (
                <Button
                  type="primary"
                  icon={<EyeOutlined />}
                  onClick={() => setPreviewOpen(true)}
                >
                  View
                </Button>
              )}
              <Button
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
              {result.pdf_available && (
                <Button
                  icon={<ShareAltOutlined />}
                  onClick={() => setShareOpen(true)}
                >
                  Share
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
                  setPreviewOpen(false)
                  setShareOpen(false)
                  setInlinePages([])
                  form.resetFields()
                  setPageIndex(0)
                  setSubmitError(null)
                  setMissingFields([])
                }}
              >
                Generate another
              </Button>
            </Space>
          </Space>

          <InAppPdfViewerModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            title={`Document #${result.document_id}`}
            loadPdf={loadPdfBlob}
          />
          <ShareGeneratedDocumentModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            documentId={result.document_id}
          />
        </Card>
      )}

      {!loadError && !result && (
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
          preserve
          onValuesChange={(changed) => {
            const changedKeys = Object.keys(changed)
            if (!changedKeys.length) return
            setMissingFields((prev) => prev.filter((key) => !changedKeys.includes(key)))
            // Keep Select controlled value in sync for builtin country
            if ('country.name' in changed) {
              // no-op — Form already holds value
            }
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
          {pageError && (
            <Alert
              type="warning"
              showIcon
              message={pageError}
              style={{ marginBottom: 16 }}
            />
          )}

          {/* All steps stay mounted (display:none) so AntD Form preserves values across pages */}
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {steps.map((step) => {
              const visible =
                currentPage?.kind === 'step' && currentPage.step.id === step.id
              return (
                <div
                  key={step.id}
                  style={{ display: visible ? 'block' : 'none' }}
                  aria-hidden={!visible}
                >
                  {renderStep(step)}
                </div>
              )
            })}
          </Space>

          {isReview && (
            <Card title="Review" style={{ borderRadius: 12 }}>
              {reviewItems().map(({ step, rows }) => (
                <div key={step.id} style={{ marginBottom: 16 }}>
                  <Text strong>{step.label || step.step_type}</Text>
                  <Descriptions
                    size="small"
                    column={1}
                    style={{ marginTop: 8 }}
                    items={rows.map((r) => ({
                      key: r.key,
                      label: r.label,
                      children: r.value,
                    }))}
                  />
                </div>
              ))}
              {!reviewItems().length && (
                <Text type="secondary">No values entered yet.</Text>
              )}
            </Card>
          )}
        </Form>
      )}
    </GenerateDocumentChrome>
  )
}

function WizardStepsProgress({ steps, pageIndex, isReview, totalSteps }) {
  const { isMobile } = useBreakpoint()
  const visibleSteps = steps.filter((s) => s.step_type !== 'file_upload')
  const current = isReview ? visibleSteps.length : pageIndex

  if (isMobile) {
    const label = isReview
      ? 'Review'
      : visibleSteps[pageIndex]?.label || `Step ${pageIndex + 1}`
    return (
      <div style={{ marginTop: 8, width: '100%' }}>
        <div
          style={{
            height: 6,
            borderRadius: 4,
            background: 'var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(8, ((current + 1) / Math.max(totalSteps, 1)) * 100))}%`,
              height: '100%',
              background: 'var(--primary)',
              borderRadius: 4,
              transition: 'width 200ms ease',
            }}
          />
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
          {label}
        </Typography.Text>
      </div>
    )
  }

  return (
    <Steps
      size="small"
      current={isReview ? visibleSteps.length : pageIndex}
      items={[
        ...visibleSteps.map((s) => ({ title: s.label || s.step_type })),
        { title: 'Review' },
      ]}
      style={{ marginTop: 8, maxWidth: 720, width: '100%' }}
    />
  )
}

function GenerateDocumentChrome({ onBack, title, subtitle, progress, footer, children }) {
  const { isMobile } = useBreakpoint()
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
          {isMobile ? 'Back' : 'Document types'}
        </Button>
        <Title
          level={isMobile ? 4 : 3}
          style={{
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {title}
        </Title>
        {subtitle ? (
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {subtitle}
          </Paragraph>
        ) : null}
        {progress}
      </>
    ),
    [onBack, title, subtitle, progress, isMobile]
  )

  usePlatformPageChrome({ header, footer: footer ?? null })
  return children
}
