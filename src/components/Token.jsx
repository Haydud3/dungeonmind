import React from 'react';
import Icon from './Icon';

const STATUS_ICONS = {
    dead: { icon: 'skull', color: 'text-white', bg: 'bg-black' },
    blinded: { icon: 'eye-off', color: 'text-slate-200', bg: 'bg-slate-700' },
    charmed: { icon: 'heart', color: 'text-pink-200', bg: 'bg-pink-900' },
    poisoned: { icon: 'flask-conical', color: 'text-green-200', bg: 'bg-green-900' },
    burning: { icon: 'flame', color: 'text-orange-200', bg: 'bg-orange-900' },
    restrained: { icon: 'link', color: 'text-amber-200', bg: 'bg-amber-900' },
    unconscious: { icon: 'moon', color: 'text-blue-200', bg: 'bg-blue-900' },
    stunned: { icon: 'zap', color: 'text-yellow-200', bg: 'bg-yellow-700' },
    invisible: { icon: 'ghost', color: 'text-purple-200', bg: 'bg-purple-900' },
    concentrating: { icon: 'brain', color: 'text-cyan-200', bg: 'bg-cyan-900' },
    bloodied: { icon: 'droplet', color: 'text-red-200', bg: 'bg-red-900' },
    frightened: { icon: 'ghost', color: 'text-purple-200', bg: 'bg-purple-900' },
    grappled: { icon: 'hand', color: 'text-orange-200', bg: 'bg-orange-900' },
    prone: { icon: 'arrow-down', color: 'text-slate-200', bg: 'bg-slate-700' }
};

// FIX: Added onMouseDown, onTouchStart, and onClick to props
const Token = ({ token, isOwner, cellPx, isDragging, isSelected, isTurn, onMouseDown, onTouchStart, onClick }) => {
    const sizeMap = { medium: 1, large: 2, huge: 3, gargantuan: 4, tiny: 0.5 };
    const sizeMultiplier = typeof token.size === 'number' ? token.size : (sizeMap[token.size] || 1);
    const dimension = cellPx * sizeMultiplier;

    const isPc = token.type === 'pc';
    const borderColor = isPc ? '#22c55e' : '#ef4444';
    
    const shadowBlur = dimension * 0.08;
    const borderThickness = Math.max(1, dimension * 0.05);
    const fontSize = Math.max(10, dimension * 0.22);
    const paddingY = dimension * 0.02;
    const paddingX = dimension * 0.12;
    const bottomOffset = -(fontSize + paddingY * 2 + 5); 

    const statuses = token.statuses || [];
    const isDead = statuses.includes('dead');

    const animMap = {
        'attack': 'animate-bounce',
        'hit': 'animate-pulse bg-red-500/50',      
        'heal': 'animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.8)]', 
        'cast': 'animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.8)]'
    };
    const animClass = token.anim ? (animMap[token.anim] || '') : '';

    // FIX: Removed overridePos, safeX, safeY, x, and y definitions here 
    // because positioning is handled by the parent container in InteractiveMap.jsx

    return (
        <div 
            onMouseDown={(e) => {
                if (isOwner && onMouseDown) onMouseDown(e, token.id);
            }}
            onTouchStart={(e) => {
                if (isOwner && onTouchStart) {
                    e.stopPropagation();
                    onTouchStart(e, token.id);
                }
            }}
            onClick={(e) => {
                if (onClick) {
                    // Only block left-click; Right-click needs to bubble to trigger HUD
                    if (e.button === 0) e.stopPropagation(); 
                    onClick(e, token.id);
                }
            }}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing hover:z-50 
                ${isOwner ? 'hover:scale-105' : ''} 
                ${isTurn ? 'animate-pulse scale-110 z-50' : ''}
                ${token.isHidden ? 'opacity-40 grayscale border-dashed' : 'opacity-100'}
                ${isDragging ? 'opacity-60 pointer-events-none z-[100]' : 'z-10'} 
                ${animClass}
            `}
            style={{ 
                // Position handled by parent
                width: `${dimension}px`,
                height: `${dimension}px`,
                transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
            title={token.name || "Unknown"}
        >
            <div 
                className="w-full h-full rounded-full bg-slate-900 overflow-hidden relative box-border"
                style={{
                    borderWidth: `${borderThickness}px`,
                    borderStyle: 'solid',
                    borderColor: borderColor,
                    boxShadow: isTurn 
                        ? '0 0 30px #f59e0b, 0 0 15px #f59e0b' 
                        : `0 0 ${shadowBlur}px ${isPc ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.2)'}${isSelected ? ', 0 0 20px rgba(99, 102, 241, 0.8)' : ''}`,
                    imageRendering: 'auto',
                    WebkitFontSmoothing: 'antialiased'
                }}
            >
                {token.img || token.image ? (
                    <img src={token.img || token.image} className="w-full h-full object-cover pointer-events-none select-none" alt={token.name} draggable="false" />
                ) : (
                    <div 
                        className="w-full h-full flex items-center justify-center font-bold text-white bg-slate-700 select-none" 
                        style={{ fontSize: `${dimension * 0.4}px` }}
                    >
                        {(token.name || "?").substring(0, 2).toUpperCase()}
                    </div>
                )}
                
                {isDead && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Icon name="skull" size={dimension * 0.6} className="text-red-600 opacity-80"/>
                    </div>
                )}
                {token.isHidden && isOwner && (
                    <div className="absolute top-1 left-1 bg-amber-500 rounded-full p-0.5 shadow-lg border border-black">
                        <Icon name="eye-off" size={dimension * 0.2} className="text-black" />
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
        </div>
    );
};

export default Token;