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
import StepIndicator, { WIZARD_STEP_LABELS } from '../ui/StepIndicator'
import ValidityExpiryReadonly from './ValidityExpiryReadonly'
import CountrySelect from '../ui/CountrySelect'
import { getCountryByCode, getCountryCode } from '../../data/countries'
import { getPrimaryOccupationCode } from '../../data/occupationCodes'
import { SUB_STEP_ITEMS } from './subStepMeta'
import {
  buildEmployerPrefill,
  VISIBLE_FORM_SECTIONS,
  fieldLabel,
  STORE_DATE_FORMAT,
} from './smartFormConfig'

dayjs.extend(customParseFormat)

const { Title, Text } = Typography
const { TextArea } = Input

const SALUTATION_OPTIONS = [
  { value: 'Mr.', label: 'Mr.' },
  { value: 'Ms.', label: 'Ms.' },
  { value: 'Mrs.', label: 'Mrs.' },
  { value: 'Dr.', label: 'Dr.' },
]

const PREVIEW_STEP_INDEX = VISIBLE_FORM_SECTIONS.length
const HIDDEN_NAV = { hidden: true }

export default function StepSmartFillForm({
  onBack,
  onEditEmployer,
  onStartFresh,
  onRegisterNav,
  onGoToMainStep,
  mainStepContext = '',
  mainStepCurrent = 4,
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
    fillSubStep,
    fillMaxCompleted,
    setFillSubStep,
    setFillMaxCompleted,
  } = useDocStore()
  const [loading, setLoading] = useState(true)
  const [refNumber, setRefNumber] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const [generateSuccess, setGenerateSuccess] = useState(false)
  const [generatedDoc, setGeneratedDoc] = useState(null)
  const [generatedFormat, setGeneratedFormat] = useState('docx')
  const [form] = Form.useForm()
  const salutationPrefix = Form.useWatch('_salutation_prefix', form)
  const message = useAppMessage()
  const refInit = useRef(false)
  const backgroundFieldsRef = useRef({})

  const initForm = async (keepSaved = true) => {
    const prefill = buildEmployerPrefill(employer, selectedTrade)
    const defaults = {}

    VISIBLE_FORM_SECTIONS.forEach((section) => {
      section.fields.forEach((f) => {
        if (f.defaultToday) {
          defaults[f.id] = dayjs().format(STORE_DATE_FORMAT)
        } else if (f.default) {
          defaults[f.id] = f.default
        }
      })
    })

    let ref = keepSaved ? formData.ref_number : null
    if (!ref) {
      const data = await incrementRefCounter()
      ref = data.formatted
    }
    setRefNumber(ref)
    backgroundFieldsRef.current = { ...prefill, ref_number: ref }

    const visibleIds = new Set()
    VISIBLE_FORM_SECTIONS.forEach((section) => {
      section.fields.forEach((f) => visibleIds.add(f.id))
    })
    const savedVisible = keepSaved
      ? Object.fromEntries(Object.entries(formData).filter(([key]) => visibleIds.has(key)))
      : {}

    const initial = {
      ...defaults,
      ...savedVisible,
      _salutation_prefix: 'Mr.',
    }
    form.setFieldsValue(initial)
    syncSalutation(initial)
    setFormDataBulk({ ...backgroundFieldsRef.current, ...initial })
  }

  useEffect(() => {
    if (!templateId || !employer) return
    setLoading(true)
    refInit.current = false

    getTemplateById(templateId)
      .finally(() => {
        initForm(true)
          .catch(() => message.error('Failed to prepare form'))
          .finally(() => setLoading(false))
      })
  }, [templateId, employer])

  useEffect(() => {
    if (!employer || !selectedTrade || loading) return
    const prefill = buildEmployerPrefill(employer, selectedTrade)
    const existingRef =
      backgroundFieldsRef.current.ref_number || formData.ref_number || refNumber
    backgroundFieldsRef.current = { ...prefill, ref_number: existingRef }
    mergeFormData({ ...prefill, ref_number: existingRef })
    if (existingRef) setRefNumber(existingRef)
  }, [selectedTrade])

  useLayoutEffect(() => {
    if (loading || fillSubStep !== 0) return
    const prefix = form.getFieldValue('_salutation_prefix') || 'Mr.'
    form.setFields([
      { name: '_salutation_prefix', value: prefix, errors: [], touched: false, validated: false },
    ])
    syncSalutation({ _salutation_prefix: prefix })
  }, [loading, fillSubStep, form])

  const syncSalutation = (values) => {
    const prefix = values?._salutation_prefix || form.getFieldValue('_salutation_prefix') || 'Mr.'
    const name = values?.candidate_full_name ?? form.getFieldValue('candidate_full_name') ?? ''
    form.setFieldValue('candidate_salutation', name ? `${prefix} ${name}`.trim() : prefix)
  }

  const getSectionFieldIds = (index) =>
    VISIBLE_FORM_SECTIONS[index].fields.map((f) => f.id)

  const buildAllFields = () => {
    const values = {
      ...backgroundFieldsRef.current,
      ...formData,
      ...form.getFieldsValue(true),
    }
    delete values._salutation_prefix
    return values
  }

  const persistFields = () => {
    const values = form.getFieldsValue(true)
    delete values._salutation_prefix
    mergeFormData(values)
    return { ...backgroundFieldsRef.current, ...formData, ...values }
  }

  const buildPayload = useCallback(
    () => ({
      template_id: templateId,
      template: { ...templateMeta, trade_category: tradeCategory },
      employer_id: employer.id,
      trade: selectedTrade,
      trade_category: tradeCategory,
      fields: buildAllFields(),
    }),
    [templateId, templateMeta, employer, selectedTrade, tradeCategory, formData]
  )

  const handleNext = useCallback(async () => {
    if (fillSubStep >= PREVIEW_STEP_INDEX) return
    try {
      if (fillSubStep === 0) {
        const prefix = form.getFieldValue('_salutation_prefix') || 'Mr.'
        form.setFieldValue('_salutation_prefix', prefix)
        syncSalutation({ _salutation_prefix: prefix })
        await form.validateFields(getSectionFieldIds(0))
      } else if (fillSubStep === 1) {
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
        await form.validateFields([...getSectionFieldIds(1)])
      } else {
        await form.validateFields(getSectionFieldIds(fillSubStep))
      }
      const next = fillSubStep + 1
      setFillMaxCompleted(Math.max(fillMaxCompleted, next))
      persistFields()
      setFillSubStep(next)
    } catch {
      message.error('Please fill all required fields')
    }
  }, [fillSubStep, fillMaxCompleted, form, message])

  const handleBack = useCallback(() => {
    if (fillSubStep === 0) {
      onBack()
    } else {
      setFillSubStep(fillSubStep - 1)
    }
  }, [fillSubStep, onBack, setFillSubStep])

  const handleGenerateAnotherSame = async () => {
    resetFormForSameEmployer()
    setPreviewKey((k) => k + 1)
    setGenerateSuccess(false)
    setGeneratedDoc(null)
    setGeneratedFormat('docx')
    refInit.current = false
    await initForm(false)
  }

  const renderField = (field) => {
    const { id, label, type, options, placeholder, default: defaultVal, required } = field
    const rules = required ? [{ required: true, message: `${label} is required` }] : []

    if (type === 'readonly_expiry') {
      return <ValidityExpiryReadonly key={id} form={form} />
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
    if (type === 'salutation_select') {
      return null
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
    return (
      <Form.Item key={id} name={id} label={label || fieldLabel(id)} rules={rules}>
        <Input placeholder={placeholder || `Enter ${label || id}`} />
      </Form.Item>
    )
  }

  const occCode = tradeDetails?.occupation_code || getPrimaryOccupationCode(tradeDetails)
  const tradeLabel = occCode ? `${selectedTrade} (${occCode})` : selectedTrade
  const currentSection = VISIBLE_FORM_SECTIONS[fillSubStep]
  const isPreview = fillSubStep === PREVIEW_STEP_INDEX

  const navCenter = useMemo(
    () => (
      <StepIndicator
        variant="compact"
        current={mainStepCurrent}
        labels={WIZARD_STEP_LABELS}
        onSelect={onGoToMainStep}
        maxReachable={mainStepCurrent}
      />
    ),
    [mainStepCurrent, onGoToMainStep]
  )

  useEffect(() => {
    if (!onRegisterNav) return
    if (loading || generateSuccess || isPreview) {
      onRegisterNav(HIDDEN_NAV)
      return
    }
    onRegisterNav({
      hidden: false,
      onBack: handleBack,
      onNext: handleNext,
      backLabel: fillSubStep === 0 ? 'Back' : '← Back',
      nextLabel: 'Next →',
      center: navCenter,
    })
  }, [
    loading,
    generateSuccess,
    isPreview,
    fillSubStep,
    handleBack,
    handleNext,
    navCenter,
    onRegisterNav,
  ])

  if (loading) {
    return (
      <Form form={form}>
        <div style={{ padding: 24 }}>
          <div className="animate-shimmer" style={{ height: 3, borderRadius: 999, marginBottom: 24 }} />
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
              {isPreview ? 'Review & Generate' : currentSection?.title || 'Fill & Generate'}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {mainStepContext || 'Complete the form sections below'}
              {!isPreview && currentSection
                ? ` · Section ${fillSubStep + 1} of ${SUB_STEP_ITEMS.length}`
                : ''}
            </Text>
          </div>
        </div>

        <div className="smart-fill-body" style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '16px 20px' }}>
        <div className="form-progress-bar" style={{ marginBottom: 12 }}>
          <div
            className="form-progress-fill"
            style={{
              width: `${Math.min(
                Math.round(((fillSubStep + 1) / SUB_STEP_ITEMS.length) * 100),
                100
              )}%`,
            }}
          />
        </div>
        <Card
          size="small"
          style={{ height: 'calc(100% - 15px)', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' }}
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
                const values = form.getFieldsValue(true)
                delete values._salutation_prefix
                mergeFormData(values)
              }}
            >
              <Form.Item name="candidate_salutation" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="_salutation_prefix" hidden>
                <Input />
              </Form.Item>
              {!isPreview && currentSection && (
                <>
                  <Title level={5} style={{ marginTop: 0 }}>
                    {currentSection.title}
                  </Title>
                  {currentSection.note && (
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                      {currentSection.note}
                    </Text>
                  )}
                  {fillSubStep === 0 && (
                    <Form.Item label="Salutation" required>
                      <Select
                        value={salutationPrefix || 'Mr.'}
                        options={SALUTATION_OPTIONS}
                        onChange={(value) => {
                          form.setFieldValue('_salutation_prefix', value)
                          syncSalutation({ _salutation_prefix: value })
                        }}
                      />
                    </Form.Item>
                  )}
                  {currentSection.fields
                    .filter((f) => f.type !== 'salutation_select')
                    .map((f) => renderField(f))}
                </>
              )}

              {isPreview && (
                <StepSmartFillPreview
                  key={previewKey}
                  allFields={buildAllFields()}
                  buildPayload={buildPayload}
                  employerSummary={{
                    companyName: employer?.company_name,
                    tradeLabel,
                    refNumber,
                  }}
                  onJumpToSubStep={(index) => {
                    if (index === -1) onEditEmployer()
                    else setFillSubStep(index)
                  }}
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
