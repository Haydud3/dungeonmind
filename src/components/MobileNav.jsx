import React from 'react';
import Icon from './Icon';

const MobileNav = ({ view, setView, className = "" }) => {
    const navItems = [
        { id: 'session', icon: 'message-circle', label: 'Session' },
        { id: 'party', icon: 'users', label: 'Party' },
        { id: 'atlas', icon: 'globe', label: 'Atlas' },
        { id: 'map', icon: 'map', label: 'Tactical' },
        { id: 'npcs', icon: 'skull', label: 'Bestiary' },
        { id: 'journal', icon: 'book', label: 'Journal' },
        { id: 'settings', icon: 'settings', label: 'Config' }
    ];

    return (
    // FIX: 'fixed bottom-0' sticks to the viewport bottom.
    <nav 
        className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex items-start justify-between px-1 z-50 pt-2 pb-[env(safe-area-inset-bottom)] ${className}`}
    >
        {navItems.map(item => (
            <button 
                    key={item.id} 
                    onClick={() => setView(item.id)}
                    className={`flex flex-1 flex-col items-center justify-center pb-2 transition-colors ${view === item.id ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Icon name={item.icon} size={20} className={view === item.id ? "stroke-2" : "stroke-1.5"} />
                    <span className="text-[9px] font-bold uppercase mt-1 leading-none tracking-tight">{item.label}</span>
                </button>
            ))}
        </nav>
    );
};

export default MobileNav;