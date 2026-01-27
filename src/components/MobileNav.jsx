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
            // UPDATED: Tighter padding and reduced height (48px) in compact mode
            className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-between px-1 z-50 ${compact ? 'pb-[env(safe-area-inset-bottom,0px)]' : 'pb-[env(safe-area-inset-bottom,4px)]'} ${className}`}
            style={{ height: `calc(${compact ? '48px' : '60px'} + env(safe-area-inset-bottom, 0px))` }}
        >
            {navItems.map(item => (
                <button 
                    key={item.id} 
                    onClick={() => setView(item.id)}
                    className={`flex flex-1 flex-col items-center justify-center h-full transition-colors ${view === item.id ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    {/* UPDATED: Hide label and slightly enlarge icon in compact mode */}
                    <Icon name={item.icon} size={compact ? 24 : 20} className={view === item.id ? "stroke-2" : "stroke-1.5"} />
                    {!compact && <span className="text-[9px] font-bold uppercase mt-1 leading-none tracking-tight">{item.label}</span>}
                </button>
            ))}
        </nav>
    );
};

export default MobileNav;