import React, { useState } from 'react';
import Icon from './Icon';
import { uploadImage, imageElementToBlob, storeChunkedMap } from '../utils/storageUtils';
import { useToast } from './ToastProvider';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { createMap } from '../utils/mapService';

const splitImage = (image) => {
    const width = image.width / 2;
    const height = image.height / 2;
    const panelNames = ["Reference Map", "Heightmap (Grayscale)", "Architect Mask", "Illumination Data"];
    const panels = [];

    for (let i = 0; i < 4; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const x = (i % 2) * width;
        const y = Math.floor(i / 2) * height;
        ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
        panels.push({
            name: panelNames[i],
            dataUrl: canvas.toDataURL()
        });
    }
    return panels;
};

// The AI Ingestion Pixel Scanner
const scanFeatures = (architectUrl, illuminationUrl, scale = 20) => {
    return new Promise((resolve, reject) => {
        const archImg = new Image();
        const illImg = new Image();
        let loaded = 0;
        
        const processPixels = () => {
            if (++loaded < 2) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, archImg.width, illImg.width);
            canvas.height = Math.max(1, archImg.height, illImg.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            let archData = null;
            let illData = null;

            if (archImg.width > 0 && archImg.src !== "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7") {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(archImg, 0, 0, canvas.width, canvas.height);
                archData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            }

            if (illImg.width > 0 && illImg.src !== "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7") {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(illImg, 0, 0, canvas.width, canvas.height);
                illData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            }

            const aspect = canvas.width / canvas.height || 1;

            const worker = new Worker(new URL('./featureExtraction.worker.js', import.meta.url), { type: 'module' });
            
            worker.onmessage = (e) => {
                const { type, payload } = e.data;
                if (type === 'FEATURES_EXTRACTED') {
                    resolve(payload);
                    worker.terminate();
                }
            };

            worker.onerror = (err) => {
                console.error("Feature Extraction Worker error:", err);
                reject(err);
                worker.terminate();
            };

            worker.postMessage({
                type: 'EXTRACT_FEATURES',
                archData,
                illData,
                width: canvas.width,
                height: canvas.height,
                scale,
                aspect
            });
        };
        
        archImg.crossOrigin = "Anonymous";
        illImg.crossOrigin = "Anonymous";
        archImg.onload = processPixels; illImg.onload = processPixels;
        archImg.src = architectUrl; illImg.src = illuminationUrl;
    });
};

const WorldCreator = ({ role, aiHelper, apiKey }) => {
    const { campaign, updateCampaign, gameParams } = useNewCampaign();
    const data = campaign;
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
        const lorePrompt = `
        Role: Fantasy Cartographer.
        Task: Create a unique Region/Location for a D&D map.
        Theme: "${vibe}".
        Output: JSON ONLY.
        {
            "name": "Evocative Name",
            "type": "Region Type (e.g. Swamp, Spire, Ruin)",
            "desc": "2 sentence visual description."
        }`;

        const res = await aiHelper([{ role: 'user', content: lorePrompt }]);
        const json = JSON.parse(res.match(/\{[\s\S]*\}/)[0]);

        // 2. Generate Image (Puter)
        if (window.puter) {
            toast("Painting the master sheet...", "info");
            
            const imageGenPrompt = `A top-down battlemap of ${json.name}, which is a ${json.type}. ${json.desc}. System Role: You are the DungeonMind Architect Engine. Generate a single 2x2 grid image (Master Sheet) representing a tactical TTRPG battlemap. NO text or labels.
Top-Left: Detailed top-down reference map.
Top-Right: Grayscale topographical heightmap (White=high, Black=low).
Bottom-Left (Architect Mask): Pure Black background. Act as a VTT Line-of-Sight engine. This quadrant will be scanned by a script to extract 2D collision geometry for dynamic lighting and fog of war. Draw a minimalist neon-wireframe using thin, 1-pixel solid lines to represent vision-blocking boundaries. Pure Red (#FF0000) for vision-blocking walls/caves, Pure Blue (#0000FF) for doors, Pure Cyan (#00FFFF) for windows. CRITICAL 1: For thick walls, do NOT outline both edges; draw exactly ONE line down the center of the mass. CRITICAL 2: Ignore all low scatter terrain (tables, wagons, trees, props) that don't fully block tall vision.
Bottom-Right (Illumination): Pure Black background. This quadrant will be scanned by a script to place 3D point lights in the scene. Pure Yellow (#FFFF00) solid circles representing EXACTLY the origin points of light sources (torches, campfires, etc). Do not paint the ambient light, just the exact source emitter.
Constraints: All 4 quadrants must be exactly the same size and perfectly aligned.`;

            const imgElement = await window.puter.ai.txt2img(imageGenPrompt, { model: 'dall-e-3' });
            
            // 3. Process Master Sheet
            const panels = splitImage(imgElement);
            const mapPanel = panels.find(p => p.name === "Reference Map");
            const heightPanel = panels.find(p => p.name === "Heightmap (Grayscale)");
            const architectPanel = panels.find(p => p.name === "Architect Mask");
            const illuminationPanel = panels.find(p => p.name === "Illumination Data");

            const features = await scanFeatures(architectPanel.dataUrl, illuminationPanel.dataUrl);

            // 4. Upload assets
            const mapUrl = await storeChunkedMap(mapPanel.dataUrl, `maps/${Date.now()}_bg.jpg`);
            const heightmapUrl = await storeChunkedMap(heightPanel.dataUrl, `maps/${Date.now()}_hm.jpg`);
            
            // 5. Save to Cloud
            const newLoc = { 
                ...json, 
                id: Date.now(),
                mapUrl,
                heightmapUrl,
                features,
                image: mapUrl // Use the pretty map for the preview card
            };
            const newLocations = [...locations, newLoc];
            updateCampaign({ locations: newLocations });
            
            toast(`Discovered: ${json.name}`, "success");
            setVibe("");
        } else {
            toast("Puter.js integration not found.", "error");
        }

    } catch (e) {
        console.error(e);
        toast("Generation failed. The mists remain.", "error");
    }
    setGeneratingNode(null);
    };

    const deleteLocation = (id) => {
        if (confirm("Destroy this location?")) {
            updateCampaign({ locations: locations.filter(l => l.id !== id) });
        }
    };

    const sendToTable = async (loc) => {
        const campaignCode = gameParams?.code;
        if (!campaignCode) return toast("Error: No active campaign code found.", "error");

        if (!loc.mapUrl) { // Handle old, unprocessed locations
            updateCampaign({ 'campaign.activeMap.url': loc.image, 'campaign.location': loc.name });
            toast(`Projecting ${loc.name} to Table`, "success");
            return;
        }

        toast(`Projecting ${loc.name} to Table...`, "info");
        try {
            const newMapId = `map_${Date.now()}`;
            const newMapData = {
                name: loc.name, backgroundUrl: loc.mapUrl, heightmapUrl: loc.heightmapUrl,
                walls: loc.features?.walls || {}, lights: loc.features?.lights || {},
                gridSize: 1, scale: 20, environment: 'day', tokens: {},
                fowEnabled: false,
                fowWallsEnabled: true,
                hide3DTokenBases: true
            };
            await createMap(campaignCode, newMapId, newMapData);
            await updateCampaign({ activeMapId: newMapId });
            toast(`Projected ${loc.name} to Table`, "success");
        } catch (e) {
            console.error("Failed to project map:", e);
            toast("Failed to project map.", "error");
        }
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