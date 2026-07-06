import { getOccupationSystem } from './countries'

export const CODE_SYSTEMS = {
  NZ: { system: 'ANZSCO', label: 'ANZSCO Code', example: '331212' },
  AU: { system: 'ANZSCO', label: 'ANZSCO Code', example: '331212' },
  GB: { system: 'SOC_UK', label: 'SOC 2020 Code', example: '5315' },
  CA: { system: 'NOC', label: 'NOC 2021 Code', example: '72310' },
  US: { system: 'SOC', label: 'SOC Code', example: '47-2031' },
  AE: { system: 'UAE_MOL', label: 'UAE MOL Code', example: 'CJ-001' },
  SA: { system: 'KSA_MOL', label: 'KSA MOL Code', example: 'CON-001' },
  QA: { system: 'QATAR_MOI', label: 'Qatar MOI Code', example: '7115' },
  KW: { system: 'KUWAIT_MOI', label: 'Kuwait MOI Code', example: '7115' },
  OM: { system: 'OMAN_MOL', label: 'Oman MOL Code', example: '7115' },
  BH: { system: 'BAHRAIN_LMRA', label: 'Bahrain LMRA Code', example: '7115' },
  SG: { system: 'SSOC', label: 'SSOC 2020 Code', example: '7115' },
  JO: { system: 'ISCO', label: 'ISCO-08 Code', example: '7115' },
  IN: { system: 'NCO', label: 'NCO 2015 Code', example: '7115.0101' },
}

const SYSTEM_LABELS = {
  ANZSCO: { label: 'ANZSCO Code', example: '331212' },
  SOC_UK: { label: 'SOC 2020 Code', example: '5315' },
  NOC: { label: 'NOC 2021 Code', example: '72310' },
  SOC: { label: 'SOC Code', example: '47-2031' },
  UAE_MOL: { label: 'UAE MOL Code', example: 'CJ-001' },
  KSA_MOL: { label: 'KSA MOL Code', example: 'CON-001' },
  QATAR_MOI: { label: 'Qatar MOI Code', example: '7115' },
  KUWAIT_MOI: { label: 'Kuwait MOI Code', example: '7115' },
  OMAN_MOL: { label: 'Oman MOL Code', example: '7115' },
  BAHRAIN_LMRA: { label: 'Bahrain LMRA Code', example: '7115' },
  SSOC: { label: 'SSOC 2020 Code', example: '7115' },
  NCO: { label: 'NCO 2015 Code', example: '7115.0101' },
  ISCO: { label: 'ISCO-08 Code', example: '7115' },
}

export const DEFAULT_CODE = {
  system: 'ISCO',
  label: 'ISCO-08 Code',
  example: '7115',
}

export const COUNTRY_TO_SYSTEM = Object.fromEntries(
  Object.entries(CODE_SYSTEMS).map(([code, cfg]) => [code, cfg.system])
)

export function getCodeSystemForCountry(countryCode) {
  const system = getOccupationSystem(countryCode)
  const meta = SYSTEM_LABELS[system] || SYSTEM_LABELS.ISCO
  return { system, ...meta }
}

export function getRequiredCodeSystems(selectedCountries = []) {
  const systems = new Map()
  selectedCountries.forEach((code) => {
    const sys = getCodeSystemForCountry(code)
    systems.set(sys.system, sys)
  })
  return Array.from(systems.values())
}

/** Merge occupation_codes with legacy anzsco fields. */
export function getOccupationCodesFromTrade(trade) {
  if (!trade) return {}
  const codes = { ...(trade.occupation_codes || {}) }
  if (!codes.ANZSCO && trade.anzsco_code) {
    codes.ANZSCO = {
      code: trade.anzsco_code,
      title: trade.anzsco_title || trade.trade || trade.trade_name || '',
    }
  }
  return codes
}

export function getPrimaryOccupationCode(trade, countryCode = 'NZ') {
  const system = getOccupationSystem(countryCode)
  const codes = getOccupationCodesFromTrade(trade)
  const info = codes[system] || codes.ANZSCO || Object.values(codes)[0]
  return info?.code || trade?.anzsco_code || ''
}
