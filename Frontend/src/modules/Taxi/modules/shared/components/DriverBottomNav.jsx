import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Briefcase,
  Bus,
  Car,
  Home,
  IndianRupee,
  Trophy,
  User,
  History,
  Users,
} from "lucide-react";
import { useSettings } from "../../../shared/context/SettingsContext";

const DriverBottomNav = () => {
  const location = useLocation();
  const { settings } = useSettings();
  const role = String(localStorage.getItem("role") || "driver").toLowerCase();
  const isOwner = role === "owner";
  const routePrefix = isOwner ? "/taxi/owner" : "/taxi/driver";
  const busEnabled = String(settings.transportRide?.enable_bus_service || "0") === "1";

  // Matching user's latest screenshot labels: Home, History, Earnings, Accounts
  const navItems = isOwner
    ? [
        {
          icon: <Home size={22} />,
          label: "Dashboard",
          path: `${routePrefix}/dashboard`,
        },
        {
          icon: <Users size={22} />,
          label: "Drivers",
          path: `${routePrefix}/manage-drivers`,
        },
        {
          icon: <Car size={22} />,
          label: "Vehicle",
          path: `${routePrefix}/vehicle-fleet`,
        },
        ...(busEnabled
          ? [
              {
                icon: <Bus size={22} />,
                label: "Bus",
                path: `${routePrefix}/bus-service`,
              },
            ]
          : []),
        {
          icon: <User size={22} />,
          label: "Account",
          path: `${routePrefix}/profile`,
        },
      ]
    : [
        { icon: <Home size={22} />, label: "Home", path: `${routePrefix}/home` },
        {
          icon: <History size={22} />,
          label: "History",
          path: `${routePrefix}/history`,
        },
        {
          icon: <IndianRupee size={22} />,
          label: "Wallet",
          path: `${routePrefix}/wallet`,
        },
        {
          icon: <Trophy size={22} />,
          label: "Milestone",
          path: `${routePrefix}/incentives`,
        },
        {
          icon: <User size={22} />,
          label: "Accounts",
          path: `${routePrefix}/profile`,
        },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-100 bg-white px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] md:hidden">
      <div
        className="mx-auto grid h-[58px] w-full max-w-lg items-stretch gap-0.5"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
      >
      {navItems.map((item) => {
        const isActive =
          location.pathname === item.path ||
          location.pathname.startsWith(`${item.path}/`) ||
          (item.path === `${routePrefix}/home` &&
            location.pathname === `${routePrefix}/dashboard`);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center transition-colors duration-200 ${
              isActive
                ? "bg-slate-100 text-black"
                : "text-black/60 font-bold opacity-80"
            }`}>
            <div
              className={`${isActive ? "scale-105" : ""}`}>
              {React.cloneElement(item.icon, {
                strokeWidth: isActive ? 2.5 : 2,
                size: 20,
              })}
            </div>
            <span
              className={`max-w-full truncate text-[10px] uppercase tracking-[0.02em] ${
                isActive
                  ? "opacity-100 font-black"
                  : "opacity-80 font-bold"
              }`}>
              {item.label}
            </span>
            {isActive && (
              <div className="absolute -top-1.5 h-[2px] w-7 rounded-full bg-slate-900" />
            )}
          </NavLink>
        );
      })}
      </div>
    </nav>
  );
};

export default DriverBottomNav;
