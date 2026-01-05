import React, { useEffect, useState } from 'react';

const DiceOverlay = ({ roll }) => {
    // roll = { die: 20, result: 15, id: ... }
    const [phase, setPhase] = useState('rolling'); // rolling -> landed -> fading

    useEffect(() => {
        // Timeline:
        // 0ms: Start Rolling (Tumble)
        // 1000ms: Land (Stop tumbling, show result)
        // 2500ms: Fade out
        
        const landTimer = setTimeout(() => setPhase('landed'), 1000);
        const fadeTimer = setTimeout(() => setPhase('fading'), 2500);
        
        return () => { clearTimeout(landTimer); clearTimeout(fadeTimer); };
    }, []);

    // Improved Die Styles with Gradients for 3D effect
    const getDieStyles = (d) => {
        const common = "flex items-center justify-center font-bold text-white text-4xl shadow-2xl relative z-50";
        
        // We use gradients (bg-gradient-...) to simulate a spherical/3D light source
        switch(parseInt(d)) {
            case 4: return `${common} w-32 h-32 clip-tri bg-gradient-to-br from-green-500 to-green-900 pb-4`;
            case 6: return `${common} w-32 h-32 rounded-xl bg-gradient-to-br from-blue-500 to-blue-900 border-2 border-blue-400`;
            case 8: return `${common} w-32 h-32 clip-diamond bg-gradient-to-b from-indigo-500 to-indigo-900`;
            case 10: return `${common} w-32 h-32 clip-kite bg-gradient-to-br from-purple-500 to-purple-900`; 
            case 12: return `${common} w-32 h-32 clip-dodeca bg-gradient-to-br from-orange-500 to-orange-900`;
            case 20: return `${common} w-32 h-32 clip-hex bg-gradient-to-br from-red-500 to-red-900`;
            default: return `${common} w-32 h-32 rounded-full bg-gradient-to-br from-slate-500 to-slate-900`;
        }
    };

    // Visual pop for Crits
    const getResultClass = () => {
        if (roll.die !== 20) return "";
        if (roll.result === 20) return "text-yellow-300 scale-125 transition-transform duration-300 drop-shadow-md"; // Nat 20
        if (roll.result === 1) return "text-gray-400 scale-90"; // Nat 1
        return "";
    };

    if (phase === 'fading') return null;

    return (
        <div className="die-container">
            <div 
                className={`die-3d ${phase === 'rolling' ? 'animate-tumble' : 'animate-land'}`}
                style={{ 
                    // While rolling, we let CSS handle the chaos. When landed, we center it.
                    left: '50vw', 
                    top: '50vh',
                }}
            >
                <div className={`${getDieStyles(roll.die)}`}>
                    {/* Shadow overlay to fake depth */}
                    <div className="absolute inset-0 bg-black/20 pointer-events-none mix-blend-overlay"></div>
                    
                    {/* The Number */}
                    <span className={`z-10 ${phase === 'landed' ? getResultClass() : 'blur-sm'}`}>
                        {phase === 'rolling' ? '' : roll.result}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default DiceOverlay;
