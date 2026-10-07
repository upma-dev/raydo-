import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, HelpCircle, Sparkles } from "lucide-react";

export default function FaqSection() {
  const [openIdx, setOpenIdx] = useState(0);
  const [activeCategory, setActiveCategory] = useState("ALL");

  const faqs = [
    {
      category: "FOOD",
      q: "How does Raydo Food Delivery work?",
      a: "Simply open the Raydo app or website, switch to the Food tab, browse top verified partner restaurants in your area, customize your meal, and track your delivery rider live from kitchen to doorstep.",
    },
    {
      category: "RIDES",
      q: "How do I book a Raydo city ride?",
      a: "Enter your pickup location and destination on the booking widget or mobile app, select your preferred cab option (Auto, Moto, Mini, Sedan), and tap 'Find Ride Now'. A verified captain is assigned in seconds.",
    },
    {
      category: "OUTSTATION & BUS",
      q: "Does Raydo offer outstation cabs and intercity bus tickets?",
      a: "Yes! Raydo provides premium outstation cabs for one-way and round trips with highway-verified drivers. You can also book AC Sleeper & Volvo intercity buses with live seat maps.",
    },
    {
      category: "PARTNERS & FRANCHISE",
      q: "How can I become a Driver Partner or own a Regional City Franchise?",
      a: "You can apply directly via our Partner section or download the Raydo Driver Partner App. To own an exclusive city franchise hub, select 'City Franchise' under Partners and submit your district details.",
    },
    {
      category: "RIDES",
      q: "Are Raydo fares fixed and transparent?",
      a: "Yes, Raydo uses 100% upfront pricing. The fare shown when booking is exact with zero unexpected surge multipliers.",
    },
    {
      category: "FOOD",
      q: "Are there any hidden packaging or delivery surcharges?",
      a: "No, Raydo Food eliminates hidden packaging multipliers and delivers meals at fair, transparent prices.",
    },
  ];

  const categories = ["ALL", "FOOD", "RIDES", "OUTSTATION & BUS", "PARTNERS & FRANCHISE"];

  const filteredFaqs = activeCategory === "ALL" ? faqs : faqs.filter((f) => f.category === activeCategory);

  const toggleAccordion = (idx) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="relative bg-[#050713] py-24 lg:py-32 text-white border-b border-slate-800/80 overflow-hidden">
      
      {/* Background Aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[500px] rounded-full bg-[#FFC400]/10 blur-[170px] pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 z-10">
        
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[#FFC400] text-xs font-black tracking-wider uppercase mb-4 shadow-md"
          >
            <HelpCircle size={14} />
            <span>KNOWLEDGE HUB & FAQ</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight"
          >
            Got Questions? <br />
            <span className="bg-gradient-to-r from-[#FFC400] via-[#315CFF] to-[#7147FF] bg-clip-text text-transparent">
              We've Got Everything Answered.
            </span>
          </motion.h2>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setOpenIdx(0);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#FFC400] text-slate-950 shadow-md scale-105"
                    : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Accordions */}
        <div className="space-y-3">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className={`bg-slate-900/90 border rounded-2xl overflow-hidden backdrop-blur-xl transition-all ${
                  isOpen ? "border-[#FFC400]/60 shadow-xl shadow-amber-400/10" : "border-slate-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-black text-sm sm:text-base text-white hover:text-[#FFC400] transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 transition-transform duration-300 ${
                      isOpen ? "rotate-180 text-[#FFC400]" : "text-slate-500"
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 text-xs sm:text-sm font-medium text-slate-300 leading-relaxed border-t border-slate-800/80 pt-3">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

      </div>
    </section>
  );
}

