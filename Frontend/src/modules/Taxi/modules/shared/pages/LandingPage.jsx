import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import RaydoNavbar from "./components/RaydoNavbar";
import HeroSection from "./components/HeroSection";
import ServicesShowcase from "./components/ServicesShowcase";
import BookingSection from "./components/BookingSection";
import SmartTravelMap from "./components/SmartTravelMap";
import DriverPartnerSection from "./components/DriverPartnerSection";
import RaydoFooter from "./components/RaydoFooter";
import "./LandingPage.css";

export default function LandingPage() {
  const heroWrapperRef = useRef(null);

  // Scroll-linked animation for Hero exit and Next Section entrance
  const { scrollYProgress } = useScroll({
    target: heroWrapperRef,
    offset: ["start start", "end start"],
  });

  // 1. Hero Exit Effect: subtle scale down (1 -> 0.98) and opacity (1 -> 0.96)
  const heroScale = useTransform(scrollYProgress, [0, 0.7], [1, 0.98]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.96]);

  // 2. Next Section Overlap Entrance: translateY (75px -> 0), scale (0.985 -> 1), opacity (0.95 -> 1)
  const nextSectionY = useTransform(scrollYProgress, [0, 0.45], [75, 0]);
  const nextSectionScale = useTransform(scrollYProgress, [0, 0.45], [0.985, 1]);
  const nextSectionOpacity = useTransform(scrollYProgress, [0, 0.45], [0.95, 1]);

  const sectionVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <div className="landing-root min-h-screen w-full bg-[#070A1F] text-slate-100 selection:bg-[#FFC400] selection:text-slate-950 font-sans overflow-x-hidden">

      {/* 1. Navbar */}
      <RaydoNavbar />

      {/* 2. Hero Section & Next Section Overlap Container */}
      <div ref={heroWrapperRef} className="relative w-full">
        {/* Hero Section with subtle scale & opacity scroll effect */}
        <motion.div
          style={{
            scale: heroScale,
            opacity: heroOpacity,
            willChange: "transform, opacity",
          }}
          className="relative z-10 origin-bottom"
        >
          <HeroSection />
        </motion.div>

        {/* Next Section (ServicesShowcase) Floating Overlap Card */}
        <motion.div
          style={{
            y: nextSectionY,
            scale: nextSectionScale,
            opacity: nextSectionOpacity,
            willChange: "transform, opacity",
          }}
          className="relative z-20 -mt-10 sm:-mt-16 md:-mt-24 lg:-mt-28 bg-[#070A1F] rounded-t-[32px] sm:rounded-t-[40px] md:rounded-t-[48px] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-t border-slate-700/60 overflow-hidden"
        >
          <ServicesShowcase />
        </motion.div>
      </div>

      {/* 4. Booking Engine */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.05 }}
        variants={sectionVariants}
        className="optimized-section relative z-30"
      >
        <BookingSection />
      </motion.div>

      {/* 5. Live Connected Real Location Map */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.05 }}
        variants={sectionVariants}
        className="optimized-section relative z-40"
      >
        <SmartTravelMap />
      </motion.div>

      {/* 6. Partner Driver & City Franchise Hub */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.05 }}
        variants={sectionVariants}
        className="optimized-section relative z-50"
      >
        <DriverPartnerSection />
      </motion.div>

      {/* 7. Footer */}
      <RaydoFooter />

    </div>
  );
}


