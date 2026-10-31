import { toast } from "sonner";

/**
 * Turns an axios failure into a short message a user can act on, and shows it once.
 * Only submit-type requests (POST/PUT/PATCH/DELETE) are announced, so background GET polling never spams toasts.
 * Validation (400/422) and auth (401/403) errors are left to the screen / auth flow that made the call.
 * Opt out per request with `{ silentError: true }`.
 */
export const getFriendlyApiMessage = (error) => {
  if (!error) return "";
  const status = Number(error?.response?.status || error?.status || 0);

  if (error?.code === "ECONNABORTED" || /timeout/i.test(String(error?.message || ""))) {
    return "This is taking longer than expected. Please check your internet connection and try again.";
  }
  if (!error?.response && !status) {
    return "No internet connection. Please check your network and try again.";
  }
  if (status === 413) return "The file is too large. Please choose a smaller file and try again.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return "";
};

// Calls the app makes by itself while a screen loads or runs (location pings, push-token sync, presence). Nobody tapped
// anything, so a toast would only flash a scary error; the screens that need the result handle it themselves.
const BACKGROUND_REQUEST = /\/availability(\?|$)|\/fcm-tokens?\/|\/heartbeat|\/ping(\?|$)/i;

const FRIENDLY_FALLBACK = "Something went wrong. Please try again.";
const RAW_AXIOS_MESSAGE = /^(Request failed with status code \d+|timeout of \d+ms exceeded)$/i;

/**
 * Screens often show `error.message` / `error.response.data.message` as-is. Replace the technical text (axios
 * "Request failed with status code 502", timeouts, raw 5xx bodies) with a friendly one so users never see it.
 * "Network Error" is left alone because many screens detect offline mode by that exact text.
 * 503 keeps its body: the maintenance banner shows the server's own message.
 */
export const sanitizeApiError = (error) => {
  try {
    if (!error || typeof error !== "object") return error;
    const status = Number(error?.response?.status || 0);
    const friendly = getFriendlyApiMessage(error) || FRIENDLY_FALLBACK;

    if (RAW_AXIOS_MESSAGE.test(String(error.message || ""))) {
      error.message = friendly;
    }
    if (status >= 500 && status !== 503) {
      const data = error.response.data;
      if (data && typeof data === "object") {
        if ("message" in data || "error" in data || !Object.keys(data).length) {
          data.message = friendly;
          if ("error" in data) data.error = friendly;
        }
      } else {
        error.response.data = { message: friendly };
      }
    }
  } catch {
    /* sanitising must never break the request flow */
  }
  return error;
};

export const notifyApiError = (error, config = error?.config) => {
  try {
    sanitizeApiError(error);
    if (config?.silentError) return;
    if (BACKGROUND_REQUEST.test(String(config?.url || ""))) return;
    const method = String(config?.method || "get").toLowerCase();
    if (method === "get" || method === "head") return;
    // Server / timeout / network hiccups (slow response, 5xx, offline) are never shown as a toast: users saw
    // "server not responding" pop up on actions like Cancel even though the action went through.
    const status = Number(error?.response?.status || error?.status || 0);
    const isTransient =
      error?.code === "ECONNABORTED" ||
      /timeout/i.test(String(error?.message || "")) ||
      (!error?.response && !status) ||
      status >= 500;
    if (isTransient) return;
    const message = getFriendlyApiMessage(error);
    if (message && typeof window !== "undefined") {
      toast.error(message, { id: `api-error-${message}` });
    }
  } catch {
    /* a failed toast must never break the request flow */
  }
};
