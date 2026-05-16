import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { storeChunkedMap, deleteChunkedMap, retrieveChunkedMap } from '../utils/storageUtils';
import { exportMapPreset, importMapPreset } from '../utils/presetManager';
import Icon from './Icon';
import SketchfabImporter from './SketchfabImporter';
import MapGenerator from './MapGenerator';
import ResolvedImage from './ResolvedImage'; // Add this import

import { useResolvedUrl } from '../utils/useResolvedUrl';

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

const ThrottledSlider = ({ value, min, max, step, onChange, onDragStart, onDragEnd, className }) => {
    const [localVal, setLocalVal] = useState(value);
    const isDragging = useRef(false);

    useEffect(() => { 
        if (!isDragging.current) setLocalVal(value); 
    }, [value]);

    return (
        <input 
            type="range" min={min} max={max} step={step} 
            value={localVal}
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

    if (resolvedUrl || (!asset.is3D && asset.url)) {
        return <img src={resolvedUrl || imgUrl} className="w-full h-full object-cover" alt={asset.name} draggable={false} />;
    }
    return <div className="w-full h-full flex items-center justify-center bg-slate-900 border border-slate-700"><Icon name="box" size={32} className="text-slate-600"/></div>;
};

const CharacterThumbnail = ({ char }) => {
    let imgUrl = char.avatarUrl || char.imageUrl;
    if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && !imgUrl.includes('firebasestorage.googleapis.com') && !imgUrl.includes('wsrv.nl')) {
        imgUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&cors=1&w=256`;
    }
    const resolvedUrl = useResolvedUrl(imgUrl);

    if (resolvedUrl) {
        return <img src={resolvedUrl} className="w-full h-full object-cover" alt={char.name} draggable={false} />;
    }
    return <div className="w-full h-full flex items-center justify-center bg-slate-900 border border-slate-700 text-slate-500"><Icon name="user" size={32}/></div>;
};

const AssetManager = ({ campaignCode, mapData, activeMapId, updateMap, onClose, onSetBackground, onSetHeightmap, onGenerateMap, onNewBlankMap, allCharacters, campaignData, updateCampaign, onSelectStamper }) => {
    const [assets, setAssets] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);
    const importPresetRef = useRef(null);
    const [activeTab, setActiveTab] = useState('library');
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [assetCategory, setAssetCategory] = useState('Maps');

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

        await updateDoc(assetRef, updates);
        
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
                gridThickness: mapData?.gridThickness || 1,
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

    const activeScaleData = useRef(null);

    return (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Loading Overlay */}
            {(isDetectingGrid || isImporting) && (
                <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
                    <Icon name="loader" className="animate-spin text-amber-500 mb-4" size={48} />
                    <h3 className="text-xl font-bold text-white mb-2">{isImporting ? 'Importing Preset...' : 'Analyzing Frequencies...'}</h3>
                    <p className="text-sm text-slate-400">{isImporting ? 'Please wait while assets are loaded and applied.' : 'Running Computer Vision Grid Detection'}</p>
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
                <TabButton name="library" activeTab={activeTab} onClick={setActiveTab} icon="library">Assets</TabButton>
                <TabButton name="sketchfab" activeTab={activeTab} onClick={setActiveTab} icon="globe">Sketchfab</TabButton>
                {activeTab === 'settings' && <TabButton name="settings" activeTab={activeTab} onClick={setActiveTab} icon="sliders-horizontal">Settings</TabButton>}
                {activeTab === 'ai' && <TabButton name="ai" activeTab={activeTab} onClick={setActiveTab} icon="layers">Layers</TabButton>}
            </div>
            
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

            {activeTab === 'ai' && selectedAsset && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scroll bg-slate-900">
                    <MapGenerator 
                        asset={selectedAsset}
                        mapData={mapData} 
                        onUpdateLayer={(layerType, data) => handleUpdateAssetLayer(selectedAsset, layerType, data)} 
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
                            accept="image/png, image/jpeg, image/gif, image/webp, .glb, .gltf"
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
                            {assets.filter(a => assetCategory === 'All' || (a.category || 'Uncategorized') === assetCategory).map((asset) => (
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
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{asset.name}</div>
                                    <div className="absolute top-1 left-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {asset.category !== 'Props' && asset.category !== 'Tokens' && (
                                            <>
                                                <button onClick={async (e) => { 
                                                    e.stopPropagation(); 
                                                    const isNew = await onSetBackground(asset, false); 
                                                    setSelectedAsset(asset);
                                                    setActiveTab('settings');
                                                    if (isNew) {
                                                        handleAutoDetectGrid(asset.generatedMapUrl || asset.url);
                                                    }
                                                }} className="bg-black/80 text-amber-500 hover:text-white p-1.5 rounded shadow-md" title="Set as Map Background">
                                                    <Icon name="map" size={14}/>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setSelectedAsset(asset); setActiveTab('settings'); }} className="bg-black/80 text-cyan-400 hover:text-white p-1.5 rounded shadow-md" title="Map Settings">
                                                    <Icon name="settings" size={14}/>
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
                            ))}
                            {assets.filter(a => assetCategory === 'All' || (a.category || 'Uncategorized') === assetCategory).length === 0 && (!['Tokens', 'All'].includes(assetCategory) || !allCharacters || allCharacters.length === 0) && !isUploading && (
                                <div className="col-span-2 text-center text-slate-500 text-sm mt-10 flex flex-col items-center"><Icon name={assetCategory === 'Tokens' ? 'users' : 'image'} size={32} className="opacity-20 mb-2" /> No {assetCategory === 'Tokens' ? 'tokens' : 'assets'} available.</div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'settings' && selectedAsset && (
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
                            value={mapData?.ambientLifeLevel || 'off'} 
                            onChange={(e) => updateMap(campaignCode, activeMapId, { ambientLifeLevel: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs outline-none focus:border-amber-500 mb-4"
                        >
                            <option value="off">Off (None)</option>
                            <option value="low">Low (Particles Only)</option>
                            <option value="high">High (Particles & Fauna)</option>
                        </select>

                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Ambient Ecosystem Biome</label>
                        <select 
                            value={mapData?.biomeType || 'generic'} 
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
                            className="w-full accent-indigo-500" 
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
                            value={mapData?.gridThickness || 1} 
                            onChange={(val) => throttledUpdateMap({ gridThickness: val })}
                            className="w-full accent-amber-500"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData?.gridThickness || 1}x</div>
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
