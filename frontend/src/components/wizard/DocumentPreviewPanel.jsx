import { useCallback, useEffect, useRef, useState } from 'react'
import { Spin } from 'antd'
import { FullscreenOutlined } from '@ant-design/icons'
import { smartPreviewPdf, smartPreviewDocx } from '../../api/client'
import DocumentFullPreviewModal from './DocumentFullPreviewModal'
import {
  PANEL_INNER_WIDTH,
  PREVIEW_PAGE_WIDTH,
  PREVIEW_PAGE_HEIGHT,
  PLACEHOLDER_PAGE_COUNT,
  renderPdfPagesToImages,
  buildPlaceholderPages,
} from '../../utils/pdfPageRenderer'
import { renderDocxPagesToImages } from '../../utils/docxPageRenderer'

const DEBOUNCE_MS = 900
const PANEL_WIDTH = 340
const PAGE_GAP = 16

function PreviewPage({ page, image, pageRef, index }) {
  return (
    <div
      ref={pageRef}
      data-page={page}
      className="animate-scale-in"
      style={{
        marginBottom: PAGE_GAP,
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div className="preview-page-frame">
        {image ? (
          <img
            src={image}
            alt={`Page ${page}`}
            style={{
              width: PREVIEW_PAGE_WIDTH,
              height: PREVIEW_PAGE_HEIGHT,
              objectFit: 'contain',
              objectPosition: 'top center',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#bfbfbf', fontSize: 13 }}>Page {page}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DocumentPreviewPanel({
  buildPayload,
  refreshKey,
  companyName = '',
  trade = '',
  showPanel = true,
  externalModalOpen = false,
  onExternalModalClose,
}) {
  const [pages, setPages] = useState(() => buildPlaceholderPages())
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const scrollRef = useRef(null)
  const pageRefs = useRef([])
  const timerRef = useRef(null)
  const requestIdRef = useRef(0)
  const buildPayloadRef = useRef(buildPayload)

  buildPayloadRef.current = buildPayload

  const totalPages = pages.length
  const modalTitle = `Document Preview — ${companyName || 'Company'} | ${trade || 'Trade'}`
  const isModalOpen = modalOpen || externalModalOpen

  const closeModal = () => {
    setModalOpen(false)
    onExternalModalClose?.()
  }

  const openModal = () => setModalOpen(true)

  useEffect(() => {
    if (!showPanel) return undefined

    setLoading(true)

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current

      const applyPages = (rendered) => {
        if (reqId !== requestIdRef.current) return
        setPages(rendered.length > 0 ? rendered : buildPlaceholderPages(1))
        setCurrentPage(1)
      }

      try {
        try {
          const pdfBlob = await smartPreviewPdf(buildPayloadRef.current())
          if (reqId !== requestIdRef.current) return
          const rendered = await renderPdfPagesToImages(pdfBlob, PANEL_INNER_WIDTH)
          applyPages(rendered)
          return
        } catch {
          const docxBlob = await smartPreviewDocx(buildPayloadRef.current())
          if (reqId !== requestIdRef.current) return
          const rendered = await renderDocxPagesToImages(docxBlob, PANEL_INNER_WIDTH)
          applyPages(rendered)
        }
      } catch {
        if (reqId !== requestIdRef.current) return
        setPages(buildPlaceholderPages(PLACEHOLDER_PAGE_COUNT))
      } finally {
        if (reqId === requestIdRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [refreshKey, showPanel])

  useEffect(() => {
    const root = scrollRef.current
    if (!root || pages.length === 0) return undefined

    const ratios = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          ratios.set(Number(entry.target.dataset.page), entry.intersectionRatio)
        })
        let bestPage = 1
        let bestRatio = 0
        ratios.forEach((ratio, page) => {
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestPage = page
          }
        })
        if (bestRatio > 0) setCurrentPage(bestPage)
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] }
    )

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [pages])

  const setPageRef = useCallback((index, el) => {
    pageRefs.current[index] = el
  }, [])

  if (!showPanel) {
    return (
      <DocumentFullPreviewModal
        open={isModalOpen}
        onClose={closeModal}
        buildPayload={buildPayload}
        title={modalTitle}
      />
    )
  }

  return (
    <>
      <div
        className="preview-panel"
        style={{
          width: PANEL_WIDTH,
          minWidth: PANEL_WIDTH,
          maxWidth: PANEL_WIDTH,
          flexShrink: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>
            Preview
          </span>
          <span
            style={{
              flex: 1,
              textAlign: 'center',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              transition: 'opacity 200ms',
            }}
          >
            Page {currentPage} / {totalPages}
          </span>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              aria-label="Full Preview"
              className="preview-fullscreen-btn"
              onClick={openModal}
              style={{ padding: '6px 8px', lineHeight: 1 }}
            >
              <FullscreenOutlined style={{ fontSize: 14 }} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 16,
            position: 'relative',
          }}
        >
          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(30,42,58,0.8)',
                zIndex: 2,
              }}
            >
              <Spin />
            </div>
          )}

          {pages.map((p, index) => (
            <PreviewPage
              key={`page-${p.page}-${p.image ? 'img' : 'ph'}`}
              page={p.page}
              image={p.image}
              pageRef={(el) => setPageRef(index, el)}
              index={index}
            />
          ))}
        </div>
      </div>

      <DocumentFullPreviewModal
        open={isModalOpen}
        onClose={closeModal}
        buildPayload={buildPayload}
        title={modalTitle}
      />
    </>
  )
}
