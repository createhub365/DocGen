import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function AppDrawer({
  open,
  onClose,
  title,
  children,
  onSave,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  footer,
}) {
  useEffect(() => {
    if (!open) return undefined

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const defaultFooter = (
    <div
      className="docflow-drawer-footer flex gap-3 justify-end flex-shrink-0 px-6 py-4"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <button type="button" className="docflow-drawer-btn docflow-drawer-btn--ghost" onClick={onClose}>
        {cancelLabel}
      </button>
      <button type="button" className="docflow-drawer-btn docflow-drawer-btn--primary" onClick={onSave}>
        {saveLabel}
      </button>
    </div>
  )

  return createPortal(
    <>
      <div className="docflow-drawer-overlay" onClick={onClose} role="presentation" />
      <div className="docflow-drawer-panel" role="dialog" aria-modal="true">
        <div
          className="docflow-drawer-header flex items-center justify-between flex-shrink-0 px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {typeof title === 'string' ? (
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {title}
            </h2>
          ) : (
            title
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div className="docflow-drawer-body flex-1 overflow-y-auto px-6 py-4 docflow-input">
          {children}
        </div>

        {footer !== undefined ? footer : defaultFooter}
      </div>
    </>,
    document.body,
  )
}
