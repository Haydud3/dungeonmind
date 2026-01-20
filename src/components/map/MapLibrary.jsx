import React, { useState } from 'react';
import Icon from '../Icon';

const GOOGLE_SEARCH_CX = "c38cb56920a4f45df"; 
const GOOGLE_SEARCH_KEY = "AIzaSyBooM1Sk4A37qkWwADGXqwToVGRYgFOeY8"; 

const MapLibrary = ({ savedMaps, onClose, loadMap, deleteMap, onAddMap, apiKey }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // 1. Upload Logic
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const formData = new FormData();
        formData.append('image', file);
        
        // FIX: Use Base64 Data URI so the image persists after refresh
        // Blob URLs (createObjectURL) are temporary and vanish on reload.
        if (!apiKey) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const url = reader.result; // This is the persistent Base64 string
                const name = prompt("Map Name:", file.name.split('.')[0]);
                if (name) onAddMap({ id: Date.now(), name, url });
                setIsUploading(false);
            };
            return;
        }

        try {
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                const name = prompt("Map Name:", file.name.split('.')[0]);
                if (name) onAddMap({ id: Date.now(), name, url: data.data.url });
            }
        } catch (err) { alert("Upload Error"); }
        setIsUploading(false);
    };

    // 2. Search Logic (Restored)
    const handleSearch = async () => { 
        if(!searchQuery.trim()) return; 
        setIsSearching(true); 
        try { 
            const r = await fetch(`https://customsearch.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(searchQuery + " dnd battlemap top down")}&searchType=image&num=10&imgSize=large`); 
            const j = await r.json(); 
            setSearchResults(j.items ? j.items.map(i => i.link) : []); 
        } catch(e) { setSearchResults([]); } 
        setIsSearching(false); 
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl relative">
                
                {/* Header & Search */}
                <div className="p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-xl space-y-3">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Icon name="map" className="text-indigo-400"/> Map Library</h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                    </div>
                    
                    {/* Search Bar */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Icon name="search" size={16} className="absolute left-3 top-2.5 text-slate-500"/>
                            <input 
                                value={searchQuery} 
                                onChange={e => { setSearchQuery(e.target.value); if(e.target.value === "") setSearchResults([]); }}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="Search web for maps (e.g. 'Volcano Lair')..." 
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                            />
                        </div>
                        {searchResults.length > 0 && (
                            <button onClick={() => { setSearchResults([]); setSearchQuery(""); }} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 rounded-lg text-xs font-bold">Clear</button>
                        )}
                        <button onClick={handleSearch} disabled={isSearching} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded-lg text-sm font-bold flex items-center gap-2">
                            {isSearching ? <Icon name="loader" className="animate-spin" size={16}/> : "Search"}
                        </button>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="flex-1 overflow-y-auto p-6 custom-scroll">
                    
                    {/* Mode: Web Search Results */}
                    {searchResults.length > 0 ? (
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Web Results</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {searchResults.map(url => (
                                    <div key={url} className="group relative aspect-video bg-slate-900 rounded-xl border border-slate-700 overflow-hidden hover:border-amber-500 transition-all cursor-pointer" 
                                        // FIX: Add to Library AND Load immediately
                                        onClick={() => {
                                            const newMap = { id: Date.now(), name: searchQuery || "Web Map", url, walls: [] };
                                            onAddMap(newMap); 
                                            // Pass ID so MapBoard knows which library entry to sync walls to
                                            loadMap(newMap.url, newMap.name, newMap.id); 
                                        }}
                                    >
                                        <img src={url} className="w-full h-full object-cover" loading="lazy" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <span className="text-white font-bold flex items-center gap-2"><Icon name="plus" size={16}/> Add & Load</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // Mode: Saved Library
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {/* Upload Card */}
                            <label className={`relative flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer group ${isUploading ? 'bg-slate-800 border-indigo-500 opacity-50' : 'bg-slate-800/30 border-slate-600 hover:border-indigo-400 hover:bg-slate-800'}`}>
                                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isUploading} />
                                {isUploading ? <Icon name="loader" className="animate-spin text-indigo-400 mb-2" size={32}/> : <Icon name="plus" className="text-slate-500 group-hover:text-indigo-400 mb-2" size={32}/>}
                                <span className="text-xs font-bold text-slate-400 group-hover:text-white uppercase tracking-wider">{isUploading ? "Uploading..." : "Upload Map"}</span>
                            </label>

                            {/* Saved Maps */}
                            {savedMaps.map(map => (
                                <div key={map.id} className="group relative aspect-video bg-slate-900 rounded-xl border border-slate-700 overflow-hidden hover:border-indigo-500 transition-all shadow-lg hover:shadow-indigo-500/20">
                                    <img src={map.url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                        <div className="font-bold text-white truncate text-sm mb-2">{map.name}</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => loadMap(map.url, map.name)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1"><Icon name="check" size={12}/> Load</button>
                                            <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete map?')) deleteMap(map.id); }} className="bg-red-900/80 hover:bg-red-700 text-white px-2 py-1.5 rounded"><Icon name="trash" size={12}/></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="p-3 border-t border-slate-700 bg-slate-800/30 text-center">
                    <p className="text-[10px] text-slate-500">Supported Formats: JPG, PNG, WEBP. Max 32MB.</p>
                </div>
            </div>
        </div>
    );
};

export default MapLibrary;