import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Sparkles, Navigation, Clock, ShieldCheck, ChevronRight } from 'lucide-react';

const defaultOptionsData = [
  {
    id: 'bike',
    type: 'bike',
    title: 'Bike',
    badge: 'Fastest',
    mainIcon: '🛵',
    eta: null,
    fare: null,
    available: true,
    speedFactor: 'fast',
    description: 'Bypass traffic effortlessly'
  },
  {
    id: 'cab',
    type: 'cab',
    title: 'Cab',
    badge: 'Comfort',
    mainIcon: '🚕',
    eta: null,
    fare: null,
    available: true,
    speedFactor: 'smooth',
    description: 'Private AC door-to-door ride'
  },
  {
    id: 'bus_cab',
    type: 'bus_cab',
    title: 'Bus + Cab',
    badge: 'Save more',
    mainIcon: '🚌',
    secondaryIcon: '🚕',
    eta: null,
    fare: null,
    available: true,
    speedFactor: 'multimodal',
    description: 'Express transit + quick last mile cab'
  }
];

const RaydoTripPlanner = ({
  destination = 'Devi Ahilya Airport',
  city = 'Indore',
  destinationIcon = '✈️',
  options = defaultOptionsData,
  className = ''
}) => {
  const [selectedOptionId, setSelectedOptionId] = useState('bike');

  const journeyOptions = options && options.length > 0 ? options : defaultOptionsData;
  const activeOption = journeyOptions.find((opt) => opt.id === selectedOptionId) || journeyOptions[0];

  // Formatting helpers for dynamic data
  const renderFareLabel = (opt) => {
    if (opt.available === false) return 'Currently unavailable';
    if (opt.fare !== null && opt.fare !== undefined && !isNaN(opt.fare)) {
      return `₹${opt.fare}`;
    }
    return 'Live fare';
  };

  const renderEtaLabel = (opt) => {
    if (opt.available === false) return 'Service unavailable';
    if (opt.eta) return opt.eta;
    return 'Dynamic ETA';
  };

  return (
    <section className={`px-4 py-7 bg-[#FFF8EC] select-none ${className}`}>
      <div className="max-w-[420px] mx-auto">
        {/* Section Header */}
        <div className="text-center mb-5 px-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7657FF]/10 border border-[#7657FF]/20 text-[#7657FF] text-[10.5px] font-black tracking-wider uppercase mb-2 shadow-sm">
            <span>✦ RAYDO TRIP PLANNER</span>
          </div>
          <h2 className="text-[22px] sm:text-[24px] font-black text-slate-900 tracking-tight leading-tight">
            One destination.<br />
            <span className="bg-gradient-to-r from-[#7657FF] to-[#5B36EC] bg-clip-text text-transparent">
              Multiple ways to get there.
            </span>
          </h2>
          <p className="mt-1.5 text-[11.5px] font-bold text-slate-600 leading-snug">
            Compare smart mobility routes tailored to your time & budget.
          </p>
        </div>

        {/* ONE Large Dark Navy Feature Card (#0A1028) */}
        <div className="relative overflow-hidden bg-[#0A1028] text-white rounded-[24px] border border-white/10 p-5 shadow-[0_20px_50px_rgba(10,16,40,0.25)]">
          {/* Subtle Ambient Background Glows */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#7657FF]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#FFC400]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Example Destination Banner */}
          <div className="relative z-10 flex items-center justify-between bg-white/[0.05] border border-white/[0.08] rounded-2xl p-3 mb-5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7657FF]/20 to-[#FFC400]/20 border border-white/10 flex items-center justify-center text-xl shadow-inner">
                {destinationIcon}
              </div>
              <div>
                <div className="flex items-center gap-1 text-[9px] font-black text-[#FFC400] tracking-widest uppercase">
                  <span>TARGET DESTINATION</span>
                </div>
                <h3 className="text-[14px] font-black text-white tracking-tight leading-snug">
                  {destination}
                </h3>
                <p className="text-[10px] font-bold text-slate-400">
                  {city}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end justify-center px-2 py-1 rounded-lg bg-white/[0.04] border border-white/5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">STATUS</span>
              <span className="text-[10px] font-black text-[#FFC400] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFC400] animate-pulse" />
                Live Routes
              </span>
            </div>
          </div>

          {/* JOURNEY VISUALIZATION CANVAS */}
          <div className="relative z-10 bg-[#060A1B]/80 border border-white/[0.06] rounded-2xl p-4 mb-5 shadow-inner">
            <div className="flex items-center justify-between mb-3 text-[9.5px] font-black tracking-wider uppercase text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#FFC400]" />
                START (ORIGIN)
              </span>
              <span className="flex items-center gap-1 text-[#FFC400]">
                <MapPin size={11} className="text-[#FFC400]" />
                DESTINATION
              </span>
            </div>

            {/* SVG Journey Arc Timeline */}
            <div className="relative w-full h-24 flex items-center justify-center overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 320 80" fill="none">
                <defs>
                  {/* Glowing Path Gradient */}
                  <linearGradient id="journeyPathGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FFC400" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#7657FF" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#FFC400" stopOpacity="0.9" />
                  </linearGradient>

                  <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Subtle Base Glowing Track */}
                <path
                  d="M 30,40 Q 160,10 290,40"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Animated Glowing Active Path */}
                <motion.path
                  d="M 30,40 Q 160,10 290,40"
                  stroke="url(#journeyPathGlow)"
                  strokeWidth="3"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ strokeDashoffset: 50 }}
                  animate={{ strokeDashoffset: [0, -100] }}
                  transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                />

                {/* START Node Marker */}
                <g transform="translate(30, 40)">
                  <circle r="7" fill="#FFC400" fillOpacity="0.2" />
                  <circle r="4" fill="#FFC400" />
                  <circle r="1.5" fill="#0A1028" />
                </g>

                {/* Intermediate Transit Hub (Used notably for Bus + Cab leg transfer) */}
                <g transform="translate(160, 25)">
                  <circle
                    r="5"
                    fill="#7657FF"
                    fillOpacity={selectedOptionId === 'bus_cab' ? 0.3 : 0.15}
                  />
                  <circle r="3" fill="#7657FF" />
                  {selectedOptionId === 'bus_cab' && (
                    <circle
                      r="7"
                      stroke="#7657FF"
                      strokeWidth="1"
                      fill="none"
                      className="animate-ping"
                    />
                  )}
                </g>

                {/* DESTINATION Node Marker with Pulsing Effect */}
                <g transform="translate(290, 40)">
                  <circle r="10" fill="#FFC400" fillOpacity="0.25" className="animate-pulse" />
                  <circle r="8" stroke="#FFC400" strokeWidth="1.5" fill="none" className="animate-ping" />
                  <circle r="5" fill="#FFC400" />
                  <circle r="2" fill="white" />
                </g>
              </svg>

              {/* Dynamic Vehicle Icon Movement overlays */}
              <div className="absolute inset-0 pointer-events-none">
                <AnimatePresence mode="wait">
                  {selectedOptionId === 'bike' && (
                    <motion.div
                      key="bike-motion"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full absolute inset-0"
                    >
                      <motion.div
                        className="absolute text-xl filter drop-shadow-[0_0_8px_rgba(255,196,0,0.8)]"
                        animate={{
                          x: [20, 150, 275],
                          y: [32, 10, 32],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.8,
                          ease: 'easeInOut',
                        }}
                      >
                        🛵
                      </motion.div>
                    </motion.div>
                  )}

                  {selectedOptionId === 'cab' && (
                    <motion.div
                      key="cab-motion"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full absolute inset-0"
                    >
                      <motion.div
                        className="absolute text-xl filter drop-shadow-[0_0_8px_rgba(118,87,255,0.8)]"
                        animate={{
                          x: [20, 150, 275],
                          y: [32, 10, 32],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 3.2,
                          ease: 'easeInOut',
                        }}
                      >
                        🚕
                      </motion.div>
                    </motion.div>
                  )}

                  {selectedOptionId === 'bus_cab' && (
                    <motion.div
                      key="bus-cab-motion"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full absolute inset-0"
                    >
                      {/* Leg 1: Bus travels from Start to Transit Hub */}
                      <motion.div
                        className="absolute text-xl filter drop-shadow-[0_0_8px_rgba(118,87,255,0.8)]"
                        animate={{
                          x: [20, 145],
                          y: [32, 12],
                          opacity: [1, 1, 0],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 3.6,
                          times: [0, 0.45, 0.5],
                          ease: 'easeInOut',
                        }}
                      >
                        🚌
                      </motion.div>

                      {/* Leg 2: Cab takes over from Transit Hub to Destination */}
                      <motion.div
                        className="absolute text-xl filter drop-shadow-[0_0_8px_rgba(255,196,0,0.8)]"
                        animate={{
                          x: [145, 275],
                          y: [12, 32],
                          opacity: [0, 1, 1],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 3.6,
                          times: [0.5, 0.55, 1],
                          ease: 'easeInOut',
                        }}
                      >
                        🚕
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Journey Visual Caption */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[10px] text-slate-300 font-bold">
              <span>Selected Mode: <strong className="text-white">{activeOption.title}</strong></span>
              <span className="text-[#FFC400] text-[9.5px] font-black uppercase tracking-wider">
                {activeOption.description}
              </span>
            </div>
          </div>

          {/* 3 JOURNEY OPTIONS SELECTOR */}
          <div className="space-y-2.5">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 px-1">
              Select Journey Option
            </div>

            <div className="grid grid-cols-3 gap-2">
              {journeyOptions.map((opt) => {
                const isSelected = opt.id === selectedOptionId;
                const fareText = renderFareLabel(opt);
                const etaText = renderEtaLabel(opt);

                return (
                  <motion.button
                    key={opt.id}
                    onClick={() => setSelectedOptionId(opt.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className={`relative p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-gradient-to-b from-[#7657FF]/25 to-[#0A1028] border-[#7657FF] shadow-[0_4px_14px_rgba(118,87,255,0.3)]'
                        : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'
                    }`}
                  >
                    {/* Top Pill / Badge */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xl flex items-center gap-0.5">
                        <span>{opt.mainIcon}</span>
                        {opt.secondaryIcon && (
                          <span className="text-xs text-[#FFC400] -ml-1">+{opt.secondaryIcon}</span>
                        )}
                      </div>
                      <span
                        className={`text-[8.5px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                          isSelected
                            ? 'bg-[#FFC400] text-[#0A1028]'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    </div>

                    {/* Option Title */}
                    <div>
                      <h4 className="text-[12.5px] font-black text-white leading-tight">
                        {opt.title}
                      </h4>

                      {/* Dynamic ETA */}
                      <p className="text-[10px] font-bold text-slate-300 mt-1 flex items-center gap-1">
                        <Clock size={9} className="text-[#FFC400]" />
                        <span>{etaText}</span>
                      </p>

                      {/* Dynamic Fare */}
                      <p className="text-[10.5px] font-black text-[#FFC400] mt-0.5">
                        {fareText}
                      </p>
                    </div>

                    {/* Active Indicator Glow Bar */}
                    {isSelected && (
                      <motion.div
                        layoutId="activeGlowBar"
                        className="absolute bottom-0 left-3 right-3 h-[2.5px] bg-[#FFC400] rounded-full shadow-[0_0_8px_#FFC400]"
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Footer Product Communication Note */}
          <div className="mt-5 pt-3.5 border-t border-white/[0.08] flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1 font-bold">
              <ShieldCheck size={12} className="text-[#FFC400]" />
              Smart Multi-Option Routing
            </span>
            <span className="text-slate-400 font-bold">Raydo Mobility Engine</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RaydoTripPlanner;
