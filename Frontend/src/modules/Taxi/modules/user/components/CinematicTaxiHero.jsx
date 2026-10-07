import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronDown, ArrowRight, Zap, Navigation, Package, Users, Bike, Car, Shield } from 'lucide-react';
import { syncThemeForPath } from '@/shared/utils/theme.js';
import heroSedanImg from '@/assets/hero_sedan.png';
import heroBikeImg from '@/assets/hero_bike.png';
import heroParcelImg from '@/assets/hero_parcel.png';
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


function readRaydoLocation() {
  if (typeof window === 'undefined') return 'Indore, MP';
  try {
    const foodSaved = JSON.parse(window.localStorage.getItem('userLocation') || '{}');
    if (foodSaved?.area || foodSaved?.city) {
      return `${foodSaved.area || foodSaved.city}${foodSaved.state ? `, ${foodSaved.state}` : ''}`;
    }
    const saved = JSON.parse(window.localStorage.getItem('raydo:lastLocation') || '{}');
    if (saved?.address) {
      const parts = saved.address.split(',').map((p) => p.trim()).filter(Boolean);
      return parts.slice(0, 2).join(', ');
    }
  } catch (err) {
    // fallback
  }
  return 'Indore, MP';
}

const MOBILITY_SERVICES = [
  {
    id: 'cab',
    label: 'Ride',
    icon: Car,
    emoji: '🚕',
    desc: 'Fast & comfortable cabs',
    rawImage: heroSedanImg,
    glowColor: 'rgba(255, 196, 0, 0.45)',
    beamColor: 'linear-gradient(105deg, rgba(255, 230, 150, 0.75) 0%, rgba(255, 196, 0, 0.2) 60%, transparent 100%)',
    arrivingStatus: 'Cab arriving',
    vehicleWidth: 'w-[150px] sm:w-[190px]',
    scaleFactor: 0.85,
  },
  {
    id: 'bike',
    label: 'Bike',
    icon: Bike,
    emoji: '🛵',
    desc: 'Quick & affordable rides',
    rawImage: heroBikeImg,
    glowColor: 'rgba(0, 240, 255, 0.45)',
    beamColor: 'linear-gradient(105deg, rgba(0, 240, 255, 0.8) 0%, rgba(59, 130, 246, 0.2) 60%, transparent 100%)',
    arrivingStatus: 'Bike arriving',
    vehicleWidth: 'w-[120px] sm:w-[150px]',
    scaleFactor: 0.75,
  },
  {
    id: 'parcel',
    label: 'Parcel',
    icon: Package,
    emoji: '📦',
    desc: 'Instant package delivery',
    rawImage: heroParcelImg,
    glowColor: 'rgba(255, 122, 0, 0.45)',
    beamColor: 'linear-gradient(105deg, rgba(255, 122, 0, 0.8) 0%, rgba(255, 196, 0, 0.2) 60%, transparent 100%)',
    arrivingStatus: 'Delivery arriving',
    vehicleWidth: 'w-[130px] sm:w-[160px]',
    scaleFactor: 0.8,
  },
  {
    id: 'pool',
    label: 'Pool',
    icon: Users,
    emoji: '👥',
    desc: 'Shared rides, split fare',
    rawImage: heroSedanImg,
    glowColor: 'rgba(168, 85, 247, 0.45)',
    beamColor: 'linear-gradient(105deg, rgba(168, 85, 247, 0.8) 0%, rgba(236, 72, 153, 0.2) 60%, transparent 100%)',
    arrivingStatus: 'Pool arriving',
    vehicleWidth: 'w-[150px] sm:w-[190px]',
    scaleFactor: 0.85,
  },
];

// Advanced Multi-Corner & Dark/Light Flood-Fill Background Removal Utility (Zero Black Boxes or Edges)
function cleanTransparentVehicleAsset(imageSrc, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imageSrc;
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const W = img.width;
      const H = img.height;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, W, H);
      const data = imgData.data;
      const visited = new Uint8Array(W * H);

      // Sample background colors from 4 corners
      const corners = [
        0, // top-left
        (W - 1) * 4, // top-right
        (H - 1) * W * 4, // bottom-left
        ((H - 1) * W + (W - 1)) * 4, // bottom-right
      ];

      const cornerColors = corners.map((idx) => ({
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3],
      }));

      const isBackgroundPixel = (dataIdx) => {
        const r = data[dataIdx];
        const g = data[dataIdx + 1];
        const b = data[dataIdx + 2];
        const a = data[dataIdx + 3];

        if (a === 0) return true; // already transparent

        // Check if dark background (black/dark grey)
        const maxC = Math.max(r, g, b);
        if (maxC < 52) return true;

        // Check if near white/light-grey background box
        const minC = Math.min(r, g, b);
        if (minC > 210 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) return true;

        // Check distance to corner colors
        for (const c of cornerColors) {
          if (c.a < 10) return true;
          const dr = r - c.r;
          const dg = g - c.g;
          const db = b - c.b;
          const distSq = dr * dr + dg * dg + db * db;
          if (distSq < 3600) return true;
        }
        return false;
      };

      const queue = [];
      // Push all boundary pixels to queue
      for (let x = 0; x < W; x++) {
        queue.push(x, 0);
        queue.push(x, H - 1);
      }
      for (let y = 0; y < H; y++) {
        queue.push(0, y);
        queue.push(W - 1, y);
      }

      let qHead = 0;
      while (qHead < queue.length) {
        const px = queue[qHead++];
        const py = queue[qHead++];
        const pIdx = py * W + px;

        if (visited[pIdx]) continue;
        visited[pIdx] = 1;

        const dataIdx = pIdx * 4;

        if (isBackgroundPixel(dataIdx)) {
          data[dataIdx + 3] = 0; // Alpha = 0

          if (px > 0 && !visited[pIdx - 1]) queue.push(px - 1, py);
          if (px < W - 1 && !visited[pIdx + 1]) queue.push(px + 1, py);
          if (py > 0 && !visited[pIdx - W]) queue.push(px, py - 1);
          if (py < H - 1 && !visited[pIdx + W]) queue.push(px, py + 1);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      callback(canvas.toDataURL('image/png'));
    } catch (e) {
      callback(imageSrc);
    }
  };
  img.onerror = () => callback(imageSrc);
}

export default function CinematicTaxiHero({ onSearchFocus }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const dynamicLogoRaw = settings?.general?.logo || settings?.customization?.logo || '';
  const logoSrc = dynamicLogoRaw ? resolveAssetUrl(dynamicLogoRaw) : (defaultRaydoLogo || '/raydo-logo.png');

  const [locationText, setLocationText] = useState(() => readRaydoLocation());
  const [activeModeIndex, setActiveModeIndex] = useState(0);
  const [cleanVehicleUrls, setCleanVehicleUrls] = useState({});
  const autoCycleRef = useRef(null);
  const loopDuration = 7.0;

  // 1. Process and cache 100% transparent vehicle assets on mount
  useEffect(() => {
    let isMounted = true;
    MOBILITY_SERVICES.forEach((srv) => {
      cleanTransparentVehicleAsset(srv.rawImage, (cleanUrl) => {
        if (isMounted) {
          setCleanVehicleUrls((prev) => ({ ...prev, [srv.id]: cleanUrl }));
        }
      });
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Auto-cycle vehicles — switches after each drive pass
  useEffect(() => {
    autoCycleRef.current = setInterval(() => {
      setActiveModeIndex((prev) => (prev + 1) % MOBILITY_SERVICES.length);
    }, loopDuration * 1000);
    return () => clearInterval(autoCycleRef.current);
  }, [loopDuration]);

  // 3. Sync Location Listener
  useEffect(() => {
    const syncLocation = () => setLocationText(readRaydoLocation());
    window.addEventListener('storage', syncLocation);
    window.addEventListener('raydo:location-updated', syncLocation);
    window.addEventListener('userLocationUpdated', syncLocation);
    return () => {
      window.removeEventListener('storage', syncLocation);
      window.removeEventListener('raydo:location-updated', syncLocation);
      window.removeEventListener('userLocationUpdated', syncLocation);
    };
  }, []);

  const currentServiceObj = MOBILITY_SERVICES[activeModeIndex] || MOBILITY_SERVICES[0];
  const activeVehicleSrc = cleanVehicleUrls[currentServiceObj.id] || currentServiceObj.rawImage;

  // =========================================================================
  // 8-SCENE TIMELINE REAL-TIME CALCULATIONS (7.0 Seconds Seamless Loop)
  // =========================================================================

  const isPool = currentServiceObj.id === 'pool';

  // Keyframe calculations matching 8 scenes
  const timeTimes = [0, 0.143, 0.214, 0.400, 0.500, 0.714, 0.828, 1.0];

  // Vehicle Positions (X, Y percentage)
  const vehicleX = isPool
    ? ['52%', '52%', '52%', '75%', '75%', '42%', '18%', '52%']
    : ['52%', '52%', '52%', '75%', '75%', '18%', '15%', '52%'];

  const vehicleY = isPool
    ? ['34%', '34%', '34%', '24%', '24%', '52%', '70%', '34%']
    : ['34%', '34%', '34%', '24%', '24%', '70%', '72%', '34%'];

  // Vehicle Scale (Preserves 3D perspective depth, uniform for Bus & Car)
  const baseScale = currentServiceObj.scaleFactor;
  const vehicleScale = [
    0.05,
    0.05,
    0.15,
    baseScale * 0.45,
    baseScale * 0.45,
    baseScale,
    baseScale,
    0.05,
  ];

  const vehicleOpacity = [0, 0, 1, 1, 1, 1, 0, 0];
  const headlightOpacity = [0, 0, 0.4, 0.95, 0.95, 0.85, 0, 0];
  const parallaxShiftX = [0, 0, -2, -6, -6, -20, -24, 0];

  const PLACEHOLDERS = [
    'Where are you going?',
    '⚡ Find the fastest ride...',
    '🏷️ Find the cheapest ride...',
    '✨ Find the most comfortable ride...',
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full bg-[#050714] text-white select-none min-h-[440px] sm:min-h-[460px] flex flex-col justify-between pb-3.5 transition-all duration-300">
      {/* ========================================================================= */}
      {/* 1. FLOATING MINIMAL HEADER (RAYDO LOGO | LOCATION | WALLET) */}
      {/* ========================================================================= */}
      <header className="relative z-40 flex items-center justify-between px-4 pt-8 sm:pt-10 pb-1 max-w-2xl mx-auto w-full">
        {/* LEFT: Raydo Logo */}
        <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => navigate('/taxi/user')}>
          <img
            src={logoSrc}
            alt={settings?.general?.app_name || 'Raydo'}
            onError={(e) => {
              if (e.target.src !== defaultRaydoLogo && e.target.src !== '/raydo-logo.png') {
                e.target.src = defaultRaydoLogo || '/raydo-logo.png';
              }
            }}
            className="h-7 sm:h-8 w-auto object-contain max-w-[120px] drop-shadow-[0_0_12px_rgba(255,196,0,0.5)] transition-transform group-hover:scale-105"
          />
          <span className="h-1.5 w-1.5 rounded-full bg-[#FFC400] animate-pulse ml-0.5" />
        </div>

        {/* CENTER: Location Pill */}
        <button
          type="button"
          onClick={() => navigate('/taxi/user/ride/select-location')}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/18 border border-white/15 backdrop-blur-xl px-3.5 py-1.5 rounded-full text-white shadow-lg transition-all active:scale-95 group min-w-0 max-w-[160px] sm:max-w-[210px]"
        >
          <MapPin size={13} className="text-[#FFC400] fill-[#FFC400]/20 shrink-0" strokeWidth={2.5} />
          <span className="text-[12px] font-extrabold truncate text-white/95">{locationText}</span>
          <ChevronDown size={12} className="text-white/60 group-hover:text-white shrink-0" />
        </button>

        {/* RIGHT: Circular Wallet Button */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/taxi/user/wallet')}
          className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-xl flex items-center justify-center text-white shadow-lg transition-all"
          aria-label="Wallet"
        >
          <div className="w-4.5 h-4.5 rounded-md bg-[#FFC400] text-[#070A18] font-black text-[10px] flex items-center justify-center shadow-sm">
            ₹
          </div>
        </motion.button>
      </header>

      {/* ========================================================================= */}
      {/* 2. FOOD / TAXI SWITCHER BUTTON */}
      {/* ========================================================================= */}
      <div className="relative z-40 flex justify-center mt-0.5 px-3">
        <div className="bg-black/60 p-1 rounded-full flex items-center gap-1 border border-white/20 backdrop-blur-xl shadow-lg">
          <button
            type="button"
            onClick={() => {
              syncThemeForPath('/food/user');
              navigate('/food/user');
            }}
            className="flex items-center gap-2 px-5 py-1 rounded-full text-[12px] font-black text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 cursor-pointer"
          >
            <span className="text-sm leading-none">🍔</span>
            <span>Food</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-5 py-1 rounded-full text-[12px] font-black bg-[#FFC400] text-[#070A18] shadow-md transition-all duration-300 cursor-pointer"
          >
            <span className="text-sm leading-none">🚕</span>
            <span>Taxi</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. CONTEXTUAL HEADLINE */}
      {/* ========================================================================= */}
      <div className="relative z-30 text-center px-4 mt-0.5">
        <h2 className="text-[17px] sm:text-[20px] font-extrabold tracking-tight text-white/95 leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          Where do you want to go?
        </h2>
      </div>

      {/* ========================================================================= */}
      {/* 4. HERO ENVIRONMENT (SCENE 1-8 REAL-TIME JOURNEY PULSE ANIMATION) */}
      {/* ========================================================================= */}
      <div className="relative w-full h-[220px] sm:h-[250px] my-auto overflow-hidden">
        {/* PARALLAX LAYER 1: NIGHT CITY SKYLINE & ATMOSPHERE */}
        <motion.div
          animate={{ x: parallaxShiftX }}
          transition={{ duration: loopDuration, repeat: Infinity, ease: 'linear', times: timeTimes }}
          className="absolute inset-0 pointer-events-none"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_25%,#0F1535_0%,#070A18_70%,#03040B_100%)]" />

          {/* Ambient Sky Glows */}
          <div className="absolute top-2 left-1/4 w-72 h-72 rounded-full bg-[#6D28D9]/25 blur-[95px]" />
          <div className="absolute bottom-4 right-8 w-80 h-80 rounded-full bg-blue-600/18 blur-[105px]" />
          <div className="absolute top-8 right-1/3 w-44 h-44 rounded-full bg-[#FFC400]/12 blur-[75px]" />

          {/* City Silhouette */}
          <div className="absolute inset-x-0 bottom-12 h-40 opacity-25 flex items-end justify-between px-1 blur-[1px]">
            <svg className="w-full h-full text-indigo-300" viewBox="0 0 800 180" preserveAspectRatio="none" fill="currentColor">
              <path d="M0 180 L0 100 L30 100 L30 75 L50 75 L50 100 L75 100 L75 180 Z" opacity="0.4" />
              <path d="M70 180 L70 65 L100 65 L100 40 L120 40 L120 65 L150 65 L150 180 Z" opacity="0.6" />
              <path d="M160 180 L160 95 L190 95 L190 180 Z" opacity="0.3" />
              <path d="M210 180 L210 50 L230 25 L250 50 L250 180 Z" opacity="0.75" />
              <path d="M270 180 L270 115 L310 115 L310 180 Z" opacity="0.4" />
              <path d="M330 180 L330 60 L360 60 L360 30 L380 30 L380 60 L410 60 L410 180 Z" opacity="0.8" />
              <path d="M440 180 L440 85 L480 85 L480 180 Z" opacity="0.45" />
              <path d="M500 180 L500 40 L530 15 L560 40 L560 180 Z" opacity="0.7" />
              <path d="M590 180 L590 75 L630 75 L630 180 Z" opacity="0.5" />
              <path d="M650 180 L650 50 L690 50 L690 180 Z" opacity="0.65" />
              <path d="M720 180 L720 95 L770 95 L770 180 Z" opacity="0.4" />
            </svg>
          </div>
        </motion.div>

        {/* PARALLAX LAYER 2: PERSPECTIVE ASPHALT ROAD & MOVING LANE DASHES */}
        <div className="absolute inset-x-0 bottom-0 h-36 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 origin-bottom"
            style={{
              background: 'linear-gradient(to top, #0A0E24 0%, #050714 85%, transparent 100%)',
              clipPath: 'polygon(16% 0%, 84% 0%, 100% 100%, 0% 100%)',
            }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(109,40,217,0.22)_0%,transparent_75%)]" />
            <svg className="w-full h-full" viewBox="0 0 400 140" preserveAspectRatio="none">
              <line x1="200" y1="0" x2="200" y2="140" stroke="#FFC400" strokeWidth="1.5" strokeDasharray="6 10" opacity="0.35" />
              <line x1="135" y1="0" x2="65" y2="140" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.18" />
              <line x1="265" y1="0" x2="335" y2="140" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.18" />
            </svg>
          </div>
        </div>

        {/* PARALLAX LAYER 3: SVG ROUTE, ENERGY REQUEST PULSE (SCENE 2), AND ILLUMINATION (SCENE 6) */}
        <div className="absolute inset-0 pointer-events-none z-10">
          <svg className="w-full h-full" viewBox="0 0 500 280" fill="none" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="journeyRouteGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFC400" stopOpacity="0.85" />
                <stop offset="65%" stopColor="#A855F7" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#6D28D9" stopOpacity="0.9" />
              </linearGradient>

              <linearGradient id="bikeRouteGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.85" />
                <stop offset="65%" stopColor="#3B82F6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.9" />
              </linearGradient>

              <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.0" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Base Route Path */}
            <path
              d={isPool ? "M 400 70 C 300 100, 220 160, 60 215" : "M 400 70 C 240 170, 140 190, 60 215"}
              stroke={currentServiceObj.id === 'bike' ? 'url(#bikeRouteGrad)' : 'url(#journeyRouteGrad)'}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.35"
              filter="url(#routeGlow)"
            />

            {/* SCENE 6: Dynamic Route Illumination as Vehicle Travels */}
            <motion.path
              d={isPool ? "M 400 70 C 300 100, 220 160, 60 215" : "M 400 70 C 240 170, 140 190, 60 215"}
              stroke={currentServiceObj.id === 'bike' ? '#00F0FF' : '#FFC400'}
              strokeWidth="4"
              strokeLinecap="round"
              filter="url(#routeGlow)"
              animate={{
                pathLength: [0, 0, 0, 0, 0, 1.0, 1.0, 0],
                opacity: [0, 0, 0, 0, 0, 1, 0.8, 0],
              }}
              transition={{ duration: loopDuration, repeat: Infinity, ease: 'linear', times: timeTimes }}
            />
          </svg>

          {/* SCENE 2: Ride Request Energy Pulse Wave */}
          <motion.div
            animate={{
              left: ['52%', '52%', '75%', '75%', '75%', '75%', '75%', '52%'],
              top: ['34%', '34%', '24%', '24%', '24%', '24%', '24%', '34%'],
              scale: [0.5, 0.5, 2.5, 0.5, 0.5, 0.5, 0.5, 0.5],
              opacity: [0, 0.9, 0, 0, 0, 0, 0, 0],
            }}
            transition={{ duration: loopDuration, repeat: Infinity, ease: 'easeOut', times: timeTimes }}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2 border-[#FFC400] bg-[#FFC400]/25 blur-[2px] shadow-[0_0_20px_#FFC400]"
          />

          {/* SCENE 1 & 5: PICKUP MARKER (Now at Top-Right Position) */}
          <div className="absolute right-[4%] sm:right-[8%] top-[10%] z-20 flex flex-col items-center">
            {/* Status Badge ("Cab Arriving", "Bike Arriving", etc.) */}
            <motion.div
              animate={{
                opacity: [0, 0, 0, 1, 1, 0, 0, 0],
                scale: [0.8, 0.8, 0.8, 1, 1, 0.8, 0.8, 0.8],
                y: [0, 0, 0, -8, -8, 0, 0, 0],
              }}
              transition={{ duration: loopDuration, repeat: Infinity, ease: 'easeInOut', times: timeTimes }}
              className="mb-1 bg-slate-950/90 border border-[#FFC400]/50 backdrop-blur-md px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(255,196,0,0.3)] flex items-center gap-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#FFC400] animate-ping" />
              <span className="text-[10.5px] font-black text-[#FFC400] tracking-wide whitespace-nowrap">
                {currentServiceObj.arrivingStatus}
              </span>
            </motion.div>

            {/* Pickup Marker Pin */}
            <div className="relative flex items-center justify-center">
              <motion.div
                animate={{
                  scale: [1, 1.4, 1, 1.8, 1, 1, 1, 1],
                  opacity: [0.4, 0.7, 0.4, 0.9, 0.4, 0.4, 0.4, 0.4],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute w-8 h-8 rounded-full bg-[#FFC400]/30 blur-sm pointer-events-none"
              />

              <div className="flex items-center gap-1.5 bg-slate-950/85 border border-white/20 backdrop-blur-md px-2.5 py-1 rounded-full shadow-lg whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FFC400]" />
                <span className="text-[10px] font-black text-[#FFC400] tracking-wider uppercase">
                  {currentServiceObj.id === 'parcel' ? 'Sender' : isPool ? 'Pickup A' : 'Pickup'}
                </span>
              </div>
            </div>
          </div>

          {/* POOL SERVICE SECOND PICKUP MARKER (Pickup B) */}
          {isPool && (
            <div className="absolute left-[42%] top-[45%] z-20 flex flex-col items-center">
              <motion.div
                animate={{
                  opacity: [0, 0, 0, 0, 1, 0, 0, 0],
                  scale: [0.8, 0.8, 0.8, 0.8, 1, 0.8, 0.8, 0.8],
                }}
                transition={{ duration: loopDuration, repeat: Infinity, ease: 'easeInOut', times: timeTimes }}
                className="mb-1 bg-purple-950/90 border border-purple-400/50 backdrop-blur-md px-2.5 py-1 rounded-full shadow-lg"
              >
                <span className="text-[10px] font-black text-purple-300">Pickup B</span>
              </motion.div>
              <div className="flex items-center gap-1 bg-slate-950/85 border border-purple-500/30 backdrop-blur-md px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-[9px] font-black text-purple-300 uppercase">Pickup B</span>
              </div>
            </div>
          )}

          {/* SCENE 7: DESTINATION MARKER (Now at Bottom-Left Position) */}
          <div className="absolute left-[12%] sm:left-[16%] bottom-[16%] z-20 flex flex-col items-center">
            {/* Brief "Arriving" Status */}
            <motion.div
              animate={{
                opacity: [0, 0, 0, 0, 0, 1, 1, 0],
                scale: [0.8, 0.8, 0.8, 0.8, 0.8, 1, 1, 0.8],
              }}
              transition={{ duration: loopDuration, repeat: Infinity, ease: 'easeInOut', times: timeTimes }}
              className="mb-1 bg-purple-950/90 border border-purple-400/50 backdrop-blur-md px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-[10px] font-black text-purple-200 whitespace-nowrap">Arriving</span>
            </motion.div>

            <div className="flex items-center gap-1.5 bg-slate-950/85 border border-purple-500/30 backdrop-blur-md px-2.5 py-1 rounded-full shadow-lg whitespace-nowrap">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-[10px] font-black text-purple-300 tracking-wider uppercase">
                {currentServiceObj.id === 'parcel' ? 'Receiver' : 'Destination'}
              </span>
            </div>
          </div>
        </div>

        {/* PARALLAX LAYER 4: REAL-TIME VEHICLE SYSTEM (SCENES 3 - 7) */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentServiceObj.id}
              animate={{
                left: vehicleX,
                top: vehicleY,
                scale: vehicleScale,
                opacity: vehicleOpacity,
              }}
              transition={{
                duration: loopDuration,
                repeat: Infinity,
                ease: 'easeInOut',
                times: timeTimes,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center origin-bottom"
            >
              <div className={`relative ${currentServiceObj.vehicleWidth}`}>
                {/* A. Soft Ambient Chassis Aura */}
                <div
                  className="absolute bottom-[-6px] left-[12%] right-[12%] h-7 rounded-full blur-xl pointer-events-none opacity-75"
                  style={{ background: currentServiceObj.glowColor }}
                />

                {/* B. Soft Contact Shadow directly bound under tires */}
                <div className="absolute bottom-[-2px] left-[6%] right-[6%] h-3 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.98)_0%,transparent_75%)] pointer-events-none" />

                {/* C. Flipped Vertical Road Surface Reflection */}
                {activeVehicleSrc && (
                  <div className="absolute top-[85%] left-0 right-0 h-full pointer-events-none overflow-hidden opacity-25 filter blur-[3px] scale-y-[-0.55] origin-top">
                    <img src={activeVehicleSrc} alt="" className="w-full h-auto object-contain grayscale brightness-125" />
                  </div>
                )}

                {/* D. Headlight Projection Beam (Illuminates road ahead) */}
                <motion.div
                  animate={{ opacity: headlightOpacity }}
                  transition={{ duration: loopDuration, repeat: Infinity, ease: 'easeInOut', times: timeTimes }}
                  className="absolute top-[48%] left-[-45%] w-[60%] h-[48px] pointer-events-none z-0"
                  style={{
                    background: currentServiceObj.beamColor,
                    clipPath: 'polygon(100% 35%, 0% 5%, 0% 95%, 100% 65%)',
                    filter: 'blur(3px)',
                  }}
                />

                {/* E. Clean Transparent Vehicle PNG Sprite (Upright Orientation, Zero Canvas Artifacts) */}
                {activeVehicleSrc && (
                  <img
                    src={activeVehicleSrc}
                    alt={currentServiceObj.label}
                    className="relative z-10 w-full h-auto object-contain pointer-events-none"
                    style={{
                      WebkitTouchCallout: 'none',
                      userSelect: 'none',
                    }}
                    draggable={false}
                  />
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* PARALLAX LAYER 5: FOREGROUND OCCLUSION ELEMENTS (PHYSICAL ENVIRONMENT DEPTH) */}
        {/* Street Lamp Pole at X: 35% */}
        <div className="absolute left-[35%] bottom-0 top-0 w-8 z-30 pointer-events-none flex flex-col items-center">
          <div className="w-2 h-full bg-gradient-to-t from-slate-900 via-slate-800/80 to-transparent blur-[1px] opacity-80" />
          <div className="absolute top-12 w-8 h-8 rounded-full bg-[#FFC400]/20 blur-md" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. SEARCH BAR (Primary CTA - 50px height, 16px radius, Animated Cycling Placeholder) */}
      {/* ========================================================================= */}
      <div className="sticky top-2 sm:top-3 z-50 px-4 mt-1 max-w-xl mx-auto w-full">
        <button
          type="button"
          onClick={onSearchFocus}
          className="w-full h-[50px] rounded-[16px] bg-white/95 hover:bg-white backdrop-blur-2xl border border-white/90 shadow-[0_12px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_40px_rgba(255,196,0,0.3)] flex items-center justify-between px-4 transition-all duration-300 active:scale-[0.99] group cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-[#FFC400]/15 flex items-center justify-center text-[#FFC400] shrink-0 border border-[#FFC400]/30 group-hover:scale-105 transition-transform">
              <MapPin size={16} className="text-[#FFC400] fill-[#FFC400]/30" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholderIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="text-[14px] font-black text-slate-900 tracking-tight truncate block"
                >
                  {currentServiceObj.id === 'parcel'
                    ? 'Where to send package?'
                    : PLACEHOLDERS[placeholderIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          <div className="h-8.5 w-8.5 rounded-full bg-[#FFC400] group-hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-md shadow-[#FFC400]/35 shrink-0 transition-transform group-hover:translate-x-1">
            <ArrowRight size={16} strokeWidth={3} className="text-slate-950" />
          </div>
        </button>
      </div>
    </div>
  );
}

