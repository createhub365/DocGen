import { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  SearchOutlined,
  LayoutOutlined,
} from '@ant-design/icons'
import { Form, Popconfirm, Input, Select, Modal, Tag } from 'antd'
import EmployerForm, { buildEmployerFormData } from '../components/EmployerForm'
import { EmployerCardSkeleton } from '../components/ui/Skeleton'
import {
  getEmployers,
  createEmployer,
  updateEmployer,
  deleteEmployer,
} from '../api/client'
import { useAppMessage } from '../hooks/useAppMessage'
import useBreakpoint from '../hooks/useBreakpoint'
import CountryFlag from '../components/ui/CountryFlag'
import AppDrawer from '../components/ui/AppDrawer'
import LogoPreview from '../components/LogoPreview'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function EmptyEmployersIllustration() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" aria-hidden>
      <rect x="30" y="40" width="80" height="70" rx="6" fill="#F5EDED" stroke="#E8D8D8" strokeWidth="2" />
      <rect x="45" y="20" width="20" height="30" fill="#8B1A1A" opacity="0.8" />
      <rect x="75" y="20" width="20" height="30" fill="#8B1A1A" opacity="0.5" />
      <rect x="50" y="55" width="15" height="15" fill="#E8D8D8" />
      <rect x="75" y="55" width="15" height="15" fill="#E8D8D8" />
      <rect x="60" y="80" width="20" height="30" fill="#D4A017" opacity="0.7" />
      <circle cx="100" cy="30" r="16" fill="#D4A017" opacity="0.15" />
      <text x="93" y="36" fill="#D4A017" fontSize="20" fontWeight="bold">+</text>
    </svg>
  )
}

const EmployerCard = memo(function EmployerCard({ emp, onEdit, onDelete, onViewDocuments, onSelect }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = emp.logo_url && !logoFailed
  const stop = (e) => e.stopPropagation()

  return (
    <div
      className="employer-master-card"
      onClick={() => onSelect?.(emp)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.(emp)}
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
    >
      <div className="employer-card-strip" />
      <div style={{ padding: '16px 20px 20px', position: 'relative' }}>
        {/* Avatar — inline, not negatively positioned so it's never clipped */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              border: '2px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              background: showLogo ? 'white' : 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              fontSize: 17,
              fontWeight: 700,
              color: 'white',
              flexShrink: 0,
            }}
          >
            {showLogo ? (
              <LogoPreview
                src={emp.logo_url}
                alt=""
                maxWidth={52}
                maxHeight={52}
                onError={() => setLogoFailed(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
            ) : (
              getInitials(emp.company_name)
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3
              className="m-0 text-base font-bold"
              style={{ color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {emp.company_name}
            </h3>
            <p className="m-0 text-sm" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountryFlag name={emp.country} size={16} />
              {emp.country}{emp.company_city ? ` · ${emp.company_city}` : ''}
            </p>
            {emp.industry && (
              <p className="m-0 text-xs" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                {emp.industry}
              </p>
            )}
          </div>
        </div>

        {emp.reg_number_value && (
          <span
            style={{
              display: 'inline-block',
              background: 'var(--surface-3)',
              borderRadius: 'var(--radius-full)',
              padding: '3px 10px',
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 12,
            }}
          >
            {emp.reg_number_label || 'Reg No.'}: {emp.reg_number_value}
          </span>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(139,26,26,0.08)',
              color: 'var(--primary)',
              borderRadius: 'var(--radius-full)',
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <LayoutOutlined />
            {emp.template_count ?? 0} template{(emp.template_count ?? 0) === 1 ? '' : 's'}
          </span>
          {(emp.documents_issued ?? 0) > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--surface-3)',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-full)',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <FileTextOutlined />
              {emp.documents_issued} issued
            </span>
          )}
        </div>

        {emp.industries?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {emp.industries.slice(0, 3).map((ind) => (
              <Tag key={ind} style={{ margin: 0, borderRadius: 999 }}>
                {ind}
              </Tag>
            ))}
            {emp.industries.length > 3 && (
              <Tag style={{ margin: 0, borderRadius: 999 }}>+{emp.industries.length - 3}</Tag>
            )}
          </div>
        )}

        {emp.hr_contact_name && (
          <div className="flex items-center gap-2 mb-4">
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--surface-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              {getInitials(emp.hr_contact_name)}
            </div>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {emp.hr_contact_name}
            </span>
          </div>
        )}

        <div
          className="flex items-center gap-1 pt-3 employer-card-actions"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            type="button"
            title="Edit"
            onClick={(e) => { stop(e); onEdit(emp) }}
            style={actionBtnStyle}
          >
            <EditOutlined />
          </button>
          <Popconfirm title="Delete employer?" onConfirm={() => onDelete(emp.id)}>
            <button
              type="button"
              title="Delete"
              style={{ ...actionBtnStyle, color: 'var(--error)' }}
              onClick={stop}
            >
              <DeleteOutlined />
            </button>
          </Popconfirm>
          <button
            type="button"
            title="View documents"
            style={actionBtnStyle}
            onClick={(e) => { stop(e); onViewDocuments(emp) }}
          >
            <FileTextOutlined />
          </button>
        </div>
      </div>
    </div>
  )
})

function EmployerTemplatesModal({ employer, open, onClose }) {
  if (!employer) return null

  const templates = employer.templates || []

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={employer.company_name}
      width="100%"
      style={{ maxWidth: 600, top: 20 }}
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <CountryFlag name={employer.country} size={20} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {employer.country}
            {employer.company_city ? ` · ${employer.company_city}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Tag color="volcano">{employer.template_count ?? 0} templates</Tag>
          {(employer.documents_issued ?? 0) > 0 && (
            <Tag>{employer.documents_issued} documents issued</Tag>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        {employer.industry && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Main industry
            </div>
            <Tag color="blue" style={{ margin: 0 }}>{employer.industry}</Tag>
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Template industries
        </div>
        {employer.industries?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {employer.industries.map((ind) => (
              <Tag key={ind} color="processing" style={{ margin: 0 }}>
                {ind}
              </Tag>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No industry linked yet</span>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Template formats
        </div>
        {templates.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              background: 'var(--surface-3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            No templates are linked to this company yet. Upload templates in Admin with the same company name and country.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map((t) => (
              <div
                key={t.template_id}
                style={{
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>
                  {t.format_label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {t.doc_type_name || 'Document'}
                  {t.industry || t.category ? ` · ${t.industry || t.category}` : ''}
                  {t.trade_name ? ` · ${t.trade_name}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

const actionBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  fontSize: 16,
  transition: 'background 150ms, color 150ms',
}

function EmployerDrawer({ open, editing, form, formKey, onClose, onSave }) {
  return (
    <AppDrawer
      open={open}
      onClose={onClose}
      onSave={onSave}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 20, background: 'var(--primary)', borderRadius: 2 }} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {editing ? 'Edit Employer' : 'Add Employer'}
          </h2>
        </div>
      }
    >
      <EmployerForm
        key={formKey}
        form={form}
        initialValues={editing}
        logoPreviewUrl={editing?.logo_url}
      />
    </AppDrawer>
  )
}

export default function EmployersPage() {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const [employers, setEmployers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [detailEmployer, setDetailEmployer] = useState(null)
  const [form] = Form.useForm()
  const message = useAppMessage()

  const load = async (term = search) => {
    setLoading(true)
    try {
      const data = await getEmployers(term)
      setEmployers(data)
    } catch {
      message.error('Failed to load employers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setFormKey((k) => k + 1)
    setDrawerOpen(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.resetFields()
    setFormKey((k) => k + 1)
    const countryValue =
      record.country === 'UAE' ? 'United Arab Emirates' : record.country
    form.setFieldsValue({
      ...record,
      country: countryValue,
      _logo_file: null,
    })
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const logoFile = form.getFieldValue('_logo_file')
      const payload = buildEmployerFormData({ ...values, _logo_file: logoFile })
      if (editing) {
        await updateEmployer(editing.id, payload)
        message.success('Employer updated')
      } else {
        await createEmployer(payload)
        message.success('Employer created')
      }
      setDrawerOpen(false)
      form.resetFields()
      load()
    } catch (err) {
      if (err?.errorFields) return
      message.error('Failed to save employer')
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteEmployer(id)
      message.success('Employer deleted')
      load()
    } catch {
      message.error('Delete failed')
    }
  }

  const countryOptions = [...new Set(employers.map((e) => e.country).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }))

  const countryCount = countryOptions.length

  const filteredEmployers = countryFilter
    ? employers.filter((e) => e.country === countryFilter)
    : employers

  return (
    <div className="max-w-6xl mx-auto page-enter">
      {!isMobile ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in-down">
          <div className="page-header" style={{ margin: 0 }}>
            <div className="page-header-accent" />
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                Employer Master
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {countryCount > 0
                  ? `${employers.length} employers across ${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`
                  : 'Manage company profiles for all countries'}
              </p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap justify-end">
            <Select
              allowClear
              placeholder="All countries"
              value={countryFilter || undefined}
              onChange={(val) => setCountryFilter(val || '')}
              options={countryOptions}
              style={{ width: 180, borderRadius: 'var(--radius-md)' }}
              showSearch
              optionFilterProp="label"
            />
            <Input
              prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
              placeholder="Search company or country"
              allowClear
              onChange={(e) => {
                if (!e.target.value) {
                  setSearch('')
                  load('')
                }
              }}
              onPressEnter={(e) => {
                setSearch(e.target.value)
                load(e.target.value)
              }}
              style={{ width: 260, borderRadius: 'var(--radius-md)' }}
            />
            <button type="button" onClick={openCreate} className="mobile-primary-btn" style={{ width: 'auto', height: 40 }}>
              <PlusOutlined />
              Add Employer
            </button>
          </div>
        </div>
      ) : (
        <div className="mobile-page-toolbar">
          <Select
            allowClear
            placeholder="All countries"
            value={countryFilter || undefined}
            onChange={(val) => setCountryFilter(val || '')}
            options={countryOptions}
            showSearch
            optionFilterProp="label"
          />
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
            placeholder="Search company or country"
            allowClear
            onChange={(e) => {
              if (!e.target.value) {
                setSearch('')
                load('')
              }
            }}
            onPressEnter={(e) => {
              setSearch(e.target.value)
              load(e.target.value)
            }}
          />
          <button type="button" onClick={openCreate} className="mobile-primary-btn">
            <PlusOutlined />
            Add Employer
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <EmployerCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredEmployers.length === 0 ? (
        <div
          className="flex flex-col items-center py-16 animate-fade-in-up"
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}
        >
          <EmptyEmployersIllustration />
          <p className="mt-6 mb-2 text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
            {countryFilter ? `No employers in ${countryFilter}` : 'No employers yet'}
          </p>
          <button
            type="button"
            onClick={openCreate}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #8B1A1A 0%, #A52A2A 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {countryFilter ? 'Add employer' : 'Add your first employer'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 stagger-fade">
          {filteredEmployers.map((emp) => (
            <EmployerCard
              key={emp.id}
              emp={emp}
              onEdit={openEdit}
              onDelete={handleDelete}
              onViewDocuments={(e) => navigate(`/documents?employer=${e.id}`)}
              onSelect={setDetailEmployer}
            />
          ))}
        </div>
      )}

      <EmployerDrawer
        open={drawerOpen}
        editing={editing}
        form={form}
        formKey={formKey}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
      />

      <EmployerTemplatesModal
        employer={detailEmployer}
        open={!!detailEmployer}
        onClose={() => setDetailEmployer(null)}
      />
    </div>
  )
}
