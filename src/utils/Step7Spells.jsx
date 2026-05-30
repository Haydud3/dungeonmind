import React, { useState, useEffect, useMemo } from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';
import { fetch5eData } from './5eDataUtils';
import Icon from '../components/Icon';

const Step7Spells = () => {
    const { draft, updateDraft, ruleset } = useCharacterBuilderStore();
    const [allSpells, setAllSpells] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeLevel, setActiveLevel] = useState(0);
    const [showAllClasses, setShowAllClasses] = useState(false);

    useEffect(() => {
        const loadSpells = async () => {
            setIsLoading(true);
            try {
                const spells = await fetch5eData(ruleset, 'Spells');
                setAllSpells(spells || []);
            } catch (e) {
                console.error("Failed to load spells", e);
            }
            setIsLoading(false);
        };
        loadSpells();
    }, [ruleset]);

    const selectedSpells = draft.spells || [];

    const toggleSpell = (spell) => {
        const exists = selectedSpells.find(s => s.index === spell.index);
        if (exists) {
            updateDraft({ spells: selectedSpells.filter(s => s.index !== spell.index) });
        } else {
            updateDraft({ spells: [...selectedSpells, spell] });
        }
    };

    const filteredSpells = useMemo(() => {
        return allSpells.filter(spell => {
            if (spell.level !== activeLevel) return false;
            if (!showAllClasses && draft.classData?.index) {
                return spell.classes?.some(c => c.index === draft.classData.index);
            }
            return true;
        });
    }, [allSpells, activeLevel, showAllClasses, draft.classData]);

    const hasSpellcasting = !!draft.classData?.spellcasting;

    return (
        <div className="flex h-full gap-6 animate-in fade-in">
            {/* Left Column: Filters & Levels */}
            <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-24">
                <h3 className="text-xl font-bold text-white mb-2">Spell Level</h3>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                    const count = selectedSpells.filter(s => s.level === level).length;
                    return (
                        <button 
                            key={level}
                            onClick={() => setActiveLevel(level)} 
                            className={`text-left px-4 py-3 rounded-xl border transition-all shadow-sm flex justify-between items-center ${activeLevel === level ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                        >
                            <div className="font-bold">{level === 0 ? 'Cantrips' : `Level ${level}`}</div>
                            {count > 0 && <div className="bg-slate-900/50 text-blue-200 text-xs px-2 py-0.5 rounded-full font-bold">{count} Known</div>}
                        </button>
                    );
                })}
                
                <div className="mt-4 p-4 bg-slate-800 border border-slate-700 rounded-xl">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input 
                            type="checkbox" 
                            checked={showAllClasses} 
                            onChange={(e) => setShowAllClasses(e.target.checked)}
                            className="w-5 h-5 accent-blue-500"
                        />
                        <div>
                            <div className="font-bold text-slate-200 group-hover:text-white transition-colors">Show All Spells</div>
                            <div className="text-xs text-slate-400 mt-1">Ignore class restrictions</div>
                        </div>
                    </label>
                </div>
            </div>

            {/* Right Column: Spell List */}
            <div className="w-2/3 bg-slate-800 border border-slate-700 rounded-xl p-8 overflow-y-auto pb-24 shadow-xl">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white mb-1">
                            {activeLevel === 0 ? 'Cantrips' : `Level ${activeLevel} Spells`}
                        </h2>
                        {!hasSpellcasting && <p className="text-amber-500 text-sm font-bold">Your class does not naturally cast spells.</p>}
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-black text-blue-400">{selectedSpells.length}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Total Spells</div>
                    </div>
                </div>
                
                {isLoading ? (
                    <div className="text-center py-12">
                        <Icon name="loader" size={48} className="animate-spin text-blue-500 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold">Consulting the Grimoire...</p>
                    </div>
                ) : filteredSpells.length > 0 ? (
                    <div className="space-y-3">
                        {filteredSpells.map(spell => {
                            const isSelected = selectedSpells.some(s => s.index === spell.index);
                            return (
                                <div 
                                    key={spell.index}
                                    onClick={() => toggleSpell(spell)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-slate-900/50 border-slate-700 hover:border-slate-500 hover:bg-slate-900'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h3 className={`font-bold text-lg flex items-center gap-2 ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                                                {spell.name}
                                                {isSelected && <span className="text-indigo-400 text-xs bg-indigo-900/50 px-2 py-0.5 rounded-full border border-indigo-500/50 uppercase tracking-widest">Prepared</span>}
                                            </h3>
                                        </div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{spell.school?.name}</div>
                                    </div>
                                    <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed">{spell.desc?.[0]}</p>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-dashed border-slate-700 text-slate-500">No spells found.</div>
                )}
            </div>
        </div>
    );
};
export default Step7Spells;