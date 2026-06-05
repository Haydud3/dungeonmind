import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { storeChunkedMap, deleteChunkedMap, retrieveChunkedMap } from '../utils/storageUtils';
import { exportMapPreset, importMapPreset } from '../utils/presetManager';
import Icon from './Icon';
import SketchfabImporter from './SketchfabImporter';
import MapGenerator from './MapGenerator';
import ResolvedImage from './ResolvedImage'; // Add this import

import { useToast } from './ToastProvider';
import { useResolvedUrl } from '../utils/useResolvedUrl';
import { fulfillMapData } from '../utils/moduleFulfillment';
import { subscribeToMap } from '../utils/mapService';

// Helper to generate a lightweight thumbnail so the gallery loads instantly
const generateThumbnail = (dataUrl) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 150;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const scale = Math.max(size / img.width, size / img.height);
            const x = (size - img.width * scale) / 2;
            const y = (size - img.height * scale) / 2;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => {
            console.warn("Failed to generate thumbnail for image");
            resolve(null); // Resolve with null instead of rejecting to avoid crashing the whole process
        };
        img.src = dataUrl;
    });
};

const ThrottledSlider = ({ value, min, max, step, onChange, onDragStart, onDragEnd, className, disabled }) => {
    const [localVal, setLocalVal] = useState(value);
    const isDragging = useRef(false);

    useEffect(() => { 
        if (!isDragging.current) setLocalVal(value); 
    }, [value]);

    return (
        <input 
            type="range" min={min} max={max} step={step} 
            value={localVal}
            disabled={disabled}
            onPointerDown={() => { isDragging.current = true; if (onDragStart) onDragStart(); }}
            onPointerUp={() => { isDragging.current = false; setLocalVal(value); if (onDragEnd) onDragEnd(); }}
            onChange={(e) => {
                const v = parseFloat(e.target.value);
                setLocalVal(v);
                if (onChange) onChange(v);
            }}
            className={className}
        />
    );
};

const AssetThumbnail = ({ asset }) => {
    let imgUrl = asset.thumbnail || asset.url;
    if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && !imgUrl.includes('firebasestorage.googleapis.com') && !imgUrl.includes('wsrv.nl')) {
        imgUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&cors=1&w=256`; // Resize via wsrv for thumbnails
    }

    const resolvedUrl = useResolvedUrl(imgUrl);

    if (resolvedUrl || (imgUrl && typeof imgUrl === 'string' && !imgUrl.startsWith('chunked:'))) {
        return <img src={resolvedUrl || imgUrl} className="w-full h-full object-cover" alt={asset.name} draggable={false} referrerPolicy="no-referrer" />;
    }
    return <div className="w-full h-full flex items-center justify-center bg-slate-900 border border-slate-700"><Icon name={asset.is3D ? "box" : "image"} size={32} className="text-slate-600 animate-pulse"/></div>;
};

const CharacterThumbnail = ({ char }) => {
    let imgUrl = char.avatarUrl || char.imageUrl || char.image;
    if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && !imgUrl.includes('firebasestorage.googleapis.com') && !imgUrl.includes('wsrv.nl')) {
        imgUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&cors=1&w=256`;
    }
    const resolvedUrl = useResolvedUrl(imgUrl);

    if (resolvedUrl || (imgUrl && typeof imgUrl === 'string' && !imgUrl.startsWith('chunked:'))) {
        return <img src={resolvedUrl || imgUrl} className="w-full h-full object-cover" alt={char.name} draggable={false} referrerPolicy="no-referrer" />;
    }
    return <div className="w-full h-full flex items-center justify-center bg-slate-900 border border-slate-700 text-slate-500"><Icon name="user" size={32} className="animate-pulse"/></div>;
};

const ResolvedMapImage = ({ url, name, className }) => {
    const resolvedUrl = useResolvedUrl(url);
    if (!resolvedUrl && url && url.startsWith('chunked:')) {
        return <div className="w-full h-full flex items-center justify-center bg-slate-800"><Icon name="loader" className="animate-spin text-slate-600" size={24} /></div>;
    }
    if (resolvedUrl || url) {
        return <img src={resolvedUrl || url} className={className} alt={name} referrerPolicy="no-referrer" />;
    }
    return <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-800"><Icon name="map" size={24} /></div>;
};

const AssetManager = ({ campaignCode, mapData: propMapData, activeMapId: propActiveMapId, updateMap, onClose, onSetBackground, onSetHeightmap, onGenerateMap, onNewBlankMap, allCharacters, campaignData, updateCampaign, onSelectStamper, importTarget, aiHelper, generateNpc }) => {
    const toast = useToast();
    const [assets, setAssets] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);
    const importPresetRef = useRef(null);
    const [activeTab, setActiveTab] = useState(importTarget ? 'web' : 'library');
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [assetCategory, setAssetCategory] = useState('Maps');
    const [editingMapData, setEditingMapData] = useState(null);

    // STEP 1: Fix Target Map ID logic - Only hijack active map if we specifically selected a map to edit
    const targetMapId = (activeTab === 'settings' || activeTab === 'ai') && selectedAsset?.isSkeletonMap && selectedAsset?.activeMapId
        ? selectedAsset.activeMapId
        : propActiveMapId;

    const isEditingDifferentMap = targetMapId !== propActiveMapId;

    // Subscribe to map data for the settings tab when it's not the active map
    useEffect(() => {
        let unsubscribe = null;
        if (isEditingDifferentMap && targetMapId) {
            unsubscribe = subscribeToMap(campaignCode, targetMapId, (data) => {
                setEditingMapData(data || {});
            });
        } else {
            setEditingMapData(null);
        }
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [isEditingDifferentMap, targetMapId, campaignCode]);

    const mapData = isEditingDifferentMap ? editingMapData : propMapData;
    const activeMapId = targetMapId;

    const [isProcessingMap, setIsProcessingMap] = useState(false);
    const [processingStep, setProcessingStep] = useState('');

    // Reddit Sourcing States
    const [redditQuery, setRedditQuery] = useState(importTarget?.name || '');
    const [redditResults, setRedditResults] = useState([]);
    const [isSourcing, setIsSourcing] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [internalImportTarget, setInternalImportTarget] = useState(importTarget || null);

    const [uploadTargetMap, setUploadTargetMap] = useState(null);
    const mapFileInputRef = useRef(null);

    const [expandedChapters, setExpandedChapters] = useState(() => {
        const skeleton = campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton;
        const initial = {};
        if (skeleton?.chapters) {
            let foundActive = false;
            skeleton.chapters.forEach(c => {
                if (c.maps?.some(m => m.activeMapId === activeMapId)) {
                    initial[c.id] = true;
                    foundActive = true;
                }
            });
            if (!foundActive && skeleton.chapters.length > 0) {
                initial[skeleton.chapters[0].id] = true;
            }
        }
        return initial;
    });

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

    useEffect(() => {
        if (importTarget) {
            setInternalImportTarget(importTarget);
            setRedditQuery(importTarget.name);
            setActiveTab('web');
            handleRedditSearch(importTarget.name);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRedditSearch = async (queryToSearch = redditQuery) => {
        if (!queryToSearch) return;
        setIsSourcing(true);
        setRedditResults([]);
        try {
            const query = encodeURIComponent(queryToSearch);
            const urls = [
                `https://corsproxy.io/?https://www.reddit.com/r/battlemaps/search.json?q=${query}&restrict_sr=1&limit=15`,
                `https://corsproxy.io/?https://www.reddit.com/r/dndmaps/search.json?q=${query}&restrict_sr=1&limit=15`
            ];
            
            let maps = [];
            for (const url of urls) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    
                    const data = await res.json();
                    const posts = data?.data?.children || [];
                    
                    posts.forEach(post => {
                        const d = post.data;
                        if (d.url && (d.url.match(/\.(jpeg|jpg|gif|png|webp)$/i))) {
                            maps.push({ title: d.title, url: d.url, author: d.author });
                        } else if (d.media_metadata) {
                            Object.values(d.media_metadata).forEach(media => {
                                if (media.s && media.s.u) {
                                    maps.push({ title: d.title, url: media.s.u.replace(/&amp;/g, '&'), author: d.author });
                                }
                            });
                        }
                    });
                } catch(e) { console.warn("Reddit search sub-query failed", e); }
            }

            setRedditResults(maps);
            setCurrentImageIndex(0);
        } catch (e) {
            console.error("Reddit search failed", e);
            toast("Failed to search Reddit. Check console.", "error");
        }
        setIsSourcing(false);
    };

    // Grid Auto-Detection States
    const [isDetectingGrid, setIsDetectingGrid] = useState(false);
    const [gridDetectionResult, setGridDetectionResult] = useState(null);
    const [gridSubdivision, setGridSubdivision] = useState(1);
    const workerRef = useRef(null);

    const pendingMapUpdates = useRef({});
    const mapUpdateThrottle = useRef(null);

    const throttledUpdateMap = useCallback((updates) => {
        for (const key in updates) {
            if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
                pendingMapUpdates.current[key] = { ...pendingMapUpdates.current[key], ...updates[key] };
            } else {
                pendingMapUpdates.current[key] = updates[key];
            }
        }
        if (!mapUpdateThrottle.current) {
            mapUpdateThrottle.current = setTimeout(() => {
                updateMap(campaignCode, activeMapId, { ...pendingMapUpdates.current });
                pendingMapUpdates.current = {};
                mapUpdateThrottle.current = null;
            }, 100);
        }
    }, [campaignCode, activeMapId, updateMap]);

    useEffect(() => {
        return () => {
            if (mapUpdateThrottle.current) clearTimeout(mapUpdateThrottle.current);
        };
    }, []);

    // Fetch all previously uploaded images from this campaign's folder
    const fetchAssets = async () => {
        if (!campaignCode) return;
        const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
        const q = query(assetsRef, orderBy('createdAt', 'desc'));
        try {
            const res = await getDocs(q);
            const fetched = res.docs.map(d => ({ id: d.id, ...d.data() }));
            setAssets([...fetched]);
        } catch (err) {
            console.error("Failed to fetch assets", err);
        }
    };

    useEffect(() => {
        if (activeTab === 'library') {
            fetchAssets();
        }
    }, [campaignCode, activeTab]);

    // Initialize the grid detection worker
    useEffect(() => {
        workerRef.current = new Worker(new URL('./gridDetection.worker.js', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'GRID_DETECTED') {
                setIsDetectingGrid(false);
                setGridDetectionResult(payload);
                setGridSubdivision(1); // Reset subdivision
            }
        };
        return () => workerRef.current?.terminate();
    }, []);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const isModel = file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf');
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64 = reader.result;
                    let thumbBase64 = null;
                    
                    if (!isModel) {
                        thumbBase64 = await generateThumbnail(base64);
                    }
                    
                    const chunkedId = await storeChunkedMap(base64, file.name);
                    
                    const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
                    
                    const assetData = { name: file.name, url: chunkedId, thumbnail: thumbBase64, createdAt: serverTimestamp(), category: assetCategory === 'All' ? (isModel ? 'Props' : 'Uncategorized') : assetCategory };
                    if (isModel) {
                        assetData.is3D = true;
                        assetData.modelUrl = chunkedId;
                    }
                    
                    await addDoc(assetsRef, assetData);
                    
                    await fetchAssets();
                } catch (err) { console.error(err); alert("Processing failed."); }
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error(err);
            alert("Upload failed.");
            setIsUploading(false);
        }
        if (e.target) e.target.value = null;
    };

    const handleDeleteCharacter = async (char) => {
        if (!confirm(`Permanently remove "${char.name}" from the campaign?`)) return;
        try {
            if (campaignData?.players?.find(p => p.id === char.id)) {
                if (updateCampaign) updateCampaign({ players: campaignData.players.filter(p => p.id !== char.id) });
            } else if (campaignData?.npcs?.find(n => n.id === char.id)) {
                if (updateCampaign) updateCampaign({ npcs: campaignData.npcs.filter(n => n.id !== char.id) });
            }
        } catch (err) {
            console.error("Failed to delete character", err);
            alert("Delete failed.");
        }
    };

    const handleDeleteAsset = async (asset) => {
        if (!confirm(`Permanently delete "${asset.name}"?`)) return;

        try {
            const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
            await deleteDoc(assetRef);

            await deleteChunkedMap(asset.url);
            
            if (asset.thumbnailId) {
                await deleteChunkedMap(asset.thumbnailId);
            }

            if (asset.generatedMapUrl) {
                await deleteChunkedMap(asset.generatedMapUrl);
            }
            if (asset.generatedHeightmapUrl) {
                await deleteChunkedMap(asset.generatedHeightmapUrl);
            }

            setAssets(prev => prev.filter(a => a.id !== asset.id));

            if (mapData?.backgroundUrl === asset.url || mapData?.backgroundUrl === asset.generatedMapUrl) {
                onNewBlankMap(true);
            }

        } catch (err) {
            console.error("Error deleting asset:", err);
            alert("Failed to delete asset.");
        }
    }

    const handleUpdateAssetLayer = async (asset, layerType, data) => {
        const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
        const updates = {};
        const mapUpdates = {};

        if (layerType === 'baseMap') {
            updates.generatedMapUrl = data;
            mapUpdates.backgroundUrl = data;
        } else if (layerType === 'heightMap') {
            updates.generatedHeightmapUrl = data;
            mapUpdates.heightmapUrl = data;
        } else if (layerType === 'normalMap') {
            updates.generatedNormalMapUrl = data;
            mapUpdates.normalMapUrl = data;
        } else if (layerType === 'materialMask') {
            updates.generatedMaterialMaskUrl = data;
            mapUpdates.materialMaskUrl = data;
        } else if (layerType === 'architectMask') {
            const currentFeatures = asset.generatedFeatures || { walls: {}, lights: [] };
            updates.generatedFeatures = { ...currentFeatures, walls: data.walls };
            
            // Preserve existing walls that were not generated by AI (e.g. boundary walls, hand-drawn)
            const preservedWalls = {};
            if (mapData?.walls) {
                Object.values(mapData.walls).filter(Boolean).forEach(w => {
                    if (!w.id.includes('_gen_')) {
                        preservedWalls[w.id] = w;
                    }
                });
            }
            
            mapUpdates.walls = { ...preservedWalls, ...(data.walls || {}) };
        } else if (layerType === 'illuminationMask') {
            const currentFeatures = asset.generatedFeatures || { walls: {}, lights: [] };
            updates.generatedFeatures = { ...currentFeatures, lights: data.lights };
            mapUpdates.lights = data.lights || {};
        }

        if (asset.isSkeletonMap) {
            const newSkeleton = JSON.parse(JSON.stringify(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton));
            let skeletonUpdated = false;
            newSkeleton.chapters.forEach(c => {
                c.maps?.forEach(m => {
                    if (m.id === asset.id) {
                        if (layerType === 'baseMap') {
                            m.mapUrl = data;
                            m.image = data;
                            m.backgroundUrl = data;
                        } else if (layerType === 'heightMap') {
                            m.generatedHeightmapUrl = data;
                        } else if (layerType === 'normalMap') {
                            m.generatedNormalMapUrl = data;
                        } else if (layerType === 'materialMask') {
                            m.generatedMaterialMaskUrl = data;
                        } else if (layerType === 'architectMask' || layerType === 'illuminationMask') {
                            m.generatedFeatures = m.generatedFeatures || {};
                            if (layerType === 'architectMask') m.generatedFeatures.walls = data.walls;
                            if (layerType === 'illuminationMask') m.generatedFeatures.lights = data.lights;
                        }
                        skeletonUpdated = true;
                    }
                });
            });
            if (skeletonUpdated && updateCampaign) {
                await updateCampaign({ moduleSkeleton: newSkeleton });
            }
        } else {
            await updateDoc(assetRef, updates);
        }
        
        // Update local selectedAsset state to reflect changes instantly (green checkmarks)
        if (selectedAsset && selectedAsset.id === asset.id) {
            setSelectedAsset(prev => ({ ...prev, ...updates }));
        }
        
        // Only apply to the current map if we are currently viewing THIS exact asset's background
        const isActiveMap = mapData?.backgroundUrl === asset.generatedMapUrl || 
                            mapData?.backgroundUrl === asset.url || 
                            (layerType === 'baseMap' && mapData?.backgroundUrl === data);
                            
        if (isActiveMap && Object.keys(mapUpdates).length > 0) {
            updateMap(campaignCode, activeMapId, mapUpdates);
        }
    };

    const handleAutoDetectGrid = async (overrideUrl) => {
        const imageUrl = typeof overrideUrl === 'string' ? overrideUrl : mapData?.backgroundUrl;
        if (!imageUrl) {
            alert("Please set a map background first.");
            return;
        }
        setIsDetectingGrid(true);
        setGridDetectionResult(null);

        try {
            let finalUrl = imageUrl;
            let objectUrl = null;

            // Resolve chunked IDs from local storage or proxy external URLs
            if (imageUrl.startsWith('chunked:')) {
                const blob = await retrieveChunkedMap(imageUrl);
                if (blob) {
                    objectUrl = URL.createObjectURL(blob);
                    finalUrl = objectUrl;
                } else {
                    throw new Error("Failed to retrieve chunked image");
                }
            } else if (finalUrl.startsWith('http')) {
                let cleanUrl = finalUrl;
                if (cleanUrl.includes('corsproxy.io/?')) cleanUrl = decodeURIComponent(cleanUrl.split('corsproxy.io/?')[1] || cleanUrl);
                if (cleanUrl.includes('api.allorigins.win/raw?url=')) cleanUrl = decodeURIComponent(cleanUrl.split('api.allorigins.win/raw?url=')[1] || cleanUrl);
                if (cleanUrl.includes('api.allorigins.win/raw?url=')) cleanUrl = decodeURIComponent(cleanUrl.split('api.allorigins.win/raw?url=')[1] || cleanUrl);
                if (!cleanUrl.includes('firebasestorage.googleapis.com') && !cleanUrl.includes('wsrv.nl')) {
                    finalUrl = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&cors=1`;
                } else {
                    finalUrl = cleanUrl;
                }
            }

            const img = new Image();
            img.crossOrigin = "Anonymous"; // Crucial for reading pixel data
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                workerRef.current.postMessage({
                    type: 'DETECT_GRID',
                    imageData: imageData.data,
                    width: img.width,
                    height: img.height
                });

                if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
            };
            img.onerror = () => {
                console.error("Failed to load image for grid detection.");
                setIsDetectingGrid(false);
                alert("Could not load image. Cross-Origin Resource Sharing (CORS) might be preventing it.");
                if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
            };
            img.src = finalUrl;
        } catch (err) {
            console.error("Failed to prepare image for grid detection:", err);
            setIsDetectingGrid(false);
        }
    };

    const handleApplyGridAlignment = (result, subdivision) => {
        const { cellSize, offsetX, offsetY, imageWidth, imageHeight } = result;
        
        const subdividedCellSize = cellSize / subdivision;
        const scale = mapData?.scale || 20;
        
        // Calculate the ratio: how many world units is one image pixel?
        const unitsPerPixel = scale / imageHeight;
        const newGridSize = subdividedCellSize * unitsPerPixel;

        // Calculate world boundaries to map pixel offset to world offset
        const worldWidth = imageWidth * unitsPerPixel;
        const topLeftX = -worldWidth / 2;
        const topLeftZ = -scale / 2; 

        // The exact world intersection point for the detected top-left grid corner
        const ix = topLeftX + (offsetX * unitsPerPixel);
        const iz = topLeftZ + (offsetY * unitsPerPixel);

        // The ((x % m) + m) % m formula ensures safe positive modulo. Shift to keep offsets near 0.
        const modX = ((ix % newGridSize) + newGridSize) % newGridSize;
        const modZ = ((iz % newGridSize) + newGridSize) % newGridSize;
        const finalOffsetX = modX > newGridSize / 2 ? modX - newGridSize : modX;
        const finalOffsetY = modZ > newGridSize / 2 ? modZ - newGridSize : modZ;

        updateMap(campaignCode, activeMapId, {
            gridSize: parseFloat(newGridSize.toFixed(4)),
            gridOffsetX: parseFloat(finalOffsetX.toFixed(4)),
            gridOffsetY: parseFloat(finalOffsetY.toFixed(4))
        });

        setGridDetectionResult(null);
    };

    const handleExportPreset = async () => {
        setIsExporting(true);
        try {
            const mapSettings = {
                gridSize: mapData?.gridSize || 1,
                gridOffsetX: mapData?.gridOffsetX || 0,
                gridOffsetY: mapData?.gridOffsetY || 0,
                gridColor: mapData?.gridColor || '#888888',
                gridThickness: mapData?.gridThickness || 0.5,
                scale: mapData?.scale || 20,
                environment: mapData?.environment || 'day',
                lightingIntensity: mapData?.lightingIntensity || 1,
                tokenElevationOffset: mapData?.tokenElevationOffset ?? 0.04,
                showGrid: mapData?.showGrid !== false,
                isSnapToGrid: mapData?.isSnapToGrid !== false,
                showNameplates: mapData?.showNameplates !== false,
                fowEnabled: mapData?.fowEnabled || false,
                fowWallsEnabled: mapData?.fowWallsEnabled || false,
                playerDoorVisibility: mapData?.playerDoorVisibility || false,
                mapImageUrl: mapData?.backgroundUrl || null,
                heightmapUrl: mapData?.heightmapUrl || null,
                normalMapUrl: mapData?.normalMapUrl || null,
                heightScale: mapData?.heightScale || 1,
            };

            const geometry = { walls: mapData?.walls || {} };
            const lights = mapData?.lights ? Object.values(mapData.lights).filter(Boolean) : [];
            const tokens = mapData?.tokens ? Object.values(mapData.tokens).filter(Boolean) : [];
            
            const characters = [];
            if (allCharacters && tokens.length > 0) {
                tokens.forEach(t => {
                    if (!t || !t.characterId) return; // Prevent TypeError if token is null or lacks characterId
                    const char = allCharacters.find(c => c && String(c.id) === String(t.characterId));
                    if (char && !characters.find(c => c.id === char.id)) {
                        characters.push(char);
                    }
                });
            }

            await exportMapPreset(mapSettings, geometry, lights, tokens, characters);
        } catch (err) {
            console.error("Failed to export preset:", err);
            alert("Failed to export preset.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportPresetClick = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const preset = await importMapPreset(file);
            
            // Process Characters
            const currentNpcs = campaignData?.npcs || [];
            const newNpcs = [...currentNpcs];
            const characterIdMap = {};

            if (preset.characters) {
                for (const char of preset.characters) {
                    let existing = currentNpcs.find(c => c.name === char.name);
                    let newCharId;
                    if (existing) {
                        newCharId = existing.id;
                    } else {
                        newCharId = `char_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                        const newChar = { ...char, id: newCharId };
                        
                        if (char.modelBase64 && char.modelBase64.startsWith('data:')) {
                            try {
                               const chunkedId = await storeChunkedMap(char.modelBase64, `${char.name}_model.glb`);
                               newChar.modelUrl = chunkedId;
                            } catch (e) {
                               console.error("Failed to store model:", e);
                            }
                        }
                        delete newChar.modelBase64;
                        newNpcs.push(newChar);
                    }
                    characterIdMap[char.id] = newCharId;
                }
                if (updateCampaign) updateCampaign({ npcs: newNpcs });
            }

            // Process Map Assets
            let backgroundUrl = preset.mapSettings?.mapImageUrl;
            let heightmapUrl = preset.mapSettings?.heightmapUrl;
            let normalMapUrl = preset.mapSettings?.normalMapUrl;

            if (preset.mapSettings?.mapImageBase64) {
                if (preset.mapSettings.mapImageBase64.startsWith('blob:')) {
                    alert("This preset was exported incorrectly and is missing its background image data. Please re-export the preset.");
                    setIsImporting(false);
                    if (e.target) e.target.value = null;
                    return;
                }
                
                const mapName = preset.mapSettings?.name || 'Imported Map';
                backgroundUrl = await storeChunkedMap(preset.mapSettings.mapImageBase64, mapName);
                
                const thumbBase64 = await generateThumbnail(preset.mapSettings.mapImageBase64);
                const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
                await addDoc(assetsRef, { 
                    name: mapName, 
                    url: backgroundUrl, 
                    thumbnail: thumbBase64, 
                    createdAt: serverTimestamp() 
                });
                await fetchAssets();
            }
            if (preset.mapSettings?.heightmapBase64) {
                heightmapUrl = await storeChunkedMap(preset.mapSettings.heightmapBase64, 'preset_heightmap');
            }
            if (preset.mapSettings?.normalMapBase64) {
                normalMapUrl = await storeChunkedMap(preset.mapSettings.normalMapBase64, 'preset_normalmap');
            }

            const updates = {
                ...preset.mapSettings,
                backgroundUrl,
                heightmapUrl,
                normalMapUrl,
                walls: preset.geometry?.walls || {},
                lights: preset.lights?.reduce((acc, l) => { acc[l.id] = l; return acc; }, {}) || {}
            };
            
            delete updates.mapImageBase64;
            delete updates.heightmapBase64;
            delete updates.normalMapBase64;
            delete updates.mapImageUrl;

            // Tokens
            const tokensUpdate = {};
            if (preset.tokens) {
                preset.tokens.forEach(t => {
                    const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    tokensUpdate[newTokenId] = {
                        ...t,
                        id: newTokenId,
                        characterId: characterIdMap[t.characterId] || t.characterId
                    };
                });
                updates.tokens = tokensUpdate;
            } else {
                updates.tokens = {};
            }

            // Create a new map rather than overwriting the current one
            const newMapId = doc(collection(db, 'maps')).id;
            
            updates.name = updates.name || preset.mapSettings?.name || 'Imported Map';
            updates.gridSize = updates.gridSize || 1;
            updates.scale = updates.scale || 20;
            updates.environment = updates.environment || 'day';
            
            await updateMap(campaignCode, newMapId, updates);
            
            if (updateCampaign) {
                await updateCampaign({ activeMapId: newMapId });
            }
            
            if (onClose) onClose(); // Close the asset manager after importing
            
        } catch (err) {
            console.error("Failed to import preset:", err);
            alert("Failed to import preset. Make sure it's a valid DungeonMind preset JSON file.");
        } finally {
            setIsImporting(false);
        }
        if (e.target) e.target.value = null;
    };

    const handleMapUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file || !uploadTargetMap) return;
        
        setIsProcessingMap(true);
        setProcessingStep(`Uploading ${uploadTargetMap.name}...`);
        
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const targetMap = { ...uploadTargetMap, id: uploadTargetMap.mapId || uploadTargetMap.id };
                const newMapId = await fulfillMapData({
                    imgUrl: reader.result,
                    targetMap,
                    campaignCode,
                    skeleton: campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton,
                    data: {
                        ...campaignData,
                        npcs: (campaignData?.npcs || []).filter(n => n && n.name),
                        players: (campaignData?.players || []).filter(p => p && p.name)
                    },
                    aiHelper: localAiHelper,
                    generateNpc: localGenerateNpc,
                    updateCampaign,
                    setProcessingStep: setProcessingStep
                });
                toast(`${targetMap.name} is now Ready!`, "success");
                setProcessingStep('Populating Entities...');
                await new Promise(r => setTimeout(r, 3500));
                await updateCampaign({ activeMapId: newMapId });
                setInternalImportTarget(null);
                setSelectedAsset({ ...targetMap, url: reader.result, isSkeletonMap: true, activeMapId: newMapId });
                setActiveTab('settings');
                handleAutoDetectGrid(reader.result);
            } catch (err) {
                console.error(err);
                toast("Fulfillment failed.", "error");
            } finally {
                setIsProcessingMap(false);
                setProcessingStep('');
                setUploadTargetMap(null);
            }
            if (mapFileInputRef.current) mapFileInputRef.current.value = null;
        };
        reader.readAsDataURL(file);
    };

    const activeScaleData = useRef(null);

    return (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Loading Overlay */}
            {(isDetectingGrid || isImporting || isProcessingMap) && (
                <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
                    {isProcessingMap ? (
                        <>
                            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(245,158,11,0.5)]"></div>
                            <h3 className="text-2xl font-bold text-white mb-2 tracking-wider">Forging Scene</h3>
                            <p className="text-amber-400 animate-pulse font-mono bg-black/50 px-4 py-2 rounded border border-amber-500/20">{processingStep || 'Processing...'}</p>
                        </>
                    ) : (
                        <>
                            <Icon name="loader" className="animate-spin text-amber-500 mb-4" size={48} />
                            <h3 className="text-xl font-bold text-white mb-2">{isImporting ? 'Importing Preset...' : 'Analyzing Frequencies...'}</h3>
                            <p className="text-sm text-slate-400">{isImporting ? 'Please wait while assets are loaded and applied.' : 'Running Computer Vision Grid Detection'}</p>
                        </>
                    )}
                </div>
            )}

            {/* Verification UI Overlay */}
            {gridDetectionResult && (
                <div className="absolute bottom-4 left-4 right-4 bg-slate-800 border border-amber-500 rounded-xl p-4 shadow-2xl z-[100] animate-in slide-in-from-bottom">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-amber-500 flex items-center gap-2">
                            <Icon name="check-circle" size={18} /> Grid Detected
                        </h3>
                        <button onClick={() => setGridDetectionResult(null)} className="text-slate-400 hover:text-white">
                            <Icon name="x" size={18} />
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
                            <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Cell Size</div>
                            <div className="font-mono text-white text-base">{(gridDetectionResult.cellSize / gridSubdivision).toFixed(1)}<span className="text-[10px] text-slate-500 ml-1">px</span></div>
                        </div>
                        <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
                            <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Offset X</div>
                            <div className="font-mono text-white text-base">{gridDetectionResult.offsetX.toFixed(1)}<span className="text-[10px] text-slate-500 ml-1">px</span></div>
                        </div>
                        <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
                            <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Offset Y</div>
                            <div className="font-mono text-white text-base">{gridDetectionResult.offsetY.toFixed(1)}<span className="text-[10px] text-slate-500 ml-1">px</span></div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-4 bg-slate-900 p-2 rounded border border-slate-700">
                        <span className="text-xs font-bold text-slate-400">Subdivide Grid</span>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4].map(num => (
                                <button 
                                    key={num}
                                    onClick={() => setGridSubdivision(num)}
                                    className={`px-3 py-1 text-xs font-bold rounded ${gridSubdivision === num ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                >
                                    {num}x
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">
                            Confidence: <span className={gridDetectionResult.confidence > 0.7 ? "text-green-400" : gridDetectionResult.confidence > 0.4 ? "text-amber-400" : "text-red-400"}>{Math.round(gridDetectionResult.confidence * 100)}%</span>
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setGridDetectionResult(null)}
                                className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 rounded border border-slate-700 hover:border-slate-500"
                            >
                                Discard
                            </button>
                            <button 
                                onClick={() => handleApplyGridAlignment(gridDetectionResult, gridSubdivision)}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded shadow"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-none p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="map" size={18} /> Map Editor</h3>
                <div className="flex items-center">
                    <button onClick={() => onNewBlankMap()} className="text-slate-400 hover:text-white p-1" title="New Blank Map">
                        <Icon name="file-plus" size={18} />
                    </button>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18} /></button>
                </div>
            </div>

            <div className="flex-none border-b border-slate-800 flex overflow-x-auto no-scrollbar">
                <TabButton name="web" activeTab={activeTab} onClick={setActiveTab} icon="search">Web</TabButton>
                <TabButton name="library" activeTab={activeTab} onClick={setActiveTab} icon="library">Assets</TabButton>
                <TabButton name="sketchfab" activeTab={activeTab} onClick={setActiveTab} icon="globe">Sketchfab</TabButton>
                <TabButton name="settings" activeTab={activeTab} onClick={(tab) => { setSelectedAsset(null); setActiveTab(tab); }} icon="sliders-horizontal">Settings</TabButton>
                {activeTab === 'ai' && <TabButton name="ai" activeTab={activeTab} onClick={setActiveTab} icon="layers">Layers</TabButton>}
            </div>
            
            {activeTab === 'web' && (
                <div className="flex-1 min-h-0 flex flex-col bg-slate-900">
                    <div className="p-4 border-b border-slate-800 bg-slate-950 flex gap-2 shrink-0">
                        <input 
                            value={redditQuery} 
                            onChange={(e) => setRedditQuery(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && handleRedditSearch()}
                            placeholder="Search r/battlemaps..." 
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-amber-500"
                        />
                        <button onClick={() => handleRedditSearch()} disabled={isSourcing} className="bg-amber-600 hover:bg-amber-500 px-4 rounded text-white font-bold flex items-center justify-center">
                            {isSourcing ? <Icon name="loader" className="animate-spin" /> : <Icon name="search" />}
                        </button>
                    </div>
                    <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                        {isSourcing ? (
                            <div className="text-center animate-pulse">
                                <Icon name="loader" size={48} className="animate-spin text-amber-500 mx-auto mb-4" />
                                <div className="text-slate-300 font-bold">Scouring the internet...</div>
                            </div>
                        ) : redditResults.length > 0 ? (
                            <>
                                <div className="absolute inset-0 flex items-center justify-center p-4">
                                    <img src={`https://wsrv.nl/?url=${encodeURIComponent(redditResults[currentImageIndex].url)}&cors=1&w=800`} className="max-h-full max-w-full object-contain shadow-2xl rounded" alt="Map Preview" />
                                </div>
                                
                                <button 
                                    onClick={() => setCurrentImageIndex(prev => prev > 0 ? prev - 1 : redditResults.length - 1)}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full backdrop-blur transition-colors border border-slate-700 shadow-xl"
                                >
                                    <Icon name="chevron-left" size={24}/>
                                </button>
                                <button 
                                    onClick={() => setCurrentImageIndex(prev => prev < redditResults.length - 1 ? prev + 1 : 0)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full backdrop-blur transition-colors border border-slate-700 shadow-xl"
                                >
                                    <Icon name="chevron-right" size={24}/>
                                </button>

                                <div className="absolute bottom-4 left-0 right-0 text-center flex flex-col items-center">
                                    <div className="inline-block bg-black/70 backdrop-blur px-4 py-2 rounded-lg border border-slate-700 shadow-xl max-w-[80%] mb-2">
                                        <p className="text-white font-bold text-sm truncate">{redditResults[currentImageIndex].title}</p>
                                        <p className="text-slate-400 text-xs mt-1">by u/{redditResults[currentImageIndex].author} • Result {currentImageIndex + 1} of {redditResults.length}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                             onClick={() => setActiveTab('ai')}
                                             className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded shadow-lg flex items-center gap-2 border border-purple-500"
                                         >
                                             <Icon name="sparkles" size={16}/> Use AI
                                         </button>
                                        <button 
                                             onClick={async () => {
                                                 const selectedMap = redditResults[currentImageIndex];
                                                 if (internalImportTarget) {
                                                     setIsProcessingMap(true);
                                                     try {
                                                         const targetMap = { ...internalImportTarget, id: internalImportTarget.mapId };
                                                         const newMapId = await fulfillMapData({
                                                             imgUrl: selectedMap.url,
                                                             targetMap,
                                                             campaignCode,
                                                             skeleton: campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton,
                                                             data: {
                                                                 ...campaignData,
                                                                 npcs: (campaignData?.npcs || []).filter(n => n && n.name),
                                                                 players: (campaignData?.players || []).filter(p => p && p.name)
                                                             },
                                                             aiHelper: localAiHelper,
                                                             generateNpc: localGenerateNpc,
                                                             updateCampaign,
                                                             setProcessingStep: setProcessingStep
                                                         });
                                                         toast(`${internalImportTarget.name} is now Ready!`, "success");
                                                         setProcessingStep('Populating Entities...');
                                                         await new Promise(r => setTimeout(r, 3500));
                                                         await updateCampaign({ activeMapId: newMapId });
                                                         setInternalImportTarget(null);
                                                         setSelectedAsset({ ...targetMap, url: selectedMap.url, isSkeletonMap: true, activeMapId: newMapId });
                                                         setActiveTab('settings');
                                                         handleAutoDetectGrid(selectedMap.url);
                                                     } catch (e) {
                                                         console.error(e);
                                                         toast("Fulfillment failed.", "error");
                                                     } finally {
                                                         setIsProcessingMap(false);
                                                         setProcessingStep('');
                                                     }
                                                 } else {
                                                     const isNew = await onSetBackground({ name: selectedMap.title, url: selectedMap.url }, false);
                                                     setSelectedAsset({ name: selectedMap.title, url: selectedMap.url });
                                                     setActiveTab('settings');
                                                     if (isNew) {
                                                         handleAutoDetectGrid(selectedMap.url);
                                                     }
                                                 }
                                             }}
                                             className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg flex items-center gap-2 border border-green-500"
                                         >
                                             <Icon name="check" size={18}/> Accept Map
                                         </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-slate-500 p-6">
                                <Icon name="search-x" size={48} className="mx-auto mb-4 opacity-50" />
                                <p>No suitable maps found.</p>
                                <button 
                                     onClick={() => setActiveTab('ai')}
                                     className="mt-4 w-64 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold transition-colors shadow-lg flex items-center justify-center gap-2 mx-auto"
                                >
                                     <Icon name="sparkles" size={16} /> Generate with AI Instead
                                </button>
                                <button 
                                     onClick={() => window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(redditQuery + ' dnd battlemap')}`, '_blank')}
                                     className="mt-4 w-64 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors shadow-lg flex items-center justify-center gap-2 mx-auto"
                                >
                                     <Icon name="external-link" size={16} /> Search Google Images
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'sketchfab' && (
                <SketchfabImporter 
                    onSelectStamper={onSelectStamper} 
                    onImportCompleted={async (assetData) => {
                        if (assetData && campaignCode) {
                            const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
                            await addDoc(assetsRef, {
                                name: assetData.name,
                                url: assetData.url,
                                modelUrl: assetData.modelUrl,
                                thumbnail: assetData.image,
                                is3D: assetData.is3D,
                                category: 'Props',
                                createdAt: serverTimestamp()
                            });
                        }
                        fetchAssets();
                    }} 
                />
            )}

            {activeTab === 'ai' && (selectedAsset || importTarget) && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scroll bg-slate-900">
                    <MapGenerator 
                        asset={selectedAsset || { name: internalImportTarget?.name || importTarget?.name }}
                        mapData={mapData} 
                        importTarget={internalImportTarget || importTarget}
                        onUpdateLayer={async (layerType, data) => {
                            if (selectedAsset) {
                                handleUpdateAssetLayer(selectedAsset, layerType, data);
                            } else if (layerType === 'baseMap' && (internalImportTarget || importTarget)) {
                                const target = internalImportTarget || importTarget;
                                setIsProcessingMap(true);
                                try {
                                    const targetMap = { ...target, id: target.mapId || target.id };
                                    const newMapId = await fulfillMapData({
                                        imgUrl: data,
                                        targetMap,
                                        campaignCode,
                                        skeleton: campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton,
                                        data: {
                                            ...campaignData,
                                            npcs: (campaignData?.npcs || []).filter(n => n && n.name),
                                            players: (campaignData?.players || []).filter(p => p && p.name)
                                        },
                                        aiHelper: localAiHelper,
                                        generateNpc: localGenerateNpc,
                                        updateCampaign,
                                        setProcessingStep: setProcessingStep
                                    });
                                    toast(`${target.name} is now Ready!`, "success");
                                    setProcessingStep('Populating Entities...');
                                    await new Promise(r => setTimeout(r, 3500));
                                    await updateCampaign({ activeMapId: newMapId });
                                    setInternalImportTarget(null);
                                    setSelectedAsset({ ...targetMap, url: data, isSkeletonMap: true, activeMapId: newMapId });
                                    setActiveTab('settings');
                                    handleAutoDetectGrid(data);
                                } catch (e) {
                                    console.error(e);
                                    toast("Fulfillment failed.", "error");
                                } finally {
                                    setIsProcessingMap(false);
                                    setProcessingStep('');
                                }
                            }
                        }} 
                    />
                </div>
            )}

            {activeTab === 'library' && (
                <>
                    <div className="flex-none p-4 border-b border-slate-800 flex gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleUpload}
                            className="hidden"
                            accept="image/png, image/jpeg, image/gif, image/webp, video/mp4, video/webm, .glb, .gltf"
                        />
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded flex items-center justify-center gap-2 shadow">
                            {isUploading ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="upload" size={14} />}
                            {isUploading ? "Uploading..." : "Upload Asset"}
                        </button>
                        
                        <input
                            type="file"
                            ref={importPresetRef}
                            onChange={handleImportPresetClick}
                            className="hidden"
                            accept=".json"
                        />
                        <button onClick={() => importPresetRef.current?.click()} disabled={isImporting} className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded flex items-center justify-center gap-2 shadow">
                            {isImporting ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="download" size={14} />}
                            {isImporting ? "Importing..." : "Import Preset"}
                        </button>
                    </div>

                    <div className="flex gap-2 p-2 px-4 border-b border-slate-800 bg-slate-900 overflow-x-auto no-scrollbar shrink-0">
                        {['All', 'Maps', 'Tokens', 'Props', 'Uncategorized'].map(cat => (
                            <button 
                                key={cat} 
                                onClick={() => setAssetCategory(cat)} 
                                className={`px-3 py-1 text-[10px] font-bold rounded-full whitespace-nowrap transition-colors ${assetCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-4">
                        
                        {/* CAMPAIGN ATLAS / MODULE SKELETON */}
                        {['Maps', 'All'].includes(assetCategory) && (campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton)?.chapters && (
                            <div className="mb-8 space-y-4">
                                <div className="flex items-center gap-2 border-b border-amber-500/30 pb-2 mb-4">
                                    <Icon name="book-open" className="text-amber-500" size={18} />
                                    <h3 className="text-lg font-bold text-amber-500 fantasy-font truncate">{(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton).title || 'Campaign Module'}</h3>
                                </div>
                                
                                {(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton).chapters.map(chapter => {
                                    const isExpanded = expandedChapters[chapter.id];
                                    return (
                                    <div key={chapter.id} className="bg-slate-900/60 rounded-xl border border-slate-800/80 mb-4 shadow-sm overflow-hidden">
                                        <div 
                                            className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition-colors"
                                            onClick={() => setExpandedChapters(prev => ({ ...prev, [chapter.id]: !prev[chapter.id] }))}
                                        >
                                            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                                <Icon name={isExpanded ? "folder-open" : "folder"} size={14} className="text-indigo-400 shrink-0" />
                                                <span className="truncate">{chapter.title}</span>
                                            </h4>
                                            <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={16} className="text-slate-500" />
                                        </div>
                                        {isExpanded && (
                                        <div className="p-3 pt-2 grid grid-cols-2 gap-3 border-t border-slate-800/50">
                                            {chapter.maps?.map(map => {
                                                const isMissing = map.status === 'missing';
                                                if (isMissing) {
                                                    return (
                                                        <div key={map.id} className="flex flex-col gap-1.5 group">
                                                            <div className="relative aspect-square rounded-lg transition-all duration-300 bg-indigo-950/20 border border-dashed border-indigo-500/40 hover:border-indigo-400 hover:bg-indigo-900/40 overflow-hidden shadow-inner">
                                                                <div 
                                                                    onClick={() => {
                                                                        setInternalImportTarget({ ...map, chapterId: chapter.id, mapId: map.id });
                                                                        setRedditQuery(map.name);
                                                                        setActiveTab('web');
                                                                        handleRedditSearch(map.name);
                                                                    }}
                                                                    className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
                                                                >
                                                                    <Icon name="search" size={20} className="text-indigo-400 mb-1 group-hover:scale-110 transition-transform" />
                                                                    <span className="text-[10px] font-bold text-indigo-300">Search Map</span>
                                                                </div>
                                                                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                                                                    <button 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setUploadTargetMap({ ...map, chapterId: chapter.id, mapId: map.id });
                                                                            mapFileInputRef.current?.click();
                                                                        }}
                                                                        className="bg-black/80 text-slate-300 hover:text-white p-1.5 rounded shadow-md border border-slate-700 hover:border-amber-500 transition-colors"
                                                                        title="Upload Custom Map"
                                                                    >
                                                                        <Icon name="upload" size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-xs font-bold text-slate-300 truncate px-1" title={map.name}>{map.name}</div>
                                                                <div className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Missing</div>
                                                            </div>
                                                        </div>
                                                    );
                                                } else {
                                                    const lowerUrl = (map.mapUrl || map.image || map.backgroundUrl || '').toLowerCase();
                                                    const lowerName = (map.name || '').toLowerCase();
                                                    const isAnimated = lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.gif') || lowerUrl.includes('data:video') || lowerUrl.includes('data:image/gif') || lowerName.includes('.mp4') || lowerName.includes('.webm') || lowerName.includes('.gif');

                                                    return (
                                                        <div key={map.id} className="flex flex-col gap-1.5 group">
                                                            <div 
                                                                className="relative aspect-square rounded-lg transition-all duration-300 bg-slate-900 border border-slate-700 hover:border-amber-500/80 shadow-md overflow-hidden cursor-pointer"
                                                                onClick={async () => {
                                                                    if (map.activeMapId) {
                                                                        if (updateCampaign) await updateCampaign({ activeMapId: map.activeMapId });
                                                                        if (onClose) onClose();
                                                                    } else {
                                                                        const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                        const isNew = await onSetBackground({ name: map.name, url: mapImg }, false);
                                                                        if (isNew && mapImg) {
                                                                            setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true });
                                                                            setActiveTab('settings');
                                                                            handleAutoDetectGrid(mapImg);
                                                                        } else {
                                                                            if (onClose) onClose();
                                                                        }
                                                                    }
                                                                }}
                                                            >
                                                                <ResolvedMapImage url={map.mapUrl || map.image || map.backgroundUrl} name={map.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                                                
                                                                {isAnimated && (
                                                                    <div className="absolute bottom-1 right-1 bg-black/60 text-amber-400 p-1.5 rounded backdrop-blur-sm pointer-events-none group-hover:opacity-0 transition-opacity shadow-md z-10" title="Animated Map">
                                                                        <Icon name="film" size={14} />
                                                                    </div>
                                                                )}

                                                                <div className="absolute top-1 left-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button onClick={async (e) => { 
                                                                        e.stopPropagation(); 
                                                                        if (map.activeMapId) {
                                                                            if (updateCampaign) await updateCampaign({ activeMapId: map.activeMapId });
                                                                            if (onClose) onClose();
                                                                        } else {
                                                                            const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                            const isNew = await onSetBackground({ name: map.name, url: mapImg }, false); 
                                                                            setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true });
                                                                            setActiveTab('settings');
                                                                            if (isNew && mapImg) {
                                                                                handleAutoDetectGrid(mapImg);
                                                                            }
                                                                        }
                                                                    }} className="bg-black/80 text-amber-500 hover:text-white p-1.5 rounded shadow-md" title={map.activeMapId ? "Load Map & Tokens" : "Set as Map Background"}>
                                                                        <Icon name="map" size={14}/>
                                                                    </button>
                                                                    {map.activeMapId && (
                                                                        <button onClick={(e) => { 
                                                                            e.stopPropagation(); 
                                                                            const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                            setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true }); 
                                                                            setActiveTab('settings'); 
                                                                        }} className="bg-black/80 text-cyan-400 hover:text-white p-1.5 rounded shadow-md" title="Map Settings">
                                                                            <Icon name="settings" size={14}/>
                                                                        </button>
                                                                    )}
                                                                    <button onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                        setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true }); 
                                                                        setActiveTab('ai'); 
                                                                    }} className="bg-black/80 text-purple-400 hover:text-white p-1.5 rounded shadow-md" title="Map Layers & Importers">
                                                                        <Icon name="layers" size={14}/>
                                                                    </button>
                                                                </div>
                                                                <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        const newName = prompt("Enter new name for map:", map.name);
                                                                        if (newName && newName !== map.name) {
                                                                            const newSkeleton = JSON.parse(JSON.stringify(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton));
                                                                            const chap = newSkeleton.chapters.find(c => c.id === chapter.id);
                                                                            const mapToUpdate = chap?.maps.find(m => m.id === map.id);
                                                                            if (mapToUpdate) {
                                                                                mapToUpdate.name = newName;
                                                                                if (updateCampaign) updateCampaign({ moduleSkeleton: newSkeleton });
                                                                            }
                                                                        }
                                                                    }} className="bg-black/80 text-green-400 hover:text-white p-1.5 rounded shadow-md" title="Rename Map">
                                                                        <Icon name="pencil" size={14}/>
                                                                    </button>
                                                                    <button onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        if (confirm(`Remove "${map.name}" and mark as missing?`)) {
                                                                            const newSkeleton = JSON.parse(JSON.stringify(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton));
                                                                            const chap = newSkeleton.chapters.find(c => c.id === chapter.id);
                                                                            const mapToUpdate = chap?.maps.find(m => m.id === map.id);
                                                                            if (mapToUpdate) {
                                                                                mapToUpdate.status = 'missing';
                                                                                delete mapToUpdate.image;
                                                                                delete mapToUpdate.mapUrl;
                                                                                delete mapToUpdate.backgroundUrl;
                                                                                delete mapToUpdate.generatedHeightmapUrl;
                                                                                delete mapToUpdate.generatedNormalMapUrl;
                                                                                delete mapToUpdate.generatedMaterialMaskUrl;
                                                                                delete mapToUpdate.generatedFeatures;
                                                                                if (updateCampaign) updateCampaign({ moduleSkeleton: newSkeleton });
                                                                                
                                                                                if (selectedAsset?.id === map.id) {
                                                                                    setSelectedAsset(null);
                                                                                    if (activeTab === 'settings' || activeTab === 'ai') {
                                                                                        setActiveTab('library');
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }} className="bg-black/80 text-red-500 hover:text-white p-1.5 rounded shadow-md" title="Delete Map Data">
                                                                        <Icon name="trash" size={14}/>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-xs font-bold text-slate-200 truncate px-1 group-hover:text-amber-400" title={map.name}>{map.name}</div>
                                                                <div className="text-[9px] text-green-500 font-mono uppercase tracking-widest mt-0.5">Ready</div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })}
                                            {(!chapter.maps || chapter.maps.length === 0) && (
                                                <div className="col-span-full text-slate-500 text-sm italic">No maps required for this chapter.</div>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                )})}
                                
                                <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mt-8 mb-4">
                                    <Icon name="globe" className="text-slate-400" size={18} />
                                    <h3 className="text-lg font-bold text-slate-200 fantasy-font">Sandbox Assets</h3>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            {['Tokens', 'All'].includes(assetCategory) && allCharacters?.map((char) => {
                                return (
                                    <div key={`actor-${char.id}`} draggable 
                                        onDragStart={(e) => {
                                            const payload = JSON.stringify({ format: 'dungeonmind-character', type: 'pc', id: char.id, name: char.name, image: char.avatarUrl || char.imageUrl });
                                            e.dataTransfer.setData('application/dungeonmind-character', payload);
                                            e.dataTransfer.setData('text/plain', payload);
                                        }}
                                        className="aspect-square bg-slate-800 rounded border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-amber-500 transition-colors relative group"
                                    >
                                        <CharacterThumbnail char={char} />
                                        <div className="absolute inset-x-0 bottom-0 bg-black/80 text-[10px] text-white p-1 truncate font-bold text-center pointer-events-none">{char.name}</div>
                                        <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteCharacter(char); }} className="bg-black/80 text-red-500 hover:text-white p-1.5 rounded shadow-md" title="Delete Token">
                                                <Icon name="trash" size={14}/>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {assets.filter(a => assetCategory === 'All' || (a.category || 'Uncategorized') === assetCategory).map((asset) => {
                                const lowerUrl = (asset.url || '').toLowerCase();
                                const lowerName = (asset.name || '').toLowerCase();
                                const isAnimated = lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.gif') || lowerUrl.includes('data:video') || lowerUrl.includes('data:image/gif') || lowerName.includes('.mp4') || lowerName.includes('.webm') || lowerName.includes('.gif');
                                
                                return (
                                <div key={asset.id} draggable 
                                    onClick={() => {
                                        if (onSelectStamper) onSelectStamper(asset);
                                    }}
                                    onDragStart={(e) => {
                                        const payload = JSON.stringify({ format: 'dungeonmind-asset', url: asset.url, is3D: asset.is3D, modelUrl: asset.modelUrl, category: asset.category, name: asset.name });
                                        e.dataTransfer.setData('application/dungeonmind-asset', payload);
                                        e.dataTransfer.setData('text/plain', payload);
                                    }}
                                    className="aspect-square bg-slate-800 rounded border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-amber-500 transition-colors relative group"
                                >
                                    <AssetThumbnail asset={asset} />
                                    {isAnimated && (
                                        <div className="absolute top-1 right-1 bg-black/60 text-amber-400 p-1.5 rounded backdrop-blur-sm pointer-events-none group-hover:opacity-0 transition-opacity shadow-md z-10" title="Animated Asset">
                                            <Icon name="film" size={14} />
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{asset.name}</div>
                                    <div className="absolute top-1 left-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {asset.category !== 'Props' && asset.category !== 'Tokens' && (
                                            <>
                                                <button onClick={async (e) => { 
                                                    e.stopPropagation();
                                                    const target = internalImportTarget || importTarget;
                                                    if (target) {
                                                        setIsProcessingMap(true);
                                                        setProcessingStep(`Fulfilling ${target.name}...`);
                                                        try {
                                                            const targetMap = { ...target, id: target.mapId || target.id };
                                                            const newMapId = await fulfillMapData({
                                                                imgUrl: asset.generatedMapUrl || asset.url,
                                                                targetMap,
                                                                campaignCode,
                                                                skeleton: campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton,
                                                                data: {
                                                                    ...campaignData,
                                                                    npcs: (campaignData?.npcs || []).filter(n => n && n.name),
                                                                    players: (campaignData?.players || []).filter(p => p && p.name)
                                                                },
                                                                aiHelper: localAiHelper,
                                                                generateNpc: localGenerateNpc,
                                                                updateCampaign,
                                                                setProcessingStep: setProcessingStep
                                                            });
                                                            toast(`${targetMap.name} is now Ready!`, "success");
                                                            setProcessingStep('Populating Entities...');
                                                            await new Promise(r => setTimeout(r, 3500));
                                                            if (updateCampaign) await updateCampaign({ activeMapId: newMapId });
                                                            setInternalImportTarget(null);
                                                            setSelectedAsset({ ...targetMap, url: asset.generatedMapUrl || asset.url, isSkeletonMap: true, activeMapId: newMapId });
                                                            setActiveTab('settings');
                                                            handleAutoDetectGrid(asset.generatedMapUrl || asset.url);
                                                        } catch (err) {
                                                            console.error(err);
                                                            toast("Fulfillment failed.", "error");
                                                        } finally {
                                                            setIsProcessingMap(false);
                                                            setProcessingStep('');
                                                        }
                                                    } else {
                                                        const isNew = await onSetBackground(asset, false); 
                                                        if (isNew) {
                                                            setSelectedAsset(asset);
                                                            setActiveTab('settings');
                                                            handleAutoDetectGrid(asset.generatedMapUrl || asset.url);
                                                        } else {
                                                            if (onClose) onClose();
                                                        }
                                                    }
                                                }} className="bg-black/80 text-amber-500 hover:text-white p-1.5 rounded shadow-md" title={internalImportTarget || importTarget ? "Use Asset for Missing Map" : "Set as Map Background"}>
                                                    <Icon name={internalImportTarget || importTarget ? "check" : "map"} size={14}/>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setSelectedAsset(asset); setActiveTab('ai'); }} className="bg-black/80 text-purple-400 hover:text-white p-1.5 rounded shadow-md" title="Map Layers & Importers">
                                                    <Icon name="layers" size={14}/>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const newName = prompt("Enter new name for asset:", asset.name);
                                            if (newName && newName !== asset.name) {
                                                const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
                                                updateDoc(assetRef, { name: newName }).then(() => {
                                                    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, name: newName } : a));
                                                }).catch(err => {
                                                    console.error("Error renaming asset", err);
                                                    alert("Failed to rename asset.");
                                                });
                                            }
                                        }} className="bg-black/80 text-green-400 hover:text-white p-1.5 rounded shadow-md" title="Rename Asset">
                                            <Icon name="pencil" size={14}/>
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset); }} className="bg-black/80 text-red-500 hover:text-white p-1.5 rounded shadow-md" title="Delete Asset">
                                            <Icon name="trash" size={14}/>
                                        </button>
                                    </div>
                                    <div className="absolute bottom-5 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <select 
                                            value={asset.category || 'Uncategorized'} 
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
                                                updateDoc(assetRef, { category: e.target.value }).then(() => {
                                                    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, category: e.target.value } : a));
                                                });
                                            }}
                                            onClick={e => e.stopPropagation()}
                                            className="bg-black/80 text-[8px] font-bold uppercase text-slate-300 border border-slate-700 rounded px-1 outline-none w-20"
                                        >
                                            <option value="Uncategorized">Uncategorized</option>
                                            <option value="Maps">Maps</option>
                                            <option value="Tokens">Tokens</option>
                                            <option value="Props">Props</option>
                                        </select>
                                    </div>
                                </div>
                                );
                            })}
                            {assets.filter(a => assetCategory === 'All' || (a.category || 'Uncategorized') === assetCategory).length === 0 && (!['Tokens', 'All'].includes(assetCategory) || !allCharacters || allCharacters.length === 0) && !isUploading && (
                                <div className="col-span-2 text-center text-slate-500 text-sm mt-10 flex flex-col items-center"><Icon name={assetCategory === 'Tokens' ? 'users' : 'image'} size={32} className="opacity-20 mb-2" /> No {assetCategory === 'Tokens' ? 'tokens' : 'assets'} available.</div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'settings' && (
                 <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-4 space-y-6">

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Map Name</label>
                        <input
                            type="text"
                            value={mapData?.name || ''}
                            placeholder="Unnamed Map"
                            onChange={(e) => updateMap(campaignCode, activeMapId, { name: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm outline-none focus:border-amber-500 shadow-inner"
                        />
                    </div>

                    {(() => {
                        const bg = mapData?.backgroundUrl || mapData?.mapUrl || mapData?.image || selectedAsset?.url || '';
                        const name = mapData?.name || selectedAsset?.name || '';
                        const lowerBg = bg.toLowerCase();
                        const lowerName = name.toLowerCase();
                        const isAnimated = lowerBg.includes('.mp4') || lowerBg.includes('.webm') || lowerBg.includes('.gif') || lowerBg.includes('data:video') || lowerBg.includes('data:image/gif') || lowerName.includes('.mp4') || lowerName.includes('.webm') || lowerName.includes('.gif') || bg.startsWith('blob:') || bg.startsWith('chunked:');
                        if (isAnimated) {
                            return (
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Animation Playback Speed</label>
                                    <div className="flex items-center gap-2 mb-6">
                                        <ThrottledSlider 
                                            type="range" 
                                            min="0.1" 
                                            max="5" 
                                            step="0.1" 
                                            value={mapData?.playbackRate ?? 1} 
                                            onChange={(val) => throttledUpdateMap({ playbackRate: val })}
                                            className="w-full accent-amber-500 flex-1"
                                        />
                                        <input 
                                            type="number" 
                                            min="0.1" 
                                            max="5"
                                            step="0.1" 
                                            value={mapData?.playbackRate ?? 1} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (!isNaN(val)) throttledUpdateMap({ playbackRate: val });
                                            }}
                                            className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white text-right outline-none focus:border-amber-500"
                                        />
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}
                    
                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Auto-Detect (AI)</label>
                        <button 
                            onClick={handleAutoDetectGrid}
                            disabled={!mapData?.backgroundUrl || isDetectingGrid}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors shadow"
                        >
                            <Icon name="scan" size={14} /> Detect Grid Size & Alignment
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Environment & Lighting</label>
                        <select 
                            value={mapData?.environment || 'day'} 
                            onChange={(e) => updateMap(campaignCode, activeMapId, { environment: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs outline-none focus:border-amber-500 mb-4"
                        >
                            <option value="day">Sunny Day</option>
                            <option value="night">Midnight (Dark)</option>
                            <option value="sunset">Sunset / Sunrise</option>
                            <option value="fog">Thick Fog</option>
                            <option value="rain">Dreary Rain</option>
                            <option value="snow">Light Snow</option>
                            <option value="ash">Volcanic Ash</option>
                            <option value="spores">Magical Spores</option>
                            <option value="swamp">Gloomy Swamp</option>
                        </select>

                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 mt-4 tracking-wider">Ambient Life Effects</label>
                        <select 
                            value={mapData?.ambientLifeLevel || 'high'} 
                            onChange={(e) => {
                                const val = e.target.value;
                                const updates = { ambientLifeLevel: val };
                                if (val === 'off') {
                                    updates.particleDensity = 0;
                                } else if (mapData?.particleDensity === 0) {
                                    updates.particleDensity = 1;
                                }
                                updateMap(campaignCode, activeMapId, updates);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs outline-none focus:border-amber-500 mb-4"
                        >
                            <option value="off">Off (None)</option>
                            <option value="low">Low (Particles Only)</option>
                            <option value="high">High (Particles & Fauna)</option>
                        </select>

                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Ambient Ecosystem Biome</label>
                        <select 
                            value={mapData?.biomeType || 'forest'} 
                            onChange={(e) => updateMap(campaignCode, activeMapId, { biomeType: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs outline-none focus:border-amber-500 mb-4"
                        >
                            <option value="generic">Generic (Dust, Shadows)</option>
                            <option value="dungeon">Dungeon (Spores, Critters, Dust)</option>
                            <option value="forest">Forest (Leaves, Birds, Spores, Shadows)</option>
                            <option value="city">City (Dust, Birds, Critters, Shadows)</option>
                            <option value="coast">Coast (Birds, Shadows)</option>
                            <option value="desert">Desert (Dust, Shadows)</option>
                        </select>
                        
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Particle Density Multiplier</label>
                        <ThrottledSlider 
                            type="range" 
                            min="0" 
                            max="5" 
                            step="0.1" 
                            value={mapData?.particleDensity ?? 1.0} 
                            onChange={(val) => throttledUpdateMap({ particleDensity: val })}
                            className={`w-full accent-indigo-500 ${mapData?.ambientLifeLevel === 'off' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={mapData?.ambientLifeLevel === 'off'}
                        />
                        <div className="text-right text-xs text-slate-400 mt-1 mb-4">{mapData?.particleDensity ?? 1.0}x</div>

                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Brightness Multiplier</label>
                        <ThrottledSlider 
                            type="range" 
                            min="0" 
                            max="10" 
                            step="0.05" 
                            value={mapData?.lightingIntensity ?? 1} 
                            onChange={(val) => throttledUpdateMap({ lightingIntensity: val })}
                            className="w-full accent-amber-500" 
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData?.lightingIntensity ?? 1}x</div>
                    </div>
                    
                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Map Scale</label>
                        <input 
                            type="range" 
                            min="5" 
                            max="100" 
                            step="1" 
                            value={mapData?.scale || 20} 
                            onChange={(e) => {
                                const newScale = parseFloat(e.target.value);
                                const oldScale = mapData?.scale || 20;
                                const ratio = newScale / oldScale;

                                const updates = { scale: newScale };

                                if (mapData?.walls) {
                                    updates.walls = {};
                                    for (const [id, wall] of Object.entries(mapData.walls)) {
                                        updates.walls[id] = {
                                            ...wall,
                                            points: wall.points.map(p => ({
                                                ...p,
                                                x: p.x * ratio,
                                                z: p.z * ratio,
                                            }))
                                        };
                                    }
                                }

                                if (mapData?.lights) {
                                    updates.lights = {};
                                    for (const [id, light] of Object.entries(mapData.lights)) {
                                        updates.lights[id] = {
                                            ...light,
                                            position: {
                                                ...light.position,
                                                x: light.position.x * ratio,
                                                z: light.position.z * ratio,
                                            },
                                            radius: (light.radius || 15) * ratio,
                                        };
                                    }
                                }

                                throttledUpdateMap(updates);
                            }}
                            className="w-full accent-amber-500"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData?.scale || 20} units</div>
                    </div>
                    
                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Size</label>
                        <div className="flex items-center gap-2">
                            <ThrottledSlider 
                                type="range" 
                                min="0.1" 
                                max="5" 
                                step="0.01" 
                                value={mapData?.gridSize ?? 1} 
                                onChange={(val) => throttledUpdateMap({ gridSize: val })}
                                className="w-full accent-amber-500 flex-1"
                            />
                            <input 
                                type="number" 
                                min="0.1" 
                                step="0.01" 
                                value={mapData?.gridSize ?? 1} 
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) throttledUpdateMap({ gridSize: val });
                                }}
                                className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white text-right outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Offset X</label>
                        <div className="flex items-center gap-2">
                            <ThrottledSlider 
                                type="range" 
                                min="-5" 
                                max="5" 
                                step="0.01" 
                                value={mapData?.gridOffsetX ?? 0} 
                                onChange={(val) => throttledUpdateMap({ gridOffsetX: val })}
                                className="w-full accent-amber-500 flex-1"
                            />
                            <input 
                                type="number" 
                                step="0.01" 
                                value={mapData?.gridOffsetX ?? 0} 
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) throttledUpdateMap({ gridOffsetX: val });
                                }}
                                className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white text-right outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Offset Y</label>
                        <div className="flex items-center gap-2">
                            <ThrottledSlider 
                                type="range" 
                                min="-5" 
                                max="5" 
                                step="0.01" 
                                value={mapData?.gridOffsetY ?? 0} 
                                onChange={(val) => throttledUpdateMap({ gridOffsetY: val })}
                                className="w-full accent-amber-500 flex-1"
                            />
                            <input 
                                type="number" 
                                step="0.01" 
                                value={mapData?.gridOffsetY ?? 0} 
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) throttledUpdateMap({ gridOffsetY: val });
                                }}
                                className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white text-right outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Color</label>
                        <div className="flex gap-2 items-center">
                            <input 
                                type="color" 
                                value={mapData?.gridColor || '#888888'} 
                                onChange={(e) => throttledUpdateMap({ gridColor: e.target.value })}
                                className="w-8 h-8 rounded cursor-pointer bg-slate-900 border border-slate-700 p-0.5"
                            />
                            <div className="flex-1 text-xs text-slate-400 uppercase">{mapData?.gridColor || '#888888'}</div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Thickness</label>
                        <ThrottledSlider 
                            type="range" 
                            min="0.5" 
                            max="5" 
                            step="0.5" 
                            value={mapData?.gridThickness || 0.5} 
                            onChange={(val) => throttledUpdateMap({ gridThickness: val })}
                            className="w-full accent-amber-500"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData?.gridThickness || 0.5}x</div>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Token Elevation Offset</label>
                        <div className="flex items-center gap-2">
                            <ThrottledSlider 
                                type="range" 
                                min="-0.5" 
                                max="0.5" 
                                step="0.01" 
                                value={mapData?.tokenElevationOffset ?? 0.04} 
                                onChange={(val) => throttledUpdateMap({ tokenElevationOffset: val })}
                                className="w-full accent-amber-500 flex-1"
                            />
                            <input 
                                type="number" 
                                step="0.01" 
                                value={mapData?.tokenElevationOffset ?? 0.04} 
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) throttledUpdateMap({ tokenElevationOffset: val });
                                }}
                                className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white text-right outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Visibility</label>
                        <button
                            onClick={() => updateMap(campaignCode, activeMapId, { showGrid: mapData?.showGrid === false ? true : false })}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${mapData?.showGrid !== false ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400' : 'border-slate-600 text-slate-300 hover:border-cyan-500'}`}
                        >
                            <Icon name={mapData?.showGrid !== false ? "grid" : "layout-grid"} size={14} className="inline mr-1" />
                            {mapData?.showGrid !== false ? 'Grid is VISIBLE' : 'Grid is HIDDEN'}
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Token Snapping</label>
                        <button
                            onClick={() => updateMap(campaignCode, activeMapId, { isSnapToGrid: mapData?.isSnapToGrid === false ? true : false })}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${mapData?.isSnapToGrid !== false ? 'border-green-500 bg-green-900/20 text-green-400' : 'border-slate-600 text-slate-300 hover:border-green-500'}`}
                        >
                            <Icon name="magnet" size={14} className="inline mr-1" />
                            {mapData?.isSnapToGrid !== false ? 'Snap to Grid is ON' : 'Snap to Grid is OFF'}
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Nameplates</label>
                        <button
                            onClick={() => updateMap(campaignCode, activeMapId, { showNameplates: mapData?.showNameplates === false ? true : false })}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${mapData?.showNameplates !== false ? 'border-blue-500 bg-blue-900/20 text-blue-400' : 'border-slate-600 text-slate-300 hover:border-blue-500'}`}
                        >
                            <Icon name={mapData?.showNameplates !== false ? "eye" : "eye-off"} size={14} className="inline mr-1" />
                            {mapData?.showNameplates !== false ? 'Nameplates Visible' : 'Nameplates Hidden'}
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Fog of War (Vision)</label>
                        <button
                            onClick={() => updateMap(campaignCode, activeMapId, { fowEnabled: mapData?.fowEnabled === true ? false : true })}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${mapData?.fowEnabled ? 'border-indigo-500 bg-indigo-900/20 text-indigo-400' : 'border-slate-600 text-slate-300 hover:border-indigo-500'}`}
                        >
                            <Icon name={mapData?.fowEnabled ? "eye-off" : "eye"} size={14} className="inline mr-1" />
                            {mapData?.fowEnabled ? 'Fog of War is ON' : 'Fog of War is OFF'}
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Fog of War Walls</label>
                        <button
                            onClick={() => updateMap(campaignCode, activeMapId, { fowWallsEnabled: mapData?.fowWallsEnabled === true ? false : true })}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${mapData?.fowWallsEnabled ? 'border-indigo-500 bg-indigo-900/20 text-indigo-400' : 'border-slate-600 text-slate-300 hover:border-indigo-500'}`}
                        >
                            <Icon name={mapData?.fowWallsEnabled ? "eye-off" : "eye"} size={14} className="inline mr-1" />
                            {mapData?.fowWallsEnabled ? 'FoW Walls are ON' : 'FoW Walls are OFF'}
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Player Door Visibility</label>
                        <button
                            onClick={() => updateMap(campaignCode, activeMapId, { playerDoorVisibility: mapData?.playerDoorVisibility === true ? false : true })}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${mapData?.playerDoorVisibility ? 'border-indigo-500 bg-indigo-900/20 text-indigo-400' : 'border-slate-600 text-slate-300 hover:border-indigo-500'}`}
                        >
                            <Icon name={mapData?.playerDoorVisibility ? "eye" : "eye-off"} size={14} className="inline mr-1" />
                            {mapData?.playerDoorVisibility ? 'Player Door Visibility is ON' : 'Player Door Visibility is OFF'}
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">3D Mini Bases</label>
                        <button
                            onClick={() => updateMap(campaignCode, activeMapId, { hide3DTokenBases: mapData?.hide3DTokenBases !== false ? false : true })}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${mapData?.hide3DTokenBases !== false ? 'border-indigo-500 bg-indigo-900/20 text-indigo-400' : 'border-slate-600 text-slate-300 hover:border-indigo-500'}`}
                        >
                            <Icon name={mapData?.hide3DTokenBases !== false ? "eye-off" : "eye"} size={14} className="inline mr-1" />
                            {mapData?.hide3DTokenBases !== false ? '3D Bases are HIDDEN' : '3D Bases are VISIBLE'}
                        </button>
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">3D Heightmap Scale</label>
                        <ThrottledSlider 
                            type="range" 
                            min="0" 
                            max="10" 
                            step="0.1" 
                            value={mapData?.heightScale || 1} 
                            onChange={(val) => throttledUpdateMap({ heightScale: val })}
                            className="w-full accent-blue-500"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData?.heightScale || 1}x multiplier</div>
                        
                        <button onClick={() => updateMap(campaignCode, activeMapId, { heightmapUrl: null, heightScale: 1 })} className="w-full py-2 border border-red-900/50 rounded text-center text-xs font-bold text-red-400 hover:bg-red-900/20 hover:text-red-300 hover:border-red-500 mt-4 transition-colors">
                            <Icon name="trash-2" size={14} className="inline mr-1" /> Remove Heightmap
                        </button>
                        
                        {mapData?.normalMapUrl && (
                            <button onClick={() => updateMap(campaignCode, activeMapId, { normalMapUrl: null })} className="w-full py-2 border border-red-900/50 rounded text-center text-xs font-bold text-red-400 hover:bg-red-900/20 hover:text-red-300 hover:border-red-500 mt-4 transition-colors">
                                <Icon name="trash-2" size={14} className="inline mr-1" /> Remove Normal Map
                            </button>
                        )}
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Export & Backup</label>
                        <button onClick={handleExportPreset} disabled={isExporting} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors border border-slate-700 shadow">
                            {isExporting ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="save" size={14} />}
                            {isExporting ? "Packaging Preset..." : "Export Map Preset"}
                        </button>
                        <p className="text-[10px] text-slate-500 text-center mt-2 leading-tight">Exports a shareable JSON file containing the current map image, 3D heightmaps, lighting, walls, tokens, and character sheets.</p>
                    </div>
                </div>
            )}

            <input 
                type="file" 
                ref={mapFileInputRef} 
                onChange={handleMapUpload} 
                accept="image/*, video/mp4, video/webm" 
                className="hidden" 
            />
        </div>
    );
};

const TabButton = ({ name, activeTab, onClick, icon, children }) => (
    <button
        onClick={() => onClick(name)}
        className={`flex-1 p-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === name ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
    >
        <Icon name={icon} size={16} />
        {children}
    </button>
);

export default AssetManager;
