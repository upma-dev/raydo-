import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign, Clock, ShieldCheck, Zap, ArrowRight, TrendingUp, Car, Building2, Users, Smartphone, CheckCircle2, Utensils } from "lucide-react";
import { useRaydoLandingData } from "../../services/raydoLandingService";
import GooglePlayBadge from "./GooglePlayBadge";

export default function DriverPartnerSection() {
  const navigate = useNavigate();
  const config = useRaydoLandingData();
  const [partnerMode, setPartnerMode] = useState("DRIVER"); // DRIVER | FRANCHISE

  const partnerFeatures = partnerMode === "DRIVER"
    ? [
        { title: "Zero High Commission", desc: "Keep up to 90%+ of your daily fare earnings.", icon: DollarSign },
        { title: "Daily Payouts", desc: "Direct instant bank transfers at the end of your shift.", icon: TrendingUp },
        { title: "Flexible Shifts", desc: "Drive whenever you want, set your own preferred routes.", icon: Clock },
        { title: "24/7 Captain Support", desc: "Dedicated partner helpline & on-road emergency team.", icon: ShieldCheck },
      ]
    : [
        { title: "Exclusive City Monopoly", desc: "Sole franchise operator rights in your assigned tier-2/3 city.", icon: Building2 },
        { title: "Ecosystem Revenue Share", desc: "Earn from rides, outstation cabs, bus bookings & food orders.", icon: DollarSign },
        { title: "Complete Tech Stack", desc: "Turnkey admin dashboard, partner dispatch apps & marketing assets.", icon: Zap },
        { title: "Dedicated Onboarding Manager", desc: "Personal hands-on guidance to launch and scale your hub.", icon: Users },
      ];

  return (
    <section id="partners" className="relative bg-[#050713] py-10 lg:py-14 text-white border-b border-slate-800/80 overflow-hidden">
      
      {/* Glows (Radial Gradients) */}
      <div className="absolute top-1/2 left-10 size-[450px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,138,0,0.10),transparent_70%)] pointer-events-none" />
      <div className="absolute bottom-0 right-10 size-[450px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(49,92,255,0.15),transparent_70%)] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
        
        <div className="grid lg:grid-cols-12 items-center gap-10 lg:gap-14">
          
          {/* Left Column */}
          <div className="lg:col-span-6 space-y-5">
            
            {/* Mode Switcher */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl w-max shadow-md">
              <button
                onClick={() => setPartnerMode("DRIVER")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  partnerMode === "DRIVER"
                    ? "bg-gradient-to-r from-[#FF8A00] to-[#FFC400] text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Car size={15} />
                <span>PARTNER DRIVER</span>
              </button>
              <button
                onClick={() => setPartnerMode("FRANCHISE")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  partnerMode === "FRANCHISE"
                    ? "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Building2 size={15} />
                <span>CITY FRANCHISE</span>
              </button>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              {partnerMode === "DRIVER" ? (
                <>
                  {config.partners.headingDriverMain} <br />
                  <span className="bg-gradient-to-r from-[#FF8A00] via-[#FFC400] to-amber-300 bg-clip-text text-transparent">
                    {config.partners.headingDriverSub}
                  </span>
                </>
              ) : (
                <>
                  {config.partners.headingFranchiseMain} <br />
                  <span className="bg-gradient-to-r from-[#315CFF] via-indigo-400 to-[#6842F5] bg-clip-text text-transparent">
                    {config.partners.headingFranchiseSub}
                  </span>
                </>
              )}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
              {partnerMode === "DRIVER"
                ? "Join thousands of satisfied cab & delivery partners earning sustainable daily income with zero high commission deductions and instant payouts."
                : "Empower your local region by launching Raydo regional mobility & food hub with complete brand support, tech stack, and multi-service revenue streams."}
            </p>

            {/* 4 Partner Benefits Grid */}
            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              {partnerFeatures.map((item) => {
                const Icon = item.icon;
                const isDriver = partnerMode === "DRIVER";
                return (
                  <div key={item.title} className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md">
                    <div className={`p-2 rounded-xl w-max mb-2 border ${isDriver ? "bg-[#FF8A00]/10 text-[#FFC400] border-[#FF8A00]/20" : "bg-[#315CFF]/10 text-[#315CFF] border-[#315CFF]/20"}`}>
                      <Icon size={18} />
                    </div>
                    <h3 className="text-xs font-black text-white mb-0.5">{item.title}</h3>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed">{item.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* CTAs */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate("/taxi/driver")}
                className={`px-7 py-3 text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer ${
                  partnerMode === "DRIVER"
                    ? "bg-gradient-to-r from-[#FF8A00] to-[#FFC400] text-slate-950"
                    : "bg-gradient-to-r from-[#315CFF] to-[#6842F5] text-white"
                }`}
              >
                <span>{partnerMode === "DRIVER" ? "Become a Partner" : "Apply for Franchise"}</span>
                <ArrowRight size={16} />
              </button>

              <GooglePlayBadge url={config.playStoreUrl} size="normal" />
            </div>

          </div>

          {/* Right Column: Genuine 3-Step Partner Onboarding Card (NO FAKE EARNINGS CALCULATOR) */}
          <div className="lg:col-span-6 relative">
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5">
              
              {/* Card Header */}
              <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#FFC400]">
                    {partnerMode === "DRIVER" ? "EASY ONBOARDING JOURNEY" : "CITY FRANCHISE LAUNCH"}
                  </span>
                  <h3 className="text-xl font-black text-white mt-0.5">
                    {partnerMode === "DRIVER" ? "Simple 3-Step Registration" : "3 Steps to Launch City Hub"}
                  </h3>
                </div>

                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                  {partnerMode === "DRIVER" ? "Instant Approval" : "100% Monopoly"}
                </span>
              </div>

              {/* 3 Onboarding Steps List */}
              <div className="space-y-4">
                {partnerMode === "DRIVER" ? (
                  <>
                    <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="p-2.5 rounded-xl bg-[#FF8A00]/15 text-[#FFC400] shrink-0 border border-[#FF8A00]/30">
                        <Smartphone size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">{config.partners.driverStep1Title}</div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">{config.partners.driverStep1Desc}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="p-2.5 rounded-xl bg-[#FF8A00]/15 text-[#FFC400] shrink-0 border border-[#FF8A00]/30">
                        <CheckCircle2 size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">{config.partners.driverStep2Title}</div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">{config.partners.driverStep2Desc}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="p-2.5 rounded-xl bg-[#FF8A00]/15 text-[#FFC400] shrink-0 border border-[#FF8A00]/30">
                        <Zap size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">{config.partners.driverStep3Title}</div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">{config.partners.driverStep3Desc}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="p-2.5 rounded-xl bg-[#315CFF]/15 text-[#315CFF] shrink-0 border border-[#315CFF]/30">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">{config.partners.franchiseStep1Title}</div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">{config.partners.franchiseStep1Desc}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="p-2.5 rounded-xl bg-[#315CFF]/15 text-[#315CFF] shrink-0 border border-[#315CFF]/30">
                        <CheckCircle2 size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">{config.partners.franchiseStep2Title}</div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">{config.partners.franchiseStep2Desc}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="p-2.5 rounded-xl bg-[#315CFF]/15 text-[#315CFF] shrink-0 border border-[#315CFF]/30">
                        <Zap size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">{config.partners.franchiseStep3Title}</div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">{config.partners.franchiseStep3Desc}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Feature Banner inside Card */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs text-slate-300 font-medium">
                  {partnerMode === "DRIVER" ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[#FFC400] font-black">
                        <Utensils size={14} />
                        <Car size={14} />
                      </div>
                      <span><strong>Multi-Service App:</strong> Taxi Rides + Food Orders in 1 App</span>
                    </>
                  ) : (
                    <>
                      <Building2 size={16} className="text-[#315CFF]" />
                      <span><strong>Exclusive Monopoly:</strong> 100% District Hub Rights</span>
                    </>
                  )}
                </div>

                <GooglePlayBadge url={config.playStoreUrl} size="compact" />
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
