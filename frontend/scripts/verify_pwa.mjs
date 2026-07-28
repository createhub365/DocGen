/**
 * Programmatic PWA checks against vite preview (no real browser install proof).
 * Usage: node scripts/verify_pwa.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:4173
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const DIST = path.join(root, 'dist')
const BASE = process.argv[2] || 'http://127.0.0.1:4173'

const results = []

function record(id, ok, detail) {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}`)
  console.log(detail)
  console.log('')
}

async function get(urlPath) {
  const url = `${BASE}${urlPath}`
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || ''
  return { url, status: res.status, ct, buf, text: buf.toString('utf8') }
}

function pngMagicOk(buf) {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
}

const manifestRes = await get('/manifest.webmanifest')
let manifest = null
try {
  manifest = JSON.parse(manifestRes.text)
} catch {
  manifest = null
}
const icons = Array.isArray(manifest?.icons) ? manifest.icons : []
const has192 = icons.some((i) => String(i.sizes).includes('192x192') && i.src)
const has512 = icons.some((i) => String(i.sizes).includes('512x512') && i.src)
record(
  '1. Manifest valid JSON + required fields',
  Boolean(
    manifestRes.status === 200 &&
      manifest &&
      manifest.name &&
      manifest.short_name &&
      manifest.start_url &&
      manifest.display === 'standalone' &&
      manifest.theme_color &&
      manifest.background_color &&
      has192 &&
      has512
  ),
  [
    `GET ${manifestRes.url}`,
    `status=${manifestRes.status}`,
    `content-type=${manifestRes.ct}`,
    `name=${JSON.stringify(manifest?.name)}`,
    `short_name=${JSON.stringify(manifest?.short_name)}`,
    `start_url=${JSON.stringify(manifest?.start_url)}`,
    `display=${JSON.stringify(manifest?.display)}`,
    `theme_color=${JSON.stringify(manifest?.theme_color)}`,
    `background_color=${JSON.stringify(manifest?.background_color)}`,
    `icons=${JSON.stringify(icons.map((i) => ({ src: i.src, sizes: i.sizes, purpose: i.purpose })))}`,
    `body_snippet=${manifestRes.text.slice(0, 280).replace(/\s+/g, ' ')}`,
  ].join('\n')
)

{
  const lines = []
  let allOk = icons.length > 0
  for (const icon of icons) {
    const r = await get(icon.src)
    const imgOk = r.status === 200 && /image\//i.test(r.ct) && pngMagicOk(r.buf)
    allOk = allOk && imgOk
    lines.push(
      `GET ${r.url} status=${r.status} ct=${r.ct} bytes=${r.buf.length} png_sig=${pngMagicOk(r.buf)} sizes=${icon.sizes}`
    )
  }
  const apple = await get('/icons/apple-touch-icon.png')
  const appleOk =
    apple.status === 200 && /image\//i.test(apple.ct) && pngMagicOk(apple.buf)
  allOk = allOk && appleOk
  lines.push(
    `GET ${apple.url} status=${apple.status} ct=${apple.ct} bytes=${apple.buf.length} png_sig=${pngMagicOk(apple.buf)} (apple-touch)`
  )
  record('2. All icon URLs return 200 image/*', allOk, lines.join('\n'))
}

{
  const r = await get('/sw.js')
  const hasFetch = /addEventListener\(\s*['"]fetch['"]/.test(r.text)
  const skipsApi = /if \(url\.pathname\.startsWith\(['"]\/api['"]\)\) return/.test(
    r.text
  )
  const apiSnippet =
    (r.text.match(/\/\/[^\n]*API[^\n]*\n\s*if \(url\.pathname\.startsWith\(['"]\/api['"]\)\) return/) ||
      r.text.match(/if \(url\.pathname\.startsWith\(['"]\/api['"]\)\) return/))?.[0] ||
    '(not found)'
  const fetchSnippet =
    (r.text.match(/self\.addEventListener\(['"]fetch['"][\s\S]{0,140}/) || [])[0] ||
    '(not found)'
  const ok =
    r.status === 200 &&
    /javascript|ecmascript/i.test(r.ct) &&
    hasFetch &&
    skipsApi
  record(
    '3. Service worker 200 + fetch listener + /api passthrough',
    ok,
    [
      `GET ${r.url}`,
      `status=${r.status}`,
      `content-type=${r.ct}`,
      `has_fetch_listener=${hasFetch}`,
      `skips_/api_early_return=${skipsApi}`,
      `api_guard_snippet=${JSON.stringify(apiSnippet)}`,
      `fetch_listener_snippet=${JSON.stringify(fetchSnippet)}`,
    ].join('\n')
  )
}

{
  const r = await get('/')
  const hasManifest = /rel=["']manifest["']/i.test(r.text)
  const manifestHref =
    (r.text.match(/rel=["']manifest["'][^>]*href=["']([^"']+)["']/i) ||
      r.text.match(/href=["']([^"']+)["'][^>]*rel=["']manifest["']/i) ||
      [])[1]
  const hasApple = /rel=["']apple-touch-icon["']/i.test(r.text)
  const appleHref =
    (r.text.match(/rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i) ||
      r.text.match(/href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i) ||
      [])[1]
  const themeMatch =
    r.text.match(/name=["']theme-color["'][^>]*content=["']([^"']+)["']/i) ||
    r.text.match(/content=["']([^"']+)["'][^>]*name=["']theme-color["']/i)
  record(
    '4. index.html has manifest + apple-touch-icon + theme-color',
    Boolean(r.status === 200 && hasManifest && hasApple && themeMatch),
    [
      `GET ${r.url}`,
      `status=${r.status}`,
      `manifest_link=${hasManifest} href=${JSON.stringify(manifestHref)}`,
      `apple_touch_icon=${hasApple} href=${JSON.stringify(appleHref)}`,
      `theme_color_tag=${JSON.stringify(themeMatch ? themeMatch[0].slice(0, 140) : null)}`,
      `theme_color_value=${JSON.stringify(themeMatch?.[1])}`,
    ].join('\n')
  )
}

{
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  const diskManifest = JSON.parse(
    fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8')
  )
  const refs = new Set(['/manifest.webmanifest', '/sw.js'])
  for (const icon of diskManifest.icons || []) refs.add(icon.src)
  const appleHref =
    (html.match(/rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i) ||
      [])[1]
  if (appleHref) refs.add(appleHref.startsWith('/') ? appleHref : `/${appleHref}`)

  const assetsDir = path.join(DIST, 'assets')
  let swRegister = false
  for (const f of fs.readdirSync(assetsDir).filter((x) => x.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(assetsDir, f), 'utf8')
    if (s.includes('serviceWorker') && s.includes('/sw.js')) {
      swRegister = true
      break
    }
  }

  const lines = [`serviceWorker.register(/sw.js) in dist bundle: ${swRegister}`]
  let allOk = swRegister
  for (const ref of [...refs].sort()) {
    const disk = path.join(DIST, ...ref.replace(/^\//, '').split('/'))
    const onDisk = fs.existsSync(disk)
    const served = await get(ref)
    const ok = onDisk && served.status === 200
    allOk = allOk && ok
    lines.push(
      `ref=${ref} dist_exists=${onDisk} GET_status=${served.status}${
        onDisk ? ` dist_bytes=${fs.statSync(disk).size}` : ''
      }`
    )
  }
  record(
    '5. HTML/JS/manifest refs match dist/ and serve 200 (no 404)',
    allOk,
    lines.join('\n')
  )
}

const failed = results.filter((r) => !r.ok).length
console.log('==== SUMMARY ====')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}`)
console.log(
  failed === 0
    ? '\nAll 5 programmatic checks PASSED'
    : `\n${failed} check(s) FAILED`
)
console.log(
  '\nNOTE: These checks confirm the PWA is well-formed and served correctly.'
)
console.log(
  'They do NOT prove the install prompt will appear — that requires a real Chrome/Safari browser.'
)
process.exitCode = failed ? 1 : 0
