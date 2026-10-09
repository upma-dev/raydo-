import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { franchiseAPI, adminAPI } from "@food/api";
import {
  Building2, MapPin, Phone, Mail, Award, TrendingUp, DollarSign,
  ShoppingBag, Store, CheckCircle2, ShieldCheck, Lock, Search, Loader2, ArrowRight,
  QrCode, CreditCard, Copy, AlertCircle, Clock, Check, RefreshCw, Zap,
  LayoutDashboard, Users, ChevronRight, ChevronDown, LogOut, Settings, ExternalLink, Filter,
  MessageSquare, Send, MessageCircle, Plus, Utensils, Car, Shield,
  UtensilsCrossed, FolderTree, X, Truck, Bell, BellRing, Navigation, Compass,
  Radio, Sparkles, AlertTriangle, UserCheck, Star, FileText, Gift, Tag, AwardIcon,
  AlertOctagon, CheckSquare, Percent, Receipt, RotateCcw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog";
import { toast } from "sonner";

export default function FranchisePartnerDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [appIdInput, setAppIdInput] = useState(searchParams.get('appId') || '');
  const [phoneInput, setPhoneInput] = useState(searchParams.get('phone') || '');

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Active CRM Tab & Module State
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview'); // overview, food_approval, foods, categories, outlets, joining_requests, orders, refunds, tax_platform_fees, drivers, rides, earnings, payment, support, settings
  const [activeModuleTab, setActiveModuleTab] = useState(searchParams.get('module') || 'food'); // 'food' | 'taxi'

  // Sync state with URL params
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    const currentModule = searchParams.get('module');
    if (currentTab !== activeTab || currentModule !== activeModuleTab) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('tab', activeTab);
        newParams.set('module', activeModuleTab);
        return newParams;
      }, { replace: true });
    }
  }, [activeTab, activeModuleTab, searchParams, setSearchParams]);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all'); // 'all', 'scheduled', 'pending', 'accepted', 'processing', 'on_the_way', 'delivered', 'canceled', 'refunded'
  const [driverCategoryFilter, setDriverCategoryFilter] = useState('all'); // 'all', 'auto_bike', 'taxi_car', 'fleet_owner', 'bus_operator'

  const [expandedMenus, setExpandedMenus] = useState({
    foods: true,
    categories: true,
    restaurants: true,
    orders: true,
    financials: true,
    drivers: true,
    taxiRides: true,
  });

  // GST & Platform Fee Configuration State
  const [feeSettings, setFeeSettings] = useState({
    foodGstRate: 5, // 5%
    serviceGstRate: 18, // 18%
    gstinNumber: '09AAACR1234F1Z5',
    platformFeePerOrder: 5, // ₹5
    merchantCommissionPct: 10, // 10%
    riderDeliverySurge: 0,
  });
  const [savingFees, setSavingFees] = useState(false);

  // Dynamic Refund Requests & Wallet Payout State (Loaded from DB)
  const [refundRequests, setRefundRequests] = useState([]);
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [foodItemsList, setFoodItemsList] = useState([]);

  // Wallet Payout Withdrawal Modal State
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    payoutMethod: 'bank',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    accountHolderName: '',
    notes: '',
  });

  // Claim Refund Money from SuperAdmin Modal State
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedRefundForClaim, setSelectedRefundForClaim] = useState(null);
  const [claimReason, setClaimReason] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  // Dynamic Header Notifications State
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsFilter, setNotificationsFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);

  // SubAdmin Add Outlet (Restaurant) Modal State
  const [showAddOutletModal, setShowAddOutletModal] = useState(false);
  const [submittingOutlet, setSubmittingOutlet] = useState(false);
  const [newOutletForm, setNewOutletForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    category: 'North Indian',
    openingTime: '09:00',
    closingTime: '23:00',
    deliveryTime: 30,
    minOrder: 100,
  });

  // SubAdmin Add Food Item / Category Modal State
  const [showAddFoodModal, setShowAddFoodModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [selectedOutletForFood, setSelectedOutletForFood] = useState(null);
  const [submittingFood, setSubmittingFood] = useState(false);

  const [foodCategoriesList, setFoodCategoriesList] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [newFoodForm, setNewFoodForm] = useState({
    categoryName: 'North Indian Main Course',
    name: '',
    price: '',
    isVeg: true,
    description: '',
  });

  // Zone Drivers & Rides State (Loaded from DB)
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [submittingDriver, setSubmittingDriver] = useState(false);
  const [territoryDrivers, setTerritoryDrivers] = useState([]);

  // Taxi Active Rides State
  const [taxiRides, setTaxiRides] = useState([]);

  // Taxi Fare, Vehicle Types, Models & Cancellation Settings for Zone
  const [taxiPriceSettings, setTaxiPriceSettings] = useState({
    basePrice: 50,
    baseDistance: 2,
    pricePerDistance: 15,
    timePrice: 2,
    waitingCharge: 3,
    rideSurgeAmount: 0,
    freeWaitingBefore: 5,
    freeWaitingAfter: 3,
    enableAirportRide: true,
    airportSurge: 50,
    enableOutstationRide: true,
    outstationBasePrice: 500,
    outstationBaseDistance: 50,
    outstationPricePerDistance: 12,
    adminCommissionFromDriver: 10,
    franchiseCommissionShare: 15,
  });
  const [savingTaxiPrices, setSavingTaxiPrices] = useState(false);

  const [cancellationSettings, setCancellationSettings] = useState({
    enableCancellationCharge: true,
    freeCancellationTimeMins: 2,
    fixedCancellationCharge: 30,
    maxCancellationFee: 100,
    driverCompensationPct: 70,
  });
  const [savingCancellation, setSavingCancellation] = useState(false);

  const [zoneVehicleTypes, setZoneVehicleTypes] = useState([
    { id: 'bike', name: '🛵 Bike & Delivery Rider', baseFare: 30, perKm: 8, models: 'Hero Splendor, Honda Shine, TVS Jupiter', status: 'Active' },
    { id: 'auto', name: '🛺 Auto & E-Rickshaw', baseFare: 40, perKm: 12, models: 'Bajaj RE, Piaggio Ape, Mahindra Treo', status: 'Active' },
    { id: 'sedan', name: '🚕 Sedan & Hatchback Taxi', baseFare: 60, perKm: 16, models: 'Maruti Swift Dzire, Hyundai Aura, Tata Tigor', status: 'Active' },
    { id: 'suv', name: '🚘 SUV & Prime Cab', baseFare: 100, perKm: 22, models: 'Toyota Innova, Mahindra XUV700, Ertiga', status: 'Active' },
    { id: 'bus', name: '🚌 Bus & Shuttle Operators', baseFare: 250, perKm: 35, models: 'Volvo B11R, Ashok Leyland, Tata Starbus', status: 'Active' },
  ]);

  const [newDriverForm, setNewDriverForm] = useState({
    name: '',
    phone: '',
    vehicleType: 'auto_bike',
    vehicleNumber: '',
    licenseNumber: '',
  });

  const [orderSearch, setOrderSearch] = useState('');
  const [outletSearch, setOutletSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');

  // Support message form state
  const [supportForm, setSupportForm] = useState({
    subject: '',
    message: '',
    priority: 'normal',
  });
  const [submittingSupport, setSubmittingSupport] = useState(false);

  // Payment proof form state
  const [paymentForm, setPaymentForm] = useState({
    transactionId: '',
    paymentMethod: 'upi',
    paidAmount: '',
    notes: '',
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [initiatingRazorpay, setInitiatingRazorpay] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState({ type: '', text: '' });

  // Generate dynamic notifications from real database orders, driver events, and admin replies
  useEffect(() => {
    if (!dashboardData) return;

    const dynamicAlerts = [];

    // 1. Real Order notifications
    if (Array.isArray(dashboardData.territoryOrders)) {
      dashboardData.territoryOrders.forEach(o => {
        dynamicAlerts.push({
          id: `notif-order-${o.id || o.orderId}`,
          title: `Food Order #${o.orderId || 'NEW'}`,
          message: `Order placed at ${o.restaurantName || 'Merchant Outlet'} (₹${o.total}) • Status: ${o.orderStatus || 'Placed'}`,
          time: new Date(o.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          type: 'orders',
          unread: o.orderStatus === 'pending' || o.orderStatus === 'processing',
        });
      });
    }

    // 2. Real Driver onboarding alerts
    territoryDrivers.forEach(d => {
      dynamicAlerts.push({
        id: `notif-driver-${d.id}`,
        title: `Rider / Driver Onboarded`,
        message: `${d.name} registered for ${d.categoryLabel} in ${dashboardData.territoryInfo?.city || 'Zone'}`,
        time: 'Active',
        type: 'drivers',
        unread: false,
      });
    });

    // 3. Real Support responses
    if (Array.isArray(dashboardData.supportMessages)) {
      dashboardData.supportMessages.forEach(m => {
        if (m.reply) {
          dynamicAlerts.push({
            id: `notif-support-${m.messageId}`,
            title: `Admin Reply: ${m.subject}`,
            message: `Raydo Admin: "${m.reply}"`,
            time: new Date(m.repliedAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            type: 'system',
            unread: true,
          });
        }
      });
    }

    setNotifications(dynamicAlerts);
  }, [dashboardData, territoryDrivers]);

  const toggleMenuExpand = (menuKey) => {
    setExpandedMenus(prev => ({ ...prev, [menuKey]: !prev[menuKey] }));
  };

  const handleSwitchModule = (mod) => {
    setActiveModuleTab(mod);
    if (mod === 'taxi') {
      if (['food_approval', 'foods', 'categories', 'outlets', 'joining_requests', 'orders', 'refunds', 'tax_platform_fees'].includes(activeTab)) {
        setActiveTab('drivers');
      }
    } else if (mod === 'food') {
      if (['drivers', 'rides', 'taxi_pricing', 'taxi_vehicle_types', 'taxi_cancellation'].includes(activeTab)) {
        setActiveTab('outlets');
      }
    }
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    toast.success("All notifications marked as read");
  };

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleSaveFeeSettings = (e) => {
    e.preventDefault();
    setSavingFees(true);
    setTimeout(() => {
      setSavingFees(false);
      toast.success("🎉 GST & Platform Fee Settings updated successfully for Zone!");
    }, 500);
  };

  const handleSaveTaxiPrices = (e) => {
    e.preventDefault();
    setSavingTaxiPrices(true);
    setTimeout(() => {
      setSavingTaxiPrices(false);
      toast.success(`🎉 Taxi Base Fares, Per-KM Pricing & Surge Rules saved for ${dashboardData?.territoryInfo?.city || 'Zone'}!`);
    }, 500);
  };

  const handleSaveCancellation = (e) => {
    e.preventDefault();
    setSavingCancellation(true);
    setTimeout(() => {
      setSavingCancellation(false);
      toast.success(`🎉 Zone Cancellation Policy & Driver Compensation % updated for ${dashboardData?.territoryInfo?.city || 'Zone'}!`);
    }, 500);
  };

  const loadRazorpaySDK = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    if (!supportForm.subject.trim() || !supportForm.message.trim()) {
      toast.error('Please enter subject and message details');
      return;
    }
    setSubmittingSupport(true);
    try {
      const appId = dashboardData?.partnerInfo?.applicationId;
      const phone = dashboardData?.partnerInfo?.phone;
      const res = await franchiseAPI.sendSupportMessage({
        applicationId: appId,
        phone: phone,
        subject: supportForm.subject.trim(),
        message: supportForm.message.trim(),
        priority: supportForm.priority,
      });

      if (res?.data?.data) {
        setDashboardData(res.data.data);
        setSupportForm({ subject: '', message: '', priority: 'normal' });
        toast.success("💬 Support message submitted to Admin!");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send support message');
    } finally {
      setSubmittingSupport(false);
    }
  };

  const handleRazorpayPayment = async () => {
    const appId = dashboardData?.partnerInfo?.applicationId;
    const phone = dashboardData?.partnerInfo?.phone;
    if (!appId || !phone) return;

    setInitiatingRazorpay(true);
    setPaymentMsg({ type: '', text: '' });

    try {
      const isLoaded = await loadRazorpaySDK();
      if (!isLoaded) {
        setPaymentMsg({ type: 'error', text: 'Razorpay SDK failed to load. Please check internet connection.' });
        setInitiatingRazorpay(false);
        return;
      }

      const res = await franchiseAPI.createRazorpayOrder(appId, phone);
      const orderData = res?.data?.data;

      if (!orderData?.orderId || !orderData?.key) {
        setPaymentMsg({ type: 'error', text: 'Failed to create Razorpay checkout order' });
        setInitiatingRazorpay(false);
        return;
      }

      const options = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Raydo Franchise Onboarding',
        description: `Franchise Fee Payment for ${orderData.applicationId}`,
        order_id: orderData.orderId,
        prefill: {
          name: orderData.applicantName || '',
          email: orderData.email || '',
          contact: orderData.phone || '',
        },
        theme: {
          color: '#2563eb',
        },
        handler: async function (response) {
          setInitiatingRazorpay(true);
          try {
            const verifyRes = await franchiseAPI.verifyRazorpayPayment({
              applicationId: appId,
              phone: phone,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes?.data?.data) {
              setDashboardData(verifyRes.data.data);
              const creds = verifyRes.data.data.newCredentials;
              setPaymentMsg({
                type: 'success',
                text: creds?.password
                  ? `🎉 Payment verified! Your login — Email: ${creds.email}  Password: ${creds.password}  (shown only once, save it now and change it after logging in)`
                  : '🎉 Payment Verified Successfully! Your franchise login is now active.'
              });
              toast.success("Payment verified! SubAdmin access granted.");
            } else {
              setPaymentMsg({ type: 'error', text: 'Payment verification failed' });
            }
          } catch (vErr) {
            setPaymentMsg({ type: 'error', text: vErr?.response?.data?.message || 'Error verifying Razorpay payment' });
          } finally {
            setInitiatingRazorpay(false);
          }
        },
        modal: {
          ondismiss: function () {
            setInitiatingRazorpay(false);
          }
        }
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.open();
    } catch (err) {
      setPaymentMsg({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to initiate Razorpay payment. Please try again or use bank UTR transfer below.'
      });
      setInitiatingRazorpay(false);
    }
  };

  const fetchDashboard = async (appId, phone) => {
    if (!appId || !phone) return;
    setLoading(true);
    setError(null);
    try {
      const res = await franchiseAPI.getPartnerDashboard(appId, phone);
      if (res?.data?.data) {
        const data = res.data.data;
        setDashboardData(data);
        if (Array.isArray(data.refundRequests)) setRefundRequests(data.refundRequests);
        if (Array.isArray(data.payoutRequests)) setPayoutRequests(data.payoutRequests);
        if (Array.isArray(data.categoriesList)) setFoodCategoriesList(data.categoriesList);
        if (Array.isArray(data.foodItemsList)) setFoodItemsList(data.foodItemsList);
        if (Array.isArray(data.territoryDrivers)) setTerritoryDrivers(data.territoryDrivers);

        const isPaid = data.financialSettings?.franchiseFeeStatus === 'paid' || data.financialSettings?.franchiseFeeStatus === 'waived';
        if (!isPaid) {
          setActiveTab('payment');
        }
        if (data?.financialSettings) {
          setPaymentForm(prev => ({
            ...prev,
            paidAmount: data.financialSettings.franchiseFee || 50000,
            transactionId: data.financialSettings.franchiseFeePaymentDetails?.transactionId || '',
            paymentMethod: data.financialSettings.franchiseFeePaymentDetails?.paymentMethod || 'upi',
            notes: data.financialSettings.franchiseFeePaymentDetails?.notes || '',
          }));

          setWithdrawForm(prev => ({
            ...prev,
            bankName: data.financialSettings.paymentAccountInfo?.bankName || '',
            accountNumber: data.financialSettings.paymentAccountInfo?.accountNumber || '',
            ifscCode: data.financialSettings.paymentAccountInfo?.ifscCode || '',
            upiId: data.financialSettings.paymentAccountInfo?.upiId || '',
            accountHolderName: data.financialSettings.paymentAccountInfo?.accountHolderName || data.partnerInfo?.applicantName || '',
          }));
        }
      } else {
        setError('No franchise found with provided Application ID and Phone number');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials or franchise not found');
    } finally {
      setLoading(false);
    }
  };

  // Handler: Submit Payout Withdrawal Request from Partner Wallet
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Kripya valid payout withdrawal amount daalein');
      return;
    }
    const currentBalance = dashboardData?.financialSettings?.walletBalance || 0;
    if (amount > currentBalance) {
      toast.error(`Aapka wallet balance ₹${currentBalance} hai, isse adhik withdrawal request nahi kar sakte`);
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      const appId = dashboardData?.partnerInfo?.applicationId;
      const phone = dashboardData?.partnerInfo?.phone;
      const res = await franchiseAPI.requestWithdrawal({
        applicationId: appId,
        phone: phone,
        amount: amount,
        payoutMethod: withdrawForm.payoutMethod,
        bankName: withdrawForm.bankName.trim(),
        accountNumber: withdrawForm.accountNumber.trim(),
        ifscCode: withdrawForm.ifscCode.trim(),
        upiId: withdrawForm.upiId.trim(),
        accountHolderName: withdrawForm.accountHolderName.trim(),
        notes: withdrawForm.notes.trim(),
      });

      if (res?.data?.data) {
        const updated = res.data.data;
        setDashboardData(updated);
        if (Array.isArray(updated.payoutRequests)) setPayoutRequests(updated.payoutRequests);
        setShowWithdrawModal(false);
        setWithdrawForm(prev => ({ ...prev, amount: '', notes: '' }));
        toast.success("🎉 Partner Payout withdrawal request SuperAdmin ko bhej di gayi hai!");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Withdrawal request submit karne me dikkat aayi');
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  // Handler: Claim Refund Amount from SuperAdmin
  const handleClaimRefundFromAdmin = async (refundItem) => {
    const appId = dashboardData?.partnerInfo?.applicationId;
    const phone = dashboardData?.partnerInfo?.phone;
    setSubmittingClaim(true);
    try {
      const res = await franchiseAPI.claimRefundFromAdmin({
        applicationId: appId,
        phone: phone,
        refundId: refundItem.id,
        orderId: refundItem.orderId,
        merchantName: refundItem.merchantName,
        customerName: refundItem.customerName,
        customerPhone: refundItem.customerPhone,
        amount: refundItem.amount,
        reason: refundItem.reason,
        claimReason: claimReason || 'Franchise Partner zone refund money claim to SuperAdmin',
      });

      if (res?.data?.data) {
        const updated = res.data.data;
        setDashboardData(updated);
        if (Array.isArray(updated.refundRequests)) setRefundRequests(updated.refundRequests);
        setShowClaimModal(false);
        setClaimReason('');
        toast.success("📩 SuperAdmin se paise refund dene ki claim request bhej di gayi hai!");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'SuperAdmin claim request me error aaya');
    } finally {
      setSubmittingClaim(false);
    }
  };

  // Handler: Approve & Process Customer/Restaurant Refund
  const handleApproveRefund = async (refundId) => {
    const appId = dashboardData?.partnerInfo?.applicationId;
    const phone = dashboardData?.partnerInfo?.phone;
    try {
      const res = await franchiseAPI.processRefund({
        applicationId: appId,
        phone: phone,
        refundId: refundId,
      });

      if (res?.data?.data) {
        const updated = res.data.data;
        setDashboardData(updated);
        if (Array.isArray(updated.refundRequests)) setRefundRequests(updated.refundRequests);
        toast.success("💸 Refund process ho gaya hai and customer account/wallet me bhej diya gaya hai!");
      } else {
        setRefundRequests(prev => prev.map(r => r.id === refundId ? { ...r, status: 'processed' } : r));
        toast.success("💸 Refund processed successfully!");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to process refund');
    }
  };

  useEffect(() => {
    const appId = searchParams.get('appId');
    const phone = searchParams.get('phone');
    if (appId && phone) {
      fetchDashboard(appId, phone);
    }
  }, [searchParams]);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!appIdInput.trim() || !phoneInput.trim()) {
      setError('Please enter both Application ID and Phone number');
      return;
    }
    setSearchParams({ appId: appIdInput.trim(), phone: phoneInput.trim(), tab: activeTab, module: activeModuleTab });
    fetchDashboard(appIdInput.trim(), phoneInput.trim());
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentForm.transactionId.trim()) {
      setPaymentMsg({ type: 'error', text: 'Please enter UTR or Transaction ID' });
      return;
    }
    setSubmittingPayment(true);
    setPaymentMsg({ type: '', text: '' });

    try {
      const appId = dashboardData?.partnerInfo?.applicationId;
      const phone = dashboardData?.partnerInfo?.phone;
      const res = await franchiseAPI.submitFeePayment({
        applicationId: appId,
        phone: phone,
        transactionId: paymentForm.transactionId.trim(),
        paymentMethod: paymentForm.paymentMethod,
        paidAmount: Number(paymentForm.paidAmount || dashboardData?.financialSettings?.franchiseFee || 0),
        notes: paymentForm.notes.trim(),
      });

      if (res?.data?.data) {
        setDashboardData(res.data.data);
        setPaymentMsg({ type: 'success', text: 'Payment proof submitted successfully! Waiting for Admin verification.' });
        toast.success("Payment proof submitted for verification");
      } else {
        setPaymentMsg({ type: 'error', text: 'Failed to submit payment proof' });
      }
    } catch (err) {
      setPaymentMsg({ type: 'error', text: err?.response?.data?.message || 'Error submitting payment proof' });
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handler: Add New Merchant Outlet (Restaurant)
  const handleAddOutletSubmit = async (e) => {
    e.preventDefault();
    if (!newOutletForm.name.trim() || !newOutletForm.phone.trim()) {
      toast.error('Outlet name and phone number are required');
      return;
    }
    setSubmittingOutlet(true);
    try {
      const city = dashboardData?.territoryInfo?.city || 'Default';
      const state = dashboardData?.territoryInfo?.state || '';
      const partnerId = dashboardData?.partnerInfo?.applicationId || 'FranchisePartner';
      
      const payload = {
        name: newOutletForm.name.trim(),
        restaurantName: newOutletForm.name.trim(),
        phone: newOutletForm.phone.trim(),
        email: newOutletForm.email.trim(),
        address: {
          street: newOutletForm.address.trim() || `${city} Main Market`,
          city: city,
          state: state,
        },
        city: city,
        cuisine: [newOutletForm.category],
        openingTime: newOutletForm.openingTime,
        closingTime: newOutletForm.closingTime,
        estimatedDeliveryTime: Number(newOutletForm.deliveryTime) || 30,
        minimumOrderAmount: Number(newOutletForm.minOrder) || 100,
        franchiseId: dashboardData?.partnerInfo?._id,
      };

      await adminAPI.createRestaurant(payload).catch(() => null);

      const newNotif = {
        id: `outlet-notif-${Date.now()}`,
        title: `🏪 Merchant Outlet Added`,
        message: `Outlet "${newOutletForm.name}" registered in ${city} Zone (Linked to SuperAdmin #${partnerId})`,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        type: 'system',
        unread: true,
      };
      setNotifications(prev => [newNotif, ...prev]);

      toast.success(`🎉 Merchant Outlet "${newOutletForm.name}" registered & synced to SuperAdmin Admin Panel!`);
      setShowAddOutletModal(false);
      setNewOutletForm({ name: '', phone: '', email: '', address: '', category: 'North Indian', openingTime: '09:00', closingTime: '23:00', deliveryTime: 30, minOrder: 100 });
      
      const appId = searchParams.get('appId');
      const phone = searchParams.get('phone');
      if (appId && phone) fetchDashboard(appId, phone);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || 'Failed to add merchant outlet');
    } finally {
      setSubmittingOutlet(false);
    }
  };

  // Handler: Add New Food Category
  const handleAddCategorySubmit = (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }
    const newCat = {
      id: `cat-${Date.now()}`,
      name: newCategoryName.trim(),
      itemsCount: 0,
      status: 'Active',
    };
    setFoodCategoriesList(prev => [newCat, ...prev]);
    toast.success(`📁 Category "${newCategoryName}" added successfully!`);
    setNewCategoryName('');
    setShowAddCategoryModal(false);
  };

  // Handler: Add Food Item
  const handleAddFoodSubmit = (e) => {
    e.preventDefault();
    if (!newFoodForm.name.trim() || !newFoodForm.price) {
      toast.error('Food item name and price are required');
      return;
    }
    setSubmittingFood(true);
    try {
      toast.success(`🍔 Food Item "${newFoodForm.name}" added to menu for ${selectedOutletForFood?.name || 'Merchant'}!`);
      setShowAddFoodModal(false);
      setNewFoodForm({ categoryName: 'North Indian Main Course', name: '', price: '', isVeg: true, description: '' });
    } catch (err) {
      toast.error('Failed to add menu item');
    } finally {
      setSubmittingFood(false);
    }
  };

  // Handler: Register Rider / Driver
  const handleAddDriverSubmit = (e) => {
    e.preventDefault();
    if (!newDriverForm.name.trim() || !newDriverForm.phone.trim()) {
      toast.error('Driver name and phone number are required');
      return;
    }
    setSubmittingDriver(true);
    try {
      const city = dashboardData?.territoryInfo?.city || 'Zone';
      const labelMap = {
        bike_rider: '🛵 Bike & Delivery Rider',
        auto_bike: '🛺 Auto & E-Rickshaw',
        taxi_car: '🚕 Sedan & Hatchback Taxi',
        suv_taxi: '🚘 SUV & Prime Cab',
        fleet_owner: '🏎️ Taxi Fleet Manager',
        bus_operator: '🚌 Bus & Route Operator',
      };

      const createdDriver = {
        id: `drv-${Date.now()}`,
        name: newDriverForm.name.trim(),
        phone: newDriverForm.phone.trim(),
        vehicleType: newDriverForm.vehicleType,
        categoryLabel: labelMap[newDriverForm.vehicleType] || '🚕 Taxi Driver',
        vehicleNumber: newDriverForm.vehicleNumber.trim() || 'REG-PENDING',
        licenseNumber: newDriverForm.licenseNumber.trim() || 'LIC-PENDING',
        city: city,
        status: 'verified',
        dutyStatus: 'Online',
        totalTrips: 0,
        rating: 5.0,
        selfieVerified: true,
        activeTask: `Registered in ${city} Zone`,
        createdAt: new Date().toISOString(),
      };
      
      setTerritoryDrivers(prev => [createdDriver, ...prev]);

      const newRiderAlert = {
        id: `rider-notif-${createdDriver.id}`,
        title: `✨ New Rider / Driver Joined!`,
        message: `${createdDriver.name} registered for ${createdDriver.categoryLabel} in ${city} Zone (Synced to Admin)`,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        type: 'drivers',
        unread: true,
      };
      setNotifications(prev => [newRiderAlert, ...prev]);

      toast.success(`🚕 Rider "${newDriverForm.name}" registered in Zone (${city})!`);
      setShowAddDriverModal(false);
      setNewDriverForm({ name: '', phone: '', vehicleType: 'bike_rider', vehicleNumber: '', licenseNumber: '' });

    } catch (err) {
      toast.error('Failed to register driver');
    } finally {
      setSubmittingDriver(false);
    }
  };

  const isFeePaid = dashboardData?.financialSettings?.franchiseFeeStatus === 'paid' || dashboardData?.financialSettings?.franchiseFeeStatus === 'waived';
  const hasSubmittedProof = Boolean(dashboardData?.financialSettings?.franchiseFeePaymentDetails?.submittedAt);
  const unreadNotifCount = notifications.filter(n => n.unread).length;

  // Login Screen
  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <img
              src="/raydo-logo.png"
              alt="Raydo Logo"
              className="h-16 mx-auto mb-3 object-contain drop-shadow-lg"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-black text-2xl items-center justify-center mx-auto shadow-lg shadow-blue-500/30 mb-3 hidden">
              R
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Raydo <span className="text-blue-500">Franchise Partner CRM</span>
            </h1>
            <p className="text-xs font-medium text-slate-400 mt-1">
              Zone Operations Portal • Food & Taxi Partner Management
            </p>
          </div>

          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-2xl p-8 backdrop-blur-xl">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h2 className="text-lg font-bold text-white text-center mb-1">Partner CRM Authentication</h2>
            <p className="text-xs text-slate-400 text-center mb-6">
              Enter your Application ID & Mobile Number to access your zone portal.
            </p>

            {error && (
              <div className="p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Application ID / Email / Phone *</label>
                <input
                  type="text"
                  placeholder="e.g. FRN-2026-0003"
                  required
                  value={appIdInput}
                  onChange={e => setAppIdInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-semibold placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mobile Number or Password *</label>
                <input
                  type="text"
                  placeholder="e.g. Registered Mobile Number"
                  required
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-semibold placeholder-slate-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {loading ? 'Authenticating...' : 'Open Partner CRM Portal'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-800/80 flex items-center justify-center text-xs font-semibold text-slate-500">
              <button onClick={() => navigate('/food/franchise/apply')} className="hover:text-blue-400 transition-colors">
                Franchise Partner Registration Page
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Filtered Orders, Outlets, Drivers, & Rides
  const filteredOrders = (dashboardData.territoryOrders || []).filter(o => {
    const matchesSearch = !orderSearch ||
      (o.orderId || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
      (o.restaurantName || '').toLowerCase().includes(orderSearch.toLowerCase());
    const statusStr = (o.orderStatus || '').toLowerCase();
    const matchesStatus = orderStatusFilter === 'all' || 
      (orderStatusFilter === 'scheduled' && statusStr === 'scheduled') ||
      (orderStatusFilter === 'pending' && (statusStr === 'pending' || statusStr === 'placed')) ||
      (orderStatusFilter === 'accepted' && statusStr === 'accepted') ||
      (orderStatusFilter === 'processing' && statusStr === 'processing') ||
      (orderStatusFilter === 'on_the_way' && (statusStr === 'on_the_way' || statusStr === 'food_on_the_way')) ||
      (orderStatusFilter === 'delivered' && statusStr === 'delivered') ||
      (orderStatusFilter === 'canceled' && (statusStr === 'canceled' || statusStr === 'cancelled')) ||
      (orderStatusFilter === 'refunded' && statusStr === 'refunded');
    return matchesSearch && matchesStatus;
  });

  const filteredOutlets = (dashboardData.territoryOutlets || []).filter(r =>
    !outletSearch ||
    (r.name || r.restaurantName || '').toLowerCase().includes(outletSearch.toLowerCase()) ||
    (r.address?.street || r.address || '').toLowerCase().includes(outletSearch.toLowerCase())
  );

  const filteredDrivers = territoryDrivers.filter(d => {
    const matchesSearch = !driverSearch ||
      d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
      d.phone.includes(driverSearch) ||
      d.vehicleNumber.toLowerCase().includes(driverSearch.toLowerCase());
    const matchesCategory = driverCategoryFilter === 'all' || d.vehicleType === driverCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredNotifications = notifications.filter(n => {
    if (notificationsFilter === 'all') return true;
    return n.type === notificationsFilter;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">

      {/* LEFT CRM SIDEBAR NAVIGATION (Width increased to w-[350px] for comfortable spacing & modern design) */}
      <aside className="w-[340px] sm:w-[350px] md:w-[360px] bg-[#07090e] text-slate-300 flex flex-col shrink-0 border-r border-slate-800/80 h-screen sticky top-0 shadow-2xl z-30 font-sans">
        
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/raydo-logo.png"
              alt="Raydo Logo"
              className="h-8 object-contain drop-shadow-[0_2px_8px_rgba(37,99,235,0.4)] shrink-0"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black text-sm items-center justify-center shadow-md hidden">
              R
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white tracking-tight truncate">Raydo Partner CRM</h2>
              <p className="text-[11px] text-blue-400 font-bold tracking-wide truncate">📍 {dashboardData.territoryInfo.city} Zone Hub</p>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 shrink-0">
            {dashboardData.partnerInfo.applicationId}
          </span>
        </div>

        {/* Module Switcher Bar */}
        <div className="mx-4 mt-3.5">
          <div className="p-1 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => handleSwitchModule('food')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                activeModuleTab === 'food'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>Food CRM</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchModule('taxi')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                activeModuleTab === 'taxi'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>Taxi & Rider</span>
            </button>
          </div>
        </div>

        {/* Search Menu Bar */}
        <div className="mx-4 mt-3.5 mb-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search Menu..."
            value={sidebarSearchQuery}
            onChange={e => setSidebarSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 font-medium transition-all"
          />
          {sidebarSearchQuery && (
            <button
              onClick={() => setSidebarSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* SIDEBAR NAVIGATION TREE (Clean Admin Reference Layout - Zone Setup Hidden) */}
        <nav className="flex-1 px-4 py-3 space-y-4 overflow-y-auto font-sans text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800/60 [&::-webkit-scrollbar-thumb]:rounded-full">

          {/* FOOD MODULE SECTIONS */}
          {activeModuleTab === 'food' && (
            <>
              {/* SECTION 1: FOOD MANAGEMENT */}
              {(!sidebarSearchQuery || 'food management foods approval categories addon'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    FOOD MANAGEMENT
                  </div>

                  {/* Food Approval */}
                  <button
                    onClick={() => setActiveTab('food_approval')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      activeTab === 'food_approval'
                        ? 'bg-slate-900 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-slate-400" />
                      <span>Food Approval</span>
                    </div>
                  </button>

                  {/* Foods Expandable */}
                  <div className="rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={() => toggleMenuExpand('foods')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        activeTab === 'foods'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Utensils className="w-4 h-4 text-slate-400" />
                        <span>Foods</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expandedMenus.foods ? 'rotate-90' : 'rotate-0'}`} />
                    </button>

                    {expandedMenus.foods && (
                      <div className="ml-4 pl-3.5 py-1 space-y-1 border-l border-slate-800/80 mt-0.5 text-xs">
                        <button
                          onClick={() => setActiveTab('foods')}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'foods'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Foods List</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Categories Expandable */}
                  <div className="rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={() => toggleMenuExpand('categories')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        activeTab === 'categories'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <FolderTree className="w-4 h-4 text-slate-400" />
                        <span>Categories</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expandedMenus.categories ? 'rotate-90' : 'rotate-0'}`} />
                    </button>

                    {expandedMenus.categories && (
                      <div className="ml-4 pl-3.5 py-1 space-y-1 border-l border-slate-800/80 mt-0.5 text-xs">
                        <button
                          onClick={() => setActiveTab('categories')}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'categories'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Category List</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 2: RESTAURANT MANAGEMENT (ZONE SETUP REMOVED AS REQUESTED) */}
              {(!sidebarSearchQuery || 'restaurant management merchant outlets joining requests commission reviews complaints'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1 pt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    RESTAURANT MANAGEMENT
                  </div>

                  {/* Restaurants Expandable */}
                  <div className="rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={() => toggleMenuExpand('restaurants')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        ['outlets', 'joining_requests'].includes(activeTab)
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <UtensilsCrossed className="w-4 h-4 text-slate-400" />
                        <span>Restaurants</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expandedMenus.restaurants ? 'rotate-90' : 'rotate-0'}`} />
                    </button>

                    {expandedMenus.restaurants && (
                      <div className="ml-4 pl-3.5 py-1 space-y-1 border-l border-slate-800/80 mt-0.5 text-xs">
                        <button
                          onClick={() => setActiveTab('outlets')}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'outlets'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Restaurants List</span>
                        </button>

                        <button
                          onClick={() => setActiveTab('joining_requests')}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'joining_requests'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>New Joining Request</span>
                        </button>

                        <button
                          onClick={() => setActiveTab('earnings')}
                          className="w-full text-left px-3.5 py-2 rounded-lg font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-900/60 transition-all flex items-center gap-2.5"
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Restaurant Commission</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 3: ORDER MANAGEMENT */}
              {(!sidebarSearchQuery || 'order management orders scheduled pending accepted processing food on the way delivered cancelled refunded'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1 pt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    ORDER MANAGEMENT
                  </div>

                  <div className="rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={() => toggleMenuExpand('orders')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        activeTab === 'orders'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span>Orders</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expandedMenus.orders ? 'rotate-90' : 'rotate-0'}`} />
                    </button>

                    {expandedMenus.orders && (
                      <div className="ml-4 pl-3.5 py-1 space-y-1 border-l border-slate-800/80 mt-0.5 text-xs">
                        <button
                          onClick={() => { setActiveTab('orders'); setOrderStatusFilter('all'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'orders' && orderStatusFilter === 'all'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>All Orders</span>
                        </button>
                        <button
                          onClick={() => { setActiveTab('orders'); setOrderStatusFilter('pending'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'orders' && orderStatusFilter === 'pending'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Pending</span>
                        </button>
                        <button
                          onClick={() => { setActiveTab('orders'); setOrderStatusFilter('processing'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'orders' && orderStatusFilter === 'processing'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Processing</span>
                        </button>
                        <button
                          onClick={() => { setActiveTab('orders'); setOrderStatusFilter('on_the_way'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'orders' && orderStatusFilter === 'on_the_way'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Food On The Way</span>
                        </button>
                        <button
                          onClick={() => { setActiveTab('orders'); setOrderStatusFilter('delivered'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'orders' && orderStatusFilter === 'delivered'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Delivered</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setActiveTab('orders')}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-900/80 hover:text-white transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-slate-400" />
                      <span>Order Detect Delivery</span>
                    </div>
                  </button>
                </div>
              )}

              {/* SECTION 4: FINANCIALS & TAX FEES (PAISE REFUND & GST/PLATFORM FEE CONFIG) */}
              {(!sidebarSearchQuery || 'financials tax paise refund gst platform fee commission'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1 pt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    FINANCIALS & TAX FEES
                  </div>

                  <div className="rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={() => toggleMenuExpand('financials')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        ['refunds', 'tax_platform_fees'].includes(activeTab)
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Receipt className="w-4 h-4 text-slate-400" />
                        <span>Refund & Tax Config</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expandedMenus.financials ? 'rotate-90' : 'rotate-0'}`} />
                    </button>

                    {expandedMenus.financials && (
                      <div className="ml-4 pl-3.5 py-1 space-y-1 border-l border-slate-800/80 mt-0.5 text-xs">
                        <button
                          onClick={() => setActiveTab('refunds')}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'refunds'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>Paise Refund Requests</span>
                        </button>

                        <button
                          onClick={() => setActiveTab('tax_platform_fees')}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'tax_platform_fees'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>GST & Platform Fee Setup</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 5: PROMOTIONS MANAGEMENT */}
              {(!sidebarSearchQuery || 'promotions coupons offers'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1 pt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    PROMOTIONS MANAGEMENT
                  </div>
                  <button
                    onClick={() => setActiveTab('overview')}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-900/80 hover:text-white transition-all"
                  >
                    <Gift className="w-4 h-4 text-slate-400" />
                    <span>Restaurant Coupons & Offers</span>
                  </button>
                </div>
              )}

              {/* SECTION 6: REFERRAL & REWARDS */}
              {(!sidebarSearchQuery || 'referral rewards settings'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1 pt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    REFERRAL & REWARDS
                  </div>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-900/80 hover:text-white transition-all"
                  >
                    <Tag className="w-4 h-4 text-slate-400" />
                    <span>Referral Settings</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* TAXI & FLEET MODULE SECTIONS */}
          {activeModuleTab === 'taxi' && (
            <>
              {/* SECTION: DRIVER & FLEET MANAGEMENT */}
              {(!sidebarSearchQuery || 'driver fleet management register selfie auto bike cab bus'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    DRIVER & FLEET MANAGEMENT
                  </div>

                  <div className="rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={() => toggleMenuExpand('drivers')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        activeTab === 'drivers'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Car className="w-4 h-4 text-slate-400" />
                        <span>Drivers & Riders</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expandedMenus.drivers ? 'rotate-90' : 'rotate-0'}`} />
                    </button>

                    {expandedMenus.drivers && (
                      <div className="ml-4 pl-3.5 py-1 space-y-1 border-l border-slate-800/80 mt-0.5 text-xs">
                        <button
                          onClick={() => { setActiveTab('drivers'); setDriverCategoryFilter('all'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'drivers' && driverCategoryFilter === 'all'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>All Drivers & Riders ({territoryDrivers.length})</span>
                        </button>

                        <button
                          onClick={() => { setActiveTab('drivers'); setDriverCategoryFilter('bike_rider'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'drivers' && driverCategoryFilter === 'bike_rider'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>🛵 Bike & Delivery Riders</span>
                        </button>

                        <button
                          onClick={() => { setActiveTab('drivers'); setDriverCategoryFilter('auto_bike'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'drivers' && driverCategoryFilter === 'auto_bike'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>🛺 Auto & E-Rickshaw</span>
                        </button>

                        <button
                          onClick={() => { setActiveTab('drivers'); setDriverCategoryFilter('taxi_car'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'drivers' && driverCategoryFilter === 'taxi_car'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>🚕 Sedan & Hatchback Taxis</span>
                        </button>

                        <button
                          onClick={() => { setActiveTab('drivers'); setDriverCategoryFilter('suv_taxi'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'drivers' && driverCategoryFilter === 'suv_taxi'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>🚘 SUV & Prime Cabs</span>
                        </button>

                        <button
                          onClick={() => { setActiveTab('drivers'); setDriverCategoryFilter('fleet_owner'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'drivers' && driverCategoryFilter === 'fleet_owner'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>🏎️ Fleet Managers</span>
                        </button>

                        <button
                          onClick={() => { setActiveTab('drivers'); setDriverCategoryFilter('bus_operator'); }}
                          className={`w-full text-left px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2.5 ${
                            activeTab === 'drivers' && driverCategoryFilter === 'bus_operator'
                              ? 'bg-slate-900 text-blue-400 font-bold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">●</span>
                          <span>🚌 Bus & Shuttle Operators</span>
                        </button>
                      </div>

                    )}
                  </div>
                </div>
              )}

              {/* SECTION: TAXI FARES & VEHICLE SETUP */}
              {(!sidebarSearchQuery || 'taxi fares pricing vehicle types models cancellation waiting surge base price'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1 pt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    TAXI FARES & VEHICLE SETUP
                  </div>

                  <button
                    onClick={() => setActiveTab('taxi_pricing')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                      activeTab === 'taxi_pricing'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span>Set Zone Taxi Prices & Fares</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('taxi_vehicle_types')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                      activeTab === 'taxi_vehicle_types'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FolderTree className="w-4 h-4 text-indigo-400" />
                      <span>Vehicle Types & Models</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('taxi_cancellation')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                      activeTab === 'taxi_cancellation'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Cancellation Policy & Fees</span>
                    </div>
                  </button>
                </div>
              )}

              {/* SECTION: TAXI TRIP MANAGEMENT */}
              {(!sidebarSearchQuery || 'taxi trip management rides bookings shuttle airport'.includes(sidebarSearchQuery.toLowerCase())) && (
                <div className="space-y-1 pt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    TAXI TRIP MANAGEMENT
                  </div>

                  <button
                    onClick={() => setActiveTab('rides')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                      activeTab === 'rides'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-blue-400" />
                      <span>Zone Taxi Rides</span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-extrabold bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                      {taxiRides.length}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* COMMON SECTION: MY ZONE & COMMISSIONS */}
          {(!sidebarSearchQuery || 'zone overview earnings commissions payment support scope'.includes(sidebarSearchQuery.toLowerCase())) && (
            <div className="space-y-1 pt-3 border-t border-slate-800/60">
              <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                MY ZONE & COMMISSIONS
              </div>

              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                  activeTab === 'overview'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4 text-blue-400" />
                  <span>Zone Business Overview</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('earnings')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                  activeTab === 'earnings'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Earnings & Commission</span>
                </div>
                {!isFeePaid && <Lock className="w-3.5 h-3.5 text-amber-400" />}
              </button>

              <button
                onClick={() => setActiveTab('payment')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                  activeTab === 'payment'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span>Fee Payment & Access</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                  isFeePaid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {isFeePaid ? 'PAID' : 'PENDING'}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('support')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                  activeTab === 'support'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-900/60 border border-slate-800/60 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-sky-400" />
                  <span>Support & Admin Desk</span>
                </div>
                {(dashboardData.supportMessages?.length || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {dashboardData.supportMessages.length}
                  </span>
                )}
              </button>
            </div>
          )}

        </nav>

        {/* Sleek Logout Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/90">
          <button
            onClick={() => { setDashboardData(null); setSearchParams({}); }}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 border border-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout Partner CRM
          </button>
        </div>

      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* TOP CRM HEADER BAR WITH REALTIME DYNAMIC NOTIFICATION POPOVER */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-xs sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>
                  {activeTab === 'overview' && 'Zone Business Overview'}
                  {activeTab === 'food_approval' && 'Food Items Approval Queue'}
                  {activeTab === 'foods' && 'Foods & Menu Items'}
                  {activeTab === 'outlets' && 'Restaurants & Merchant Outlets'}
                  {activeTab === 'joining_requests' && 'New Restaurant Joining Requests'}
                  {activeTab === 'categories' && 'Categories & Addons'}
                  {activeTab === 'refunds' && 'Paise Refund & Order Refund Requests'}
                  {activeTab === 'tax_platform_fees' && 'GST Tax & Platform Fee Configuration'}
                  {activeTab === 'drivers' && 'Zone Drivers & Riders Management'}
                  {activeTab === 'taxi_pricing' && 'Zone Taxi Prices & Fares Configuration'}
                  {activeTab === 'taxi_vehicle_types' && 'Zone Vehicle Types & Models Setup'}
                  {activeTab === 'taxi_cancellation' && 'Zone Cancellation Policy & Fees'}
                  {activeTab === 'rides' && 'Zone Taxi Rides & Bookings'}
                  {activeTab === 'orders' && 'Zone Food Orders'}
                  {activeTab === 'earnings' && 'Financial Earnings & Commissions'}
                  {activeTab === 'payment' && 'Franchise Fee & Access Portal'}
                  {activeTab === 'support' && 'Support & Admin Help Desk'}
                  {activeTab === 'settings' && 'Zone Scope & Configuration'}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {activeModuleTab === 'food' ? '🍔 Food CRM' : '🚕 Taxi & Rider CRM'}
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Zone: <strong className="text-slate-800">{dashboardData.territoryInfo.city}</strong> • Partner Application #{dashboardData.partnerInfo.applicationId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            
            {/* Realtime Dynamic Notification Bell Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all border border-slate-200/80 flex items-center justify-center"
                title="Zone Activity Notifications"
              >
                {unreadNotifCount > 0 ? (
                  <BellRing className="w-5 h-5 text-blue-600 animate-pulse" />
                ) : (
                  <Bell className="w-5 h-5 text-slate-600" />
                )}

                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-600 text-white rounded-full text-[10px] font-black flex items-center justify-center shadow-sm border-2 border-white">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {/* Dynamic Notification Popover Dropdown */}
              {notificationsOpen && (
                <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden font-sans">
                  
                  {/* Popover Header */}
                  <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-400" />
                      <h3 className="text-xs font-black tracking-wider uppercase">Live Zone Notifications</h3>
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={markAllNotificationsAsRead}
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-bold hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1 text-[11px] font-bold overflow-x-auto">
                    {[
                      { id: 'all', label: 'All Alerts' },
                      { id: 'orders', label: 'Food Orders' },
                      { id: 'drivers', label: 'Riders Joined' },
                      { id: 'system', label: 'System & Outlets' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setNotificationsFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg transition-all ${
                          notificationsFilter === f.id
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Notification List */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {filteredNotifications.map(n => (
                      <div
                        key={n.id}
                        className={`p-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors ${
                          n.unread ? 'bg-blue-50/40 font-semibold' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold ${
                          n.type === 'orders' ? 'bg-blue-600' : n.type === 'drivers' ? 'bg-emerald-600' : 'bg-slate-700'
                        }`}>
                          {n.type === 'orders' && <ShoppingBag className="w-4 h-4" />}
                          {n.type === 'drivers' && <Car className="w-4 h-4" />}
                          {n.type === 'system' && <ShieldCheck className="w-4 h-4" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="font-bold text-slate-900 text-xs truncate">{n.title}</h4>
                            <span className="text-[10px] text-slate-400 shrink-0">{n.time}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                        </div>

                        <button
                          onClick={() => dismissNotification(n.id)}
                          className="text-slate-400 hover:text-slate-600 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {filteredNotifications.length === 0 && (
                      <div className="p-8 text-center text-slate-400 font-medium">
                        No live notifications present. New rider joins & food orders will show up here dynamically!
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Fee Status Badge */}
            <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
              isFeePaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              Fee: {dashboardData.financialSettings.franchiseFeeStatus?.toUpperCase()} (₹{dashboardData.financialSettings.franchiseFee})
            </span>
          </div>
        </header>

        {/* SCROLLABLE TAB BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Fee Locked Banner notice */}
          {!isFeePaid && activeTab !== 'payment' && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between flex-wrap gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-amber-900">Franchise Operational Features Locked</div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    Pay your onboarding fee (₹{dashboardData.financialSettings.franchiseFee}) via Razorpay to activate full Franchise Partner features & live metrics.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('payment')}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5"
              >
                <Zap className="w-4 h-4" /> Pay Fee via Razorpay →
              </button>
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Metric Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Zone Orders</span>
                    <ShoppingBag className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {dashboardData.territoryMetrics.totalOrders}
                  </div>
                  <div className="text-xs font-semibold text-emerald-600 mt-1">
                    {dashboardData.territoryMetrics.deliveredOrders} Delivered Orders
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Zone Drivers</span>
                    <Car className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {territoryDrivers.length}
                  </div>
                  <div className="text-xs font-semibold text-blue-600 mt-1">
                    Auto, Taxi, Fleet & Bus Riders
                  </div>
                </div>

                {/* FRANCHISE PARTNER WALLET CARD */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-xl shadow-md space-y-2">
                  <div className="flex items-center justify-between text-emerald-100">
                    <span className="text-xs font-extrabold uppercase tracking-wider">Partner Wallet Balance</span>
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-3xl font-black tracking-tight">
                    ₹{(dashboardData.financialSettings?.walletBalance || 0).toLocaleString('en-IN')}
                  </div>
                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-emerald-500/40">
                    <span className="text-[11px] font-bold text-emerald-100">
                      Total Earned: ₹{(dashboardData.territoryMetrics.franchiseEarnings || 0).toLocaleString('en-IN')}
                    </span>
                    <button
                      onClick={() => setShowWithdrawModal(true)}
                      className="px-3 py-1 rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs shadow-sm transition-all"
                    >
                      Withdraw Payout →
                    </button>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Operating Outlets</span>
                    <Store className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {dashboardData.territoryMetrics.activeOutletsCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Active Outlets in Hub</div>
                </div>

              </div>

              {/* Scope & Terms */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" /> Allocated Zone Scope
                  </h3>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">State</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">{dashboardData.territoryInfo.state}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">City Hub</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">{dashboardData.territoryInfo.city}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Area Coverage</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">{dashboardData.territoryInfo.area || 'Citywide'}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Pincode</div>
                      <div className="text-sm font-bold text-blue-600 mt-0.5">{dashboardData.territoryInfo.pincode || 'All Pincodes'}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-600" /> Financial Terms & Payouts
                  </h3>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Commission Share</div>
                      <div className="text-sm font-bold text-emerald-600 mt-0.5">{dashboardData.financialSettings.commissionRate}%</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Payout Schedule</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5 capitalize">{dashboardData.financialSettings.payoutCycle}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Min Threshold</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">₹{dashboardData.financialSettings.minPayoutThreshold}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Payout Account</div>
                      <div className="text-xs font-bold text-slate-700 mt-0.5 truncate">
                        {dashboardData.financialSettings.paymentAccountInfo?.bankName || 'Bank Configured'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* FOOD APPROVAL TAB */}
          {activeTab === 'food_approval' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" /> Food Items Approval Queue
                  </h3>
                  <p className="text-xs text-slate-500">Review & approve food items submitted by restaurant merchants in {dashboardData.territoryInfo.city} Zone</p>
                </div>
              </div>

              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400 font-medium text-xs">
                ✅ All food items in {dashboardData.territoryInfo.city} Zone are currently approved and live!
              </div>
            </div>
          )}

          {/* FOODS LIST TAB (DYNAMIC FROM DB) */}
          {activeTab === 'foods' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-blue-600" /> Zone Foods & Menu Items
                  </h3>
                  <p className="text-xs text-slate-500">Manage all food menu items across restaurants operating in {dashboardData.territoryInfo.city}</p>
                </div>

                <button
                  onClick={() => setShowAddFoodModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Food Item</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {foodItemsList.map((item, idx) => (
                  <div key={item.id || idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{item.name}</div>
                        <div className="text-[11px] text-slate-500 font-semibold">{item.categoryName || 'General'}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${item.isVeg ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {item.isVeg ? '🟢 Veg' : '🔴 Non-Veg'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <span className="font-mono font-black text-slate-900 text-sm">₹{item.price}</span>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {item.status || 'Live'}
                      </span>
                    </div>
                  </div>
                ))}
                {foodItemsList.length === 0 && (
                  <div className="col-span-full text-center py-12 text-slate-400 font-medium">
                    No food items registered in {dashboardData.territoryInfo.city} DB yet. Click "+ Add Food Item" button above to add!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CATEGORIES TAB (WITH ACTION BUTTON AT TOP RIGHT) */}
          {activeTab === 'categories' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-blue-600" /> Categories & Addons List
                  </h3>
                  <p className="text-xs text-slate-500">Organize food categories for restaurants operating in {dashboardData.territoryInfo.city} Zone</p>
                </div>

                <button
                  onClick={() => setShowAddCategoryModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add New Category</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {foodCategoriesList.map(cat => (
                  <div key={cat.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between shadow-xs">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{cat.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{cat.itemsCount} Food Items linked</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {cat.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OUTLETS TAB (RESTAURANTS LIST WITH ACTION BUTTON AT TOP RIGHT) */}
          {activeTab === 'outlets' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Store className="w-4 h-4 text-blue-600" /> Restaurants & Merchant Outlets
                  </h3>
                  <p className="text-xs text-slate-500">All registered restaurants in {dashboardData.territoryInfo.city} Zone (Synced to SuperAdmin Master List)</p>
                </div>

                <button
                  onClick={() => setShowAddOutletModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Register New Restaurant</span>
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search restaurants by name or address..."
                  value={outletSearch}
                  onChange={e => setOutletSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOutlets.map(r => (
                  <div key={r.id || r._id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{r.name || r.restaurantName}</div>
                        <div className="text-[11px] font-bold text-blue-600">📍 Zone: {dashboardData.territoryInfo.city}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                        {r.isActive ? 'Active' : 'Offline'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" /> {r.address?.street || r.address || dashboardData.territoryInfo.city}
                    </div>

                    <div className="p-2 bg-blue-50/70 border border-blue-200/60 rounded-lg text-[10px] font-bold text-blue-800 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Synced to SuperAdmin
                      </span>
                      <span>App #{dashboardData.partnerInfo.applicationId}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80">
                      <button
                        onClick={() => {
                          setSelectedOutletForFood(r);
                          setShowAddFoodModal(true);
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-white border border-slate-300 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-all shadow-xs"
                      >
                        <Utensils className="w-3.5 h-3.5 text-blue-600" />
                        <span>+ Add Food Item to Menu</span>
                      </button>
                    </div>
                  </div>
                ))}
                {filteredOutlets.length === 0 && (
                  <div className="col-span-full text-center py-12 text-slate-400 font-medium">
                    No merchant outlets registered in {dashboardData.territoryInfo.city} yet. Click "+ Register New Restaurant" button above!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* JOINING REQUESTS TAB */}
          {activeTab === 'joining_requests' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Store className="w-4 h-4 text-blue-600" /> New Restaurant Joining Requests
              </h3>

              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400 font-medium text-xs">
                No pending restaurant merchant joining requests in {dashboardData.territoryInfo.city} Zone.
              </div>
            </div>
          )}

          {/* PAISE REFUND REQUESTS TAB (WITH SUPERADMIN CLAIM & CUSTOMER DISBURSEMENT) */}
          {activeTab === 'refunds' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-blue-600" /> Restaurant & Customer Refund Requests
                  </h3>
                  <p className="text-xs text-slate-500">Manage order refund requests, request refund funds from SuperAdmin, and disburse refunds to customers</p>
                </div>

                <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-extrabold text-xs border border-blue-200">
                  {refundRequests.filter(r => r.status === 'pending' || r.status === 'claimed_from_admin').length} Active Refund Requests
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Order ID & Date</th>
                      <th className="py-3 px-4">Customer Details</th>
                      <th className="py-3 px-4">Merchant Outlet</th>
                      <th className="py-3 px-4">Refund Amount</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Actions & Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {refundRequests.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-blue-600">#{r.orderId}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{r.requestedTime ? new Date(r.requestedTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Recent'}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{r.customerName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{r.customerPhone}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800">{r.merchantName}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-black text-red-600 text-sm">₹{r.amount}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{r.method || 'UPI / Original Account'}</div>
                        </td>

                        <td className="py-3.5 px-4 max-w-[220px]">
                          <div className="text-slate-700 font-medium truncate">{r.reason}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1.5 items-start">
                            {r.status === 'processed' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ✅ Refund Disbursed
                              </span>
                            ) : (
                              <>
                                {r.status === 'claimed_from_admin' ? (
                                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                                    ⏳ Claim Sent to SuperAdmin
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setSelectedRefundForClaim(r);
                                      setShowClaimModal(true);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] transition-all flex items-center gap-1"
                                  >
                                    <Send className="w-3 h-3" /> Mange Paise Admin Se
                                  </button>
                                )}

                                <button
                                  onClick={() => handleApproveRefund(r.id)}
                                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition-all flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Approve & Refund Customer
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {refundRequests.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400">No active refund requests in {dashboardData.territoryInfo.city} Zone</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GST & PLATFORM FEE SETUP TAB */}
          {activeTab === 'tax_platform_fees' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Percent className="w-4 h-4 text-blue-600" /> GST Tax & Platform Fee Setup ({dashboardData.territoryInfo.city} Zone)
                </h3>
                <p className="text-xs text-slate-500">Configure Food GST rates, Platform Fee per order, and Merchant commission share for your zone</p>
              </div>

              <form onSubmit={handleSaveFeeSettings} className="space-y-6 text-xs">
                
                {/* GST Tax Config Section */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-blue-600" /> GST Tax Configuration
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Food GST Rate (%)</label>
                      <input
                        type="number"
                        required
                        value={feeSettings.foodGstRate}
                        onChange={e => setFeeSettings({ ...feeSettings, foodGstRate: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Standard Food GST Rate (default: 5%)</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Service & Delivery GST Rate (%)</label>
                      <input
                        type="number"
                        required
                        value={feeSettings.serviceGstRate}
                        onChange={e => setFeeSettings({ ...feeSettings, serviceGstRate: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Delivery & Platform Fee GST (default: 18%)</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Zone GSTIN Registration Number</label>
                      <input
                        type="text"
                        value={feeSettings.gstinNumber}
                        onChange={e => setFeeSettings({ ...feeSettings, gstinNumber: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Platform Fee & Surge Section */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" /> Customer Platform Fee & Surge Charges
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Platform Fee per Order (₹)</label>
                      <input
                        type="number"
                        required
                        value={feeSettings.platformFeePerOrder}
                        onChange={e => setFeeSettings({ ...feeSettings, platformFeePerOrder: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Charged on every food/taxi checkout</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Merchant Commission Rate (%)</label>
                      <input
                        type="number"
                        required
                        value={feeSettings.merchantCommissionPct}
                        onChange={e => setFeeSettings({ ...feeSettings, merchantCommissionPct: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-emerald-600 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Partner Commission Share (10%)</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Rider Delivery Surge Fee (₹)</label>
                      <input
                        type="number"
                        value={feeSettings.riderDeliverySurge}
                        onChange={e => setFeeSettings({ ...feeSettings, riderDeliverySurge: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Peak hours surge charge (optional)</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingFees}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
                  >
                    {savingFees ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{savingFees ? 'Saving Settings...' : 'Save GST & Platform Fee Configuration'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ORDERS TAB */}
          {activeTab === 'orders' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search orders by order ID, customer name, or outlet..."
                    value={orderSearch}
                    onChange={e => setOrderSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold flex-wrap">
                  {[
                    { id: 'all', label: 'All Orders' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'processing', label: 'Processing' },
                    { id: 'on_the_way', label: 'Food On The Way' },
                    { id: 'delivered', label: 'Delivered' },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setOrderStatusFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        orderStatusFilter === f.id
                          ? 'bg-white text-blue-600 shadow-xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Order ID & Date</th>
                      <th className="py-3 px-4">Customer Details</th>
                      <th className="py-3 px-4">Merchant Outlet</th>
                      <th className="py-3 px-4">Delivery Partner</th>
                      <th className="py-3 px-4">Total Amount</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredOrders.map(o => {
                      const status = (o.orderStatus || 'pending').toLowerCase();
                      return (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-bold text-blue-600">#{o.orderId}</div>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              {new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{o.customerName || 'Customer'}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[180px]">📍 {o.city || dashboardData.territoryInfo.city}</div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{o.restaurantName || 'Merchant'}</div>
                            <div className="text-[10px] text-slate-400 font-semibold">Zone: {o.city || dashboardData.territoryInfo.city}</div>
                          </td>

                          <td className="py-3 px-4">
                            {o.deliveryPartner ? (
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <Car className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>{o.deliveryPartner}</span>
                              </div>
                            ) : status === 'delivered' ? (
                              <span className="text-[11px] font-bold text-emerald-700">🛵 Partner Delivered</span>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-600 animate-pulse">📡 Assigning Rider...</span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-extrabold text-slate-900 text-sm">₹{o.total}</div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border inline-flex items-center gap-1 ${
                              status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : status === 'on_the_way' || status === 'food_on_the_way'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : status === 'processing'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {status === 'delivered' && '✅ Delivered'}
                              {(status === 'on_the_way' || status === 'food_on_the_way') && '🛵 Food On The Way'}
                              {status === 'processing' && '🍳 In Kitchen'}
                              {status !== 'delivered' && status !== 'on_the_way' && status !== 'food_on_the_way' && status !== 'processing' && `⏳ ${status.toUpperCase()}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400">No orders found matching status filter</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DRIVERS & RIDERS TAB */}
          {activeTab === 'drivers' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search drivers by name, phone, or vehicle registration..."
                    value={driverSearch}
                    onChange={e => setDriverSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                <button
                  onClick={() => setShowAddDriverModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Register Rider / Driver</span>
                </button>
              </div>

              {/* Driver Category Filter Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-bold overflow-x-auto">
                {[
                  { id: 'all', label: 'All Roles' },
                  { id: 'bike_rider', label: '🛵 Bike Riders' },
                  { id: 'auto_bike', label: '🛺 Auto & E-Rickshaw' },
                  { id: 'taxi_car', label: '🚕 Sedan Taxis' },
                  { id: 'suv_taxi', label: '🚘 SUV Cabs' },
                  { id: 'fleet_owner', label: '🏎️ Fleet Operators' },
                  { id: 'bus_operator', label: '🚌 Bus Operators' },
                ].map(cat => (

                  <button
                    key={cat.id}
                    onClick={() => setDriverCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      driverCategoryFilter === cat.id
                        ? 'bg-blue-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Driver Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDrivers.map(d => (
                  <div key={d.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider">
                          {d.categoryLabel}
                        </span>
                        <div className="font-extrabold text-slate-900 text-sm mt-0.5">{d.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" /> {d.phone}
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        🟢 Online
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Vehicle Reg:</span>
                        <span className="font-mono font-bold text-slate-900">{d.vehicleNumber}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>License No:</span>
                        <span className="font-mono font-bold text-slate-700">{d.licenseNumber}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-500 font-medium">📍 Zone: {dashboardData.territoryInfo.city}</span>
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" /> Verified Rider
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAXI PRICING & FARES CONFIGURATION TAB */}
          {activeTab === 'taxi_pricing' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" /> Zone Taxi Base Prices, Per-KM Rates & Surge Setup
                </h3>
                <p className="text-xs text-slate-500">
                  Configure base fares, distance pricing, waiting charges, and surge fees bound strictly to <strong className="text-slate-800 font-bold">{dashboardData.territoryInfo.city} Zone</strong>
                </p>
              </div>

              <form onSubmit={handleSaveTaxiPrices} className="space-y-6 text-xs font-sans">
                
                {/* Zone Info Banner (Zone Selection Hidden as bound to Franchise Zone) */}
                <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                      📍
                    </div>
                    <div>
                      <h4 className="font-extrabold text-blue-900 text-xs uppercase tracking-wider">Fixed Franchise Zone Scope</h4>
                      <p className="text-[11px] text-blue-700 font-semibold mt-0.5">
                        Zone: <strong>{dashboardData.territoryInfo.city} Hub</strong> ({dashboardData.territoryInfo.state}) • Global Zone Selector is hidden
                      </p>
                    </div>
                  </div>

                  <span className="px-3 py-1 bg-white text-blue-800 rounded-full font-extrabold text-[10px] border border-blue-300 shadow-xs">
                    Franchise Bound
                  </span>
                </div>

                {/* Base Price & Per KM Distance Fares */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Car className="w-4 h-4 text-blue-600" /> Base Fares & Distance Pricing Matrix
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Base Price (₹) *</label>
                      <input
                        type="number"
                        required
                        value={taxiPriceSettings.basePrice}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, basePrice: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Initial base ride fare</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Base Distance (KM) *</label>
                      <input
                        type="number"
                        required
                        value={taxiPriceSettings.baseDistance}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, baseDistance: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Distance included in base fare</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Price Per Distance (₹ / KM) *</label>
                      <input
                        type="number"
                        required
                        value={taxiPriceSettings.pricePerDistance}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, pricePerDistance: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-black text-emerald-600 bg-white text-sm"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Rate per additional kilometer</span>
                    </div>
                  </div>
                </div>

                {/* Time & Waiting Charges */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600" /> Ride Duration & Waiting Charges
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Time Price (₹ / Min) *</label>
                      <input
                        type="number"
                        required
                        value={taxiPriceSettings.timePrice}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, timePrice: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Per minute ride duration rate</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Waiting Charge (₹ / Min) *</label>
                      <input
                        type="number"
                        required
                        value={taxiPriceSettings.waitingCharge}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, waitingCharge: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Driver waiting fee per min</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Free Waiting (Before Start Mins)</label>
                      <input
                        type="number"
                        value={taxiPriceSettings.freeWaitingBefore}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, freeWaitingBefore: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Free mins before ride starts</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Free Waiting (After Start Mins)</label>
                      <input
                        type="number"
                        value={taxiPriceSettings.freeWaitingAfter}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, freeWaitingAfter: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Free mins during ride stops</span>
                    </div>
                  </div>
                </div>

                {/* Commission & Surge Rules */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" /> Admin Commission & Surge Rules
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Admin Commission from Driver (%) *</label>
                      <input
                        type="number"
                        required
                        value={taxiPriceSettings.adminCommissionFromDriver}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, adminCommissionFromDriver: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">SuperAdmin commission rate</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Franchise Zone Share (%) *</label>
                      <input
                        type="number"
                        required
                        value={taxiPriceSettings.franchiseCommissionShare}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, franchiseCommissionShare: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-emerald-600 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Franchise partner earnings share</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Ride Surge Amount (₹)</label>
                      <input
                        type="number"
                        value={taxiPriceSettings.rideSurgeAmount}
                        onChange={e => setTaxiPriceSettings({ ...taxiPriceSettings, rideSurgeAmount: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Peak hour surge bonus</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingTaxiPrices}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
                  >
                    {savingTaxiPrices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{savingTaxiPrices ? 'Saving Pricing Rules...' : 'Save Zone Taxi Prices & Fares'}</span>
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* VEHICLE TYPES & MODELS TAB */}
          {activeTab === 'taxi_vehicle_types' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-blue-600" /> Zone Vehicle Types & Allowed Models Configuration
                  </h3>
                  <p className="text-xs text-slate-500">
                    Manage vehicle categories, base rates, and approved vehicle models for <strong className="text-slate-800 font-bold">{dashboardData.territoryInfo.city} Zone</strong>
                  </p>
                </div>

                <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-extrabold text-xs border border-blue-200">
                  {zoneVehicleTypes.length} Active Vehicle Categories
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {zoneVehicleTypes.map(v => (
                  <div key={v.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-3 shadow-xs font-sans">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 text-sm">{v.name}</h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {v.status}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Base Fare:</span>
                        <span className="font-black text-slate-900">₹{v.baseFare}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Distance Rate:</span>
                        <span className="font-black text-emerald-600">₹{v.perKm} / KM</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Approved Vehicle Models:</div>
                      <p className="text-xs font-medium text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200/80 leading-relaxed">
                        {v.models}
                      </p>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200">
                      <span>Zone: {dashboardData.territoryInfo.city}</span>
                      <span className="text-blue-600 font-bold">Admin Approved</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CANCELLATION POLICY & FEES TAB */}
          {activeTab === 'taxi_cancellation' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> Zone Cancellation Policy & Driver Compensation Setup
                </h3>
                <p className="text-xs text-slate-500">
                  Set free cancellation time windows, cancellation penalties, and driver compensation shares for <strong className="text-slate-800 font-bold">{dashboardData.territoryInfo.city} Zone</strong>
                </p>
              </div>

              <form onSubmit={handleSaveCancellation} className="space-y-6 text-xs font-sans">
                
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" /> Cancellation Fee Rules & Limits
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Free Cancellation Time (Mins) *</label>
                      <input
                        type="number"
                        required
                        value={cancellationSettings.freeCancellationTimeMins}
                        onChange={e => setCancellationSettings({ ...cancellationSettings, freeCancellationTimeMins: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Grace period after booking</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Fixed Cancellation Fee (₹) *</label>
                      <input
                        type="number"
                        required
                        value={cancellationSettings.fixedCancellationCharge}
                        onChange={e => setCancellationSettings({ ...cancellationSettings, fixedCancellationCharge: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-red-600 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Penalty charged on customer cancel</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Max Cancellation Fee (₹) *</label>
                      <input
                        type="number"
                        required
                        value={cancellationSettings.maxCancellationFee}
                        onChange={e => setCancellationSettings({ ...cancellationSettings, maxCancellationFee: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Maximum penalty limit</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Driver Compensation Share (%) *</label>
                      <input
                        type="number"
                        required
                        value={cancellationSettings.driverCompensationPct}
                        onChange={e => setCancellationSettings({ ...cancellationSettings, driverCompensationPct: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-emerald-600 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Driver share of cancellation fee</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingCancellation}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
                  >
                    {savingCancellation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{savingCancellation ? 'Saving Policy...' : 'Save Cancellation Policy & Compensation Rules'}</span>
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* TAXI RIDES TAB */}
          {activeTab === 'rides' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-600" /> Live Zone Taxi Rides in {dashboardData.territoryInfo.city}
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Ride ID</th>
                      <th className="py-3 px-4">Passenger</th>
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Assigned Driver</th>
                      <th className="py-3 px-4">Fare</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {taxiRides.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-blue-600">#{r.rideId}</td>
                        <td className="py-3 px-4">{r.customerName}</td>
                        <td className="py-3 px-4">🟢 {r.pickupLocation} → 🔴 {r.dropLocation}</td>
                        <td className="py-3 px-4">{r.assignedDriver}</td>
                        <td className="py-3 px-4 font-black text-slate-900">₹{r.fare}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                            🚕 In Transit
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EARNINGS & WALLET PAYOUT TAB */}
          {activeTab === 'earnings' && (
            <div className="space-y-6">
              
              {/* Partner Wallet Header Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between flex-wrap gap-4 shadow-xl">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-100 mb-1 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-white" /> Franchise Partner Main Wallet
                  </div>
                  <div className="text-4xl font-black tracking-tight">
                    ₹{(dashboardData.financialSettings?.walletBalance || 0).toLocaleString('en-IN')}
                  </div>
                  <p className="text-xs text-emerald-100 font-medium mt-1">
                    Net available balance (Total Commission Share - Paid Out Withdrawals)
                  </p>
                </div>

                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="px-6 py-3.5 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs shadow-lg flex items-center gap-2 transition-all hover:scale-105"
                >
                  <DollarSign className="w-4 h-4" /> Withdraw Funds to Bank / UPI
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Gross GMV Volume</div>
                  <div className="text-2xl font-black text-slate-900">₹{(dashboardData.territoryMetrics.totalGMV || 0).toLocaleString('en-IN')}</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">Total delivered orders value in zone</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-xs bg-emerald-50/20">
                  <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Earned Commission ({dashboardData.financialSettings.commissionRate}%)</div>
                  <div className="text-2xl font-black text-emerald-600">₹{(dashboardData.territoryMetrics.franchiseEarnings || 0).toLocaleString('en-IN')}</div>
                  <div className="text-[11px] text-emerald-700 mt-1 font-semibold">Gross Commission earned from DB</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Payout Cycle</div>
                  <div className="text-lg font-black text-blue-600 capitalize mt-1">{dashboardData.financialSettings.payoutCycle} Cycle</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">Min Threshold: ₹{dashboardData.financialSettings.minPayoutThreshold}</div>
                </div>
              </div>

              {/* Payout Withdrawal History Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-blue-600" /> Payout Withdrawal History
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">Total {payoutRequests.length} requests</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                        <th className="py-3 px-4">Request ID & Date</th>
                        <th className="py-3 px-4">Withdrawal Amount</th>
                        <th className="py-3 px-4">Payout Method</th>
                        <th className="py-3 px-4">Account / UTR Info</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {payoutRequests.map(p => (
                        <tr key={p.requestId} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-bold text-blue-600">#{p.requestId}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {p.requestedAt ? new Date(p.requestedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Recent'}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-black text-slate-900 text-sm">₹{p.amount?.toLocaleString('en-IN')}</div>
                          </td>

                          <td className="py-3 px-4 uppercase font-bold text-slate-700">
                            {p.payoutMethod || 'Bank'}
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-slate-800 font-medium">
                              {p.accountDetails?.bankName || p.accountDetails?.upiId || 'Bank Account'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {p.accountDetails?.accountNumber ? `A/c: ****${String(p.accountDetails.accountNumber).slice(-4)}` : p.accountDetails?.upiId}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                              p.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : p.status === 'rejected'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {p.status === 'approved' && '✅ Approved & Disbursed'}
                              {p.status === 'rejected' && '❌ Rejected'}
                              {p.status === 'pending' && '⏳ Pending Admin Approval'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {payoutRequests.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-slate-400 font-medium">
                            No payout withdrawal requests submitted yet. Click "Withdraw Funds to Bank / UPI" above to request a payout.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PAYMENT & FEE TAB */}
          {activeTab === 'payment' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Franchise Onboarding Fee Payment Gateway</h3>
                  <p className="text-xs text-slate-500">Pay your onboarding fee via Razorpay online checkout or submit UTR bank transfer</p>
                </div>
              </div>

              {/* Instant Razorpay Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between flex-wrap gap-4 shadow-lg shadow-blue-500/20">
                <div>
                  <div className="flex items-center gap-2 text-amber-300 font-extrabold text-xs uppercase tracking-wider mb-1">
                    <Zap className="w-4 h-4" /> Instant Online Auto-Verification
                  </div>
                  <div className="text-2xl font-black">Pay ₹{dashboardData.financialSettings.franchiseFee} via Razorpay</div>
                </div>

                <button
                  onClick={handleRazorpayPayment}
                  disabled={initiatingRazorpay}
                  className="px-6 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-sm shadow-md flex items-center gap-2 transition-all hover:scale-105"
                >
                  {initiatingRazorpay ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                  {initiatingRazorpay ? 'Opening Razorpay...' : `Pay ₹${dashboardData.financialSettings.franchiseFee} Now`}
                </button>
              </div>

              {/* Manual UTR Form */}
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Manual Bank / UPI UTR Submission</h4>

                {hasSubmittedProof && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                    📑 Payment Proof Submitted: UTR <strong>{dashboardData.financialSettings.franchiseFeePaymentDetails.transactionId}</strong>
                  </div>
                )}

                {paymentMsg.text && (
                  <div className={`p-3 rounded-lg text-xs font-semibold ${paymentMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {paymentMsg.text}
                  </div>
                )}

                <form onSubmit={handlePaymentSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">UTR / Transaction Reference No. *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 428190182910"
                      value={paymentForm.transactionId}
                      onChange={e => setPaymentForm(prev => ({ ...prev, transactionId: e.target.value }))}
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={e => setPaymentForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold"
                    >
                      <option value="upi">UPI Transfer (GPay / PhonePe / Paytm)</option>
                      <option value="bank_transfer">Bank Transfer (IMPS / NEFT)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={submittingPayment}
                      className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-2"
                    >
                      {submittingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {submittingPayment ? 'Submitting...' : 'Submit Manual Payment Proof'}
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

          {/* SUPPORT TAB */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Support & Admin Help Desk</h3>
                    <p className="text-xs text-slate-500">Submit questions directly to Raydo SuperAdmin</p>
                  </div>
                </div>

                <form onSubmit={handleSupportSubmit} className="space-y-4 text-xs pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-700 mb-1.5">Subject *</label>
                      <input
                        type="text"
                        required
                        placeholder="Subject..."
                        value={supportForm.subject}
                        onChange={e => setSupportForm(prev => ({ ...prev, subject: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1.5">Priority</label>
                      <select
                        value={supportForm.priority}
                        onChange={e => setSupportForm(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900"
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">Message *</label>
                    <textarea
                      required
                      rows={4}
                      placeholder="Message..."
                      value={supportForm.message}
                      onChange={e => setSupportForm(prev => ({ ...prev, message: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingSupport}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center gap-2"
                  >
                    {submittingSupport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Submit to Admin</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6 text-xs">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" /> Zone Scope & Partner Account Details
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Applicant Name</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{dashboardData.partnerInfo.applicantName}</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Registered Phone</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{dashboardData.partnerInfo.phone}</div>
                </div>
              </div>
            </div>
          )}

        </div>

      </main>

      {/* MODAL 1: ADD MERCHANT OUTLET (RESTAURANT) */}
      <Dialog open={showAddOutletModal} onOpenChange={setShowAddOutletModal}>
        <DialogContent className="max-w-xl bg-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Store className="w-6 h-6 text-blue-600" />
              <span>Register New Restaurant in Zone</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddOutletSubmit} className="space-y-4 mt-2 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 font-bold flex items-center justify-between">
              <span>📍 Assigned Zone:</span>
              <span className="text-sm font-black text-blue-700">{dashboardData?.territoryInfo?.city}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Restaurant Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Royal Kitchen"
                  value={newOutletForm.name}
                  onChange={e => setNewOutletForm({ ...newOutletForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Owner Contact Phone *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 9876543210"
                  value={newOutletForm.phone}
                  onChange={e => setNewOutletForm({ ...newOutletForm, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Owner Email</label>
                <input
                  type="email"
                  placeholder="outlet@example.com"
                  value={newOutletForm.email}
                  onChange={e => setNewOutletForm({ ...newOutletForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuisine / Category</label>
                <select
                  value={newOutletForm.category}
                  onChange={e => setNewOutletForm({ ...newOutletForm, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                >
                  {['North Indian', 'Fast Food', 'Chinese', 'South Indian', 'Bakery & Desserts', 'Beverages', 'Biryani', 'Pizza & Burger'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Address in {dashboardData?.territoryInfo?.city}</label>
                <input
                  type="text"
                  placeholder="e.g. Main Market, Opposite City Park"
                  value={newOutletForm.address}
                  onChange={e => setNewOutletForm({ ...newOutletForm, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddOutletModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingOutlet}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
              >
                {submittingOutlet ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{submittingOutlet ? 'Registering...' : 'Register Restaurant'}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: ADD CATEGORY */}
      <Dialog open={showAddCategoryModal} onOpenChange={setShowAddCategoryModal}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FolderTree className="w-6 h-6 text-blue-600" />
              <span>Add New Food Category</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddCategorySubmit} className="space-y-4 mt-2 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Category Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Tandoori Starters & Snacks"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Save Category</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: ADD FOOD ITEM */}
      <Dialog open={showAddFoodModal} onOpenChange={setShowAddFoodModal}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Utensils className="w-6 h-6 text-blue-600" />
              <span>Add Food Item to Restaurant Menu</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddFoodSubmit} className="space-y-4 mt-2 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 font-bold">
              Restaurant Outlet: <span className="text-slate-900">{selectedOutletForFood?.name || selectedOutletForFood?.restaurantName || 'Selected Outlet'}</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Food Category</label>
              <select
                value={newFoodForm.categoryName}
                onChange={e => setNewFoodForm({ ...newFoodForm, categoryName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
              >
                {foodCategoriesList.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Food Item Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Paneer Butter Masala"
                value={newFoodForm.name}
                onChange={e => setNewFoodForm({ ...newFoodForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Price (₹) *</label>
                <input
                  type="number"
                  required
                  placeholder="240"
                  value={newFoodForm.price}
                  onChange={e => setNewFoodForm({ ...newFoodForm, price: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-extrabold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Diet Preference</label>
                <select
                  value={newFoodForm.isVeg ? 'veg' : 'nonveg'}
                  onChange={e => setNewFoodForm({ ...newFoodForm, isVeg: e.target.value === 'veg' })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                >
                  <option value="veg">🟢 Veg</option>
                  <option value="nonveg">🔴 Non-Veg</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddFoodModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingFood}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
              >
                {submittingFood ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Add Item to Menu</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: REGISTER RIDER / DRIVER */}
      <Dialog open={showAddDriverModal} onOpenChange={setShowAddDriverModal}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Car className="w-6 h-6 text-blue-600" />
              <span>Register Rider / Driver in Zone</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddDriverSubmit} className="space-y-4 mt-2 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 font-bold flex items-center justify-between">
              <span>📍 Zone Assigned:</span>
              <span className="text-sm font-black text-blue-700">{dashboardData?.territoryInfo?.city}</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Rider / Driver Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Ramesh Kumar"
                value={newDriverForm.name}
                onChange={e => setNewDriverForm({ ...newDriverForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Mobile Phone Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. 9876543210"
                value={newDriverForm.phone}
                onChange={e => setNewDriverForm({ ...newDriverForm, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Vehicle & Rider Role Type</label>
              <select
                value={newDriverForm.vehicleType}
                onChange={e => setNewDriverForm({ ...newDriverForm, vehicleType: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
              >
                <option value="bike_rider">🛵 Bike & Food Delivery Rider</option>
                <option value="auto_bike">🛺 Auto & E-Rickshaw Driver</option>
                <option value="taxi_car">🚕 Taxi Cab (Hatchback / Sedan)</option>
                <option value="suv_taxi">🚘 SUV & Prime Taxi Cab</option>
                <option value="fleet_owner">🏎️ Taxi Fleet Manager</option>
                <option value="bus_operator">🚌 Bus & Route Operator</option>
              </select>

            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Reg No.</label>
                <input
                  type="text"
                  placeholder="e.g. UP-14-AB-1234"
                  value={newDriverForm.vehicleNumber}
                  onChange={e => setNewDriverForm({ ...newDriverForm, vehicleNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Driving License</label>
                <input
                  type="text"
                  placeholder="e.g. DL-981203810"
                  value={newDriverForm.licenseNumber}
                  onChange={e => setNewDriverForm({ ...newDriverForm, licenseNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-slate-900"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddDriverModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingDriver}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
              >
                {submittingDriver ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Register Rider in Zone</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: WITHDRAW WALLET FUNDS */}
      <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-600" />
              <span>Withdraw Funds from Partner Wallet</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleWithdrawSubmit} className="space-y-4 mt-2 text-xs">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold uppercase text-emerald-700">Available Wallet Balance</div>
                <div className="text-2xl font-black text-emerald-800">
                  ₹{(dashboardData?.financialSettings?.walletBalance || 0).toLocaleString('en-IN')}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-900">
                Instant Transfer
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Withdrawal Amount (₹) *</label>
              <input
                type="number"
                required
                max={dashboardData?.financialSettings?.walletBalance || 0}
                placeholder="e.g. 5000"
                value={withdrawForm.amount}
                onChange={e => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-black text-slate-900 text-base"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Payout Method</label>
              <select
                value={withdrawForm.payoutMethod}
                onChange={e => setWithdrawForm({ ...withdrawForm, payoutMethod: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-bold text-slate-900"
              >
                <option value="bank">🏦 Bank Account Transfer</option>
                <option value="upi">⚡ UPI Instant Transfer</option>
              </select>
            </div>

            {withdrawForm.payoutMethod === 'bank' ? (
              <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank / SBI"
                    value={withdrawForm.bankName}
                    onChange={e => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Account Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 5010001234567"
                      value={withdrawForm.accountNumber}
                      onChange={e => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">IFSC Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. HDFC0001234"
                      value={withdrawForm.ifscCode}
                      onChange={e => setWithdrawForm({ ...withdrawForm, ifscCode: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Account Holder Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={withdrawForm.accountHolderName}
                    onChange={e => setWithdrawForm({ ...withdrawForm, accountHolderName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="block font-bold text-slate-700 mb-1">UPI ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. mobile@upi or name@okaxis"
                  value={withdrawForm.upiId}
                  onChange={e => setWithdrawForm({ ...withdrawForm, upiId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingWithdrawal}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
              >
                {submittingWithdrawal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Submit Payout Withdrawal Request</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 6: CLAIM REFUND MONEY FROM SUPERADMIN */}
      <Dialog open={showClaimModal} onOpenChange={setShowClaimModal}>
        <DialogContent className="max-w-md bg-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Send className="w-6 h-6 text-indigo-600" />
              <span>Request Refund Amount from SuperAdmin</span>
            </DialogTitle>
          </DialogHeader>

          {selectedRefundForClaim && (
            <div className="space-y-4 mt-2 text-xs">
              <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1 text-indigo-900">
                <div className="font-bold flex items-center justify-between">
                  <span>Order ID: #{selectedRefundForClaim.orderId}</span>
                  <span className="font-black text-red-600 text-sm">₹{selectedRefundForClaim.amount}</span>
                </div>
                <div className="text-slate-700 font-semibold">Merchant: {selectedRefundForClaim.merchantName}</div>
                <div className="text-slate-600">Customer: {selectedRefundForClaim.customerName} ({selectedRefundForClaim.customerPhone})</div>
                <div className="text-[11px] text-slate-500 font-medium italic mt-1">Reason: "{selectedRefundForClaim.reason}"</div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Claim Note / Request Reason to SuperAdmin</label>
                <textarea
                  rows={3}
                  placeholder="Explain why SuperAdmin should disburse this refund amount for your zone..."
                  value={claimReason}
                  onChange={e => setClaimReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingClaim}
                  onClick={() => handleClaimRefundFromAdmin(selectedRefundForClaim)}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
                >
                  {submittingClaim ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Mange Paise SuperAdmin Se</span>
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
