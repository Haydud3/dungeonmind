import React from 'react';
import Icon from '../Icon';

export const ToolButton = ({ 
    name, 
    icon, 
    isActive, 
    onClick, 
    isStandalone = false, 
    title,
    badge,
    variant = 'default' // 'default' | 'danger' | 'combat'
}) => {
    const isCombatOrDanger = variant === 'danger' || variant === 'combat' || name === 'Combat' || icon === 'swords';

    const baseClasses = isStandalone 
        ? "w-10 h-10 flex-shrink-0 backdrop-blur-md rounded-xl border shadow-xl flex items-center justify-center transition-all duration-200 active:scale-95 group relative"
        : "w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 group relative";

    let colorClasses = '';

    if (isStandalone) {
        if (isActive) {
            if (isCombatOrDanger) {
                colorClasses = 'bg-gradient-to-b from-rose-500/25 to-slate-950 border-rose-500 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.35)] ring-1 ring-rose-400/60';
            } else {
                colorClasses = 'bg-gradient-to-b from-amber-500/25 to-slate-950 border-amber-400/90 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.35)] ring-1 ring-amber-400/60';
            }
        } else {
            colorClasses = 'bg-slate-900/80 border-slate-700/70 text-slate-300 hover:text-white hover:border-amber-500/60 hover:bg-slate-800/90 hover:shadow-[0_0_10px_rgba(245,158,11,0.15)]';
        }
    } else {
        // Submenu button
        if (isActive) {
            colorClasses = 'bg-amber-500/20 border border-amber-500/60 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)] font-bold';
        } else {
            colorClasses = 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 hover:border-slate-700 border border-transparent';
        }
    }

    const displayTitle = title || (name ? name.charAt(0).toUpperCase() + name.slice(1) : '');

    return (
        <button 
            type="button"
            onClick={onClick} 
            className={`${baseClasses} ${colorClasses}`} 
            title={displayTitle}
        >
            <Icon 
                name={icon} 
                size={18} 
                className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} 
            />
            {badge !== undefined && badge !== null && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center shadow-md">
                    {badge}
                </span>
            )}
        </button>
    );
};