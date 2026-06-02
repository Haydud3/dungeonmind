import React from 'react';

const RollButton = ({ 
    onClick, 
    children, 
    type = 'hit', 
    title, 
    disabled = false,
    className = ''
}) => {
    let baseStyles = "h-7 px-2 rounded text-xs font-bold font-mono transition-colors flex items-center justify-center truncate ";
    let colorStyles = "";

    switch (type) {
        case 'hit':
        case 'skill':
        case 'save':
            colorStyles = "bg-slate-700 hover:bg-cyan-900 text-cyan-200 border border-slate-600 hover:border-cyan-500";
            break;
        case 'dmg':
        case 'heal':
            colorStyles = "bg-slate-700 hover:bg-indigo-900 text-indigo-200 border border-slate-600 hover:border-indigo-500";
            break;
        case 'use':
        case 'action':
            baseStyles = "h-7 px-3 rounded text-xs font-bold uppercase transition-colors shadow-md "; // Not mono
            colorStyles = "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500";
            break;
        default:
            colorStyles = "bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 hover:border-slate-400";
    }

    if (disabled) {
        colorStyles = "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50";
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                if (!disabled && onClick) {
                    e.stopPropagation(); // Always prevent row expansion when clicking a button
                    onClick(e);
                }
            }}
            disabled={disabled}
            className={`${baseStyles} ${colorStyles} ${className}`}
            title={title}
        >
            {children}
        </button>
    );};

export default RollButton;
