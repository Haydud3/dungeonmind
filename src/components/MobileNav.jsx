import React from 'react';
import Icon from './Icon';

const MobileNav = ({ view, setView }) => {
    const navItems = [
        { id: 'session', icon: 'scroll-text', label: 'Chat' },
        { id: 'journal', icon: 'book-open-text', label: 'Journal' },
        { id: 'world', icon: 'map', label: 'World' },
        { id: 'party', icon: 'users', label: 'Party' },
        { id: 'npcs', icon: 'skull', label: 'NPCs' },
        { id: 'settings', icon: 'settings-2', label: 'Config' },
    ];

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-slate-800 flex items-center justify-around z-50 pb-safe">
            {navItems.map(item => (
                <button 
                    key={item.id} 
                    onClick={() => setView(item.id)} 
                    className={`p-2 flex flex-col items-center justify-center transition-colors ${view === item.id ? 'text-amber-500' : 'text-slate-500'}`}
                >
                    <Icon name={item.icon} size={20} />
                    <span className="text-[9px] uppercase mt-1 font-bold">{item.label}</span>
                </button>
            ))}
        </nav>
    );
};

export default MobileNav;