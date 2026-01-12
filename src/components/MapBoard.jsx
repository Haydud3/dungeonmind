import React, { useRef, useEffect, useState } from 'react';
import Icon from './Icon';
import Token from './Token';
import SheetContainer from './character-sheet/SheetContainer';
import { useCharacterStore } from '../stores/useCharacterStore';

const GRID_SIZE_DEFAULT = 5; 

// CONFIG
const GOOGLE_SEARCH_CX = "c38cb56920a4f45df"; 
const GOOGLE_SEARCH_KEY = "AIzaSyBooM1Sk4A37qkWwADGXqwToVGRYgFOeY8"; 

const MapBoard = ({ data, role, updateMapState, updateCloud, user, apiKey, onDiceRoll }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // --- STATE ---
    const [mode, setMode] = useState('move'); 
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(40);
    
    // Transform State
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Stage State
    const [stageDim, setStageDim] = useState({ w: 800, h: 600, left: 0, top: 0 }); 
    const [imgRatio, setImgRatio] = useState(1); 

    // Logic State
    const [dragTokenId, setDragTokenId] = useState(null); 
    const [tempTokenPos, setTempTokenPos] = useState(null); 
    const [dragStartPos, setDragStartPos] = useState(null); 
    const [selectedTokenId, setSelectedTokenId] = useState(null);
    const [activeSheetId, setActiveSheetId] = useState(null); 

    const [showTokenBar, setShowTokenBar] = useState(false);
    const [showMapBar, setShowMapBar] = useState(false); 
    
    // Grid State
    const [showGrid, setShowGrid] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [gridSize, setGridSize] = useState(GRID_SIZE_DEFAULT);
    const [measureStart, setMeasureStart] = useState(null); 
    const [measureEnd, setMeasureEnd] = useState(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [mapUploadUrl, setMapUploadUrl] = useState("");

    // Shortcuts
    const mapUrl = data.campaign?.activeMap?.url;
    const revealPaths = data.campaign?.activeMap?.revealPaths || [];
    const tokens = data.campaign?.activeMap?.tokens || []; 
    const savedMaps = data.campaign?.savedMaps || []; 

    // --- 1. SETUP ---
    useEffect(() => {
        if (!mapUrl) return;
        const img = new Image();
        img.src = mapUrl;
        img.onload = () => { if(img.height > 0) setImgRatio(img.width / img.height); };
    }, [mapUrl]);

    // Manual Zoom Listener
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handleWheelInternal = (e) => {
            e.preventDefault();
            const scaleBy = 1.1;
            let newZoom = e.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
            newZoom = Math.min(Math.max(0.5, newZoom), 5);
            setZoom(newZoom);
        };
        el.addEventListener('wheel', handleWheelInternal, { passive: false });
        return () => el.removeEventListener('wheel', handleWheelInternal);
    }, [zoom]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => {
            if (!containerRef.current) return;
            const parentW = containerRef.current.clientWidth;
            const parentH = containerRef.current.clientHeight;
            if (parentW === 0 || parentH === 0) return;
            let w = parentW;
            let h = parentW / imgRatio;
            if (h > parentH) { h = parentH; w = parentH * imgRatio; }
            setStageDim({ w, h, left: (parentW - w) / 2, top: (parentH - h) / 2 });
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, [imgRatio]);

    const cellPx = (stageDim.w * gridSize) / 100;
    const gridPctX = gridSize;
    const gridPctY = (stageDim.w / stageDim.h) * gridSize;

    // --- UTILS ---
    const getCoords = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect(); 
        const stageLeft = (rect.width - stageDim.w * zoom) / 2 + pan.x;
        const stageTop = (rect.height - stageDim.h * zoom) / 2 + pan.y;
        const x = (clientX - rect.left - stageLeft) / zoom;
        const y = (clientY - rect.top - stageTop) / zoom;
        return { x: x / stageDim.w, y: y / stageDim.h };
    };

    const snapCoordinate = (val, isY = false) => {
        if (!snapToGrid) return val;
        const cellPct = isY ? gridPctY : gridPctX;
        const cellCount = Math.floor(val * 100 / cellPct);
        const center = (cellCount * cellPct) + (cellPct / 2);
        return center / 100;
    };

    // Auto-Snap (Debounced)
    useEffect(() => {
        if(snapToGrid && tokens.length > 0 && stageDim.h > 0) {
            const timer = setTimeout(() => {
                const snappedTokens = tokens.map(t => {
                    const snX = snapCoordinate(t.x / 100, false) * 100;
                    const snY = snapCoordinate(t.y / 100, true) * 100;
                    if (Math.abs(snX - t.x) < 0.01 && Math.abs(snY - t.y) < 0.01) return t;
                    return { ...t, x: snX, y: snY };
                });
                if (JSON.stringify(snappedTokens) !== JSON.stringify(tokens)) {
                    updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: snappedTokens } } });
                }
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [gridSize, snapToGrid, imgRatio]);

    // --- INPUTS ---
    const handleDown = (e) => {
        if (mode === 'pan' || e.button === 2 || (e.button === 0 && e.getModifierState && e.getModifierState('Space'))) {
            setIsPanning(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); return;
        }
        const coords = getCoords(e);
        if (mode === 'ruler' || mode === 'radius') {
            const start = snapToGrid ? { x: snapCoordinate(coords.x, false), y: snapCoordinate(coords.y, true) } : coords;
            setMeasureStart(start); setMeasureEnd(start); setIsDrawing(true);
        } else if (role === 'dm' && (mode === 'reveal' || mode === 'shroud')) {
            setIsDrawing(true); updateMapState('start_path', { mode, size: brushSize * (1000/stageDim.w), points: [coords] });
        } else {
            setSelectedTokenId(null);
        }
    };

    const handleMove = (e) => {
        if (isPanning) { e.preventDefault(); setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); return; }
        const coords = getCoords(e);
        if (dragTokenId) { 
            e.preventDefault(); 
            setTempTokenPos({ x: coords.x * 100, y: coords.y * 100 }); 
        } else if (isDrawing) {
            if (mode === 'ruler' || mode === 'radius') {
                setMeasureEnd(snapToGrid ? { x: snapCoordinate(coords.x, false), y: snapCoordinate(coords.y, true) } : coords);
            } else if (role === 'dm') {
                e.preventDefault(); updateMapState('append_point', coords);
            }
        }
    };

    const handleUp = (e) => {
        if (isPanning) { setIsPanning(false); return; }
        const coords = getCoords(e);
        setIsDrawing(false);

        if (dragTokenId) {
            const dx = Math.abs(coords.x - dragStartPos.x);
            const dy = Math.abs(coords.y - dragStartPos.y);
            if (Math.hypot(dx, dy) < 0.005) {
                setSelectedTokenId(dragTokenId); 
            } else {
                let fx = coords.x;
                let fy = coords.y;
                if (snapToGrid) {
                    fx = snapCoordinate(fx, false);
                    fy = snapCoordinate(fy, true);
                }
                const newTokens = tokens.map(t => t.id === dragTokenId ? { ...t, x: fx * 100, y: fy * 100 } : t);
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: newTokens } } });
            }
            setDragTokenId(null); setDragStartPos(null); setTempTokenPos(null);
        } else if (mode === 'ruler' || mode === 'radius') {
            setMeasureStart(null); setMeasureEnd(null);
        }
    };

    const handleTokenDragStart = (e, id) => {
        e.stopPropagation(); e.preventDefault();
        setDragTokenId(id);
        const pos = getCoords(e);
        setDragStartPos(pos);
        setTempTokenPos({ x: pos.x * 100, y: pos.y * 100 }); 
    };

    // --- MANAGERS ---
    const addToken = (src, type) => {
        const nt = { id: Date.now(), x: 50, y: 50, name: src.name, image: src.image||'', type, size: 'medium', characterId: src.id||null, statuses: [] };
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: [...tokens, nt] } } });
        setShowTokenBar(false);
    };
    const updateTokenSize = (id, sz) => updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: tokens.map(t => t.id===id ? {...t, size: sz} : t) } } });
    const updateTokenStatus = (id, st) => {
        const t = tokens.find(x => x.id === id); if(!t) return;
        const s = t.statuses || [];
        const ns = s.includes(st) ? s.filter(x => x !== st) : [...s, st];
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: tokens.map(x => x.id===id ? {...x, statuses: ns} : x) } } });
    };
    const deleteToken = (id) => { if(confirm("Delete?")) updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: tokens.filter(t => t.id!==id) } } }); setSelectedTokenId(null); };
    
    // --- MAP LIBRARY FUNCTIONS ---
    const handleSearch = async () => {
        if(!searchQuery.trim()) return;
        setIsSearching(true);
        const key = apiKey || GOOGLE_SEARCH_KEY;
        try {
            const r = await fetch(`https://customsearch.googleapis.com/customsearch/v1?key=${key}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(searchQuery + " dnd battlemap top down")}&searchType=image&num=6&imgSize=large`);
            const j = await r.json();
            setSearchResults(j.items ? j.items.map(i => i.link) : []);
        } catch(e) { setSearchResults([]); }
        setIsSearching(false);
    };

    const loadMap = (url, name="New Map") => {
        // 1. Add to Saved Maps if not exists
        const exists = savedMaps.find(m => m.url === url);
        let newSavedMaps = savedMaps;
        if(!exists) {
            newSavedMaps = [...savedMaps, { id: Date.now(), name: name || `Map ${savedMaps.length+1}`, url }];
        }
        
        // 2. Load as Active Map
        const newActiveMap = { 
            url: url, 
            revealPaths: [], 
            tokens: [] // Option: Keep tokens? Usually better to clear on new map
        };

        updateCloud({ 
            ...data, 
            campaign: { 
                ...data.campaign, 
                savedMaps: newSavedMaps,
                activeMap: newActiveMap 
            } 
        });
        setShowMapBar(false);
    };

    const deleteMap = (id, e) => {
        e.stopPropagation();
        if(!confirm("Remove map from library?")) return;
        updateCloud({ ...data, campaign: { ...data.campaign, savedMaps: savedMaps.filter(m => m.id !== id) } });
    };

    const openTokenSheet = (tokenId) => {
        const token = tokens.find(t => t.id === tokenId);
        if (!token) return;
        const myCharId = data.assignments?.[user?.uid];
        if (role === 'dm' || token.characterId === myCharId) {
            const char = data.players?.find(p => p.id === token.characterId) || data.npcs?.find(n => n.id === token.characterId);
            if(char) { useCharacterStore.getState().loadCharacter(char); setActiveSheetId(char.id); setSelectedTokenId(null); } else { alert("No sheet attached."); }
        }
    };

    // --- RENDERERS ---
    const renderCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || stageDim.w <= 1) return;

        canvas.width = stageDim.w;
        canvas.height = stageDim.h;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // FOG
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 1)'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        revealPaths.forEach(path => {
            ctx.globalCompositeOperation = path.mode === 'shroud' ? 'source-over' : 'destination-out';
            const scaledBrush = (path.size / 1000) * canvas.width; 
            ctx.lineWidth = Math.max(10, scaledBrush); 
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.beginPath();
            path.points.forEach((p, i) => {
                const x = p.x * canvas.width;
                const y = p.y * canvas.height;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });

        // DYNAMIC VISION
        tokens.forEach(token => {
            let tx = token.x / 100;
            let ty = token.y / 100;
            if (dragTokenId === token.id && tempTokenPos) {
                tx = tempTokenPos.x / 100;
                ty = tempTokenPos.y / 100;
            }

            const char = data.players?.find(p => p.id === token.characterId);
            let visionRadiusFeet = 5; 
            if (char) {
                const senses = JSON.stringify(char.senses || "") + JSON.stringify(char.features || "");
                if (senses.match(/Darkvision\s*(\d+)/i)) visionRadiusFeet = parseInt(RegExp.$1);
                else if (senses.toLowerCase().includes("darkvision")) visionRadiusFeet = 60;
            }

            const totalMapFeet = (100 / gridSize) * 5; 
            const pixelsPerFoot = canvas.width / totalMapFeet;
            const radiusPx = visionRadiusFeet * pixelsPerFoot;

            ctx.globalCompositeOperation = 'destination-out';
            const x = tx * canvas.width;
            const y = ty * canvas.height;
            const gradient = ctx.createRadialGradient(x, y, radiusPx * 0.8, x, y, radiusPx);
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();

        // MEASUREMENTS
        if ((mode === 'ruler' || mode === 'radius') && measureStart && measureEnd) {
            const sx = measureStart.x * canvas.width;
            const sy = measureStart.y * canvas.height;
            const ex = measureEnd.x * canvas.width;
            const ey = measureEnd.y * canvas.height;
            const distPx = Math.sqrt(Math.pow(ex-sx,2) + Math.pow(ey-sy,2));
            const distFt = Math.round((distPx / cellPx) * 5);

            ctx.save();
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3 / zoom; ctx.setLineDash([10, 5]);
            ctx.beginPath();
            if(mode === 'ruler') {
                ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
            } else {
                ctx.arc(sx, sy, distPx, 0, 2*Math.PI); ctx.stroke();
                ctx.fillStyle = 'rgba(245, 158, 11, 0.2)'; ctx.fill();
                ctx.beginPath(); ctx.setLineDash([]); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
            }
            
            ctx.fillStyle = '#1e293b'; ctx.font = `bold ${16/zoom}px sans-serif`;
            const tm = ctx.measureText(`${distFt} ft`);
            const lx = mode==='ruler'?(sx+ex)/2:ex; const ly = mode==='ruler'?(sy+ey)/2:ey;
            ctx.fillRect(lx - tm.width/2 - 4, ly - 14, tm.width + 8, 28);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${distFt} ft`, lx, ly);
            ctx.restore();
        }
    };

    useEffect(() => { renderCanvas(); }, [revealPaths, measureStart, measureEnd, gridSize, mode, tokens, stageDim, zoom, tempTokenPos]);

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden relative">
            {/* Toolbar */}
            <div className="p-2 bg-slate-800 border-b border-slate-700 flex flex-wrap gap-2 items-center shrink-0 z-30 shadow-md">
                {role === 'dm' && (
                    <div className="flex gap-2">
                        {/* RESTORED: Maps Button */}
                        <button onClick={() => setShowMapBar(!showMapBar)} className={`px-3 py-1.5 rounded text-xs font-bold border ${showMapBar ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300'}`}><Icon name="map" size={14}/> Maps</button>
                    </div>
                )}
                
                <div className="flex bg-slate-900 rounded p-1 gap-1 border border-slate-700">
                    <button onClick={() => setMode('move')} className={`p-1.5 rounded ${mode==='move' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><Icon name="mouse-pointer-2" size={18}/></button>
                    <button onClick={() => setMode('pan')} className={`p-1.5 rounded ${mode==='pan' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><Icon name="hand" size={18}/></button>
                    <button onClick={() => setMode('ruler')} className={`p-1.5 rounded ${mode==='ruler' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}><Icon name="ruler" size={18}/></button>
                    <button onClick={() => setMode('radius')} className={`p-1.5 rounded ${mode==='radius' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}><Icon name="circle-dashed" size={18}/></button>
                    {role === 'dm' && <><div className="w-px bg-slate-700 mx-1"></div><button onClick={() => setMode('reveal')} className={`p-1.5 rounded ${mode==='reveal' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><Icon name="eraser" size={18}/></button><button onClick={() => setMode('shroud')} className={`p-1.5 rounded ${mode==='shroud' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><Icon name="brush" size={18}/></button></>}
                </div>
                <div className="flex bg-slate-900 rounded p-1 gap-1 border border-slate-700 items-center px-2">
                    <button onClick={() => setShowGrid(!showGrid)} className={`p-1 rounded ${showGrid ? 'text-green-400' : 'text-slate-500'}`}><Icon name="grid" size={18}/></button>
                    <button onClick={() => setSnapToGrid(!snapToGrid)} className={`p-1 rounded ${snapToGrid ? 'text-green-400' : 'text-slate-500'}`}><Icon name="magnet" size={18}/></button>
                    {showGrid && <input type="range" min="2" max="15" step="0.5" value={gridSize} onChange={e => setGridSize(parseFloat(e.target.value))} className="w-16 accent-green-500 h-1 bg-slate-700 rounded-lg cursor-pointer"/>}
                </div>
                <button onClick={() => setShowTokenBar(!showTokenBar)} className="p-1.5 px-3 rounded bg-slate-700 text-slate-300 flex items-center gap-2 text-xs font-bold hover:text-white"><Icon name="users" size={16}/> Tokens</button>
            </div>

            {/* RESTORED: Map Library Sidebar */}
            {showMapBar && (
                <div className="absolute top-14 left-2 z-50 w-80 bg-slate-900/95 backdrop-blur border border-slate-600 rounded-lg shadow-2xl flex flex-col max-h-[85%] overflow-hidden animate-in slide-in-from-left-2">
                    <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                        <span className="font-bold text-slate-200">Map Library</span>
                        <button onClick={() => setShowMapBar(false)}><Icon name="x" size={16}/></button>
                    </div>
                    
                    <div className="p-4 border-b border-slate-700 space-y-3">
                        {/* Search */}
                        <div className="flex gap-1">
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search (e.g. 'Cave')" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"/>
                            <button onClick={handleSearch} className="bg-indigo-600 px-2 rounded text-white"><Icon name="search" size={14}/></button>
                        </div>
                        
                        {/* Results */}
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

                        {/* URL Upload */}
                        <div className="flex gap-2">
                            <input value={mapUploadUrl} onChange={e => setMapUploadUrl(e.target.value)} placeholder="Paste Image URL" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"/>
                            <button onClick={() => { if(mapUploadUrl) { loadMap(mapUploadUrl, "Uploaded Map"); setMapUploadUrl(""); } }} className="bg-green-700 px-2 rounded text-white text-xs font-bold">Add</button>
                        </div>
                    </div>

                    {/* Saved Maps List */}
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
            )}

            {/* Token Bar */}
            {showTokenBar && (
                <div className="absolute top-14 right-2 md:left-32 md:right-auto z-40 w-64 bg-slate-900/95 backdrop-blur border border-slate-600 rounded-lg shadow-2xl flex flex-col max-h-[80%] overflow-hidden animate-in slide-in-from-left-2">
                    <div className="p-3 border-b border-slate-700 flex justify-between items-center"><span className="font-bold text-slate-200">Token Box</span><button onClick={() => setShowTokenBar(false)}><Icon name="x" size={16}/></button></div>
                    <div className="overflow-y-auto p-2 space-y-4">
                        <div><div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Quick Add</div><button onClick={() => addToken({name: "Monster", image: ""}, 'monster')} className="w-full bg-red-900/50 hover:bg-red-800 border border-red-700 rounded p-2 flex items-center gap-2 text-xs text-red-100">Generic Monster</button></div>
                        <div><div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Party</div><div className="grid grid-cols-2 gap-2">{data.players.map(p => (<div key={p.id} onClick={() => addToken(p, 'pc')} className="cursor-pointer bg-slate-800 hover:bg-slate-700 p-2 rounded border border-slate-700 flex flex-col items-center"><img src={p.image || `https://ui-avatars.com/api/?name=${p.name}`} className="w-8 h-8 rounded-full mb-1 object-cover"/><span className="text-[10px] truncate w-full text-center">{p.name}</span></div>))}</div></div>
                        <div><div className="text-[10px] uppercase font-bold text-slate-500 mb-2">NPCs</div><div className="space-y-1">{data.npcs.map(n => (<button key={n.id} onClick={() => addToken(n, 'npc')} className="w-full text-left text-xs p-2 hover:bg-slate-800 rounded truncate flex items-center gap-2"><Icon name="user" size={12}/> {n.name}</button>))}</div></div>
                    </div>
                </div>
            )}

            {/* Token Menu */}
            {selectedTokenId && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-500 rounded-full shadow-2xl p-2 flex gap-2 animate-in slide-in-from-bottom-2 items-center">
                    <button onClick={() => openTokenSheet(selectedTokenId)} title="Open Sheet" className="p-2 hover:bg-slate-800 rounded-full text-amber-400 bg-amber-900/20 border border-amber-600/50"><Icon name="scroll-text" size={20}/></button>
                    <div className="w-px h-6 bg-slate-700 mx-1"></div>
                    <button onClick={() => updateTokenStatus(selectedTokenId, 'dead')} className="p-2 hover:bg-slate-800 rounded-full text-white"><Icon name="skull" size={20}/></button>
                    <button onClick={() => updateTokenStatus(selectedTokenId, 'bloodied')} className="p-2 hover:bg-slate-800 rounded-full text-red-500"><Icon name="droplet" size={20}/></button>
                    <button onClick={() => updateTokenStatus(selectedTokenId, 'poisoned')} className="p-2 hover:bg-slate-800 rounded-full text-green-500"><Icon name="flask-conical" size={20}/></button>
                    <button onClick={() => updateTokenStatus(selectedTokenId, 'concentrating')} className="p-2 hover:bg-slate-800 rounded-full text-cyan-500"><Icon name="brain" size={20}/></button>
                    <div className="w-px h-6 bg-slate-700"></div>
                    <button onClick={() => updateTokenSize(selectedTokenId, 'medium')} className="text-xs font-bold text-white px-2 py-1 hover:bg-slate-800 rounded border border-slate-700">1x</button>
                    <button onClick={() => updateTokenSize(selectedTokenId, 'large')} className="text-xs font-bold text-white px-2 py-1 hover:bg-slate-800 rounded border border-slate-700">2x</button>
                    <button onClick={() => updateTokenSize(selectedTokenId, 'huge')} className="text-xs font-bold text-white px-2 py-1 hover:bg-slate-800 rounded border border-slate-700">3x</button>
                    <div className="w-px h-6 bg-slate-700"></div>
                    <button onClick={() => deleteToken(selectedTokenId)} className="p-2 hover:bg-red-900 rounded-full text-red-400"><Icon name="trash-2" size={20}/></button>
                    <button onClick={() => setSelectedTokenId(null)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400"><Icon name="x" size={20}/></button>
                </div>
            )}

            {/* Sheet Popup */}
            {activeSheetId && (
                <div className="absolute top-14 right-2 bottom-4 w-96 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right-10">
                    <SheetContainer characterId={activeSheetId} onSave={(updated) => { const isPc = data.players.some(p => p.id === updated.id); if(isPc) updateCloud({...data, players: data.players.map(p => p.id === updated.id ? updated : p)}); else updateCloud({...data, npcs: data.npcs.map(n => n.id === updated.id ? updated : n)}); }} onBack={() => setActiveSheetId(null)} onDiceRoll={onDiceRoll} onLogAction={(msg) => console.log(msg)} />
                </div>
            )}

            {/* Map Stage */}
            <div 
                ref={containerRef} 
                className={`flex-1 relative overflow-hidden flex items-center justify-center bg-black touch-none ${mode==='pan' || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
                onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp} onWheel={(e) => e.preventDefault()}
                onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
                onContextMenu={(e) => e.preventDefault()}
            >
                {mapUrl ? (
                    <div 
                        className="relative"
                        style={{
                            width: `${stageDim.w}px`,
                            height: `${stageDim.h}px`,
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center center',
                            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                        }}
                    >
                        <img src={mapUrl} className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none" draggable="false" alt="map"/>
                        {showGrid && <div className="absolute inset-0 w-full h-full pointer-events-none opacity-30" style={{backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`, backgroundSize: `${cellPx}px ${cellPx}px`}}/>}
                        <div className="absolute inset-0 w-full h-full pointer-events-none">
                            {tokens.map(token => {
                                const canMove = role === 'dm' || mode === 'move'; 
                                return (
                                    <div key={token.id} className="pointer-events-auto">
                                        <Token 
                                            token={token} isOwner={canMove} cellPx={cellPx}
                                            isDragging={dragTokenId === token.id}
                                            overridePos={dragTokenId === token.id ? tempTokenPos : null}
                                            onMouseDown={(e) => handleTokenDragStart(e, token.id)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full z-20 ${mode === 'move' || mode === 'pan' ? 'pointer-events-none opacity-90' : 'pointer-events-auto opacity-70'}`}/>
                    </div>
                ) : (
                    <div className="text-slate-500 flex flex-col items-center"><Icon name="map" size={48} className="mb-2 opacity-20"/><p>No Map Loaded</p></div>
                )}
            </div>
        </div>
    );
};

export default MapBoard;