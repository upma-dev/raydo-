import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { toast } from 'sonner'
import Loader from '@food/components/Loader'
import {
  NATIVE_LAST_ROUTE_KEY,
  syncActiveModule,
} from '../shared/utils/activeModule.js'
import lazyWithRetry from '../shared/utils/lazyWithRetry.js'
import { homeForPath, isInstalledApp } from '../shared/utils/appHome.js'
import { isRideModePartner, recoverRideSession } from '@/modules/DeliveryV2/utils/rideModeSession'
import { isModuleAuthenticated } from '@food/utils/auth'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazyWithRetry(() => import('../modules/Food/routes'))
const TaxiApp = lazyWithRetry(() => import('../modules/Taxi/TaxiApp'))
const AuthApp = lazyWithRetry(() => import('../modules/auth/routes'))

const PageLoader = () => <Loader />

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

const RedirectToFoodFranchise = () => {
  const location = useLocation()
  const newPath = location.pathname.replace(/^\/franchise/i, '/food/franchise')
  return <Navigate to={`${newPath}${location.search}`} replace />
}

const LandingPage = lazyWithRetry(() => import('../modules/Taxi/modules/shared/pages/LandingPage'))
const LegalPage = lazyWithRetry(() => import('../modules/Taxi/modules/shared/pages/LegalPage'))
const AdminRouter = lazyWithRetry(() => import('../modules/Food/components/admin/AdminRouter'))

/**
 * "/": the public landing page for website visitors. An installed app (native shell / home-screen app) that opens at "/"
 * goes straight to the home of the app the person was last in, so Raydo / Partner / Driver never start on the landing page.
 */
const RootEntry = () => {
  if (isInstalledApp()) {
    try {
      const home = homeForPath(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '')
      if (home && home !== '/login') return <Navigate to={home} replace />
    } catch { /* storage blocked: show the landing page */ }
  }
  return <Suspense fallback={<PageLoader />}><LandingPage /></Suspense>
}

const SmartFallbackRedirect = () => {
  const location = useLocation()
  const pathname = location.pathname.toLowerCase()

  // 1. Shorthand aliases (/driver, /owner, /delivery, /restaurant, /franchise)
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
  if (pathname.startsWith('/franchise')) {
    const newPath = location.pathname.replace(/^\/franchise/i, '/food/franchise')
    return <Navigate to={`${newPath}${location.search}`} replace />
  }

  // 2. Taxi sub-apps: Driver, Owner, Admin, Franchise, User
  if (pathname.startsWith('/taxi/driver')) {
    return <Navigate to={`/taxi/driver/home${location.search}`} replace />
  }
  if (pathname.startsWith('/taxi/owner')) {
    return <Navigate to={`/taxi/owner/dashboard${location.search}`} replace />
  }
  if (pathname.startsWith('/taxi/admin')) {
    return <Navigate to={`/taxi/admin/dashboard${location.search}`} replace />
  }
  if (pathname.startsWith('/taxi/franchise')) {
    return <Navigate to={`/taxi/franchise-portal${location.search}`} replace />
  }
  if (pathname.startsWith('/taxi')) {
    return <Navigate to={`/taxi/user${location.search}`} replace />
  }

  // 3. Admin portal
  if (pathname.startsWith('/admin')) {
    return <Navigate to={`/admin/food${location.search}`} replace />
  }

  // 4. Food sub-apps: Delivery, Restaurant, Franchise, User
  if (pathname.startsWith('/food/delivery')) {
    return <Navigate to={`/food/delivery/feed${location.search}`} replace />
  }
  if (pathname.startsWith('/food/restaurant')) {
    return <Navigate to={`/food/restaurant${location.search}`} replace />
  }
  if (pathname.startsWith('/food/franchise')) {
    return <Navigate to={`/food/franchise/dashboard${location.search}`} replace />
  }
  if (pathname.startsWith('/food/admin')) {
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
      if (typeof window !== 'undefined' && window.location.pathname.includes('/franchise')) {
        navigate('/food/franchise/login', { replace: true })
        return
      }
      const role = String(event.detail?.role || 'user').toLowerCase()
      // A delivery partner who just logged out (or is in the delivery app) is never sent to the driver app login
      const loggedOutAt = Number(sessionStorage.getItem('deliveryLoggedOutAt') || 0)
      if (
        ['driver', 'owner'].includes(role) &&
        (window.location.pathname.startsWith('/food/delivery') || Date.now() - loggedOutAt < 15000)
      ) {
        // Only the ride-side session went stale (e.g. a photo upload or chat call got a 401) while the partner is still signed
        // in to the delivery app: renew the ride session quietly instead of throwing them out to the login page
        if (Date.now() - loggedOutAt >= 15000 && isModuleAuthenticated('delivery')) {
          recoverRideSession()
          return
        }
        navigate('/food/delivery/login', { replace: true })
        return
      }
      if (role === 'admin') {
        navigate('/admin/login', { replace: true })
      } else if (role === 'delivery') {
        navigate('/food/delivery/login', { replace: true })
      } else if (role === 'restaurant') {
        navigate('/food/restaurant/login', { replace: true })
      } else if (['driver', 'owner', 'bus_driver', 'service_center', 'service_center_staff'].includes(role)) {
        // A delivery partner in Ride & Parcel mode has no driver-app login: get a fresh ride session instead of logging out
        if (role === 'driver' && isRideModePartner()) {
          recoverRideSession().then((recovered) => {
            if (recovered) window.location.reload()
            else navigate('/food/delivery/feed', { replace: true })
          })
          return
        }
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
    const handleMaintenance503 = (event) => {
      const msg = event.detail?.message || 'Service is currently under maintenance. Please try again later.'
      toast.error(msg, { duration: 8000, id: 'maintenance-503-toast' })
    }
    window.addEventListener('app:maintenance-503', handleMaintenance503)
    return () => window.removeEventListener('app:maintenance-503', handleMaintenance503)
  }, [])

  useEffect(() => {
    syncActiveModule(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isNativeLikeShell = isInstalledApp()

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

    if (route.startsWith('/taxi/') || route.startsWith('/food/') || route.startsWith('/admin') || route.startsWith('/login')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      <Route path="/" element={<RootEntry />} />
      <Route path="/landing" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={<PageLoader />}><LegalPage /></Suspense>} />
      <Route path="/terms-and-conditions" element={<Suspense fallback={<PageLoader />}><LegalPage /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><LegalPage /></Suspense>} />
      <Route path="/privacy-policy" element={<Suspense fallback={<PageLoader />}><LegalPage /></Suspense>} />
      <Route path="/refund" element={<Suspense fallback={<PageLoader />}><LegalPage /></Suspense>} />
      <Route path="/cancellation" element={<Suspense fallback={<PageLoader />}><LegalPage /></Suspense>} />
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
      <Route path="/user" element={<Navigate to="/food/user" replace />} />
      <Route path="/user/*" element={<RedirectToFood />} />
      <Route path="/restaurant" element={<Navigate to="/food/restaurant" replace />} />
      <Route path="/restaurant/*" element={<RedirectToFood />} />
      <Route path="/restaurants/*" element={<RedirectToFoodUser />} />
      <Route path="/delivery" element={<Navigate to="/food/delivery/feed" replace />} />
      <Route path="/delivery/*" element={<RedirectToFood />} />
      <Route path="/franchise" element={<Navigate to="/food/franchise/dashboard" replace />} />
      <Route path="/franchise/*" element={<RedirectToFoodFranchise />} />
      <Route path="/driver" element={<Navigate to="/taxi/driver/home" replace />} />
      <Route path="/driver/*" element={<RedirectToTaxiDriver />} />
      <Route path="/owner" element={<Navigate to="/taxi/owner/dashboard" replace />} />
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
