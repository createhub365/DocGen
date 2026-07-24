/**
 * Auto-suggest placeholder → field_key matches for the mapping panel.
 * Matching: case-insensitive exact string equality against resolvable keys
 * (FieldDefinition.field_key or fixed step outputs). No fuzzy / substring.
 * Never persists — caller only pre-fills UI until the admin hits Save.
 */

/**
 * @param {string} placeholderKey
 * @param {string[]} resolvableKeys canonical field keys from the published flow
 * @returns {string|null} the canonical resolvable key, or null
 */
export function suggestFieldKeyForPlaceholder(placeholderKey, resolvableKeys) {
  const needle = String(placeholderKey ?? '').toLowerCase()
  if (!needle) return null
  for (const key of resolvableKeys || []) {
    if (String(key).toLowerCase() === needle) return key
  }
  return null
}

/**
 * Build initial Select values + which placeholders were auto-suggested
 * (unsaved) vs already persisted.
 *
 * @param {{
 *   detected: string[],
 *   persistedMappings: Array<{ placeholder_key: string, field_key?: string, is_mapped?: boolean }>,
 *   resolvableKeys: string[],
 * }} args
 * @returns {{ selections: Record<string, string>, suggestedKeys: string[] }}
 */
export function buildInitialMappingSelections({
  detected,
  persistedMappings,
  resolvableKeys,
}) {
  const saved = {}
  for (const row of persistedMappings || []) {
    if (row?.is_mapped && row.placeholder_key && row.field_key) {
      saved[row.placeholder_key] = row.field_key
    }
  }

  const selections = {}
  const suggestedKeys = []

  for (const key of detected || []) {
    if (saved[key]) {
      selections[key] = saved[key]
      continue
    }
    const match = suggestFieldKeyForPlaceholder(key, resolvableKeys)
    if (match) {
      selections[key] = match
      suggestedKeys.push(key)
    } else {
      selections[key] = ''
    }
  }

  return { selections, suggestedKeys }
}
