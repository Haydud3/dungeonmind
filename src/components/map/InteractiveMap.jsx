import React, { useState, useRef, useEffect } from 'react';
import Icon from '../Icon';
import Token from '../Token'; 
// START CHANGE: Import Vision Math
import { calculateVisibilityPolygon, getCharacterVisionSettings } from '../../utils/visionMath';
// END CHANGE
import MapToolbar from './MapToolbar';
import MapLibrary from './MapLibrary';
import TokenManager from './TokenManager';
// START CHANGE: Import GridControls
import GridControls from './GridControls';
import CombatTracker from './CombatTracker';
// START CHANGE: Import Radial HUD
import RadialHUD from './RadialHUD';
import { enrichCharacter } from '../../utils/srdEnricher';

// START CHANGE: Add onAutoRoll to destructured props
const InteractiveMap = ({ data, role, updateMapState, updateCloud, onDiceRoll, activeTemplate, sidebarIsOpen, updateCombatant, removeCombatant, onClearRolls, onAutoRoll }) => {
    // 1. ALL STATE HOOKS
    const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
    const [activeTool, setActiveTool] = useState('move');
    const [showLibrary, setShowLibrary] = useState(false);
    const [showTokens, setShowTokens] = useState(false);
    const [hoveredWallId, setHoveredWallId] = useState(null);
    const [showCombat, setShowCombat] = useState(false);
    const [isDrawingFog, setIsDrawingFog] = useState(false);
    const [currentPath, setCurrentPath] = useState([]);
    const [movingTokenId, setMovingTokenId] = useState(null);
    const [movingTokenPos, setMovingTokenPos] = useState(null); 
    const [wallStart, setWallStart] = useState(null);
    const [cursorPos, setCursorPos] = useState({x:0, y:0}); 
    const [shakingTokenId, setShakingTokenId] = useState(null);
    const [selectedTokenId, setSelectedTokenId] = useState(null);
    const [pings, setPings] = useState([]); 
    const [dragStartPx, setDragStartPx] = useState(null); 
    const [activeMeasurement, setActiveMeasurement] = useState(null); 
    const [activeStack, setActiveStack] = useState(null); 
    const [isDraggingToken, setIsDraggingToken] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [spawningToken, setSpawningToken] = useState(null);

    // 2. DATA SHORTCUTS (Must be after state)
    const mapData = data.campaign?.activeMap || {};
    const tokens = mapData.tokens || [];
    const walls = mapData.walls || [];
    const mapUrl = mapData.url;
    const visionActive = mapData.visionActive !== false; 
    const mapGrid = mapData.grid || { size: 50, offsetX: 0, offsetY: 0, visible: true, snap: true };

    // 3. HANDLERS
    const handleGridUpdate = (newGrid) => {
        updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, grid: newGrid } } });
    };

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
            updateCloud({ ...data, campaign: { ...data.campaign, combat: { active: false, round: 1, turn: 0, combatants: [] } } });
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

    const triggerHaptic = (style = 'light') => {
        if (!window.navigator.vibrate) return;
        if (style === 'light') window.navigator.vibrate(5);
        else if (style === 'medium') window.navigator.vibrate(40);
        else if (style === 'heavy') window.navigator.vibrate([40, 60, 40]);
        else if (style === 'ping') window.navigator.vibrate(100);
    };

    // 4. ALL REFS
    const containerRef = useRef(null);
    const visionCanvasRef = useRef(null);
    const mapImageRef = useRef(null);
    const lastSnappedCell = useRef({ x: -1, y: -1 });
    const touchStartPos = useRef({ x: 0, y: 0 });
    const longPressTimer = useRef(null);
    const lastMousePosRef = useRef({ x: 0, y: 0 });
    const pointerCache = useRef([]); // Track multiple fingers
    const pinchStartDist = useRef(0); // Initial distance between fingers
    const pinchStartScale = useRef(1); // Initial scale when pinch began
    const latestDataRef = useRef(data);
    const latestTokensRef = useRef(tokens);
    const latestMeasurementRef = useRef(activeMeasurement);

    // 5. EFFECTS & SYNCING
    useEffect(() => {
        latestDataRef.current = data;
        latestTokensRef.current = tokens;
        latestMeasurementRef.current = activeMeasurement;
    }, [data, tokens, activeMeasurement]);

    useEffect(() => {
        if (mapData.view) {
            setView(prev => ({
                x: mapData.view.pan?.x ?? prev.x,
                y: mapData.view.pan?.y ?? prev.y,
                scale: mapData.view.zoom ?? prev.scale
            }));
        }
    }, [mapData.id]);

    useEffect(() => {
        if (data.campaign?.combat?.active) setShowCombat(true);
    }, [data.campaign?.combat?.active]);

    useEffect(() => {
        if (sidebarIsOpen && selectedTokenId) {
            const token = tokens.find(t => t.id === selectedTokenId);
            if (token) {
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

            // Calculate vision settings using centralized 5e logic
            // Use current grid size for pixel conversion (default 50)
            const gridSize = mapGrid.size || 50;
            let visionRadius = visionActive ? (200 / 50) * gridSize : 99999; // Fallback default
            let visionColor = '#000000';

            // Find character data
            // Check both players array and npcs array for the character ID
            const character = data.players?.find(p => p.id === token.characterId) || 
                              data.npcs?.find(n => n.id === token.characterId);

            if (character && visionActive) {
                const settings = getCharacterVisionSettings(character, gridSize);
                visionRadius = settings.radius;
                visionColor = settings.color;
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
                height: canvas.height
            }, visionRadius); // Pass maxRadius as 4th arg

            tokenVisionData.push({
                origin,
                visionRadius,
                polygon,
                token,
                color: visionColor // Store color for rendering warmth (optional future use)
            });
        });

        // 3. RENDER PHASE: Apply unified shadow pass
        // Step A: Initial Fill (The "Fog")
        if (visionActive) {
            ctx.fillStyle = '#000000';
            ctx.globalAlpha = role === 'dm' ? 0.5 : 1.0; // DM sees through the fog
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Step B: Carve out visible areas based on LOS + Range
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1.0; // Erase fully within the mask

        tokenVisionData.forEach(({ origin, visionRadius, polygon }) => {
            ctx.save();
            
            // 1. Create a clipping mask from the raycasted LOS polygon
            if (polygon.length > 0) {
                ctx.beginPath();
                ctx.moveTo(polygon[0].x, polygon[0].y);
                for (let i = 1; i < polygon.length; i++) {
                    ctx.lineTo(polygon[i].x, polygon[i].y);
                }
                ctx.closePath();
                ctx.clip(); // Restricts erasure to Line of Sight only
            }

            // 2. Erase the darkness within the vision radius (torches/darkvision)
            const grad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, visionRadius);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.8, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, visionRadius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        });

        // Step C: Draw LOS Blocking Shadows (used when Lights are On or to deepen shadows)
        if (!visionActive) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#000000';
            ctx.globalAlpha = role === 'dm' ? 0.4 : 1.0; // DM sees through wall shadows too

            tokenVisionData.forEach(({ polygon }) => {
                ctx.beginPath();
                ctx.rect(0, 0, canvas.width, canvas.height);
                if (polygon.length > 0) {
                    ctx.moveTo(polygon[0].x, polygon[0].y);
                    for (let i = 1; i < polygon.length; i++) {
                        ctx.lineTo(polygon[i].x, polygon[i].y);
                    }
                }
                ctx.fill('evenodd'); // Fills everything OUTSIDE the visibility polygon
            });
        }

        // Reset context state for next render
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
    };

    // Re-render when relevant state changes
    useEffect(() => { renderVision(); }, [tokens, walls, visionActive, role, mapUrl, data.campaign?.characters]);

    // --- 1.5 GLOBAL INTERACTION ESCAPE ---
    useEffect(() => {
        const handleGlobalMove = (e) => {
            // CRITICAL FIX: Stop browser native zoom/scroll to prevent "Double Image" crash
            if (e.cancelable && (isPanning || pointerCache.current.length >= 2 || movingTokenId)) {
                e.preventDefault();
            }

            // Update pointer position in cache
            const index = pointerCache.current.findIndex(p => p.id === e.pointerId);
            if (index !== -1) {
                pointerCache.current[index] = { id: e.pointerId, x: e.clientX, y: e.clientY };
            }

            // A. PINCH ZOOM LOGIC (2 Fingers)
            if (pointerCache.current.length === 2) {
                const p1 = pointerCache.current[0];
                const p2 = pointerCache.current[1];
                const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                
                if (pinchStartDist.current > 0) {
                    const rect = containerRef.current.getBoundingClientRect();
                    const zoomFactor = currentDist / pinchStartDist.current;
                    const newScale = Math.min(Math.max(0.1, pinchStartScale.current * zoomFactor), 5);
                    
                    // Midpoint in screen space relative to container
                    const midX = ((p1.x + p2.x) / 2) - rect.left;
                    const midY = ((p1.y + p2.y) / 2) - rect.top;

                    // Zoom at Midpoint math
                    setView(prev => {
                        const scaleRatio = newScale / prev.scale;
                        return {
                            scale: newScale,
                            x: midX - (midX - prev.x) * scaleRatio,
                            y: midY - (midY - prev.y) * scaleRatio
                        };
                    });
                }
                return;
            }

            // B. NORMAL MOVE LOGIC (1 Finger/Mouse)
            if (!movingTokenId && !isPanning && !activeMeasurement) return;
            
            const coords = getMapCoords(e);

            if (activeMeasurement) {
                setActiveMeasurement(prev => ({ ...prev, end: coords }));
            } else if (movingTokenId) {
                setMovingTokenPos(coords);
            } else if (isPanning) {
                // Smooth panning using the MousePos Ref to avoid React state lag
                const dx = e.clientX - lastMousePosRef.current.x;
                const dy = e.clientY - lastMousePosRef.current.y;
                
                setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };

                // Break long-press ping if user is actually dragging the map
                if (longPressTimer.current && Math.hypot(dx, dy) > 2) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                }
            }
        };

        const handleGlobalUp = (e) => {
            // Remove pointer from cache
            pointerCache.current = pointerCache.current.filter(p => p.id !== e.pointerId);
            
            // If we fall below 2 fingers, reset pinch tracking
            if (pointerCache.current.length < 2) {
                pinchStartDist.current = 0;
            }

            const mTokenId = movingTokenId;
            const mPos = movingTokenPos;
            const mData = latestDataRef.current;
            const currentTokens = latestTokensRef.current;

            // 1. CLICK LOGIC: Open Radial HUD (Check distance from touchStartPos)
            const dist = Math.hypot(e.clientX - touchStartPos.current.x, e.clientY - touchStartPos.current.y);
            const isClick = dist < 5;

            if (mTokenId && isClick) {
                setSelectedTokenId(mTokenId);
                triggerHaptic('light');
            }

            // 2. MOVE LOGIC: Save Position
            if (mTokenId && mPos && !isClick) {
                const img = mapImageRef.current;
                if (img) {
                    const tokenObj = currentTokens.find(t => t.id === mTokenId);
                    const sizeMap = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
                    const sMult = typeof tokenObj?.size === 'number' ? tokenObj.size : (sizeMap[tokenObj?.size] || 1);
                    const { x, y } = snapToGrid(mPos.x, mPos.y, img.naturalWidth, img.naturalHeight, sMult);
                    
                    const newTokens = currentTokens.map(t => t.id === mTokenId ? { ...t, x, y } : t);
                    updateCloud({ ...mData, campaign: { ...data.campaign, activeMap: { ...mData.campaign.activeMap, tokens: newTokens } } }, true);
                }
            }

            // 3. UNCONDITIONAL RESET (Fixes the "Sticking" bug)
            setMovingTokenId(null);
            setMovingTokenPos(null);
            setIsPanning(false);
            setIsDraggingToken(false);
            setActiveMeasurement(null);
            
            // Release the pointer lock from the browser
            if (e.target && e.target.releasePointerCapture) {
                try { e.target.releasePointerCapture(e.pointerId); } catch(err) {}
            }
            
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        };

        // FIX: Change passive to FALSE. This allows e.preventDefault() to work, stopping the browser crash.
        window.addEventListener('pointermove', handleGlobalMove, { passive: false });
        window.addEventListener('pointerup', handleGlobalUp);
        // ADD: Touchmove listener specifically for Safari iOS stability
        window.addEventListener('touchmove', handleGlobalMove, { passive: false });

        return () => {
            window.removeEventListener('pointermove', handleGlobalMove);
            window.removeEventListener('pointerup', handleGlobalUp);
            window.removeEventListener('touchmove', handleGlobalMove);
        };
    }, [movingTokenId, isPanning, activeMeasurement, movingTokenPos, tokens, view.scale]);

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

        // 2. Calculate cell index (Use floor to prevent drift loop)
        const col = Math.floor(adjX / mapGrid.size);
        const row = Math.floor(adjY / mapGrid.size);

        // 3. Center logic: Treat 0.5 like an odd number (center snap)
        const isEven = Math.round(sizeMult) % 2 === 0 && sizeMult >= 1;
        const gridOffset = isEven ? 0 : (mapGrid.size / 2);

        const centerX = (col * mapGrid.size) + mapGrid.offsetX + gridOffset;
        const centerY = (row * mapGrid.size) + mapGrid.offsetY + gridOffset;

        return {
            x: (centerX / imgWidth) * 100,
            y: (centerY / imgHeight) * 100
        };
    };

    const getMapCoords = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - view.x) / view.scale,
            y: (e.clientY - rect.top - view.y) / view.scale
        };
    };

    // --- 3. MOUSE HANDLERS (UNIFIED) ---
    const handleTokenPointerDown = (e, tokenId) => {
        if (activeTool !== 'move') return;
        e.stopPropagation(); 
        
        // Hierarchy: Token click stops map panning immediately
        setIsPanning(false);

        // Track start position for Radial HUD (Click vs Drag)
        e.currentTarget.setPointerCapture(e.pointerId);
        touchStartPos.current = { x: e.clientX, y: e.clientY };
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };

        const token = latestTokensRef.current.find(t => t.id === tokenId);
        if (!token) return;

        const img = mapImageRef.current;
        if (!img) return;

        setMovingTokenId(tokenId);
        setIsDraggingToken(true);
        setDragStartPx({ x: (token.x / 100) * img.naturalWidth, y: (token.y / 100) * img.naturalHeight });
    };

    const handlePointerDown = (e) => {
        if (e.button !== 0 && e.button !== 2 && e.pointerType !== 'touch') return; 
// ---------------------------------------------------------
        
        // NEW: Do NOT capture pointer if using drawing tools.
        // This allows the SVG layer and specific click handlers to receive the event.
        const isDrawingTool = ['wall', 'door', 'delete'].includes(activeTool);
        if (!isDrawingTool) {
            e.currentTarget.setPointerCapture(e.pointerId);
        }

        // Add to pointer cache for multi-touch support
        pointerCache.current.push({ id: e.pointerId, x: e.clientX, y: e.clientY });

        if (movingTokenId) return; 

        // CRITICAL: Tells the browser to stick to this element for dragging
        e.currentTarget.setPointerCapture(e.pointerId);

        const coords = getMapCoords(e);
        touchStartPos.current = { x: e.clientX, y: e.clientY };
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };

        // 0. Pinch Detection: If two fingers are down, start pinch logic
        if (pointerCache.current.length === 2) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
            
            const p1 = pointerCache.current[0];
            const p2 = pointerCache.current[1];
            pinchStartDist.current = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            pinchStartScale.current = view.scale;
            setIsPanning(false); // Stop panning to focus on zoom
            return;
        }

        // 1. Measurement Priority
        if (activeTool === 'ruler' || activeTool === 'sphere') {
            const img = mapImageRef.current;
            let startX = coords.x;
            let startY = coords.y;

            if (mapGrid.snap && img) {
                const isSphere = activeTool === 'sphere';
                const snapOffset = isSphere ? 0 : (mapGrid.size / 2);
                startX = (Math.round((coords.x - mapGrid.offsetX) / mapGrid.size) * mapGrid.size) + mapGrid.offsetX + snapOffset;
                startY = (Math.round((coords.y - mapGrid.offsetY) / mapGrid.size) * mapGrid.size) + mapGrid.offsetY + snapOffset;
            }

            setIsPanning(false);
            setActiveMeasurement({ start: { x: startX, y: startY }, end: { x: startX, y: startY }, type: activeTool });
            return; 
        }

        // 2. Map Panning (Move Tool Priority)
        if (activeTool === 'move') {
// ---------------------------------------------------------
            setIsPanning(true);
        }

        // NEW: Explicitly trigger Drawing Logic on Pointer Down for better responsiveness
        if (['wall', 'door', 'delete'].includes(activeTool)) {
            handleMapClick(e);
        }

        // 3. Wall/Door Tools (Claimed by SVG layer via pointer-events, but safe-guard here)
        if (['wall', 'door', 'delete'].includes(activeTool)) return;

        // 4. Ping Logic
        longPressTimer.current = setTimeout(() => {
            triggerHaptic('medium');
            const newPing = { id: Date.now(), x: coords.x, y: coords.y };
            setPings(prev => [...prev, newPing]);
            setTimeout(() => setPings(prev => prev.filter(p => p.id !== newPing.id)), 2000);
        }, 600);
    };


    const handleMouseMove = (e) => {
        const coords = getMapCoords(e);

        if (activeMeasurement) {
            // Ensure measurement updates even if cursor moves over a token
            setActiveMeasurement(prev => ({ ...prev, end: coords }));
            return;
        }

        if (movingTokenId) {
            setMovingTokenPos(coords);
            return; 
        }
        
        if (isPanning) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            setLastMousePos({ x: e.clientX, y: e.clientY });

            if (longPressTimer.current) {
                if (Math.hypot(e.clientX - touchStartPos.current.x, e.clientY - touchStartPos.current.y) > 15) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                }
            }
        }
        
        if (activeTool === 'wall' || activeTool === 'door' || activeTool === 'delete') {
            setCursorPos(coords);
        }
    };

    const handleMouseUp = (e) => {
        const now = Date.now();
        const dist = Math.hypot(e.clientX - touchStartPos.current.x, e.clientY - touchStartPos.current.y);
        const isClick = dist < 5;

        // Radial HUD Logic
        if (isClick && movingTokenId) {
            setSelectedTokenId(movingTokenId);
        }

        // Token Move Logic
        if (movingTokenId && movingTokenPos && !isClick) {
            const img = mapImageRef.current;
            if (img) {
                const { x, y } = snapToGrid(movingTokenPos.x, movingTokenPos.y, img.naturalWidth, img.naturalHeight);
                const newTokens = tokens.map(t => t.id === movingTokenId ? { ...t, x, y } : t);
                updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, tokens: newTokens } } });
            }
        }

        // Global Reset
        setMovingTokenId(null);
        setMovingTokenPos(null);
        setIsPanning(false);
        setActiveMeasurement(null);
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    };

    // --- 4. DRAG & DROP SPAWNING ---
    const handleDragStart = (e, entity, type) => {
        e.dataTransfer.setData("entityId", entity.id);
        e.dataTransfer.setData("type", type);
        e.dataTransfer.setData("image", entity.image || "");
        e.dataTransfer.setData("name", entity.name);
    };

    // START CHANGE: Async Drop Handler with Optimistic UI
    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        setIsDraggingToken(false);
        setIsPanning(false);
        
        // 1. Use Mirror Refs for absolute latest data
        const currentTokens = latestTokensRef.current || [];
        const currentData = latestDataRef.current;

        // 2. Parse unified JSON payload
        let droppedData = {};
        try {
            const raw = e.dataTransfer.getData("text/plain");
            droppedData = JSON.parse(raw);
        } catch (err) {
            console.error("Drop Parse Error: Invalid JSON", err);
            return;
        }

        const { type, name, url, entityId: rawEntityId, image } = droppedData;

        // 3. API IMPORT LOGIC (From Search)
        if (type === 'api-import') {
            if (!url) return;

            const pos = getMapCoords(e);
            const img = mapImageRef.current;
            
            let finalX = 50, finalY = 50;
            let pxX = 0, pxY = 0;

            if (img && img.naturalWidth) {
                const snapped = snapToGrid(pos.x, pos.y, img.naturalWidth, img.naturalHeight);
                finalX = snapped.x;
                finalY = snapped.y;
                pxX = (finalX / 100) * img.naturalWidth;
                pxY = (finalY / 100) * img.naturalHeight;
            }

            setSpawningToken({ x: pxX, y: pxY, name: "Summoning " + name + "..." });

            try {
                const res = await fetch(`https://www.dnd5eapi.co${url}`);
                const m = await res.json();

                // Robust Image Handling
                let imageUrl = m.image ? `https://www.dnd5eapi.co${m.image}` : "";
                
                // Robust AC & Speed Handling
                let acVal = Array.isArray(m.armor_class) ? (m.armor_class[0]?.value || 10) : (m.armor_class || 10);
                const speedStr = typeof m.speed === 'object' ? 
                    Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;

                const newNpcId = Date.now();
                
                // Construct the "Basic" NPC using the Bestiary Importer's Logic
                const basicNpc = {
                    id: newNpcId, 
                    name: m.name, 
                    image: imageUrl,
                    race: `${m.size} ${m.type}`, 
                    class: "Monster",
                    hp: { current: m.hit_points, max: m.hit_points, temp: 0 },
                    ac: acVal,
                    speed: speedStr,
                    stats: { 
                        str: m.strength, dex: m.dexterity, con: m.constitution, 
                        int: m.intelligence, wis: m.wisdom, cha: m.charisma 
                    },
                    senses: { 
                        darkvision: m.senses?.darkvision ? parseInt(m.senses.darkvision) : 0,
                        passivePerception: m.senses?.passive_perception || 10
                    },
                    // Map Actions with Hit/Dmg info
                    customActions: (m.actions || []).map(a => {
                        let dmgString = "";
                        if (a.damage && a.damage[0] && a.damage[0].damage_dice) {
                            dmgString = a.damage[0].damage_dice;
                            if(a.damage[0].damage_type?.name) dmgString += ` ${a.damage[0].damage_type.name}`;
                        }
                        return {
                            name: a.name,
                            desc: a.desc,
                            type: "Action",
                            hit: a.attack_bonus ? `+${a.attack_bonus}` : "",
                            dmg: dmgString 
                        };
                    }),
                    features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" })),
                    legendaryActions: (m.legendary_actions || []).map(l => ({ name: l.name, desc: l.desc })),
                    isHidden: true, 
                    quirk: "SRD Import"
                };

                // CRITICAL: Run through the Enricher to fix ActionsTab compatibility
                const enrichedNpc = await enrichCharacter(basicNpc);

                // Create the Token Instance
                const newToken = {
                    id: newNpcId + 1, 
                    characterId: newNpcId, 
                    type: 'npc',
                    x: finalX, 
                    y: finalY, 
                    name: m.name, 
                    image: imageUrl,
                    size: (m.size || 'medium').toLowerCase(),
                    hp: { current: m.hit_points, max: m.hit_points, temp: 0 },
                    statuses: [], 
                    isInstance: true
                };

                // Sync to Cloud
                updateCloud({
                    ...currentData,
                    npcs: [...(currentData.npcs || []), enrichedNpc],
                    campaign: {
                        ...currentData.campaign,
                        activeMap: { ...currentData.campaign.activeMap, tokens: [...currentTokens, newToken] }
                    }
                }, true);

            } catch (err) {
                console.error("Spawn enrichment failed:", err);
            } finally {
                setSpawningToken(null);
            }
            return;
        }

        // 4. STANDARD SPAWN LOGIC (Dragging existing character)
        let entityId = rawEntityId;
        if (entityId && typeof entityId === 'string' && !isNaN(entityId)) {
            entityId = Number(entityId);
        }

        if (entityId) {
            const pos = getMapCoords(e);
            const img = mapImageRef.current;
            
            if (img) {
                const { x, y } = snapToGrid(pos.x, pos.y, img.naturalWidth, img.naturalHeight);
                
                const master = (currentData.players || []).find(p => p.id === entityId) || 
                               (currentData.npcs || []).find(n => n.id === entityId);
                
                if (!master) return;

                const newToken = {
                    id: Date.now(),
                    characterId: entityId,
                    type: type || 'npc',
                    x, y,
                    image: master.image || image,
                    name: master.name,
                    size: master.size || 'medium',
                    hp: master.hp ? { ...master.hp } : { current: 10, max: 10 },
                    statuses: [],
                    isInstance: true
                };
                
                updateCloud({ 
                    ...currentData, 
                    campaign: { 
                        ...currentData.campaign, 
                        activeMap: { 
                            ...currentData.campaign.activeMap, 
                            tokens: [...currentTokens, newToken] 
                        } 
                    } 
                }, true);
                
                triggerHaptic('medium');
            }
        }
    };
    // END CHANGE

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
            
            // REMOVED: snapAllTokens(); (Fixes ReferenceError)
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
            // ANCHOR: First tap sets the start point
            setWallStart({ x: pixelX, y: pixelY });
            triggerHaptic('light');
        } else {
            // CHAIN: Create wall and immediately set new start to this point
            const newWall = {
                id: `wall-${Date.now()}`,
                type: activeTool,
                p1: { x: wallStart.x, y: wallStart.y },
                p2: { x: pixelX, y: pixelY },
                open: false,
            };
            
            updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...mapData, walls: [...walls, newWall] } } });
            setWallStart({ x: pixelX, y: pixelY }); // Automatically start next wall here
            triggerHaptic('medium');
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
            // FIX: Check if we are scrolling inside a sidebar or list
            // If the target is inside a scrollable element, let the browser handle it.
            if (e.target.closest('.overflow-y-auto') || e.target.closest('.custom-scroll')) {
                return;
            }

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
            // Ensure touch-action: none is set directly on the style or class
            className={`w-full h-full bg-[#1a1a1a] overflow-hidden relative select-none ${activeTool === 'move' ? 'cursor-grab' : 'cursor-crosshair'}`}
            style={{ touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={handleDrop}
            onDragEnter={() => setIsDraggingToken(true)}
            onDragLeave={() => setIsDraggingToken(false)}
            onDragEnd={() => setIsDraggingToken(false)}
        >
            {/* --- TOP RIGHT CONTROLS (Library, Tokens, Combat, Zoom) --- */}
            <div 
                className={`absolute top-4 z-50 flex gap-2 pointer-events-auto transition-all duration-300 ${sidebarIsOpen ? 'sm:right-[400px] right-4' : 'right-4'}`}
                onPointerDown={(e) => e.stopPropagation()} 
            >
                <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-1 flex gap-1 shadow-xl">
                    <button onClick={() => setShowLibrary(true)} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded" title="Maps">
                        <Icon name="map" size={20}/>
                    </button>
                    <div className="w-px h-6 bg-slate-700 my-auto"></div>
                    <button onClick={() => setShowTokens(!showTokens)} className={`p-2 rounded transition-colors ${showTokens ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Tokens">
                        <Icon name="users" size={20}/>
                    </button>
                    <button onClick={() => showCombat ? setShowCombat(false) : handleStartCombat()} className={`p-2 rounded transition-colors ${showCombat || data.campaign?.combat?.active ? 'bg-red-600 text-white animate-pulse' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Combat Tracker">
                        <Icon name="swords" size={20}/>
                    </button>
                </div>
                
                <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-1 flex gap-1 shadow-xl">
                    <button onClick={() => setView(v => ({...v, scale: v.scale / 1.2}))} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded"><Icon name="minus" size={20}/></button>
                    <button onClick={() => setView(v => ({...v, scale: v.scale * 1.2}))} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded"><Icon name="plus" size={20}/></button>
                </div>
            </div>

            {/* --- TOP LEFT HUD (Status) --- */}
            <div 
                // NEW: Logic to only hide if the screen is narrow enough to cause a collision.
                // If Sidebar is open: 
                // - On screens < 1150px (Laptops/Tablets), it fades out to prevent overlap.
                // - On screens > 1150px (Large Monitors), it stays visible because there is room.
                className={`absolute top-4 left-4 z-50 pointer-events-none transition-all duration-300 ${
                    sidebarIsOpen 
                        ? 'max-[1150px]:opacity-0 max-[1150px]:pointer-events-none' 
                        : 'opacity-100'
                }`}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="bg-slate-900/90 backdrop-blur border border-slate-700 px-3 py-2 rounded-lg shadow-xl pointer-events-auto flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${data.activeUsers ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`}></div>
                    <div>
                        <div className="text-xs font-bold text-amber-500 fantasy-font tracking-widest">{data.campaign?.genesis?.campaignName || "Unknown Realm"}</div>
                        <div className="text-[9px] text-slate-400 font-mono uppercase tracking-tighter">
                            LOCATION: {mapData.url ? (mapData.name || "Unnamed Map") : "The Void"}
                        </div>
                    </div>
                </div>
            </div>

            {/* START CHANGE: Pass Vision Props to Toolbar */}
            {/* --- BOTTOM CENTER TOOLBAR (DM Only) --- */}
            {role === 'dm' && (
                <div 
                    // UPDATED: Check config.mobileCompact. 
                    // If TRUE: use 'bottom-[68px]' (sits right on top of nav bar).
                    // If FALSE: use 'bottom-24' (higher up, more clearance).
                    className={`absolute ${data.config?.mobileCompact ? 'bottom-[68px]' : 'bottom-24'} md:bottom-6 left-0 w-full flex justify-center pointer-events-none transition-all duration-300 z-50 ${
                        sidebarIsOpen ? 'md:pr-[384px]' : ''
                    }`}
                >
                    <div className="pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
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
                    </div>
                </div>
            )}
            {/* END CHANGE */}

            {/* Grid Config Panel */}
            {role === 'dm' && activeTool === 'grid' && (
                <GridControls grid={mapGrid} onUpdate={handleGridUpdate} onClose={() => setActiveTool('move')} />
            )}
            {/* END CHANGE */}

            {/* --- RIGHT SIDEBAR (Token Manager) --- */}
            {showTokens && (
                <div 
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-20 right-4 bottom-24 w-64 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl z-40 p-4 animate-in slide-in-from-right pointer-events-auto"
                >
                    <TokenManager data={data} onDragStart={handleDragStart} />
                </div>
            )}

            {/* START CHANGE: Render Combat Tracker */}
            {showCombat && (
                <div onPointerDown={(e) => e.stopPropagation()}>
                    <CombatTracker 
                        combat={data.campaign?.combat} 
                        onNextTurn={handleNextTurn} 
                        onEndCombat={handleEndCombat}
                        role={role}
                        updateCombatant={updateCombatant}
                        onRemove={removeCombatant}
                        onClearRolls={onClearRolls}
                        // START CHANGE: Pass it down
                        onAutoRoll={onAutoRoll}
                        // END CHANGE
                    />
                </div>
            )}
            {/* END CHANGE */}

           {/* --- MAP LIBRARY MODAL --- */}
            {showLibrary && (
                <div onPointerDown={(e) => e.stopPropagation()}>
                    <MapLibrary 
                        savedMaps={data.campaign?.savedMaps || []} 
                        onSelect={(selectedMap) => { 
                            updateMapState('load_map', selectedMap); 
                            setShowLibrary(false); 
                        }} 
                        onClose={() => setShowLibrary(false)} 
                        onDelete={(id) => {
                            // If id is an object (contains {action: 'rename'}), route to rename logic
                            if (typeof id === 'object' && id.action === 'rename') {
                                updateMapState('rename_map', id);
                            } else {
                                updateMapState('delete_map', id);
                            }
                        }}
                    />
                </div>
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
                    <div 
                        className="relative inline-block shadow-2xl"
                        style={{ willChange: 'transform' }} // Hint to browser for GPU usage
                    >
                        <img 
                            ref={mapImageRef}
                            src={mapUrl}
                            onLoad={handleMapLoad}
                            decoding="async" // Off-thread image decoding
                            className="block pointer-events-none select-none max-w-none h-auto"
                            style={{ 
                                imageRendering: 'auto', // Changed from 'pixelated' to 'auto' for smooth scaling
                                transform: 'translateZ(0)' // Force GPU composite layer
                            }}
                            alt="Map Board"
                        />

                    {/* START CHANGE: Single Vision Canvas (Layer 4) */}
                    {/* Fog Canvas is gone. Vision Canvas handles everything. */}
                    <canvas 
                        ref={visionCanvasRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none z-[6]"
                    />

                    {pings.map(ping => (
                        <div 
                            key={ping.id}
                            className="absolute pointer-events-none z-50"
                            style={{ left: ping.x, top: ping.y }}
                        >
                            <div className="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
                                <div className="absolute w-12 h-12 bg-amber-500 rounded-full animate-ping opacity-75"></div>
                                <div className="absolute w-24 h-24 border-2 border-amber-500 rounded-full animate-ping [animation-delay:0.2s]"></div>
                                <div className="w-4 h-4 bg-amber-400 rounded-full shadow-[0_0_15px_#f59e0b]"></div>
                            </div>
                        </div>
                    ))}

                    {/* Dynamic Grid Layer */}
                    {mapGrid.visible && (() => {
                            // NEW: Calculate line width based on grid size (approx 1.25% of cell size)
                            // ensures lines are visible on 3000px maps but don't disappear on small ones.
                            const lineWidth = Math.max(0.8, mapGrid.size / 60); 

                            return (
                                <div 
                                    className="absolute inset-0 pointer-events-none opacity-40 transition-all duration-300" 
                                    style={{ 
                                        backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.6) ${lineWidth}px, transparent ${lineWidth}px), linear-gradient(to bottom, rgba(255,255,255,0.6) ${lineWidth}px, transparent ${lineWidth}px)`, 
                                        backgroundSize: `${mapGrid.size}px ${mapGrid.size}px`,
                                        backgroundPosition: `${mapGrid.offsetX}px ${mapGrid.offsetY}px`,
                                    }}
                                ></div>
                            );
                        })()}
                        {/* END CHANGE */}

                        {/* Phase 3 Wall/Door SVG Layer */}
                        <svg 
                            className={`absolute top-0 left-0 w-full h-full z-[8] ${(['wall', 'door', 'delete'].includes(activeTool) || activeMeasurement) ? 'pointer-events-auto' : 'pointer-events-none'}`} 
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

                        {/* Ruler & Sphere Visuals */}
                        {activeMeasurement && (
                            <g pointerEvents="none">
                                {activeMeasurement.type === 'ruler' ? (
                                    <>
                                        <line 
                                            x1={activeMeasurement.start.x} y1={activeMeasurement.start.y} 
                                            x2={activeMeasurement.end.x} y2={activeMeasurement.end.y} 
                                            stroke="#fbbf24" strokeWidth={4} strokeDasharray="10,5"
                                        />
                                        <circle cx={activeMeasurement.start.x} cy={activeMeasurement.start.y} r={4} fill="#fbbf24" />
                                    </>
                                ) : (
                                    <>
                                        <circle 
                                            cx={activeMeasurement.start.x} cy={activeMeasurement.start.y} 
                                            r={Math.hypot(activeMeasurement.end.x - activeMeasurement.start.x, activeMeasurement.end.y - activeMeasurement.start.y)} 
                                            fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,5"
                                        />
                                        <line 
                                            x1={activeMeasurement.start.x} y1={activeMeasurement.start.y} 
                                            x2={activeMeasurement.end.x} y2={activeMeasurement.end.y} 
                                            stroke="#f59e0b" strokeWidth={2} opacity={0.5}
                                        />
                                    </>
                                )}
                                {(() => {
                                    const distPx = Math.hypot(activeMeasurement.end.x - activeMeasurement.start.x, activeMeasurement.end.y - activeMeasurement.start.y);
                                    const feet = Math.round(distPx / mapGrid.size) * 5;
                                    return (
                                        <g transform={`translate(${activeMeasurement.end.x}, ${activeMeasurement.end.y - 20})`}>
                                            <rect x="-20" y="-12" width="40" height="20" rx="4" fill="rgba(0,0,0,0.8)" />
                                            <text textAnchor="middle" y="2" fill="white" fontSize="12" fontWeight="bold" className="font-mono">{feet}ft</text>
                                        </g>
                                    );
                                })()}
                            </g>
                        )}
                        {/* END CHANGE */}
                        
                        {/* 2. Render Ghost Line (Live Preview for Wall/Door Drawing) */}
                            {wallStart && (activeTool === 'wall' || activeTool === 'door') && (
                                <>
                                    <line 
                                        x1={wallStart.x} y1={wallStart.y} x2={cursorPos.x} y2={cursorPos.y} 
                                        stroke={activeTool === 'wall' ? '#3b82f6' : '#f59e0b'} 
                                        strokeWidth={4} strokeDasharray="10,5" opacity={0.6}
                                    />
                                    <circle cx={wallStart.x} cy={wallStart.y} r={8} fill={activeTool === 'wall' ? '#3b82f6' : '#f59e0b'} className="animate-pulse" />
                                </>
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
                        
                        {/* START CHANGE: Render The Ghost/Dummy Token */}
                        {spawningToken && (
                            <div 
                                className="absolute flex flex-col items-center justify-center z-[100] pointer-events-none animate-pulse"
                                style={{ 
                                    left: spawningToken.x, 
                                    top: spawningToken.y, 
                                    width: mapGrid.size || 50, 
                                    height: mapGrid.size || 50,
                                    transform: 'translate(-50%, -50%)'
                                }}
                            >
                                <div className="w-full h-full rounded-full bg-slate-900/80 border-2 border-dashed border-amber-500 flex items-center justify-center">
                                    <Icon name="loader-2" size={24} className="text-amber-500 animate-spin"/>
                                </div>
                                <div className="absolute top-full mt-2 bg-black/80 text-amber-500 text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap">
                                    {spawningToken.name}
                                </div>
                            </div>
                        )}
                        {/* END CHANGE */}

                        {/* Render Tokens */}
                        {tokens.map(token => {
                            const img = mapImageRef.current;
                            
                            // NEW: Differentiate identical tokens visually during their turn
                            const currentCombatant = data.campaign?.combat?.combatants?.[data.campaign.combat.turn];
                            const isMyTurn = data.campaign?.combat?.active && currentCombatant?.id === token.id;

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
                                        left: px, 
                                        top: py, 
                                        // REMOVED: transform: 'translate(-50%, -50%)',
                                        // REMOVED: width: dimension, height: dimension,
                                        zIndex: isMoving ? 100 : 10,
                                        pointerEvents: isMoving ? 'none' : 'auto',
                                        transition: isMoving ? 'none' : 'all 0.2s ease-out'
                                    }}
                                    className={isShaking ? "animate-bounce bg-red-500/50 rounded-full" : ""}
                                    onPointerDown={(e) => handleTokenPointerDown(e, token.id)}
                                >
                                    <Token 
                                        token={token} 
                                        isOwner={role === 'dm' || token.ownerId === data.user?.uid} 
                                        cellPx={currentGridSize} 
                                        isDragging={isMoving}
                                        isSelected={selectedTokenId === token.id}
                                        isTurn={isMyTurn}
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

            {/* START CHANGE: Token Stack Picker */}
            {activeStack && (
                <div 
                    className="absolute z-[100] bg-slate-900/95 border border-slate-700 p-2 rounded-xl shadow-2xl flex flex-col gap-2 animate-in zoom-in-95"
                    style={{ left: activeStack.x, top: activeStack.y, transform: 'translate(-50%, -110%)' }}
                >
                    <div className="text-[10px] uppercase font-bold text-slate-500 px-2 border-b border-slate-800 pb-1 flex justify-between gap-4">
                        <span>Select Unit</span>
                        <button onClick={() => setActiveStack(null)}><Icon name="x" size={12}/></button>
                    </div>
                    {activeStack.tokens.map(t => (
                        <button 
                            key={t.id}
                            onMouseDown={(e) => {
                                // 1. CRITICAL: Stop event from bubbling to Map Container (prevents panning)
                                e.stopPropagation();
                                e.preventDefault();
                                
                                const img = mapImageRef.current;
                                if (!img) return;

                                // 2. Calculate coordinates using the same math as getMapCoords
                                const rect = containerRef.current.getBoundingClientRect();
                                const startCoords = {
                                    x: (e.clientX - rect.left - view.x) / view.scale,
                                    y: (e.clientY - rect.top - view.y) / view.scale
                                };

                                // 3. Manually reset pan state and initialize drag
                                setIsPanning(false); 
                                setIsDraggingToken(true);
                                setDragStartPx({ x: (t.x / 100) * img.naturalWidth, y: (t.y / 100) * img.naturalHeight });
                                setMovingTokenId(t.id);
                                setMovingTokenPos(startCoords);
                                
                                // 4. Select and Close Menu
                                setSelectedTokenId(t.id);
                                setActiveStack(null);
                                triggerHaptic('medium');
                            }}
                            className="flex items-center gap-3 p-2 hover:bg-indigo-600 rounded-lg transition-colors group text-left w-full pointer-events-auto"
                        >
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-700 shrink-0">
                                <img src={t.image || t.img} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-sm font-bold text-slate-200 group-hover:text-white truncate max-w-[100px]">{t.name}</span>
                        </button>
                    ))}
                </div>
            )}
            {/* END CHANGE */}

            {/* Radial HUD Integration */}
            {selectedTokenId && (() => {
                const token = tokens.find(t => t.id === selectedTokenId);
                const tokenElement = document.getElementById(`token-node-${selectedTokenId}`);
                const container = containerRef.current;

                if (!token || !tokenElement || !container) return null;

                const tRect = tokenElement.getBoundingClientRect();
                const cRect = container.getBoundingClientRect();
                const centerX = (tRect.left - cRect.left) + (tRect.width / 2);
                const centerY = (tRect.top - cRect.top) + (tRect.height / 2);

                return (
                    <div 
                        onPointerDown={(e) => e.stopPropagation()} 
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute inset-0 pointer-events-none z-[100]"
                    >
                        <RadialHUD 
                            key={token.id}
                            token={token}
                            position={{ x: centerX, y: centerY }}
                            onUpdateToken={handleUpdateToken}
                            onDelete={() => handleDeleteToken(token.id)}
                            onOpenSheet={() => handleOpenSheet(token.id)}
                            onClose={() => setSelectedTokenId(null)}
                        />
                    </div>
                );
            })()}
            {/* END CHANGE */}
        </div>
    );
};

export default InteractiveMap;