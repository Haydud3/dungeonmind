import React, { useState } from 'react';
import Icon from './Icon';

const DiceIcon = ({ sides, className }) => {
    switch (sides) {
        case 4:
            return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 20h20L12 2z"/><path d="M12 2v18"/><path d="M2 20l10-8 10 8"/></svg>;
        case 6:
            return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M8 8h.01"/><path d="M16 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>;
        case 8:
            return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 10-8 10-8-10z"/><path d="M12 2v20"/><path d="M4 12h16"/></svg>;
        case 10:
        case 100:
            return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L4 10l8 12 8-12-8-8z"/><path d="M12 2v20"/><path d="M4 10l8 3 8-3"/></svg>;
        case 12:
            return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L3 9l3 10h12l3-10-9-7z"/><path d="M12 2l-6 10"/><path d="M12 2l6 10"/><path d="M6 12l6 7 6-7"/><path d="M3 9h18"/></svg>;
        case 20:
            return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L21 7v10l-9 5-9-5V7z M7 9h10l-5 8z M7 9L12 2 M17 9L12 2 M7 9L3 7 M17 9L21 7 M7 9L3 17 M17 9L21 17 M12 17v5" /></svg>;
        default:
            return <Icon name="dices" className={className} size={24} />;
    }
};

const SECONDARY_DICE = [
    { sides: 4, name: 'd4', theme: 'border-rose-500/40 bg-rose-950/20 text-rose-400 hover:border-rose-400 hover:bg-rose-900/30' },
    { sides: 6, name: 'd6', theme: 'border-yellow-500/40 bg-yellow-950/20 text-yellow-400 hover:border-yellow-400 hover:bg-yellow-900/30' },
    { sides: 8, name: 'd8', theme: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-900/30' },
    { sides: 10, name: 'd10', theme: 'border-cyan-500/40 bg-cyan-950/20 text-cyan-400 hover:border-cyan-400 hover:bg-cyan-900/30' },
    { sides: 12, name: 'd12', theme: 'border-purple-500/40 bg-purple-950/20 text-purple-400 hover:border-purple-400 hover:bg-purple-900/30' },
    { sides: 100, name: 'd100', theme: 'border-slate-500/40 bg-slate-800/30 text-slate-300 hover:border-slate-300 hover:bg-slate-700/40' },
];

const DiceTray = ({ diceLog = [], handleDiceRoll, onClose, role, rollMode, setRollMode }) => {
    const [pool, setPool] = useState({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
    const [modifier, setModifier] = useState(0);
    const [advMode, setAdvMode] = useState('normal'); // 'normal', 'adv', 'dis'
    const [customFormula, setCustomFormula] = useState('');

    const handleCustomFormulaSubmit = (e) => {
        e.preventDefault();
        if (!customFormula.trim()) return;
        handleDiceRoll(customFormula.trim(), { alias: 'Formula Roll' });
        setCustomFormula('');
    };

    const addDie = (sides) => {
        setPool(prev => ({ ...prev, [sides]: (prev[sides] || 0) + 1 }));
    };

    const removeDie = (sides) => {
        setPool(prev => ({ ...prev, [sides]: Math.max(0, (prev[sides] || 0) - 1) }));
    };

    const clearPool = () => {
        setPool({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
        setModifier(0);
        setAdvMode('normal');
    };

    const buildFormula = () => {
        let formulaParts = [];
        
        // Always place d20 first if present for clarity
        if (pool[20] > 0) {
            formulaParts.push(`${pool[20]}d20`);
        }

        Object.entries(pool).forEach(([sides, count]) => {
            if (sides !== '20' && count > 0) {
                formulaParts.push(`${count}d${sides}`);
            }
        });

        if (formulaParts.length === 0) {
            formulaParts.push('1d20');
        }

        let formula = formulaParts.join(' + ');
        if (modifier !== 0) {
            formula += modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
        }

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

        return { formula, rollAlias };
    };

    const handleRollClick = () => {
        const { formula, rollAlias } = buildFormula();
        handleDiceRoll(formula, { alias: rollAlias, advMode: advMode !== 'normal' ? advMode : undefined });
        clearPool();
    };

    const hasDice = Object.values(pool).some(c => c > 0);
    const hasStagedRoll = hasDice || modifier !== 0 || advMode !== 'normal';

    // Summary of staged items
    const stagedItems = [];
    if (pool[20] > 0) stagedItems.push({ key: '20', label: `${pool[20]}d20`, sides: 20, count: pool[20] });
    Object.entries(pool).forEach(([sides, count]) => {
        if (sides !== '20' && count > 0) {
            stagedItems.push({ key: sides, label: `${count}d${sides}`, sides: parseInt(sides), count });
        }
    });

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 select-none">
            {/* Top Header */}
            <div className="p-3.5 pt-safe-min pr-safe-min pl-safe-min border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <Icon name="dices" size={16} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-100 text-sm tracking-wide">Dice Roller</h3>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Roll Mode Pill Toggle */}
                    <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 shadow-inner">
                        <button 
                            type="button"
                            onClick={() => setRollMode && setRollMode('public')}
                            className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold transition-all ${rollMode === 'public' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            title="Roll visible to all players"
                        >
                            Public
                        </button>
                        <button 
                            type="button"
                            onClick={() => setRollMode && setRollMode('private')}
                            className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold transition-all ${rollMode === 'private' ? 'bg-red-900/80 text-red-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            title="Secret GM roll (hidden from players)"
                        >
                            Secret
                        </button>
                    </div>

                    {onClose && (
                        <button 
                            onClick={onClose} 
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Close Dice Tray"
                        >
                            <Icon name="x" size={17}/>
                        </button>
                    )}
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col custom-scroll space-y-3.5">
                
                {/* ACTIVE ROLL STAGING HERO CARD */}
                <div className={`rounded-2xl border transition-all duration-200 p-3.5 shadow-lg ${hasStagedRoll ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'bg-slate-900/60 border-slate-800/80'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${hasStagedRoll ? 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)] animate-pulse' : 'bg-slate-600'}`} />
                            Active Staged Roll
                        </span>
                        {hasStagedRoll && (
                            <button
                                type="button"
                                onClick={clearPool}
                                className="text-[10px] text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1 font-semibold"
                            >
                                <Icon name="rotate-ccw" size={11} /> Clear
                            </button>
                        )}
                    </div>

                    {/* Staged Chips Area */}
                    <div className="min-h-[36px] flex flex-wrap items-center gap-1.5 mb-2.5">
                        {stagedItems.length > 0 || modifier !== 0 || advMode !== 'normal' ? (
                            <>
                                {stagedItems.map(item => (
                                    <span 
                                        key={item.key}
                                        onClick={() => removeDie(item.sides)}
                                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-red-950/40 hover:border-red-500/40 hover:text-red-300 transition-all group"
                                        title="Click to remove 1 die"
                                    >
                                        <DiceIcon sides={item.sides} className="w-3.5 h-3.5" />
                                        <span>{item.label}</span>
                                        <span className="text-[10px] text-slate-500 group-hover:text-red-400">×</span>
                                    </span>
                                ))}
                                {modifier !== 0 && (
                                    <span 
                                        onClick={() => setModifier(0)}
                                        className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${modifier > 0 ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-red-500/15 border-red-500/30 text-red-300'}`}
                                        title="Click to reset modifier"
                                    >
                                        <span>{modifier > 0 ? `+${modifier}` : modifier}</span>
                                        <span className="text-[10px] text-slate-500 hover:text-red-400">×</span>
                                    </span>
                                )}
                                {advMode !== 'normal' && (
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${advMode === 'adv' ? 'bg-green-900/40 text-green-400 border border-green-500/30' : 'bg-red-900/40 text-red-400 border border-red-500/30'}`}>
                                        {advMode === 'adv' ? 'Advantage' : 'Disadvantage'}
                                    </span>
                                )}
                            </>
                        ) : (
                            <span className="text-xs text-slate-500 italic">Tap any die below to build your roll</span>
                        )}
                    </div>

                    {/* Big Primary Roll Button */}
                    <button
                        type="button"
                        onClick={handleRollClick}
                        className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${hasStagedRoll ? 'bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-[0_0_15px_rgba(245,158,11,0.2)]'}`}
                    >
                        <Icon name="dices" size={16} />
                        <span>{hasStagedRoll ? `ROLL: ${buildFormula().formula}` : 'ROLL: 1d20'}</span>
                    </button>
                </div>

                {/* Quick Manual Formula Bar */}
                <form onSubmit={handleCustomFormulaSubmit} className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 focus-within:border-amber-500/70 transition-colors shadow-inner">
                    <Icon name="terminal" size={13} className="text-amber-400 ml-1.5 shrink-0" />
                    <input 
                        type="text" 
                        value={customFormula}
                        onChange={(e) => setCustomFormula(e.target.value)}
                        placeholder="Type formula (e.g. 4d6kh3, 2d8+5, 1d20+7)..." 
                        className="flex-1 bg-transparent text-xs font-mono text-amber-200 placeholder-slate-500 focus:outline-none min-w-0"
                    />
                    <button 
                        type="submit" 
                        disabled={!customFormula.trim()}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow active:scale-95 cursor-pointer"
                    >
                        Roll
                    </button>
                </form>

                {/* HERO DIE: D20 (Tabletop Centerpiece) */}
                <div className="bg-slate-900/80 rounded-2xl border border-amber-500/40 p-3 shadow-md relative overflow-hidden group">
                    <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none" />
                    <div className="flex items-center justify-between">
                        <div 
                            onClick={() => addDie(20)} 
                            onContextMenu={(e) => { e.preventDefault(); removeDie(20); }}
                            className="flex items-center gap-3 cursor-pointer flex-1 py-1"
                            title="Click to add d20 (Right-click to remove)"
                        >
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-amber-500/25 to-amber-950/40 border border-amber-400/80 text-amber-300 flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.3)] group-hover:scale-105 transition-transform shrink-0">
                                <DiceIcon sides={20} className="w-8 h-8" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white flex items-center gap-2">
                                    <span>d20</span>
                                    <span className="text-[10px] font-normal text-amber-400 uppercase tracking-widest font-mono">Core Die</span>
                                </div>
                                <div className="text-[11px] text-slate-400">Attacks, Saves & Checks</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 z-10">
                            {pool[20] > 0 ? (
                                <div className="flex items-center gap-1 bg-slate-950 border border-amber-500/40 rounded-xl px-2 py-1 shadow">
                                    <button
                                        type="button"
                                        onClick={() => removeDie(20)}
                                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-red-900/50 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
                                    >
                                        -
                                    </button>
                                    <span className="w-6 text-center font-mono font-bold text-amber-300 text-sm">{pool[20]}</span>
                                    <button
                                        type="button"
                                        onClick={() => addDie(20)}
                                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-green-900/50 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
                                    >
                                        +
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleDiceRoll('1d20', { alias: 'Quick d20' })}
                                    className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                                    title="Roll 1d20 immediately"
                                >
                                    <span>Roll 1d20</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 6-DICE GRID (Balanced 3x2 Grid) */}
                <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Damage & Polyhedral Set</div>
                    <div className="grid grid-cols-3 gap-2">
                        {SECONDARY_DICE.map((d) => {
                            const count = pool[d.sides] || 0;
                            return (
                                <div 
                                    key={d.sides} 
                                    className={`relative rounded-xl border transition-all overflow-hidden flex flex-col justify-between ${count > 0 ? 'border-amber-500/80 bg-slate-900 shadow-md ring-1 ring-amber-500/30' : d.theme}`}
                                >
                                    <button 
                                        type="button"
                                        onClick={() => addDie(d.sides)} 
                                        onContextMenu={(e) => { e.preventDefault(); removeDie(d.sides); }}
                                        className="w-full pt-3 pb-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                                        title={`Tap to add ${d.name} (Right-click to remove)`}
                                    >
                                        <DiceIcon sides={d.sides} className="w-6 h-6 transition-transform group-hover:scale-110" />
                                        <span className="text-xs font-bold font-mono text-white">{d.name}</span>
                                    </button>

                                    {count > 0 && (
                                        <div className="flex items-center justify-between px-1.5 py-1 bg-slate-950/90 border-t border-slate-800">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); removeDie(d.sides); }}
                                                className="w-5 h-5 rounded bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
                                            >
                                                -
                                            </button>
                                            <span className="text-xs font-bold text-amber-400 font-mono">{count}</span>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); addDie(d.sides); }}
                                                className="w-5 h-5 rounded bg-slate-800 hover:bg-green-900/60 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
                                            >
                                                +
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ADVANTAGE / DISADVANTAGE SELECTOR */}
                <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Advantage State</div>
                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-inner">
                        <button 
                            type="button"
                            onClick={() => setAdvMode('dis')} 
                            className={`py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${advMode === 'dis' ? 'bg-red-900/70 text-red-300 border border-red-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <span>Disadvantage</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => setAdvMode('normal')} 
                            className={`py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${advMode === 'normal' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <span>Normal</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => setAdvMode('adv')} 
                            className={`py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${advMode === 'adv' ? 'bg-green-900/70 text-green-300 border border-green-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <span>Advantage</span>
                        </button>
                    </div>
                </div>

                {/* MODIFIER CONTROLS & QUICK MATH */}
                <div className="bg-slate-900/70 rounded-2xl border border-slate-800/80 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Flat Modifier</span>
                        <div className="flex items-center gap-2">
                            <button 
                                type="button"
                                onClick={() => setModifier(m => m - 1)} 
                                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white font-bold transition-colors"
                            >
                                -
                            </button>
                            <input 
                                type="number" 
                                value={modifier} 
                                onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setModifier(isNaN(v) ? 0 : v);
                                }} 
                                className="w-14 h-7 bg-slate-950 border border-slate-700 rounded-lg text-center font-mono text-xs font-bold text-amber-400 outline-none focus:border-amber-500"
                            />
                            <button 
                                type="button"
                                onClick={() => setModifier(m => m + 1)} 
                                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white font-bold transition-colors"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Quick Modifier Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                        <span className="text-[10px] text-slate-500 uppercase font-bold shrink-0">Quick:</span>
                        {[1, 2, 3, 4, 5].map(num => (
                            <button
                                key={num}
                                type="button"
                                onClick={() => setModifier(m => m + num)}
                                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-amber-600/30 text-slate-300 hover:text-amber-300 text-[11px] font-mono font-bold border border-slate-700/80 transition-colors shrink-0"
                            >
                                +{num}
                            </button>
                        ))}
                        {modifier !== 0 && (
                            <button
                                type="button"
                                onClick={() => setModifier(0)}
                                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-300 text-[11px] font-mono border border-slate-700/80 transition-colors ml-auto shrink-0"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* QUICK ROLLS & FORMULA INPUT */}
                <div className="space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Presets</div>
                    <div className="flex flex-wrap gap-1.5">
                        {[
                            { label: 'd20', formula: '1d20', alias: 'Quick d20' },
                            { label: 'Adv d20', formula: '2d20kh1', alias: 'Advantage Roll' },
                            { label: 'Dis d20', formula: '2d20kl1', alias: 'Disadvantage Roll' },
                            { label: '1d6', formula: '1d6', alias: 'Quick 1d6' },
                            { label: '2d6', formula: '2d6', alias: 'Quick 2d6' },
                            { label: '1d8', formula: '1d8', alias: 'Quick 1d8' },
                            { label: 'd100%', formula: '1d100', alias: 'Percentile Roll' },
                            { label: '🪙 Coin (d2)', formula: '1d2', alias: 'Coin Flip' }
                        ].map(preset => (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => handleDiceRoll(preset.formula, { alias: preset.alias })}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-amber-500/20 hover:border-amber-500/50 border border-slate-800 text-[11px] font-mono font-bold text-slate-300 hover:text-amber-300 transition-all active:scale-95 shadow-sm"
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Manual Formula Input */}
                    <form onSubmit={handleCustomFormulaSubmit} className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800 focus-within:border-amber-500/60 transition-colors shadow-inner mt-1">
                        <Icon name="terminal" size={13} className="text-slate-500 ml-1.5 shrink-0" />
                        <input 
                            type="text" 
                            value={customFormula}
                            onChange={(e) => setCustomFormula(e.target.value)}
                            placeholder="Custom formula (e.g. 4d6kh3, 2d8+5)..." 
                            className="flex-1 bg-transparent text-xs font-mono text-amber-200 placeholder-slate-600 focus:outline-none min-w-0"
                        />
                        <button 
                            type="submit" 
                            disabled={!customFormula.trim()}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow"
                        >
                            Roll
                        </button>
                    </form>
                </div>

                {/* RECENT ROLLS HISTORY LOG */}
                <div className="pt-2 border-t border-slate-800/80">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Recent Roll History</h4>
                        <span className="text-[10px] text-slate-500 font-mono">{diceLog.length} rolls</span>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scroll pr-0.5">
                        {diceLog.length === 0 ? (
                            <div className="text-center text-slate-600 text-xs italic py-6 bg-slate-900/40 rounded-xl border border-slate-800/50">
                                No recent rolls yet
                            </div>
                        ) : (
                            diceLog.map(log => {
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
                                                            <span className="opacity-40 line-through decoration-red-400 text-slate-400">{r}</span>
                                                        ) : i === keptIdx ? (
                                                            <span className="text-amber-400 font-bold">{r}</span>
                                                        ) : (
                                                            <span>{r}</span>
                                                        )}
                                                        {i < log.rolls.length - 1 && <span className="text-slate-600 mx-1">, </span>}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </>
                                    );
                                    
                                    finalTotal = activeTotal - getRollVal(log.rolls[droppedIdx]);
                                    finalNatural = getRollVal(log.rolls[keptIdx]);
                                }

                                const isCoin = log.die === '1d2' || log.die === 2 || log.die === 'd2' || /\b(?:1)?d2(?!\d)/i.test(formulaStr) || (typeof log.alias === 'string' && log.alias.toLowerCase().includes('coin'));
                                const isCrit = !isCoin && finalNatural === 20 && (log.die?.includes('d20') || formulaStr.includes('d20'));
                                const isFumble = !isCoin && finalNatural === 1 && (log.die?.includes('d20') || formulaStr.includes('d20'));

                                let isParsedSave = false;
                                let parsedSaveDc = undefined;
                                if (log.alias && typeof log.alias === 'string' && log.alias.toLowerCase().includes('save vs dc')) {
                                    isParsedSave = true;
                                    const match = log.alias.match(/DC\s*(\d+)/i);
                                    if (match) parsedSaveDc = parseInt(match[1], 10);
                                }
                                const actualSaveDc = log.saveDc !== undefined ? log.saveDc : parsedSaveDc;
                                const hasSaveResult = (log.actionType === 'save' || log.isSave || isParsedSave) && actualSaveDc !== undefined;
                                const isSavePassed = hasSaveResult && finalTotal >= actualSaveDc;

                                const formulaToReroll = log.formula || log.formulaDisplay || log.die || '1d20';

                                return (
                                    <div 
                                        key={log.id} 
                                        className={`rounded-xl border p-2.5 shadow-sm transition-all ${isCoin ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.1)]' : isCrit ? 'bg-emerald-950/30 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.15)]' : isFumble ? 'bg-red-950/30 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.15)]' : 'bg-slate-900/90 border-slate-800'}`}
                                    >
                                        {/* Top row: Label & Reroll */}
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-xs font-bold text-slate-200 truncate" title={log.alias || log.die}>
                                                    {log.alias || log.die}
                                                </span>
                                                {log.formulaDisplay && log.formulaDisplay !== log.alias && (
                                                    <span className="text-[10px] text-slate-500 font-mono truncate">
                                                        ({log.formulaDisplay})
                                                    </span>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleDiceRoll(formulaToReroll, { alias: log.alias })}
                                                className="p-1 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                                                title="Reroll this formula"
                                            >
                                                <Icon name="rotate-cw" size={12} />
                                            </button>
                                        </div>

                                        {/* Crit / Fumble Banner */}
                                        {isCrit && (
                                            <div className="mb-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 uppercase tracking-widest flex items-center justify-between">
                                                <span>⭐ Critical Hit!</span>
                                                <span className="font-mono">NAT 20</span>
                                            </div>
                                        )}
                                        {isFumble && (
                                            <div className="mb-1.5 px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/40 text-[10px] font-bold text-red-300 uppercase tracking-widest flex items-center justify-between">
                                                <span>💀 Critical Fumble!</span>
                                                <span className="font-mono">NAT 1</span>
                                            </div>
                                        )}

                                        {/* Results breakdown & Final Total */}
                                        <div className="flex justify-between items-baseline font-mono">
                                            <div className="flex items-center gap-1 text-slate-400 text-xs flex-wrap">
                                                <span>[{isCoin ? (finalTotal === 1 ? '1: Heads' : '2: Tails') : rollsNode}]</span>
                                                {!isCoin && (log.mod ?? log.modifier ?? 0) !== 0 && (
                                                    <span className="text-slate-300">
                                                        {(log.mod ?? log.modifier ?? 0) >= 0 ? '+' : ''}
                                                        {log.mod ?? log.modifier ?? 0}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-base font-bold text-amber-400 ml-2">
                                                = {isCoin ? (finalTotal === 1 ? '🪙 Heads' : '🪙 Tails') : (Number.isFinite(finalTotal) ? finalTotal : 0)}
                                            </span>
                                        </div>

                                        {/* Save Result Badge if applicable */}
                                        {hasSaveResult && (
                                            <div className={`mt-1.5 font-bold text-center py-0.5 text-[10px] rounded-md ${isSavePassed ? 'bg-green-900/40 text-green-300 border border-green-500/30' : 'bg-red-900/40 text-red-300 border border-red-500/30'}`}>
                                                {isSavePassed ? `Passed DC ${actualSaveDc} (Success)` : `Failed DC ${actualSaveDc} (Fail)`}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DiceTray;