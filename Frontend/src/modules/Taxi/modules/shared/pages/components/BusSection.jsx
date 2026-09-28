import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bus, MapPin, Calendar, ArrowRight, ShieldCheck } from "lucide-react";

export default function BusSection() {
  const navigate = useNavigate();
  const [fromCity, setFromCity] = useState("Indore");
  const [toCity, setToCity] = useState("Bhopal");
  const [date, setDate] = useState("Today");

  return (
    <section id="bus" className="relative bg-slate-50 py-20 lg:py-28 overflow-hidden border-b border-slate-200/80">

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        <div className="grid lg:grid-cols-12 items-center gap-12">

          {/* Left Column: Heading & Bus Search Form */}
          <div className="lg:col-span-6 space-y-6">

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100 border border-blue-300 text-blue-900 text-xs font-black tracking-wider uppercase"
            >
              <Bus size={14} />
              <span>RAYDO BUS EXPRESS</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight"
            >
              Your Next Stop <br />
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 bg-clip-text text-transparent">
                Starts Here.
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-base text-slate-600 font-medium leading-relaxed"
            >
              Book intercity AC Sleeper, Volvos and luxury buses across hundreds of routes with live bus tracking and instant seat selection.
            </motion.p>

            {/* Bus Booking Interface Card */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xl space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">

                {/* From */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">From</label>
                  <input
                    type="text"
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 bg-transparent focus:outline-none mt-0.5"
                  />
                </div>

                {/* To */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">To</label>
                  <input
                    type="text"
                    value={toCity}
                    onChange={(e) => setToCity(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 bg-transparent focus:outline-none mt-0.5"
                  />
                </div>

                {/* Date */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Date</label>
                  <input
                    type="text"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 bg-transparent focus:outline-none mt-0.5"
                  />
                </div>

              </div>

              <button
                onClick={() => navigate("/taxi/user?tab=bus")}
                className="w-full py-3.5 text-xs font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Explore Bus Routes</span>
                <ArrowRight size={16} />
              </button>
            </div>

          </div>

          {/* Right Column: Visual Stage */}
          <div className="lg:col-span-6 relative flex items-center justify-center">

            <div className="w-full h-[360px] sm:h-[420px] rounded-3xl overflow-hidden border border-slate-200 relative shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=80"
                alt="Raydo Bus Travel"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />

              <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-white/95 border border-slate-200 backdrop-blur-md text-slate-900 flex items-center justify-between shadow-xl">
                <div>
                  <div className="text-xs font-black text-purple-700">Raydo AC Luxury Volvo</div>
                  <div className="text-[11px] text-slate-600 font-medium">Recliner & Sleeper Seats</div>
                </div>
                <span className="text-xs font-black text-amber-950 bg-amber-400 px-3 py-1 rounded-lg">
                  Instant Ticket
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
