import { Link, useLocation } from "react-router-dom"
import { Home, FileText, Crown, ShoppingCart, User } from "lucide-react"
import { useCart } from "@food/context/CartContext"

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname
  const { itemCount } = useCart()

  // Active state routes
  const isHome = pathname === "/food" || pathname === "/food/" || pathname === "/food/user" || pathname === "/food/user/"
  const isOrders = pathname.includes("/orders")
  const isPass = pathname.includes("/gourmet") || pathname.includes("/pass")
  const isCart = pathname.includes("/cart")
  const isProfile = pathname.includes("/profile")

  const navItems = [
    {
      id: "home",
      label: "HOME",
      to: "/food/user",
      icon: Home,
      isActive: isHome,
    },
    {
      id: "orders",
      label: "ORDERS",
      to: "/food/user/orders",
      icon: FileText,
      isActive: isOrders,
    },
    {
      id: "pass",
      label: "PASS",
      to: "/food/user/gourmet",
      icon: Crown,
      isActive: isPass,
    },
    {
      id: "cart",
      label: "CART",
      to: "/food/user/cart",
      icon: ShoppingCart,
      isActive: isCart,
      badge: itemCount,
    },
    {
      id: "profile",
      label: "PROFILE",
      to: "/food/user/profile",
      icon: User,
      isActive: isProfile,
    },
  ]

  return (
    <div className="md:hidden fixed bottom-4 left-3 right-3 sm:left-6 sm:right-6 z-50 flex justify-center pointer-events-none">
      <div className="flex items-center justify-between p-1.5 bg-white/95 dark:bg-[#121824]/95 backdrop-blur-xl border border-gray-100 dark:border-white/10 rounded-[28px] shadow-[0_12px_40px_rgba(0,0,0,0.14)] pointer-events-auto w-full max-w-sm sm:max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.id}
              to={item.to}
              className={`flex flex-col items-center justify-center flex-1 transition-all duration-300 relative ${
                item.isActive
                  ? "bg-[#0F172A] text-white rounded-[22px] px-3.5 py-2.5 shadow-xl shadow-slate-900/25 scale-[1.03]"
                  : "px-2 py-2 text-[#8FA0B8] hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-5 w-5 mb-0.5 ${
                    item.isActive ? "text-white" : "text-[#8FA0B8]"
                  }`}
                  strokeWidth={item.isActive ? 2.3 : 1.8}
                />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[8.5px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 shadow-xs">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[9px] tracking-[0.16em] uppercase leading-none font-bold font-serif ${
                  item.isActive ? "text-white font-extrabold" : "text-[#8FA0B8]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
