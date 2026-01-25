import React from 'react';
import Icon from '../Icon';

const TokenManager = ({ data, onDragStart }) => {
    const players = data.players || [];
    // START CHANGE: Filter out instances so only Master Blueprints appear in the sidebar
    const npcs = (data.npcs || []).filter(n => !n.isInstance);
    // END CHANGE

    return (
        <div className="flex flex-col h-full text-slate-200">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 px-1">Drag to Spawn</h3>
            
            <div className="flex-1 overflow-y-auto custom-scroll space-y-6 pr-2">
                {/* PLAYERS */}
                <div>
                    <h4 className="text-xs font-bold text-indigo-400 mb-2 flex items-center gap-2"><Icon name="users" size={12}/> Party</h4>
                    <div className="space-y-2">
                        {/* START CHANGE: Filter out PCs already on the map */}
                        {players.filter(p => !data.campaign?.activeMap?.tokens?.some(t => t.characterId === p.id)).map(p => (
                            <div 
                                key={p.id} 
                                draggable 
                                onDragStart={(e) => onDragStart(e, p, 'pc')}
                                className="flex items-center gap-3 bg-slate-800 p-2 rounded border border-slate-700 hover:border-indigo-500 cursor-grab active:cursor-grabbing transition-colors"
                            >
                                <div className="w-8 h-8 rounded bg-slate-900 overflow-hidden border border-slate-600 shrink-0">
                                    {p.image ? <img src={p.image} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-[10px]">{p.name[0]}</div>}
                                </div>
                                <span className="text-sm font-bold truncate">{p.name}</span>
                            </div>
                        ))}
                        {players.length === 0 && <div className="text-[10px] text-slate-600 italic px-2">No heroes found.</div>}
                    </div>
                </div>

                {/* NPCS */}
                <div>
                    <h4 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-2"><Icon name="skull" size={12}/> Bestiary</h4>
                    <div className="space-y-2">
                        {npcs.map(n => (
                            <div 
                                key={n.id} 
                                draggable 
                                onDragStart={(e) => onDragStart(e, n, 'npc')}
                                className="flex items-center gap-3 bg-slate-800 p-2 rounded border border-slate-700 hover:border-red-500 cursor-grab active:cursor-grabbing transition-colors"
                            >
                                <div className="w-8 h-8 rounded bg-slate-900 overflow-hidden border border-slate-600 shrink-0">
                                    {n.image ? <img src={n.image} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-[10px]"><Icon name="skull" size={12}/></div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold truncate">{n.name}</div>
                                    <div className="text-[10px] text-slate-500 truncate">{n.race} {n.class}</div>
                                </div>
                            </div>
                        ))}
                        {npcs.length === 0 && <div className="text-[10px] text-slate-600 italic px-2">No monsters found.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TokenManager;