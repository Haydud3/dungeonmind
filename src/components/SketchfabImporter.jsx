import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import { storeChunkedMap } from '../utils/storageUtils';

export const SketchfabImporter = ({ onSelectStamper, onImportCompleted }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [token, setToken] = useState(localStorage.getItem('sketchfabToken') || '');
    const [isSearching, setIsSearching] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [showTokenInput, setShowTokenInput] = useState(!token);

    useEffect(() => {
        if (token) localStorage.setItem('sketchfabToken', token);
    }, [token]);

    const handleSearch = async () => {
        if (!query) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error("Search failed");
            const data = await res.json();
            setResults(data.results);
        } catch (e) {
            console.error(e);
            alert("Search failed. Try again.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleDownload = async (model) => {
        if (!token) {
            setShowTokenInput(true);
            alert("You need a Sketchfab API Token to download models.");
            return;
        }

        setIsDownloading(true);
        setDownloadStatus('Requesting download link...');
        try {
            const res = await fetch(`https://api.sketchfab.com/v3/models/${model.uid}/download`, {
                headers: {
                    'Authorization': `Token ${token}`
                }
            });

            if (res.status === 401 || res.status === 403) {
                setShowTokenInput(true);
                throw new Error("Invalid API Token. Please check your Sketchfab settings.");
            }

            if (!res.ok) throw new Error("Failed to get download link. The model might not be downloadable with your account tier.");
            
            const data = await res.json();
            const glbUrl = data.glb?.url;
            
            if (!glbUrl) throw new Error("No GLB format available for this model.");

            setDownloadStatus('Downloading 3D Mesh (this may take a moment)...');
            const glbRes = await fetch(glbUrl);
            const blob = await glbRes.blob();

            setDownloadStatus('Saving to Realm Database...');
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            
            reader.onloadend = async () => {
                try {
                    const chunkedUrl = await storeChunkedMap(reader.result, `${model.name.substring(0, 20)}_glb`);
                    
                    const thumbUrl = model.thumbnails?.images?.[0]?.url || '';
                    const safeThumbUrl = thumbUrl ? `https://wsrv.nl/?url=${encodeURIComponent(thumbUrl)}&cors=1` : '';

                    if (onSelectStamper) {
                        onSelectStamper({
                            name: model.name,
                            url: chunkedUrl,
                            modelUrl: chunkedUrl,
                            image: safeThumbUrl,
                            is3D: true,
                        });
                    }
                    if (onImportCompleted) onImportCompleted({
                        name: model.name,
                        url: chunkedUrl,
                        modelUrl: chunkedUrl,
                        image: safeThumbUrl,
                        is3D: true
                    });
                } catch (storeErr) {
                    console.error(storeErr);
                    alert("Failed to store the model. It might be too large.");
                } finally {
                    setIsDownloading(false);
                    setDownloadStatus('');
                }
            };
            
        } catch (e) {
            console.error(e);
            alert(e.message);
            setIsDownloading(false);
            setDownloadStatus('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden">
            {showTokenInput && (
                <div className="p-4 bg-amber-900/30 border-b border-amber-700/50">
                    <h4 className="text-amber-500 font-bold mb-2 flex items-center gap-2"><Icon name="key" size={16}/> Sketchfab API Token Required</h4>
                    <p className="text-xs text-slate-300 mb-3">To download models, you need an API token from your Sketchfab account. Go to your Sketchfab Settings {'->'} Passwords & API to find it.</p>
                    <div className="flex gap-2">
                        <input 
                            type="password" 
                            placeholder="Enter API Token..." 
                            value={token} 
                            onChange={e => setToken(e.target.value)} 
                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-amber-500"
                        />
                        <button onClick={() => setShowTokenInput(false)} className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 rounded">Save</button>
                    </div>
                </div>
            )}

            <div className="p-4 border-b border-slate-800 flex gap-2 shrink-0 bg-slate-950">
                <input 
                    autoFocus
                    placeholder="Search Free 3D Models..." 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                />
                <button onClick={handleSearch} disabled={isSearching} className="bg-blue-600 hover:bg-blue-500 px-4 rounded font-bold flex items-center justify-center">
                    {isSearching ? <Icon name="loader" className="animate-spin" /> : <Icon name="search" />}
                </button>
                <button onClick={() => setShowTokenInput(p => !p)} className="bg-slate-800 hover:bg-slate-700 px-3 rounded text-slate-400 hover:text-white" title="API Key Settings">
                    <Icon name="settings" size={16} />
                </button>
            </div>

            {isDownloading && (
                <div className="p-4 bg-blue-900/40 border-b border-blue-800/50 flex items-center gap-3">
                    <Icon name="loader" className="animate-spin text-blue-400" />
                    <span className="text-sm font-bold text-blue-300">{downloadStatus}</span>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scroll">
                {results.length === 0 && !isSearching && query && (
                    <div className="text-center text-slate-500 italic py-8">No results found.</div>
                )}
                {results.length === 0 && !isSearching && !query && (
                    <div className="text-center text-slate-500 italic py-8">Search for items like "Crate", "Tree", "Statue", etc.</div>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                    {results.map(model => {
                        const thumb = model.thumbnails?.images?.find(i => i.width > 200)?.url || model.thumbnails?.images?.[0]?.url;
                        return (
                            <div key={model.uid} className="bg-slate-800 rounded border border-slate-700 overflow-hidden group flex flex-col relative">
                                <div className="aspect-square bg-slate-900 relative">
                                    {thumb ? <img src={thumb} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" /> : <div className="w-full h-full flex items-center justify-center"><Icon name="box" /></div>}
                                    
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                        <button 
                                            disabled={isDownloading}
                                            onClick={() => handleDownload(model)}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded text-xs flex items-center justify-center gap-1"
                                        >
                                            <Icon name="download" size={14}/> Add to Map
                                        </button>
                                    </div>
                                </div>
                                <div className="p-2 flex-1">
                                    <div className="text-xs font-bold text-white truncate" title={model.name}>{model.name}</div>
                                    <div className="text-[10px] text-slate-400 truncate">by {model.user?.username}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SketchfabImporter;