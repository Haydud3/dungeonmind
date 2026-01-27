import React from 'react';
import Icon from './Icon';

const MobileNav = ({ view, setView, className = "" }) => {
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
            className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-between px-1 z-50 pb-[env(safe-area-inset-bottom,4px)] ${className}`}
            style={{ height: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}
        >
            {navItems.map(item => (
                <button 
                    key={item.id} 
                    onClick={() => setView(item.id)}
                    className={`flex flex-1 flex-col items-center justify-center h-full transition-colors ${view === item.id ? 'text-amber-500' : 'text-slate-500'}`}
                >
                    <Icon name={item.icon} size={20} />
                    <span className="text-[10px] font-bold uppercase mt-1">{item.label}</span>
                </button>
            ))}
        </nav>
    );
};

export default MobileNav;