import React from "react";

export default function GooglePlayBadge({
  url = "#",
  className = "",
  size = "normal" // "normal" | "large" | "compact"
}) {
  const isLarge = size === "large";
  const isCompact = size === "compact";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (url === "#") {
          e.preventDefault();
          alert("Play Store Link will be available soon!");
        }
      }}
      className={`inline-flex items-center gap-3 bg-slate-950 hover:bg-slate-900 border border-slate-700/80 hover:border-slate-500 text-white rounded-xl shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer ${
        isLarge
          ? "px-5 py-3"
          : isCompact
          ? "px-3 py-1.5"
          : "px-4 py-2.5"
      } ${className}`}
    >
      {/* Official Google Play Store Vector Icon */}
      <svg
        className={isLarge ? "w-7 h-7" : isCompact ? "w-4 h-4" : "w-6 h-6"}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M99.467 16.021C92.203 23.36 88 34.629 88 49.333v413.334c0 14.704 4.203 25.973 11.467 33.312l1.666 1.547L333.6 265.056v-4.112L101.133 14.474l-1.666 1.547z"
          fill="url(#play_a)"
        />
        <path
          d="M414.267 184.427l-80.667 80.629v-4.112l80.667 80.629 1.866-1.066 95.734-54.4c27.333-15.52 27.333-40.96 0-56.48l-95.734-54.4-1.866-0.8z"
          fill="url(#play_b)"
        />
        <path
          d="M335.2 260.944L255.467 181.2 99.467 16.021C108.533 6.944 122.933 1.867 139.733 11.413l274.534 156.054-79.067 93.477z"
          fill="url(#play_c)"
        />
        <path
          d="M335.2 260.944l79.067 93.477-274.534 156.054c-16.8 9.546-31.2 4.469-40.267-4.608L255.467 340.688 335.2 260.944z"
          fill="url(#play_d)"
        />
        <defs>
          <linearGradient
            id="play_a"
            x1="219.04"
            y1="40.64"
            x2="38.74"
            y2="220.94"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#00A0FF" />
            <stop offset="1" stopColor="#00EAFF" />
          </linearGradient>
          <linearGradient
            id="play_b"
            x1="520.4"
            y1="260.94"
            x2="85.4"
            y2="260.94"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFCC00" />
            <stop offset="1" stopColor="#FFAA00" />
          </linearGradient>
          <linearGradient
            id="play_c"
            x1="284.14"
            y1="232.22"
            x2="114.77"
            y2="62.86"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF3A44" />
            <stop offset="1" stopColor="#C31162" />
          </linearGradient>
          <linearGradient
            id="play_d"
            x1="114.77"
            y1="459.03"
            x2="284.14"
            y2="289.66"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#00E676" />
            <stop offset="1" stopColor="#00B0FF" />
          </linearGradient>
        </defs>
      </svg>

      {/* Badge Text */}
      <div className="flex flex-col text-left leading-none">
        <span
          className={`uppercase font-bold tracking-wider text-slate-300 ${
            isLarge ? "text-[10px]" : isCompact ? "text-[8px]" : "text-[9px]"
          }`}
        >
          GET IT ON
        </span>
        <span
          className={`font-black tracking-tight text-white ${
            isLarge ? "text-base mt-0.5" : isCompact ? "text-xs mt-0.5" : "text-sm mt-0.5"
          }`}
        >
          Google Play
        </span>
      </div>
    </a>
  );
}
