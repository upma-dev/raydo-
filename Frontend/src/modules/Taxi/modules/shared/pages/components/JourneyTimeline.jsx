import React from "react";
import { motion } from "framer-motion";
import { Compass, CheckCircle2, Navigation, Car, ShieldCheck, MapPin } from "lucide-react";

export default function JourneyTimeline() {
  const steps = [
    {
      stage: "PLAN",
      title: "Choose your destination.",
      desc: "Set pickup and dropoff locations with instant transparent fare estimates.",
      icon: MapPin,
      badgeColor: "bg-amber-400 text-slate-950",
      accent: "border-amber-400",
    },
    {
      stage: "BOOK",
      title: "Select the ride that fits your journey.",
      desc: "Choose from City Cabs, Outstation Sedans, or Intercity Buses instantly.",
      icon: Car,
      badgeColor: "bg-purple-600 text-white",
      accent: "border-purple-500",
    },
    {
      stage: "TRACK",
      title: "Follow your driver in real time.",
      desc: "Watch your driver arrive live on high-precision GPS maps.",
      icon: Navigation,
      badgeColor: "bg-blue-600 text-white",
      accent: "border-blue-500",
    },
    {
      stage: "TRAVEL",
      title: "Enjoy a comfortable ride.",
      desc: "Relax with verified drivers, clean air-conditioned vehicles & in-ride safety.",
      icon: Compass,
      badgeColor: "bg-indigo-600 text-white",
      accent: "border-indigo-500",
    },
    {
      stage: "ARRIVE",
      title: "Reach your destination safely.",
      desc: "Cashless payments, instant digital receipts and 24/7 trip protection.",
      icon: ShieldCheck,
      badgeColor: "bg-emerald-500 text-white",
      accent: "border-emerald-500",
    },
  ];

  return (
    <section className="relative bg-white py-20 lg:py-28 overflow-hidden border-b border-slate-200/80">
      
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black tracking-wider uppercase mb-4"
          >
            <span>SMART TRIP TIMELINE</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight"
          >
            Raydo Understands <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-500 via-purple-600 to-blue-600 bg-clip-text text-transparent">
              Your Journey.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-4 text-base text-slate-600 font-medium"
          >
            A seamless, stress-free travel flow designed step-by-step from pickup to destination.
          </motion.p>
        </div>

        {/* Timeline Desktop Horizontal / Mobile Vertical */}
        <div className="relative">
          
          {/* SVG Animated Route Line Background (Desktop) */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-slate-100 z-0">
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-amber-400 via-purple-600 to-emerald-500 origin-left"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 relative z-10">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.stage}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.15 }}
                  className="relative flex flex-col items-center text-center bg-slate-50 border border-slate-200/80 rounded-3xl p-6 hover:shadow-xl hover:bg-white transition-all group"
                >
                  {/* Step Stage Badge */}
                  <div className={`px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase mb-4 ${step.badgeColor} shadow-sm`}>
                    {step.stage}
                  </div>

                  {/* Icon Marker */}
                  <div className={`p-4 rounded-2xl bg-white border-2 ${step.accent} shadow-md mb-4 text-slate-900 group-hover:scale-110 transition-transform`}>
                    <Icon size={26} />
                  </div>

                  <h3 className="text-base font-black text-slate-900 mb-2 leading-snug">
                    {step.title}
                  </h3>

                  <p className="text-xs font-medium text-slate-600 leading-relaxed">
                    {step.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
}
