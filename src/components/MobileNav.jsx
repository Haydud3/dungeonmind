import React from 'react';
import Icon from './Icon';

const MobileNav = ({ view, setView, className = "" }) => {
    // Configuration matching Sidebar.jsx
    const navItems = [
        { id: 'session', icon: 'message-circle', label: 'Chat' },
        { id: 'map', icon: 'map', label: 'VTT' }, // Tactical Map
        { id: 'party', icon: 'users', label: 'Party' },
        { id: 'npcs', icon: 'skull', label: 'NPCs' },
        { id: 'atlas', icon: 'globe', label: 'Atlas' }, // World Creator
        { id: 'journal', icon: 'book', label: 'Lore' },
        { id: 'settings', icon: 'settings', label: 'Cfg' }
    ];

    return (
        <nav className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-1 z-50 pb-safe h-14 ${className}`}>
            {navItems.map(item => (
                <button 
                    key={item.id} 
                    onClick={() => setView(item.id)} 
                    className={`flex flex-1 flex-col items-center justify-center h-full transition-colors ${view === item.id ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Icon name={item.icon} size={20} className={view === item.id ? "stroke-2" : "stroke-1.5"} />
                    <span className="text-[9px] font-bold uppercase mt-1 leading-none tracking-tight">{item.label}</span>
                </button>
            ))}
        </nav>
    );
};

export default MobileNav;