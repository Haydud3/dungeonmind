import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import Icon from './Icon';
import Token from './Token';
import SheetContainer from './character-sheet/SheetContainer';
import { useCharacterStore } from '../stores/useCharacterStore';
import { calculateVisibilityPolygon } from '../utils/visionMath';

// --- SUB-COMPONENTS ---
import MapToolbar from './map/MapToolbar';
import MapLibrary from './map/MapLibrary';
import TokenManager from './map/TokenManager';
import TokenMenu from './map/TokenMenu';
import CompendiumModal from './map/CompendiumModal';

// --- CONFIG ---
const GRID_SIZE_DEFAULT = 5;

const MapBoard = ({ data, role, updateMapState, updateCloud, user, apiKey, onDiceRoll, savePlayer }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const gridSaveTimer = useRef(null);
    const viewSaveTimer = useRef(null);
    
    // Fix stale closures in event listeners
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    // --- STATE MANAGEMENT ---
    
    // Viewport
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [stageDim, setStageDim] = useState({ w: 0, h: 0 }); 
    const [isPanning, setIsPanning] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [pinchDist, setPinchDist] = useState(null);

    // Tools & Modes
    const [mode, setMode] = useState('move'); // move, pan, ruler, radius, wall, wall-erase, reveal, shroud
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(40);
    const [measureStart, setMeasureStart] = useState(null);
    const [measureEnd, setMeasureEnd] = useState(null);

    // Token Logic
    const [dragTokenId, setDragTokenId] = useState(null);
    const [tempTokenPos, setTempTokenPos] = useState(null);
    const [dragStartPos, setDragStartPos] = useState(null);
    const [selectedTokenId, setSelectedTokenId] = useState(null);
    const [activeSheetId, setActiveSheetId] = useState(null);

    // --- NEW: VISION & WALL STATE ---
    const [wallStart, setWallStart] = useState(null); // {x, y} start of current wall segment
    const [ghostWall, setGhostWall] = useState(null); // {x, y} current mouse pos for ghost line
    
    const walls = data.campaign?.activeMap?.walls || []; 
    const lightingMode = data.campaign?.activeMap?.lightingMode || 'daylight'; 

    // UI Panels
    const [showTokenBar, setShowTokenBar] = useState(false);
    const [showMapBar, setShowMapBar] = useState(false);
    const [showCompendium, setShowCompendium] = useState(false);

    // Grid Config
    const [showGrid, setShowGrid] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [gridSize, setGridSize] = useState(data.campaign?.activeMap?.gridSize || GRID_SIZE_DEFAULT);

    // --- DATA SYNC ---
    const mapUrl = data.campaign?.activeMap?.url;
    const revealPaths = data.campaign?.activeMap?.revealPaths || [];
    const tokens = data.campaign?.activeMap?.tokens || [];
    const savedMaps = data.campaign?.savedMaps || [];
    const cellPx = stageDim.w ? (stageDim.w * gridSize) / 100 : 0;
    
    // Identity Check
    const myCharId = data.assignments?.[user?.uid];
    const selectedToken = tokens.find(t => t.id === selectedTokenId);
    const canControlSelected = role === 'dm' || (selectedToken && selectedToken.characterId === myCharId);

    // --- SETUP EFFECTS ---
    useEffect(() => {
        if (data.campaign?.activeMap?.gridSize) setGridSize(data.campaign.activeMap.gridSize);
        if (data.campaign?.activeMap?.view) {
            setZoom(data.campaign.activeMap.view.zoom || 1);
            setPan(data.campaign.activeMap.view.pan || {x:0, y:0});
        }
    }, [data.campaign?.activeMap?.url]); 

    useEffect(() => {
        if (!mapUrl) return;
        const img = new Image();
        img.src = mapUrl;
        img.onload = () => { 
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (h > 0) setStageDim({ w, h });
        };
    }, [mapUrl]);

    // Initial Zoom Fit (Only if no saved view)
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el || stageDim.w === 0) return;
        if (data.campaign?.activeMap?.view) return; 

        const parentW = el.clientWidth;
        const parentH = el.clientHeight;
        if (parentW === 0 || parentH === 0) return;
        const fitZoom = Math.min((parentW * 0.95) / stageDim.w, (parentH * 0.95) / stageDim.h);
        if (zoom === 1) setZoom(fitZoom);
    }, [stageDim.w, stageDim.h]);

    // Auto-Center Player (The "Found You" Feature)
    useEffect(() => {
        if (role === 'dm' || !myCharId || stageDim.w === 0) return;
        const myToken = tokens.find(t => t.characterId === myCharId);
        if (myToken) {
            setTimeout(() => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                
                // Calculate center
                const tokenX = (myToken.x / 100) * stageDim.w * zoom;
                const tokenY = (myToken.y / 100) * stageDim.h * zoom;
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                setPan({
                    x: centerX - tokenX,
                    y: centerY - tokenY
                });
            }, 100);
        }
    }, [mapUrl, myCharId, stageDim.w]); 

    // Mouse Wheel Zoom
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handleWheelInternal = (e) => {
            e.preventDefault();
            const scaleBy = 1.1;
            let newZoom = e.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
            newZoom = Math.min(Math.max(0.1, newZoom), 10);
            setZoom(newZoom);
        };
        el.addEventListener('wheel', handleWheelInternal, { passive: false });
        return () => el.removeEventListener('wheel', handleWheelInternal);
    }, [zoom]);

    // --- ACTIONS ---
    const handleGridChange = (e) => {
        const val = parseFloat(e.target.value);
        setGridSize(val);
        if (gridSaveTimer.current) clearTimeout(gridSaveTimer.current);
        gridSaveTimer.current = setTimeout(() => {
            updateCloud({ ...dataRef.current, campaign: { ...dataRef.current.campaign, activeMap: { ...dataRef.current.campaign.activeMap, gridSize: val } } });
        }, 500);
    };

    useEffect(() => {
        if (viewSaveTimer.current) clearTimeout(viewSaveTimer.current);
        viewSaveTimer.current = setTimeout(() => {
            if(zoom === 1 && pan.x === 0 && pan.y === 0) return;
            updateCloud({ 
                ...dataRef.current, 
                campaign: { 
                    ...dataRef.current.campaign, 
                    activeMap: { 
                        ...dataRef.current.campaign.activeMap, 
                        view: { zoom, pan } 
                    } 
                } 
            });
        }, 1000);
    }, [zoom, pan]);

    // --- HELPER FUNCTIONS ---
    
    // 1. Get Mouse/Touch Coordinates relative to Map
    const getCoords = (e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if(!rect) return {x:0, y:0};
        
        let cx, cy;
        if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }

        const stageLeft = (rect.width - (stageDim.w * zoom)) / 2 + pan.x;
        const stageTop = (rect.height - (stageDim.h * zoom)) / 2 + pan.y;

        return {
            x: (cx - rect.left - stageLeft) / zoom / stageDim.w,
            y: (cy - rect.top - stageTop) / zoom / stageDim.h
        };
    };

    // 2. Snap Coordinates (Improved to CENTER of cell)
    const snapCoordinate = (val, isY = false) => {
        if (!snapToGrid || stageDim.w === 0) return val;
        const sizePx = (stageDim.w * gridSize) / 100;
        const totalPx = isY ? stageDim.h : stageDim.w;
        const currentPx = val * totalPx;
        const index = Math.floor(currentPx / sizePx);
        const centerPx = (index * sizePx) + (sizePx / 2);
        return centerPx / totalPx;
    };

    // 3. Wall Deletion Check
    const handleWallDelete = (clickPoint) => {
        const canvas = canvasRef.current;
        if(!canvas) return;
        const distToSegment = (p, v, w) => {
            const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
            if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
            let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
        };

        const threshold = 15 / (canvas.width * zoom); 
        const wallIndex = walls.findIndex(w => {
            if (!w.p1 || !w.p2) return false;
            return distToSegment(clickPoint, w.p1, w.p2) < threshold;
        });

        if (wallIndex !== -1) {
            const newWalls = [...walls];
            newWalls.splice(wallIndex, 1);
            updateCloud({
                ...dataRef.current,
                campaign: {
                    ...dataRef.current.campaign,
                    activeMap: { ...dataRef.current.campaign.activeMap, walls: newWalls }
                }
            });
        }
    };

    // 4. Token Menu Actions
    const updateTokenStatus = (tokenId, status) => {
        const newTokens = tokens.map(t => {
            if (t.id !== tokenId) return t;
            const current = t.statuses || [];
            const newStatuses = current.includes(status) 
                ? current.filter(s => s !== status) 
                : [...current, status];
            return { ...t, statuses: newStatuses };
        });
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: newTokens } } });
    };

    const updateTokenSize = (tokenId, size) => {
        const newTokens = tokens.map(t => t.id === tokenId ? { ...t, size } : t);
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: newTokens } } });
    };

    const deleteToken = (tokenId) => {
        if (!confirm("Remove this token?")) return;
        const newTokens = tokens.filter(t => t.id !== tokenId);
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: newTokens } } });
        setSelectedTokenId(null);
    };

    // 5. Toggle Lighting
    const toggleLighting = () => {
        const newMode = lightingMode === 'daylight' ? 'darkness' : 'daylight';
        updateCloud({
            ...dataRef.current,
            campaign: {
                ...dataRef.current.campaign,
                activeMap: { ...dataRef.current.campaign.activeMap, lightingMode: newMode }
            }
        });
    };

    // --- CANVAS RENDERER ---
    const renderCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || stageDim.w <= 1) return;

        // 1. Setup
        canvas.width = stageDim.w;
        canvas.height = stageDim.h;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        // 2. Base Layer (Fog of War)
        // DM sees 50% opacity fog to know where map is, Players see 100% black
        ctx.fillStyle = role === 'dm' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 1)'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 3. Render Legacy Fog (if exists)
        if (revealPaths && Array.isArray(revealPaths) && revealPaths.length > 0) {
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';
             revealPaths.forEach(path => {
                if (!path.points || !Array.isArray(path.points)) return; 
                ctx.globalCompositeOperation = path.mode === 'shroud' ? 'source-over' : 'destination-out';
                ctx.lineWidth = Math.max(10, (path.size / 1000) * canvas.width);
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                ctx.beginPath();
                const validPoints = path.points.filter(p => p && typeof p.x === 'number');
                validPoints.forEach((p, i) => { 
                    const x = p.x * canvas.width; 
                    const y = p.y * canvas.height; 
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); 
                });
                ctx.stroke();
            });
        }

        // 4. Dynamic Lighting & Vision
        const pixelWalls = walls.map(w => ({
            p1: { x: w.p1.x * canvas.width, y: w.p1.y * canvas.height },
            p2: { x: w.p2.x * canvas.width, y: w.p2.y * canvas.height }
        }));
        
        tokens.forEach(token => {
            // Permission Check: Who sees what?
            const isMyToken = token.characterId === myCharId;
            if (role !== 'dm' && !isMyToken) return; // Skip calculation for others

            let tx = token.x / 100; let ty = token.y / 100;
            if (dragTokenId === token.id && tempTokenPos) { tx = tempTokenPos.x / 100; ty = tempTokenPos.y / 100; }
            
            const char = data.players?.find(p => p.id === token.characterId);
            let visionRadiusFeet = 5;
            
            if (char?.senses?.darkvision) {
                visionRadiusFeet = char.senses.darkvision;
            } else if (char) {
                const s = JSON.stringify(char.senses||"")+JSON.stringify(char.features||"");
                if (s.toLowerCase().includes("darkvision")) visionRadiusFeet = 60;
                else visionRadiusFeet = 5;
            }

            const totalCellsX = 100 / gridSize;
            const pxPerCell = canvas.width / totalCellsX;
            const pxPerFoot = pxPerCell / 5;
            const radiusPx = visionRadiusFeet * pxPerFoot;
            const origin = { x: tx * canvas.width, y: ty * canvas.height };

            // Math
            const polygon = calculateVisibilityPolygon(origin, pixelWalls, { width: canvas.width, height: canvas.height });

            // Drawing
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            if (polygon.length > 0) {
                ctx.moveTo(polygon[0].x, polygon[0].y);
                for (let i = 1; i < polygon.length; i++) {
                    ctx.lineTo(polygon[i].x, polygon[i].y);
                }
                ctx.closePath();
            }

            if (lightingMode === 'daylight') {
                ctx.fill(); 
            } else {
                ctx.save();
                ctx.clip(); 
                ctx.beginPath();
                ctx.arc(origin.x, origin.y, radiusPx, 0, Math.PI * 2);
                ctx.fill(); 
                ctx.restore();
            }
        });

        // 5. Render Wall Lines (Visible ONLY when Editing)
        if (role === 'dm' && (mode === 'wall' || mode === 'wall-erase') && walls && walls.length > 0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#06b6d4'; // Cyan
            ctx.lineWidth = 3 / zoom; 
            ctx.lineCap = 'round';
            ctx.beginPath();
            pixelWalls.forEach(w => {
                ctx.moveTo(w.p1.x, w.p1.y);
                ctx.lineTo(w.p2.x, w.p2.y);
            });
            ctx.stroke();

            // Vertices
            ctx.fillStyle = '#06b6d4';
            pixelWalls.forEach(w => {
                 [w.p1, w.p2].forEach(p => {
                     ctx.beginPath();
                     ctx.arc(p.x, p.y, 4/zoom, 0, Math.PI*2);
                     ctx.fill();
                 });
            });
        }

        // 6. Tools Overlay
        ctx.restore();
        
        // Wall Ghost Line
        if (role === 'dm' && mode === 'wall' && wallStart && ghostWall) {
             ctx.globalCompositeOperation = 'source-over';
             ctx.strokeStyle = '#facc15'; 
             ctx.lineWidth = 2 / zoom;
             ctx.setLineDash([5, 5]);
             ctx.beginPath();
             ctx.moveTo(wallStart.x * canvas.width, wallStart.y * canvas.height);
             ctx.lineTo(ghostWall.x * canvas.width, ghostWall.y * canvas.height);
             ctx.stroke();
             ctx.setLineDash([]);
        }

        // Rulers
        if ((mode === 'ruler' || mode === 'radius') && measureStart && measureEnd) {
            const sx = measureStart.x * canvas.width; const sy = measureStart.y * canvas.height;
            const ex = measureEnd.x * canvas.width; const ey = measureEnd.y * canvas.height;
            const distPx = Math.hypot(ex-sx, ey-sy);
            const distFt = Math.round((distPx / cellPx) * 5);
            
            ctx.save();
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3 / zoom; ctx.setLineDash([10, 5]);
            ctx.beginPath();
            if(mode === 'ruler') { ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); }
            else { ctx.arc(sx, sy, distPx, 0, 2*Math.PI); ctx.stroke(); ctx.fillStyle = 'rgba(245, 158, 11, 0.2)'; ctx.fill(); ctx.beginPath(); ctx.setLineDash([]); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); }
            
            ctx.fillStyle = '#1e293b'; ctx.font = `bold ${16/zoom}px sans-serif`;
            const tm = ctx.measureText(`${distFt} ft`);
            const lx = mode==='ruler'?(sx+ex)/2:ex; const ly = mode==='ruler'?(sy+ey)/2:ey;
            ctx.fillRect(lx - tm.width/2 - 4, ly - 14, tm.width + 8, 28);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${distFt} ft`, lx, ly);
            ctx.restore();
        }
    };

    // Animation Loop
    useEffect(() => { renderCanvas(); }, [revealPaths, tokens, stageDim, mode, measureStart, measureEnd, dragTokenId, tempTokenPos, gridSize, walls, wallStart, ghostWall, lightingMode, role]);

    // --- INTERACTION LOGIC ---
    
    const handleDown = (e) => {
        const coords = getCoords(e);
        
        if (mode === 'pan' || e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); return;
        }

        // WALL DELETION
        if (role === 'dm' && mode === 'wall-erase') {
            handleWallDelete(coords); return;
        }

        // WALL CREATION
        if (role === 'dm' && mode === 'wall') {
            let cx = coords.x; let cy = coords.y;
            if (snapToGrid) { cx = snapCoordinate(cx); cy = snapCoordinate(cy, true); }
            const snapped = {x: cx, y: cy};

            if (!wallStart) {
                setWallStart(snapped); 
            } else {
                const newWall = { id: Date.now(), p1: wallStart, p2: snapped };
                const newWalls = [...walls, newWall];
                updateCloud({
                    ...dataRef.current,
                    campaign: {
                        ...dataRef.current.campaign,
                        activeMap: { ...dataRef.current.campaign.activeMap, walls: newWalls }
                    }
                });
                setWallStart(snapped); 
            }
            return;
        }

        // TOOLS
        if (mode === 'ruler' || mode === 'radius') {
            let start = coords;
            if(snapToGrid) { start = { x: snapCoordinate(coords.x), y: snapCoordinate(coords.y, true) }; }
            setMeasureStart(start); setMeasureEnd(start); setIsDrawing(true);
        } else if (role === 'dm' && (mode === 'reveal' || mode === 'shroud')) {
            setIsDrawing(true); updateMapState('start_path', { mode, size: brushSize * (1000/stageDim.w), points: [coords] });
        }
    };

    const handleMove = (e) => {
        if (isPanning) { 
            e.preventDefault(); 
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); return; 
        }
        const coords = getCoords(e);

        if (role === 'dm' && mode === 'wall') {
            let cx = coords.x; let cy = coords.y;
            if (snapToGrid) { cx = snapCoordinate(cx); cy = snapCoordinate(cy, true); }
            setGhostWall({x: cx, y: cy});
        }

        if (dragTokenId) {
            e.preventDefault();
            setTempTokenPos({ x: Math.max(0, Math.min(1, coords.x))*100, y: Math.max(0, Math.min(1, coords.y))*100 });
        } else if (isDrawing) {
            if (mode === 'ruler' || mode === 'radius') {
                let end = coords;
                if(snapToGrid) { end = { x: snapCoordinate(coords.x), y: snapCoordinate(coords.y, true) }; }
                setMeasureEnd(end);
            }
            else if (role === 'dm' && (mode === 'reveal' || mode === 'shroud')) updateMapState('append_point', coords);
        }
    };

    const handleUp = (e) => {
        setIsPanning(false);
        setIsDrawing(false);
        setMeasureStart(null);
        setMeasureEnd(null);
        
        if (dragTokenId) {
            const coords = getCoords(e);
            const dist = Math.hypot(coords.x - dragStartPos.x, coords.y - dragStartPos.y);
            if (dist < 0.005) { setSelectedTokenId(dragTokenId); if(activeSheetId) openTokenSheet(dragTokenId); }
            else {
                let finalX = coords.x; let finalY = coords.y;
                if (snapToGrid) { finalX = snapCoordinate(finalX); finalY = snapCoordinate(finalY, true); }
                
                const newTokens = tokens.map(t => t.id === dragTokenId ? { ...t, x: Math.max(0,Math.min(1, finalX))*100, y: Math.max(0,Math.min(1, finalY))*100 } : t);
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: newTokens } } });
            }
            setDragTokenId(null); setTempTokenPos(null);
        } else {
             if(!e.target.closest('.token-element')) setSelectedTokenId(null);
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        if (mode === 'wall') {
            setWallStart(null);
            setGhostWall(null);
        }
    };

    // Global Drag
    useEffect(() => {
        if (!dragTokenId) return;
        const handleWindowMove = (e) => handleMove(e);
        const handleWindowUp = (e) => handleUp(e);
        window.addEventListener('mousemove', handleWindowMove);
        window.addEventListener('mouseup', handleWindowUp);
        window.addEventListener('touchmove', handleWindowMove, { passive: false });
        window.addEventListener('touchend', handleWindowUp);
        return () => {
            window.removeEventListener('mousemove', handleWindowMove);
            window.removeEventListener('mouseup', handleWindowUp);
            window.removeEventListener('touchmove', handleWindowMove);
            window.removeEventListener('touchend', handleWindowUp);
        };
    }, [dragTokenId, dragStartPos, pan, zoom, stageDim, mode]); 

    const handleTokenDragStart = (e, id) => {
        e.preventDefault(); 
        setDragTokenId(id);
        const pos = getCoords(e);
        setDragStartPos(pos);
        setTempTokenPos({ 
            x: Math.max(0, Math.min(1, pos.x)) * 100, 
            y: Math.max(0, Math.min(1, pos.y)) * 100 
        }); 
    };

    const loadMap = (url, name) => {
        const newSaved = savedMaps.find(m => m.url === url) ? savedMaps : [...savedMaps, {id:Date.now(), name, url}];
        updateCloud({ ...data, campaign: { ...data.campaign, savedMaps: newSaved, activeMap: { url, revealPaths:[], walls:[], tokens:[], view: {zoom: 1, pan: {x:0,y:0}} } } });
        setShowMapBar(false);
    };

    const addToken = (src, type) => {
        let finalCharId = src.id;
        let newNpcs = [...(dataRef.current.npcs || [])];
        
        // 1. Create Character Data if new
        if (!src.id) {
             const newId = Date.now();
             newNpcs.push({ name: src.name, hp: { current: 10, max: 10 }, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ...src, id: newId });
             finalCharId = newId;
        } else if (type === 'npc' || type === 'monster') {
             // Handle Instances
             const originalAlreadyOnMap = tokens.some(t => t.characterId === src.id);
             // Check if src is already an instance
             const isSourceInstance = src.isInstance;
             const originalId = isSourceInstance ? src.originalId : src.id;
             
             if (originalAlreadyOnMap || isSourceInstance) {
                 const instanceId = Date.now();
                 // Deep copy stats/hp to ensure unique instance state
                 newNpcs.push({ 
                     ...src, 
                     id: instanceId, 
                     hp: { ...(src.hp || {current: 10, max: 10}), current: src.hp?.max || 10 }, 
                     isInstance: true, 
                     originalId: originalId 
                 });
                 finalCharId = instanceId;
             } else { 
                 finalCharId = src.id; 
             }
        }
        
        // 2. Naming Logic (Goblin, Goblin 2, etc.)
        let finalName = src.name;
        const existingCount = tokens.filter(t => t.name.startsWith(src.name)).length;
        if (existingCount > 0) {
            finalName = `${src.name} ${existingCount + 1}`;
        }

        const nt = { id: Date.now() + 1, x: 50, y: 50, name: finalName, image: src.image || '', type, size: src.size || 'medium', characterId: finalCharId, statuses: [] };
        updateCloud({ ...dataRef.current, npcs: newNpcs, campaign: { ...dataRef.current.campaign, activeMap: { ...dataRef.current.campaign.activeMap, tokens: [...tokens, nt] } } });
        setShowTokenBar(false);
    };

    const openTokenSheet = (tokenId) => { 
        const token = tokens.find(t => t.id === tokenId); if (!token) return; 
        const char = dataRef.current.players?.find(p => p.id === token.characterId) || dataRef.current.npcs?.find(n => n.id === token.characterId); 
        if(char) { 
            if (activeSheetId && activeSheetId !== char.id) { setActiveSheetId(null); setTimeout(() => { useCharacterStore.getState().loadCharacter(char); setActiveSheetId(char.id); }, 50); } 
            else { useCharacterStore.getState().loadCharacter(char); setActiveSheetId(char.id); } 
        } else { alert("No sheet attached."); } 
    };

    let cursorClass = 'cursor-crosshair';
    if (mode === 'pan' || isPanning) cursorClass = 'cursor-grab active:cursor-grabbing';
    if (mode === 'wall-erase') cursorClass = 'cursor-cell'; 
    if (mode === 'move') cursorClass = 'cursor-default';

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden relative">
            <MapToolbar 
                mode={mode} setMode={setMode} 
                showGrid={showGrid} setShowGrid={setShowGrid}
                snapToGrid={snapToGrid} setSnapToGrid={setSnapToGrid}
                gridSize={gridSize} handleGridChange={handleGridChange}
                showTokenBar={showTokenBar} setShowTokenBar={setShowTokenBar}
                showMapBar={showMapBar} setShowMapBar={setShowMapBar}
                role={role}
                zoom={zoom} setZoom={setZoom} 
                lightingMode={lightingMode} onToggleLight={toggleLighting} 
            />

            {showMapBar && <MapLibrary savedMaps={savedMaps} onClose={() => setShowMapBar(false)} loadMap={loadMap} deleteMap={()=>{}} apiKey={apiKey} />}
            {showTokenBar && <TokenManager data={data} onClose={() => setShowTokenBar(false)} addToken={addToken} onOpenCompendium={() => setShowCompendium(true)} onOpenSheet={openTokenSheet} />}
            {showCompendium && <CompendiumModal onClose={() => setShowCompendium(false)} importFromApi={()=>{}} />}
            
            {canControlSelected && (
                <TokenMenu selectedTokenId={selectedTokenId} onClose={() => setSelectedTokenId(null)} openTokenSheet={openTokenSheet} updateTokenStatus={updateTokenStatus} updateTokenSize={updateTokenSize} deleteToken={deleteToken} />
            )}

            {activeSheetId && (
                 <div className="absolute top-14 right-2 left-2 md:left-auto md:w-96 bottom-20 md:bottom-4 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right-10">
                    <SheetContainer characterId={activeSheetId} onBack={() => setActiveSheetId(null)} onSave={savePlayer} onDiceRoll={onDiceRoll} />
                 </div>
            )}

            <div 
                ref={containerRef}
                className={`flex-1 min-h-0 relative overflow-hidden flex items-center justify-center bg-black touch-none ${cursorClass}`}
                onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} 
                onWheel={(e) => e.preventDefault()}
                onContextMenu={handleContextMenu}
                onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
            >
                 {mapUrl ? (
                    <div style={{ width: `${stageDim.w}px`, height: `${stageDim.h}px`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }} className="relative shadow-2xl">
                        <img src={mapUrl} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                        {showGrid && <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px)`, backgroundSize: `${cellPx}px ${cellPx}px` }} />}
                        
                        <div className="absolute inset-0 w-full h-full pointer-events-none">
                            {tokens.map(t => {
                                const isOwner = role === 'dm' || (t.characterId === myCharId);
                                return (
                                    <div key={t.id} className={`pointer-events-auto token-element ${!isOwner ? 'pointer-events-none' : ''}`}>
                                        <Token 
                                            token={t} 
                                            isOwner={isOwner && (mode === 'move' || role === 'dm')} 
                                            cellPx={cellPx} 
                                            isDragging={dragTokenId===t.id} 
                                            overridePos={dragTokenId===t.id?tempTokenPos:null} 
                                            onMouseDown={(e)=>handleTokenDragStart(e, t.id)} 
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full z-20 ${mode==='move'?'pointer-events-none opacity-90':'pointer-events-auto opacity-70'}`}/>
                    </div>
                 ) : (
                    <div className="text-slate-500 flex flex-col items-center"><Icon name="map" size={48} className="mb-2 opacity-20"/><p>No Map Loaded</p></div>
                 )}
            </div>
        </div>
    );
};

export default MapBoard;