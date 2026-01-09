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
            
            {/* --- NEW: PROFICIENCIES & LANGUAGES --- */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 border-b border-slate-700 pb-1">Proficiencies & Languages</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span className="text-[10px] text-amber-500 font-bold block mb-1">ARMOR</span>
                        <div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">
                            {character.proficiencies?.armor || "None"}
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-amber-500 font-bold block mb-1">WEAPONS</span>
                        <div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">
                            {character.proficiencies?.weapons || "None"}
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-amber-500 font-bold block mb-1">TOOLS</span>
                        <div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">
                            {character.proficiencies?.tools || "None"}
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-amber-500 font-bold block mb-1">LANGUAGES</span>
                        <div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem]">
                            {character.proficiencies?.languages || "Common"}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- EXISTING BIO FIELDS --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Personality Traits</h4>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none" value={bio.traits || ''} onChange={e => updateBio('traits', e.target.value)} />
                </div>
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Ideals</h4>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none" value={bio.ideals || ''} onChange={e => updateBio('ideals', e.target.value)} />
                </div>
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Bonds</h4>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none" value={bio.bonds || ''} onChange={e => updateBio('bonds', e.target.value)} />
                </div>
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Flaws</h4>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded border border-slate-700 h-24 resize-none focus:border-amber-500 outline-none" value={bio.flaws || ''} onChange={e => updateBio('flaws', e.target.value)} />
                </div>
            </div>

            <div className="bg-slate-800 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-bold text-white mb-2">Backstory</h4>
                <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-3 rounded border border-slate-700 h-48 custom-scroll focus:border-amber-500 outline-none" value={bio.backstory || ''} onChange={e => updateBio('backstory', e.target.value)} placeholder="Once upon a time..." />
            </div>
        </div>
    );
};

export default BioTab;