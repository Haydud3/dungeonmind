import React, { useState } from 'react';
import Icon from '../Icon';

const TokenManager = ({ data, onClose, addToken, onOpenCompendium, onOpenSheet }) => {
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('monsters'); // 'monsters', 'players'

    const npcs = data.npcs || [];
    const players = data.players || [];
    const activeTokens = data.campaign?.activeMap?.tokens || [];

    // Filter Templates: Only show "Originals" (not instances created for specific tokens)
    // If an NPC doesn't have 'isInstance' flag, it's a template.
    const templates = npcs.filter(n => !n.isInstance && n.name.toLowerCase().includes(search.toLowerCase()));

    // Helper: Find all active tokens on the map that are derived from a specific Template ID
    const getActiveInstances = (templateId) => {
        return activeTokens.filter(t => {
            // 1. Is the token directly using this template? (Old logic)
            if (t.characterId === templateId) return true;
            
            // 2. Is the token using an Instance Character derived from this template?
            const linkedChar = npcs.find(n => n.id === t.characterId);
            return linkedChar && linkedChar.originalId === templateId;
        });
    };

    return (
        <div className="absolute top-14 left-4 bottom-4 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col z-40 animate-in slide-in-from-left-5">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl">
                <h3 className="font-bold text-slate-200 flex items-center gap-2">
                    <Icon name="users" size={18}/> Token Library
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
            </div>

            {/* Tabs */}
            <div className="flex p-2 gap-2 border-b border-slate-700 bg-slate-800/50">
                <button 
                    onClick={() => setTab('monsters')} 
                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${tab==='monsters' ? 'bg-red-900/50 text-red-200 border border-red-800' : 'text-slate-500 hover:bg-slate-800'}`}
                >
                    Bestiary
                </button>
                <button 
                    onClick={() => setTab('players')} 
                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${tab==='players' ? 'bg-indigo-900/50 text-indigo-200 border border-indigo-800' : 'text-slate-500 hover:bg-slate-800'}`}
                >
                    Heroes
                </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-slate-700">
                <div className="relative">
                    <Icon name="search" size={16} className="absolute left-3 top-2.5 text-slate-500"/>
                    <input 
                        type="text" 
                        placeholder="Search..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-full py-1.5 pl-9 pr-4 text-sm text-white focus:border-indigo-500 outline-none"
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1">
                
                {tab === 'monsters' && (
                    <>
                        <button 
                            onClick={onOpenCompendium}
                            className="w-full py-3 border-2 border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-indigo-400 hover:border-indigo-500 hover:bg-indigo-900/10 flex items-center justify-center gap-2 transition-all mb-4"
                        >
                            <Icon name="download" size={18}/>
                            <span className="font-bold text-sm">Import from API</span>
                        </button>

                        {templates.map(npc => {
                            const instances = getActiveInstances(npc.id);
                            
                            return (
                                <div key={npc.id} className="bg-slate-800/50 rounded border border-slate-700 overflow-hidden">
                                    {/* Template Header */}
                                    <div className="p-2 flex items-center justify-between group hover:bg-slate-800">
                                        <div className="flex items-center gap-3">
                                            {npc.image ? (
                                                <img src={npc.image} className="w-8 h-8 rounded-full object-cover bg-black" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                                    {npc.name.substring(0,2).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm text-slate-200">{npc.name}</span>
                                                <span className="text-[10px] text-slate-500">{npc.type} • CR {npc.cr || '?'}</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => addToken(npc, 'npc')}
                                            className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
                                            title="Spawn New Token"
                                        >
                                            <Icon name="plus" size={14}/>
                                        </button>
                                    </div>

                                    {/* Active Instances List */}
                                    {instances.length > 0 && (
                                        <div className="bg-slate-950/30 border-t border-slate-700/50 p-1 space-y-0.5">
                                            {instances.map(token => (
                                                <div key={token.id} className="flex items-center justify-between pl-8 pr-2 py-1.5 rounded hover:bg-slate-800/50 group">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <Icon name="corner-down-right" size={12} className="text-slate-600 shrink-0"/>
                                                        <span className="text-xs text-slate-300 truncate">{token.name}</span>
                                                        {token.statuses?.includes('dead') && <Icon name="skull" size={12} className="text-red-500"/>}
                                                    </div>
                                                    <button 
                                                        onClick={() => onOpenSheet && onOpenSheet(token.id)}
                                                        className="opacity-0 group-hover:opacity-100 text-[10px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-0.5 rounded transition-opacity"
                                                    >
                                                        Sheet
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}

                {tab === 'players' && players.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(pc => (
                     <div key={pc.id} className="flex items-center justify-between p-2 bg-slate-800 rounded border border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-900 border border-indigo-500 flex items-center justify-center text-xs font-bold text-white">
                                {pc.name.substring(0,2)}
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-sm text-white">{pc.name}</span>
                                <span className="text-[10px] text-slate-400">Level {pc.level} {pc.class}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => addToken(pc, 'pc')}
                            className="text-xs bg-slate-700 hover:bg-indigo-600 text-white px-2 py-1 rounded"
                        >
                            Add
                        </button>
                     </div>
                ))}
            </div>
        </div>
    );
};

export default TokenManager;