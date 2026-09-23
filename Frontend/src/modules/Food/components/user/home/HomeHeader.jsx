import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronDown, Search, Mic, Bell, CheckCircle2, Tag, AlertCircle, BellOff, X, ShoppingBag, ShoppingCart, Loader2, SlidersHorizontal, Volume2, VolumeX, ShieldCheck, Copy, Check, Sparkles } from 'lucide-react';
import { useLocation as useUserGeoLocation } from "@food/hooks/useLocation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@food/components/ui/popover";
import { Badge } from "@food/components/ui/badge";
import foodIcon from "@food/assets/category-icons/food.png";
import quickIcon from "@food/assets/category-icons/quick.png";
import hotelIcon from "@food/assets/category-icons/hotel.png";
import quickSpicyLogo from "@food/assets/raydo-logo.png";
import heroAppetizingFood from "@food/assets/hero_appetizing_food.png";
import cinematicFoodPoster from "@food/assets/cinematic_food_poster.png";
import { useCart } from "@food/context/CartContext";
import useNotificationInbox from "@food/hooks/useNotificationInbox";
import { getVerticalTheme } from "@/shared/constants/superAppVerticalTheme";
import { syncThemeForPath } from "@/shared/utils/theme.js";
import { calculateDistanceInKm, extractCoords } from "@food/utils/geoDistance";
import { loadBusinessSettings } from "@food/utils/businessSettings";

const ICON_MAP = {
  CheckCircle2,
  Tag,
  AlertCircle
};

const LOCATION_STORAGE_KEY = 'raydo:lastLocation';
const LOCATION_UPDATED_EVENT = 'raydo:location-updated';

const FOOD_PLACEHOLDERS = [
  'Search "burger"',
  'Search "biryani"',
  'Search "pizza"',
  'Search "chinese"',
  'Search "momos"',
];

const TAXI_PLACEHOLDERS = [
  'Search "airport cab"',
  'Search "shared taxi"',
  'Search "bike taxi"',
  'Search "rental ride"',
  'Search "outstation"',
];

function readRaydoLocation() {
  if (typeof window === 'undefined') return null;
  try {
    // 1. Priority: Read Food/Grocery location key userLocation FIRST for full accuracy
    const foodSaved = JSON.parse(window.localStorage.getItem('userLocation') || '{}');
    if (foodSaved?.latitude && foodSaved?.longitude) {
      const address = String(foodSaved.formattedAddress || foodSaved.address || foodSaved.city || '').trim();
      const area = String(foodSaved.area || '').trim();
      const city = String(foodSaved.city || '').trim();
      const state = String(foodSaved.state || '').trim();
      const zip = String(foodSaved.postalCode || foodSaved.zipCode || '').trim();
      if (address) {
        return {
          formattedAddress: address,
          area: area || address.split(',')[0]?.trim() || '',
          city,
          state,
          zipCode: zip,
          address,
          latitude: Number(foodSaved.latitude),
          longitude: Number(foodSaved.longitude),
        };
      }
    }

    // 2. Fallback to Taxi location key raydo:lastLocation
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
    const address = String(saved?.address || '').trim();
    if (!address) return null;
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return {
      formattedAddress: address,
      area: parts[0] || address,
      city: parts.length > 2 ? parts[parts.length - 2] : parts[1] || '',
      state: parts.length > 1 ? parts[parts.length - 1] : '',
      address,
    };
  } catch {
    return null;
  }
}

const FALLBACK_BANNER_IMAGES = [
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&h=500&fit=crop",
  "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900&h=500&fit=crop",
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900&h=500&fit=crop",
];

function BurgerIcon({ isActive }) {
  if (isActive) {
    return (
      <svg className="w-8 h-8 filter drop-shadow-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 30C12 18 20 12 32 12C44 12 52 18 52 30H12Z" fill="#F4A261" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 32C10 32 14 36 21 36C28 36 30 32 35 32C40 32 43 36 48 36C53 36 54 32 54 32" fill="#2A9D8F" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 36L14 40L50 40L54 36" fill="#E9C46A" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="40" width="36" height="6" rx="3" fill="#8B5E3C" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 46C16 52 22 54 32 54C42 54 48 52 48 46H16Z" fill="#F4A261" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 opacity-65 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 30C12 18 20 12 32 12C44 12 52 18 52 30H12Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 32C10 32 14 36 21 36C28 36 30 32 35 32C40 32 43 36 48 36C53 36 54 32 54 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 36L14 40L50 40L54 36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="40" width="36" height="6" rx="3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 46C16 52 22 54 32 54C42 54 48 52 48 46H16Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TaxiIcon({ isActive }) {
  if (isActive) {
    return (
      <svg className="w-8 h-8 filter drop-shadow-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="22" y="10" width="20" height="7" rx="2" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <rect x="26" y="11.5" width="12" height="4" rx="1" fill="#FBBF24" />
        <path d="M14 24H50L46 17H18L14 24Z" fill="#2563EB" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M12 24H52C54.2 24 56 25.8 56 28V38C56 40.2 54.2 42 52 42H12C9.8 42 8 40.2 8 38V28C8 25.8 9.8 24 12 24Z" fill="#3B82F6" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M18 28H46" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
        <rect x="20" y="30" width="10" height="6" rx="1" fill="#DBEAFE" stroke="#0F172A" strokeWidth="1.5" />
        <rect x="34" y="30" width="10" height="6" rx="1" fill="#DBEAFE" stroke="#0F172A" strokeWidth="1.5" />
        <circle cx="18" cy="42" r="5" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <circle cx="46" cy="42" r="5" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <circle cx="18" cy="42" r="2" fill="#E2E8F0" />
        <circle cx="46" cy="42" r="2" fill="#E2E8F0" />
        <rect x="28" y="44" width="8" height="3" rx="1" fill="#64748B" />
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 opacity-70 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="10" width="20" height="7" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M14 24H50L46 17H18L14 24Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M12 24H52C54.2 24 56 25.8 56 28V38C56 40.2 54.2 42 52 42H12C9.8 42 8 40.2 8 38V28C8 25.8 9.8 24 12 24Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="18" cy="42" r="5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="46" cy="42" r="5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

const renderVerticalIcon = (id, isActive) => {
  if (id === 'food') return <BurgerIcon isActive={isActive} />;
  if (id === 'taxi') return <TaxiIcon isActive={isActive} />;
  return null;
};

const foodTheme = getVerticalTheme('food');
const taxiTheme = getVerticalTheme('taxi');

const VERTICALS = [
  {
    id: 'food',
    name: 'RaydoFood',
    path: '/food/user',
    icon: foodIcon,
    themeBg: foodTheme.themeBg,
    activeTabBg: foodTheme.activeTabBg,
    inactiveTabBg: foodTheme.inactiveTabBg,
  },
  {
    id: 'taxi',
    name: 'RaydoTaxi',
    path: '/taxi/user',
    icon: quickIcon,
    themeBg: taxiTheme.themeBg,
    activeTabBg: taxiTheme.activeTabBg,
    inactiveTabBg: taxiTheme.inactiveTabBg,
  },
];

export default function HomeHeader({
  activeVertical: activeVerticalProp,
  onVerticalChange,
  location: locationProp,
  savedAddressText,
  locationTitle,
  locationSubtitle,
  handleLocationClick,
  handleSearchFocus,
  placeholderIndex: placeholderIndexProp,
  placeholders: placeholdersProp,
  handleVegModeChange,
  isVegMode,
  vegModeToggleRef,
  isCategoryStuck = false,
  heroBannerImages = [],
  heroBanners = [],
  hideSearchRow = false,
}) {
  const navigate = useNavigate();
  const reactLocation = useLocation();
  const locationPath = reactLocation.pathname;
  const { itemCount } = useCart();

  const isControlled = typeof onVerticalChange === 'function';

  let routeVertical = 'food';
  if (locationPath.startsWith('/taxi/')) {
    routeVertical = 'taxi';
  } else if (['food', 'taxi'].includes(activeVerticalProp)) {
    routeVertical = activeVerticalProp;
  }

  const activeVertical = isControlled
    ? (['food', 'taxi'].includes(activeVerticalProp) ? activeVerticalProp : 'food')
    : (activeVerticalProp ?? routeVertical);
  const isFood = activeVertical === 'food';
  const isTaxi = activeVertical === 'taxi';

  const handleVerticalTabClick = useCallback((verticalId) => {
    if (isControlled) {
      onVerticalChange(verticalId);
      return;
    }
    if (verticalId === 'food') {
      navigate('/food/user');
      return;
    }
    if (verticalId === 'taxi') {
      syncThemeForPath('/taxi/user');
      navigate('/taxi/user');
      return;
    }
    navigate(`/food/user?vertical=${verticalId}`);
  }, [isControlled, onVerticalChange, navigate]);

  const currentVertical = VERTICALS.find((v) => v.id === activeVertical) || VERTICALS[0];
  const verticalTheme = getVerticalTheme(activeVertical);
  const bannerImages = heroBannerImages.length > 0 ? heroBannerImages : FALLBACK_BANNER_IMAGES;

  const { location: geoLoc, loading: isGeoLoading } = useUserGeoLocation();

  const [storedLocation, setStoredLocation] = useState(() => readRaydoLocation());
  const [internalPlaceholderIndex, setInternalPlaceholderIndex] = useState(0);

  const [businessSettings, setBusinessSettings] = useState(null);

  useEffect(() => {
    let mounted = true;
    loadBusinessSettings().then((settings) => {
      if (mounted && settings) {
        setBusinessSettings(settings);
      }
    });
    return () => { mounted = false; };
  }, []);

  const dynamicLogoUrl = businessSettings?.userLogo?.url || businessSettings?.logo?.url || quickSpicyLogo;
  const companyName = businessSettings?.companyName || "RAYDO";

  useEffect(() => {
    const syncLocation = () => setStoredLocation(readRaydoLocation());
    syncLocation();
    window.addEventListener('storage', syncLocation);
    window.addEventListener(LOCATION_UPDATED_EVENT, syncLocation);
    window.addEventListener('userLocationUpdated', syncLocation);
    window.addEventListener('locationChanged', syncLocation);
    return () => {
      window.removeEventListener('storage', syncLocation);
      window.removeEventListener(LOCATION_UPDATED_EVENT, syncLocation);
      window.removeEventListener('userLocationUpdated', syncLocation);
      window.removeEventListener('locationChanged', syncLocation);
    };
  }, []);

  const location = locationProp ?? storedLocation ?? geoLoc;
  const isLocating = isGeoLoading && !location?.formattedAddress && !location?.address;

  const displayTitle = useMemo(() => {
    if (isLocating) return "Locating...";
    if (locationTitle?.trim()) return locationTitle.trim();
    if (savedAddressText?.trim()) {
      const firstPart = savedAddressText.split(',')[0]?.trim();
      return firstPart || savedAddressText;
    }
    if (location?.area && location?.city) return `${location.area}, ${location.city}`;
    if (location?.area) return location.area;
    if (location?.city) return location.city;
    if (location?.formattedAddress) {
      const parts = location.formattedAddress.split(',').map((p) => p.trim()).filter(Boolean);
      return parts[0] || location.formattedAddress;
    }
    return "Locating...";
  }, [locationTitle, savedAddressText, location, isLocating]);

  const displaySubtitle = useMemo(() => {
    if (isLocating) return "Fetching address...";
    if (locationSubtitle?.trim()) return locationSubtitle.trim();
    if (location?.formattedAddress) {
      const parts = location.formattedAddress.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.slice(1).join(', ');
      }
    }
    const parts = [location?.state, location?.zipCode || location?.postalCode].filter(Boolean);
    return parts.join(", ");
  }, [locationSubtitle, location, isLocating]);

  const selectedAddressDistanceKm = useMemo(() => {
    const deliveryAddressMode = localStorage.getItem("deliveryAddressMode") || "saved";
    if (deliveryAddressMode === "current") return 0;

    let liveCoords = null;
    try {
      const raw = localStorage.getItem("userLocation");
      if (raw) {
        liveCoords = extractCoords(JSON.parse(raw));
      }
    } catch {
      // ignore
    }

    const addressCoords = extractCoords(location);
    if (!liveCoords || !addressCoords) return 0;

    return calculateDistanceInKm(
      liveCoords.latitude,
      liveCoords.longitude,
      addressCoords.latitude,
      addressCoords.longitude
    );
  }, [location]);

  const resolvedPlaceholders = useMemo(() => {
    if (placeholdersProp?.length) return placeholdersProp;
    if (isTaxi) return TAXI_PLACEHOLDERS;
    return FOOD_PLACEHOLDERS;
  }, [placeholdersProp, isTaxi]);

  const placeholderIndex = placeholderIndexProp ?? internalPlaceholderIndex;

  useEffect(() => {
    if (placeholderIndexProp !== undefined && placeholderIndexProp !== null) return undefined;
    const timer = setInterval(() => {
      setInternalPlaceholderIndex((prev) => (prev + 1) % resolvedPlaceholders.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [placeholderIndexProp, resolvedPlaceholders.length]);

  const onLocationClick = useCallback(() => {
    if (handleLocationClick) {
      handleLocationClick();
      return;
    }
    if (isTaxi) {
      navigate('/taxi/user/ride/select-location');
    }
  }, [handleLocationClick, isTaxi, navigate]);

  const onSearchFocus = useCallback(() => {
    if (handleSearchFocus) {
      handleSearchFocus();
      return;
    }
    if (isTaxi) {
      navigate('/taxi/user/ride/select-location');
      return;
    }
    if (isFood) {
      navigate('/food/user/search');
    }
  }, [handleSearchFocus, isTaxi, isFood, navigate]);

  const walletPath = isTaxi ? '/taxi/user/wallet' : '/food/user/wallet';

  const [notifications, setNotifications] = useState(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('food_user_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    dismiss: dismissBroadcastNotification,
  } = useNotificationInbox(isFood ? "user" : null, { limit: 20 });

  useEffect(() => {
    if (!isFood) return undefined;
    const syncNotifications = () => {
      const saved = localStorage.getItem('food_user_notifications');
      setNotifications(saved ? JSON.parse(saved) : []);
    };
    window.addEventListener('notificationsUpdated', syncNotifications);
    return () => window.removeEventListener('notificationsUpdated', syncNotifications);
  }, [isFood]);

  const mergedNotifications = useMemo(() => {
    const localItems = Array.isArray(notifications)
      ? notifications.map((item) => ({ ...item, source: "local" }))
      : [];
    const broadcastItems = (broadcastNotifications || []).map((item) => ({
      ...item,
      source: "broadcast",
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "Just now",
      type: "broadcast",
      icon: "Bell",
      iconColor: "text-blue-600",
    }));

    return [...broadcastItems, ...localItems].sort(
      (a, b) =>
        new Date(b.createdAt || b.timestamp || 0).getTime() -
        new Date(a.createdAt || a.timestamp || 0).getTime()
    );
  }, [broadcastNotifications, notifications]);

  const unreadCount = notifications.filter(n => !n.read).length + broadcastUnreadCount;

  const handleDeleteNotification = (id, source = "local") => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id);
      return;
    }
    setNotifications((prev) => {
      const next = prev.filter((notification) => notification.id !== id);
      localStorage.setItem('food_user_notifications', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('notificationsUpdated', { detail: { count: next.filter((n) => !n.read).length } }));
      return next;
    });
  };

  const [isVegOnly, setIsVegOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return JSON.parse(localStorage.getItem("raydo_veg_mode_only") || "false");
    } catch {
      return false;
    }
  });
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const defaultPosterTemplates = useMemo(() => [
    {
      title: "HUNGRY?",
      highlight: companyName,
      subTitle: "Fresh food. Fast delivery.",
      offerText: "₹150 OFF",
      offerSub: "on first order",
      ctaText: "ORDER NOW",
      imageUrl: heroAppetizingFood,
      videoUrl: "/food/cute_video_hero_section_ke_liy.mp4",
    },
    {
      title: "PIZZA &",
      highlight: "BURGER",
      subTitle: "Up to 50% OFF on Top Restaurants",
      offerText: "FREE DELIVERY",
      offerSub: "on orders above ₹199",
      ctaText: "EXPLORE DEALS",
      imageUrl: heroAppetizingFood,
      videoUrl: "/food/cute_video_hero_section_ke_liy.mp4",
    },
    {
      title: "FAST &",
      highlight: "FRESH",
      subTitle: "Hot meals delivered in 25-30 Mins",
      offerText: "EXTRA ₹100 OFF",
      offerSub: "with RAYDO Pass",
      ctaText: "ORDER NOW",
      imageUrl: heroAppetizingFood,
      videoUrl: "/food/cute_video_hero_section_ke_liy.mp4",
    }
  ], [companyName]);

  const slideBanners = useMemo(() => {
    if (Array.isArray(heroBanners) && heroBanners.length > 0) {
      return heroBanners.map((banner, index) => {
        const isObj = typeof banner === 'object' && banner !== null;
        const imageUrl = isObj ? (banner.imageUrl || banner.image || banner.coverImage) : banner;
        const template = defaultPosterTemplates[index % defaultPosterTemplates.length];

        return {
          id: isObj ? (banner._id || banner.id || index) : index,
          title: isObj && banner.title ? String(banner.title).toUpperCase() : template.title,
          highlight: isObj && banner.highlight ? String(banner.highlight).toUpperCase() : template.highlight,
          subTitle: isObj && (banner.subTitle || banner.description) ? (banner.subTitle || banner.description) : template.subTitle,
          offerText: isObj && (banner.offerText || banner.discountText || banner.badge) ? (banner.offerText || banner.discountText || banner.badge) : template.offerText,
          offerSub: isObj && banner.offerSub ? banner.offerSub : template.offerSub,
          ctaText: isObj && (banner.ctaText || banner.buttonText) ? (banner.ctaText || banner.buttonText) : template.ctaText,
          ctaLink: isObj ? (banner.ctaLink || banner.link || banner.targetUrl) : null,
          imageUrl: imageUrl || heroAppetizingFood,
          videoUrl: isObj ? (banner.videoUrl || banner.video || template.videoUrl) : template.videoUrl,
        };
      });
    }
    return defaultPosterTemplates;
  }, [heroBanners, defaultPosterTemplates]);

useEffect(() => {
  if (!isFood) return undefined;
  const timer = setInterval(() => {
    setCurrentSlide((prev) => (prev + 1) % Math.max(slideBanners.length, 1));
  }, 4000);
  return () => clearInterval(timer);
}, [slideBanners.length, isFood]);

return (
  <>
    {/* Header Container: Dynamic Logo + Location + Connected Full Video Hero */}
    <div className="relative z-10 w-full bg-gradient-to-r from-[#FFC700] via-[#FF8800] to-[#FF6B00] text-black transition-colors duration-300 pb-4 shadow-xl rounded-b-[28px] sm:rounded-b-[36px]">
      {/* Row 1: Logo + Address + Action Icons */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        {/* Dynamic Logo */}
        <Link to="/food/user" className="flex items-center gap-2 flex-shrink-0">
          <img
            src={dynamicLogoUrl}
            alt={companyName}
            className="h-8 sm:h-9 w-auto max-w-[130px] object-contain filter drop-shadow-md"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = quickSpicyLogo;
            }}
          />
          {(!businessSettings?.userLogo?.url && !businessSettings?.logo?.url) && (
            <div className="flex flex-col leading-none">
              <span className="text-[18px] sm:text-[20px] font-black tracking-tighter uppercase text-black drop-shadow-xs">
                {companyName}
              </span>
            </div>
          )}
        </Link>

        {/* Address Dropdown Pill */}
        <button
          type="button"
          className="flex items-center gap-1.5 min-w-0 flex-1 max-w-[210px] sm:max-w-[260px] mx-1 text-left bg-black/15 hover:bg-black/25 px-3 py-1.5 rounded-full transition-all border border-white/25 backdrop-blur-md shadow-inner text-white"
          onClick={onLocationClick}
        >
          <MapPin className="h-4 w-4 flex-shrink-0 text-white fill-white/20" strokeWidth={2.2} />
          <div className="flex items-center gap-1 min-w-0 flex-1 text-white">
            <span className="text-[12px] sm:text-[13px] font-extrabold truncate leading-tight drop-shadow-xs flex-1">
              {displayTitle} {displaySubtitle ? `· ${displaySubtitle}` : ''}
            </span>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
          </div>
        </button>

        {/* Action Icons: Wallet, Notification Bell & Cart (3 Circular Capsule Buttons matching Reference Image) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Wallet Button */}
          <button
            type="button"
            className="h-8.5 w-8.5 sm:h-10 sm:w-10 relative flex items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50 transition-all text-gray-900 border border-white/60"
            onClick={() => navigate(walletPath)}
            aria-label="Wallet"
          >
            <div className="w-4 h-4 sm:w-4.5 sm:h-4.5 border-2 border-black rounded-md flex items-center justify-center bg-yellow-400">
              <span className="text-black text-[9px] sm:text-[10px] font-black">₹</span>
            </div>
          </button>

          {/* Notification Bell Button */}
          {!isTaxi && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-8.5 w-8.5 sm:h-10 sm:w-10 relative flex items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50 active:scale-95 transition-all text-gray-900 border border-white/60"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-black" strokeWidth={2.2} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 overflow-hidden border-none shadow-2xl rounded-2xl mt-2" align="end">
                <div className="bg-white dark:bg-gray-900">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      Notifications
                      {unreadCount > 0 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-600 border-none text-[10px] h-4">
                          {unreadCount} New
                        </Badge>
                      )}
                    </h3>
                    <Link to="/food/user/notifications" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                      {mergedNotifications.length > 0 ? "View All" : ""}
                    </Link>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {mergedNotifications.length > 0 ? (
                      mergedNotifications.slice(0, 5).map((notif) => {
                        const Icon = ICON_MAP[notif.icon] || Bell;
                        return (
                          <div
                            key={notif.id}
                            className={`p-4 flex items-start gap-3 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${!notif.read ? 'bg-orange-50/20' : ''}`}
                          >
                            <div className={`mt-1 p-2 rounded-full ${notif.type === "order" ? "bg-green-100/50 text-green-600" : "bg-orange-100/50 text-orange-600"}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{notif.title}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{notif.time}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDeleteNotification(notif.id, notif.source);
                                    }}
                                    className="rounded-full p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                                {notif.message}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center flex flex-col items-center gap-2">
                        <BellOff className="h-10 w-10 text-gray-200" />
                        <p className="text-xs text-gray-400 font-medium">All caught up!</p>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Cart Button */}
          {isFood && (
            <button
              type="button"
              className="h-8.5 w-8.5 sm:h-10 sm:w-10 relative flex items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50 active:scale-95 transition-all text-gray-900 border border-white/60"
              onClick={() => navigate('/food/user/cart')}
              aria-label="Cart"
            >
              <ShoppingCart className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-black" strokeWidth={2.2} />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Service Vertical Toggle (Food / Taxi Switcher - Black/White Treatment) */}
      <div className="px-4 py-2 flex justify-center">
        <div className="bg-black/20 p-1 rounded-full flex items-center gap-1 border border-white/25 shadow-inner backdrop-blur-md">
          <button
            type="button"
            onClick={() => handleVerticalTabClick('food')}
            className={`flex items-center gap-2 px-6 py-1.5 rounded-full text-[12.5px] font-black transition-all duration-300 ${isFood
                ? 'bg-black text-[#FFC700] shadow-lg border border-amber-400/40 scale-[1.03]'
                : 'text-white/90 hover:bg-black/10'
              }`}
          >
            <span className="text-base leading-none">🍔</span>
            <span>Food</span>
          </button>
          <button
            type="button"
            onClick={() => handleVerticalTabClick('taxi')}
            className={`flex items-center gap-2 px-6 py-1.5 rounded-full text-[12.5px] font-black transition-all duration-300 ${isTaxi
                ? 'bg-black text-[#FFC700] shadow-lg border border-amber-400/40 scale-[1.03]'
                : 'text-white/90 hover:bg-black/10'
              }`}
          >
            <span className="text-base leading-none">🚕</span>
            <span>Taxi</span>
          </button>
        </div>
      </div>

      {/* Row 3: Search Input Bar + VEG MODE Switch */}
      {!hideSearchRow && (
        <div className="px-4 pt-1.5">
          <div className="flex items-center gap-2">
            {/* Search Input Bar */}
            <div
              className="flex-1 min-w-0 rounded-full flex items-center px-4 py-2.5 bg-white shadow-md cursor-pointer active:scale-[0.99] transition-all duration-200 border border-amber-200/50 hover:border-amber-400"
              onClick={onSearchFocus}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSearchFocus();
                }
              }}
            >
              <Search className="h-4 w-4 mr-2.5 text-orange-500 flex-shrink-0" strokeWidth={2.5} />
              <div className="flex-1 relative h-5 min-w-0">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIndex}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="absolute inset-0 text-[13px] font-semibold text-gray-500 truncate"
                  >
                    {resolvedPlaceholders?.[placeholderIndex] || 'Search "biryani"'}
                  </motion.span>
                </AnimatePresence>
              </div>
              <div className="h-4 w-px bg-gray-200 mx-2 flex-shrink-0" />
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm">
                <Mic className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
            </div>

            {/* VEG MODE Switch (Matching Reference Image next to search input) */}
            {isFood && (
              <div className="flex flex-col items-center justify-center flex-shrink-0 px-1">
                <span className="text-[8.5px] font-black tracking-tight text-white uppercase leading-none mb-1 drop-shadow-xs">
                  VEG MODE
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextState = !isVegOnly;
                    setIsVegOnly(nextState);
                    localStorage.setItem("raydo_veg_mode_only", JSON.stringify(nextState));
                    window.dispatchEvent(new CustomEvent("vegModeChanged", { detail: { isVegOnly: nextState } }));
                  }}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center shadow-md border ${
                    isVegOnly ? "bg-emerald-500 border-emerald-300" : "bg-white/40 border-white/60"
                  }`}
                  title={isVegOnly ? "Pure Veg Mode Active" : "Toggle Pure Veg Mode"}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full shadow-xs transform transition-transform ${
                      isVegOnly ? "translate-x-4 bg-white" : "translate-x-0 bg-white"
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 4: Clean Full Hero Video Banner */}
      {isFood && (
        <div className="px-3 pt-3">
          <div
            className="relative w-full rounded-[24px] overflow-hidden shadow-xl border border-amber-400/30 cursor-pointer group bg-black"
            onClick={onSearchFocus}
          >
            <video
              autoPlay
              loop
              muted={isVideoMuted}
              playsInline
              preload="auto"
              poster={cinematicFoodPoster}
              className="w-full h-[190px] sm:h-[240px] md:h-[280px] object-cover transform group-hover:scale-105 transition-transform duration-700"
              src="/food/cute_video_hero_section_ke_liy.mp4"
            />
          </div>
        </div>
      )}
    </div>

    {/* Selected Address Distance Warning Banner */}
    {selectedAddressDistanceKm > 0.5 && isFood && (
      <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs font-semibold text-amber-900 relative z-[40]">
        <div className="flex items-center gap-2 max-w-7xl mx-auto">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span>
            Selected address is <span className="underline font-bold">{selectedAddressDistanceKm} km</span> away from your location
          </span>
        </div>
      </div>
    )}
  </>
);
}
