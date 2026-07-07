import { useEffect, useState } from 'react'
import { FileWordOutlined, LoadingOutlined } from '@ant-design/icons'
import { fetchTemplateDocxBlob } from '../../api/client'
import { renderDocxPagesToImages } from '../../utils/docxPageRenderer'
import { probeImage, templateThumbnailUrl } from '../../utils/mediaUrl'

const CARD_PREVIEW_WIDTH = 220

export default function TemplateCardThumb({ templateId }) {
  const [previewSrc, setPreviewSrc] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    if (!templateId) {
      setState('icon')
      setPreviewSrc(null)
      return undefined
    }

    let cancelled = false

    async function loadPreview() {
      setState('loading')
      setPreviewSrc(null)

      const thumbUrl = `${templateThumbnailUrl(templateId)}?v=${templateId}`
      if (await probeImage(thumbUrl)) {
        if (!cancelled) {
          setPreviewSrc(thumbUrl)
          setState('image')
        }
        return
      }

      try {
        const blob = await fetchTemplateDocxBlob(templateId)
        const pages = await renderDocxPagesToImages(blob, CARD_PREVIEW_WIDTH)
        if (!cancelled && pages[0]?.image) {
          setPreviewSrc(pages[0].image)
          setState('image')
          return
        }
      } catch {
        // fall through to icon state
      }

      if (!cancelled) {
        setState('icon')
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [templateId])

  if (state === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: '#fafafa',
        }}
      >
        <LoadingOutlined style={{ fontSize: 24, color: '#ccc' }} />
      </div>
    )
  }

  if (state === 'image' && previewSrc) {
    return (
      <img
        src={previewSrc}
        alt="Template preview"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'top center',
          display: 'block',
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#f5f5f5',
        gap: 8,
      }}
    >
      <FileWordOutlined style={{ fontSize: 40, color: '#ccc' }} />
      <span style={{ fontSize: 10, color: '#bbb' }}>Word template</span>
    </div>
  )
}
