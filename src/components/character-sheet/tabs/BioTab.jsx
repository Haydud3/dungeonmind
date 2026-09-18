import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import { storeChunkedMap } from '../../../utils/storageUtils';
import { Client } from "@gradio/client";
import Icon from '../../Icon';
import { useDialog } from '../../DialogProvider';
import ModelViewer from '../../ModelViewer';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const BioTab = ({ onOpenModelPicker }) => {
    const dialog = useDialog();
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
            
            dialog.alert(`Successfully forged 3D mini for ${character.name}!`);
        } catch (err) {
            console.error(err);
            dialog.alert("3D Forge Failed: " + err.message);
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
            dialog.alert("Model upload failed.");
        }
        setIsUploading(false);
    };

    const handleScaleChange = (e) => {
        const scale = parseFloat(e.target.value);
        setModelScale(scale);
        updateInfo('modelScale', scale);
    };

    const handleYOffsetChange = (e) => {
        const offset = parseFloat(e.target.value);
        setModelYOffset(offset);
        updateInfo('modelYOffset', offset);
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

            {/* 3D Token Model Studio */}
            <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">3D Miniature & Token</h4>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Interactive WebGL</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <input type="file" accept=".glb,.gltf" id="model-upload" className="hidden" onChange={handleModelUpload} disabled={isUploading} />
                    <label htmlFor="model-upload" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-2 px-3.5 rounded-xl text-xs cursor-pointer flex items-center gap-2 transition-all shadow-sm">
                        {isUploading ? <Icon name="loader" className="animate-spin" size={14} /> : <Icon name="upload-cloud" size={14} />}
                        <span>{isUploading ? 'Uploading...' : 'Upload .glb'}</span>
                    </label>

                    {onOpenModelPicker && (
                        <button 
                            type="button"
                            onClick={onOpenModelPicker} 
                            className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-bold py-2 px-3.5 rounded-xl text-xs cursor-pointer flex items-center gap-2 transition-all shadow-sm"
                        >
                            <Icon name="search" size={14} />
                            <span>Compendium Minis</span>
                        </button>
                    )}

                    <input type="file" accept="image/*" id="forge-upload" className="hidden" onChange={handleForge3D} disabled={isForging3D} />
                    <label htmlFor="forge-upload" className={`bg-purple-950/50 hover:bg-purple-900/60 text-purple-300 hover:text-white border border-purple-500/40 font-bold py-2 px-3.5 rounded-xl text-xs cursor-pointer flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] ${isForging3D ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Icon name={isForging3D ? "loader" : "sparkles"} size={14} className={isForging3D ? "animate-spin" : ""} />
                        <span>{isForging3D ? "Forging..." : "Forge 3D Mini"}</span>
                    </label>
                    <a href="https://huggingface.co/spaces/VAST-AI/TripoSG" target="_blank" rel="noopener noreferrer" className="p-2 text-purple-400 hover:text-purple-300 transition-colors" title="Powered by TripoSG">
                        <Icon name="external-link" size={16} />
                    </a>
                </div>
                
                {forge3DStatus && (
                    <div className="mt-3 bg-purple-950/30 rounded-xl p-3 border border-purple-500/30 text-xs text-purple-300">
                        {forge3DStatus}
                    </div>
                )}

                <div className="relative w-full h-64 bg-slate-950 rounded-xl mt-4 border border-slate-800 overflow-hidden">
                    {character.modelUrl ? (
                        <ModelViewer modelUrl={character.modelUrl} scale={modelScale} yOffset={modelYOffset} materialStyle={character.materialStyle} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <Icon name="swords" size={32} className="text-slate-600 mb-2" />
                            <p className="text-xs">No 3D miniature loaded</p>
                        </div>
                    )}
                </div>

                {character.modelUrl && (
                    <div className="mt-3 grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                                <span>Scale</span>
                                <span className="font-mono text-amber-400">{modelScale}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.001"
                                max="5"
                                step="0.001"
                                value={modelScale}
                                onChange={handleScaleChange}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                                <span>Y-Offset</span>
                                <span className="font-mono text-amber-400">{modelYOffset}</span>
                            </div>
                            <input
                                type="range"
                                min="-10"
                                max="10"
                                step="0.1"
                                value={modelYOffset}
                                onChange={handleYOffsetChange}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Mini Material Style</label>
                            <select 
                                value={character.materialStyle || 'silver'} 
                                onChange={e => updateInfo('materialStyle', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white text-xs outline-none focus:border-amber-500"
                            >
                                <option value="original">Original Textures</option>
                                <option value="silver">Cast Silver (Command Metal)</option>
                                <option value="bronze">Cast Bronze (Warm Antique)</option>
                                <option value="marble">Polished Marble (Pristine Resin)</option>
                                <option value="stone">Carved Stone (Dungeon Relic)</option>
                            </select>
                        </div>
                    </div>
                )}
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