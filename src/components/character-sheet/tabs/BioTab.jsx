import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import { storeChunkedMap } from '../../../utils/storageUtils';
import { Client } from "@gradio/client";
import Icon from '../../Icon';
import ModelViewer from '../../ModelViewer';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const BioTab = ({ onOpenModelPicker }) => {
    const { character, updateInfo } = useCharacterStore();
    const bio = character?.bio || {};
    const [isUploading, setIsUploading] = useState(false);
    const [modelScale, setModelScale] = useState(character?.modelScale || 1);
    const [modelYOffset, setModelYOffset] = useState(character?.modelYOffset || 0);

    const [isForging3D, setIsForging3D] = useState(false);
    const [forge3DStatus, setForge3DStatus] = useState("");

    if (!character) return null;

    const handleForge3D = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsForging3D(true);
            setForge3DStatus("The Forge is hot... Sculpting 3D mesh (this may take a minute).");
            
            const imageBlob = file;
            
            setForge3DStatus("Connecting to AI Forge... (May take 30-60s)");
            let app = null;
            const hfToken = import.meta.env.VITE_HF_TOKEN || localStorage.getItem('hf_token');
            const options = hfToken ? { hf_token: hfToken } : {};
            
            try {
                setForge3DStatus(`Waking up VAST-AI/TripoSG...`);
                app = await Client.connect("VAST-AI/TripoSG", options);
            } catch (e) {
                console.warn(`Space VAST-AI/TripoSG is asleep or unavailable.`, e);
            }

            if (!app) {
                throw new Error("The 3D Forge AI server is currently asleep or overloaded. Please try again later, or add a Hugging Face token in your Settings to wake it up!");
            }
            
            setForge3DStatus("Starting Forge Session...");
            try {
                await app.predict("/start_session", {});
            } catch (e) {
                console.warn("Failed to start session, may not be required", e);
            }
            
            setForge3DStatus("Sculpting 3D Mesh... Please wait. (1/2)");
            const meshResult = await app.predict("/image_to_3d", {
                image: imageBlob,
                seed: 0,
                num_inference_steps: 8,
                guidance_scale: 0,
                simplify: true,
                target_face_num: 10000
            });

            if (!meshResult.data || !meshResult.data[0]) {
                throw new Error("Invalid response from AI during 3D generation.");
            }

            setForge3DStatus("Texturing 3D Mesh... Please wait. (2/2)");
            const textureResult = await app.predict("/run_texture", {
                image: imageBlob,
                mesh_path: meshResult.data[0],
                seed: 0
            });

            if (!textureResult.data || !textureResult.data[0]) {
                throw new Error("Invalid response from AI during texturing.");
            }

            let glbUrl = "";
            const glbOutput = textureResult.data[0];
            if (typeof glbOutput === 'string') glbUrl = glbOutput;
            else if (glbOutput && glbOutput.url) glbUrl = glbOutput.url;
            else if (glbOutput && glbOutput.path) {
                glbUrl = `https://vast-ai-triposg.hf.space/file=${glbOutput.path}`;
            } else {
                 throw new Error("Invalid response from AI.");
            }

            setForge3DStatus("Downloading 3D Mesh...");
            const glbRes = await fetch(glbUrl);
            const glbBlob = await glbRes.blob();
            
            setForge3DStatus("Saving to DungeonMind...");
            const glbBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(glbBlob);
            });

            const newChunkedUrl = await storeChunkedMap(glbBase64, (character.name || "char") + "_mini.glb");
            
            updateInfo('modelUrl', newChunkedUrl);
            updateInfo('modelScale', 1);
            updateInfo('modelYOffset', 0);
            setModelScale(1);
            setModelYOffset(0);
            
            alert(`Successfully forged 3D mini for ${character.name}!`);
        } catch (err) {
            console.error(err);
            alert("3D Forge Failed: " + err.message);
        } finally {
            setIsForging3D(false);
            e.target.value = null;
        }
    };

    const updateBio = (field, val) => {
        const newBio = { ...bio, [field]: val };
        updateInfo('bio', newBio);
    };

    const handleModelUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const base64 = await fileToBase64(file);
            const chunkedId = await storeChunkedMap(base64, file.name);
            updateInfo('modelUrl', chunkedId);
        } catch (err) {
            console.error("Error uploading model:", err);
            alert("Model upload failed.");
        }
        setIsUploading(false);
    };

    const handleScaleChange = (e) => {
        const scale = parseFloat(e.target.value);
        setModelScale(scale);
        updateInfo('modelScale', scale);
    }

    const handleYOffsetChange = (e) => {
        const offset = parseFloat(e.target.value);
        setModelYOffset(offset);
        updateInfo('modelYOffset', offset);
    }

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
                <div className="flex flex-wrap items-center gap-2">
                    <input type="file" accept=".glb,.gltf" id="model-upload" className="hidden" onChange={handleModelUpload} disabled={isUploading} />
                    <label htmlFor="model-upload" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded cursor-pointer flex items-center gap-2">
                        {isUploading ? <Icon name="loader" className="animate-spin" /> : <Icon name="upload-cloud" />}
                        {isUploading ? 'Uploading...' : 'Upload .glb'}
                    </label>
                    {onOpenModelPicker && (
                        <button onClick={onOpenModelPicker} className="bg-slate-700 hover:bg-slate-600 text-amber-400 font-bold py-2 px-4 rounded cursor-pointer flex items-center gap-2">
                            <Icon name="search" />
                            Search Minis
                        </button>
                    )}
                    <input type="file" accept="image/*" id="forge-upload" className="hidden" onChange={handleForge3D} disabled={isForging3D} />
                    <label htmlFor="forge-upload" className={`bg-purple-900/50 hover:bg-purple-800 text-purple-400 hover:text-white border border-purple-500/30 font-bold py-2 px-4 rounded cursor-pointer flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] ${isForging3D ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Icon name={isForging3D ? "loader" : "sparkles"} className={isForging3D ? "animate-spin" : ""} />
                        {isForging3D ? "Forging..." : "Forge 3D Mini"}
                    </label>
                    <a href="https://huggingface.co/spaces/VAST-AI/TripoSG" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center p-2 text-purple-500 hover:text-purple-400 transition-colors" title="Powered by VAST-AI/TripoSG">
                        <Icon name="external-link" size={18} />
                    </a>
                </div>
                
                <div className="mt-3 bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                    <div className="flex items-start gap-2">
                        <Icon name="info" size={16} className="text-blue-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-slate-400">
                            <p className="font-bold text-slate-300 mb-1">How to forge a great 3D mini:</p>
                            <p>Upload a clear, front-facing image of your character. The AI will extrude it into a full 3D mesh. For best results, ensure the image features a <span className="text-amber-400">straight-on view with the desired pose</span>, like standard token art. {forge3DStatus && <span className="text-purple-400 font-bold ml-1">{forge3DStatus}</span>}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 mt-4">
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

                <div className="relative w-full h-64 bg-slate-900 rounded-lg mt-4">
                    {character.modelUrl ? (
                        <ModelViewer modelUrl={character.modelUrl} scale={modelScale} yOffset={modelYOffset} materialStyle={character.materialStyle} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <Icon name="swords" size={32} />
                            <p className="mt-2 text-sm">No model uploaded</p>
                        </div>
                    )}
                </div>
                {character.modelUrl && (
                    <div className="mt-2 grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400">Scale ({modelScale}x)</label>
                            <input
                                type="range"
                                min="0.001"
                                max="5"
                                step="0.001"
                                value={modelScale}
                                onChange={handleScaleChange}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400">Y-Offset ({modelYOffset})</label>
                            <input
                                type="range"
                                min="-10"
                                max="10"
                                step="0.1"
                                value={modelYOffset}
                                onChange={handleYOffsetChange}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-slate-400">Material Style</label>
                            <select 
                                value={character.materialStyle || 'silver'} 
                                onChange={e => updateInfo('materialStyle', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm outline-none focus:border-indigo-500 mt-1"
                            >
                                <option value="original">Original (None)</option>
                                <option value="silver">Cast Silver (Default)</option>
                                <option value="bronze">Cast Bronze (Metallic)</option>
                                <option value="marble">Polished Marble (Resin)</option>
                                <option value="stone">Carved Stone</option>
                            </select>
                        </div>
                    </div>
                )}
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

            {/* Defenses */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 border-b border-slate-700 pb-1">Resistances & Immunities</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><span className="text-[10px] text-green-500 font-bold block mb-1">RESISTANCES</span><div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem] capitalize">{character.defenses?.resistances || "None"}</div></div>
                    <div><span className="text-[10px] text-cyan-500 font-bold block mb-1">IMMUNITIES</span><div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem] capitalize">{character.defenses?.immunities || "None"}</div></div>
                    <div><span className="text-[10px] text-red-500 font-bold block mb-1">VULNERABILITIES</span><div className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded min-h-[2rem] capitalize">{character.defenses?.vulnerabilities || "None"}</div></div>
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

export default BioTab;