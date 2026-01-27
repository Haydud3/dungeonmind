import React from 'react';
import Icon from './Icon';

const STATUS_ICONS = {
    dead: { icon: 'skull', color: 'text-slate-200', bg: 'bg-black' },
    bloodied: { icon: 'droplet', color: 'text-red-500', bg: 'bg-red-900' },
    unconscious: { icon: 'moon', color: 'text-indigo-300', bg: 'bg-indigo-900' },
    poisoned: { icon: 'flask-conical', color: 'text-green-400', bg: 'bg-green-900' },
    restrained: { icon: 'link', color: 'text-amber-400', bg: 'bg-amber-900' },
    concentrating: { icon: 'brain', color: 'text-cyan-400', bg: 'bg-cyan-900' },
    invisible: { icon: 'ghost', color: 'text-slate-400', bg: 'bg-slate-700' },
    burning: { icon: 'flame', color: 'text-orange-500', bg: 'bg-orange-900' }
};

const Token = ({ token, isOwner, onMouseDown, onTouchStart, cellPx, isDragging, overridePos, onClick, isSelected, isTurn }) => {
    const sizeMap = { medium: 1, large: 2, huge: 3, gargantuan: 4, tiny: 0.5 };
    const sizeMultiplier = typeof token.size === 'number' ? token.size : (sizeMap[token.size] || 1);
    const dimension = cellPx * sizeMultiplier;

    const isPc = token.type === 'pc';
    const borderColor = isPc ? '#22c55e' : '#ef4444';
    
    // NEW: Active Turn Highlight
    const turnShadow = isTurn ? '0 0 30px #f59e0b, 0 0 15px #f59e0b' : '';
    const shadowColor = isPc ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.2)';

    // START CHANGE: Define missing scaling variables to fix ReferenceErrors
    const shadowBlur = dimension * 0.08;
    const borderThickness = Math.max(1, dimension * 0.05);
    const fontSize = Math.max(10, dimension * 0.22); // Scaled font size
    const paddingY = dimension * 0.02;
    const paddingX = dimension * 0.12;
    const bottomOffset = -(fontSize + paddingY * 2 + 5); // Position nameplate below token
    // END CHANGE

    const statuses = token.statuses || [];
    const isDead = statuses.includes('dead');

    // --- NEW: Visual Animation Logic ---
    const animMap = {
        'attack': 'animate-bounce',   // Placeholder for lunge
        'hit': 'animate-pulse bg-red-500/50',      
        'heal': 'animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.8)]', 
        'cast': 'animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.8)]'
    };
    const animClass = token.anim ? (animMap[token.anim] || '') : '';

    // Fix: Default to center (50,50) if x/y are missing to prevent top-left bunching
    const safeX = (token.x === undefined || token.x === null) ? 50 : token.x;
    const safeY = (token.y === undefined || token.y === null) ? 50 : token.y;

    const x = overridePos ? overridePos.x : safeX; // CHANGED LINE
    const y = overridePos ? overridePos.y : safeY; // CHANGED LINE

    return (
        <div 
            onMouseDown={(e) => {
                // Removed stopPropagation so event bubbles to the wrapper in InteractiveMap
                if (isOwner) {
                    if(onMouseDown) onMouseDown(e, token.id);
                }
            }}
            onTouchStart={(e) => {
                e.stopPropagation();
                if (isOwner) {
                    if(onTouchStart) onTouchStart(e, token.id);
                }
            }}
            onClick={(e) => {
                // Only block left-click; Right-click needs to bubble to trigger HUD
                if (e.button === 0) e.stopPropagation(); 
                onClick && onClick(e, token.id);
            }}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing hover:z-50 
                ${isOwner ? 'hover:scale-105' : ''} 
                ${isTurn ? 'animate-pulse scale-110 z-50' : ''}
                ${isDragging ? 'opacity-60 pointer-events-none z-[100]' : 'opacity-100 z-10'} 
            `}
            style={{ 
                left: `${x}%`, 
                top: `${y}%`,
                width: `${dimension}px`,
                height: `${dimension}px`,
                // boxShadow: REMOVED FROM HERE
                transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
            // START CHANGE: Safe Name Check
            title={token.name || "Unknown"}
            // END CHANGE
        >
            <div 
                className="w-full h-full rounded-full bg-slate-900 overflow-hidden relative box-border"
                style={{
                    borderWidth: `${borderThickness}px`,
                    borderStyle: 'solid',
                    borderColor: borderColor,
                    // FIX: Moved shadow logic here so it follows the circle shape
                    boxShadow: isTurn 
                        ? '0 0 30px #f59e0b, 0 0 15px #f59e0b' 
                        : `0 0 ${shadowBlur}px ${shadowColor}${isSelected ? ', 0 0 20px rgba(99, 102, 241, 0.8)' : ''}`,
                    imageRendering: 'auto',
                    WebkitFontSmoothing: 'antialiased'
                }}
            >
                {/* START CHANGE: Check both image property variants */}
                {token.img || token.image ? (
                    <img src={token.img || token.image} className="w-full h-full object-cover pointer-events-none select-none" alt={token.name} draggable="false" />
                ) : (
                    <div 
                        className="w-full h-full flex items-center justify-center font-bold text-white bg-slate-700 select-none" 
                        style={{ fontSize: `${dimension * 0.4}px` }}
                    >
                        {/* START CHANGE: Safe Substring Check */}
                        {(token.name || "?").substring(0, 2).toUpperCase()}
                        {/* END CHANGE */}
                    </div>
                )}
                
                {isDead && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Icon name="skull" size={dimension * 0.6} className="text-red-600 opacity-80"/>
                    </div>
                )}
            </div>

            <div className="absolute -top-1 -right-1 flex flex-col gap-0.5 pointer-events-none">
                {statuses.map(s => {
                    if (s === 'dead') return null;
                    const def = STATUS_ICONS[s] || { icon: 'circle', color: 'text-white', bg: 'bg-slate-500' };
                    const iconSize = dimension * 0.25; 
                    return (
                        <div key={s} 
                             className={`rounded-full ${def.bg} border border-white/20 flex items-center justify-center shadow-sm`}
                             style={{ width: iconSize, height: iconSize }}
                        >
                            <Icon name={def.icon} size={iconSize * 0.6} className={def.color}/>
                        </div>
                    );
                })}
            </div>

            {/* START CHANGE: Single-layer nameplate with no nested wrappers */}
            <div 
                className="absolute left-1/2 bg-black/85 text-white rounded-sm pointer-events-none select-none z-20 shadow-sm border border-white/10"
                style={{ 
                    fontSize: `${fontSize}px`,
                    lineHeight: '1', 
                    bottom: `${bottomOffset}px`,
                    padding: `${paddingY}px ${paddingX}px`,
                    transform: 'translate3d(-50%, 0, 0)',
                    width: 'max-content',
                    maxWidth: `${dimension * 3}px`, 
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}
            >
                {token.name || "Unknown"}
            </div>
            {/* END CHANGE */}
        </div>
    );
};

export default Token;