import { getCountryByCode, getCountryByName, getCountryCode } from '../../data/countries'

/** ISO code for flag-icons CSS class (bundled locally — no CDN). */
export function getCountryFlagClass(nameOrCode) {
  const code = getCountryCode(nameOrCode)?.toLowerCase()
  return code ? `fi fi-${code}` : null
}

export default function CountryFlag({
  code,
  name,
  size = 24,
  style = {},
  className = '',
  rounded = 3,
}) {
  const meta =
    (code && getCountryByCode(code)) ||
    (name && getCountryByName(name)) ||
    null
  const iso = meta?.code?.toLowerCase()
  const flagClass = iso ? `fi fi-${iso}` : null

  if (!flagClass) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, ...style }}
        aria-hidden
      >
        🌐
      </span>
    )
  }

  // flag-icons sizes via em: width = 1.333em, height = 1em
  const fontSize = Math.round(size / 1.333333)

  return (
    <span
      className={`${flagClass} ${className}`.trim()}
      role="img"
      aria-label={meta.name}
      style={{
        fontSize,
        lineHeight: 1,
        borderRadius: rounded,
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        ...style,
      }}
    />
  )
}
