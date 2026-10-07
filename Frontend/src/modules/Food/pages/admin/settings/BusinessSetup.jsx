import { useState, useRef, useEffect } from "react";
import { Info, Phone, Upload, X, Loader2, Globe, Truck, Car, UtensilsCrossed, Shield, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import { setCachedSettings } from "@food/utils/businessSettings";

const debugError = (...args) => {};

const PORTAL_CONFIG = [
  {
    key: "logo",
    title: "Global Main Brand Logo",
    subtitle: "Used across main landing page, splash screens & fallback logo",
    icon: Globe,
    badge: "Main Brand",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200"
  },
  {
    key: "userLogo",
    title: "Customer App & Web Logo",
    subtitle: "Header & navigation logo on User Food / Taxi web & app",
    icon: Globe,
    badge: "Customer Portal",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200"
  },
  {
    key: "deliveryLogo",
    title: "Delivery Boy Partner App Logo",
    subtitle: "App header & profile logo for Food & Parcel Delivery Partners",
    icon: Truck,
    badge: "Delivery Partner",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200"
  },
  {
    key: "driverLogo",
    title: "Taxi Driver App Logo",
    subtitle: "Header logo for Taxi Drivers & Fleet Owner Dashboard",
    icon: Car,
    badge: "Taxi Driver",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200"
  },
  {
    key: "restaurantLogo",
    title: "Restaurant Owner Partner Logo",
    subtitle: "Header logo for Restaurant Partner Dashboard & Hub",
    icon: UtensilsCrossed,
    badge: "Restaurant Partner",
    badgeColor: "bg-orange-50 text-orange-700 border-orange-200"
  },
  {
    key: "adminLogo",
    title: "Admin Dashboard Logo",
    subtitle: "Top left sidebar logo on SuperApp Admin & Taxi Admin panels",
    icon: Shield,
    badge: "Admin Panel",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200"
  },
  {
    key: "favicon",
    title: "Browser Favicon Icon",
    subtitle: "Browser tab icon (supports .ico, .png, .webp, .svg)",
    icon: ImageIcon,
    badge: "Browser Favicon",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-300"
  }
];

export default function BusinessSetup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [previews, setPreviews] = useState({
    logo: null,
    userLogo: null,
    deliveryLogo: null,
    driverLogo: null,
    restaurantLogo: null,
    adminLogo: null,
    favicon: null
  });

  const [files, setFiles] = useState({
    logo: null,
    userLogo: null,
    deliveryLogo: null,
    driverLogo: null,
    restaurantLogo: null,
    adminLogo: null,
    favicon: null
  });

  const inputRefs = {
    logo: useRef(null),
    userLogo: useRef(null),
    deliveryLogo: useRef(null),
    driverLogo: useRef(null),
    restaurantLogo: useRef(null),
    adminLogo: useRef(null),
    favicon: useRef(null)
  };

  const [formData, setFormData] = useState({
    companyName: "",
    email: "",
    phoneCountryCode: "+91",
    phoneNumber: "",
    address: "",
    state: "",
    pincode: "",
    region: "India",
  });

  useEffect(() => {
    fetchBusinessSettings();
  }, []);

  const fetchBusinessSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getBusinessSettings();
      const settings = response?.data?.data || response?.data;

      if (settings) {
        setFormData({
          companyName: settings.companyName || "",
          email: settings.email || "",
          phoneCountryCode: settings.phone?.countryCode || "+91",
          phoneNumber: settings.phone?.number || "",
          address: settings.address || "",
          state: settings.state || "",
          pincode: settings.pincode || "",
          region: settings.region || "India",
        });

        setPreviews({
          logo: settings.logo?.url || null,
          userLogo: settings.userLogo?.url || settings.logo?.url || null,
          deliveryLogo: settings.deliveryLogo?.url || settings.logo?.url || null,
          driverLogo: settings.driverLogo?.url || settings.logo?.url || null,
          restaurantLogo: settings.restaurantLogo?.url || settings.logo?.url || null,
          adminLogo: settings.adminLogo?.url || settings.logo?.url || null,
          favicon: settings.favicon?.url || null
        });
      }
    } catch (error) {
      debugError("Error fetching business settings:", error);
      toast.error(error?.response?.data?.message || "Failed to load business settings");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFileSelect = (key, file) => {
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/x-icon", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Upload PNG, JPG, WEBP, ICO or SVG.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit.");
      return;
    }

    setFiles((prev) => ({ ...prev, [key]: file }));
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviews((prev) => ({ ...prev, [key]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = (key) => {
    setFiles((prev) => ({ ...prev, [key]: null }));
    setPreviews((prev) => ({ ...prev, [key]: null }));
    if (inputRefs[key]?.current) {
      inputRefs[key].current.value = "";
    }
  };

  const handleSave = async () => {
    try {
      const companyName = (formData.companyName || "Raydo").trim();
      const email = (formData.email || "admin@raydo.com").trim();
      const phoneNumber = (formData.phoneNumber || "9999999999").trim();

      setSaving(true);

      const dataToSend = {
        companyName,
        email,
        phoneCountryCode: formData.phoneCountryCode || "+91",
        phoneNumber,
        address: (formData.address || "").trim(),
        state: (formData.state || "").trim(),
        pincode: (formData.pincode || "").trim(),
        region: formData.region || "India",
      };

      const filesToSend = {};
      Object.keys(files).forEach((key) => {
        if (files[key]) {
          filesToSend[key] = files[key];
        }
      });

      const response = await adminAPI.updateBusinessSettings(dataToSend, filesToSend);
      const updatedSettings = response?.data?.data || response?.data;

      if (updatedSettings) {
        setCachedSettings(updatedSettings);

        setPreviews({
          logo: updatedSettings.logo?.url || null,
          userLogo: updatedSettings.userLogo?.url || updatedSettings.logo?.url || null,
          deliveryLogo: updatedSettings.deliveryLogo?.url || updatedSettings.logo?.url || null,
          driverLogo: updatedSettings.driverLogo?.url || updatedSettings.logo?.url || null,
          restaurantLogo: updatedSettings.restaurantLogo?.url || updatedSettings.logo?.url || null,
          adminLogo: updatedSettings.adminLogo?.url || updatedSettings.logo?.url || null,
          favicon: updatedSettings.favicon?.url || null
        });

        setFiles({
          logo: null,
          userLogo: null,
          deliveryLogo: null,
          driverLogo: null,
          restaurantLogo: null,
          adminLogo: null,
          favicon: null
        });
      }

      toast.success("All portal logos & system settings updated successfully!");
      window.dispatchEvent(new CustomEvent("businessSettingsUpdated"));
    } catch (error) {
      debugError("Error saving business settings:", error);
      const errMsg = error?.response?.data?.message || error?.response?.data?.error || error?.message || "Failed to save business settings";
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchBusinessSettings();
    setFiles({
      logo: null,
      userLogo: null,
      deliveryLogo: null,
      driverLogo: null,
      restaurantLogo: null,
      adminLogo: null,
      favicon: null
    });
    Object.values(inputRefs).forEach((ref) => {
      if (ref.current) ref.current.value = "";
    });
    toast.info("Form reset to saved values");
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen font-sans">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Global System Branding & Portal Logos</h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-1">
            Configure dedicated brand logos and icons for User App, Delivery Partner, Taxi Driver, Restaurant Partner, Admin Panel & Favicon.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3 max-w-md">
          <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs lg:text-sm text-slate-700">
            <p className="font-semibold text-amber-700 mb-0.5">Note</p>
            <p>Click &quot;Save All Settings&quot; below to update logos across all platforms instantly.</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Portal Logos Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Portal Logos & Icons Setup</h2>
              <p className="text-xs text-slate-500">Upload custom logo for each portal (User, Driver, Delivery, Restaurant, Admin & Favicon)</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
              7 Portal Assets
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {PORTAL_CONFIG.map((portal) => {
              const PortalIcon = portal.icon;
              const preview = previews[portal.key];
              const ref = inputRefs[portal.key];

              return (
                <div key={portal.key} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 hover:bg-slate-50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center border border-slate-200 text-slate-700">
                          <PortalIcon className="w-4 h-4" />
                        </div>
                        <h3 className="text-xs font-bold text-slate-900">{portal.title}</h3>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${portal.badgeColor}`}>
                        {portal.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mb-3 min-h-[32px]">{portal.subtitle}</p>

                    <input
                      ref={ref}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/x-icon,image/svg+xml"
                      onChange={(e) => handleFileSelect(portal.key, e.target.files?.[0])}
                      className="hidden"
                    />

                    <div
                      onClick={() => ref?.current?.click()}
                      className="border-2 border-dashed border-slate-300 rounded-lg bg-white h-32 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all relative overflow-hidden group shadow-inner"
                    >
                      {preview ? (
                        <>
                          <img
                            src={preview}
                            alt={portal.title}
                            className="w-full h-full object-contain p-2"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(portal.key);
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md z-10"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-3">
                          <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5 group-hover:text-blue-500 transition-colors" />
                          <p className="text-xs font-semibold text-slate-600 group-hover:text-blue-600">Upload {portal.badge}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, WEBP (Max 5MB)</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Company & General Details */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
            Company & System Identity
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Company / Brand Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter Company Name"
                value={formData.companyName}
                maxLength={50}
                onChange={(e) => handleInputChange("companyName", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Support Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                placeholder="Enter Email"
                value={formData.email}
                maxLength={100}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Support Phone Number <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative w-28">
                  <select
                    value={formData.phoneCountryCode}
                    onChange={(e) => handleInputChange("phoneCountryCode", e.target.value)}
                    className="w-full pl-7 pr-4 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="+91">+91 (IN)</option>
                  </select>
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
                <input
                  type="text"
                  placeholder="Enter Phone Number"
                  value={formData.phoneNumber}
                  maxLength={15}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    handleInputChange("phoneNumber", val);
                  }}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Region</label>
              <select
                value={formData.region}
                onChange={(e) => handleInputChange("region", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="India">India</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Address</label>
              <textarea
                rows={2}
                placeholder="Enter Address"
                value={formData.address}
                maxLength={250}
                onChange={(e) => handleInputChange("address", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Changes will be published globally after clicking <span className="font-semibold text-slate-800">Save All Settings</span>.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save All Settings"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
