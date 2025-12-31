import React from 'react';
import Icon from './Icon';

const Sidebar = ({ view, setView, onExit }) => {
    const navItems = [
        { id: 'session', icon: 'scroll-text', label: 'Session' },
        { id: 'journal', icon: 'book-open-text', label: 'Journal' },
        { id: 'world', icon: 'map', label: 'World' },
        { id: 'party', icon: 'users', label: 'Party' },
        { id: 'npcs', icon: 'skull', label: 'NPCs' },
        { id: 'settings', icon: 'settings-2', label: 'Config' },
    ];

    return (
        <aside className="hidden md:flex w-20 flex-col items-center bg-slate-900 border-r border-slate-800 py-4 z-20 h-full shrink-0">
            <div className="mb-2 text-amber-500">
                <Icon name="dungeon" size={32} />
            </div>
            
            {/* Navigation Buttons */}
            <nav className="flex-1 flex flex-col gap-4 w-full mt-6">
                {navItems.map(item => (
                    <button 
                        key={item.id} 
                        onClick={() => setView(item.id)} 
                        className={`w-full py-3 flex justify-center transition-all border-l-4 ${view === item.id ? 'border-amber-500 bg-slate-800 text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-200'}`}
                        title={item.label}
                    >
                        <Icon name={item.icon} size={24} />
                    </button>
                ))}
            </nav>

            <button onClick={onExit} className="mb-4 text-red-500 hover:bg-red-900/30 p-2 rounded" title="Sign Out">
                <Icon name="log-out" size={20}/>
            </button>
        </aside>
    );
};

export default Sidebar;