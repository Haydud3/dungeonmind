import React, { useState, useRef, useEffect } from 'react';
import Icon from '../Icon';
import Token from '../Token'; 
// START CHANGE: Import Vision Math
import { calculateVisibilityPolygon } from '../../utils/visionMath';
// END CHANGE
import MapToolbar from './MapToolbar';
import MapLibrary from './MapLibrary';
import TokenManager from './TokenManager';
// START CHANGE: Import GridControls
import GridControls from './GridControls';
import CombatTracker from './CombatTracker';
// START CHANGE: Import Radial HUD
import RadialHUD from './RadialHUD';
// END CHANGE

const InteractiveMap = ({ data, role, updateMapState, updateCloud, onDiceRoll, activeTemplate }) => {
    // View & Interaction State
    const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
    const [isDraggingMap, setIsDraggingMap] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    // Feature Toggles
    const [activeTool, setActiveTool] = useState('move');
    const [showLibrary, setShowLibrary] = useState(false);
    const [showTokens, setShowTokens] = useState(false);
    // START CHANGE: Add wall delete hover state
    const [hoveredWallId, setHoveredWallId] = useState(null);
    // END CHANGE
    // START CHANGE: Grid Defaults
    const mapGrid = data.campaign?.activeMap?.grid || { size: 50, offsetX: 0, offsetY: 0, visible: true, snap: true };
    
    const handleGridUpdate = (newGrid) => {
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, grid: newGrid } } });
    };
    // END CHANGE
    
    const [showCombat, setShowCombat] = useState(false);

    const handleNextTurn = () => {
        const c = data.campaign?.combat || { active: true, round: 1, turn: 0, combatants: [] };
        let nextTurn = c.turn + 1;
        let nextRound = c.round;
        if (nextTurn >= (c.combatants || []).length) {
            nextTurn = 0;
            nextRound++;
        }
        updateCloud({ ...data, campaign: { ...data.campaign, combat: { ...c, turn: nextTurn, round: nextRound } } });
    };

    const handleEndCombat = () => {
        if(confirm("End the encounter?")) {
            updateCloud({ ...data, campaign: { ...data.campaign, combat: { ...data.campaign.combat, active: false } } });
            setShowCombat(false);
        }
    };

    const handleStartCombat = () => {
        const c = data.campaign?.combat;
        if (!c?.active) {
            updateCloud({ ...data, campaign: { ...data.campaign, combat: { ...c, active: true, round: 1, turn: 0 } } });
        }
        setShowCombat(true);
    };
    // END CHANGE

    // Fog State
    const [isDrawingFog, setIsDrawingFog] = useState(false);
    const [currentPath, setCurrentPath] = useState([]);

    // START CHANGE: Token Movement State
    const [movingTokenId, setMovingTokenId] = useState(null);
    const [movingTokenPos, setMovingTokenPos] = useState(null); 
    // START CHANGE: Clean State & Add Vision Toggle
    const [wallStart, setWallStart] = useState(null);
    const [cursorPos, setCursorPos] = useState({x:0, y:0}); 
    const [shakingTokenId, setShakingTokenId] = useState(null);
    const [selectedTokenId, setSelectedTokenId] = useState(null);

    // Refs
    const containerRef = useRef(null);
    // START CHANGE: Switch from fogCanvasRef to visionCanvasRef
    const visionCanvasRef = useRef(null);
    // END CHANGE
    const mapImageRef = useRef(null);

    // Data shortcuts
    const mapData = data.campaign?.activeMap || {};
    const mapUrl = mapData.url;
    const tokens = mapData.tokens || [];
    const walls = mapData.walls || [];
    
    // Vision Toggle (Synced or Local) - Default to TRUE
    const visionActive = mapData.visionActive !== false; 
    // END CHANGE

    // START CHANGE: Auto-open tracker when combat goes active
    useEffect(() => {
        if (data.campaign?.combat?.active) setShowCombat(true);
    }, [data.campaign?.combat?.active]);
    // END CHANGE

    // --- 1. RENDERERS (Vision Logic) ---
    // START CHANGE: The Unified Vision Engine (Replaces Fog)
    const renderVision = () => {
        const canvas = visionCanvasRef.current;
        const img = mapImageRef.current;
        if (!canvas || !img || !img.complete) return;

        // 1. Sync Size
        if (canvas.width !== img.naturalWidth) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 2. TOGGLE CHECK: If Vision is OFF, stop here (Map is fully revealed)
        if (!visionActive) return;

        // 3. Fill "The Shadows"
        ctx.fillStyle = '#000000';
        // START CHANGE: Use additive blending for DM mode to show stacked vision
        if (role === 'dm') {
            // DM uses additive mode so multiple tokens' vision blends together
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.3; // Each token adds 30% brightness
        } else {
            // Players see pitch black shadows
            ctx.globalAlpha = 1.0;
        }
        // END CHANGE
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 4. Cut Holes (Vision) - Always blocks vision regardless of visionActive setting
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 30; // Soft edges
        ctx.shadowColor = 'black';

        // 5. Calculate Vision for Each Token
        tokens.forEach(token => {
            // Only PCs emit vision (unless you want NPC vision too)
            if (token.type !== 'pc') return; 

            // START CHANGE: Simplified Vision Origin
            // Token.x/y is now the CENTER, so we use it directly.
            const origin = {
                x: (token.x / 100) * img.naturalWidth,
                y: (token.y / 100) * img.naturalHeight
            };
            // END CHANGE

            // START CHANGE: Walls always block vision, regardless of toggle
            // Raycasting Logic
            const blockingSegments = walls.filter(w => {
                // Only open doors don't block vision
                if (w.type === 'door' && w.open) return false;
                // All other walls (closed doors, regular walls) always block
                return true;
            });
            const polygon = calculateVisibilityPolygon(origin, blockingSegments, { width: canvas.width, height: canvas.height });

            // Draw Polygon
            ctx.beginPath();
            if (polygon.length > 0) {
                ctx.moveTo(polygon[0].x, polygon[0].y);
                for (let i = 1; i < polygon.length; i++) {
                    ctx.lineTo(polygon[i].x, polygon[i].y);
                }
            }
            ctx.closePath();
            ctx.fill();

            // Draw Central Glow (The "Torch" effect) to smooth the center
            const rangePx = 200; // Standard torch radius approx
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, rangePx, 0, Math.PI * 2);
            ctx.fill();
        });

        // Reset
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;
    };

    // Re-render when relevant state changes
    useEffect(() => { renderVision(); }, [tokens, walls, visionActive, role, mapUrl]);
    // END CHANGE

    // --- 2. MATH HELPERS ---
    
    // START CHANGE: Line Segment Intersection Helper
    // Returns true if line (p1-p2) intersects with line (p3-p4)
    const linesIntersect = (p1, p2, p3, p4) => {
        const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
        return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
    };
    // END CHANGE

    // START CHANGE: Add sizeMult to parameters
    const snapToGrid = (rawX, rawY, imgWidth, imgHeight, sizeMult = 1) => {
        if (!mapGrid.snap || !mapGrid.visible) return { x: (rawX / imgWidth) * 100, y: (rawY / imgHeight) * 100 };

        // 1. Adjust for Offset
        const adjX = rawX - mapGrid.offsetX;
        const adjY = rawY - mapGrid.offsetY;

        // 2. Snap to nearest cell index
        const col = Math.floor(adjX / mapGrid.size);
        const row = Math.floor(adjY / mapGrid.size);

        // START CHANGE: Treat 0.5 like an odd number (center snap)
        const isEven = Math.round(sizeMult) % 2 === 0 && sizeMult >= 1;
        const gridOffset = isEven ? 0 : (mapGrid.size / 2);

        const centerX = (col * mapGrid.size) + mapGrid.offsetX + gridOffset;
        const centerY = (row * mapGrid.size) + mapGrid.offsetY + gridOffset;

        // 4. Convert back to %
        return {
            x: (centerX / imgWidth) * 100,
            y: (centerY / imgHeight) * 100
        };
        // END CHANGE
    };

    // START CHANGE: Manual Snap Function (Fixes Alignment on Load)
    const snapAllTokens = () => {
        const img = mapImageRef.current;
        if (!img || !img.complete || !mapGrid.snap) return;

        let hasChanges = false;
        const newTokens = tokens.map(t => {
            // Convert % to Px
            const pxX = (t.x / 100) * img.naturalWidth;
            const pxY = (t.y / 100) * img.naturalHeight;

            // START CHANGE: Get sizeMult for initial snapping
            const sizeMap = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
            const sMult = typeof t.size === 'number' ? t.size : (sizeMap[t.size] || 1);

            const snapped = snapToGrid(pxX, pxY, img.naturalWidth, img.naturalHeight, sMult);
            // END CHANGE

            // Check if it needs moving (tolerance 0.1%)
            if (Math.abs(snapped.x - t.x) > 0.1 || Math.abs(snapped.y - t.y) > 0.1) {
                hasChanges = true;
                return { ...t, x: snapped.x, y: snapped.y };
            }
            return t;
        });

        if (hasChanges) {
            updateCloud({ 
                ...data, 
                campaign: { 
                    ...data.campaign, 
                    activeMap: { ...mapData, tokens: newTokens } 
                } 
            });
        }
    };

    // Auto-Snap when Grid Settings Change
    useEffect(() => {
        const timer = setTimeout(snapAllTokens, 500); 
        return () => clearTimeout(timer);
    }, [mapGrid]); 
    // END CHANGE

    const getMapCoords = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - view.x) / view.scale,
            y: (e.clientY - rect.top - view.y) / view.scale
        };
    };

    // --- 3. MOUSE HANDLERS ---
    // START CHANGE: Token Move Handler
    const handleTokenMouseDown = (e, tokenId) => {
        // Only allow move if Move Tool is active
        if (activeTool !== 'move') return;
        
        e.stopPropagation(); // Stop Map Pan
        const img = mapImageRef.current;
        if (!img) return;

        const token = tokens.find(t => t.id === tokenId);
        if (!token) return;

        // Calculate initial pixel position
        const px = (token.x / 100) * img.naturalWidth;
        const py = (token.y / 100) * img.naturalHeight;

        setMovingTokenId(tokenId);
        setMovingTokenPos({ x: px, y: py });
    };

    // START CHANGE: Restore Mouse Down Handler
    const handleMouseDown = (e) => {
        // START CHANGE: Restore Mouse Down Handler
        if (activeTool === 'move' || activeTool === 'grid') {
            // Middle Click OR Left Click with Move Tool -> Pan
            if (e.button === 1 || (e.button === 0 && activeTool === 'move')) {
                setIsDraggingMap(true);
                setDragStart({ x: e.clientX - view.x, y: e.clientY - view.y });
                setSelectedTokenId(null);
            }
        }

        // Start Drawing Wall/Door
        if (e.button === 0 && (activeTool === 'wall' || activeTool === 'door') && role === 'dm') {
            setWallStart(getMapCoords(e));
        }
    };
    // END CHANGE

    const handleMouseMove = (e) => {
        if (isDraggingMap) {
            setView(prev => ({ ...prev, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
        }
        
        // START CHANGE: Remove Fog Drawing Logic
        // Was: if (isDrawingFog) { ... }
        
        // Update Wall Preview Cursor
        if (activeTool === 'wall' || activeTool === 'door') {
            setCursorPos(getMapCoords(e));
        }
        // END CHANGE

        // Update Moving Token Position
        if (movingTokenId) {
            const pos = getMapCoords(e);
            setMovingTokenPos(pos);
        }
        // END CHANGE
    };

    const handleMouseUp = (e) => {
        setIsDraggingMap(false);
        
        // START CHANGE: Finalize Token Move OR Select
        if (movingTokenId && movingTokenPos) {
            const img = mapImageRef.current;
            const token = tokens.find(t => t.id === movingTokenId);
            
            if (img && token) {
                // Calculate distance from start to determine Click vs Drag
                const startX = (token.x / 100) * img.naturalWidth;
                const startY = (token.y / 100) * img.naturalHeight;
                const dist = Math.hypot(movingTokenPos.x - startX, movingTokenPos.y - startY);

                if (dist < 5) {
                    // It was a static click -> Select it
                    setSelectedTokenId(movingTokenId);
                } else {
                    // START CHANGE: Physics & Collision Detection
                    let illegalMove = false;
                    
                    // Only check collision if not DM (DMs are gods who walk through walls)
                    if (role !== 'dm') {
                        const startP = { x: startX, y: startY };
                        const endP = movingTokenPos; // Current drag position (pixels)

                        // Check intersection with ALL walls
                        for (const w of walls) {
                            // Ignore open doors
                            if (w.type === 'door' && w.open) continue;

                            // Intersection Check
                            if (linesIntersect(startP, endP, w.p1, w.p2)) {
                                illegalMove = true;
                                break;
                            }
                        }
                    }

                    if (illegalMove) {
                        // REJECT MOVE: Snap back and Shake
                        setShakingTokenId(movingTokenId);
                        setTimeout(() => setShakingTokenId(null), 500); // Clear shake after animation
                        // Do NOT update cloud. The token component will re-render at original pos.
                    } else {
                        // ALLOW MOVE: Snap and Save
                        // START CHANGE: Calculate size multiplier here too
                        const sizeMap = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
                        const sMult = typeof token.size === 'number' ? token.size : (sizeMap[token.size] || 1);
                        
                        const { x, y } = snapToGrid(movingTokenPos.x, movingTokenPos.y, img.naturalWidth, img.naturalHeight, sMult);
                        // END CHANGE
                        const newTokens = tokens.map(t => t.id === movingTokenId ? { ...t, x, y } : t);
                        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, tokens: newTokens } } });
                    }
                    // END CHANGE
                }
            }
            setMovingTokenId(null);
            setMovingTokenPos(null);
        }

        // START CHANGE: Remove Fog Drawing Logic
        // Was: if (isDrawingFog) { ... }
        
        // Finalize Wall Creation
        if (wallStart && (activeTool === 'wall' || activeTool === 'door')) {
            const end = getMapCoords(e); 
            // Only create if line is long enough (>10px) to prevent accidental clicks
            if (Math.hypot(end.x - wallStart.x, end.y - wallStart.y) > 10) {
                const newWall = {
                    id: Date.now(),
                    type: activeTool,
                    p1: wallStart,
                    p2: end,
                    open: false, // Only relevant for doors
                };
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, walls: [...walls, newWall] } } });
            }
            setWallStart(null);
        }
        // END CHANGE
    };

    // Zoom towards Mouse Cursor
    const handleWheel = (e) => {
        e.preventDefault();
        
        // 1. Determine zoom direction and speed
        const scaleSensitivity = 0.001;
        const delta = -e.deltaY * scaleSensitivity;
        const newScale = Math.min(Math.max(0.1, view.scale + delta), 5); // Clamp 0.1x to 5x

        // 2. Get mouse position relative to the container
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 3. Calculate "World Point" under mouse (before zoom)
        const worldX = (mouseX - view.x) / view.scale;
        const worldY = (mouseY - view.y) / view.scale;

        // 4. Calculate new Pan to keep World Point under mouse (after zoom)
        const newX = mouseX - (worldX * newScale);
        const newY = mouseY - (worldY * newScale);

        setView({ x: newX, y: newY, scale: newScale });
    };
    // END CHANGE

    // --- 4. DRAG & DROP SPAWNING ---
    const handleDragStart = (e, entity, type) => {
        e.dataTransfer.setData("entityId", entity.id);
        e.dataTransfer.setData("type", type);
        e.dataTransfer.setData("image", entity.image || "");
        e.dataTransfer.setData("name", entity.name);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        let entityId = e.dataTransfer.getData("entityId");
        const type = e.dataTransfer.getData("type");
        const image = e.dataTransfer.getData("image");
        const name = e.dataTransfer.getData("name");

        // Convert entityId to number if it looks like a number (drag data comes as string)
        if (entityId && !isNaN(entityId)) {
            entityId = Number(entityId);
        }

        if (entityId) {
            const pos = getMapCoords(e);
            const img = mapImageRef.current;
            if (img) {
                // START CHANGE: Scribe Logic - Deep clone and auto-numbering
                const { x, y } = snapToGrid(pos.x, pos.y, img.naturalWidth, img.naturalHeight);
                
                const masterNpc = data.npcs?.find(n => n.id === entityId) || 
                                  data.players?.find(p => p.id === entityId);
                
                const existingCount = tokens.filter(t => t.characterId === entityId).length;
                const instanceName = existingCount > 0 
                    ? `${masterNpc?.name || name} ${existingCount + 1}` 
                    : (masterNpc?.name || name);

                const newToken = {
                    id: Date.now(),
                    characterId: entityId,
                    type,
                    x, y,
                    image: masterNpc?.image || image,
                    name: instanceName,
                    size: masterNpc?.size || 'medium',
                    hp: { 
                        current: masterNpc?.hp?.max || 10, 
                        max: masterNpc?.hp?.max || 10, 
                        temp: 0 
                    },
                    statuses: [],
                    isInstance: true
                };
                // END CHANGE
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, tokens: [...tokens, newToken] } } });
            }
        }
    };

    // START CHANGE: HUD Action Handlers
    const handleUpdateToken = (updatedToken) => {
        const newTokens = tokens.map(t => t.id === updatedToken.id ? updatedToken : t);
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, tokens: newTokens } } });
    };

    const handleDeleteToken = (tokenId) => {
        if(confirm("Banish this entity?")) {
            const newTokens = tokens.filter(t => t.id !== tokenId);
            updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, tokens: newTokens } } });
            setSelectedTokenId(null);
        }
    };
    
    // START CHANGE: Connect Sheet Opener
    const handleOpenSheet = (tokenId) => {
        const token = tokens.find(t => t.id === tokenId);
        if (token) {
            // Tell parent to open sheet with TOKEN data (not character ID)
            updateMapState('open_sheet', { 
                type: 'token',
                tokenId: token.id,
                mapId: mapData.id,
                token: token  // Pass full token object
            });
            setSelectedTokenId(null);
        }
    };

    // START CHANGE: Door Toggle and Wall Delete Logic
    const handleToggleDoor = (wallId) => {
        const newWalls = walls.map(w => w.id === wallId ? { ...w, open: !w.open } : w);
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, walls: newWalls } } });
    };

    const handleDeleteWall = (wallId) => {
        const newWalls = walls.filter(w => w.id !== wallId);
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, walls: newWalls } } });
    };
    // END CHANGE

    // START CHANGE: Combined Load Handler
    const handleMapLoad = () => {
        const img = mapImageRef.current;
        const canvas = visionCanvasRef.current;
        
        if (img && canvas) {
            // 1. Init Vision Canvas
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            renderVision();
            
            // 2. Fix Token Alignment (The "Still Not Working" Fix)
            snapAllTokens();
        }
    };

    // Force Init if image is cached
    useEffect(() => {
        if (mapImageRef.current?.complete) {
            handleMapLoad();
        }
    }, [mapUrl]);
    // END CHANGE

    // START CHANGE: Native Non-Passive Wheel Listener (Fixes "Whole App" Zoom)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e) => {
            e.preventDefault(); // STOP browser from zooming the whole page
            
            // 1. Zoom Logic
            const scaleSensitivity = 0.001;
            const delta = -e.deltaY * scaleSensitivity;
            const newScale = Math.min(Math.max(0.1, view.scale + delta), 5);

            // 2. Mouse Position relative to container
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // 3. Math to keep cursor focused
            const worldX = (mouseX - view.x) / view.scale;
            const worldY = (mouseY - view.y) / view.scale;

            const newX = mouseX - (worldX * newScale);
            const newY = mouseY - (worldY * newScale);

            setView({ x: newX, y: newY, scale: newScale });
        };

        // { passive: false } is REQUIRED to allow e.preventDefault()
        container.addEventListener('wheel', onWheel, { passive: false });

        return () => container.removeEventListener('wheel', onWheel);
    }, [view]); 
    // END CHANGE

    return (
        <div 
            ref={containerRef}
            className={`w-full h-full bg-[#1a1a1a] overflow-hidden relative select-none ${activeTool === 'move' ? 'cursor-grab' : 'cursor-crosshair'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            {/* --- TOP RIGHT CONTROLS (Library, Tokens, Zoom) --- */}
            <div className="absolute top-4 right-4 z-50 flex gap-2 pointer-events-auto">
                <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-1 flex gap-1 shadow-xl">
                    <button onClick={() => setShowLibrary(true)} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded" title="Maps">
                        <Icon name="map" size={20}/>
                    </button>
                    <div className="w-px h-6 bg-slate-700 my-auto"></div>
                    <button onClick={() => setShowTokens(!showTokens)} className={`p-2 rounded transition-colors ${showTokens ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Tokens">
                        <Icon name="users" size={20}/>
                    </button>
                    {/* START CHANGE: Add Fight Button */}
                    <button onClick={() => showCombat ? setShowCombat(false) : handleStartCombat()} className={`p-2 rounded transition-colors ${showCombat || data.campaign?.combat?.active ? 'bg-red-600 text-white animate-pulse' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Combat Tracker">
                        <Icon name="swords" size={20}/>
                    </button>
                    {/* END CHANGE */}
                </div>
                
                <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-1 flex gap-1 shadow-xl">
                    <button onClick={() => setView(v => ({...v, scale: v.scale / 1.2}))} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded"><Icon name="minus" size={20}/></button>
                    <button onClick={() => setView(v => ({...v, scale: v.scale * 1.2}))} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded"><Icon name="plus" size={20}/></button>
                </div>
            </div>

            {/* --- TOP LEFT HUD (Status) --- */}
            <div className="absolute top-4 left-4 z-50 pointer-events-none">
                <div className="bg-slate-900/90 backdrop-blur border border-slate-700 px-3 py-2 rounded-lg shadow-xl pointer-events-auto flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${data.activeUsers ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`}></div>
                    <div>
                        <div className="text-xs font-bold text-amber-500 fantasy-font tracking-widest">{data.campaign?.genesis?.campaignName || "Unknown Realm"}</div>
                        <div className="text-[9px] text-slate-400 font-mono">LOC: {data.campaign?.location || "Void"}</div>
                    </div>
                </div>
            </div>

            {/* START CHANGE: Pass Vision Props to Toolbar */}
            {/* --- BOTTOM CENTER TOOLBAR (DM Only) --- */}
            {role === 'dm' && (
                <MapToolbar 
                    activeTool={activeTool} 
                    setTool={setActiveTool} 
                    visionActive={visionActive}
                    onToggleVision={() => {
                        updateCloud({ 
                            ...data, 
                            campaign: { 
                                ...data.campaign, 
                                activeMap: { ...mapData, visionActive: !visionActive } 
                            } 
                        });
                    }}
                />
            )}
            {/* END CHANGE */}

            {/* Grid Config Panel */}
            {role === 'dm' && activeTool === 'grid' && (
                <GridControls grid={mapGrid} onUpdate={handleGridUpdate} onClose={() => setActiveTool('move')} />
            )}
            {/* END CHANGE */}

            {/* --- RIGHT SIDEBAR (Token Manager) --- */}
            {showTokens && (
                <div className="absolute top-20 right-4 bottom-24 w-64 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl z-40 p-4 animate-in slide-in-from-right pointer-events-auto">
                    <TokenManager data={data} onDragStart={handleDragStart} />
                </div>
            )}

            {/* START CHANGE: Render Combat Tracker */}
            {showCombat && (
                <CombatTracker 
                    combat={data.campaign?.combat} 
                    onNextTurn={handleNextTurn} 
                    onEndCombat={handleEndCombat}
                    role={role}
                />
            )}
            {/* END CHANGE */}

            {/* --- MAP LIBRARY MODAL --- */}
            {showLibrary && (
                <MapLibrary 
                    savedMaps={data.campaign?.savedMaps || []} 
                    onSelect={(m) => { updateMapState('load_map', m); setShowLibrary(false); }} 
                    onClose={() => setShowLibrary(false)} 
                    onDelete={(id) => updateMapState('delete_map', id)}
                />
            )}

            {/* --- TRANSFORM LAYER --- */}
            <div 
                style={{ 
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                    transformOrigin: '0 0',
                    transition: isDraggingMap ? 'none' : 'transform 0.1s ease-out'
                }}
                className="absolute top-0 left-0 w-full h-full will-change-transform"
            >
                {mapUrl ? (
                    <div className="relative inline-block shadow-2xl">
                        <img 
                            ref={mapImageRef}
                            src={mapUrl}
                            // START CHANGE: Use new handler & Fix CSS
                            onLoad={handleMapLoad}
                            className="block object-contain pointer-events-none select-none"
                            // END CHANGE
                            alt="Map Board"
                        />

                    {/* START CHANGE: Single Vision Canvas (Layer 4) */}
                    {/* Fog Canvas is gone. Vision Canvas handles everything. */}
                    <canvas 
                        ref={visionCanvasRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none z-[6]"
                    />
                    {/* END CHANGE */}

                    {/* Dynamic Grid Layer */}
                    {mapGrid.visible && (() => {
                            // START CHANGE: Set a hard minimum to prevent disappearing lines
                            const lineWidth = Math.max(0.5, mapGrid.size / 80); 

                            return (
                                <div 
                                    className="absolute inset-0 pointer-events-none opacity-30 transition-all duration-300" 
                                    style={{ 
                                        backgroundImage: `linear-gradient(to right, #fff ${lineWidth}px, transparent ${lineWidth}px), linear-gradient(to bottom, #fff ${lineWidth}px, transparent ${lineWidth}px)`, 
                                        backgroundSize: `${mapGrid.size}px ${mapGrid.size}px`,
                                        backgroundPosition: `${mapGrid.offsetX}px ${mapGrid.offsetY}px`,
                                        imageRendering: 'pixelated'
                                    }}
                                ></div>
                            );
                        })()}
                        {/* END CHANGE */}

                        {/* Phase 3 Wall/Door SVG Layer */}
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-auto z-[8]" style={{ viewBox: `0 0 ${mapImageRef.current?.naturalWidth} ${mapImageRef.current?.naturalHeight}` }}>
                            {/* 1. Render Saved Walls */}
                            {walls.map(w => {
                                // START CHANGE: Visibility and Delete Logic
                                // Only show 'wall' lines if DM is using the Wall/Door tool
                                const isEditing = role === 'dm' && (activeTool === 'wall' || activeTool === 'door');
                                const isDeleting = role === 'dm' && activeTool === 'delete';
                                const isDoor = w.type === 'door';
                                const isHovered = hoveredWallId === w.id;
                                
                                // Skip rendering simple walls if not editing or deleting
                                if (!isDoor && !isEditing && !isDeleting) return null;
                                // END CHANGE

                                return (
                                    <g key={w.id} 
                                       onMouseEnter={() => isDeleting && setHoveredWallId(w.id)}
                                       onMouseLeave={() => setHoveredWallId(null)}
                                       onClick={(e) => { 
                                           e.stopPropagation(); 
                                           if (isDoor && isEditing) handleToggleDoor(w.id);
                                           if (isDeleting) handleDeleteWall(w.id);
                                       }} 
                                       className={isDeleting ? 'cursor-pointer' : (isDoor ? 'cursor-pointer hover:opacity-70' : '')}>
                                        {/* Draw the line */}
                                        {(isEditing || isDoor || isDeleting) && (
                                            <line 
                                                x1={w.p1.x} y1={w.p1.y} x2={w.p2.x} y2={w.p2.y} 
                                                stroke={isDeleting && isHovered ? '#ff6b6b' : (w.type === 'wall' ? '#3b82f6' : (w.open ? '#22c55e' : '#f59e0b'))} 
                                                strokeWidth={isDeleting && isHovered ? 8 : 6} 
                                                strokeLinecap="round"
                                                opacity={isDeleting && isHovered ? 1 : (isDoor && w.open ? 0.3 : 0.8)}
                                            />
                                        )}
                                        {/* Door Handle Icon (Only visible when on Pen/Wall/Door tool) */}
                                        {isDoor && isEditing && (
                                            <circle cx={(w.p1.x + w.p2.x)/2} cy={(w.p1.y + w.p2.y)/2} r={5} fill="white" stroke="black" strokeWidth={1} />
                                        )}
                                        {/* Delete Indicator (Only visible when on Delete tool) */}
                                        {isDeleting && (
                                            <circle cx={(w.p1.x + w.p2.x)/2} cy={(w.p1.y + w.p2.y)/2} r={8} fill="none" stroke="#ff6b6b" strokeWidth={2} opacity={isHovered ? 1 : 0.5} />
                                        )}
                                    </g>
                                );
                            })}
                            
                            {/* 2. Render Live Preview Line */}
                            {wallStart && (
                                <line 
                                    x1={wallStart.x} y1={wallStart.y} x2={cursorPos.x} y2={cursorPos.y} 
                                    stroke={activeTool === 'wall' ? '#3b82f6' : '#f59e0b'} 
                                    strokeWidth={4} 
                                    strokeDasharray="10,5"
                                />
                            )}
                        </svg>
                        {/* END CHANGE */}

                        {/* Render Tokens */}
                        {tokens.map(token => {
                            const img = mapImageRef.current;
                            const isMoving = movingTokenId === token.id;
                            
                            let px = 0, py = 0;
                            
                            if (isMoving && movingTokenPos) {
                                // START CHANGE: Move this calculation UP so it exists before snapToGrid uses it
                                const sizeMap = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
                                const sMult = typeof token.size === 'number' ? token.size : (sizeMap[token.size] || 1);
                                
                                const snapped = snapToGrid(movingTokenPos.x, movingTokenPos.y, img.naturalWidth, img.naturalHeight, sMult);
                                px = (snapped.x / 100) * img.naturalWidth;
                                py = (snapped.y / 100) * img.naturalHeight;
                                // END CHANGE
                            } else if (img) {
                                px = (token.x / 100) * img.naturalWidth;
                                py = (token.y / 100) * img.naturalHeight;
                            }
                            
                            // Determine actual grid size
                            const currentGridSize = mapGrid.size || 50;

                            // START CHANGE: Fix NaN math and define isShaking
                            const sizeMap = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
                            const sizeMult = typeof token.size === 'number' ? token.size : (sizeMap[token.size] || 1);
                            const dimension = currentGridSize * sizeMult; 
                            
                            const isShaking = shakingTokenId === token.id;
                            // END CHANGE

                            return (
                                <div 
                                    key={token.id} 
                                    id={`token-node-${token.id}`}
                                    style={{ 
                                        position: 'absolute', 
                                        // START CHANGE: Use Raw Coords (Grid now returns Center)
                                        // CRITICAL: Ensure NO "+ (dimension / 2)" is here. Just raw px/py.
                                        left: px, 
                                        top: py, 
                                        transform: 'translate(-50%, -50%)', // ADDED LINE
                                        // END CHANGE
                                        width: dimension,   
                                        height: dimension, 
                                        zIndex: isMoving ? 100 : 10 
                                    }}
                                    // START CHANGE: Visual Feedback for Collision
                                    className={isShaking ? "animate-bounce bg-red-500/50 rounded-full" : ""}
                                    // END CHANGE
                                    onMouseDown={(e) => handleTokenMouseDown(e, token.id)}
                                >
                                    <Token 
                                        token={token} 
                                        isOwner={role === 'dm' || token.ownerId === data.user?.uid} 
                                        cellPx={currentGridSize} 
                                        isDragging={isMoving}
                                        isSelected={selectedTokenId === token.id}
                                        overridePos={{ x: 50, y: 50 }} // ADDED LINE
                                    />
                                </div>
                            );
                            // END CHANGE
                        })}
                    </div>
                ) : (
                    <div className="flex items-center justify-center w-[800px] h-[600px] bg-slate-800 border-2 border-dashed border-slate-700 rounded-xl m-20">
                        <div className="text-center text-slate-500">
                            <Icon name="map" size={48} className="mx-auto mb-2 opacity-50"/>
                            <p>No map projected.</p>
                            {role === 'dm' && <p className="text-xs mt-2 text-indigo-400 cursor-pointer hover:underline" onClick={() => setShowLibrary(true)}>Open Library</p>}
                        </div>
                    </div>
                )}
            </div>

            {/* START CHANGE: Radial HUD Integration */}
            {selectedTokenId && (() => {
                const token = tokens.find(t => t.id === selectedTokenId);
                const tokenElement = document.getElementById(`token-node-${selectedTokenId}`);
                const container = containerRef.current;

                // Safety: Need token data, the rendered DOM element, and the map container
                if (!token || !tokenElement || !container) return null;

                // 1. Measure positions directly from the DOM (Perfect Accuracy)
                const tRect = tokenElement.getBoundingClientRect();
                const cRect = container.getBoundingClientRect();

                // 2. Calculate Center relative to the container
                const centerX = (tRect.left - cRect.left) + (tRect.width / 2);
                const centerY = (tRect.top - cRect.top) + (tRect.height / 2);

                return (
                    <RadialHUD 
                        key={token.id}
                        token={token}
                        position={{ x: centerX, y: centerY }}
                        onUpdateToken={handleUpdateToken}
                        onDelete={() => handleDeleteToken(token.id)}
                        onOpenSheet={() => handleOpenSheet(token.id)}
                        onClose={() => setSelectedTokenId(null)}
                    />
                );
            })()}
            {/* END CHANGE */}
        </div>
    );
};

export default InteractiveMap;