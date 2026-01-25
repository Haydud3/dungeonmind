import React from 'react';
import Icon from './Icon';

const Sidebar = ({ view, setView, onExit }) => {
    const navItems = [
        { id: 'session', icon: 'message-circle', label: 'Chat' },
        { id: 'journal', icon: 'book', label: 'Journal' },
        // START CHANGE: Ensure Tactical Map button is clean
        { id: 'map', icon: 'map', label: 'Tactical' },
        { id: 'party', icon: 'users', label: 'Party' },
        { id: 'npcs', icon: 'skull', label: 'Bestiary' },
        { id: 'lore', icon: 'library', label: 'Lore' },
        { id: 'settings', icon: 'settings', label: 'Settings' }
    ];

    return (
        <div className="hidden md:flex flex-col w-20 bg-slate-950 border-r border-slate-800 shrink-0 z-50">
            <div className="p-4 flex justify-center mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-600 to-red-700 rounded-xl shadow-lg flex items-center justify-center text-white font-bold text-xl fantasy-font">
                    DM
                </div>
            </div>
            
            <nav className="flex-1 flex flex-col gap-4 items-center">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setView(item.id)}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all group relative ${view === item.id ? 'bg-indigo-600 text-white shadow-indigo-500/50 shadow-lg scale-105' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                        <Icon name={item.icon} size={24} />
                        <div className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-slate-600 z-50">
                            {item.label}
                        </div>
                    </button>
                ))}
            </nav>

            <div className="p-4 flex flex-col gap-4 items-center">
                <button onClick={onExit} className="w-10 h-10 rounded-full bg-red-900/20 text-red-500 hover:bg-red-900/50 flex items-center justify-center transition-colors">
                    <Icon name="log-out" size={20}/>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;