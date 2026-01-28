import React, { useState } from 'react';
import Icon from '../Icon';

// 1. Added onClearRolls to the props
const CombatTracker = ({ combat, onNextTurn, onEndCombat, onClearRolls, role, updateCombatant, onRemove, onAutoRoll, addManualCombatant, players, npcs }) => {
    const combatants = combat?.combatants || [];
    const [showAddMenu, setShowAddMenu] = useState(false);
    const currentTurn = combat?.turn || 0;
    const currentRound = combat?.round || 1;

    // START CHANGE: Define the missing handler to fix ReferenceError
    const handleEndCombat = () => {
        if (onEndCombat) onEndCombat();
        if (onClearRolls) onClearRolls();
    };

    const handleSort = () => {
        const sorted = [...combatants].sort((a, b) => {
            if (a.init === null) return 1;
            if (b.init === null) return -1;
            return b.init - a.init;
        });
        updateCombatant('reorder', sorted);
    };

    const rollIndividual = (c) => {
        const master = [...(players || []), ...(npcs || [])].find(n => n.id === c.characterId);
        const dexMod = master ? Math.floor(((master.stats?.dex || 10) - 10) / 2) : 0;
        const roll = Math.floor(Math.random() * 20) + 1;
        updateCombatant(c.id, { init: roll + dexMod });
    };

    return (
        <div className="absolute top-20 left-4 bottom-auto w-72 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl z-40 p-0 overflow-hidden flex flex-col max-h-[60vh] animate-in slide-in-from-left">
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-red-500 fantasy-font flex items-center gap-2"><Icon name="swords" size={16}/> Round {currentRound}</h3>
                <div className="flex gap-1">
                    {role === 'dm' && (
                        <>
                            <button onClick={() => setShowAddMenu(!showAddMenu)} title="Add Combatant" className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors shadow-lg"><Icon name="plus" size={14}/></button>
                            <button onClick={onAutoRoll} title="Auto-roll Monsters" className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors shadow-lg"><Icon name="zap" size={14}/></button>
                            <button onClick={handleEndCombat} className="text-[10px] bg-slate-700 hover:bg-red-900 px-2 py-1 rounded">End</button>
                        </>
                    )}
                </div>
            </div>

            {showAddMenu && role === 'dm' && (
                <div className="bg-slate-800 p-2 border-b border-slate-700 max-h-48 overflow-y-auto custom-scroll animate-in slide-in-from-top duration-200">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Available Characters</div>
                    {[...(players || []), ...(npcs || [])].filter(char => !combatants.find(c => c.characterId === char.id)).map(char => (
                        <button 
                            key={char.id} 
                            onClick={() => { addManualCombatant(char); setShowAddMenu(false); }}
                            className="w-full text-left p-2 hover:bg-indigo-600 rounded flex items-center gap-2 transition-colors mb-1 group"
                        >
                            <div className="w-6 h-6 rounded bg-slate-900 overflow-hidden border border-slate-700">
                                <img src={char.image || char.img} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate">{char.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1">
                {combatants.length === 0 ? (
                    <div className="text-center text-slate-500 py-4 text-xs italic">No combatants...</div>
                ) : (
                    combatants.map((c, i) => (
                        <div 
                            key={c.id || i} 
                            className={`flex items-center gap-2 p-2 rounded border transition-all group ${
                                i === currentTurn 
                                    ? 'bg-amber-900/40 border-amber-600/50 shadow-lg scale-[1.02]' 
                                    : 'bg-slate-800/50 border-transparent opacity-70'
                            }`}
                        >
                            {/* Initiative Input */}
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number" 
                                    inputMode="numeric"
                                    value={c.init !== null ? c.init : ''} 
                                    placeholder="-"
                                    onBlur={handleSort}
                                    onChange={(e) => updateCombatant && updateCombatant(c.id, { init: e.target.value === '' ? null : parseInt(e.target.value) })}
                                    className="w-8 bg-transparent text-center font-mono text-lg font-bold text-slate-400 outline-none border-b border-transparent focus:border-amber-500 focus:text-white"
                                />
                                {c.init === null && role === 'dm' && (
                                    <button onClick={() => rollIndividual(c)} className="text-indigo-400 hover:text-white animate-pulse">
                                        <Icon name="dice-d20" size={14} />
                                    </button>
                                )}
                            </div>
                            
                            <div className="w-8 h-8 rounded bg-slate-700 overflow-hidden border border-slate-600 shrink-0">
                                {c.image ? <img src={c.image} className="w-full h-full object-cover"/> : <div className="flex items-center justify-center h-full text-xs text-slate-500 font-bold">{c.name?.[0]}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-sm font-bold truncate ${i === currentTurn ? 'text-white' : 'text-slate-300'}`}>{c.name}</div>
                                <div className="text-[10px] text-slate-500 uppercase">{c.type === 'pc' ? 'Hero' : 'Enemy'}</div>
                            </div>
                            
                            {/* Remove Button */}
                            {role === 'dm' && (
                                <button onClick={() => onRemove && onRemove(c.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icon name="x" size={14}/>
                                </button>
                            )}

                            {i === currentTurn && <Icon name="chevron-left" size={16} className="text-amber-500 animate-pulse"/>}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            {role === 'dm' && (
                <div className="p-3 border-t border-slate-700 bg-slate-800">
                    <button onClick={onNextTurn} className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded flex items-center justify-center gap-2 text-sm shadow-lg">
                        Next Turn <Icon name="arrow-right" size={14}/>
                    </button>
                </div>
            )}
        </div>
    );
};

export default CombatTracker;