import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import OfflineBanner from '../shared/components/OfflineBanner'
import GlobalLanguageSelector from '../shared/components/GlobalLanguageSelector'

// A floating globe on every screen. Screens whose navbar already carries a language button keep only that one.
function FloatingLanguageSelector() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const check = () => {
      const inNavbar = document.querySelectorAll('.global-lang-selector:not(.floating-lang)').length > 0
      setHidden(inNavbar)
    }
    check()
    const timer = window.setInterval(check, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <GlobalLanguageSelector
      variant="light"
      className="floating-lang"
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: 40,
        display: hidden ? 'none' : 'inline-flex',
      }}
    />
  )
}

function App() {
  const { pathname } = useLocation()

  // A page that locked body scrolling and left without unlocking (modal open during navigation) must not freeze the next page
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { style } = document.body
      if (style.overflow === 'hidden' && !document.querySelector('[data-scroll-lock], [role="dialog"]')) {
        style.overflow = ''
        if (style.position === 'fixed') {
          style.position = ''
          style.top = ''
          style.width = ''
        }
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [pathname])
  return (
    // resetKey: navigating to another page clears a previous crash instead of keeping the error screen
    <ErrorBoundary resetKey={pathname}>
      <OfflineBanner />
      <ThemeSync />
      <AppRoutes />
      <FloatingLanguageSelector />
    </ErrorBoundary>
  )
}

export default App
