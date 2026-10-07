import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Users, MapPin, Headphones } from "lucide-react";

export default function TrustStrip() {
  const stats = [
    {
      label: "Rides Completed",
      value: "10K+",
      icon: ShieldCheck,
      desc: "Safe & comfortable journeys",
      accent: "text-amber-500",
      bg: "bg-amber-50",
    },
    {
      label: "Verified Drivers",
      value: "5K+",
      icon: Users,
      desc: "Background checked partners",
      accent: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Cities & Routes",
      value: "50+",
      icon: MapPin,
      desc: "Expanding pan-India network",
      accent: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Customer Support",
      value: "24/7",
      icon: Headphones,
      desc: "Always here when you need",
      accent: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <section className="relative bg-white py-12 border-y border-slate-200/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all bg-slate-50/50"
              >
                <div className={`p-3.5 rounded-xl ${stat.bg} ${stat.accent} shrink-0`}>
                  <Icon size={24} />
                </div>
                <div>
                  <div className={`text-2xl sm:text-3xl font-black tracking-tight ${stat.accent}`}>
                    {stat.value}
                  </div>
                  <div className="text-xs font-extrabold text-slate-800 leading-snug">
                    {stat.label}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 hidden sm:block">
                    {stat.desc}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
