import React from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';

const BioTab = () => {
    const { character, updateInfo } = useCharacterStore();
    const bio = character.bio || {};

    // Helper to update nested bio state
    const updateBio = (field, val) => {
        const newBio = { ...bio, [field]: val };
        updateInfo('bio', newBio);
    };

    return (
        <div className="space-y-6 pb-24">
            
            {/* Traits Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Personality Traits</h4>
                    <textarea 
                        className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none"
                        value={bio.traits || ''}
                        onChange={e => updateBio('traits', e.target.value)}
                    />
                </div>
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Ideals</h4>
                    <textarea 
                        className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none"
                        value={bio.ideals || ''}
                        onChange={e => updateBio('ideals', e.target.value)}
                    />
                </div>
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Bonds</h4>
                    <textarea 
                        className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none"
                        value={bio.bonds || ''}
                        onChange={e => updateBio('bonds', e.target.value)}
                    />
                </div>
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Flaws</h4>
                    <textarea 
                        className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none"
                        value={bio.flaws || ''}
                        onChange={e => updateBio('flaws', e.target.value)}
                    />
                </div>
            </div>

            {/* Backstory */}
            <div className="bg-slate-800 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-bold text-white mb-2">Backstory</h4>
                <textarea 
                    className="w-full bg-slate-900/50 text-sm text-slate-300 p-3 rounded border border-slate-700 h-48 custom-scroll focus:border-amber-500 outline-none"
                    value={bio.backstory || ''}
                    onChange={e => updateBio('backstory', e.target.value)}
                    placeholder="Once upon a time..."
                />
            </div>

            {/* Appearance */}
            <div className="bg-slate-800 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-bold text-white mb-2">Appearance & Visuals</h4>
                <textarea 
                    className="w-full bg-slate-900/50 text-sm text-slate-300 p-3 rounded border border-slate-700 h-32 custom-scroll focus:border-amber-500 outline-none"
                    value={bio.appearance || ''}
                    onChange={e => updateBio('appearance', e.target.value)}
                />
            </div>

            {/* Notes / Allies */}
            <div className="bg-slate-800 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-bold text-white mb-2">Allies, Organizations & Notes</h4>
                <textarea 
                    className="w-full bg-slate-900/50 text-sm text-slate-300 p-3 rounded border border-slate-700 h-32 custom-scroll focus:border-amber-500 outline-none"
                    value={bio.notes || ''}
                    onChange={e => updateBio('notes', e.target.value)}
                />
            </div>
        </div>
    );
};

export default BioTab;