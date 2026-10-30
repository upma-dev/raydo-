import { useEffect, useRef, useState } from "react"
import { MapPin, X } from "lucide-react"
import { useLocation } from "@food/hooks/useLocation"

// "Not now" only hides the popup until the app is opened again
const DISMISSED_KEY = "foodLocationPromptDismissed"

const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Every time the app is opened without a working location, it first tries to get the real location by itself (this is what
 * makes the browser / Android ask to allow and turn on location). If that does not work - blocked, or the phone's location
 * is switched off - a small bottom card explains it and lets the user retry with one tap.
 */
export default function LocationPrompt() {
  const { location, loading, error, requestLocation } = useLocation()
  const [permission, setPermission] = useState("unknown") // granted | prompt | denied | unknown
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [open, setOpen] = useState(false)
  const autoTriedRef = useRef(false)

  useEffect(() => {
    let status = null
    let alive = true
    const read = async () => {
      try {
        status = await navigator.permissions.query({ name: "geolocation" })
        if (!alive) return
        setPermission(status.state)
        status.onchange = () => setPermission(status.state)
      } catch {
        // Permissions API not available: the automatic attempt below still asks through the browser
      } finally {
        if (alive) setPermissionChecked(true)
      }
    }
    read()
    return () => {
      alive = false
      if (status) status.onchange = null
    }
  }, [])

  // App opened: if there is no live location yet, go and get it
  useEffect(() => {
    if (!permissionChecked || autoTriedRef.current || readDismissed()) return
    if (permission === "granted" && location) return
    autoTriedRef.current = true

    if (permission === "denied") {
      setOpen(true)
      return
    }
    requestLocation()
      .then(() => setOpen(false))
      .catch(() => setOpen(true))
  }, [permissionChecked, permission, location, requestLocation])

  // Failed later (e.g. device location switched off while the app was open)
  useEffect(() => {
    if (error && !location && !readDismissed()) setOpen(true)
  }, [error, location])

  // Location is working: nothing left to ask
  useEffect(() => {
    if (open && location && permission !== "denied" && !error) setOpen(false)
  }, [open, location, permission, error])

  const handleDismiss = () => {
    setOpen(false)
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // Ignore storage errors: the card just shows again next time
    }
  }

  const handleTurnOn = async () => {
    try {
      await requestLocation()
      try {
        localStorage.setItem("deliveryAddressMode", "current")
        window.dispatchEvent(new Event("deliveryAddressModeChanged"))
      } catch {
        // Ignore storage/event errors; the location itself is already fetched
      }
      setOpen(false)
    } catch {
      // Still blocked / off: the card stays open with the help text
    }
  }

  if (!open) return null

  const blocked = permission === "denied"

  return (
    <div
      className="fixed left-3 right-3 z-[100] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-2xl border border-gray-100"
      style={{ bottom: "max(env(safe-area-inset-bottom), 16px)" }}
      role="dialog"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 p-1.5 text-gray-400"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="h-10 w-10 shrink-0 rounded-full bg-orange-50 flex items-center justify-center">
          <MapPin className="h-5 w-5 text-primary-orange" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">Turn on location</p>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            {blocked
              ? "Location is blocked for this app. Open your browser's site settings, allow Location, then tap Try again."
              : "We need your location to show nearby restaurants and deliver to your exact spot. Make sure your phone's location is on."}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={handleTurnOn}
          disabled={loading}
          className="flex-1 h-10 rounded-xl bg-primary-orange text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Getting location..." : blocked ? "Try again" : "Turn on"}
        </button>
      </div>
    </div>
  )
}
