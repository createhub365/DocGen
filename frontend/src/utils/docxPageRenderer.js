import {
  PANEL_INNER_WIDTH,
  PREVIEW_PAGE_HEIGHT,
} from './previewConstants'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const DEFAULT_RENDER_OPTIONS = {
  className: 'docx-preview',
  inWrapper: true,
  breakPages: true,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  renderHeaders: true,
  renderFooters: true,
}

async function getDocxPreview() {
  const { renderAsync } = await import('docx-preview')
  return renderAsync
}

async function getHtml2Canvas() {
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas
}

async function normalizeDocxInput(input) {
  if (input instanceof ArrayBuffer) return input

  if (input instanceof Blob) {
    if (input.type?.includes('json')) {
      const text = await input.text()
      try {
        const parsed = JSON.parse(text)
        throw new Error(parsed.detail || 'Invalid document response')
      } catch (err) {
        if (err instanceof Error && err.message !== 'Invalid document response') {
          throw err
        }
        throw new Error('Invalid document response')
      }
    }
    return input.arrayBuffer()
  }

  throw new Error('Unsupported document data')
}

async function waitForLayout(root) {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })

  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.onload = resolve
          img.onerror = resolve
        })
    )
  )
}

function findWrapper(root) {
  return (
    root.querySelector('.docx-preview-wrapper')
    || root.querySelector('.docx-wrapper')
    || root.firstElementChild
  )
}

function findSections(wrapper) {
  const sections = Array.from(
    wrapper.querySelectorAll('section.docx-preview, section.docx')
  )
  return sections.length > 0 ? sections : [wrapper]
}

function createCaptureHost(pageWidth) {
  const host = document.createElement('div')
  host.className = 'docx-capture-host'
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'opacity:0.01',
    'pointer-events:none',
    `width:${pageWidth}px`,
    'background:#fff',
    'overflow:visible',
  ].join(';')
  document.body.appendChild(host)
  return host
}

async function captureElementAsPageImage(element, pageWidth, pageHeight) {
  const html2canvas = await getHtml2Canvas()
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 1,
    width: pageWidth,
    useCORS: true,
    logging: false,
    allowTaint: true,
  })

  const out = document.createElement('canvas')
  out.width = pageWidth
  out.height = pageHeight
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, pageWidth, pageHeight)

  const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
  const drawW = canvas.width * scale
  const drawH = canvas.height * scale
  const offsetX = (pageWidth - drawW) / 2
  ctx.drawImage(canvas, offsetX, 0, drawW, drawH)

  return out.toDataURL('image/jpeg', 0.9)
}

async function captureSlicedPages(element, pageWidth, pageHeight) {
  const html2canvas = await getHtml2Canvas()
  const totalH = element.scrollHeight
  const sliceCount = Math.max(1, Math.ceil(totalH / pageHeight))
  const pages = []

  for (let i = 0; i < sliceCount; i += 1) {
    const sliceCanvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 1,
      width: pageWidth,
      height: Math.min(pageHeight, totalH - i * pageHeight),
      y: i * pageHeight,
      scrollY: -i * pageHeight,
      useCORS: true,
      logging: false,
      allowTaint: true,
    })

    const out = document.createElement('canvas')
    out.width = pageWidth
    out.height = pageHeight
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageWidth, pageHeight)
    ctx.drawImage(sliceCanvas, 0, 0, pageWidth, Math.min(pageHeight, sliceCanvas.height))
    pages.push({ page: i + 1, image: out.toDataURL('image/jpeg', 0.9) })
  }

  return pages
}

export async function renderDocxToContainer(container, blob, options = {}) {
  if (!container) return false

  const renderAsync = await getDocxPreview()
  const buffer = await normalizeDocxInput(blob)
  const { pageWidth, ...renderOptions } = options

  container.innerHTML = ''
  if (pageWidth) {
    container.style.width = `${pageWidth}px`
    container.style.maxWidth = '100%'
    container.style.margin = '0 auto'
  }

  await renderAsync(buffer, container, null, {
    ...DEFAULT_RENDER_OPTIONS,
    ...renderOptions,
  })

  await waitForLayout(container)
  return Boolean(findWrapper(container))
}

export async function renderDocxPagesToImages(blob, pageWidth = PANEL_INNER_WIDTH) {
  const renderAsync = await getDocxPreview()
  const buffer = await normalizeDocxInput(blob)
  const host = createCaptureHost(pageWidth)

  try {
    await renderAsync(buffer, host, null, DEFAULT_RENDER_OPTIONS)
    await waitForLayout(host)

    const wrapper = findWrapper(host)
    if (!wrapper) return []

    const sections = findSections(wrapper)
    const pages = []

    if (sections.length > 1) {
      for (const section of sections) {
        const image = await captureElementAsPageImage(section, pageWidth, PREVIEW_PAGE_HEIGHT)
        pages.push({ page: pages.length + 1, image })
      }
      return pages
    }

    const captureRoot = sections[0]
    if (captureRoot.scrollHeight > PREVIEW_PAGE_HEIGHT * 1.25) {
      return captureSlicedPages(captureRoot, pageWidth, PREVIEW_PAGE_HEIGHT)
    }

    const image = await captureElementAsPageImage(captureRoot, pageWidth, PREVIEW_PAGE_HEIGHT)
    return [{ page: 1, image }]
  } finally {
    document.body.removeChild(host)
  }
}

export { DOCX_MIME, normalizeDocxInput }
