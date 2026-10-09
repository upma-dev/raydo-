import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  BadgeCheck,
  Download,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  Building2,
} from "lucide-react"
import { franchisePartnerAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const defaultFormData = {
  name: "",
  image: "",
  status: true,
  type: "",
  zoneId: "",
  foodTypeScope: "Both",
}

const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const scopeBadgeClass = (scope) => {
  if (scope === "Veg") return "bg-green-50 text-green-700 border-green-200"
  if (scope === "Non-Veg") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

const zoneLabel = (zone) => {
  if (!zone) return "Assigned Zone"
  if (typeof zone === "string") {
    const value = zone.trim()
    if (/^[a-f0-9]{24}$/i.test(value)) return `Zone ID ${value.slice(-6)}`
    return value
  }
  return zone?.name || zone?.zoneName || zone?.serviceLocation || "Zone"
}

export default function FranchiseCategoryList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [formData, setFormData] = useState(defaultFormData)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchCategories()
    fetchZones()
  }, [])

  const fetchZones = async () => {
    try {
      setZonesLoading(true)
      const res = await franchisePartnerAPI.getZones({ limit: 1000 })
      const list = res?.data?.data?.zones || res?.data?.data || []
      const validZones = Array.isArray(list) ? list : []
      setZones(validZones)
      if (validZones.length > 0) {
        setFormData(prev => ({ ...prev, zoneId: String(validZones[0]._id || validZones[0].id || "") }))
      }
    } catch (err) {
      setZones([])
    } finally {
      setZonesLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const params = {}
      if (searchQuery) params.search = searchQuery
      if (showPendingOnly) params.approvalStatus = "pending"

      const response = await franchisePartnerAPI.getCategories(params)
      const list = response?.data?.data?.categories || response?.data?.categories || []
      setCategories(Array.isArray(list) ? list : [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load categories")
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchCategories()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery, showPendingOnly])

  const filteredCategories = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase()
    let result = categories

    if (query) {
      result = result.filter((category) => {
        const creator = category?.createdByRestaurant?.name || category?.restaurant?.name || ""
        return (
          String(category?.name || "").toLowerCase().includes(query) ||
          String(category?.foodTypeScope || "").toLowerCase().includes(query) ||
          String(creator || "").toLowerCase().includes(query)
        )
      })
    }

    return result
  }, [categories, searchQuery])

  const resetModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    const defaultZone = zones.length > 0 ? String(zones[0]._id || zones[0].id || "") : ""
    setFormData({ ...defaultFormData, zoneId: defaultZone })
    setSelectedImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleAddNew = () => {
    setEditingCategory(null)
    const defaultZone = zones.length > 0 ? String(zones[0]._id || zones[0].id || "") : ""
    setFormData({ ...defaultFormData, zoneId: defaultZone })
    setSelectedImageFile(null)
    setImagePreview(null)
    setIsModalOpen(true)
  }

  const handleEdit = (category) => {
    setEditingCategory(category)
    const zoneIdValue =
      typeof category?.zoneId === "string"
        ? category.zoneId
        : category?.zoneId?._id || category?.zoneId?.id || (zones[0] ? String(zones[0]._id || zones[0].id) : "")

    setFormData({
      name: category?.name || "",
      image: category?.image || "",
      status: category?.status !== false,
      type: category?.type || "",
      zoneId: zoneIdValue,
      foodTypeScope: category?.foodTypeScope || "Both",
    })
    setSelectedImageFile(null)
    setImagePreview(category?.image || null)
    setIsModalOpen(true)
  }

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    setSelectedImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      setUploadingImage(true)
      let imageUrl = String(formData.image || "").trim()

      if (selectedImageFile) {
        const uploadRes = await uploadAPI.uploadMedia(selectedImageFile, { folder: "raydo/franchise/categories" })
        const payload = uploadRes?.data?.data || uploadRes?.data
        imageUrl = payload?.url || imageUrl
      }

      const payload = {
        name: String(formData.name || "").trim(),
        type: String(formData.type || "").trim(),
        status: Boolean(formData.status),
        image: imageUrl || undefined,
        zoneId: formData.zoneId || (zones[0] ? String(zones[0]._id || zones[0].id) : undefined),
        foodTypeScope: formData.foodTypeScope,
      }

      if (editingCategory) {
        await franchisePartnerAPI.createCategory(payload) // handles upsert
        toast.success("Category updated successfully")
      } else {
        await franchisePartnerAPI.createCategory(payload)
        toast.success("Franchise Category created successfully")
      }

      resetModal()
      fetchCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save category")
    } finally {
      setUploadingImage(false)
    }
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      doc.setFontSize(18)
      doc.text("Franchise Category List", 14, 20)
      const tableData = filteredCategories.map((category, index) => [
        index + 1,
        category?.name || "N/A",
        category?.foodTypeScope || "Both",
        zoneLabel(category?.zoneId),
        category?.approvalStatus || "approved",
      ])
      autoTable(doc, {
        startY: 30,
        head: [["SL", "Category", "Diet Scope", "Assigned Zone", "Status"]],
        body: tableData,
      })
      doc.save("Franchise_Categories.pdf")
      toast.success("PDF exported successfully!")
    } catch {
      toast.error("Failed to export PDF")
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider">
                Franchise Partner Portal
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">Franchise Categories</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage food categories assigned to your franchise zone ({zones[0]?.name || zones[0]?.zoneName || 'Your Assigned Zone'}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 p-1">
              <button
                type="button"
                onClick={() => setShowPendingOnly(false)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${!showPendingOnly ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setShowPendingOnly(true)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${showPendingOnly ? "bg-amber-600 text-white" : "text-slate-600"}`}
              >
                Pending
              </button>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search categories"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <button
              onClick={handleExportPDF}
              disabled={filteredCategories.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            <button
              onClick={handleAddNew}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Category
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="w-[30%] px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Category</th>
                <th className="w-[20%] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Assigned Zone</th>
                <th className="w-[15%] px-4 py-4 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">Diet</th>
                <th className="w-[15%] px-4 py-4 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">Status</th>
                <th className="w-[20%] px-5 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
                    <p className="mt-2 text-sm text-slate-500">Loading franchise categories...</p>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700">No categories found in your franchise zone</p>
                    <p className="mt-1 text-sm text-slate-500">Click "Add Category" above to create one for your zone.</p>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => {
                  const approvalStatus = category?.approvalStatus || "approved"
                  const zoneText = zoneLabel(category?.zoneId || zones[0])

                  return (
                    <tr key={category.id} className="align-top hover:bg-slate-50/80">
                      <td className="px-5 py-5">
                        <div className="flex items-start gap-3">
                          <div className="h-11 w-11 overflow-hidden rounded-2xl bg-slate-100">
                            {category?.image ? (
                              <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                                {String(category?.name || "C").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold leading-6 text-slate-900">{category?.name || "-"}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{category?.type || "Standard Category"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                          <Building2 size={16} className="text-indigo-500" />
                          <span>{zoneText}</span>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scopeBadgeClass(category?.foodTypeScope)}`}>
                          {category?.foodTypeScope || "Both"}
                        </span>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalBadgeClass(approvalStatus)}`}>
                          {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-right">
                        <button
                          onClick={() => handleEdit(category)}
                          className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isModalOpen && (
              <div className="fixed inset-0 z-[200]">
                <div className="absolute inset-0 bg-black/50" onClick={resetModal} />
                <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-h-[min(720px,calc(100vh-32px))]"
                  >
                    <div className="flex items-center justify-between border-b px-6 py-4">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{editingCategory ? "Edit Franchise Category" : "Add Franchise Category"}</h2>
                        <p className="text-xs text-slate-500">
                          Create a category scoped specifically to your assigned franchise zone.
                        </p>
                      </div>
                      <button onClick={resetModal} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Assigned Zone</label>
                          <select
                            value={formData.zoneId}
                            disabled
                            className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 outline-none text-slate-700 font-semibold cursor-not-allowed"
                          >
                            {zones.map((zone) => {
                              const id = String(zone?._id || zone?.id || "")
                              const label = zone?.name || zone?.zoneName || zone?.serviceLocation || id
                              return (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              )
                            })}
                            {zones.length === 0 && <option value="">Default Franchise Zone</option>}
                          </select>
                          <p className="text-[11px] text-slate-400 mt-1">Categories are automatically bound to your assigned franchise zone.</p>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Diet Scope</label>
                          <select
                            value={formData.foodTypeScope}
                            onChange={(event) => setFormData((prev) => ({ ...prev, foodTypeScope: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-indigo-600"
                          >
                            <option value="Veg">Veg</option>
                            <option value="Non-Veg">Non-Veg</option>
                            <option value="Both">Both</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Category Type</label>
                          <input
                            type="text"
                            value={formData.type}
                            onChange={(event) => setFormData((prev) => ({ ...prev, type: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-600"
                            placeholder="Examples: Starters, Desserts, Drinks"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Category Name</label>
                          <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-600"
                            placeholder="Enter category name"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Category Image</label>
                          <div className="space-y-3">
                            {(imagePreview || formData.image) && (
                              <div className="relative h-32 w-32 overflow-hidden rounded-2xl border border-slate-300">
                                <img
                                  src={imagePreview || formData.image}
                                  alt="Category preview"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-3">
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                onChange={handleImageSelect}
                                className="hidden"
                                id="franchise-category-image-upload"
                              />
                              <label
                                htmlFor="franchise-category-image-upload"
                                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
                              >
                                <Upload className="h-4 w-4" />
                                {imagePreview ? "Change Image" : "Upload Image"}
                              </label>
                              {uploadingImage && <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 border-t bg-white px-6 py-4">
                        <button
                          type="button"
                          onClick={resetModal}
                          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-700 hover:bg-slate-50 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-white hover:bg-indigo-700 font-bold"
                        >
                          {editingCategory ? "Update Category" : "Create Category"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
