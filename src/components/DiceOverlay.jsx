import React, { useEffect, useState } from 'react';

const DiceOverlay = ({ roll }) => {
    // roll = { die: 20, result: 15, id: ... }
    const [phase, setPhase] = useState('rolling'); // rolling -> landed -> fading

    useEffect(() => {
        // Timeline:
        // 0ms: Start Rolling (Tumble across screen)
        // 1800ms: Land (Show result clearly)
        // 3000ms: Fade out
        
        const landTimer = setTimeout(() => setPhase('landed'), 1500);
        const fadeTimer = setTimeout(() => setPhase('fading'), 3500);
        
        return () => { clearTimeout(landTimer); clearTimeout(fadeTimer); };
    }, []);

    // Determine die shape/color based on d4, d6, etc.
    const getDieStyles = (d) => {
        const base = "flex items-center justify-center font-bold text-white text-4xl shadow-inner border border-white/20 backdrop-blur-sm";
        switch(parseInt(d)) {
            case 4: return `${base} w-24 h-24 bg-green-700/90 clip-tri pt-8`;
            case 6: return `${base} w-24 h-24 bg-blue-700/90 rounded-lg`;
            case 8: return `${base} w-24 h-24 bg-indigo-700/90 clip-diamond`;
            case 10: return `${base} w-24 h-24 bg-purple-700/90 clip-diamond`; // close enough
            case 12: return `${base} w-28 h-28 bg-orange-700/90 clip-hex`;
            case 20: return `${base} w-32 h-32 bg-red-700/90 clip-hex`;
            default: return `${base} w-24 h-24 bg-slate-700/90 rounded-full`;
        }
    };

    // Determine special visual classes for Nat 20 / Nat 1
    const getResultClass = () => {
        if (roll.die !== 20) return "";
        if (roll.result === 20) return "crit-success text-yellow-300 text-6xl text-shadow-lg";
        if (roll.result === 1) return "crit-fail text-black text-6xl";
        return "";
    };

    if (phase === 'fading') return null;

    return (
        <div className="die-container">
            <div 
                className={`die-3d ${phase === 'rolling' ? 'animate-[tumble-across_1.5s_ease-out_forwards]' : 'animate-[land-shake_0.3s_ease-out]'}`}
                style={{ 
                    left: phase === 'rolling' ? '0' : '50vw', 
                    top: phase === 'rolling' ? '0' : '50vh',
                    transform: phase === 'landed' ? 'translate(-50%, -50%) rotate(0deg)' : undefined
                }}
            >
                <div className={`${getDieStyles(roll.die)} ${phase === 'landed' ? getResultClass() : ''}`}>
                    {phase === 'rolling' ? '?' : roll.result}
                </div>
            </div>
            
            {phase === 'landed' && (
                <div className="absolute top-2/3 left-1/2 -translate-x-1/2 text-white font-bold text-2xl fantasy-font animate-in fade-in slide-in-from-bottom-4 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                    {roll.result}
                </div>
            )}
        </div>
    );
};

export default DiceOverlay;
