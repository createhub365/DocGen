import { useState } from 'react'
import { resolveMediaUrl } from '../utils/mediaUrl'

export default function LogoPreview({
  src,
  maxWidth = 180,
  maxHeight = 90,
  style,
  alt = 'Company logo',
  onError,
  className,
}) {
  const [failed, setFailed] = useState(false)
  const resolvedSrc = resolveMediaUrl(src)

  if (!resolvedSrc || failed) return null

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => {
        setFailed(true)
        onError?.()
      }}
      style={{
        maxWidth,
        maxHeight,
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        objectPosition: 'left center',
        opacity: 1,
        display: 'block',
        imageRendering: 'auto',
        ...style,
      }}
    />
  )
}
