import React, { useState, useEffect } from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';
import { resolveChoice } from './choiceResolver';
import { fetch5eData } from './5eDataUtils';

const Step3Class = () => {
    const { srdData, draft, updateDraft, ruleset, pendingChoices, addPendingChoice } = useCharacterBuilderStore();
    const [subclasses, setSubclasses] = useState([]);
    const [isLoadingSubclasses, setIsLoadingSubclasses] = useState(false);

    // Fetch subclasses when a class is selected
    useEffect(() => {
        const loadSubclasses = async () => {
            if (!draft.classData?.index) {
                setSubclasses([]);
                return;
            }
            setIsLoadingSubclasses(true);
            try {
                // Fetch the subclasses JSON
                const allSubclasses = await fetch5eData(ruleset, 'Subclasses');
                // Filter subclasses that belong to the selected class
                const filtered = allSubclasses.filter(sc => sc.class.index === draft.classData.index);
                setSubclasses(filtered);
            } catch (err) {
                console.error("Failed to load subclasses", err);
            }
            setIsLoadingSubclasses(false);
        };
        loadSubclasses();
    }, [draft.classData?.index, ruleset]);

    const handleSelectClass = async (classData) => {
        // We store the class selection in the draft state
        const classEntry = {
            classId: classData.index,
            level: draft.classes?.[0]?.level || 1,
            subclassId: null
        };
        updateDraft({ 
            classData: classData, // Store the full object for UI rendering
            classes: [classEntry]
        });
        
        // Clear previous class choices from the pending queue
        useCharacterBuilderStore.setState(state => ({
            pendingChoices: state.pendingChoices.filter(c => c.source !== 'class')
        }));
        
        // Resolve Class Proficiency Choices (e.g. "Choose 2 Skills from: ...")
        if (classData.proficiency_choices) {
            for (const choice of classData.proficiency_choices) {
                const resolved = await resolveChoice(choice, ruleset);
                if (resolved) addPendingChoice({ ...resolved, source: 'class' });
            }
        }
    };

    const handleLevelChange = (e) => {
        const newLevel = parseInt(e.target.value) || 1;
        const currentClasses = [...(draft.classes || [])];
        if (currentClasses.length > 0) {
            currentClasses[0].level = newLevel;
            updateDraft({ classes: currentClasses });
        }
    };

    const handleSelectSubclass = (sc) => {
        const currentClasses = [...(draft.classes || [])];
        if (currentClasses.length > 0) {
            currentClasses[0].subclassId = sc.index;
            updateDraft({ 
                classes: currentClasses,
                subclassData: sc 
            });
        }
    };

    // Safe Choice Engine handler with selection limits
    const handleChoiceToggle = (choiceId, optionValue, isChecked, maxChoices) => {
        const choiceIndex = pendingChoices.findIndex(c => c.id === choiceId);
        if (choiceIndex === -1) return;

        const choice = pendingChoices[choiceIndex];
        let newSelections = [...(choice.selections || [])];

        if (isChecked) {
            if (newSelections.length >= maxChoices) {
                // If radio (choose 1), auto-replace. If checkbox, prevent adding.
                if (maxChoices === 1) newSelections = [optionValue];
                else return; 
            } else {
                newSelections.push(optionValue);
            }
        } else {
            newSelections = newSelections.filter(v => v !== optionValue);
        }

        const updatedChoices = [...pendingChoices];
        updatedChoices[choiceIndex] = { ...choice, selections: newSelections };
        useCharacterBuilderStore.setState({ pendingChoices: updatedChoices });
    };

    const currentClassEntry = draft.classes?.[0] || {};
    const selectedLevel = currentClassEntry.level || 1;
    const selectedSubclassId = currentClassEntry.subclassId;

    return (
        <div className="flex h-full gap-6 animate-in fade-in">
            {/* Left Column: Selection List */}
            <div className="w-1/3 flex flex-col gap-2 overflow-y-auto pr-2 pb-24">
                {srdData.classes.map(c => (
                    <button 
                        key={c.index} 
                        onClick={() => handleSelectClass(c)}
                        className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${draft.classData?.index === c.index ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                    >
                        <div className="font-bold text-lg">{c.name}</div>
                    </button>
                ))}
            </div>

            {/* Right Column: Details & Choice Resolution UI */}
            <div className="w-2/3 bg-slate-800 border border-slate-700 rounded-xl p-8 overflow-y-auto pb-24 shadow-xl">
                {draft.classData ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-start">
                            <h2 className="text-4xl font-black text-white">{draft.classData.name}</h2>
                            <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-slate-700">
                                <label className="text-sm font-bold text-slate-400">Level</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="20" 
                                    value={selectedLevel}
                                    onChange={handleLevelChange}
                                    className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white font-bold text-center outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-slate-300 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <span className="flex items-center gap-2"><strong className="text-white">Hit Die:</strong> d{draft.classData.hit_die}</span>
                            {draft.classData.primary_ability && (
                                <span className="flex items-center gap-2">
                                    <strong className="text-white">Primary Ability:</strong> 
                                    {draft.classData.primary_ability.desc || draft.classData.primary_ability.ability_scores?.[0]?.name}
                                </span>
                            )}
                        </div>

                        {/* Subclass Selection */}
                        <div className="space-y-3">
                            <h3 className="text-xl font-bold text-white border-b border-slate-700 pb-2">Subclass / Archetype</h3>
                            {isLoadingSubclasses ? (
                                <div className="text-slate-500 text-sm animate-pulse">Loading archetypes...</div>
                            ) : subclasses.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {subclasses.map(sc => (
                                        <button key={sc.index} onClick={() => handleSelectSubclass(sc)} className={`p-3 rounded-lg border text-left transition-all ${selectedSubclassId === sc.index ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-500'}`}>
                                            <div className="font-bold">{sc.name}</div>
                                            {selectedSubclassId === sc.index && sc.summary && <div className="text-xs text-indigo-200 mt-1">{sc.summary}</div>}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-slate-500 text-sm italic">No subclasses available for this class yet.</div>
                            )}
                        </div>

                        {/* Subclass Features (Auto-Applies based on Level) */}
                        {draft.subclassData && draft.subclassData.features && (
                            <div className="space-y-3 animate-in slide-in-from-top-2">
                                <h3 className="text-xl font-bold text-white border-b border-slate-700 pb-2">Subclass Features</h3>
                                {draft.subclassData.features.filter(f => f.level <= selectedLevel).length === 0 ? (
                                    <div className="text-slate-500 text-sm italic">No features unlocked at Level {selectedLevel}.</div>
                                ) : (
                                    <div className="space-y-3">
                                        {draft.subclassData.features.filter(f => f.level <= selectedLevel).map((feat, idx) => (
                                            <div key={idx} className="bg-slate-900/50 p-4 rounded-lg border border-indigo-500/30">
                                                <h4 className="font-bold text-indigo-400 flex items-center justify-between">
                                                    {feat.name}
                                                    <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-700">Level {feat.level}</span>
                                                </h4>
                                                <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{feat.description || feat.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Dynamic Choice Renderer */}
                        {pendingChoices.filter(c => c.source === 'class').length > 0 && (
                            <div className="mt-8 p-6 bg-indigo-900/20 border-2 border-indigo-500/50 rounded-xl space-y-6">
                                <h3 className="text-xl font-bold text-indigo-300 flex items-center gap-2">Class Proficiencies</h3>
                                {pendingChoices.filter(c => c.source === 'class').map(choice => {
                                    const selections = choice.selections || [];
                                    const isMaxed = selections.length >= choice.choose;
                                    
                                    return (
                                        <div key={choice.id} className="bg-slate-900 p-4 rounded-lg border border-indigo-800/50">
                                            <p className="text-sm font-bold text-slate-200 mb-3">{choice.desc} <span className="text-indigo-400">({selections.length}/{choice.choose})</span></p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {choice.options.map(opt => {
                                                    const isSelected = selections.includes(opt.value);
                                                    // Disable unselected options if we've hit our limit
                                                    const isDisabled = !isSelected && isMaxed && choice.choose > 1;
                                                    
                                                    return (
                                                        <label key={opt.value} className={`flex items-center gap-3 text-sm p-3 rounded-lg border transition-colors ${isSelected ? 'bg-indigo-900/40 border-indigo-500 text-white shadow-inner' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-indigo-500/50 cursor-pointer'} ${isDisabled ? 'opacity-50 cursor-not-allowed hover:border-slate-700' : ''}`}>
                                                            <input type={choice.choose === 1 ? 'radio' : 'checkbox'} name={choice.id} value={opt.value} checked={isSelected} disabled={isDisabled} onChange={(e) => handleChoiceToggle(choice.id, opt.value, e.target.checked, choice.choose)} className="accent-indigo-500 w-4 h-4" />
                                                            <span className="font-medium">{opt.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 italic text-lg">
                        Select a class from the list to view its details.
                    </div>
                )}
            </div>
        </div>
    );
};
export default Step3Class;