import { getDocTypeIcon, DOC_TYPE_ICONS, normalizeDocTypeIcon } from './docTypeIcons'

/** Follows org theme CSS variables (themes.js / :root). */
const BRAND = {
  primary: 'var(--primary)',
  softBg: 'var(--surface-3)',
  border: 'var(--border)',
  selectedBg: 'color-mix(in srgb, var(--primary) 10%, transparent)',
  selectedBorder: 'var(--primary)',
  surface: 'var(--surface)',
}

/**
 * Compact grid of selectable document-type icons.
 */
export default function DocTypeIconPicker({ value, onChange, size = 40 }) {
  const selected = normalizeDocTypeIcon(value)

  return (
    <div
      role="listbox"
      aria-label="Document type icon"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${size + 8}px, ${size + 8}px))`,
        gap: 8,
      }}
    >
      {DOC_TYPE_ICONS.map(({ key, label, Icon }) => {
        const active = key === selected
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={active}
            title={label}
            onClick={() => onChange?.(key)}
            style={{
              width: size + 8,
              height: size + 8,
              margin: 0,
              padding: 0,
              borderRadius: 10,
              border: `1.5px solid ${active ? BRAND.selectedBorder : BRAND.border}`,
              background: active ? BRAND.selectedBg : BRAND.surface,
              color: BRAND.primary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon style={{ fontSize: Math.round(size * 0.45) }} />
          </button>
        )
      })}
    </div>
  )
}

export function DocTypeIconGlyph({
  iconKey,
  size = 48,
  iconSize,
  style,
}) {
  const { Icon } = getDocTypeIcon(iconKey)
  const glyph = iconSize ?? Math.round(size * 0.45)
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: BRAND.softBg,
        color: BRAND.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon style={{ fontSize: glyph }} />
    </div>
  )
}
