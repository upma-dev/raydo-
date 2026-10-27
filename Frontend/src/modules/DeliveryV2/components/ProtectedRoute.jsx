import { useEffect } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { isModuleAuthenticated } from "@food/utils/auth"

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = isModuleAuthenticated("delivery")

  // Back button / restored tab after a logout: check the login again instead of trusting what is already on screen
  useEffect(() => {
    const recheck = () => {
      if (!isModuleAuthenticated("delivery")) {
        navigate("/food/delivery/login", { replace: true })
      }
    }
    window.addEventListener("popstate", recheck)
    window.addEventListener("pageshow", recheck)
    window.addEventListener("focus", recheck)
    window.addEventListener("storage", recheck)
    return () => {
      window.removeEventListener("popstate", recheck)
      window.removeEventListener("pageshow", recheck)
      window.removeEventListener("focus", recheck)
      window.removeEventListener("storage", recheck)
    }
  }, [navigate])

  if (!isAuthenticated) {
    return <Navigate to="/food/delivery/login" state={{ from: location.pathname }} replace />
  }

  return children
}
