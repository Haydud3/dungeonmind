import React, { useState } from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';
import Icon from '../components/Icon';

const ABILITIES = [
    { key: 'str', label: 'Strength' },
    { key: 'dex', label: 'Dexterity' },
    { key: 'con', label: 'Constitution' },
    { key: 'int', label: 'Intelligence' },
    { key: 'wis', label: 'Wisdom' },
    { key: 'cha', label: 'Charisma' }
];

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

const Step4Abilities = () => {
    const { draft, updateDraft, pendingChoices } = useCharacterBuilderStore();
    const [mode, setMode] = useState('standard'); // standard, pointbuy, manual
    const [rolledPool, setRolledPool] = useState([]);
    const [manualRollInput, setManualRollInput] = useState('');
    
    // Ensure abilityScores exist
    const scores = draft.abilityScores || { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

    // Mode switching handler
    const handleModeChange = (newMode) => {
        setMode(newMode);
        setRolledPool([]);
        if (newMode === 'pointbuy') {
            updateDraft({ abilityScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } });
        } else if (newMode === 'standard') {
            updateDraft({ abilityScores: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } });
        } else {
            updateDraft({ abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
        }
    };

    const updateScore = (stat, value) => {
        updateDraft({ abilityScores: { ...scores, [stat]: value } });
    };

    const getRacialBonus = (statKey) => {
        let bonus = 0;
        // Check direct species bonuses
        if (draft.species?.ability_bonuses) {
            const match = draft.species.ability_bonuses.find(b => b.ability_score?.index === statKey);
            if (match) bonus += match.bonus;
        }
        // Check direct subspecies bonuses
        if (draft.subspecies?.ability_bonuses) {
            const match = draft.subspecies.ability_bonuses.find(b => b.ability_score?.index === statKey);
            if (match) bonus += match.bonus;
        }
        // Check flexible pending choices (e.g., Half-Elf "+1 to two other stats")
        pendingChoices.forEach(choice => {
            if (choice.type === 'ability_bonuses' && choice.selections?.includes(statKey)) {
                const option = choice.options.find(o => o.value === statKey);
                bonus += (option?.bonus || 1); // Defaults to +1 if not explicitly declared in schema
            }
        });
        return bonus;
    };

    const getModifier = (total) => Math.floor((total - 10) / 2);

    // Point Buy Math
    const pointsUsed = Object.values(scores).reduce((acc, val) => acc + (POINT_BUY_COST[val] || 0), 0);
    const pointsRemaining = 27 - pointsUsed;

    // Standard Array Deduplication
    const availableStandard = STANDARD_ARRAY.filter(val => !Object.values(scores).includes(val));

    const renderInput = (stat) => {
        if (mode === 'standard') {
            return (
                <select 
                    value={scores[stat.key] || ""} 
                    onChange={(e) => updateScore(stat.key, parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded py-1 px-2 outline-none focus:border-blue-500 font-bold text-sm"
                >
                    <option value="">--</option>
                    {scores[stat.key] ? <option value={scores[stat.key]}>{scores[stat.key]}</option> : null}
                    {availableStandard.map(val => <option key={val} value={val}>{val}</option>)}
                </select>
            );
        } else if (mode === 'pointbuy') {
            const current = scores[stat.key] || 8;
            const nextCost = POINT_BUY_COST[current + 1] - POINT_BUY_COST[current];
            const canIncrease = current < 15 && pointsRemaining >= nextCost;
            const canDecrease = current > 8;

            return (
                <div className="flex items-center justify-center gap-1">
                    <button onClick={() => canDecrease && updateScore(stat.key, current - 1)} disabled={!canDecrease} className="w-6 h-6 flex items-center justify-center bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-white font-bold transition-colors">-</button>
                    <div className="w-8 text-center font-bold text-base text-white">{current}</div>
                    <button onClick={() => canIncrease && updateScore(stat.key, current + 1)} disabled={!canIncrease} className="w-6 h-6 flex items-center justify-center bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-white font-bold transition-colors">+</button>
                </div>
            );
        } else {
            return (
                <div 
                    className="flex items-center gap-1 w-full"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(e) => {
                        e.preventDefault();
                        try {
                            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                            const currentScore = scores[stat.key];
                            
                            if (data && data.sourceStat) {
                                // Dragged from another slot (swap)
                                if (data.sourceStat !== stat.key) {
                                    updateDraft({ 
                                        abilityScores: { 
                                            ...scores, 
                                            [stat.key]: data.value, 
                                            [data.sourceStat]: currentScore 
                                        } 
                                    });
                                }
                            } else if (data && typeof data.value === 'number') {
                                // Dragged from pool
                                updateScore(stat.key, data.value);
                                setRolledPool(prev => {
                                    const newPool = prev.filter((_, i) => i !== data.index);
                                    if (currentScore > 0) newPool.push(currentScore); // Send previous score back to the pool
                                    return newPool;
                                });
                            }
                        } catch (err) {}
                    }}
                >
                    <div 
                        draggable={scores[stat.key] > 0}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', JSON.stringify({ sourceStat: stat.key, value: scores[stat.key] }));
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        className={`w-5 h-6 flex items-center justify-center rounded shrink-0 ${scores[stat.key] > 0 ? 'cursor-grab active:cursor-grabbing hover:bg-slate-700 text-slate-400 hover:text-white' : 'opacity-0 pointer-events-none'}`}
                        title="Drag to swap or return to pool"
                    >
                        <Icon name="grip-vertical" size={14} />
                    </div>
                    <input type="number" min="3" max="20" value={scores[stat.key] || ''} onChange={(e) => updateScore(stat.key, parseInt(e.target.value) || 0)} className="w-full bg-slate-900 border border-slate-600 text-white rounded py-1 px-2 text-center outline-none focus:border-blue-500 font-bold text-sm" placeholder="--" />
                    <button 
                        onClick={() => {
                            const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
                            rolls.sort((a, b) => a - b);
                            const sum = rolls[1] + rolls[2] + rolls[3];
                            updateScore(stat.key, sum);
                        }}
                        className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors shrink-0"
                        title="Roll 4d6 (Drop Lowest)"
                    >
                        <Icon name="dices" size={14} />
                    </button>
                </div>
            );
        }
    };

    return (
        <div className="flex h-full gap-6 animate-in fade-in">
            {/* Left Column: Generation Mode */}
            <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-24">
                <h3 className="text-xl font-bold text-white mb-2">Generation Method</h3>
                <button onClick={() => handleModeChange('standard')} className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${mode === 'standard' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                    <div className="font-bold text-lg">Standard Array</div>
                    <div className="text-xs mt-1 opacity-80">Assign 15, 14, 13, 12, 10, 8 to your stats.</div>
                </button>
                <button onClick={() => handleModeChange('pointbuy')} className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${mode === 'pointbuy' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                    <div className="font-bold text-lg">Point Buy</div>
                    <div className="text-xs mt-1 opacity-80">Spend 27 points to build custom ability scores.</div>
                </button>
                <button onClick={() => handleModeChange('manual')} className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${mode === 'manual' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                    <div className="font-bold text-lg">Manual / Rolled</div>
                    <div className="text-xs mt-1 opacity-80">Roll 4d6 (drop lowest) and enter the results.</div>
                </button>

                {mode === 'pointbuy' && (
                    <div className="mt-4 p-4 bg-slate-800 border border-slate-700 rounded-xl">
                        <div className="text-center mb-2">
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Points Remaining</span>
                            <div className={`text-4xl font-black ${pointsRemaining === 0 ? 'text-green-500' : pointsRemaining < 0 ? 'text-red-500' : 'text-amber-500'}`}>{pointsRemaining}</div>
                        </div>
                    </div>
                )}

                {mode === 'manual' && (
                    <div className="mt-4 p-4 bg-slate-800 border border-slate-700 rounded-xl">
                        <div className="space-y-4">
                            <div>
                        <button 
                            onClick={() => {
                                const newRolls = [];
                                for (let i = 0; i < 6; i++) {
                                    const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
                                    dice.sort((a, b) => a - b);
                                    newRolls.push(dice[1] + dice[2] + dice[3]);
                                }
                                setRolledPool(newRolls);
                                updateDraft({ abilityScores: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } });
                            }}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-colors shadow-lg"
                        >
                            <Icon name="dices" size={18} /> Roll All
                        </button>
                        <div className="text-xs text-center text-slate-400 mt-2">Rolls 4d6 and drops the lowest die.</div>
                            </div>

                            <div className="flex items-center gap-4 my-2 opacity-50">
                                <div className="flex-1 h-px bg-slate-500"></div>
                                <span className="text-xs font-bold text-slate-400 uppercase">Or Add Manually</span>
                                <div className="flex-1 h-px bg-slate-500"></div>
                            </div>

                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="30" 
                                    value={manualRollInput} 
                                    onChange={(e) => setManualRollInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = parseInt(manualRollInput);
                                            if (!isNaN(val)) {
                                                setRolledPool(prev => [...prev, val]);
                                                setManualRollInput('');
                                            }
                                        }
                                    }}
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-indigo-500 font-bold"
                                    placeholder="Enter score (e.g. 15)..."
                                />
                                <button 
                                    onClick={() => {
                                        const val = parseInt(manualRollInput);
                                        if (!isNaN(val)) {
                                            setRolledPool(prev => [...prev, val]);
                                            setManualRollInput('');
                                        }
                                    }}
                                    disabled={!manualRollInput}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold p-2.5 rounded-lg transition-colors shadow-lg shrink-0"
                                    title="Add to Pool"
                                >
                                    <Icon name="plus" size={16} />
                                </button>
                            </div>
                        </div>
                        {(rolledPool.length > 0 || Object.values(scores).some(v => v > 0)) && (
                            <div className="mt-4 pt-4 border-t border-slate-700">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Rolled Scores</h4>
                                <div 
                                    className="flex flex-wrap gap-2 justify-center min-h-[3.5rem] p-2 rounded-lg border-2 border-dashed border-slate-700/50 hover:border-indigo-500/50 transition-colors relative"
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        try {
                                            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                                            if (data && data.sourceStat && data.value) {
                                                updateScore(data.sourceStat, 0);
                                                setRolledPool(prev => [...prev, data.value]);
                                            }
                                        } catch (err) {}
                                    }}
                                >
                                    {rolledPool.map((val, idx) => (
                                        <div
                                            key={`${idx}-${val}`}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('text/plain', JSON.stringify({ value: val, index: idx }));
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            className="w-10 h-10 bg-indigo-900/50 border-2 border-indigo-500 rounded flex items-center justify-center font-bold text-white cursor-grab active:cursor-grabbing hover:bg-indigo-600 transition-colors shadow"
                                        >
                                            {val}
                                        </div>
                                    ))}
                                    {rolledPool.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs italic pointer-events-none">Drop scores here</div>}
                                </div>
                                <p className="text-[10px] text-center text-slate-500 mt-3 uppercase tracking-widest">Drag & Drop into slots</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right Column: Allocation and Summary */}
            <div className="w-2/3 bg-slate-800 border border-slate-700 rounded-xl p-6 overflow-y-auto pb-24 shadow-xl">
                <h2 className="text-2xl font-black text-white mb-4">Ability Scores</h2>
                <div className="bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 p-2 bg-slate-900 border-b border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center items-center">
                        <div className="col-span-3 text-left">Ability</div><div className="col-span-4">Base Score</div><div className="col-span-2">Racial Bonus</div><div className="col-span-3">Total (Modifier)</div>
                    </div>
                    {ABILITIES.map(stat => {
                        const base = scores[stat.key] || 0;
                        const racial = getRacialBonus(stat.key);
                        const total = base + racial;
                        const mod = getModifier(total);
                        return (
                            <div key={stat.key} className="grid grid-cols-12 gap-2 p-2 border-b border-slate-700/50 items-center last:border-0 hover:bg-slate-800/50 transition-colors">
                                <div className="col-span-3 font-bold text-slate-200 text-sm">{stat.label}</div>
                                <div className="col-span-4 flex justify-center">{renderInput(stat)}</div>
                                <div className="col-span-2 text-center font-bold text-green-400 text-base">{racial > 0 ? `+${racial}` : '-'}</div>
                                <div className="col-span-3 text-center flex flex-col items-center justify-center"><div className="text-xl font-black text-white leading-none">{total}</div><div className="text-xs font-bold text-amber-500 mt-1">{mod >= 0 ? `+${mod}` : mod}</div></div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg text-xs text-indigo-200"><p><strong>Note:</strong> In the 2024 ruleset, Ability Score Increases are typically tied to your Background rather than your Species. If you haven't selected a Background yet, your racial bonuses may appear empty!</p></div>
            </div>
        </div>
    );
};
export default Step4Abilities;