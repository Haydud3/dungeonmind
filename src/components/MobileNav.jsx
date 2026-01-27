import React from 'react';
import Icon from './Icon';

const MobileNav = ({ view, setView, compact, className = "" }) => {
    const navItems = [
        { id: 'session', icon: 'message-circle', label: 'Chat' },
        { id: 'journal', icon: 'book', label: 'Journal' },
        { id: 'map', icon: 'map', label: 'Tact' },
        { id: 'party', icon: 'users', label: 'Party' },
        { id: 'npcs', icon: 'skull', label: 'Mobs' },
        { id: 'lore', icon: 'library', label: 'Lore' },
        { id: 'settings', icon: 'settings', label: 'Cfg' }
    ];

    return (
        <nav 
            // UPDATED: 
            // 1. Compact: Fixed height 'h-[52px]', aligned 'items-center', and 'pb-0' to touch the bottom edge.
            // 2. Normal: Dynamic height via style, aligned 'items-start', with safe-area padding.
            className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex justify-between px-1 z-50 transition-all duration-300
                ${compact 
                    ? 'h-[52px] items-center pb-0' 
                    : 'items-start pt-2 pb-[env(safe-area-inset-bottom,4px)]'
                } ${className}`}
            
            // Only apply dynamic calc height if NOT compact. Compact uses the class h-[52px].
            style={!compact ? { height: 'calc(60px + env(safe-area-inset-bottom, 0px))' } : {}}
        >
            {navItems.map(item => (
                <button 
                    key={item.id} 
                    onClick={() => setView(item.id)}
                    className={`flex flex-1 flex-col items-center justify-center transition-colors ${view === item.id ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
                    // Ensure the button hit area fills the container height
                    style={{ height: '100%' }}
                >
                    <Icon name={item.icon} size={compact ? 24 : 20} className={view === item.id ? "stroke-2" : "stroke-1.5"} />
                    {!compact && <span className="text-[9px] font-bold uppercase mt-1 leading-none tracking-tight">{item.label}</span>}
                </button>
            ))}
        </nav>
    );
};

export default MobileNav;