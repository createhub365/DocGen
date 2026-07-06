import {
  PANEL_INNER_WIDTH,
  PREVIEW_PAGE_WIDTH,
  PREVIEW_PAGE_HEIGHT,
  PLACEHOLDER_PAGE_COUNT,
} from './previewConstants'

export {
  PANEL_INNER_WIDTH,
  PREVIEW_PAGE_WIDTH,
  PREVIEW_PAGE_HEIGHT,
  PLACEHOLDER_PAGE_COUNT,
}

async function getPdfjsLib() {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
  return pdfjsLib
}

export async function renderPdfPagesToImages(blob, pageWidth = PREVIEW_PAGE_WIDTH) {
  const pdfjsLib = await getPdfjsLib()
  const arrayBuffer = await blob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    verbosity: pdfjsLib.VerbosityLevel?.ERRORS ?? 0,
  }).promise
  const pages = []

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = pageWidth / baseViewport.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    pages.push({
      page: i,
      image: canvas.toDataURL('image/jpeg', 0.88),
    })
  }

  return pages
}

export function buildPlaceholderPages(count = PLACEHOLDER_PAGE_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    page: i + 1,
    image: null,
    placeholder: true,
  }))
}
