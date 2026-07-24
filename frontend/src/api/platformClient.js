import axios from 'axios'

const PLATFORM_TOKEN_KEY = 'docgen_platform_access_token'

function getStoredToken() {
  try {
    return sessionStorage.getItem(PLATFORM_TOKEN_KEY)
  } catch {
    return null
  }
}

function setStoredToken(token) {
  try {
    if (token) sessionStorage.setItem(PLATFORM_TOKEN_KEY, token)
    else sessionStorage.removeItem(PLATFORM_TOKEN_KEY)
  } catch {
    /* private browsing */
  }
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const platformBase = apiBase.endsWith('/platform') ? apiBase : `${apiBase}/platform`

const platformClient = axios.create({
  baseURL: platformBase,
  withCredentials: true,
})

platformClient.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

platformClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setStoredToken(null)
      try {
        sessionStorage.removeItem('platform_role')
        sessionStorage.removeItem('platform_username')
      } catch {
        /* ignore */
      }
      const path = window.location.pathname
      const onPublicPlatformAuth =
        path.startsWith('/platform/login') || path.startsWith('/platform/signup')
      if (!onPublicPlatformAuth) {
        window.location.href = '/platform/login'
      }
    }
    return Promise.reject(error)
  }
)

export function clearPlatformAuthToken() {
  setStoredToken(null)
}

export function storePlatformAuthToken(token) {
  setStoredToken(token)
}

export default platformClient

export async function platformSignup(payload) {
  const { data } = await platformClient.post('/signup', payload)
  if (data.access_token) setStoredToken(data.access_token)
  return data
}

export async function platformLogin(username, password) {
  const { data } = await platformClient.post('/login', { username, password })
  if (data.access_token) setStoredToken(data.access_token)
  return data
}

/**
 * Clear only the platform_access_token httpOnly cookie via platform logout.
 * Does not call legacy /api/auth/logout (separate cookie space).
 */
export async function platformLogout() {
  try {
    await platformClient.post('/logout')
  } catch {
    /* best-effort cookie clear */
  } finally {
    setStoredToken(null)
  }
}

export async function platformGetMe() {
  const { data } = await platformClient.get('/me')
  return data
}

export async function listDocumentTypes() {
  const { data } = await platformClient.get('/document-types/')
  return data
}

export async function createDocumentType(payload) {
  const { data } = await platformClient.post('/document-types/', payload)
  return data
}

export async function getDocumentType(documentTypeId) {
  const { data } = await platformClient.get(`/document-types/${documentTypeId}`)
  return data
}

export async function listFlowHistory(documentTypeId) {
  const { data } = await platformClient.get(`/${documentTypeId}/flow/history`)
  return data
}

export async function createFlow(documentTypeId) {
  const { data } = await platformClient.post(`/${documentTypeId}/flow`, {})
  return data
}

export async function createDraftFromPublished(documentTypeId) {
  const { data } = await platformClient.post(`/${documentTypeId}/flow/new-draft`)
  return data
}

export async function listFlowSteps(flowConfigId) {
  const { data } = await platformClient.get(`/${flowConfigId}/steps`)
  return data
}

export async function addFlowStep(flowConfigId, payload) {
  const { data } = await platformClient.post(`/${flowConfigId}/steps`, payload)
  return data
}

export async function updateFlowStep(stepId, payload) {
  const { data } = await platformClient.patch(`/steps/${stepId}`, payload)
  return data
}

export async function deleteFlowStep(stepId) {
  await platformClient.delete(`/steps/${stepId}`)
}

export async function publishFlow(flowConfigId) {
  const { data } = await platformClient.post(`/${flowConfigId}/publish`)
  return data
}

export async function listFieldDefinitions(stepId) {
  const { data } = await platformClient.get(`/steps/${stepId}/fields`)
  return data
}

export async function addFieldDefinition(stepId, payload) {
  const { data } = await platformClient.post(`/steps/${stepId}/fields`, payload)
  return data
}

export async function updateFieldDefinition(fieldId, payload) {
  const { data } = await platformClient.patch(`/fields/${fieldId}`, payload)
  return data
}

export async function deleteFieldDefinition(fieldId) {
  await platformClient.delete(`/fields/${fieldId}`)
}

export async function listOrgTemplates(documentTypeId) {
  const { data } = await platformClient.get(`/${documentTypeId}/templates`)
  return data
}

export async function uploadOrgTemplate(documentTypeId, file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await platformClient.post(`/${documentTypeId}/templates`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getPublishedFlow(documentTypeId) {
  const { data } = await platformClient.get(`/${documentTypeId}/flow/published`)
  return data
}

export async function listPlaceholderMappings(templateId) {
  const { data } = await platformClient.get(`/templates/${templateId}/mappings`)
  return data
}

export async function savePlaceholderMappings(templateId, mappings) {
  const { data } = await platformClient.post(`/templates/${templateId}/mappings`, {
    mappings,
  })
  return data
}

export async function generateFieldsFromPlaceholders(templateId) {
  const { data } = await platformClient.post(
    `/templates/${templateId}/generate-fields-from-placeholders`
  )
  return data
}

export async function generateOrgDocument(documentTypeId, payload) {
  const { data } = await platformClient.post(`/${documentTypeId}/generate`, payload)
  return data
}

export async function listGeneratedDocuments() {
  const { data } = await platformClient.get('/generated')
  return data
}

export async function downloadGeneratedDocument(docId, format = 'docx') {
  const response = await platformClient.get(`/generated/${docId}/download`, {
    params: { format },
    responseType: 'blob',
  })
  const disposition = response.headers['content-disposition']
  let filename = `document.${format === 'pdf' ? 'pdf' : 'docx'}`
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

/**
 * Phase 9 pattern: list templates for a type, then GET mappings per template
 * to learn is_complete. Returns { ready, reason, completeTemplateIds }.
 */
export async function getDocumentTypeGenerateReadiness(documentType) {
  if (!documentType?.has_published_flow) {
    return {
      ready: false,
      reason: 'Publish a flow first',
      completeTemplateIds: [],
    }
  }
  const templates = await listOrgTemplates(documentType.id)
  const completeTemplateIds = []
  for (const template of templates) {
    try {
      const mappings = await listPlaceholderMappings(template.id)
      if (mappings.is_complete) completeTemplateIds.push(template.id)
    } catch {
      /* treat as incomplete */
    }
  }
  if (!completeTemplateIds.length) {
    return {
      ready: false,
      reason: "Upload and complete a template's placeholder mapping first",
      completeTemplateIds: [],
    }
  }
  return { ready: true, reason: null, completeTemplateIds }
}

export async function listPresets() {
  const { data } = await platformClient.get('/presets')
  return data
}

export async function installPreset(presetKey) {
  const { data } = await platformClient.post(`/presets/${presetKey}/install`)
  return data
}

export async function readPlatformErrorDetail(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const message = detail.message || 'Request failed'
    const invalid = detail.invalid_field_keys
    if (Array.isArray(invalid) && invalid.length) {
      return `${message}: ${invalid.join(', ')}`
    }
    return message
  }
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
  }
  return null
}

/**
 * Mirror backend FIXED_STEP_OUTPUT_KEYS + FieldDefinition keys
 * (routers/platform_scope.resolvable_field_keys_for_published_flow).
 */
export const FIXED_STEP_OUTPUT_KEYS = {
  country_selector: ['country.name', 'country.code'],
  party_selector: ['party.name', 'party.email', 'party.address'],
}

export function buildResolvableFieldKeyOptions(stepsWithFields) {
  const keys = new Map()
  for (const step of stepsWithFields || []) {
    for (const field of step.fields || []) {
      if (!field?.field_key) continue
      keys.set(field.field_key, {
        value: field.field_key,
        label: `${field.field_label || field.field_key} (${field.field_key})`,
        group: 'Flow fields',
      })
    }
    const fixed = FIXED_STEP_OUTPUT_KEYS[step.step_type] || []
    for (const key of fixed) {
      if (keys.has(key)) continue
      keys.set(key, {
        value: key,
        label: key,
        group: 'Step outputs',
      })
    }
  }
  return Array.from(keys.values()).sort((a, b) => a.value.localeCompare(b.value))
}

/** Derive a URL-safe slug from an organization name (backend requires slug). */
export function slugifyOrgName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
