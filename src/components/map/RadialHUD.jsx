import React, { useState } from 'react';
import Icon from '../Icon';

const RadialHUD = ({ 
    token, position, onUpdateToken, onDelete, onOpenSheet, onClose, 
    role, user, players, npcs, activeUsers, assignments, onStartVfxTargeting 
}) => {
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
// START CHANGE: Add state for control delegation panel
const [isControlExpanded, setIsControlExpanded] = useState(false);
const [isVfxExpanded, setIsVfxExpanded] = useState(false);
// END CHANGE

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

// START CHANGE: Helper to toggle control delegation
const toggleControl = (uid) => {
    const current = token.controlledBy || [];
    let newControlledBy;

    if (current.includes(uid)) {
        newControlledBy = current.filter(id => id !== uid);
    } else {
        newControlledBy = [...current, uid];
    }
    onUpdateToken({ ...token, controlledBy: newControlledBy });
};

const [selectedBehavior, setSelectedBehavior] = useState('breath');
const behaviors = ['breath', 'beam', 'rocket'];
const flavors = [
    { id: 'fire', icon: 'flame', color: 'text-orange-500' },
    { id: 'frost', icon: 'snowflake', color: 'text-cyan-400' },
    { id: 'acid', icon: 'test-tube-2', color: 'text-green-400' },
    { id: 'death', icon: 'skull', color: 'text-purple-600' },
    { id: 'magic', icon: 'sparkles', color: 'text-pink-400' }
];

// Conditional Utility Actions and Angle Recalculation (Phase 3 Update)
const isDM = role === 'dm';

let baseActions = [
    { id: 'delete', icon: 'trash-2', action: onDelete, title: "Delete Token", color: 'text-red-500', bg: 'hover:bg-red-900/50' },
    { id: 'sheet', icon: 'scroll', action: onOpenSheet, title: "Open Sheet", color: 'text-amber-400', bg: 'hover:bg-amber-900/50' },
    { id: 'status-trigger', icon: 'shield-plus', action: () => { setIsStatusExpanded(!isStatusExpanded); setIsControlExpanded(false); setIsVfxExpanded(false); }, title: "Conditions", color: 'text-slate-200', bg: 'hover:bg-slate-700' },
    { id: 'vfx-trigger', icon: 'wand-2', action: () => { setIsVfxExpanded(!isVfxExpanded); setIsStatusExpanded(false); setIsControlExpanded(false); }, title: "Magic VFX", color: 'text-pink-400', bg: 'hover:bg-pink-900/30' },
    { id: 'size', icon: 'maximize', action: cycleSize, title: `Size: ${currentSize}x`, color: 'text-blue-400', bg: 'hover:bg-blue-900/30' },
];

if (isDM) {
    baseActions.splice(1, 0, { // Insert Visibility after Delete
        id: 'visibility', 
        icon: token.isHidden ? 'eye' : 'eye-off', 
        action: () => onUpdateToken({ ...token, isHidden: !token.isHidden }), 
        title: "Toggle Visibility",
        color: token.isHidden ? 'text-amber-500' : 'text-slate-400', 
        bg: 'hover:bg-slate-700'
    });
    baseActions.splice(2, 0, { // Insert Control Delegation after Visibility
        id: 'control-trigger',
        icon: 'users',
        action: () => { setIsControlExpanded(!isControlExpanded); setIsStatusExpanded(false); setIsVfxExpanded(false); },
        title: "Delegate Control",
        color: isControlExpanded ? 'text-white' : 'text-indigo-400', 
        bg: isControlExpanded ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-700'
    });
}

// Recalculate angles based on filtered count (150 degree arc: -165 to -15)
const count = baseActions.length;
const angleIncrement = count > 1 ? 150 / (count - 1) : 0;
const startAngle = -165;

const utilityActions = baseActions.map((action, i) => {
    const angle = startAngle + (i * angleIncrement);
    return {
        ...action,
        angle: angle,
        // Correct colors/bgs for complex buttons here
        color: (action.id === 'status-trigger' && isStatusExpanded) || (action.id === 'control-trigger' && isControlExpanded) || (action.id === 'vfx-trigger' && isVfxExpanded) ? 'text-white' : action.color,
        bg: (action.id === 'status-trigger' && isStatusExpanded) || (action.id === 'control-trigger' && isControlExpanded) || (action.id === 'vfx-trigger' && isVfxExpanded) ? 'bg-indigo-600 border-indigo-400' : action.bg,
    };
});
// END CHANGE

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
// START CHANGE: Radius for Control Delegation menu
const CONTROL_RADIUS = 130;
const VFX_RADIUS = 130;
// END CHANGE

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

            {utilityActions.map((btn, i) => { // <-- Loop Index Key
                const rad = (btn.angle * Math.PI) / 180;
                const targetX = Math.cos(rad) * RADIUS;
                const targetY = Math.sin(rad) * RADIUS;

                return (
                    <button
                        key={btn.id} // <-- FIX: Use stable ID from action definition
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

            {isStatusExpanded && conditions.map((cond, i) => { // <-- Loop Index Key
            const angle = 10 + (i * 24); 
            const rad = (angle * Math.PI) / 180;
            const targetX = Math.cos(rad) * COND_RADIUS;
            const targetY = Math.sin(rad) * COND_RADIUS;
            const isActive = (token.statuses || []).includes(cond.id);

            return (
                <button
                        key={cond.id} // <-- FIX: Use stable ID from condition definition
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
        
        {/* START CHANGE: Control Delegation Menu (DM Only) */}
        {isDM && isControlExpanded && (() => {
            const users = Object.entries(activeUsers || {})
                .map(([uid, emailOrName]) => {
                    const charId = assignments?.[uid];
                    const char = players?.find(p => String(p.id) === String(charId));
                    // Resolve name: Assigned Char -> Email Alias -> UID Slice
                    const displayName = char ? char.name : (emailOrName?.includes('@') ? emailOrName.split('@')[0] : (uid?.slice(0, 5) || 'UNK'));
                    return { uid, displayName };
                })
                .filter(u => u.uid !== user?.uid);

            const initialAngle = -170; 
            const angleIncrement = users.length > 0 ? 300 / users.length : 0;

            return users.map((u, i) => {
                const angle = initialAngle + (i * angleIncrement);
                const rad = (angle * Math.PI) / 180;
                const targetX = Math.cos(rad) * CONTROL_RADIUS;
                const targetY = Math.sin(rad) * CONTROL_RADIUS;
                const isControlled = (token.controlledBy || []).includes(u.uid);
                
                const identifier = u.displayName.length > 8 
                    ? u.displayName.slice(0, 7) + '..' 
                    : u.displayName;

                return (
                    <button
                        key={u.uid}
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => { e.stopPropagation(); toggleControl(u.uid); }}
                        className={`absolute pointer-events-auto w-12 h-12 -ml-6 -mt-6 rounded-full flex items-center justify-center border shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 text-[10px] font-bold overflow-hidden ${isControlled ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        title={isControlled ? `Revoke control from ${u.displayName}` : `Grant control to ${u.displayName}`}
                        style={{ 
                            '--target-transform': `translate(${targetX}px, ${targetY}px)`,
                            transform: `translate(${targetX}px, ${targetY}px)`,
                            animation: `pop-out 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                            animationDelay: `${i * 20}ms`
                        }}
                    >
                        {identifier}
                    </button>
                );
            });
        })()}
        {/* END CHANGE: Control Delegation Menu */}

        {/* START CHANGE: VFX Menu */}
        {isVfxExpanded && (
            <>
                <div className="absolute -top-32 left-1/2 -translate-x-1/2 flex gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-700 pointer-events-auto">
                    {behaviors.map(b => (
                        <button key={b} onClick={() => setSelectedBehavior(b)} className={`px-2 py-1 text-[10px] font-bold uppercase rounded transition-colors ${selectedBehavior === b ? 'bg-pink-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                            {b}
                        </button>
                    ))}
                </div>
                {flavors.map((f, i) => {
                    const angle = 10 + (i * 30);
                    const rad = (angle * Math.PI) / 180;
                    const targetX = Math.cos(rad) * VFX_RADIUS;
                    const targetY = Math.sin(rad) * VFX_RADIUS;
                    return (
                        <button
                            key={f.id}
                            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                onStartVfxTargeting({ behavior: selectedBehavior, flavor: f.id });
                            }}
                            className={`absolute pointer-events-auto w-10 h-10 -ml-5 -mt-5 rounded-full flex items-center justify-center border shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 bg-slate-900/80 border-slate-800 ${f.color} hover:bg-slate-700`}
                            style={{ 
                                '--target-transform': `translate(${targetX}px, ${targetY}px)`,
                                transform: `translate(${targetX}px, ${targetY}px)`,
                                animation: `pop-out 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                                animationDelay: `${i * 20}ms`
                            }}
                        >
                            <Icon name={f.icon} size={18} />
                        </button>
                    );
                })}
            </>
        )}
        {/* END CHANGE: VFX Menu */}
    </div>
);

};

export default RadialHUD;