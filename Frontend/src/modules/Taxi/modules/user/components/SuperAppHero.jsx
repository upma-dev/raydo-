import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Car, Package, Search, Compass, MapPin, ArrowRight, Sparkles,
  Users, Bus, Send, Truck
} from 'lucide-react';

import { useSettings } from '../../../shared/context/SettingsContext';
import defaultRaydoLogo from '@food/assets/raydo-logo.png';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';

const resolveAssetUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `${BACKEND_ORIGIN}/${raw.replace(/^\/+/, '')}`;
};

export default function SuperAppHero({ onSearchFocus }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const dynamicLogoRaw = settings?.general?.logo || settings?.customization?.logo || '';
  const logoSrc = dynamicLogoRaw ? resolveAssetUrl(dynamicLogoRaw) : (defaultRaydoLogo || '/raydo-logo.png');
  const [isOpen, setIsOpen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Trigger the split door animation automatically on load
  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  // Service chips data
  const services = [
    { id: 'taxi', label: 'Taxi', Icon: Car, color: 'from-blue-500 to-indigo-600', path: '/taxi/user/ride/select-location' },
    { id: 'outstation', label: 'Outstation', Icon: Compass, color: 'from-blue-600 to-cyan-500', path: '/taxi/user/intercity' },
    { id: 'pooling', label: 'Pooling', Icon: Users, color: 'from-indigo-500 to-blue-600', path: '/taxi/user/pooling' },
    { id: 'parcel', label: 'Parcel', Icon: Package, color: 'from-violet-500 to-purple-600', path: '/taxi/user/parcel/type' },
    { id: 'bus', label: 'Bus', Icon: Bus, color: 'from-sky-500 to-blue-500', path: '/taxi/user/bus' }
  ];

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="w-full relative h-[255px] overflow-hidden rounded-b-none bg-[#1E1B4B] select-none"
    >
      {/* 1. Animated Background Blobs & Morphing Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-20 w-56 h-56 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-20 w-60 h-60 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.08)_0%,transparent_70%)]" />
      </div>

      {/* 3. Center Revealed Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-between py-4.5 px-6 z-10">
        {/* Top: Header Intro */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={isOpen ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="flex items-center gap-1.5 bg-white/10 border border-violet-400/20 px-3 py-1 rounded-full backdrop-blur-md mt-1"
        >
          <Sparkles size={10} className="text-amber-400 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-violet-200">
            RAYDO Super App Experience
          </span>
        </motion.div>

        {/* Center: Glowing RAYDO Logo & Search Bar */}
        <div className="w-full flex flex-col items-center gap-3.5 my-auto">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={isOpen ? { scale: 1, opacity: 1 } : {}}
            transition={{ type: "spring", stiffness: 100, delay: 0.5 }}
            style={{
              x: mousePos.x * 10,
              y: mousePos.y * 10,
            }}
            className="relative"
          >
            {/* Soft Glow behind Logo */}
            <div className="absolute -inset-3 rounded-full bg-amber-400/25 blur-lg animate-pulse" />
            <img
              src={logoSrc}
              alt={settings?.general?.app_name || 'Raydo'}
              onError={(e) => {
                if (e.target.src !== defaultRaydoLogo && e.target.src !== '/raydo-logo.png') {
                  e.target.src = defaultRaydoLogo || '/raydo-logo.png';
                }
              }}
              className="relative h-9 sm:h-10 w-auto object-contain drop-shadow-[0_0_14px_rgba(255,196,0,0.6)]"
            />
          </motion.div>

          {/* Sleek Glassmorphic Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={isOpen ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="w-full max-w-[260px]"
          >
            <button
              type="button"
              onClick={onSearchFocus}
              className="w-full flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 backdrop-blur-xl px-3.5 py-2 text-left shadow-xl transition-all duration-300 hover:bg-white/20 hover:border-violet-400/30 hover:shadow-violet-500/10 group"
            >
              <Search className="h-3.5 w-3.5 text-violet-200/90 group-hover:text-violet-100" />
              <span className="flex-1 truncate text-[11px] font-semibold text-violet-200/70 group-hover:text-violet-100">
                Where are we going today?
              </span>
              <div className="h-4.5 w-4.5 rounded bg-violet-500/30 border border-violet-400/40 flex items-center justify-center">
                <ArrowRight size={9} className="text-violet-200" />
              </div>
            </button>
          </motion.div>
        </div>

        {/* Bottom: Staggered Animated Service Chips */}
        <div className="w-full flex justify-center gap-2 px-1 mb-1">
          {services.map((item, idx) => {
            const Icon = item.Icon;
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={isOpen ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.9 + idx * 0.08, type: "spring", stiffness: 120 }}
                whileHover={{ y: -3, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1 flex-1 max-w-[50px] focus:outline-none group"
              >
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${item.color} shadow-md border border-white/15 flex items-center justify-center text-white relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Icon size={15} className="transform group-hover:scale-110 transition-transform" />
                </div>
                <span className="text-[8px] font-black uppercase tracking-wider text-violet-200/75 group-hover:text-white transition-colors">
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 4. Left Sliding Panel (Violet Luxury Theme - Taxi & Maps) */}
      <motion.div
        animate={{
          x: isOpen ? '-100%' : '0%',
        }}
        transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.3 }}
        className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-br from-slate-950 via-[#1E1B4B] to-purple-950 border-r border-violet-500/20 z-20 flex flex-col justify-between p-4 overflow-hidden origin-right"
      >
        {/* Shiny route line design decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-25">
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            <motion.path
              d="M-20,50 Q20,20 50,60 T120,30"
              stroke="url(#luxury-grad)"
              strokeWidth="2"
              strokeDasharray="3 3"
              animate={{ strokeDashoffset: [0, -15] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
            <defs>
              <linearGradient id="luxury-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7C3AED" />
                <stop offset="100%" stopColor="#818CF8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Top: Luxury branding */}
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded bg-violet-600 flex items-center justify-center text-white border border-violet-400/40">
            <Car size={10} />
          </div>
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-violet-300">
            Violet Ride
          </span>
        </div>

        {/* Center: wireframe map graphic */}
        <div className="my-auto relative flex items-center justify-center h-20">
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10"
          >
            <Compass className="w-12 h-12 text-violet-300/80 stroke-[1.2]" />
            <motion.div
              animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -inset-2.5 rounded-full border border-violet-400/30"
            />
          </motion.div>
          <MapPin className="absolute top-2 left-8 text-violet-400 w-4 h-4 fill-violet-400/20 drop-shadow-[0_0_6px_rgba(124,58,237,0.6)]" />
          <MapPin className="absolute bottom-4 right-10 text-indigo-400 w-3.5 h-3.5 fill-indigo-400/20" />
        </div>

        {/* Bottom: Luxury subtext */}
        <div>
          <p className="text-[12px] font-black text-white tracking-tight leading-tight">
            Premium Transport
          </p>
          <p className="text-[8px] font-bold text-violet-200/70 mt-0.5 uppercase tracking-wider">
            Safe, reliable mobility
          </p>
        </div>
      </motion.div>

      {/* 5. Right Sliding Panel (Lavender Blue Gradient Theme - Parcel Express) */}
      <motion.div
        animate={{
          x: isOpen ? '100%' : '0%',
        }}
        transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.3 }}
        className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-br from-violet-600 via-indigo-600 to-slate-900 border-l border-violet-500/20 z-20 flex flex-col justify-between p-4 overflow-hidden origin-left"
      >
        {/* Floating parcel box particles decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <motion.div
            animate={{ y: [0, -6, 0], rotate: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-6 right-4"
          >
            <Send size={24} className="text-white" />
          </motion.div>
          <motion.div
            animate={{ y: [0, 6, 0], rotate: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-8 left-4"
          >
            <Truck size={24} className="text-white" />
          </motion.div>
        </div>

        {/* Top: Delivery branding */}
        <div className="flex items-center gap-1.5 self-end">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-violet-100">
            EXPRESS PARCEL
          </span>
          <div className="h-5 w-5 rounded bg-white flex items-center justify-center text-violet-600 shadow-sm">
            <Package size={10} />
          </div>
        </div>

        {/* Center: floating box illustration */}
        <div className="my-auto flex items-center justify-center h-20">
          <motion.div
            animate={{
              y: [0, -8, 0],
              rotate: [0, 3, 0]
            }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex items-center justify-center"
          >
            <Package className="w-12 h-12 text-white stroke-[1.2] drop-shadow-2xl" />
            <div className="absolute -bottom-1.5 w-8 h-1.5 bg-black/20 rounded-full blur-sm" />
          </motion.div>
        </div>

        {/* Bottom: Delivery subtext */}
        <div className="text-right">
          <p className="text-[12px] font-black text-white tracking-tight leading-tight">
            Courier & Parcel
          </p>
          <p className="text-[8px] font-bold text-violet-100 mt-0.5 uppercase tracking-wider">
            Send packages anywhere
          </p>
        </div>
      </motion.div>

      {/* 6. Click-to-Reset Door Animation button (subtle top right inside hero container) */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="absolute top-3 right-3 z-30 h-7 w-7 rounded-full border border-white/10 bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/50 hover:text-white transition-colors"
        aria-label="Toggle Door Animation"
      >
        <motion.div
          animate={{ rotate: isOpen ? 0 : 180 }}
          transition={{ duration: 0.3 }}
        >
          <ArrowRight size={12} className={isOpen ? "rotate-180" : ""} />
        </motion.div>
      </button>
    </div>
  );
}
