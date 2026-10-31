import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Plane, ShieldCheck, Route, LifeBuoy, Sparkles } from 'lucide-react';

const ESSENTIALS = [
  // AIRPORT rides disabled for now:
  // {
  //   title: 'Airport rides',
  //   sub: 'Fixed pickup, on-time cabs',
  //   path: '/taxi/user/cab/airport',
  //   icon: Plane,
  //   chip: 'bg-sky-100 text-sky-600',
  //   glow: 'from-sky-100/80',
  // },
  {
    title: 'Intercity trips',
    sub: 'Outstation, one-way or round',
    path: '/taxi/user/intercity',
    icon: Route,
    chip: 'bg-violet-100 text-violet-600',
    glow: 'from-violet-100/80',
  },
  {
    title: 'Safety & SOS',
    sub: 'Trusted contacts for emergencies',
    path: '/taxi/user/safety/sos',
    icon: ShieldCheck,
    chip: 'bg-emerald-100 text-emerald-600',
    glow: 'from-emerald-100/80',
  },
  {
    title: 'Help centre',
    sub: 'Chat with us about any ride',
    path: '/taxi/user/support/tickets',
    icon: LifeBuoy,
    chip: 'bg-amber-100 text-amber-600',
    glow: 'from-amber-100/80',
  },
];

const RideEssentials = ({ plain = false }) => {
  const navigate = useNavigate();
  const containerClass = plain
    ? 'relative z-10 px-5 mt-1'
    : 'mx-5 my-4 relative';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={containerClass}
    >
      <div className="mb-4 ml-1">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} className="text-[#FF6B00]" />
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#FF6B00]">Ride essentials</span>
        </div>
        <h2 className="text-[19px] font-black text-slate-800 tracking-tight mt-0.5">Go further, stay safe</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ESSENTIALS.map(({ title, sub, path, icon: Icon, chip, glow }) => (
          <motion.button
            key={title}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(path)}
            className="group relative overflow-hidden rounded-[22px] border border-blue-200/70 bg-[#E3EEFF] p-4 text-left shadow-[0_10px_26px_rgba(15,23,42,0.06)] min-h-[132px] flex flex-col justify-between"
          >
            <div className={`pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br ${glow} to-transparent opacity-80`} />
            <div className="relative flex items-start justify-between">
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ${chip}`}>
                <Icon size={19} strokeWidth={2.4} />
              </div>
              <ArrowUpRight size={15} className="text-slate-300 group-hover:text-slate-600 transition-colors" />
            </div>
            <div className="relative mt-4">
              <h3 className="text-[14px] font-black text-slate-800 leading-tight">{title}</h3>
              <p className="mt-1 text-[10px] font-semibold text-slate-400 leading-snug">{sub}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};

export default RideEssentials;
