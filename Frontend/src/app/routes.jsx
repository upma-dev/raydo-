import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { toast } from 'sonner'
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons'
import {
  NATIVE_LAST_ROUTE_KEY,
  syncActiveModule,
} from '../shared/utils/activeModule.js'
import lazyWithRetry from '../shared/utils/lazyWithRetry.js'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazyWithRetry(() => import('../modules/Food/routes'))
const TaxiApp = lazyWithRetry(() => import('../modules/Taxi/TaxiApp'))
const AuthApp = lazyWithRetry(() => import('../modules/auth/routes'))

const PageLoader = () => <AppShellSkeleton />

const FoodAppWrapper = () => {
  const location = useLocation()
  const vertical = new URLSearchParams(location.search).get('vertical')

  // Taxi lives under /taxi/* only — never embed it on /food/user.
  if (
    location.pathname.replace(/\/$/, '') === '/food/user' &&
    vertical === 'taxi'
  ) {
    return <Navigate to="/taxi/user" replace />
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const TaxiAppWrapper = () => (
  <Suspense fallback={<PageLoader />}>
    <TaxiApp />
  </Suspense>
)

const RedirectToFood = () => {
  const location = useLocation()
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />
}

const RedirectToFoodUser = () => {
  const location = useLocation()
  return <Navigate to={`/food/user${location.pathname}${location.search}`} replace />
}

const RedirectToTaxiDriver = () => {
  const location = useLocation()
  const newPath = location.pathname.replace(/^\/driver/i, '/taxi/driver')
  return <Navigate to={`${newPath}${location.search}`} replace />
}

const RedirectToTaxiOwner = () => {
  const location = useLocation()
  const newPath = location.pathname.replace(/^\/owner/i, '/taxi/owner')
  return <Navigate to={`${newPath}${location.search}`} replace />
}

const LandingPage = lazyWithRetry(() => import('../modules/Taxi/modules/shared/pages/LandingPage'))
const AdminRouter = lazyWithRetry(() => import('../modules/Food/components/admin/AdminRouter'))

const SmartFallbackRedirect = () => {
  const location = useLocation()
  const pathname = location.pathname.toLowerCase()

  if (pathname.startsWith('/driver')) {
    const newPath = location.pathname.replace(/^\/driver/i, '/taxi/driver')
    return <Navigate to={`${newPath}${location.search}`} replace />
  }
  if (pathname.startsWith('/owner')) {
    const newPath = location.pathname.replace(/^\/owner/i, '/taxi/owner')
    return <Navigate to={`${newPath}${location.search}`} replace />
  }
  if (pathname.startsWith('/delivery')) {
    const newPath = location.pathname.replace(/^\/delivery/i, '/food/delivery')
    return <Navigate to={`${newPath}${location.search}`} replace />
  }
  if (pathname.startsWith('/restaurant')) {
    const newPath = location.pathname.replace(/^\/restaurant/i, '/food/restaurant')
    return <Navigate to={`${newPath}${location.search}`} replace />
  }
  if (pathname.startsWith('/taxi')) {
    return <Navigate to={`/taxi/user${location.search}`} replace />
  }
  if (pathname.startsWith('/admin')) {
    return <Navigate to={`/admin/food${location.search}`} replace />
  }
  if (pathname.startsWith('/food')) {
    return <Navigate to={`/food/user${location.search}`} replace />
  }

  // Any unmatched / invalid route redirects to Landing Page (/)
  return <Navigate to="/" replace />
}

const AppRoutes = () => {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handleGlobalAuthStale = (event) => {
      const role = String(event.detail?.role || 'user').toLowerCase()
      if (role === 'admin') {
        navigate('/admin/login', { replace: true })
      } else if (role === 'delivery') {
        navigate('/food/delivery/login', { replace: true })
      } else if (role === 'restaurant') {
        navigate('/food/restaurant/login', { replace: true })
      } else if (['driver', 'owner', 'bus_driver', 'service_center', 'service_center_staff'].includes(role)) {
        navigate(role === 'owner' ? '/taxi/owner/login' : '/taxi/driver/login', { replace: true })
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('userToken')
        localStorage.removeItem('user_accessToken')
        localStorage.removeItem('user_authenticated')
        localStorage.removeItem('user_user')
        localStorage.removeItem('userInfo')
        toast.error('Session expired. Please log in again.')
        navigate('/food/user/auth/login', { replace: true })
      }
    }

    window.addEventListener('app:auth-stale', handleGlobalAuthStale)
    return () => window.removeEventListener('app:auth-stale', handleGlobalAuthStale)
  }, [navigate])

  useEffect(() => {
    syncActiveModule(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`

    // Do NOT persist transient ride-flow routes that rely on React Router state.
    // If the app reopens on these pages the state is lost, showing stale data.
    const TRANSIENT_ROUTE_SEGMENTS = [
      '/ride/select-vehicle',
      '/ride/select-location',
      '/ride/searching',
      '/ride/tracking',
      '/ride/complete',
      '/ride/chat',
      '/parcel/searching',
      '/parcel/tracking',
      '/parcel/details',
      '/parcel/contacts',
      '/intercity/details',
      '/intercity/confirm',
      '/rental/vehicle',
      '/rental/schedule',
      '/rental/kyc',
      '/rental/deposit',
      '/rental/confirmed',
    ]
    const isTransient = TRANSIENT_ROUTE_SEGMENTS.some(seg => route.includes(seg))
    if (isTransient) return

    if (route.startsWith('/taxi/') || route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      <Route path="/" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
      <Route path="/landing" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
      <Route path="/login/*" element={<Suspense fallback={<PageLoader />}><AuthApp /></Suspense>} />
      <Route path="/food/*" element={<FoodAppWrapper />} />
      <Route path="/taxi/*" element={<TaxiAppWrapper />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRouter />
          </Suspense>
        }
      />
      <Route path="/user/*" element={<RedirectToFood />} />
      <Route path="/restaurant/*" element={<RedirectToFood />} />
      <Route path="/restaurants/*" element={<RedirectToFoodUser />} />
      <Route path="/delivery/*" element={<RedirectToFood />} />
      <Route path="/driver/*" element={<RedirectToTaxiDriver />} />
      <Route path="/owner/*" element={<RedirectToTaxiOwner />} />
      <Route path="/usermain/*" element={<RedirectToFood />} />
      <Route path="/profile/*" element={<RedirectToFoodUser />} />
      <Route path="/cart/*" element={<RedirectToFoodUser />} />
      <Route path="/orders/*" element={<RedirectToFoodUser />} />
      <Route path="*" element={<SmartFallbackRedirect />} />
    </Routes>
  )
}

export default AppRoutes
