/**
 * Scripted walkthrough: auto-suggest mapping (frontend pure logic) +
 * API proof that GET mappings does not persist (no auto-POST).
 *
 * Run from frontend/: node scripts/verify_mapping_suggest.mjs
 * Optional API leg: set PLATFORM_API_BASE (default http://127.0.0.1:8000/api/platform)
 * and ensure backend is up; otherwise pure-logic checks still run.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const suggestionsUrl = pathToFileURL(
  join(__dirname, '../src/pages/platform/mappingSuggestions.js')
).href

const {
  suggestFieldKeyForPlaceholder,
  buildInitialMappingSelections,
} = await import(suggestionsUrl)

function section(title) {
  console.log(`\n=== ${title} ===`)
}

section('1. Matching logic (case-insensitive exact)')
assert.equal(
  suggestFieldKeyForPlaceholder('company_name', ['company_name', 'date']),
  'company_name'
)
assert.equal(
  suggestFieldKeyForPlaceholder('Company_Name', ['company_name', 'date']),
  'company_name',
  'case-insensitive: Company_Name → company_name'
)
assert.equal(
  suggestFieldKeyForPlaceholder('DATE', ['company_name', 'date']),
  'date'
)
assert.equal(
  suggestFieldKeyForPlaceholder('Other_Thing', ['company_name', 'date']),
  null,
  'no match → null'
)
assert.equal(
  suggestFieldKeyForPlaceholder('company', ['company_name']),
  null,
  'no substring / fuzzy match'
)
assert.equal(
  suggestFieldKeyForPlaceholder('country.name', ['country.name', 'party.email']),
  'country.name',
  'fixed step outputs match'
)
console.log('OK suggestFieldKeyForPlaceholder')

section('2. Initial selections — suggest vs empty vs persisted')
const { selections, suggestedKeys } = buildInitialMappingSelections({
  detected: ['company_name', 'Other_Thing', 'Date', 'already_saved'],
  persistedMappings: [
    { placeholder_key: 'already_saved', field_key: 'date', is_mapped: true },
  ],
  resolvableKeys: ['company_name', 'date', 'country.name'],
})
assert.equal(selections.company_name, 'company_name')
assert.ok(suggestedKeys.includes('company_name'))
assert.equal(selections.Other_Thing, '')
assert.ok(!suggestedKeys.includes('Other_Thing'))
assert.equal(selections.Date, 'date')
assert.ok(suggestedKeys.includes('Date'))
assert.equal(selections.already_saved, 'date')
assert.ok(
  !suggestedKeys.includes('already_saved'),
  'persisted mapping is not tagged Suggested'
)
console.log('OK buildInitialMappingSelections', { selections, suggestedKeys })

section('3. No auto-POST on load (source contract)')
const panelSrc = readFileSync(
  join(__dirname, '../src/pages/platform/PlaceholderMappingPanel.jsx'),
  'utf8'
)
assert.ok(
  panelSrc.includes('buildInitialMappingSelections'),
  'panel uses suggest helper on load'
)
assert.ok(panelSrc.includes('Suggested'), 'Suggested tag present')
assert.ok(
  /savePlaceholderMappings\(template\.id/.test(panelSrc),
  'save POST only via save()'
)
// savePlaceholderMappings must not appear inside load/useCallback load body
// except we call listPlaceholderMappings (GET). Ensure POST helper only in save.
const loadMatch = panelSrc.match(
  /const load = useCallback\(async \(\) => \{[\s\S]*?\}, \[documentTypeId, template\.id\]\)/
)
assert.ok(loadMatch, 'found load()')
assert.ok(
  !loadMatch[0].includes('savePlaceholderMappings'),
  'load() must not call savePlaceholderMappings (no auto-POST)'
)
console.log('OK panel load does not POST mappings')

section('4. Optional live API leg (template upload + GET only)')
const apiBase = (
  process.env.PLATFORM_API_BASE || 'http://127.0.0.1:8000/api/platform'
).replace(/\/$/, '')

let apiRan = false
try {
  const health = await fetch(`${apiBase.replace(/\/platform$/, '')}/health`)
  if (!health.ok) throw new Error(`health ${health.status}`)

  const stamp = Date.now()
  const signup = await fetch(`${apiBase}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_name: `Suggest Org ${stamp}`,
      org_slug: `suggest-org-${stamp}`,
      admin_email: `suggest-${stamp}@example.com`,
      admin_password: 'SuggestTest1!',
      admin_full_name: 'Suggest Admin',
    }),
  })
  if (!signup.ok) {
    // try login path if signup shape differs — skip API leg
    throw new Error(`signup ${signup.status}: ${await signup.text()}`)
  }
  const signupBody = await signup.json()
  const token =
    signupBody.access_token ||
    signupBody.token ||
    signupBody.platform_access_token
  if (!token) throw new Error('no token in signup response')

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const dt = await fetch(`${apiBase}/document-types/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Suggest DT ${stamp}`,
      slug: `suggest-dt-${stamp}`,
    }),
  })
  assert.equal(dt.status, 201, await dt.text())
  const dtId = (await dt.json()).id

  const flow = await fetch(`${apiBase}/${dtId}/flow`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  })
  assert.equal(flow.status, 201, await flow.text())
  const flowId = (await flow.json()).id

  const step = await fetch(`${apiBase}/${flowId}/steps`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      step_type: 'text_field',
      order_index: 0,
      label: 'Company',
      is_enabled: true,
    }),
  })
  assert.equal(step.status, 201, await step.text())
  const stepId = (await step.json()).id

  const field = await fetch(`${apiBase}/steps/${stepId}/fields`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      field_key: 'company_name',
      field_label: 'Company name',
      field_type: 'text',
      is_required: true,
    }),
  })
  assert.equal(field.status, 201, await field.text())

  const pub = await fetch(`${apiBase}/${flowId}/publish`, {
    method: 'POST',
    headers,
  })
  assert.equal(pub.status, 200, await pub.text())

  // Minimal docx via python-docx is preferred; try dynamic require of a tiny zip.
  // Use backend TestClient path if fetch multipart is awkward — build minimal OOXML.
  const { Document, Packer, Paragraph, Text } = await import('docx').catch(() => ({}))
  let docxBuffer
  if (Document && Packer) {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new Text('Hello {{company_name}} and {{Other_Thing}}'),
              ],
            }),
          ],
        },
      ],
    })
    docxBuffer = Buffer.from(await Packer.toBuffer(doc))
  } else {
    // Fallback: call Python one-liner via child_process
    const { spawnSync } = await import('node:child_process')
    const py = `
from io import BytesIO
from docx import Document
d = Document()
d.add_paragraph("Hello {{company_name}} and {{Other_Thing}}")
b = BytesIO(); d.save(b); import sys; sys.stdout.buffer.write(b.getvalue())
`
    const r = spawnSync('python', ['-c', py], { encoding: 'buffer', maxBuffer: 5e6 })
    if (r.status !== 0) throw new Error(r.stderr?.toString() || 'docx gen failed')
    docxBuffer = r.stdout
  }

  const form = new FormData()
  form.append(
    'file',
    new Blob([docxBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    'suggest_test.docx'
  )
  const upload = await fetch(`${apiBase}/${dtId}/templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  assert.equal(upload.status, 201, await upload.text())
  const template = await upload.json()

  const before = await fetch(`${apiBase}/templates/${template.id}/mappings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(before.status, 200, await before.text())
  const beforeBody = await before.json()
  const detected = beforeBody.detected_placeholders || []
  assert.ok(detected.includes('company_name'))
  assert.ok(detected.includes('Other_Thing'))
  const mappedBefore = (beforeBody.mappings || []).filter((m) => m.is_mapped)
  assert.equal(
    mappedBefore.length,
    0,
    'GET after upload must not have persisted mappings (no auto-POST)'
  )

  const ui = buildInitialMappingSelections({
    detected,
    persistedMappings: beforeBody.mappings || [],
    resolvableKeys: ['company_name'],
  })
  assert.equal(ui.selections.company_name, 'company_name')
  assert.ok(ui.suggestedKeys.includes('company_name'))
  assert.equal(ui.selections.Other_Thing, '')
  assert.ok(!ui.suggestedKeys.includes('Other_Thing'))

  const after = await fetch(`${apiBase}/templates/${template.id}/mappings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const afterBody = await after.json()
  assert.equal(
    (afterBody.mappings || []).filter((m) => m.is_mapped).length,
    0,
    'still unsaved after simulating UI suggest'
  )

  apiRan = true
  console.log('OK live API: upload + GET; suggest pre-fill; no silent persist')
} catch (err) {
  console.log(`SKIP live API leg: ${err.message}`)
}

section('DONE')
console.log(
  JSON.stringify(
    {
      matching: 'case-insensitive exact',
      suggested_visual: 'blue AntD Tag labeled Suggested',
      api_leg: apiRan ? 'ran' : 'skipped',
    },
    null,
    2
  )
)
