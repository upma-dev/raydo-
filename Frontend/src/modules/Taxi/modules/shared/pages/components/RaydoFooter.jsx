import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import GooglePlayBadge from "./GooglePlayBadge";
import { useRaydoLandingData } from "../../services/raydoLandingService";

export default function RaydoFooter() {
  const navigate = useNavigate();
  const config = useRaydoLandingData();

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-[#050713] text-slate-400 py-10 border-t border-slate-800/80 text-xs font-medium">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">

        {/* Main Footer Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 items-start">

          {/* Col 1: Logo & Tagline */}
          <div className="col-span-2 space-y-4">
            <div
              onClick={handleScrollTop}
              className="flex items-center gap-2 cursor-pointer group w-max"
            >
              <img
                src="/raydo-logo.png"
                alt="RAYDO Official Brand Logo"
                className="h-9 w-auto object-contain"
              />
            </div>

            <p className="text-slate-400 text-xs font-medium max-w-sm leading-relaxed">
              {config.footer.tagline}
            </p>

            <div className="flex items-center gap-2.5 text-slate-300 font-bold">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[#FFC400]">{config.footer.statusText}</span>
            </div>

            {/* Google Play Store Badge in Footer */}
            <div className="pt-2">
              <GooglePlayBadge url={config.playStoreUrl} size="normal" />
            </div>
          </div>

          {/* Col 2: Mobility & Food Services */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Mobility & Food</h4>
            <ul className="space-y-2">
              <li><button onClick={() => navigate("/food/user")} className="hover:text-[#FFC400] transition-colors text-left">Food Delivery</button></li>
              <li><button onClick={() => navigate("/taxi/user")} className="hover:text-[#FFC400] transition-colors text-left">City Taxi Rides</button></li>
              <li><button onClick={() => navigate("/taxi/user")} className="hover:text-[#FFC400] transition-colors text-left">Outstation Cabs</button></li>
              <li><button onClick={() => navigate("/taxi/user")} className="hover:text-[#FFC400] transition-colors text-left">Raydo Bus</button></li>
            </ul>
          </div>

          {/* Col 3: Partners & Franchise (NO LOGIN ROUTES) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Partners & Franchise</h4>
            <ul className="space-y-2">
              <li><button onClick={() => navigate("/taxi/driver")} className="hover:text-[#FFC400] transition-colors text-left">Driver Partner</button></li>
              <li><button onClick={() => navigate("/taxi/driver")} className="hover:text-[#FFC400] transition-colors text-left">Delivery Partner</button></li>
              <li><button onClick={() => navigate("/taxi/driver")} className="hover:text-[#FFC400] transition-colors text-left">City Franchise Hub</button></li>
              <li><button onClick={() => navigate("/food/user")} className="hover:text-[#FFC400] transition-colors text-left">Restaurant Hub</button></li>
            </ul>
          </div>

          {/* Col 4: Trust & Mobile App */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Trust & Mobile App</h4>
            <ul className="space-y-2">
              <li><a href="#services" className="hover:text-[#FFC400] transition-colors">Raydo SafeShield™</a></li>
              <li><a href="#booking" className="hover:text-[#FFC400] transition-colors">Knowledge Hub</a></li>
              <li><a href="#smart-map" className="hover:text-[#FFC400] transition-colors">Live Dispatch Map</a></li>
              <li><a href={config.playStoreUrl} target="_blank" rel="noreferrer" className="hover:text-[#FFC400] transition-colors">Play Store App</a></li>
            </ul>
          </div>

        </div>

        {/* Legal & Bottom Strip */}
        <div className="pt-6 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-500">
          <div className="flex flex-wrap items-center gap-6">
            <span>{config.footer.copyright}</span>
          </div>

          <button
            onClick={handleScrollTop}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-[#FFC400] border border-slate-800 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span className="text-xs font-black uppercase tracking-wider">Back to Top</span>
            <ArrowUp size={14} />
          </button>
        </div>

      </div>
    </footer>
  );
}
