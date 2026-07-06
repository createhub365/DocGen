import { useEffect, useState } from 'react'
import { Modal, Button, Spin, Typography } from 'antd'
import { FileWordOutlined, LoadingOutlined } from '@ant-design/icons'

const { Text } = Typography

function templateThumbnailUrl(templateId) {
  return `/api/templates/${templateId}/thumbnail`
}

export default function TemplatePreviewModal({ templateId, title, open, onClose }) {
  const [loading, setLoading] = useState(false)
  const [hasThumbnail, setHasThumbnail] = useState(false)
  const [cacheKey, setCacheKey] = useState(0)

  useEffect(() => {
    if (!open || !templateId) {
      setHasThumbnail(false)
      setLoading(false)
      return undefined
    }

    setCacheKey(Date.now())
    let cancelled = false
    setLoading(true)
    setHasThumbnail(false)

    const img = new Image()
    img.src = `${templateThumbnailUrl(templateId)}?v=${Date.now()}`
    img.onload = () => {
      if (!cancelled) {
        setHasThumbnail(true)
        setLoading(false)
      }
    }
    img.onerror = () => {
      if (!cancelled) {
        setHasThumbnail(false)
        setLoading(false)
      }
    }

    return () => {
      cancelled = true
    }
  }, [open, templateId])

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
      {!loading && !hasThumbnail && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <FileWordOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
          <Text type="secondary" style={{ display: 'block' }}>
            Preview not ready yet. Use Regenerate Thumbnails in the Admin Panel.
          </Text>
        </div>
      )}
      {!loading && hasThumbnail && (
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
    </Modal>
  )
}
