import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import OfflineBanner from '../shared/components/OfflineBanner'
import GlobalLanguageSelector from '../shared/components/GlobalLanguageSelector'

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <ThemeSync />
      <AppRoutes />
    </ErrorBoundary>
  )
}

export default App

