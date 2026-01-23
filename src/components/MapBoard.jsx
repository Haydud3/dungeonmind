import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import Icon from './Icon';
import Token from './Token';
import SheetContainer from './character-sheet/SheetContainer';
import { useCharacterStore } from '../stores/useCharacterStore';
import { calculateVisibilityPolygon } from '../utils/visionMath';
// START CHANGE: Import Enricher
import { enrichCharacter } from '../utils/srdEnricher';
// END CHANGE

// --- SUB-COMPONENTS ---
import MapToolbar from './map/MapToolbar';
import MapLibrary from './map/MapLibrary';
import TokenManager from './map/TokenManager';
import TokenMenu from './map/TokenMenu';
import CompendiumModal from './map/CompendiumModal';

// --- CONFIG ---
const GRID_SIZE_DEFAULT = 5;

const MapBoard = ({ data, role, updateMapState, updateCloud, user, apiKey, onDiceRoll, savePlayer, activeTemplate, onClearTemplate, onInitiative, onPlaceTemplate }) => {
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
    const [wallStart, setWallStart] = useState(null); 
    const [ghostWall, setGhostWall] = useState(null); 
    const [templatePos, setTemplatePos] = useState(null); 

    // START CHANGE: Cinematic Mode State
    const [theaterMode, setTheaterMode] = useState(false);
    // END CHANGE

    // NEW: Manual Combat Entry State
    const [showAddCombatant, setShowAddCombatant] = useState(false);
    const [manualCombatant, setManualCombatant] = useState({ tokenId: '', init: '' });

    // --- DELETE THIS BLOCK BELOW (It is a duplicate causing the error) ---
    // const [tokenAnims, setTokenAnims] = useState({}); 
    // const prevTokensRef = useRef(tokens);
    //
    // useEffect(() => {
    //    ... (delete all this animation logic here)
    // }, [tokens]);
    // -------------------------------------------------------------------

    const walls = data.campaign?.activeMap?.walls || []; 
    const lightingMode = data.campaign?.activeMap?.lightingMode || 'daylight'; 
    const mapTemplates = data.campaign?.activeMap?.templates || [];

    // UI Panels
    const [showTokenBar, setShowTokenBar] = useState(false);
    const [showMapBar, setShowMapBar] = useState(false);
    const [showCompendium, setShowCompendium] = useState(false);

    /// Grid Config
    const [showGrid, setShowGrid] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [gridSize, setGridSize] = useState(data.campaign?.activeMap?.gridSize || GRID_SIZE_DEFAULT);

    // --- DATA SYNC ---
    const mapUrl = data.campaign?.activeMap?.url;
    const revealPaths = data.campaign?.activeMap?.revealPaths || [];
    const tokens = data.campaign?.activeMap?.tokens || [];

    // FIX: Animation Logic moved here so 'tokens' is defined before we access it
    const [tokenAnims, setTokenAnims] = useState({}); 
    const prevTokensRef = useRef(tokens);

    useEffect(() => {
        const prev = prevTokensRef.current;
        const newAnims = { ...tokenAnims };
        let hasNewAnim = false;

        tokens.forEach(t => {
            const old = prev.find(p => p.id === t.id);
            if (old && t.hp?.current < old.hp?.current) {
                newAnims[t.id] = 'animate-shake';
                hasNewAnim = true;
                setTimeout(() => setTokenAnims(prev => { const n = {...prev}; delete n[t.id]; return n; }), 500);
            }
        });
        if (hasNewAnim) setTokenAnims(newAnims);
        prevTokensRef.current = tokens;
    }, [tokens]);

    const savedMaps = data.campaign?.savedMaps || [];
    const cellPx = stageDim.w ? (stageDim.w * gridSize) / 100 : 0;
    
    // Identity Check
    const myCharId = data.assignments?.[user?.uid];
    const selectedToken = tokens.find(t => t.id === selectedTokenId);
    // START CHANGE: Use String() conversion to ensure ID types match
    const canControlSelected = role === 'dm' || (selectedToken && String(selectedToken.characterId) === String(myCharId));
    // END CHANGE

    // --- SETUP EFFECTS ---
    useEffect(() => {
        if (data.campaign?.activeMap?.gridSize) setGridSize(data.campaign.activeMap.gridSize);
        if (data.campaign?.activeMap?.view) {
            setZoom(data.campaign.activeMap.view.zoom || 1);
            setPan(data.campaign.activeMap.view.pan || {x:0, y:0});
        }
    }, [data.campaign?.activeMap?.url]); 

    // FIX: Use decode() to force browser to calculate dimensions for stubborn JPEGs
    useEffect(() => {
        if (!mapUrl) return;
        
        const img = new Image();
        img.src = mapUrl;

        img.decode().then(() => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setStageDim({ w: img.naturalWidth, h: img.naturalHeight });
            }
        }).catch((err) => {
            // Fallback for non-image formats or errors
            console.warn("Image decode failed, falling back to onload", err);
            img.onload = () => setStageDim({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
        });
        
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
            
            // 1. Calculate new Zoom
            const scaleBy = 1.1;
            const newZoom = e.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
            const clampedZoom = Math.min(Math.max(0.1, newZoom), 10);
            
            if (clampedZoom === zoom) return;

            // 2. Calculate "Zoom to Cursor" Pan adjustment
            // We find the mouse vector relative to center, then shift Pan to compensate for the scale change
            const rect = el.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - (rect.width / 2);
            const mouseY = e.clientY - rect.top - (rect.height / 2);
            
            const scaleFactor = clampedZoom / zoom;

            const newPan = {
                x: mouseX * (1 - scaleFactor) + pan.x * scaleFactor,
                y: mouseY * (1 - scaleFactor) + pan.y * scaleFactor
            };

            setZoom(clampedZoom);
            setPan(newPan);
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
        
        // FIX: Check for touches first to support mobile
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
        
        // FIX: Improve hit detection math and sync deletion to savedMaps
        if(!canvas) return;
        // Project points to screen space for accurate hit testing regardless of zoom
        const toScreen = (p) => ({ x: p.x * stageDim.w * zoom, y: p.y * stageDim.h * zoom });
        const screenClick = toScreen(clickPoint);
        const threshold = 20; // 20px hit tolerance

        const distToSegment = (p, v, w) => {
            const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
            if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
            let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
        };

        const wallIndex = walls.findIndex(w => {
            if (!w.p1 || !w.p2) return false;
            return distToSegment(screenClick, toScreen(w.p1), toScreen(w.p2)) < threshold;
        });

        if (wallIndex !== -1) {
            const newWalls = [...walls];
            newWalls.splice(wallIndex, 1);
            
            // Sync deletion to BOTH Active Map AND the Saved Library entry
            const activeId = data.campaign?.activeMap?.id;
            const updatedSavedMaps = savedMaps.map(m => m.id === activeId ? { ...m, walls: newWalls } : m);

            updateCloud({
                ...dataRef.current,
                campaign: {
                    ...dataRef.current.campaign,
                    activeMap: { ...dataRef.current.campaign.activeMap, walls: newWalls },
                    savedMaps: activeId ? updatedSavedMaps : savedMaps
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

    // START CHANGE: Add Generic Update Token Handler
    const updateToken = (tokenId, updates) => {
        const newTokens = tokens.map(t => t.id === tokenId ? { ...t, ...updates } : t);
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: newTokens } } });
    };
    // END CHANGE

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

        // FIX: High-DPI Rendering. Scale internal resolution by zoom level AND pixel ratio for crisp lines.
        const dpr = window.devicePixelRatio || 1;
        canvas.width = stageDim.w * zoom * dpr;
        canvas.height = stageDim.h * zoom * dpr;
        
        // Normalize coordinates: We scale the context so our drawing logic works on the scaled canvas
        ctx.scale(zoom * dpr, zoom * dpr);
        
        ctx.clearRect(0, 0, stageDim.w, stageDim.h);
        ctx.save();

        // 2. Base Layer (Fog of War)
        // DM sees 50% opacity fog to know where map is, Players see 100% black
        ctx.fillStyle = role === 'dm' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 1)'; 
        ctx.fillRect(0, 0, stageDim.w, stageDim.h);

        // START CHANGE: Removed "2.5 Render Grid" block from here. 
        // We now handle grid via CSS so it isn't erased by the vision "hole punch".
        
        // 3. Render Legacy Fog (if exists)
        if (revealPaths && Array.isArray(revealPaths) && revealPaths.length > 0) {
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';
             
             // FIX: Calculate scale factor for consistent line width regardless of zoom
             const scaleFactor = Math.max(1, stageDim.w / 1000);

             revealPaths.forEach(path => {
                if (!path.points || !Array.isArray(path.points)) return; 
                ctx.globalCompositeOperation = path.mode === 'shroud' ? 'source-over' : 'destination-out';
                
                // FIX: Use scaleFactor
                ctx.lineWidth = (path.size || 40) * scaleFactor;
                
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                ctx.beginPath();
                const validPoints = path.points.filter(p => p && typeof p.x === 'number');
                validPoints.forEach((p, i) => { 
                    const x = p.x * stageDim.w; 
                    const y = p.y * stageDim.h; 
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); 
                });
                ctx.stroke();
            });
        }

        // 3.5 Render Spell Templates (Saved & Active)
        const drawTemplate = (t, isGhost = false) => {
            // FIX: Ensure we are drawing ON TOP, not erasing the fog
            ctx.globalCompositeOperation = 'source-over';
            
            const x = (t.x / 100) * canvas.width;
            const y = (t.y / 100) * canvas.height;
            // Default 20ft radius if parse fails. Map width / (100 / gridSize) = px per 5ft cell
            const pxPerFoot = (canvas.width / (100 / gridSize)) / 5;
            const radius = (t.size || 20) * pxPerFoot;

            ctx.save();
            ctx.translate(x, y);
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fillStyle = isGhost ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.2)';
            ctx.fill();
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2;
            if(isGhost) ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.restore();
        };

        mapTemplates.forEach(t => drawTemplate(t));
        if (activeTemplate && templatePos) {
            const size = parseInt(activeTemplate.desc?.match(/(\d+)-foot-radius/)?.[1] || 20);
            drawTemplate({ x: templatePos.x * 100, y: templatePos.y * 100, size }, true);
        }

        // 4. Dynamic Lighting & Vision
        const pixelWalls = walls.map(w => ({
            p1: { x: w.p1.x * stageDim.w, y: w.p1.y * stageDim.h },
            p2: { x: w.p2.x * stageDim.w, y: w.p2.y * stageDim.h }
        }));

        // START CHANGE: Filter out Open Doors from Vision Calculation
        const visionBlockingWalls = walls
            .filter(w => !(w.type === 'door' && w.open))
            .map(w => ({
                p1: { x: w.p1.x * stageDim.w, y: w.p1.y * stageDim.h },
                p2: { x: w.p2.x * stageDim.w, y: w.p2.y * stageDim.h }
            }));
        // END CHANGE
        
        tokens.forEach(token => {
            // Permission Check: Who sees what?
            // START CHANGE: Use String() conversion so the loop actually runs for the player
            const isMyToken = String(token.characterId) === String(myCharId);
            // END CHANGE
            
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
            
            // FIX: Use stageDim (World Units) for calculation. 
            // Using canvas.width (Screen Units) caused the circle to be multiplied by zoom twice.
            const pxPerCell = stageDim.w / totalCellsX; 
            const pxPerFoot = pxPerCell / 5;
            const radiusPx = visionRadiusFeet * pxPerFoot;
            
            const origin = { x: tx * stageDim.w, y: ty * stageDim.h };

            // Math
            // START CHANGE: Use visionBlockingWalls instead of pixelWalls
            const polygon = calculateVisibilityPolygon(origin, visionBlockingWalls, { width: stageDim.w, height: stageDim.h });
            // END CHANGE

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
        // START CHANGE: Draw Walls & Doors
        if (role === 'dm' && (mode === 'wall' || mode === 'wall-erase' || mode === 'door') && walls && walls.length > 0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineCap = 'round';
            
            // Draw Standard Walls (Cyan)
            ctx.strokeStyle = '#06b6d4'; 
            ctx.lineWidth = Math.max(2, cellPx * 0.08); 
            ctx.beginPath();
            walls.filter(w => w.type !== 'door').forEach(w => {
                 const p1 = { x: w.p1.x * stageDim.w, y: w.p1.y * stageDim.h };
                 const p2 = { x: w.p2.x * stageDim.w, y: w.p2.y * stageDim.h };
                 ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
            });
            ctx.stroke();

            // Draw Doors (Amber)
            walls.filter(w => w.type === 'door').forEach(w => {
                 const p1 = { x: w.p1.x * stageDim.w, y: w.p1.y * stageDim.h };
                 const p2 = { x: w.p2.x * stageDim.w, y: w.p2.y * stageDim.h };
                 
                 ctx.beginPath();
                 ctx.strokeStyle = w.open ? 'rgba(245, 158, 11, 0.3)' : '#f59e0b'; // Dim if open
                 ctx.setLineDash(w.open ? [5, 5] : []); // Dashed if open
                 ctx.lineWidth = Math.max(4, cellPx * 0.12); // Thicker for doors
                 
                 ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                 ctx.stroke();
                 
                 // Draw Door Icon/Handle
                 const midX = (p1.x + p2.x) / 2;
                 const midY = (p1.y + p2.y) / 2;
                 ctx.fillStyle = '#f59e0b';
                 ctx.beginPath();
                 ctx.arc(midX, midY, 6/zoom, 0, Math.PI*2);
                 ctx.fill();
            });
            ctx.setLineDash([]);
        }
        // END CHANGE

        // 6. Tools Overlay
        ctx.restore();
        
        // Wall Ghost Line
        if (role === 'dm' && mode === 'wall' && wallStart && ghostWall) {
             ctx.globalCompositeOperation = 'source-over';
             ctx.strokeStyle = '#facc15'; 
             
             // FIX: Divide by zoom for constant screen thickness. Use stageDim instead of canvas.width to prevent double-scaling.
             ctx.lineWidth = 2 / zoom;
             ctx.setLineDash([5 / zoom, 5 / zoom]);
             ctx.beginPath();
             ctx.moveTo(wallStart.x * stageDim.w, wallStart.y * stageDim.h);
             ctx.lineTo(ghostWall.x * stageDim.w, ghostWall.y * stageDim.h);
             ctx.stroke();
             ctx.setLineDash([]);
        }

        // Rulers
        if ((mode === 'ruler' || mode === 'radius') && measureStart && measureEnd) {
            // FIX: Ensure rulers draw normally and don't "cut" through the darkness
            ctx.globalCompositeOperation = 'source-over';

            // FIX: Use stageDim instead of canvas.width to prevent double-scaling
            const sx = measureStart.x * stageDim.w; const sy = measureStart.y * stageDim.h;
            const ex = measureEnd.x * stageDim.w; const ey = measureEnd.y * stageDim.h;
            
            const distPx = Math.hypot(ex-sx, ey-sy);
            const distFt = Math.round((distPx / cellPx) * 5);
            
            ctx.save();
            ctx.strokeStyle = '#f59e0b'; 
            ctx.lineWidth = 2 / zoom; 
            
            ctx.setLineDash([10 / zoom, 5 / zoom]);
            ctx.beginPath();
            if(mode === 'ruler') { ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); }
            else { 
                ctx.arc(sx, sy, distPx, 0, 2*Math.PI); 
                ctx.stroke(); 
                ctx.fillStyle = 'rgba(245, 158, 11, 0.2)'; 
                ctx.fill(); 
                ctx.beginPath(); 
                ctx.setLineDash([]); 
                ctx.moveTo(sx, sy); 
                ctx.lineTo(ex, ey); 
                ctx.stroke(); 
            }
            
            // Text Label - Scaled inversely to zoom so it stays readable
            ctx.fillStyle = '#1e293b'; 
            ctx.font = `bold ${16/zoom}px sans-serif`;
            
            const tm = ctx.measureText(`${distFt} ft`);
            const lx = mode==='ruler'?(sx+ex)/2:ex; const ly = mode==='ruler'?(sy+ey)/2:ey;
            
            // Background Box for Text
            ctx.fillRect(lx - tm.width/2 - (4/zoom), ly - (14/zoom), tm.width + (8/zoom), 28/zoom);
            
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${distFt} ft`, lx, ly);
            ctx.restore();
        }
    };

    // Animation Loop
    useEffect(() => { renderCanvas(); }, [revealPaths, tokens, stageDim, mode, measureStart, measureEnd, dragTokenId, tempTokenPos, gridSize, walls, wallStart, ghostWall, lightingMode, role, activeTemplate, templatePos, mapTemplates]);

    // --- INTERACTION LOGIC ---
    
    const handleDown = (e) => {
        const coords = getCoords(e);
        
        // Pinch Zoom Start
        if (e.touches && e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            setPinchDist(d);
            return;
        }

        // START CHANGE: Allow 1-finger Pan on mobile if hitting background
        const isTouchPan = e.touches && e.touches.length === 1 && mode === 'move';

        if (mode === 'pan' || isTouchPan || e.button === 1 || (e.button === 0 && e.altKey)) {
        // END CHANGE
            // FIX: Get correct client coordinates for Touch events
            let cx = e.clientX; let cy = e.clientY;
            if(e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            
            setIsPanning(true); setDragStart({ x: cx - pan.x, y: cy - pan.y }); return;
        }

        // Place Spell Template
        if (activeTemplate && templatePos) {
            const size = parseInt(activeTemplate.desc?.match(/(\d+)-foot-radius/)?.[1] || 20);
            
            const newT = { id: Date.now(), x: templatePos.x*100, y: templatePos.y*100, size, name: activeTemplate.name };
            
            if (onPlaceTemplate) {
                onPlaceTemplate(newT);
            } else {
                const newTemplates = [...mapTemplates, newT];
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, templates: newTemplates } } });
                if(onClearTemplate) onClearTemplate();
            }

            setTemplatePos(null);
            return;
        }

        // WALL DELETION
        if (role === 'dm' && mode === 'wall-erase') {
            handleWallDelete(coords); return;
        }

        // START CHANGE: Door Interaction (Convert Wall <-> Door, or Toggle Open/Closed)
        if (role === 'dm' && mode === 'door') {
            const canvas = canvasRef.current;
            if(!canvas) return;
            
            // Hit Test Logic (reused from delete, but specialized)
            const toScreen = (p) => ({ x: p.x * stageDim.w * zoom, y: p.y * stageDim.h * zoom });
            const screenClick = toScreen(coords);
            const threshold = 30; // Generous hit box

            const distToSegment = (p, v, w) => {
                const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
                if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
                let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
            };

            const wallIndex = walls.findIndex(w => {
                if (!w.p1 || !w.p2) return false;
                return distToSegment(screenClick, toScreen(w.p1), toScreen(w.p2)) < threshold;
            });

            if (wallIndex !== -1) {
                const target = walls[wallIndex];
                let newWalls = [...walls];
                
                if (target.type !== 'door') {
                    // Convert Wall -> Door (Closed)
                    newWalls[wallIndex] = { ...target, type: 'door', open: false };
                } else {
                    // Toggle Door (Open <-> Closed)
                    newWalls[wallIndex] = { ...target, open: !target.open };
                }

                // Sync
                const activeId = data.campaign?.activeMap?.id;
                updateCloud({
                    ...dataRef.current,
                    campaign: {
                        ...dataRef.current.campaign,
                        activeMap: { ...dataRef.current.campaign.activeMap, walls: newWalls }
                    }
                });
            }
            return;
        }
        // END CHANGE

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

                // FIX: Sync new walls to Library so they persist when switching maps
                const activeId = data.campaign?.activeMap?.id;
                const updatedSavedMaps = savedMaps.map(m => m.id === activeId ? { ...m, walls: newWalls } : m);

                updateCloud({
                    ...dataRef.current,
                    campaign: {
                        ...dataRef.current.campaign,
                        activeMap: { ...dataRef.current.campaign.activeMap, walls: newWalls },
                        savedMaps: activeId ? updatedSavedMaps : savedMaps
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
        
        // START CHANGE: Deselect Target on empty click (if not using a tool)
        if (mode === 'move' && !dragTokenId && !e.target.closest('.token-element')) {
            useCharacterStore.getState().setTargetId(null);
            setSelectedTokenId(null);
        }
        // END CHANGE
    };

    const handleMove = (e) => {
        if (isPanning) { 
            e.preventDefault(); 
            // FIX: Get correct client coordinates for Touch events
            let cx = e.clientX; let cy = e.clientY;
            if(e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            
            setPan({ x: cx - dragStart.x, y: cy - dragStart.y }); return; 
        }

        // Pinch Zoom Move
        if (e.touches && e.touches.length === 2 && pinchDist) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            
            // FIX: Calculate zoom factor and Zoom-to-Finger logic
            const delta = d - pinchDist;
            const scaleBy = 1 + (delta * 0.005); 
            const newZoom = Math.max(0.1, Math.min(5, zoom * scaleBy));
            
            if (newZoom !== zoom) {
                // Calculate Focal Point (Midpoint between two fingers)
                const t0 = e.touches[0]; const t1 = e.touches[1];
                const midX = (t0.clientX + t1.clientX) / 2;
                const midY = (t0.clientY + t1.clientY) / 2;

                // Convert to relative coordinates
                const rect = containerRef.current.getBoundingClientRect();
                const relX = midX - rect.left - (rect.width / 2);
                const relY = midY - rect.top - (rect.height / 2);

                // Adjust Pan to keep focal point stationary
                const scaleFactor = newZoom / zoom;
                const newPan = {
                    x: relX * (1 - scaleFactor) + pan.x * scaleFactor,
                    y: relY * (1 - scaleFactor) + pan.y * scaleFactor
                };

                setZoom(newZoom);
                setPan(newPan);
            }
            
            setPinchDist(d);
            return;
        }

        const coords = getCoords(e);

        if (role === 'dm' && mode === 'wall') {
            let cx = coords.x; let cy = coords.y;
            if (snapToGrid) { cx = snapCoordinate(cx); cy = snapCoordinate(cy, true); }
            setGhostWall({x: cx, y: cy});
        }

        if (activeTemplate) {
            let cx = coords.x; let cy = coords.y;
            if (snapToGrid) { cx = snapCoordinate(cx); cy = snapCoordinate(cy, true); }
            setTemplatePos({x: cx, y: cy});
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
        setPinchDist(null);
        setMeasureStart(null);
        setMeasureEnd(null);
        
        if (dragTokenId) {
            const coords = getCoords(e);
            const dist = Math.hypot(coords.x - dragStartPos.x, coords.y - dragStartPos.y);
            if (dist < 0.005) { 
                setSelectedTokenId(dragTokenId); 
                // START CHANGE: Set Global Target on Click
                useCharacterStore.getState().setTargetId(dragTokenId);
                // END CHANGE
                if(activeSheetId) openTokenSheet(dragTokenId); 
            }
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
        
        // NEW: Safety - Abort drag on resize/orientation change to prevent teleporting to (0,0)
        const handleResize = () => setDragTokenId(null);
        window.addEventListener('resize', handleResize);

        window.addEventListener('mousemove', handleWindowMove);
        window.addEventListener('mouseup', handleWindowUp);
        window.addEventListener('touchmove', handleWindowMove, { passive: false });
        window.addEventListener('touchend', handleWindowUp);
        // NEW: Handle touch cancellation (e.g. incoming call, tab switch)
        window.addEventListener('touchcancel', () => setDragTokenId(null));

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleWindowMove);
            window.removeEventListener('mouseup', handleWindowUp);
            window.removeEventListener('touchmove', handleWindowMove);
            window.removeEventListener('touchend', handleWindowUp);
            window.removeEventListener('touchcancel', () => setDragTokenId(null));
        };
    }, [dragTokenId, dragStartPos, pan, zoom, stageDim, mode]); 

    const handleTokenDragStart = (e, id) => {
        // FIX: Stop propagation so we don't trigger map panning simultaneously
        if(e.stopPropagation) e.stopPropagation();
        // if(e.preventDefault) e.preventDefault(); // Optional: might block click events if too aggressive
        
        setDragTokenId(id);
        const pos = getCoords(e);
        setDragStartPos(pos);
        setTempTokenPos({ 
            x: Math.max(0, Math.min(1, pos.x)) * 100, 
            y: Math.max(0, Math.min(1, pos.y)) * 100 
        }); 
    };

    const loadMap = (url, name) => {
        updateMapState('load_map', { url, name });
        setShowMapBar(false);
    };

    // START CHANGE: Fully Enriched Import Logic
    const addToken = async (src, type) => {
        let newNpcs = [...(dataRef.current.npcs || [])];
        let masterId = null;
        let finalImage = src.image || '';

        // DETECT SRD IMPORT (Raw JSON from Compendium)
        const isSrdImport = (src.hit_points !== undefined && !src.hp) || (src.url && src.url.includes('/api/'));

        if (isSrdImport) {
            // Check for existing Master in Bestiary
            const existingMaster = newNpcs.find(n => !n.isInstance && n.originalId === src.index);

            if (existingMaster) {
                masterId = existingMaster.id;
                finalImage = existingMaster.image;
            } else {
                // --- 1. RAW MAPPING (API -> Basic Sheet) ---
                if (src.image && src.image.startsWith('/api')) {
                    finalImage = `https://www.dnd5eapi.co${src.image}`;
                }

                const safeStats = {
                    str: src.strength || 10, dex: src.dexterity || 10, con: src.constitution || 10,
                    int: src.intelligence || 10, wis: src.wisdom || 10, cha: src.charisma || 10
                };
                
                let acVal = 10;
                if (Array.isArray(src.armor_class) && src.armor_class.length > 0) acVal = src.armor_class[0].value;
                else if (src.ac) acVal = src.ac;

                const maxHp = src.hit_points || 10;
                
                // Map Actions to "Pre-Enriched" format
                const rawActions = (src.actions || []).map(a => ({
                    name: a.name,
                    desc: a.desc,
                    // We let enricher refine this, but we set defaults
                    type: "Action", 
                    hit: a.attack_bonus ? `+${a.attack_bonus}` : "",
                    dmg: (a.damage && a.damage[0]) ? `${a.damage[0].damage_dice} ${a.damage[0].damage_type?.name || ''}` : ""
                }));

                const basicNpc = {
                    id: Date.now(),
                    name: src.name || "Unknown Monster",
                    race: src.type || "Monster",
                    class: "NPC",
                    level: src.challenge_rating || 1,
                    hp: { current: maxHp, max: maxHp, temp: 0 },
                    stats: safeStats,
                    ac: acVal,
                    speed: JSON.stringify(src.speed || {}),
                    // We map API features to "features" so enricher can scan them
                    features: (src.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" })),
                    customActions: rawActions,
                    legendaryActions: (src.legendary_actions || []).map(l => ({ name: l.name, desc: l.desc })),
                    image: finalImage,
                    isInstance: false, 
                    originalId: src.index,
                    quirk: "SRD Import"
                };

                // --- 2. ENRICHMENT (Basic Sheet -> Rich Sheet) ---
                // This adds Reactions, Bonus Actions, Spells, and robust parsing
                const richNpc = await enrichCharacter(basicNpc);
                
                newNpcs.push(richNpc);
                masterId = richNpc.id;
                
                // Tiny delay for ID safety
                await new Promise(r => setTimeout(r, 10)); 
            }
        } else {
            // Handle Manual Drag from Token List
            masterId = src.isInstance ? (src.originalId || src.id) : src.id;
            if (!masterId) {
                // Edge case: New Manual Token
                const newId = Date.now();
                newNpcs.push({ name: src.name, hp: { current: 10, max: 10 }, ...src, id: newId, isInstance: false });
                masterId = newId;
            }
        }

        // --- 3. CREATE MAP INSTANCE ---
        const masterData = newNpcs.find(n => n.id === masterId);
        const instanceId = Date.now();
        const newInstance = {
            ...masterData,
            id: instanceId,
            isInstance: true, // Hidden from Bestiary
            originalId: masterId, 
            hp: { ...masterData.hp } // Independent HP
        };
        newNpcs.push(newInstance);

        // --- 4. SPAWN TOKEN ---
        let finalName = masterData.name;
        const existingCount = tokens.filter(t => t.name.startsWith(finalName)).length;
        if (existingCount > 0) finalName = `${finalName} ${existingCount + 1}`;

        const nt = { 
            id: Date.now() + 50, 
            x: 50, 
            y: 50, 
            name: finalName, 
            image: finalImage || masterData.image, 
            type: type || 'monster', 
            size: masterData.size ? masterData.size.toLowerCase() : 'medium', 
            characterId: instanceId, 
            statuses: [] 
        };
        
        updateCloud({ ...dataRef.current, npcs: newNpcs, campaign: { ...dataRef.current.campaign, activeMap: { ...dataRef.current.campaign.activeMap, tokens: [...tokens, nt] } } });
        setShowTokenBar(false);
        if(isSrdImport) alert(`Enriched & Spawned ${masterData.name}!`);
    };
    // END CHANGE

    const openTokenSheet = (tokenId) => { 
        const token = tokens.find(t => t.id === tokenId); if (!token) return; 
        
        // NEW: Gatekeeper - Players cannot open NPC sheets
        if (role !== 'dm' && (token.type === 'npc' || token.type === 'monster')) return;

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
        // FIX: Use 100dvh for mobile browsers to account for address bars
        <div className="flex flex-col w-full bg-slate-900 overflow-hidden relative" style={{ height: '100dvh' }}>
            {/* NEW: Inject Custom Animations for Tokens */}
            <style>{`
                @keyframes lunge { 0% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -70%) scale(1.2); } 100% { transform: translate(-50%, -50%) scale(1); } }
                .animate-lunge { animation: lunge 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                @keyframes shake { 0%, 100% { transform: translate(-50%, -50%); } 25% { transform: translate(-55%, -50%); } 75% { transform: translate(-45%, -50%); } }
                .animate-shake { animation: shake 0.3s ease-in-out; }
                .animate-ping-slow { animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
            `}</style>

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
                // START CHANGE: Pass Theater Mode Props
                theaterMode={theaterMode} setTheaterMode={setTheaterMode}
                // END CHANGE
            />

            {showMapBar && <MapLibrary savedMaps={savedMaps} onClose={() => setShowMapBar(false)} loadMap={loadMap} deleteMap={(id)=>updateMapState('delete_map', id)} onAddMap={(m) => updateCloud({...data, campaign: {...data.campaign, savedMaps: [...savedMaps, m]}})} apiKey={apiKey} />}
            {showTokenBar && <TokenManager data={data} onClose={() => setShowTokenBar(false)} addToken={addToken} onOpenCompendium={() => setShowCompendium(true)} onOpenSheet={openTokenSheet} />}
            
            {/* START CHANGE: Fix API Search Import (Item 6) */}
            {showCompendium && <CompendiumModal onClose={() => setShowCompendium(false)} importFromApi={(data) => addToken(data, 'monster')} />}
            {/* END CHANGE */}
            
            {canControlSelected && (
                // FIX: Mobile bottom-24. Desktop md:bottom-12. Z-Index lowered to 90 (below sheet).
                <div className="absolute left-0 right-0 bottom-24 md:bottom-12 z-[90] pointer-events-none flex justify-center" style={{ transform: 'translateZ(0)' }}>
                    <div className="pointer-events-auto">
                        {/* START CHANGE: Pass updateToken prop */}
                        <TokenMenu 
                            selectedTokenId={selectedTokenId} 
                            onClose={() => setSelectedTokenId(null)} 
                            openTokenSheet={openTokenSheet} 
                            updateTokenStatus={updateTokenStatus} 
                            updateToken={updateToken} 
                            deleteToken={deleteToken} 
                        />
                        {/* END CHANGE */}
                    </div>
                </div>
            )}

            {activeSheetId && (
                 <div className={`absolute top-14 right-2 left-2 md:left-auto md:w-96 bottom-28 md:bottom-12 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden animate-in slide-in-from-right-10 ${theaterMode ? 'hidden' : ''}`}>
                    <SheetContainer 
                        characterId={activeSheetId} 
                        onBack={() => setActiveSheetId(null)} 
                        onSave={savePlayer} 
                        onDiceRoll={onDiceRoll} 
                        onInitiative={onInitiative}
                        // --- FIX: PASS ROLE HERE ---
                        role={role}
                        // ---------------------------
                    />
                 </div>
            )}

            <div 
                ref={containerRef}
                // FIX: Add 'touch-none' class (Tailwind) to prevent browser scrolling while dragging
                className={`flex-1 min-h-0 relative overflow-hidden flex items-center justify-center bg-black touch-none ${cursorClass}`}
                onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} 
                onWheel={(e) => e.preventDefault()}
                onContextMenu={handleContextMenu}
                onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
            >
                 {mapUrl ? (
                    // FIX: added overflow-hidden to prevent grid bleeding
                    <div style={{ width: `${stageDim.w}px`, height: `${stageDim.h}px`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }} className="relative shadow-2xl overflow-hidden flex-none">
                        
                        {/* FIX: Revert to 'object-fill' now that stageDim is correct. This locks the image to the grid pixels 1:1. */}
                        <img key={mapUrl} src={mapUrl} className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
                        
                        {/* START CHANGE: Hide Grid in Theater Mode */}
                        {showGrid && cellPx > 0 && !theaterMode && (
                            <div className="absolute inset-0 z-0 pointer-events-none" 
                        // END CHANGE
                                style={{ 
                                    backgroundSize: `${cellPx}px ${cellPx}px`, 
                                    backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px)` 
                                }} 
                            />
                        )}
                        {/* END CHANGE */}
                        
                        <div className="absolute inset-0 w-full h-full pointer-events-none z-10">
                            {tokens.map(t => {
                                const isOwner = role === 'dm' || (String(t.characterId) === String(myCharId));

                                // FIX: Calculate Animation & Turn Highlight Classes
                                const animClass = tokenAnims[t.id] || '';
                                const isMyTurn = data.campaign?.combat?.active && data.campaign.combat.combatants?.[data.campaign.combat.turn]?.tokenId === t.id;
                                const turnClass = isMyTurn ? 'ring-2 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-110 z-50 transition-all duration-300' : '';

                                return (
                                    <div key={t.id} className={`pointer-events-auto token-element ${!isOwner ? 'pointer-events-none' : ''} ${animClass} ${turnClass}`}>
                                        <Token 
                                            token={t} 
                                            isOwner={isOwner && (mode === 'move' || role === 'dm')} 
                                            cellPx={cellPx} 
                                            isDragging={dragTokenId===t.id} 
                                            overridePos={dragTokenId===t.id?tempTokenPos:null} 
                                            
                                            // FIX: Add onTouchStart so mobile users can grab tokens
                                            onMouseDown={(e) => { if (mode !== 'ruler' && mode !== 'radius') handleTokenDragStart(e, t.id); }}
                                            onTouchStart={(e) => { if (mode !== 'ruler' && mode !== 'radius') handleTokenDragStart(e, t.id); }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        {/* FIX: Set CSS width/height explicitly to match container, unrelated to internal resolution */}
                        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} className={`absolute inset-0 w-full h-full z-20 ${mode==='move'?'pointer-events-none':'pointer-events-auto'}`}/>
                    </div>
                 ) : (
                    <div className="text-slate-500 flex flex-col items-center"><Icon name="map" size={48} className="mb-2 opacity-20"/><p>No Map Loaded</p></div>
                 )}
            </div>

            {/* COMBAT TRACKER OVERLAY */}
            {role === 'dm' && !data.campaign?.combat?.active && (
                 <button onClick={() => updateCloud({...data, campaign: {...data.campaign, combat: { active: true, round: 1, turn: 0, combatants: [] }}})} className="absolute top-16 left-4 z-30 bg-red-900/80 hover:bg-red-700 text-white px-3 py-1 rounded-full text-xs font-bold border border-red-500 shadow-lg flex items-center gap-1 transition-transform hover:scale-105"><Icon name="sword" size={14}/> Fight!</button>
            )}
            {data.campaign?.combat?.active && (
                 <div className="absolute top-16 left-4 z-30 bg-slate-900/95 backdrop-blur border border-slate-600 rounded-lg p-3 w-48 shadow-2xl animate-in slide-in-from-left-5">
                     <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-1">
                         <span className="text-xs font-bold text-amber-500 flex items-center gap-1"><Icon name="swords" size={12}/> Round {data.campaign.combat.round}</span>
                         {role === 'dm' && <button onClick={() => updateCloud({...data, campaign: {...data.campaign, combat: { ...data.campaign.combat, active: false }}})} className="text-[10px] text-red-400 hover:text-white bg-slate-800 px-2 rounded">End</button>}
                     </div>
                     <div className="max-h-40 overflow-y-auto custom-scroll space-y-1 mb-2">
                         {(data.campaign.combat.combatants || []).map((c, i) => (
                             <div 
                                key={i} 
                                onClick={() => { if(role === 'dm' && c.tokenId) openTokenSheet(c.tokenId); }}
                                className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded transition-colors border ${i === data.campaign.combat.turn ? 'bg-green-900/60 border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-slate-800/50 border-transparent'} ${role === 'dm' ? 'cursor-pointer hover:bg-slate-700 hover:border-slate-500' : ''}`}
                             >
                                 {/* ICON DISPLAY */}
                                 <div className="w-6 h-6 rounded-full bg-slate-900 border border-slate-600 overflow-hidden shrink-0 flex items-center justify-center">
                                     {c.image ? (
                                         <img src={c.image} className="w-full h-full object-cover" alt="" />
                                     ) : (
                                         <span className="font-bold text-slate-500 text-[8px]">{c.name?.substring(0,2).toUpperCase()}</span>
                                     )}
                                 </div>

                                 <span className={`truncate flex-1 font-medium ${i === data.campaign.combat.turn ? 'text-white' : 'text-slate-400'}`}>{c.name}</span>
                                 <span className="font-mono text-amber-500 font-bold text-sm">{c.init}</span>
                             </div>
                         ))}
                         {(!data.campaign.combat.combatants || data.campaign.combat.combatants.length === 0) && <div className="text-[10px] text-slate-500 text-center italic">Waiting for rolls...</div>}
                     </div>

                     {/* Manual Add Button */}
                     {role === 'dm' && (
                        <div className="mb-2 border-t border-slate-700 pt-1">
                            {!showAddCombatant ? (
                                <button onClick={() => setShowAddCombatant(true)} className="w-full text-[10px] text-slate-400 hover:text-white flex items-center justify-center gap-1 hover:bg-slate-800 rounded py-1">
                                    <Icon name="plus" size={10}/> Add Combatant
                                </button>
                            ) : (
                                <div className="flex gap-1 items-center animate-in slide-in-from-top-2">
                                    <select 
                                        className="flex-1 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-[10px] text-white outline-none min-w-0"
                                        value={manualCombatant.tokenId}
                                        onChange={e => setManualCombatant({...manualCombatant, tokenId: parseInt(e.target.value)})}
                                    >
                                        <option value="">Select Token...</option>
                                        {tokens.filter(t => !data.campaign.combat.combatants?.some(c => c.tokenId === t.id)).map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    <input 
                                        type="number" 
                                        placeholder="#" 
                                        className="w-8 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-[10px] text-white text-center outline-none shrink-0"
                                        value={manualCombatant.init}
                                        onChange={e => setManualCombatant({...manualCombatant, init: e.target.value})}
                                    />
                                    <button 
                                        onClick={() => {
                                            if(!manualCombatant.tokenId || !manualCombatant.init) return;
                                            const token = tokens.find(t => t.id === manualCombatant.tokenId);
                                            if (!token) return;

                                            const newC = { 
                                                id: token.characterId || Date.now(), 
                                                name: token.name, 
                                                init: parseInt(manualCombatant.init), 
                                                type: token.type || 'npc',
                                                tokenId: token.id 
                                            };
                                            const sorted = [...(data.campaign.combat.combatants||[]), newC].sort((a,b) => b.init - a.init);
                                            updateCloud({...data, campaign: {...data.campaign, combat: {...data.campaign.combat, combatants: sorted}}});
                                            setManualCombatant({ tokenId: '', init: '' });
                                            setShowAddCombatant(false);
                                        }}
                                        className="text-green-400 hover:text-green-300 shrink-0"
                                    ><Icon name="check" size={14}/></button>
                                    <button onClick={() => setShowAddCombatant(false)} className="text-red-400 hover:text-red-300 shrink-0"><Icon name="x" size={14}/></button>
                                </div>
                            )}
                        </div>
                     )}

                     {role === 'dm' && (
                         <button onClick={() => {
                             const c = data.campaign.combat;
                             let nextT = c.turn + 1;
                             let nextR = c.round;
                             if (nextT >= (c.combatants?.length || 0)) { nextT = 0; nextR++; }
                             updateCloud({...data, campaign: {...data.campaign, combat: { ...c, turn: nextT, round: nextR }}});
                         }} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] py-1.5 rounded font-bold shadow flex justify-center items-center gap-1">Next Turn <Icon name="chevron-right" size={12}/></button>
                     )}
                 </div>
            )}
        </div>
    );
};

export default MapBoard;