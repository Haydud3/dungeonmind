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

const InteractiveMap = ({ data, role, updateMapState, updateCloud, onDiceRoll, activeTemplate, sidebarIsOpen }) => {
    // View & Interaction State
    const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
    
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

    // START CHANGE: Hot-Swap Sheets on Token Selection
    // When sidebar is open and a new token is selected, automatically open its sheet
    // WITHOUT closing the RadialHUD
    useEffect(() => {
        if (sidebarIsOpen && selectedTokenId) {
            const token = tokens.find(t => t.id === selectedTokenId);
            if (token) {
                // Open sheet WITHOUT setting selectedTokenId to null (keeps HUD open)
                updateMapState('open_sheet', { 
                    type: 'token',
                    tokenId: token.id,
                    mapId: mapData.id,
                    token: token,
                    forceOpen: true
                });
            }
        }
    }, [selectedTokenId, sidebarIsOpen]);
    // END CHANGE

    // --- 1. RENDERERS (Vision Logic) ---
    
    // Helper: Calculate vision radius based on character darkvision and equipment
    const calculateVisionRadius = (token, character) => {
        if (!visionActive) return 99999; // Infinite range when lights off (but walls still block)
        
        // Convert D&D feet to pixels: 50px = 5ft (1 grid square)
        const ftToPixels = (ft) => (ft / 5) * 50;
        
        let visionRadius = 0;
        let hasTorch = false;
        let hasLantern = false;
        
        // Check inventory for light sources
        if (character.inventory && Array.isArray(character.inventory)) {
            for (const item of character.inventory) {
                const itemName = (item.name || '').toLowerCase();
                if (itemName.includes('torch')) hasTorch = true;
                if (itemName.includes('lantern')) hasLantern = true;
            }
        }
        
        // Calculate base vision
        const darkVisionFt = character.senses?.darkvision || 0;
        
        if (hasTorch) {
            // Torch: 20ft bright light + 20ft dim light (use 40ft as full range)
            visionRadius = ftToPixels(40);
        } else if (hasLantern) {
            // Lantern: Similar to torch (30ft bright + 30ft dim, use 60ft)
            visionRadius = ftToPixels(60);
        } else if (darkVisionFt > 0) {
            // Has darkvision
            visionRadius = ftToPixels(darkVisionFt);
        } else {
            // No light source, no darkvision: 2ft vision (very limited)
            visionRadius = ftToPixels(2);
        }
        
        return visionRadius;
    };

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

        // ===== UNIFIED VISION PASS (FIX FOR DOUBLE-PUNCH EFFECT) =====
        // Instead of per-token rendering with overlapping destination-out operations,
        // collect all token vision polygons FIRST, then apply a single unified shadow pass.
        // This ensures the raycasting layer is the final authority without conflicts.
        // NOTE: Even when visionActive is OFF, walls still block vision (infinite range mode)

        // 2. COLLECT PHASE: Build token vision data WITHOUT rendering yet
        const tokenVisionData = [];
        
        tokens.forEach(token => {
            // Only PCs emit vision (NPCs don't reveal fog)
            if (token.type !== 'pc') return;

            // Vision Origin (center of token)
            const origin = {
                x: (token.x / 100) * img.naturalWidth,
                y: (token.y / 100) * img.naturalHeight
            };

            // Calculate vision radius based on character sheet (darkvision + equipment)
            let visionRadius = 200; // Fallback default
            if (data.campaign?.characters?.[token.characterId]) {
                const character = data.campaign.characters[token.characterId];
                visionRadius = calculateVisionRadius(token, character);
            } else {
                // No character data, use fallback
                visionRadius = visionActive ? 200 : 99999;
            }

            // Wall & Door Blocking Logic
            const blockingSegments = walls.filter(w => {
                if (w.type === 'door' && w.isOpen) return false;
                return true;
            });

            // Raycasting to calculate visibility polygon
            // Walls always block, even when lights are off
            const polygon = calculateVisibilityPolygon(origin, blockingSegments, { 
                width: canvas.width, 
                height: canvas.height,
                maxRange: visionRadius
            });

            tokenVisionData.push({
                origin,
                visionRadius,
                polygon,
                token
            });
        });

        // 3. RENDER PHASE: Apply unified shadow pass
        // Step A: Only fill with shadow if vision is ACTIVE
        // When vision is OFF, skip shadow fill to show full map
        // But raycasting below still renders wall-based blocking
        if (visionActive) {
            ctx.fillStyle = '#000000';
            if (role === 'dm') {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.55;
            } else {
                ctx.globalAlpha = 1.0;
            }
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Step B: Carve out UNIFIED vision region using combined visibility
        // This is the key fix: all token vision combines into ONE erase operation
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 25;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';

        // Step B: Carve out UNIFIED vision region using combined visibility
        // This is the key fix: all token vision combines into ONE erase operation
        // Only carve if there's a base shadow to carve from
        if (visionActive) {
            // Draw all visibility polygons combined (additive merge)
            tokenVisionData.forEach(({ polygon }) => {
                ctx.beginPath();
                if (polygon.length > 0) {
                    ctx.moveTo(polygon[0].x, polygon[0].y);
                    for (let i = 1; i < polygon.length; i++) {
                        ctx.lineTo(polygon[i].x, polygon[i].y);
                    }
                    ctx.closePath();
                }
                ctx.fill();
            });

            // Step C: Apply gradient softening on vision edges
            ctx.globalCompositeOperation = 'destination-out';
            tokenVisionData.forEach(({ origin, visionRadius }) => {
                const gradient = ctx.createRadialGradient(origin.x, origin.y, visionRadius * 0.8, origin.x, origin.y, visionRadius);
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(origin.x, origin.y, visionRadius, 0, Math.PI * 2);
                ctx.fill();
            });

            // Step D: Apply hard darkvision limits (player-only boundary enforcement)
            if (role !== 'dm') {
                ctx.globalCompositeOperation = 'source-over';
                tokenVisionData.forEach(({ origin, visionRadius }) => {
                    ctx.beginPath();
                    ctx.arc(origin.x, origin.y, visionRadius + 50, 0, Math.PI * 2);
                    ctx.arc(origin.x, origin.y, visionRadius, 0, Math.PI * 2, true);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                    ctx.fill();
                });
            }

            // Step E: GATEKEEPER PHASE (Vision ON) - Final shadow pass - raycasting wins over pen tool
            // This re-applies shadows using the unified vision data to ensure no leaks
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = role === 'dm' ? 0.3 : 0.6;
            ctx.fillStyle = '#000000';

            // For each token, draw the inverse (everything OUTSIDE their polygon)
            tokenVisionData.forEach(({ polygon }) => {
                ctx.beginPath();
                ctx.rect(0, 0, canvas.width, canvas.height);
                if (polygon.length > 0) {
                    ctx.moveTo(polygon[0].x, polygon[0].y);
                    for (let i = 1; i < polygon.length; i++) {
                        ctx.lineTo(polygon[i].x, polygon[i].y);
                    }
                }
                ctx.fill('evenodd');
            });
        } else {
            // Step B (Vision OFF): Render wall-based vision blocking without shadow fog
            // Draw walls as opaque black to block line of sight, even though map is visible
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            
            tokenVisionData.forEach(({ polygon }) => {
                // Draw everything OUTSIDE the polygon as a wall shadow
                // This creates a "light-safe" mode where you can see everything but walls still block
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.rect(0, 0, canvas.width, canvas.height);
                if (polygon.length > 0) {
                    ctx.moveTo(polygon[0].x, polygon[0].y);
                    for (let i = 1; i < polygon.length; i++) {
                        ctx.lineTo(polygon[i].x, polygon[i].y);
                    }
                }
                ctx.fill('evenodd');
            });
        }

        // Reset
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
    };

    // Re-render when relevant state changes
    useEffect(() => { renderVision(); }, [tokens, walls, visionActive, role, mapUrl, data.campaign?.characters]);
    // END CHANGE

    // --- 2. MATH HELPERS ---
    
    // START CHANGE: Point-to-Line Segment Distance Helper (For Door/Delete Hit-Testing)
    // Returns the perpendicular distance from point (px, py) to line segment (x1,y1)-(x2,y2)
    const pointToSegmentDistance = (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        
        if (lengthSquared === 0) {
            // Point is a line (degenerate case)
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }
        
        // Calculate parameter t: projection of point onto line
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t)); // Clamp to segment
        
        // Find closest point on segment
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        
        // Distance from point to closest point on segment
        return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    };
    // END CHANGE
    
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
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [isDraggingToken, setIsDraggingToken] = useState(false);

    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // Right-click still passes for HUD
        
        // START CHANGE: We no longer 'return' early here.
        // We let the map prepare to pan regardless of what was clicked.
        setIsPanning(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e) => {
        // Pan the map if not moving a token and not dragging
        if (isPanning && !movingTokenId && !isDraggingToken) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            setLastMousePos({ x: e.clientX, y: e.clientY });
        }
        
        // Update Cursor Position for Drawing/Door/Delete Tools
        if (activeTool === 'wall' || activeTool === 'door' || activeTool === 'delete') {
            const img = mapImageRef.current;
            if (img && img.naturalWidth && img.naturalHeight) {
                // Use same coordinate transformation as handleMapClick
                const rect = containerRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                // Convert to world space
                const worldX = (mouseX - view.x) / view.scale;
                const worldY = (mouseY - view.y) / view.scale;
                
                // Convert to pixel coordinates (same as wall anchor)
                const percentX = (worldX / img.naturalWidth) * 100;
                const percentY = (worldY / img.naturalHeight) * 100;
                const pixelX = (percentX / 100) * img.naturalWidth;
                const pixelY = (percentY / 100) * img.naturalHeight;
                
                setCursorPos({ x: pixelX, y: pixelY });
            }
        }

        // Update Moving Token Position
        if (movingTokenId) {
            const pos = getMapCoords(e);
            setMovingTokenPos(pos);
        }
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        
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
                token: token,  // Pass full token object
                forceOpen: true  // Flag: Always open sheet when HUD button is clicked
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

    // START CHANGE: Wall Drawing Handlers
    const handleMapClick = (e) => {
        // Only DM can use these tools
        if (role !== 'dm') return;
        
        // Only respond to left-click
        if (e.button !== 0) return;
        
        const img = mapImageRef.current;
        if (!img || !img.naturalWidth) return;

        // Get click position
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Convert to world space
        const worldX = (mouseX - view.x) / view.scale;
        const worldY = (mouseY - view.y) / view.scale;
        
        // Convert to pixel coordinates
        const percentX = (worldX / img.naturalWidth) * 100;
        const percentY = (worldY / img.naturalHeight) * 100;
        const pixelX = (percentX / 100) * img.naturalWidth;
        const pixelY = (percentY / 100) * img.naturalHeight;

        // --- DOOR TOOL: Hit-Test to Convert Wall to Door or Toggle Door Open/Close ---
        if (activeTool === 'door') {
            const HIT_THRESHOLD = 10; // pixels
            
            // Search for nearby walls
            const nearbyWall = walls.find(w => {
                const distance = pointToSegmentDistance(
                    pixelX, pixelY, 
                    w.p1.x, w.p1.y, 
                    w.p2.x, w.p2.y
                );
                return distance <= HIT_THRESHOLD;
            });
            
            if (nearbyWall) {
                let updatedWall;
                
                if (nearbyWall.type === 'door') {
                    // Already a door: toggle isOpen
                    updatedWall = {
                        ...nearbyWall,
                        isOpen: !nearbyWall.isOpen
                    };
                } else {
                    // Regular wall: convert to door (closed by default)
                    updatedWall = {
                        ...nearbyWall,
                        type: 'door',
                        isOpen: false
                    };
                }
                
                const newWalls = walls.map(w => w.id === nearbyWall.id ? updatedWall : w);
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, walls: newWalls } } });
            }
            return;
        }

        // --- DELETE TOOL: Hit-Test and Remove Wall ---
        if (activeTool === 'delete') {
            const HIT_THRESHOLD = 10; // pixels
            
            // Search for nearby walls
            const wallToDelete = walls.find(w => {
                const distance = pointToSegmentDistance(
                    pixelX, pixelY, 
                    w.p1.x, w.p1.y, 
                    w.p2.x, w.p2.y
                );
                return distance <= HIT_THRESHOLD;
            });
            
            if (wallToDelete) {
                // Delete the wall
                const newWalls = walls.filter(w => w.id !== wallToDelete.id);
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, walls: newWalls } } });
            }
            return;
        }

        // --- WALL TOOL: Draw walls with anchor/lock/chain ---
        if (activeTool !== 'wall') return;

        if (!wallStart) {
            // ANCHOR: First click - set anchor point
            setWallStart({ x: pixelX, y: pixelY });
        } else {
            // LOCK: Second click - create wall and chain
            const newWall = {
                id: `wall-${Date.now()}`,
                p1: { x: wallStart.x, y: wallStart.y },
                p2: { x: pixelX, y: pixelY },
                type: 'wall',
                isOpen: false,
                percentStart: { x: (wallStart.x / img.naturalWidth) * 100, y: (wallStart.y / img.naturalHeight) * 100 },
                percentEnd: { x: (pixelX / img.naturalWidth) * 100, y: (pixelY / img.naturalHeight) * 100 }
            };
            
            // Add wall to cloud
            const newWalls = [...walls, newWall];
            updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, walls: newWalls } } });
            
            // CHAIN: Start new anchor at this point
            setWallStart({ x: pixelX, y: pixelY });
        }
    };

    const handleMapRightClick = (e) => {
        if (role !== 'dm' || (activeTool !== 'wall' && activeTool !== 'door' && activeTool !== 'delete')) return;
        
        e.preventDefault();
        // CUT: Right-click stops the chain
        setWallStart(null);
    };
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
            onDragEnter={() => setIsDraggingToken(true)}
            onDragLeave={() => setIsDraggingToken(false)}
            onDragEnd={() => setIsDraggingToken(false)}
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
                    transition: isPanning ? 'none' : 'transform 0.1s ease-out'
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
                        <svg 
                            className="absolute top-0 left-0 w-full h-full pointer-events-auto z-[8]" 
                            style={{ viewBox: `0 0 ${mapImageRef.current?.naturalWidth} ${mapImageRef.current?.naturalHeight}` }}
                            onClick={handleMapClick}
                            onContextMenu={handleMapRightClick}
                        >
                            {/* 1. Render Saved Walls & Doors (Only visible when using wall/door/delete tools) */}
                            {walls.map(w => {
                                // Only show walls when DM is using the Wall, Door, or Delete tool
                                const isToolActive = role === 'dm' && (activeTool === 'wall' || activeTool === 'door' || activeTool === 'delete');
                                if (!isToolActive) return null;
                                
                                const isDoor = w.type === 'door';
                                const lineColor = isDoor ? (w.isOpen ? '#22c55e' : '#f59e0b') : '#3b82f6';
                                // END CHANGE

                                return (
                                    <line 
                                        key={w.id}
                                        x1={w.p1.x} y1={w.p1.y} x2={w.p2.x} y2={w.p2.y} 
                                        stroke={lineColor}
                                        strokeWidth={6} 
                                        strokeLinecap="round"
                                        opacity={0.8}
                                    />
                                );
                            })}
                            
                            {/* 2. Render Ghost Line (Live Preview for Wall/Door Drawing) */}
                            {wallStart && (activeTool === 'wall' || activeTool === 'door') && (
                                <line 
                                    x1={wallStart.x} y1={wallStart.y} x2={cursorPos.x} y2={cursorPos.y} 
                                    stroke={activeTool === 'wall' ? '#3b82f6' : '#f59e0b'} 
                                    strokeWidth={4} 
                                    strokeDasharray="10,5"
                                    opacity={0.6}
                                    pointerEvents="none"
                                />
                            )}
                            
                            {/* 3. Render Proximity Circle for Door/Delete Tools */}
                            {(activeTool === 'delete' || activeTool === 'door') && (
                                <circle 
                                    cx={cursorPos.x} cy={cursorPos.y} r={10}
                                    fill="none"
                                    stroke={activeTool === 'delete' ? '#ef4444' : '#f59e0b'}
                                    strokeWidth={2}
                                    strokeDasharray="5,5"
                                    opacity={0.4}
                                    pointerEvents="none"
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