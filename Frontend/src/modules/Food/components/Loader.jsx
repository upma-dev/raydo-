import { useLocation } from "react-router-dom"
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons"

// The customer app shell (header, banners, cards) only makes sense on the customer's browsing screens.
// Login / sign-up screens and every other module (restaurant, delivery, driver, franchise, admin) get a plain spinner.
const isCustomerBrowsePath = (pathname = "") =>
  /^\/food\/user(\/|$)/i.test(pathname) && !/(login|sign-?in|sign-?up|signup|auth|otp|forgot)/i.test(pathname)

export function PlainLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0a0a0a]">
      <span
        className="h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-[#EB590E]"
        role="status"
        aria-label="Loading"
      />
    </div>
  )
}

export default function Loader() {
  const { pathname } = useLocation()
  return isCustomerBrowsePath(pathname) ? <AppShellSkeleton /> : <PlainLoader />
}
