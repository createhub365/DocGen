import nzFormat1 from '../../config/NZ_Format1_Variable_Reference.json'

export const DISPLAY_DATE_FORMAT = 'DD/MM/YYYY'
export const STORE_DATE_FORMAT = 'DD MMMM YYYY'
export const DOB_STORE_DATE_FORMAT = 'DD/MM/YYYY'

const DATE_FIELD_IDS = new Set([
  'issue_date',
  'commencement_date',
  'validity_expiry_date',
  'passport_issue_date',
  'passport_expiry_date',
  'sign_date',
  'candidate_sign_date',
  'candidate_date_of_birth',
])

const DOB_FIELD_IDS = new Set(['candidate_date_of_birth'])

function variableToId(variable) {
  return variable.replace(/^\{\{|\}\}$/g, '')
}

const FIELD_REF = {}
const SECTION_ORDER = []
const SECTION_FIELD_IDS = {}

for (const entry of nzFormat1.variables) {
  const id = variableToId(entry.variable)
  FIELD_REF[id] = {
    label: entry.field_label,
    section: entry.section,
    example: entry.example,
    required: entry.required === 'Yes',
    notes: entry.notes,
  }
  if (!SECTION_FIELD_IDS[entry.section]) {
    SECTION_FIELD_IDS[entry.section] = []
    SECTION_ORDER.push(entry.section)
  }
  SECTION_FIELD_IDS[entry.section].push(id)
}

export const DATE_FIELD_LABELS = Object.fromEntries(
  [...DATE_FIELD_IDS]
    .filter((id) => FIELD_REF[id])
    .map((id) => [id, FIELD_REF[id].label])
)

export const SPECIAL_FIELD_IDS = new Set([
  'company_logo',
  'ref_number',
  'ref_number_barcode',
  ...DATE_FIELD_IDS,
])

export function getFieldMeta(ph) {
  return FIELD_REF[ph.id] || null
}

export function getFieldLabel(ph) {
  return FIELD_REF[ph.id]?.label ?? ph.label
}

export function isFieldRequired(ph) {
  if (FIELD_REF[ph.id]) return FIELD_REF[ph.id].required
  return ph.required
}

export function getFieldPlaceholder(ph) {
  const example = FIELD_REF[ph.id]?.example
  if (example) return `e.g. ${example}`
  return `Enter ${getFieldLabel(ph)}`
}

export function getFieldExtra(ph) {
  if (ph.id === 'company_logo') {
    return 'Upload company logo — PNG or JPG, max 2MB'
  }
  return FIELD_REF[ph.id]?.notes
}

export function getDateStoreFormat(fieldId) {
  return DOB_FIELD_IDS.has(fieldId) ? DOB_STORE_DATE_FORMAT : STORE_DATE_FORMAT
}

export function groupPlaceholdersBySection(placeholders) {
  const byId = Object.fromEntries(placeholders.map((p) => [p.id, p]))
  const grouped = []
  const used = new Set()

  for (const section of SECTION_ORDER) {
    const sectionPlaceholders = (SECTION_FIELD_IDS[section] || [])
      .map((id) => byId[id])
      .filter(Boolean)

    if (sectionPlaceholders.length) {
      grouped.push({ section, placeholders: sectionPlaceholders })
      sectionPlaceholders.forEach((p) => used.add(p.id))
    }
  }

  const remaining = placeholders.filter((p) => !used.has(p.id))
  if (remaining.length) {
    grouped.push({ section: 'Other', placeholders: remaining })
  }

  return grouped
}

export { nzFormat1 }
