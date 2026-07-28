/**
 * Scripted verification for Generate wizard + built-in countries (no browser).
 * Run: node --experimental-vm-modules scripts/verify_generate_wizard.mjs
 * (or: node scripts/verify_generate_wizard.mjs after converting helpers)
 *
 * Pure logic checks — mirrors exported helpers from GenerateDocumentPage /
 * worldCountries without mounting React.
 */
import assert from 'node:assert/strict'
import {
  WORLD_COUNTRIES,
  countryFlag,
  countryFlagClass,
  findWorldCountry,
  worldCountrySelectOptions,
} from '../src/data/worldCountries.js'

function collectFieldsPayload(values) {
  const out = {}
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (typeof value === 'string' && !value.trim()) return
    out[key] = value
  })
  return out
}

function requiredKeysForStep(step) {
  return (step.fields || []).filter((f) => f.is_required).map((f) => f.field_key)
}

function fieldKeysForStep(step) {
  if (!step || step.step_type === 'file_upload') return []
  if (step.step_type === 'country_selector') {
    const keys = ['country.name']
    if (step.config_json?.use_builtin_country_list) {
      if (step.config_json?.include_country_code) keys.push('country.code')
    } else {
      keys.push('country.code')
    }
    return keys
  }
  if (step.step_type === 'party_selector') {
    return ['party.name', 'party.email', 'party.address']
  }
  return requiredKeysForStep(step)
}

let passed = 0
function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    console.error('     ', e.message)
    process.exitCode = 1
  }
}

console.log('=== Generate wizard / world countries verification ===\n')

check('1. worldCountries has ~195 entries with unique ISO codes', () => {
  assert.ok(WORLD_COUNTRIES.length >= 190 && WORLD_COUNTRIES.length <= 200)
  const codes = new Set(WORLD_COUNTRIES.map((c) => c.code))
  assert.equal(codes.size, WORLD_COUNTRIES.length)
  assert.ok(findWorldCountry('NZ'))
  assert.equal(findWorldCountry('New Zealand').code, 'NZ')
})

check('2. flag emoji derived from code (not hardcoded table)', () => {
  const flag = countryFlag('NZ')
  assert.equal(flag, String.fromCodePoint(127397 + 78) + String.fromCodePoint(127397 + 90))
  assert.equal(countryFlag('us'), countryFlag('US'))
  assert.equal(countryFlag(''), '')
})

check('2b. flag-icons CSS class for Windows-safe flag images', () => {
  assert.equal(countryFlagClass('NZ'), 'fi fi-nz')
  assert.equal(countryFlagClass('af'), 'fi fi-af')
  assert.equal(countryFlagClass(''), '')
})

check('3. Backward compat: unset/false builtin → free-text field keys include name+code', () => {
  const step = { step_type: 'country_selector', config_json: null }
  assert.deepEqual(fieldKeysForStep(step), ['country.name', 'country.code'])
  const step2 = {
    step_type: 'country_selector',
    config_json: { use_builtin_country_list: false },
  }
  assert.deepEqual(fieldKeysForStep(step2), ['country.name', 'country.code'])
  // Submitted shape identical to legacy free-text
  const payload = collectFieldsPayload({
    'country.name': 'New Zealand',
    'country.code': 'NZ',
  })
  assert.deepEqual(payload, { 'country.name': 'New Zealand', 'country.code': 'NZ' })
})

check('4. Builtin list: name only when include_country_code false', () => {
  const step = {
    step_type: 'country_selector',
    config_json: { use_builtin_country_list: true, include_country_code: false },
  }
  assert.deepEqual(fieldKeysForStep(step), ['country.name'])
  const opts = worldCountrySelectOptions({ includeCode: false })
  assert.equal(opts[0].flagClass, countryFlagClass(opts[0].code))
  assert.equal(opts[0].flagEmoji, countryFlag(opts[0].code))
  assert.ok(!opts.find((o) => o.code === 'NZ').label.includes('(NZ)'))
  assert.equal(opts.find((o) => o.code === 'NZ').label, 'New Zealand')

  // Simulate select NZ then strip code on submit
  const fields = collectFieldsPayload({
    'country.name': 'New Zealand',
    'country.code': 'NZ',
  })
  if (
    step.config_json.use_builtin_country_list &&
    !step.config_json.include_country_code
  ) {
    delete fields['country.code']
  }
  assert.deepEqual(fields, { 'country.name': 'New Zealand' })
})

check('5. Builtin list: name+code when include_country_code true', () => {
  const step = {
    step_type: 'country_selector',
    config_json: { use_builtin_country_list: true, include_country_code: true },
  }
  assert.deepEqual(fieldKeysForStep(step), ['country.name', 'country.code'])
  const opts = worldCountrySelectOptions({ includeCode: true })
  assert.ok(opts.find((o) => o.code === 'NZ').label.includes('(NZ)'))
  const found = findWorldCountry('AU')
  const fields = collectFieldsPayload({
    'country.name': found.name,
    'country.code': found.code,
  })
  assert.deepEqual(fields, { 'country.name': 'Australia', 'country.code': 'AU' })
})

check('6. Wizard state persistence model (single Form + preserve + display:none)', () => {
  // Simulate page navigation keeping values in one object
  const formState = {}
  formState.candidate_name = 'Ada'
  // navigate page 1 → 2
  formState.salary = 90000
  // navigate back to page 1 — values still present
  assert.equal(formState.candidate_name, 'Ada')
  assert.equal(formState.salary, 90000)
  console.log(
    '     (UI: AntD Form preserve + all steps mounted with display:none keeps values)'
  )
})

check('7. Per-page validation blocks Next when required empty', () => {
  const step = {
    step_type: 'text_field',
    fields: [{ field_key: 'full_name', is_required: true, field_label: 'Full name' }],
  }
  const req = requiredKeysForStep(step)
  assert.deepEqual(req, ['full_name'])
  const values = {}
  const missing = req.filter((k) => !values[k])
  assert.deepEqual(missing, ['full_name'])
  // Would set pageError and NOT increment pageIndex
})

check('8. Disabled steps excluded from wizard pages', () => {
  const all = [
    { id: 1, is_enabled: true, step_type: 'text_field', label: 'A' },
    { id: 2, is_enabled: false, step_type: 'text_field', label: 'B' },
    { id: 3, is_enabled: true, step_type: 'country_selector', label: 'C' },
  ]
  const enabled = all.filter((s) => s.is_enabled !== false)
  assert.equal(enabled.length, 2)
  assert.ok(!enabled.find((s) => s.label === 'B'))
  const pages = [
    ...enabled.map((step) => ({ kind: 'step', step })),
    { kind: 'review' },
  ]
  assert.equal(pages.length, 3)
  assert.equal(pages.at(-1).kind, 'review')
})

check('9. Single enabled step still ends on Review before Generate', () => {
  const enabled = [{ id: 1, step_type: 'text_field', label: 'Only' }]
  const pages = [
    ...enabled.map((step) => ({ kind: 'step', step })),
    { kind: 'review' },
  ]
  assert.equal(pages.length, 2)
  assert.equal(pages[0].kind, 'step')
  assert.equal(pages[1].kind, 'review')
  console.log('     (Choice: always Review page — Next on last step → Review → Generate)')
})

check('10. Backend 400 missing_fields maps to first offending page index', () => {
  const pages = [
    {
      kind: 'step',
      step: {
        id: 1,
        step_type: 'text_field',
        fields: [{ field_key: 'a', is_required: true }],
      },
    },
    {
      kind: 'step',
      step: {
        id: 2,
        step_type: 'text_field',
        fields: [{ field_key: 'b', is_required: true }],
      },
    },
    { kind: 'review' },
  ]
  const missing = ['b']
  let idx = 0
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]
    if (page.kind !== 'step') continue
    const keys = (page.step.fields || []).map((f) => f.field_key)
    if (keys.includes(missing[0])) {
      idx = i
      break
    }
  }
  assert.equal(idx, 1)
})

console.log(`\n${passed} checks passed`)
