import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Form, Input, Button, Typography, Select, Card, Result, Space } from 'antd'
import { EditOutlined, FileWordOutlined, FilePdfOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { getTemplateById, incrementRefCounter, downloadDoc } from '../../api/client'
import { useDocStore } from '../../store/useDocStore'
import { useAppMessage } from '../../hooks/useAppMessage'
import DateField from '../form/DateField'
import LogoPreview from '../LogoPreview'
import StepSmartFillPreview from './StepSmartFillPreview'
import ValidityExpiryReadonly from './ValidityExpiryReadonly'
import CountrySelect from '../ui/CountrySelect'
import { getCountryByCode, getCountryCode } from '../../data/countries'
import { getPrimaryOccupationCode } from '../../data/occupationCodes'
import {
  buildEmployerPrefill,
  fieldLabel,
  STORE_DATE_FORMAT,
} from './smartFormConfig'
import {
  buildFormFieldsFromPlaceholders,
  getVisibleFieldIds,
  pickFormValues,
  templateNeedsSalutation,
} from '../../utils/placeholderFormBuilder'

dayjs.extend(customParseFormat)

const { Title, Text } = Typography
const { TextArea } = Input

const SALUTATION_OPTIONS = [
  { value: 'Mr.', label: 'Mr.' },
  { value: 'Ms.', label: 'Ms.' },
  { value: 'Mrs.', label: 'Mrs.' },
  { value: 'Dr.', label: 'Dr.' },
]

const HIDDEN_NAV = { hidden: true }

export default function StepSmartFillForm({
  onBack,
  onEditEmployer,
  onStartFresh,
  onRegisterNav,
}) {
  const {
    templateId,
    templateMeta,
    employer,
    tradeCategory,
    selectedTrade,
    tradeDetails,
    formData,
    setFormDataBulk,
    mergeFormData,
    resetFormForSameEmployer,
    setFillSubStep,
  } = useDocStore()
  const [loading, setLoading] = useState(true)
  const [templateMissing, setTemplateMissing] = useState(false)
  const [refNumber, setRefNumber] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const [generateSuccess, setGenerateSuccess] = useState(false)
  const [generatedDoc, setGeneratedDoc] = useState(null)
  const [generatedFormat, setGeneratedFormat] = useState('docx')
  const [showPreview, setShowPreview] = useState(false)
  const [resolvedPlaceholders, setResolvedPlaceholders] = useState([])
  const [fieldsSnapshot, setFieldsSnapshot] = useState({})
  const [form] = Form.useForm()
  const message = useAppMessage()
  const backgroundFieldsRef = useRef({})
  const fieldsSnapshotRef = useRef({})

  const formFields = useMemo(
    () => buildFormFieldsFromPlaceholders(resolvedPlaceholders),
    [resolvedPlaceholders]
  )

  const showSalutation = useMemo(
    () => templateNeedsSalutation(resolvedPlaceholders),
    [resolvedPlaceholders]
  )

  const initForm = async (keepSaved = true, templatePlaceholders = resolvedPlaceholders) => {
    const prefill = buildEmployerPrefill(employer, selectedTrade)
    const fields = buildFormFieldsFromPlaceholders(templatePlaceholders)
    const defaults = {}

    fields.forEach((f) => {
      if (f.defaultToday) {
        defaults[f.id] = dayjs().format(STORE_DATE_FORMAT)
      } else if (f.default !== undefined) {
        defaults[f.id] = f.default
      }
    })

    let ref = keepSaved ? formData.ref_number : null
    if (!ref) {
      const data = await incrementRefCounter()
      ref = data.formatted
    }
    setRefNumber(ref)
    backgroundFieldsRef.current = { ...prefill, ref_number: ref }

    const visibleIds = new Set(getVisibleFieldIds(fields))
    const savedVisible = keepSaved
      ? Object.fromEntries(Object.entries(formData).filter(([key]) => visibleIds.has(key)))
      : {}

    const prefillForForm = pickFormValues(prefill, fields)
    const initial = pickFormValues(
      {
        ...defaults,
        ...prefillForForm,
        ...savedVisible,
        ref_number: ref,
        _salutation_prefix: savedVisible._salutation_prefix || 'Mr.',
      },
      fields,
      ['ref_number']
    )
    form.resetFields()
    form.setFieldsValue(initial)
    syncSalutation(initial)
    const merged = { ...backgroundFieldsRef.current, ...initial }
    setFormDataBulk(merged)
    fieldsSnapshotRef.current = merged
    setFieldsSnapshot(merged)
  }

  useEffect(() => {
    if (!templateId || !employer) return
    setLoading(true)
    setTemplateMissing(false)
    setShowPreview(false)
    setFillSubStep(0)
    setResolvedPlaceholders([])

    getTemplateById(templateId)
      .then((data) => {
        const ph = data.placeholders || []
        setResolvedPlaceholders(ph)
        useDocStore.getState().setTemplate(templateId, ph)
        return initForm(true, ph)
      })
      .catch((err) => {
        const detail = err.response?.data?.detail || ''
        if (err.response?.status === 404) {
          setTemplateMissing(true)
        } else {
          message.error(detail || 'Failed to load template')
        }
      })
      .finally(() => setLoading(false))
  }, [templateId, employer])

  useEffect(() => {
    if (!employer || !selectedTrade || loading || !formFields.length) return
    const prefill = buildEmployerPrefill(employer, selectedTrade)
    const existingRef =
      backgroundFieldsRef.current.ref_number || formData.ref_number || refNumber
    backgroundFieldsRef.current = { ...prefill, ref_number: existingRef }
    const prefillForForm = pickFormValues(
      { ...prefill, ref_number: existingRef },
      formFields,
      ['ref_number']
    )
    mergeFormData({ ...backgroundFieldsRef.current, ...prefillForForm })
    form.setFieldsValue(prefillForForm)
    if (existingRef) setRefNumber(existingRef)
  }, [selectedTrade, loading, formFields])

  useLayoutEffect(() => {
    if (loading || showPreview || !showSalutation) return
    const prefix = form.getFieldValue('_salutation_prefix') || 'Mr.'
    form.setFields([
      { name: '_salutation_prefix', value: prefix, errors: [], touched: false, validated: false },
    ])
    syncSalutation({ _salutation_prefix: prefix })
  }, [loading, showPreview, showSalutation, form])

  const syncSalutation = (values) => {
    if (!showSalutation) return
    const prefix = values?._salutation_prefix || form.getFieldValue('_salutation_prefix') || 'Mr.'
    const name =
      values?.candidate_full_name ?? form.getFieldValue('candidate_full_name') ?? ''
    form.setFieldValue('candidate_salutation', name ? `${prefix} ${name}`.trim() : prefix)
  }

  const computeValidityExpiry = () => {
    const issueDate = form.getFieldValue('issue_date')
    const validityDays = form.getFieldValue('validity_days')
    if (issueDate && validityDays) {
      const parsed = dayjs(issueDate, STORE_DATE_FORMAT)
      const days = parseInt(String(validityDays), 10)
      if (parsed.isValid() && !Number.isNaN(days)) {
        form.setFieldValue(
          'validity_expiry_date',
          parsed.add(days, 'day').format(STORE_DATE_FORMAT)
        )
      }
    }
  }

  const collectFormValues = () => {
    computeValidityExpiry()
    const live = form.getFieldsValue(true) || {}
    const cleaned = Object.fromEntries(
      Object.entries(live).filter(([, value]) => value !== undefined)
    )
    delete cleaned._salutation_prefix
    return {
      ...backgroundFieldsRef.current,
      ...formData,
      ...cleaned,
    }
  }

  const persistFields = () => {
    const merged = collectFormValues()
    setFormDataBulk(merged)
    fieldsSnapshotRef.current = merged
    setFieldsSnapshot(merged)
    return merged
  }

  const buildPayload = useCallback(
    () => ({
      template_id: templateId,
      template: { ...templateMeta, trade_category: tradeCategory },
      employer_id: employer.id,
      trade: selectedTrade,
      trade_category: tradeCategory,
      fields: fieldsSnapshotRef.current?.ref_number
        ? fieldsSnapshotRef.current
        : collectFormValues(),
    }),
    [templateId, templateMeta, employer, selectedTrade, tradeCategory, formData]
  )

  const handleReview = useCallback(async () => {
    try {
      computeValidityExpiry()
      if (showSalutation && !form.getFieldValue('_salutation_prefix')) {
        form.setFieldValue('_salutation_prefix', 'Mr.')
        syncSalutation({ _salutation_prefix: 'Mr.' })
      }
      const fieldIds = getVisibleFieldIds(formFields)
      if (showSalutation) {
        await form.validateFields(['_salutation_prefix', ...fieldIds])
      } else {
        await form.validateFields(fieldIds)
      }
      persistFields()
      setPreviewKey((k) => k + 1)
      setShowPreview(true)
      setFillSubStep(1)
    } catch {
      message.error('Please fill all required fields')
    }
  }, [form, formFields, showSalutation, message, setFillSubStep, formData])

  const handleBack = useCallback(() => {
    if (showPreview) {
      setShowPreview(false)
      setFillSubStep(0)
    } else {
      onBack()
    }
  }, [showPreview, onBack, setFillSubStep])

  const handleGenerateAnotherSame = async () => {
    resetFormForSameEmployer()
    setPreviewKey((k) => k + 1)
    setGenerateSuccess(false)
    setGeneratedDoc(null)
    setGeneratedFormat('docx')
    setShowPreview(false)
    await initForm(false, resolvedPlaceholders)
  }

  const renderField = (field) => {
    const { id, label, type, options, placeholder, default: defaultVal, required } = field
    const rules = required ? [{ required: true, message: `${label} is required` }] : []

    if (type === 'readonly_expiry') {
      return <ValidityExpiryReadonly key={id} form={form} />
    }
    if (type === 'readonly') {
      return (
        <Form.Item key={id} name={id} label={label || fieldLabel(id)}>
          <Input readOnly />
        </Form.Item>
      )
    }
    if (type === 'date') {
      return (
        <Form.Item key={id} name={id} label={label || fieldLabel(id)} rules={rules}>
          <DateField fieldId={id} form={form} />
        </Form.Item>
      )
    }
    if (type === 'textarea') {
      return (
        <Form.Item key={id} name={id} label={label} rules={rules}>
          <TextArea rows={3} placeholder={placeholder} />
        </Form.Item>
      )
    }
    if (type === 'select') {
      return (
        <Form.Item key={id} name={id} label={label} rules={rules} initialValue={defaultVal}>
          <Select options={(options || []).map((o) => ({ value: o, label: o }))} />
        </Form.Item>
      )
    }
    if (type === 'country_select') {
      return (
        <Form.Item
          key={id}
          name={id}
          label={label}
          rules={rules}
          getValueProps={(stored) => ({ value: getCountryCode(stored) })}
          getValueFromEvent={(code) => getCountryByCode(code)?.name || code}
        >
          <CountrySelect placeholder="Select nationality..." size="middle" />
        </Form.Item>
      )
    }
    if (type === 'email') {
      return (
        <Form.Item
          key={id}
          name={id}
          label={label}
          rules={[...rules, { type: 'email', message: 'Enter a valid email' }]}
        >
          <Input type="email" placeholder={placeholder} />
        </Form.Item>
      )
    }
    if (type === 'salutation_select') {
      return null
    }
    return (
      <Form.Item key={id} name={id} label={label || fieldLabel(id)} rules={rules}>
        <Input placeholder={placeholder || `Enter ${label || id}`} />
      </Form.Item>
    )
  }

  const occCode = tradeDetails?.occupation_code || getPrimaryOccupationCode(tradeDetails)
  const tradeLabel = occCode ? `${selectedTrade} (${occCode})` : selectedTrade

  useEffect(() => {
    if (!onRegisterNav) return
    if (loading || generateSuccess) {
      onRegisterNav(HIDDEN_NAV)
      return
    }
    if (showPreview) {
      onRegisterNav({
        hidden: false,
        onBack: handleBack,
        backLabel: '← Back to form',
        backHidden: false,
        nextHidden: true,
      })
      return
    }
    onRegisterNav({
      hidden: false,
      onBack: handleBack,
      onNext: handleReview,
      backLabel: 'Back',
      nextLabel: 'Review & Generate →',
    })
  }, [loading, generateSuccess, showPreview, handleBack, handleReview, onRegisterNav])

  if (templateMissing) {
    return (
      <Form form={form}>
        <Result
          status="warning"
          title="Template file missing"
          subTitle="The template record exists but the .docx file is not on the server. An admin must re-upload it."
          extra={
            <Space direction="vertical" style={{ width: '100%', maxWidth: 420 }}>
              <Text type="secondary">
                Admin Panel → Templates → open this template → <strong>Upload New Version</strong> →
                select your .docx file.
              </Text>
              <Button onClick={onBack}>Back to template selection</Button>
            </Space>
          }
        />
      </Form>
    )
  }

  if (loading) {
    return (
      <Form form={form}>
        <div style={{ padding: 24 }}>
          <div className="animate-shimmer" style={{ height: 80, borderRadius: 16, marginBottom: 16 }} />
          <div className="animate-shimmer" style={{ height: 40, borderRadius: 10, marginBottom: 12 }} />
          <div className="animate-shimmer" style={{ height: 40, borderRadius: 10, marginBottom: 12 }} />
          <div className="animate-shimmer" style={{ height: 40, borderRadius: 10, width: '60%' }} />
        </div>
      </Form>
    )
  }

  if (generateSuccess) {
    const isPdf = generatedFormat === 'pdf'
    return (
      <Form form={form}>
        <Result
          status="success"
          title="Document ready!"
          subTitle={
            isPdf
              ? 'Your PDF has been generated and downloaded.'
              : 'Your Word document has been generated and downloaded.'
          }
          extra={
            <Space direction="vertical" style={{ width: '100%', maxWidth: 360 }}>
              <Button
                type="primary"
                block
                icon={isPdf ? <FilePdfOutlined /> : <FileWordOutlined />}
                onClick={() => downloadDoc(generatedDoc.document_id, generatedFormat)}
              >
                Download {isPdf ? 'PDF' : 'DOCX'} again
              </Button>
              <Button type="primary" block onClick={handleGenerateAnotherSame}>
                Generate Another for Same Employer
              </Button>
              <Button block onClick={onStartFresh}>
                Start Fresh
              </Button>
            </Space>
          }
        />
      </Form>
    )
  }

  const columnBarStyle = {
    background: '#fff',
    padding: '0 24px',
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  }

  return (
    <div className="smart-fill-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <div className="smart-fill-header" style={{ ...columnBarStyle, borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Title level={5} style={{ margin: 0, lineHeight: 1.2, color: 'var(--primary)' }}>
              {showPreview ? 'Review & Generate' : 'Fill Document'}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {showPreview
                ? 'Check all values before generating'
                : `${formFields.length} fields from template · ${templateMeta?.format_label || 'Template'}`}
            </Text>
          </div>
        </div>

        <div className="smart-fill-body" style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '16px 20px' }}>
          <Card
            size="small"
            style={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' }}
            styles={{
              body: {
                padding: 0,
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              },
            }}
          >
            <div className="glass-summary" style={{ margin: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {employer?.logo_url && (
                  <LogoPreview src={employer.logo_url} maxWidth={64} maxHeight={36} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong>{employer?.company_name}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {tradeLabel}
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Ref: {refNumber}
                  </Text>
                </div>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={onEditEmployer}>
                  Edit
                </Button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' }} className="docflow-input">
              <Form
                form={form}
                layout="vertical"
                preserve
                onValuesChange={() => {
                  syncSalutation()
                  const values = form.getFieldsValue(true) || {}
                  const cleaned = Object.fromEntries(
                    Object.entries(values).filter(([, value]) => value !== undefined)
                  )
                  delete cleaned._salutation_prefix
                  mergeFormData(cleaned)
                }}
              >
                <Form.Item name="candidate_salutation" hidden>
                  <Input />
                </Form.Item>

                <div style={{ display: showPreview ? 'none' : 'block' }}>
                  {showSalutation && (
                    <Form.Item
                      name="_salutation_prefix"
                      label="Salutation"
                      initialValue="Mr."
                      rules={[{ required: true, message: 'Salutation is required' }]}
                    >
                      <Select options={SALUTATION_OPTIONS} />
                    </Form.Item>
                  )}
                  {formFields.map((field) => renderField(field))}
                </div>

                {showPreview && (
                  <StepSmartFillPreview
                    key={previewKey}
                    allFields={fieldsSnapshot}
                    buildPayload={buildPayload}
                    formFields={formFields}
                    employerSummary={{
                      companyName: employer?.company_name,
                      tradeLabel,
                      refNumber,
                    }}
                    onBackToForm={() => {
                      setShowPreview(false)
                      setFillSubStep(0)
                    }}
                    onEditEmployer={onEditEmployer}
                    onGenerateSuccess={(result, format) => {
                      setGeneratedDoc(result)
                      setGeneratedFormat(format || 'docx')
                      setGenerateSuccess(true)
                    }}
                    hideDocumentPreview
                  />
                )}
              </Form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
