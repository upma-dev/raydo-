import { useLocation, useNavigate } from "react-router-dom"
import { Clock3, ShieldCheck, FileCheck2, BellRing } from "lucide-react"

/**
 * Shown right after a new delivery partner submits registration: documents are with admin, verification is pending.
 */
export default function VerificationPending() {
  const navigate = useNavigate()
  const location = useLocation()
  const phone = location.state?.phone || ""

  const steps = [
    { icon: FileCheck2, title: "Documents submitted", sub: "Your details and documents reached us", done: true },
    { icon: ShieldCheck, title: "Verification in progress", sub: "Admin is checking your documents", done: false },
    { icon: BellRing, title: "Approval", sub: "You will be notified once approved", done: false },
  ]

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 flex items-center justify-center font-poppins">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50">
          <Clock3 className="h-10 w-10 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Verification Pending</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your registration is submitted. Our team will verify your documents and approve your account soon.
        </p>
        {phone ? (
          <p className="mt-3 inline-block rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            +91 {phone}
          </p>
        ) : null}

        <div className="mt-6 space-y-3 text-left">
          {steps.map(({ icon: Icon, title, sub, done }) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="text-xs text-gray-500">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate("/food/delivery/login", { replace: true })}
          className="mt-6 w-full rounded-2xl bg-black py-3.5 text-sm font-bold text-white active:scale-95 transition-all"
        >
          Check status / Login
        </button>
      </div>
    </main>
  )
}
