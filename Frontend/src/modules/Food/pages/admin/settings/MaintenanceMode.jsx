import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  X,
  Edit3,
  MapPin,
  ShieldAlert,
  Wrench,
  Globe,
  CheckCircle2,
  Clock,
  Sliders,
  Utensils,
  Car
} from "lucide-react"
import { Button } from "@food/components/ui/button"
import api from "@food/api"
import toast from "react-hot-toast"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Label } from "@food/components/ui/label"
import { Input } from "@food/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@food/components/ui/select"
import { Switch } from "@food/components/ui/switch"

export default function MaintenanceMode() {
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [foodZones, setFoodZones] = useState([])
  const [taxiZones, setTaxiZones] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSetting, setEditingSetting] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    module: "food",
    serviceType: "all",
    zoneId: "all",
    isMaintenance: true,
    maintenanceMessage: "Service is currently under maintenance. Please try again later.",
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [settingsRes, zonesRes] = await Promise.all([
        api.get("/maintenance", { contextModule: "admin" }).catch((err) => {
          console.error("Error fetching maintenance settings:", err)
          return null
        }),
        api.get("/maintenance/public/target-zones").catch(() => api.get("/maintenance/target-zones")).catch((err) => {
          console.error("Error fetching target zones:", err)
          return null
        })
      ])

      if (settingsRes?.data?.success) {
        setSettings(Array.isArray(settingsRes.data.data) ? settingsRes.data.data : [])
      }

      let fz = []
      let tz = []

      if (zonesRes?.data?.success && zonesRes.data?.data) {
        fz = zonesRes.data.data.foodZones || []
        tz = zonesRes.data.data.taxiZones || []
      }

      setFoodZones(fz)
      setTaxiZones(tz)
    } catch (error) {
      console.error(error)
      toast.error("Failed to load maintenance settings")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (setting = null) => {
    if (setting) {
      setEditingSetting(setting)
      setFormData({
        module: setting.module || "food",
        serviceType: setting.serviceType || "all",
        zoneId: setting.zoneId?._id ? String(setting.zoneId._id) : (typeof setting.zoneId === 'string' ? setting.zoneId : "all"),
        isMaintenance: setting.isMaintenance !== undefined ? setting.isMaintenance : true,
        maintenanceMessage: setting.maintenanceMessage || "Service is currently under maintenance. Please try again later.",
      })
    } else {
      setEditingSetting(null)
      setFormData({
        module: "food",
        serviceType: "all",
        zoneId: "all",
        isMaintenance: true,
        maintenanceMessage: "Service is currently under maintenance. Please try again later.",
      })
    }
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.maintenanceMessage.trim()) {
      toast.error("Please enter a maintenance message")
      return
    }
    try {
      setSubmitting(true)
      const payload = {
        ...formData,
        zoneId: formData.zoneId === "all" ? null : formData.zoneId,
      }

      const res = await api.put("/maintenance", payload, { contextModule: "admin" })
      if (res.data?.success) {
        toast.success(editingSetting ? "Rule updated successfully" : "Maintenance rule added")
        setIsModalOpen(false)
        fetchData()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save rule")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to remove this maintenance rule?")) return
    try {
      await api.delete(`/maintenance/${id}`, { contextModule: "admin" })
      toast.success("Rule removed")
      fetchData()
    } catch (error) {
      toast.error("Failed to delete rule")
    }
  }

  const toggleStatus = async (setting) => {
    try {
      const payload = {
        module: setting.module,
        serviceType: setting.serviceType,
        zoneId: setting.zoneId?._id || (typeof setting.zoneId === 'string' ? setting.zoneId : null),
        isMaintenance: !setting.isMaintenance,
        maintenanceMessage: setting.maintenanceMessage
      }
      await api.put("/maintenance", payload, { contextModule: "admin" })
      toast.success(!setting.isMaintenance ? "Maintenance activated" : "Service enabled")
      fetchData()
    } catch (error) {
      toast.error("Failed to update status")
    }
  }

  const taxiServiceTypes = [
    { value: "all", label: "All Taxi Services" },
    { value: "taxi", label: "Taxi / Ride" },
    { value: "rental", label: "Rental Packages" },
    { value: "outstation", label: "Outstation Rides" },
    { value: "pooling", label: "Ride Pooling" },
  ]

  const getModuleLabel = (mod) => {
    switch (mod) {
      case 'food_user': return 'Food Customer App'
      case 'food_restaurant': return 'Food Merchant App'
      case 'food_delivery': return 'Food Delivery Partner App'
      case 'food': return 'Entire Food Module'
      case 'taxi_user': return 'Taxi Customer App'
      case 'taxi_driver': return 'Taxi Driver App'
      case 'taxi': return 'Entire Taxi Module'
      case 'all': return 'Entire Platform (All Apps)'
      default: return mod
    }
  }

  const activeMaintenanceCount = settings.filter(s => s.isMaintenance).length

  return (
    <div className="min-h-screen bg-slate-50/70 p-6 md:p-8 font-sans">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100/80 shadow-sm">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service Maintenance Control</h1>
              {activeMaintenanceCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  {activeMaintenanceCount} Active {activeMaintenanceCount === 1 ? 'Rule' : 'Rules'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  All Systems Operational
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm mt-1">
              Selectively disable or lock modules (Food/Taxi) or specific zones during service downtime.
            </p>
          </div>
        </div>

        <Button
          onClick={() => handleOpenModal()}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 rounded-xl px-5 py-2.5 flex items-center gap-2 font-medium transition-all transform active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          Add Maintenance Rule
        </Button>
      </div>

      {/* Rules List Section */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="animate-spin w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full" />
          <p className="text-slate-500 text-sm font-medium">Fetching maintenance rules...</p>
        </div>
      ) : settings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm max-w-2xl mx-auto my-6">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-1">No Active Maintenance Rules</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            All services (Food, Taxi, Zones) are running normally for customers. Click below to add a scheduled maintenance window if required.
          </p>
          <Button onClick={() => handleOpenModal()} variant="outline" className="rounded-xl border-slate-300 font-medium">
            <Plus className="w-4 h-4 mr-2" />
            Create Maintenance Rule
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {settings.map((setting) => (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={setting._id}
                className={`bg-white p-5 rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-5 ${setting.isMaintenance ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/20 to-white' : 'border-slate-200/80'
                  }`}
              >
                <div className="flex-1 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Module Badge */}
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase rounded-lg tracking-wider ${setting.module.startsWith('food')
                        ? 'bg-amber-100/80 text-amber-800 border border-amber-200'
                        : setting.module.startsWith('taxi')
                          ? 'bg-sky-100/80 text-sky-800 border border-sky-200'
                          : 'bg-indigo-100/80 text-indigo-800 border border-indigo-200'
                      }`}>
                      {setting.module.startsWith('food') ? <Utensils className="w-3.5 h-3.5" /> : setting.module.startsWith('taxi') ? <Car className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                      {getModuleLabel(setting.module)}
                    </span>

                    {/* Taxi Service Type Badge */}
                    {setting.module === 'taxi' && setting.serviceType !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold uppercase rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                        <Sliders className="w-3 h-3 text-slate-500" />
                        {setting.serviceType}
                      </span>
                    )}

                    {/* Zone Badge */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {setting.zoneId ? (setting.zoneId.name || setting.zoneId.zoneName || setting.zoneId.service_location_name || 'Specific Zone') : 'All Zones'}
                    </span>
                  </div>

                  <p className="text-base font-semibold text-slate-800 leading-snug">
                    "{setting.maintenanceMessage}"
                  </p>

                  <p className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Last updated: {new Date(setting.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-5 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="flex items-center gap-3 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/80">
                    <span className={`text-xs font-bold ${setting.isMaintenance ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {setting.isMaintenance ? 'Maintenance Active' : 'Service Active'}
                    </span>
                    <Switch
                      checked={setting.isMaintenance}
                      onCheckedChange={() => toggleStatus(setting)}
                      className="data-[state=checked]:bg-amber-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenModal(setting)}
                      className="h-9 w-9 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                      title="Edit Rule"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(setting._id)}
                      className="h-9 w-9 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      title="Delete Rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Styled Dialog Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-white rounded-3xl border-0 shadow-2xl [&>button]:hidden">
          {/* Custom Header Bar */}
          <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-400/30">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white tracking-tight leading-none">
                  {editingSetting ? 'Edit Maintenance Rule' : 'New Maintenance Rule'}
                </DialogTitle>
                <p className="text-xs text-slate-400 mt-1">Configure downtime message & zone targets</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors focus:outline-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-5 bg-white">
            {/* Module Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Module / Targeted App</Label>
              <Select value={formData.module} onValueChange={(val) => setFormData({ ...formData, module: val, zoneId: 'all', serviceType: 'all' })}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/20">
                  <SelectValue placeholder="Select module or targeted app" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200 max-h-72">
                  <SelectItem value="all" className="rounded-lg py-2.5 font-semibold text-blue-600">🌐 Entire Platform (All Apps)</SelectItem>

                  <div className="px-3 py-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 rounded my-1 uppercase tracking-wider">Food Module Apps</div>
                  <SelectItem value="food" className="rounded-lg py-2 font-medium">🍔 Entire Food Module (All Food Apps)</SelectItem>
                  <SelectItem value="food_user" className="rounded-lg py-2 font-medium">👤 Food Customer App</SelectItem>
                  <SelectItem value="food_restaurant" className="rounded-lg py-2 font-medium">🏪 Food Restaurant / Merchant App</SelectItem>
                  <SelectItem value="food_delivery" className="rounded-lg py-2 font-medium">🛵 Food Delivery Partner App</SelectItem>

                  <div className="px-3 py-1.5 text-[10px] font-bold text-sky-700 bg-sky-50 rounded my-1 uppercase tracking-wider">Taxi Module Apps</div>
                  <SelectItem value="taxi" className="rounded-lg py-2 font-medium">🚕 Entire Taxi Module (All Taxi Apps)</SelectItem>
                  <SelectItem value="taxi_user" className="rounded-lg py-2 font-medium">👤 Taxi Customer App</SelectItem>
                  <SelectItem value="taxi_driver" className="rounded-lg py-2 font-medium">🚗 Taxi Driver App</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Service Type Picker (Taxi module only) */}
            {(formData.module === "taxi" || formData.module.startsWith("taxi_")) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Taxi Service Scope</Label>
                <Select value={formData.serviceType} onValueChange={(val) => setFormData({ ...formData, serviceType: val })}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/20">
                    <SelectValue placeholder="Select service scope" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl border-slate-200">
                    {taxiServiceTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="rounded-lg py-2.5 font-medium">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Zone Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Target Zone / Location</Label>
              <Select value={formData.zoneId} onValueChange={(val) => setFormData({ ...formData, zoneId: val })}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/20">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200 max-h-64">
                  <SelectItem value="all" className="rounded-lg py-2.5 font-semibold text-blue-600">🌐 All Zones (Global)</SelectItem>

                  {/* FOOD ZONES */}
                  {(formData.module === 'all' || formData.module === 'food' || formData.module.startsWith('food_')) && foodZones.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 rounded my-1 uppercase tracking-wider">Food Module Zones</div>
                      {foodZones.map(z => (
                        <SelectItem key={`food-${z._id || z.id}`} value={String(z._id || z.id)} className="rounded-lg py-2 font-medium">
                          🍔 {z.name || z.zoneName || z.serviceLocation} {formData.module === 'all' ? '(Food)' : ''}
                        </SelectItem>
                      ))}
                    </>
                  )}

                  {/* TAXI ZONES */}
                  {(formData.module === 'all' || formData.module === 'taxi' || formData.module.startsWith('taxi_')) && taxiZones.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-bold text-sky-700 bg-sky-50 rounded my-1 uppercase tracking-wider">Taxi Module Zones</div>
                      {taxiZones.map(z => (
                        <SelectItem key={`taxi-${z._id || z.id}`} value={String(z._id || z.id)} className="rounded-lg py-2 font-medium">
                          🚕 {z.service_location_name || z.name || z.zoneName} {formData.module === 'all' ? '(Taxi)' : ''}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Maintenance Toggle Card */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rule Status</Label>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-800">
                    {formData.isMaintenance ? 'Maintenance Active (Disabled)' : 'Service Active (Enabled)'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formData.isMaintenance ? 'Lock module with downtime popup' : 'App operates normally for this target'}
                  </p>
                </div>
                <Switch
                  checked={formData.isMaintenance}
                  onCheckedChange={(val) => setFormData({ ...formData, isMaintenance: val })}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>
            </div>

            {/* Maintenance Message */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Maintenance Message</Label>
              <Input
                value={formData.maintenanceMessage}
                onChange={(e) => setFormData({ ...formData, maintenanceMessage: e.target.value })}
                placeholder="Message to display to users..."
                className="h-11 rounded-xl border-slate-200 bg-slate-50/50 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl px-5 font-semibold text-slate-600 hover:bg-slate-200/60"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 font-semibold shadow-md shadow-blue-500/20"
            >
              {submitting ? 'Saving...' : 'Save Rule'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
