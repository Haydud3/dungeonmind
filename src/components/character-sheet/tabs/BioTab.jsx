import React from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';

const BioTab = () => {
    const { character, updateInfo } = useCharacterStore();
    const bio = character.bio || {};

    const updateBio = (field, val) => {
        const newBio = { ...bio, [field]: val };
        updateInfo('bio', newBio);
    };

    return (
        <div className="space-y-6 pb-24">
            
            {/* --- RESTORED: PLAYER ALIAS SECTION --- */}
            <div className="bg-indigo-900/20 border border-indigo-500/50 p-4 rounded-xl">
                <h4 className="text-sm font-bold text-indigo-300 uppercase mb-2">AI Identity Link</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Character Name</label>
                        <input 
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-bold opacity-50 cursor-not-allowed"
                            value={character.name}
                            readOnly
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-amber-400 uppercase font-bold block mb-1">Real Name / Alias</label>
                        <input 
                            className="w-full bg-slate-900 border border-amber-500/50 rounded p-2 text-white focus:border-amber-500 outline-none"
                            placeholder="e.g. Hayden"
                            value={character.alias || ''}
                            onChange={e => updateInfo('alias', e.target.value)}
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            The AI will know that "<b>{character.alias || '...'}</b>" refers to this character sheet.
                        </p>
                    </div>
                </div>
            </div>

            {/* Proficiencies */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 border-b border-slate-700 pb-1">Proficiencies & Languages</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><span className="text-[10px] text-amber-500 font-bold block mb-1">ARMOR</span><div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">{character.proficiencies?.armor || "None"}</div></div>
                    <div><span className="text-[10px] text-amber-500 font-bold block mb-1">WEAPONS</span><div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">{character.proficiencies?.weapons || "None"}</div></div>
                    <div><span className="text-[10px] text-amber-500 font-bold block mb-1">TOOLS</span><div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">{character.proficiencies?.tools || "None"}</div></div>
                    <div><span className="text-[10px] text-amber-500 font-bold block mb-1">LANGUAGES</span><div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">{character.proficiencies?.languages || "Common"}</div></div>
                </div>
            </div>

            {/* Background Details */}
            <div className="bg-slate-800 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-bold text-white mb-2">Backstory</h4>
                <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-3 rounded border border-slate-700 h-48 custom-scroll focus:border-amber-500 outline-none" value={bio.backstory || ''} onChange={e => updateBio('backstory', e.target.value)} placeholder="Once upon a time..." />
            </div>
        </div>
    );
};

export default BioTab;