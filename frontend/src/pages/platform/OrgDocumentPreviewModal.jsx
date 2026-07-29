import { useEffect, useRef, useState } from 'react'
import { Modal, Button, Spin, Typography } from 'antd'
import { FileWordOutlined, LoadingOutlined } from '@ant-design/icons'
import {
  fetchOrgTemplateDocxBlob,
  fetchOrgTemplateThumbnailUrl,
} from '../../api/platformClient'
import { renderDocxToContainer } from '../../utils/docxPageRenderer'

const { Text } = Typography

/**
 * Full-size document preview for platform org templates.
 *
 * Prefers the LibreOffice/PDF page-1 thumbnail (same path as card thumbs) so
 * floating/anchored logos and letterheads match Word. docx-preview is only a
 * fallback when no thumbnail exists — it does not handle wrapSquare anchors
 * (logo can overlap header text).
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
  const [mode, setMode] = useState('idle') // idle | thumbnail | docx | error
  const [thumbUrl, setThumbUrl] = useState(null)
  const [docxBlob, setDocxBlob] = useState(null)
  const docxHostRef = useRef(null)

  useEffect(() => {
    if (!open || !templateId || !documentTypeId) {
      setMode('idle')
      setLoading(false)
      setDocxBlob(null)
      setThumbUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setMode('idle')
    setDocxBlob(null)
    setThumbUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })

    async function load() {
      // 1) Prefer PDF-faithful page-1 thumbnail when available
      if (hasThumbnail) {
        const url = await fetchOrgTemplateThumbnailUrl(documentTypeId, templateId)
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        if (url) {
          setThumbUrl(url)
          setMode('thumbnail')
          setLoading(false)
          return
        }
      }

      // 2) Fallback: HTML docx-preview (known gaps for floating images)
      try {
        const blob = await fetchOrgTemplateDocxBlob(documentTypeId, templateId)
        if (cancelled) return
        setDocxBlob(blob)
        setMode('docx')
      } catch {
        if (!cancelled) {
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
    if (!open || mode !== 'docx' || !docxBlob) return undefined

    let cancelled = false

    async function renderDocx() {
      try {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        if (cancelled || !docxHostRef.current) return
        docxHostRef.current.innerHTML = ''
        await renderDocxToContainer(docxHostRef.current, docxBlob, { pageWidth: 794 })
        if (!cancelled) setLoading(false)
      } catch {
        if (!cancelled) {
          setMode('error')
          setLoading(false)
        }
      }
    }

    renderDocx()
    return () => {
      cancelled = true
      if (docxHostRef.current) docxHostRef.current.innerHTML = ''
    }
  }, [open, mode, docxBlob])

  useEffect(() => {
    return () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl)
    }
  }, [thumbUrl])

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
      width="min(920px, 96vw)"
      centered
      title={title || 'Document preview'}
      destroyOnHidden
      styles={{
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
            Preview could not be loaded.
          </Text>
        </div>
      )}
      {!loading && mode === 'thumbnail' && thumbUrl && (
        <div
          style={{
            maxWidth: 794,
            margin: '0 auto',
            background: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
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
            Page 1 preview (matches Word/PDF layout)
          </Text>
        </div>
      )}
      {mode === 'docx' && (
        <div
          style={{
            display: loading ? 'none' : 'block',
            maxWidth: 794,
            margin: '0 auto',
            background: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            padding: 16,
          }}
        >
          <div ref={docxHostRef} className="live-preview-docx" />
        </div>
      )}
    </Modal>
  )
}
