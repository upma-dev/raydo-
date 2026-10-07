import React from 'react';
import { motion } from 'framer-motion';
import { Percent, Crown, Zap, Star } from 'lucide-react';

export default function PromoRow({ handleVegModeChange, navigate, isVegMode, toggleRef }) {
  const promoCardsData = [
    {
      id: 'offers',
      title: "Hot Deals",
      value: "Offers",
      bgColor: "bg-gradient-to-br from-[#FFFBF2] to-[#FFF1DC]",
      textColor: "text-gray-900 font-black",
      subTextColor: "text-orange-600 font-bold",
      iconBg: "bg-orange-500 text-white shadow-md",
      icon: <Percent className="w-4 h-4 stroke-[3]" />,
    },
    {
      id: 'gourmet',
      title: "Premium",
      value: "Gourmet",
      bgColor: "bg-gradient-to-br from-[#FFFBF2] to-[#FFF1DC]",
      textColor: "text-gray-900 font-extrabold",
      subTextColor: "text-amber-700 font-semibold",
      iconBg: "bg-amber-500 text-white shadow-md",
      icon: <Crown className="w-4 h-4 stroke-[2.5]" />,
    },
    {
      id: 'under-250',
      title: "Under ₹99",
      value: "Switch 99",
      bgColor: "bg-gradient-to-br from-[#FFFBF2] to-[#FFF1DC]",
      textColor: "text-gray-900 font-extrabold",
      subTextColor: "text-emerald-700 font-semibold",
      iconBg: "bg-emerald-500 text-white shadow-md",
      icon: <Zap className="w-4 h-4 fill-white stroke-[2]" />,
    },
    {
      id: 'collections',
      title: "Favorites",
      value: "Collections",
      bgColor: "bg-gradient-to-br from-[#FFFBF2] to-[#FFF1DC]",
      textColor: "text-gray-900 font-extrabold",
      subTextColor: "text-yellow-700 font-semibold",
      iconBg: "bg-yellow-400 text-black shadow-md",
      icon: <Star className="w-4 h-4 fill-black stroke-[2]" />,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2.5 px-3 pt-3.5 pb-4 bg-transparent w-full max-w-[500px] mx-auto">
      {promoCardsData.map((promo, idx) => (
        <motion.div
          key={idx}
          ref={promo.id === 'gourmet' ? toggleRef : null}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.04, duration: 0.35, ease: "easeOut" }}
          whileHover={{ y: -3, scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
          className={`flex flex-col items-center justify-center p-2.5 rounded-[22px] ${promo.bgColor} border border-orange-200/60 shadow-sm hover:shadow-lg cursor-pointer transition-all h-[98px] relative overflow-hidden`}
          onClick={() => {
            if (promo.id === 'gourmet') navigate('/food/user/gourmet');
            else if (promo.id === 'offers') navigate('/food/user/offers');
            else if (promo.id === 'under-250') navigate('/food/user/under-250');
            else if (promo.id === 'collections') navigate('/food/user/profile/favorites');
          }}
        >
          {/* Badge Icon */}
          <div className={`w-8.5 h-8.5 rounded-full ${promo.iconBg} flex items-center justify-center mb-1.5 transition-transform group-hover:scale-110`}>
            {promo.icon}
          </div>

          {/* Title & Subtitle */}
          <span className={`text-[12px] ${promo.textColor} tracking-tight leading-tight text-center drop-shadow-xs`}>
            {promo.value}
          </span>
          <span className={`text-[9.5px] ${promo.subTextColor} text-center leading-tight truncate max-w-full mt-0.5`}>
            {promo.title}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
