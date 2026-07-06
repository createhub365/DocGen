import os

countries_raw = [
    ("AF", "Afghanistan", "+93", "AFN", "Asia"),
    ("AU", "Australia", "+61", "AUD", "Asia Pacific"),
    ("BD", "Bangladesh", "+880", "BDT", "Asia"),
    ("BT", "Bhutan", "+975", "BTN", "Asia"),
    ("BN", "Brunei", "+673", "BND", "Asia"),
    ("KH", "Cambodia", "+855", "KHR", "Asia"),
    ("CN", "China", "+86", "CNY", "Asia"),
    ("FJ", "Fiji", "+679", "FJD", "Pacific"),
    ("IN", "India", "+91", "INR", "Asia"),
    ("ID", "Indonesia", "+62", "IDR", "Asia"),
    ("JP", "Japan", "+81", "JPY", "Asia"),
    ("KZ", "Kazakhstan", "+7", "KZT", "Asia"),
    ("KG", "Kyrgyzstan", "+996", "KGS", "Asia"),
    ("LA", "Laos", "+856", "LAK", "Asia"),
    ("MY", "Malaysia", "+60", "MYR", "Asia"),
    ("MV", "Maldives", "+960", "MVR", "Asia"),
    ("MN", "Mongolia", "+976", "MNT", "Asia"),
    ("MM", "Myanmar", "+95", "MMK", "Asia"),
    ("NP", "Nepal", "+977", "NPR", "Asia"),
    ("NZ", "New Zealand", "+64", "NZD", "Pacific"),
    ("PK", "Pakistan", "+92", "PKR", "Asia"),
    ("PG", "Papua New Guinea", "+675", "PGK", "Pacific"),
    ("PH", "Philippines", "+63", "PHP", "Asia"),
    ("SG", "Singapore", "+65", "SGD", "Asia"),
    ("LK", "Sri Lanka", "+94", "LKR", "Asia"),
    ("TW", "Taiwan", "+886", "TWD", "Asia"),
    ("TJ", "Tajikistan", "+992", "TJS", "Asia"),
    ("TH", "Thailand", "+66", "THB", "Asia"),
    ("TL", "Timor-Leste", "+670", "USD", "Asia"),
    ("TM", "Turkmenistan", "+993", "TMT", "Asia"),
    ("UZ", "Uzbekistan", "+998", "UZS", "Asia"),
    ("VN", "Vietnam", "+84", "VND", "Asia"),
    ("KR", "South Korea", "+82", "KRW", "Asia"),
    ("KP", "North Korea", "+850", "KPW", "Asia"),
    ("AM", "Armenia", "+374", "AMD", "Asia"),
    ("AZ", "Azerbaijan", "+994", "AZN", "Asia"),
    ("GE", "Georgia", "+995", "GEL", "Asia"),
    ("HK", "Hong Kong", "+852", "HKD", "Asia"),
    ("MO", "Macau", "+853", "MOP", "Asia"),
    ("BH", "Bahrain", "+973", "BHD", "Middle East"),
    ("IR", "Iran", "+98", "IRR", "Middle East"),
    ("IQ", "Iraq", "+964", "IQD", "Middle East"),
    ("IL", "Israel", "+972", "ILS", "Middle East"),
    ("JO", "Jordan", "+962", "JOD", "Middle East"),
    ("KW", "Kuwait", "+965", "KWD", "Middle East"),
    ("LB", "Lebanon", "+961", "LBP", "Middle East"),
    ("OM", "Oman", "+968", "OMR", "Middle East"),
    ("PS", "Palestine", "+970", "ILS", "Middle East"),
    ("QA", "Qatar", "+974", "QAR", "Middle East"),
    ("SA", "Saudi Arabia", "+966", "SAR", "Middle East"),
    ("SY", "Syria", "+963", "SYP", "Middle East"),
    ("TR", "Turkey", "+90", "TRY", "Middle East"),
    ("AE", "United Arab Emirates", "+971", "AED", "Middle East"),
    ("YE", "Yemen", "+967", "YER", "Middle East"),
    ("AL", "Albania", "+355", "ALL", "Europe"),
    ("AD", "Andorra", "+376", "EUR", "Europe"),
    ("AT", "Austria", "+43", "EUR", "Europe"),
    ("BY", "Belarus", "+375", "BYN", "Europe"),
    ("BE", "Belgium", "+32", "EUR", "Europe"),
    ("BA", "Bosnia & Herzegovina", "+387", "BAM", "Europe"),
    ("BG", "Bulgaria", "+359", "BGN", "Europe"),
    ("HR", "Croatia", "+385", "EUR", "Europe"),
    ("CY", "Cyprus", "+357", "EUR", "Europe"),
    ("CZ", "Czech Republic", "+420", "CZK", "Europe"),
    ("DK", "Denmark", "+45", "DKK", "Europe"),
    ("EE", "Estonia", "+372", "EUR", "Europe"),
    ("FI", "Finland", "+358", "EUR", "Europe"),
    ("FR", "France", "+33", "EUR", "Europe"),
    ("DE", "Germany", "+49", "EUR", "Europe"),
    ("GR", "Greece", "+30", "EUR", "Europe"),
    ("HU", "Hungary", "+36", "HUF", "Europe"),
    ("IS", "Iceland", "+354", "ISK", "Europe"),
    ("IE", "Ireland", "+353", "EUR", "Europe"),
    ("IT", "Italy", "+39", "EUR", "Europe"),
    ("XK", "Kosovo", "+383", "EUR", "Europe"),
    ("LV", "Latvia", "+371", "EUR", "Europe"),
    ("LI", "Liechtenstein", "+423", "CHF", "Europe"),
    ("LT", "Lithuania", "+370", "EUR", "Europe"),
    ("LU", "Luxembourg", "+352", "EUR", "Europe"),
    ("MT", "Malta", "+356", "EUR", "Europe"),
    ("MD", "Moldova", "+373", "MDL", "Europe"),
    ("MC", "Monaco", "+377", "EUR", "Europe"),
    ("ME", "Montenegro", "+382", "EUR", "Europe"),
    ("NL", "Netherlands", "+31", "EUR", "Europe"),
    ("MK", "North Macedonia", "+389", "MKD", "Europe"),
    ("NO", "Norway", "+47", "NOK", "Europe"),
    ("PL", "Poland", "+48", "PLN", "Europe"),
    ("PT", "Portugal", "+351", "EUR", "Europe"),
    ("RO", "Romania", "+40", "RON", "Europe"),
    ("RU", "Russia", "+7", "RUB", "Europe"),
    ("SM", "San Marino", "+378", "EUR", "Europe"),
    ("RS", "Serbia", "+381", "RSD", "Europe"),
    ("SK", "Slovakia", "+421", "EUR", "Europe"),
    ("SI", "Slovenia", "+386", "EUR", "Europe"),
    ("ES", "Spain", "+34", "EUR", "Europe"),
    ("SE", "Sweden", "+46", "SEK", "Europe"),
    ("CH", "Switzerland", "+41", "CHF", "Europe"),
    ("UA", "Ukraine", "+380", "UAH", "Europe"),
    ("GB", "United Kingdom", "+44", "GBP", "Europe"),
    ("VA", "Vatican City", "+379", "EUR", "Europe"),
    ("DZ", "Algeria", "+213", "DZD", "Africa"),
    ("AO", "Angola", "+244", "AOA", "Africa"),
    ("BJ", "Benin", "+229", "XOF", "Africa"),
    ("BW", "Botswana", "+267", "BWP", "Africa"),
    ("BF", "Burkina Faso", "+226", "XOF", "Africa"),
    ("BI", "Burundi", "+257", "BIF", "Africa"),
    ("CV", "Cape Verde", "+238", "CVE", "Africa"),
    ("CM", "Cameroon", "+237", "XAF", "Africa"),
    ("CF", "Central African Republic", "+236", "XAF", "Africa"),
    ("TD", "Chad", "+235", "XAF", "Africa"),
    ("KM", "Comoros", "+269", "KMF", "Africa"),
    ("CG", "Congo", "+242", "XAF", "Africa"),
    ("CD", "DR Congo", "+243", "CDF", "Africa"),
    ("DJ", "Djibouti", "+253", "DJF", "Africa"),
    ("EG", "Egypt", "+20", "EGP", "Africa"),
    ("GQ", "Equatorial Guinea", "+240", "XAF", "Africa"),
    ("ER", "Eritrea", "+291", "ERN", "Africa"),
    ("SZ", "Eswatini", "+268", "SZL", "Africa"),
    ("ET", "Ethiopia", "+251", "ETB", "Africa"),
    ("GA", "Gabon", "+241", "XAF", "Africa"),
    ("GM", "Gambia", "+220", "GMD", "Africa"),
    ("GH", "Ghana", "+233", "GHS", "Africa"),
    ("GN", "Guinea", "+224", "GNF", "Africa"),
    ("GW", "Guinea-Bissau", "+245", "XOF", "Africa"),
    ("CI", "Ivory Coast", "+225", "XOF", "Africa"),
    ("KE", "Kenya", "+254", "KES", "Africa"),
    ("LS", "Lesotho", "+266", "LSL", "Africa"),
    ("LR", "Liberia", "+231", "LRD", "Africa"),
    ("LY", "Libya", "+218", "LYD", "Africa"),
    ("MG", "Madagascar", "+261", "MGA", "Africa"),
    ("MW", "Malawi", "+265", "MWK", "Africa"),
    ("ML", "Mali", "+223", "XOF", "Africa"),
    ("MR", "Mauritania", "+222", "MRU", "Africa"),
    ("MU", "Mauritius", "+230", "MUR", "Africa"),
    ("MA", "Morocco", "+212", "MAD", "Africa"),
    ("MZ", "Mozambique", "+258", "MZN", "Africa"),
    ("NA", "Namibia", "+264", "NAD", "Africa"),
    ("NE", "Niger", "+227", "XOF", "Africa"),
    ("NG", "Nigeria", "+234", "NGN", "Africa"),
    ("RW", "Rwanda", "+250", "RWF", "Africa"),
    ("ST", "São Tomé & Príncipe", "+239", "STN", "Africa"),
    ("SN", "Senegal", "+221", "XOF", "Africa"),
    ("SC", "Seychelles", "+248", "SCR", "Africa"),
    ("SL", "Sierra Leone", "+232", "SLL", "Africa"),
    ("SO", "Somalia", "+252", "SOS", "Africa"),
    ("ZA", "South Africa", "+27", "ZAR", "Africa"),
    ("SS", "South Sudan", "+211", "SSP", "Africa"),
    ("SD", "Sudan", "+249", "SDG", "Africa"),
    ("TZ", "Tanzania", "+255", "TZS", "Africa"),
    ("TG", "Togo", "+228", "XOF", "Africa"),
    ("TN", "Tunisia", "+216", "TND", "Africa"),
    ("UG", "Uganda", "+256", "UGX", "Africa"),
    ("ZM", "Zambia", "+260", "ZMW", "Africa"),
    ("ZW", "Zimbabwe", "+263", "ZWL", "Africa"),
    ("AG", "Antigua & Barbuda", "+1", "XCD", "Americas"),
    ("BS", "Bahamas", "+1", "BSD", "Americas"),
    ("BB", "Barbados", "+1", "BBD", "Americas"),
    ("BZ", "Belize", "+501", "BZD", "Americas"),
    ("CA", "Canada", "+1", "CAD", "Americas"),
    ("CR", "Costa Rica", "+506", "CRC", "Americas"),
    ("CU", "Cuba", "+53", "CUP", "Americas"),
    ("DM", "Dominica", "+1", "XCD", "Americas"),
    ("DO", "Dominican Republic", "+1", "DOP", "Americas"),
    ("SV", "El Salvador", "+503", "USD", "Americas"),
    ("GD", "Grenada", "+1", "XCD", "Americas"),
    ("GT", "Guatemala", "+502", "GTQ", "Americas"),
    ("HT", "Haiti", "+509", "HTG", "Americas"),
    ("HN", "Honduras", "+504", "HNL", "Americas"),
    ("JM", "Jamaica", "+1", "JMD", "Americas"),
    ("MX", "Mexico", "+52", "MXN", "Americas"),
    ("NI", "Nicaragua", "+505", "NIO", "Americas"),
    ("PA", "Panama", "+507", "PAB", "Americas"),
    ("KN", "Saint Kitts & Nevis", "+1", "XCD", "Americas"),
    ("LC", "Saint Lucia", "+1", "XCD", "Americas"),
    ("VC", "Saint Vincent", "+1", "XCD", "Americas"),
    ("TT", "Trinidad & Tobago", "+1", "TTD", "Americas"),
    ("US", "United States", "+1", "USD", "Americas"),
    ("AR", "Argentina", "+54", "ARS", "Americas"),
    ("BO", "Bolivia", "+591", "BOB", "Americas"),
    ("BR", "Brazil", "+55", "BRL", "Americas"),
    ("CL", "Chile", "+56", "CLP", "Americas"),
    ("CO", "Colombia", "+57", "COP", "Americas"),
    ("EC", "Ecuador", "+593", "USD", "Americas"),
    ("GY", "Guyana", "+592", "GYD", "Americas"),
    ("PY", "Paraguay", "+595", "PYG", "Americas"),
    ("PE", "Peru", "+51", "PEN", "Americas"),
    ("SR", "Suriname", "+597", "SRD", "Americas"),
    ("UY", "Uruguay", "+598", "UYU", "Americas"),
    ("VE", "Venezuela", "+58", "VES", "Americas"),
]


def flag(code: str) -> str:
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code)


def main():
    lines = []
    for code, name, phone, currency, region in countries_raw:
        f = flag(code)
        lines.append(
            f'  {{ code: "{code}", name: "{name}", flag: "{f}", '
            f'phone: "{phone}", currency: "{currency}", region: "{region}" }},'
        )

    header = "// World countries with flag emojis — used across employer forms, wizard, and trade bank.\n\nconst COUNTRIES = [\n"
    footer = """
]

// ── HELPER FUNCTIONS ──────────────────────

export const getCountryByCode = (code) =>
  COUNTRIES.find((c) => c.code === code)

const COUNTRY_ALIASES = {
  UAE: 'AE',
  UK: 'GB',
}

export const getCountryByName = (name) => {
  if (!name) return undefined
  const alias = COUNTRY_ALIASES[name]
  if (alias) return getCountryByCode(alias)
  return COUNTRIES.find(
    (c) => c.name === name || c.name.toLowerCase() === name.toLowerCase()
  )
}

export const getCountryCode = (nameOrCode) => {
  if (!nameOrCode) return undefined
  if (nameOrCode.length === 2) {
    const byCode = getCountryByCode(nameOrCode.toUpperCase())
    if (byCode) return byCode.code
  }
  return getCountryByName(nameOrCode)?.code
}

export const getCountryFlag = (nameOrCode) => {
  const c = getCountryByCode(nameOrCode) || getCountryByName(nameOrCode)
  return c?.flag || '🌐'
}

export const getCountriesByRegion = (region) =>
  COUNTRIES.filter((c) => c.region === region)

export const getRegions = () =>
  [...new Set(COUNTRIES.map((c) => c.region))]

export const searchCountries = (query) => {
  const q = query.toLowerCase()
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.phone.includes(q)
  )
}

export const countryToOption = (country) => ({
  value: country.code,
  label: `${country.flag} ${country.name}`,
  country,
})

export const COUNTRY_OPTIONS = COUNTRIES.map(countryToOption)

export const COUNTRY_OPTIONS_GROUPED = getRegions().map((region) => ({
  label: region,
  options: COUNTRIES.filter((c) => c.region === region).map(countryToOption),
}))

export const PRIORITY_COUNTRIES = [
  'NZ', 'AU', 'GB', 'CA', 'AE',
  'JO', 'SA', 'QA', 'KW', 'IN',
  'PH', 'LK', 'NP', 'BD',
]

export const PRIORITY_COUNTRY_OPTIONS = [
  {
    label: '⭐ Frequently Used',
    options: PRIORITY_COUNTRIES.map((code) => COUNTRIES.find((c) => c.code === code))
      .filter(Boolean)
      .map(countryToOption),
  },
  {
    label: '── All Countries ──',
    options: COUNTRIES.filter((c) => !PRIORITY_COUNTRIES.includes(c.code)).map(
      countryToOption
    ),
  },
]

export const getRegField = (countryCode) => {
  const fields = {
    NZ: { label: 'NZBN', placeholder: '9429041234567 (13 digits)', maxLength: 13, regLabel: 'NZBN' },
    AU: { label: 'ABN', placeholder: 'XX XXX XXX XXX (11 digits)', maxLength: 14, regLabel: 'ABN' },
    GB: { label: 'Companies House No.', placeholder: 'XXXXXXXX (8 digits)', maxLength: 8, regLabel: 'CRN' },
    CA: { label: 'CRA Business No.', placeholder: 'XXXXXXXXX (9 digits)', maxLength: 9, regLabel: 'BN' },
    AE: { label: 'TRN', placeholder: '100XXXXXXXXXX (15 digits)', maxLength: 15, regLabel: 'TRN' },
    SA: { label: 'Commercial Registration No.', placeholder: '10-digit CR number', maxLength: 10, regLabel: 'CR' },
    QA: { label: 'Commercial Registration No.', placeholder: 'QA CR number', maxLength: 15, regLabel: 'CR' },
    KW: { label: 'Commercial Registration No.', placeholder: 'Kuwait CR number', maxLength: 15, regLabel: 'CR' },
    JO: { label: 'Company Registration No.', placeholder: 'Jordan company number', maxLength: 15, regLabel: 'CR' },
    IN: { label: 'CIN / GSTIN', placeholder: '21-char CIN or 15-char GSTIN', maxLength: 21, regLabel: 'CIN' },
    US: { label: 'EIN (Tax ID)', placeholder: 'XX-XXXXXXX', maxLength: 10, regLabel: 'EIN' },
  }
  return (
    fields[countryCode] || {
      label: 'Registration Number',
      placeholder: 'Company registration number',
      maxLength: 50,
      regLabel: 'Registration No.',
    }
  )
}

export const IMMIGRATION_COUNTRY_CODES = new Set(['NZ', 'AU', 'AE', 'JO'])

export default COUNTRIES
"""

    out = header + "\n".join(lines) + footer
    path = os.path.join(os.path.dirname(__file__), "..", "src", "data", "countries.js")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"Wrote {len(countries_raw)} countries to {path}")


if __name__ == "__main__":
    main()
