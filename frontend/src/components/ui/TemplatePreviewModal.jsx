import { useEffect, useRef, useState } from 'react'
import { Modal, Button, Spin, Typography } from 'antd'
import { FileWordOutlined, LoadingOutlined } from '@ant-design/icons'
import { fetchTemplateDocxBlob } from '../../api/client'
import { renderDocxToContainer } from '../../utils/docxPageRenderer'
import { probeImage, templateThumbnailUrl } from '../../utils/mediaUrl'

const { Text } = Typography

export default function TemplatePreviewModal({ templateId, title, open, onClose }) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('idle')
  const [cacheKey, setCacheKey] = useState(0)
  const docxHostRef = useRef(null)

  useEffect(() => {
    if (!open || !templateId) {
      setMode('idle')
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setCacheKey(Date.now())
    setLoading(true)
    setMode('idle')

    async function loadPreview() {
      const thumbUrl = `${templateThumbnailUrl(templateId)}?v=${Date.now()}`
      const hasThumb = await probeImage(thumbUrl)
      if (cancelled) return

      if (hasThumb) {
        setMode('thumbnail')
        setLoading(false)
        return
      }

      setMode('docx')
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [open, templateId])

  useEffect(() => {
    if (!open || !templateId || mode !== 'docx') return undefined

    let cancelled = false

    async function renderDocxPreview() {
      try {
        const blob = await fetchTemplateDocxBlob(templateId)
        if (cancelled) return
        await new Promise((resolve) => requestAnimationFrame(resolve))
        if (!docxHostRef.current) return
        docxHostRef.current.innerHTML = ''
        await renderDocxToContainer(docxHostRef.current, blob, {
          pageWidth: 794,
        })
        if (!cancelled) setLoading(false)
      } catch {
        if (!cancelled) {
          setMode('error')
          setLoading(false)
        }
      }
    }

    renderDocxPreview()

    return () => {
      cancelled = true
      if (docxHostRef.current) {
        docxHostRef.current.innerHTML = ''
      }
    }
  }, [open, templateId, mode])

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
      width="90vw"
      centered
      title={title || 'Template Preview'}
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
            Preview could not be loaded. Try Regenerate Thumbnails in Admin Panel.
          </Text>
        </div>
      )}
      {!loading && mode === 'thumbnail' && (
        <div
          style={{
            maxWidth: 794,
            margin: '0 auto',
            background: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          }}
        >
          <img
            src={`${templateThumbnailUrl(templateId)}?v=${cacheKey}`}
            alt="Template preview"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              imageRendering: 'auto',
            }}
          />
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
