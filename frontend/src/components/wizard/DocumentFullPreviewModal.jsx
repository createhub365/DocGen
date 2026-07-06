import { useEffect, useRef, useState } from 'react'
import { Modal, Button, Spin, Typography, Alert } from 'antd'
import { smartPreviewPdf, smartPreviewDocx, smartGenerateAndDownload, readApiErrorDetail } from '../../api/client'
import { useAppMessage } from '../../hooks/useAppMessage'
import FormatChoiceModal from '../ui/FormatChoiceModal'
import { renderDocxPagesToImages } from '../../utils/docxPageRenderer'
import { PREVIEW_PAGE_HEIGHT } from '../../utils/previewConstants'

const { Text } = Typography

const PDF_UNAVAILABLE_MESSAGE =
  'PDF preview unavailable — showing document preview instead'

function modalPreviewWidth() {
  if (typeof window === 'undefined') return 680
  return Math.min(Math.round(window.innerWidth * 0.85), 794)
}

export default function DocumentFullPreviewModal({
  open,
  onClose,
  buildPayload,
  title,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [docxFallback, setDocxFallback] = useState(false)
  const [docxPages, setDocxPages] = useState([])
  const [downloadingFormat, setDownloadingFormat] = useState(null)
  const [formatModalOpen, setFormatModalOpen] = useState(false)
  const blobUrlRef = useRef(null)
  const buildPayloadRef = useRef(buildPayload)
  const message = useAppMessage()

  buildPayloadRef.current = buildPayload

  const clearPdfUrl = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setPdfUrl(null)
  }

  const resetPreviewState = () => {
    clearPdfUrl()
    setError(null)
    setDocxFallback(false)
    setDocxPages([])
  }

  useEffect(() => {
    if (!open) {
      resetPreviewState()
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    resetPreviewState()

    ;(async () => {
      try {
        const blob = await smartPreviewPdf(buildPayloadRef.current())
        if (cancelled) return
        const pdfBlob =
          blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
        const url = URL.createObjectURL(pdfBlob)
        blobUrlRef.current = url
        setPdfUrl(url)
      } catch (err) {
        if (cancelled) return
        if (err.response?.status === 503) {
          try {
            const docxBlob = await smartPreviewDocx(buildPayloadRef.current())
            if (cancelled) return
            const rendered = await renderDocxPagesToImages(docxBlob, modalPreviewWidth())
            if (cancelled) return
            setDocxPages(rendered.length > 0 ? rendered : [])
            setDocxFallback(true)
            return
          } catch {
            if (cancelled) return
          }
        }
        const detail = await readApiErrorDetail(err)
        setError(detail || 'Preview unavailable. You can still generate the document.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(
    () => () => {
      clearPdfUrl()
    },
    []
  )

  const handleGenerateWithFormat = async (format) => {
    setDownloadingFormat(format)
    try {
      await smartGenerateAndDownload(buildPayloadRef.current(), format)
      message.success(`Document generated as ${format.toUpperCase()}!`)
      setFormatModalOpen(false)
      onClose()
    } catch (err) {
      if (err.code === 'PDF_UNAVAILABLE') {
        message.error(err.message)
      } else {
        message.error('Generation failed')
      }
    } finally {
      setDownloadingFormat(null)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title || 'Document Preview'}
      width="90vw"
      centered
      footer={null}
      closable
      destroyOnHidden
      styles={{
        body: { padding: 0, height: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
      }}
    >
      {docxFallback && !loading && (
        <Alert
          type="info"
          showIcon
          message={PDF_UNAVAILABLE_MESSAGE}
          style={{ margin: '12px 16px 0', flexShrink: 0 }}
        />
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f5f5f5',
              zIndex: 2,
            }}
          >
            <Spin size="large" />
            <Text type="secondary" style={{ marginTop: 16 }}>
              Generating preview...
            </Text>
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <Text type="secondary" style={{ marginBottom: 16 }}>
              {error.includes('unavailable')
                ? error
                : 'Preview unavailable. You can still generate the document.'}
            </Text>
            <Button type="primary" loading={!!downloadingFormat} onClick={() => setFormatModalOpen(true)}>
              Generate Document
            </Button>
          </div>
        )}

        {pdfUrl && !loading && !docxFallback && (
          <iframe
            src={pdfUrl}
            title="Document preview"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}

        {docxFallback && !loading && docxPages.length > 0 && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
            {docxPages.map((page) => (
              <div
                key={`docx-page-${page.page}`}
                style={{
                  marginBottom: 16,
                  background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                }}
              >
                <img
                  src={page.image}
                  alt={`Page ${page.page}`}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    maxHeight: PREVIEW_PAGE_HEIGHT,
                    objectFit: 'contain',
                    objectPosition: 'top center',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid #f0f0f0',
          background: '#fff',
        }}
      >
        <Button onClick={onClose}>← Back to Edit</Button>
      </div>

      <FormatChoiceModal
        open={formatModalOpen}
        onCancel={() => setFormatModalOpen(false)}
        onSelect={handleGenerateWithFormat}
        loadingFormat={downloadingFormat}
      />
    </Modal>
  )
}
