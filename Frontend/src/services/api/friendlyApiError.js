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

export const notifyApiError = (error, config = error?.config) => {
  try {
    if (config?.silentError) return;
    const method = String(config?.method || "get").toLowerCase();
    if (method === "get" || method === "head") return;
    const message = getFriendlyApiMessage(error);
    if (message && typeof window !== "undefined") {
      toast.error(message, { id: `api-error-${message}` });
    }
  } catch {
    /* a failed toast must never break the request flow */
  }
};
