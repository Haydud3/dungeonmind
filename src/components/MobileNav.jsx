import React, { useState } from 'react';
import Icon from './Icon';

const PRIMARY_NAV_ITEMS = [
    { id: 'map', icon: 'map', label: 'Map' },
    { id: 'session', icon: 'message-square', label: 'Chat' },
    { id: 'party', icon: 'users', label: 'Party' },
    { id: 'journal', icon: 'book-open', label: 'Journal' }
];

const SECONDARY_NAV_ITEMS = [
    { id: 'npcs', icon: 'skull', label: 'Bestiary', subtitle: 'Adversaries & NPCs' },
    { id: 'module', icon: 'compass', label: 'Module Hub', subtitle: 'Adventures & Packs' },
    { id: 'lore', icon: 'library', label: 'World Lore', subtitle: 'Lore Bible & Notes' },
    { id: 'settings', icon: 'settings', label: 'Preferences', subtitle: 'Settings & Audio' }
];

const MobileNav = ({ view, setView, compact, className = "" }) => {
    const [showMore, setShowMore] = useState(false);
    const isSecondaryActive = SECONDARY_NAV_ITEMS.some(item => item.id === view);
    const activeSecondary = SECONDARY_NAV_ITEMS.find(item => item.id === view);

    return (
        <>
            {/* Backdrop for Codex Drawer */}
            {showMore && (
                <div 
                    className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                    onClick={() => setShowMore(false)}
                />
            )}

            {/* Slide-up Realm Codex Drawer */}
            {showMore && (
                <div 
                    className="md:hidden fixed left-3 right-3 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-2 border-amber-500/40 rounded-3xl shadow-[0_-12px_45px_rgba(0,0,0,0.8)] p-4 z-50 animate-in slide-in-from-bottom-4 duration-200"
                    style={{ 
                        bottom: compact 
                            ? 'calc(58px + env(safe-area-inset-bottom, 0px))' 
                            : 'calc(68px + env(safe-area-inset-bottom, 0px))' 
                    }}
                >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                                <Icon name="sparkles" size={14} />
                            </div>
                            <span className="text-xs font-black uppercase tracking-wider text-amber-300 fantasy-font">
                                Realm Codex & Tools
                            </span>
                        </div>
                        <button 
                            onClick={() => setShowMore(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Close Menu"
                        >
                            <Icon name="x" size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        {SECONDARY_NAV_ITEMS.map(item => {
                            const isActive = view === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        setView(item.id);
                                        setShowMore(false);
                                    }}
                                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all active:scale-98 ${
                                        isActive
                                            ? 'bg-gradient-to-r from-amber-950/60 to-slate-900/95 border-amber-500/80 text-amber-300 shadow-lg shadow-amber-950/40 ring-1 ring-amber-400/30'
                                            : 'bg-slate-900/80 border-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-700'
                                    }`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                                        isActive 
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-inner' 
                                            : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
                                    }`}>
                                        <Icon name={item.icon} size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-bold truncate">{item.label}</div>
                                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.subtitle}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Bottom Navigation Bar */}
            <nav 
                id="mobile-nav"
                className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-2xl border-t border-slate-800/90 shadow-[0_-8px_30px_rgba(0,0,0,0.7)] flex justify-around z-50 transition-all duration-300 px-2
                    ${compact 
                        ? 'items-center' 
                        : 'items-center'
                    } ${className}`}
                style={{ 
                    height: compact 
                        ? 'calc(54px + env(safe-area-inset-bottom, 0px))' 
                        : 'calc(62px + env(safe-area-inset-bottom, 0px))',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
                    paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))'
                }}
            >
                {PRIMARY_NAV_ITEMS.map(item => {
                    const isActive = view === item.id;
                    return (
                        <button 
                            key={item.id} 
                            onClick={() => {
                                setView(item.id);
                                setShowMore(false);
                            }}
                            className={`relative flex flex-1 flex-col items-center justify-center transition-all active:scale-95 ${
                                isActive 
                                    ? 'text-amber-300' 
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                            style={{ height: '100%' }}
                        >
                            {/* Top Glowing Indicator Pip */}
                            {isActive && (
                                <span className="absolute top-0 w-6 h-0.5 bg-gradient-to-r from-amber-400 to-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,1)]" />
                            )}
                            
                            <div className={`p-1 sm:p-1.5 rounded-xl flex items-center justify-center transition-all ${
                                isActive 
                                    ? 'bg-amber-500/15 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]' 
                                    : ''
                            }`}>
                                <Icon 
                                    name={item.icon} 
                                    size={compact ? 22 : 19} 
                                    className={isActive ? "stroke-2 text-amber-300" : "stroke-1.5"} 
                                />
                            </div>
                            
                            {!compact && (
                                <span className={`text-[9px] font-black uppercase mt-0.5 leading-none tracking-wider ${
                                    isActive ? 'text-amber-300' : 'text-slate-500'
                                }`}>
                                    {item.label}
                                </span>
                            )}
                        </button>
                    );
                })}

                {/* More / Codex Drawer Toggle */}
                <button 
                    onClick={() => setShowMore(prev => !prev)}
                    className={`relative flex flex-1 flex-col items-center justify-center transition-all active:scale-95 ${
                        showMore || isSecondaryActive 
                            ? 'text-amber-300' 
                            : 'text-slate-400 hover:text-slate-200'
                    }`}
                    style={{ height: '100%' }}
                    title="Realm Codex & Options"
                >
                    {(showMore || isSecondaryActive) && (
                        <span className="absolute top-0 w-6 h-0.5 bg-gradient-to-r from-amber-400 to-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,1)]" />
                    )}

                    <div className={`p-1 sm:p-1.5 rounded-xl flex items-center justify-center transition-all relative ${
                        showMore || isSecondaryActive 
                            ? 'bg-amber-500/15 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]' 
                            : ''
                    }`}>
                        <Icon 
                            name="sparkles" 
                            size={compact ? 22 : 19} 
                            className={showMore || isSecondaryActive ? "stroke-2 text-amber-300" : "stroke-1.5"} 
                        />
                        {isSecondaryActive && !showMore && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,1)] ring-1 ring-slate-950" />
                        )}
                    </div>

                    {!compact && (
                        <span className={`text-[9px] font-black uppercase mt-0.5 leading-none tracking-wider ${
                            showMore || isSecondaryActive ? 'text-amber-300' : 'text-slate-500'
                        }`}>
                            {isSecondaryActive ? activeSecondary?.label || 'Codex' : 'Codex'}
                        </span>
                    )}
                </button>
            </nav>
        </>
    );
};

export default MobileNav;