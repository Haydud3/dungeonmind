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

const Token = ({ token, isOwner, onMouseDown, onTouchStart, cellPx, isDragging, overridePos, onClick }) => {
    // 1. Calculate Token Dimensions
    const sizeMultiplier = token.size === 'large' ? 2 : token.size === 'huge' ? 3 : token.size === 'tiny' ? 0.5 : 1;
    const dimension = cellPx * sizeMultiplier;
    
    // 2. Dynamic Scaling Variables
    const borderThickness = dimension * 0.04; 
    const shadowBlur = dimension * 0.15;
    const fontSize = Math.min(24, dimension * 0.22); 
    const paddingY = dimension * 0.03; 
    const paddingX = dimension * 0.08; 
    const bottomOffset = -(fontSize + (paddingY * 2.5)); 

    const isPc = token.type === 'pc';
    const borderColor = isPc ? '#22c55e' : '#ef4444';
    const shadowColor = isPc ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.2)';

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

    const x = isDragging && overridePos ? overridePos.x : safeX;
    const y = isDragging && overridePos ? overridePos.y : safeY;

    return (
        <div 
            onMouseDown={(e) => {
                if (isOwner) {
                    // REMOVED: e.stopPropagation(); to allow global window listeners to catch drag
                    if(onMouseDown) onMouseDown(e, token.id);
                }
            }}
            onTouchStart={(e) => {
                if (isOwner) {
                    // REMOVED: e.stopPropagation();
                    if(onTouchStart) onTouchStart(e, token.id);
                }
            }}
            onClick={(e) => onClick && onClick(e, token.id)}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing hover:z-50 
                ${isOwner ? 'hover:scale-105' : ''} 
                ${isDead ? 'grayscale opacity-80' : ''}
                ${isDragging ? 'opacity-60 pointer-events-none z-[100] scale-110' : 'opacity-100 z-10'} 
                ${animClass}
            `}
            style={{ 
                left: `${x}%`, 
                top: `${y}%`,
                width: `${dimension}px`,
                height: `${dimension}px`,
                transition: isDragging ? 'none' : 'transform 0.1s, left 0.1s linear, top 0.1s linear',
                willChange: 'left, top'
            }}
            title={token.name}
        >
            <div 
                className="w-full h-full rounded-full bg-slate-900 overflow-hidden relative box-border"
                style={{
                    borderWidth: `${borderThickness}px`,
                    borderStyle: 'solid',
                    borderColor: borderColor,
                    boxShadow: `0 0 ${shadowBlur}px ${shadowColor}`
                }}
            >
                {token.image ? (
                    <img src={token.image} className="w-full h-full object-cover pointer-events-none select-none" alt={token.name} draggable="false" />
                ) : (
                    <div 
                        className="w-full h-full flex items-center justify-center font-bold text-white bg-slate-700 select-none" 
                        style={{ fontSize: `${dimension * 0.4}px` }}
                    >
                        {token.name.substring(0, 2).toUpperCase()}
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

            <div 
                className="absolute left-1/2 -translate-x-1/2 bg-black/80 text-white rounded-full whitespace-nowrap pointer-events-none select-none z-20 shadow-md border border-white/10 flex items-center justify-center"
                style={{ 
                    fontSize: `${fontSize}px`,
                    lineHeight: '1', 
                    bottom: `${bottomOffset}px`,
                    padding: `${paddingY}px ${paddingX}px`,
                    maxWidth: `${dimension * 3}px`, 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}
            >
                {token.name}
            </div>
        </div>
    );
};

export default Token;