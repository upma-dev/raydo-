import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Check, ChevronRight, Loader2, Star, BusFront, SlidersHorizontal, MapPin, Moon, X,
  Wifi, Plug, BedDouble, Droplets, Snowflake, Tv, Armchair, ShieldCheck, Lightbulb,
} from 'lucide-react';
import userBusService from '../../services/busService';
import {
  formatTravelDate, formatDurationBrief, arrivesNextDay, slotOf, DEPARTURE_SLOTS, coachTags,
  isAc, isNonAc, isSleeper, isSeater, boardingAndDropping, hasFreeCancellation,
} from './busUtils';

const SORT_OPTIONS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'price-desc', label: 'Price: High to Low' },
  { id: 'departure-asc', label: 'Earliest departure' },
  { id: 'departure-desc', label: 'Latest departure' },
  { id: 'rating-desc', label: 'Top rated' },
  { id: 'seats-desc', label: 'Most seats available' },
];

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const company = (bus) => String(bus?.operator || bus?.operatorName || bus?.busName || '').trim();
const depMinutes = (bus) => {
  const m = String(bus?.departure || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.MAX_SAFE_INTEGER;
};

const AMENITY_ICON = [
  [/wifi|wi-fi/i, Wifi], [/charg|plug|usb/i, Plug], [/blanket|pillow|bed|sleep/i, BedDouble], [/water/i, Droplets],
  [/a\.?c|air/i, Snowflake], [/tv|movie|entertain/i, Tv], [/reclin|seat/i, Armchair], [/cctv|safety|track|gps/i, ShieldCheck], [/light|reading/i, Lightbulb],
];
const amenityIcon = (name) => (AMENITY_ICON.find(([re]) => re.test(name)) || [null, Check])[1];

const FILTERS = [
  { id: 'ac', label: 'AC', test: isAc },
  { id: 'nonac', label: 'Non-AC', test: isNonAc },
  { id: 'sleeper', label: 'Sleeper', test: isSleeper },
  { id: 'seater', label: 'Seater', test: isSeater },
  { id: 'free', label: 'Free cancellation', test: hasFreeCancellation },
  { id: 'top', label: 'Rated 4+', test: (b) => num(b.ratingCount) > 0 && num(b.rating) >= 4 },
];

const BusList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { fromCity, toCity, date } = state;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buses, setBuses] = useState([]);
  const [sortBy, setSortBy] = useState('recommended');
  const [activeFilters, setActiveFilters] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!fromCity || !toCity || !date) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return undefined;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.searchBuses({ fromCity, toCity, date });
        if (active) setBuses(Array.isArray(response?.data?.results) ? response.data.results : []);
      } catch (err) {
        if (active) setError(err?.message || 'Failed to search buses');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [date, fromCity, navigate, routePrefix, toCity]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [menuOpen]);

  const companies = useMemo(() => [...new Set(buses.map(company).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [buses]);

  const visible = useMemo(() => {
    const filters = FILTERS.filter((f) => activeFilters.includes(f.id));
    const list = buses.filter((bus) => {
      if (!filters.every((f) => f.test(bus))) return false;
      if (slots.length && !slots.includes(slotOf(bus.departure))) return false;
      if (selectedCompany !== 'all' && company(bus) !== selectedCompany) return false;
      return true;
    });
    const sorters = {
      'price-asc': (a, b) => num(a.price, Infinity) - num(b.price, Infinity),
      'price-desc': (a, b) => num(b.price) - num(a.price),
      'departure-asc': (a, b) => depMinutes(a) - depMinutes(b),
      'departure-desc': (a, b) => depMinutes(b) - depMinutes(a),
      'rating-desc': (a, b) => num(b.rating) - num(a.rating) || num(b.ratingCount) - num(a.ratingCount),
      'seats-desc': (a, b) => num(b.availableSeats) - num(a.availableSeats),
    };
    return sorters[sortBy] ? [...list].sort(sorters[sortBy]) : list;
  }, [buses, activeFilters, slots, selectedCompany, sortBy]);

  const cheapest = useMemo(() => (visible.length ? Math.min(...visible.map((b) => num(b.price, Infinity))) : 0), [visible]);
  const filtersOn = activeFilters.length > 0 || slots.length > 0 || selectedCompany !== 'all';
  const clearAll = () => { setActiveFilters([]); setSlots([]); setSelectedCompany('all'); setSortBy('recommended'); };
  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const chip = (on) => `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${on ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-700'}`;

  return (
    <div className="min-h-screen max-w-lg mx-auto bg-slate-50 font-sans pb-10">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 pb-3 pt-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white active:scale-95">
            <ArrowLeft size={18} className="text-slate-900" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-black text-slate-900">{fromCity} <span className="text-slate-300">→</span> {toCity}</h1>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              {formatTravelDate(date)} · {loading ? 'Searching...' : `${visible.length} bus${visible.length === 1 ? '' : 'es'}${filtersOn ? ' (filtered)' : ''}`}
              {!loading && cheapest > 0 && Number.isFinite(cheapest) ? ` · from ₹${cheapest.toLocaleString('en-IN')}` : ''}
            </p>
          </div>
        </div>

        {!loading && !error && buses.length > 0 && (
          <div ref={menuRef} className="relative mt-3">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button type="button" onClick={() => setMenuOpen((o) => !o)} className={chip(menuOpen || sortBy !== 'recommended' || selectedCompany !== 'all')}>
                <SlidersHorizontal size={13} /> Sort{selectedCompany !== 'all' ? ' · Operator' : ''}
              </button>
              {FILTERS.map((f) => (
                <button key={f.id} type="button" onClick={() => toggle(activeFilters, setActiveFilters, f.id)} className={chip(activeFilters.includes(f.id))}>{f.label}</button>
              ))}
              {filtersOn && <button type="button" onClick={clearAll} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-bold text-white"><X size={12} /> Clear</button>}
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {DEPARTURE_SLOTS.map((s) => (
                <button key={s.id} type="button" onClick={() => toggle(slots, setSlots, s.id)} className={chip(slots.includes(s.id))}>
                  {s.label} <span className="font-semibold text-slate-400">{s.hint}</span>
                </button>
              ))}
            </div>

            {menuOpen && (
              <div className="absolute left-0 top-[calc(100%+0.25rem)] z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Sort by</p>
                {SORT_OPTIONS.map((o) => (
                  <button key={o.id} type="button" onClick={() => { setSortBy(o.id); setMenuOpen(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold ${sortBy === o.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                    {o.label}{sortBy === o.id && <Check size={14} />}
                  </button>
                ))}
                {companies.length > 1 && (
                  <>
                    <div className="mx-1 my-2 h-px bg-slate-100" />
                    <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Bus operator</p>
                    <div className="max-h-48 overflow-y-auto">
                      {['all', ...companies].map((c) => (
                        <button key={c} type="button" onClick={() => { setSelectedCompany(c); setMenuOpen(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold ${selectedCompany === c ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                          <span className="truncate pr-3">{c === 'all' ? 'All operators' : c}</span>{selectedCompany === c && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 pt-4">
        {loading && (
          <div className="rounded-3xl border border-slate-100 bg-white p-12 shadow-sm">
            <Loader2 size={32} className="mx-auto animate-spin text-slate-400" />
            <p className="mt-4 text-center text-sm font-bold text-slate-400">Finding available buses...</p>
          </div>
        )}
        {!loading && error && <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-600">{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-sm">
            <BusFront size={36} className="mx-auto text-slate-300" />
            <h2 className="mt-3 text-lg font-bold text-slate-900">No buses found</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{filtersOn ? 'No bus matches these filters.' : 'No bus runs on this route for the selected date. Try another date.'}</p>
            {filtersOn && <button onClick={clearAll} className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white">Clear filters</button>}
          </div>
        )}

        {!loading && !error && visible.map((bus, index) => {
          const rated = num(bus.ratingCount) > 0;
          const tags = coachTags(bus);
          const { boarding, dropping } = boardingAndDropping(bus);
          const amenities = Array.isArray(bus.amenities) ? bus.amenities : [];
          const seatsLeft = num(bus.availableSeats);
          const soldOut = seatsLeft <= 0;
          const nextDay = arrivesNextDay(bus.departure, bus.arrival);

          return (
            <motion.button
              key={bus.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 8) * 0.04 }}
              onClick={() => navigate(`${routePrefix}/bus/details`, { state: { ...state, bus } })}
              className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm active:scale-[0.99]"
            >
              {/* Operator + rating */}
              <div className="flex items-start justify-between gap-3 px-4 pt-4">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-black text-slate-900">{company(bus) || 'Bus operator'}</h3>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{bus.busName ? `${bus.busName} · ` : ''}{bus.type || 'Bus'}</p>
                </div>
                {rated ? (
                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-white">
                    <Star size={12} className="fill-current" />
                    <span className="text-xs font-black">{num(bus.rating).toFixed(1)}</span>
                    <span className="text-[10px] font-semibold text-white/80">({num(bus.ratingCount)})</span>
                  </div>
                ) : (
                  <span className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">NEW</span>
                )}
              </div>

              {/* Timing */}
              <div className="mt-3 flex items-center gap-3 px-4">
                <div>
                  <p className="text-xl font-black leading-none text-slate-900">{bus.departure || '--:--'}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{fromCity}</p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <span className="text-[11px] font-bold text-slate-500">{formatDurationBrief(bus.duration) || 'Direct'}</span>
                  <div className="my-1 h-px w-full bg-slate-300" />
                </div>
                <div className="text-right">
                  <p className="text-xl font-black leading-none text-slate-900">
                    {bus.arrival || '--:--'}{nextDay && <sup className="ml-0.5 text-[10px] font-black text-rose-500">+1</sup>}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{toCity}</p>
                </div>
              </div>

              {/* Boarding / dropping */}
              {(boarding || dropping) && (
                <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                  <MapPin size={13} className="shrink-0 text-red-500" />
                  <span className="truncate">{boarding || 'Boarding point'}</span>
                  <ChevronRight size={12} className="shrink-0 text-slate-300" />
                  <span className="truncate">{dropping || 'Dropping point'}</span>
                </div>
              )}

              {/* Coach tags */}
              <div className="mt-3 flex flex-wrap gap-1.5 px-4">
                {tags.map((t) => <span key={t} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-700">{t}</span>)}
                {nextDay && <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700"><Moon size={10} /> Overnight</span>}
                {hasFreeCancellation(bus) && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">Free cancellation</span>}
                {num(bus.ratingCount) > 0 && num(bus.rating) >= 4.5 && <span className="rounded-md bg-pink-50 px-2 py-0.5 text-[10px] font-black text-pink-600">Highly rated</span>}
              </div>

              {/* Amenities */}
              {amenities.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-[11px] font-semibold text-slate-500">
                  {amenities.slice(0, 4).map((a) => {
                    const Icon = amenityIcon(a);
                    return <span key={a} className="inline-flex items-center gap-1"><Icon size={12} className="text-slate-400" />{a}</span>;
                  })}
                  {amenities.length > 4 && <span className="font-black text-slate-700">+{amenities.length - 4} more</span>}
                </div>
              )}

              {/* Price + seats */}
              <div className="mt-3 flex items-end justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                <div>
                  <p className={`text-xs font-black ${soldOut ? 'text-rose-600' : seatsLeft <= 5 ? 'text-orange-600' : 'text-emerald-700'}`}>
                    {soldOut ? 'Sold out' : seatsLeft <= 5 ? `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left` : `${seatsLeft} seats available`}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">Taxes included</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Starting from</p>
                  <p className="text-2xl font-black leading-none text-slate-900">₹{num(bus.price).toLocaleString('en-IN')}</p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default BusList;
