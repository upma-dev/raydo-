/**
 * Which app a path belongs to, and that app's own home page. Used so "Go to Home" and the app start never drop a person on
 * the public landing page ("/") when they are inside Raydo, Raydo Partner, the driver app, a restaurant or an admin panel.
 */
export const homeForPath = (rawPath = '') => {
  const p = String(rawPath || '').split('?')[0].split('#')[0].toLowerCase()
  if (p.startsWith('/food/delivery') || p.startsWith('/delivery')) return '/food/delivery'
  if (p.startsWith('/food/restaurant') || p.startsWith('/restaurant')) return '/food/restaurant'
  if (p.startsWith('/food/franchise') || p.startsWith('/franchise')) return '/food/franchise/dashboard'
  if (p.startsWith('/admin') || p.startsWith('/food/admin')) return '/admin'
  if (p.startsWith('/taxi/driver') || p.startsWith('/driver')) return '/taxi/driver/home'
  if (p.startsWith('/taxi/owner') || p.startsWith('/owner')) return '/taxi/owner/dashboard'
  if (p.startsWith('/taxi/admin')) return '/taxi/admin/dashboard'
  if (p.startsWith('/taxi/franchise')) return '/taxi/franchise-portal'
  if (p.startsWith('/taxi')) return '/taxi/user'
  if (p.startsWith('/food') || p.startsWith('/user')) return '/food/user'
  if (p.startsWith('/login')) return '/login'
  return null
}

/** Installed app: native WebView shell, or a home-screen / standalone web app (not a normal browser tab). */
export const isInstalledApp = () => {
  if (typeof window === 'undefined') return false
  try {
    const protocol = String(window.location?.protocol || '').toLowerCase()
    return (
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches) ||
      window.navigator?.standalone === true
    )
  } catch {
    return false
  }
}
