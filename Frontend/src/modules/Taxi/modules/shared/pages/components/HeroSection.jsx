import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronRight, Car, Utensils, Compass, Sparkles } from "lucide-react";
import GooglePlayBadge from "./GooglePlayBadge";
import { useRaydoLandingData } from "../../services/raydoLandingService";

// Photorealistic Video Assets
const VIDEO_00_FOOD_TAXI = "/video_food_and_taxi_theme.mp4";
const VIDEO_01_TAXI = "/video_01_city_taxi.mp4";
const VIDEO_02_FOOD = "/video_02_food_delivery.mp4";
const VIDEO_03_OUTSTATION = "/video_03_outstation.mp4";

// Poster Artwork
import comboPoster from "@/assets/food_taxi_combo_poster.png";
import taxiPoster from "@/assets/cinematic_taxi_moving_night.png";
import foodVibrantPoster from "@/assets/raydo_food_vibrant_plate.png";
import travelPoster from "@/assets/cinematic_outstation_highway.png";

export default function HeroSection() {
  const navigate = useNavigate();
  const config = useRaydoLandingData();
  const prefersReducedMotion = useReducedMotion();

  const videoRefs = useRef([]);
  const tabRefs = useRef([]);
  const tabContainerRef = useRef(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);

  const hero = config?.hero || {};

  // 4 Dynamic Stages using config data
  const STAGES = useMemo(() => [
    {
      id: "food_taxi_combo",
      serviceCategory: "FOOD + TAXI",
      videoSrc: VIDEO_00_FOOD_TAXI,
      poster: comboPoster,
      bgColor: "#070A1F",
      themeType: "COMBO",
      activePillBg: "bg-gradient-to-r from-[#FF8A00] via-[#FFC400] to-[#315CFF]",
      activeTextColor: "text-slate-950",
      gradientOverlay: "linear-gradient(to right, rgba(7,10,31,0.92) 0%, rgba(7,10,31,0.55) 45%, rgba(7,10,31,0.2) 100%), linear-gradient(to bottom, rgba(7,10,31,0.5) 0%, transparent 40%, rgba(7,10,31,0.95) 100%)",
      headline: (
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08]">
          {hero.comboTitleMain || "Move & Order."}<br />
          <span className="bg-gradient-to-r from-[#FF8A00] via-[#FFC400] to-[#315CFF] bg-clip-text text-transparent">
            {hero.comboTitleSub || "One Super App."}
          </span>
        </h1>
      ),
      subtitle: hero.comboSubtitle || "Taxi rides & instant food delivery connected through RAYDO.",
      badge: hero.comboBadge || "⚡ FOOD + TAXI SUPER-APP",
      badgeBg: "bg-[#FF8A00]/20 border-[#FF8A00]/40 text-[#FFC400]",
      primaryCta: "BOOK TAXI",
      primaryLink: "/taxi/user",
      primaryStyle: "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white shadow-blue-600/30",
      secondaryCta: "ORDER FOOD",
      secondaryLink: "/food/user",
      secondaryStyle: "bg-gradient-to-r from-[#FF8A00] to-[#FFC400] text-slate-950 font-black shadow-orange-500/30"
    },
    {
      id: "taxi_city",
      serviceCategory: "TAXI RIDES",
      videoSrc: VIDEO_01_TAXI,
      poster: taxiPoster,
      bgColor: "#070A1F",
      themeType: "TAXI",
      activePillBg: "bg-gradient-to-r from-[#315CFF] to-[#6842F5]",
      activeTextColor: "text-white",
      gradientOverlay: "linear-gradient(to right, rgba(7,10,31,0.92) 0%, rgba(7,10,31,0.55) 45%, rgba(7,10,31,0.2) 100%), linear-gradient(to bottom, rgba(7,10,31,0.5) 0%, transparent 40%, rgba(7,10,31,0.95) 100%)",
      headline: (
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08]">
          {hero.taxiTitleMain || "Move Fast."}<br />
          <span className="bg-gradient-to-r from-[#315CFF] to-[#6842F5] bg-clip-text text-transparent">
            {hero.taxiTitleSub || "City Taxi Rides."}
          </span>
        </h1>
      ),
      subtitle: hero.taxiSubtitle || "Instant cabs, autos and bikes for comfortable daily city travel.",
      badge: hero.taxiBadge || "🚕 TAXI & CITY RIDES",
      badgeBg: "bg-[#315CFF]/20 border-[#315CFF]/40 text-blue-300",
      primaryCta: "BOOK A TAXI",
      primaryLink: "/taxi/user",
      primaryStyle: "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white shadow-blue-600/30",
      secondaryCta: "ORDER FOOD",
      secondaryLink: "/food/user",
      secondaryStyle: "bg-slate-900/90 text-slate-200 border border-slate-700 hover:border-slate-500"
    },
    {
      id: "food_delivery",
      serviceCategory: "FOOD DELIVERY",
      videoSrc: VIDEO_02_FOOD,
      poster: foodVibrantPoster,
      bgColor: "#140C03",
      themeType: "FOOD",
      activePillBg: "bg-gradient-to-r from-[#FF8A00] to-[#FFC400]",
      activeTextColor: "text-slate-950",
      gradientOverlay: "linear-gradient(to right, rgba(20,12,3,0.92) 0%, rgba(20,12,3,0.55) 45%, rgba(20,12,3,0.2) 100%), linear-gradient(to bottom, rgba(20,12,3,0.5) 0%, transparent 40%, rgba(20,12,3,0.95) 100%)",
      headline: (
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08]">
          {hero.foodTitleMain || "From Craving"}<br />
          <span className="bg-gradient-to-r from-[#FF8A00] to-[#FFC400] bg-clip-text text-transparent">
            {hero.foodTitleSub || "to Doorstep."}
          </span>
        </h1>
      ),
      subtitle: hero.foodSubtitle || "Hot restaurant meals and daily food essentials delivered fast across your city.",
      badge: hero.foodBadge || "🍔 FOOD DELIVERY",
      badgeBg: "bg-[#FF8A00]/20 border-[#FF8A00]/40 text-[#FFC400]",
      primaryCta: "ORDER FOOD NOW",
      primaryLink: "/food/user",
      primaryStyle: "bg-gradient-to-r from-[#FF8A00] to-[#FFC400] text-slate-950 font-black shadow-orange-500/30",
      secondaryCta: "BOOK TAXI",
      secondaryLink: "/taxi/user",
      secondaryStyle: "bg-slate-900/90 text-slate-200 border border-slate-700 hover:border-slate-500"
    },
    {
      id: "outstation",
      serviceCategory: "OUTSTATION",
      videoSrc: VIDEO_03_OUTSTATION,
      poster: travelPoster,
      bgColor: "#090D26",
      themeType: "TAXI",
      activePillBg: "bg-gradient-to-r from-[#315CFF] to-[#6842F5]",
      activeTextColor: "text-white",
      gradientOverlay: "linear-gradient(to right, rgba(9,13,38,0.92) 0%, rgba(9,13,38,0.55) 45%, rgba(9,13,38,0.2) 100%), linear-gradient(to bottom, rgba(9,13,38,0.5) 0%, transparent 40%, rgba(9,13,38,0.95) 100%)",
      headline: (
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08]">
          {hero.outstationTitleMain || "Go Beyond"}<br />
          <span className="bg-gradient-to-r from-[#315CFF] to-[#6842F5] bg-clip-text text-transparent">
            {hero.outstationTitleSub || "the City."}
          </span>
        </h1>
      ),
      subtitle: hero.outstationSubtitle || "Comfortable highway cabs and outstation travel connecting destinations.",
      badge: hero.outstationBadge || "🚘 OUTSTATION CAB",
      badgeBg: "bg-[#6842F5]/20 border-[#6842F5]/40 text-purple-300",
      primaryCta: "BOOK OUTSTATION",
      primaryLink: "/taxi/user",
      primaryStyle: "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white shadow-blue-600/30",
      secondaryCta: "ORDER FOOD",
      secondaryLink: "/food/user",
      secondaryStyle: "bg-slate-900/90 text-slate-200 border border-slate-700 hover:border-slate-500"
    }
  ], [hero]);

  const handleStageSelect = (index) => {
    setActiveStageIndex(index);
  };

  // Auto rotation every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStageIndex((prev) => (prev + 1) % STAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [STAGES.length]);

  // Horizontally center active tab pill inside tab container ONLY (NEVER scroll the browser window)
  useEffect(() => {
    const el = tabRefs.current[activeStageIndex];
    const container = tabContainerRef.current;
    if (el && container) {
      const elLeft = el.offsetLeft;
      const elWidth = el.offsetWidth;
      const containerWidth = container.clientWidth;
      container.scrollTo({
        left: elLeft - containerWidth / 2 + elWidth / 2,
        behavior: "smooth",
      });
    }
  }, [activeStageIndex]);

  const activeStage = STAGES[activeStageIndex] || STAGES[0];

  // Preload all poster images into memory on mount to prevent any slide transition flicker
  useEffect(() => {
    STAGES.forEach((stage) => {
      if (stage.poster) {
        const img = new Image();
        img.src = stage.poster;
      }
    });
  }, [STAGES]);

  // Video autoplay management — play active video, pause inactive ones safely without DOM remount
  useEffect(() => {
    videoRefs.current.forEach((vid, idx) => {
      if (!vid) return;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;

      if (idx === activeStageIndex) {
        const playPromise = vid.play();
        if (playPromise !== undefined) playPromise.catch(() => { });
      } else {
        vid.pause();
      }
    });
  }, [activeStageIndex]);

  return (
    <section id="hero" className="relative w-full h-[82vh] min-h-[560px] max-h-[750px] md:h-screen md:min-h-[620px] md:max-h-[900px] overflow-hidden bg-[#070A1F] text-white flex flex-col justify-between">

      {/* Background Stage Layer (Smooth Cross-Fade without video remount glitch) */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {STAGES.map((stage, idx) => {
          const isActive = idx === activeStageIndex;
          return (
            <motion.div
              key={stage.id}
              initial={false}
              animate={{
                opacity: isActive ? 1 : 0,
              }}
              transition={{
                duration: 0.7,
                ease: [0.25, 1, 0.5, 1],
              }}
              className={`absolute inset-0 w-full h-full ${isActive ? "z-10 pointer-events-auto" : "z-0 pointer-events-none"}`}
            >
              {/* Poster Image (Always present underneath video) */}
              <img
                src={stage.poster}
                alt={`RAYDO ${stage.serviceCategory}`}
                loading="eager"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover object-center"
              />

              {/* Video Layer (Kept permanently in DOM so buffered frames remain intact) */}
              <video
                ref={(el) => (videoRefs.current[idx] = el)}
                src={stage.videoSrc}
                poster={stage.poster}
                loop
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 w-full h-full object-cover object-center"
              />

              {/* Dynamic Gradient Overlay (Crossfades smoothly along with poster/video) */}
              <div
                className="absolute inset-0 z-20 pointer-events-none"
                style={{ background: stage.gradientOverlay }}
              />
            </motion.div>
          );
        })}

        {/* Bottom Flow SVG */}
        <svg className="absolute bottom-0 inset-x-0 w-full h-16 sm:h-28 pointer-events-none z-20 opacity-80" preserveAspectRatio="none" viewBox="0 0 1440 200">
          <defs>
            <linearGradient id="raydoHeroFlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={activeStage.themeType === "FOOD" ? "#FF8A00" : "#315CFF"} stopOpacity="0.75" className="transition-colors duration-700" />
              <stop offset="100%" stopColor="#070A1F" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M 0 60 Q 360 170, 720 90 T 1440 140 L 1440 200 L 0 200 Z"
            fill="url(#raydoHeroFlowGrad)"
          />
        </svg>
      </div>

      {/* Top Spacer for Desktop & Mobile Navbar Clearance */}
      <div className="pt-20 sm:pt-24" />

      {/* Overlay Content (Spacious & Breathable on Mobile) */}
      <div className="relative z-30 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full my-auto pointer-events-auto pb-6 md:pb-0">
        <div className="max-w-xl space-y-3.5 sm:space-y-5">

          {/* Service Selector Pills Bar (Smooth LayoutId Sliding & Auto-Centering Scroll) */}
          <div ref={tabContainerRef} className="w-full max-w-full overflow-x-auto no-scrollbar scrollbar-none rounded-2xl bg-slate-950/80 border border-slate-700/70 backdrop-blur-xl shadow-2xl touch-pan-x p-1.5 scroll-smooth">
            <div className="flex items-center gap-2 min-w-max px-1 pr-5">

              <button
                ref={(el) => (tabRefs.current[0] = el)}
                onClick={() => handleStageSelect(0)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${activeStageIndex === 0 ? "text-slate-950" : "text-slate-300 hover:text-white"
                  }`}
              >
                {activeStageIndex === 0 && (
                  <motion.div
                    layoutId="activeHeroTabPill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FF8A00] via-[#FFC400] to-[#315CFF] shadow-md"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Sparkles size={13} className={activeStageIndex === 0 ? "text-slate-950" : "text-amber-300"} />
                  <span>FOOD + TAXI</span>
                </span>
              </button>

              <button
                ref={(el) => (tabRefs.current[1] = el)}
                onClick={() => handleStageSelect(1)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${activeStageIndex === 1 ? "text-white" : "text-slate-300 hover:text-white"
                  }`}
              >
                {activeStageIndex === 1 && (
                  <motion.div
                    layoutId="activeHeroTabPill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#315CFF] to-[#6842F5] shadow-md shadow-blue-500/30"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Car size={13} />
                  <span>TAXI RIDES</span>
                </span>
              </button>

              <button
                ref={(el) => (tabRefs.current[2] = el)}
                onClick={() => handleStageSelect(2)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${activeStageIndex === 2 ? "text-slate-950" : "text-slate-300 hover:text-white"
                  }`}
              >
                {activeStageIndex === 2 && (
                  <motion.div
                    layoutId="activeHeroTabPill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFC400] shadow-md shadow-orange-400/30"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Utensils size={13} />
                  <span>FOOD DELIVERY</span>
                </span>
              </button>

              <button
                ref={(el) => (tabRefs.current[3] = el)}
                onClick={() => handleStageSelect(3)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${activeStageIndex === 3 ? "text-white" : "text-slate-300 hover:text-white"
                  }`}
              >
                {activeStageIndex === 3 && (
                  <motion.div
                    layoutId="activeHeroTabPill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#315CFF] to-[#6842F5] shadow-md shadow-blue-500/30"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Compass size={13} />
                  <span>OUTSTATION</span>
                </span>
              </button>

            </div>
          </div>

          {/* Text Content Block (Instant PopLayout Overlapping Smooth Cross-Fade) */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={activeStageIndex}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3 sm:space-y-4 max-w-lg"
            >

              {/* Category Badge */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] sm:text-xs font-black tracking-widest uppercase border backdrop-blur-md shadow-sm ${activeStage.badgeBg}`}>
                <span>{activeStage.badge}</span>
              </div>

              {/* Headline */}
              <div className="max-w-lg break-words">
                {activeStage.headline}
              </div>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed max-w-md drop-shadow-md">
                {activeStage.subtitle}
              </p>

              {/* CTAs with Official Google Play Store Badge */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={() => navigate(activeStage.primaryLink)}
                  className={`px-6 py-2.5 sm:py-3 rounded-xl font-black text-xs sm:text-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 cursor-pointer tracking-wider uppercase whitespace-nowrap ${activeStage.primaryStyle}`}
                >
                  <span>{activeStage.primaryCta}</span>
                  <ArrowRight size={15} />
                </button>

                {/* Google Play Store Badge */}
                <GooglePlayBadge url={config.playStoreUrl} size="normal" />
              </div>

            </motion.div>
          </AnimatePresence>

        </div>
      </div>

      {/* Stage Dots */}
      <div className="relative z-30 w-full pb-3 sm:pb-4 pointer-events-none flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-2 pointer-events-auto">
          {STAGES.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => handleStageSelect(idx)}
              className={`h-2 rounded-full transition-all duration-500 cursor-pointer ${idx === activeStageIndex
                ? s.themeType === "FOOD"
                  ? "w-7 bg-[#FF8A00] shadow-md shadow-orange-400/50"
                  : "w-7 bg-[#315CFF] shadow-md shadow-blue-500/50"
                : "w-2 bg-slate-600/70 hover:bg-slate-400"
                }`}
              title={`Go to ${s.serviceCategory}`}
            />
          ))}
        </div>
      </div>

    </section>
  );
}
