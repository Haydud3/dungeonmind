import React from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';

const BioTab = () => {
    const { character, updateInfo } = useCharacterStore();
    const bio = character?.bio || {};

    if (!character) return null;

    const updateBio = (field, val) => {
        const newBio = { ...bio, [field]: val };
        updateInfo('bio', newBio);
    };

    return (
        <div className="space-y-6 pb-24">
            {/* Player / AI Identity Link */}
            <div className="bg-indigo-950/20 border border-indigo-500/40 p-4 rounded-2xl backdrop-blur-md shadow-xl relative overflow-hidden">
                <div className="flex items-center gap-2 mb-3 border-b border-indigo-500/20 pb-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                    <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">AI Identity Link</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Character Name</label>
                        <input 
                            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs text-white font-bold opacity-75 cursor-not-allowed"
                            value={character.name || ''}
                            readOnly
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-amber-400 uppercase font-bold block mb-1">Player Name / In-Game Alias</label>
                        <input 
                            className="w-full bg-slate-950/70 border border-amber-500/40 rounded-xl p-2.5 text-xs text-white focus:border-amber-500 outline-none transition-colors"
                            placeholder="e.g. Hayden"
                            value={character.alias || ''}
                            onChange={e => updateInfo('alias', e.target.value)}
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            The Dungeon Master AI will recognize that "<b>{character.alias || '...'}</b>" commands this character.
                        </p>
                    </div>
                </div>
            </div>

            {/* Personality, Ideals, Bonds, Flaws Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg">
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Appearance</label>
                    <textarea 
                        className="w-full bg-slate-950/60 text-xs text-slate-200 p-2.5 rounded-xl h-24 resize-none outline-none focus:border-slate-500 border border-slate-800/80 leading-relaxed custom-scroll" 
                        value={bio.appearance || ''} 
                        onChange={e => updateBio('appearance', e.target.value)} 
                        placeholder="Height, weight, eyes, hair, distinctive scars..." 
                    />
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg">
                    <label className="text-[10px] text-amber-400 uppercase font-bold block mb-1">Personality Traits</label>
                    <textarea 
                        className="w-full bg-slate-950/60 text-xs text-slate-200 p-2.5 rounded-xl h-24 resize-none outline-none focus:border-amber-500 border border-slate-800/80 leading-relaxed custom-scroll" 
                        value={bio.traits || ''} 
                        onChange={e => updateBio('traits', e.target.value)} 
                        placeholder="Habits, mannerisms, outlook on danger..." 
                    />
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg">
                    <label className="text-[10px] text-cyan-400 uppercase font-bold block mb-1">Ideals</label>
                    <textarea 
                        className="w-full bg-slate-950/60 text-xs text-slate-200 p-2.5 rounded-xl h-24 resize-none outline-none focus:border-cyan-500 border border-slate-800/80 leading-relaxed custom-scroll" 
                        value={bio.ideals || ''} 
                        onChange={e => updateBio('ideals', e.target.value)} 
                        placeholder="Guiding principles, morals, goals..." 
                    />
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg">
                    <label className="text-[10px] text-emerald-400 uppercase font-bold block mb-1">Bonds</label>
                    <textarea 
                        className="w-full bg-slate-950/60 text-xs text-slate-200 p-2.5 rounded-xl h-24 resize-none outline-none focus:border-emerald-500 border border-slate-800/80 leading-relaxed custom-scroll" 
                        value={bio.bonds || ''} 
                        onChange={e => updateBio('bonds', e.target.value)} 
                        placeholder="Connections to people, places, or oaths..." 
                    />
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg md:col-span-2">
                    <label className="text-[10px] text-rose-400 uppercase font-bold block mb-1">Flaws & Vulnerabilities</label>
                    <textarea 
                        className="w-full bg-slate-950/60 text-xs text-slate-200 p-2.5 rounded-xl h-20 resize-none outline-none focus:border-rose-500 border border-slate-800/80 leading-relaxed custom-scroll" 
                        value={bio.flaws || ''} 
                        onChange={e => updateBio('flaws', e.target.value)} 
                        placeholder="Weaknesses, vices, fears, obsessions..." 
                    />
                </div>
            </div>

            {/* Combat Defenses HUD */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800/80 shadow-xl">
                <div className="flex items-center gap-2 mb-3 border-b border-slate-800/80 pb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Damage Defenses & Resistances</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block mb-1">Resistances</span>
                        <div className="text-xs text-slate-200 font-medium capitalize">
                            {character.defenses?.resistances || "None recorded"}
                        </div>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block mb-1">Immunities</span>
                        <div className="text-xs text-slate-200 font-medium capitalize">
                            {character.defenses?.immunities || "None recorded"}
                        </div>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block mb-1">Vulnerabilities</span>
                        <div className="text-xs text-slate-200 font-medium capitalize">
                            {character.defenses?.vulnerabilities || "None recorded"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Proficiencies & Languages */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800/80 shadow-xl">
                <div className="flex items-center gap-2 mb-3 border-b border-slate-800/80 pb-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Proficiencies & Languages</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1">Armor</span>
                        <div className="text-xs text-slate-200 font-medium">{character.proficiencies?.armor || "None"}</div>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1">Weapons</span>
                        <div className="text-xs text-slate-200 font-medium">{character.proficiencies?.weapons || "None"}</div>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1">Tools</span>
                        <div className="text-xs text-slate-200 font-medium">{character.proficiencies?.tools || "None"}</div>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1">Languages</span>
                        <div className="text-xs text-slate-200 font-medium">{character.proficiencies?.languages || "Common"}</div>
                    </div>
                </div>
            </div>

            {/* Backstory & Allies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Backstory & History</h4>
                    <textarea 
                        className="w-full bg-slate-950/60 text-xs text-slate-200 p-3 rounded-xl border border-slate-800/80 h-44 custom-scroll focus:border-amber-500 outline-none leading-relaxed" 
                        value={bio.backstory || ''} 
                        onChange={e => updateBio('backstory', e.target.value)} 
                        placeholder="Chronicles of origin, quests, and lineage..." 
                    />
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Allies, Factions & Notes</h4>
                    <textarea 
                        className="w-full bg-slate-950/60 text-xs text-slate-200 p-3 rounded-xl border border-slate-800/80 h-44 custom-scroll focus:border-indigo-500 outline-none leading-relaxed" 
                        value={bio.notes || ''} 
                        onChange={e => updateBio('notes', e.target.value)} 
                        placeholder="Guilds, patron deities, contacts, secret orders..." 
                    />
                </div>
            </div>
        </div>
    );
};

export default BioTab;