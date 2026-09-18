import React, { useState } from 'react';
import Icon from './Icon';

// SVG Polyhedral Die Shapes for crisp iconography
const DieSvg = ({ sides, className = "w-4 h-4" }) => {
    switch (sides) {
        case 4:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <path d="M12 3 L3 20 L21 20 Z" />
                    <path d="M12 3 L12 20" strokeDasharray="2 2" opacity="0.6" />
                </svg>
            );
        case 6:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                    <circle cx="16" cy="8" r="1.2" fill="currentColor" />
                    <circle cx="8" cy="16" r="1.2" fill="currentColor" />
                    <circle cx="16" cy="16" r="1.2" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                </svg>
            );
        case 8:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <polygon points="12 2 21 12 12 22 3 12" />
                    <line x1="3" y1="12" x2="21" y2="12" opacity="0.6" />
                </svg>
            );
        case 10:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <polygon points="12 2 21 9 17 21 7 21 3 9" />
                    <line x1="12" y1="2" x2="12" y2="21" opacity="0.6" />
                </svg>
            );
        case 12:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <polygon points="12 2 20 6 22 15 15 22 9 22 2 15 4 6" />
                </svg>
            );
        case 20:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
                    <polygon points="12 6 18 10 18 14 12 18 6 14 6 10" opacity="0.7" />
                </svg>
            );
        case 100:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12 L16 12" />
                    <circle cx="9" cy="9" r="1" fill="currentColor" />
                    <circle cx="15" cy="15" r="1" fill="currentColor" />
                </svg>
            );
        case 2:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="5.5" strokeDasharray="2 2" opacity="0.6" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                </svg>
            );
        default:
            return <Icon name="dices" size={16} className={className} />;
    }
};

const SECONDARY_DICE = [
    { count: 1, sides: 4, label: 'd4', theme: 'border-rose-500/40 bg-rose-950/20 text-rose-300 hover:border-rose-400 hover:bg-rose-900/40' },
    { count: 1, sides: 6, label: 'd6', theme: 'border-amber-500/40 bg-amber-950/20 text-amber-300 hover:border-amber-400 hover:bg-amber-900/40' },
    { count: 2, sides: 6, label: '2d6', theme: 'border-orange-500/40 bg-orange-950/20 text-orange-300 hover:border-orange-400 hover:bg-orange-900/40' },
    { count: 1, sides: 8, label: 'd8', theme: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-900/40' },
    { count: 1, sides: 10, label: 'd10', theme: 'border-cyan-500/40 bg-cyan-950/20 text-cyan-300 hover:border-cyan-400 hover:bg-cyan-900/40' },
    { count: 1, sides: 12, label: 'd12', theme: 'border-purple-500/40 bg-purple-950/20 text-purple-300 hover:border-purple-400 hover:bg-purple-900/40' },
    { count: 1, sides: 100, label: 'd100', theme: 'border-slate-500/40 bg-slate-800/40 text-slate-300 hover:border-slate-300 hover:bg-slate-700/50' },
];

export default function QuickRollMenu({
    onDiceRoll,
    onOpenDiceTray,
    onClose,
    diceLog = []
}) {
    const [modifier, setModifier] = useState(0);
    const [manualFormula, setManualFormula] = useState('');

    const handleManualFormulaSubmit = (e) => {
        e.preventDefault();
        const trimmed = manualFormula.trim();
        if (!trimmed || !onDiceRoll) return;

        let alias = `Custom: ${trimmed}`;
        if (modifier !== 0 && !trimmed.includes('+') && !trimmed.includes('-')) {
            const formulaWithMod = `${trimmed}${modifier > 0 ? '+' : ''}${modifier}`;
            onDiceRoll(formulaWithMod, { alias: `${alias} (${modifier > 0 ? '+' : ''}${modifier})` });
        } else {
            onDiceRoll(trimmed, { alias });
        }
        setManualFormula('');
        if (onClose) onClose();
    };

    // Grab the most recent roll from diceLog if available
    const lastRoll = diceLog && diceLog.length > 0 ? diceLog[0] : null;
    const isCoin = lastRoll && (
        lastRoll.die === '1d2' || 
        lastRoll.die === 2 ||
        lastRoll.die === 'd2' ||
        /\b(?:1)?d2(?!\d)/i.test(String(lastRoll.formulaDisplay || lastRoll.formula || lastRoll.die || '')) || 
        (typeof lastRoll.alias === 'string' && lastRoll.alias.toLowerCase().includes('coin'))
    );
    const coinResultText = isCoin ? (lastRoll.result === 1 ? '🪙 HEADS' : '🪙 TAILS') : null;
    const isNat20 = !isCoin && lastRoll && (lastRoll.die?.includes('20') || lastRoll.formulaDisplay?.includes('20')) && lastRoll.rolls?.includes(20);
    const isNat1 = !isCoin && lastRoll && (lastRoll.die?.includes('20') || lastRoll.formulaDisplay?.includes('20')) && lastRoll.rolls?.includes(1) && !isNat20;

    const formatModSuffix = (mod) => {
        if (!mod || mod === 0) return '';
        return mod > 0 ? `+${mod}` : `${mod}`;
    };

    const handleExecuteRoll = (baseFormula, alias) => {
        if (!onDiceRoll) return;

        let finalFormula = baseFormula;
        let finalAlias = alias;

        if (modifier !== 0) {
            finalFormula = `${baseFormula}${modifier > 0 ? '+' : ''}${modifier}`;
            finalAlias = `${alias} (${modifier > 0 ? '+' : ''}${modifier})`;
        }

        onDiceRoll(finalFormula, { alias: finalAlias });
    };

    const handleRerollLast = () => {
        if (!lastRoll || !onDiceRoll) return;
        onDiceRoll(lastRoll.die, { alias: lastRoll.formulaDisplay || 'Reroll' });
    };

    return (
        <div className="flex flex-col gap-2.5 bg-slate-950/95 backdrop-blur-xl border border-amber-500/30 p-3 rounded-2xl shadow-2xl text-xs w-72 text-slate-100 select-none animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-400 uppercase tracking-wider">
                    <span className="p-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                        <DieSvg sides={20} className="w-3.5 h-3.5" />
                    </span>
                    <span>Quick Roll</span>
                </div>

                <div className="flex items-center gap-2">
                    {onOpenDiceTray && (
                        <button
                            onClick={() => {
                                if (onClose) onClose();
                                onOpenDiceTray();
                            }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-indigo-950/40 border border-transparent hover:border-indigo-800/50 cursor-pointer"
                            title="Open full dice tray with staging pool"
                        >
                            <span>Full Tray</span>
                            <Icon name="external-link" size={10} />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded hover:bg-slate-800 cursor-pointer"
                            title="Close Quick Roll"
                        >
                            <Icon name="x" size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Manual Dice Formula Input */}
            <form onSubmit={handleManualFormulaSubmit} className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 focus-within:border-amber-500 rounded-xl p-1.5 transition-all shadow-inner">
                <span className="text-amber-400 pl-1 shrink-0 font-mono text-xs font-bold select-none">🎲</span>
                <input 
                    type="text"
                    value={manualFormula}
                    onChange={(e) => setManualFormula(e.target.value)}
                    placeholder="Type roll (e.g. 2d6+3, 1d20+5)..."
                    className="flex-1 bg-transparent text-xs font-mono text-amber-200 placeholder-slate-500 focus:outline-none min-w-0"
                />
                <button 
                    type="submit"
                    disabled={!manualFormula.trim()}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white rounded-lg text-xs font-bold transition-all shrink-0 shadow active:scale-95 cursor-pointer"
                >
                    Roll
                </button>
            </form>

            {/* Live Last Roll Feedback Card */}
            {lastRoll && (
                <div className={`p-2 rounded-xl border transition-all flex items-center justify-between gap-2 shadow-sm ${
                    isCoin
                        ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                        : isNat20
                        ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                        : isNat1
                        ? 'bg-rose-950/30 border-rose-500/60 text-rose-200'
                        : 'bg-slate-900/70 border-slate-800/90 text-slate-300'
                }`}>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 uppercase font-mono truncate max-w-[120px]">
                                {lastRoll.formulaDisplay || lastRoll.die}
                            </span>
                            {isCoin && (
                                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-bold uppercase tracking-wider">
                                    🪙 Coin
                                </span>
                            )}
                            {isNat20 && (
                                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-bold uppercase tracking-wider">
                                    ⭐ Crit
                                </span>
                            )}
                            {isNat1 && (
                                <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1 rounded font-bold uppercase tracking-wider">
                                    💀 Fumble
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-base font-black font-mono leading-tight">
                                {isCoin ? coinResultText : lastRoll.result}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                                {isCoin 
                                    ? `[${lastRoll.result === 1 ? '1: Heads' : '2: Tails'}]`
                                    : `[roll: ${lastRoll.rolls?.join(', ') || lastRoll.natural}]${lastRoll.mod !== 0 ? ` (${lastRoll.mod > 0 ? '+' : ''}${lastRoll.mod})` : ''}`
                                }
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleRerollLast}
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-amber-400 border border-slate-700/60 transition-all cursor-pointer active:scale-95 shrink-0"
                        title="Reroll last roll"
                    >
                        <Icon name="rotate-cw" size={13} />
                    </button>
                </div>
            )}

            {/* Hero d20 Core Check Buttons */}
            <div className="flex flex-col gap-1">
                <div className="grid grid-cols-3 gap-1.5">
                    {/* Normal d20 */}
                    <button
                        onClick={() => handleExecuteRoll('1d20', 'd20 Check')}
                        className="py-2 px-1.5 rounded-xl bg-gradient-to-b from-amber-500/20 to-amber-950/40 border border-amber-500/40 hover:border-amber-400 text-amber-200 hover:text-amber-100 flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm hover:shadow-amber-500/10 cursor-pointer active:scale-95"
                    >
                        <div className="flex items-center gap-1 font-bold text-xs">
                            <DieSvg sides={20} className="w-3.5 h-3.5 text-amber-400" />
                            <span>d20</span>
                        </div>
                        <span className="text-[10px] font-mono text-amber-400/90 font-semibold">
                            {formatModSuffix(modifier) || 'Flat'}
                        </span>
                    </button>

                    {/* Advantage */}
                    <button
                        onClick={() => handleExecuteRoll('2d20kh1', 'Advantage Roll')}
                        className="py-2 px-1.5 rounded-xl bg-gradient-to-b from-emerald-500/20 to-emerald-950/40 border border-emerald-500/40 hover:border-emerald-400 text-emerald-200 hover:text-emerald-100 flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm hover:shadow-emerald-500/10 cursor-pointer active:scale-95"
                        title="Roll 2d20 and keep highest"
                    >
                        <div className="flex items-center gap-1 font-bold text-xs">
                            <Icon name="arrow-up-right" size={13} className="text-emerald-400" />
                            <span>Adv</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400/90 font-semibold">
                            2d20kh1{formatModSuffix(modifier)}
                        </span>
                    </button>

                    {/* Disadvantage */}
                    <button
                        onClick={() => handleExecuteRoll('2d20kl1', 'Disadvantage Roll')}
                        className="py-2 px-1.5 rounded-xl bg-gradient-to-b from-rose-500/20 to-rose-950/40 border border-rose-500/40 hover:border-rose-400 text-rose-200 hover:text-rose-100 flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm hover:shadow-rose-500/10 cursor-pointer active:scale-95"
                        title="Roll 2d20 and keep lowest"
                    >
                        <div className="flex items-center gap-1 font-bold text-xs">
                            <Icon name="arrow-down-right" size={13} className="text-rose-400" />
                            <span>Dis</span>
                        </div>
                        <span className="text-[10px] font-mono text-rose-400/90 font-semibold">
                            2d20kl1{formatModSuffix(modifier)}
                        </span>
                    </button>
                </div>
            </div>

            {/* Modifier Bar */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-1.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Modifier
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setModifier(m => m - 1)}
                            className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                            title="Decrease modifier"
                        >
                            -
                        </button>
                        <span className={`font-mono font-bold text-xs min-w-[28px] text-center ${
                            modifier > 0 ? 'text-emerald-400' : modifier < 0 ? 'text-rose-400' : 'text-slate-300'
                        }`}>
                            {modifier > 0 ? `+${modifier}` : modifier}
                        </span>
                        <button
                            onClick={() => setModifier(m => m + 1)}
                            className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                            title="Increase modifier"
                        >
                            +
                        </button>
                        {modifier !== 0 && (
                            <button
                                onClick={() => setModifier(0)}
                                className="text-[10px] text-slate-500 hover:text-slate-300 ml-1 transition-colors underline cursor-pointer"
                                title="Reset modifier"
                            >
                                reset
                            </button>
                        )}
                    </div>
                </div>

                {/* Quick Add Modifier Chips */}
                <div className="flex items-center justify-between gap-1 pt-0.5">
                    {[0, 1, 2, 3, 4, 5, -2].map(val => (
                        <button
                            key={val}
                            onClick={() => setModifier(val)}
                            className={`flex-1 py-0.5 text-[10px] font-mono font-semibold rounded border transition-all cursor-pointer ${
                                modifier === val
                                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                                    : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700 hover:text-white'
                            }`}
                        >
                            {val > 0 ? `+${val}` : val === 0 ? '0' : val}
                        </button>
                    ))}
                </div>
            </div>

            {/* Polyhedral Secondary Dice Grid */}
            <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-0.5">
                    Polyhedral Dice
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                    {SECONDARY_DICE.map(die => {
                        const formula = `${die.count}d${die.sides}`;
                        const alias = `Quick ${die.label}`;
                        return (
                            <button
                                key={die.label}
                                onClick={() => handleExecuteRoll(formula, alias)}
                                className={`py-1.5 px-1 rounded-xl border flex flex-col items-center justify-center gap-0.5 font-mono text-center transition-all cursor-pointer active:scale-95 shadow-sm ${die.theme}`}
                            >
                                <div className="flex items-center gap-1 font-bold text-[11px]">
                                    <DieSvg sides={die.sides} className="w-3 h-3 shrink-0" />
                                    <span>{die.label}</span>
                                </div>
                                {modifier !== 0 && (
                                    <span className="text-[9px] font-semibold opacity-90 leading-none">
                                        {formatModSuffix(modifier)}
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    {/* Quick Coin Flip (d2) */}
                    <button
                        onClick={() => {
                            if (onDiceRoll) {
                                onDiceRoll('1d2', { alias: 'Coin Flip' });
                            }
                        }}
                        className="py-1.5 px-1 rounded-xl border border-amber-500/40 bg-amber-950/20 hover:bg-amber-900/40 hover:border-amber-400 text-amber-300 hover:text-amber-200 flex flex-col items-center justify-center gap-0.5 font-mono text-center transition-all cursor-pointer active:scale-95 shadow-sm"
                        title="Flip a real 3D gold coin"
                    >
                        <div className="flex items-center gap-1 font-bold text-[11px]">
                            <DieSvg sides={2} className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Coin</span>
                        </div>
                        <span className="text-[9px] text-amber-400/80 leading-none">Flip</span>
                    </button>
                </div>
            </div>

            {/* Quick Action Footer / Full Tray Prompt */}
            <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between">
                <button
                    onClick={() => {
                        if (onDiceRoll) {
                            onDiceRoll('1d20', { alias: 'Flat d20 Check' });
                        }
                    }}
                    className="text-[10px] text-slate-400 hover:text-amber-400 font-medium transition-colors cursor-pointer"
                >
                    Flat Check (d20)
                </button>

                {onOpenDiceTray && (
                    <button
                        onClick={() => {
                            if (onClose) onClose();
                            onOpenDiceTray();
                        }}
                        className="py-1 px-2.5 bg-indigo-600/80 hover:bg-indigo-600 rounded-lg text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                    >
                        <Icon name="sliders" size={12} />
                        <span>Open Full Tray</span>
                    </button>
                )}
            </div>
        </div>
    );
}

