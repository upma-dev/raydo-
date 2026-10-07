import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Car, Compass, Bus, Utensils, Users, Building2, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { useRaydoLandingData } from "../../services/raydoLandingService";
import GooglePlayBadge from "./GooglePlayBadge";

export default function ServicesShowcase() {
  const navigate = useNavigate();
  const config = useRaydoLandingData();
  const [activeFilter, setActiveFilter] = useState("ALL");

  const services = [
    {
      id: "food",
      category: "FOOD",
      num: "01",
      title: config.services.foodDeliveryTitle,
      subtitle: config.services.foodDeliverySub,
      icon: Utensils,
      tag: "Express Delivery",
      color: "from-[#FF8A00] to-[#FFC400]",
      badgeColor: "border-[#FF8A00]/40 text-[#FFC400] bg-[#FF8A00]/10",
      accentBg: "group-hover:bg-[#FF8A00] group-hover:text-slate-950",
      route: "/food/user",
      features: ["Live kitchen order tracking", "Zero surge packaging fees", "Instant rider dispatch"],
      visualUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "rides",
      category: "RIDES",
      num: "02",
      title: config.services.cityRidesTitle,
      subtitle: config.services.cityRidesSub,
      icon: Car,
      tag: "City Mobility",
      color: "from-[#315CFF] to-[#6842F5]",
      badgeColor: "border-[#315CFF]/40 text-[#315CFF] bg-[#315CFF]/10",
      accentBg: "group-hover:bg-[#315CFF] group-hover:text-white",
      route: "/taxi/user",
      features: ["Instant driver allocation", "Transparent upfront fares", "100% OTP safe trips"],
      visualUrl: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "outstation",
      category: "OUTSTATION",
      num: "03",
      title: config.services.outstationTitle,
      subtitle: config.services.outstationSub,
      icon: Compass,
      tag: "Intercity Travel",
      color: "from-[#6842F5] to-[#315CFF]",
      badgeColor: "border-[#6842F5]/40 text-purple-300 bg-[#6842F5]/10",
      accentBg: "group-hover:bg-[#6842F5] group-hover:text-white",
      route: "/taxi/user",
      features: ["One-way & Round trip", "Highway-certified captains", "Zero night stay surcharges"],
      visualUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "bus",
      category: "BUS",
      num: "04",
      title: config.services.busTitle,
      subtitle: config.services.busSub,
      icon: Bus,
      tag: "Express Transit",
      color: "from-[#315CFF] to-[#6842F5]",
      badgeColor: "border-[#315CFF]/40 text-blue-300 bg-[#315CFF]/10",
      accentBg: "group-hover:bg-[#315CFF] group-hover:text-white",
      route: "/taxi/user",
      features: ["Live GPS bus location", "Interactive seat map", "Instant e-ticket booking"],
      visualUrl: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "partners",
      category: "PARTNERS",
      num: "05",
      title: config.services.partnerTitle,
      subtitle: config.services.partnerSub,
      icon: Users,
      tag: "Partner Program",
      color: "from-[#FF8A00] to-[#FFC400]",
      badgeColor: "border-[#FF8A00]/40 text-[#FFC400] bg-[#FF8A00]/10",
      accentBg: "group-hover:bg-[#FF8A00] group-hover:text-slate-950",
      route: "/taxi/driver",
      features: ["Instant daily payouts", "Flexible working shifts", "24/7 helpline"],
      visualUrl: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "franchise",
      category: "FRANCHISE",
      num: "06",
      title: config.services.franchiseTitle,
      subtitle: config.services.franchiseSub,
      icon: Building2,
      tag: "Regional Hub",
      color: "from-[#6842F5] to-[#315CFF]",
      badgeColor: "border-[#6842F5]/40 text-purple-300 bg-[#6842F5]/10",
      accentBg: "group-hover:bg-[#6842F5] group-hover:text-white",
      route: "/taxi/driver",
      features: ["Exclusive territory rights", "Full tech & brand support", "High revenue share"],
      visualUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80",
    },
  ];

  const filterCategories = ["ALL", "FOOD", "RIDES", "OUTSTATION", "BUS", "PARTNERS", "FRANCHISE"];

  const filteredServices = activeFilter === "ALL"
    ? services
    : services.filter((s) => s.category === activeFilter);

  return (
    <section id="services" className="relative bg-[#070A1F] py-12 lg:py-16 text-white overflow-hidden border-b border-slate-800/80">
      
      {/* 2 Color Theme Glows (Radial Gradients for fast GPU performance) */}
      <div className="absolute top-1/4 left-10 size-72 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,138,0,0.10),transparent_70%)] pointer-events-none" />
      <div className="absolute bottom-10 right-10 size-72 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(49,92,255,0.12),transparent_70%)] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[#FFC400] text-[11px] font-black tracking-wider uppercase shadow-md">
            <Sparkles size={13} />
            <span>ECOSYSTEM SERVICES</span>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            {config.services.heading}<br />
            <span className="bg-gradient-to-r from-[#FF8A00] via-[#FFC400] to-[#315CFF] bg-clip-text text-transparent">
              {config.services.subheading}
            </span>
          </h2>

          <div className="pt-2 flex justify-center">
            <GooglePlayBadge url={config.playStoreUrl} size="normal" />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-8">
          {filterCategories.map((cat) => {
            const isActive = activeFilter === cat;
            const isFoodTab = cat === "FOOD";
            return (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? isFoodTab
                      ? "bg-gradient-to-r from-[#FF8A00] to-[#FFC400] text-slate-950 shadow-md shadow-orange-500/20"
                      : "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white shadow-md shadow-blue-500/20"
                    : "bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          <AnimatePresence mode="popLayout">
            {filteredServices.map((service) => {
              const Icon = service.icon;
              const isFood = service.category === "FOOD";
              return (
                <motion.div
                  key={service.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => navigate(service.route)}
                  className="group relative bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between overflow-hidden backdrop-blur-xl"
                >
                  <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${service.color}`} />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xl font-black text-slate-500 group-hover:text-white transition-colors">
                        {service.num}
                      </span>
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${service.badgeColor} uppercase tracking-wider`}>
                        {service.tag}
                      </span>
                    </div>

                    <div className="flex items-start gap-3 mb-3">
                      <div className={`p-2.5 rounded-xl bg-slate-950 border border-slate-800 ${isFood ? "text-[#FFC400]" : "text-[#315CFF]"} ${service.accentBg} transition-all duration-300 shadow-md shrink-0`}>
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className={`text-lg font-black text-white transition-colors ${isFood ? "group-hover:text-[#FFC400]" : "group-hover:text-[#315CFF]"}`}>
                          {service.title}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mt-0.5 leading-relaxed">
                          {service.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="relative h-32 rounded-xl overflow-hidden my-3 border border-slate-800 shadow-inner">
                      <img
                        src={service.visualUrl}
                        alt={service.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                    </div>

                    <div className="space-y-1.5 mb-4">
                      {service.features.map((feat) => (
                        <div key={feat} className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                          <CheckCircle2 size={13} className={isFood ? "text-[#FF8A00]" : "text-[#315CFF]"} />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-black text-white group-hover:text-[#FFC400] transition-colors">
                    <span>Explore {service.category}</span>
                    <div className={`size-7 rounded-full bg-slate-800 flex items-center justify-center transition-all duration-300 ${isFood ? "group-hover:bg-[#FF8A00] group-hover:text-slate-950" : "group-hover:bg-[#315CFF] group-hover:text-white"}`}>
                      <ArrowRight size={13} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

      </div>
    </section>
  );
}
