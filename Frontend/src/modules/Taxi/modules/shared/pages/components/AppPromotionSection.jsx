import React from "react";
import { motion } from "framer-motion";
import { Smartphone, Star, Radio, MapPin, CheckCircle2 } from "lucide-react";

export default function AppPromotionSection() {
  return (
    <section id="download" className="relative bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 py-20 lg:py-28 text-white overflow-hidden">
      
      {/* Raydo Yellow Glow */}
      <div className="absolute top-1/3 left-1/4 size-96 rounded-full bg-amber-400/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 size-96 rounded-full bg-purple-600/20 blur-[150px] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
        
        <div className="grid lg:grid-cols-12 items-center gap-12">
          
          {/* Left Column: Heading & Download CTAs */}
          <div className="lg:col-span-6 space-y-6">
            
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md"
            >
              <Smartphone size={14} />
              <span>RAYDO MOBILE EXPERIENCE</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl sm:text-5xl font-black text-white tracking-tight"
            >
              Your Everyday Travel, <br />
              <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-200 bg-clip-text text-transparent">
                One App.
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-base text-slate-300 font-medium leading-relaxed"
            >
              Book rides, plan outstation trips, track drivers live, and manage payments effortlessly from your smartphone.
            </motion.p>

            {/* App Store Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => alert("Raydo Android App coming soon to Google Play Store!")}
                className="px-6 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-3 shadow-xl transition-transform hover:-translate-y-0.5 cursor-pointer"
              >
                <span className="text-xl">🤖</span>
                <div className="text-left">
                  <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-800">GET IT ON</div>
                  <div className="text-sm font-black">Google Play</div>
                </div>
              </button>

              <button
                onClick={() => alert("Raydo iOS App coming soon to Apple App Store!")}
                className="px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs flex items-center gap-3 shadow-xl transition-transform hover:-translate-y-0.5 cursor-pointer"
              >
                <span className="text-xl">🍎</span>
                <div className="text-left">
                  <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">DOWNLOAD ON THE</div>
                  <div className="text-sm font-black">App Store</div>
                </div>
              </button>
            </div>

            {/* Trust highlights */}
            <div className="flex items-center gap-4 pt-4 border-t border-slate-800 text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 size={14} /> 4.9 ★ User Rating
              </span>
              <span>•</span>
              <span>Lightweight App (&lt; 25MB)</span>
            </div>

          </div>

          {/* Right Column: 3D Smartphone Visual Mockup */}
          <div className="lg:col-span-6 relative flex items-center justify-center">
            
            <div className="relative w-[280px] sm:w-[320px] h-[560px] sm:h-[620px] rounded-[48px] border-8 border-slate-800 bg-slate-950 shadow-2xl p-4 overflow-hidden flex flex-col justify-between">
              
              {/* Phone Speaker Notch */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-4 rounded-full bg-slate-900 z-30" />

              {/* Phone Screen Mockup UI */}
              <div className="relative w-full h-full rounded-[36px] bg-slate-900 overflow-hidden flex flex-col justify-between p-4 pt-8">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-sm font-black text-amber-400">RAYDO RIDE</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Live GPS
                  </span>
                </div>

                {/* Map Graphic Area */}
                <div className="relative my-4 flex-1 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[11px] text-amber-400 font-extrabold">
                    <span>Pickup: Connaught Place</span>
                    <span>ETA 3 min</span>
                  </div>

                  <div className="flex items-center justify-center my-auto">
                    <div className="size-16 rounded-full bg-purple-600/30 border-2 border-amber-400 flex items-center justify-center animate-pulse">
                      <span className="text-2xl">🚕</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 font-medium text-center">
                    Driver Rajesh K. is 400m away
                  </div>
                </div>

                {/* Bottom Booking Button */}
                <div className="py-3 px-4 rounded-xl bg-amber-400 text-slate-950 font-black text-xs text-center shadow-lg">
                  Confirm Raydo Sedan
                </div>

              </div>

            </div>

            {/* Floating Glass Badges around Phone */}
            <motion.div
              animate={{ y: [-6, 6, -6] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-12 -left-4 z-20 bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3 shadow-xl backdrop-blur-md text-xs font-black text-amber-400"
            >
              ⚡ Instant Allocation
            </motion.div>

            <motion.div
              animate={{ y: [6, -6, 6] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-12 -right-4 z-20 bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3 shadow-xl backdrop-blur-md text-xs font-black text-emerald-400"
            >
              🔒 100% OTP Verified
            </motion.div>

          </div>

        </div>

      </div>
    </section>
  );
}
