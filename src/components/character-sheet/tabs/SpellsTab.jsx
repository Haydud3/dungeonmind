import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const SpellsTab = ({ onDiceRoll, onLogAction }) => {
    const { character, castSpell, getModifier } = useCharacterStore();
    const [filterLevel, setFilterLevel] = useState(0);

    const spellStat = 'int'; 
    const spellSaveDC = 8 + character.profBonus + getModifier(spellStat);
    const spellAttack = character.profBonus + getModifier(spellStat);

    // FIX: Use real spells or empty array
    const allSpells = character.spells || [];
    
    // Filter logic needs to be robust if levels aren't perfect
    const spells = allSpells.filter(s => (s.level || 0) === filterLevel);
    const slots = character.spellSlots?.[filterLevel] || { current: 0, max: 0 };

    const handleCast = (spell) => {
        if (spell.level > 0) {
            if (slots.current <= 0) {
                alert("No spell slots left!");
                return;
            }
            castSpell(spell.level);
        }

        const msg = `
            <div class="bg-indigo-950 p-2 rounded border-l-4 border-indigo-500">
                <div class="font-bold text-white flex justify-between">
                    <span>${character.name} casts ${spell.name}</span>
                </div>
                <div class="text-xs text-slate-400 mt-1">${spell.time || "1 Action"} • ${spell.range || "Range"}</div>
            </div>
        `;
        if (onLogAction) onLogAction(msg);
        if (onDiceRoll && spell.level > 0) onDiceRoll(4);
    };

    return (
        <div className="space-y-4 pb-24">
            {/* Header Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Attack</div>
                    <div className="text-xl font-bold text-amber-500">+{spellAttack}</div>
                </div>
                <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Save DC</div>
                    <div className="text-xl font-bold text-white">{spellSaveDC}</div>
                </div>
                <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Ability</div>
                    <div className="text-xl font-bold text-slate-400 uppercase">{spellStat.substring(0,3)}</div>
                </div>
            </div>

            {/* Level Selector */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => (
                    <button
                        key={lvl}
                        onClick={() => setFilterLevel(lvl)}
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border transition-all ${filterLevel === lvl ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                    >
                        {lvl === 0 ? 'C' : lvl}
                    </button>
                ))}
            </div>

            {/* Spell List */}
            <div className="space-y-2">
                {spells.length === 0 ? (
                    <div className="text-center text-slate-500 py-8 italic">
                        {filterLevel === 0 ? "No Cantrips known." : `No Level ${filterLevel} spells found.`}
                    </div>
                ) : (
                    spells.map((spell, i) => (
                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex justify-between items-center group hover:border-indigo-500 transition-colors">
                            <div>
                                <div className="font-bold text-slate-200">{spell.name}</div>
                                <div className="text-xs text-slate-500">{spell.school || "Spell"}</div>
                            </div>
                            <button onClick={() => handleCast(spell)} className="text-[10px] bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1 rounded font-bold uppercase">
                                {filterLevel === 0 ? "Cast" : "Slot"}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SpellsTab;