import React, { useState, useRef } from 'react';
import Icon from '../Icon';
import { uploadImage } from '../../utils/storageUtils';

const GOOGLE_SEARCH_CX = "c38cb56920a4f45df"; 
const GOOGLE_SEARCH_KEY = "AIzaSyBooM1Sk4A37qkWwADGXqwToVGRYgFOeY8"; 

const MapLibrary = ({ savedMaps, onSelect, onClose, onDelete }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://customsearch.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(searchTerm + " d&d battlemap vtt")}&searchType=image&num=9&imgSize=large`);
            const json = await res.json();
            if (json.items) setSearchResults(json.items.map(i => ({ id: i.link, name: i.title, url: i.link })));
        } catch (e) { console.error("Search failed", e); }
        setIsSearching(false);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const url = await uploadImage(file, `maps/${Date.now()}_${file.name}`);
            onSelect({ id: Date.now(), name: file.name, url });
        } catch (e) { alert("Upload failed."); }
        setIsUploading(false);
    };

    return (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col shadow-2xl relative overflow-hidden">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white fantasy-font flex items-center gap-2"><Icon name="map" className="text-amber-500"/> Map Archives</h2>
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <input 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="Search Web for Maps..." 
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-3 pr-10 text-sm text-white focus:border-amber-500 outline-none"
                            />
                            <button onClick={handleSearch} className="absolute right-2 top-2 text-slate-500 hover:text-amber-500">
                                {isSearching ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}
                            </button>
                        </div>
                        <button onClick={() => fileInputRef.current.click()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all">
                            {isUploading ? <Icon name="loader" size={16} className="animate-spin"/> : <Icon name="upload" size={16}/>}
                            <span className="hidden sm:inline">Upload</span>
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload}/>
                        <button onClick={onClose} className="text-slate-400 hover:text-white p-2"><Icon name="x" size={24}/></button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-8">
                    {/* Web Results */}
                    {searchResults.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2"><Icon name="globe" size={14}/> Web Results</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {searchResults.map(map => (
                                    <div key={map.id} className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-amber-500 cursor-pointer transition-all" onClick={() => onSelect(map)}>
                                        <img src={map.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                                        <div className="absolute bottom-2 left-3 right-3 text-xs font-bold text-white truncate">{map.name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Saved Maps Section */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Icon name="folder" size={14}/> Saved in Campaign</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {savedMaps.map(map => (
                                <div key={map.id} className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-amber-500 cursor-pointer transition-all" onClick={() => onSelect(map)}>
                                    <img src={map.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDelete(map.id); }} 
                                        className="absolute top-2 right-2 p-1.5 bg-red-900/90 text-white rounded opacity-0 group-hover:opacity-100 hover:bg-red-600"
                                    >
                                        <Icon name="trash-2" size={14}/>
                                    </button>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                                    <div className="absolute bottom-2 left-3 right-3 text-xs font-bold text-white truncate">{map.name}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapLibrary; // <--- ENSURE THIS LINE IS AT THE BOTTOM