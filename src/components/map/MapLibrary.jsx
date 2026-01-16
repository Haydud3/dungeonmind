import React, { useState } from 'react';
import Icon from '../Icon';

// Config constants should ideally be in a .env file, but keeping consistency with existing code
const GOOGLE_SEARCH_CX = "c38cb56920a4f45df"; 
const GOOGLE_SEARCH_KEY = "AIzaSyBooM1Sk4A37qkWwADGXqwToVGRYgFOeY8"; 

const MapLibrary = ({ savedMaps, onClose, loadMap, deleteMap, apiKey }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [mapUploadUrl, setMapUploadUrl] = useState("");

    const handleSearch = async () => { 
        if(!searchQuery.trim()) return; 
        setIsSearching(true); 
        try { 
            const r = await fetch(`https://customsearch.googleapis.com/customsearch/v1?key=${apiKey||GOOGLE_SEARCH_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(searchQuery + " dnd battlemap top down")}&searchType=image&num=6&imgSize=large`); 
            const j = await r.json(); 
            setSearchResults(j.items ? j.items.map(i => i.link) : []); 
        } catch(e) { setSearchResults([]); } 
        setIsSearching(false); 
    };

    return (
        <div className="absolute top-14 left-2 z-50 w-80 bg-slate-900/95 backdrop-blur border border-slate-600 rounded-lg shadow-2xl flex flex-col max-h-[85%] overflow-hidden animate-in slide-in-from-left-2">
            <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                <span className="font-bold text-slate-200">Map Library</span>
                <button onClick={onClose}><Icon name="x" size={16}/></button>
            </div>
            
            <div className="p-4 border-b border-slate-700 space-y-3">
                <div className="flex gap-1">
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search (e.g. 'Cave')" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"/>
                    <button onClick={handleSearch} className="bg-indigo-600 px-2 rounded text-white"><Icon name="search" size={14}/></button>
                </div>
                
                {isSearching ? <div className="text-center text-xs py-2 text-slate-400">Searching...</div> : (
                    searchResults.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                            {searchResults.map(url => (
                                <img key={url} src={url} onClick={() => loadMap(url, searchQuery)} className="w-full h-16 object-cover rounded cursor-pointer border border-slate-600 hover:border-amber-500" alt="Result"/>
                            ))}
                        </div>
                    ) : (
                        <div className="text-[10px] text-slate-500 bg-slate-800/50 p-2 rounded text-center">Enter search term or paste URL below.</div>
                    )
                )}

                <div className="flex gap-2">
                    <input value={mapUploadUrl} onChange={e => setMapUploadUrl(e.target.value)} placeholder="Paste Image URL" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"/>
                    <button onClick={() => { if(mapUploadUrl) { loadMap(mapUploadUrl, "Uploaded Map"); setMapUploadUrl(""); } }} className="bg-green-700 px-2 rounded text-white text-xs font-bold">Add</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {savedMaps.map(m => (
                    <div key={m.id} className="group relative flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-2 rounded border border-slate-700">
                        <div onClick={() => loadMap(m.url, m.name)} className="flex-1 flex items-center gap-3 cursor-pointer">
                            <img src={m.url} className="w-10 h-10 object-cover rounded bg-black" alt="Saved Map"/>
                            <div className="text-xs font-bold text-slate-200 truncate">{m.name}</div>
                        </div>
                        <button onClick={(e) => deleteMap(m.id, e)} className="p-1.5 text-slate-500 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            <Icon name="trash-2" size={14}/>
                        </button>
                    </div>
                ))}
                {savedMaps.length === 0 && <div className="text-center text-xs text-slate-500 py-4">No saved maps.</div>}
            </div>
        </div>
    );
};

export default MapLibrary;