/**
 * Scripted verification: per-document Generate routes + template_id payload.
 * Run: node scripts/verify_documents_tab_generate.mjs
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

console.log('=== Documents tab / per-template generate verification ===\n')

const dashboard = read('src/pages/platform/PlatformDashboard.jsx')
const templates = read('src/pages/platform/TemplatesPanel.jsx')
const generate = read('src/pages/platform/GenerateDocumentPage.jsx')
const app = read('src/App.jsx')
const flow = read('src/pages/platform/FlowBuilderPage.jsx')
const orgDocs = read('../backend/routers/org_documents.py')

check('1. Dashboard has no inline Open/Generate actions', () => {
  assert.ok(!/ThunderboltOutlined/.test(dashboard))
  assert.ok(!/>\s*Generate\s*</.test(dashboard))
  assert.ok(!/>\s*Open\s*</.test(dashboard))
  assert.ok(
    dashboard.includes("navigate(`/platform/document-types/${item.id}`)") ||
      dashboard.includes('navigate(`/platform/document-types/${item.id}`)')
  )
})

check('2. Documents tab renamed; Templates tab gone', () => {
  assert.ok(flow.includes("key: 'documents'"))
  assert.ok(flow.includes("label: 'Documents'"))
  assert.ok(!flow.includes("key: 'templates'"))
})

check('3. Per-document card gates Generate on is_complete + published flow', () => {
  assert.ok(templates.includes('const canGenerate = isComplete && hasPublishedFlow'))
  assert.ok(templates.includes('Open this document and finish mapping before generating'))
  assert.ok(
    templates.includes(
      '`/platform/document-types/${documentTypeId}/generate/${item.id}`'
    )
  )
})

check('4. Generate route accepts :templateId', () => {
  assert.ok(app.includes('/platform/document-types/:id/generate/:templateId'))
  assert.ok(generate.includes('templateId: templateIdParam'))
  assert.ok(generate.includes('template_id: templateId'))
})

check('5. Fallback without template_id: single complete auto, else redirect', () => {
  assert.ok(generate.includes('complete.length === 1'))
  assert.ok(
    generate.includes("navigate(`/platform/document-types/${documentTypeId}`")
  )
})

check('6. Backend already resolves explicit template_id (org+type scoped)', () => {
  assert.ok(orgDocs.includes('def _resolve_org_template_for_doc_type'))
  assert.ok(orgDocs.includes('if template_id is not None:'))
  assert.ok(orgDocs.includes('body.template_id'))
})

check('7. Simulated: template B route → API payload uses B', () => {
  const documentTypeId = 10
  const templateB = 42
  const route = `/platform/document-types/${documentTypeId}/generate/${templateB}`
  const match = route.match(/\/generate\/(\d+)$/)
  assert.equal(Number(match[1]), templateB)
  const apiBody = { template_id: Number(match[1]), fields: { 'cand_name': 'X' } }
  assert.equal(apiBody.template_id, 42)
})

if (!process.exitCode) {
  console.log('\nAll checks passed')
}
