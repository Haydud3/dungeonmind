import React, { useState, useRef } from 'react';
import Icon from '../Icon';
import { useCharacterStore } from '../../stores/useCharacterStore';

const TokenManager = ({ data, onDragStart }) => {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const setSidebarDragEntity = useCharacterStore(state => state.setSidebarDragEntity);
    const setDragPosition = useCharacterStore(state => state.setDragPosition);
    const holdTimer = useRef(null);

    const handlePointerDown = (e, entity, type) => {
        const startX = e.clientX;
        const startY = e.clientY;

        holdTimer.current = setTimeout(() => {
            if (window.navigator.vibrate) window.navigator.vibrate(40);
            
            setSidebarDragEntity({ 
                ...entity, 
                type,
                image: entity.image || entity.img
            });
            setDragPosition({ x: e.clientX, y: e.clientY });
        }, 300);

        const cancelHold = (moveEvent) => {
            const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
            if (dist > 10) {
                clearTimeout(holdTimer.current);
                window.removeEventListener('pointermove', cancelHold);
            }
        };

        window.addEventListener('pointermove', cancelHold);
        window.addEventListener('pointerup', () => {
            clearTimeout(holdTimer.current);
            window.removeEventListener('pointermove', cancelHold);
        }, { once: true });
    };

    const handleSearch = async () => {
        if (!search.trim()) return;
        setIsLoading(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/monsters?name=${search}`);
            const json = await res.json();
            setResults(json.results.slice(0, 20));
        } catch (e) { console.error(e); }
        setIsLoading(false);
    };

    const players = data.players || [];
    // START CHANGE: Filter out instances so only Master Blueprints appear in the sidebar
    const npcs = (data.npcs || []).filter(n => !n.isInstance);

    return (
        <div className="flex flex-col h-full text-slate-200" style={{ touchAction: 'pan-y' }}>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 px-1">Hold to Spawn</h3>

            {/* SEARCH BAR */}
            <div className="flex gap-1 mb-4">
                <input 
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" 
                    placeholder="Search SRD..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={handleSearch} disabled={isLoading} className="bg-indigo-600 px-2 rounded text-white">
                    {isLoading ? <Icon name="loader" size={12} className="animate-spin"/> : <Icon name="search" size={12}/>}
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll space-y-6 pr-2">
                {/* SEARCH RESULTS */}
                {results.length > 0 && (
                    <div className="border-b border-slate-700 pb-4">
                        <h4 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-2"><Icon name="globe" size={12}/> Web Results</h4>
                        <div className="space-y-1">
                            {results.map(r => (
                                <div 
                                    key={r.index}
                                    onPointerDown={(e) => handlePointerDown(e, { name: r.name, url: r.url }, 'api-import')}
                                    className="bg-slate-800 p-2 rounded border border-slate-700 hover:border-amber-500 cursor-grab active:cursor-grabbing text-xs truncate flex items-center gap-2"
                                >
                                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
        {r.name}
    </div>
))}
                        </div>
                    </div>
                )}

                {/* PLAYERS */}
                <div>
                    <h4 className="text-xs font-bold text-indigo-400 mb-2 flex items-center gap-2"><Icon name="users" size={12}/> Party</h4>
                    <div className="space-y-2">
                        {/* PC LOOP */}
                        {players.filter(p => !data.campaign?.activeMap?.tokens?.some(t => t.characterId === p.id)).map(p => (
                            <div 
                                key={p.id} 
                                onPointerDown={(e) => handlePointerDown(e, p, 'pc')}
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
                                onPointerDown={(e) => handlePointerDown(e, n, 'npc')}
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