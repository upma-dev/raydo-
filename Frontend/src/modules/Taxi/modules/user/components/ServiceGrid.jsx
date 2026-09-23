import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { userService } from '../services/userService';
import { POOLING_ENABLED, RENTAL_ENABLED } from '../../../shared/featureFlags';
import { getSavedLocationCoords } from '../services/locationStore';

// Vehicle Asset Imports
import busImg from '../../../assets/3d images/AutoCab/bus.png';
import poolingImg from '../../../assets/3d images/AutoCab/taxi.png';
import outstationImg from '../../../assets/3d images/AutoCab/one way.png';
import rideImg from '../../../assets/3d images/AutoCab/taxi.png';
import deliveryImg from '../../../assets/icons/Delivery.png';
import bikeImg from '../../../assets/icons/bike.png';
import autoImg from '../../../assets/icons/auto.png';

function getSavedStops() {
  const stops = [];
  try {
    const homeSaved = window.localStorage.getItem('raydo:homeAddress') || window.localStorage.getItem('homeLocation');
    if (homeSaved) {
      stops.push({ id: 'home', label: 'Home', emoji: '🏠', path: '/taxi/user/ride/select-location?type=home' });
    } else {
      stops.push({ id: 'home', label: 'Home', emoji: '🏠', path: '/taxi/user/ride/select-location?type=home' });
    }

    const officeSaved = window.localStorage.getItem('raydo:officeAddress') || window.localStorage.getItem('officeLocation');
    if (officeSaved) {
      stops.push({ id: 'office', label: 'Office', emoji: '🏢', path: '/taxi/user/ride/select-location?type=office' });
    } else {
      stops.push({ id: 'office', label: 'Office', emoji: '🏢', path: '/taxi/user/ride/select-location?type=office' });
    }

    const lastLoc = JSON.parse(window.localStorage.getItem('raydo:lastLocation') || '{}');
    if (lastLoc?.address) {
      const shortAddr = lastLoc.address.split(',')[0].trim();
      stops.push({ id: 'recent', label: shortAddr.length > 12 ? `${shortAddr.slice(0, 10)}...` : shortAddr, emoji: '📍', path: '/taxi/user/ride/select-location' });
    } else {
      stops.push({ id: 'airport', label: 'Airport', emoji: '✈️', path: '/taxi/user/ride/select-location?destination=Airport' });
    }
  } catch (err) {
    stops.push({ id: 'airport', label: 'Airport', emoji: '✈️', path: '/taxi/user/ride/select-location?destination=Airport' });
  }

  stops.push({ id: 'add', label: 'Add Stop', emoji: '➕', path: '/taxi/user/ride/select-location' });
  return stops;
}

const DEFAULT_SERVICE_CARDS = [
  {
    id: 'cab',
    name: 'Cab',
    desc: 'Fast Cab',
    icon: rideImg,
    fallbackIcon: rideImg,
    eta: '3 min',
    fare: null,
    fareStatus: 'dynamic',
    status: 'available',
    path: '/taxi/user/ride/select-location',
  },
  {
    id: 'bike',
    name: 'Bike',
    desc: 'Quick Ride',
    icon: bikeImg,
    fallbackIcon: bikeImg,
    eta: '2 min',
    fare: null,
    fareStatus: 'dynamic',
    status: 'available',
    path: '/taxi/user/ride/select-location',
  },
  {
    id: 'parcel',
    name: 'Parcel',
    desc: 'Send package',
    icon: deliveryImg,
    fallbackIcon: deliveryImg,
    eta: '5 min',
    fare: null,
    fareStatus: 'dynamic',
    status: 'available',
    path: '/taxi/user/parcel/type',
  },
  {
    id: 'bus',
    name: 'Bus',
    desc: 'City transit',
    icon: busImg,
    fallbackIcon: busImg,
    eta: '6 min',
    fare: null,
    fareStatus: 'dynamic',
    status: 'available',
    path: '/taxi/user/bus',
  },
  {
    id: 'outstation',
    name: 'Outstation',
    desc: 'Intercity',
    icon: outstationImg,
    fallbackIcon: outstationImg,
    eta: '10 min',
    fare: null,
    fareStatus: 'dynamic',
    status: 'available',
    path: '/taxi/user/intercity',
  },
];

const ServiceGrid = ({ plain = false }) => {
  const navigate = useNavigate();
  const [serviceCards, setServiceCards] = useState(DEFAULT_SERVICE_CARDS);
  const [savedStops, setSavedStops] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSavedStops(getSavedStops());
  }, []);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true);
        const coords = getSavedLocationCoords();
        const params = {};
        if (coords) {
          params.lng = coords[0];
          params.lat = coords[1];
        }
        const res = await userService.getAppModules(params);
        const results = res?.results || res?.data?.results || [];

        const activeModules = results.filter((m) => {
          if (!m.active) return false;
          if (!RENTAL_ENABLED && m.service_type === 'rental') return false;
          if (!POOLING_ENABLED && (m.service_type === 'pooling' || String(m.name || '').toLowerCase().includes('pooling'))) {
            return false;
          }
          return true;
        });

        if (activeModules.length > 0) {
          const mapped = activeModules.map((m, idx) => {
            const nameLower = String(m.name || '').toLowerCase();
            const isParcel = m.transport_type === 'delivery' || nameLower.includes('parcel') || nameLower.includes('delivery');
            const isOutstation = m.service_type === 'outstation' || nameLower.includes('outstation');
            const isPooling = m.service_type === 'pooling' || nameLower.includes('pooling');
            const isBus = m.service_type === 'bus' || nameLower.includes('bus');
            const isBike = nameLower.includes('bike');
            const isAuto = nameLower.includes('auto');

            const adminIcon = (
              m.mobile_menu_icon ||
              m.mobile_menu_cover_image ||
              m.icon ||
              m.image ||
              m.thumbnail ||
              m.icon_url
            );

            let fallbackIcon = rideImg;
            let eta = '3 min';
            let desc = 'Fast Cab';
            let path = '/taxi/user/ride/select-location';

            if (isBike) {
              fallbackIcon = bikeImg;
              eta = '2 min';
              desc = 'Quick Ride';
            } else if (isAuto) {
              fallbackIcon = autoImg;
              eta = '3 min';
              desc = 'City Auto';
            } else if (isParcel) {
              fallbackIcon = deliveryImg;
              eta = '5 min';
              desc = 'Send package';
              path = '/taxi/user/parcel/type';
            } else if (isBus) {
              fallbackIcon = busImg;
              eta = '6 min';
              desc = 'City transit';
              path = '/taxi/user/bus';
            } else if (isOutstation) {
              fallbackIcon = outstationImg;
              eta = '10 min';
              desc = 'Intercity';
              path = '/taxi/user/intercity';
            } else if (isPooling) {
              fallbackIcon = poolingImg;
              eta = '4 min';
              desc = 'Share Cab';
              path = '/taxi/user/pooling';
            }

            const resolvedIcon = (adminIcon && String(adminIcon).trim() !== '') ? adminIcon : fallbackIcon;

            return {
              id: m._id || idx,
              name: m.name || 'Cab',
              desc: m.short_description || desc,
              icon: resolvedIcon,
              fallbackIcon,
              eta: m.estimated_time || eta,
              fare: m.base_fare ? Number(m.base_fare) : null,
              fareStatus: 'dynamic',
              status: 'available',
              path,
            };
          });
          setServiceCards(mapped);
        }
      } catch (err) {
        console.warn('Using default service cards:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  return (
    <div className="relative w-full bg-[#F0F5FD] text-[#111827]">
      {/* 1. VISUAL HERO TRANSITION CURVE */}
      <div className="relative w-full pointer-events-none z-20 overflow-hidden leading-none">
        <svg viewBox="0 0 1440 32" fill="none" className="w-full h-4 sm:h-6 preserve-3d" preserveAspectRatio="none">
          <path d="M0,0 C480,32 960,32 1440,0 L1440,32 L0,32 Z" fill="#F0F5FD" />
        </svg>
      </div>

      {/* Main Content Area (390px mobile target, 18px horizontal padding) */}
      <div className="relative z-10 px-[18px] pt-1.5 pb-4">
        {/* ========================================================================= */}
        {/* 1. QUICK STOPS (Saved / Remembered Locations) */}
        {/* ========================================================================= */}
        <div className="mb-4 mt-0">
          <h3 className="text-[14px] font-extrabold text-[#111827] mb-2 tracking-tight flex items-center gap-1.5">
            <span>Quick stops</span>
            <span className="text-[10px] font-semibold text-[#667085] bg-white px-2 py-0.5 rounded-full border border-indigo-100">Saved</span>
          </h3>

          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 px-[18px] -mx-[18px]">
            {savedStops.map((stop, idx) => (
              <motion.button
                key={stop.id || idx}
                type="button"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate(stop.path)}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-indigo-100/90 shadow-[0_4px_14px_rgba(30,41,59,0.03)] hover:border-[#FFC400] transition-all cursor-pointer text-[#111827]"
              >
                <span className="text-[15px] leading-none">{stop.emoji}</span>
                <span className="text-[13px] font-extrabold text-[#111827]">{stop.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. CHOOSE YOUR RIDE (Compact Light Cards with Admin Vehicle Icons) */}
        {/* ========================================================================= */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[20px] font-black text-[#111827] tracking-tight">
              Choose your ride
            </h3>
            <div className="flex items-center gap-1.5 bg-white/90 border border-indigo-100 px-2.5 py-1 rounded-full shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#FFC400] animate-pulse" />
              <span className="text-[11px] font-extrabold text-[#667085]">Live availability</span>
            </div>
          </div>

          {/* Horizontally scrollable compact light cards */}
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1 px-[18px] -mx-[18px]">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="shrink-0 w-[142px] h-[115px] animate-pulse rounded-[16px] bg-white border border-slate-200"
                />
              ))
            ) : (
              serviceCards.map((card, idx) => {
                const renderFareText = () => {
                  if (card.status === 'loading') return 'Finding rides...';
                  if (card.status === 'unavailable') return 'Unavailable';
                  if (card.status === 'error') return 'Try again';
                  if (card.fare !== null && card.fare !== undefined && !Number.isNaN(Number(card.fare))) {
                    return `₹${card.fare}`;
                  }
                  return 'Live fare';
                };

                const renderEtaText = () => {
                  if (card.eta) return card.eta;
                  return 'Live';
                };

                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.07 }}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate(card.path)}
                    className="shrink-0 w-[142px] p-3 rounded-[16px] bg-white border border-slate-200/80 shadow-[0_6px_20px_rgba(30,41,59,0.04)] flex flex-col justify-between cursor-pointer group transition-all"
                  >
                    {/* Top Row: Vehicle Icon + ETA */}
                    <div className="flex items-start justify-between w-full mb-1">
                      <div className="h-9 w-9 flex items-center justify-center">
                        <img
                          src={card.icon}
                          onError={(e) => {
                            if (card.fallbackIcon && e.target.src !== card.fallbackIcon) {
                              e.target.src = card.fallbackIcon;
                            }
                          }}
                          alt={card.name}
                          className="h-full w-full object-contain drop-shadow-xs group-hover:scale-110 transition-transform"
                        />
                      </div>
                      <span className="text-[9.5px] font-bold text-[#667085] bg-[#F0F5FD] px-2 py-0.5 rounded-full border border-indigo-100">
                        {renderEtaText()}
                      </span>
                    </div>

                    {/* Title */}
                    <div>
                      <h4 className="text-[14px] font-black text-[#111827] tracking-tight leading-tight">
                        {card.name}
                      </h4>
                      <p className="text-[10px] font-medium text-[#667085] mt-0.5 line-clamp-1">
                        {card.desc}
                      </p>
                    </div>

                    {/* Footer: Live Fare + Arrow CTA */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between w-full">
                      <span className="text-[12px] font-black text-[#111827] truncate">
                        {renderFareText()}
                      </span>
                      <div className="h-6.5 w-6.5 rounded-full bg-[#FFC400] text-[#111827] flex items-center justify-center shadow-xs shrink-0 group-hover:scale-110 transition-transform">
                        <ArrowRight size={12} strokeWidth={3} />
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceGrid;

