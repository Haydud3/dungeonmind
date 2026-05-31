import React, { useState } from 'react';
import Icon from './Icon';

const DiceTray = ({ diceLog = [], handleDiceRoll, onClose, role, rollMode, setRollMode }) => {
    const [pool, setPool] = useState({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
    const [modifier, setModifier] = useState(0);
    const [advMode, setAdvMode] = useState('normal'); // 'normal', 'adv', 'dis'

    const addDie = (sides) => {
        setPool(prev => ({ ...prev, [sides]: prev[sides] + 1 }));
    };

    const removeDie = (sides) => {
        setPool(prev => ({ ...prev, [sides]: Math.max(0, prev[sides] - 1) }));
    };

    const clearPool = () => {
        setPool({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
        setModifier(0);
        setAdvMode('normal');
    };

    const handleRollClick = () => {
        let formulaParts = [];
        let hasD20 = false;
        
        Object.entries(pool).forEach(([sides, count]) => {
            if (count > 0) {
                if (sides === '20') hasD20 = true;
                formulaParts.push(`${count}d${sides}`);
            }
        });

        if (formulaParts.length === 0) {
            hasD20 = true;
            formulaParts.push('1d20');
        }

        let formula = formulaParts.join(' + ');
        if (modifier !== 0) {
            formula += modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
        }

        // Phase 1: Standardizing the Dice Formula for Adv/Dis
        let rollAlias = 'Custom Roll';
        let hasAnyDice = formulaParts.some(part => part.includes('d'));

        if (hasAnyDice && advMode !== 'normal') {
            if (advMode === 'adv') {
                formula = formula.replace(/(\d*)d(\d+)/g, (match, p1, p2) => {
                    const count = parseInt(p1) || 1;
                    return `${Math.max(2, count + 1)}d${p2}kh${count}`;
                });
                rollAlias = 'Advantage Roll';
            } else if (advMode === 'dis') {
                formula = formula.replace(/(\d*)d(\d+)/g, (match, p1, p2) => {
                    const count = parseInt(p1) || 1;
                    return `${Math.max(2, count + 1)}d${p2}kl${count}`;
                });
                rollAlias = 'Disadvantage Roll';
            }
        }

        handleDiceRoll(formula, { alias: rollAlias, advMode: advMode !== 'normal' ? advMode : undefined });
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
                <div className="flex items-center justify-between bg-slate-900 border border-slate-700/50 rounded-lg p-2 mb-3 shadow-inner">
                    <span className="text-[10px] font-bold text-slate-500 tracking-wider">ROLL MODE</span>
                    <div className="flex gap-1">
                        <button 
                            onClick={() => setRollMode && setRollMode('public')}
                            className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-colors ${rollMode === 'public' ? 'bg-amber-600 text-white shadow-md' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                        >
                            Public
                        </button>
                        <button 
                            onClick={() => setRollMode && setRollMode('private')}
                            className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-colors ${rollMode === 'private' ? 'bg-red-900/80 text-red-400 shadow-md' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                        >
                            Private
                        </button>
                    </div>
                </div>

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
                
                <div className="flex bg-slate-900 border border-slate-700/50 rounded-lg overflow-hidden mb-3 shadow-inner">
                    <button 
                        onClick={() => setAdvMode('dis')} 
                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold tracking-widest transition-colors ${advMode === 'dis' ? 'bg-red-900/50 text-red-400' : 'text-slate-500 hover:bg-slate-800'}`}
                    >
                        Disadvantage
                    </button>
                    <button 
                        onClick={() => setAdvMode('normal')} 
                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold tracking-widest transition-colors border-x border-slate-700/50 ${advMode === 'normal' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:bg-slate-800'}`}
                    >
                        Normal
                    </button>
                    <button 
                        onClick={() => setAdvMode('adv')} 
                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold tracking-widest transition-colors ${advMode === 'adv' ? 'bg-green-900/50 text-green-400' : 'text-slate-500 hover:bg-slate-800'}`}
                    >
                        Advantage
                    </button>
                </div>

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
                                    {log.description && <span className="text-[10px] text-slate-400 mt-1 whitespace-pre-wrap">{log.description}</span>}
                                </div>
                            ) : (
                                <>
                                    {(() => {
                                        const getRollVal = (r) => {
                                            if (r === null || r === undefined) return 0;
                                            if (typeof r === 'object') return Number(r.value ?? r.total ?? r.result ?? 0);
                                            return Number(r);
                                        };
                                        const activeNatural = log.natural ?? log.naturalRoll ?? 0;
                                        const activeTotal = log.result ?? log.total ?? 0;
                                        let rollsNode = log.rolls ? log.rolls.map(r => getRollVal(r)).join(' + ') : activeNatural;
                                        let finalNatural = activeNatural;
                                        let finalTotal = activeTotal;

                                        let inferredAdvMode = log.advMode;
                                        if ((!inferredAdvMode || inferredAdvMode === 'normal') && log.alias && typeof log.alias === 'string') {
                                            const lowerAlias = log.alias.toLowerCase();
                                            if (lowerAlias.includes('advantage') && !lowerAlias.includes('disadvantage')) inferredAdvMode = 'adv';
                                            else if (lowerAlias.includes('disadvantage')) inferredAdvMode = 'dis';
                                        }

                                        const formulaStr = String(log.formulaDisplay || '') + ' ' + String(log.formula || '') + ' ' + String(log.die || '');
                                        const lowerFormula = formulaStr.toLowerCase();
                                        if (lowerFormula.includes('kh1')) inferredAdvMode = 'adv';
                                        if (lowerFormula.includes('kl1')) inferredAdvMode = 'dis';

                                        if (inferredAdvMode && inferredAdvMode !== 'normal' && log.rolls && log.rolls.length >= 2) {
                                            const r1 = getRollVal(log.rolls[0]);
                                            const r2 = getRollVal(log.rolls[1]);
                                            let keptIdx = (inferredAdvMode === 'adv') ? (r1 >= r2 ? 0 : 1) : (r1 <= r2 ? 0 : 1);
                                            const droppedIdx = keptIdx === 0 ? 1 : 0;
                                            
                                            rollsNode = (
                                                <>
                                                    {log.rolls.map((rObj, i) => {
                                                        const r = getRollVal(rObj);
                                                        return (
                                                        <React.Fragment key={i}>
                                                            {i === droppedIdx ? (
                                                                <span className="opacity-40 line-through decoration-red-500">{r}</span>
                                                            ) : i === keptIdx ? (
                                                                <span className="text-amber-400 font-bold">{r}</span>
                                                            ) : (
                                                                <span>{r}</span>
                                                            )}
                                                            {i < log.rolls.length - 1 && <span className="text-slate-500 mx-1">, </span>}
                                                        </React.Fragment>
                                                        );
                                                    })}
                                                </>
                                            );
                                            
                                            finalTotal = activeTotal - getRollVal(log.rolls[droppedIdx]);
                                            finalNatural = getRollVal(log.rolls[keptIdx]);
                                        }

                                        const isCrit = finalNatural === 20 && log.die?.includes('d20');
                                        const isFumble = finalNatural === 1 && log.die?.includes('d20');
                                        
                                        return (
                                            <>
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="font-bold text-slate-300">{log.die}</span>
                                                    <span className="text-[10px] text-slate-500 truncate ml-2">{log.formulaDisplay}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-1 text-slate-400 text-xs flex-wrap">
                                                        <span className={isCrit ? "text-green-400 font-bold" : isFumble ? "text-red-400 font-bold" : "break-all"}>
                                                            [{rollsNode}]
                                                        </span>
                                                        {(log.mod ?? log.modifier ?? 0) !== 0 && <span>{(log.mod ?? log.modifier ?? 0) >= 0 ? '+' : ''}{(log.mod ?? log.modifier ?? 0)}</span>}
                                                    </div>
                                                    <span className="text-lg font-bold text-amber-500 whitespace-nowrap ml-2">= {Number.isFinite(finalTotal) ? finalTotal : 0}</span>
                                                </div>
                                                {(() => {
                                                    let isParsedSave = false;
                                                    let parsedSaveDc = undefined;
                                                    if (log.alias && typeof log.alias === 'string' && log.alias.toLowerCase().includes('save vs dc')) {
                                                        isParsedSave = true;
                                                        const match = log.alias.match(/DC\s*(\d+)/i);
                                                        if (match) parsedSaveDc = parseInt(match[1], 10);
                                                    }
                                                    const actualSaveDc = log.saveDc !== undefined ? log.saveDc : parsedSaveDc;
                                                    if ((log.actionType === 'save' || log.isSave || isParsedSave) && actualSaveDc !== undefined) {
                                                        return (
                                                            <div className={`mt-2 font-bold text-center w-full py-1 text-[10px] rounded ${finalTotal >= actualSaveDc ? 'bg-green-900/40 text-green-400 border border-green-500/30' : 'bg-red-900/40 text-red-400 border border-red-500/30'}`}>
                                                                {finalTotal >= actualSaveDc ? '✅ (Success)' : '❌ (Fail)'}
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </>
                                        );
                                    })()}
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