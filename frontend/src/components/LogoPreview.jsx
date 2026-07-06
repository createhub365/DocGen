export default function LogoPreview({ src, maxWidth = 180, maxHeight = 90 }) {
  if (!src) return null

  return (
    <img
      src={src}
      alt="Company logo"
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
      }}
    />
  )
}
