import React, { useState, Suspense, lazy } from 'react';
import Icon from './Icon';
import { uploadImage, imageElementToBlob, storeChunkedMap } from '../utils/storageUtils';
import { useToast } from './ToastProvider';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { createMap } from '../utils/mapService';
import { fulfillMapData } from '../utils/moduleFulfillment';
import { useResolvedUrl } from '../utils/useResolvedUrl';

const AssetManager = lazy(() => import('./AssetManager'));

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

const ResolvedMapImage = ({ url, name, className }) => {
    const resolvedUrl = useResolvedUrl(url);
    if (!resolvedUrl && url && url.startsWith('chunked:')) {
        return <div className={`flex items-center justify-center bg-slate-800 absolute inset-0 w-full h-full`}><Icon name="loader" className="animate-spin text-slate-600" size={32} /></div>;
    }
    if (resolvedUrl || url) {
        return <img src={resolvedUrl || url} className={className} alt={name} />;
    }
    return <div className={`flex items-center justify-center bg-slate-800 text-slate-600 absolute inset-0 w-full h-full`}><Icon name="map" size={48} /></div>;
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

const WorldCreator = ({ role, aiHelper, apiKey, generateNpc }) => {
    const { campaign, updateCampaign, gameParams } = useNewCampaign();
    const data = campaign;
    const [generatingNode, setGeneratingNode] = useState(null); // The index being generated
    const [vibe, setVibe] = useState('');
    const [showAssetManager, setShowAssetManager] = useState(false);
    const [importTarget, setImportTarget] = useState(null);
    const toast = useToast();

    const localAiHelper = async (messages) => {
        if (typeof aiHelper === 'function') {
            const res = await aiHelper(messages);
            let extracted = res;
            if (typeof res === 'string') return res;
            if (res?.message?.content) extracted = res.message.content;
            else if (typeof res?.response?.text === 'function') extracted = await res.response.text();
            else if (typeof res?.text === 'function') extracted = await res.text();
            else if (res?.text) extracted = res.text;
            return typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
        }
        
        try {
            if (window.puter?.ai?.chat) {
                const promptString = Array.isArray(messages) ? messages.map(m => m.content).join('\n') : messages;
                const response = await window.puter.ai.chat(promptString);
                let extracted = response;
                if (typeof response === 'string') return response;
                if (response?.message?.content) extracted = response.message.content;
                else if (typeof response?.response?.text === 'function') extracted = await response.response.text();
                else if (typeof response?.text === 'function') extracted = await response.text();
                else if (response?.text) extracted = response.text;
                return typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
            }
        } catch (e) {
            console.error("Fallback AI failed", e);
        }
        
        toast("AI functions are not available in this view.", "warning");
        return null;
    };

    const localGenerateNpc = async (monsterName, instruction) => {
        if (!monsterName || monsterName.toLowerCase() === 'unknown') return null;
        if (typeof generateNpc === 'function') return generateNpc(monsterName, instruction);
        
        toast(`Searching 5e Archives for: ${monsterName}...`, "info");
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/monsters?name=${encodeURIComponent(monsterName)}`);
            const data = await res.json();
            if (data.count > 0) {
                const match = data.results.find(r => r?.name?.toLowerCase() === monsterName?.toLowerCase()) || data.results[0];
                const detailRes = await fetch(`https://www.dnd5eapi.co${match.url}`);
                const m = await detailRes.json();
                
                const acVal = Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class;
                const speedStr = typeof m.speed === 'object' ? Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;

                const getMod = (score) => Math.floor((score - 10) / 2);
                const modifiers = {
                    str: getMod(m.strength), dex: getMod(m.dexterity), con: getMod(m.constitution),
                    int: getMod(m.intelligence), wis: getMod(m.wisdom), cha: getMod(m.charisma)
                };

                const mapAction = (a, type) => {
                    let dmgString = (a.damage || []).map(d => `${d.damage_dice || ''} ${d.damage_type?.name || ''}`).join(' + ').trim();
                    let hitString = a.attack_bonus ? `+${a.attack_bonus}` : "";
                    let dcString = a.dc ? `DC ${a.dc.dc_value} ${a.dc.dc_type?.name || ''}` : "";
                    return {
                        name: a.name + (a.usage ? ` (${a.usage.type} ${a.usage.times || a.usage.dice || ''})` : ""),
                        desc: a.desc || "",
                        type: type,
                        category: "Attack",
                        hit: hitString || dcString,
                        dmg: dmgString
                    };
                };

                const npc = {
                    id: Date.now(),
                    isHidden: true,
                    name: m.name,
                    race: `${m.size} ${m.type} (${m.alignment})`,
                    class: "Monster",
                    level: m.challenge_rating,
                    hp: { current: m.hit_points, max: m.hit_points },
                    ac: acVal,
                    speed: speedStr,
                    stats: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
                    modifiers: modifiers,
                    image: m.image ? `https://www.dnd5eapi.co${m.image}` : null,
                    quirk: "SRD Import",
                    bio: { backstory: `Imported from D&D 5e API.\nXP: ${m.xp}`, appearance: `A ${m.size} ${m.type}.` },
                    customActions: [
                        ...(m.actions || []).map(a => mapAction(a, 'Action')),
                        ...(m.legendary_actions || []).map(a => mapAction(a, 'Legendary Action')),
                        ...(m.reactions || []).map(a => mapAction(a, 'Reaction'))
                    ],
                    features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" }))
                };
                
                if (!npc.image) {
                    const imagePrompt = `Dungeons and dragons official digital character illustration of a ${npc.name} ${npc.race || ''}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
                    let imageUrl = null;
                    if (window.puter?.ai?.txt2img) {
                        try {
                            const imgEl = await window.puter.ai.txt2img(imagePrompt, { provider: 'replicate-image-generation', model: 'black-forest-labs/flux-schnell', ratio: { w: 1, h: 1 } });
                            const response = await fetch(imgEl.src);
                            const blob = await response.blob();
                            imageUrl = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(blob);
                            });
                        } catch (e) {
                            console.error("Puter image gen failed", e);
                        }
                    }
                    npc.image = imageUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
                }
                return npc;
            }
        } catch (e) {
            console.error("5e API error", e);
        }
        
        toast(`Forging missing monster: ${monsterName} with AI...`, "info");
        const prompt = `Role: Fantasy bestiary writer. Task: Create a D&D 5e statblock for "${monsterName}". ${instruction || ''}\nOutput ONLY valid JSON.\n{\n  "name": "${monsterName}",\n  "race": "Medium Humanoid (Any Alignment)",\n  "class": "Monster",\n  "stats": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },\n  "hp": { "current": 15, "max": 15 },\n  "ac": 12,\n  "speed": "30 ft.",\n  "bio": { "appearance": "...", "backstory": "..." },\n  "customActions": [{ "name": "Shortsword", "desc": "Melee Weapon Attack", "type": "Action", "hit": "+4", "dmg": "1d6+2" }]\n}`;
        try {
            const res = await localAiHelper([{ role: 'user', content: prompt }]);
            if (!res) return null;
            const match = res.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(match[0]);
            
            const imagePrompt = `Dungeons and dragons official digital character illustration of a ${parsed.name} ${parsed.race || ''}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
            let imageUrl = null;
            if (window.puter?.ai?.txt2img) {
                try {
                    const imgEl = await window.puter.ai.txt2img(imagePrompt, { provider: 'replicate-image-generation', model: 'black-forest-labs/flux-schnell', ratio: { w: 1, h: 1 } });
                    const response = await fetch(imgEl.src);
                    const blob = await response.blob();
                    imageUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.error("Puter image gen failed", e);
                }
            }
            parsed.image = imageUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
            
            return parsed;
        } catch (e) {
            console.error("AI Generation failed", e);
        }
        return null;
    };

    const locations = data.locations || [];
    const skeleton = data?.moduleSkeleton || data?.campaign?.moduleSkeleton;
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

        const res = await localAiHelper([{ role: 'user', content: lorePrompt }]);
        const json = JSON.parse(res.match(/\{[\s\S]*\}/)[0]);

        // 2. Generate Image (Pollinations)
        toast("Painting the master sheet...", "info");
        
        const imageGenPrompt = `A top-down battlemap of ${json.name}, which is a ${json.type}. ${json.desc}. System Role: You are the DungeonMind Architect Engine. Generate a single 2x2 grid image (Master Sheet) representing a tactical TTRPG battlemap. NO text or labels.
Top-Left: Detailed top-down reference map.
Top-Right: Grayscale topographical heightmap (White=high, Black=low).
Bottom-Left (Architect Mask): Pure Black background. Act as a VTT Line-of-Sight engine. This quadrant will be scanned by a script to extract 2D collision geometry for dynamic lighting and fog of war. Draw a minimalist neon-wireframe using thin, 1-pixel solid lines to represent vision-blocking boundaries. Pure Red (#FF0000) for vision-blocking walls/caves, Pure Blue (#0000FF) for doors, Pure Cyan (#00FFFF) for windows. CRITICAL 1: For thick walls, do NOT outline both edges; draw exactly ONE line down the center of the mass. CRITICAL 2: Ignore all low scatter terrain (tables, wagons, trees, props) that don't fully block tall vision.
Bottom-Right (Illumination): Pure Black background. This quadrant will be scanned by a script to place 3D point lights in the scene. Pure Yellow (#FFFF00) solid circles representing EXACTLY the origin points of light sources (torches, campfires, etc). Do not paint the ambient light, just the exact source emitter.
Constraints: All 4 quadrants must be exactly the same size and perfectly aligned.`;

        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imageGenPrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
        const imgElement = new Image();
        imgElement.crossOrigin = "Anonymous";
        await new Promise((resolve, reject) => {
            imgElement.onload = resolve;
            imgElement.onerror = reject;
            imgElement.src = imageUrl;
        });
        
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
                        <h2 className="text-4xl fantasy-font text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-purple-600 mb-2">The Campaign Atlas</h2>
                        <p className="text-slate-400">Manage your module chapters and sandbox locations.</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-1 flex gap-2">
                        <input 
                            value={vibe} 
                            onChange={e => setVibe(e.target.value)} 
                            placeholder="Describe a sandbox region (e.g. 'Floating Crystal Isles')" 
                            className="bg-transparent text-white px-3 py-2 outline-none w-64 text-sm placeholder:text-slate-600"
                            onKeyDown={e => e.key === 'Enter' && !generatingNode && handleGenerate(locations.length)}
                        />
                        <button className="bg-slate-800 text-slate-500 hover:text-white px-3 rounded transition-colors"><Icon name="sparkles" size={16}/></button>
                    </div>
                </div>

                {/* MODULE SKELETON CHAPTERS */}
                {skeleton?.chapters && skeleton.chapters.length > 0 && (
                    <div className="mb-12 space-y-6">
                        <div className="flex items-center gap-3 border-b border-amber-500/30 pb-2 mb-4">
                            <Icon name="book-open" className="text-amber-500" size={24} />
                            <h3 className="text-2xl font-bold text-amber-500 fantasy-font">{skeleton.title || 'Campaign Module'}</h3>
                        </div>
                        
                        {skeleton.chapters.map(chapter => (
                            <div key={chapter.id} className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 mb-6">
                                <h4 className="text-lg font-bold text-slate-300 flex items-center gap-2 mb-4">
                                    <Icon name="bookmark" size={16} className="text-indigo-400" />
                                    {chapter.title}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {chapter.maps?.map(map => {
                                        const isMissing = map.status === 'missing';
                                        if (isMissing) {
                                            return (
                                                <div 
                                                    key={map.id} 
                                                    onClick={() => {
                                                        setImportTarget({ ...map, chapterId: chapter.id, mapId: map.id });
                                                        setShowAssetManager(true);
                                                    }}
                                                    className="relative aspect-square rounded-xl transition-all duration-300 group bg-indigo-950/20 border-2 border-dashed border-indigo-500/30 hover:border-indigo-400/80 hover:bg-indigo-900/30 cursor-pointer flex flex-col items-center justify-center overflow-hidden shadow-inner"
                                                >
                                                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-400 via-transparent to-transparent pointer-events-none group-hover:opacity-20 transition-opacity"></div>
                                                    <Icon name="hexagon" size={32} className="text-indigo-500/40 mb-2 group-hover:text-indigo-400 group-hover:scale-110 transition-all group-hover:animate-pulse" />
                                                    <span className="font-bold text-indigo-300/80 group-hover:text-indigo-200 transition-colors text-center px-4 text-sm">{map.name}</span>
                                                    <span className="text-[9px] uppercase tracking-widest text-indigo-400/50 mt-2 font-mono">Missing Map Data</span>
                                                </div>
                                            );
                                        } else {
                                            return (
                                                <div key={map.id} className="relative aspect-square rounded-xl transition-all duration-300 group bg-slate-900 border border-slate-700 hover:border-amber-500/50 hover:-translate-y-1 shadow-xl overflow-hidden">
                                                    <ResolvedMapImage url={map.image || map.mapUrl} name={map.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-4">
                                                        <h3 className="text-lg font-bold text-white leading-tight shadow-black drop-shadow-md">{map.name}</h3>
                                                        <span className="text-[10px] text-green-400 font-mono uppercase tracking-widest mb-1">Ready to Play</span>
                                                        {role === 'dm' && (
                                                            <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-4 group-hover:translate-y-0">
                                                                <button onClick={() => sendToTable(map)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1 shadow-lg"><Icon name="map" size={12}/> Project</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }
                                    })}
                                    {(!chapter.maps || chapter.maps.length === 0) && (
                                        <div className="col-span-full text-slate-500 text-sm italic">No maps required for this chapter.</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* SANDBOX ATLAS */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-700 pb-2 mb-4">
                        <Icon name="globe" className="text-slate-400" size={24} />
                        <h3 className="text-2xl font-bold text-slate-200 fantasy-font">Sandbox Atlas</h3>
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

            {showAssetManager && (
                <div className="fixed inset-0 z-[100] flex justify-end bg-black/50 backdrop-blur-sm">
                    <Suspense fallback={<div className="w-80 h-full bg-slate-900 flex items-center justify-center"><Icon name="loader" className="animate-spin text-amber-500" size={32}/></div>}>
                        <AssetManager 
                            campaignCode={gameParams?.code}
                            mapData={{}} 
                            activeMapId={null}
                            updateMap={() => {}}
                            onClose={() => {
                                setShowAssetManager(false);
                                setImportTarget(null);
                            }}
                            allCharacters={[]}
                            campaignData={data}
                            updateCampaign={updateCampaign}
                            importTarget={importTarget}
                            aiHelper={aiHelper}
                            generateNpc={generateNpc}
                            onSetBackground={async (asset, closeManager) => {
                                if (importTarget) {
                                     toast(`Forging ${importTarget.name}...`, "info");
                                     try {
                                         const targetMap = { ...importTarget, id: importTarget.mapId };
                                         await fulfillMapData({
                                             imgUrl: asset.url || asset.generatedMapUrl,
                                             targetMap,
                                             campaignCode: gameParams?.code,
                                             skeleton,
                                             data: {
                                                 ...data,
                                                 npcs: (data?.npcs || []).filter(n => n && n.name),
                                                 players: (data?.players || []).filter(p => p && p.name)
                                             },
                                             aiHelper: localAiHelper,
                                             generateNpc: localGenerateNpc,
                                             updateCampaign,
                                             setProcessingStep: (step) => toast(step, "info")
                                         });
                                         toast(`${importTarget.name} is now Ready!`, "success");
                                     } catch (e) {
                                         console.error(e);
                                         toast("Fulfillment failed.", "error");
                                     }
                                }
                                if (closeManager !== false) {
                                     setShowAssetManager(false);
                                     setImportTarget(null);
                                 }
                                return false; // Handled by fulfillment, don't trigger grid detection automatically
                            }}
                            onNewBlankMap={() => {}}
                        />
                    </Suspense>
                </div>
            )}
        </div>
    );
};

export default WorldCreator;