import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { storeChunkedMap, deleteChunkedMap } from '../utils/storageUtils';
import Icon from './Icon';

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

const AssetManager = ({ campaignCode, onClose, onSetBackground, onSetHeightmap }) => {
    const [assets, setAssets] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

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
        fetchAssets();
    }, [campaignCode]);

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
                <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="image" size={18} /> Map Library</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18} /></button>
            </div>
            
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
                            {onSetHeightmap && (
                                <button onClick={(e) => { e.stopPropagation(); onSetHeightmap(asset.url); }} className="bg-black/80 text-blue-400 hover:text-white p-1.5 rounded shadow-md" title="Set as Heightmap">
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
        </div>
    );
};

export default AssetManager;