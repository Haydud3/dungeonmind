import React, { useState } from 'react';
import Icon from './Icon';

const WorldCreator = ({ data, setData, role, updateCloud, updateMapState, aiHelper, apiKey }) => {
    const [genName, setGenName] = useState('');
    const [genType, setGenType] = useState('Town');
    const [genTheme, setGenTheme] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Manual Image Swap State
    const [editingLocId, setEditingLocId] = useState(null);
    const [imgSearchQuery, setImgSearchQuery] = useState("");
    const [imgResults, setImgResults] = useState([]);

    const locations = data.locations || [];

    // --- HELPER: Convert Puter Image to Base64 for Saving ---
    const processPuterImage = async (imgElement) => {
        try {
            // Fetch the blob from the img element's src
            const response = await fetch(imgElement.src);
            const blob = await response.blob();
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to process Puter image:", e);
            return null;
        }
    };

    // --- 1. THE GENERATOR ---
    const handleGenerate = async () => {
        if (!aiHelper) return alert("AI not ready");
        setIsGenerating(true);

        // 1. Generate Lore & Data (JSON)
        const prompt = `
        Role: D&D World Builder.
        Task: Create a distinct, playable ${genType}.
        ${genName ? `Specific Name: "${genName}"` : 'Name: Create a unique fantasy name.'}
        Theme/Vibe: "${genTheme}".
        
        Output: JSON ONLY. Structure:
        {
            "name": "${genName || "Generated Name"}",
            "type": "${genType}",
            "desc": "Short evocative description (max 2 sentences).",
            "visualPrompt": "Detailed prompt for an AI image generator to create a top-down TTRPG battlemap of this specific location. Include lighting, mood, and environment details.",
            "pois": [ "Name of Tavern", "Name of Shrine", "Name of Secret" ],
            "npcs": [ 
                { "name": "Name", "race": "Race", "role": "Role", "quirk": "Short quirk" }
            ]
        }
        `;

        try {
            const res = await aiHelper([{ role: 'user', content: prompt }]);
            const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
            
            // 2. Generate Map Image (USING PUTER.JS)
            let imageUrl = "";
            if (window.puter) {
                const imagePrompt = `top down tabletop rpg battlemap, 2d, flat, ${json.visualPrompt}, high fantasy, detailed, 8k resolution, neutral lighting`;
                // Puter returns an <img> element
                const imgElement = await window.puter.ai.txt2img(imagePrompt);
                // Convert to Base64 so we can save it to Firebase/LocalStorage
                imageUrl = await processPuterImage(imgElement);
            } else {
                console.warn("Puter.js not found for image generation");
            }

            const newLoc = { 
                ...json, 
                image: imageUrl || "https://via.placeholder.com/1024?text=Map+Generation+Failed", 
                id: Date.now() 
            };
            
            updateCloud({ ...data, locations: [newLoc, ...locations] }); 
            
        } catch (e) {
            console.error(e);
            alert("The winds of magic failed to conjure this place. Try again.");
        }
        setIsGenerating(false);
    };

    // --- 2. INTEGRATION ACTIONS ---
    const sendToMap = (loc) => {
        if (!loc.image) return alert("No image to project!");
        if (confirm(`Overwrite current map with ${loc.name}?`)) {
            updateMapState('set_image', loc.image);
            updateCloud({ ...data, campaign: { ...data.campaign, location: loc.name } });
        }
    };

    const spawnNpcs = (loc) => {
        if (!loc.npcs || loc.npcs.length === 0) return alert("No residents found here.");
        const newNpcs = loc.npcs.map(n => ({
            id: Date.now() + Math.random(),
            name: n.name,
            race: n.race,
            class: n.role, 
            quirk: n.quirk,
            isHidden: true,
            bio: { backstory: `Resident of ${loc.name}.` }
        }));
        
        const currentNpcs = data.npcs || [];
        updateCloud({ ...data, npcs: [...currentNpcs, ...newNpcs] });
        alert(`Summoned ${newNpcs.length} NPCs to the Registry!`);
    };

    const travelHere = (loc) => {
        updateCloud({ ...data, campaign: { ...data.campaign, location: loc.name } });
    };

    const deleteLocation = (id) => {
        if (confirm("Burn this location from the archives?")) {
            updateCloud({ ...data, locations: locations.filter(l => l.id !== id) });
        }
    };

    // Regenerate Image Only (Using Puter.js)
    const regenerateImage = async (loc) => {
        if (!window.puter) return alert("Puter AI not available");
        
        // Optimistic UI update or loading state could go here
        const imagePrompt = `top down tabletop rpg battlemap, 2d, flat, ${loc.visualPrompt || loc.type}, high fantasy, detailed`;
        
        try {
            const imgElement = await window.puter.ai.txt2img(imagePrompt);
            const newUrl = await processPuterImage(imgElement);
            
            if (newUrl) {
                const newLocs = locations.map(l => l.id === loc.id ? { ...l, image: newUrl } : l);
                updateCloud({ ...data, locations: newLocs });
            } else {
                alert("Failed to process new image.");
            }
        } catch(e) {
            console.error(e);
            alert("Regeneration failed.");
        }
    };

    // Keep Google Search for Manual Swaps (Fallback)
    const searchImages = async (query) => {
        const key = apiKey; 
        if (!key) return alert("Google API Key required for manual search.");
        const GOOGLE_SEARCH_CX = "c38cb56920a4f45df"; 
        
        try {
            const r = await fetch(`https://customsearch.googleapis.com/customsearch/v1?key=${key}&cx=${GOOGLE_SEARCH_CX}&q=${query}&searchType=image&num=6&imgSize=large`);
            const j = await r.json();
            if(j.items) setImgResults(j.items.map(i => i.link));
        } catch(e) { console.error(e); }
    };

    return (
        <div className="h-full bg-slate-900 p-6 overflow-y-auto custom-scroll">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                
                {/* GENERATOR PANEL */}
                <div className="w-full lg:w-1/3 space-y-6">
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl sticky top-0">
                        <h2 className="text-3xl fantasy-font text-amber-500 mb-2">The Atlas</h2>
                        <p className="text-sm text-slate-400 mb-6">Forge new lands using Generative Magic.</p>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs uppercase text-slate-500 font-bold block mb-1">Name (Optional)</label>
                                <input 
                                    value={genName} 
                                    onChange={e => setGenName(e.target.value)} 
                                    placeholder="e.g. Phandalin (Leave empty for random)" 
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-indigo-500 outline-none placeholder:text-slate-600"
                                />
                            </div>

                            <div>
                                <label className="text-xs uppercase text-slate-500 font-bold block mb-1">Location Type</label>
                                <select value={genType} onChange={e => setGenType(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-indigo-500 outline-none">
                                    <option>Town</option>
                                    <option>Dungeon</option>
                                    <option>Tavern</option>
                                    <option>Forest Clearing</option>
                                    <option>City District</option>
                                    <option>Ruins</option>
                                    <option>Cave System</option>
                                    <option>Island</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="text-xs uppercase text-slate-500 font-bold block mb-1">Vibe / Theme</label>
                                <textarea 
                                    value={genTheme} 
                                    onChange={e => setGenTheme(e.target.value)} 
                                    placeholder="e.g. A bustling market built on the back of a giant turtle... OR ...Dark, spider-infested tunnels." 
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white h-28 resize-none focus:border-indigo-500 outline-none"
                                />
                            </div>
                            
                            <button 
                                onClick={handleGenerate} 
                                disabled={isGenerating} 
                                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isGenerating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Icon name="sparkles" size={20}/>}
                                <span>{isGenerating ? 'Forging World...' : 'Generate Location'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* LOCATIONS GRID */}
                <div className="flex-1 grid grid-cols-1 gap-6">
                    {locations.map(loc => (
                        <div key={loc.id} className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col md:flex-row group">
                            
                            {/* IMAGE SECTION */}
                            <div className="w-full md:w-72 h-64 md:h-auto relative bg-black shrink-0 group/img">
                                {loc.image ? (
                                    <img src={loc.image} className="w-full h-full object-cover transition-opacity duration-500" alt={loc.name} onError={(e) => e.target.src = "https://via.placeholder.com/500x500?text=Map+Error"}/>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-600"><Icon name="image" size={48}/></div>
                                )}
                                
                                {/* Image Overlay Controls */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4 text-center">
                                    <span className="text-xs text-slate-300 font-bold uppercase tracking-wider mb-2">AI Battlemap</span>
                                    <button onClick={() => regenerateImage(loc)} className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-500 flex items-center gap-1">
                                        <Icon name="refresh-cw" size={12}/> Regenerate Art
                                    </button>
                                </div>
                            </div>

                            {/* CONTENT SECTION */}
                            <div className="p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="text-2xl font-bold text-white leading-none mb-1">{loc.name}</h3>
                                        <span className="text-xs font-mono text-amber-500 uppercase tracking-widest">{loc.type}</span>
                                    </div>
                                    {role === 'dm' && <button onClick={() => deleteLocation(loc.id)} className="text-slate-600 hover:text-red-500 transition-colors"><Icon name="trash-2" size={18}/></button>}
                                </div>
                                
                                <p className="text-slate-300 text-sm mb-4 line-clamp-3 italic">"{loc.desc}"</p>

                                {/* POIS & NPCS */}
                                <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                        <strong className="text-slate-500 block mb-1 uppercase tracking-wider">Points of Interest</strong>
                                        <ul className="list-disc list-inside text-slate-300 space-y-1">
                                            {loc.pois?.slice(0,3).map((p,i) => <li key={i} className="truncate">{p}</li>)}
                                        </ul>
                                    </div>
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                        <strong className="text-slate-500 block mb-1 uppercase tracking-wider">Inhabitants</strong>
                                        <ul className="list-disc list-inside text-slate-300 space-y-1">
                                            {loc.npcs?.slice(0,3).map((n,i) => <li key={i} className="truncate">{n.name} <span className="text-slate-500">({n.role})</span></li>)}
                                        </ul>
                                    </div>
                                </div>

                                {/* DM ACTIONS */}
                                {role === 'dm' && (
                                    <div className="mt-auto flex gap-2 pt-4 border-t border-slate-700/50">
                                        <button onClick={() => sendToMap(loc)} className="flex-1 bg-green-900/40 hover:bg-green-800 text-green-300 px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-green-800/50 hover:border-green-500">
                                            <Icon name="map" size={14}/> Send to Table
                                        </button>
                                        <button onClick={() => spawnNpcs(loc)} className="flex-1 bg-purple-900/40 hover:bg-purple-800 text-purple-300 px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-purple-800/50 hover:border-purple-500">
                                            <Icon name="users" size={14}/> Spawn NPCs
                                        </button>
                                        <button onClick={() => travelHere(loc)} className="flex-1 bg-amber-900/40 hover:bg-amber-800 text-amber-300 px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-amber-800/50 hover:border-amber-500">
                                            <Icon name="navigation" size={14}/> Set Location
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* IMAGE SEARCH MODAL (Inline) */}
                            {editingLocId === loc.id && (
                                <div className="absolute inset-0 bg-slate-900 z-20 p-4 flex flex-col animate-in fade-in">
                                    <div className="flex gap-2 mb-2">
                                        <input value={imgSearchQuery} onChange={e => setImgSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchImages(imgSearchQuery)} className="flex-1 bg-black border border-slate-700 rounded px-2 text-sm text-white" placeholder="Search visuals..."/>
                                        <button onClick={() => searchImages(imgSearchQuery)} className="bg-indigo-600 px-3 rounded text-white"><Icon name="search" size={14}/></button>
                                        <button onClick={() => setEditingLocId(null)} className="text-slate-400 hover:text-white"><Icon name="x" size={18}/></button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2">
                                        {imgResults.map(url => (
                                            <img key={url} src={url} onClick={() => { /* Implement if manual swap needed */ }} className="w-full h-24 object-cover rounded cursor-pointer hover:border-2 hover:border-green-500"/>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {locations.length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/50">
                            <Icon name="globe" size={64} className="mx-auto text-slate-600 mb-4 opacity-50"/>
                            <h3 className="text-xl text-slate-400 font-bold">The Atlas is Empty</h3>
                            <p className="text-slate-500 mt-2">Use the magic above to forge the first landmark.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorldCreator;