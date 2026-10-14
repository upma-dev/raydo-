import { Navigate, useLocation } from "react-router-dom"
import { isModuleAuthenticated, isFranchiseLogin } from "@food/utils/auth"

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const isAuthenticated = isModuleAuthenticated("admin")

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  // Franchise partners have their own portal; the admin panel is for platform admins only
  if (isFranchiseLogin()) {
    return <Navigate to="/food/franchise/dashboard" replace />
  }

  return children
}
