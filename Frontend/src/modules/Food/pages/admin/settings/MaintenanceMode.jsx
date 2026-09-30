import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Plus, Trash2, Save, X, Edit2 } from "lucide-react"
import { Button } from "@food/components/ui/button"
import api from "@food/shared/api/axiosInstance"
import toast from "react-hot-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
      const [settingsRes, foodZonesRes, taxiZonesRes] = await Promise.all([
        api.get("/maintenance"),
        api.get("/food/admin/zones"),
        api.get("/taxi/admin/service-locations").catch(() => ({ data: { data: [] } }))
      ])

      if (settingsRes.data?.success) setSettings(settingsRes.data.data)
      if (foodZonesRes.data?.success) setFoodZones(foodZonesRes.data.data || [])
      if (taxiZonesRes.data?.success) setTaxiZones(taxiZonesRes.data.data || [])
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
        module: setting.module,
        serviceType: setting.serviceType || "all",
        zoneId: setting.zoneId?._id || "all",
        isMaintenance: setting.isMaintenance,
        maintenanceMessage: setting.maintenanceMessage,
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
    try {
      const payload = {
        ...formData,
        zoneId: formData.zoneId === "all" ? null : formData.zoneId,
      }
      
      const res = await api.put("/maintenance", payload)
      if (res.data?.success) {
        toast.success("Maintenance setting saved successfully")
        setIsModalOpen(false)
        fetchData()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save setting")
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this setting?")) return
    try {
      await api.delete(`/maintenance/${id}`)
      toast.success("Setting removed")
      fetchData()
    } catch (error) {
      toast.error("Failed to delete setting")
    }
  }

  const toggleStatus = async (setting) => {
    try {
      const payload = {
        module: setting.module,
        serviceType: setting.serviceType,
        zoneId: setting.zoneId?._id || null,
        isMaintenance: !setting.isMaintenance,
        maintenanceMessage: setting.maintenanceMessage
      }
      await api.put("/maintenance", payload)
      toast.success("Status updated")
      fetchData()
    } catch (error) {
      toast.error("Failed to update status")
    }
  }

  const taxiServiceTypes = [
    { value: "all", label: "All Taxi Services" },
    { value: "taxi", label: "Taxi/Ride" },
    { value: "rental", label: "Rental" },
    { value: "outstation", label: "Outstation" },
    { value: "pooling", label: "Pooling" },
  ]

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="text-rose-500 w-6 h-6" />
            Service Maintenance
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage maintenance mode and disable services.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Maintenance Rule
        </Button>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : settings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-700">All Services Active</h3>
          <p className="text-slate-500 mt-1">No maintenance rules are currently configured.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {settings.map((setting) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={setting._id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded-full tracking-wider ${setting.module === 'food' ? 'bg-orange-100 text-orange-700' : setting.module === 'taxi' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700'}`}>
                    {setting.module}
                  </span>
                  {setting.module === 'taxi' && setting.serviceType !== 'all' && (
                    <span className="px-2.5 py-1 text-[11px] font-bold uppercase rounded-full bg-indigo-100 text-indigo-700">
                      {setting.serviceType}
                    </span>
                  )}
                  {setting.zoneId ? (
                    <span className="px-2.5 py-1 text-[11px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-700">
                      Zone: {setting.zoneId.name || setting.zoneId.service_location_name}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-[11px] font-bold uppercase rounded-full bg-slate-100 text-slate-600">
                      All Zones
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-800">{setting.maintenanceMessage}</p>
                <p className="text-xs text-slate-400 mt-1">Updated on {new Date(setting.updatedAt).toLocaleString()}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${setting.isMaintenance ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {setting.isMaintenance ? 'Maintenance ON' : 'Maintenance OFF'}
                  </span>
                  <Switch checked={setting.isMaintenance} onCheckedChange={() => toggleStatus(setting)} />
                </div>
                <div className="w-px h-8 bg-slate-200" />
                <Button variant="ghost" size="icon" onClick={() => handleOpenModal(setting)}>
                  <Edit2 className="w-4 h-4 text-blue-600" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(setting._id)}>
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSetting ? 'Edit Maintenance Rule' : 'New Maintenance Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Module</Label>
              <Select value={formData.module} onValueChange={(val) => setFormData({ ...formData, module: val, zoneId: 'all', serviceType: 'all' })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Entire App (Both)</SelectItem>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="taxi">Taxi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.module === "taxi" && (
              <div className="space-y-2">
                <Label>Service Type</Label>
                <Select value={formData.serviceType} onValueChange={(val) => setFormData({ ...formData, serviceType: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxiServiceTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.module !== "all" && (
              <div className="space-y-2">
                <Label>Zone / Location</Label>
                <Select value={formData.zoneId} onValueChange={(val) => setFormData({ ...formData, zoneId: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select zone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Zones</SelectItem>
                    {formData.module === 'food' && foodZones.map(z => (
                      <SelectItem key={z._id} value={z._id}>{z.name}</SelectItem>
                    ))}
                    {formData.module === 'taxi' && taxiZones.map(z => (
                      <SelectItem key={z._id} value={z._id}>{z.service_location_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-3">
                <Switch 
                  checked={formData.isMaintenance} 
                  onCheckedChange={(val) => setFormData({ ...formData, isMaintenance: val })} 
                />
                <span className="text-sm font-medium">{formData.isMaintenance ? 'Maintenance Active (Disabled)' : 'Service Active (Enabled)'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Maintenance Message</Label>
              <Input 
                value={formData.maintenanceMessage}
                onChange={(e) => setFormData({ ...formData, maintenanceMessage: e.target.value })}
                placeholder="Message to display to users..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave}>Save Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
