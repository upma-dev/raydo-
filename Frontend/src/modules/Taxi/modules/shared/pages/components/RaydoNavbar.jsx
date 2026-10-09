import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X, ArrowRight, ChevronRight } from "lucide-react";
import GooglePlayBadge from "./GooglePlayBadge";
import { useRaydoLandingData } from "../../services/raydoLandingService";
import GlobalLanguageSelector from "@/shared/components/GlobalLanguageSelector";

export default function RaydoNavbar() {
  const navigate = useNavigate();
  const config = useRaydoLandingData();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrolled(window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "HOME", href: "#hero" },
    { label: "SERVICES", href: "#services" },
    { label: "BOOKING", href: "#booking" },
    { label: "LIVE MAP", href: "#map" },
    { label: "PARTNERS", href: "#partners" },
    { label: "FRANCHISE", href: "/food/franchise/apply", isRoute: true },
  ];

  const handleNavClick = (link) => (e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    // Direct page navigation (e.g. /food/franchise/apply)
    if (link.isRoute) {
      navigate(link.href);
      return;
    }
    if (link.href.startsWith("#")) {
      const targetId = link.href.substring(1);
      const el = document.getElementById(targetId);
      if (el) {
        const offset = 70;
        const bodyRect = document.body.getBoundingClientRect().top;
        const elementRect = el.getBoundingClientRect().top;
        const elementPosition = elementRect - bodyRect;
        const offsetPosition = elementPosition - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      } else {
        navigate(`/${link.href}`);
      }
    } else {
      navigate(link.href);
    }
  };

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#070A1F]/95 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl py-3"
          : "bg-[#070A1F]/70 backdrop-blur-md border-b border-white/5 py-4 sm:py-4.5"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between">

        {/* Left: Official Brand RAYDO Logo */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <img
              src="/raydo-logo.png"
              alt="RAYDO Official Brand Logo"
              className="h-8 sm:h-9 w-auto object-contain transition-transform group-hover:scale-105"
            />
          </div>
        </div>

        {/* Center: Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-7 text-xs font-black tracking-widest text-slate-200">
          {navLinks.map((link) => (
            link.label === "FRANCHISE" ? (
              <a
                key={link.label}
                href={link.href}
                onClick={handleNavClick(link)}
                className="px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-[#315CFF] to-[#6842F5] rounded-lg hover:opacity-90 transition-all cursor-pointer"
              >
                {link.label}
              </a>
            ) : (
              <a
                key={link.label}
                href={link.href}
                onClick={handleNavClick(link)}
                className="hover:text-[#FFC400] transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-[#FFC400] hover:after:w-full after:transition-all uppercase cursor-pointer"
              >
                {link.label}
              </a>
            )
          ))}
        </div>

        {/* Right: Language Selector & Google Play Store Badge & GET STARTED */}
        <div className="hidden md:flex items-center gap-3.5">
          <GlobalLanguageSelector variant="dark" />
          <GooglePlayBadge url={config.playStoreUrl} size="compact" />

          <button
            onClick={() => navigate("/taxi/user")}
            className="px-5 py-2 text-xs font-extrabold tracking-wider uppercase text-slate-950 bg-[#FFC400] hover:bg-amber-300 rounded-xl shadow-lg hover:shadow-amber-400/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-1.5 cursor-pointer"
          >
            <span>GET STARTED</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <GlobalLanguageSelector variant="dark" />
          <GooglePlayBadge url={config.playStoreUrl} size="compact" />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={22} className="text-white" /> : <Menu size={22} className="text-white" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#070A1F]/95 backdrop-blur-2xl border-b border-slate-800 px-5 pt-3 pb-6 space-y-3 shadow-2xl">
          <div className="flex flex-col space-y-2 pt-2 border-b border-slate-800/60 pb-3">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={handleNavClick(link)}
                className="py-2.5 px-3 rounded-lg text-sm font-bold text-slate-200 hover:bg-slate-800/80 hover:text-[#FFC400] flex items-center justify-between"
              >
                <span>{link.label}</span>
                <ChevronRight size={16} className="text-slate-500" />
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <GooglePlayBadge url={config.playStoreUrl} className="w-full justify-center py-2.5" />
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                navigate("/taxi/user");
              }}
              className="w-full py-3 text-xs font-extrabold text-slate-950 bg-[#FFC400] rounded-xl flex items-center justify-center gap-2 shadow-md uppercase tracking-wider"
            >
              <span>GET STARTED</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
