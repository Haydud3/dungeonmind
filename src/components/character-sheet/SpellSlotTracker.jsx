import React from 'react';

const SpellSlotTracker = ({ spellSlots, onUpdateSlots }) => {
    if (!spellSlots || Object.keys(spellSlots).length === 0) return null;

    // Helper to handle clicking a slot bubble
    const handleSlotClick = (level, slotIndex, current) => {
        // If they click the highest available filled bubble, decrement current. 
        // Otherwise, set current to the index they clicked + 1
        const isCurrentlyFilled = slotIndex < current;
        let newCurrent = current;

        if (isCurrentlyFilled && slotIndex === current - 1) {
            newCurrent = current - 1; // Uncheck the last filled slot (consume it)
        } else {
            newCurrent = slotIndex + 1; // Check up to this slot (recover it)
        }

        // Call the parent update function to persist to Firestore
        if (onUpdateSlots) {
            onUpdateSlots(level, newCurrent);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl mb-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Spell Slots</h3>
            <div className="flex flex-wrap gap-4">
                {/* Standard Slots (1-9) */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                    const slotData = spellSlots[level];
                    if (!slotData || slotData.max === 0) return null;

                    return (
                        <div key={level} className="flex flex-col items-center gap-1 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                            <span className="text-xs font-bold text-slate-300">Level {level}</span>
                            <div className="flex gap-1">
                                {Array.from({ length: slotData.max }).map((_, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleSlotClick(level, index, slotData.current)}
                                        className="focus:outline-none transition-transform hover:scale-110"
                                        title={`Toggle Level ${level} Slot`}
                                    >
                                        <div className={`w-4 h-4 rounded-full border-2 ${
                                            index < slotData.current 
                                            ? 'bg-blue-500 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]' 
                                            : 'bg-slate-900 border-slate-600'
                                        }`} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {/* Pact Magic (Warlock) */}
                {spellSlots.pact && spellSlots.pact.max > 0 && (
                    <div className="flex flex-col items-center gap-1 bg-indigo-900/30 px-3 py-2 rounded-lg border border-indigo-700">
                        <span className="text-xs font-bold text-indigo-300">Pact (Lv {spellSlots.pact.level})</span>
                        <div className="flex gap-1">
                            {Array.from({ length: spellSlots.pact.max }).map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleSlotClick('pact', index, spellSlots.pact.current)}
                                    className="focus:outline-none transition-transform hover:scale-110"
                                >
                                    <div className={`w-4 h-4 rounded-full border-2 ${
                                        index < spellSlots.pact.current 
                                        ? 'bg-indigo-500 border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]' 
                                        : 'bg-slate-900 border-indigo-900'
                                    }`} />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SpellSlotTracker;