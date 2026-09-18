import React from 'react';

const StatBox = ({ label, value, subLabel, onClick, highlight = false }) => (
  <div 
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer transition-all shadow-sm
      ${highlight 
        ? 'bg-amber-950/40 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.2)] text-amber-200' 
        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'}
    `}
  >
    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{label}</span>
    <span className="text-xl md:text-2xl font-black font-mono text-white leading-none my-1">{value}</span>
    {subLabel && <span className="text-[9px] text-slate-500 uppercase font-mono">{subLabel}</span>}
  </div>
);

export default StatBox;