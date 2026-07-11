import { useState, useMemo, useEffect } from 'react'
import { Input, message, Button, Tag, Popconfirm, Tooltip } from 'antd'
import {
  SearchOutlined,
  CopyOutlined,
  CheckOutlined,
  RightOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import {
  createAdminTrade,
  createAdminIndustry,
  updateAdminTrade,
  deleteAdminTrade,
} from '../../api/client'
import AddTradeModal from './AddTradeModal'
import AddIndustryModal from './AddIndustryModal'
import CountryFlag from '../ui/CountryFlag'
import COUNTRIES, { PRIORITY_COUNTRIES, getCountryByCode } from '../../data/countries'
import { resolveDuties } from '../../utils/dutyResolver'
import {
  DEFAULT_CODE,
  getCodeSystemForCountry,
  getOccupationCodesFromTrade,
  getPrimaryOccupationCode,
} from '../../data/occupationCodes'

const MOBILE_BREAKPOINT = 768

function useIsMobile() {
  const [mobile, setMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  )
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return mobile
}

function tradeMatchesSearch(trade, q, raw) {
  if (trade.trade.toLowerCase().includes(q)) return true
  if (trade.anzsco_code?.includes(raw)) return true
  const codes = getOccupationCodesFromTrade(trade)
  return Object.values(codes).some(
    (info) =>
      info.code?.toLowerCase().includes(q) ||
      info.title?.toLowerCase().includes(q)
  )
}

function confidenceStyle(confidence) {
  switch (confidence) {
    case 'CONFIRMED':
      return { background: '#E8F5E9', color: '#2E7D32' }
    case 'LIKELY':
      return { background: '#FFF8E1', color: '#F57F17' }
    case 'UNCERTAIN':
      return { background: '#FCE4EC', color: '#C62828' }
    default:
      return null
  }
}

function OccupationCodeRow({ system, info }) {
  const confStyle = confidenceStyle(info.confidence)
  return (
    <div style={{ marginBottom: info.note ? 8 : 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          style={{
            background: '#1A3C5E',
            color: 'white',
            borderRadius: 4,
            padding: '1px 8px',
            fontSize: 11,
            fontWeight: 700,
            width: 70,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {system}
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 600,
            color: '#1A3C5E',
          }}
        >
          {info.code}
        </span>
        <span style={{ color: '#9AA3B0', fontSize: 12 }}>{info.title}</span>
        {confStyle && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.4px',
              borderRadius: 4,
              padding: '1px 6px',
              ...confStyle,
            }}
          >
            {info.confidence}
          </span>
        )}
      </div>
      {info.note && (
        <div style={{ fontSize: 11, color: '#9AA3B0', marginTop: 4, paddingLeft: 78 }}>
          {info.note}
        </div>
      )}
    </div>
  )
}

function OccupationCodesList({ trade, countryCode }) {
  const codes = getOccupationCodesFromTrade(trade)

  if (countryCode) {
    const system = getCodeSystemForCountry(countryCode).system
    const info = codes[system] || codes.ANZSCO || Object.values(codes)[0]
    if (!info) return null
    return (
      <div style={{ marginBottom: 16 }}>
        <OccupationCodeRow system={system} info={info} />
      </div>
    )
  }

  const entries = Object.entries(codes)
  if (!entries.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      {entries.map(([system, info]) => (
        <OccupationCodeRow key={system} system={system} info={info} />
      ))}
    </div>
  )
}

function flattenIndustryTrades(industry) {
  if (!industry) return []
  return industry.categories.flatMap((cat) =>
    cat.trades.map((trade) => ({ trade, category: cat }))
  )
}

function tradeKey(trade, category) {
  return trade.id || `${category.category}-${trade.trade}-${trade.anzsco_code}`
}

function tradesMatch(a, b, catA, catB) {
  if (a?.id && b?.id) return a.id === b.id
  return a?.trade === b?.trade && catA?.category === catB?.category
}

export default function TradeBankTab({ tradeBank, onRefresh }) {
  const isMobile = useIsMobile()
  const [selectedIndustry, setSelectedIndustry] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedTrade, setSelectedTrade] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [countryFilter, setCountryFilter] = useState('NZ')
  const [copied, setCopied] = useState(null)
  const [mobileStep, setMobileStep] = useState(1)

  const sidebarCountries = useMemo(() => {
    const byCode = new Map(COUNTRIES.map((c) => [c.code, c]))
    const priority = PRIORITY_COUNTRIES.map((code) => byCode.get(code)).filter(Boolean)
    const rest = COUNTRIES.filter((c) => !PRIORITY_COUNTRIES.includes(c.code)).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    return [...priority, ...rest]
  }, [])

  const activeCodeSystem = countryFilter
    ? getCodeSystemForCountry(countryFilter).system
    : DEFAULT_CODE.system
  const [modalOpen, setModalOpen] = useState(false)
  const [industryModalOpen, setIndustryModalOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState(null)

  const industries = useMemo(() => tradeBank?.industries ?? [], [tradeBank])

  useEffect(() => {
    if (industries.length > 0 && !selectedIndustry) {
      setSelectedIndustry(industries[0])
    }
  }, [industries, selectedIndustry])

  useEffect(() => {
    if (!tradeBank?.industries?.length || !selectedIndustry) return
    const updated = tradeBank.industries.find(
      (i) => i.industry === selectedIndustry.industry
    )
    if (updated && updated !== selectedIndustry) {
      setSelectedIndustry(updated)
    }
  }, [tradeBank, selectedIndustry])

  const selectCountry = (code) => {
    setCountryFilter(code)
    setDutyViewMode('auto')
    setSelectedTrade(null)
    setSelectedCategory(null)
    if (isMobile) setMobileStep(2)
  }

  const industryTrades = useMemo(
    () => flattenIndustryTrades(selectedIndustry),
    [selectedIndustry]
  )

  const searchResults = useMemo(() => {
    if (!searchText || !tradeBank?.industries) return null
    const q = searchText.toLowerCase()
    const results = []
    tradeBank.industries.forEach((ind) => {
      ind.categories.forEach((cat) => {
        cat.trades.forEach((trade) => {
          if (tradeMatchesSearch(trade, q, searchText)) {
            results.push({
              ...trade,
              industryName: ind.industry,
              industryIcon: ind.icon,
              categoryName: cat.category,
              industryColor: ind.color,
            })
          }
        })
      })
    })
    return results
  }, [searchText, tradeBank])

  const selectedCountry = useMemo(
    () => getCountryByCode(countryFilter),
    [countryFilter]
  )

  const displayDuties = useMemo(() => {
    if (!selectedTrade) return []
    return resolveDuties(selectedTrade)
  }, [selectedTrade])

  const totalTrades = useMemo(() => {
    if (!tradeBank?.industries) return 0
    return tradeBank.industries.reduce(
      (sum, ind) =>
        sum + ind.categories.reduce((s, cat) => s + cat.trades.length, 0),
      0
    )
  }, [tradeBank])

  const copyDuties = (trade, duties = displayDuties) => {
    const text = duties.map((d, i) => `${i + 1}. ${d}`).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(trade.id || trade.trade)
    message.success('Duties copied to clipboard!')
    setTimeout(() => setCopied(null), 2000)
  }

  const copyResponsibilities = (trade) => {
    const text = trade.responsibilities
      .map((r, i) => `${i + 1}. ${r}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    message.success('Responsibilities copied!')
  }

  const selectTrade = (ind, cat, trade) => {
    setSelectedIndustry(ind)
    setSelectedCategory(cat)
    setSelectedTrade(trade)
    if (isMobile) setMobileStep(3)
  }

  const selectIndustry = (ind) => {
    setSelectedIndustry(ind)
    setSelectedTrade(null)
    setSelectedCategory(null)
    if (isMobile) setMobileStep(3)
  }

  const backToTradeList = () => {
    setSelectedTrade(null)
    setSelectedCategory(null)
    if (isMobile) setMobileStep(2)
  }

  const handleSaveTrade = async (payload, tradeId) => {
    try {
      if (tradeId) {
        await updateAdminTrade(tradeId, payload)
        message.success('Trade updated')
      } else {
        await createAdminTrade(payload)
        message.success('Trade saved')
      }
      if (onRefresh) await onRefresh()
      setSelectedTrade(null)
    } catch (err) {
      message.error(err.response?.data?.detail || 'Save failed')
      throw err
    }
  }

  const handleDeleteTrade = async (trade) => {
    if (!trade.id) return
    try {
      await deleteAdminTrade(trade.id)
      message.success('Trade deleted')
      if (selectedTrade?.id === trade.id) {
        setSelectedTrade(null)
        setSelectedCategory(null)
      }
      if (onRefresh) await onRefresh()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Delete failed')
    }
  }

  const handleSaveIndustry = async (payload) => {
    try {
      await createAdminIndustry(payload)
      message.success('Industry saved')
      if (onRefresh) await onRefresh()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Save failed')
      throw err
    }
  }

  const openAddModal = () => {
    setEditingTrade(null)
    setModalOpen(true)
  }

  const openEditModal = (trade, category) => {
    setEditingTrade({
      id: trade.id,
      industryName: selectedIndustry.industry,
      categoryName: category.category,
      countries: countryFilter ? [countryFilter] : ['NZ'],
      ...trade,
    })
    setModalOpen(true)
  }

  if (!tradeBank) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#9AA3B0' }}>
        Loading trade bank...
      </div>
    )
  }

  const tradeListView = (
    <div style={{ padding: isMobile ? '12px' : '16px 20px' }}>
      <div
        style={{
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 16 : 17,
              fontWeight: 700,
              color: selectedIndustry?.color || '#1A3C5E',
            }}
          >
            {selectedIndustry?.icon} {selectedIndustry?.industry}
            {selectedIndustry?.is_custom && (
              <span style={{ marginLeft: 6, fontSize: 12 }}>✨</span>
            )}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9AA3B0' }}>
            {industryTrades.length} trades
          </p>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileStep(2)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              border: '1px solid #DDE3EC',
              borderRadius: 8,
              background: 'white',
              cursor: 'pointer',
              fontSize: 12,
              color: '#1A3C5E',
            }}
          >
            <ArrowLeftOutlined /> Industries
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        {industryTrades.map(({ trade, category }) => {
          const isSelected = tradesMatch(
            selectedTrade,
            trade,
            selectedCategory,
            category
          )
          const key = tradeKey(trade, category)
          const accent = selectedIndustry?.color || '#1A3C5E'
          return (
            <div
              key={key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                maxWidth: '100%',
              }}
            >
              <button
                type="button"
                onClick={() => selectTrade(selectedIndustry, category, trade)}
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: isSelected
                    ? `2px solid ${accent}`
                    : '1px solid #DDE3EC',
                  background: isSelected ? `${accent}10` : 'white',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: isSelected ? accent : '#1A1A2E',
                  lineHeight: 1,
                  boxShadow: isSelected
                    ? `0 0 0 1px ${accent}22`
                    : '0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'all 150ms',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = accent
                    e.currentTarget.style.background = '#F7F9FC'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#DDE3EC'
                    e.currentTarget.style.background = 'white'
                  }
                }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>
                  {trade.trade}
                  {trade.is_custom && (
                    <span style={{ marginLeft: 4, fontSize: 11 }}>✨</span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: '#9AA3B0',
                    fontFamily: 'monospace',
                    fontWeight: 400,
                  }}
                >
                  {getPrimaryOccupationCode(trade, countryFilter)}
                </span>
                <Tag
                  color={trade.is_custom ? 'gold' : 'default'}
                  style={{
                    margin: 0,
                    fontSize: 10,
                    lineHeight: '18px',
                    padding: '0 6px',
                  }}
                >
                  {trade.is_custom ? 'Custom' : 'Built-in'}
                </Tag>
              </button>
              {trade.is_custom && (
                <div
                  style={{ display: 'inline-flex', gap: 2 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Tooltip title="Edit">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEditModal(trade, category)}
                      style={{ width: 32, height: 32 }}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="Delete this custom trade?"
                    onConfirm={() => handleDeleteTrade(trade)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="Delete">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        style={{ width: 32, height: 32 }}
                      />
                    </Tooltip>
                  </Popconfirm>
                </div>
              )}
            </div>
          )
        })}
        {industryTrades.length === 0 && (
          <div
            style={{
              width: '100%',
              padding: 32,
              textAlign: 'center',
              color: '#9AA3B0',
              fontSize: 13,
            }}
          >
            No trades yet — use + Add Trade
          </div>
        )}
      </div>
    </div>
  )

  const tradeDetailView = selectedTrade && (
    <div>
      <div
        style={{
          padding: isMobile ? '8px 12px' : '8px 16px',
          background: 'white',
          borderBottom: '1px solid #DDE3EC',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={backToTradeList}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 0',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: selectedIndustry?.color || '#1A3C5E',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <ArrowLeftOutlined style={{ fontSize: 10 }} />
            Back
          </button>
          <Tag
            color={selectedTrade.is_custom ? 'gold' : 'default'}
            style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 6px' }}
          >
            {selectedTrade.is_custom ? 'Custom' : 'Built-in'}
          </Tag>
          {selectedCountry && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 12,
                background: '#F0FBF4',
                color: '#0D7C4A',
                border: '1px solid currentColor',
              }}
            >
              <span>{selectedCountry.flag}</span>
              Generic International Duties
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: isMobile ? 14 : 15,
                fontWeight: 700,
                color: '#1A1A2E',
              }}
            >
              {selectedTrade.trade}
            </span>
          </div>
          {selectedTrade.is_custom && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(selectedTrade, selectedCategory)}
            />
          )}
          <Button
            size="small"
            icon={
              copied === (selectedTrade.id || selectedTrade.trade) ? (
                <CheckOutlined />
              ) : (
                <CopyOutlined />
              )
            }
            onClick={() => copyDuties(selectedTrade)}
          >
            {copied === (selectedTrade.id || selectedTrade.trade)
              ? 'Copied'
              : 'Copy'}
          </Button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '12px' : '16px 20px' }}>
        <OccupationCodesList trade={selectedTrade} countryCode={countryFilter} />

        {selectedTrade.responsibilities?.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#1A3C5E',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                📌 Key Responsibilities
              </h3>
              <button
                type="button"
                onClick={() => copyResponsibilities(selectedTrade)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #DDE3EC',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: '#5A6478',
                }}
              >
                <CopyOutlined /> Copy
              </button>
            </div>
            <div
              style={{
                background: 'white',
                borderRadius: 10,
                border: '1px solid #DDE3EC',
                overflow: 'hidden',
              }}
            >
              {selectedTrade.responsibilities.map((resp, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 16px',
                    borderBottom:
                      i < selectedTrade.responsibilities.length - 1
                        ? '1px solid #F0F4F8'
                        : 'none',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: `${selectedIndustry?.color}15`,
                      color: selectedIndustry?.color || '#1A3C5E',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: '#2C2C3E',
                      lineHeight: 1.6,
                    }}
                  >
                    {resp}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: '#1A3C5E',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              📋 Key Duties
              <span
                style={{
                  marginLeft: 8,
                  background: '#F0F4F8',
                  borderRadius: 10,
                  padding: '1px 8px',
                  fontSize: 11,
                  color: '#5A6478',
                  fontWeight: 400,
                  textTransform: 'none',
                  letterSpacing: 0,
                }}
              >
                {displayDuties.length} duties
              </span>
            </h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #0D7C4A',
                  background: '#F0FBF4',
                  fontSize: 11,
                  color: '#0D7C4A',
                }}
              >
                🌍 Generic
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyDuties(selectedTrade)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #DDE3EC',
                background: 'white',
                cursor: 'pointer',
                fontSize: 11,
                color: '#5A6478',
              }}
            >
              <CopyOutlined /> Copy All
            </button>
          </div>
          <div
            style={{
              background: 'white',
              borderRadius: 10,
              border: '1px solid #DDE3EC',
              overflow: 'hidden',
            }}
          >
            {displayDuties.map((duty, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderBottom:
                    i < displayDuties.length - 1
                      ? '1px solid #F0F4F8'
                      : 'none',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  background: i % 2 === 0 ? 'white' : '#FAFBFC',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: `${selectedIndustry?.color}12`,
                    color: selectedIndustry?.color || '#1A3C5E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#2C2C3E',
                    lineHeight: 1.7,
                  }}
                >
                  {duty}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  const panelCountries = (
    <div
      style={{
        width: isMobile ? '100%' : '200px',
        flexShrink: 0,
        background: '#152d47',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        height: isMobile ? '100%' : undefined,
      }}
    >
      <div
        style={{
          padding: '12px 16px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        Countries
      </div>
      {sidebarCountries.map((country) => {
        const isSelected = countryFilter === country.code
        const codeSystem = country.codeSystem || country.occupationSystem || DEFAULT_CODE.system
        return (
          <div
            key={country.code}
            onClick={() => selectCountry(country.code)}
            style={{
              padding: '8px 14px',
              cursor: 'pointer',
              transition: 'all 180ms',
              background: isSelected ? 'rgba(212,160,23,0.25)' : 'transparent',
              borderLeft: isSelected
                ? '3px solid #D4A017'
                : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (!isSelected)
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'transparent'
            }}
          >
            <CountryFlag code={country.code} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'white' : 'rgba(255,255,255,0.75)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {country.name}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.35)',
                  marginTop: 1,
                  letterSpacing: '0.5px',
                }}
              >
                {codeSystem}
              </div>
            </div>
            {isSelected && (
              <RightOutlined style={{ color: '#D4A017', fontSize: 10 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  const panel1 = (
    <div
      style={{
        width: isMobile ? '100%' : '220px',
        flexShrink: 0,
        background: '#1A3C5E',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        height: isMobile ? '100%' : undefined,
      }}
    >
      {isMobile && mobileStep === 2 && (
        <button
          type="button"
          onClick={() => setMobileStep(1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            border: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.15)',
            cursor: 'pointer',
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            width: '100%',
          }}
        >
          <ArrowLeftOutlined /> Countries
        </button>
      )}
      <div
        style={{
          padding: '12px 16px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        Industries
      </div>
      {industries.map((ind) => {
        const tradeCount = ind.categories.reduce(
          (s, c) => s + c.trades.length,
          0
        )
        const isSelected = selectedIndustry?.industry === ind.industry
        return (
          <div
            key={ind.industry}
            onClick={() => selectIndustry(ind)}
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
              transition: 'all 180ms',
              background: isSelected ? `${ind.color}CC` : 'transparent',
              borderLeft: isSelected
                ? '3px solid #D4A017'
                : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            onMouseEnter={(e) => {
              if (!isSelected)
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ fontSize: 18 }}>{ind.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'white' : 'rgba(255,255,255,0.7)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {ind.industry}
                {ind.is_custom && ' ✨'}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.4)',
                  marginTop: 1,
                }}
              >
                {tradeCount} trades
              </div>
            </div>
            {isSelected && (
              <RightOutlined style={{ color: '#D4A017', fontSize: 10 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  const mainPanel = (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: '#FAFBFC',
        height: isMobile ? '100%' : undefined,
      }}
    >
      {!countryFilter ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 200,
            color: '#9AA3B0',
            gap: 12,
            padding: 60,
          }}
        >
          <div style={{ fontSize: 48 }}>🌍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#5A6478' }}>
            Choose a country
          </div>
        </div>
      ) : !selectedIndustry ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 200,
            color: '#9AA3B0',
            gap: 12,
            padding: 60,
          }}
        >
          <div style={{ fontSize: 48 }}>🔨</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#5A6478' }}>
            Choose an industry
          </div>
        </div>
      ) : selectedTrade ? (
        tradeDetailView
      ) : (
        tradeListView
      )}
    </div>
  )

  return (
    <>
      <div
        style={{
          height: 'calc(100vh - 220px)',
          minHeight: 480,
          display: 'flex',
          flexDirection: 'column',
          background: '#F7F9FC',
          borderRadius: 12,
          border: '1px solid #DDE3EC',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 20,
            flexShrink: 0,
            padding: '12px 16px',
            background: 'white',
            borderBottom: '1px solid #DDE3EC',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: isMobile ? 0 : 10,
            }}
          >
            <div style={{ width: 220, flexShrink: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  background: '#F0F4F8',
                  borderRadius: 8,
                  border: '1px solid #DDE3EC',
                  fontSize: 12,
                  color: '#1A3C5E',
                  fontWeight: 600,
                  minHeight: 32,
                }}
              >
                {countryFilter && (
                  <CountryFlag code={countryFilter} size={16} />
                )}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {COUNTRIES.find((c) => c.code === countryFilter)?.name || 'Country'}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: '#9AA3B0',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                  }}
                >
                  {activeCodeSystem}
                </span>
              </div>
            </div>
            <div
              style={{
                position: 'relative',
                flex: '1 1 200px',
                maxWidth: 400,
                minWidth: 0,
              }}
            >
              <Input
                placeholder={`Search ${totalTrades} trades, ${activeCodeSystem} codes...`}
                prefix={<SearchOutlined style={{ color: '#9AA3B0' }} />}
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: '100%' }}
              />
              {searchText && searchResults && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'white',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    border: '1px solid #DDE3EC',
                    zIndex: 200,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  {searchResults.length === 0 ? (
                    <div
                      style={{
                        padding: 16,
                        textAlign: 'center',
                        color: '#9AA3B0',
                        fontSize: 13,
                      }}
                    >
                      No trades found for &quot;{searchText}&quot;
                    </div>
                  ) : (
                    searchResults.map((trade) => (
                      <div
                        key={`${trade.industryName}-${trade.categoryName}-${trade.trade}-${trade.id || ''}`}
                        onClick={() => {
                          const ind = tradeBank.industries.find(
                            (i) => i.industry === trade.industryName
                          )
                          const cat = ind?.categories.find(
                            (c) => c.category === trade.categoryName
                          )
                          const t = cat?.trades.find((tr) =>
                            trade.id ? tr.id === trade.id : tr.trade === trade.trade
                          )
                          if (ind && cat && t) {
                            selectTrade(ind, cat, t)
                            setSearchText('')
                          }
                        }}
                        style={{
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #F0F4F8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F7F9FC'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'white'
                        }}
                      >
                        <span
                          style={{
                            background: trade.industryColor,
                            color: 'white',
                            borderRadius: 6,
                            padding: '2px 7px',
                            fontSize: 10,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {trade.industryIcon}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {trade.trade}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: '#9AA3B0',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {trade.industryName} · {getPrimaryOccupationCode(trade, countryFilter)}
                          </div>
                        </div>
                        {trade.is_custom && (
                          <Tag color="gold" style={{ margin: 0, fontSize: 10, flexShrink: 0 }}>
                            Custom
                          </Tag>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIndustryModalOpen(true)}
              style={{
                background: '#1A3C5E',
                flexShrink: 0,
              }}
            >
              Add Industry
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddModal}
              style={{
                background: '#1A3C5E',
                flexShrink: 0,
              }}
            >
              Add Trade
            </Button>
          </div>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {industries.map((ind) => (
                <div
                  key={ind.industry}
                  onClick={() => {
                    setSearchText('')
                    selectIndustry(ind)
                  }}
                  style={{
                    padding: '3px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 180ms',
                    background:
                      selectedIndustry?.industry === ind.industry
                        ? ind.color
                        : '#F0F4F8',
                    color:
                      selectedIndustry?.industry === ind.industry
                        ? 'white'
                        : '#5A6478',
                    border:
                      selectedIndustry?.industry === ind.industry
                        ? 'none'
                        : '1px solid #DDE3EC',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ind.icon} {ind.industry.split(' ')[0]}
                  {ind.is_custom && ' ✨'}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
            borderRadius: '0 0 12px 12px',
          }}
        >
          {isMobile ? (
            <>
              {mobileStep === 1 && panelCountries}
              {mobileStep === 2 && panel1}
              {mobileStep === 3 && mainPanel}
            </>
          ) : (
            <>
              {panelCountries}
              {panel1}
              {mainPanel}
            </>
          )}
        </div>
      </div>

      <AddIndustryModal
        open={industryModalOpen}
        onClose={() => setIndustryModalOpen(false)}
        onSave={handleSaveIndustry}
      />
      <AddTradeModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingTrade(null)
        }}
        onSave={handleSaveTrade}
        industries={tradeBank.industries}
        editingTrade={editingTrade}
        defaultIndustry={selectedIndustry}
      />
    </>
  )
}
