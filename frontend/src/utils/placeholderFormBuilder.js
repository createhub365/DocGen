import {
  getFieldLabel,
  getFieldPlaceholder,
  isFieldRequired,
  SPECIAL_FIELD_IDS,
} from '../components/form/formFieldConfig'
import { VISIBLE_FORM_SECTIONS, EMPLOYER_PREFILL_IDS } from '../components/wizard/smartFormConfig'

/** Template placeholder id → canonical wizard field id (mirrors backend docx_xml_fill aliases). */
export const WIZARD_FIELD_ALIASES = {
  candidate_full_name: ['cand_name', 'candidate_name'],
  candidate_salutation: ['salutation'],
  candidate_date_of_birth: ['cand_dob', 'date_of_birth'],
  candidate_passport_number: ['cand_passport', 'passport_number'],
  candidate_nationality: ['cand_nationality', 'nationality'],
  candidate_address: ['country_of_residence'],
  passport_expiry_date: ['passport_expiry'],
  passport_issue_date: ['passport_issue'],
  commencement_date: ['joining_date'],
  position_title: ['position'],
  issue_date: ['offer_date'],
  work_location: ['location'],
  contract_duration: ['duration'],
  probation_period: ['probation'],
  weekly_hours: ['working_hours'],
  annual_salary: ['salary'],
  candidate_sign_date: ['sign_date'],
  pay_frequency: ['payment_frequency'],
  overtime_rate: ['overtime_terms'],
  accommodation_allowance: ['accommodation'],
  travel_allowance: ['transport_allowance'],
  medical_insurance: ['health_insurance'],
  employer_accreditation_no: ['accreditation_number'],
  validity_expiry_date: ['offer_validity'],
  trade_duties: ['duties_block'],
}

const ALIAS_TO_CANONICAL = Object.entries(WIZARD_FIELD_ALIASES).reduce((map, [canonical, aliases]) => {
  aliases.forEach((alias) => {
    map[alias] = canonical
  })
  return map
}, {})

const KNOWN_FIELD_DEFS = VISIBLE_FORM_SECTIONS.reduce((acc, section) => {
  section.fields.forEach((field) => {
    acc[field.id] = field
  })
  return acc
}, {})

/** Image injection only — no text input. */
export const INJECT_ONLY_IDS = new Set(['company_logo', 'ref_number_barcode'])

/** Auto-filled at generation — no user input. */
export const AUTO_FILL_IDS = new Set(['trade_duties', 'duties_block'])

/** Computed from other fields — hidden inputs, not shown as separate form rows. */
export const COMPUTED_IDS = new Set(['candidate_salutation'])

/** Read-only derived dates — shown via dedicated widget, not a plain text input. */
export const DERIVED_READONLY_IDS = new Set(['validity_expiry_date'])

const DATE_FIELD_IDS = new Set([
  'issue_date',
  'commencement_date',
  'validity_expiry_date',
  'passport_issue_date',
  'passport_expiry_date',
  'sign_date',
  'candidate_sign_date',
  'candidate_date_of_birth',
  'cand_dob',
  'date_of_birth',
  'joining_date',
  'offer_date',
])

export function canonicalPlaceholderId(id) {
  return ALIAS_TO_CANONICAL[id] || id
}

function resolveFieldType(id) {
  const known = KNOWN_FIELD_DEFS[id]
  if (known?.type) return known.type
  if (DATE_FIELD_IDS.has(id)) return 'date'
  if (id.includes('email')) return 'email'
  if (id === 'candidate_nationality' || id === 'cand_nationality' || id === 'nationality') {
    return 'country_select'
  }
  if (id.includes('address')) return 'textarea'
  if (id === 'validity_expiry_date' || id === 'offer_validity') return 'readonly_expiry'
  if (id === 'ref_number') return 'readonly'
  return 'text'
}

function buildFieldDef(placeholder) {
  const id = canonicalPlaceholderId(placeholder.id)
  const known = KNOWN_FIELD_DEFS[id] || {}
  const ph = { id, label: placeholder.label || known.label || id }

  return {
    id,
    label: placeholder.label || known.label || getFieldLabel(ph),
    type: resolveFieldType(id),
    required: known.required ?? isFieldRequired(ph),
    placeholder: known.placeholder || getFieldPlaceholder(ph),
    options: known.options,
    default: known.default,
    defaultToday: known.defaultToday,
    note: known.note,
    fromTemplate: true,
  }
}

/**
 * Build ordered form fields from template placeholders (document order).
 * Dedupes aliases, injects helper fields, skips inject-only / auto-fill ids.
 */
export function buildFormFieldsFromPlaceholders(placeholders = []) {
  const seen = new Set()
  const ordered = []

  for (const placeholder of placeholders) {
    const id = canonicalPlaceholderId(placeholder.id)
    if (seen.has(id)) continue
    if (INJECT_ONLY_IDS.has(id) || AUTO_FILL_IDS.has(id) || COMPUTED_IDS.has(id)) continue
    if (EMPLOYER_PREFILL_IDS.has(id)) continue
    seen.add(id)
    ordered.push(buildFieldDef(placeholder))
  }

  const ids = new Set(ordered.map((f) => f.id))
  if (ids.has('validity_expiry_date') && !ids.has('validity_days')) {
    const expiryIdx = ordered.findIndex((f) => f.id === 'validity_expiry_date')
    const helper = KNOWN_FIELD_DEFS.validity_days || {
      id: 'validity_days',
      label: 'Offer Valid For',
      type: 'select',
      options: ['30', '60', '90'],
      required: true,
      default: '60',
    }
    ordered.splice(expiryIdx, 0, { ...helper, helper: true })
    ids.add('validity_days')
  }

  return ordered
}

export function getVisibleFieldIds(formFields) {
  return formFields
    .filter(
      (f) =>
        f.type !== 'readonly_expiry' &&
        f.type !== 'salutation_select' &&
        !COMPUTED_IDS.has(f.id)
    )
    .map((f) => f.id)
}

const SALUTATION_PLACEHOLDER_IDS = new Set(['candidate_salutation', 'salutation'])
const NAME_PLACEHOLDER_CANONICAL = 'candidate_full_name'

export function templateNeedsSalutation(placeholders = []) {
  return placeholders.some((p) => SALUTATION_PLACEHOLDER_IDS.has(canonicalPlaceholderId(p.id)))
}

/** True when template also has a separate candidate name field (avoid "Mr. Name Name"). */
export function templateHasSeparateCandidateName(placeholders = []) {
  return placeholders.some((p) => canonicalPlaceholderId(p.id) === NAME_PLACEHOLDER_CANONICAL)
}

/**
 * Build salutation for document fill.
 * If template has both salutation + name → prefix only ("Mr.").
 * If template has salutation only → "Mr. Full Name".
 */
export function buildSalutationValue(prefix, name, placeholders = []) {
  const title = (prefix || 'Mr.').trim() || 'Mr.'
  const fullName = (name || '').trim()
  if (templateHasSeparateCandidateName(placeholders)) {
    return title
  }
  return fullName ? `${title} ${fullName}`.trim() : title
}

export function getDefaultValues(formFields) {
  const defaults = {}
  formFields.forEach((field) => {
    if (field.defaultToday) {
      defaults[field.id] = undefined
    } else if (field.default !== undefined) {
      defaults[field.id] = field.default
    }
  })
  return defaults
}

export function isSpecialBackgroundField(id) {
  return SPECIAL_FIELD_IDS.has(id) || INJECT_ONLY_IDS.has(id) || AUTO_FILL_IDS.has(id)
}

/** Values applied to the Ant Design form — only keys that have a visible Form.Item. */
export function pickFormValues(values, formFields, extraKeys = []) {
  const allowed = new Set([
    ...formFields.map((f) => f.id),
    'candidate_salutation',
    '_salutation_prefix',
    ...extraKeys,
  ])
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => allowed.has(key))
  )
}
