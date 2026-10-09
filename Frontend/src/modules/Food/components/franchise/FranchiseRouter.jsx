import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const FranchiseApplyPage = lazy(() => import("@food/pages/franchise/FranchiseApplyPage"));
const FranchiseSuccessPage = lazy(() => import("@food/pages/franchise/FranchiseSuccessPage"));
const AdminLogin = lazy(() => import("@food/pages/admin/auth/AdminLogin"));
import FranchiseDashboardUnified from "@food/pages/franchise/FranchiseDashboardUnified";

function Loader() {
  return (
    <div style={{ minHeight: '100vh', background: '#070A1F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(49,92,255,0.3)', borderTopColor: '#315CFF', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function FranchiseRouter() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route index element={<Navigate to="apply" replace />} />
        <Route path="apply" element={<FranchiseApplyPage />} />
        <Route path="success" element={<FranchiseSuccessPage />} />
        <Route path="login" element={<AdminLogin />} />
        <Route path="dashboard/*" element={<FranchiseDashboardUnified />} />
        <Route path="partner-dashboard/*" element={<FranchiseDashboardUnified />} />
        <Route path="*" element={<Navigate to="apply" replace />} />
      </Routes>
    </Suspense>
  );
}
