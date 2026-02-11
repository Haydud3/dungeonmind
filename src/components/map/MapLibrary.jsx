import React, { useState, useRef } from 'react';
import Icon from '../Icon';
import { storeMapWithThumbnail } from '../../utils/storageUtils';
import { compressImage } from '../../utils/imageCompressor';

const GOOGLE_SEARCH_CX = "c38cb56920a4f45df"; 
const GOOGLE_SEARCH_KEY = "AIzaSyA6PqsRueHv17l4hvldnAo4dFMgeyqoPCM"; 

const MapLibrary = ({ savedMaps, onSelect, onClose, onDelete }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isLinkMode, setIsLinkMode] = useState(false); 
    const [linkUrl, setLinkUrl] = useState(""); 
    const fileInputRef = useRef(null);

    const handleSearch = async (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!searchTerm.trim()) return;
        
        setIsSearching(true);
        try {
            // 1. IMPROVED QUERY: Gridless + High Res + No Isometric
            const optimizedQuery = `${searchTerm} battlemap gridless high res -isometric`;
            const url = `https://customsearch.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(optimizedQuery)}&searchType=image&num=9&imgSize=large`;
            
            const res = await fetch(url);
            const json = await res.json();

            if (json.error) {
                alert(`Search Error: ${json.error.message}`);
                setSearchResults([]);
            } else if (json.items && json.items.length > 0) {
                // 2. STANDARDIZED PAYLOAD: Generate unique temp IDs and set isNew flag
                const standardizedResults = json.items.map((i, index) => ({ 
                    id: `search-${Date.now()}-${index}`, 
                    name: (i.title || "Untitled Map").substring(0, 35) + "...", 
                    url: i.link,
                    isNew: true, // Crucial for Phase 3 Persistence logic
                    walls: [],
                    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true, snap: true }
                }));
                setSearchResults(standardizedResults);
            } else {
                setSearchResults([]);
                alert("No maps found. Try simpler keywords.");
            }
        } catch (e) {
            console.error("Search failed", e); 
        }
        setIsSearching(false);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            // Phase 1: Generate Dual Assets
            // 1. The "Full" Texture (4K WebP)
            const fullBase64 = await compressImage(file, 4096, 0.8);
            
            // 2. The "LOD" Thumbnail (512px WebP)
            const thumbBase64 = await compressImage(file, 512, 0.5);
            
            // Store both in Firestore
            const { fullId, thumbId } = await storeMapWithThumbnail(fullBase64, thumbBase64, file.name);
            
            // Standardized payload with isNew flag
            onSelect({ 
                id: Date.now(), 
                name: file.name, 
                url: fullId,
                thumbnailUrl: thumbId,
                isNew: true,
                walls: [],
                grid: { size: 50, offsetX: 0, offsetY: 0, visible: true, snap: true }
            });
        } catch (e) {
            console.error("Upload failed", e);
            // START CHANGE: Debug Error
            console.log("[DEBUG] Upload FAILED during processing or Firebase call.");
            // END CHANGE
            alert("Upload failed. Check console for details."); 
        }
        setIsUploading(false);
    };

    const handleLinkSubmit = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!linkUrl.trim()) return;

        // Standardized payload with isNew flag
        onSelect({ 
            id: `link-${Date.now()}`, 
            name: "Linked Map (" + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ")", 
            url: linkUrl,
            isNew: true,
            walls: [],
            grid: { size: 50, offsetX: 0, offsetY: 0, visible: true, snap: true }
        });

        setLinkUrl("");
        setIsLinkMode(false);
    };

    const triggerFileInput = (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    return (
        <div 
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()} // Prevents map interaction
        >
            <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col shadow-2xl relative overflow-hidden pointer-events-auto">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                            <Icon name="map" className="text-amber-500" size={24}/>
                        </div>
                        <h2 className="text-2xl font-bold text-white fantasy-font">Map Archives</h2>
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto relative z-[160]">
                        {/* NEW: Clear Map Button */}
                        <button 
                            onClick={() => onSelect({ url: null })}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-400 hover:text-white bg-red-900/20 hover:bg-red-600 border border-red-900/50 rounded-lg transition-all"
                            title="Clear map from board"
                        >
                            <Icon name="map-off" size={16}/>
                            <span className="hidden sm:inline">No Map</span>
                        </button>

                        <form onSubmit={handleSearch} className="relative flex-1 md:w-64">
                            <input 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                placeholder="Search Web..." 
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-4 pr-12 text-sm text-white focus:border-amber-500 outline-none pointer-events-auto"
                            />
                            <button 
                                type="submit"
                                disabled={isSearching}
                                className="absolute right-2 top-1.5 p-1.5 text-slate-500 hover:text-amber-500 transition-colors pointer-events-auto"
                            >
                                {isSearching ? <Icon name="loader" size={20} className="animate-spin"/> : <Icon name="search" size={20}/>}
                            </button>
                        </form>

                        <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden relative">
                            {isLinkMode ? (
                                <form onSubmit={handleLinkSubmit} className="flex animate-in slide-in-from-right-2">
                                    <input 
                                        autoFocus
                                        value={linkUrl}
                                        onChange={e => setLinkUrl(e.target.value)}
                                        placeholder="Paste Image URL..."
                                        className="bg-transparent px-3 py-2 text-xs text-white outline-none w-48"
                                    />
                                    <button type="submit" className="bg-green-600 hover:bg-green-500 px-3 text-white">
                                        <Icon name="check" size={16}/>
                                    </button>
                                    <button type="button" onClick={() => setIsLinkMode(false)} className="bg-slate-700 hover:bg-slate-600 px-3 text-slate-300">
                                        <Icon name="x" size={16}/>
                                    </button>
                                </form>
                            ) : (
                                <>
                                    <button 
                                        onClick={triggerFileInput}
                                        disabled={isUploading}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 transition-colors border-r border-slate-700"
                                    >
                                        {isUploading ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="upload" size={18}/>}
                                        <span className="hidden sm:inline">Upload</span>
                                    </button>
                                    <button 
                                        onClick={() => setIsLinkMode(true)}
                                        className="px-3 py-2 text-indigo-400 hover:text-white hover:bg-indigo-600 transition-all"
                                        title="Add by Link"
                                    >
                                        <Icon name="link" size={18}/>
                                    </button>
                                </>
                            )}
                        </div>
                        
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleFileUpload}
                        />

                        <button 
                            onClick={onClose} 
                            className="text-slate-400 hover:text-white p-2.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors pointer-events-auto"
                        >
                            <Icon name="x" size={24}/>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scroll space-y-10 bg-slate-950/30">
                    
                    {searchResults.length > 0 && (
                        <div className="space-y-4 animate-in slide-in-from-top-4">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                    <Icon name="globe" size={14}/> Web Results
                                </h3>
                                <button onClick={() => setSearchResults([])} className="text-[10px] text-slate-500 hover:text-white uppercase font-bold">Clear</button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {searchResults.map((map) => (
                                    <div 
                                        key={map.id} 
                                        className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-amber-500 cursor-pointer transition-all shadow-md pointer-events-auto" 
                                        onClick={() => onSelect(map)}
                                    >
                                        <img src={map.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={map.name} loading="lazy" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60"></div>
                                        <div className="absolute bottom-3 left-3 right-3">
                                            <div className="text-xs font-bold text-white truncate">{map.name}</div>
                                            <div className="text-[10px] text-amber-500/80 font-mono mt-0.5">Click to Project</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                            <Icon name="folder" size={14}/> Saved in Campaign ({savedMaps.length})
                        </h3>
                        {savedMaps.length === 0 ? (
                            <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl">
                                <p className="text-slate-500 text-sm italic">The library is empty.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {savedMaps.map(map => (
                                    <div 
                                        key={map.id} 
                                        className="group relative aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500 cursor-pointer transition-all shadow-md pointer-events-auto" 
                                        onClick={() => onSelect(map)}
                                    >
                                        <img src={map.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={map.name} />
                                        
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-20">
                                            <button 
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    const newName = prompt("Enter map name:", map.name);
                                                    if (newName) onDelete({ action: 'rename', id: map.id, name: newName }); 
                                                }} 
                                                className="p-2 bg-slate-800/90 text-white rounded-lg hover:bg-indigo-600 shadow-xl pointer-events-auto"
                                                title="Rename map"
                                            >
                                                <Icon name="pencil" size={16}/>
                                            </button>
                                            <button 
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    if (confirm("Delete this map permanently?")) onDelete(map.id); 
                                                }} 
                                                className="p-2 bg-red-900/90 text-white rounded-lg hover:bg-red-600 shadow-xl pointer-events-auto"
                                            >
                                                <Icon name="trash-2" size={16}/>
                                            </button>
                                        </div>

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"></div>
                                        <div className="absolute bottom-3 left-3 right-3 text-xs font-bold text-white truncate">{map.name}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapLibrary;