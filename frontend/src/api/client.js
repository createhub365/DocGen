import axios from 'axios'

const TOKEN_KEY = 'docgen_access_token'

function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setStoredToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private browsing */
  }
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
})

client.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setStoredToken(null)
      localStorage.removeItem('role')
      localStorage.removeItem('username')
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export function clearAuthToken() {
  setStoredToken(null)
}

export default client

export async function login(username, password) {
  const { data } = await client.post('/auth/login', { username, password })
  if (data.access_token) setStoredToken(data.access_token)
  return data
}

export async function logout() {
  try {
    const { data } = await client.post('/auth/logout')
    return data
  } finally {
    setStoredToken(null)
  }
}

export async function getMe() {
  const { data } = await client.get('/auth/me')
  return data
}

export async function getCountries() {
  const { data } = await client.get('/countries')
  return data
}

export async function getTrades(countryId) {
  const { data } = await client.get('/trades', { params: { country_id: countryId } })
  return data
}

export async function getCompaniesForIndustry(countryId, industry) {
  const { data } = await client.get('/companies/for-industry', {
    params: { country_id: countryId, industry },
  })
  return data
}

export async function getCompanies(tradeId, countryId) {
  const { data } = await client.get('/companies', {
    params: { trade_id: tradeId, country_id: countryId },
  })
  return data
}

export async function getDocumentTypes() {
  const { data } = await client.get('/document-types')
  return data
}

export async function getTemplate(companyId, tradeId, countryId, docTypeId) {
  const { data } = await client.get('/template', {
    params: {
      company_id: companyId,
      trade_id: tradeId,
      country_id: countryId,
      doc_type_id: docTypeId,
    },
  })
  return data
}

export async function previewDocument(templateId, formData) {
  const { data } = await client.post(
    '/preview',
    { template_id: templateId, form_data: formData },
    { responseType: 'blob' }
  )
  return data
}

export async function readApiErrorDetail(error) {
  const data = error.response?.data
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      const json = JSON.parse(text)
      return typeof json.detail === 'string' ? json.detail : null
    } catch {
      return null
    }
  }
  const detail = data?.detail
  return typeof detail === 'string' ? detail : null
}

export async function previewDocumentPdf(templateId, formData) {
  const { data } = await client.post(
    '/preview-pdf',
    { template_id: templateId, form_data: formData },
    { responseType: 'blob' }
  )
  return data
}

export async function generateDocument(templateId, formData) {
  const { data } = await client.post('/generate', {
    template_id: templateId,
    form_data: formData,
  })
  return data
}

export async function getDocuments(params = {}) {
  const { data } = await client.get('/documents', { params })
  return data
}

export async function downloadDoc(documentId, type) {
  const response = await client.get(`/documents/${documentId}/download/${type}`, {
    responseType: 'blob',
  })
  const disposition = response.headers['content-disposition']
  let filename = `document.${type === 'pdf' ? 'pdf' : 'docx'}`
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/)
    if (match) filename = match[1]
  }
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function previewPlaceholders(file) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await client.post('/admin/templates/preview-placeholders', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function uploadTemplate(formData) {
  const { data } = await client.post('/admin/templates', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getAdminTemplates() {
  const { data } = await client.get('/admin/templates')
  return data
}

export async function updateTemplate(id, payload) {
  const { data } = await client.put(`/admin/templates/${id}`, payload)
  return data
}

export async function uploadTemplateVersion(templateId, file) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await client.put(`/admin/templates/${templateId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function editTemplate(id, formData) {
  const { data } = await client.post(`/admin/templates/${id}/edit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function regenerateThumbnails() {
  const { data } = await client.post('/admin/templates/regenerate-thumbnails')
  return data
}

export async function fetchTemplatePreviewText(templateId) {
  const { data } = await client.get(`/admin/templates/${templateId}/preview-text`)
  return data
}

export async function fetchTemplateDocxBlob(templateId) {
  const response = await client.get(`/admin/templates/${templateId}/download`, {
    responseType: 'blob',
  })
  const blob = response.data
  if (blob.type?.includes('json') || blob.size < 100) {
    const text = await blob.text()
    try {
      const err = JSON.parse(text)
      throw new Error(err.detail || 'Template file not available')
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message !== 'Template file not available') {
        throw parseErr
      }
      throw new Error('Template file is missing or invalid')
    }
  }
  return blob.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ? blob
    : new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

export async function downloadTemplateDocx(templateId) {
  const response = await client.get(`/admin/templates/${templateId}/download`, {
    responseType: 'blob',
  })
  const disposition = response.headers['content-disposition']
  let filename = 'template.docx'
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/)
    if (match) filename = match[1]
  }
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function deleteTemplate(id) {
  const { data } = await client.delete(`/admin/templates/${id}`)
  return data
}

export async function getAdminStats() {
  const { data } = await client.get('/admin/stats')
  return data
}

export async function getAdminUsers() {
  const { data } = await client.get('/admin/users')
  return data
}

export async function getAdminTradeBank() {
  const { data } = await client.get('/admin/trade-bank')
  return data
}

export async function createAdminTrade(payload) {
  const { data } = await client.post('/admin/trade-bank/trades', payload)
  return data
}

export async function createAdminIndustry(payload) {
  const { data } = await client.post('/admin/trade-bank/industries', payload)
  return data
}

export async function updateAdminTrade(tradeId, payload) {
  const { data } = await client.put(`/admin/trade-bank/trades/${tradeId}`, payload)
  return data
}

export async function deleteAdminTrade(tradeId) {
  const { data } = await client.delete(`/admin/trade-bank/trades/${tradeId}`)
  return data
}

export async function createUser(payload) {
  const { data } = await client.post('/admin/users', payload)
  return data
}

export async function updateAdminUser(userId, payload) {
  const { data } = await client.patch(`/admin/users/${userId}`, payload)
  return data
}

export async function resetAdminUserPassword(userId, password) {
  const { data } = await client.put(`/admin/users/${userId}/password`, { password })
  return data
}

export async function deleteAdminUser(userId) {
  const { data } = await client.delete(`/admin/users/${userId}`)
  return data
}

export async function addCountry(payload) {
  const { data } = await client.post('/admin/countries', payload)
  return data
}

export async function addTrade(payload) {
  const { data } = await client.post('/admin/trades', payload)
  return data
}

export async function addCompany(payload) {
  const { data } = await client.post('/admin/companies', payload)
  return data
}

export async function incrementRefCounter() {
  const { data } = await client.post('/ref-counter/increment')
  return data
}

export async function peekRefCounter() {
  const { data } = await client.get('/ref-counter')
  return data
}

export async function uploadLogo(formData) {
  const { data } = await client.post('/logos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getLogos(companyName) {
  const { data } = await client.get('/logos', { params: { company_name: companyName } })
  return data
}

export async function getEmployers(search) {
  const { data } = await client.get('/employers', { params: { search: search || undefined } })
  return data
}

export async function createEmployer(formData) {
  const { data } = await client.post('/employers', formData)
  return data
}

export async function updateEmployer(id, formData) {
  const { data } = await client.put(`/employers/${id}`, formData)
  return data
}

export async function deleteEmployer(id) {
  const { data } = await client.delete(`/employers/${id}`)
  return data
}

export async function getDashboardSummary() {
  const { data } = await client.get('/dashboard/summary')
  return data
}

export async function getTemplatesCatalog(params) {
  const { data } = await client.get('/templates', { params })
  return data
}

export async function getTemplateById(templateId) {
  const { data } = await client.get(`/template/${templateId}`)
  return data
}

export async function getTradeBank(params) {
  const { data } = await client.get('/trade-bank', { params })
  return data
}

export async function getTradeBankIndustries() {
  const { data } = await client.get('/trade-bank/industries')
  return data
}

export async function getHealth() {
  const { data } = await client.get('/public/health')
  return data
}

export async function smartGenerate(payload) {
  const { data } = await client.post('/generate', payload)
  return data
}

export async function smartGenerateAndDownload(payload, format) {
  const result = await smartGenerate(payload)
  if (format === 'pdf' && !result.pdf_available) {
    const err = new Error(
      result.pdf_error || 'PDF is not available on this server. Choose Word (.docx) instead.'
    )
    err.code = 'PDF_UNAVAILABLE'
    throw err
  }
  await downloadDoc(result.document_id, format)
  return result
}

export async function smartPreviewPdf(payload) {
  const { data } = await client.post('/preview-pdf', payload, { responseType: 'blob' })
  return data
}

export async function smartPreviewDocx(payload) {
  const { data } = await client.post('/preview', payload, { responseType: 'blob' })
  return data
}

export async function importEmployersCsv(formData) {
  const { data } = await client.post('/admin/employers/import-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getEmployerCountryConfig() {
  const { data } = await client.get('/employer-country-config')
  return data
}
