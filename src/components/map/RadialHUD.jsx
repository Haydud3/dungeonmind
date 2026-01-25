import React from 'react';
import Icon from '../Icon';

const RadialHUD = ({ token, position, onUpdateToken, onDelete, onOpenSheet, onClose }) => {
    
    // Helper: Convert string sizes (medium, large) to numbers (1, 2) for the UI
    const getSizeNum = (val) => {
        if (typeof val === 'number') return val;
        const map = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
        return map[val] || 1;
    };

    const currentSize = getSizeNum(token.size);

    // Configuration: "Tiara" layout (Tight arc over the top)
    const actions = [
        // 1. Far Left: Delete
        { id: 'delete', icon: 'trash-2', angle: -150, color: 'text-red-500', bg: 'hover:bg-red-900/50', action: onDelete, title: "Delete Token" },

        // 2. Mid Left: Status Dead
        { id: 'status-dead', icon: 'skull', angle: -120, color: 'text-slate-200', bg: 'hover:bg-slate-700', action: () => toggleStatus('dead'), title: "Toggle Dead" },

        // 3. Top Center: Character Sheet (Anchor)
        { id: 'sheet', icon: 'scroll', angle: -90, color: 'text-amber-400', bg: 'hover:bg-amber-900/50', action: onOpenSheet, title: "Open Sheet" },
        
        // 4. Mid Right: Status Bloodied
        { id: 'status-bloodied', icon: 'droplet', angle: -60, color: 'text-red-500', bg: 'hover:bg-red-900/30', action: () => toggleStatus('bloodied'), title: "Toggle Bloodied" },
        
        // 5. Far Right: Size Control (Displays 1x, 2x, 3x)
        { id: 'size', icon: 'maximize', angle: -30, color: 'text-blue-400', bg: 'hover:bg-blue-900/30', action: () => cycleSize(), title: `Current Size: ${currentSize}x` },
    ];

    const toggleStatus = (status) => {
        const current = token.statuses || [];
        const newStatuses = current.includes(status) 
            ? current.filter(s => s !== status)
            : [...current, status];
        onUpdateToken({ ...token, statuses: newStatuses });
    };

    const cycleSize = () => {
        const s = getSizeNum(token.size);
        // Toggle Logic: 0.5 -> 1 -> 2 -> 3 -> 0.5
        let nextSize;
        if (s === 0.5) nextSize = 1;
        else if (s === 1) nextSize = 2;
        else if (s === 2) nextSize = 3;
        else nextSize = 0.5;

        onUpdateToken({ ...token, size: nextSize });
    };

    // Radius of the button ring
    const RADIUS = 85; 

    return (
        <div 
            className="absolute z-[70] pointer-events-none"
            style={{ left: position.x, top: position.y }}
        >
            {/* Custom Animation Styles */}
            <style>{`
                @keyframes pop-out {
                    0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
                    100% { opacity: 1; transform: var(--target-transform) scale(1); }
                }
            `}</style>

            {/* The Halo Buttons */}
            {actions.map((btn, i) => {
                const rad = (btn.angle * Math.PI) / 180;
                const targetX = Math.cos(rad) * RADIUS;
                const targetY = Math.sin(rad) * RADIUS;

                const isActive = btn.id.startsWith('status') && (token.statuses || []).includes(btn.id.split('-')[1]);

                return (
                    <button
                        key={btn.id}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); btn.action(); }}
                        title={btn.title}
                        className={`absolute pointer-events-auto w-10 h-10 -ml-5 -mt-5 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-transform duration-200 hover:scale-110 active:scale-95 ${isActive ? 'bg-indigo-600 border-indigo-400 text-white' : `bg-slate-900/90 border-slate-700 ${btn.color} ${btn.bg}`}`}
                        style={{ 
                            '--target-transform': `translate(${targetX}px, ${targetY}px)`,
                            transform: `translate(${targetX}px, ${targetY}px)`,
                            animation: `pop-out 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                            animationDelay: `${i * 30}ms`
                        }}
                    >
                        {btn.id === 'size' ? (
                            // CHANGE: Uses currentSize helper to display "1x", "2x", "3x"
                            <span className="font-bold text-xs font-mono text-blue-300">{currentSize}x</span>
                        ) : (
                            <Icon name={btn.icon} size={18} className={isActive ? 'fill-current' : ''}/>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default RadialHUD;