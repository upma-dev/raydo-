import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, Car, Utensils, Zap, Compass } from "lucide-react";

// Procedural / Motion Video Assets for RAYDO PULSE 3D Network
const VIDEO_01_CORE = "/pulse_01_core.mp4";
const VIDEO_02_RIDES = "/pulse_02_rides.mp4";
const VIDEO_03_FOOD = "/pulse_03_food.mp4";
const VIDEO_04_DELIVERY = "/pulse_04_delivery.mp4";
const VIDEO_05_TRAVEL = "/pulse_05_travel.mp4";
const VIDEO_06_NETWORK = "/pulse_06_network.mp4";

// 6 Scroll-Driven Camera Stages for RAYDO PULSE
const STAGES = [
  {
    id: "stage_01_core",
    range: [0.0, 0.16],
    serviceCategory: "THE CORE",
    videoSrc: VIDEO_01_CORE,
    accentColor: "#FFC400",
    headline: (
      <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] break-words">
        Everything Starts<br />
        <span className="text-[#FFC400]">With One Connection.</span>
      </h2>
    ),
    subtitle: "One ecosystem connecting the ways people move, eat, travel and deliver.",
    floatingLabel: null,
  },
  {
    id: "stage_02_rides",
    range: [0.16, 0.33],
    serviceCategory: "RIDES",
    videoSrc: VIDEO_02_RIDES,
    accentColor: "#315CFF",
    headline: (
      <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] break-words">
        Move Through<br />
        <span className="text-[#315CFF]">Your City.</span>
      </h2>
    ),
    subtitle: "Move through your city with RAYDO.",
    floatingLabel: { text: "RIDES", icon: Car, color: "#315CFF", top: "45%", left: "62%" }
  },
  {
    id: "stage_03_food",
    range: [0.33, 0.50],
    serviceCategory: "FOOD",
    videoSrc: VIDEO_03_FOOD,
    accentColor: "#FFC400",
    headline: (
      <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] break-words">
        From Kitchen<br />
        <span className="bg-gradient-to-r from-[#FFC400] to-[#FF7A00] bg-clip-text text-transparent">to Doorstep.</span>
      </h2>
    ),
    subtitle: "From kitchen to doorstep.",
    floatingLabel: { text: "FOOD", icon: Utensils, color: "#FFC400", top: "52%", left: "72%" }
  },
  {
    id: "stage_04_delivery",
    range: [0.50, 0.66],
    serviceCategory: "DELIVERY",
    videoSrc: VIDEO_04_DELIVERY,
    accentColor: "#FF8A00",
    headline: (
      <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] break-words">
        Every Route Can Become<br />
        <span className="text-[#FF8A00]">An Opportunity.</span>
      </h2>
    ),
    subtitle: "Every route can become an opportunity.",
    floatingLabel: { text: "DELIVERY", icon: Zap, color: "#FF8A00", top: "62%", left: "58%" }
  },
  {
    id: "stage_05_travel",
    range: [0.66, 0.83],
    serviceCategory: "TRAVEL",
    videoSrc: VIDEO_05_TRAVEL,
    accentColor: "#7147FF",
    headline: (
      <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] break-words">
        From Everyday Journeys<br />
        <span className="text-[#7147FF]">To The Road Beyond.</span>
      </h2>
    ),
    subtitle: "From everyday journeys to the road beyond.",
    floatingLabel: { text: "TRAVEL", icon: Compass, color: "#7147FF", top: "35%", left: "75%" }
  },
  {
    id: "stage_06_network",
    range: [0.83, 1.0],
    serviceCategory: "NETWORK",
    videoSrc: VIDEO_06_NETWORK,
    accentColor: "#FFC400",
    headline: (
      <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] break-words">
        Different Journeys.<br />
        <span className="text-[#FFC400]">One Connected World.</span>
      </h2>
    ),
    subtitle: "RAYDO brings rides, food, delivery and travel into one connected ecosystem.",
    floatingLabel: null,
    ctaText: "Explore the RAYDO Ecosystem",
    ctaLink: "/taxi/user"
  }
];

export default function OneNetworkSection() {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  const sectionRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRefs = useRef([]);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);

  // 1. Scroll-driven progress
  useEffect(() => {
    const handleScroll = () => {
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const totalScrollable = rect.height - window.innerHeight;
      if (totalScrollable <= 0) return;

      const currentScroll = -rect.top;
      const rawProgress = Math.max(0, Math.min(1, currentScroll / totalScrollable));
      setScrollProgress(rawProgress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 2. Smooth Lerp Loop (60fps responsiveness)
  useEffect(() => {
    let animId;

    const loop = () => {
      setSmoothProgress((prev) => {
        const diff = scrollProgress - prev;
        if (Math.abs(diff) < 0.0001) return scrollProgress;
        return prev + diff * 0.12;
      });
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [scrollProgress]);

  // Active Stage Index
  const currentStageIndex = Math.min(
    STAGES.length - 1,
    Math.max(
      0,
      STAGES.findIndex((stage) => smoothProgress >= stage.range[0] && smoothProgress <= stage.range[1]) === -1
        ? 0
        : STAGES.findIndex((stage) => smoothProgress >= stage.range[0] && smoothProgress <= stage.range[1])
    )
  );

  const activeStage = STAGES[currentStageIndex];

  // 3. Autoplay & Sync Videos for Stage Transition
  useEffect(() => {
    videoRefs.current.forEach((vid, idx) => {
      if (!vid) return;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;

      if (Math.abs(idx - currentStageIndex) <= 1) {
        const playPromise = vid.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      }
    });
  }, [currentStageIndex]);

  // 4. Procedural 3D Canvas RAYDO Core Hub & Flowing Route Ribbons
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener("resize", handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const time = Date.now() * 0.0015;
      const coreX = width * 0.62;
      const coreY = height * 0.5;

      // Draw 3D RAYDO Core Hub Platform Glow
      ctx.save();
      const glowGrad = ctx.createRadialGradient(coreX, coreY, 10, coreX, coreY, 120);
      glowGrad.addColorStop(0, "rgba(255, 196, 0, 0.45)");
      glowGrad.addColorStop(0.5, "rgba(49, 92, 255, 0.2)");
      glowGrad.addColorStop(1, "rgba(5, 7, 19, 0)");

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(coreX, coreY, 120, 0, Math.PI * 2);
      ctx.fill();

      // Core Hub Ring
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 196, 0, 0.6)";
      ctx.beginPath();
      ctx.arc(coreX, coreY, 40 + Math.sin(time * 3) * 4, 0, Math.PI * 2);
      ctx.stroke();

      // Flowing 3D Route Ribbons
      const routes = [
        { color: "#315CFF", p1: { x: coreX, y: coreY }, p2: { x: width * 0.35, y: height * 0.8 } },
        { color: "#FFC400", p1: { x: coreX, y: coreY }, p2: { x: width * 0.85, y: height * 0.35 } },
        { color: "#FF8A00", p1: { x: coreX, y: coreY }, p2: { x: width * 0.75, y: height * 0.82 } },
        { color: "#7147FF", p1: { x: coreX, y: coreY }, p2: { x: width * 0.90, y: height * 0.18 } }
      ];

      routes.forEach((route, idx) => {
        ctx.beginPath();
        ctx.strokeStyle = route.color;
        ctx.globalAlpha = 0.5 + Math.sin(time + idx) * 0.2;
        ctx.lineWidth = 3;
        ctx.moveTo(route.p1.x, route.p1.y);
        ctx.quadraticCurveTo(
          (route.p1.x + route.p2.x) / 2 + Math.sin(time + idx) * 30,
          (route.p1.y + route.p2.y) / 2 + Math.cos(time + idx) * 30,
          route.p2.x,
          route.p2.y
        );
        ctx.stroke();

        // Moving Light Pulses along route ribbon
        const pulseRatio = (time * 0.6 + idx * 0.25) % 1;
        const px = route.p1.x + (route.p2.x - route.p1.x) * pulseRatio;
        const py = route.p1.y + (route.p2.y - route.p1.y) * pulseRatio;

        ctx.beginPath();
        ctx.fillStyle = route.color;
        ctx.globalAlpha = 0.9;
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      ref={sectionRef}
      className="relative w-full h-[220vh] bg-[#050713]"
    >
      {/* Pinned 100vh Sticky Viewport */}
      <div className="sticky top-0 w-full h-screen overflow-hidden text-white flex flex-col justify-between selection:bg-[#FFC400] selection:text-slate-950 transition-colors duration-1000 bg-[#050713]">

        {/* ==================== 1. PROCEDURAL 3D WORLD & VIDEO STAGE ==================== */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          
          {STAGES.map((stage, idx) => {
            const isActive = idx === currentStageIndex;
            const [start, end] = stage.range;
            const stageProgress = Math.max(0, Math.min(1, (smoothProgress - start) / (end - start)));

            let cameraTransform = `scale(${1.02 + stageProgress * 0.08}) translate3d(${stageProgress * 15}px, ${-stageProgress * 10}px, 0)`;

            return (
              <motion.div
                key={stage.id}
                initial={false}
                animate={{
                  opacity: isActive ? 1 : 0,
                  filter: isActive ? "blur(0px) brightness(1)" : "blur(8px) brightness(0.5)",
                }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: isActive ? 5 : 1 }}
              >
                {/* Continuous 3D Motion Layer */}
                <video
                  ref={(el) => (videoRefs.current[idx] = el)}
                  src={stage.videoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover object-center mix-blend-screen opacity-90"
                  style={{
                    transform: prefersReducedMotion ? "none" : cameraTransform,
                    transition: "transform 0.1s linear",
                  }}
                />
              </motion.div>
            );
          })}

          {/* Dark Atmospheric Gradient Radial Overlay */}
          <div
            className="absolute inset-0 z-10 pointer-events-none transition-all duration-700"
            style={{
              background: "radial-gradient(circle at 65% 50%, rgba(5,7,19,0.3) 0%, rgba(5,7,19,0.85) 60%, rgba(5,7,19,0.98) 100%), linear-gradient(to right, rgba(5,7,19,0.98) 0%, rgba(5,7,19,0.7) 40%, transparent 100%)",
            }}
          />

          {/* Procedural 3D Route Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none opacity-85 z-15"
          />

        </div>

        {/* ==================== 2. MINIMAL LEFT TYPOGRAPHY (30% VIEWPORT) ==================== */}
        <div className="relative z-30 mx-auto max-w-7xl px-6 sm:px-10 lg:px-12 w-full my-auto pointer-events-auto">
          
          <div className="max-w-[420px] space-y-5">

            <AnimatePresence mode="wait">
              <motion.div
                key={currentStageIndex}
                initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                {/* Headline (48px–64px) */}
                <div className="break-words">
                  {activeStage.headline}
                </div>

                {/* Supporting Description */}
                <p className="text-sm sm:text-base text-slate-300 font-medium leading-relaxed max-w-[380px] drop-shadow-md">
                  {activeStage.subtitle}
                </p>

                {/* Final CTA Button at Stage 06 */}
                {activeStage.ctaText && (
                  <div className="pt-2">
                    <button
                      onClick={() => navigate(activeStage.ctaLink)}
                      className="px-7 py-3.5 rounded-xl font-black text-xs text-slate-950 bg-[#FFC400] hover:bg-amber-300 transition-all transform hover:-translate-y-0.5 active:translate-y-0 shadow-xl shadow-amber-400/25 flex items-center gap-2 cursor-pointer uppercase tracking-wider"
                    >
                      <span>{activeStage.ctaText}</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

          </div>

        </div>

        {/* ==================== 3. FLOATING PHYSICAL ROUTE LABELS IN 3D WORLD ==================== */}
        {activeStage.floatingLabel && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStage.id}
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: -10 }}
              transition={{ duration: 0.4 }}
              className="absolute z-30 hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-950/85 border border-slate-700/80 backdrop-blur-xl shadow-2xl text-xs font-black tracking-wider text-white pointer-events-none"
              style={{
                top: activeStage.floatingLabel.top,
                left: activeStage.floatingLabel.left,
                borderColor: activeStage.floatingLabel.color,
                boxShadow: `0 0 20px ${activeStage.floatingLabel.color}40`,
              }}
            >
              <activeStage.floatingLabel.icon size={14} style={{ color: activeStage.floatingLabel.color }} />
              <span style={{ color: activeStage.floatingLabel.color }}>{activeStage.floatingLabel.text}</span>
            </motion.div>
          </AnimatePresence>
        )}

      </div>
    </div>
  );
}
