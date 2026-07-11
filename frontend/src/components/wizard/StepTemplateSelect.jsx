import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { CheckOutlined, ArrowLeftOutlined, EyeOutlined } from '@ant-design/icons'
import { getTemplatesCatalog, getTradeBankIndustries, getTemplateById } from '../../api/client'
import { useDocStore } from '../../store/useDocStore'
import { useAppMessage } from '../../hooks/useAppMessage'
import TemplatePreviewModal from '../ui/TemplatePreviewModal'
import TemplateCardThumb from '../admin/TemplateCardThumb'
import CountrySelect from '../ui/CountrySelect'
import CountryFlag from '../ui/CountryFlag'
import {
  getCountryByCode,
  getCountryCode,
  PRIORITY_COUNTRIES,
} from '../../data/countries'


const INDUSTRY_CATEGORY_ALIASES = {
  'construction & infrastructure': ['construction and infrastructure'],
  'hospitality & tourism': ['hotels & hospitality', 'hotels and hospitality'],
  'logistics & supply chain': ['warehousing'],
}

function normalizeIndustryKey(name) {
  return (name || '').replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function templateMatchesIndustry(industryName, templateIndustry, templateCategory) {
  const industryKey = normalizeIndustryKey(industryName)
  for (const raw of [templateIndustry, templateCategory]) {
    const key = normalizeIndustryKey(raw)
    if (!key) continue
    if (industryKey === key) return true
    const aliases = INDUSTRY_CATEGORY_ALIASES[industryKey] || []
    if (aliases.some((alias) => normalizeIndustryKey(alias) === key)) return true
  }
  return false
}

const COUNTRY_NAME_ALIASES = {
  'new zealand': ['new zealand', 'nz'],
  australia: ['australia', 'au'],
  'united kingdom': ['united kingdom', 'uk'],
  canada: ['canada', 'ca'],
  'united arab emirates': ['united arab emirates', 'uae'],
}

function countryNamesMatch(selected, templateCountry) {
  if (!selected || !templateCountry) return false
  const sel = selected.trim().toLowerCase()
  const tpl = templateCountry.trim().toLowerCase()
  if (sel === tpl) return true
  for (const variants of Object.values(COUNTRY_NAME_ALIASES)) {
    if (variants.includes(sel) && variants.includes(tpl)) return true
  }
  return false
}

const COUNTRY_ACCENTS = {
  'New Zealand':    { bg: 'rgba(139,26,26,0.06)',  border: 'rgba(139,26,26,0.18)' },
  Australia:        { bg: 'rgba(0,100,180,0.06)',  border: 'rgba(0,100,180,0.18)' },
  'United Kingdom': { bg: 'rgba(0,50,160,0.06)',   border: 'rgba(0,50,160,0.18)'  },
  Canada:           { bg: 'rgba(200,30,30,0.06)',  border: 'rgba(200,30,30,0.18)' },
  'United Arab Emirates': { bg: 'rgba(0,140,60,0.06)', border: 'rgba(0,140,60,0.18)' },
  UAE:              { bg: 'rgba(0,140,60,0.06)',   border: 'rgba(0,140,60,0.18)'  },
  Jordan:           { bg: 'rgba(0,100,80,0.06)',   border: 'rgba(0,100,80,0.18)'  },
  'Saudi Arabia':   { bg: 'rgba(0,100,50,0.06)',   border: 'rgba(0,100,50,0.18)'  },
  Qatar:            { bg: 'rgba(120,0,60,0.06)',   border: 'rgba(120,0,60,0.18)'  },
  Kuwait:           { bg: 'rgba(0,80,120,0.06)',   border: 'rgba(0,80,120,0.18)'  },
  India:            { bg: 'rgba(200,120,0,0.06)',  border: 'rgba(200,120,0,0.18)' },
  Philippines:      { bg: 'rgba(0,60,160,0.06)',   border: 'rgba(0,60,160,0.18)'  },
  'Sri Lanka':      { bg: 'rgba(160,0,0,0.06)',    border: 'rgba(160,0,0,0.18)'   },
  Nepal:            { bg: 'rgba(0,0,160,0.06)',    border: 'rgba(0,0,160,0.18)'   },
  Bangladesh:       { bg: 'rgba(0,100,60,0.06)',   border: 'rgba(0,100,60,0.18)'  },
}

/* ── Shared helpers ────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div className="wizard-section-label">
      <div className="wizard-section-label__bar" />
      <span className="wizard-section-label__text">{children}</span>
    </div>
  )
}

/** Breadcrumb row showing current selections (display only — use bottom bar to go back) */
function Breadcrumb({ country, category, industryIcon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      marginBottom: 20,
      padding: '8px 14px',
      background: 'var(--surface-3)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      fontSize: 13,
    }}>
      <span style={{ ...crumbText, display: 'flex', alignItems: 'center', gap: 7 }}>
        <CountryFlag name={country} size={22} />
        {country}
      </span>
      {category && (
        <>
          <span style={{ color: 'var(--text-muted)' }}>›</span>
          <span style={crumbText}>
            {industryIcon || '📂'} {category}
          </span>
        </>
      )}
    </div>
  )
}

const crumbText = {
  padding: '2px 6px',
  fontWeight: 600,
  color: 'var(--primary)',
  fontSize: 13,
}

/* ── View 1: Country Grid ──────────────────────────────── */
function CountryView({ quickPickCountries, selectedCountry, onSelect, onCodeSelect }) {
  return (
    <div className="animate-slide-in-step">
      <div className="wizard-step-header">
        <div className="wizard-step-header__title">Select country</div>
        <div className="wizard-step-header__subtitle">Choose the destination country for this document</div>
      </div>

      <div className="country-search-row">
        <CountrySelect
          value={getCountryCode(selectedCountry)}
          onChange={onCodeSelect}
          placeholder="Search all countries..."
          size="middle"
        />
      </div>

      <SectionLabel>Frequently used</SectionLabel>
      <div className="country-select-grid stagger-fade">
        {quickPickCountries.map((c) => {
          const ac = COUNTRY_ACCENTS[c] || { bg: 'rgba(139,26,26,0.05)', border: 'rgba(139,26,26,0.14)' }
          const selected = selectedCountry === c
          return (
            <button
              key={c}
              type="button"
              className={`country-select-card ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(c)}
              style={{
                '--country-accent-bg': ac.bg,
                '--country-accent-border': ac.border,
              }}
            >
              <span className="country-select-card__flag">
                <CountryFlag name={c} size={28} />
              </span>
              <span className="country-select-card__name">{c}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── View 2: Industry list ─────────────────────────────── */
function IndustryView({ country, industries, selectedCategory, onSelect }) {
  return (
    <div className="animate-slide-in-step">
      <div className="wizard-location-crumb">
        <CountryFlag name={country} size={18} />
        <span>{country}</span>
      </div>

      <div className="wizard-step-header">
        <div className="wizard-step-header__title">Select industry</div>
        <div className="wizard-step-header__subtitle">Pick the industry category for your document</div>
      </div>

      {industries.length === 0 ? (
        <div className="wizard-empty-state">
          No industries loaded. Refresh the page or contact your administrator.
        </div>
      ) : (
        <div className="industry-select-grid stagger-fade">
          {industries.map((ind) => {
            const accent = ind.color || '#8B1A1A'
            const selected = selectedCategory === ind.name
            return (
              <button
                key={ind.name}
                type="button"
                className={`industry-select-card ${selected ? 'selected' : ''}`}
                onClick={() => onSelect(ind.name)}
                style={{ '--industry-accent': accent }}
              >
                <span
                  className="industry-select-card__icon"
                  style={{ background: `${accent}14` }}
                >
                  {ind.icon || '📂'}
                </span>
                <div className="industry-select-card__body">
                  <div className="industry-select-card__title">{ind.name}</div>
                  <div className="industry-select-card__meta">
                    {ind.trade_count > 0
                      ? `${ind.trade_count} trades · ${ind.categories?.length || 0} cat.`
                      : 'View templates'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Template thumbnail ── */
function LiveThumbnail({ templateId, selected }) {
  if (templateId) {
    return (
      <div style={{ width: '100%', aspectRatio: '210 / 290', overflow: 'hidden' }}>
        <TemplateCardThumb templateId={templateId} />
      </div>
    )
  }
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '210 / 290',
        background: '#f8f8f8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <FallbackDocSvg selected={selected} />
    </div>
  )
}

/* ── Fallback SVG (only shown on error / no template_id) ─────── */
function FallbackDocSvg({ selected }) {
  const accent = selected ? '#8B1A1A' : '#BBBBBB'
  return (
    <svg viewBox="0 0 210 297" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="210" height="36" fill={accent} />
      <rect x="12" y="10" width="78" height="7" rx="2" fill="rgba(255,255,255,0.88)" />
      <rect x="12" y="22" width="48" height="3.5" rx="1" fill="rgba(255,255,255,0.50)" />
      <rect x="152" y="12" width="46" height="3.5" rx="1" fill="rgba(255,255,255,0.50)" />
      <rect x="12" y="46" width="38" height="2.5" rx="1" fill="#ccc" />
      <rect x="12" y="53" width="58" height="2.5" rx="1" fill="#ccc" />
      <rect x="12" y="67" width="88" height="3.5" rx="1" fill="#999" />
      {[79,87,95,103,111,119,127].map((y, i) => <rect key={i} x="12" y={y} width={i % 3 === 2 ? 140 : 186} height="2.5" rx="1" fill="#ddd" />)}
      {[139,147,155,163].map((y, i) => <rect key={i} x="12" y={y} width={i === 3 ? 100 : 186} height="2.5" rx="1" fill="#ddd" />)}
      <rect x="12" y="200" width="58" height="2.5" rx="1" fill="#ccc" />
      <rect x="12" y="210" width="78" height="3" rx="1" fill="#aaa" />
      <rect x="0" y="285" width="210" height="2" fill={accent} opacity="0.4" />
    </svg>
  )
}

/* ── Mock A4 document SVG thumbnails (4 layout variants) ────── */
function DocThumb({ variant, accent = '#9B9B9B' }) {
  if (variant === 1) return (
    <svg viewBox="0 0 210 297" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="65" height="297" fill={accent} opacity="0.10" />
      <rect x="6" y="14" width="53" height="14" rx="2" fill={accent} opacity="0.65" />
      <rect x="8" y="34" width="49" height="3" rx="1" fill={accent} opacity="0.45" />
      <rect x="8" y="42" width="38" height="2.5" rx="1" fill="#bbb" />
      <rect x="8" y="64" width="28" height="3" rx="1" fill={accent} opacity="0.55" />
      {[72,79,86,93,100].map((y, i) => <rect key={i} x="8" y={y} width={44 - i * 4} height="2" rx="1" fill="#ccc" />)}
      <rect x="8" y="118" width="28" height="3" rx="1" fill={accent} opacity="0.55" />
      {[126,133,140].map((y) => <rect key={y} x="8" y={y} width="44" height="2" rx="1" fill="#ccc" />)}
      <rect x="76" y="14" width="110" height="7" rx="1.5" fill="#444" />
      <rect x="76" y="25" width="72" height="3.5" rx="1" fill={accent} opacity="0.70" />
      <rect x="0" y="37" width="210" height="1" fill={accent} opacity="0.12" />
      <rect x="76" y="46" width="48" height="3" rx="1" fill={accent} opacity="0.50" />
      {[54,62,70,78,86,94].map((y, i) => <rect key={i} x="76" y={y} width={i % 4 === 3 ? 65 : 120} height="2.5" rx="1" fill="#ccc" />)}
      <rect x="76" y="108" width="48" height="3" rx="1" fill={accent} opacity="0.50" />
      {[116,124,132,140,148].map((y, i) => <rect key={i} x="76" y={y} width={i % 3 === 2 ? 75 : 120} height="2.5" rx="1" fill="#ccc" />)}
      <rect x="76" y="198" width="52" height="2.5" rx="1" fill="#bbb" />
      <rect x="76" y="208" width="75" height="3" rx="1" fill="#777" />
    </svg>
  )
  if (variant === 2) return (
    <svg viewBox="0 0 210 297" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="210" height="7" fill={accent} />
      <rect x="12" y="15" width="28" height="13" rx="2" fill={accent} opacity="0.18" />
      <rect x="45" y="17" width="58" height="5" rx="1.5" fill="#444" />
      <rect x="45" y="26" width="38" height="2.5" rx="1" fill="#aaa" />
      <rect x="140" y="17" width="58" height="5" rx="1.5" fill={accent} opacity="0.70" />
      <rect x="148" y="26" width="40" height="2.5" rx="1" fill="#bbb" />
      <rect x="0" y="37" width="210" height="1" fill="#eee" />
      {[45,52,59,66].map((y) => <rect key={y} x="12" y={y} width="88" height="2.5" rx="1" fill="#ccc" />)}
      <rect x="140" y="45" width="58" height="2.5" rx="1" fill="#ccc" />
      <rect x="140" y="53" width="40" height="2.5" rx="1" fill="#ccc" />
      <rect x="12" y="81" width="148" height="4" rx="1" fill="#555" />
      <rect x="0" y="91" width="210" height="1" fill="#eee" />
      {[99,107,115,123,131,139,147,155].map((y, i) => <rect key={i} x="12" y={y} width={i % 4 === 3 ? 115 : 186} height="2.5" rx="1" fill="#ccc" />)}
      {[167,175,183,191].map((y, i) => <rect key={i} x="12" y={y} width={i === 3 ? 75 : 186} height="2.5" rx="1" fill="#ccc" />)}
      <rect x="12" y="218" width="52" height="2.5" rx="1" fill="#bbb" />
      <rect x="12" y="227" width="78" height="3" rx="1" fill="#666" />
      <rect x="0" y="289" width="210" height="8" fill={accent} opacity="0.14" />
    </svg>
  )
  if (variant === 3) return (
    <svg viewBox="0 0 210 297" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="4" height="297" fill={accent} />
      <rect x="16" y="15" width="118" height="8" rx="2" fill="#333" />
      <rect x="16" y="27" width="78" height="4" rx="1" fill={accent} opacity="0.65" />
      <rect x="16" y="37" width="98" height="2.5" rx="1" fill="#ccc" />
      <rect x="16" y="43" width="82" height="2.5" rx="1" fill="#ccc" />
      <rect x="16" y="55" width="180" height="1.5" fill={accent} opacity="0.18" />
      <rect x="16" y="63" width="44" height="2.5" rx="1" fill="#bbb" />
      <rect x="120" y="63" width="68" height="2.5" rx="1" fill="#bbb" />
      <rect x="16" y="77" width="92" height="3" rx="1" fill="#888" />
      {[87,95,103,111,119,127,135].map((y, i) => <rect key={i} x="16" y={y} width={i % 5 === 4 ? 95 : 180} height="2.5" rx="1" fill="#ddd" />)}
      {[147,155,163,171].map((y, i) => <rect key={i} x="16" y={y} width={i === 3 ? 88 : 180} height="2.5" rx="1" fill="#ddd" />)}
      {[181,189,197].map((y, i) => <rect key={i} x="16" y={y} width={i === 2 ? 135 : 180} height="2.5" rx="1" fill="#ddd" />)}
      <rect x="16" y="221" width="52" height="2.5" rx="1" fill="#bbb" />
      <rect x="16" y="231" width="82" height="3.5" rx="1" fill="#555" />
      <rect x="16" y="239" width="58" height="2.5" rx="1" fill="#aaa" />
    </svg>
  )
  /* variant 0 – Classic (default) */
  return (
    <svg viewBox="0 0 210 297" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="210" height="36" fill={accent} />
      <rect x="12" y="10" width="78" height="7" rx="2" fill="rgba(255,255,255,0.88)" />
      <rect x="12" y="22" width="48" height="3.5" rx="1" fill="rgba(255,255,255,0.50)" />
      <rect x="152" y="12" width="46" height="3.5" rx="1" fill="rgba(255,255,255,0.50)" />
      <rect x="152" y="20" width="34" height="2.5" rx="1" fill="rgba(255,255,255,0.35)" />
      <rect x="12" y="46" width="38" height="2.5" rx="1" fill="#bbb" />
      <rect x="12" y="53" width="58" height="2.5" rx="1" fill="#bbb" />
      <rect x="12" y="67" width="88" height="3.5" rx="1" fill="#888" />
      {[79,87,95,103,111,119,127].map((y, i) => <rect key={i} x="12" y={y} width={i % 3 === 2 ? 138 : 186} height="2.5" rx="1" fill="#ccc" />)}
      {[139,147,155,163].map((y, i) => <rect key={i} x="12" y={y} width={i === 3 ? 98 : 186} height="2.5" rx="1" fill="#ccc" />)}
      <rect x="12" y="200" width="58" height="2.5" rx="1" fill="#bbb" />
      <rect x="12" y="210" width="78" height="3" rx="1" fill="#888" />
      <rect x="12" y="218" width="52" height="2.5" rx="1" fill="#ccc" />
      <rect x="0" y="285" width="210" height="2" fill={accent} opacity="0.38" />
    </svg>
  )
}

/* ── Format template card (admin-style, view-only) ─────────── */
function FormatTemplateCard({ format, selected, onSelect }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const title = format.format_label || format.format_slug

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={`format-template-card ${selected ? 'selected' : ''}`}
        onClick={() => onSelect(format.format_slug)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(format.format_slug)}
      >
        <LiveThumbnail templateId={format.template_id} selected={selected} />

        <div className="format-template-card__overlay">
          <button
            type="button"
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.92)',
              border: 'none',
              color: 'var(--primary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'inherit',
            }}
            onClick={(e) => {
              e.stopPropagation()
              setPreviewOpen(true)
            }}
          >
            <EyeOutlined style={{ fontSize: 13 }} />
            View Template
          </button>
        </div>

        {selected && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(26, 60, 94, 0.45)',
              zIndex: 2,
            }}
          >
            <CheckOutlined style={{ color: 'white', fontSize: 12 }} />
          </div>
        )}

        <div
          style={{
            padding: '10px 12px 12px',
            borderTop: `1px solid ${selected ? 'rgba(26,60,94,0.15)' : 'var(--border)'}`,
            background: selected ? 'rgba(26,60,94,0.04)' : '#fafafa',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.35,
              color: selected ? 'var(--primary)' : 'var(--text-primary)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {title}
          </div>
          {(format.industry || format.category) && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontWeight: 500 }}>
              {format.industry || format.category}{format.company_name ? ` · ${format.company_name}` : ''}
            </div>
          )}
        </div>
      </div>

      <TemplatePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        templateId={format.template_id}
        title={title}
      />
    </>
  )
}

/* ── View 3: Format Gallery (Canva-style) ────────────────────── */
function FormatView({ country, category, industryIcon, formats, formatSlug, loading, onSelect }) {
  return (
    <div className="animate-slide-in-step">
      <Breadcrumb country={country} category={category} industryIcon={industryIcon} />

      <SectionLabel>
        Choose a Template
        {formats.length > 0 && (
          <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 400, fontSize: 11, textTransform: 'none' }}>
            · {formats.length} available
          </span>
        )}
      </SectionLabel>

      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
          gap: 16,
        }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-shimmer"
              style={{ height: 280, borderRadius: 12, animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      ) : formats.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--surface-3)', borderRadius: 'var(--radius-lg)',
          border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
            No templates for{' '}
            <strong style={{ color: 'var(--text-secondary)' }}>{country} › {category}</strong>
          </p>
        </div>
      ) : (
        <div className="format-select-grid stagger-fade">
          {formats.map((f) => (
            <FormatTemplateCard
              key={f.template_id || f.format_slug}
              format={f}
              selected={formatSlug === f.format_slug}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────── */
export default function StepTemplateSelect({ phase = 'full', onContinue, onBack, onRegisterNav }) {
  const {
    docType,
    templateMeta,
    locationView,
    draftCountry,
    draftCategory,
    draftFormatSlug,
    setLocationMeta,
    setTemplateMeta,
    setLocationDraft,
  } = useDocStore()
  const isLocationPhase = phase === 'location'
  const isTemplatePhase = phase === 'template'
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState({ countries: [], formats: [], categories: [] })
  const [industries, setIndustries] = useState([])
  const [formatsLoading, setFormatsLoading] = useState(false)

  const country = isLocationPhase
    ? draftCountry ?? templateMeta?.country ?? null
    : templateMeta?.country ?? null
  const category = isLocationPhase
    ? draftCategory ?? templateMeta?.category ?? null
    : templateMeta?.category ?? null
  const view = isTemplatePhase ? 'format' : locationView
  const formatSlug = isTemplatePhase
    ? draftFormatSlug ?? templateMeta?.format ?? null
    : null

  const message = useAppMessage()

  useEffect(() => {
    if (!docType) return
    setLoading(true)
    Promise.all([
      getTemplatesCatalog({ doc_type: docType.slug }),
      getTradeBankIndustries(),
    ])
      .then(([catalogData, industryData]) => {
        setCatalog(catalogData)
        setIndustries(industryData.industries || [])
      })
      .catch(() => message.error('Failed to load templates'))
      .finally(() => setLoading(false))
  }, [docType, message])

  useEffect(() => {
    if (!isLocationPhase) return
    if (locationView === 'category' && !draftCountry) {
      setLocationDraft({ locationView: 'country' })
    }
  }, [isLocationPhase, locationView, draftCountry, setLocationDraft])

  useEffect(() => {
    if (!docType || !country || !category) return
    if (!isTemplatePhase && view !== 'format') return
    if (isLocationPhase) return
    setFormatsLoading(true)
    getTemplatesCatalog({ doc_type: docType.slug, country, industry: category })
      .then((data) => {
        setCatalog((prev) => ({ ...prev, formats: data.formats || [] }))
      })
      .catch(() => message.error('Failed to load templates for this selection'))
      .finally(() => setFormatsLoading(false))
  }, [docType, country, category, view, isTemplatePhase, isLocationPhase, message])

  const quickPickCountries = useMemo(
    () =>
      PRIORITY_COUNTRIES.map((code) => getCountryByCode(code)?.name).filter(Boolean),
    []
  )

  const selectedIndustry = industries.find((ind) => ind.name === category)

  const formats = useMemo(() => {
    return (catalog.formats || []).filter((f) => {
      if (country && !countryNamesMatch(country, f.country)) return false
      if (category && !templateMatchesIndustry(category, f.industry, f.category)) return false
      return true
    })
  }, [catalog.formats, country, category])

  const selectedFormat = formats.find((f) => f.format_slug === formatSlug)

  const handleCountryCodeSelect = (code) => {
    const meta = getCountryByCode(code)
    if (meta) handleCountrySelect(meta.name)
  }

  const handleCountrySelect = (c) => {
    setLocationDraft({
      draftCountry: c,
      draftCategory: null,
      locationView: 'category',
      draftFormatSlug: null,
    })
  }

  const handleCategorySelect = (cat) => {
    setLocationDraft({ draftCategory: cat, draftFormatSlug: null })
  }

  const handleFormatSelect = (slug) => {
    setLocationDraft({ draftFormatSlug: slug })
  }

  const handleSubBack = useCallback(() => {
    if (isLocationPhase && locationView === 'category') {
      setLocationDraft({ locationView: 'country', draftCategory: null })
      return
    }
    onBack()
  }, [isLocationPhase, locationView, onBack, setLocationDraft])

  const handleContinue = useCallback(() => {
    if (isLocationPhase) {
      if (!country || !category) {
        message.error('Please select a country and industry')
        return
      }
      setLocationMeta(country, category, docType.slug)
      onContinue()
      return
    }

    if (!country || !category || !formatSlug || !selectedFormat) {
      message.error('Please select a template to continue')
      return
    }
    setTemplateMeta(
      {
        country,
        category,
        format: formatSlug,
        format_label: selectedFormat.format_label,
        doc_type: docType.slug,
      },
      selectedFormat.template_id
    )
    setLocationDraft({ draftFormatSlug: formatSlug })
    getTemplateById(selectedFormat.template_id)
      .then((data) => {
        useDocStore.getState().setTemplate(selectedFormat.template_id, data.placeholders || [])
      })
      .catch(() => {})
    onContinue()
  }, [
    isLocationPhase,
    country,
    category,
    formatSlug,
    selectedFormat,
    docType,
    message,
    onContinue,
    setLocationMeta,
    setTemplateMeta,
  ])

  useEffect(() => {
    onRegisterNav?.({
      hidden: false,
      onBack: handleSubBack,
      onNext: handleContinue,
      nextLabel: 'Continue',
      nextDisabled: isLocationPhase ? !country || !category : !formatSlug,
    })
  }, [handleSubBack, handleContinue, onRegisterNav, formatSlug, isLocationPhase, country, category])

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div style={{ padding: '4px 0' }}>
        <div className="animate-shimmer" style={{ height: 14, width: 120, borderRadius: 4, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-shimmer"
              style={{ height: 110, borderRadius: 'var(--radius-lg)', animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {!isTemplatePhase && view === 'country' && (
        <CountryView
          quickPickCountries={quickPickCountries}
          selectedCountry={country}
          onSelect={handleCountrySelect}
          onCodeSelect={handleCountryCodeSelect}
        />
      )}

      {!isTemplatePhase && view === 'category' && (
        <IndustryView
          country={country}
          industries={industries}
          selectedCategory={category}
          onSelect={handleCategorySelect}
        />
      )}

      {(isTemplatePhase || view === 'format') && (
        <FormatView
          country={country}
          category={category}
          industryIcon={selectedIndustry?.icon}
          formats={formats}
          formatSlug={formatSlug}
          loading={formatsLoading}
          onSelect={handleFormatSelect}
        />
      )}
    </div>
  )
}
