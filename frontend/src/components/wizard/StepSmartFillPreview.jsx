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
import { COMPUTED_IDS } from '../../utils/placeholderFormBuilder'

const { Text, Title } = Typography

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
  formFields = [],
  onBackToForm,
  onEditEmployer,
  onGenerateSuccess,
  hideDocumentPreview = false,
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generatingFormat, setGeneratingFormat] = useState(null)
  const [formatModalOpen, setFormatModalOpen] = useState(false)
  const message = useAppMessage()

  const reviewFields = formFields.filter(
    (field) => field.type !== 'salutation_select' && !COMPUTED_IDS.has(field.id)
  )

  const collapseItems = [
    {
      key: 'employer',
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
          <span>🏢 Employer Info</span>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              onEditEmployer?.()
            }}
          >
            Edit
          </Button>
        </div>
      ),
      children: (
        <div>
          <ReviewRow label="Company" value={employerSummary.companyName} />
          <ReviewRow label="Trade / Position" value={employerSummary.tradeLabel} />
          <ReviewRow label="Reference Number" value={employerSummary.refNumber} />
        </div>
      ),
    },
    {
      key: 'fields',
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
          <span>📋 Form Fields ({reviewFields.length})</span>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              onBackToForm?.()
            }}
          >
            Edit
          </Button>
        </div>
      ),
      children: (
        <div>
          {reviewFields.map((field) => (
            <ReviewRow
              key={field.id}
              label={field.label || field.id}
              value={allFields[field.id]}
            />
          ))}
        </div>
      ),
    },
  ]

  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const blob = await smartPreviewPdf(buildPayload())
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewOpen(true)
    } catch (err) {
      const detail = await readApiErrorDetail(err)
      message.error(detail || 'PDF preview is not available. Use Word (.docx) or install LibreOffice on the server.')
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

      <Collapse items={collapseItems} defaultActiveKey={['employer', 'fields']} />

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
