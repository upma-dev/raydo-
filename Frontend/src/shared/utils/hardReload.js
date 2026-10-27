/**
 * Reload that cannot be answered from a cached page.
 *
 * After a deploy the old index.html still names JS files that no longer exist. A plain location.reload() can be answered
 * from the browser / WebView cache with that same old page, so the error comes back and "Reload" seems to do nothing.
 * This clears the cache storage and opens the SAME address with a new ?__v= value, which can never be a cached answer.
 */
export const CACHE_BUST_PARAM = '__v'

export const hardReload = async () => {
  if (typeof window === 'undefined') return
  // The "already reloaded once" flags are left alone here, so an automatic reload can never loop; only the person pressing
  // "Reload Page" clears them (ErrorBoundary.handleReload).
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map((key) => window.caches.delete(key)))
    }
  } catch { /* cache storage unavailable */ }

  try {
    const url = new URL(window.location.href)
    url.searchParams.set(CACHE_BUST_PARAM, String(Date.now()))
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}

/** Takes the ?__v= value back out of the address bar once the fresh page has loaded. */
export const stripCacheBustParam = () => {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(CACHE_BUST_PARAM)) return
    url.searchParams.delete(CACHE_BUST_PARAM)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch { /* leave the address as it is */ }
}
