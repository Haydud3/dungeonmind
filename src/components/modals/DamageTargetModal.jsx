import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import ResolvedImage from '../ResolvedImage';

/**
 * DamageTargetModal
 * Popup modal for the DM to select and apply damage (or healing) to players / NPCs
 * when no token or character is currently selected in the VTT or chat.
 */
export const DamageTargetModal = ({
    isOpen,
    onClose,
    initialAmount = 0,
    initialIsHalf = false,
    initialDamageType = '',
    players = [],
    npcs = [],
    onApplyDamage
}) => {
    if (!isOpen) return null;

    // Base damage amount passed in from roll or command
    const baseDamage = useMemo(() => {
        const val = Number(initialAmount) || 0;
        return initialIsHalf ? Math.floor(val / 2) : val;
    }, [initialAmount, initialIsHalf]);

    const [amount, setAmount] = useState(baseDamage || 0);
    const [mode, setMode] = useState('damage'); // 'damage' | 'heal'
    const [selectedIds, setSelectedIds] = useState(() => {
        // By default, if there are players, we don't pre-select or we can let DM pick
        return new Set();
    });
    const [activeTab, setActiveTab] = useState('players'); // 'players' | 'npcs'
    const [isApplying, setIsApplying] = useState(false);

    // Sync amount if initialAmount changes
    useEffect(() => {
        setAmount(baseDamage || 0);
    }, [baseDamage]);

    // Handle ESC key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Toggle target selection
    const toggleTarget = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Select all party players
    const handleSelectAllPlayers = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            players.forEach(p => next.add(String(p.id)));
            return next;
        });
    };

    // Clear selection
    const handleClearSelection = () => {
        setSelectedIds(new Set());
    };

    // Helper: calculate projected HP
    const getProjectedHp = (character) => {
        const current = Number(character.hp?.current ?? character.hp ?? 0);
        const max = Number(character.hp?.max ?? 10);
        const temp = Number(character.hp?.temp ?? character.hp?.temporary ?? 0);

        if (mode === 'heal') {
            const projected = Math.min(max, current + amount);
            return {
                current,
                max,
                temp,
                projected,
                diff: projected - current,
                isDown: projected <= 0
            };
        } else {
            let remainingDmg = amount;
            let projectedTemp = temp;
            if (temp > 0) {
                if (remainingDmg <= temp) {
                    projectedTemp -= remainingDmg;
                    remainingDmg = 0;
                } else {
                    remainingDmg -= temp;
                    projectedTemp = 0;
                }
            }
            const projected = Math.max(0, current - remainingDmg);
            return {
                current,
                max,
                temp: projectedTemp,
                projected,
                diff: projected - current,
                isDown: projected === 0
            };
        }
    };

    // Apply Handler
    const handleApply = async () => {
        if (selectedIds.size === 0 || amount <= 0) return;
        setIsApplying(true);
        try {
            await onApplyDamage({
                selectedIds: Array.from(selectedIds),
                amount,
                isHeal: mode === 'heal',
                damageType: initialDamageType
            });
            onClose();
        } catch (e) {
            console.error("Failed to apply damage to targets:", e);
        } finally {
            setIsApplying(false);
        }
    };

    const hasNpcs = npcs && npcs.length > 0;
    const targetsToDisplay = activeTab === 'players' ? players : npcs;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            {/* Modal Card */}
            <div 
                className="bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden text-slate-100 max-h-[92vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-xl ${mode === 'heal' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'}`}>
                            <Icon name={mode === 'heal' ? 'heart' : 'crosshair'} size={18} />
                        </div>
                        <div>
                            <h2 className="font-black text-base text-slate-100 flex items-center gap-2">
                                <span>{mode === 'heal' ? 'Apply Healing to Targets' : 'Select Damage Targets'}</span>
                                {initialDamageType && (
                                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        {initialDamageType}
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-slate-400">
                                {mode === 'heal' 
                                    ? 'Select which characters will receive healing' 
                                    : 'No target was selected in VTT or chat. Click players below to apply damage.'}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Close (Esc)"
                    >
                        <Icon name="x" size={18} />
                    </button>
                </div>

                {/* Amount & Mode Controls */}
                <div className="p-3.5 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 shrink-0">
                    {/* Mode Toggle: Damage vs Heal */}
                    <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                            type="button"
                            onClick={() => setMode('damage')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                mode === 'damage'
                                    ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Icon name="sword" size={13} />
                            <span>Damage</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('heal')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                mode === 'heal'
                                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Icon name="heart" size={13} />
                            <span>Heal</span>
                        </button>
                    </div>

                    {/* Numeric Input & Math Adjusters */}
                    <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
                        <span className="text-[11px] font-bold text-slate-400 px-1">Amount:</span>
                        <button 
                            type="button"
                            onClick={() => setAmount(prev => Math.max(0, prev - 5))}
                            className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center transition-all cursor-pointer"
                            title="-5"
                        >-5</button>
                        <button 
                            type="button"
                            onClick={() => setAmount(prev => Math.max(0, prev - 1))}
                            className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center transition-all cursor-pointer"
                            title="-1"
                        >-1</button>
                        <input 
                            type="number" 
                            min="0"
                            max="999"
                            value={amount} 
                            onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value, 10) || 0))} 
                            className="w-16 text-center font-mono font-bold text-base bg-slate-900 text-amber-400 border border-slate-700 rounded-lg py-0.5 outline-none focus:border-amber-500"
                        />
                        <button 
                            type="button"
                            onClick={() => setAmount(prev => prev + 1)}
                            className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center transition-all cursor-pointer"
                            title="+1"
                        >+1</button>
                        <button 
                            type="button"
                            onClick={() => setAmount(prev => prev + 5)}
                            className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center transition-all cursor-pointer"
                            title="+5"
                        >+5</button>

                        {/* Presets: Full, Half */}
                        {initialAmount > 0 && (
                            <div className="ml-2 pl-2 border-l border-slate-800 flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setAmount(initialAmount)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                                        amount === initialAmount 
                                            ? 'bg-amber-500 text-slate-950 font-black' 
                                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    Full ({initialAmount})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAmount(Math.floor(initialAmount / 2))}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                                        amount === Math.floor(initialAmount / 2) 
                                            ? 'bg-amber-500 text-slate-950 font-black' 
                                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    Half ({Math.floor(initialAmount / 2)})
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sub-header / Category Tabs & Quick Select */}
                <div className="px-4 py-2 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between text-xs">
                    {/* Tabs if NPCs exist */}
                    {hasNpcs ? (
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab('players')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                    activeTab === 'players' 
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Party Players ({players.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('npcs')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                    activeTab === 'npcs' 
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                NPCs / Monsters ({npcs.length})
                            </button>
                        </div>
                    ) : (
                        <span className="font-bold text-slate-300">Party Members ({players.length})</span>
                    )}

                    {/* Quick Selection Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleSelectAllPlayers}
                            className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 text-[11px] font-bold border border-slate-700/80 transition-all cursor-pointer"
                        >
                            Select All Party
                        </button>
                        {selectedIds.size > 0 && (
                            <button
                                type="button"
                                onClick={handleClearSelection}
                                className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-bold border border-slate-700/80 transition-all cursor-pointer"
                            >
                                Clear ({selectedIds.size})
                            </button>
                        )}
                    </div>
                </div>

                {/* Target Cards Grid */}
                <div className="p-4 overflow-y-auto flex-1 custom-scroll max-h-[50vh]">
                    {targetsToDisplay.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 text-sm">
                            No {activeTab === 'players' ? 'players' : 'NPCs'} found in this campaign.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {targetsToDisplay.map(character => {
                                const idStr = String(character.id);
                                const isSelected = selectedIds.has(idStr);
                                const { current, max, temp, projected, diff, isDown } = getProjectedHp(character);
                                const hpPct = Math.min(100, Math.max(0, Math.round((current / max) * 100)));
                                const projPct = Math.min(100, Math.max(0, Math.round((projected / max) * 100)));

                                return (
                                    <div
                                        key={idStr}
                                        onClick={() => toggleTarget(idStr)}
                                        className={`relative p-3 rounded-xl border text-left cursor-pointer transition-all select-none flex flex-col justify-between ${
                                            isSelected 
                                                ? mode === 'heal'
                                                    ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                                    : 'bg-red-950/40 border-red-500/80 ring-1 ring-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                                                : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                                        }`}
                                    >
                                        {/* Card Top: Avatar, Name, Class & Checkmark */}
                                        <div className="flex items-start gap-2.5">
                                            {/* Avatar */}
                                            <div className="relative shrink-0">
                                                {character.image || character.tokenImage ? (
                                                    <ResolvedImage
                                                        src={character.image || character.tokenImage} 
                                                        alt={character.name} 
                                                        className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-700 shadow-md"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                                                        <Icon name="user" size={18} />
                                                    </div>
                                                )}
                                                {/* Checkbox badge */}
                                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] transition-all ${
                                                    isSelected 
                                                        ? mode === 'heal' 
                                                            ? 'bg-emerald-500 text-slate-950 font-bold' 
                                                            : 'bg-red-500 text-white font-bold'
                                                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                                                }`}>
                                                    {isSelected ? '✓' : ''}
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <h3 className="font-bold text-sm text-slate-100 truncate">
                                                        {character.name}
                                                    </h3>
                                                    {isDown && isSelected && (
                                                        <span className="text-[10px] font-bold text-red-400 bg-red-950/80 px-1.5 py-0.2 rounded border border-red-800/80 shrink-0">
                                                            💀 0 HP
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-400 truncate">
                                                    {character.class ? `${character.class} ${character.level ? `(Lvl ${character.level})` : ''}` : character.cr ? `CR ${character.cr}` : 'Combatant'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Card Bottom: Health Bar & Projection */}
                                        <div className="mt-3 pt-2 border-t border-slate-800/80">
                                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                                                <span className="text-slate-400">
                                                    HP: <strong className="text-slate-200">{current}</strong>/{max}
                                                    {temp > 0 && <span className="text-sky-300 ml-1">(+{temp})</span>}
                                                </span>
                                                
                                                {/* Projection */}
                                                {isSelected && amount > 0 ? (
                                                    <span className={`font-bold ${mode === 'heal' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {current} → <span className="underline">{projected}</span> ({diff >= 0 ? `+${diff}` : diff})
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500">{hpPct}%</span>
                                                )}
                                            </div>

                                            {/* Health Progress Bar */}
                                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden relative">
                                                <div 
                                                    className={`h-full transition-all duration-300 ${
                                                        hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'
                                                    }`}
                                                    style={{ width: `${isSelected && amount > 0 ? projPct : hpPct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Action Bar */}
                <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-slate-400">
                        {selectedIds.size > 0 ? (
                            <span>Selected: <strong className="text-amber-400 font-bold">{selectedIds.size}</strong> target(s)</span>
                        ) : (
                            <span className="text-slate-500 italic">Click targets above to select</span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={handleApply}
                            disabled={selectedIds.size === 0 || amount <= 0 || isApplying}
                            className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
                                selectedIds.size > 0 && amount > 0 && !isApplying
                                    ? mode === 'heal'
                                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/40'
                                        : 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-red-950/40'
                                    : 'bg-slate-800 text-slate-600 cursor-not-allowed shadow-none'
                            }`}
                        >
                            {isApplying ? (
                                <>
                                    <Icon name="loader" size={14} className="animate-spin" />
                                    <span>Applying...</span>
                                </>
                            ) : (
                                <>
                                    <Icon name={mode === 'heal' ? 'heart' : 'sword'} size={14} />
                                    <span>
                                        {mode === 'heal' ? 'Apply Healing' : 'Apply Damage'} ({amount})
                                        {selectedIds.size > 0 && ` to ${selectedIds.size} Target${selectedIds.size > 1 ? 's' : ''}`}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DamageTargetModal;

