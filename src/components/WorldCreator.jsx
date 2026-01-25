import React, { useState } from 'react';
import Icon from './Icon';
import { uploadImage, imageElementToBlob } from '../utils/storageUtils';
import { useToast } from './ToastProvider';

const WorldCreator = ({ data, role, updateCloud, updateMapState, aiHelper, apiKey }) => {
    const [generatingNode, setGeneratingNode] = useState(null); // The index being generated
    const [vibe, setVibe] = useState('');
    const toast = useToast();

    const locations = data.locations || [];
    // Ensure we always have a grid of at least 6 slots, plus room to grow
    const gridSlots = Array(Math.max(locations.length + 1, 6)).fill(null).map((_, i) => locations[i] || null);

    const handleGenerate = async (index) => {
        if (!vibe.trim()) return toast("Enter a vibe or theme first!", "error");
        setGeneratingNode(index);
        toast("Dreaming up a new land...", "info");

        try {
            // 1. Generate Lore JSON
            const prompt = `
            Role: Fantasy Cartographer.
            Task: Create a unique Region/Location for a D&D map.
            Theme: "${vibe}".
            Output: JSON ONLY.
            {
                "name": "Evocative Name",
                "type": "Region Type (e.g. Swamp, Spire, Ruin)",
                "desc": "2 sentence visual description.",
                "visualPrompt": "Specific AI image prompt for a top-down fantasy map of this place, high detail, 8k."
            }`;

            const res = await aiHelper([{ role: 'user', content: prompt }]);
            const json = JSON.parse(res.match(/\{[\s\S]*\}/)[0]);

            // 2. Generate Image (Puter)
            let imageUrl = "https://via.placeholder.com/1024?text=Map+Gen+Failed";
            
            if (window.puter) {
                toast("Painting the map...", "info");
                const imgElement = await window.puter.ai.txt2img(json.visualPrompt);
                
                // 3. Upload to Storage (The Critical Fix)
                const blob = await imageElementToBlob(imgElement);
                const filename = `maps/${Date.now()}_${json.name.replace(/\s+/g, '_')}.jpg`;
                imageUrl = await uploadImage(blob, filename);
            }

            // 4. Save to Cloud
            const newLoc = { ...json, image: imageUrl, id: Date.now() };
            const newLocations = [...locations, newLoc];
            updateCloud({ ...data, locations: newLocations });
            
            toast(`Discovered: ${json.name}`, "success");
            setVibe("");

        } catch (e) {
            console.error(e);
            toast("Generation failed. The mists remain.", "error");
        }
        setGeneratingNode(null);
    };

    const deleteLocation = (id) => {
        if (confirm("Destroy this location?")) {
            updateCloud({ ...data, locations: locations.filter(l => l.id !== id) });
        }
    };

    const sendToTable = (loc) => {
        updateMapState('set_image', loc.image);
        updateCloud({ ...data, campaign: { ...data.campaign, location: loc.name } });
        toast(`Projecting ${loc.name} to Table`, "success");
    };

    return (
        <div className="h-full bg-slate-950 p-6 overflow-y-auto custom-scroll">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-end mb-8 border-b border-slate-800 pb-6">
                    <div>
                        <h2 className="text-4xl fantasy-font text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-purple-600 mb-2">The Atlas</h2>
                        <p className="text-slate-400">Select an empty node to forge a new realm.</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-1 flex gap-2">
                        <input 
                            value={vibe} 
                            onChange={e => setVibe(e.target.value)} 
                            placeholder="Describe the next region (e.g. 'Floating Crystal Isles')" 
                            className="bg-transparent text-white px-3 py-2 outline-none w-64 text-sm placeholder:text-slate-600"
                            onKeyDown={e => e.key === 'Enter' && !generatingNode && handleGenerate(locations.length)}
                        />
                        <button className="bg-slate-800 text-slate-500 hover:text-white px-3 rounded transition-colors"><Icon name="sparkles" size={16}/></button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {gridSlots.map((loc, i) => (
                        <div key={loc ? loc.id : `empty-${i}`} className={`relative aspect-square rounded-2xl transition-all duration-300 group ${loc ? 'bg-slate-900 border border-slate-700 hover:border-amber-500/50 hover:-translate-y-1 shadow-xl' : 'bg-slate-900/30 border-2 border-dashed border-slate-800 hover:border-slate-600 hover:bg-slate-800/50 cursor-pointer flex flex-col items-center justify-center'}`}>
                            
                            {/* EXISTING LOCATION CARD */}
                            {loc ? (
                                <>
                                    <img src={loc.image} className="absolute inset-0 w-full h-full object-cover rounded-2xl opacity-60 group-hover:opacity-100 transition-opacity" alt={loc.name} />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent rounded-2xl flex flex-col justify-end p-4">
                                        <h3 className="text-xl font-bold text-white leading-none shadow-black drop-shadow-md">{loc.name}</h3>
                                        <span className="text-xs text-amber-400 font-mono uppercase tracking-widest mb-2">{loc.type}</span>
                                        <p className="text-xs text-slate-300 line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity delay-100">{loc.desc}</p>
                                        
                                        {role === 'dm' && (
                                            <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-4 group-hover:translate-y-0">
                                                <button onClick={() => sendToTable(loc)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1 shadow-lg"><Icon name="map" size={12}/> Project</button>
                                                <button onClick={() => deleteLocation(loc.id)} className="bg-red-900/80 hover:bg-red-700 text-white p-2 rounded"><Icon name="trash-2" size={14}/></button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                /* EMPTY GENERATOR SLOT */
                                <div onClick={() => !generatingNode && handleGenerate(i)} className="w-full h-full flex flex-col items-center justify-center text-slate-600 group-hover:text-amber-500 transition-colors">
                                    {generatingNode === i ? (
                                        <>
                                            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                            <span className="text-xs font-bold animate-pulse text-amber-500">Forging...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Icon name="plus" size={48} className="mb-2 opacity-50 group-hover:scale-110 transition-transform"/>
                                            <span className="text-sm font-bold">Uncharted</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default WorldCreator;