import React from 'react';

const StatBox = ({ label, value, subLabel, onClick, highlight = false }) => (
  <div 
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer transition-all
      ${highlight ? 'bg-amber-900/40 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}
    `}
  >
    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{label}</span>
    <span className="text-xl md:text-2xl font-bold font-mono text-white leading-none my-1">{value}</span>
    {subLabel && <span className="text-[9px] text-slate-500 uppercase">{subLabel}</span>}
  </div>
);

export default StatBox;