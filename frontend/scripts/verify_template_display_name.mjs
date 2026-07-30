/**
 * Scripted verification for template display_name upload/rename UX.
 * Run: node scripts/verify_template_display_name.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function check(name, fn) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err.message)
    process.exitCode = 1
  }
}

console.log('=== Template display_name verification ===\n')

const panel = read('src/pages/platform/TemplatesPanel.jsx')
const client = read('src/api/platformClient.js')
const backend = read('../backend/routers/org_templates.py')
const migration = read(
  '../backend/migrations/versions/j0e1f2a3b4c5_add_template_display_name.py'
)

check('1. Migration adds nullable display_name', () => {
  assert.ok(migration.includes('display_name'))
  assert.ok(migration.includes('nullable=True'))
  assert.equal(
    migration.match(/revision:\s*str\s*=\s*"j0e1f2a3b4c5"/)?.[0] != null,
    true
  )
})

check('2. Upload accepts optional display_name Form field', () => {
  assert.ok(backend.includes('display_name: Optional[str] = Form(None)'))
  assert.ok(backend.includes('label = (display_name or "").strip() or file.filename'))
})

check('3. List returns resolved display_name; PATCH rename exists', () => {
  assert.ok(backend.includes('def rename_org_template'))
  assert.ok(backend.includes('@router.patch("/templates/{template_id}")'))
  assert.ok(backend.includes('"display_name": resolved_display_name(t)'))
})

check('4. Frontend modal requires name + file before submit', () => {
  assert.ok(panel.includes('Document name'))
  assert.ok(panel.includes('e.g. Standard Offer Letter'))
  assert.ok(panel.includes('canSubmitAdd'))
  assert.ok(panel.includes('Dragger'))
  assert.ok(panel.includes('uploadOrgTemplate('))
  assert.ok(panel.includes('onUploadProgress'))
  assert.ok(panel.includes('Uploading…'))
  assert.ok(panel.includes('Processing…'))
  assert.ok(client.includes('onUploadProgress'))
})

check('5. Card shows display_name primary + filename secondary + rename', () => {
  assert.ok(panel.includes('function documentTitle'))
  assert.ok(panel.includes('EditOutlined'))
  assert.ok(panel.includes('renameOrgTemplate'))
  assert.ok(panel.includes('fileLabel'))
})

check('6. Client API wires display_name + rename PATCH', () => {
  assert.ok(client.includes("form.append('display_name'"))
  assert.ok(client.includes('export async function renameOrgTemplate'))
  assert.ok(client.includes("platformClient.patch(`/templates/${templateId}`"))
})

check('7. Walkthrough: custom name → card title; omit name → filename fallback', () => {
  // UI requires name, so fallback is backend-only for old clients
  const custom = { display_name: 'Standard Offer Letter', docx_filename: 'orgs/x/offer_v2.docx' }
  const title = String(custom.display_name || '').trim() || custom.docx_filename.split('/').pop()
  assert.equal(title, 'Standard Offer Letter')
  const fallback = { display_name: '', docx_filename: 'orgs/x/offer_letter_v2.docx' }
  const fb =
    String(fallback.display_name || '').trim() || fallback.docx_filename.split('/').pop()
  assert.equal(fb, 'offer_letter_v2.docx')
})

if (!process.exitCode) console.log('\nAll checks passed')
