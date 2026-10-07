import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Quote, Sparkles } from "lucide-react";

export default function TestimonialsSection() {
  const [activeTab, setActiveTab] = useState("ALL");

  const reviews = [
    {
      category: "RIDES",
      name: "Ananya Sharma",
      role: "Daily Commuter",
      city: "Indore",
      rating: 5,
      text: "Raydo has transformed my daily office commute. Fares are completely transparent with zero surge charges during peak rain hours!",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
    },
    {
      category: "FOOD",
      name: "Siddharth Rao",
      role: "Foodie & Techie",
      city: "Delhi NCR",
      rating: 5,
      text: "Hot meals delivered in under 25 minutes directly from top local cloud kitchens with zero hidden packaging surcharges!",
      avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80",
    },
    {
      category: "OUTSTATION",
      name: "Vikram Malhotra",
      role: "Business Traveler",
      city: "Ujjain",
      rating: 5,
      text: "Booked an outstation cab from Indore to Ujjain. The driver was super polite, vehicle was clean, and live tracking kept my family relaxed.",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80",
    },
    {
      category: "BUS",
      name: "Priya Patel",
      role: "Intercity Passenger",
      city: "Bhopal",
      rating: 5,
      text: "The Raydo Bus booking was seamless. Instant digital tickets and exact live location of the Volvo bus made intercity travel so simple.",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
    },
    {
      category: "PARTNERS",
      name: "Rohan Verma",
      role: "Driver Partner",
      city: "Indore",
      rating: 5,
      text: "I drive with Raydo as a partner. Daily payouts and low platform commissions mean I earn far more than on other cab apps.",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80",
    },
    {
      category: "FRANCHISE",
      name: "Mehta Regional Hub",
      role: "Franchise Owner",
      city: "Dewas",
      rating: 5,
      text: "Operating Raydo city franchise in Dewas. The multi-service platform brings continuous ride and food dispatch volume daily.",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&q=80",
    },
  ];

  const categories = ["ALL", "RIDES", "FOOD", "OUTSTATION", "BUS", "PARTNERS", "FRANCHISE"];

  const filteredReviews = activeTab === "ALL" ? reviews : reviews.filter((r) => r.category === activeTab);

  return (
    <section className="relative bg-[#070A1F] py-24 lg:py-32 text-white border-b border-slate-800/80 overflow-hidden">
      
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[500px] rounded-full bg-[#315CFF]/10 blur-[170px] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFC400]/10 border border-[#FFC400]/30 text-[#FFC400] text-xs font-black tracking-wider uppercase mb-4 shadow-md"
          >
            <Sparkles size={14} />
            <span>COMMUNITY VOICES</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight"
          >
            Moving People & Food. <br />
            <span className="bg-gradient-to-r from-[#FFC400] via-[#315CFF] to-[#7147FF] bg-clip-text text-transparent">
              Building Real Trust Across India.
            </span>
          </motion.h2>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {categories.map((cat) => {
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
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

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredReviews.map((rev, idx) => (
              <motion.div
                key={rev.name}
                layout
                initial={{ opacity: 0, scale: 0.9, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -15 }}
                transition={{ duration: 0.35, delay: idx * 0.05 }}
                className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between hover:border-[#FFC400]/40 transition-all backdrop-blur-xl group shadow-2xl"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1 text-[#FFC400]">
                      {[...Array(rev.rating)].map((_, i) => (
                        <Star key={i} size={14} className="fill-[#FFC400]" />
                      ))}
                    </div>
                    <Quote size={20} className="text-slate-600 group-hover:text-[#FFC400] transition-colors" />
                  </div>

                  <p className="text-xs font-medium text-slate-300 leading-relaxed mb-6">
                    "{rev.text}"
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                  <img
                    src={rev.avatar}
                    alt={rev.name}
                    className="size-10 rounded-full object-cover border-2 border-[#FFC400]"
                  />
                  <div>
                    <h4 className="text-xs font-black text-white">{rev.name}</h4>
                    <p className="text-[10px] font-bold text-[#FFC400]">{rev.role} • {rev.city}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

      </div>
    </section>
  );
}

