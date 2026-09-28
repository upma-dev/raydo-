import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Sparkles, Utensils, Car, Building2 } from "lucide-react";

export default function FinalCtaSection() {
  const navigate = useNavigate();

  return (
    <section className="relative bg-[#070A1F] py-24 lg:py-32 text-white border-b border-slate-800/80 overflow-hidden">

      {/* Raydo Yellow & Blue Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[650px] rounded-full bg-[#FFC400]/10 blur-[180px] pointer-events-none" />
      <div className="absolute -bottom-20 right-10 size-96 rounded-full bg-[#315CFF]/15 blur-[150px] pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center z-10 space-y-8">

        {/* Top Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFC400] text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-400/20"
        >
          <Sparkles size={16} />
          <span>START YOUR CONNECTED JOURNEY TODAY</span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-tight"
        >
          Wherever you're going or craving, <br />
          <span className="bg-gradient-to-r from-[#FFC400] via-yellow-300 to-amber-200 bg-clip-text text-transparent">
            Raydo connects you instantly.
          </span>
        </motion.h2>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-base sm:text-xl text-slate-300 font-medium max-w-2xl mx-auto leading-relaxed"
        >
          Order food, book city cabs, plan highway journeys, or partner with us to empower your local city hub.
        </motion.p>

        {/* Multi-Action CTAs matching Navbar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="pt-4 flex flex-wrap items-center justify-center gap-4"
        >
          <button
            onClick={() => navigate("/taxi/user")}
            className="px-8 py-4 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 bg-[#FFC400] hover:bg-amber-300 rounded-2xl shadow-2xl shadow-amber-400/25 transition-all transform hover:-translate-y-1 flex items-center gap-2 cursor-pointer"
          >
            <Car size={18} />
            <span>Book a Ride</span>
            <ArrowRight size={18} />
          </button>

          <button
            onClick={() => navigate("/food/user")}
            className="px-8 py-4 text-xs sm:text-sm font-black uppercase tracking-wider text-white bg-slate-900 border border-slate-700 hover:border-[#FFC400] rounded-2xl shadow-xl transition-all transform hover:-translate-y-1 flex items-center gap-2 cursor-pointer"
          >
            <Utensils size={18} className="text-[#FFC400]" />
            <span>Order Food</span>
          </button>

          <button
            onClick={() => navigate("/taxi/driver")}
            className="px-8 py-4 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300 bg-slate-950/80 border border-slate-800 hover:text-white rounded-2xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <Building2 size={18} className="text-[#315CFF]" />
            <span>Partner / Franchise</span>
          </button>
        </motion.div>

        {/* Glowing Destination Indicator */}
        <div className="pt-6 flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-[#FFC400] font-bold text-xs shadow-xl backdrop-blur-md">
            <MapPin size={16} className="text-[#FFC400] animate-bounce" />
            <span>Destination: Pan-India Connected Living Network</span>
          </div>
        </div>

      </div>
    </section>
  );
}

