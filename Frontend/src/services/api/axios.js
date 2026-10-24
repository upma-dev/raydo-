/**
 * Central API client for backend (auth and future APIs).
 * - baseURL from VITE_API_BASE_URL (e.g. http://localhost:5000/api/v1)
 * - When baseURL ends with /api/v1, request paths must NOT include /v1 (use /food/..., /auth/...)
 * - Attaches Bearer token (user or admin based on request URL)
 * - On 401: attempts refresh, retries once; on refresh failure logs out
 */

import axios from "axios";
import { notifyApiError } from "./friendlyApiError";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const resolveApiBaseUrl = () => {
  const envValue =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/$/, "")
      : "";

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!envValue) {
    return origin ? `${origin}/api/v1` : "/api/v1";
  }

  // Strict check: must start with http:// or https:// with dual slashes
  if (/^https?:\/\//i.test(envValue)) {
    try {
      const parsed = new URL(envValue);
      if (typeof window !== "undefined") {
        const isEnvLocal = LOCAL_HOSTS.has(parsed.hostname);
        const isBrowserLocal = LOCAL_HOSTS.has(window.location.hostname);
        if (isEnvLocal && !isBrowserLocal) {
          return `${origin}/api/v1`;
        }
      }
      return envValue;
    } catch (_) { }
  }

  // If envValue is relative or malformed, attach origin in browser
  if (origin) {
    const cleanPath = envValue.replace(/^https?:?\/*/, "/").replace(/^\/+/, "/");
    const path = cleanPath.startsWith("/api") ? cleanPath : "/api/v1";
    return `${origin}${path}`;
  }

  return "/api/v1";
};

// Prefer explicit env. If not set, use same-origin (works with reverse proxy).
const baseURL = resolveApiBaseUrl();

const apiClient = axios.create({
  baseURL: baseURL || undefined,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

function getModuleFromUrl(url = "") {
  const u = typeof url === "string" ? url : (url?.url || "");
  if (!u) return "user";

  const normalized = u.toLowerCase();

  // Public user app endpoints must NEVER trigger admin or restaurant auth redirects on error
  if (
    normalized.includes("/categories/public") ||
    normalized.includes("/food/search/") ||
    normalized.includes("/search/") ||
    normalized.includes("/maintenance/public")
  ) {
    return "user";
  }

  // Admin detection
  if (
    normalized.includes("/admin/") ||
    normalized.includes("/food/admin/") ||
    normalized.includes("/food/auth/admin") ||
    normalized.includes("/auth/admin") ||
    normalized.includes("admin/login") ||
    normalized.includes("/maintenance") ||
    (normalized.includes("/franchise") && !normalized.includes("/franchise/apply"))
  ) return "admin";

  // Delivery detection - Catch all delivery-specific functional and auth routes
  if (
    normalized.includes("/food/delivery") ||
    normalized.includes("/auth/delivery") ||
    normalized.includes("/delivery/")
  ) return "delivery";

  // Restaurant detection - Catch all restaurant-specific functional and auth routes
  if (
    normalized.includes("/food/restaurant/") ||
    normalized.includes("/auth/restaurant") ||
    normalized.includes("/restaurant/")
  ) {
    // Exception: /food/restaurants (plural) is usually a public user app route
    if (normalized.includes("/food/restaurants") && !normalized.includes("/food/restaurant/")) {
      return "user";
    }
    return "restaurant";
  }

  return "user";
}

function getModuleFromConfig(config) {
  if (config?.contextModule) return config.contextModule;
  return getModuleFromUrl(config?.url);
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenForModule(token, module) {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const role = String(payload.role || "").toLowerCase();

  const hasUserId = Boolean(payload.userId || payload.sub);

  if (module === "user") return role === "user" && hasUserId;
  if (module === "admin" || module === "franchise") return ["admin", "subadmin", "superadmin", "super_admin", "franchise", "franchise_partner"].includes(role) && hasUserId;
  if (module === "restaurant") return role === "restaurant" && hasUserId;
  if (module === "delivery") return ["delivery_partner", "delivery"].includes(role) && hasUserId;

  return true;
}

// Franchise partners have their own login slot ("franchise_*"); the platform admin keeps "admin_*". The franchise portal also
// calls admin routes (contextModule "admin"), so inside /food/franchise those calls use the franchise slot too.
function storageModuleFor(module) {
  if (module === "franchise") return "franchise";
  if (module === "admin" && typeof window !== "undefined" && window.location.pathname.startsWith("/food/franchise")) return "franchise";
  return module;
}

function getAccessToken(config) {
  const module = getModuleFromConfig(config);
  const storageModule = storageModuleFor(module);
  const targetModule = storageModule === "franchise" ? "admin" : storageModule;
  const key = `${storageModule}_accessToken`;
  try {
    // 1. Try target module token first
    const moduleToken = localStorage.getItem(key);
    if (moduleToken && isTokenForModule(moduleToken, targetModule)) return moduleToken;

    // 2. Fallback to generic token only if it matches this Food module shape.
    if (targetModule !== "admin") {
      const genericToken = localStorage.getItem("accessToken");
      return genericToken && isTokenForModule(genericToken, targetModule) ? genericToken : null;
    }
    return null;
  } catch {
    return null;
  }
}

function getRefreshToken(module) {
  const targetModule = storageModuleFor(module);
  try {
    // 1. Try module-specific refresh token
    const moduleRefreshToken = localStorage.getItem(`${targetModule}_refreshToken`);
    if (moduleRefreshToken) return moduleRefreshToken;

    // 2. Fallback to generic refresh token only for non-admin modules
    if (targetModule !== "admin" && targetModule !== "franchise") {
      return localStorage.getItem("refreshToken") || null;
    }
    return null;
  } catch {
    return null;
  }
}

function clearModuleAuth(module) {
  const targetModule = storageModuleFor(module);
  try {
    localStorage.removeItem(`${targetModule}_accessToken`);
    localStorage.removeItem(`${targetModule}_refreshToken`);
    localStorage.removeItem(`${targetModule}_authenticated`);
    localStorage.removeItem(`${targetModule}_user`);
  } catch (_) { }
}

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeToRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newToken, module) {
  refreshSubscribers.forEach((cb) => cb(newToken, module));
  refreshSubscribers = [];
}

function onRefreshFailed(module) {
  const targetModule = storageModuleFor(module);
  clearModuleAuth(targetModule);
  // Fail any queued requests that were waiting for this refresh
  refreshSubscribers.forEach((cb) => cb(null, targetModule));
  refreshSubscribers = [];

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("authRefreshFailed", { detail: { module: targetModule } }));
    if (window.location.pathname.includes("/franchise")) {
      window.location.href = "/food/franchise/login";
    } else {
      window.dispatchEvent(new CustomEvent("app:auth-stale", { detail: { role: targetModule || 'user' } }));
    }
  }
}

apiClient.interceptors.request.use(
  (config) => {
    config.contextModule = getModuleFromConfig(config);

    // Inside the admin panel every call carries the admin login, even for /restaurant/... or /delivery/... endpoints
    // (those used to look for a restaurant/delivery login, find none and kick the admin out).
    if (
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/admin") &&
      !config.contextModule?.startsWith?.("admin") &&
      localStorage.getItem("admin_accessToken")
    ) {
      config.contextModule = "admin";
    }

    if (typeof window !== "undefined" && window.location.pathname.includes("/franchise")) {
      config.headers["x-portal-context"] = "franchise";
      const params = new URLSearchParams(window.location.search);
      const urlAppId = params.get("appId") || params.get("franchiseId");
      if (urlAppId && !config.headers["x-franchise-id"]) {
        config.headers["x-franchise-id"] = urlAppId;
      }
    }

    // If sending FormData, let the browser set proper multipart boundary.
    if (config.data instanceof FormData) {
      if (config.headers && config.headers["Content-Type"]) {
        delete config.headers["Content-Type"];
      }
    }

    const token = getAccessToken(config);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (err) => {
    const original = err?.config;
    notifyApiError(err, original);

    // Detect offline network connectivity errors explicitly (status 0 / ERR_NETWORK)
    const isNetworkError =
      !err.response &&
      (err.code === "ERR_NETWORK" || err.message === "Network Error" || (typeof navigator !== "undefined" && !navigator.onLine));

    if (isNetworkError) {
      err.isOffline = true;
      return Promise.reject(err);
    }

    if (err?.response?.status === 503) {
      if (typeof window !== "undefined") {
        const msg = err?.response?.data?.message || "Service is currently under maintenance. Please try again later.";
        window.dispatchEvent(new CustomEvent("app:maintenance-503", { detail: { message: msg } }));
      }
      return Promise.reject(err);
    }

    if (err?.response?.status === 429) {
      return Promise.reject(err);
    }
    if (err?.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(err);
    }
    
    // Do NOT attempt token refresh or trigger onRefreshFailed for authentication endpoints
    // (login, verify-otp, send-otp, signup, etc.) where 401 is a credential validation failure.
    const reqUrl = String(original.url || "").toLowerCase();
    const isAuthEndpoint =
      reqUrl.includes("/auth/") ||
      reqUrl.includes("/login") ||
      reqUrl.includes("/verify-otp") ||
      reqUrl.includes("/send-otp") ||
      reqUrl.includes("/signup") ||
      reqUrl.includes("/register") ||
      reqUrl.includes("/forgot-password");

    if (isAuthEndpoint) {
      return Promise.reject(err);
    }

    // No token was sent = there was no session (guest browsing the user app). A 401 then just means
    // "login required for this call": never show "Session expired" or force a redirect for it.
    const sentAuth = original.headers?.Authorization || original.headers?.authorization;
    if (!sentAuth) {
      return Promise.reject(err);
    }

    const module = original.contextModule || getModuleFromUrl(original.url);
    const refreshToken = getRefreshToken(module);
    if (!refreshToken) {
      onRefreshFailed(module);
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeToRefresh((newToken) => {
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(original));
          } else {
            reject(err);
          }
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // Use plain axios to avoid interceptor recursion.
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const path = (baseURL && baseURL.startsWith("http")) ? `${baseURL}/food/auth/refresh-token` : `${origin}${baseURL || '/api/v1'}/food/auth/refresh-token`;
      const refreshUrl = path.startsWith("http") ? path : `http://localhost:5000${path}`;
      const { data } = await axios.post(refreshUrl, { refreshToken }, { timeout: 10000 });
      const newAccessToken = data?.data?.accessToken || data?.accessToken;
      if (newAccessToken) {
        try {
          localStorage.setItem(`${storageModuleFor(module)}_accessToken`, newAccessToken);
          // Dispatch a custom event specifically for the module that refreshed
          window.dispatchEvent(new CustomEvent("authRefreshed", {
            detail: { module, token: newAccessToken }
          }));
        } catch (_) { }
        onRefreshed(newAccessToken, module);
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(original);
      }
    } catch (refreshErr) {
      // Only a definite "this refresh token is not valid" answer ends the session. A timeout, network blip or 5xx
      // on the refresh call must not log the person out: just fail this one request and let the next one retry.
      const refreshStatus = refreshErr?.response?.status;
      if (refreshStatus === 400 || refreshStatus === 401 || refreshStatus === 403) {
        onRefreshFailed(module);
      } else {
        refreshSubscribers.forEach((cb) => cb(null, module));
        refreshSubscribers = [];
      }
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }

    onRefreshFailed(module);
    return Promise.reject(err);
  }
);

export default apiClient;
