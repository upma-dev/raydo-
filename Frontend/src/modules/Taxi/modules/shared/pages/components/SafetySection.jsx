import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Eye, CreditCard, Headphones, Lock, CheckCircle2, ShieldAlert } from "lucide-react";

export default function SafetySection() {
  const safetyFeatures = [
    {
      title: "100% Verified Captains & Kitchens",
      desc: "Every driver partner is background-checked, and food kitchens pass 40+ hygiene standards.",
      icon: ShieldCheck,
      color: "text-[#FFC400]",
      bg: "bg-slate-900 border-slate-800 hover:border-[#FFC400]/40",
    },
    {
      title: "Real-Time Trip & Order Tracking",
      desc: "Share live trip GPS or food dispatch route with family with one-click emergency SOS.",
      icon: Eye,
      color: "text-[#315CFF]",
      bg: "bg-slate-900 border-slate-800 hover:border-[#315CFF]/40",
    },
    {
      title: "Encrypted Zero-Surge Fares",
      desc: "Transparent upfront pricing with instant UPI, Cards & Wallet payment encryption.",
      icon: CreditCard,
      color: "text-[#7147FF]",
      bg: "bg-slate-900 border-slate-800 hover:border-[#7147FF]/40",
    },
    {
      title: "24/7 Command Support Hub",
      desc: "Dedicated safety dispatch center monitoring active rides and delivery partners 24/7.",
      icon: Headphones,
      color: "text-emerald-400",
      bg: "bg-slate-900 border-slate-800 hover:border-emerald-400/40",
    },
  ];

  return (
    <section id="safety" className="relative bg-[#070A1F] py-24 lg:py-32 text-white overflow-hidden border-b border-slate-800/80">
      
      {/* Background Glows */}
      <div className="absolute top-1/3 left-10 size-96 rounded-full bg-[#FFC400]/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 size-96 rounded-full bg-[#315CFF]/15 blur-[150px] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
        
        <div className="grid lg:grid-cols-12 items-center gap-12 lg:gap-16">
          
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-8">
            
            <div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black tracking-wider uppercase mb-4 shadow-md"
              >
                <Lock size={14} />
                <span>UNCOMPROMISING SAFETY PROTOCOLS</span>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight"
              >
                Every Ride & Order. <br />
                <span className="bg-gradient-to-r from-[#FFC400] via-[#315CFF] to-emerald-400 bg-clip-text text-transparent">
                  100% Shielded & Verified.
                </span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-4 text-sm sm:text-base text-slate-300 font-medium leading-relaxed max-w-xl"
              >
                Raydo is engineered with multi-layered safety protocols across city cabs, outstation highway journeys, bus travel, and food delivery.
              </motion.p>
            </div>

            {/* 4 Feature Cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              {safetyFeatures.map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <motion.div
                    key={feat.title}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className={`p-5 rounded-2xl border ${feat.bg} transition-all duration-300 backdrop-blur-xl group hover:shadow-2xl`}
                  >
                    <div className={`p-3 rounded-xl bg-slate-950 border border-slate-800 w-max mb-3 ${feat.color} shadow-md`}>
                      <Icon size={22} />
                    </div>
                    <h3 className="text-base font-black text-white mb-1 group-hover:text-[#FFC400] transition-colors">
                      {feat.title}
                    </h3>
                    <p className="text-xs font-medium text-slate-400 leading-relaxed">
                      {feat.desc}
                    </p>
                  </motion.div>
                );
              })}
            </div>

          </div>

          {/* Right Column: Floating Shield Badge */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            
            <div className="relative w-full max-w-[420px] aspect-square rounded-3xl bg-slate-900/90 border border-slate-800 p-8 shadow-2xl overflow-hidden flex flex-col items-center justify-center text-center backdrop-blur-2xl">
              
              {/* Radial Aura Glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#FFC400]/15 via-[#315CFF]/15 to-transparent blur-2xl pointer-events-none" />

              {/* Floating Shield Icon */}
              <motion.div
                animate={{ y: [-8, 8, -8], rotate: [-2, 2, -2] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-10 p-6 rounded-3xl bg-slate-950 border-2 border-[#FFC400] shadow-2xl text-[#FFC400] mb-6 backdrop-blur-md"
              >
                <ShieldCheck size={72} className="drop-shadow-[0_0_20px_rgba(255,196,0,0.6)]" />
              </motion.div>

              <h3 className="relative z-10 text-2xl font-black text-white mb-2">
                Raydo SafeShield™
              </h3>
              <p className="relative z-10 text-xs text-slate-300 font-medium max-w-xs leading-relaxed">
                Real-time incident monitoring, emergency SOS dispatch, and live location sharing on every trip.
              </p>

              <div className="relative z-10 mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFC400] text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-400/20">
                <CheckCircle2 size={16} />
                <span>100% Verified Ecosystem</span>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}

