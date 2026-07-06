import { useState, useEffect, useCallback } from 'react'
import { getEmployerCountryConfig } from '../api/client'
import { getCountryByName, getRegField } from '../data/countries'

let configCache = null

const COUNTRY_CONFIG_ALIASES = {
  'United Arab Emirates': 'UAE',
  UAE: 'UAE',
  UK: 'United Kingdom',
}

export function resolveCountryConfigKey(countryName) {
  if (!countryName) return ''
  return COUNTRY_CONFIG_ALIASES[countryName] || countryName
}

function fallbackConfigForCountry(countryName) {
  const meta = getCountryByName(countryName)
  if (!meta) return {}
  const reg = getRegField(meta.code)
  return {
    reg_number_label: reg.regLabel || reg.label,
    reg_number_placeholder: reg.placeholder,
    reg_number_help: 'Company registration or licence number',
    accreditation_label: 'Accreditation / Licence No.',
    accreditation_placeholder: 'Enter accreditation number',
    has_state: true,
    state_label: 'State / Province / Region',
    postcode_label: 'Postal Code',
    postcode_placeholder: 'Enter postal code',
  }
}

export function useEmployerCountryConfig() {
  const [config, setConfig] = useState(configCache)
  const [loading, setLoading] = useState(!configCache)

  useEffect(() => {
    if (configCache) return
    getEmployerCountryConfig()
      .then((data) => {
        configCache = data
        setConfig(data)
      })
      .catch(() => {
        setConfig({ default: {} })
      })
      .finally(() => setLoading(false))
  }, [])

  const getConfig = useCallback(
    (countryName) => {
      if (!countryName) return {}
      if (!config) return fallbackConfigForCountry(countryName)

      const key = resolveCountryConfigKey(countryName)
      if (config[key]) return config[key]

      const defaults = config.default || {}
      const fallback = fallbackConfigForCountry(countryName)
      return { ...defaults, ...fallback }
    },
    [config]
  )

  return { config, loading, getConfig }
}
