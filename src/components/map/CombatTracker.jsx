import React from 'react';
import Icon from '../Icon';

// 1. Added onClearRolls to the props
const CombatTracker = ({ combat, onNextTurn, onEndCombat, onClearRolls, role, updateCombatant, onRemove }) => {
    const combatants = combat?.combatants || [];
    const currentTurn = combat?.turn || 0;
    const currentRound = combat?.round || 1;

    // 2. Created a handler to manage ending combat and clearing rolls
    const handleEndCombat = () => {
        if (onEndCombat) onEndCombat();
        if (onClearRolls) onClearRolls();
    };

    return (
        <div className="absolute top-20 left-4 bottom-auto w-72 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl z-40 p-0 overflow-hidden flex flex-col max-h-[60vh] animate-in slide-in-from-left">
            {/* Header */}
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-red-500 fantasy-font flex items-center gap-2">
                        <Icon name="swords" size={16}/> Round {currentRound}
                    </h3>
                </div>
                {role === 'dm' && (
                    <button 
                        onClick={handleEndCombat} // 3. Updated onClick to use the new handler
                        className="text-[10px] bg-slate-700 hover:bg-red-900 text-slate-300 hover:text-white px-2 py-1 rounded transition-colors"
                    >
                        End
                    </button>
                )}
            </div>

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
                            <input 
                                type="number" 
                                value={c.init !== null ? c.init : ''} 
                                placeholder="-"
                                onChange={(e) => updateCombatant && updateCombatant(c.id, { init: e.target.value === '' ? null : parseInt(e.target.value) })}
                                className="w-8 bg-transparent text-center font-mono text-lg font-bold text-slate-400 outline-none border-b border-transparent focus:border-amber-500 focus:text-white"
                            />
                            
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