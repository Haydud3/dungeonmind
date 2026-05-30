import React, { useState } from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';
import { resolveChoice } from './choiceResolver';

const Step5Background = () => {
    const { srdData, draft, updateDraft, ruleset, pendingChoices, addPendingChoice } = useCharacterBuilderStore();
    const [activeTab, setActiveTab] = useState('background'); // 'background' or 'details'

    const handleSelectBackground = async (bg) => {
        updateDraft({ background: bg });
        
        // Clear previous background choices from the pending queue
        useCharacterBuilderStore.setState(state => ({
            pendingChoices: state.pendingChoices.filter(c => c.source !== 'background')
        }));
        
        // Resolve Background Choices (Languages, Proficiencies, Equipment, and 2024 ASIs)
        const optionsToResolve = [
            bg.language_options,
            bg.starting_proficiency_options,
            bg.starting_equipment_options,
            bg.ability_bonus_options // 2024 Ruleset ASI
        ];

        for (const option of optionsToResolve) {
            if (option) {
                const resolved = await resolveChoice(option, ruleset);
                if (resolved) addPendingChoice({ ...resolved, source: 'background' });
            }
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

    const handleBioChange = (field, value) => {
        const currentBio = draft.bio || {};
        updateDraft({ bio: { ...currentBio, [field]: value } });
    };

    const bio = draft.bio || {};

    return (
        <div className="flex h-full gap-6 animate-in fade-in">
            {/* Left Column: Selection List */}
            <div className="w-1/3 flex flex-col gap-2 overflow-y-auto pr-2 pb-24">
                {srdData.backgrounds.map(bg => (
                    <button 
                        key={bg.index} 
                        onClick={() => handleSelectBackground(bg)}
                        className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${draft.background?.index === bg.index ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                    >
                        <div className="font-bold text-lg">{bg.name}</div>
                    </button>
                ))}
            </div>

            {/* Right Column: Details & Choice Resolution UI */}
            <div className="w-2/3 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-xl">
                {draft.background ? (
                    <>
                        {/* Tabs */}
                        <div className="flex bg-slate-900 border-b border-slate-700 shrink-0">
                            <button onClick={() => setActiveTab('background')} className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'background' ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                                Background Mechanics
                            </button>
                            <button onClick={() => setActiveTab('details')} className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'details' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                                Character Details
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-8 pb-24">
                            {activeTab === 'background' ? (
                                <div className="space-y-6 animate-in fade-in">
                                    <h2 className="text-4xl font-black text-white">{draft.background.name}</h2>
                                    
                                    <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed text-sm">
                                        {draft.background.feature && (
                                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 mb-6">
                                                <h4 className="text-white font-bold text-lg mb-2">{draft.background.feature.name}</h4>
                                                <p className="whitespace-pre-wrap">{draft.background.feature.desc?.join('\n')}</p>
                                            </div>
                                        )}
                                        {draft.background.starting_proficiencies?.length > 0 && (
                                            <p><strong>Fixed Proficiencies:</strong> {draft.background.starting_proficiencies.map(p => p.name).join(', ')}</p>
                                        )}
                                    </div>

                                    {/* Dynamic Choice Renderer */}
                                    {pendingChoices.filter(c => c.source === 'background').length > 0 && (
                                        <div className="mt-8 p-6 bg-indigo-900/20 border-2 border-indigo-500/50 rounded-xl space-y-6">
                                            <h3 className="text-xl font-bold text-indigo-300 flex items-center gap-2">Background Choices</h3>
                                            {pendingChoices.filter(c => c.source === 'background').map(choice => {
                                                const selections = choice.selections || [];
                                                const isMaxed = selections.length >= choice.choose;
                                                
                                                return (
                                                    <div key={choice.id} className="bg-slate-900 p-4 rounded-lg border border-indigo-800/50">
                                                        <p className="text-sm font-bold text-slate-200 mb-3">{choice.desc} <span className="text-indigo-400">({selections.length}/{choice.choose})</span></p>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {choice.options.map(opt => {
                                                                const isSelected = selections.includes(opt.value);
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
                                <div className="space-y-6 animate-in fade-in">
                                    <h2 className="text-3xl font-black text-white mb-6">Character Details</h2>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Alignment</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500" value={bio.alignment || ''} onChange={(e) => handleBioChange('alignment', e.target.value)} placeholder="e.g. Chaotic Good" /></div>
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Faith</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500" value={bio.faith || ''} onChange={(e) => handleBioChange('faith', e.target.value)} placeholder="e.g. Lathander" /></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-4 gap-4">
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Hair</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 text-sm" value={bio.hair || ''} onChange={(e) => handleBioChange('hair', e.target.value)} /></div>
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Eyes</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 text-sm" value={bio.eyes || ''} onChange={(e) => handleBioChange('eyes', e.target.value)} /></div>
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Height</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 text-sm" value={bio.height || ''} onChange={(e) => handleBioChange('height', e.target.value)} placeholder="5'10" /></div>
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Weight</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 text-sm" value={bio.weight || ''} onChange={(e) => handleBioChange('weight', e.target.value)} placeholder="160 lbs" /></div>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-slate-700">
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Personality Traits</label><textarea className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none h-20" value={bio.traits || ''} onChange={(e) => handleBioChange('traits', e.target.value)} /></div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ideals</label><textarea className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none h-20 text-sm" value={bio.ideals || ''} onChange={(e) => handleBioChange('ideals', e.target.value)} /></div>
                                            <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bonds</label><textarea className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none h-20 text-sm" value={bio.bonds || ''} onChange={(e) => handleBioChange('bonds', e.target.value)} /></div>
                                            <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Flaws</label><textarea className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none h-20 text-sm" value={bio.flaws || ''} onChange={(e) => handleBioChange('flaws', e.target.value)} /></div>
                                        </div>
                                        <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Backstory</label><textarea className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none h-40" value={bio.backstory || ''} onChange={(e) => handleBioChange('backstory', e.target.value)} placeholder="Where did you come from? Why are you adventuring?" /></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 italic text-lg p-8">
                        Select a background from the list to view its details and fill out your character's bio.
                    </div>
                )}
            </div>
        </div>
    );
};
export default Step5Background;