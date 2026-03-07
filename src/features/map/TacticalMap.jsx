import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect, Suspense, memo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Icon from '../../components/Icon';
// START CHANGE: Import isPointInPolygon
import { getCharacterVisionSettings, isPointInPolygon, calculateTokenCenter } from './utils/visionMath';
// END CHANGE
import MapToolbar from './components/MapToolbar';
import MapLibrary from './components/MapLibrary';
import TokenManager from './components/TokenManager';
import GridControls from './components/GridControls';
import CombatTracker from './components/CombatTracker';
import RadialHUD from './components/RadialHUD';
import FxControls from './components/FxControls';
import ObjectControls from './components/ObjectControls';
import VfxOverlay from './webgl/VfxOverlay';
import { enrichCharacter } from '../../utils/srdEnricher';
import { useCharacterStore } from '../../stores/useCharacterStore';
import { useVfxStore } from '../../stores/useVfxStore';
import { useCampaign } from '../../contexts/CampaignContext';
import { Text, Html } from '@react-three/drei'; // Import Text and Html components
import { idsMatch } from '../../utils/idUtils';

// WebGL Components
import CameraController from './webgl/CameraController';
import WebGLMap from './webgl/WebGLMap';
import WebGLGrid from './webgl/WebGLGrid';
import WebGLTokenLayer from './webgl/WebGLTokenLayer';
import WebGLInteractionLayer from './webgl/WebGLInteractionLayer';

// Hooks
import { useMapView } from './hooks/useMapView';
import { useMapAssets } from './hooks/useMapAssets';
import { useVisionEngine } from './hooks/useVisionEngine';
import { useMapInteractions } from './hooks/useMapInteractions';

const isMobile = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
const TacticalMap = ({ data = {}, role, updateMapState, updateCloud, onDiceRoll, activeTemplate, sidebarIsOpen, sidebarMode, updateCombatant, removeCombatant, onClearRolls, onAutoRoll, setShowHandoutCreator, code, addManualCombatant, players, npcs, user, diceLog }) => {
    const { sendPing, updateCampaign, addToken, updateToken, deleteToken, isConnected } = useCampaign();
    // START CHANGE: Import VFX Store
    const addEffect = useVfxStore(state => state.addEffect);
    const setTargetingPreview = useVfxStore(state => state.setTargetingPreview);
    const targetingPreview = useVfxStore(state => state.targetingPreview);
    // END CHANGE

    // START CHANGE: Subscribe to drag state for visual indicator
    const sidebarDragEntity = useCharacterStore(state => state.sidebarDragEntity);
    const dragPosition = useCharacterStore(state => state.dragPosition);
    // END CHANGE

    // 1. DATA SHORTCUTS (Moved up to fix ReferenceError in State Initializer)
    const mapData = data?.campaign?.activeMap || {};
    const tokens = mapData.tokens || [];
    const walls = mapData.walls || [];
    const [tempLights, setTempLights] = useState(null);
    const lights = tempLights || mapData.lights || [];
    const mapUrl = mapData.url;
    const visionActive = mapData.visionActive !== false; 
    const [tempGrid, setTempGrid] = useState(null);
    const mapGrid = tempGrid || { 
        size: 50, offsetX: 0, offsetY: 0, visible: true, snap: true, nameplates: true,
        ...(mapData.grid || {}) 
    };

    // START CHANGE: Derive active sidebar state from prop or context data
    const activeSidebar = sidebarMode || data.ui?.sidebar;
    // END CHANGE
    
    const [showLibrary, setShowLibrary] = useState(false);
    const [showTokens, setShowTokens] = useState(false);
    const [showCombat, setShowCombat] = useState(false);
    const [visibleTiles, setVisibleTiles] = useState([]);
    const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
    const hasAutoCentered = useRef(false);

    const [debugLogs, setDebugLogs] = useState([]); // For debugging output
    const [disableVision, setDisableVision] = useState(false); // Toggle to isolate vision issues
    const [isFullscreen, setIsFullscreen] = useState(false); // Fullscreen state
    const [hudVisible, setHudVisible] = useState(true); // HUD visibility in fullscreen
    const hudTimer = useRef(null); // Timer for auto-hiding HUD

    // 3. ALL REFS (Must be before Vision Logic)
    const containerRef = useRef(null);
    const mapImageRef = useRef(null);
    const tokenRefs = useRef({}); // NEW: WebGL Token Refs
    const myCharFarPolyRef = useRef(null);

    // 4. CUSTOM HOOKS
    const { view, setView, viewRef, handleZoom, centerOnTarget } = useMapView(mapData, code, containerRef, mapImageRef, role, user, tokens, data);
    const { mapReady, assembledMapUrl, fullDimensions, mapDimensions, tokenBlobUrls, handleMapLoad } = useMapAssets(mapData, isMobile, view.scale, tokens, mapImageRef);
    const myCharId = data.assignments?.[user?.uid];

    const {
        activeTool, setActiveTool, cursorPos, wallStart, selectionStart, multiSelectStart,
        isPanning, setIsPanning, movingTokenId, setMovingTokenId, movingTokenPosRef,
        handlePointerDown, handleDrop, handleDragStart, handleClearTokens, handleClearAllMaps,
        handleGridUpdate, selectedTokenId, setSelectedTokenId, handleUpdateToken,
        handleDeleteToken, handleOpenSheet, activeStack, setActiveStack, spawningToken,
        setIsDraggingToken, pings, fxSettings, setFxSettings, objectSettings,
        setObjectSettings, activeLightId, setActiveLightId, triggerHaptic,
        dragStartPx, setDragStartPx, activeMeasurement
    } = useMapInteractions({
        mapData, mapDimensions, view, setView, containerRef, role, user, tokens,
        updateToken, deleteToken, addToken, mapGrid, activeTemplate, onDiceRoll,
        updateCombatant, myCharId, myCharFarPolyRef
    });

    const { visionTexture, discoveryTexture, wallUniforms, viewerUniforms, myCharFarPoly } = useVisionEngine({
        mapReady,
        mapDimensions,
        isMobile,
        view,
        containerDimensions,
        tokens,
        walls,
        lights,
        visionActive,
        role,
        user,
        myCharId,
        mapGrid,
        players,
        npcs,
        movingTokenId,
        movingTokenPosRef,
        isPanning,
        disableVision
    });

    // Sync the vision polygon to the ref for use in interactions
    useEffect(() => {
        myCharFarPolyRef.current = myCharFarPoly;
    }, [myCharFarPoly]);

    const visibleTokens = useMemo(() => {
        if (!mapDimensions.width || !containerDimensions.width) return [];
        const worldLeft = -view.x / view.scale, worldTop = -view.y / view.scale, worldRight = (containerDimensions.width - view.x) / view.scale, worldBottom = (containerDimensions.height - view.y) / view.scale, padding = 100;
        return tokens.filter(token => {
            const tx = (token.x / 100) * mapDimensions.width, ty = (token.y / 100) * mapDimensions.height;
            if (tx < worldLeft - padding || tx > worldRight + padding || ty < worldTop - padding || ty > worldBottom + padding) return false;
            if (role === 'dm') return true;
            if (token.isHidden) return false;
            if (idsMatch(token.characterId, myCharId) || idsMatch(token.ownerId, user?.uid)) return true;
            const tokenCenter = { x: tx, y: ty };
            if (myCharFarPoly && !isPointInPolygon(tokenCenter, myCharFarPoly)) return false;
            if (visionActive) {
                const myToken = tokens.find(t => idsMatch(t.characterId, myCharId) || idsMatch(t.ownerId, user?.uid));
                if (myToken) {
                    const origin = calculateTokenCenter(myToken, mapDimensions.width, mapDimensions.height);
                    const character = players?.find(p => idsMatch(p.id, myToken.characterId));
                    if (Math.hypot(tx - origin.x, ty - origin.y) <= getCharacterVisionSettings(character, mapGrid.size || 50).radius) return true;
                }
                if (lights.length > 0 && myCharFarPoly) {
                    const blockingSegments = walls.filter(w => !(w.type === 'door' && w.isOpen));
                    return lights.some(light => {
                        const lOrigin = { x: (light.x / 100) * mapDimensions.width, y: (light.y / 100) * mapDimensions.height };
                        if (!isPointInPolygon(lOrigin, myCharFarPoly)) return false;
                        if (Math.hypot(tx - lOrigin.x, ty - lOrigin.y) > (light.radius / 5) * (mapGrid.size || 50)) return false;
                        return !blockingSegments.some(wall => {
                            const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
                            return (ccw(tokenCenter, lOrigin, wall.p1) !== ccw(tokenCenter, lOrigin, wall.p2)) && (ccw(tokenCenter, wall.p1, wall.p2) !== ccw(lOrigin, wall.p1, wall.p2));
                        });
                    });
                }
                return false;
            }
            return true;
        }).map(token => {
            let isHighlighted = false;
            if (activeTool === 'init_select' && selectionStart) {
                const x1 = Math.min(selectionStart.x, cursorPos.x), y1 = Math.min(selectionStart.y, cursorPos.y), x2 = Math.max(selectionStart.x, cursorPos.x), y2 = Math.max(selectionStart.y, cursorPos.y);
                const tx = (token.x / 100) * mapDimensions.width, ty = (token.y / 100) * mapDimensions.height;
                if (token.type !== 'pc' && !token.isHidden && tx >= x1 && tx <= x2 && ty >= y1 && ty <= y2) isHighlighted = true;
            }
            return { ...token, isHighlighted };
        });
    }, [tokens, view, containerDimensions, mapDimensions, role, myCharId, user?.uid, visionActive, lights, walls, mapGrid.size, activeTool, selectionStart, cursorPos, myCharFarPoly, players]);

    // START CHANGE: Fullscreen & Zen Mode Logic (Moved after refs)
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    // DEBUG: Monitor WebGL Context
    useEffect(() => {
        const handleContextLost = (e) => {
            console.error("[DEBUG] WebGL Context Lost detected on main window.");
        };
        window.addEventListener('webglcontextlost', handleContextLost);
        return () => window.removeEventListener('webglcontextlost', handleContextLost);
    }, []);

    useEffect(() => {
        if (!isFullscreen) {
            setHudVisible(true);
            return;
        }

        const onMouseMove = () => {
            setHudVisible(true);
            if (hudTimer.current) clearTimeout(hudTimer.current);
            hudTimer.current = setTimeout(() => setHudVisible(false), 2500);
        };

        window.addEventListener('mousemove', onMouseMove);
        // Trigger once on enter
        onMouseMove();
        
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            if (hudTimer.current) clearTimeout(hudTimer.current);
        };
    }, [isFullscreen]);

    // 4. VISION ENGINE LOGIC (Memoized to prevent render loops)
    const img = mapImageRef.current;

    // START CHANGE: Track Viewport Size
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerDimensions({ width: rect.width, height: rect.height });
            }
        };
        window.addEventListener('resize', updateSize);
        updateSize();
        return () => window.removeEventListener('resize', updateSize);
    }, []);


    // START CHANGE: Tiled Map Visibility Logic
    useEffect(() => {
        if (mapData.url !== 'tiled' || !mapData.levels || !mapReady) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const tileSize = 512;

        // START CHANGE: Extreme Zoom Culling for Mobile
        // If zoomed out very far on mobile, hide tiles and rely on the LOD thumbnail background.
        if (isMobile && view.scale < 0.15) {
            setVisibleTiles([]);
            return;
        }
        // END CHANGE

        // Determine Zoom Level: 0 for high zoom (>0.5), 1 for mid zoom (0.25-0.5), 2 for low zoom (<=0.25)
        let z = "0";
        let levelScale = 1;
        if (view.scale <= 0.25) {
            z = "2";
            levelScale = 0.25;
        } else if (view.scale <= 0.5) {
            z = "1";
            levelScale = 0.5;
        }

        const levelTiles = mapData.levels[z] || [];

        // Viewport in World Space
        const worldLeft = -view.x / view.scale;
        const worldTop = -view.y / view.scale;
        const worldRight = (rect.width - view.x) / view.scale;
        const worldBottom = (rect.height - view.y) / view.scale;

        // The size of a tile in World Space
        const worldTileSize = tileSize / levelScale;

        const startCol = Math.floor(worldLeft / worldTileSize);
        const endCol = Math.ceil(worldRight / worldTileSize);
        const startRow = Math.floor(worldTop / worldTileSize);
        const endRow = Math.ceil(worldBottom / worldTileSize);

        const visible = levelTiles.filter(tile => 
            tile.c >= startCol - 1 && tile.c <= endCol + 1 && 
            tile.r >= startRow - 1 && tile.r <= endRow + 1
        ).map(t => ({ ...t, z, levelScale }));
        
        setVisibleTiles(visible);
    }, [view.scale, view.x, view.y, mapData.levels, mapData.url, mapReady, isMobile]);
    // END CHANGE

    // --- SYSTEM HEALTH MONITOR (DEBUGGER) ---
    const isDebugging = localStorage.getItem('vtt_debug') === 'true';
    const DebugOverlay = () => (
        <div className="absolute top-24 left-4 z-[200] bg-black/80 border border-indigo-500/50 p-3 rounded-lg font-mono text-[10px] text-indigo-300 pointer-events-none space-y-1 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2 border-b border-indigo-500/30 pb-1 mb-1">
                <div className={`w-2 h-2 rounded-full ${mapReady ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                <span className="font-bold text-white">ENGINE STATUS</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4">
                <span>Map Ready:</span> <span className={mapReady ? 'text-green-400' : 'text-red-400'}>{String(mapReady)}</span>
                <span>WebGL Canvas:</span> <span className={containerDimensions.width ? 'text-green-400' : 'text-red-400'}>{containerDimensions.width}x{containerDimensions.height}</span>
                <span>Vision Active:</span> <span className={visionActive ? 'text-amber-400' : 'text-slate-500'}>{String(visionActive)}</span>
                <span>Vision Texture:</span> <span className={visionTexture ? 'text-green-400' : 'text-red-400'}>{visionTexture ? 'LOADED' : 'MISSING'}</span>
                <span>Discovery:</span> <span className={discoveryTexture ? 'text-green-400' : 'text-red-400'}>{discoveryTexture ? 'LOADED' : 'MISSING'}</span>
            </div>
            <div className="border-t border-indigo-500/30 pt-1 mt-1">
                <div className="text-white font-bold mb-1">ASSETS</div>
                <div className="truncate max-w-[200px]">URL: {assembledMapUrl || 'NONE'}</div>
                <div>Tokens: {tokens.length} ({Object.keys(tokenBlobUrls).length} Blobs)</div>
                <div>Walls: {walls.length} | Lights: {lights.length}</div>
            </div>
            <div className="border-t border-indigo-500/30 pt-1 mt-1">
                <div className="text-white font-bold mb-1">INTERACTIONS</div>
                <div>Tool: <span className="text-white">{activeTool}</span></div>
                <div>Panning: {String(isPanning)}</div>
                <div>Moving: {movingTokenId || 'NONE'}</div>
            </div>
            <div className="border-t border-indigo-500/30 pt-1 mt-1">
                <div className="text-white font-bold mb-1">VIEWPORT</div>
                <div>X: {view.x.toFixed(0)} | Y: {view.y.toFixed(0)}</div>
                <div>Scale: {view.scale.toFixed(2)}</div>
            </div>
            <div className="text-[8px] text-slate-500 mt-2 italic">
                Toggle with localStorage.setItem('vtt_debug', 'false')
            </div>
        </div>
    );

    const handleNextTurn = () => {
        const c = data.campaign?.combat || { active: true, round: 1, turn: 0, combatants: [] };
        let nextTurn = c.turn + 1;
        let nextRound = c.round;
        if (nextTurn >= (c.combatants || []).length) {
            nextTurn = 0;
            nextRound++;
        }
        updateCampaign({ 'campaign.combat.turn': nextTurn, 'campaign.combat.round': nextRound });
    };

    const handleEndCombat = () => {
        if(confirm("End the encounter?")) {
            updateCampaign({ 'campaign.combat': { active: false, round: 1, turn: 0, combatants: [] } });
            setShowCombat(false);
        }
    };

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement) {
            try {
                await document.documentElement.requestFullscreen();
            } catch (err) {
                console.error(err);
            }
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    };
    
    // Helper class for HUD elements
    const hudClass = isFullscreen 
        ? `transition-opacity duration-500 ${hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
        : '';

    const addLog = (msg) => { setDebugLogs(prev => [...prev.slice(-14), `[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`]); console.log(`[VTT] ${msg}`); };

    const handleStartCombat = () => {
        const c = data.campaign?.combat;
        if (!c?.active) {
            updateCampaign({ 'campaign.combat.active': true, 'campaign.combat.round': 1, 'campaign.combat.turn': 0 });
        }
        setShowCombat(true);
    };


    // Auto-Centering Logic: Wait for map load, then position viewport
    useEffect(() => {
        if (!assembledMapUrl || hasAutoCentered.current) return;

        const timer = setTimeout(() => {
            const saved = localStorage.getItem(`vtt_view_${code}`);
            if (saved) {
                hasAutoCentered.current = true;
                return; // LocalStorage handled it in state init
            }

            const img = mapImageRef.current;
            if (img && img.complete && img.naturalWidth > 0) {
                centerOnTarget();
                hasAutoCentered.current = true;
            }
        }, 1500); // 800ms delay to allow tokens to "land" from top-left

        return () => clearTimeout(timer);
    }, [assembledMapUrl, tokens.length, code]); 

    useEffect(() => {
        if (mapData.view) {
            // Only override if we don't have a local save for this specific map ID
            const hasLocalSave = localStorage.getItem(`vtt_view_${mapData.id}`);
            if (!hasLocalSave) {
                setView(prev => ({
                    x: mapData.view.pan?.x ?? prev.x,
                    y: mapData.view.pan?.y ?? prev.y,
                    scale: mapData.view.zoom ?? prev.scale
                }));
            }
        }
    }, [mapData.id]);

    useEffect(() => {
        setShowCombat(!!data.campaign?.combat?.active);
    }, [data.campaign?.combat?.active]);

    // START CHANGE: iOS Safari Gesture Prevention (Stops Ghosting/Crashing)
    // This strictly prevents the browser from taking a snapshot (ghosting) for native zoom
    useEffect(() => {
        const preventGestures = (e) => {
            e.preventDefault();
            // Critical: If we don't preventDefault here, Safari tries to zoom the viewport 
            // while React zooms the div, causing memory overload (crash) and visual artifacts.
        };

        const container = containerRef.current;
        if (!container) return;

        // Note: These are non-standard WebKit events specifically for the pinch gesture
        container.addEventListener('gesturestart', preventGestures, { passive: false });
        container.addEventListener('gesturechange', preventGestures, { passive: false });
        container.addEventListener('gestureend', preventGestures, { passive: false });

        return () => {
            container.removeEventListener('gesturestart', preventGestures);
            container.removeEventListener('gesturechange', preventGestures);
            container.removeEventListener('gestureend', preventGestures);
        };
    }, []);
    // END CHANGE

    return (
        <div 
            ref={containerRef}
            className={`w-full h-full bg-[#1a1a1a] overflow-hidden relative select-none ${activeTool === 'move' ? 'cursor-grab' : 'cursor-crosshair'}`}
            // ENSURE THIS IS HERE:
            style={{ touchAction: 'none' }} 
            onPointerDown={handlePointerDown}
            onContextMenu={(e) => e.preventDefault()}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={handleDrop}
            onDragEnter={() => setIsDraggingToken(true)}
            onDragLeave={() => setIsDraggingToken(false)}
            onDragEnd={() => setIsDraggingToken(false)}
        >
            {isDebugging && <DebugOverlay />}

            {/* START CHANGE: Hide Left Sidebar in Fullscreen */}
            {isFullscreen && (
                <style>{`
                    #app-sidebar { display: none !important; }
                `}</style>
            )}
            {/* END CHANGE */}
            {/* DEBUG OVERLAY REMOVED */}

            {/* START CHANGE: Connection Lost Indicator */}
            {!isConnected && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[200] bg-red-600/90 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-pulse pointer-events-none backdrop-blur-sm border border-red-400/50">
                    <Icon name="wifi-off" size={14}/>
                    <span>Connection Lost</span>
                </div>
            )}
            {/* END CHANGE */}

            {/* --- TOP RIGHT CONTROLS (Library, Tokens, Combat, Zoom) --- */}
            <div 
                className={`absolute z-[100] flex gap-2 pointer-events-auto transition-all duration-300 ${sidebarIsOpen ? 'right-[10px]' : 'right-4'} ${hudClass}`}
                style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
            >
                <div 
                    className="bg-slate-900/90 border border-slate-700 rounded-xl p-1.5 flex gap-1.5 shadow-xl"
                    onPointerDown={(e) => e.stopPropagation()} 
                >
                    <button onClick={() => setShowHandoutCreator(true)} className="p-3 md:p-2 text-amber-500 hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" title="Handouts">
                        <Icon name="scroll" size={20}/>
                    </button>
                    <button onClick={() => {
                        updateMapState('toggle_journal');
                        updateMapState('close_sheet');
                    }} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${activeSidebar === 'journal' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title={activeSidebar === 'journal' ? "Close Journal" : "Open Journal"}>
                        <Icon name="book-open" size={20}/>
                    </button>
                    <button onClick={() => {
                        updateMapState('toggle_chat');
                        updateMapState('close_sheet');
                    }} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${activeSidebar === 'chat' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title={activeSidebar === 'chat' ? "Close Chat" : "Open Chat"}>
                        <Icon name={activeSidebar === 'chat' ? "x" : "message-square"} size={20}/>
                    </button>
                    <div className="w-px h-8 bg-slate-700 my-auto"></div>
                    {role === 'dm' && (
                        <>
                            <button onClick={() => setShowLibrary(true)} className="p-3 md:p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" title="Maps">
                                <Icon name="map" size={20}/>
                            </button>
                            <button onClick={() => setShowTokens(!showTokens)} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${showTokens ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Tokens">
                                <Icon name="users" size={20}/>
                            </button>
                        </>
                    )}
                    {(role === 'dm' || data.campaign?.combat?.active) && (
                        <button onClick={() => showCombat ? setShowCombat(false) : (role === 'dm' ? handleStartCombat() : setShowCombat(true))} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${showCombat || data.campaign?.combat?.active ? 'bg-red-600 text-white animate-pulse' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Combat Tracker">
                            <Icon name="swords" size={20}/>
                        </button>
                    )}
                    <div className="w-px h-8 bg-slate-700 my-auto"></div>
                    
                    <button onClick={() => handleZoom(1 / 1.2)} className="p-3 md:p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"><Icon name="minus" size={20}/></button>
                    <button onClick={centerOnTarget} className="p-3 md:p-2 text-amber-500 hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" title={role === 'dm' ? "Center Map" : "Center on My Character"}>
                        <Icon name="crosshair" size={20}/>
                    </button>
                    <button onClick={() => handleZoom(1.2)} className="p-2 md:p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"><Icon name="plus" size={20}/></button>
                    <button onClick={toggleFullscreen} className={`p-2 md:p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isFullscreen ? 'text-indigo-400 bg-indigo-900/20' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Toggle Fullscreen"><Icon name={isFullscreen ? "minimize" : "maximize"} size={20}/></button>
                </div>
            </div>

            {/* --- TOP LEFT HUD (Status) --- */}
            <div 
                className={`absolute z-[100] pointer-events-auto transition-all duration-300 ${
                    isFullscreen 
                        ? (hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none')
                        : (sidebarIsOpen 
                            ? 'max-[1500px]:opacity-0 max-[1500px]:pointer-events-none' 
                            : 'max-[1100px]:opacity-0 max-[1100px]:pointer-events-none opacity-100')
                }`}
                style={{ top: 'calc(1rem + env(safe-area-inset-top))', left: 'calc(1rem + env(safe-area-inset-left))' }}
            >
                <div 
                    className="bg-slate-900/90 backdrop-blur border border-slate-700 px-3 py-2 rounded-lg shadow-xl flex items-center gap-3"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className={`w-3 h-3 rounded-full ${data.activeUsers ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`}></div>
                    <div>
                        <div className="text-xs font-bold text-amber-500 fantasy-font tracking-widest"> {data.campaign?.genesis?.campaignName || "Unknown Realm"}</div>
                        <div className="text-[9px] text-slate-400 font-mono uppercase tracking-tighter">
                            [{code}] • LOCATION: {mapData.url ? (mapData.name || "Unnamed Map") : "The Void"}
                        </div>
                    </div>
                </div>
            </div>

            {/* START CHANGE: Pass Vision Props to Toolbar */}
            {/* --- BOTTOM CENTER TOOLBAR --- */}
            <div 
                className={`absolute ${data.config?.mobileCompact ? 'bottom-[0px]' : 'bottom-0'} md:bottom-6 left-0 w-full flex justify-center pointer-events-none transition-all duration-300 z-[70] ${
                    sidebarIsOpen ? 'md:pr-[384px]' : ''
                } ${hudClass}`}
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div onPointerDown={(e) => e.stopPropagation()}>
                    <MapToolbar 
                        role={role}
                        activeTool={activeTool} 
                        setTool={setActiveTool} 
                        visionActive={visionActive}
                        onToggleVision={() => updateCampaign({ 'campaign.activeMap.visionActive': !visionActive })}
                        />
                    </div>
                </div>
            {/* END CHANGE */}

            {/* Grid Config Panel */}
            {role === 'dm' && activeTool === 'grid' && (
                <GridControls 
                    grid={mapGrid} 
                    onUpdate={handleGridUpdate} 
                    onClose={() => setActiveTool('move')} 
                    activeTool={activeTool}
                    setActiveTool={setActiveTool}
                />
            )}
            
            {/* Light Adjustment HUD */}
            {role === 'dm' && activeTool === 'light' && activeLightId && (() => {
                const light = lights.find(l => l.id === activeLightId);
                if (!light) return null;

                const updateLight = (changes) => {
                };

                return (
                    <div 
                        className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-2xl w-64 z-50 pointer-events-auto"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                                <Icon name="lamp" size={14}/> Light Settings
                            </h4>
                            <button onClick={() => setActiveLightId(null)} className="text-slate-500 hover:text-white"><Icon name="x" size={14}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] text-slate-500 font-bold uppercase flex justify-between mb-1">
                                    <span>Radius</span>
                                    <span className="text-white">{light.radius}ft</span>
                                </label>
                                <input 
                                    type="range" min="5" max="100" step="5"
                                    value={light.radius}
                                    onChange={(e) => updateLight({ radius: parseInt(e.target.value) })}
                                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="flex gap-2">
                                {[
                                    { label: 'Warm', color: 'rgba(255, 170, 0, 0.8)' },
                                    { label: 'Cold', color: 'rgba(100, 200, 255, 0.6)' },
                                    { label: 'Void', color: 'rgba(150, 0, 255, 0.5)' }
                                ].map(preset => (
                                    <button 
                                        key={preset.label}
                                        onClick={() => updateLight({ color: preset.color })}
                                        className={`flex-1 py-1 text-[9px] font-bold rounded border transition-all ${light.color === preset.color ? 'bg-slate-700 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* --- RIGHT SIDEBAR (Token Manager) --- */}
            {showTokens && (
                <div 
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-20 right-4 bottom-24 w-64 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl z-[100] p-4 animate-in slide-in-from-right pointer-events-auto"
                >
                    <TokenManager 
                        data={data} 
                        onDragStart={handleDragStart} 
                        onDiceRoll={onDiceRoll} 
                        onClearTokens={handleClearTokens}
                        onClearAllMaps={handleClearAllMaps}
                    />
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
                        onAutoRoll={() => setActiveTool('init_select')}
                        // START CHANGE: Pass data through to tracker
                        addManualCombatant={addManualCombatant}
                        players={players}
                        npcs={npcs}
                        onDiceRoll={onDiceRoll}
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
                        user={user}
                        onAdd={(newMap) => {
                            console.log("[DEBUG] Archiving map:", newMap.name);
                            const mapData = { ...newMap };
                            delete mapData.isNew;
                            const savedMaps = data.campaign?.savedMaps || [];
                            if (!savedMaps.some(m => m.url === newMap.url)) {
                                updateCampaign({ 'campaign.savedMaps': [...savedMaps, mapData] });
                            }
                        }}
                        onSelect={(selectedMap) => { 
                            const mapData = { ...selectedMap };
                            delete mapData.isNew;

                            updateCampaign({ 'campaign.activeMap': mapData });

                            // Update local UI state
                            updateMapState('load_map', selectedMap); 
                            setShowLibrary(false); 
                        }} 
                        onClose={() => setShowLibrary(false)} 
                        onDelete={(id) => {
                            // If id is an object (contains {action: 'rename'}), route to rename logic
                            if (typeof id === 'object') {
                                if (id.action === 'rename') updateMapState('rename_map', id);
                                else if (id.action === 'update_map') updateMapState('update_map', id);
                            } else {
                                updateMapState('delete_map', id);
                            }
                        }}
                    />
                </div>
            )}

            {/* FX Controls Panel */}
            {activeTool === 'fx' && (
                <FxControls 
                    settings={fxSettings} 
                    onUpdate={setFxSettings} 
                    currentWeather={mapData.weather}
                    onWeatherChange={(w) => updateCampaign({ 'campaign.activeMap.weather': w })}
                    role={role}
                    onClose={() => setActiveTool('move')} 
                />
            )}

            {/* Map Object Controls Panel */}
            {activeTool === 'objects' && (
                <ObjectControls 
                    settings={objectSettings} 
                    onUpdate={setObjectSettings} 
                    onClose={() => setActiveTool('move')} 
                />
            )}

            {/* --- TRANSFORM LAYER --- */}
            <div 
                style={{ 
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                    transformOrigin: '0 0',
                    transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                }}
                className="absolute top-0 left-0 w-full h-full"
            >
                {mapUrl ? (
                    <div 
                        className="relative inline-block shadow-2xl"
                        style={{ willChange: 'transform' }} // Hint to browser for GPU usage
                    >
                        <img 
                            ref={mapImageRef}
                            src={assembledMapUrl}
                            onLoad={handleMapLoad}
                            crossOrigin="anonymous"
                            onError={(e) => console.error("Map Image failed to render:", e)}
                            decoding="async" // Off-thread image decoding
                            className="block pointer-events-none select-none max-w-none h-auto opacity-0"
                            style={{
                                imageRendering: view.scale > 0.5 ? 'high-quality' : 'auto',
                                transform: 'translateZ(0)', // Force GPU composite layer
                                willChange: 'transform',
                                width: fullDimensions ? fullDimensions.width : 'auto',
                                height: fullDimensions ? fullDimensions.height : 'auto',
                                position: 'absolute', top: 0, left: 0
                            }}
                            alt="Map Board"
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
                    </div>
                ) : (
                    <div className="flex items-center justify-center w-[800px] h-[600px] bg-slate-800 border-2 border-dashed border-slate-700 rounded-xl m-20">
                        <div className="text-center text-slate-500">
                            <Icon name="map" size={48} className="mx-auto mb-2 opacity-50"/>
                            <p>No map projected.</p>
                            {role === 'dm' && (
                                <p 
                                    className="text-xs mt-2 text-indigo-400 cursor-pointer hover:underline" 
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => setShowLibrary(true)}
                                >
                                    Open Library
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* START CHANGE: Unified WebGL World Container */}
            <div className="absolute inset-0 pointer-events-none z-[15]">
                <Canvas
                    dpr={isMobile ? 1 : window.devicePixelRatio}
                    resize={{ debounce: 0 }}
                    orthographic
                    camera={{ near: -100, far: 100 }}
                    gl={{ 
                        alpha: true, 
                        antialias: !isMobile, 
                        powerPreference: 'low-power',
                        precision: isMobile ? 'lowp' : 'highp'
                    }}
                    events={null}
                    style={{ imageRendering: 'pixelated' }}
                >
                    <CameraController view={view} containerDimensions={containerDimensions} />
                    <Suspense fallback={null}>
                        {assembledMapUrl && (
                            <WebGLMap 
                                url={assembledMapUrl} width={mapDimensions.width} height={mapDimensions.height} 
                                wallUniforms={wallUniforms} viewerUniforms={viewerUniforms}
                                visionActive={visionActive}
                                discoveryTexture={discoveryTexture}
                                mapDimensions={mapDimensions}
                                isDM={role === 'dm'}
                            />
                        )}
                        <WebGLGrid 
                            grid={mapGrid} width={mapDimensions.width} height={mapDimensions.height} 
                            wallUniforms={wallUniforms} viewerUniforms={viewerUniforms}
                            visionActive={visionActive}
                            discoveryTexture={discoveryTexture}
                            mapDimensions={mapDimensions}
                            isDM={role === 'dm'}
                        />
                        <WebGLTokenLayer 
                            visibleTokens={visibleTokens} 
                            grid={mapGrid} 
                            mapDimensions={mapDimensions} 
                            selectedTokenId={selectedTokenId} 
                            combat={data.campaign?.combat} 
                            tokenBlobUrls={tokenBlobUrls} 
                            tokenRefs={tokenRefs}
                            movingTokenId={movingTokenId}
                            wallUniforms={wallUniforms} viewerUniforms={viewerUniforms}
                            visionActive={visionActive}
                            showNameplates={mapGrid.nameplates}
                            role={role}
                            user={user}
                        />
                        <WebGLInteractionLayer 
                            walls={walls} activeMeasurement={activeMeasurement} templates={mapData.templates}
                            activeTool={activeTool} cursorPos={cursorPos} wallStart={wallStart}
                            mapDimensions={mapDimensions} selectionStart={selectionStart} multiSelectStart={multiSelectStart}
                            wallUniforms={wallUniforms} viewerUniforms={viewerUniforms}
                            visionActive={visionActive}
                            discoveryTexture={discoveryTexture}
                            isDM={role === 'dm'}
                        />
                    </Suspense>
                    {mapReady && fullDimensions && (!isMobile || view.scale >= 0.15) && (
                        <VfxOverlay 
                            width={mapDimensions.width} 
                            height={mapDimensions.height} 
                            templates={mapData.templates} 
                            weather={mapData.weather}
                            wallUniforms={wallUniforms}
                            viewerUniforms={viewerUniforms}
                            visionActive={visionActive}
                            discoveryTexture={discoveryTexture}
                            mapDimensions={mapDimensions}
                            isDM={role === 'dm'}
                        />
                    )}
                </Canvas>
            </div>
            {/* END CHANGE */}

            {/* Hidden Vision Canvas for Texture Generation */}
            {/* <canvas ref={visionCanvasRef} style={{ display: 'none' }} /> */}

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
                                
                                // OPTIMIZATION: Use Ref for drag start
                                movingTokenPosRef.current = startCoords;
                                
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
                const container = containerRef.current;
                
                if (!token || !container) return null;
                
                if (!token) return null;

                // 1. Get raw pixel position on the map
                const worldX = (token.x / 100) * mapDimensions.width;
                const worldY = (token.y / 100) * mapDimensions.height;
                

                // 2. Apply camera pan and zoom to get screen coordinates
                const centerX = (worldX * view.scale) + view.x;
                const centerY = (worldY * view.scale) + view.y;

                return (
                    <div 
                        onPointerDown={(e) => e.stopPropagation()} 
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute inset-0 pointer-events-none z-[110]"
                    >
                        <RadialHUD 
                            key={token.id}
                            token={token}
                            position={{ x: centerX, y: centerY }}
                            onUpdateToken={handleUpdateToken}
                            onDelete={() => handleDeleteToken(token.id)}
                            onOpenSheet={() => handleOpenSheet(token.id)}
                            onClose={() => setSelectedTokenId(null)}
                            role={role}
                            user={user}
                            players={players}
                            npcs={npcs}
                            activeUsers={data.activeUsers}
                            assignments={data.assignments}
                        />
                    </div>
                );
            })()}
            {/* END CHANGE */}

            {/* START CHANGE: Loading Screen Overlay */}
            {mapUrl && !mapReady && (
                <div className="absolute inset-0 z-[140] bg-slate-950 flex flex-col items-center justify-center animate-in fade-in duration-300 pointer-events-auto">
                    <div className="relative mb-6">
                        <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full animate-pulse"></div>
                        <div className="relative w-20 h-20 border-4 border-slate-800 border-t-amber-500 rounded-full animate-spin shadow-2xl"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Icon name="map" size={32} className="text-amber-500 animate-pulse"/>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-amber-500 fantasy-font tracking-[0.2em] animate-pulse">
                        ENTERING REGION
                    </h2>
                    <div className="mt-2 text-sm text-slate-500 font-mono uppercase tracking-widest">
                        {mapData.name || "Unknown Location"}
                    </div>

                    {role === 'dm' && (
                        <div className="mt-10 flex flex-col items-center gap-4 animate-in slide-in-from-bottom-4 duration-700 delay-500">
                            <button 
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => setShowLibrary(true)}
                                className="px-6 py-3 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl border border-indigo-500/30 hover:border-indigo-400 transition-all text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 shadow-2xl backdrop-blur-md"
                            >
                                <Icon name="map" size={14}/>
                                Open Map Archives
                            </button>
                            <button 
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => updateCampaign({ 'campaign.activeMap.url': null })}
                                className="text-[10px] text-slate-600 hover:text-red-500 transition-colors uppercase font-bold tracking-widest"
                            >
                                Abandon Projection
                            </button>
                        </div>
                    )}
                </div>
            )}
            {/* END CHANGE */}

            {/* START CHANGE: Sidebar Drag Preview Indicator */}
            {sidebarDragEntity && dragPosition && (
                <div 
                    className="fixed z-[9999] pointer-events-none flex flex-col items-center justify-center"
                    style={{ 
                        left: dragPosition.x, 
                        top: dragPosition.y, 
                        transform: 'translate(-50%, -50%)',
                        width: '64px',
                        height: '64px'
                    }}
                >
                    <div className="w-full h-full rounded-full overflow-hidden border-2 border-dashed border-indigo-400 bg-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-pulse">
                        {sidebarDragEntity.image ? (
                            <img src={sidebarDragEntity.image} className="w-full h-full object-cover opacity-70" alt="" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-indigo-200 font-bold text-xs">
                                {sidebarDragEntity.name?.[0]}
                            </div>
                        )}
                    </div>
                    <div className="absolute top-full mt-2 bg-slate-900/90 text-indigo-300 text-[10px] font-bold px-2 py-1 rounded border border-indigo-500/50 whitespace-nowrap shadow-lg backdrop-blur">
                        Drop to Spawn
                    </div>
                </div>
            )}
            {/* END CHANGE */}
        </div>
    );
};

export default TacticalMap;