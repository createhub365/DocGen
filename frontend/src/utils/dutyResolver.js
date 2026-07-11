const ANZSCO_COUNTRIES = new Set(['NZ', 'AU'])

const NZ_TERM_REPLACEMENTS = [
  ['Health and Safety at Work Act 2015 (HSWA)', 'applicable health and safety legislation'],
  ['HSWA 2015', 'local health and safety legislation'],
  ['HSWA', 'local health and safety legislation'],
  ['New Zealand Building Code (NZBC)', 'applicable building codes and standards'],
  ['New Zealand Building Code', 'applicable building codes'],
  ['NZBC', 'applicable building codes'],
  ['NZS 3000', 'applicable electrical wiring standards'],
  ['NZS 3604', 'applicable plumbing standards'],
  ['NZS 4210', 'applicable masonry standards'],
  ['NZS 1554', 'applicable welding standards'],
  ['AS/NZS', 'applicable Australian/NZ standards'],
  ['NZS ', 'applicable standards '],
  ['WorkSafe New Zealand', 'the relevant safety authority'],
  ['WorkSafe NZ', 'the relevant safety authority'],
  ['Immigration New Zealand', 'the relevant immigration authority'],
  ['Immigration NZ', 'the relevant immigration authority'],
  ['KiwiSaver', 'applicable pension/retirement scheme'],
  ['Holidays Act 2003', 'applicable employment legislation'],
  ['Employment Relations Act 2000', 'applicable employment legislation'],
  ['Building Act 2004', 'applicable building legislation'],
  ['Gas Act 1992', 'applicable gas legislation'],
  ['Ozone Layer Protection Act 1996', 'applicable environmental legislation'],
  ['upon arrival in New Zealand', 'upon commencement'],
  ['in New Zealand', 'locally'],
  ['New Zealand workplaces', 'local workplaces'],
  ['New Zealand', 'the destination country'],
  ['IRD', 'local tax authority'],
  ['EWRB', 'relevant electrical licensing authority'],
  ['PGDB', 'relevant plumbing licensing authority'],
  ['LINZ', 'relevant land information authority'],
  ['NZ ', 'local '],
]

export function makeDutiesGeneric(duties = []) {
  return duties.map((duty) => {
    let text = duty
    NZ_TERM_REPLACEMENTS.forEach(([nzTerm, genericTerm]) => {
      text = text.split(nzTerm).join(genericTerm)
    })
    return text
  })
}

export function resolveDuties(trade) {
  if (!trade) return []

  if (trade.duties_generic?.length) {
    return makeDutiesGeneric(trade.duties_generic)
  }

  if (trade.duties?.length) {
    return makeDutiesGeneric(trade.duties)
  }

  return []
}

export function isAnzCountry(code) {
  return ANZSCO_COUNTRIES.has((code || '').toUpperCase())
}
