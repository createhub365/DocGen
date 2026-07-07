import { useEffect, useState, useCallback, memo, useMemo } from 'react'
import {
  Row,
  Col,
  Input,
  Select,
  Typography,
  Form,
} from 'antd'
import { PlusOutlined, CheckCircleFilled } from '@ant-design/icons'
import { getEmployers, getTradeBank, createEmployer } from '../../api/client'
import { useDocStore } from '../../store/useDocStore'
import { useAppMessage } from '../../hooks/useAppMessage'
import EmployerForm, { buildEmployerFormData } from '../EmployerForm'
import LogoPreview from '../LogoPreview'
import { EmployerCardSkeleton } from '../ui/Skeleton'
import {
  getPrimaryOccupationCode,
} from '../../data/occupationCodes'
import { getCountryByName } from '../../data/countries'

function employerMatchesCountry(employerCountry, selectedCountry) {
  if (!selectedCountry || !employerCountry) return true
  const selected = getCountryByName(selectedCountry)?.name || selectedCountry
  const employer = getCountryByName(employerCountry)?.name || employerCountry
  if (selected.toLowerCase() === employer.toLowerCase()) return true
  if (selectedCountry === 'United Arab Emirates' && employerCountry === 'UAE') return true
  if (selectedCountry === 'UAE' && employerCountry === 'United Arab Emirates') return true
  return false
}

const { Text } = Typography
const { Search } = Input

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

const EmployerCard = memo(function EmployerCard({ emp, selected, onSelect }) {
  return (
    <div
      className={`doc-type-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(emp)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(emp)}
      style={{ position: 'relative', padding: 16 }}
    >
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--accent)',
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: emp.logo_url ? 'white' : 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            fontSize: 14,
            fontWeight: 700,
            color: 'white',
          }}
        >
          {emp.logo_url ? (
            <LogoPreview src={emp.logo_url} maxWidth={40} maxHeight={40} />
          ) : (
            getInitials(emp.company_name)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            {emp.company_name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {[emp.company_city, emp.country].filter(Boolean).join(', ')}
          </div>
        </div>
        {selected && <CheckCircleFilled style={{ color: 'var(--accent)', fontSize: 18 }} />}
      </div>
    </div>
  )
})

function EmployerDrawer({ open, form, formKey, onClose, onSave }) {
  if (!open) return null
  return (
    <>
      <div className="docflow-drawer-overlay" onClick={onClose} role="presentation" />
      <div className="docflow-drawer-panel">
        <div className="docflow-drawer-header flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-lg font-bold m-0" style={{ color: 'var(--primary)' }}>Add New Employer</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div className="docflow-drawer-body flex-1 overflow-y-auto px-6 py-4 docflow-input">
          <EmployerForm key={formKey} form={form} />
        </div>
        <div className="docflow-drawer-footer flex gap-3 justify-end px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" className="docflow-drawer-btn docflow-drawer-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="docflow-drawer-btn docflow-drawer-btn--primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </>
  )
}

export default function StepEmployerTrade({ onContinue, onBack, onRegisterNav }) {
  const {
    employer,
    setEmployer,
    selectedTrade,
    setSelectedTrade,
    tradeDetails,
    templateMeta,
  } = useDocStore()
  const [employers, setEmployers] = useState([])
  const [loadingEmployers, setLoadingEmployers] = useState(true)
  const [trades, setTrades] = useState([])
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [dutiesOpen, setDutiesOpen] = useState(false)
  const [form] = Form.useForm()
  const message = useAppMessage()

  const loadEmployers = async (search = '') => {
    setLoadingEmployers(true)
    try {
      const data = await getEmployers(search)
      setEmployers(data)
    } catch {
      message.error('Failed to load employers')
    } finally {
      setLoadingEmployers(false)
    }
  }

  useEffect(() => {
    loadEmployers()
  }, [])

  const visibleEmployers = useMemo(() => {
    if (!templateMeta?.country) return employers
    return employers.filter((emp) => employerMatchesCountry(emp.country, templateMeta.country))
  }, [employers, templateMeta?.country])

  useEffect(() => {
    if (!templateMeta?.country) {
      setTrades([])
      return
    }
    setLoadingTrades(true)
    getTradeBank({ country: templateMeta.country })
      .then((data) => setTrades(data.trades || []))
      .catch(() => setTrades([]))
      .finally(() => setLoadingTrades(false))
  }, [templateMeta?.country])

  useEffect(() => {
    if (!selectedTrade || !templateMeta?.country) return
    let cancelled = false
    const trade = trades.find((t) => t.trade_name === selectedTrade)
    getTradeBank({
      country: templateMeta.country,
      trade: selectedTrade,
      ...(trade?.category ? { category: trade.category } : {}),
    })
      .then((data) => {
        if (cancelled) return
        if (data.found) {
          useDocStore.setState({
            tradeDetails: data,
            tradeCategory: data.trade_category || trade?.category || null,
          })
        } else {
          setSelectedTrade(selectedTrade, null)
        }
      })
      .catch(() => {
        if (!cancelled) setSelectedTrade(selectedTrade, null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTrade, templateMeta?.country, trades, setSelectedTrade])

  const handleSaveEmployer = async () => {
    try {
      const values = await form.validateFields()
      const logoFile = form.getFieldValue('_logo_file')
      const payload = buildEmployerFormData({ ...values, _logo_file: logoFile })
      const created = await createEmployer(payload)
      message.success('Employer added')
      setDrawerOpen(false)
      await loadEmployers()
      setEmployer(created)
    } catch {
      /* validation */
    }
  }

  const handleContinue = useCallback(() => {
    if (!employer) {
      message.error('Select an employer')
      return
    }
    if (!selectedTrade) {
      message.error('Select a trade')
      return
    }
    onContinue()
  }, [employer, selectedTrade, message, onContinue])

  useEffect(() => {
    onRegisterNav?.({
      hidden: false,
      onBack,
      onNext: handleContinue,
      nextLabel: 'Continue',
      nextDisabled: !employer || !selectedTrade,
    })
  }, [onBack, handleContinue, onRegisterNav, employer, selectedTrade])

  const handleTradeSelect = (tradeName) => {
    const trade = trades.find((t) => t.trade_name === tradeName)
    useDocStore.setState({
      selectedTrade: tradeName,
      tradeDetails: null,
      tradeCategory: trade?.category ?? null,
    })
    setDutiesOpen(false)
  }

  return (
    <div className="employer-trade-layout flex flex-col lg:flex-row gap-6" style={{ minHeight: 400 }}>
      {/* Left: Employers 55% */}
      <div style={{ flex: '1 1 55%', minWidth: 0 }}>
        <Text strong style={{ display: 'block', marginBottom: 12, color: 'var(--primary)' }}>
          Select Employer
        </Text>
        <div className="flex gap-2 mb-4">
          <Search
            placeholder="Search employers..."
            onSearch={loadEmployers}
            allowClear
            onChange={(e) => { if (!e.target.value) loadEmployers('') }}
            style={{ flex: 1 }}
          />
        </div>

        {loadingEmployers ? (
          <Row gutter={[12, 12]}>
            {[1, 2].map((i) => (
              <Col xs={24} sm={12} key={i}><EmployerCardSkeleton /></Col>
            ))}
          </Row>
        ) : (
          <Row gutter={[12, 12]}>
            {visibleEmployers.map((emp) => (
              <Col xs={24} sm={12} key={emp.id}>
                <EmployerCard
                  emp={emp}
                  selected={employer?.id === emp.id}
                  onSelect={setEmployer}
                />
              </Col>
            ))}
            <Col xs={24} sm={12}>
              <div
                className="doc-type-card"
                onClick={() => { form.resetFields(); setFormKey((k) => k + 1); setDrawerOpen(true) }}
                role="button"
                tabIndex={0}
                style={{
                  border: '2px dashed var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 80,
                  padding: 16,
                }}
              >
                <PlusOutlined style={{ fontSize: 24, color: 'var(--primary)', marginBottom: 4 }} />
                <Text style={{ color: 'var(--primary)', fontWeight: 600 }}>Add New</Text>
              </div>
            </Col>
          </Row>
        )}
      </div>

      {/* Right: Trade 45% */}
      <div
        className="employer-trade-panel docflow-input"
        style={{
          flex: '1 1 45%',
          minWidth: 0,
          borderLeft: '1px solid var(--border)',
          paddingLeft: 24,
        }}
      >
        <Text strong style={{ display: 'block', marginBottom: 12, color: 'var(--primary)' }}>
          Select Trade
        </Text>

        {employer && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
            For: {employer.company_name}
          </Text>
        )}

        <Text className="docflow-form-label">Trade</Text>
        <Select
          showSearch
          loading={loadingTrades}
          style={{ width: '100%', marginTop: 6 }}
          placeholder="Search trade e.g. Plumber, Carpenter"
          value={selectedTrade}
          disabled={!employer}
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          options={trades.map((t) => {
            const code = getPrimaryOccupationCode(t)
            return {
              value: t.trade_name,
              label: `${t.trade_name}${code ? ` (${code})` : ''}`,
            }
          })}
          onChange={handleTradeSelect}
        />

        {selectedTrade && tradeDetails?.duties?.length > 0 && (
          <div className="mt-4 animate-fade-in-up">
            <button
              type="button"
              onClick={() => setDutiesOpen((o) => !o)}
              style={{
                background: 'var(--surface-3)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--primary)',
              }}
            >
              Trade duties ({tradeDetails.duty_count || tradeDetails.duties.length})
              <span style={{ float: 'right' }}>{dutiesOpen ? '▲' : '▼'}</span>
            </button>
            <div
              style={{
                maxHeight: dutiesOpen ? 400 : 0,
                opacity: dutiesOpen ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 300ms ease, opacity 300ms ease',
              }}
            >
              <ul style={{ paddingLeft: 20, margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {tradeDetails.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <EmployerDrawer
        open={drawerOpen}
        form={form}
        formKey={formKey}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveEmployer}
      />
    </div>
  )
}
