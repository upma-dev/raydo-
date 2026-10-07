import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navigation, MapPin, Clock, Zap, Utensils, Car, CheckCircle2, Locate, LoaderCircle, Compass } from "lucide-react";
import { GoogleMap, MarkerF, PolylineF } from "@react-google-maps/api";
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader, INDIA_CENTER } from "../../../admin/utils/googleMaps";

export default function SmartTravelMap() {
  const [activeFilter, setActiveFilter] = useState("ALL"); // ALL | FOOD | TAXI
  const [userLocation, setUserLocation] = useState(INDIA_CENTER); // { lat, lng }
  const [locationName, setLocationName] = useState("Fetching your live location...");
  const [isLocating, setIsLocating] = useState(false);
  const [map, setMap] = useState(null);
  const [progress, setProgress] = useState(0);

  const { isLoaded, loadError } = useAppGoogleMapsLoader();

  // 1. Geolocation Fetching (Same logic as Taxi module)
  const fetchLiveLocation = () => {
    if (!navigator.geolocation) {
      setLocationName("Geolocation not supported by browser");
      return;
    }

    setIsLocating(true);
    setLocationName("Detecting current GPS coordinates...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(coords);
        setIsLocating(false);
        setLocationName(`Lat: ${coords.lat.toFixed(4)}, Lng: ${coords.lng.toFixed(4)} (Live Location)`);

        if (map) {
          map.panTo(coords);
          map.setZoom(14);
        }
      },
      (error) => {
        setIsLocating(false);
        setLocationName("Indore City Hub (Default Location)");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  useEffect(() => {
    fetchLiveLocation();
  }, []);

  // Lightweight timer for vehicle movement along paths (low CPU overhead)
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => (prev + 0.005) % 1);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // Coordinates for High-Contrast Routes
  const foodPickup = { lat: userLocation.lat + 0.012, lng: userLocation.lng - 0.015 };
  const foodDrop = { lat: userLocation.lat - 0.010, lng: userLocation.lng + 0.018 };

  const taxiPickup = { lat: userLocation.lat - 0.014, lng: userLocation.lng - 0.018 };
  const taxiDrop = { lat: userLocation.lat + 0.016, lng: userLocation.lng + 0.022 };

  // Interpolated animated vehicle positions
  const foodRiderPos = {
    lat: foodPickup.lat + (foodDrop.lat - foodPickup.lat) * progress,
    lng: foodPickup.lng + (foodDrop.lng - foodPickup.lng) * progress,
  };

  const taxiCabPos = {
    lat: taxiPickup.lat + (taxiDrop.lat - taxiPickup.lat) * progress,
    lng: taxiPickup.lng + (taxiDrop.lng - taxiPickup.lng) * progress,
  };

  return (
    <section id="map" className="relative bg-[#050713] py-10 lg:py-14 text-white border-b border-slate-800/80 overflow-hidden">
      
      {/* High-Contrast Ambient Glows (Lightweight Radial Gradients) */}
      <div className="absolute top-1/3 left-10 size-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,122,0,0.15),transparent_70%)] pointer-events-none" />
      <div className="absolute bottom-10 right-10 size-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(113,71,255,0.18),transparent_70%)] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[#FFC400] text-xs font-black tracking-wider uppercase mb-3 shadow-md"
          >
            <Zap size={14} />
            <span>REAL-TIME LOCATION DISPATCH MAP</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight"
          >
            Live GPS Map. <br />
            <span className="bg-gradient-to-r from-[#FF7A00] via-[#FFC400] to-[#7147FF] bg-clip-text text-transparent">
              Food & Taxi High-Contrast Dispatch.
            </span>
          </motion.h2>

          <p className="mt-2 text-xs sm:text-sm text-slate-300 font-medium max-w-2xl mx-auto">
            Interactive map with live GPS location fetching across city routes.
          </p>
        </div>

        {/* Top Control Bar: Location Fetch & Route Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mb-6 bg-slate-900/90 border border-slate-800 p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl max-w-full overflow-hidden">
          
          {/* Live Location Status Indicator */}
          <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto min-w-0">
            <button
              onClick={fetchLiveLocation}
              disabled={isLocating}
              className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-[#FFC400] text-slate-950 font-black text-[11px] sm:text-xs uppercase tracking-wider hover:bg-amber-300 transition-all shadow-md flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0"
            >
              {isLocating ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Locate size={15} />
              )}
              <span>{isLocating ? "Locating..." : "Fetch My GPS"}</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] sm:text-[10px] uppercase tracking-wider font-extrabold text-slate-400 truncate">YOUR CURRENT LOCATION</div>
              <div className="text-[11px] sm:text-xs font-bold text-white truncate max-w-full">{locationName}</div>
            </div>
          </div>

          {/* High-Contrast Category Filters (Scrollable & Clean on Mobile) */}
          <div className="w-full sm:w-auto max-w-full overflow-x-auto no-scrollbar scrollbar-none flex items-center gap-1.5 sm:gap-2 sm:justify-end touch-pan-x pb-0.5 sm:pb-0">
            <button
              onClick={() => setActiveFilter("ALL")}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeFilter === "ALL"
                  ? "bg-[#FFC400] text-slate-950 shadow-md scale-105"
                  : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              ALL NETWORK
            </button>

            <button
              onClick={() => setActiveFilter("FOOD")}
              className={`flex items-center gap-1 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeFilter === "FOOD"
                  ? "bg-[#FF7A00] text-white shadow-lg shadow-orange-500/30 scale-105"
                  : "bg-slate-950 border border-slate-800 text-[#FF7A00] hover:text-orange-300"
              }`}
            >
              <Utensils size={13} />
              <span>FOOD</span>
            </button>

            <button
              onClick={() => setActiveFilter("TAXI")}
              className={`flex items-center gap-1 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeFilter === "TAXI"
                  ? "bg-[#7147FF] text-white shadow-lg shadow-purple-600/30 scale-105"
                  : "bg-slate-950 border border-slate-800 text-[#7147FF] hover:text-purple-300"
              }`}
            >
              <Car size={13} />
              <span>TAXI</span>
            </button>
          </div>

        </div>

        {/* Real Map Render Canvas (Google Maps or Watermark-Free OpenStreetMap Dark Cartography) */}
        <div className="relative w-full rounded-3xl border-2 border-slate-800 bg-[#070A1F] p-2 sm:p-4 shadow-2xl overflow-hidden min-h-[440px] sm:min-h-[600px] flex items-center justify-center">
          
          {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded && !loadError ? (
            /* REAL GOOGLE MAP (When Valid Key Provided) */
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "550px", borderRadius: "20px" }}
              center={userLocation}
              zoom={13}
              onLoad={(m) => setMap(m)}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                styles: [
                  { elementType: "geometry", stylers: [{ color: "#070A1F" }] },
                  { elementType: "labels.text.stroke", stylers: [{ color: "#070A1F" }] },
                  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
                  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
                  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#334155" }] },
                  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0B1230" }] },
                ],
              }}
            >
              {/* User Location Marker */}
              <MarkerF position={userLocation} title="Your Current Location" />

              {/* Food Polyline (Orange/Yellow) */}
              {(activeFilter === "ALL" || activeFilter === "FOOD") && (
                <>
                  <PolylineF
                    path={[foodPickup, userLocation, foodDrop]}
                    options={{ strokeColor: "#FF7A00", strokeOpacity: 0.9, strokeWeight: 6 }}
                  />
                  <MarkerF position={foodPickup} title="Spice Kitchen Hub" />
                  <MarkerF position={foodDrop} title="Customer Doorstep" />
                  <MarkerF position={foodRiderPos} title="Food Rider On Route" />
                </>
              )}

              {/* Taxi Polyline (Purple/Navy) */}
              {(activeFilter === "ALL" || activeFilter === "TAXI") && (
                <>
                  <PolylineF
                    path={[taxiPickup, userLocation, taxiDrop]}
                    options={{ strokeColor: "#7147FF", strokeOpacity: 0.9, strokeWeight: 6 }}
                  />
                  <MarkerF position={taxiPickup} title="Taxi Pickup Point" />
                  <MarkerF position={taxiDrop} title="Airport Terminal 3" />
                  <MarkerF position={taxiCabPos} title="Raydo Cab On Route" />
                </>
              )}
            </GoogleMap>
          ) : (
            /* REAL OPENSTREETMAP WATERMARK-FREE DARK CARTOGRAPHY CANVAS (Fallback) */
            <div className="relative w-full h-[440px] sm:h-[520px] rounded-2xl overflow-hidden">
              
              {/* Real Tile Background Layer (OpenStreetMap Dark Inverted, Zero Watermarks) */}
              <div
                className="absolute inset-0 opacity-65 scale-105"
                style={{
                  backgroundImage: `url('https://tile.openstreetmap.org/13/5824/3482.png')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "invert(96%) hue-rotate(195deg) brightness(80%) contrast(125%) saturate(140%)",
                }}
              />
              <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-35" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050713] via-transparent to-[#050713]/80" />

              {/* SVG High-Contrast Polyline Overlay */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 1000 520" fill="none">
                <defs>
                  {/* FOOD Gradient (Orange -> RAYDO Yellow) */}
                  <linearGradient id="foodGradHigh" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FF7A00" />
                    <stop offset="50%" stopColor="#FF9E00" />
                    <stop offset="100%" stopColor="#FFC400" />
                  </linearGradient>

                  {/* TAXI Gradient (Purple -> Navy Blue) */}
                  <linearGradient id="taxiGradHigh" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#7147FF" />
                    <stop offset="50%" stopColor="#315CFF" />
                    <stop offset="100%" stopColor="#0B1230" />
                  </linearGradient>
                </defs>

                {/* ================= TAXI ROUTE (PURPLE & NAVY BLUE) ================= */}
                {(activeFilter === "ALL" || activeFilter === "TAXI") && (
                  <>
                    <path
                      d="M 120 400 Q 280 220 520 300 T 880 130"
                      stroke="#7147FF"
                      strokeWidth="10"
                      strokeLinecap="round"
                      opacity="0.35"
                    />
                    <path
                      d="M 120 400 Q 280 220 520 300 T 880 130"
                      stroke="url(#taxiGradHigh)"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 120 400 Q 280 220 520 300 T 880 130"
                      stroke="#315CFF"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="16 12"
                      strokeDashoffset={-progress * 300}
                    />
                  </>
                )}

                {/* ================= FOOD ROUTE (ORANGE & RAYDO YELLOW) ================= */}
                {(activeFilter === "ALL" || activeFilter === "FOOD") && (
                  <>
                    <path
                      d="M 140 150 Q 380 360 620 180 T 860 420"
                      stroke="#FF7A00"
                      strokeWidth="10"
                      strokeLinecap="round"
                      opacity="0.35"
                    />
                    <path
                      d="M 140 150 Q 380 360 620 180 T 860 420"
                      stroke="url(#foodGradHigh)"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 140 150 Q 380 360 620 180 T 860 420"
                      stroke="#FFC400"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="16 12"
                      strokeDashoffset={-progress * 300}
                    />
                  </>
                )}
              </svg>

              {/* USER GPS PIN (CENTER) */}
              <div className="absolute left-[50%] top-[45%] z-25 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-emerald-500 text-slate-950 text-[9px] sm:text-[10px] font-black uppercase tracking-wider mb-1 shadow-lg border border-emerald-300">
                  You Are Here
                </div>
                <div className="size-8 sm:size-10 rounded-full bg-emerald-500 border-2 sm:border-4 border-slate-950 flex items-center justify-center shadow-2xl animate-bounce">
                  <MapPin size={18} className="text-slate-950" />
                </div>
              </div>

              {/* TAXI MARKERS (PURPLE & NAVY) */}
              {(activeFilter === "ALL" || activeFilter === "TAXI") && (
                <>
                  <div className="absolute left-[12%] bottom-[22%] z-20 flex flex-col items-center">
                    <div className="px-2.5 py-0.5 rounded-full bg-[#7147FF] text-white text-[9px] font-black uppercase tracking-wider mb-1 shadow-lg border border-purple-300">
                      Taxi Pickup Point
                    </div>
                    <div className="size-8 sm:size-9 rounded-full bg-[#7147FF] border-2 sm:border-4 border-[#0B1230] flex items-center justify-center shadow-xl">
                      <MapPin size={16} className="text-white" />
                    </div>
                  </div>

                  <div className="absolute right-[10%] top-[20%] z-20 flex flex-col items-center">
                    <div className="px-2.5 py-0.5 rounded-full bg-[#315CFF] text-white text-[9px] font-black uppercase tracking-wider mb-1 shadow-lg border border-blue-300">
                      Airport Terminal 3
                    </div>
                    <div className="size-8 sm:size-9 rounded-full bg-[#315CFF] border-2 sm:border-4 border-[#0B1230] flex items-center justify-center shadow-xl">
                      <Navigation size={16} className="text-white" />
                    </div>
                  </div>

                  <div className="absolute left-[44%] top-[55%] z-20 flex flex-col items-center -translate-x-1/2 -translate-y-1/2">
                    <div className="size-9 sm:size-11 rounded-full bg-[#7147FF] border-2 sm:border-4 border-[#315CFF] flex items-center justify-center shadow-2xl animate-pulse">
                      <span className="text-xs sm:text-base">🚖</span>
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-black text-white bg-[#0B1230]/95 px-2 py-0.5 rounded-md border border-[#7147FF] mt-1 shadow-lg">
                      Raydo Cab • ETA 6 mins
                    </span>
                  </div>
                </>
              )}

              {/* FOOD MARKERS (ORANGE & YELLOW) */}
              {(activeFilter === "ALL" || activeFilter === "FOOD") && (
                <>
                  <div className="absolute left-[14%] top-[24%] z-20 flex flex-col items-center">
                    <div className="px-2.5 py-0.5 rounded-full bg-[#FF7A00] text-slate-950 text-[9px] font-black uppercase tracking-wider mb-1 shadow-lg border border-amber-300">
                      Spice Kitchen Hub
                    </div>
                    <div className="size-8 sm:size-9 rounded-full bg-[#FF7A00] border-2 sm:border-4 border-slate-950 flex items-center justify-center shadow-xl">
                      <Utensils size={16} className="text-slate-950" />
                    </div>
                  </div>

                  <div className="absolute right-[12%] bottom-[20%] z-20 flex flex-col items-center">
                    <div className="px-2.5 py-0.5 rounded-full bg-[#FFC400] text-slate-950 text-[9px] font-black uppercase tracking-wider mb-1 shadow-lg border border-amber-200">
                      Customer Doorstep
                    </div>
                    <div className="size-8 sm:size-9 rounded-full bg-[#FFC400] border-2 sm:border-4 border-slate-950 flex items-center justify-center shadow-xl">
                      <CheckCircle2 size={16} className="text-slate-950" />
                    </div>
                  </div>

                  <div className="absolute left-[58%] top-[36%] z-20 flex flex-col items-center -translate-x-1/2 -translate-y-1/2">
                    <div className="size-9 sm:size-11 rounded-full bg-[#FF7A00] border-2 sm:border-4 border-[#FFC400] flex items-center justify-center shadow-2xl animate-pulse">
                      <span className="text-xs sm:text-base">🛵</span>
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-black text-slate-950 bg-[#FFC400] px-2 py-0.5 rounded-md border border-orange-500 mt-1 shadow-lg">
                      Food Rider • Dispatched
                    </span>
                  </div>
                </>
              )}

              {/* FLOATING HIGH-CONTRAST BADGES (Responsive) */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="absolute top-3 left-3 sm:top-6 sm:left-6 z-30 bg-[#0B1230]/95 border sm:border-2 border-[#7147FF] rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-2xl backdrop-blur-xl flex items-center gap-2 sm:gap-3"
              >
                <div className="size-2.5 sm:size-3.5 rounded-full bg-emerald-400 animate-ping" />
                <div>
                  <div className="text-[11px] sm:text-xs font-black text-white">Smart Traffic Bypass</div>
                  <div className="text-[9px] sm:text-[10px] text-purple-300 font-bold hidden sm:block">Taxi rerouted via Flyover • Saves 8 min</div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="absolute top-3 right-3 sm:top-6 sm:right-6 z-30 bg-slate-950/95 border sm:border-2 border-[#FF7A00] rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-2xl backdrop-blur-xl flex items-center gap-2 sm:gap-3"
              >
                <Utensils size={15} className="text-[#FFC400] shrink-0" />
                <div>
                  <div className="text-[11px] sm:text-xs font-black text-[#FFC400]">Express Hot Delivery</div>
                  <div className="text-[9px] sm:text-[10px] text-slate-300 font-bold hidden sm:block">Thermal Bag Rider Dispatch</div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-30 bg-[#0B1230]/95 border sm:border-2 border-[#315CFF] rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-2xl backdrop-blur-xl flex items-center gap-2 sm:gap-3"
              >
                <Clock size={16} className="text-[#315CFF] shrink-0" />
                <div>
                  <div className="text-[11px] sm:text-xs font-black text-slate-300">Live Network Sync</div>
                  <div className="text-[10px] sm:text-xs font-black text-[#FFC400]">Taxi: 14m • Food: 22m</div>
                </div>
              </motion.div>

            </div>
          )}

        </div>


      </div>
    </section>
  );
}



