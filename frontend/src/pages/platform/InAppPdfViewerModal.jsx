import { useEffect, useState } from 'react'
import { Modal, Spin, Typography } from 'antd'
import { FileWordOutlined, LoadingOutlined } from '@ant-design/icons'
import { colors } from '../../design/tokens'
import { renderPdfPagesToImages } from '../../utils/pdfPageRenderer'

const { Text } = Typography

const PREVIEW_PAGE_WIDTH = 794

const PAGE_FRAME = {
  border: `1px solid ${colors.border}`,
  boxShadow: 'none',
}

/**
 * Standard in-app PDF viewer (pdfjs multi-page). Never opens a new browser tab.
 *
 * @param {() => Promise<Blob>} loadPdf — fetch the PDF blob when the modal opens
 */
export default function InAppPdfViewerModal({ open, onClose, title, loadPdf }) {
  const [loading, setLoading] = useState(false)
  const [pages, setPages] = useState([])
  const [errorDetail, setErrorDetail] = useState(null)

  useEffect(() => {
    if (!open || typeof loadPdf !== 'function') {
      setLoading(false)
      setPages([])
      setErrorDetail(null)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setPages([])
    setErrorDetail(null)

    ;(async () => {
      try {
        const pdfBlob = await loadPdf()
        if (cancelled) return
        const rendered = await renderPdfPagesToImages(pdfBlob, PREVIEW_PAGE_WIDTH)
        if (cancelled) return
        if (!rendered.length) {
          throw new Error('PDF preview produced no pages')
        }
        setPages(rendered)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setErrorDetail(err?.message || 'Preview could not be loaded.')
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, loadPdf])

  const pageCount = pages.length

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={`min(${PREVIEW_PAGE_WIDTH + 2}px, 96vw)`}
      centered
      title={title || 'Document preview'}
      destroyOnHidden
      styles={{
        content: {
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 16px rgba(107, 15, 15, 0.08)',
          paddingBottom: 0,
        },
        header: {
          marginBottom: 0,
          paddingBottom: 8,
        },
        body: {
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: loading || errorDetail ? 24 : 0,
          background: loading || errorDetail ? '#f5f5f5' : '#fff',
        },
      }}
    >
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
        </div>
      )}
      {!loading && errorDetail && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <FileWordOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
          <Text type="secondary" style={{ display: 'block' }}>
            {errorDetail}
          </Text>
        </div>
      )}
      {!loading && !errorDetail && pageCount > 0 && (
        <div>
          <Text
            type="secondary"
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '6px 8px',
              fontSize: 12,
              background: '#fafafa',
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            {pageCount} page{pageCount === 1 ? '' : 's'} — scroll to view all
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pages.map((page) => (
              <div
                key={page.page}
                style={{
                  width: '100%',
                  background: '#fff',
                  borderBottom:
                    page.page < pageCount ? `1px solid ${colors.border}` : undefined,
                  ...PAGE_FRAME,
                }}
              >
                <img
                  src={page.image}
                  alt={`Page ${page.page} of ${pageCount}`}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
