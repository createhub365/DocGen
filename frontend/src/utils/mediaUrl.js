export function resolveMediaUrl(url) {
  if (!url) return null
  if (/^(https?:|blob:|data:)/i.test(url)) return url

  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  const origin = apiBase.replace(/\/api\/?$/, '')
  const path = url.startsWith('/') ? url : `/${url}`
  return `${origin}${path}`
}

export function templateThumbnailUrl(templateId) {
  return resolveMediaUrl(`/api/templates/${templateId}/thumbnail`)
}

function probeImage(url) {
  return fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
    .then((res) => res.ok)
    .catch(() => false)
}

export { probeImage }
