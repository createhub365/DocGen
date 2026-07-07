import { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileTextOutlined,
  BankOutlined,
  ToolOutlined,
  LayoutOutlined,
  FileAddOutlined,
  ArrowRightOutlined,
  DownloadOutlined,
  FileWordOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import StatCard from '../components/ui/StatCard'
import { StatCardSkeleton, TableRowSkeleton } from '../components/ui/Skeleton'
import MobileDocumentCard from '../components/ui/MobileDocumentCard'
import useBreakpoint from '../hooks/useBreakpoint'
import { getDocuments, downloadDoc, getEmployers, getDashboardSummary } from '../api/client'
import { useAppMessage } from '../hooks/useAppMessage'

function EmptyDocumentsIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden>
      <rect x="20" y="30" width="50" height="60" rx="4" fill="#F5EDED" stroke="#E8D8D8" strokeWidth="2" />
      <rect x="30" y="20" width="50" height="60" rx="4" fill="white" stroke="#8B1A1A" strokeWidth="1.5" />
      <rect x="40" y="10" width="50" height="60" rx="4" fill="#FDF7F7" stroke="#D4A017" strokeWidth="1.5" />
      <circle cx="90" cy="15" r="4" fill="#D4A017" opacity="0.8" />
      <circle cx="100" cy="25" r="3" fill="#D4A017" opacity="0.5" />
      <circle cx="95" cy="35" r="2" fill="#8B1A1A" opacity="0.4" />
    </svg>
  )
}

const TradePill = memo(function TradePill({ label, count }) {
  return (
    <span className="trade-pill">
      {label}{count > 0 ? ` (${count})` : ''}
    </span>
  )
})

export default function DashboardPage() {
  const navigate = useNavigate()
  const message = useAppMessage()
  const { isMobile } = useBreakpoint()
  const [documents, setDocuments] = useState([])
  const [summary, setSummary] = useState(null)
  const [employerCount, setEmployerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [docsResult, employers, dashboardSummary] = await Promise.all([
        getDocuments({ page: 1, limit: 100 }),
        getEmployers(),
        getDashboardSummary(),
      ])
      setDocuments(docsResult.items || [])
      setEmployerCount(employers.length)
      setSummary(dashboardSummary)
    } catch {
      message.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (docId, type) => {
    try {
      await downloadDoc(docId, type)
    } catch {
      message.error(`Failed to download ${type.toUpperCase()}`)
    }
  }

  const totalDocs = summary?.total_documents_generated ?? documents.length
  const thisMonthDocs = summary?.documents_this_month ?? documents.filter((d) =>
    dayjs(d.created_at).isAfter(dayjs().startOf('month'))
  ).length
  const monthTrend =
    totalDocs > 0 && thisMonthDocs > 0
      ? `+${Math.round((thisMonthDocs / totalDocs) * 100)}%`
      : null

  const templateCount = summary?.active_templates ?? 0
  const countryCount = summary?.countries_with_templates ?? 0
  const tradeCount = summary?.total_trades ?? 0
  const tradeCategories = summary?.trade_categories ?? []

  const templateSubtitle =
    countryCount > 0
      ? `Active templates · ${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`
      : 'Active templates'

  return (
    <div className="max-w-7xl mx-auto">

      {/* ── Page header ──────────────────────────── */}
      {!isMobile && (
        <div className="page-header animate-fade-in-down">
          <div className="page-header-accent" />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              Dashboard
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Welcome back — document automation overview
            </p>
          </div>
        </div>
      )}

      {/* ── Stat cards ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8 stagger-children">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={<FileTextOutlined />}
              color="maroon"
              value={totalDocs}
              subtitle="Documents generated"
              trend={monthTrend}
              delay={0}
            />
            <StatCard
              icon={<BankOutlined />}
              color="gold"
              value={employerCount}
              subtitle="Employers in database"
              delay={60}
            />
            <StatCard
              icon={<ToolOutlined />}
              color="purple"
              value={tradeCount}
              subtitle="Trades in bank"
              delay={120}
            />
            <StatCard
              icon={<LayoutOutlined />}
              color="green"
              value={templateCount}
              subtitle={templateSubtitle}
              delay={180}
            />
          </>
        )}
      </div>

      {/* ── Quick Actions ─────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Quick Actions
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button
          type="button"
          className="action-card-maroon animate-fade-in-up"
          onClick={() => navigate('/create')}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <FileAddOutlined style={{ fontSize: 22, color: 'white' }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                Generate Documents
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                {countryCount > 0
                  ? `${countryCount} countries · ${templateCount} templates`
                  : `${templateCount} templates available`}
              </div>
            </div>
            <ArrowRightOutlined style={{ fontSize: 20, color: 'rgba(255,255,255,0.50)' }} />
          </div>
        </button>

        <button
          type="button"
          className="action-card-gold animate-fade-in-up"
          style={{ animationDelay: '60ms' }}
          onClick={() => navigate('/employers')}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(139,26,26,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <BankOutlined style={{ fontSize: 22, color: 'var(--primary)' }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>
                Employer Master
              </div>
              <div style={{ fontSize: 13, color: 'rgba(139,26,26,0.60)' }}>
                Add · Edit · Manage companies
              </div>
            </div>
            <ArrowRightOutlined style={{ fontSize: 20, color: 'rgba(139,26,26,0.35)' }} />
          </div>
        </button>
      </div>

      {/* ── Recent Documents ──────────────────────── */}
      <div
        className="animate-fade-in-up"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
          animationDelay: '120ms',
        }}
      >
        {/* table header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 18, background: 'var(--primary)', borderRadius: 2 }} />
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Recent Documents
            </h2>
          </div>
          {documents.length > 5 && (
            <button
              type="button"
              onClick={() => navigate('/documents')}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 12px',
              }}
            >
              View All
            </button>
          )}
        </div>

        {loading ? (
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {[1, 2, 3].map((i) => <TableRowSkeleton key={i} />)}
            </tbody>
          </table>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center py-12 px-6">
            <EmptyDocumentsIllustration />
            <p style={{ marginTop: 16, marginBottom: 8, fontWeight: 600, color: 'var(--text-secondary)', fontSize: 14 }}>
              No documents yet
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
              Generate your first document to get started
            </p>
            <button
              type="button"
              onClick={() => navigate('/create')}
              style={{
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '10px 22px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Generate document →
            </button>
          </div>
        ) : (
          <>
            <div className="desktop-only-table" style={{ overflowX: 'auto' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Ref', 'Type', 'Company', 'Trade', 'Country', 'Date', 'Download'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.slice(0, 10).map((doc, idx) => (
                  <tr
                    key={doc.id}
                    className="docflow-table-row"
                    style={{ borderBottom: idx < documents.slice(0, 10).length - 1 ? '1px solid var(--border-light)' : 'none' }}
                  >
                    <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontWeight: 600 }}>
                      #{String(doc.id).padStart(4, '0')}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{doc.doc_type_name}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{doc.company_name}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{doc.trade_name}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{doc.country_name}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {dayjs(doc.created_at).format('MMM D, YYYY')}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <div className="flex gap-1">
                        {doc.pdf_url && (
                          <button
                            type="button"
                            title="Download PDF"
                            onClick={() => handleDownload(doc.id, 'pdf')}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '5px 8px',
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                              fontSize: 13,
                              transition: 'all 150ms',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--primary)'
                              e.currentTarget.style.color = 'white'
                              e.currentTarget.style.borderColor = 'var(--primary)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--text-secondary)'
                              e.currentTarget.style.borderColor = 'var(--border)'
                            }}
                          >
                            <DownloadOutlined />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Download DOCX"
                          onClick={() => handleDownload(doc.id, 'docx')}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '5px 8px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            fontSize: 13,
                            transition: 'all 150ms',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--primary)'
                            e.currentTarget.style.color = 'white'
                            e.currentTarget.style.borderColor = 'var(--primary)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--text-secondary)'
                            e.currentTarget.style.borderColor = 'var(--border)'
                          }}
                        >
                          <FileWordOutlined />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="mobile-only-list">
              {documents.slice(0, 10).map((doc) => (
                <MobileDocumentCard
                  key={doc.id}
                  doc={doc}
                  onDownloadPdf={(id) => handleDownload(id, 'pdf')}
                  onDownloadDocx={(id) => handleDownload(id, 'docx')}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Trade Bank ────────────────────────────── */}
      {tradeCategories.length > 0 && (
        <div
          className="animate-fade-in-up"
          style={{
            marginTop: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            animationDelay: '180ms',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 3, height: 16, background: 'var(--accent)', borderRadius: 2 }} />
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Trade Bank — All Industries
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {tradeCategories.map((cat) => (
              <TradePill key={cat.label} label={cat.label} count={cat.count} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
