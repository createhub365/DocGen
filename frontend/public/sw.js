/* DocFlow PWA — minimal service worker for installability.
 * Caches static app-shell assets only. API/auth/generation stay network-only.
 * Offline document workflows are NOT a goal.
 */
const CACHE_NAME = 'docflow-shell-v1'
const PRECACHE = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // Never intercept API — live backend required
  if (url.pathname.startsWith('/api')) return

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (
            res &&
            res.ok &&
            (url.pathname.startsWith('/assets/') ||
              /\.(?:js|css|png|svg|ico|webmanifest)$/i.test(url.pathname))
          ) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone))
          }
          return res
        })
        .catch(() => cached)

      return cached || networkFetch
    })
  )
})
