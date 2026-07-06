// World countries — imported from GLOBAL_TRADE_BANK_COMPLETE.xlsx (Sheet 1 - COUNTRIES)

const COUNTRIES = [
  { code: "DZ", name: "Algeria", flag: "🇩🇿", phone: "+213", currency: "DZD", region: "Africa", subRegion: "North Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses French-influenced system" },
  { code: "AO", name: "Angola", flag: "🇦🇴", phone: "+244", currency: "AOA", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "BJ", name: "Benin", flag: "🇧🇯", phone: "+229", currency: "XOF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "BW", name: "Botswana", flag: "🇧🇼", phone: "+267", currency: "BWP", region: "Africa", subRegion: "Southern Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "BF", name: "Burkina Faso", flag: "🇧🇫", phone: "+226", currency: "XOF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "BI", name: "Burundi", flag: "🇧🇮", phone: "+257", currency: "BIF", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲", phone: "+237", currency: "XAF", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "CV", name: "Cape Verde", flag: "🇨🇻", phone: "+238", currency: "CVE", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "CF", name: "Central African Republic", flag: "🇨🇫", phone: "+236", currency: "XAF", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "TD", name: "Chad", flag: "🇹🇩", phone: "+235", currency: "XAF", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "KM", name: "Comoros", flag: "🇰🇲", phone: "+269", currency: "KMF", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "CG", name: "Congo", flag: "🇨🇬", phone: "+242", currency: "XAF", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "CD", name: "DR Congo", flag: "🇨🇩", phone: "+243", currency: "CDF", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "DJ", name: "Djibouti", flag: "🇩🇯", phone: "+253", currency: "DJF", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", phone: "+20", currency: "EGP", region: "Africa", subRegion: "North Africa", codeSystem: "ESOC", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Egyptian Standard Occupational Classification" },
  { code: "GQ", name: "Equatorial Guinea", flag: "🇬🇶", phone: "+240", currency: "XAF", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "ER", name: "Eritrea", flag: "🇪🇷", phone: "+291", currency: "ERN", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "SZ", name: "Eswatini", flag: "🇸🇿", phone: "+268", currency: "SZL", region: "Africa", subRegion: "Southern Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹", phone: "+251", currency: "ETB", region: "Africa", subRegion: "East Africa", codeSystem: "ESOC Ethiopia", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Ethiopian Standard Occupational Classification" },
  { code: "GA", name: "Gabon", flag: "🇬🇦", phone: "+241", currency: "XAF", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "GM", name: "Gambia", flag: "🇬🇲", phone: "+220", currency: "GMD", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", phone: "+233", currency: "GHS", region: "Africa", subRegion: "West Africa", codeSystem: "GSOC", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Ghana Standard Occupational Classification" },
  { code: "GN", name: "Guinea", flag: "🇬🇳", phone: "+224", currency: "GNF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "GW", name: "Guinea-Bissau", flag: "🇬🇼", phone: "+245", currency: "XOF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "CI", name: "Ivory Coast", flag: "🇨🇮", phone: "+225", currency: "XOF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", phone: "+254", currency: "KES", region: "Africa", subRegion: "East Africa", codeSystem: "KSOC", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Kenya Standard Occupational Classification" },
  { code: "LS", name: "Lesotho", flag: "🇱🇸", phone: "+266", currency: "LSL", region: "Africa", subRegion: "Southern Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "LR", name: "Liberia", flag: "🇱🇷", phone: "+231", currency: "LRD", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "LY", name: "Libya", flag: "🇱🇾", phone: "+218", currency: "LYD", region: "Africa", subRegion: "North Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "MG", name: "Madagascar", flag: "🇲🇬", phone: "+261", currency: "MGA", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "MW", name: "Malawi", flag: "🇲🇼", phone: "+265", currency: "MWK", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "ML", name: "Mali", flag: "🇲🇱", phone: "+223", currency: "XOF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "MR", name: "Mauritania", flag: "🇲🇷", phone: "+222", currency: "MRU", region: "Africa", subRegion: "North Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "MU", name: "Mauritius", flag: "🇲🇺", phone: "+230", currency: "MUR", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", phone: "+212", currency: "MAD", region: "Africa", subRegion: "North Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses French-influenced system" },
  { code: "MZ", name: "Mozambique", flag: "🇲🇿", phone: "+258", currency: "MZN", region: "Africa", subRegion: "Southern Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "NA", name: "Namibia", flag: "🇳🇦", phone: "+264", currency: "NAD", region: "Africa", subRegion: "Southern Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", phone: "+234", currency: "NGN", region: "Africa", subRegion: "West Africa", codeSystem: "NSOC", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Nigeria Standard Occupational Classification" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼", phone: "+250", currency: "RWF", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "SN", name: "Senegal", flag: "🇸🇳", phone: "+221", currency: "XOF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "SC", name: "Seychelles", flag: "🇸🇨", phone: "+248", currency: "SCR", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "SL", name: "Sierra Leone", flag: "🇸🇱", phone: "+232", currency: "SLL", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "SO", name: "Somalia", flag: "🇸🇴", phone: "+252", currency: "SOS", region: "Africa", subRegion: "East Africa", codeSystem: "None", occupationSystem: "ISCO", basedOn: "Unknown", notes: "Conflict zone — no formal system" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", phone: "+27", currency: "ZAR", region: "Africa", subRegion: "Southern Africa", codeSystem: "OFO Version 23", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Organising Framework for Occupations" },
  { code: "SS", name: "South Sudan", flag: "🇸🇸", phone: "+211", currency: "SSP", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "SD", name: "Sudan", flag: "🇸🇩", phone: "+249", currency: "SDG", region: "Africa", subRegion: "North Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "ST", name: "São Tomé & Príncipe", flag: "🇸🇹", phone: "+239", currency: "STN", region: "Africa", subRegion: "Central Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "TZ", name: "Tanzania, United Republic of", flag: "🇹🇿", phone: "+255", currency: "TZS", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "TG", name: "Togo", flag: "🇹🇬", phone: "+228", currency: "XOF", region: "Africa", subRegion: "West Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳", phone: "+216", currency: "TND", region: "Africa", subRegion: "North Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses French-influenced system" },
  { code: "UG", name: "Uganda", flag: "🇺🇬", phone: "+256", currency: "UGX", region: "Africa", subRegion: "East Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "ZM", name: "Zambia", flag: "🇿🇲", phone: "+260", currency: "ZMW", region: "Africa", subRegion: "Southern Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "ZW", name: "Zimbabwe", flag: "🇿🇼", phone: "+263", currency: "ZWL", region: "Africa", subRegion: "Southern Africa", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "AG", name: "Antigua & Barbuda", flag: "🇦🇬", phone: "+1", currency: "XCD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "AR", name: "Argentina", flag: "🇦🇷", phone: "+54", currency: "ARS", region: "Americas", subRegion: "South America", codeSystem: "CNO-01", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Clasificador Nacional de Ocupaciones" },
  { code: "BS", name: "Bahamas", flag: "🇧🇸", phone: "+1", currency: "BSD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "BB", name: "Barbados", flag: "🇧🇧", phone: "+1", currency: "BBD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "BZ", name: "Belize", flag: "🇧🇿", phone: "+501", currency: "BZD", region: "Americas", subRegion: "Central America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "BO", name: "Bolivia, Plurinational State of", flag: "🇧🇴", phone: "+591", currency: "BOB", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", phone: "+55", currency: "BRL", region: "Americas", subRegion: "South America", codeSystem: "CBO 2002", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Classificação Brasileira de Ocupações" },
  { code: "CA", name: "Canada", flag: "🇨🇦", phone: "+1", currency: "CAD", region: "Americas", subRegion: "North America", codeSystem: "NOC 2021", occupationSystem: "NOC", basedOn: "Independent", notes: "National Occupational Classification" },
  { code: "CL", name: "Chile", flag: "🇨🇱", phone: "+56", currency: "CLP", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "CO", name: "Colombia", flag: "🇨🇴", phone: "+57", currency: "COP", region: "Americas", subRegion: "South America", codeSystem: "CNO Colombia", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Clasificación Nacional de Ocupaciones" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷", phone: "+506", currency: "CRC", region: "Americas", subRegion: "Central America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "CU", name: "Cuba", flag: "🇨🇺", phone: "+53", currency: "CUP", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "DM", name: "Dominica", flag: "🇩🇲", phone: "+1", currency: "XCD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "DO", name: "Dominican Republic", flag: "🇩🇴", phone: "+1", currency: "DOP", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨", phone: "+593", currency: "USD", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "SV", name: "El Salvador", flag: "🇸🇻", phone: "+503", currency: "USD", region: "Americas", subRegion: "Central America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "GD", name: "Grenada", flag: "🇬🇩", phone: "+1", currency: "XCD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "GT", name: "Guatemala", flag: "🇬🇹", phone: "+502", currency: "GTQ", region: "Americas", subRegion: "Central America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "GY", name: "Guyana", flag: "🇬🇾", phone: "+592", currency: "GYD", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "HT", name: "Haiti", flag: "🇭🇹", phone: "+509", currency: "HTG", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "HN", name: "Honduras", flag: "🇭🇳", phone: "+504", currency: "HNL", region: "Americas", subRegion: "Central America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "JM", name: "Jamaica", flag: "🇯🇲", phone: "+1", currency: "JMD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", phone: "+52", currency: "MXN", region: "Americas", subRegion: "North America", codeSystem: "SINCO 2019", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Sistema Nacional de Clasificación de Ocupaciones" },
  { code: "NI", name: "Nicaragua", flag: "🇳🇮", phone: "+505", currency: "NIO", region: "Americas", subRegion: "Central America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "PA", name: "Panama", flag: "🇵🇦", phone: "+507", currency: "PAB", region: "Americas", subRegion: "Central America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "PY", name: "Paraguay", flag: "🇵🇾", phone: "+595", currency: "PYG", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "PE", name: "Peru", flag: "🇵🇪", phone: "+51", currency: "PEN", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "KN", name: "Saint Kitts & Nevis", flag: "🇰🇳", phone: "+1", currency: "XCD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "LC", name: "Saint Lucia", flag: "🇱🇨", phone: "+1", currency: "XCD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "VC", name: "Saint Vincent", flag: "🇻🇨", phone: "+1", currency: "XCD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "SR", name: "Suriname", flag: "🇸🇷", phone: "+597", currency: "SRD", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "TT", name: "Trinidad and Tobago", flag: "🇹🇹", phone: "+1", currency: "TTD", region: "Americas", subRegion: "Caribbean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "US", name: "United States", flag: "🇺🇸", phone: "+1", currency: "USD", region: "Americas", subRegion: "North America", codeSystem: "O*NET SOC 2018", occupationSystem: "SOC", basedOn: "Independent", notes: "Occupational Information Network SOC" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾", phone: "+598", currency: "UYU", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "VE", name: "Venezuela, Bolivarian Republic of", flag: "🇻🇪", phone: "+58", currency: "VES", region: "Americas", subRegion: "South America", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "AF", name: "Afghanistan", flag: "🇦🇫", phone: "+93", currency: "AFN", region: "Asia", subRegion: "South Asia", codeSystem: "None / ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08", notes: "Informal labour market" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩", phone: "+880", currency: "BDT", region: "Asia", subRegion: "South Asia", codeSystem: "BCO 2012", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Bangladesh Classification of Occupations" },
  { code: "BT", name: "Bhutan", flag: "🇧🇹", phone: "+975", currency: "BTN", region: "Asia", subRegion: "South Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No national system" },
  { code: "BN", name: "Brunei Darussalam", flag: "🇧🇳", phone: "+673", currency: "BND", region: "Asia", subRegion: "South-East Asia", codeSystem: "BSOC", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Brunei Standard Occupational Classification" },
  { code: "KH", name: "Cambodia", flag: "🇰🇭", phone: "+855", currency: "KHR", region: "Asia", subRegion: "South-East Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "CN", name: "China", flag: "🇨🇳", phone: "+86", currency: "CNY", region: "Asia", subRegion: "East Asia", codeSystem: "CSOC / GBT 6565", occupationSystem: "ISCO", basedOn: "Independent", notes: "Chinese Standard Occupational Classification" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰", phone: "+852", currency: "HKD", region: "Asia", subRegion: "East Asia", codeSystem: "HKSOC 2017", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Special Administrative Region of China" },
  { code: "IN", name: "India", flag: "🇮🇳", phone: "+91", currency: "INR", region: "Asia", subRegion: "South Asia", codeSystem: "NCO 2015", occupationSystem: "NCO", basedOn: "ISCO-08 Derived", notes: "National Classification of Occupations 2015" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", phone: "+62", currency: "IDR", region: "Asia", subRegion: "South-East Asia", codeSystem: "KBJI 2014", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Klasifikasi Baku Jabatan Indonesia" },
  { code: "JP", name: "Japan", flag: "🇯🇵", phone: "+81", currency: "JPY", region: "Asia", subRegion: "East Asia", codeSystem: "JSOC 2009", occupationSystem: "ISCO", basedOn: "Independent", notes: "Japan Standard Occupational Classification" },
  { code: "KP", name: "Korea, Democratic People's Republic of", flag: "🇰🇵", phone: "+850", currency: "KPW", region: "Asia", subRegion: "East Asia", codeSystem: "None", occupationSystem: "ISCO", basedOn: "Unknown", notes: "Closed economy — no public system" },
  { code: "KR", name: "Korea, Republic of", flag: "🇰🇷", phone: "+82", currency: "KRW", region: "Asia", subRegion: "East Asia", codeSystem: "KSSOC 7th", occupationSystem: "ISCO", basedOn: "Independent", notes: "Korean Standard Classification of Occupations" },
  { code: "LA", name: "Lao People's Democratic Republic", flag: "🇱🇦", phone: "+856", currency: "LAK", region: "Asia", subRegion: "South-East Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "MO", name: "Macao", flag: "🇲🇴", phone: "+853", currency: "MOP", region: "Asia", subRegion: "East Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Special Administrative Region of China" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", phone: "+60", currency: "MYR", region: "Asia", subRegion: "South-East Asia", codeSystem: "MASCO 2020", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Malaysian Standard Classification of Occupations" },
  { code: "MV", name: "Maldives", flag: "🇲🇻", phone: "+960", currency: "MVR", region: "Asia", subRegion: "South Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "MN", name: "Mongolia", flag: "🇲🇳", phone: "+976", currency: "MNT", region: "Asia", subRegion: "East Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses modified ISCO-08" },
  { code: "MM", name: "Myanmar", flag: "🇲🇲", phone: "+95", currency: "MMK", region: "Asia", subRegion: "South-East Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "NP", name: "Nepal", flag: "🇳🇵", phone: "+977", currency: "NPR", region: "Asia", subRegion: "South Asia", codeSystem: "NCO Nepal", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "National Classification of Occupations Nepal" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰", phone: "+92", currency: "PKR", region: "Asia", subRegion: "South Asia", codeSystem: "PSCO 2012", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Pakistan Standard Classification of Occupations" },
  { code: "PH", name: "Philippines", flag: "🇵🇭", phone: "+63", currency: "PHP", region: "Asia", subRegion: "South-East Asia", codeSystem: "PSOC 2012", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Philippine Standard Occupational Classification" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", phone: "+65", currency: "SGD", region: "Asia", subRegion: "South-East Asia", codeSystem: "SSOC 2020", occupationSystem: "SSOC", basedOn: "ISCO-08 Derived", notes: "Singapore Standard Occupational Classification" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰", phone: "+94", currency: "LKR", region: "Asia", subRegion: "South Asia", codeSystem: "SLSOC 2008", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Sri Lanka Standard Occupational Classification" },
  { code: "TW", name: "Taiwan, Province of China", flag: "🇹🇼", phone: "+886", currency: "TWD", region: "Asia", subRegion: "East Asia", codeSystem: "CSOC Taiwan", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses own adapted system" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", phone: "+66", currency: "THB", region: "Asia", subRegion: "South-East Asia", codeSystem: "TSOC 2001", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Thai Standard Occupational Classification" },
  { code: "TL", name: "Timor-Leste", flag: "🇹🇱", phone: "+670", currency: "USD", region: "Asia", subRegion: "South-East Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "VN", name: "Viet Nam", flag: "🇻🇳", phone: "+84", currency: "VND", region: "Asia", subRegion: "South-East Asia", codeSystem: "VSOC 2015", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Vietnam Standard Occupational Classification" },
  { code: "AU", name: "Australia", flag: "🇦🇺", phone: "+61", currency: "AUD", region: "Asia Pacific", subRegion: "Oceania", codeSystem: "ANZSCO 2022", occupationSystem: "ANZSCO", basedOn: "Independent", notes: "Shared with New Zealand" },
  { code: "FJ", name: "Fiji", flag: "🇫🇯", phone: "+679", currency: "FJD", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "KI", name: "Kiribati", flag: "🇰🇮", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "MH", name: "Marshall Islands", flag: "🇲🇭", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "FM", name: "Micronesia", flag: "🇫🇲", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "NR", name: "Nauru", flag: "🇳🇷", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", phone: "+64", currency: "NZD", region: "Asia Pacific", subRegion: "Oceania", codeSystem: "ANZSCO 2022", occupationSystem: "ANZSCO", basedOn: "Independent", notes: "Shared with Australia" },
  { code: "PW", name: "Palau", flag: "🇵🇼", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "PG", name: "Papua New Guinea", flag: "🇵🇬", phone: "+675", currency: "PGK", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "WS", name: "Samoa", flag: "🇼🇸", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "SB", name: "Solomon Islands", flag: "🇸🇧", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "TO", name: "Tonga", flag: "🇹🇴", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "TV", name: "Tuvalu", flag: "🇹🇻", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "VU", name: "Vanuatu", flag: "🇻🇺", phone: "", currency: "", region: "Asia Pacific", subRegion: "Pacific Islands", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "AL", name: "Albania", flag: "🇦🇱", phone: "+355", currency: "ALL", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "AD", name: "Andorra", flag: "🇦🇩", phone: "+376", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "AM", name: "Armenia", flag: "🇦🇲", phone: "+374", currency: "AMD", region: "Europe", subRegion: "Eastern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "AT", name: "Austria", flag: "🇦🇹", phone: "+43", currency: "EUR", region: "Europe", subRegion: "Western Europe", codeSystem: "ISCO-08 AT", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Austrian adapted version" },
  { code: "AZ", name: "Azerbaijan", flag: "🇦🇿", phone: "+994", currency: "AZN", region: "Europe", subRegion: "Eastern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "BY", name: "Belarus", flag: "🇧🇾", phone: "+375", currency: "BYN", region: "Europe", subRegion: "Eastern Europe", codeSystem: "OKPDTR", occupationSystem: "ISCO", basedOn: "Independent", notes: "Russian-influence classification" },
  { code: "BE", name: "Belgium", flag: "🇧🇪", phone: "+32", currency: "EUR", region: "Europe", subRegion: "Western Europe", codeSystem: "ISCO-08 BE", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Belgian adapted version" },
  { code: "BA", name: "Bosnia & Herzegovina", flag: "🇧🇦", phone: "+387", currency: "BAM", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬", phone: "+359", currency: "BGN", region: "Europe", subRegion: "Eastern Europe", codeSystem: "ISCO-08 BG", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Bulgarian adapted version" },
  { code: "HR", name: "Croatia", flag: "🇭🇷", phone: "+385", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "NKZ 2010", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "National Classification of Occupations" },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿", phone: "+420", currency: "CZK", region: "Europe", subRegion: "Eastern Europe", codeSystem: "CZ-ISCO", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Czech adapted ISCO-08" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", phone: "+45", currency: "DKK", region: "Europe", subRegion: "Northern Europe", codeSystem: "DISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Danish adaptation of ISCO-08" },
  { code: "EE", name: "Estonia", flag: "🇪🇪", phone: "+372", currency: "EUR", region: "Europe", subRegion: "Northern Europe", codeSystem: "ISCO-08 EE", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Estonian adapted version" },
  { code: "FI", name: "Finland", flag: "🇫🇮", phone: "+358", currency: "EUR", region: "Europe", subRegion: "Northern Europe", codeSystem: "ISCO-08 FI", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Finnish adapted version" },
  { code: "FR", name: "France", flag: "🇫🇷", phone: "+33", currency: "EUR", region: "Europe", subRegion: "Western Europe", codeSystem: "PCS-ESE 2020", occupationSystem: "ISCO", basedOn: "Independent", notes: "Professions et Catégories Socioprofessionnelles" },
  { code: "GE", name: "Georgia", flag: "🇬🇪", phone: "+995", currency: "GEL", region: "Europe", subRegion: "Eastern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "DE", name: "Germany", flag: "🇩🇪", phone: "+49", currency: "EUR", region: "Europe", subRegion: "Western Europe", codeSystem: "KldB 2010", occupationSystem: "ISCO", basedOn: "Independent", notes: "Klassifikation der Berufe" },
  { code: "GR", name: "Greece", flag: "🇬🇷", phone: "+30", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08 GR", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Greek adapted version" },
  { code: "VA", name: "Holy See (Vatican City State)", flag: "🇻🇦", phone: "+379", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "UN observer state" },
  { code: "HU", name: "Hungary", flag: "🇭🇺", phone: "+36", currency: "HUF", region: "Europe", subRegion: "Eastern Europe", codeSystem: "FEOR-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Hungarian occupational classification" },
  { code: "IS", name: "Iceland", flag: "🇮🇸", phone: "+354", currency: "ISK", region: "Europe", subRegion: "Northern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "IE", name: "Ireland", flag: "🇮🇪", phone: "+353", currency: "EUR", region: "Europe", subRegion: "Northern Europe", codeSystem: "SOC 2020", occupationSystem: "SOC_UK", basedOn: "SOC UK Based", notes: "Same as UK SOC 2020" },
  { code: "IT", name: "Italy", flag: "🇮🇹", phone: "+39", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "CP 2011", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Classificazione delle Professioni" },
  { code: "KZ", name: "Kazakhstan", flag: "🇰🇿", phone: "+7", currency: "KZT", region: "Europe", subRegion: "Central Asia", codeSystem: "OKPDTR / ISCO-08", occupationSystem: "ISCO", basedOn: "Mixed", notes: "Transitioning to ISCO-08" },
  { code: "KG", name: "Kyrgyzstan", flag: "🇰🇬", phone: "+996", currency: "KGS", region: "Europe", subRegion: "Central Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "LV", name: "Latvia", flag: "🇱🇻", phone: "+371", currency: "EUR", region: "Europe", subRegion: "Northern Europe", codeSystem: "ISCO-08 LV", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Latvian adapted version" },
  { code: "LI", name: "Liechtenstein", flag: "🇱🇮", phone: "+423", currency: "CHF", region: "Europe", subRegion: "Western Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "LT", name: "Lithuania", flag: "🇱🇹", phone: "+370", currency: "EUR", region: "Europe", subRegion: "Northern Europe", codeSystem: "ISCO-08 LT", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Lithuanian adapted version" },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺", phone: "+352", currency: "EUR", region: "Europe", subRegion: "Western Europe", codeSystem: "ISCO-08 LU", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Luxembourg adapted version" },
  { code: "MT", name: "Malta", flag: "🇲🇹", phone: "+356", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "EU member — uses ISCO-08" },
  { code: "MD", name: "Moldova, Republic of", flag: "🇲🇩", phone: "+373", currency: "MDL", region: "Europe", subRegion: "Eastern Europe", codeSystem: "CORM-06", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Moldovan occupational classification" },
  { code: "MC", name: "Monaco", flag: "🇲🇨", phone: "+377", currency: "EUR", region: "Europe", subRegion: "Western Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "ME", name: "Montenegro", flag: "🇲🇪", phone: "+382", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", phone: "+31", currency: "EUR", region: "Europe", subRegion: "Western Europe", codeSystem: "SBC 2021", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Standaard Beroepenclassificatie" },
  { code: "MK", name: "North Macedonia", flag: "🇲🇰", phone: "+389", currency: "MKD", region: "Europe", subRegion: "Southern Europe", codeSystem: "NOKS 2011", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "National occupational classification" },
  { code: "NO", name: "Norway", flag: "🇳🇴", phone: "+47", currency: "NOK", region: "Europe", subRegion: "Northern Europe", codeSystem: "STYRK-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Norwegian adapted ISCO-08" },
  { code: "PL", name: "Poland", flag: "🇵🇱", phone: "+48", currency: "PLN", region: "Europe", subRegion: "Eastern Europe", codeSystem: "KZiS 2014", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Klasyfikacja Zawodów i Specjalności" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", phone: "+351", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "CPP 2010", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Classificação Portuguesa das Profissões" },
  { code: "RO", name: "Romania", flag: "🇷🇴", phone: "+40", currency: "RON", region: "Europe", subRegion: "Eastern Europe", codeSystem: "COR 2011", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Romanian Classification of Occupations" },
  { code: "RU", name: "Russian Federation", flag: "🇷🇺", phone: "+7", currency: "RUB", region: "Europe", subRegion: "Eastern Europe", codeSystem: "OKZ-14 / ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Russian adaptation of ISCO-08" },
  { code: "SM", name: "San Marino", flag: "🇸🇲", phone: "+378", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "RS", name: "Serbia", flag: "🇷🇸", phone: "+381", currency: "RSD", region: "Europe", subRegion: "Southern Europe", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰", phone: "+421", currency: "EUR", region: "Europe", subRegion: "Eastern Europe", codeSystem: "SK ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Slovak adapted version" },
  { code: "SI", name: "Slovenia", flag: "🇸🇮", phone: "+386", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "SKD 2010", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Slovenian occupational classification" },
  { code: "ES", name: "Spain", flag: "🇪🇸", phone: "+34", currency: "EUR", region: "Europe", subRegion: "Southern Europe", codeSystem: "CNO-11", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Clasificación Nacional de Ocupaciones" },
  { code: "SE", name: "Sweden", flag: "🇸🇪", phone: "+46", currency: "SEK", region: "Europe", subRegion: "Northern Europe", codeSystem: "SSYK 2012", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Standard för svensk yrkesklassificering" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", phone: "+41", currency: "CHF", region: "Europe", subRegion: "Western Europe", codeSystem: "CH-ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Swiss adapted version" },
  { code: "TJ", name: "Tajikistan", flag: "🇹🇯", phone: "+992", currency: "TJS", region: "Europe", subRegion: "Central Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "TM", name: "Turkmenistan", flag: "🇹🇲", phone: "+993", currency: "TMT", region: "Europe", subRegion: "Central Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦", phone: "+380", currency: "UAH", region: "Europe", subRegion: "Eastern Europe", codeSystem: "KP 2010", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Classifier of Professions Ukraine" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", phone: "+44", currency: "GBP", region: "Europe", subRegion: "Northern Europe", codeSystem: "SOC 2020", occupationSystem: "SOC_UK", basedOn: "Independent", notes: "Standard Occupational Classification" },
  { code: "UZ", name: "Uzbekistan", flag: "🇺🇿", phone: "+998", currency: "UZS", region: "Europe", subRegion: "Central Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭", phone: "+973", currency: "BHD", region: "Middle East", subRegion: "Gulf (GCC)", codeSystem: "LMRA Job Codes", occupationSystem: "BAHRAIN_LMRA", basedOn: "ISCO-08 Derived", notes: "Labour Market Regulatory Authority codes" },
  { code: "CY", name: "Cyprus", flag: "🇨🇾", phone: "+357", currency: "EUR", region: "Middle East", subRegion: "Eastern Mediterranean", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "EU member — uses ISCO-08" },
  { code: "IR", name: "Iran, Islamic Republic of", flag: "🇮🇷", phone: "+98", currency: "IRR", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶", phone: "+964", currency: "IQD", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "IL", name: "Israel", flag: "🇮🇱", phone: "+972", currency: "ILS", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Uses adapted ISCO-08" },
  { code: "JO", name: "Jordan", flag: "🇯🇴", phone: "+962", currency: "JOD", region: "Middle East", subRegion: "Western Asia", codeSystem: "JSCO", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Jordan Standard Classification of Occupations" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", phone: "+965", currency: "KWD", region: "Middle East", subRegion: "Gulf (GCC)", codeSystem: "MOI Profession Codes", occupationSystem: "KUWAIT_MOI", basedOn: "ISCO-08 Derived", notes: "Ministry of Interior profession codes" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧", phone: "+961", currency: "LBP", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "OM", name: "Oman", flag: "🇴🇲", phone: "+968", currency: "OMR", region: "Middle East", subRegion: "Gulf (GCC)", codeSystem: "MOL Profession Codes", occupationSystem: "OMAN_MOL", basedOn: "ISCO-08 Derived", notes: "Ministry of Labour profession codes" },
  { code: "PS", name: "Palestine, State of", flag: "🇵🇸", phone: "+970", currency: "ILS", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "UN observer state" },
  { code: "QA", name: "Qatar", flag: "🇶🇦", phone: "+974", currency: "QAR", region: "Middle East", subRegion: "Gulf (GCC)", codeSystem: "MOI / QCHP Codes", occupationSystem: "QATAR_MOI", basedOn: "ISCO-08 Derived", notes: "Ministry of Interior + QCHP for healthcare" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", phone: "+966", currency: "SAR", region: "Middle East", subRegion: "Gulf (GCC)", codeSystem: "MHRSD Profession Codes", occupationSystem: "KSA_MOL", basedOn: "ISCO-08 Derived", notes: "Ministry of HR and Social Development" },
  { code: "SY", name: "Syrian Arab Republic", flag: "🇸🇾", phone: "+963", currency: "SYP", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
  { code: "TR", name: "Türkiye", flag: "🇹🇷", phone: "+90", currency: "TRY", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08 TR", occupationSystem: "ISCO", basedOn: "ISCO-08 Derived", notes: "Turkish adapted version" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", phone: "+971", currency: "AED", region: "Middle East", subRegion: "Gulf (GCC)", codeSystem: "MOHRE Job Codes", occupationSystem: "UAE_MOL", basedOn: "ISCO-08 Derived", notes: "Ministry of HR and Emiratisation" },
  { code: "YE", name: "Yemen", flag: "🇾🇪", phone: "+967", currency: "YER", region: "Middle East", subRegion: "Western Asia", codeSystem: "ISCO-08", occupationSystem: "ISCO", basedOn: "ISCO-08 Direct", notes: "No formal national system" },
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
  label: country.name,
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

export const countryNameToOption = (country) => ({
  value: country.name,
  label: country.name,
  country,
})

export const COUNTRY_NAME_OPTIONS_GROUPED = [
  {
    label: '⭐ Frequently Used',
    options: PRIORITY_COUNTRIES.map((code) => COUNTRIES.find((c) => c.code === code))
      .filter(Boolean)
      .map(countryNameToOption),
  },
  {
    label: '── All Countries ──',
    options: COUNTRIES.filter((c) => !PRIORITY_COUNTRIES.includes(c.code))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(countryNameToOption),
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

export const getOccupationSystem = (countryCode) =>
  getCountryByCode(countryCode)?.occupationSystem || 'ISCO'

export const IMMIGRATION_COUNTRY_CODES = new Set(['NZ', 'AU', 'AE', 'JO'])

/** Match industry/trade country lists that may use aliases (e.g. UK, UAE). */
export const countryMatchesList = (countryCode, countryNames) => {
  if (!countryCode || !countryNames?.length) return true
  const meta = getCountryByCode(countryCode)
  if (!meta) return false
  const variants = new Set([
    meta.code,
    meta.name,
    meta.name.toLowerCase(),
    ...(countryCode === 'GB' ? ['UK', 'United Kingdom'] : []),
    ...(countryCode === 'AE' ? ['UAE', 'United Arab Emirates'] : []),
  ])
  return countryNames.some((name) => {
    if (!name) return false
    if (variants.has(name) || variants.has(name.toLowerCase())) return true
    return getCountryByName(name)?.code === countryCode
  })
}

/** Resolve catalog/API country label from ISO code. */
export const resolveCatalogCountryName = (code, catalogCountries = []) => {
  const meta = getCountryByCode(code)
  if (!meta) return null
  const match = catalogCountries.find((c) => countryMatchesList(code, [c]))
  return match || meta.name
}

export default COUNTRIES
