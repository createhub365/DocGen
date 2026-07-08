import { useEffect, useState } from 'react'
import { Modal, Button, Space, Typography, Alert } from 'antd'
import { FilePdfOutlined, FileWordOutlined } from '@ant-design/icons'
import { getHealth } from '../../api/client'

const { Text } = Typography

export default function FormatChoiceModal({
  open,
  onCancel,
  onSelect,
  loadingFormat = null,
  title = 'Choose document format',
}) {
  const [pdfAvailable, setPdfAvailable] = useState(true)
  const [pdfDetail, setPdfDetail] = useState('')
  const isBusy = loadingFormat === 'pdf' || loadingFormat === 'docx'

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    getHealth()
      .then((health) => {
        if (cancelled) return
        setPdfAvailable(health.pdf_available !== false)
        setPdfDetail(health.pdf_engine || health.pdf_detail || '')
      })
      .catch(() => {
        if (!cancelled) setPdfAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Modal
      open={open}
      onCancel={isBusy ? undefined : onCancel}
      footer={null}
      title={title}
      centered
      width={400}
      destroyOnHidden
      closable={!isBusy}
      maskClosable={!isBusy}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Select the format for your generated document.
      </Text>
      {!pdfAvailable && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="PDF is not available on this server yet."
          description={pdfDetail || 'Use Word (.docx). PDF needs LibreOffice on the server.'}
        />
      )}
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Button
          block
          size="large"
          icon={<FilePdfOutlined />}
          loading={loadingFormat === 'pdf'}
          disabled={!pdfAvailable || (isBusy && loadingFormat !== 'pdf')}
          onClick={() => onSelect('pdf')}
        >
          PDF (.pdf)
        </Button>
        <Button
          block
          size="large"
          icon={<FileWordOutlined />}
          loading={loadingFormat === 'docx'}
          disabled={isBusy && loadingFormat !== 'docx'}
          onClick={() => onSelect('docx')}
          type={pdfAvailable ? 'default' : 'primary'}
        >
          Word (.docx)
        </Button>
      </Space>
    </Modal>
  )
}
