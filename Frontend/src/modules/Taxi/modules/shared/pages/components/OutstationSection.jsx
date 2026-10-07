import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Compass, MapPin, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";

export default function OutstationSection() {
  const navigate = useNavigate();
  const [activeOption, setActiveOption] = useState("One-way");

  const options = ["One-way", "Round Trip", "Airport", "Intercity"];

  return (
    <section id="outstation" className="relative bg-slate-900 py-20 lg:py-28 text-white overflow-hidden border-b border-slate-800">

      {/* Background Highway Cinematic Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-25 bg-[url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">

        <div className="grid lg:grid-cols-12 items-center gap-12">

          {/* Left Column */}
          <div className="lg:col-span-6 space-y-6">

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 font-black text-xs uppercase tracking-wider"
            >
              <Compass size={14} />
              <span>LONG DISTANCE TRAVEL</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl sm:text-5xl font-black text-white tracking-tight"
            >
              Go Beyond <br />
              <span className="bg-gradient-to-r from-amber-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                the City.
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-base text-slate-300 font-medium leading-relaxed"
            >
              Book reliable, comfortable outstation cabs for business or leisure. Fixed transparent fares, verified highway drivers, and zero hidden toll surprises.
            </motion.p>

            {/* Outstation Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setActiveOption(opt)}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${activeOption === opt
                      ? "bg-amber-400 text-slate-950 shadow-md"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* Sample Highway Route Badge */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4 text-xs font-bold">
              <div className="flex items-center gap-2 text-amber-400">
                <MapPin size={16} />
                <span>INDORE</span>
              </div>
              <div className="flex-1 h-0.5 bg-gradient-to-r from-amber-400 via-purple-500 to-blue-500" />
              <div className="text-purple-300">UJJAIN</div>
              <div className="flex-1 h-0.5 bg-gradient-to-r from-purple-500 to-emerald-400" />
              <div className="text-emerald-400">DESTINATION</div>
            </div>

            {/* CTA */}
            <div className="pt-2">
              <button
                onClick={() => navigate("/taxi/user?tab=outstation")}
                className="px-8 py-4 text-sm font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-2xl shadow-xl shadow-amber-400/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>Plan an Outstation Ride</span>
                <ArrowRight size={18} />
              </button>
            </div>

          </div>

          {/* Right Column: Visual Stage */}
          <div className="lg:col-span-6 relative flex items-center justify-center">

            <div className="w-full h-[360px] sm:h-[420px] rounded-3xl overflow-hidden border border-slate-800 relative shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&w=800&q=80"
                alt="Highway Travel"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />

              <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md text-white flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-amber-400">Raydo Highway Prime</div>
                  <div className="text-[11px] text-slate-300 font-medium">Verified AC Sedans & SUVs</div>
                </div>
                <span className="text-xs font-black text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-500/40">
                  Fixed Pricing
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
