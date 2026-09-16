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
        { id: 'module', icon: 'book-plus', label: 'Hub' },
        { id: 'settings', icon: 'settings', label: 'Cfg' }
    ];

    return (
        <nav 
            id="mobile-nav"
            className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex justify-between z-50 transition-all duration-300
                ${compact 
                    ? 'items-center' 
                    : 'items-start pt-1.5'
                } ${className}`}
            style={{ 
                height: compact 
                    ? 'calc(52px + env(safe-area-inset-bottom, 0px))' 
                    : 'calc(60px + env(safe-area-inset-bottom, 0px))',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))'
            }}
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