import React from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';

const Step1Setup = () => {
    const { draft, updateDraft, ruleset, setRuleset } = useCharacterBuilderStore();

    return (
        <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in h-full overflow-y-auto pb-12 pr-4 custom-scroll">
            <div>
                <h2 className="text-2xl font-bold text-white mb-2">Character Setup</h2>
                <p className="text-slate-400 text-sm">Choose your ruleset and basic character details.</p>
            </div>
            
            <div className="space-y-4 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Character Name</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 font-bold"
                        value={draft.name}
                        onChange={(e) => updateDraft({ name: e.target.value })}
                        placeholder="e.g. Thorin Oakenshield"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Avatar Image URL</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                        value={draft.avatarUrl}
                        onChange={(e) => updateDraft({ avatarUrl: e.target.value })}
                        placeholder="https://..."
                    />
                </div>
            </div>

            <div className="space-y-4 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-4">Select Ruleset</h3>
                <div className="flex flex-col sm:flex-row gap-4">
                    <button className={`flex-1 p-5 rounded-xl border-2 text-left transition-all ${ruleset === '2014' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`} onClick={() => setRuleset('2014')}>
                        <div className="font-bold text-white text-lg">2014 Legacy Rules</div>
                        <div className="text-sm text-slate-400 mt-1">The standard 5th Edition SRD. "Race" choices with innate Ability Score Increases.</div>
                    </button>
                    <button className={`flex-1 p-5 rounded-xl border-2 text-left transition-all ${ruleset === '2024' ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`} onClick={() => setRuleset('2024')}>
                        <div className="font-bold text-white text-lg">2024 Updated Rules</div>
                        <div className="text-sm text-slate-400 mt-1">The revised 5th Edition SRD. "Species" choices with Ability Score Increases moved to Backgrounds.</div>
                    </button>
                </div>
            </div>
        </div>
    );
};
export default Step1Setup;