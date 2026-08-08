/**
 * Trade-linked position helpers (Generate wizard + Flow Builder).
 * Pairing: one trade selection fills position (name) + duties companion.
 */

export const DUTIES_BLOCK_KEY = 'duties_block'
export const TRADE_LINKED_POSITION_KIND = 'trade_linked_position'
/** @deprecated legacy auto_config kind — still rendered in Generate */
export const TRADE_LINKED_DUTIES_KIND = 'trade_linked_duties'

export function tradeLinkedKind(field) {
  const kind = field?.auto_config_json?.kind
  return typeof kind === 'string' ? kind : null
}

export function isTradeLinkedPositionField(field) {
  const kind = tradeLinkedKind(field)
  return kind === TRADE_LINKED_POSITION_KIND || kind === TRADE_LINKED_DUTIES_KIND
}

/** Legacy: duties field itself was trade-linked (pre position-pairing). */
export function isLegacyTradeLinkedDutiesField(field) {
  return tradeLinkedKind(field) === TRADE_LINKED_DUTIES_KIND
}

export function dutiesFieldKeyForPosition(field) {
  const raw = field?.auto_config_json?.duties_field_key
  const key = String(raw || DUTIES_BLOCK_KEY).trim()
  return key || DUTIES_BLOCK_KEY
}

/** Build Ant Select options: flat (avoids OptGroup filter hiding children). */
export function tradeSelectOptions(trades) {
  return (trades || [])
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map((t) => {
      const synonyms = Array.isArray(t.synonyms) ? t.synonyms : []
      const searchText = [t.name, ...synonyms].filter(Boolean).join(' ')
      const industry = (t.industry_name || '').trim()
      return {
        value: t.id,
        label: industry ? `${t.name} (${industry})` : t.name,
        searchText,
        tradeName: t.name,
      }
    })
}

/** Client filter: name and synonyms are equals (substring, case-insensitive). */
export function tradeOptionFilter(input, option) {
  const q = String(input || '')
    .trim()
    .toLowerCase()
  if (!q) return true
  // Nested group nodes (if any) — match when a child matches
  if (Array.isArray(option?.options)) {
    return option.options.some((child) => tradeOptionFilter(q, child))
  }
  const hay = String(option?.searchText || option?.label || '').toLowerCase()
  return hay.includes(q)
}

/**
 * Duties companion keys hidden from standalone wizard rendering when a
 * Trade-linked position field owns them.
 */
export function hiddenDutiesCompanionKeys(fields) {
  const keys = new Set()
  for (const f of fields || []) {
    if (tradeLinkedKind(f) === TRADE_LINKED_POSITION_KIND) {
      keys.add(dutiesFieldKeyForPosition(f).toLowerCase())
    }
  }
  return keys
}
