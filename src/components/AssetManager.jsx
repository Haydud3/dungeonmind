import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { storeChunkedMap, deleteChunkedMap } from '../utils/storageUtils';
import Icon from './Icon';
import MapGenerator from './MapGenerator';

// Helper to generate a lightweight thumbnail so the gallery loads instantly
const generateThumbnail = (dataUrl) => {
    return new Promise((resolve) => {
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
        img.src = dataUrl;
    });
};

const AssetManager = ({ campaignCode, mapData, activeMapId, updateMap, onClose, onSetBackground, onSetHeightmap, onGenerateMap, isSnapToGrid, setIsSnapToGrid }) => {
    const [assets, setAssets] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [activeTab, setActiveTab] = useState('library');

    // Re-sync if the prop changes from parent clicks
    // Removed useEffect

    // Fetch all previously uploaded images from this campaign's folder
    const fetchAssets = async () => {
        if (!campaignCode) return;
        const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
        const q = query(assetsRef, orderBy('createdAt', 'desc'));
        try {
            const res = await getDocs(q);
            setAssets(res.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (e) {
            console.error("Error fetching assets", e);
        }
    };

    useEffect(() => {
        if (activeTab === 'library') {
            fetchAssets();
        }
    }, [campaignCode, activeTab]);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64 = reader.result;
                    const thumbBase64 = await generateThumbnail(base64);
                    
                    // Chunk and store the high-res file in the database
                    const chunkedId = await storeChunkedMap(base64, file.name);
                    
                    // Save the reference and the thumbnail to the campaign's directory
                    const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
                    await addDoc(assetsRef, { name: file.name, url: chunkedId, thumbnail: thumbBase64, createdAt: serverTimestamp() });
                    
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

    const handleDeleteAsset = async (asset) => {
        if (!confirm(`Permanently delete "${asset.name}"?`)) return;

        try {
            // 1. Delete the firestore document from the campaign's assets collection
            const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
            await deleteDoc(assetRef);

            // 2. Delete the chunked data
            await deleteChunkedMap(asset.url);
            
            // 3. (Optional but good) Delete the thumbnail if it exists
            if (asset.thumbnailId) {
                await deleteChunkedMap(asset.thumbnailId);
            }

            // 4. Refresh asset list
            setAssets(prev => prev.filter(a => a.id !== asset.id));

        } catch (err) {
            console.error("Error deleting asset:", err);
            alert("Failed to delete asset.");
        }
    }

    return (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="map" size={18} /> Map Editor</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18} /></button>
            </div>

            <div className="flex-none border-b border-slate-800 flex overflow-x-auto no-scrollbar">
                <TabButton name="settings" activeTab={activeTab} onClick={setActiveTab} icon="sliders-horizontal">Settings</TabButton>
                <TabButton name="library" activeTab={activeTab} onClick={setActiveTab} icon="library">Assets</TabButton>
            </div>
            
            {activeTab === 'settings' && mapData && updateMap && (
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
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
                        </select>
                        
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Brightness Multiplier</label>
                        <input 
                            type="range" 
                            min="0" 
                            max="10" 
                            step="0.05" 
                            value={mapData?.lightingIntensity ?? 1} 
                            onChange={(e) => updateMap(campaignCode, activeMapId, { lightingIntensity: parseFloat(e.target.value) })}
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
                            value={mapData.scale || 20} 
                            onChange={(e) => updateMap(campaignCode, activeMapId, { scale: parseFloat(e.target.value) })}
                            className="w-full accent-amber-500"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData.scale || 20} units</div>
                    </div>
                    
                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Grid Size</label>
                        <input 
                            type="range" 
                            min="0.5" 
                            max="5" 
                            step="0.5" 
                            value={mapData.gridSize || 1} 
                            onChange={(e) => updateMap(campaignCode, activeMapId, { gridSize: parseFloat(e.target.value) })}
                            className="w-full accent-amber-500"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData.gridSize || 1}x</div>
                    </div>

                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">Token Snapping</label>
                        <button
                            onClick={() => setIsSnapToGrid(!isSnapToGrid)}
                            className={`w-full py-2 border rounded text-center text-xs font-bold transition-colors flex items-center justify-center gap-2 ${isSnapToGrid ? 'border-green-500 bg-green-900/20 text-green-400' : 'border-slate-600 text-slate-300 hover:border-green-500'}`}
                        >
                            <Icon name="magnet" size={14} className="inline mr-1" />
                            {isSnapToGrid ? 'Snap to Grid is ON' : 'Snap to Grid is OFF'}
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

                    <div className="border-t border-slate-800 pt-4">
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2 tracking-wider">3D Heightmap Scale</label>
                        <input 
                            type="range" 
                            min="0" 
                            max="10" 
                            step="0.1" 
                            value={mapData?.heightScale || 1} 
                            onChange={(e) => updateMap(campaignCode, activeMapId, { heightScale: parseFloat(e.target.value) })}
                            className="w-full accent-blue-500"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{mapData.heightScale || 1}x multiplier</div>
                        
                        <button onClick={() => updateMap(campaignCode, activeMapId, { heightmapUrl: null, heightScale: 1 })} className="w-full py-2 border border-red-900/50 rounded text-center text-xs font-bold text-red-400 hover:bg-red-900/20 hover:text-red-300 hover:border-red-500 mt-4 transition-colors">
                            <Icon name="trash-2" size={14} className="inline mr-1" /> Remove Heightmap
                        </button>
                    </div>

                    <MapGenerator onGenerateMap={({ backgroundUrl, heightmapUrl, features }) => {
                        const updates = { backgroundUrl, heightmapUrl };
                        if (features) {
                            updates.walls = { ...mapData?.walls, ...features.walls };
                            updates.lights = features.lights; // Overwrite lights, don't merge
                        }
                        updateMap(campaignCode, activeMapId, updates);
                    }} />
                </div>
            )}
            
            {activeTab === 'settings' && (!mapData || !updateMap) && (
                <div className="flex-1 p-4 text-center text-slate-500 text-sm mt-10">No map active.</div>
            )}

            {activeTab === 'library' && (
                <>
                    <div className="p-4 border-b border-slate-800">
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded flex items-center justify-center gap-2">
                            {isUploading ? <Icon name="loader" size={16} className="animate-spin" /> : <Icon name="upload" size={16} />}
                            {isUploading ? "Uploading..." : "Upload Asset"}
                        </button>
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleUpload} />
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scroll p-4 grid grid-cols-2 gap-2 content-start">
                        {assets.map((asset, i) => (
                            <div key={i} draggable 
                                onDragStart={(e) => {
                                    const payload = JSON.stringify({ format: 'dungeonmind-asset', url: asset.url });
                                    e.dataTransfer.setData('application/dungeonmind-asset', payload);
                                    e.dataTransfer.setData('text/plain', payload);
                                }}
                                className="aspect-square bg-slate-800 rounded border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-amber-500 transition-colors relative group"
                            >
                                <img src={asset.thumbnail || asset.url} className="w-full h-full object-cover" alt={asset.name} draggable={false} />
                                <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{asset.name}</div>
                                <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {onSetBackground && (
                                    <button onClick={(e) => { e.stopPropagation(); onSetBackground(asset.url); }} className="bg-black/80 text-amber-500 hover:text-white p-1.5 rounded shadow-md" title="Set as Map Background">
                                        <Icon name="map" size={14}/>
                                    </button>
                                    )}
                                    {onSetBackground && (
                                        <button onClick={(e) => { e.stopPropagation(); onSetBackground(asset.url); setActiveTab('settings'); }} className="bg-black/80 text-purple-400 hover:text-white p-1.5 rounded shadow-md" title="Generate Terrain">
                                            <Icon name="mountain" size={14}/>
                                        </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset); }} className="bg-black/80 text-red-500 hover:text-white p-1.5 rounded shadow-md" title="Delete Asset">
                                        <Icon name="trash" size={14}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {assets.length === 0 && !isUploading && (
                            <div className="col-span-2 text-center text-slate-500 text-sm mt-10 flex flex-col items-center"><Icon name="image" size={32} className="opacity-20 mb-2" /> No assets uploaded yet.</div>
                        )}
                    </div>
                </>
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