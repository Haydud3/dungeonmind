import React from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';
import { resolveChoice } from './choiceResolver';

const Step2Species = () => {
    const { srdData, draft, updateDraft, ruleset, pendingChoices, addPendingChoice } = useCharacterBuilderStore();

    const handleSelectSpecies = async (species) => {
        updateDraft({ species });
        
        // Filter out old species choices from the pending array so they don't stack
        useCharacterBuilderStore.setState(state => ({
            pendingChoices: state.pendingChoices.filter(c => c.source !== 'species')
        }));
        
        // Resolve legacy 2014 Ability Bonus options (e.g. Half-Elf)
        if (species.ability_bonus_options) {
            const resolved = await resolveChoice(species.ability_bonus_options, ruleset);
            if (resolved) addPendingChoice({ ...resolved, source: 'species' });
        }
        
        // Resolve Language options
        if (species.language_options) {
            const resolved = await resolveChoice(species.language_options, ruleset);
            if (resolved) addPendingChoice({ ...resolved, source: 'species' });
        }
        
        // Resolve Starting Proficiency Options (e.g. Elf Perception/Skill Versatility)
        if (species.starting_proficiency_options) {
            const resolved = await resolveChoice(species.starting_proficiency_options, ruleset);
            if (resolved) addPendingChoice({ ...resolved, source: 'species' });
        }
    };

    return (
        <div className="flex h-full gap-6 animate-in fade-in">
            {/* Left Column: Selection List */}
            <div className="w-1/3 flex flex-col gap-2 overflow-y-auto pr-2 pb-24">
                {srdData.species.map(s => (
                    <button 
                        key={s.index} 
                        onClick={() => handleSelectSpecies(s)}
                        className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${draft.species?.index === s.index ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                    >
                        <div className="font-bold text-lg">{s.name}</div>
                    </button>
                ))}
            </div>

            {/* Right Column: Details & Choice Resolution UI */}
            <div className="w-2/3 bg-slate-800 border border-slate-700 rounded-xl p-8 overflow-y-auto pb-24 shadow-xl">
                {draft.species ? (
                    <div className="space-y-6">
                        <h2 className="text-4xl font-black text-white">{draft.species.name}</h2>
                        <div className="flex gap-6 text-sm text-slate-300 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <span className="flex items-center gap-2"><strong className="text-white">Size:</strong> {draft.species.size || "Medium"}</span>
                            <span className="flex items-center gap-2"><strong className="text-white">Speed:</strong> {draft.species.speed} ft.</span>
                        </div>
                        
                        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed">
                            <p>{draft.species.alignment || draft.species.desc || ""}</p>
                            {draft.species.age && <p>{draft.species.age}</p>}
                            {draft.species.size_description && <p>{draft.species.size_description}</p>}
                        </div>

                        {/* Dynamic Choice Renderer from the Resolver Engine */}
                        {pendingChoices.filter(c => c.source === 'species').length > 0 && (
                            <div className="mt-8 p-6 bg-indigo-900/20 border-2 border-indigo-500/50 rounded-xl space-y-6">
                                <h3 className="text-xl font-bold text-indigo-300 flex items-center gap-2">Required Choices</h3>
                                {pendingChoices.filter(c => c.source === 'species').map(choice => (
                                    <div key={choice.id} className="bg-slate-900 p-4 rounded-lg border border-indigo-800/50">
                                        <p className="text-sm font-bold text-slate-200 mb-3">{choice.desc}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {choice.options.map(opt => (
                                                <label key={opt.value} className="flex items-center gap-3 text-sm text-slate-300 bg-slate-800 p-3 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors border border-slate-700 hover:border-indigo-500/50">
                                                    <input 
                                                        type={choice.choose === 1 ? 'radio' : 'checkbox'} 
                                                        name={choice.id}
                                                        value={opt.value}
                                                        className="accent-indigo-500 w-4 h-4"
                                                    />
                                                    <span className="font-medium">{opt.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 italic text-lg">
                        Select a {ruleset === '2024' ? 'species' : 'race'} from the list to view its details.
                    </div>
                )}
            </div>
        </div>
    );
};
export default Step2Species;