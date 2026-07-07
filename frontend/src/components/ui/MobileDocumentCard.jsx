import dayjs from 'dayjs'
import { DownloadOutlined, FileWordOutlined } from '@ant-design/icons'

export default function MobileDocumentCard({ doc, onDownloadPdf, onDownloadDocx }) {
  return (
    <article className="mobile-doc-card">
      <div className="mobile-doc-card__head">
        <span className="mobile-doc-card__ref">#{String(doc.id).padStart(4, '0')}</span>
        <span className="mobile-doc-card__date">{dayjs(doc.created_at).format('MMM D, YYYY')}</span>
      </div>
      <h3 className="mobile-doc-card__title">{doc.doc_type_name}</h3>
      <p className="mobile-doc-card__company">{doc.company_name}</p>
      <div className="mobile-doc-card__meta">
        <span>{doc.trade_name}</span>
        <span>{doc.country_name}</span>
      </div>
      <div className="mobile-doc-card__actions">
        {doc.pdf_url && (
          <button type="button" className="mobile-doc-card__btn" onClick={() => onDownloadPdf(doc.id)}>
            <DownloadOutlined />
            PDF
          </button>
        )}
        <button type="button" className="mobile-doc-card__btn" onClick={() => onDownloadDocx(doc.id)}>
          <FileWordOutlined />
          DOCX
        </button>
      </div>
    </article>
  )
}
