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
    return new Promise((resolve) => {
        const archImg = new Image();
        const illImg = new Image();
        let loaded = 0;
        
        const processPixels = () => {
            if (++loaded < 2) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = archImg.width;
            canvas.height = archImg.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            ctx.drawImage(archImg, 0, 0);
            const archData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            ctx.drawImage(illImg, 0, 0);
            const illData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            const walls = {};
            const lights = {};

            // Downsample scan resolution to avoid millions of 3D objects
            const stepX = Math.max(1, Math.floor(canvas.width / 150));
            const stepY = Math.max(1, Math.floor(canvas.height / 150));
            
            const aspect = canvas.width / canvas.height || 1;

            const get3DCoord = (px, py) => ({
                x: (px / canvas.width - 0.5) * (scale * aspect),
                y: 0,
                z: (py / canvas.height - 0.5) * scale
            });

            const getPixelType = (r, g, b) => {
                if (r > 150 && g < 100 && b < 100) return 'wall';
                if (r < 100 && g < 100 && b > 150) return 'door';
                if (r < 100 && g > 150 && b > 150) return 'window';
                return null;
            };

            const cols = Math.ceil(canvas.width / stepX);
            const rows = Math.ceil(canvas.height / stepY);
            const grid = Array(rows).fill(null).map(() => Array(cols).fill(null));

            for (let gy = 0; gy < rows; gy++) {
                for (let gx = 0; gx < cols; gx++) {
                    const x = Math.min(gx * stepX, canvas.width - 1);
                    const y = Math.min(gy * stepY, canvas.height - 1);
                    const i = (y * canvas.width + x) * 4;
                    grid[gy][gx] = getPixelType(archData[i], archData[i+1], archData[i+2]);
                }
            }

            let wallCounter = 0;
            const addSegment = (type, x1, y1, x2, y2) => {
                if (x1 === x2 && y1 === y2) return;
                const id = `${type}_gen_${wallCounter++}`;
                const px1 = Math.min(x1 * stepX, canvas.width);
                const py1 = Math.min(y1 * stepY, canvas.height);
                const px2 = Math.min(x2 * stepX, canvas.width);
                const py2 = Math.min(y2 * stepY, canvas.height);
                walls[id] = { id, type, points: [get3DCoord(px1, py1), get3DCoord(px2, py2)] };
                if (type === 'door' || type === 'window') walls[id].isOpen = false;
            };

            const getType = (x, y) => (x >= 0 && x < cols && y >= 0 && y < rows) ? grid[y][x] : null;
            const featureTypes = ['wall', 'door', 'window'];

            for (const t of featureTypes) {
                for (let gy = 0; gy <= rows; gy++) {
                    let startX = null;
                    let currentDir = null;
                    const commit = (x) => {
                        if (startX !== null) addSegment(t, startX, gy, x, gy);
                        startX = null;
                        currentDir = null;
                    };
                    for (let gx = 0; gx <= cols; gx++) {
                        const isTBelow = getType(gx, gy) === t;
                        const isTAbove = getType(gx, gy - 1) === t;
                        let edgeDir = null;
                        if (isTBelow && !isTAbove) edgeDir = 1;
                        else if (isTAbove && !isTBelow) edgeDir = -1;
                        if (edgeDir !== currentDir) {
                            commit(gx);
                            if (edgeDir) { startX = gx; currentDir = edgeDir; }
                        }
                    }
                    commit(cols);
                }
                for (let gx = 0; gx <= cols; gx++) {
                    let startY = null;
                    let currentDir = null;
                    const commit = (y) => {
                        if (startY !== null) addSegment(t, gx, startY, gx, y);
                        startY = null;
                        currentDir = null;
                    };
                    for (let gy = 0; gy <= rows; gy++) {
                        const isTRight = getType(gx, gy) === t;
                        const isTLeft = getType(gx - 1, gy) === t;
                        let edgeDir = null;
                        if (isTRight && !isTLeft) edgeDir = 1;
                        else if (isTLeft && !isTRight) edgeDir = -1;
                        if (edgeDir !== currentDir) {
                            commit(gy);
                            if (edgeDir) { startY = gy; currentDir = edgeDir; }
                        }
                    }
                    commit(rows);
                }
            }

            const gridW = Math.ceil(canvas.width / stepX);
            const gridH = Math.ceil(canvas.height / stepY);
            const isLight = new Array(gridW * gridH).fill(false);
            const visited = new Array(gridW * gridH).fill(false);

            for (let gy = 0; gy < gridH; gy++) {
                for (let gx = 0; gx < gridW; gx++) {
                    const x = Math.min(gx * stepX, canvas.width - 1);
                    const y = Math.min(gy * stepY, canvas.height - 1);
                    const i = (y * canvas.width + x) * 4;
                    if (illData[i] > 150 && illData[i+1] > 150 && illData[i+2] < 100) {
                        isLight[gy * gridW + gx] = true;
                    }
                }
            }

            let lightCounter = 0;
            for (let gy = 0; gy < gridH; gy++) {
                for (let gx = 0; gx < gridW; gx++) {
                    const idx = gy * gridW + gx;
                    if (isLight[idx] && !visited[idx]) {
                        const queue = [[gx, gy]];
                        visited[idx] = true;
                        let sumX = 0, sumY = 0, count = 0;
                        let minX = gx, maxX = gx, minY = gy, maxY = gy;
                        while (queue.length > 0) {
                            const [cx, cy] = queue.shift();
                            sumX += cx; sumY += cy; count++;
                            minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                            minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    if (dx === 0 && dy === 0) continue;
                                    const nx = cx + dx, ny = cy + dy;
                                    if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                                        const nIdx = ny * gridW + nx;
                                        if (isLight[nIdx] && !visited[nIdx]) {
                                            visited[nIdx] = true;
                                            queue.push([nx, ny]);
                                        }
                                    }
                                }
                            }
                        }
                        if (count > 2) {
                            const px = (sumX / count) * stepX;
                            const py = (sumY / count) * stepY;
                            const coord = get3DCoord(px, py);
                            const avgDiameterPx = ((maxX - minX) * stepX + (maxY - minY) * stepY) / 2;
                            const mapUnitsDiameter = avgDiameterPx / (canvas.height / scale);
                            const radiusFt = Math.max(10, Math.min(100, Math.round((mapUnitsDiameter / 2) * 5)));
                            const lightId = `light_gen_${lightCounter++}`;
                            lights[lightId] = { id: lightId, position: { x: coord.x, y: 1, z: coord.z }, color: '#fef08a', radius: radiusFt, intensity: 1.5 };
                        }
                    }
                }
            }
            resolve({ walls, lights: Object.values(lights) });
        };
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
Bottom-Left (Architect Mask): Pure Black background. Use THICK, SOLID, UN-ALIASED strokes for features: Pure Red (#FF0000) for impassable Walls. Pure Blue (#0000FF) for Doors. Pure Cyan (#00FFFF) for Windows. Do NOT use gradients or soft edges here!
Bottom-Right (Illumination): Pure Black background. Pure Yellow (#FFFF00) solid circles representing light source origins (e.g., torches, lanterns, campfires, glowing crystals).
Constraints: All 4 quadrants must be exactly the same size and perfectly aligned.`;

            const imgElement = await window.puter.ai.txt2img(imageGenPrompt);
            
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