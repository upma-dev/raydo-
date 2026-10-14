import { useLocation } from 'react-router-dom'
import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import OfflineBanner from '../shared/components/OfflineBanner'
import GlobalLanguageSelector from '../shared/components/GlobalLanguageSelector'

function App() {
  const { pathname } = useLocation()
  return (
    // resetKey: navigating to another page clears a previous crash instead of keeping the error screen
    <ErrorBoundary resetKey={pathname}>
      <OfflineBanner />
      <ThemeSync />
      <AppRoutes />
    </ErrorBoundary>
  )
}

export default App

