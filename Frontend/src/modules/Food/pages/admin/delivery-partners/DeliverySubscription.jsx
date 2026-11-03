import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"

const SERVICES = [
  { key: "food", label: "Food delivery", hint: "Receiving and accepting food orders" },
  { key: "ride", label: "Two-wheeler ride", hint: "Bike / scooter rides taken from the delivery app" },
  { key: "parcel", label: "Parcel delivery", hint: "Parcels taken from the delivery app" },
]

const MODE_OPTIONS = {
  food: [
    { value: "commissionOnly", label: "Off - no pass needed" },
    { value: "subscriptionOnly", label: "Pass required to get food orders" },
  ],
  ride: [
    { value: "commissionOnly", label: "Off - usual commission" },
    { value: "subscriptionOnly", label: "Pass required (no commission)" },
    { value: "both", label: "Pass optional (no commission with pass)" },
  ],
}
MODE_OPTIONS.parcel = MODE_OPTIONS.ride

const serviceLabel = (key) => SERVICES.find((s) => s.key === key)?.label || key
const formatDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-")
const apiMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback

const EMPTY_PLAN = { service_type: "food", name: "", amount: "", duration: "", description: "", how_it_works: "" }
const inputClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
const labelClass = "mb-1 block text-xs font-semibold text-gray-500"

const STATE_STYLE = {
  active: "bg-emerald-50 text-emerald-700",
  upcoming: "bg-blue-50 text-blue-700",
  expired: "bg-gray-100 text-gray-500",
  cancelled: "bg-rose-50 text-rose-600",
}

export default function DeliverySubscription() {
  const [loading, setLoading] = useState(true)
  const [modes, setModes] = useState({ food: "commissionOnly", ride: "commissionOnly", parcel: "commissionOnly" })
  const [plans, setPlans] = useState([])
  const [subscribers, setSubscribers] = useState({ results: [], summary: { activeNow: 0, activeByService: {}, total: 0 } })
  const [filters, setFilters] = useState({ service: "", state: "" })
  const [planForm, setPlanForm] = useState(null) // null = closed, else the form values (with _id when editing)
  const [saving, setSaving] = useState(false)
  const [grant, setGrant] = useState({ phone: "", planId: "" })
  const [granting, setGranting] = useState(false)

  const loadSubscribers = useCallback(async (nextFilters) => {
    try {
      const response = await adminAPI.getDeliverySubscribers({ limit: 50, ...nextFilters })
      setSubscribers(response?.data?.data || subscribers)
    } catch (error) {
      toast.error(apiMessage(error, "Could not load subscribers"))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      const [overview] = await Promise.all([adminAPI.getDeliverySubscriptions(), loadSubscribers({})])
      const data = overview?.data?.data || {}
      if (data.modes) setModes(data.modes)
      setPlans(data.plans || [])
    } catch (error) {
      toast.error(apiMessage(error, "Could not load subscription settings"))
    } finally {
      setLoading(false)
    }
  }, [loadSubscribers])

  useEffect(() => { loadAll() }, [loadAll])

  const changeMode = async (service, value) => {
    const previous = modes[service]
    setModes((current) => ({ ...current, [service]: value }))
    try {
      const response = await adminAPI.updateDeliverySubscriptionModes({ [service]: value })
      setModes(response?.data?.data?.modes || { ...modes, [service]: value })
      toast.success(`${serviceLabel(service)} updated`)
    } catch (error) {
      setModes((current) => ({ ...current, [service]: previous }))
      toast.error(apiMessage(error, "Could not update the mode"))
    }
  }

  const savePlan = async () => {
    const form = planForm
    if (!form.name.trim() || form.amount === "" || !form.duration) {
      toast.error("Name, price and days are required")
      return
    }
    try {
      setSaving(true)
      const body = {
        name: form.name, amount: Number(form.amount), duration: Number(form.duration),
        description: form.description, how_it_works: form.how_it_works,
      }
      if (form._id) await adminAPI.updateDeliverySubscriptionPlan(form._id, body)
      else await adminAPI.createDeliverySubscriptionPlan({ ...body, service_type: form.service_type })
      toast.success(form._id ? "Plan updated" : "Plan created")
      setPlanForm(null)
      const overview = await adminAPI.getDeliverySubscriptions()
      setPlans(overview?.data?.data?.plans || [])
    } catch (error) {
      toast.error(apiMessage(error, "Could not save the plan"))
    } finally {
      setSaving(false)
    }
  }

  const togglePlan = async (plan) => {
    const next = plan.active === false
    try {
      await adminAPI.updateDeliverySubscriptionPlan(plan._id, { active: next })
      setPlans((current) => current.map((item) => (item._id === plan._id ? { ...item, active: next } : item)))
      toast.success(next ? "Plan is on sale again" : "Plan hidden from partners")
    } catch (error) {
      toast.error(apiMessage(error, "Could not update the plan"))
    }
  }

  const giveAPass = async () => {
    if (!grant.phone.trim() || !grant.planId) {
      toast.error("Enter the partner's phone number and choose a plan")
      return
    }
    try {
      setGranting(true)
      await adminAPI.grantDeliverySubscription({ phone: grant.phone, planId: grant.planId })
      toast.success("Pass given to the partner")
      setGrant({ phone: "", planId: "" })
      await loadSubscribers(filters)
    } catch (error) {
      toast.error(apiMessage(error, "Could not give the pass"))
    } finally {
      setGranting(false)
    }
  }

  const cancelPass = async (row) => {
    const reason = window.prompt(`Cancel "${row.name}" of ${row.partner?.name || "this partner"}?\nMoney paid from the Pocket is not returned automatically.\n\nReason (optional):`)
    if (reason === null) return
    try {
      await adminAPI.cancelDeliverySubscription(row.id, reason)
      toast.success("Pass cancelled")
      await loadSubscribers(filters)
    } catch (error) {
      toast.error(apiMessage(error, "Could not cancel the pass"))
    }
  }

  const changeFilter = (patch) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    loadSubscribers(next)
  }

  const plansByService = useMemo(
    () => SERVICES.map((service) => ({ ...service, items: plans.filter((plan) => plan.service_type === service.key) })),
    [plans],
  )
  const activePlans = plans.filter((plan) => plan.active !== false)

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Delivery Subscription</h1>
        <p className="mt-1 text-sm text-gray-500">Passes that delivery partners buy for food orders, two-wheeler rides and parcels.</p>
      </div>

      {/* MODES */}
      <div className="grid gap-4 md:grid-cols-3">
        {SERVICES.map((service) => (
          <div key={service.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">{service.label}</p>
            <p className="mb-3 text-xs text-gray-500">{service.hint}</p>
            <select value={modes[service.key]} onChange={(e) => changeMode(service.key, e.target.value)} className={inputClass}>
              {MODE_OPTIONS[service.key].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <p className="mt-2 text-[11px] text-gray-400">{subscribers.summary?.activeByService?.[service.key] || 0} partners hold a running pass</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-xs leading-relaxed text-gray-600">
        <p className="mb-1 font-bold text-gray-700">How it works</p>
        <p><b>Off:</b> no pass is needed or sold. Rides and parcels pay the usual commission.</p>
        <p><b>Pass required:</b> a partner without a running pass is not offered that work and cannot accept it. Rides and parcels pay no commission while the pass runs.</p>
        <p><b>Pass optional</b> (rides and parcels): with a running pass no commission, without one the usual commission.</p>
        <p className="mt-1">Partners buy a pass from their Pocket balance in the delivery app (Profile &gt; Subscription). A renewal starts when the running pass ends. Ride and parcel passes need the partner to have joined Ride &amp; Parcel.</p>
        <p className="mt-1">Taxi driver (Raydo Sarthi) plans are managed separately in Taxi admin &gt; Drivers &gt; Subscription.</p>
      </div>

      {/* PLANS */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-800">Plans ({plans.length})</h2>
          <button type="button" onClick={() => setPlanForm({ ...EMPTY_PLAN })} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={15} /> Add plan
          </button>
        </div>
        {plansByService.map((group) => (
          <div key={group.key}>
            <p className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">{group.label}</p>
            {group.items.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-400">No plans yet.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {group.items.map((plan) => (
                  <div key={plan._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{plan.name}</p>
                      <p className="text-xs text-gray-500">Rs {Number(plan.amount || 0).toFixed(2)} for {plan.duration} day{plan.duration === 1 ? "" : "s"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2.5 py-0.5 text-xs font-medium ${plan.active !== false ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {plan.active !== false ? "On sale" : "Hidden"}
                      </span>
                      <button type="button" onClick={() => setPlanForm({ ...EMPTY_PLAN, ...plan, amount: plan.amount, duration: plan.duration, description: plan.description || "", how_it_works: plan.how_it_works || "" })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Edit</button>
                      <button type="button" onClick={() => togglePlan(plan)} className="rounded-lg border border-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
                        {plan.active !== false ? "Hide" : "Put on sale"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* SUBSCRIBERS */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Subscribed partners</h2>
            <p className="text-xs text-gray-500">{subscribers.summary?.activeNow || 0} running now / {subscribers.summary?.total || 0} in this list</p>
          </div>
          <div className="flex gap-2">
            <select value={filters.service} onChange={(e) => changeFilter({ service: e.target.value })} className={`${inputClass} !w-auto`}>
              <option value="">All work</option>
              {SERVICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={filters.state} onChange={(e) => changeFilter({ state: e.target.value })} className={`${inputClass} !w-auto`}>
              <option value="">All states</option>
              <option value="active">Running</option>
              <option value="upcoming">Upcoming</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Give a pass for free */}
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50/60 p-4">
          <div className="min-w-[180px] flex-1">
            <label className={labelClass}>Give a free pass - partner phone</label>
            <input value={grant.phone} onChange={(e) => setGrant({ ...grant, phone: e.target.value })} placeholder="10-digit phone number" className={inputClass} />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className={labelClass}>Plan</label>
            <select value={grant.planId} onChange={(e) => setGrant({ ...grant, planId: e.target.value })} className={inputClass}>
              <option value="">Choose a plan</option>
              {activePlans.map((plan) => <option key={plan._id} value={plan._id}>{serviceLabel(plan.service_type)} - {plan.name}</option>)}
            </select>
          </div>
          <button type="button" onClick={giveAPass} disabled={granting} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {granting ? "Giving..." : "Give pass"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Work</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Valid</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(subscribers.results || []).length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No passes found.</td></tr>
              ) : subscribers.results.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-gray-900">{row.partner?.name || "Partner"} <span className="text-gray-400">{row.partner?.phone}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{serviceLabel(row.service)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{row.purchaseSource === "admin" ? "Free (admin)" : `Rs ${Number(row.amount || 0).toFixed(2)}`}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.startedAt)} - {formatDate(row.expiresAt)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded px-2.5 py-0.5 text-xs font-medium capitalize ${STATE_STYLE[row.state] || STATE_STYLE.expired}`}>{row.state}</span></td>
                  <td className="px-4 py-3 text-right">
                    {(row.state === "active" || row.state === "upcoming") && (
                      <button type="button" onClick={() => cancelPass(row)} className="text-xs font-semibold text-rose-600 hover:underline">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PLAN FORM */}
      {planForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{planForm._id ? "Edit plan" : "Add plan"}</h3>
              <button type="button" onClick={() => setPlanForm(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="grid gap-4">
              <div>
                <label className={labelClass}>Pass is for *</label>
                <select value={planForm.service_type} disabled={Boolean(planForm._id)} onChange={(e) => setPlanForm({ ...planForm, service_type: e.target.value })} className={`${inputClass} disabled:bg-gray-50`}>
                  {SERVICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Name *</label>
                <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="e.g. Weekly Pass" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Price (Rs) *</label>
                  <input type="number" min="0" step="0.01" value={planForm.amount} onChange={(e) => setPlanForm({ ...planForm, amount: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Days *</label>
                  <input type="number" min="1" value={planForm.duration} onChange={(e) => setPlanForm({ ...planForm, duration: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Short description</label>
                <input value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>How it works (shown to partners)</label>
                <textarea value={planForm.how_it_works} onChange={(e) => setPlanForm({ ...planForm, how_it_works: e.target.value })} className={`${inputClass} min-h-[70px] resize-none`} />
              </div>
              {planForm._id && <p className="text-xs text-gray-400">Passes already sold keep their old price and days. Changes apply to new purchases.</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setPlanForm(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="button" onClick={savePlan} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? "Saving..." : "Save plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
