import React from 'react';
import Icon from '../Icon';

export const ToolButton = ({ name, icon, isActive, onClick, isStandalone = false, title }) => {
    const baseClasses = isStandalone 
        ? "w-10 h-10 flex-shrink-0 backdrop-blur rounded-xl border shadow-2xl flex items-center justify-center transition-all hover:scale-105"
        : "w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center transition-colors";

    const colorClasses = isStandalone
        ? (isActive ? 'bg-indigo-900/80 border-indigo-500 text-indigo-300' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-indigo-500 hover:bg-slate-800')
        : (isActive ? 'bg-slate-700 text-amber-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white');

    return (
        <button onClick={onClick} className={`${baseClasses} ${colorClasses}`} title={title || name.charAt(0).toUpperCase() + name.slice(1)}>
            <Icon name={icon} size={18} />
        </button>
    );
};