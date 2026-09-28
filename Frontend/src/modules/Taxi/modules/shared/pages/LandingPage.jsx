import React from "react";
import { motion } from "framer-motion";
import RaydoNavbar from "./components/RaydoNavbar";
import HeroSection from "./components/HeroSection";
import ServicesShowcase from "./components/ServicesShowcase";
import BookingSection from "./components/BookingSection";
import SmartTravelMap from "./components/SmartTravelMap";
import DriverPartnerSection from "./components/DriverPartnerSection";
import RaydoFooter from "./components/RaydoFooter";
import "./LandingPage.css";

export default function LandingPage() {
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

      {/* 2. Scroll-Driven Cinematic Hero */}
      <HeroSection />

      {/* 3. Ecosystem Services Showcase */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.05 }}
        variants={sectionVariants}
        className="optimized-section relative z-20"
      >
        <ServicesShowcase />
      </motion.div>

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


