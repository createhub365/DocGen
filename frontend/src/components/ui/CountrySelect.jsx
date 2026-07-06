import { Select } from 'antd'
import {
  PRIORITY_COUNTRY_OPTIONS,
  COUNTRY_OPTIONS,
  getCountryByCode,
} from '../../data/countries'
import CountryFlag from './CountryFlag'

function enrichOptions(options) {
  return options.map((opt) => {
    if (opt.options) {
      return { ...opt, options: enrichOptions(opt.options) }
    }
    const country = opt.country || getCountryByCode(opt.value)
    return { ...opt, country }
  })
}

function CountryOptionRow({ country, showPhone }) {
  if (!country) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '2px 0',
      }}
    >
      <CountryFlag code={country.code} size={22} />
      <div>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#1A1A2E',
          }}
        >
          {country.name}
        </div>
        {showPhone && (
          <div
            style={{
              fontSize: '11px',
              color: '#9AA3B0',
              fontFamily: 'monospace',
            }}
          >
            {country.phone}
          </div>
        )}
      </div>
    </div>
  )
}

const CountrySelect = ({
  value,
  onChange,
  placeholder = 'Select country...',
  size = 'large',
  showPhone = false,
  grouped = true,
  style = {},
  disabled = false,
  mode,
  options: optionsProp,
  allowClear = false,
}) => {
  const baseOptions = optionsProp
    ? enrichOptions(optionsProp)
    : grouped
      ? enrichOptions(PRIORITY_COUNTRY_OPTIONS)
      : enrichOptions(COUNTRY_OPTIONS)

  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      placeholder={placeholder}
      size={size}
      disabled={disabled}
      mode={mode}
      allowClear={allowClear}
      showSearch
      filterOption={(input, option) => {
        if (!input) return true
        const label = option?.label?.toString()?.toLowerCase() || ''
        const val = option?.value?.toString()?.toLowerCase() || ''
        const phone = option?.country?.phone?.toLowerCase() || ''
        const q = input.toLowerCase()
        return label.includes(q) || val.includes(q) || phone.includes(q)
      }}
      style={{ width: '100%', ...style }}
      optionFilterProp="label"
      options={baseOptions}
      optionRender={(option) => (
        <CountryOptionRow
          country={option.data?.country}
          showPhone={showPhone}
        />
      )}
      labelRender={(option) => {
        const country = getCountryByCode(option.value)
        if (!country) return <span>{option.label}</span>
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CountryFlag code={country.code} size={18} />
            {country.name}
          </span>
        )
      }}
      tagRender={({ label, value, closable, onClose }) => {
        const country = getCountryByCode(value)
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              margin: '2px 4px 2px 0',
              padding: '0 6px',
              background: '#f0f0f0',
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {country && <CountryFlag code={country.code} size={14} />}
            {country?.name || label}
            {closable && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: '0 0 0 4px',
                  lineHeight: 1,
                }}
                aria-label="Remove"
              >
                ×
              </button>
            )}
          </span>
        )
      }}
    />
  )
}

export default CountrySelect
