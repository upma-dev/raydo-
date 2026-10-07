import { useState, useEffect } from "react";
import api from "@food/api";

const STORAGE_KEY = "raydo_dynamic_landing_page_config";

export const DEFAULT_LANDING_CONFIG = {
  playStoreUrl: "#", // User can paste original Play Store link anytime
  disableLoginRoutes: true, // Hide all login routes as requested

  hero: {
    comboBadge: "⚡ FOOD + TAXI SUPER-APP",
    comboTitleMain: "Move & Order.",
    comboTitleSub: "One Super App.",
    comboSubtitle: "Taxi rides & instant food delivery connected through RAYDO.",

    taxiBadge: "🚕 TAXI & CITY RIDES",
    taxiTitleMain: "Move Fast.",
    taxiTitleSub: "City Taxi Rides.",
    taxiSubtitle: "Instant cabs, autos and bikes for comfortable daily city travel.",

    foodBadge: "🍔 FOOD DELIVERY",
    foodTitleMain: "From Craving",
    foodTitleSub: "to Doorstep.",
    foodSubtitle: "Hot restaurant meals and daily food essentials delivered fast across your city.",

    outstationBadge: "🚘 OUTSTATION CAB",
    outstationTitleMain: "Go Beyond",
    outstationTitleSub: "the City.",
    outstationSubtitle: "Comfortable highway cabs and outstation travel connecting destinations."
  },

  services: {
    heading: "Food & Mobility.",
    subheading: "One Connected Platform.",
    foodDeliveryTitle: "Food Delivery",
    foodDeliverySub: "Craving hot meals? From top kitchens to your doorstep in minutes.",
    cityRidesTitle: "City Taxi Rides",
    cityRidesSub: "Instant cabs, autos, and bikes for comfortable daily city travel.",
    outstationTitle: "Outstation Cabs",
    outstationSub: "Travel beyond the city with highway captains & premium cabs.",
    busTitle: "Raydo Bus",
    busSub: "Search, select seats, and book AC Sleeper & Volvo intercity buses.",
    partnerTitle: "Drive & Deliver Partner",
    partnerSub: "Turn your vehicle into daily income with zero high commissions.",
    franchiseTitle: "City Franchise Hub",
    franchiseSub: "Own and operate Raydo regional mobility & food hub in your city."
  },

  booking: {
    headingMain: "Order Food or",
    headingSub: "Book a Ride",
    estimatedFoodTime: "Average Food Delivery: 22 Mins",
    estimatedRideTime: "Estimated Ride Travel: 14 Mins",
    pricingGuarantee: "Fixed Transparent Pricing"
  },

  map: {
    badge: "REAL-TIME LOCATION DISPATCH MAP",
    headingMain: "Smart Dispatch Map",
    headingSub: "Indore & Regional Hubs",
    trafficBypassText: "Smart Traffic Bypass • Saves 8 min",
    foodRiderText: "Express Hot Delivery • Thermal Bag Dispatch",
    liveNetworkText: "Taxi: 14 Mins • Food: 22 Mins"
  },

  partners: {
    headingDriverMain: "Drive & Deliver with Raydo.",
    headingDriverSub: "Earn from rides & food orders on your own schedule.",
    headingFranchiseMain: "Own a City Franchise.",
    headingFranchiseSub: "Bring Raydo mobility & food to your city.",
    
    // Onboarding Steps
    driverStep1Title: "1. Download Partner App",
    driverStep1Desc: "Get the official RAYDO Partner App from Google Play Store.",
    driverStep2Title: "2. Quick Verification",
    driverStep2Desc: "Upload your DL, RC, Aadhaar & vehicle details in minutes.",
    driverStep3Title: "3. Start Accepting Rides & Orders",
    driverStep3Desc: "Receive instant taxi trip requests & food delivery orders with daily payouts.",

    franchiseStep1Title: "1. Apply for Territory",
    franchiseStep1Desc: "Select your district hub & complete regional partner application.",
    franchiseStep2Title: "2. Receive Tech & Operations",
    franchiseStep2Desc: "Get complete admin panel, partner dispatch apps & marketing kit.",
    franchiseStep3Title: "3. Launch & Earn Commission",
    franchiseStep3Desc: "Earn ongoing revenue share on every ride, outstation cab & food order in your city."
  },

  footer: {
    tagline: "RAYDO is India's connected living network bridging food delivery, city taxi rides, outstation highway travel, bus ticketing, and regional partner hubs.",
    statusText: "RAYDO Living Network • Real-Time Dispatch",
    copyright: "© 2026 RAYDO Mobility & Food Technologies. All rights reserved."
  }
};

export function getLandingConfig() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      return { ...DEFAULT_LANDING_CONFIG, ...JSON.parse(cached) };
    }
  } catch (e) {
    console.warn("Using default landing page configuration");
  }
  return DEFAULT_LANDING_CONFIG;
}

export function saveLandingConfig(newConfig) {
  try {
    const updated = { ...getLandingConfig(), ...newConfig };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("raydo_landing_config_updated"));
    return updated;
  } catch (e) {
    console.error("Failed to save landing page configuration", e);
    return null;
  }
}

export function useRaydoLandingData() {
  const [config, setConfig] = useState(getLandingConfig());

  useEffect(() => {
    const fetchApiConfig = async () => {
      try {
        const response = await api.get("/food/hero-banners/landing-config");
        if (response.data && response.data.success && response.data.data) {
          saveLandingConfig(response.data.data);
        }
      } catch (err) {
        // Fallback gracefully to default/localStorage config
      }
    };

    fetchApiConfig();

    const handleUpdate = () => {
      setConfig(getLandingConfig());
    };

    window.addEventListener("raydo_landing_config_updated", handleUpdate);
    return () => window.removeEventListener("raydo_landing_config_updated", handleUpdate);
  }, []);

  return config;
}
