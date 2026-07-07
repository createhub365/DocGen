import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Button,
  Upload,
  Select,
  Input,
  Form,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Switch,
  Space,
  Typography,
  message,
  Spin,
  Modal,
  Drawer,
  Popconfirm,
  Tooltip,
  Alert,
} from 'antd'
import {
  FileTextOutlined,
  ArrowLeftOutlined,
  UploadOutlined,
  PlusOutlined,
  EditOutlined,
  FileWordOutlined,
  DeleteOutlined,
  SettingOutlined,
  EyeOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  TeamOutlined,
  BarChartOutlined,
  LeftOutlined,
  RightOutlined,
  DownOutlined,
  DownloadOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  BankOutlined,
  LockOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { layout } from '../design/tokens'
import useBreakpoint from '../hooks/useBreakpoint'
import { useAuth } from '../context/AuthContext'
import COUNTRIES, { PRIORITY_COUNTRIES, getCountryByCode, getCountryByName } from '../data/countries'
import {
  getAdminTemplates,
  updateTemplate,
  editTemplate,
  deleteTemplate,
  previewPlaceholders,
  uploadTemplate,
  uploadTemplateVersion,
  downloadTemplateDocx,
  regenerateThumbnails,
  getAdminStats,
  getAdminUsers,
  getAdminTradeBank,
  createUser,
  updateAdminUser,
  resetAdminUserPassword,
  deleteAdminUser,
  getCountries,
  getTrades,
  getCompanies,
  getCompaniesForIndustry,
  getDocumentTypes,
  importEmployersCsv,
  addCountry,
} from '../api/client'
import TradeBankTab from './admin/TradeBankTab'
import TemplateCardThumb from './admin/TemplateCardThumb'
import CountryFlag from './ui/CountryFlag'
import CountrySelect from './ui/CountrySelect'
import TemplatePreviewModal from './ui/TemplatePreviewModal'

const { Title, Text } = Typography
const { Dragger } = Upload

const ADMIN_NAV = [
  { key: 'templates', icon: FileTextOutlined, label: 'Templates' },
  { key: 'employers', icon: BankOutlined, label: 'Employers' },
  { key: 'users', icon: TeamOutlined, label: 'Users' },
  { key: 'trade-bank', emoji: '🔨', label: 'Trade Bank', badge: true },
  { key: 'stats', icon: BarChartOutlined, label: 'Stats' },
]

function AdminSidebar({ collapsed, activeTab, onTabChange, tradeBank, onBack, onToggle }) {
  return (
    <>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 18px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            background: 'rgba(212,160,23,0.18)',
            border: '1px solid rgba(212,160,23,0.30)',
            borderRadius: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <SettingOutlined style={{ fontSize: 17, color: '#D4A017' }} />
        </div>
        {!collapsed && (
          <div className="animate-slide-in-right min-w-0">
            <div style={{ fontSize: 17, fontWeight: 800, color: 'white', letterSpacing: '-0.3px', lineHeight: 1 }}>
              Admin Panel
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(212,160,23,0.70)',
                marginTop: 3,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              DocFlow
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div style={{ padding: '16px 18px 6px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.28)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
            }}
          >
            Management
          </span>
        </div>
      )}

      <nav
        style={{
          flex: 1,
          padding: collapsed ? '12px 8px' : '4px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {ADMIN_NAV.map(({ key, icon: Icon, emoji, label, badge }) => (
          <button
            key={key}
            type="button"
            className={`docflow-nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => onTabChange(key)}
            title={collapsed ? label : undefined}
            style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            {emoji ? (
              <span className="nav-icon" style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
            ) : (
              <Icon className="nav-icon" />
            )}
            {!collapsed && (
              <>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{label}</span>
                {badge && (
                  <span
                    style={{
                      background: '#1A3C5E',
                      color: 'white',
                      borderRadius: 10,
                      padding: '0 7px',
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: '18px',
                      flexShrink: 0,
                    }}
                  >
                    {tradeBank?.meta?.total_trades ?? '…'}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      <div
        style={{
          padding: collapsed ? '8px 8px 12px' : '8px 10px 12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          className="docflow-nav-item"
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <RightOutlined className="nav-icon" />
          ) : (
            <>
              <LeftOutlined className="nav-icon" />
              <span style={{ fontSize: 13 }}>Collapse</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="docflow-nav-item"
          onClick={onBack}
          title={collapsed ? 'Back to Dashboard' : undefined}
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <ArrowLeftOutlined className="nav-icon" />
          {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>Back to Dashboard</span>}
        </button>
      </div>
    </>
  )
}

function renderAdminPanel(activeTab, props) {
  switch (activeTab) {
    case 'templates':
      return <TemplatesTab {...props.templates} />
    case 'employers':
      return <EmployersImportTab />
    case 'users':
      return <UsersTab />
    case 'trade-bank':
      return <TradeBankTab tradeBank={props.tradeBank} onRefresh={props.loadTradeBank} />
    case 'stats':
      return <StatsTab />
    default:
      return null
  }
}

export default function AdminPanel() {
  const navigate = useNavigate()
  const { isMobile, isTablet } = useBreakpoint()
  const [activeTab, setActiveTab] = useState('templates')
  const [tradeBank, setTradeBank] = useState(null)
  const [templateFilter, setTemplateFilter] = useState('')
  const [templateUploadOpen, setTemplateUploadOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const loadTradeBank = useCallback(() => {
    return getAdminTradeBank()
      .then(setTradeBank)
      .catch((err) => console.error('Trade bank load failed:', err))
  }, [])

  useEffect(() => {
    loadTradeBank()
  }, [loadTradeBank])

  const activeSection = ADMIN_NAV.find((item) => item.key === activeTab)
  const ActiveIcon = activeSection?.icon
  const sidebarWidth = sidebarCollapsed ? layout.sidebarCollapsed : layout.sidebarExpanded
  const showSidebar = !isMobile && !isTablet

  return (
    <div className="flex min-h-0 flex-1" style={{ background: 'var(--surface-2)' }}>
      {showSidebar && (
      <aside
        className="docflow-sidebar admin-desktop-sidebar flex flex-col flex-shrink-0 sticky top-0 h-full z-[100]"
        style={{ width: sidebarWidth }}
      >
        <AdminSidebar
          collapsed={sidebarCollapsed}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tradeBank={tradeBank}
          onBack={() => navigate('/dashboard')}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />
      </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header
          className="admin-panel-header"
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            height: 80,
            flexShrink: 0,
            borderBottom: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {activeSection?.emoji && (
              <span style={{ fontSize: 22, lineHeight: 1 }}>{activeSection.emoji}</span>
            )}
            {ActiveIcon && !activeSection?.emoji && (
              <ActiveIcon style={{ fontSize: 22, color: 'var(--primary)' }} />
            )}
            <Title level={4} style={{ margin: 0 }}>
              {activeSection?.label ?? 'Admin'}
            </Title>
          </div>
          {activeTab === 'templates' && !isMobile && (
            <Space size={12} style={{ flexShrink: 0 }}>
              <Input
                placeholder="Search by country, trade, type…"
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                allowClear
                style={{ width: 240, borderRadius: 8 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setTemplateUploadOpen(true)}
                style={{
                  background: 'linear-gradient(135deg,#8B1A1A,#A52A2A)',
                  border: 'none',
                  fontWeight: 700,
                  height: 38,
                }}
              >
                Upload Template
              </Button>
            </Space>
          )}
        </header>

        <main
          className="flex-1 page-enter admin-panel-main"
          style={{
            padding: 24,
            overflow: 'auto',
            maxWidth: activeTab === 'trade-bank' ? 1400 : 1200,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {(isMobile || isTablet) && (
            <div className="admin-mobile-tabs">
              {ADMIN_NAV.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`admin-mobile-tab ${activeTab === item.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.key)}
                >
                  {item.emoji ? `${item.emoji} ` : ''}{item.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'templates' && isMobile && (
            <div className="admin-mobile-header-tools">
              <Input
                placeholder="Search templates…"
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                allowClear
                style={{ borderRadius: 8 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setTemplateUploadOpen(true)}
                block
                style={{
                  background: 'linear-gradient(135deg,#8B1A1A,#A52A2A)',
                  border: 'none',
                  fontWeight: 700,
                  minHeight: 44,
                }}
              >
                Upload Template
              </Button>
            </div>
          )}

          {renderAdminPanel(activeTab, {
            tradeBank,
            loadTradeBank,
            templates: {
              tradeBank,
              filter: templateFilter,
              onFilterChange: setTemplateFilter,
              uploadOpen: templateUploadOpen,
              onUploadOpenChange: setTemplateUploadOpen,
            },
          })}
        </main>
      </div>
    </div>
  )
}

/* ── Single template card ───────────────────────────────────── */
function TemplateCard({ tpl, onEdit, onDelete, onToggle, tradeToIndustry }) {
  const [hovered, setHovered] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: 12,
          border: `2px solid ${tpl.is_active ? 'var(--border)' : '#f0e0e0'}`,
          background: 'white',
          overflow: 'hidden',
          boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
          transform: hovered ? 'translateY(-5px)' : 'none',
          transition: 'all 200ms cubic-bezier(0.34,1.56,0.64,1)',
          position: 'relative',
          cursor: 'pointer',
          opacity: tpl.is_active ? 1 : 0.7,
        }}
      >
        {/* Thumbnail area */}
        <div
          style={{
            height: 200,
            overflow: 'hidden',
            position: 'relative',
            background: '#f5f5f5',
          }}
        >
          <TemplateCardThumb templateId={tpl.id} />
        </div>

        {/* Hover action overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(20,4,4,0.65)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 7,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 180ms',
          padding: 14,
        }}>
          <button
            type="button"
            style={overlayBtn('rgba(255,255,255,0.92)', '#8B1A1A')}
            onClick={() => setPreviewOpen(true)}
          >
            <EyeOutlined style={{ fontSize: 13 }} /> View Template
          </button>

          <button
            type="button"
            style={overlayBtn('#8B1A1A')}
            onClick={async (e) => {
              e.stopPropagation()
              try {
                await downloadTemplateDocx(tpl.id)
              } catch {
                message.error('Download failed')
              }
            }}
          >
            <DownloadOutlined style={{ fontSize: 13 }} /> Download Template
          </button>
          <button type="button" style={overlayBtn('rgba(255,255,255,0.14)')} onClick={() => onEdit(tpl)}>
            <SettingOutlined style={{ fontSize: 13 }} /> Settings
          </button>
          <button type="button" style={overlayBtn('rgba(255,255,255,0.14)')} onClick={() => onToggle(tpl)}>
            {tpl.is_active
              ? <><CloseCircleFilled style={{ fontSize: 13 }} /> Deactivate</>
              : <><CheckCircleFilled style={{ fontSize: 13 }} /> Activate</>
            }
          </button>
          <Popconfirm title="Delete this template?" onConfirm={() => onDelete(tpl.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <button type="button" style={overlayBtn('rgba(220,50,50,0.75)')} onClick={(e) => e.stopPropagation()}>
              <DeleteOutlined style={{ fontSize: 13 }} /> Delete
            </button>
          </Popconfirm>
        </div>

      {/* Active badge */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        background: tpl.is_active ? '#0D7C4A' : '#999',
        color: 'white', fontSize: 10, fontWeight: 700,
        padding: '2px 8px', borderRadius: 99,
        letterSpacing: '0.04em',
      }}>
        {tpl.is_active ? 'ACTIVE' : 'INACTIVE'}
      </div>

        {/* Label */}
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border)', background: '#fafafa' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
            {tpl.doc_type_name || 'Template'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {tpl.country_name} · {tpl.trade_name}
          </div>
          {(() => {
            const industry = resolveTemplateIndustry(tpl, tradeToIndustry)
            if (!industry) return null
            return (
              <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 3, fontWeight: 600 }}>
                {getIndustryIcon(industry)} {industry}
              </div>
            )
          })()}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{tpl.placeholder_count} fields · v{tpl.version}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPreviewOpen(true) }}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--primary)',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              View →
            </button>
          </div>
        </div>
      </div>

      <TemplatePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        templateId={tpl.id}
        title={`${tpl.doc_type_name || 'Template'} — ${tpl.country_name} · ${tpl.trade_name}`}
      />
    </>
  )
}

const overlayBtn = (bg, color = 'white') => ({
  width: '100%', padding: '8px 14px', borderRadius: 8,
  background: bg, border: 'none', color,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  fontFamily: 'inherit', transition: 'filter 150ms',
})

/* ── Upload Drawer ──────────────────────────────────────────── */
function UploadDrawer({ open, onClose, countries, docTypes, tradeBank, onCountriesRefresh, onSuccess }) {
  const { isMobile } = useBreakpoint()
  const [uploadFile, setUploadFile] = useState(null)
  const [detectedPlaceholders, setDetectedPlaceholders] = useState([])
  const [labelOverrides, setLabelOverrides] = useState({})
  const [selectedCountryCode, setSelectedCountryCode] = useState(null)
  const [selectedCountryId, setSelectedCountryId] = useState(null)
  const [selectedIndustry, setSelectedIndustry] = useState(null)
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [selectedDocType, setSelectedDocType] = useState(null)
  const [trades, setTrades] = useState([])
  const [companies, setCompanies] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [countryResolving, setCountryResolving] = useState(false)

  const tradeToIndustry = useMemo(() => buildTradeToIndustryMap(tradeBank), [tradeBank])
  const industryOptions = useMemo(
    () => buildTradeBankIndustryOptions(tradeBank),
    [tradeBank]
  )

  const handleCountryChange = async (code) => {
    setSelectedCountryCode(code || null)
    setSelectedIndustry(null)
    setSelectedCompany(null)
    if (!code) {
      setSelectedCountryId(null)
      return
    }
    setCountryResolving(true)
    try {
      const id = await resolveCountryDbId(code, countries)
      setSelectedCountryId(id)
      if (id) onCountriesRefresh?.()
    } catch {
      message.error('Could not load country')
      setSelectedCountryId(null)
    } finally {
      setCountryResolving(false)
    }
  }

  useEffect(() => {
    if (selectedCountryId) getTrades(selectedCountryId).then(setTrades).catch(() => {})
    else {
      setTrades([])
      setSelectedIndustry(null)
      setSelectedCompany(null)
    }
  }, [selectedCountryId])

  useEffect(() => {
    if (!selectedCountryId || !selectedIndustry) {
      setCompanies([])
      setSelectedCompany(null)
      return
    }
    fetchCompaniesForIndustry(selectedCountryId, selectedIndustry)
      .then(setCompanies)
      .catch(() => setCompanies([]))
  }, [selectedCountryId, selectedIndustry])

  const handleFileSelect = async (file) => {
    setUploadFile(file)
    setPreviewLoading(true)
    try {
      const data = await previewPlaceholders(file)
      setDetectedPlaceholders(data.placeholders)
      const ov = {}
      data.placeholders.forEach((ph) => { ov[ph.id] = ph.label })
      setLabelOverrides(ov)
    } catch { message.error('Failed to detect placeholders') }
    finally { setPreviewLoading(false) }
    return false
  }

  const handleUpload = async () => {
    if (!uploadFile || !selectedCountryId || !selectedIndustry || !selectedCompany?.trade_id || !selectedDocType) {
      message.error('Complete all fields and select a file')
      return
    }
    const fd = new FormData()
    fd.append('file', uploadFile)
    fd.append('country_id', selectedCountryId)
    fd.append('trade_id', selectedCompany.trade_id)
    fd.append('company_id', selectedCompany.id)
    fd.append('document_type_id', selectedDocType)
    fd.append('industry', selectedIndustry)
    fd.append('label_overrides_json', JSON.stringify(labelOverrides))
    setUploading(true)
    try {
      await uploadTemplate(fd)
      message.success('Template uploaded!')
      onSuccess()
      onClose()
      setUploadFile(null); setDetectedPlaceholders([]); setLabelOverrides({})
      setSelectedCountryCode(null); setSelectedCountryId(null); setSelectedIndustry(null); setSelectedCompany(null); setSelectedDocType(null)
    } catch (err) { message.error(err.response?.data?.detail || 'Upload failed') }
    finally { setUploading(false) }
  }

  return (
    <Drawer title="Upload New Template" open={open} onClose={onClose} width={isMobile ? '100%' : 520} destroyOnHidden>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Step 1 — Select .docx file</Text>
          <Dragger accept=".docx" maxCount={1} beforeUpload={handleFileSelect}
            onRemove={() => { setUploadFile(null); setDetectedPlaceholders([]); setLabelOverrides({}) }}>
            <p className="ant-upload-drag-icon"><UploadOutlined /></p>
            <p className="ant-upload-text">{uploadFile ? uploadFile.name : 'Click or drag .docx here'}</p>
          </Dragger>
          {previewLoading && <Spin style={{ marginTop: 8 }} />}
        </div>

        {detectedPlaceholders.length > 0 && (
          <div>
            <Text strong>Detected placeholders — edit labels</Text>
            {detectedPlaceholders.map((ph) => (
              <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Tag>{`{{${ph.id}}}`}</Tag>
                <Input value={labelOverrides[ph.id] || ph.label}
                  onChange={(e) => setLabelOverrides({ ...labelOverrides, [ph.id]: e.target.value })}
                  style={{ flex: 1 }} placeholder="Label" />
              </div>
            ))}
          </div>
        )}

        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Step 2 — Assign to</Text>
          <Space direction="vertical" style={{ width: '100%' }}>
            <CountrySelect
              placeholder="Country"
              size="middle"
              value={selectedCountryCode}
              onChange={handleCountryChange}
              disabled={countryResolving}
            />
            <Select placeholder="Industry" style={{ width: '100%' }} value={selectedIndustry} disabled={!selectedCountryId || countryResolving}
              onChange={(v) => { setSelectedIndustry(v); setSelectedCompany(null) }}
              options={industryOptions} />
            <Select placeholder="Company" style={{ width: '100%' }} value={selectedCompany?.id ?? null}
              disabled={!selectedIndustry} onChange={(id) => setSelectedCompany(companies.find((c) => c.id === id) || null)}
              options={companies.map((c) => ({ value: c.id, label: c.name }))} />
            <Select placeholder="Document Type" style={{ width: '100%' }} value={selectedDocType}
              onChange={setSelectedDocType}
              options={docTypes.map((d) => ({ value: d.id, label: d.name }))} />
          </Space>
        </div>

        <Button type="primary" icon={<UploadOutlined />} loading={uploading} onClick={handleUpload} block size="large"
          style={{ background: 'linear-gradient(135deg,#8B1A1A,#A52A2A)', border: 'none', height: 46, fontWeight: 700 }}>
          Upload Template
        </Button>
      </Space>
    </Drawer>
  )
}

/* ── Edit Settings Drawer ───────────────────────────────────── */
function EditDrawer({ open, template, countries, docTypes, tradeBank, onCountriesRefresh, onClose, onSaved }) {
  const { isMobile } = useBreakpoint()
  const [editCountryCode, setEditCountryCode] = useState(null)
  const [editCountryId, setEditCountryId] = useState(null)
  const [editIndustry, setEditIndustry] = useState(null)
  const [editCompany, setEditCompany] = useState(null)
  const [editDocType, setEditDocType] = useState(null)
  const [editTrades, setEditTrades] = useState([])
  const [editCompanies, setEditCompanies] = useState([])
  const [editReplaceFile, setEditReplaceFile] = useState(null)
  const [editPlaceholders, setEditPlaceholders] = useState([])
  const [editLabelOverrides, setEditLabelOverrides] = useState({})
  const [editPreviewLoading, setEditPreviewLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [countryResolving, setCountryResolving] = useState(false)

  const tradeToIndustry = useMemo(() => buildTradeToIndustryMap(tradeBank), [tradeBank])
  const editIndustryOptions = useMemo(
    () => buildTradeBankIndustryOptions(tradeBank),
    [tradeBank]
  )

  useEffect(() => {
    if (!template) return
    let ov = {}
    try { ov = JSON.parse(template.label_overrides_json || '{}') } catch { ov = {} }
    const meta = getCountryByName(template.country_name)
    setEditCountryCode(meta?.code || null)
    setEditCountryId(template.country_id)
    setEditCompany({ id: template.company_id, trade_id: template.trade_id })
    setEditDocType(template.document_type_id)
    setEditReplaceFile(null); setEditPlaceholders([])
    setEditLabelOverrides(ov)
  }, [template])

  useEffect(() => {
    if (!template || !tradeBank) return
    const map = buildTradeToIndustryMap(tradeBank)
    const industry = template.trade_name
      ? map.get(template.trade_name.toLowerCase()) || null
      : null
    setEditIndustry(industry)
  }, [template, tradeBank])

  const handleEditCountryChange = async (code) => {
    setEditCountryCode(code || null)
    setEditIndustry(null)
    setEditCompany(null)
    if (!code) {
      setEditCountryId(null)
      return
    }
    setCountryResolving(true)
    try {
      const id = await resolveCountryDbId(code, countries)
      setEditCountryId(id)
      if (id) onCountriesRefresh?.()
    } catch {
      message.error('Could not load country')
      setEditCountryId(null)
    } finally {
      setCountryResolving(false)
    }
  }

  useEffect(() => {
    if (!open || !editCountryId) { setEditTrades([]); return }
    getTrades(editCountryId).then(setEditTrades).catch(() => setEditTrades([]))
  }, [open, editCountryId])

  useEffect(() => {
    if (!open || !editCountryId || !editIndustry) { setEditCompanies([]); return }
    fetchCompaniesForIndustry(editCountryId, editIndustry)
      .then((list) => {
        setEditCompanies(list)
        if (template?.company_id) {
          const match = list.find((c) => c.id === template.company_id)
          if (match) setEditCompany(match)
        }
      })
      .catch(() => setEditCompanies([]))
  }, [open, editCountryId, editIndustry, template?.company_id])

  const handleEditFileSelect = async (file) => {
    setEditReplaceFile(file)
    setEditPreviewLoading(true)
    try {
      const data = await previewPlaceholders(file)
      setEditPlaceholders(data.placeholders)
      const ov = { ...editLabelOverrides }
      data.placeholders.forEach((ph) => { if (!ov[ph.id]) ov[ph.id] = ph.label })
      setEditLabelOverrides(ov)
    } catch {
      message.error('Failed to detect placeholders')
    } finally {
      setEditPreviewLoading(false)
    }
    return false
  }

  const handleQuickVersionUpload = async (file) => {
    try {
      await uploadTemplateVersion(template.id, file)
      message.success('Template updated. Placeholders re-detected from new file.')
      onSaved()
    } catch {
      message.error('Upload failed. Ensure file is a valid .docx')
    }
    return false
  }

  const handleSave = async () => {
    if (!template || !editCountryId || !editIndustry || !editCompany?.trade_id || !editDocType) {
      message.error('Complete all assignment fields'); return
    }
    const fd = new FormData()
    fd.append('country_id', editCountryId); fd.append('trade_id', editCompany.trade_id)
    fd.append('company_id', editCompany.id); fd.append('document_type_id', editDocType)
    fd.append('label_overrides_json', JSON.stringify(editLabelOverrides))
    fd.append('is_active', template.is_active ? 'true' : 'false')
    if (editReplaceFile) fd.append('file', editReplaceFile)
    setEditSaving(true)
    try {
      await editTemplate(template.id, fd)
      message.success(editReplaceFile ? 'Template updated + file replaced' : 'Template updated')
      onSaved(); onClose()
    } catch (err) { message.error(err.response?.data?.detail || 'Failed to save') }
    finally { setEditSaving(false) }
  }

  return (
    <Drawer title={`Edit — ${template?.doc_type_name || 'Template'}`} open={open} onClose={onClose} width={isMobile ? '100%' : 520}
      footer={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" loading={editSaving} onClick={handleSave}
          style={{ background: 'linear-gradient(135deg,#8B1A1A,#A52A2A)', border: 'none' }}>
          Save Changes
        </Button>
      </div>} destroyOnHidden>
      {template && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message="How to edit this template"
            description={
              <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                <li>Click <strong>Download Template</strong> to get the current .docx file</li>
                <li>Edit it in <strong>Microsoft Word</strong> — add or change {'{{placeholders}}'} as needed</li>
                <li>Save the file in Word</li>
                <li>Upload a new version below to replace the template on the server</li>
                <li>The system will auto-detect all placeholders from the new file</li>
              </ol>
            }
          />

          <Button
            icon={<DownloadOutlined />}
            onClick={() => downloadTemplateDocx(template.id).catch(() => message.error('Download failed'))}
            block
          >
            Download Template
          </Button>

          <Text type="secondary">File: <Text code>{template.docx_filename}</Text> (v{template.version})</Text>

          <Upload accept=".docx" showUploadList={false} beforeUpload={handleQuickVersionUpload}>
            <Button icon={<UploadOutlined />} block>
              Upload New Version
            </Button>
          </Upload>

          <div>
            <Dragger accept=".docx" maxCount={1} beforeUpload={handleEditFileSelect}
              onRemove={() => { setEditReplaceFile(null); setEditPlaceholders([]) }}>
              <p className="ant-upload-text" style={{ margin: 0 }}>
                {editReplaceFile ? editReplaceFile.name : 'Click or drag updated .docx here'}
              </p>
            </Dragger>
            {editPreviewLoading && <Spin style={{ marginTop: 8 }} />}
          </div>

          {(editPlaceholders.length > 0 ? editPlaceholders : Object.entries(editLabelOverrides).map(([id, label]) => ({ id, label }))).length > 0 && (
            <div>
              <Text strong>Placeholder labels</Text>
              {(editPlaceholders.length > 0 ? editPlaceholders : Object.entries(editLabelOverrides).map(([id, label]) => ({ id, label }))).map((ph) => (
                <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Tag>{`{{${ph.id}}}`}</Tag>
                  <Input value={editLabelOverrides[ph.id] || ph.label}
                    onChange={(e) => setEditLabelOverrides({ ...editLabelOverrides, [ph.id]: e.target.value })}
                    style={{ flex: 1 }} />
                </div>
              ))}
            </div>
          )}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Assignment</Text>
            <Space direction="vertical" style={{ width: '100%' }}>
              <CountrySelect
                placeholder="Country"
                size="middle"
                value={editCountryCode}
                onChange={handleEditCountryChange}
                disabled={countryResolving}
              />
              <Select placeholder="Industry" style={{ width: '100%' }} value={editIndustry} disabled={!editCountryId || countryResolving}
                onChange={(v) => { setEditIndustry(v); setEditCompany(null) }}
                options={editIndustryOptions} />
              <Select placeholder="Company" style={{ width: '100%' }} value={editCompany?.id ?? null} disabled={!editIndustry}
                onChange={(id) => setEditCompany(editCompanies.find((c) => c.id === id) || null)}
                options={editCompanies.map((c) => ({ value: c.id, label: c.name }))} />
              <Select placeholder="Document Type" style={{ width: '100%' }} value={editDocType}
                onChange={setEditDocType} options={docTypes.map((d) => ({ value: d.id, label: d.name }))} />
            </Space>
          </div>
        </Space>
      )}
    </Drawer>
  )
}

const INDUSTRY_ICONS = {
  'Construction and Infrastructure': '🏗️',
  'Construction & Infrastructure': '🏗️',
  Warehousing: '📦',
  'Hotels & Hospitality': '🏨',
  'Hospitality & Tourism': '🍽️',
  'Healthcare & Medical': '🏥',
  'Logistics & Supply Chain': '🚚',
  'IT & Technology': '💻',
  'Manufacturing & Industrial': '🏭',
  'Security & Safety': '🛡️',
  'Professional & Business Services': '💼',
}

const FALLBACK_TRADE_INDUSTRY = {
  'construction worker': 'Construction & Infrastructure',
  carpenter: 'Construction & Infrastructure',
  welder: 'Construction & Infrastructure',
  electrician: 'Construction & Infrastructure',
  plumber: 'Construction & Infrastructure',
  'truck driver': 'Logistics & Supply Chain',
  driver: 'Logistics & Supply Chain',
  nurse: 'Healthcare & Medical',
  cook: 'Hospitality & Tourism',
  engineer: 'Manufacturing & Industrial',
  'it engineer': 'IT & Technology',
  'security guard': 'Security & Safety',
  cleaner: 'Professional & Business Services',
  accountant: 'Professional & Business Services',
}

function getIndustryIcon(industryName) {
  if (!industryName) return '📂'
  const normalized = normalizeIndustryName(industryName)
  for (const [key, icon] of Object.entries(INDUSTRY_ICONS)) {
    if (normalizeIndustryName(key) === normalized) return icon
  }
  return '📂'
}

function normalizeIndustryName(name) {
  if (!name) return ''
  return name
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeCategory(value) {
  if (!value) return ''
  return value.replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim()
}

function findDbCountry(countryCode, dbCountries) {
  const meta = getCountryByCode(countryCode)
  if (!meta) return null

  const codeLower = meta.code.toLowerCase()
  const byCode = dbCountries.find((c) => c.code?.toLowerCase() === codeLower)
  if (byCode) return byCode

  const aliasCodes = {
    gb: ['uk'],
    ae: ['uae'],
  }
  for (const alt of aliasCodes[codeLower] || []) {
    const match = dbCountries.find((c) => c.code?.toLowerCase() === alt)
    if (match) return match
  }

  const byName = dbCountries.find(
    (c) => c.name?.toLowerCase() === meta.name.toLowerCase()
  )
  if (byName) return byName

  if (codeLower === 'ae') {
    return dbCountries.find(
      (c) =>
        c.name?.toLowerCase().includes('uae')
        || c.name?.toLowerCase().includes('emirates')
    ) || null
  }

  return null
}

async function resolveCountryDbId(countryCode, dbCountries) {
  if (!countryCode) return null

  const existing = findDbCountry(countryCode, dbCountries)
  if (existing) return existing.id

  const meta = getCountryByCode(countryCode)
  if (!meta) return null

  try {
    const created = await addCountry({ name: meta.name, code: meta.code.toLowerCase() })
    return created.id
  } catch (err) {
    if (err.response?.status === 400) {
      const refreshed = await getCountries()
      const match = findDbCountry(countryCode, refreshed)
      return match?.id ?? null
    }
    throw err
  }
}

function buildTradeToIndustryMap(tradeBank) {
  const map = new Map()
  for (const ind of tradeBank?.industries ?? []) {
    for (const cat of ind.categories ?? []) {
      for (const trade of cat.trades ?? []) {
        const tradeName = (trade.trade || trade.trade_name || '').trim()
        if (tradeName) {
          map.set(tradeName.toLowerCase(), ind.industry)
        }
      }
    }
  }
  return map
}

function buildTradeBankIndustryOptions(tradeBank) {
  return (tradeBank?.industries ?? [])
    .map((ind) => ({
      value: ind.industry,
      label: ind.industry,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

async function fetchCompaniesForIndustry(countryId, industryName) {
  if (!countryId || !industryName) return []
  const list = await getCompaniesForIndustry(countryId, industryName)
  return list.map((company) => ({
    ...company,
    trade_id: company.trade_id,
  }))
}

function resolveTemplateIndustry(tpl, tradeToIndustry) {
  if (tpl.category) {
    return normalizeCategory(tpl.category)
  }
  const tradeName = tpl.trade_name?.trim()
  if (!tradeName) return ''

  const key = tradeName.toLowerCase()
  if (tradeToIndustry?.has(key)) {
    return tradeToIndustry.get(key)
  }
  if (FALLBACK_TRADE_INDUSTRY[key]) {
    return FALLBACK_TRADE_INDUSTRY[key]
  }
  if (tradeToIndustry) {
    for (const [tradeKey, industry] of tradeToIndustry.entries()) {
      if (key.includes(tradeKey) || tradeKey.includes(key)) {
        return industry
      }
    }
  }
  return ''
}

function templateMatchesIndustry(tpl, industryName, tradeToIndustry) {
  const resolved = resolveTemplateIndustry(tpl, tradeToIndustry)
  if (!resolved) return false
  return normalizeIndustryName(resolved) === normalizeIndustryName(industryName)
}

function templateMatchesCountry(tpl, countryCode) {
  if (!countryCode) return true
  const meta = getCountryByCode(countryCode)
  if (!meta) return false
  if (!tpl.country_name) return false
  const tplMeta = getCountryByName(tpl.country_name)
  if (tplMeta?.code === countryCode) return true
  return tpl.country_name.toLowerCase() === meta.name.toLowerCase()
}

function FilterSectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

function MultiFilterRow({
  label,
  options,
  value,
  onChange,
  totalCount,
  previewCount = 4,
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const isAll = value == null
  const selectedOpt = options.find((o) => o.key === value)
  const fitOneLine = options.length <= previewCount

  const handleSelect = (key) => {
    onChange(value === key ? null : key)
    setOpen(false)
  }

  const previewOptions = useMemo(() => {
    if (fitOneLine || value != null) return []
    return [...options]
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, previewCount)
  }, [options, value, previewCount, fitOneLine])

  const collapsedOptions = useMemo(() => {
    if (value != null && selectedOpt) return [selectedOpt]
    if (fitOneLine) return options
    return previewOptions
  }, [value, selectedOpt, fitOneLine, options, previewOptions])

  const showPicker = !fitOneLine || value != null

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!dropdownRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const renderPill = (opt) => {
    const active = value === opt.key
    return (
      <button
        key={opt.key}
        type="button"
        className={`filter-pill${active ? ' active' : ''}`}
        onClick={() => handleSelect(opt.key)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
      >
        {opt.flagCode ? (
          <CountryFlag code={opt.flagCode} size={14} />
        ) : opt.icon ? (
          <span>{opt.icon}</span>
        ) : null}
        <span style={{ whiteSpace: 'nowrap' }}>
          {opt.label}
          {opt.count != null ? ` (${opt.count})` : ''}
        </span>
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 20, position: 'relative', zIndex: open ? 30 : 'auto' }}>
      <FilterSectionLabel>{label}</FilterSectionLabel>
      <div className="filter-row-collapsed">
        <button
          type="button"
          className={`filter-pill${isAll ? ' active' : ''}`}
          onClick={() => {
            onChange(null)
            setOpen(false)
          }}
          style={{ flexShrink: 0 }}
        >
          All ({totalCount})
        </button>

        {collapsedOptions.map(renderPill)}

        {showPicker && (
          <div ref={dropdownRef} className="filter-dropdown-wrap">
            <button
              type="button"
              className={`filter-pill filter-more-btn${open ? ' open' : ''}`}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}
            >
              <span>{value != null ? 'Change' : 'More'}</span>
              <DownOutlined
                style={{
                  fontSize: 10,
                  transition: 'transform 200ms',
                  transform: open ? 'rotate(180deg)' : 'none',
                }}
              />
            </button>
            {open && (
              <div className="filter-dropdown-panel" role="listbox">
                {options.map(renderPill)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Templates Tab (Canva-style gallery) ────────────────────── */
function TemplatesTab({
  tradeBank,
  filter: filterProp,
  onFilterChange,
  uploadOpen: uploadOpenProp,
  onUploadOpenChange,
}) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [countries, setCountries] = useState([])
  const [docTypes, setDocTypes] = useState([])
  const [uploadOpenLocal, setUploadOpenLocal] = useState(false)
  const [filterLocal, setFilterLocal] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [industryFilter, setIndustryFilter] = useState(null)
  const [countryFilter, setCountryFilter] = useState(null)
  const [docTypeFilter, setDocTypeFilter] = useState(null)
  const [regenLoading, setRegenLoading] = useState(false)

  const filter = filterProp ?? filterLocal
  const setFilter = onFilterChange ?? setFilterLocal
  const uploadOpen = uploadOpenProp ?? uploadOpenLocal
  const setUploadOpen = onUploadOpenChange ?? setUploadOpenLocal

  const loadTemplates = useCallback(() => {
    setLoading(true)
    getAdminTemplates()
      .then(setTemplates)
      .catch(() => message.error('Failed to load templates'))
      .finally(() => setLoading(false))
  }, [])

  const loadCountries = useCallback(() => {
    getCountries().then(setCountries).catch(() => {})
  }, [])

  useEffect(() => {
    loadTemplates()
    loadCountries()
    getDocumentTypes().then(setDocTypes).catch(() => {})
  }, [loadTemplates, loadCountries])

  const handleToggle = async (tpl) => {
    try {
      await updateTemplate(tpl.id, { is_active: !tpl.is_active })
      message.success('Template updated')
      loadTemplates()
    } catch { message.error('Failed to update') }
  }

  const handleDelete = async (id) => {
    try {
      await deleteTemplate(id)
      message.success('Template deleted')
      loadTemplates()
    } catch { message.error('Delete failed') }
  }

  const handleOpenEdit = (tpl) => {
    setEditingTemplate(tpl)
    setEditOpen(true)
  }

  const handleRegenerateThumbnails = async () => {
    setRegenLoading(true)
    try {
      const res = await regenerateThumbnails()
      message.success(
        `Thumbnails regenerated: ${res.success} success, ${res.failed} failed`
      )
      loadTemplates()
    } catch {
      message.error('Regeneration failed')
    } finally {
      setRegenLoading(false)
    }
  }

  const tradeToIndustry = useMemo(() => buildTradeToIndustryMap(tradeBank), [tradeBank])

  const countryOptions = useMemo(() => {
    const countsByCode = new Map()
    templates.forEach((t) => {
      const meta = getCountryByName(t.country_name)
      if (meta) {
        countsByCode.set(meta.code, (countsByCode.get(meta.code) || 0) + 1)
      }
    })
    const prioritySet = new Set(PRIORITY_COUNTRIES)
    const priority = PRIORITY_COUNTRIES.map((code) => COUNTRIES.find((c) => c.code === code)).filter(Boolean)
    const rest = COUNTRIES.filter((c) => !prioritySet.has(c.code)).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    return [...priority, ...rest].map((c) => ({
      key: c.code,
      label: c.name,
      flagCode: c.code,
      count: countsByCode.get(c.code) || 0,
    }))
  }, [templates])

  const industryOptions = useMemo(() => {
    const industries = tradeBank?.industries ?? []
    return industries.map((ind) => {
      const count = templates.filter((t) =>
        templateMatchesIndustry(t, ind.industry, tradeToIndustry)
      ).length
      return {
        key: ind.industry,
        label: ind.industry,
        count,
        icon: ind.icon || INDUSTRY_ICONS[ind.industry] || '📂',
      }
    })
  }, [tradeBank, templates, tradeToIndustry])

  const docTypeOptions = useMemo(() => {
    const counts = new Map()
    templates.forEach((t) => {
      if (!t.document_type_id) return
      counts.set(t.document_type_id, (counts.get(t.document_type_id) || 0) + 1)
    })
    return docTypes
      .map((dt) => ({
        key: dt.id,
        label: dt.name,
        count: counts.get(dt.id) || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [docTypes, templates])

  const filtered = templates.filter((t) => {
    if (countryFilter != null && !templateMatchesCountry(t, countryFilter)) return false
    if (industryFilter && !templateMatchesIndustry(t, industryFilter, tradeToIndustry)) return false
    if (docTypeFilter != null && t.document_type_id !== docTypeFilter) return false
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      t.country_name?.toLowerCase().includes(q) ||
      t.trade_name?.toLowerCase().includes(q) ||
      t.doc_type_name?.toLowerCase().includes(q) ||
      t.company_name?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.format_label?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 16,
        }}
      >
        <Button
          icon={<ReloadOutlined />}
          loading={regenLoading}
          onClick={handleRegenerateThumbnails}
          size="small"
        >
          Regenerate Thumbnails
        </Button>
      </div>

      {!loading && (countryOptions.length > 0 || industryOptions.length > 0 || docTypeOptions.length > 0) && (
        <div
          className="admin-filter-panel"
          style={{
            marginBottom: 20,
            padding: '14px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'visible',
            position: 'relative',
          }}
        >
          {countryOptions.length > 0 && (
            <MultiFilterRow
              label="Country"
              options={countryOptions}
              value={countryFilter}
              onChange={setCountryFilter}
              totalCount={templates.length}
              previewCount={3}
            />
          )}
          {industryOptions.length > 0 && (
            <MultiFilterRow
              label="Industry"
              options={industryOptions}
              value={industryFilter}
              onChange={setIndustryFilter}
              totalCount={templates.length}
              previewCount={3}
            />
          )}
          {docTypeOptions.length > 0 && (
            <MultiFilterRow
              label="Document Type"
              options={docTypeOptions}
              value={docTypeFilter}
              onChange={setDocTypeFilter}
              totalCount={templates.length}
              previewCount={6}
            />
          )}
        </div>
      )}

      {/* Gallery grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20 }} className="admin-template-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '2px solid var(--border)' }}>
              <div className="animate-shimmer" style={{ aspectRatio: '210/290', animationDelay: `${i * 60}ms` }} />
              <div style={{ padding: 12 }}>
                <div className="animate-shimmer" style={{ height: 14, borderRadius: 4, marginBottom: 6 }} />
                <div className="animate-shimmer" style={{ height: 11, borderRadius: 4, width: '70%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 }}>
          <FileTextOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
          {filter || countryFilter != null || industryFilter || docTypeFilter != null
            ? 'No templates match the current filters'
            : 'No templates yet — upload your first one'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20 }} className="admin-template-grid">
          {filtered.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              tradeToIndustry={tradeToIndustry}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      <UploadDrawer
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        countries={countries}
        docTypes={docTypes}
        tradeBank={tradeBank}
        onCountriesRefresh={loadCountries}
        onSuccess={loadTemplates}
      />
      <EditDrawer
        open={editOpen}
        template={editingTemplate}
        countries={countries}
        docTypes={docTypes}
        tradeBank={tradeBank}
        onCountriesRefresh={loadCountries}
        onClose={() => { setEditOpen(false); setEditingTemplate(null) }}
        onSaved={loadTemplates}
      />
    </div>
  )
}

function EmployersImportTab() {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [dryRun, setDryRun] = useState(true)

  const downloadTemplate = () => {
    const csv = [
      'company_name,trading_name,country,city,address,state,postcode,email,website,hr_contact_name,hr_contact_title,hr_email,signatory_name,signatory_designation,accreditation_no,reg_number_label,reg_number_value',
      'Example Company Ltd,Example Co,New Zealand,Auckland,123 Example St,,1010,info@example.com,example.com,HR Manager,Human Resources,hr@example.com,Chief Executive,CEO,ACC-00000,NZBN,0000000000',
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'employers_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCsvUpload = async (file) => {
    setImporting(true)
    setImportResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('dry_run', dryRun)
    formData.append('update_existing', updateExisting)

    try {
      const data = await importEmployersCsv(formData)
      setImportResult(data)
      if (!dryRun) {
        message.success(
          `Import complete: ${data.summary.added} added, ${data.summary.updated} updated`
        )
      }
    } catch (err) {
      message.error(err.response?.data?.detail || 'Import failed')
    } finally {
      setImporting(false)
    }
    return false
  }

  return (
    <Card title="Bulk Import Employers from CSV">
      <Alert
        type="info"
        showIcon
        message="CSV Import Instructions"
        description={
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>Download the CSV template below</li>
            <li>Fill in employer data in Excel or Google Sheets</li>
            <li>Save as CSV (UTF-8)</li>
            <li>Run a dry run first to preview changes</li>
            <li>If preview looks correct, disable dry run and import</li>
          </ol>
        }
        style={{ marginBottom: 16 }}
      />

      <Button icon={<DownloadOutlined />} onClick={downloadTemplate} style={{ marginBottom: 16 }}>
        Download CSV Template
      </Button>

      <div style={{ marginBottom: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <label>
          <Switch checked={dryRun} onChange={setDryRun} style={{ marginRight: 8 }} />
          Dry run (preview only — no changes saved)
        </label>
        <label>
          <Switch checked={updateExisting} onChange={setUpdateExisting} style={{ marginRight: 8 }} />
          Update existing employers
        </label>
      </div>

      <Upload accept=".csv" showUploadList={false} beforeUpload={handleCsvUpload}>
        <Button type="primary" icon={<UploadOutlined />} loading={importing}>
          {dryRun ? 'Preview CSV Import' : 'Import CSV'}
        </Button>
      </Upload>

      {importResult && (
        <div style={{ marginTop: 16 }}>
          {importResult.dry_run && (
            <Alert type="warning" message="DRY RUN — No changes saved" style={{ marginBottom: 8 }} />
          )}
          <Alert
            type={importResult.summary.errors > 0 ? 'warning' : 'success'}
            message={
              `Added: ${importResult.summary.added} | ` +
              `Updated: ${importResult.summary.updated} | ` +
              `Skipped: ${importResult.summary.skipped} | ` +
              `Errors: ${importResult.summary.errors}`
            }
          />
          {importResult.details?.errors?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text strong>Errors:</Text>
              <ul>
                {importResult.details.errors.map((e, i) => (
                  <li key={i} style={{ color: 'var(--danger, #cf1322)' }}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 24 }}
        message="After import"
        description="Imported employers appear on the Employers page (/employers) for use in the document wizard."
      />
    </Card>
  )
}

function UsersTab() {
  const { user: currentUser } = useAuth()
  const { isMobile } = useBreakpoint()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form] = Form.useForm()
  const [editUser, setEditUser] = useState(null)
  const [editForm] = Form.useForm()
  const [passwordUser, setPasswordUser] = useState(null)
  const [passwordForm] = Form.useForm()
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const loadUsers = () => {
    setLoading(true)
    getAdminUsers()
      .then(setUsers)
      .catch(() => message.error('Failed to load users'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleCreate = async (values) => {
    try {
      await createUser(values)
      message.success('User created')
      form.resetFields()
      loadUsers()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Failed to create user')
    }
  }

  const openEditUser = (record) => {
    setEditUser(record)
    editForm.setFieldsValue({
      name: record.name,
      username: record.username,
      role: record.role,
    })
  }

  const handleEditUser = async (values) => {
    if (!editUser) return
    setSavingEdit(true)
    try {
      await updateAdminUser(editUser.id, values)
      message.success('User updated')
      setEditUser(null)
      editForm.resetFields()
      loadUsers()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Failed to update user')
    } finally {
      setSavingEdit(false)
    }
  }

  const openPasswordModal = (record) => {
    setPasswordUser(record)
    passwordForm.resetFields()
  }

  const handlePasswordReset = async (values) => {
    if (!passwordUser) return
    setSavingPassword(true)
    try {
      await resetAdminUserPassword(passwordUser.id, values.password)
      message.success('Password updated')
      setPasswordUser(null)
      passwordForm.resetFields()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleToggleActive = async (record, checked) => {
    try {
      await updateAdminUser(record.id, { is_active: checked })
      message.success(checked ? 'User activated' : 'User deactivated')
      loadUsers()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Failed to update status')
    }
  }

  const handleDeleteUser = async (userId) => {
    try {
      await deleteAdminUser(userId)
      message.success('User removed')
      loadUsers()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Failed to remove user')
    }
  }

  const isSelf = (record) => record.username === currentUser?.username

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'User ID', dataIndex: 'username', key: 'username' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => <Tag color={role === 'admin' ? 'blue' : 'default'}>{role}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active, record) => (
        <Switch
          checked={active !== false}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
          disabled={isSelf(record)}
          onChange={(checked) => handleToggleActive(record, checked)}
        />
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => (val ? dayjs(val).format('MMM D, YYYY') : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small" wrap>
          <Tooltip title="Edit name, user ID & role">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditUser(record)}
            />
          </Tooltip>
          <Tooltip title="Change password">
            <Button
              size="small"
              icon={<LockOutlined />}
              onClick={() => openPasswordModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Remove this user?"
            description="Users with generated documents must be deactivated instead."
            okText="Remove"
            okButtonProps={{ danger: true }}
            disabled={isSelf(record)}
            onConfirm={() => handleDeleteUser(record.id)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={isSelf(record)}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {isMobile ? (
        <div className="mobile-only-block mobile-user-list">
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading users...</div>
          ) : (
            users.map((record) => (
              <article key={record.id} className="mobile-user-card">
                <div className="mobile-user-card__head">
                  <div>
                    <h3 className="mobile-user-card__name">{record.name || record.username}</h3>
                    <div className="mobile-user-card__meta">@{record.username}</div>
                  </div>
                  <Tag color={record.role === 'admin' ? 'blue' : 'default'}>{record.role}</Tag>
                </div>
                <div className="mobile-user-card__meta">
                  {record.is_active === false ? 'Inactive' : 'Active'}
                  {record.created_at ? ` · ${dayjs(record.created_at).format('MMM D, YYYY')}` : ''}
                </div>
                <div className="mobile-user-card__actions">
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditUser(record)}>
                    Edit
                  </Button>
                  <Button size="small" icon={<LockOutlined />} onClick={() => openPasswordModal(record)}>
                    Password
                  </Button>
                  <Popconfirm
                    title="Remove this user?"
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                    disabled={isSelf(record)}
                    onConfirm={() => handleDeleteUser(record.id)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={isSelf(record)}>
                      Remove
                    </Button>
                  </Popconfirm>
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
      <Table columns={columns} dataSource={users} rowKey="id" loading={loading} scroll={{ x: 720 }} />
      )}
      <Card title="Add User" style={{ marginTop: 24 }} className={isMobile ? 'mobile-add-user-card' : undefined}>
        <Form form={form} layout={isMobile ? 'vertical' : 'inline'} onFinish={handleCreate} wrap>
          <Form.Item name="name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="Full name" style={isMobile ? undefined : { width: 160 }} />
          </Form.Item>
          <Form.Item name="username" rules={[{ required: true, message: 'User ID required' }]}>
            <Input placeholder="User ID" style={isMobile ? undefined : { width: 140 }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 6 }]}>
            <Input.Password placeholder="Password" style={isMobile ? undefined : { width: 140 }} />
          </Form.Item>
          <Form.Item name="role" initialValue="staff" rules={[{ required: true }]}>
            <Select
              style={isMobile ? undefined : { width: 120 }}
              options={[
                { value: 'staff', label: 'Staff' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block={isMobile}>
              Add User
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title="Edit User"
        open={!!editUser}
        onCancel={() => {
          setEditUser(null)
          editForm.resetFields()
        }}
        onOk={() => editForm.submit()}
        confirmLoading={savingEdit}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditUser}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Full name" />
          </Form.Item>
          <Form.Item
            name="username"
            label="User ID"
            rules={[{ required: true, message: 'User ID is required' }]}
          >
            <Input placeholder="User ID" />
          </Form.Item>
          <Form.Item
            name="role"
            label="Role"
            rules={[{ required: true }]}
          >
            <Select
              disabled={editUser && isSelf(editUser)}
              options={[
                { value: 'staff', label: 'Staff' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={passwordUser ? `Change password — ${passwordUser.name || passwordUser.username}` : 'Change password'}
        open={!!passwordUser}
        onCancel={() => {
          setPasswordUser(null)
          passwordForm.resetFields()
        }}
        onOk={() => passwordForm.submit()}
        confirmLoading={savingPassword}
        destroyOnHidden
      >
        <Form form={passwordForm} layout="vertical" onFinish={handlePasswordReset}>
          <Form.Item
            name="password"
            label="New password"
            rules={[
              { required: true, message: 'Password is required' },
              { min: 6, message: 'At least 6 characters' },
            ]}
          >
            <Input.Password placeholder="New password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Confirm the password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Passwords do not match'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="Confirm password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function StatsTab() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => message.error('Failed to load stats'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin />
  if (!stats) return null

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} md={8}>
        <Card>
          <Statistic title="Total Documents Generated" value={stats.total_documents_generated} />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Card>
          <Statistic title="Documents Today" value={stats.documents_today} />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Card>
          <Statistic title="Documents This Month" value={stats.documents_this_month} />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Card>
          <Statistic title="Active Templates" value={stats.total_active_templates} />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Card>
          <Statistic title="Total Companies" value={stats.total_companies} />
        </Card>
      </Col>
    </Row>
  )
}
