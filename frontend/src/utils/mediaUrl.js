export function resolveMediaUrl(url) {
  if (!url) return null
  if (/^(https?:|blob:|data:)/i.test(url)) return url

  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  const origin = apiBase.replace(/\/api\/?$/, '')
  const path = url.startsWith('/') ? url : `/${url}`
  return `${origin}${path}`
}
