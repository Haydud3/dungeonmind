import React from 'react';
import Icon from '../Icon';

const SpellSlotTracker = ({ spellSlots, onUpdateSlots, isOwner = true }) => {
    if (!spellSlots || Object.keys(spellSlots).length === 0) return null;

    // Helper to handle clicking a slot bubble
    const handleSlotClick = (level, slotIndex, current) => {
        if (!isOwner) return;
        const isCurrentlyFilled = slotIndex < current;
        let newCurrent = current;

        if (isCurrentlyFilled && slotIndex === current - 1) {
            newCurrent = current - 1; // Uncheck the last filled slot (consume it)
        } else {
            newCurrent = slotIndex + 1; // Check up to this slot (recover it)
        }

        if (onUpdateSlots) {
            onUpdateSlots(level, newCurrent);
        }
    };

    const handleResetLevel = (level, max) => {
        if (!isOwner || !onUpdateSlots) return;
        onUpdateSlots(level, max);
    };

    const standardLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
        level => spellSlots[level] && spellSlots[level].max > 0
    );
    const hasPact = spellSlots.pact && spellSlots.pact.max > 0;

    if (standardLevels.length === 0 && !hasPact) return null;

    return (
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 p-4 rounded-2xl mb-4 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Spell Slots</h3>
                </div>
                <span className="text-[10px] text-slate-500">Click bubble to expend/restore</span>
            </div>

            <div className="flex flex-wrap gap-2.5">
                {/* Standard Slots (1-9) */}
                {standardLevels.map(level => {
                    const slotData = spellSlots[level];
                    const isFullyExpended = slotData.current === 0;

                    return (
                        <div 
                            key={level} 
                            className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border transition-all ${
                                isFullyExpended 
                                    ? 'bg-slate-900/40 border-slate-800/60 opacity-60' 
                                    : 'bg-slate-800/40 border-slate-700/60 shadow-sm'
                            }`}
                        >
                            <div className="flex items-center justify-between w-full gap-2">
                                <span className="text-[10px] font-bold text-slate-300 font-mono">Lv {level}</span>
                                <span className="text-[9px] font-mono text-blue-400">
                                    {slotData.current}/{slotData.max}
                                </span>
                            </div>

                            <div className="flex items-center gap-1.5 py-0.5">
                                {Array.from({ length: slotData.max }).map((_, index) => {
                                    const isFilled = index < slotData.current;
                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => handleSlotClick(level, index, slotData.current)}
                                            disabled={!isOwner}
                                            className="focus:outline-none transition-transform hover:scale-125 active:scale-95"
                                            title={`Toggle Lv ${level} Slot (${isFilled ? 'Available' : 'Expended'})`}
                                        >
                                            <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                                isFilled 
                                                    ? 'bg-blue-500 border-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.9)]' 
                                                    : 'bg-slate-950 border-slate-700/80 hover:border-slate-500'
                                            }`} />
                                        </button>
                                    );
                                })}
                            </div>

                            {isOwner && slotData.current < slotData.max && (
                                <button
                                    type="button"
                                    onClick={() => handleResetLevel(level, slotData.max)}
                                    className="text-[9px] text-slate-500 hover:text-blue-400 transition-colors pt-0.5"
                                    title="Restore All Slots for this Level"
                                >
                                    Restore
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* Pact Magic (Warlock) */}
                {hasPact && (
                    <div className="flex flex-col items-center gap-1.5 bg-indigo-950/30 px-3 py-2 rounded-xl border border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]">
                        <div className="flex items-center justify-between w-full gap-2">
                            <span className="text-[10px] font-bold text-indigo-300 font-mono">Pact (Lv {spellSlots.pact.level})</span>
                            <span className="text-[9px] font-mono text-indigo-400">
                                {spellSlots.pact.current}/{spellSlots.pact.max}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 py-0.5">
                            {Array.from({ length: spellSlots.pact.max }).map((_, index) => {
                                const isFilled = index < spellSlots.pact.current;
                                return (
                                    <button
                                        key={index}
                                        type="button"
                                        onClick={() => handleSlotClick('pact', index, spellSlots.pact.current)}
                                        disabled={!isOwner}
                                        className="focus:outline-none transition-transform hover:scale-125 active:scale-95"
                                        title={`Toggle Pact Slot (${isFilled ? 'Available' : 'Expended'})`}
                                    >
                                        <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                            isFilled 
                                                ? 'bg-indigo-500 border-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.9)]' 
                                                : 'bg-slate-950 border-indigo-900 hover:border-indigo-700'
                                        }`} />
                                    </button>
                                );
                            })}
                        </div>
                        {isOwner && spellSlots.pact.current < spellSlots.pact.max && (
                            <button
                                type="button"
                                onClick={() => handleResetLevel('pact', spellSlots.pact.max)}
                                className="text-[9px] text-slate-500 hover:text-indigo-400 transition-colors pt-0.5"
                                title="Restore Pact Slots"
                            >
                                Restore
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SpellSlotTracker;