import React, { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, ChevronDown, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { franchiseAPI, apiClient } from "@food/api";

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function loadGoogleMaps(key) {
  return new Promise((resolve) => {
    if (window.google?.maps) return resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    document.head.appendChild(script);
  });
}

export default function FranchiseStep2({ defaultValues, onNext, onBack }) {
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [pincodes, setPincodes] = useState([]);
  const [foodZones, setFoodZones] = useState([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingPincodes, setLoadingPincodes] = useState(false);
  const [loadingZones, setLoadingZones] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [isCustomCity, setIsCustomCity] = useState(false);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const selectedModules = defaultValues?.selectedModules || ['food'];
  const hasFood = selectedModules.includes('food');
  const hasTaxi = selectedModules.some(m => String(m).startsWith('taxi'));

  const [form, setForm] = useState({
    state: defaultValues?.state || '',
    city: defaultValues?.city || '',
    area: defaultValues?.area || '',
    pincode: defaultValues?.pincode || '',
    zoneId: defaultValues?.zoneId || '',
    taxiTerritory: defaultValues?.taxiTerritory || '',
    coordinates: defaultValues?.coordinates || {},
  });
  const [errors, setErrors] = useState({});

  // Load public food zones
  useEffect(() => {
    apiClient.get('/food/landing/zones/public')
      .then(res => {
        const list = res?.data?.data?.zones || res?.data?.zones || [];
        setFoodZones(list);
      })
      .catch(() => {})
      .finally(() => setLoadingZones(false));
  }, []);

  // Load states on mount
  useEffect(() => {
    franchiseAPI.getStates()
      .then(res => { if (res?.data?.data) setStates(res.data.data); })
      .catch(() => {})
      .finally(() => setLoadingStates(false));
  }, []);

  // Load cities when state changes
  useEffect(() => {
    if (!form.state) { setCities([]); return; }
    setLoadingCities(true);
    franchiseAPI.getCities(form.state)
      .then(res => {
        const list = Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];
        if (list.length > 0) {
          setCities(list);
        } else {
          // Fallback cities for major states
          const fallbacks = {
            'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa'],
            'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Kolhapur'],
            'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Gandhinagar'],
            'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer'],
            'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Ghaziabad', 'Noida'],
          };
          setCities(fallbacks[form.state] || ['Bhopal', 'Indore', 'Mumbai', 'Pune', 'Delhi', 'Jaipur']);
        }
      })
      .catch(() => {
        setCities(['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas']);
      })
      .finally(() => setLoadingCities(false));
    setForm(prev => ({ ...prev, city: '', pincode: '' }));
    setPincodes([]);
  }, [form.state]);

  // Load pincodes when city changes
  useEffect(() => {
    if (!form.city) { setPincodes([]); return; }
    setLoadingPincodes(true);
    franchiseAPI.getPincodes(form.city)
      .then(res => { if (Array.isArray(res?.data?.data)) setPincodes(res.data.data); })
      .catch(() => {})
      .finally(() => setLoadingPincodes(false));
    setForm(prev => ({ ...prev, pincode: '' }));
  }, [form.city]);

  // Load Google Maps
  useEffect(() => {
    if (!GMAPS_KEY) return;
    loadGoogleMaps(GMAPS_KEY).then(() => setMapsLoaded(true));
  }, []);

  // Initialize map once loaded
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstanceRef.current) return;

    const defaultCenter = form.coordinates?.lat
      ? { lat: form.coordinates.lat, lng: form.coordinates.lng }
      : { lat: 20.5937, lng: 78.9629 }; // Center of India

    const map = new window.google.maps.Map(mapRef.current, {
      zoom: form.coordinates?.lat ? 13 : 5,
      center: defaultCenter,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2a35" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1827" }] },
      ],
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    const marker = new window.google.maps.Marker({
      position: defaultCenter,
      map,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#315CFF',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
    });

    marker.addListener('dragend', (e) => {
      setForm(prev => ({ ...prev, coordinates: { lat: e.latLng.lat(), lng: e.latLng.lng() } }));
    });

    map.addListener('click', (e) => {
      marker.setPosition(e.latLng);
      setForm(prev => ({ ...prev, coordinates: { lat: e.latLng.lat(), lng: e.latLng.lng() } }));
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // When city changes, geocode city name
    if (form.city && form.state) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: `${form.city}, ${form.state}, India` }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          map.setCenter(loc);
          map.setZoom(11);
          marker.setPosition(loc);
          setForm(prev => ({ ...prev, coordinates: { lat: loc.lat(), lng: loc.lng() } }));
        }
      });
    }
  }, [mapsLoaded]);

  // Geocode when city changes
  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !form.city) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: `${form.city}, ${form.state}, India` }, (results, status) => {
      if (status === 'OK' && results[0] && markerRef.current) {
        const loc = results[0].geometry.location;
        mapInstanceRef.current.setCenter(loc);
        mapInstanceRef.current.setZoom(11);
        markerRef.current.setPosition(loc);
        setForm(prev => ({ ...prev, coordinates: { lat: loc.lat(), lng: loc.lng() } }));
      }
    });
  }, [form.city, mapsLoaded]);

  const handleChange = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.state) e.state = 'Please select a state';
    if (!form.city) e.city = 'Please select a city';
    if (!form.area?.trim()) e.area = 'Area / locality is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) onNext(form);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'white' }}>Location Details</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Select your franchise area — we'll assign the exclusive rights</p>
      </div>

      <div style={{ display: 'grid', gap: 20 }}>
        {/* State Dropdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} style={{ color: '#6895FF' }} /> State <span style={{ color: '#f87171' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <select
                className="input-field"
                style={{ paddingRight: 40, appearance: 'none' }}
                value={form.state}
                onChange={e => handleChange('state', e.target.value)}
                disabled={loadingStates}
              >
                <option value="">{loadingStates ? 'Loading...' : 'Select State'}</option>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
            </div>
            {errors.state && <p className="error-text">{errors.state}</p>}
          </div>

          {/* City Dropdown / Text Input Fallback */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <MapPin size={13} style={{ color: '#6895FF' }} /> City <span style={{ color: '#f87171' }}>*</span>
                {loadingCities && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} />}
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsCustomCity(!isCustomCity);
                  setForm(prev => ({ ...prev, city: '' }));
                }}
                style={{ background: 'none', border: 'none', color: '#6895FF', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                {isCustomCity ? '← Choose from list' : '+ Type custom city'}
              </button>
            </div>

            {isCustomCity ? (
              <input
                className="input-field"
                type="text"
                placeholder="Enter city name (e.g. Indore, Bhopal)"
                value={form.city}
                onChange={e => handleChange('city', e.target.value)}
              />
            ) : (
              <div style={{ position: 'relative' }}>
                <select
                  className="input-field"
                  style={{ paddingRight: 40, appearance: 'none' }}
                  value={form.city}
                  onChange={e => {
                    if (e.target.value === '__custom__') {
                      setIsCustomCity(true);
                      setForm(prev => ({ ...prev, city: '' }));
                    } else {
                      handleChange('city', e.target.value);
                    }
                  }}
                  disabled={!form.state || loadingCities}
                >
                  <option value="">{!form.state ? 'Select state first' : loadingCities ? 'Loading...' : 'Select City'}</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">➕ Other City (Type manually)</option>
                </select>
                <ChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
              </div>
            )}
            {errors.city && <p className="error-text">{errors.city}</p>}
          </div>
        </div>

        {/* Area + Pincode */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label className="label">Area / Locality <span style={{ color: '#f87171' }}>*</span></label>
            <input
              className="input-field"
              type="text"
              placeholder="e.g. Koregaon Park, MG Road"
              value={form.area}
              onChange={e => handleChange('area', e.target.value)}
            />
            {errors.area && <p className="error-text">{errors.area}</p>}
          </div>
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Pincode
              {loadingPincodes && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} />}
            </label>
            {pincodes.length > 0 ? (
              <div style={{ position: 'relative' }}>
                <select
                  className="input-field"
                  style={{ paddingRight: 40, appearance: 'none' }}
                  value={form.pincode}
                  onChange={e => handleChange('pincode', e.target.value)}
                >
                  <option value="">Select Pincode</option>
                  {pincodes.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
              </div>
            ) : (
              <input
                className="input-field"
                type="text"
                placeholder="6-digit pincode"
                maxLength={6}
                value={form.pincode}
                onChange={e => handleChange('pincode', e.target.value.replace(/\D/g, ''))}
              />
            )}
          </div>
        </div>

        {/* Target Food Zone Dropdown (if Food delivery selected) */}
        {hasFood && (
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} style={{ color: '#34d399' }} /> Select Target Food Zone
              {loadingZones && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} />}
            </label>
            <div style={{ position: 'relative' }}>
              <select
                className="input-field"
                style={{ paddingRight: 40, appearance: 'none', borderColor: form.zoneId ? '#34d399' : undefined }}
                value={form.zoneId || ''}
                onChange={e => handleChange('zoneId', e.target.value)}
              >
                <option value="">-- Select Target Food Zone (Auto-assigned on Approval) --</option>
                {foodZones.map(z => (
                  <option key={z._id} value={z._id}>
                    {z.name || z.zoneName} ({z.serviceLocation || z.country || 'Zone'})
                  </option>
                ))}
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              ⚡ SubAdmin level permissions for this food zone will be granted automatically upon application approval.
            </p>
          </div>
        )}

        {/* Target Taxi Zone / Territory Input (if any Taxi submodule selected) */}
        {hasTaxi && (
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} style={{ color: '#FFC400' }} /> Target Taxi Operating Zone / Territory
            </label>
            <input
              className="input-field"
              type="text"
              placeholder="e.g. Pune Central, Highway Route A, District West"
              value={form.taxiTerritory || ''}
              onChange={e => handleChange('taxiTerritory', e.target.value)}
              style={{ borderColor: form.taxiTerritory ? '#FFC400' : undefined }}
            />
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              🚕 Taxi operator permissions for this zone/territory will be provisioned by admin upon approval.
            </p>
          </div>
        )}

        {/* Map */}
        <div>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <MapPin size={13} style={{ color: '#6895FF' }} /> Pin Your Exact Location
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 400, marginLeft: 4 }}>Click or drag the marker</span>
          </label>
          <div
            ref={mapRef}
            style={{
              width: '100%',
              height: 280,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#0d1117',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {!mapsLoaded && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'rgba(255,255,255,0.4)' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Loading map...</span>
              </div>
            )}
          </div>
          {form.coordinates?.lat && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
              📍 {form.coordinates.lat.toFixed(5)}, {form.coordinates.lng.toFixed(5)}
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24 }}>
        <button type="button" className="btn-outline" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button type="submit" className="btn-primary">
          Continue <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
