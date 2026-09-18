import React from 'react';

const DungeonmindLogo = ({ size = 40, className = "" }) => {
    return (
        <div 
            className={`relative flex items-center justify-center select-none group ${className}`}
            style={{ width: size, height: size }}
            title="Dungeonmind • Virtual Tabletop"
        >
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-amber-500/25 rounded-2xl blur-md group-hover:bg-amber-400/40 transition-all duration-300" />

            {/* Emblem SVG */}
            <svg 
                viewBox="0 0 100 100" 
                className="w-full h-full relative z-10 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] transition-transform duration-300 group-hover:scale-105"
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Outer Bezel Gradient */}
                    <linearGradient id="dm-bezel" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="40%" stopColor="#b45309" />
                        <stop offset="70%" stopColor="#78350f" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>

                    {/* Shield Obsidian Gradient */}
                    <radialGradient id="dm-obsidian" cx="50%" cy="40%" r="60%">
                        <stop offset="0%" stopColor="#2e1017" />
                        <stop offset="60%" stopColor="#130914" />
                        <stop offset="100%" stopColor="#080309" />
                    </radialGradient>

                    {/* Facet Light Glow */}
                    <linearGradient id="dm-facet-top" x1="50%" y1="0%" x2="50%" y2="100%">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#d97706" stopOpacity="0.4" />
                    </linearGradient>

                    <linearGradient id="dm-facet-mid" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#92400e" stopOpacity="0.3" />
                    </linearGradient>
                </defs>

                {/* Outer Shield Frame */}
                <rect 
                    x="6" 
                    y="6" 
                    width="88" 
                    height="88" 
                    rx="24" 
                    fill="url(#dm-obsidian)" 
                    stroke="url(#dm-bezel)" 
                    strokeWidth="3.5" 
                />

                {/* Inner Runic Inset Border */}
                <rect 
                    x="12" 
                    y="12" 
                    width="76" 
                    height="76" 
                    rx="18" 
                    stroke="#f59e0b" 
                    strokeWidth="1" 
                    strokeOpacity="0.3" 
                    strokeDasharray="4 3" 
                />

                {/* Corner Cardinal Diamond Accents */}
                <polygon points="50,9 52.5,12 50,15 47.5,12" fill="#fbbf24" />
                <polygon points="50,85 52.5,88 50,91 47.5,88" fill="#fbbf24" />
                <polygon points="9,50 12,47.5 15,50 12,52.5" fill="#fbbf24" />
                <polygon points="85,50 88,47.5 91,50 88,52.5" fill="#fbbf24" />

                {/* Faceted Arcane D20 Emblem */}
                <g transform="translate(0, 1)">
                    {/* Top Facet */}
                    <polygon 
                        points="50,22 74,38 26,38" 
                        fill="url(#dm-facet-top)" 
                        stroke="#fef3c7" 
                        strokeWidth="1.2" 
                        strokeLinejoin="round" 
                    />

                    {/* Central Facet */}
                    <polygon 
                        points="26,38 74,38 50,72" 
                        fill="url(#dm-facet-mid)" 
                        stroke="#fde68a" 
                        strokeWidth="1.2" 
                        strokeLinejoin="round" 
                    />

                    {/* Left Lower Facet */}
                    <polygon 
                        points="26,38 50,72 20,64" 
                        fill="#b45309" 
                        fillOpacity="0.5" 
                        stroke="#f59e0b" 
                        strokeWidth="1.2" 
                        strokeLinejoin="round" 
                    />

                    {/* Right Lower Facet */}
                    <polygon 
                        points="74,38 50,72 80,64" 
                        fill="#78350f" 
                        fillOpacity="0.7" 
                        stroke="#f59e0b" 
                        strokeWidth="1.2" 
                        strokeLinejoin="round" 
                    />

                    {/* Left Upper Facet */}
                    <polygon 
                        points="50,22 26,38 20,64" 
                        fill="#d97706" 
                        fillOpacity="0.4" 
                        stroke="#f59e0b" 
                        strokeWidth="1" 
                        strokeLinejoin="round" 
                    />

                    {/* Right Upper Facet */}
                    <polygon 
                        points="50,22 74,38 80,64" 
                        fill="#92400e" 
                        fillOpacity="0.6" 
                        stroke="#f59e0b" 
                        strokeWidth="1" 
                        strokeLinejoin="round" 
                    />

                    {/* Bottom Apex Facet */}
                    <polygon 
                        points="50,72 20,64 50,82" 
                        fill="#78350f" 
                        fillOpacity="0.6" 
                        stroke="#d97706" 
                        strokeWidth="1" 
                        strokeLinejoin="round" 
                    />

                    <polygon 
                        points="50,72 80,64 50,82" 
                        fill="#451a03" 
                        fillOpacity="0.8" 
                        stroke="#d97706" 
                        strokeWidth="1" 
                        strokeLinejoin="round" 
                    />

                    {/* Center Core Runic Crown Glow */}
                    <circle cx="50" cy="48" r="4" fill="#fffbeb" opacity="0.9" filter="blur(0.5px)" />
                </g>
            </svg>
        </div>
    );
};

export default DungeonmindLogo;

