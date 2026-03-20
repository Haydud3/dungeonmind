import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import { uploadFile } from '../../../utils/storageUtils';
import Icon from '../../Icon';

const BioTab = () => {
    const { character, updateInfo } = useCharacterStore();
    const bio = character.bio || {};
    const [isUploading, setIsUploading] = useState(false);

    const updateBio = (field, val) => {
        const newBio = { ...bio, [field]: val };
        updateInfo('bio', newBio);
    };

    const handleModelUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        const path = `models/${character.id}/${file.name}`;
        try {
            const url = await uploadFile(file, path);
            updateInfo('modelUrl', url);
        } catch (err) {
            console.error("Error uploading model:", err);
            alert("Model upload failed.");
        }
        setIsUploading(false);
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

            {/* 3D Model Upload */}
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <h4 className="text-sm font-bold text-slate-400 uppercase mb-3 border-b border-slate-700 pb-1">3D Token Model</h4>
                <div className="flex items-center gap-4">
                    <input type="file" accept=".glb" id="model-upload" className="hidden" onChange={handleModelUpload} disabled={isUploading} />
                    <label htmlFor="model-upload" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded cursor-pointer flex items-center gap-2">
                        {isUploading ? <Icon name="loader" className="animate-spin" /> : <Icon name="upload-cloud" />}
                        {isUploading ? 'Uploading...' : 'Upload .glb'}
                    </label>
                    <div className="text-xs text-slate-400 flex-1">
                        {character.modelUrl ? (
                            <div className="flex items-center justify-between">
                                <span className="truncate">{(character.modelUrl.split('/').pop().split('?')[0] || 'model.glb').replace(/%2F/g, '/').split('/').pop()}</span>
                                <button onClick={() => updateInfo('modelUrl', null)} className="text-red-500 hover:text-red-400 ml-2">
                                    <Icon name="x" />
                                </button>
                            </div>
                        ) : (
                            <span>No custom model uploaded.</span>
                        )}
                    </div>
                </div>
            </div>

            {/* NEW: Appearance & Personality Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-800 p-4 rounded border border-slate-700">
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Appearance</label>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded h-24 resize-none outline-none focus:border-indigo-500 border border-transparent" value={bio.appearance || ''} onChange={e => updateBio('appearance', e.target.value)} placeholder="Height, weight, hair..." />
                </div>
                <div className="bg-slate-800 p-4 rounded border border-slate-700">
                    <label className="text-[10px] text-amber-500 uppercase font-bold block mb-1">Traits</label>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded h-24 resize-none outline-none focus:border-amber-500 border border-transparent" value={bio.traits || ''} onChange={e => updateBio('traits', e.target.value)} placeholder="Personality traits..." />
                </div>
                <div className="bg-slate-800 p-4 rounded border border-slate-700">
                    <label className="text-[10px] text-cyan-500 uppercase font-bold block mb-1">Ideals</label>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded h-24 resize-none outline-none focus:border-cyan-500 border border-transparent" value={bio.ideals || ''} onChange={e => updateBio('ideals', e.target.value)} placeholder="Beliefs..." />
                </div>
                <div className="bg-slate-800 p-4 rounded border border-slate-700">
                    <label className="text-[10px] text-green-500 uppercase font-bold block mb-1">Bonds</label>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded h-24 resize-none outline-none focus:border-green-500 border border-transparent" value={bio.bonds || ''} onChange={e => updateBio('bonds', e.target.value)} placeholder="Connections..." />
                </div>
                <div className="bg-slate-800 p-4 rounded border border-slate-700 md:col-span-2">
                    <label className="text-[10px] text-red-500 uppercase font-bold block mb-1">Flaws</label>
                    <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-2 rounded h-16 resize-none outline-none focus:border-red-500 border border-transparent" value={bio.flaws || ''} onChange={e => updateBio('flaws', e.target.value)} placeholder="Weaknesses..." />
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

            {/* NEW: Allies & Notes */}
            <div className="bg-slate-800 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-bold text-slate-400 mb-2">Allies & Organizations</h4>
                <textarea className="w-full bg-slate-900/50 text-sm text-slate-300 p-3 rounded border border-slate-700 h-32 custom-scroll focus:border-indigo-500 outline-none" value={bio.notes || ''} onChange={e => updateBio('notes', e.target.value)} placeholder="Factions, contacts, notes..." />
            </div>
        </div>
    );
};