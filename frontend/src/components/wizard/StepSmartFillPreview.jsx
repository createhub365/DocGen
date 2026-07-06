import { useState } from 'react'
import {
  Button,
  Collapse,
  Modal,
  Row,
  Col,
  Typography,
  Space,
} from 'antd'
import { EditOutlined, EyeOutlined, CheckOutlined } from '@ant-design/icons'
import { smartPreviewPdf, smartGenerateAndDownload, readApiErrorDetail } from '../../api/client'
import { useAppMessage } from '../../hooks/useAppMessage'
import FormatChoiceModal from '../ui/FormatChoiceModal'
import { VISIBLE_FORM_SECTIONS } from './smartFormConfig'

const { Text, Title } = Typography

const SECTION_TITLES = {
  candidate: '👤 Candidate Details',
  document: '📄 Document Details',
  position: '💼 Position Details',
  remuneration: '💰 Remuneration',
  allowances: '🎁 Allowances',
  qualifications: '🎓 Qualifications',
  signature: '✍️ Candidate Signature',
}

const REVIEW_SECTIONS = [
  {
    key: 'employer',
    title: '🏢 Employer Info',
    isEmployer: true,
    fields: [
      { id: 'company_name', label: 'Company' },
      { id: 'position_title', label: 'Trade / Position' },
      { id: 'ref_number', label: 'Reference Number' },
    ],
  },
  ...VISIBLE_FORM_SECTIONS.map((s, index) => ({
    key: s.key,
    title: SECTION_TITLES[s.key],
    fields: s.fields,
    subStepIndex: index,
  })),
]

function ReviewRow({ label, value }) {
  return (
    <Row gutter={16} style={{ marginBottom: 8 }}>
      <Col span={10}>
        <Text type="secondary">{label}</Text>
      </Col>
      <Col span={14}>
        <Text>{value || '—'}</Text>
      </Col>
    </Row>
  )
}

export default function StepSmartFillPreview({
  allFields,
  buildPayload,
  employerSummary,
  onJumpToSubStep,
  onGenerateSuccess,
  hideDocumentPreview = false,
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generatingFormat, setGeneratingFormat] = useState(null)
  const [formatModalOpen, setFormatModalOpen] = useState(false)
  const message = useAppMessage()

  const getDisplayValue = (field, section) => {
    if (section.isEmployer) {
      if (field.id === 'company_name') return employerSummary.companyName
      if (field.id === 'position_title') return employerSummary.tradeLabel
      if (field.id === 'ref_number') return employerSummary.refNumber
    }
    return allFields[field.id]
  }

  const collapseItems = REVIEW_SECTIONS.map((section) => ({
    key: section.key,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
        <span>{section.title}</span>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            onJumpToSubStep(section.isEmployer ? -1 : section.subStepIndex)
          }}
        >
          Edit
        </Button>
      </div>
    ),
    children: (
      <div>
        {section.fields.map((field) => (
          <ReviewRow
            key={field.id}
            label={field.label || field.id}
            value={getDisplayValue(field, section)}
          />
        ))}
      </div>
    ),
  }))

  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const blob = await smartPreviewPdf(buildPayload())
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewOpen(true)
    } catch (err) {
      const detail = await readApiErrorDetail(err)
      message.error(detail || 'PDF preview requires Microsoft Word on Windows')
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = () => {
    setPreviewOpen(false)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  const handleGenerateWithFormat = async (format) => {
    setGeneratingFormat(format)
    try {
      const result = await smartGenerateAndDownload(buildPayload(), format)
      message.success(`Document generated as ${format.toUpperCase()}!`)
      onGenerateSuccess?.(result, format)
      setFormatModalOpen(false)
    } catch (err) {
      if (err.code === 'PDF_UNAVAILABLE') {
        message.error(err.message)
      } else {
        message.error('Generation failed')
      }
    } finally {
      setGeneratingFormat(null)
    }
  }

  return (
    <div>
      <Title level={5} style={{ marginBottom: 16, color: 'var(--primary)' }}>
        Review before generating
      </Title>

      <Collapse items={collapseItems} defaultActiveKey={REVIEW_SECTIONS.map((s) => s.key)} />

      <Space style={{ marginTop: 24 }} wrap>
        {!hideDocumentPreview && (
          <Button icon={<EyeOutlined />} loading={previewLoading} onClick={handlePreview}>
            Preview PDF
          </Button>
        )}
        <Button
          type="primary"
          icon={<CheckOutlined />}
          loading={!!generatingFormat}
          onClick={() => setFormatModalOpen(true)}
          style={{ background: 'var(--primary)', borderColor: 'var(--primary)' }}
        >
          Generate Document
        </Button>
      </Space>

      <FormatChoiceModal
        open={formatModalOpen}
        onCancel={() => setFormatModalOpen(false)}
        onSelect={handleGenerateWithFormat}
        loadingFormat={generatingFormat}
      />

      <Modal
        open={previewOpen}
        onCancel={closePreview}
        footer={null}
        width="90%"
        style={{ top: 24 }}
        title="PDF Preview"
        destroyOnHidden
      >
        {previewUrl && (
          <iframe
            src={previewUrl}
            title="PDF preview"
            style={{ width: '100%', height: '75vh', border: 'none' }}
          />
        )}
      </Modal>
    </div>
  )
}
