import { Routes, Route, Navigate } from "react-router-dom"
import { Suspense, lazy } from "react"
import Loader from "@food/components/Loader"

const FranchiseApply = lazy(() => import("@food/pages/franchise/FranchiseApply"))

export default function FranchisePortalRouter() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="apply" element={<FranchiseApply />} />
        {/* We can add franchise login here later: <Route path="login" element={<FranchiseLogin />} /> */}
        <Route path="*" element={<Navigate to="apply" replace />} />
      </Routes>
    </Suspense>
  )
}
