import React, { createContext, useContext, useState, useEffect } from 'react';

const AdminLanguageContext = createContext();

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', name: 'English' },
  { code: 'hi', label: 'हिंदी', flag: '🇮🇳', name: 'Hindi' },
  { code: 'hinglish', label: 'Hinglish', flag: '🗣️', name: 'Hinglish' },
];

export const TRANSLATIONS = {
  en: {
    // Top Navbar
    search: 'Search',
    search_placeholder: 'Search orders, users, products, reports...',
    ctrl_k: 'Ctrl+K',
    notifications: 'Notifications',
    clear_all: 'Clear All',
    view_all: 'View all',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout',
    select_language: 'Select Language',
    language: 'Language',
    
    // Sidebar & Menus
    dashboard: 'Dashboard',
    orders: 'Orders',
    all_orders: 'All Orders',
    pending_orders: 'Pending Orders',
    delivered_orders: 'Delivered Orders',
    restaurants: 'Restaurants',
    all_restaurants: 'All Restaurants',
    add_restaurant: 'Add Restaurant',
    food_items: 'Food Items',
    categories: 'Categories',
    delivery_partners: 'Delivery Partners',
    all_deliverymen: 'All Deliverymen',
    franchise_management: 'Franchise Management',
    franchise_applications: 'Franchise Applications',
    form_config: 'Form Config',
    commission_settings: 'Commission Settings',
    territory_analytics: 'Territory Analytics',
    reports: 'Reports',
    transactions: 'Transactions',
    customers: 'Customers',
    subadmins: 'Sub-Admins & Roles',
    banner_management: 'Banner Management',
    system_settings: 'System Settings',

    // Status Badges & Common UI
    total: 'Total',
    pending: 'Pending',
    under_review: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
    active: 'Active',
    inactive: 'Inactive',
    actions: 'Actions',
    save_changes: 'Save Changes',
    saving: 'Saving...',
    saved: 'Saved!',
    edit: 'Edit',
    delete: 'Delete',
    view: 'View',
    refresh: 'Refresh',
    filter: 'Filter',
    back: 'Back',
    cancel: 'Cancel',
    confirm: 'Confirm',

    // Franchise Specific
    applicant_name: 'Applicant Name',
    company_name: 'Company Name',
    contact: 'Contact Info',
    location: 'Location',
    applied_date: 'Applied Date',
    review_application: 'Review Application',
    admin_note: 'Admin Note',
    commission_rate: 'Franchise Commission Rate (%)',
    royalty_fee: 'Royalty Fee Rate (%)',
    payout_cycle: 'Payout Cycle',
    min_payout_threshold: 'Min Payout Threshold (₹)',
    bank_details: 'Bank Account & Payout Details',
    franchise_partner_hub: 'Franchise Partner Hub',
    territory_orders: 'Total Territory Orders',
    territory_gmv: 'Territory GMV (Sales)',
    earned_commission: 'Earned Commission Share',
    active_outlets: 'Active Outlets in Area',
  },

  hi: {
    // Top Navbar
    search: 'खोजें',
    search_placeholder: 'ऑर्डर, उपयोगकर्ता, उत्पाद, रिपोर्ट खोजें...',
    ctrl_k: 'Ctrl+K',
    notifications: 'सूचनाएं',
    clear_all: 'सभी साफ़ करें',
    view_all: 'सभी देखें',
    profile: 'प्रोफ़ाइल',
    settings: 'सेटिंग्स',
    logout: 'लॉगआउट',
    select_language: 'भाषा चुनें',
    language: 'भाषा',

    // Sidebar & Menus
    dashboard: 'डैशबोर्ड',
    orders: 'ऑर्डर्स',
    all_orders: 'सभी ऑर्डर्स',
    pending_orders: 'लंबित ऑर्डर्स',
    delivered_orders: 'डिलीवर किए गए ऑर्डर्स',
    restaurants: 'रेस्तरां',
    all_restaurants: 'सभी रेस्तरां',
    add_restaurant: 'रेस्तरां जोड़ें',
    food_items: 'खाद्य सामग्री (डिशेस)',
    categories: 'श्रेणियां (कैटेगरी)',
    delivery_partners: 'डिलीवरी पार्टनर्स',
    all_deliverymen: 'सभी डिलीवरी राइडर्स',
    franchise_management: 'फ़्रेंचाइज़ी प्रबंधन',
    franchise_applications: 'फ़्रेंचाइज़ी आवेदन',
    form_config: 'फ़ॉर्म कॉन्फ़िगरेशन',
    commission_settings: 'कमीशन सेटिंग्स',
    territory_analytics: 'क्षेत्रीय विश्लेषण',
    reports: 'रिपोर्ट्स',
    transactions: 'लेनदेन (ट्रांजेक्शन)',
    customers: 'ग्राहक (कस्टमर्स)',
    subadmins: 'सब-एडमिन और भूमिकाएं',
    banner_management: 'बैनर प्रबंधन',
    system_settings: 'सिस्टम सेटिंग्स',

    // Status Badges & Common UI
    total: 'कुल',
    pending: 'लंबित (पेंडिंग)',
    under_review: 'समीक्षाधीन (इन रिव्यू)',
    approved: 'स्वीकृत (अप्रूव्ड)',
    rejected: 'अस्वीकृत (रिजेक्टेड)',
    active: 'सक्रिय',
    inactive: 'निष्क्रिय',
    actions: 'कार्रवाई',
    save_changes: 'परिवर्तन सहेजें',
    saving: 'सहेजा जा रहा है...',
    saved: 'सहेजा गया!',
    edit: 'संपादित करें',
    delete: 'हटाएं',
    view: 'देखें',
    refresh: 'रीफ्रेश करें',
    filter: 'फ़िल्टर करें',
    back: 'वापस जाएं',
    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',

    // Franchise Specific
    applicant_name: 'आवेदक का नाम',
    company_name: 'कंपनी का नाम',
    contact: 'संपर्क जानकारी',
    location: 'स्थान / शहर',
    applied_date: 'आवेदन की तिथि',
    review_application: 'आवेदन की समीक्षा करें',
    admin_note: 'एडमिन टिप्पणी',
    commission_rate: 'फ़्रेंचाइज़ी कमीशन दर (%)',
    royalty_fee: 'रॉयल्टी शुल्क दर (%)',
    payout_cycle: 'पेआउट चक्र',
    min_payout_threshold: 'न्यूनतम पेआउट सीमा (₹)',
    bank_details: 'बैंक खाता और पेआउट विवरण',
    franchise_partner_hub: 'फ़्रेंचाइज़ी पार्टनर हब',
    territory_orders: 'कुल क्षेत्रीय ऑर्डर्स',
    territory_gmv: 'क्षेत्रीय कुल बिक्री (GMV)',
    earned_commission: 'अर्जित कमीशन हिस्सा',
    active_outlets: 'क्षेत्र में सक्रिय आउटलेट',
  },

  hinglish: {
    // Top Navbar
    search: 'Search Karein',
    search_placeholder: 'Orders, users, products, reports search karein...',
    ctrl_k: 'Ctrl+K',
    notifications: 'Notifications',
    clear_all: 'Sabhi Clear Karein',
    view_all: 'Sabhi Dekhein',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout Karein',
    select_language: 'Language Chunein',
    language: 'Language',

    // Sidebar & Menus
    dashboard: 'Dashboard',
    orders: 'Orders',
    all_orders: 'Sabhi Orders',
    pending_orders: 'Pending Orders',
    delivered_orders: 'Delivered Orders',
    restaurants: 'Restaurants',
    all_restaurants: 'Sabhi Restaurants',
    add_restaurant: 'Naya Restaurant Jodein',
    food_items: 'Food Dishes',
    categories: 'Categories',
    delivery_partners: 'Delivery Partners',
    all_deliverymen: 'Sabhi Riders',
    franchise_management: 'Franchise Management',
    franchise_applications: 'Franchise Applications',
    form_config: 'Form Setup',
    commission_settings: 'Commission Settings',
    territory_analytics: 'Territory Analytics',
    reports: 'Reports',
    transactions: 'Transactions',
    customers: 'Customers',
    subadmins: 'Sub-Admins & Roles',
    banner_management: 'Banner Management',
    system_settings: 'System Settings',

    // Status Badges & Common UI
    total: 'Total',
    pending: 'Pending',
    under_review: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
    active: 'Active',
    inactive: 'Inactive',
    actions: 'Actions',
    save_changes: 'Save Changes',
    saving: 'Save ho raha hai...',
    saved: 'Save ho gaya!',
    edit: 'Edit Karein',
    delete: 'Delete Karein',
    view: 'Dekhein',
    refresh: 'Refresh Karein',
    filter: 'Filter Karein',
    back: 'Wapas Jayein',
    cancel: 'Cancel Karein',
    confirm: 'Confirm Karein',

    // Franchise Specific
    applicant_name: 'Applicant Ka Naam',
    company_name: 'Company Ka Naam',
    contact: 'Contact Details',
    location: 'City & Location',
    applied_date: 'Apply Ki Date',
    review_application: 'Application Review Karein',
    admin_note: 'Admin Note',
    commission_rate: 'Franchise Commission Share (%)',
    royalty_fee: 'Royalty Fee Rate (%)',
    payout_cycle: 'Payout Cycle',
    min_payout_threshold: 'Minimum Payout Limit (₹)',
    bank_details: 'Bank Account & Payout Details',
    franchise_partner_hub: 'Franchise Partner Portal',
    territory_orders: 'Area Ke Total Orders',
    territory_gmv: 'Area Sales (GMV ₹)',
    earned_commission: 'Kamaya Hua Commission Share',
    active_outlets: 'Area Main Active Outlets',
  }
};

export function AdminLanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('admin_language') || 'en';
  });

  const changeLanguage = (code) => {
    setLang(code);
    localStorage.setItem('admin_language', code);
    window.dispatchEvent(new Event('adminLanguageChanged'));
  };

  const t = (key, fallback = '') => {
    const langDict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return langDict[key] || TRANSLATIONS.en[key] || fallback || key;
  };

  return (
    <AdminLanguageContext.Provider value={{ lang, setLang: changeLanguage, t, LANGUAGES }}>
      {children}
    </AdminLanguageContext.Provider>
  );
}

export function useAdminLanguage() {
  const context = useContext(AdminLanguageContext);
  if (!context) {
    // Fallback if rendered outside provider
    const lang = localStorage.getItem('admin_language') || 'en';
    const t = (key, fallback = '') => {
      const langDict = TRANSLATIONS[lang] || TRANSLATIONS.en;
      return langDict[key] || TRANSLATIONS.en[key] || fallback || key;
    };
    return { lang, setLang: () => {}, t, LANGUAGES };
  }
  return context;
}
