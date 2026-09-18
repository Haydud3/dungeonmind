import React from 'react';

const RollButton = ({ 
    onClick, 
    children, 
    type = 'hit', 
    title, 
    disabled = false,
    className = ''
}) => {
    let baseStyles = "h-7 px-2.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center justify-center gap-1 truncate shadow-sm active:scale-95 cursor-pointer ";
    let colorStyles = "";

    switch (type) {
        case 'hit':
        case 'skill':
        case 'save':
            colorStyles = "bg-slate-900 hover:bg-amber-500/20 text-amber-300 hover:text-amber-100 border border-amber-500/40 hover:border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)]";
            break;
        case 'dmg':
            colorStyles = "bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 border border-rose-800/50 hover:border-rose-500";
            break;
        case 'heal':
            colorStyles = "bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-emerald-100 border border-emerald-800/50 hover:border-emerald-500";
            break;
        case 'use':
        case 'action':
            baseStyles = "h-7 px-3 rounded-lg text-xs font-bold uppercase transition-all shadow-md active:scale-95 cursor-pointer ";
            colorStyles = "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-[0_0_12px_rgba(245,158,11,0.25)]";
            break;
        default:
            colorStyles = "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500";
    }

    if (disabled) {
        colorStyles = "bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-50 shadow-none";
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                if (!disabled && onClick) {
                    e.stopPropagation();
                    onClick(e);
                }
            }}
            disabled={disabled}
            className={`${baseStyles} ${colorStyles} ${className}`}
            title={title}
        >
            {children}
        </button>
    );
};

export default RollButton;
