import React, { useState } from 'react';
import Icon from '../Icon';

const RadialHUD = ({ token, position, onUpdateToken, onDelete, onOpenSheet, onClose }) => {
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
    
    // Helper: Convert string sizes (medium, large) to numbers (1, 2) for the UI
    const getSizeNum = (val) => {
        if (typeof val === 'number') return val;
        const map = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
        return map[val] || 1;
    };

    const currentSize = getSizeNum(token.size);

    const toggleStatus = (status) => {
        const current = token.statuses || [];
        const newStatuses = current.includes(status) 
            ? current.filter(s => s !== status)
            : [...current, status];
        onUpdateToken({ ...token, statuses: newStatuses });
    };

    const cycleSize = () => {
        const s = getSizeNum(token.size);
        let nextSize;
        if (s === 0.5) nextSize = 1;
        else if (s === 1) nextSize = 2;
        else if (s === 2) nextSize = 3;
        else nextSize = 0.5;
        onUpdateToken({ ...token, size: nextSize });
    };

    const utilityActions = [
        { id: 'delete', icon: 'trash-2', angle: -165, color: 'text-red-500', bg: 'hover:bg-red-900/50', action: onDelete, title: "Delete Token" },
        { id: 'visibility', icon: token.isHidden ? 'eye' : 'eye-off', angle: -127.5, color: token.isHidden ? 'text-amber-500' : 'text-slate-400', bg: 'hover:bg-slate-700', action: () => onUpdateToken({ ...token, isHidden: !token.isHidden }), title: "Toggle Visibility" },
        { id: 'sheet', icon: 'scroll', angle: -90, color: 'text-amber-400', bg: 'hover:bg-amber-900/50', action: onOpenSheet, title: "Open Sheet" },
        { id: 'status-trigger', icon: 'shield-plus', angle: -52.5, color: isStatusExpanded ? 'text-white' : 'text-slate-200', bg: isStatusExpanded ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-700', action: () => setIsStatusExpanded(!isStatusExpanded), title: "Conditions" },
        { id: 'size', icon: 'maximize', angle: -15, color: 'text-blue-400', bg: 'hover:bg-blue-900/30', action: cycleSize, title: `Size: ${currentSize}x` },
    ];

    const conditions = [
        { id: 'dead', icon: 'skull', color: 'text-slate-200' },
        { id: 'bloodied', icon: 'droplet', color: 'text-red-500' },
        { id: 'blinded', icon: 'eye-off', color: 'text-slate-400' },
        { id: 'charmed', icon: 'heart', color: 'text-pink-400' },
        { id: 'deafened', icon: 'volume-x', color: 'text-blue-300' },
        { id: 'frightened', icon: 'ghost', color: 'text-purple-400' },
        { id: 'grappled', icon: 'hand', color: 'text-orange-400' },
        { id: 'incapacitated', icon: 'user-x', color: 'text-slate-500' },
        { id: 'invisible', icon: 'ghost', color: 'text-cyan-400' },
        { id: 'paralyzed', icon: 'zap-off', color: 'text-yellow-400' },
        { id: 'petrified', icon: 'gem', color: 'text-slate-300' },
        { id: 'poisoned', icon: 'flask-conical', color: 'text-green-400' },
        { id: 'prone', icon: 'arrow-down', color: 'text-slate-500' },
        { id: 'restrained', icon: 'link', color: 'text-red-600' },
        { id: 'stunned', icon: 'zap', color: 'text-amber-400' },
        { id: 'unconscious', icon: 'moon', color: 'text-indigo-400' },
        { id: 'burning', icon: 'flame', color: 'text-orange-500' }
    ];

    const hudRef = React.useRef(null);

    React.useEffect(() => {
        function handleClick(e) {
            if (hudRef.current && hudRef.current.contains(e.target)) return;
            if (e.target && e.target.classList.contains('token-element')) return;
            onClose && onClose();
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    const RADIUS = 85;
    const COND_RADIUS = 130;

    return (
        <div 
            ref={hudRef}
            onClick={(e) => e.stopPropagation()}
            className="absolute z-[70] pointer-events-none"
            style={{ left: position.x, top: position.y }}
        >
            <style>{`
                @keyframes pop-out {
                    0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
                    100% { opacity: 1; transform: var(--target-transform) scale(1); }
                }
            `}</style>

            {utilityActions.map((btn, i) => {
                const rad = (btn.angle * Math.PI) / 180;
                const targetX = Math.cos(rad) * RADIUS;
                const targetY = Math.sin(rad) * RADIUS;

                return (
                    <button
                        key={btn.id}
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => { e.stopPropagation(); btn.action(); }}
                        className={`absolute pointer-events-auto w-10 h-10 -ml-5 -mt-5 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-transform duration-200 hover:scale-110 active:scale-95 ${btn.id === 'status-trigger' && isStatusExpanded ? btn.bg : `bg-slate-900/90 border-slate-700 ${btn.color} ${btn.bg}`}`}
                        style={{ 
                            '--target-transform': `translate(${targetX}px, ${targetY}px)`,
                            transform: `translate(${targetX}px, ${targetY}px)`,
                            animation: `pop-out 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                            animationDelay: `${i * 30}ms`
                        }}
                    >
                        {btn.id === 'size' ? <span className="font-bold text-xs font-mono text-blue-300">{currentSize}x</span> : <Icon name={btn.icon} size={18} />}
                    </button>
                );
            })}

            {isStatusExpanded && conditions.map((cond, i) => {
                const angle = 10 + (i * 24); 
                const rad = (angle * Math.PI) / 180;
                const targetX = Math.cos(rad) * COND_RADIUS;
                const targetY = Math.sin(rad) * COND_RADIUS;
                const isActive = (token.statuses || []).includes(cond.id);

                return (
                    <button
                        key={cond.id}
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => { e.stopPropagation(); toggleStatus(cond.id); }}
                        className={`absolute pointer-events-auto w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center border shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 ${isActive ? 'bg-indigo-600 border-indigo-400 text-white' : `bg-slate-900/80 border-slate-800 ${cond.color} hover:bg-slate-700`}`}
                        style={{ 
                            '--target-transform': `translate(${targetX}px, ${targetY}px)`,
                            transform: `translate(${targetX}px, ${targetY}px)`,
                            animation: `pop-out 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                            animationDelay: `${i * 15}ms`
                        }}
                    >
                        <Icon name={cond.icon} size={14} className={isActive ? 'text-white' : 'text-current'} />
                    </button>
                );
            })}
        </div>
    );
};

export default RadialHUD;