import { useEffect, useState } from 'react'
import { Modal, Button, Spin, Typography } from 'antd'
import { CloseOutlined, FileWordOutlined, LoadingOutlined } from '@ant-design/icons'
import {
  fetchOrgTemplatePreviewPdfBlob,
  fetchOrgTemplateThumbnailUrl,
} from '../../api/platformClient'
import { colors } from '../../design/tokens'
import { renderPdfPagesToImages } from '../../utils/pdfPageRenderer'

const { Text } = Typography

const PREVIEW_PAGE_WIDTH = 794

/** Subtle 1px hairline — matches platform `colors.border` (#E8D8D8). */
const PAGE_FRAME = {
  border: `1px solid ${colors.border}`,
  boxShadow: 'none',
}

/**
 * Full-document preview for platform org templates.
 *
 * Primary path: convert .docx → full multi-page PDF on the server, then render
 * every page with pdfjs-dist (watermarks / floating logos preserved — unlike
 * docx-preview HTML, and unlike the page-1-only thumbnail PNG).
 *
 * Fallback: page-1 thumbnail PNG if PDF conversion is unavailable.
 */
export default function OrgDocumentPreviewModal({
  documentTypeId,
  templateId,
  title,
  hasThumbnail,
  open,
  onClose,
}) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('idle') // idle | pdf | thumbnail | error
  const [pages, setPages] = useState([])
  const [thumbUrl, setThumbUrl] = useState(null)
  const [errorDetail, setErrorDetail] = useState(null)

  useEffect(() => {
    if (!open || !templateId || !documentTypeId) {
      setMode('idle')
      setLoading(false)
      setPages([])
      setErrorDetail(null)
      setThumbUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setMode('idle')
    setPages([])
    setErrorDetail(null)
    setThumbUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })

    async function loadThumbnailFallback() {
      if (!hasThumbnail) return false
      const url = await fetchOrgTemplateThumbnailUrl(documentTypeId, templateId)
      if (cancelled) {
        if (url) URL.revokeObjectURL(url)
        return false
      }
      if (!url) return false
      setThumbUrl(url)
      setMode('thumbnail')
      setLoading(false)
      return true
    }

    async function load() {
      try {
        const pdfBlob = await fetchOrgTemplatePreviewPdfBlob(
          documentTypeId,
          templateId
        )
        if (cancelled) return
        const rendered = await renderPdfPagesToImages(pdfBlob, PREVIEW_PAGE_WIDTH)
        if (cancelled) return
        if (!rendered.length) {
          throw new Error('PDF preview produced no pages')
        }
        setPages(rendered)
        setMode('pdf')
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const ok = await loadThumbnailFallback()
        if (!ok && !cancelled) {
          setErrorDetail(err?.message || 'Preview could not be loaded.')
          setMode('error')
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, documentTypeId, templateId, hasThumbnail])

  useEffect(() => {
    return () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl)
    }
  }, [thumbUrl])

  const pageCount = pages.length

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button danger type="primary" icon={<CloseOutlined />} onClick={onClose}>
            Close
          </Button>
        </div>
      }
      width="min(920px, 96vw)"
      centered
      title={title || 'Document preview'}
      destroyOnHidden
      styles={{
        content: {
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 16px rgba(107, 15, 15, 0.08)',
        },
        body: {
          maxHeight: '75vh',
          overflowY: 'auto',
          padding: loading ? 24 : 16,
          background: '#f5f5f5',
        },
      }}
    >
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
        </div>
      )}
      {!loading && mode === 'error' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <FileWordOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
          <Text type="secondary" style={{ display: 'block' }}>
            {errorDetail || 'Preview could not be loaded.'}
          </Text>
        </div>
      )}
      {!loading && mode === 'thumbnail' && thumbUrl && (
        <div
          style={{
            maxWidth: PREVIEW_PAGE_WIDTH,
            margin: '0 auto',
            background: '#fff',
            ...PAGE_FRAME,
          }}
        >
          <img
            src={thumbUrl}
            alt=""
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          <Text
            type="secondary"
            style={{ display: 'block', textAlign: 'center', padding: '8px 12px' }}
          >
            Page 1 only — full PDF preview unavailable on this server
          </Text>
        </div>
      )}
      {!loading && mode === 'pdf' && pageCount > 0 && (
        <div>
          <Text
            type="secondary"
            style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}
          >
            {pageCount} page{pageCount === 1 ? '' : 's'} — scroll to view all
          </Text>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              alignItems: 'center',
            }}
          >
            {pages.map((page) => (
              <div
                key={page.page}
                style={{
                  width: '100%',
                  maxWidth: PREVIEW_PAGE_WIDTH,
                  background: '#fff',
                  ...PAGE_FRAME,
                }}
              >
                <img
                  src={page.image}
                  alt={`Page ${page.page} of ${pageCount}`}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
                <Text
                  type="secondary"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '6px 8px',
                    fontSize: 12,
                  }}
                >
                  Page {page.page} of {pageCount}
                </Text>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
