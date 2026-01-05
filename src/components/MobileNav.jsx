import React from 'react';
import Icon from './Icon';

const MobileNav = ({ view, setView, className = "" }) => (
    // Reverted to h-auto / min-h with pb-safe to keep icons nicely centered and safe
    <nav className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex items-center justify-around z-50 pt-2 pb-safe min-h-[4rem] ${className}`}>
         {['session', 'journal', 'world', 'party', 'npcs', 'settings'].map(v => (
            <button key={v} onClick={() => setView(v)} className={`flex flex-col items-center justify-center w-12 py-1 ${view === v ? 'text-amber-500' : 'text-slate-500'}`}>
                <Icon name={v === 'session' ? 'scroll-text' : v === 'journal' ? 'book-open-text' : v === 'world' ? 'map' : v === 'party' ? 'users' : v === 'npcs' ? 'skull' : 'settings-2'} size={20} />
                <span className="text-[9px] uppercase mt-1 leading-none">{v === 'npcs' ? 'NPCs' : v}</span>
            </button>
        ))}
    </nav>
);

export default MobileNav;
