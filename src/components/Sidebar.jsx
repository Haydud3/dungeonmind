import React from 'react';
import Icon from './Icon';
import DungeonmindLogo from './DungeonmindLogo';
import { useNewCampaign } from '../contexts/NewCampaignProvider';

const Sidebar = ({ view, setView }) => {
    const { leaveCampaign } = useNewCampaign();

    const navItems = [
        { id: 'session', icon: 'message-square', label: 'Chat & Rolls' },
        { id: 'map', icon: 'map', label: 'Tactical Map' },
        { id: 'party', icon: 'users', label: 'Party Roster' },
        { id: 'journal', icon: 'book-open', label: 'Journal & Notes' },
        { id: 'npcs', icon: 'skull', label: 'Bestiary & NPCs' },
        { id: 'lore', icon: 'library', label: 'World Lore' },
        { id: 'module', icon: 'compass', label: 'Module Hub' },
        { id: 'settings', icon: 'settings', label: 'Preferences' }
    ];

    return (
        <aside 
            id="app-sidebar" 
            className="hidden md:flex flex-col w-20 bg-slate-950/90 backdrop-blur-2xl border-r border-slate-800/90 shrink-0 z-50 py-3 shadow-[4px_0_30px_rgba(0,0,0,0.6)]"
        >
            {/* Top Brand Emblem */}
            <div className="flex justify-center mb-5 shrink-0">
                <button 
                    type="button"
                    onClick={() => setView('session')}
                    className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50 rounded-2xl"
                    title="Dungeonmind VTT"
                >
                    <DungeonmindLogo size={42} />
                </button>
            </div>
            
            {/* Navigation Icons Dock */}
            <nav className="flex-1 flex flex-col gap-2.5 items-center justify-start overflow-y-auto custom-scroll no-scrollbar py-1">
                {navItems.map(item => {
                    const isActive = view === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setView(item.id)}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all group relative active:scale-95 ${
                                isActive 
                                    ? 'bg-gradient-to-br from-amber-500/25 via-amber-600/10 to-transparent text-amber-300 border border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/30 scale-105' 
                                    : 'text-slate-400 hover:text-amber-200 hover:bg-slate-900/90 hover:border-slate-700/80 border border-transparent'
                            }`}
                            title={item.label}
                        >
                            {/* Left Active Indicator Spine Pip */}
                            {isActive && (
                                <span className="absolute -left-3 w-1.5 h-7 bg-gradient-to-b from-amber-400 to-amber-600 rounded-r-full shadow-[0_0_10px_rgba(245,158,11,0.9)]" />
                            )}
                            
                            <Icon 
                                name={item.icon} 
                                size={22} 
                                className={isActive ? "stroke-2 text-amber-300" : "stroke-1.5 transition-colors group-hover:text-amber-200"} 
                            />
                            
                            {/* Dark Fantasy Tooltip Flyout */}
                            <div className="absolute left-16 bg-slate-950/95 backdrop-blur-xl text-white font-bold text-xs px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap pointer-events-none border border-amber-500/30 shadow-[0_8px_25px_rgba(0,0,0,0.8)] z-50 flex items-center gap-2 tracking-wide">
                                <span>{item.label}</span>
                            </div>
                        </button>
                    );
                })}
            </nav>

            {/* Exit Realm Action */}
            <div className="pt-3 flex flex-col items-center shrink-0 border-t border-slate-900">
                <button 
                    onClick={() => {
                        localStorage.removeItem('dm_last_session');
                        leaveCampaign();
                    }} 
                    className="w-11 h-11 rounded-2xl bg-slate-950/80 border border-rose-900/40 text-rose-400 hover:text-white hover:bg-rose-950/80 hover:border-rose-500/60 flex items-center justify-center transition-all shadow-md group relative active:scale-95"
                    title="Exit Realm"
                >
                    <Icon name="log-out" size={19} className="stroke-1.5 transition-colors" />
                    <div className="absolute left-16 bg-slate-950/95 backdrop-blur-xl text-rose-300 font-bold text-xs px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap pointer-events-none border border-rose-900/60 shadow-[0_8px_25px_rgba(0,0,0,0.8)] z-50">
                        Exit Realm
                    </div>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;