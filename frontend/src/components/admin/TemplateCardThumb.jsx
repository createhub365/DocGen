import { useState, useEffect } from 'react'
import { FileWordOutlined, LoadingOutlined } from '@ant-design/icons'
import { templateThumbnailUrl } from '../../utils/mediaUrl'

export default function TemplateCardThumb({ templateId }) {
  const [state, setState] = useState('loading')

  useEffect(() => {
    if (!templateId) {
      setState('icon')
      return undefined
    }

    const img = new Image()
    img.src = `${templateThumbnailUrl(templateId)}?v=${templateId}`
    img.onload = () => setState('image')
    img.onerror = () => setState('icon')

    return undefined
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

  if (state === 'image') {
    return (
      <img
        src={`${templateThumbnailUrl(templateId)}?v=${templateId}`}
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
