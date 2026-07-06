import {
  DATE_FIELD_LABELS,
  getFieldExtra,
  getFieldLabel,
  getFieldPlaceholder,
  STORE_DATE_FORMAT,
} from '../form/formFieldConfig'

export const EMPLOYER_PREFILL_IDS = new Set([
  'company_logo',
  'company_name',
  'company_address',
  'company_city',
  'company_email',
  'company_trading_name',
  'company_nzbn',
  'company_abn',
  'company_crn',
  'company_bn',
  'company_trn',
  'reg_number_value',
  'company_reg_address',
  'hr_contact_name',
  'hr_contact_title',
  'hr_email',
  'signatory_name',
  'signatory_designation',
  'employer_accreditation_no',
  'position_title',
  'ref_number',
])

const REG_KEY_BY_COUNTRY = {
  'New Zealand': 'company_nzbn',
  Australia: 'company_abn',
  'United Kingdom': 'company_crn',
  Canada: 'company_bn',
  UAE: 'company_trn',
}

export function buildEmployerPrefill(employer, tradeName) {
  if (!employer) return {}
  const parts = [
    employer.company_address,
    employer.company_city,
    employer.company_state,
    employer.company_postcode,
  ].filter(Boolean)

  const prefill = {
    company_name: employer.company_name,
    company_trading_name: employer.company_trading_name || '',
    company_address: employer.company_address,
    company_city: employer.company_city,
    company_email: employer.company_email,
    company_reg_address: parts.join(', '),
    hr_contact_name: employer.hr_contact_name,
    hr_contact_title: employer.hr_contact_title,
    hr_email: employer.hr_email,
    signatory_name: employer.signatory_name,
    signatory_designation: employer.signatory_designation,
    employer_accreditation_no: employer.employer_accreditation_no || '',
    position_title: tradeName || '',
  }

  const regKey = REG_KEY_BY_COUNTRY[employer.country] || 'reg_number_value'
  if (employer.reg_number_value) {
    prefill[regKey] = employer.reg_number_value
  }

  return prefill
}

export const VISIBLE_FORM_SECTIONS = [
  {
    key: 'candidate',
    title: 'Candidate Details',
    fields: [
      { id: 'candidate_full_name', label: 'Full Name (as per passport)', required: true },
      { id: 'candidate_passport_number', label: 'Passport Number', required: true },
      { id: 'candidate_date_of_birth', label: 'Date of Birth', type: 'date', required: true },
      { id: 'candidate_nationality', label: 'Nationality', type: 'country_select', required: true },
      { id: 'passport_issue_date', label: 'Passport Issue Date', type: 'date', required: true },
      { id: 'passport_expiry_date', label: 'Passport Expiry Date', type: 'date', required: true },
      { id: 'candidate_address', label: 'Current Residential Address', type: 'textarea', required: true },
      { id: 'candidate_email', label: 'Candidate Email Address', type: 'email', required: true },
      { id: 'candidate_salutation', label: 'Salutation', type: 'salutation_select', required: true },
    ],
  },
  {
    key: 'document',
    title: 'Document Details',
    fields: [
      { id: 'issue_date', label: 'Issue Date', type: 'date', required: true, defaultToday: true },
      {
        id: 'validity_days',
        label: 'Offer Valid For',
        type: 'select',
        options: ['30', '60', '90'],
        required: true,
        default: '60',
      },
      { id: 'validity_expiry_date', label: 'Offer Expiry Date', type: 'readonly_expiry', required: true },
      { id: 'sign_date', label: 'Employer Sign Date', type: 'date', required: true },
    ],
  },
  {
    key: 'position',
    title: 'Position Details',
    fields: [
      {
        id: 'employment_type',
        label: 'Employment Type',
        type: 'select',
        options: ['Full-Time Permanent', 'Fixed-Term Contract'],
        required: true,
      },
      { id: 'work_location', label: 'Work Site Address, City, New Zealand', required: true },
      { id: 'commencement_date', label: 'Commencement Date', type: 'date', required: true },
      { id: 'contract_duration', label: 'Contract Duration', default: 'Permanent', required: true },
      { id: 'weekly_hours', label: 'Weekly Hours', default: '40 Hours / 5 Days per Week', required: true },
      { id: 'work_days', label: 'Working Days', default: 'Monday to Friday', required: true },
      { id: 'probation_period', label: 'Probation Period', default: '3 Months from commencement', required: true },
      { id: 'reporting_to', label: 'Reporting To (Name & Title)', required: true },
    ],
  },
  {
    key: 'remuneration',
    title: 'Remuneration',
    fields: [
      { id: 'annual_salary', label: 'Annual Gross Salary', placeholder: 'NZD 58,000.00 per annum', required: true },
      { id: 'hourly_rate', label: 'Hourly Rate', placeholder: 'NZD 27.88 per hour', required: true },
      {
        id: 'pay_frequency',
        label: 'Pay Frequency',
        type: 'select',
        options: ['Weekly', 'Fortnightly'],
        required: true,
      },
      {
        id: 'overtime_rate',
        label: 'Overtime Rate',
        default: 'Paid at 1.5x hourly rate for hours beyond 40/week',
        required: true,
      },
    ],
  },
  {
    key: 'allowances',
    title: 'Allowances',
    note: 'All allowance fields are optional. Leave blank to use default text.',
    fields: [
      { id: 'accommodation_allowance', label: 'Accommodation Allowance', placeholder: 'NZD 250 per week' },
      { id: 'travel_allowance', label: 'Travel Allowance', placeholder: 'NZD 50 per week' },
      { id: 'medical_insurance', label: 'Medical Insurance', placeholder: 'Employer-subsidised health insurance' },
      { id: 'relocation_assistance', label: 'Relocation Assistance', placeholder: 'NZD 2,000 one-time relocation grant' },
      { id: 'professional_development', label: 'Professional Development', placeholder: 'Employer-sponsored trade certifications' },
    ],
  },
  {
    key: 'qualifications',
    title: 'Qualifications',
    fields: [
      { id: 'candidate_qualification', label: 'Qualification', placeholder: 'ITI Certificate in Carpentry', required: true },
      { id: 'candidate_experience', label: 'Years of Experience', placeholder: 'Minimum 5 years demonstrated experience', required: true },
      { id: 'candidate_nz_licence', label: 'NZ Licence / Certification', placeholder: 'Site Safe Passport — to be obtained upon arrival', required: true },
      { id: 'candidate_language_score', label: 'Language Proficiency Score', placeholder: 'IELTS 5.5 overall', required: true },
    ],
  },
  {
    key: 'signature',
    title: 'Candidate Signature Info',
    fields: [
      { id: 'candidate_sign_date', label: 'Candidate Sign Date', type: 'date', required: true },
      { id: 'candidate_sign_place', label: 'Sign Place (City, Country)', placeholder: 'Ludhiana, India', required: true },
    ],
  },
]

/** @deprecated use VISIBLE_FORM_SECTIONS */
export const SMART_FORM_SECTIONS = VISIBLE_FORM_SECTIONS

export function fieldLabel(id) {
  return DATE_FIELD_LABELS[id] || getFieldLabel({ id, label: id })
}

export { STORE_DATE_FORMAT }
