import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, Trash2, Loader2, Eye, Pencil, Plus, Building2, Utensils } from "lucide-react"
import { franchisePartnerAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { getFoodDisplayPrice, getFoodVariants } from "@food/utils/foodVariants"

const createFoodForm = () => ({
  restaurantId: "",
  categoryId: "",
  categoryName: "",
  name: "",
  price: "",
  variants: [],
  description: "",
  image: "",
  foodType: "Non-Veg",
  isAvailable: true,
  preparationTime: "",
  availableTime: { isAllDay: true, startTime: "08:00", endTime: "20:00" },
})

export default function FranchiseFoodsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRestaurant, setSelectedRestaurant] = useState("all")
  const [foods, setFoods] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFood, setSelectedFood] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const fetchAllFoods = useCallback(async () => {
    try {
      setLoading(true)

      const [restaurantsRes, foodsRes] = await Promise.all([
        franchisePartnerAPI.getRestaurants({ limit: 1000 }),
        franchisePartnerAPI.getFoods({ limit: 1000 }),
      ])

      const restList = restaurantsRes?.data?.data?.restaurants || restaurantsRes?.data?.restaurants || []
      const restMap = Array.isArray(restList) ? restList : []
      setRestaurants(
        restMap.map((r) => ({
          id: String(r._id || r.id || ""),
          name: r.restaurantName || r.name || "Unknown Restaurant",
        }))
      )

      const list = foodsRes?.data?.data?.foods || foodsRes?.data?.foods || []
      const foodItems = Array.isArray(list) ? list : []
      setFoods(
        foodItems.map((f) => ({
          id: String(f.id || f._id || ""),
          _id: f._id || f.id,
          name: f.name || "Unnamed Item",
          image: f.image || "https://via.placeholder.com/40",
          status: f.isAvailable !== false,
          restaurantId: String(f.restaurantId || ""),
          restaurantName: f.restaurantName || "Unknown Restaurant",
          categoryId: String(f.categoryId || ""),
          categoryName: f.categoryName || "",
          price: getFoodDisplayPrice(f),
          variants: getFoodVariants(f),
          foodType: f.foodType || "Non-Veg",
          approvalStatus: f.approvalStatus || "approved",
          description: f.description || "",
          preparationTime: f.preparationTime || "",
          isAvailable: f.isAvailable !== false,
          createdAt: f.createdAt,
        }))
      )
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load foods")
      setFoods([])
      setRestaurants([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllFoods()
  }, [fetchAllFoods])

  const filteredFoods = useMemo(() => {
    let result = [...foods]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(food =>
        food.name.toLowerCase().includes(query) ||
        food.restaurantName?.toLowerCase().includes(query) ||
        food.categoryName?.toLowerCase().includes(query)
      )
    }

    if (selectedRestaurant !== "all") {
      result = result.filter((food) => String(food.restaurantId) === selectedRestaurant)
    }

    return result
  }, [foods, searchQuery, selectedRestaurant])

  const handleViewDetails = (food) => {
    setSelectedFood(food)
    setShowDetailModal(true)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider">
              Franchise Partner Portal
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">Franchise Foods</h1>
            <p className="text-sm text-slate-500 mt-1">View food items belonging to restaurants in your franchise zone.</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3.5 py-1.5 rounded-full text-sm font-bold bg-indigo-100 text-indigo-800">
              Total Items: {filteredFoods.length}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="relative flex-1 min-w-[240px] w-full">
            <input
              type="text"
              placeholder="Search by food name, restaurant, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-indigo-600"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>

          <select
            value={selectedRestaurant}
            onChange={(e) => setSelectedRestaurant(e.target.value)}
            className="px-4 py-2.5 min-w-[220px] text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-indigo-600 font-medium"
          >
            <option value="all">All Franchise Restaurants</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SL</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Image</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Title</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Loading franchise foods...</p>
                  </td>
                </tr>
              ) : filteredFoods.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700 mb-1">No Food Items Found</p>
                    <p className="text-sm text-slate-500">No foods added in your franchise restaurants yet.</p>
                  </td>
                </tr>
              ) : (
                filteredFoods.map((food, index) => (
                  <tr key={food.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-500">{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200">
                        <img
                          src={food.image}
                          alt={food.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = "https://via.placeholder.com/40" }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{food.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 flex items-center gap-1.5">
                      <Building2 size={14} className="text-slate-400" />
                      <span>{food.restaurantName}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{food.categoryName || "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">₹{food.price}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleViewDetails(food)}
                        className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-bold text-slate-900">Food Item Details</DialogTitle>
          </DialogHeader>
          {selectedFood && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <img
                  src={selectedFood.image}
                  alt={selectedFood.name}
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                  onError={(e) => { e.target.src = "https://via.placeholder.com/64" }}
                />
                <div>
                  <p className="text-lg font-bold text-slate-900">{selectedFood.name}</p>
                  <p className="text-sm text-indigo-600 font-semibold mt-0.5">{selectedFood.restaurantName}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p><span className="font-semibold text-slate-700">Category:</span> <span className="text-slate-900">{selectedFood.categoryName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Price:</span> <span className="text-slate-900">₹{selectedFood.price}</span></p>
                <p><span className="font-semibold text-slate-700">Food Type:</span> <span className="text-slate-900">{selectedFood.foodType}</span></p>
                <p><span className="font-semibold text-slate-700">Status:</span> <span className="text-slate-900">{selectedFood.isAvailable ? 'Available' : 'Unavailable'}</span></p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
