import React, { useState } from 'react';
import Icon from './Icon';

const DiceTray = ({ diceLog = [], handleDiceRoll, onClose }) => {
    const [pool, setPool] = useState({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
    const [modifier, setModifier] = useState(0);

    const addDie = (sides) => {
        setPool(prev => ({ ...prev, [sides]: prev[sides] + 1 }));
    };

    const removeDie = (sides) => {
        setPool(prev => ({ ...prev, [sides]: Math.max(0, prev[sides] - 1) }));
    };

    const clearPool = () => {
        setPool({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
        setModifier(0);
    };

    const handleRollClick = () => {
        let formulaParts = [];
        Object.entries(pool).forEach(([sides, count]) => {
            if (count > 0) formulaParts.push(`${count}d${sides}`);
        });

        if (formulaParts.length === 0) {
            // Default to 1d20 if nothing selected but they click roll
            formulaParts.push('1d20');
        }

        let formula = formulaParts.join(' + ');
        if (modifier !== 0) {
            formula += modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
        }

        // We'll roll the combined formula. 
        // Note: handleDiceRoll currently handles one basic formula like "XdY + Z". 
        // Wait, if App.jsx handleDiceRoll uses a simple regex `(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?`, it can only roll one type of die at a time!
        // To support "2d6 + 1d4", handleDiceRoll in App.jsx needs an update, OR DiceTray handles the math and sends it.
        // The user asked for D&D Beyond style multi-rolling. 
        
        // For now, let's fire off separate rolls for each die type if there are multiple, OR we can roll them here.
        // But handleDiceRoll broadcasts the result. So firing multiple handleDiceRoll is easiest without changing App.jsx regex.
        
        // Actually, if we just iterate and roll:
        let totalTotal = 0;
        let totalMod = modifier;
        
        Object.entries(pool).forEach(([sides, count], index) => {
            if (count > 0) {
                // Only apply modifier to the last roll to avoid double-adding it, or just apply it to the first.
                const isLast = index === Object.keys(pool).filter(k => pool[k] > 0).length - 1;
                const currentMod = isLast ? modifier : 0;
                const form = `${count}d${sides}${currentMod !== 0 ? (currentMod > 0 ? '+' + currentMod : currentMod) : ''}`;
                handleDiceRoll(form);
            }
        });
        
        if (Object.keys(pool).every(k => pool[k] === 0)) {
            handleDiceRoll(`1d20${modifier !== 0 ? (modifier > 0 ? '+' + modifier : modifier) : ''}`);
        }

        clearPool();
    };

    const hasDice = Object.values(pool).some(c => c > 0);

    return (
        <div className="flex flex-col h-full bg-slate-900">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
                <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="dices" size={18}/> Dice Roller</h3>
                {onClose && (
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18}/></button>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col custom-scroll">
                {/* Dice Buttons */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                    {[4, 6, 8, 10, 12, 20, 100].map(d => (
                        <div key={d} className="relative group">
                            <button 
                                onClick={() => addDie(d)} 
                                onContextMenu={(e) => { e.preventDefault(); removeDie(d); }}
                                className="w-full bg-slate-800 hover:bg-amber-600 text-sm font-bold font-mono py-3 rounded border border-slate-600 hover:border-amber-500 transition-colors text-white relative overflow-hidden"
                                title="Left click to add, Right click to remove"
                            >
                                d{d}
                            </button>
                            {pool[d] > 0 && (
                                <div className="absolute -top-2 -right-2 bg-amber-500 text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-amber-400 pointer-events-none shadow-md animate-in zoom-in">
                                    {pool[d]}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Modifier & Controls */}
                <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                        <span className="text-xs font-bold text-slate-500 tracking-wider">MODIFIER</span>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setModifier(m => m - 1)} className="w-8 h-8 bg-slate-700 rounded hover:bg-slate-600 flex items-center justify-center font-bold text-white transition-colors">-</button>
                            <span className="font-mono text-base font-bold w-8 text-center text-amber-500">{modifier > 0 ? `+${modifier}` : modifier}</span>
                            <button onClick={() => setModifier(m => m + 1)} className="w-8 h-8 bg-slate-700 rounded hover:bg-slate-600 flex items-center justify-center font-bold text-white transition-colors">+</button>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={clearPool} 
                            className="flex-1 py-3 bg-slate-800 hover:bg-red-900/50 text-sm font-bold rounded border border-slate-700 hover:border-red-500/50 text-slate-400 hover:text-red-400 transition-colors"
                        >
                            Clear
                        </button>
                        <button 
                            onClick={handleRollClick} 
                            className={`flex-[2] py-3 rounded text-sm font-bold flex items-center justify-center gap-2 transition-all ${hasDice || modifier !== 0 ? 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                        >
                            <Icon name="dices" size={16}/> Roll
                        </button>
                    </div>
                </div>
                
                {/* History */}
                <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2 mt-2">Recent Rolls</h4>
                <div className="flex-1 overflow-y-auto custom-scroll bg-slate-950/50 rounded-lg p-3 font-mono text-xs space-y-2 border border-slate-800 shadow-inner">
                    {diceLog.length === 0 && <div className="text-center text-slate-600 italic py-4">No recent activity</div>}
                    {diceLog.map(log => (
                        <div key={log.id} className="flex flex-col bg-slate-900/80 p-2 rounded border border-slate-800">
                            {log.formulaDisplay === '1d0' && log.result === 0 && log.alias ? (
                                <div className="flex flex-col">
                                    <span className="font-bold text-indigo-300">Used: {log.alias}</span>
                                    {log.description && <span className="text-[10px] text-slate-400 mt-1">{log.description}</span>}
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="font-bold text-slate-300">{log.die}</span>
                                        <span className="text-[10px] text-slate-500 truncate ml-2">{log.formulaDisplay}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-1 text-slate-400 text-xs flex-wrap">
                                            <span className={Number.isFinite(log.natural) && log.natural == 20 && log.die.includes('d20') && log.die.startsWith('1d20') ? "text-green-400 font-bold" : Number.isFinite(log.natural) && log.natural == 1 && log.die.includes('d20') && log.die.startsWith('1d20') ? "text-red-400 font-bold" : "break-all"}>
                                                [{log.rolls ? log.rolls.join(' + ') : (Number.isFinite(log.natural) ? log.natural : 0)}]
                                            </span>
                                            {log.mod !== undefined && log.mod !== 0 && <span>{log.mod >= 0 ? '+' : ''}{log.mod}</span>}
                                        </div>
                                        <span className="text-lg font-bold text-amber-500 whitespace-nowrap ml-2">= {Number.isFinite(log.result) ? log.result : 0}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DiceTray;