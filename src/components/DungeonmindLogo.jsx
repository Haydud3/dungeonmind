import React from 'react';

const DungeonmindLogo = ({ size = 40, className = "" }) => {
    return (
        <div 
            className={`relative flex items-center justify-center select-none group shrink-0 ${className}`}
            style={{ width: size, height: size }}
            title="DungeonMind • Virtual Tabletop"
        >
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-amber-500/30 rounded-xl blur-sm group-hover:bg-amber-400/50 transition-all duration-300" />

            {/* New Concept 1 Emblem Image */}
            <img 
                src={`${import.meta.env.BASE_URL}logo.png`} 
                alt="DungeonMind" 
                className="w-full h-full relative z-10 rounded-xl object-cover border border-amber-500/40 shadow-[0_4px_12px_rgba(0,0,0,0.8)] transition-transform duration-300 group-hover:scale-105"
            />
        </div>
    );
};

export default DungeonmindLogo;
