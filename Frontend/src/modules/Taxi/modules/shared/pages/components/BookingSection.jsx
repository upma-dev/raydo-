import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Car, Compass, Bus, Utensils, ArrowRight, Clock, Zap, CheckCircle2 } from "lucide-react";
import { useRaydoLandingData } from "../../services/raydoLandingService";
import GooglePlayBadge from "./GooglePlayBadge";

export default function BookingSection() {
  const navigate = useNavigate();
  const config = useRaydoLandingData();
  const [activeTab, setActiveTab] = useState("FOOD"); // FOOD | RIDES | OUTSTATION | BUS
  const [pickup, setPickup] = useState("Your Location (Vijay Nagar, Indore)");
  const [dropoff, setDropoff] = useState("Indore Airport Terminal");
  const [foodItem, setFoodItem] = useState("Butter Chicken & Naan Combo");

  const isFood = activeTab === "FOOD";

  const tabOptions = [
    { id: "FOOD", label: "Food Order", icon: Utensils, theme: "FOOD" },
    { id: "RIDES", label: "City Taxi", icon: Car, theme: "TAXI" },
    { id: "OUTSTATION", label: "Outstation", icon: Compass, theme: "TAXI" },
    { id: "BUS", label: "Bus Ticket", icon: Bus, theme: "TAXI" },
  ];

  const handleBookSubmit = (e) => {
    e.preventDefault();
    if (activeTab === "FOOD") {
      navigate(`/food/user?search=${encodeURIComponent(foodItem)}`);
    } else {
      navigate(`/taxi/user?pickup=${encodeURIComponent(pickup)}&drop=${encodeURIComponent(dropoff)}`);
    }
  };

  return (
    <section id="booking" className="relative bg-[#050713] py-10 lg:py-14 text-white border-b border-slate-800/80 overflow-hidden">
      
      {/* 2 Color Theme Aura Glows (Radial Gradients) */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 size-72 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,138,0,0.10),transparent_70%)] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 size-72 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(49,92,255,0.12),transparent_70%)] pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 z-10">
        
        {/* Compact Header */}
        <div className="text-center max-w-xl mx-auto mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[#FFC400] text-[10px] font-black tracking-wider uppercase mb-2 shadow-md">
            <Zap size={12} />
            <span>INSTANT DISPATCH</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
            {config.booking.headingMain}{" "}
            <span className="bg-gradient-to-r from-[#FF8A00] via-[#FFC400] to-[#315CFF] bg-clip-text text-transparent">
              {config.booking.headingSub}
            </span>
          </h2>
        </div>

        {/* Booking Container */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-xl">
          
          {/* Service Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 bg-slate-950/90 rounded-xl mb-6 border border-slate-800/80">
            {tabOptions.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              const isTabFood = t.theme === "FOOD";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? isTabFood
                        ? "bg-gradient-to-r from-[#FF8A00] to-[#FFC400] text-slate-950 shadow-md shadow-orange-400/20"
                        : "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white shadow-md shadow-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  <Icon size={15} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Form */}
          <form onSubmit={handleBookSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {isFood ? (
                <motion.div
                  key="food-form"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-3"
                >
                  <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus-within:border-[#FF8A00] transition-all">
                    <Utensils size={18} className="text-[#FF8A00] shrink-0 mr-3" />
                    <div className="flex-1">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                        What are you craving?
                      </label>
                      <input
                        type="text"
                        value={foodItem}
                        onChange={(e) => setFoodItem(e.target.value)}
                        placeholder="Search dishes or restaurants (e.g. Pizza, Biryani, Sweets)"
                        className="w-full text-xs font-bold text-white bg-transparent focus:outline-none placeholder-slate-500"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="ride-form"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="grid sm:grid-cols-2 gap-3"
                >
                  <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus-within:border-[#315CFF] transition-all">
                    <MapPin size={18} className="text-[#315CFF] shrink-0 mr-3" />
                    <div className="flex-1">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-[#315CFF]">
                        Your Location
                      </label>
                      <input
                        type="text"
                        value={pickup}
                        onChange={(e) => setPickup(e.target.value)}
                        placeholder="Enter your current location"
                        className="w-full text-xs font-bold text-white bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus-within:border-[#6842F5] transition-all">
                    <Navigation size={18} className="text-[#6842F5] shrink-0 mr-3" />
                    <div className="flex-1">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Destination
                      </label>
                      <input
                        type="text"
                        value={dropoff}
                        onChange={(e) => setDropoff(e.target.value)}
                        className="w-full text-xs font-bold text-white bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Estimate Bar */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${isFood ? "bg-[#FF8A00]/10 text-[#FFC400]" : "bg-[#315CFF]/10 text-[#315CFF]"}`}>
                  <Clock size={16} />
                </div>
                <div>
                  <div className="font-black text-white">
                    {isFood ? config.booking.estimatedFoodTime : config.booking.estimatedRideTime}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    <span>{config.booking.pricingGuarantee}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <GooglePlayBadge url={config.playStoreUrl} size="compact" />

                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    isFood
                      ? "bg-gradient-to-r from-[#FF8A00] to-[#FFC400] text-slate-950 hover:bg-amber-300"
                      : "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white hover:bg-blue-600"
                  }`}
                >
                  <span>{isFood ? "Browse Food" : `Book ${activeTab}`}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </form>
        </div>

      </div>
    </section>
  );
}
