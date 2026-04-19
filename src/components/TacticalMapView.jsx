import React, { useState, useEffect, Suspense, useRef, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, Grid, useTexture, DragControls, Html, useCursor, Line, Text, RoundedBox, Billboard, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { subscribeToMap, updateMap, createMap } from '../utils/mapService';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { useCharacterStore } from '../stores/useCharacterStore';
import AssetManager from './AssetManager';
import { MeasurementTools } from './MeasurementTools';
import Icon from './Icon';
import { retrieveChunkedMap } from '../utils/storageUtils';
import CharacterModel from './CharacterModel';
import Token3D from './tactical/Token';
import CameraController from '../utils/CameraController';
import { collection, doc, query, where, getDocs } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { searchGithubModels } from '../utils/miniManifest';

import { ENV_SETTINGS } from '../constants/environment';
import { segmentsIntersect } from '../utils/mathUtils';
import { checkLineOfSight } from '../utils/losUtils';
import { useResolvedUrl } from '../utils/useResolvedUrl';

import { MapPlane, MapPlaneContent } from './3d/MapPlane';

import { MarqueeSelector } from './3d/MarqueeSelector';

import { Heightmap, HeightmapContent } from './3d/Heightmap';

import { Walls, Wall, WallSegment } from './3d/Walls';

import { CombatTrackerSidebar, CombatRibbon } from './ui/CombatTrackerSidebar';

import { CombatCameraDirector } from './3d/CombatCameraDirector';
import { ArchitectPenController } from './3d/controllers/ArchitectPenController';
import { LightPlacementController } from './3d/controllers/LightPlacementController';
import { MapLights } from './3d/MapLights';
import { MapPings } from './3d/MapPings';

import { GpuFogOfWar } from './3d/GpuFogOfWar';

import { ZoomHandler } from './3d/ZoomHandler';
import { WallDrawingController } from './3d/controllers/WallDrawingController';
import { WeatherParticles } from './3d/WeatherParticles';
import { PostProcessingEffects } from './3d/PostProcessingEffects';
import { DropZone } from './ui/DropZone';
import { DisplacedGrid } from './3d/DisplacedGrid';
import { ToolButton } from './ui/ToolButton';

// Helper function to generate boundary walls
const generateBoundaryWalls = (mapScale, mapAspect) => {
    const mapWidth = mapScale * mapAspect;
    const mapHeight = mapScale;
    const walls = {};

    const halfWidth = mapWidth / 2;
    const halfHeight = mapHeight / 2;

    // Small offset to ensure walls are slightly outside the map plane
    const wallThicknessOffset = 0.1; 

    // Define corners slightly outside the map to ensure they encompass the entire map plane
    const topLeft = { x: -halfWidth - wallThicknessOffset, y: 0, z: -halfHeight - wallThicknessOffset };
    const topRight = { x: halfWidth + wallThicknessOffset, y: 0, z: -halfHeight - wallThicknessOffset };
    const bottomLeft = { x: -halfWidth - wallThicknessOffset, y: 0, z: halfHeight + wallThicknessOffset };
    const bottomRight = { x: halfWidth + wallThicknessOffset, y: 0, z: halfHeight + wallThicknessOffset };

    // Generate unique IDs for walls
    const generateWallId = () => `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    walls[generateWallId()] = { id: generateWallId(), type: 'wall', points: [topLeft, topRight] }; // Top wall
    walls[generateWallId()] = { id: generateWallId(), type: 'wall', points: [bottomLeft, bottomRight] }; // Bottom wall
    walls[generateWallId()] = { id: generateWallId(), type: 'wall', points: [topLeft, bottomLeft] }; // Left wall
    walls[generateWallId()] = { id: generateWallId(), type: 'wall', points: [topRight, bottomRight] }; // Right wall
    return walls;
};

const LoadingOverlay = ({ activeMapId, isMapDataReady }) => {
    const { active, progress, loaded, total } = useProgress();
    const [prevMapId, setPrevMapId] = useState(activeMapId);
    const [isForced, setIsForced] = useState(true);

    if (activeMapId !== prevMapId) {
        setPrevMapId(activeMapId);
        setIsForced(true);
    }

    useEffect(() => {
        if (isForced && isMapDataReady) {
            const timer = setTimeout(() => setIsForced(false), 500);
            return () => clearTimeout(timer);
        }
    }, [isForced, isMapDataReady]);
    
    const show = active || isForced || !isMapDataReady;

    return (
        <div className={`absolute inset-0 z-50 flex items-center justify-center bg-slate-950 text-white pointer-events-none transition-opacity duration-500 ${show ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex flex-col items-center gap-6">
                {/* Spinning Hexagon Ring */}
                <div className="relative w-24 h-24">
                    <div className="absolute inset-0 border-t-4 border-amber-500 border-r-4 border-r-transparent rounded-full animate-spin"></div>
                    <div className="absolute inset-2 border-b-4 border-emerald-500 border-l-4 border-l-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Icon name="hexagon" size={32} className="text-amber-500 animate-pulse" />
                    </div>
                </div>
                
                {/* Text and Bar */}
                <div className="flex flex-col items-center gap-2">
                    <div className="text-2xl font-bold font-serif text-amber-500 tracking-wider">Summoning Realm</div>
                    <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono tracking-widest">{loaded} / {total || 1} Assets</div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(function TacticalMapView({ campaignCode, activeMapId, onOpenSheet, role, onOpenHandouts, onOpenChat, onOpenJournal, onOpenDiceTray }) {
  const { campaign, updateCampaign, user } = useNewCampaign();
  const data = campaign;
  const cameraControllerRef = useRef();
  const zoomRef = useRef();
  const [mapData, setMapData] = useState(null);
  const selectedTokenIds = useCharacterStore(state => state.selectedTokenIds);
  const setSelectedTokenIds = useCharacterStore(state => state.setSelectedTokenIds);
  const [contextMenu, setContextMenu] = useState(null);
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showTokenManager, setShowTokenManager] = useState(false);
  const [showInitiativeTracker, setShowInitiativeTracker] = useState(false);
  
  useEffect(() => {
      if (data?.campaign?.combat?.active) {
          setShowInitiativeTracker(true);
      }
  }, [data?.campaign?.combat?.active]);

  const [isDrawingWalls, setIsDrawingWalls] = useState(false);
  const [drawingWallType, setDrawingWallType] = useState('wall');
  const [selectedWalls, setSelectedWalls] = useState([]);
  const [selectedLights, setSelectedLights] = useState([]);
  const [isArchitectMode, setIsArchitectMode] = useState(false);
  const [isPlacingLights, setIsPlacingLights] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [wallContextMenu, setWallContextMenu] = useState(null);
  const [lightContextMenu, setLightContextMenu] = useState(null);
  const tokenMenuRef = useRef(null);
  const wallMenuRef = useRef(null);
  const lightMenuRef = useRef(null);
  const [activeTool, setActiveTool] = useState(null);
  const [activeMeasurementStyle, setActiveMeasurementStyle] = useState('default');
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('isometric');
  const [draggedTokenId, setDraggedTokenId] = useState(null);
  const [remountKey, setRemountKey] = useState(0);
  const [assetTab, setAssetTab] = useState('library');
  const shiftHeldRef = useRef(false);

  // Added States for List View and 5e API
  const [actorViewMode, setActorViewMode] = useState('grid');
  const [showCompendium, setShowCompendium] = useState(false);
  const [compendiumSearch, setCompendiumSearch] = useState("");
  const [compendiumResults, setCompendiumResults] = useState([]);
  const [isLoadingCompendium, setIsLoadingCompendium] = useState(false);

  const [pendingNpc, setPendingNpc] = useState(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [miniSearchQuery, setMiniSearchQuery] = useState("");
  const [isSearchingMinis, setIsSearchingMinis] = useState(false);

  const handleMiniSearch = async (overrideQuery, typeFallback) => {
      const q = overrideQuery !== undefined ? overrideQuery : miniSearchQuery;
      if (!q) return;
      setIsSearchingMinis(true);
      let results = await searchGithubModels(q);
      if (results.length === 0 && typeFallback) results = await searchGithubModels(typeFallback);
      setAvailableModels(results);
      setIsSearchingMinis(false);
  };

  // Helper to open manager to a specific tab
  const openAssets = (tab) => {
    setAssetTab(tab);
    setShowAssetManager(true);
    setShowTokenManager(false);
    setIsDrawingWalls(false);
  };

  // --- Fullscreen & Idle UI Logic ---
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef(null);
  const isAnyMenuOpenRef = useRef(false);

  useEffect(() => {
      if (isFullscreen) {
          document.body.classList.add('pseudo-fullscreen');
      } else {
          document.body.classList.remove('pseudo-fullscreen');
          setIsIdle(false);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      }
      return () => document.body.classList.remove('pseudo-fullscreen');
  }, [isFullscreen]);

  useEffect(() => {
      const handleFullscreenChange = () => {
          if (!document.fullscreenElement) {
              setIsFullscreen(false);
          }
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
      isAnyMenuOpenRef.current = showAssetManager || showTokenManager || !!contextMenu || !!wallContextMenu || !!lightContextMenu || showCompendium || showModelPicker;
      if (isAnyMenuOpenRef.current) {
          setIsIdle(false);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      }
  }, [showAssetManager, showTokenManager, contextMenu, wallContextMenu, lightContextMenu, showCompendium, showModelPicker]);

  const handleMouseMove = () => {
      if (!isFullscreen) return;
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (!isAnyMenuOpenRef.current) {
          idleTimerRef.current = setTimeout(() => {
              setIsIdle(true);
          }, 2500);
      }
  };

  const toggleFullscreen = () => {
      if (!isFullscreen) {
          setIsFullscreen(true);
          if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen().catch(err => {
                  console.warn(`Native fullscreen not supported: ${err.message}`);
              });
          }
      } else {
          setIsFullscreen(false);
          if (document.fullscreenElement && document.exitFullscreen) {
              document.exitFullscreen().catch(e => console.warn(e));
          }
      }
  };

  const uiOpacityClass = isFullscreen && isIdle 
      ? 'opacity-0 pointer-events-none transition-opacity duration-1000' 
      : 'opacity-100 transition-opacity duration-300';

  // Setup CPU-side Terrain Matrix logic
  const [aspect, setAspect] = useState(1);
  const [isAspectReady, setIsAspectReady] = useState(false);
  const [terrainData, setTerrainData] = useState(null);

  const resolvedBackgroundUrl = useResolvedUrl(mapData?.backgroundUrl);
  const resolvedHeightmapUrl = useResolvedUrl(mapData?.heightmapUrl);
  const resolvedNormalMapUrl = useResolvedUrl(mapData?.normalMapUrl);

  useEffect(() => {
    if (!resolvedBackgroundUrl) {
        setIsAspectReady(!mapData?.backgroundUrl); // If no background, aspect is ready (defaults to 1)
        return;
    }
    setIsAspectReady(false);
    const img = new Image();
    img.onload = () => {
        setAspect(img.width / img.height || 1);
        setIsAspectReady(true);
    }
    img.src = resolvedBackgroundUrl;
  }, [resolvedBackgroundUrl, mapData?.backgroundUrl]);

  useEffect(() => {
    if (!resolvedHeightmapUrl) {
      setTerrainData(null);
      return;
    }
    let isActive = true;
    const img = new Image();
    if (!resolvedHeightmapUrl.startsWith('blob:') && !resolvedHeightmapUrl.startsWith('data:')) {
        img.crossOrigin = "Anonymous";
    }
    img.onload = () => {
      if (!isActive) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        setTerrainData({
          data: imageData.data,
          width: img.width,
          height: img.height
        });
      } catch (err) {
        console.warn("Failed to read heightmap data (CORS?)", err);
      }
    };
    img.src = resolvedHeightmapUrl;
    return () => { isActive = false; };
  }, [resolvedHeightmapUrl]);

  const getTerrainHeight = useCallback((x, z) => {
    if (!terrainData || !mapData || !mapData.heightmapUrl) {
      return 0;
    }
    const scale = mapData.scale || 20;
    const heightScale = mapData.heightScale || 1;
    
    const u = (x / (scale * aspect)) + 0.5;
    const v = (z / scale) + 0.5;

    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return 0;
    }

    const pixelX = Math.floor(u * terrainData.width);
    const pixelY = Math.floor(v * terrainData.height);
    
    const safeX = Math.max(0, Math.min(pixelX, terrainData.width - 1));
    const safeY = Math.max(0, Math.min(pixelY, terrainData.height - 1));

    const index = (safeY * terrainData.width + safeX) * 4;
    const r = terrainData.data[index]; // Red channel for height

    const calculatedHeight = (r / 255.0) * heightScale;
    return calculatedHeight;
  }, [terrainData, mapData, aspect]);

  // Subscribe to real-time map updates from Firebase
  useEffect(() => {
    setMapData(null); // Immediately clear last map's data
    if (!campaignCode || !activeMapId) return;
    const unsubscribe = subscribeToMap(campaignCode, activeMapId, (data) => {
      if (data) {
        setMapData(data);
      } else {
        setMapData(null);
      }
    });
    return () => unsubscribe();
  }, [campaignCode, activeMapId]);

  const gridSize = mapData?.gridSize || 1;
  const showPlane = mapData?.backgroundUrl && mapData.backgroundUrl.trim() !== '';
  const showNameplates = mapData?.showNameplates !== false;
  const isSnapToGrid = mapData?.isSnapToGrid !== false;
  
  const tokens = useMemo(() => mapData?.tokens || {}, [mapData]);
  
  const latestTokensRef = useRef({});
  useEffect(() => {
      latestTokensRef.current = tokens;
  }, [tokens]);

  const groupDragData = useRef({ activeTokenId: null, delta: new THREE.Vector3() });

  const handleGroupDragEnd = useCallback((leaderId, delta) => {
      selectedTokenIds.forEach(id => {
          if (id === leaderId) return;
          const t = latestTokensRef.current[id];
          if (!t) return;

          if (role !== 'dm') {
              const character = allCharacters.find(c => String(c.id) === String(t.characterId));
              const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || 
                              (t.ownerId && String(t.ownerId) === String(user?.uid));
              const myCharId = data?.assignments?.[user?.uid];
              const myCharAssigned = myCharId && String(t.characterId) === String(myCharId);
              const canControl = isOwner || myCharAssigned || t.isSharedControl;
              if (!canControl) return;
          }

          const newX = (t.x || 0) + delta.x;
          const newZ = (t.z || 0) + delta.z;

          const tokenSize = t.size || 1;
          const isEvenSize = Math.round(tokenSize) % 2 === 0;
          const gridOffsetX = mapData?.gridOffsetX || 0;
          const gridOffsetY = mapData?.gridOffsetY || 0;
          const finalX = isSnapToGrid ? (isEvenSize ? Math.round((newX - gridOffsetX) / gridSize) * gridSize + gridOffsetX : Math.floor((newX - gridOffsetX) / gridSize) * gridSize + gridSize / 2 + gridOffsetX) : newX;
          const finalZ = isSnapToGrid ? (isEvenSize ? Math.round((newZ - gridOffsetY) / gridSize) * gridSize + gridOffsetY : Math.floor((newZ - gridOffsetY) / gridSize) * gridSize + gridSize / 2 + gridOffsetY) : newZ;

          const terrainY = getTerrainHeight ? getTerrainHeight(finalX, finalZ) : 0;
          const finalY = terrainY + (t.elevationOffset || 0) + (mapData?.tokenElevationOffset ?? -0.04);

          updateMap(campaignCode, activeMapId, {
              [`tokens.${id}.x`]: finalX,
              [`tokens.${id}.y`]: finalY,
              [`tokens.${id}.z`]: finalZ,
              [`tokens.${id}.elevationOffset`]: t.elevationOffset || 0,
          });
      });
  }, [selectedTokenIds, isSnapToGrid, gridSize, getTerrainHeight, campaignCode, activeMapId, mapData?.gridOffsetX, mapData?.gridOffsetY]);

  const tokensList = useMemo(() => Object.values(tokens).filter(Boolean), [tokens]); // Filter out null/undefined tokens
  const allCharacters = useMemo(() => [...(data?.players || []), ...(data?.npcs || [])], [data?.players, data?.npcs]);

  // Calculate Player Vision Sources (Used by both Fog Renderer and CPU Visibility checks)
  const playerVisionSources = useMemo(() => {
      if (!tokensList || !allCharacters) return [];

      let relevantTokens;
      if (role === 'dm') {
          const playerCharIds = new Set((data?.players || []).map(p => String(p.id)));
          relevantTokens = tokensList.filter(t => t.characterId && playerCharIds.has(String(t.characterId)));
      } else {
          const myCharId = data?.assignments?.[user?.uid];
          relevantTokens = tokensList.filter(t => {
              if (!t.characterId) return false;
              if (t.isSharedControl) return true;
              if (myCharId && String(t.characterId) === String(myCharId)) return true;
              const char = allCharacters.find(c => String(c.id) === String(t.characterId));
              return char && String(char.ownerId) === String(user?.uid);
          });
      }
      
      return relevantTokens.map(t => {
          const character = allCharacters.find(c => String(c.id) === String(t.characterId));
          if (!character) return null;
          
          const parseSense = (senseName) => {
              let val = 0;
              if (typeof character?.senses === 'object' && character.senses !== null && !Array.isArray(character.senses)) {
                  const s = character.senses[senseName] || character.senses[senseName.charAt(0).toUpperCase() + senseName.slice(1)];
                  if (s) {
                      const match = String(s).match(/(\d+)/);
                      if (match) val = parseInt(match[1], 10);
                  }
              }
              if (character?.[senseName]) {
                  const match = String(character[senseName]).match(/(\d+)/);
                  if (match) val = Math.max(val, parseInt(match[1], 10));
              }
              if (val === 0 && character?.senses) {
                  let sensesStr = "";
                  if (typeof character.senses === 'string') {
                      sensesStr = character.senses;
                  } else if (Array.isArray(character.senses)) {
                      sensesStr = character.senses.map(s => typeof s === 'object' ? JSON.stringify(s) : String(s)).join(" ");
                  } else if (typeof character.senses === 'object') {
                      sensesStr = Object.values(character.senses).map(String).join(" ");
                  }
                  
                  if (sensesStr.toLowerCase().includes(senseName)) {
                      const regex1 = new RegExp(`${senseName}[^0-9a-z]*(\\d+)`, 'i');
                      const regex2 = new RegExp(`(\\d+)[^0-9a-z]*${senseName}`, 'i');
                      const match = sensesStr.match(regex1) || sensesStr.match(regex2);
                      if (match) val = parseInt(match[1], 10);
                      else val = 60;
                  }
              }
              if (val === 0 && Array.isArray(character?.features)) {
                  const feature = character.features.find(f => f.name?.toLowerCase().includes(senseName));
                  if (feature) {
                      const desc = typeof feature === 'object' ? (feature.desc || JSON.stringify(feature)) : String(feature);
                      const matches = desc.match(/\b(30|60|90|120|150)\b/);
                      if (matches) {
                          val = parseInt(matches[1], 10);
                      } else {
                          const match = desc.match(/(\d+)/);
                          if (match) val = parseInt(match[1], 10);
                          else val = 60;
                      }
                  }
              }
              return val;
          };

          let parsedDv = parseSense('darkvision');
          let parsedBlindsight = parseSense('blindsight');
          let parsedTruesight = parseSense('truesight');
          let parsedTremorsense = parseSense('tremorsense');

          let visionRange = 5;
          if (parsedDv > visionRange) visionRange = parsedDv;
          if (parsedBlindsight > visionRange) visionRange = parsedBlindsight;
          if (parsedTruesight > visionRange) visionRange = parsedTruesight;
          if (parsedTremorsense > visionRange) visionRange = parsedTremorsense;

          if (mapData?.fowEnabled === false) {
              return { 
                  id: t.id, x: t.x || 0, y: t.y || 0, z: t.z || 0, 
                  range: 9999, // Max map vision
                  darkvision: 9999, // Can see everything in LOS
                  blindsight: (parsedBlindsight / 5) * gridSize,
                  truesight: (parsedTruesight / 5) * gridSize,
                  tremorsense: (parsedTremorsense / 5) * gridSize
              };
          }

          return { 
              id: t.id, x: t.x || 0, y: t.y || 0, z: t.z || 0, 
              range: (visionRange / 5) * gridSize,
              darkvision: (parsedDv / 5) * gridSize,
              blindsight: (parsedBlindsight / 5) * gridSize,
              truesight: (parsedTruesight / 5) * gridSize,
              tremorsense: (parsedTremorsense / 5) * gridSize
          };
      }).filter(Boolean);
  }, [tokensList, role, user?.uid, data?.assignments, allCharacters, gridSize, data?.players, mapData?.fowEnabled]);

  // Calculate which doors and windows are visible to players based on their vision sources
  const visibleDoorWindowIds = useMemo(() => {
      if (role === 'dm') {
          // DM sees all walls, so all doors/windows are visible to DM
          return new Set(Object.values(mapData?.walls || {}).filter(w => w.type === 'door' || w.type === 'window').map(w => w.id));
      }

      const visibleIds = new Set();
      if (!mapData?.walls || !playerVisionSources || playerVisionSources.length === 0) {
          return visibleIds;
      }

      Object.values(mapData.walls).forEach(wall => {
          if (wall.type === 'door' || wall.type === 'window') {
              const wallMidpoint = {
                  x: (wall.points[0].x + wall.points[1].x) / 2,
                  z: (wall.points[0].z + wall.points[1].z) / 2,
              };

              for (const source of playerVisionSources) {
                  const dist = Math.sqrt(Math.pow(source.x - wallMidpoint.x, 2) + Math.pow(source.z - wallMidpoint.z, 2));

                  // Check if within vision range and if there's line of sight
                  if (dist <= source.range && checkLineOfSight(source, wallMidpoint, mapData.walls)) {
                      visibleIds.add(wall.id);
                      break; // This door/window is visible, no need to check other sources
                  }
              }
          }
      });
      return visibleIds;
  }, [mapData?.walls, playerVisionSources, role]);

  // Calculate combined lights (map lights + dynamic token lights)
  const combinedLights = useMemo(() => {
      const allLights = { ...(mapData?.lights || {}) };
      tokensList.forEach(t => {
          if (t.light && t.light.radius > 0) {
              if (role !== 'dm' && t.isHidden) return; // Hide light if token is hidden from players
              allLights[`token_light_${t.id}`] = {
                  id: `token_light_${t.id}`,
                  position: { x: t.x || 0, y: (t.y || 0) + 1, z: t.z || 0 }, // Elevate light slightly
                  color: t.light.color || '#ffaa00',
                  radius: t.light.radius,
                  intensity: 1.5,
                  isTokenLight: true
              };
          }
      });
      return allLights;
  }, [mapData?.lights, tokensList, role]);

  // CPU-based Line of Sight / Token Visibility Filter
  const visibleTokenIds = useMemo(() => {
      if (role === 'dm') return new Set(tokensList.map(t => t.id)); // DM sees everything
      const visibleIds = new Set();

      tokensList.forEach(t => {
          if (t.isHidden) return; // Hidden tokens are completely excluded
          
          const character = allCharacters.find(c => String(c.id) === String(t.characterId));
          const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || (t.ownerId && String(t.ownerId) === String(user?.uid));
          const myCharAssigned = data?.assignments?.[user?.uid] && String(t.characterId) === String(data.assignments[user.uid]);
          
          // You can always see yourself and tokens you share control over
          if (isOwner || myCharAssigned || t.isSharedControl) {
              visibleIds.add(t.id);
              return;
          }

          const wallsArray = Object.values(mapData?.walls || {});
          const targetPt = { x: t.x || 0, z: t.z || 0 };

          // Check visibility from each of the player's vision sources
          for (const src of playerVisionSources) {
              const dist = Math.sqrt(Math.pow(src.x - targetPt.x, 2) + Math.pow(src.z - targetPt.z, 2));
              
              const truesightRange = src.truesight ?? 0;
              const blindsightRange = src.blindsight ?? 0;
              const tremorsenseRange = src.tremorsense ?? 0;
              const baseVisionRange = src.darkvision ?? src.range;

              // Optimization: We check LOS only once if needed
              const hasLOS = checkLineOfSight(src, targetPt, wallsArray);

              const canSeeWithTruesight = dist <= truesightRange && hasLOS;
              const canSeeWithBlindsight = dist <= blindsightRange && hasLOS;
              const canSeeWithTremorsense = dist <= tremorsenseRange && (t.elevationOffset || 0) === 0; // Ignores LOS but requires target to be on ground
              
              const isTargetInvisible = (t.conditions || []).some(c => (typeof c === 'string' ? c : c.name)?.toLowerCase() === 'invisible') ||
                                        (character?.conditions || []).some(c => (typeof c === 'string' ? c : c.name)?.toLowerCase() === 'invisible');

              if (canSeeWithTruesight || canSeeWithBlindsight || canSeeWithTremorsense) {
                  visibleIds.add(t.id);
                  return; // Visible, no need to check further for this token
              }

              if (isTargetInvisible) {
                  continue; // Cannot see with regular vision/darkvision/light
              }

              // Condition 1: Is the target within darkvision/base range AND there is line of sight?
              if (dist <= baseVisionRange && hasLOS) {
                  visibleIds.add(t.id);
                  return; // Visible
              }

              // Condition 2: Is the target illuminated by a light source AND does the player have line of sight to it?
              if (combinedLights && mapData?.fowEnabled !== false) {
                  // First, check if the player has LOS to the target token. If not, no light can make it visible to them.
                  if (hasLOS) {
                      // Now, check if any light source illuminates the target token.
                      for (const light of Object.values(combinedLights)) {
                          const lightRange = (light.radius || 15) / 5 * gridSize;
                          const lightPt = { x: light.position.x, z: light.position.z };
                          const distToLight = Math.sqrt(Math.pow(lightPt.x - targetPt.x, 2) + Math.pow(lightPt.z - targetPt.z, 2));
                          
                          // A token is illuminated if it's within a light's range AND the light has LOS to it.
                          if (distToLight <= lightRange && checkLineOfSight(lightPt, targetPt, wallsArray)) {
                              visibleIds.add(t.id);
                              return; // Visible
                          }
                      }
                  }
              }
          }
      });
      return visibleIds;
  }, [tokensList, role, playerVisionSources, mapData?.walls, mapData?.lights, mapData?.fowEnabled, allCharacters, user?.uid, data?.assignments, gridSize]);

  // Calculate which 3D lights are visible to the players (prevents unseen lights from shining through walls via normal maps)
  const visibleLights = useMemo(() => {
      if (!combinedLights) return {};
      if (role === 'dm' || mapData?.fowEnabled === false) return combinedLights;

      const filteredLights = {};
      const wallsArray = Object.values(mapData?.walls || {});

      Object.values(combinedLights).forEach(light => {
          const lightPt = { x: light.position.x, z: light.position.z };
          for (const src of playerVisionSources) {
              if (checkLineOfSight(src, lightPt, wallsArray)) {
                  filteredLights[light.id] = light;
                  break;
              }
          }
      });
      return filteredLights;
  }, [mapData?.lights, mapData?.walls, mapData?.fowEnabled, playerVisionSources, role]);

  // Extract active combatant early so the Camera Director can hook into it
  const activeCombatantId = mapData && data?.campaign?.combat?.active && data?.campaign?.combat?.combatants?.length 
      ? data.campaign.combat.combatants[(data.campaign.combat.turn || 0) % data.campaign.combat.combatants.length].tokenId 
      : null;

  // Handle clicking a token to both select it and open the side sheet
  const handleSelectToken = (tokenId, isMulti) => {
    if (isMulti) {
        setSelectedTokenIds(prev => prev.includes(tokenId) ? prev.filter(id => id !== tokenId) : [...prev, tokenId]);
    } else {
        setSelectedTokenIds([tokenId]);
    }
    setContextMenu(null);
  };

  // Group Initiative Roller
  const rollGroupInitiative = (tokenIds) => {
      const currentCombat = data?.campaign?.combat || { active: false, round: 1, turn: 0, combatants: [] };
      const currentCombatants = currentCombat.combatants || [];
      
      const newEntries = tokenIds.map(tId => {
          const token = tokensList.find(t => t.id === tId);
          const char = allCharacters.find(c => String(c.id) === String(token?.characterId));
          const dex = char?.stats?.dex || 10;
          const mod = Math.floor((dex - 10) / 2);
          const roll = Math.floor(Math.random() * 20) + 1;
          const isNpc = !data?.players?.some(p => String(p.id) === String(token?.characterId));
          return { 
              tokenId: tId, 
              initiative: roll + mod,
              name: token?.name || char?.name || 'Unknown',
              isNpc: isNpc
          };
      });

      const merged = [...currentCombatants];
      newEntries.forEach(ne => {
          const existingIdx = merged.findIndex(m => m.tokenId === ne.tokenId);
          if (existingIdx >= 0) merged[existingIdx] = ne;
          else merged.push(ne);
      });
      merged.sort((a,b) => b.initiative - a.initiative);

      updateCampaign({ campaign: { ...(data?.campaign || {}), combat: { ...currentCombat, active: true, combatants: merged } } });
  };

  // Handler to add a single character directly from the Actors Tab into combat
  const handleAddActorToCombat = (actor, isNpc) => {
      const currentCombat = data?.campaign?.combat || { active: false, round: 1, turn: 0, combatants: [] };
      const combatants = currentCombat.combatants || [];
      
      const dex = actor?.stats?.dex || 10;
      const mod = Math.floor((dex - 10) / 2);
      const roll = Math.floor(Math.random() * 20) + 1;
      
      const newCombatant = {
          tokenId: `tracker_${actor.id}_${Date.now()}`,
          characterId: actor.id,
          initiative: roll + mod,
          name: actor.name || 'Unknown',
          isNpc: isNpc
      };
      
      const newCombatants = [...combatants, newCombatant].sort((a,b) => b.initiative - a.initiative);
      updateCampaign({ campaign: { ...(data?.campaign || {}), combat: { ...currentCombat, active: true, combatants: newCombatants } } });
  };

  const searchCompendium = async () => {
      if (!compendiumSearch.trim()) return;
      setIsLoadingCompendium(true);
      try {
          const res = await fetch('https://www.dnd5eapi.co/api/monsters?name=' + compendiumSearch);
          const apiData = await res.json();
          if (apiData.count === 0) {
              alert("No monsters found in the SRD with that name.");
              setCompendiumResults([]);
          } else {
              setCompendiumResults(apiData.results.slice(0, 20));
          }
      } catch (e) {
          console.error(e);
          alert("Could not connect to D&D 5e API.");
      }
      setIsLoadingCompendium(false);
  };

  const importFromApi = async (monsterIndexUrl) => {
      setIsLoadingCompendium(true);
      try {
          const res = await fetch(`https://www.dnd5eapi.co${monsterIndexUrl}`);
          const m = await res.json();
          let imageUrl = "";
          if (m.image) {
              imageUrl = `https://www.dnd5eapi.co${m.image}`;
          } else if (window.puter) {
              try {
                  const imgEl = await window.puter.ai.txt2img(`D&D Beyond official digital character illustration of a ${m.name} (${m.type}). 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`, { model: 'dall-e-3' });
                  const response = await fetch(imgEl.src);
                  const blob = await response.blob();
                  imageUrl = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result);
                      reader.readAsDataURL(blob);
                  });
              } catch (e) { console.error("Image gen failed", e); }
          }
          const acVal = Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class;
          const speedStr = typeof m.speed === 'object' ? Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;
          const sensesObj = {
              darkvision: m.senses?.darkvision || "",
              passivePerception: m.senses?.passive_perception || 10,
              blindsight: m.senses?.blindsight || "",
              tremorsense: m.senses?.tremorsense || "",
              truesight: m.senses?.truesight || ""
          };
          const newNpc = {
              id: Date.now(),
              isHidden: true,
              name: m.name,
              race: `${m.size} ${m.type} (${m.alignment})`,
              class: "Monster",
              level: m.challenge_rating,
              hp: { current: m.hit_points, max: m.hit_points },
              ac: acVal,
              speed: speedStr,
              stats: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
              senses: sensesObj,
              image: imageUrl,
              quirk: "SRD Import",
              bio: { backstory: `Imported from D&D 5e API.\nXP: ${m.xp}\nLanguages: ${m.languages}`, appearance: `A ${m.size} ${m.type}.` },
              customActions: (m.actions || []).map(a => {
                  let dmgString = "";
                  if (a.damage && a.damage[0] && a.damage[0].damage_dice) {
                      dmgString = a.damage[0].damage_dice;
                      if(a.damage[0].damage_type?.name) dmgString += ` ${a.damage[0].damage_type.name}`;
                  }
                  return { name: a.name, desc: a.desc, type: "Action", hit: a.attack_bonus ? `+${a.attack_bonus}` : "", dmg: dmgString };
              }),
              features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" })),
              legendaryActions: (m.legendary_actions || []).map(l => ({ name: l.name, desc: l.desc }))
          };
          
          setPendingNpc(newNpc);
          setAvailableModels([]);
          setShowCompendium(false);
          setShowModelPicker(true);
          setMiniSearchQuery(m.name);
          handleMiniSearch(m.name, m.type);
      } catch (e) {
          console.error(e);
          alert("Failed to import monster details.");
      }
      setIsLoadingCompendium(false);
  };

  const handleModelSelect = async (model) => {
    if (!pendingNpc) return;
    const finalNpc = { ...pendingNpc };
    if (model) {
        finalNpc.modelUrl = model.url;
        finalNpc.modelScale = model.scale;
        finalNpc.modelYOffset = model.yOffset;
    }
    
    updateCampaign({ npcs: [...(data?.npcs || []), finalNpc] });
    
    const dropX = 0;
    const dropZ = 0;
    const terrainY = getTerrainHeight ? getTerrainHeight(dropX, dropZ) : 0;
    
    const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tokenData = {
        id: newTokenId, characterId: finalNpc.id, name: finalNpc.name,
        type: 'npc', x: dropX, y: terrainY + (mapData?.tokenElevationOffset ?? -0.04), z: dropZ,
        image: finalNpc.image || '', size: finalNpc.size || 1, hp: finalNpc.hp
    };

    await updateMap(campaignCode, activeMapId, { [`tokens.${newTokenId}`]: tokenData });
    
    setPendingNpc(null);
    setShowModelPicker(false);
  };

  const [tokenMenuDisplayPosition, setTokenMenuDisplayPosition] = useState({ x: 0, y: 0 });
  const [wallMenuDisplayPosition, setWallMenuDisplayPosition] = useState({ x: 0, y: 0 });
  const [lightMenuDisplayPosition, setLightMenuDisplayPosition] = useState({ x: 0, y: 0 });

  // Effect for token context menu positioning
  useEffect(() => {
    if (contextMenu && tokenMenuRef.current) {
      // Use requestAnimationFrame to ensure DOM is rendered before measuring
      requestAnimationFrame(() => {
        const menuWidth = tokenMenuRef.current.offsetWidth;
        const menuHeight = tokenMenuRef.current.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newX = contextMenu.x;
        let newY = contextMenu.y;

        if (newX + menuWidth > viewportWidth) {
          newX = viewportWidth - menuWidth - 10; // 10px padding from right edge
        }
        if (newY + menuHeight > viewportHeight) {
          newY = viewportHeight - menuHeight - 10; // 10px padding from bottom edge
        }
        setTokenMenuDisplayPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
      });
    }
  }, [contextMenu]);

  // Effect for wall context menu positioning
  useEffect(() => {
    if (wallContextMenu && wallMenuRef.current) {
      requestAnimationFrame(() => {
        const menuWidth = wallMenuRef.current.offsetWidth;
        const menuHeight = wallMenuRef.current.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newX = wallContextMenu.x;
        let newY = wallContextMenu.y;

        if (newX + menuWidth > viewportWidth) {
          newX = viewportWidth - menuWidth - 10;
        }
        if (newY + menuHeight > viewportHeight) {
          newY = viewportHeight - menuHeight - 10;
        }
        setWallMenuDisplayPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
      });
    }
  }, [wallContextMenu]);

  // Effect for light context menu positioning
  useEffect(() => {
    if (lightContextMenu && lightMenuRef.current) {
      requestAnimationFrame(() => {
        const menuWidth = lightMenuRef.current.offsetWidth;
        const menuHeight = lightMenuRef.current.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newX = lightContextMenu.x;
        let newY = lightContextMenu.y;

        if (newX + menuWidth > viewportWidth) {
          newX = viewportWidth - menuWidth - 10;
        }
        if (newY + menuHeight > viewportHeight) {
          newY = viewportHeight - menuHeight - 10;
        }
        setLightMenuDisplayPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
      });
    }
  }, [lightContextMenu]);

  const handleContextMenu = (e, token) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50); // Haptic feedback on token long-press/right-click
    }
    
    const char = allCharacters.find(c => String(c.id) === String(token.characterId));
    const isOwner = char?.ownerId === user?.uid;
    const myCharId = data?.assignments?.[user?.uid];
    const myCharAssigned = myCharId && String(token.characterId) === String(myCharId);
    const canControl = role === 'dm' || isOwner || myCharAssigned || token.isSharedControl;

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tokenId: token.id,
      characterId: token.characterId,
      elevationOffset: token.elevationOffset,
      isHidden: token.isHidden,
      isSharedControl: token.isSharedControl,
      size: token.size || 1,
      name: token.name,
      canControl: canControl,
      color: token.color,
      type: token.type,
    });
  };

  const handleWallContextMenu = (e, wallId) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50); // Haptic feedback on wall long-press/right-click
    }
    setContextMenu(null); // Close token context menu
    setWallContextMenu({
      x: e.clientX,
      y: e.clientY,
      wallId: wallId,
    });
  };

  const handleLightContextMenu = (e, lightId) => {
      e.stopPropagation();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50); // Haptic feedback on light long-press/right-click
      }
      setContextMenu(null);
      setWallContextMenu(null);
      setLightContextMenu({
          x: e.clientX,
          y: e.clientY,
          lightId: lightId
      });
  };

  const handleToggleDoor = (e, wallId) => {
      e.stopPropagation();
      const wall = mapData?.walls?.[wallId];
      if (wall && (wall.type === 'door' || wall.type === 'window')) {
          updateMap(campaignCode, activeMapId, { [`walls.${wallId}.isOpen`]: !wall.isOpen });
      }
  };

  // Handler triggered by Token3D when a drag ends
  const handleUpdateTokenPosition = async (tokenId, position) => {
    try {
        const updates = {};
        Object.keys(position).forEach(key => {
            updates[`tokens.${tokenId}.${key}`] = position[key];
        });
        await updateMap(campaignCode, activeMapId, updates);
    } catch (e) {
      console.error("[TacticalMapView] Failed to updateToken in Firestore:", e);
      throw e;
    }
  };

  // Handle dragging an image from the AssetManager directly onto the map
  const handleDrop = async (e, position) => {
    if (!position) return;

    let payload = null;
    
    try {
       // 1. Try parsing text/plain (Maximum browser compatibility)
       const plainText = e.dataTransfer.getData('text/plain');
       if (plainText) {
          const parsed = JSON.parse(plainText);
          if (parsed.format) payload = parsed;
       }
    } catch(err) {  }

    // 2. Fallback to custom mime types
    if (!payload) {
        const assetDataStr = e.dataTransfer.getData('application/dungeonmind-asset');
        const characterDataStr = e.dataTransfer.getData('application/dungeonmind-character');
        
        if (assetDataStr) {
            try {
                payload = { format: 'dungeonmind-asset', ...JSON.parse(assetDataStr) };
            } catch(err) {  }
        } else if (characterDataStr) {
            try {
                payload = { format: 'dungeonmind-character', ...JSON.parse(characterDataStr) };
            } catch(err) {  }
        }
    }


    if (!payload || !campaignCode || !activeMapId) {
        return;
    }

    // Calculate grid snapping and elevation
    const tokenSize = payload.size || 1;
    const isEvenSize = Math.round(tokenSize) % 2 === 0;
    const gridOffsetX = mapData?.gridOffsetX || 0;
    const gridOffsetY = mapData?.gridOffsetY || 0;
    const dropX = isSnapToGrid ? (isEvenSize ? Math.round((position.x - gridOffsetX) / gridSize) * gridSize + gridOffsetX : Math.floor((position.x - gridOffsetX) / gridSize) * gridSize + gridSize / 2 + gridOffsetX) : position.x;
    const dropZ = isSnapToGrid ? (isEvenSize ? Math.round((position.z - gridOffsetY) / gridSize) * gridSize + gridOffsetY : Math.floor((position.z - gridOffsetY) / gridSize) * gridSize + gridSize / 2 + gridOffsetY) : position.z;
    const terrainY = getTerrainHeight ? getTerrainHeight(dropX, dropZ) : 0;

    const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let tokenData;

    if (payload.format === 'dungeonmind-asset' || payload.url) {
        tokenData = {
            id: newTokenId,
            name: 'New Token',
            type: 'npc',
            x: dropX, y: terrainY + (mapData?.tokenElevationOffset ?? -0.04), z: dropZ,
            image: payload.url || payload.image || '',
            size: 1,
            isHidden: false
        };
    } else if (payload.format === 'dungeonmind-character' || payload.characterId || payload.id) {
        tokenData = {
            id: newTokenId,
            characterId: payload.id || null, 
            name: payload.name || 'Unknown',
            type: payload.type || 'npc',
        x: dropX, y: terrainY + (mapData?.tokenElevationOffset ?? -0.04), z: dropZ,
            image: payload.image || '',
            size: payload.size || 1,
        };
        
        if (payload.hp !== undefined) {
            tokenData.hp = payload.hp;
        }
    }

    if (tokenData) {
        await updateMap(campaignCode, activeMapId, {
            [`tokens.${tokenData.id}`]: tokenData
        });
    }
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore shortcuts if the user is typing in a text field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (activeTool) return;
          if (selectedTokenIds.length > 0) {
              const updates = {};
              if (role === 'dm') {
                  selectedTokenIds.forEach(id => {
                      updates[`tokens.${id}`] = null;
                  });
              } else {
                  selectedTokenIds.forEach(id => {
                      const t = latestTokensRef.current[id];
                      if (!t) return;
                      const allChars = [...(data?.players || []), ...(data?.npcs || [])];
                      const character = allChars.find(c => String(c.id) === String(t.characterId));
                      const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || (t.ownerId && String(t.ownerId) === String(user?.uid));
                      if (isOwner) updates[`tokens.${id}`] = null;
                  });
              }
              if (Object.keys(updates).length > 0) {
                  updateMap(campaignCode, activeMapId, updates);
              }
              setSelectedTokenIds([]);
          }
          return;
      }

      if (e.key === 'Escape') {
          setSelectedTokenIds([]); setContextMenu(null); setWallContextMenu(null); setLightContextMenu(null);
          if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); }
          setActiveTool(null);
          return;
      }

      if (e.key.toLowerCase() === 'v') { setViewMode(prev => prev === 'isometric' ? 'top-down' : 'isometric'); return; }

      if (role === 'dm') {
          switch(e.key.toLowerCase()) {
              case 'a': setActiveTool(null); setShowAssetManager(false); setShowTokenManager(false); setIsDrawingWalls(false); setIsPlacingLights(false); setIsArchitectMode(p => !p); break;
              case 'd': setActiveTool(null); setShowAssetManager(false); setShowTokenManager(false); setIsArchitectMode(false); setIsPlacingLights(false); setIsDrawingWalls(p => !p); break;
              case 'l': setActiveTool(null); setShowAssetManager(false); setShowTokenManager(false); setIsArchitectMode(false); setIsDrawingWalls(false); setIsPlacingLights(p => !p); break;
              case 't': setActiveTool(null); setShowAssetManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowTokenManager(p => !p); break;
              case 'm': setActiveTool(null); setShowTokenManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowAssetManager(p => !p); break;
          }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Shift') shiftHeldRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [role, selectedTokenIds, data, user, campaignCode, activeMapId, activeTool]);

  const handleNewBlankMap = async (skipConfirm = false) => {
      if (role !== 'dm') return;
      if (!skipConfirm) {
          if (!window.confirm("Create a new blank map? This will navigate away from the current map.")) return;
      }

      const newMapId = doc(collection(db, 'a')).id;
      const newMapData = {
          name: "New Blank Map",
          walls: generateBoundaryWalls(20, 1), // Add generated walls
          gridSize: 1,
          scale: 20,
          environment: 'day',
          tokens: {},
          lights: {}
      };
      await createMap(campaignCode, newMapId, newMapData);
      await updateCampaign({ activeMapId: newMapId });
  };

  const handleSetBackground = async (asset, closeManager = true) => {
    if (!campaignCode) return false;

    const assetUrl = asset.generatedMapUrl || asset.url;
    const assetName = asset.name;

    const mapsRef = collection(db, 'artifacts', appId, 'public', 'data', 'campaigns', campaignCode, 'maps');
    const q = query(mapsRef, where("backgroundUrl", "==", assetUrl));
    
    const querySnapshot = await getDocs(q);
    
    let isNew = false;

    if (!querySnapshot.empty) {
        const existingMap = querySnapshot.docs[0];
        const existingMapData = existingMap.data();
        await updateMap(campaignCode, existingMap.id, {
            heightmapUrl: asset.generatedHeightmapUrl || existingMap.data().heightmapUrl || null,
            normalMapUrl: asset.generatedNormalMapUrl || existingMap.data().normalMapUrl || null,
            walls: asset.generatedFeatures?.walls || existingMap.data().walls || {},
            lights: asset.generatedFeatures?.lights || existingMap.data().lights || {}
        });
        await updateCampaign({ activeMapId: existingMap.id });
    } else {
        isNew = true;
        const newMapId = doc(collection(db, 'a')).id;
        const defaultScale = 20; // Default scale for new maps

        let currentAspect = 1;
        if (assetUrl) {
            // Load image to get aspect ratio for boundary walls
            const img = new Image();
            img.src = assetUrl;
            await new Promise(resolve => {
                img.onload = () => {
                    currentAspect = img.width / img.height || 1;
                    resolve();
                };
                img.onerror = () => { console.warn("Failed to load image for aspect ratio, defaulting to 1."); resolve(); };
            });
        }
        const generatedBoundaryWalls = generateBoundaryWalls(defaultScale, currentAspect);
        const newMapData = {
            name: assetName ? assetName.replace(/\.[^/.]+$/, "") : "New Map",
            backgroundUrl: assetUrl,
            heightmapUrl: asset.generatedHeightmapUrl || null,
            normalMapUrl: asset.generatedNormalMapUrl || null,
            walls: { ...(asset.generatedFeatures?.walls || {}), ...generatedBoundaryWalls }, // Merge generated walls
            lights: asset.generatedFeatures?.lights || {},
            gridSize: 1,
            scale: 20,
            environment: 'day',
            tokens: {},
        };
        await createMap(campaignCode, newMapId, newMapData);
        await updateCampaign({ activeMapId: newMapId });
    }
    if (closeManager !== false) {
        setShowAssetManager(false);
    }
        return isNew;
  };


  const envSetting = ENV_SETTINGS[mapData?.environment || 'day'] || ENV_SETTINGS.day;
  const lightingMultiplier = mapData?.lightingIntensity ?? 1.0;

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative bg-slate-950 select-none [-webkit-touch-callout:none]" 
      style={{ display: 'block' }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => e.preventDefault()}
      onMouseMove={handleMouseMove}
    >
      <LoadingOverlay activeMapId={activeMapId} isMapDataReady={!!mapData && isAspectReady && (!mapData.heightmapUrl || !!terrainData)} />
      <Canvas 
        frameloop="always"
        camera={{ position: [0, 8, 8], fov: 50 }} 
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault(); // Prevent the default action which might be to simply lose the context
                console.warn('WebGL context lost. Attempting to restore...');
            });
            gl.domElement.addEventListener('webglcontextrestored', () => {
                console.info('WebGL context restored. Re-initializing...');
                setRemountKey(k => k + 1);
            });
        }}
        /* Clear selection and context menu when clicking the background void */
        onPointerMissed={(e) => {
          if (isDrawingWalls || isArchitectMode || isPlacingLights) return;
          // If a measurement tool is active, a missed click should clear it.
          if (activeTool) {
              setActiveTool(null);
              return;
          }
          if (e.target.tagName !== 'CANVAS') return;
          if (e.button === 2) return; // Don't clear selection on right-click so Marquee can work
          setSelectedTokenIds([]);
          setContextMenu(null);
          setWallContextMenu(null);
          setLightContextMenu(null);
        }}
        onContextMenu={(e) => { e.preventDefault(); }}
      >
        <DropZone onMapDrop={handleDrop} />
        {/* Explicitly set the 3D scene background color */}
        <color attach="background" args={[envSetting.bg]} />
        {envSetting.fog && <fog attach="fog" args={[envSetting.fog.color, envSetting.fog.near, envSetting.fog.far]} />}
        
        {/* Lighting setup */}
        <ambientLight color={envSetting.ambient.color} intensity={envSetting.ambient.intensity * lightingMultiplier} />
        <hemisphereLight color="#ffffff" groundColor="#444444" intensity={0.4 * lightingMultiplier} />
        <directionalLight color={envSetting.dir.color} position={envSetting.dir.position} intensity={envSetting.dir.intensity * lightingMultiplier} />
        
        <WeatherParticles 
            environment={mapData?.environment} 
            viewMode={viewMode} 
            mapScale={mapData?.scale || 20} 
            aspect={aspect} 
        />
        <PostProcessingEffects 
            environment={mapData?.environment} 
            lightingMultiplier={lightingMultiplier} 
        />

        <Suspense fallback={null}>
            <MeasurementTools 
                activeTool={activeTool} 
                getTerrainHeight={getTerrainHeight} 
                gridSize={gridSize} 
                tokens={tokensList}
                measurements={mapData?.measurements || {}}
                activeStyle={activeMeasurementStyle}
                onSaveMeasurement={(m) => {
                    const id = Date.now().toString();
                    updateMap(campaignCode, activeMapId, { [`measurements.${id}`]: { ...m, style: activeMeasurementStyle } });
                }}
                onDeleteMeasurement={(id) => {
                    updateMap(campaignCode, activeMapId, { [`measurements.${id}`]: null });
                }}
                onCompleteSelection={(ids) => {
                    setSelectedTokenIds(ids);
                    setActiveTool(null);
                }}
            />
        </Suspense>
        {/* Suspense is required when using useTexture to catch the loading state */}
        <Suspense fallback={null}>
            {mapData?.heightmapUrl ? (
                <Heightmap 
                    heightmapUrl={mapData.heightmapUrl}
                    backgroundUrl={mapData.backgroundUrl}
                    normalMapUrl={mapData.normalMapUrl}
                    heightScale={mapData.heightScale || 1}
                    scale={mapData.scale || 20}
                    aspect={aspect}
                />
            ) : (
                showPlane && <MapPlane backgroundUrl={mapData.backgroundUrl} scale={mapData.scale || 20} />
            )}
        </Suspense>

        <MarqueeSelector 
            tokens={role === 'dm' ? tokensList : tokensList.filter(t => visibleTokenIds.has(t.id))} 
            walls={mapData?.walls}
            lights={mapData?.lights}
            isDeleting={isDeleting}
            onSelectTokens={setSelectedTokenIds} 
            onSelectWalls={setSelectedWalls}
            onSelectLights={setSelectedLights}
        />

        {mapData?.showGrid !== false && (
            mapData?.heightmapUrl ? (
                <Suspense fallback={null}>
                    <DisplacedGrid 
                        mapData={mapData}
                        aspect={aspect}
                        resolvedHeightmapUrl={resolvedHeightmapUrl}
                        resolvedNormalMapUrl={resolvedNormalMapUrl}
                    />
                </Suspense>
            ) : (
                <Grid 
                  position={[mapData?.gridOffsetX || 0, 0.016, mapData?.gridOffsetY || 0]}
                  renderOrder={101}
                  infiniteGrid 
                  fadeDistance={60} 
                  sectionColor={mapData?.gridColor || "#888888"} 
                  cellColor={mapData?.gridColor || "#888888"} 
                  sectionThickness={mapData?.gridThickness || 1}
                  cellThickness={(mapData?.gridThickness || 1) * 0.5}
                  cellSize={gridSize}
                  sectionSize={gridSize}
                />
            )
        )}

        {/* Active Combat Tracker Integration */}
        <CombatCameraDirector activeTokenId={activeCombatantId} tokensList={tokensList} />
        
        {/* Render all tokens on the map */}
        {mapData && isAspectReady && (!mapData.heightmapUrl || terrainData) && tokensList.map(token => {
            if (role !== 'dm' && (!visibleTokenIds.has(token.id) || token.isHidden)) {
                return null; // Skip rendering if invisible
            }

            // Find the linked character if one exists
            const character = allCharacters.find(c => String(c.id) === String(token.characterId));
            const displayToken = { ...token };
            
            if (character) {
                displayToken.name = token.name || character.name;
                displayToken.image = character.image || token.image || token.img;
                displayToken.type = data?.players?.some(p => String(p.id) === String(character.id)) ? 'pc' : 'npc';
                displayToken.modelUrl = character.modelUrl;
                displayToken.modelScale = character.modelScale;
                displayToken.modelYOffset = character.modelYOffset;
                displayToken.conditions = character.conditions || token.conditions || [];
            } else {
                displayToken.image = token.image || token.img;
                displayToken.conditions = token.conditions || [];
            }
            
            // Fix CORS for token images in WebGL using a dedicated image proxy
            if (displayToken.image && displayToken.image.startsWith('http')) {
                let cleanUrl = displayToken.image;
                // Strip out old failing proxies if they were saved to the database
                if (cleanUrl.includes('corsproxy.io/?')) cleanUrl = decodeURIComponent(cleanUrl.split('corsproxy.io/?')[1] || cleanUrl);
                if (cleanUrl.includes('api.allorigins.win/raw?url=')) cleanUrl = decodeURIComponent(cleanUrl.split('api.allorigins.win/raw?url=')[1] || cleanUrl);
                if (cleanUrl.includes('api.allorigins.win/raw?url=')) cleanUrl = decodeURIComponent(cleanUrl.split('api.allorigins.win/raw?url=')[1] || cleanUrl);
                
                // Proxy external images (excluding Firebase) through wsrv.nl to force permissive CORS headers
                if (!cleanUrl.includes('firebasestorage.googleapis.com') && !cleanUrl.includes('wsrv.nl')) {
                    displayToken.image = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&cors=1`;
                } else {
                    displayToken.image = cleanUrl;
                }
            }
            
            const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || 
                            (token.ownerId && String(token.ownerId) === String(user?.uid));
            const myCharId = data?.assignments?.[user?.uid];
            const myCharAssigned = myCharId && String(token.characterId) === String(myCharId);
            const canControl = role === 'dm' || isOwner || myCharAssigned || token.isSharedControl;
            
            return (
                <Token3D 
                    key={token.id} 
                    token={displayToken} 
                    updateTokenPosition={handleUpdateTokenPosition}
                    gridSize={gridSize}
                    gridOffsetX={mapData?.gridOffsetX || 0}
                    gridOffsetY={mapData?.gridOffsetY || 0}
                    isSelected={selectedTokenIds.includes(token.id)}
                    onSelect={handleSelectToken}
                    onContextMenu={handleContextMenu}
                    role={role}
                    getTerrainHeight={getTerrainHeight}
                    isSnapToGrid={isSnapToGrid}
                    isTerrainReady={!mapData.heightmapUrl || !!terrainData}
                    draggedTokenId={draggedTokenId}
                    setDraggedTokenId={setDraggedTokenId}
                    viewMode={viewMode}
                    activeTool={activeTool}
                    showNameplates={showNameplates}
                    selectedTokenIds={selectedTokenIds}
                    groupDragData={groupDragData}
                    onGroupDragEnd={handleGroupDragEnd}
                    isActiveTurn={activeCombatantId === token.id}
                    canControl={canControl}
                    shiftHeldRef={shiftHeldRef}
                    tokenBaseOffset={mapData?.tokenElevationOffset ?? -0.04}
                />
            );
        })}

        <Walls 
            walls={mapData?.walls} 
            selectedWalls={selectedWalls}
            onWallContextMenu={isDeleting ? null : handleWallContextMenu} 
            onToggleDoor={handleToggleDoor} 
            showWalls={role === 'dm' && (isDrawingWalls || isArchitectMode || isDeleting)}
            role={role}
            playerDoorVisibility={mapData?.playerDoorVisibility}
            visibleDoorWindowIds={visibleDoorWindowIds} // Pass calculated visibility for doors/windows
            onDelete={isDeleting ? (wallId) => {
                const newWalls = { ...mapData.walls };
                delete newWalls[wallId];
                updateMap(campaignCode, activeMapId, { walls: newWalls });
            } : null}
        />

        {/* The Dynamic Fog of War layer */}
        {mapData && <GpuFogOfWar 
            key={`fow-${activeMapId}-${mapData?.scale}-${aspect}`}
            enabled={mapData?.fowEnabled} 
            fowWallsEnabled={mapData?.fowWallsEnabled}
            walls={mapData?.walls} 
            lights={combinedLights}
            gridSize={gridSize}
            mapData={mapData}
            aspect={aspect}
            resolvedHeightmapUrl={resolvedHeightmapUrl}
            playerVisionSources={playerVisionSources}
            role={role}
        />}

        <MapLights 
            lights={visibleLights} 
            selectedLights={selectedLights}
            onContextMenu={handleLightContextMenu} 
            role={role} 
            gridSize={gridSize} 
            showLightRadius={isPlacingLights || isDeleting} 
            onDelete={isDeleting && role === 'dm' ? (lightId) => {
                const newLights = { ...mapData.lights };
                delete newLights[lightId];
                updateMap(campaignCode, activeMapId, { lights: newLights });
            } : null}
        />

        <MapPings 
            pings={mapData?.pings || {}} 
            campaignCode={campaignCode} 
            activeMapId={activeMapId} 
            getTerrainHeight={getTerrainHeight}
            userColor={role === 'dm' ? "#ef4444" : "#3b82f6"}
        />

        {role === 'dm' && (
            <>
                <WallDrawingController
                    isEnabled={isDrawingWalls}
                    getTerrainHeight={getTerrainHeight}
                    onDrawEnd={(points) => {
                        const wallId = `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        const storablePoints = points.map(p => ({ x: p.x, y: p.y, z: p.z }));
                        updateMap(campaignCode, activeMapId, { [`walls.${wallId}`]: { id: wallId, type: drawingWallType, points: storablePoints } });
                    }}
                />
                <ArchitectPenController 
                    isEnabled={isArchitectMode}
                    getTerrainHeight={getTerrainHeight}
                    onCommitSegment={(start, end) => {
                        const wallId = `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        const storablePoints = [{ x: start.x, y: start.y, z: start.z }, { x: end.x, y: end.y, z: end.z }];
                        updateMap(campaignCode, activeMapId, { [`walls.${wallId}`]: { id: wallId, type: 'wall', points: storablePoints } });
                    }}
                />
                <LightPlacementController 
                    isEnabled={isPlacingLights}
                    getTerrainHeight={getTerrainHeight}
                    gridSize={gridSize}
                    onPlaceLight={(pt, radiusInMapUnits) => {
                        const lightId = `light_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        const radiusFt = Math.round((radiusInMapUnits / gridSize) * 5);
                        updateMap(campaignCode, activeMapId, { 
                            [`lights.${lightId}`]: { 
                                id: lightId, 
                                position: { x: pt.x, y: pt.y, z: pt.z }, 
                                color: '#fef08a', 
                                radius: radiusFt, 
                                intensity: 1.5 
                            } 
                        });
                    }}
                />
            </>
        )}

        {/* MapControls maps left-click to pan, right-click to rotate, scroll to zoom */}
        <MapControls 
          makeDefault 
          maxPolarAngle={Math.PI / 2 - 0.05} // Prevent camera from going under the board
          minDistance={1} // Limit max zoom in
          maxDistance={40} // Limit max zoom out
          enableDamping={true} // Smooth camera movements
          enableRotate={false}
        />
        <CameraController ref={cameraControllerRef} view={viewMode} />
        <ZoomHandler zoomRef={zoomRef} />
      </Canvas>

      <div className={`absolute top-4 left-4 vtt-safe-top vtt-safe-left z-[70] flex flex-col items-start gap-2 ${uiOpacityClass}`}>
        <div className="h-10 px-3 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg shadow-lg flex items-center gap-2 cursor-help" title={`Connected to Realm: ${campaignCode}`}>
            <div className="w-2 h-2 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] bg-green-500"></div>
            <span className="text-sm font-bold text-amber-500 fantasy-font tracking-widest">{campaignCode}</span>
        </div>
        <div className="flex gap-2">
            <button onClick={() => { cameraControllerRef.current?.reset(); }} className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all" title="Reset View">
              <Icon name="camera" size={18} />
            </button>
            <button onClick={() => setViewMode(prev => prev === 'isometric' ? 'top-down' : 'isometric')} className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all" title={viewMode === 'isometric' ? 'Switch to Top-Down (V)' : 'Switch to Isometric (V)'}>
              <Icon name={viewMode === 'isometric' ? 'layout-grid' : 'box'} size={18} />
            </button>
            <button onClick={toggleFullscreen} className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-amber-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all" title="Toggle Fullscreen">
              <Icon name={isFullscreen ? "minimize" : "maximize"} size={18} />
            </button>
        </div>
        <div className="flex gap-2">
            <button onClick={() => zoomRef.current?.zoomIn()} className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all" title="Zoom In">
              <Icon name="zoom-in" size={18} />
            </button>
            <button onClick={() => zoomRef.current?.zoomOut()} className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all" title="Zoom Out">
              <Icon name="zoom-out" size={18} />
            </button>
        </div>
      </div>

      <CombatRibbon combat={data?.campaign?.combat} updateCampaign={updateCampaign} tokens={tokensList} role={role} campaignData={data?.campaign} className={uiOpacityClass} />

      {showInitiativeTracker && (
          <CombatTrackerSidebar combat={data?.campaign?.combat} updateCampaign={updateCampaign} tokens={tokensList} role={role} campaignCode={campaignCode} activeMapId={activeMapId} campaignData={data?.campaign} allCharacters={allCharacters} data={data} onOpenSheet={onOpenSheet} className={uiOpacityClass} onClose={() => setShowInitiativeTracker(false)} />
      )}

      <div className={`absolute top-4 right-4 vtt-safe-top vtt-safe-right z-[70] flex flex-col items-end gap-3 ${uiOpacityClass}`}>
          <button 
              onClick={() => setIsToolbarOpen(p => !p)} 
              className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-amber-500 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full shadow-lg flex items-center justify-center transition-all z-[71]"
              title={isToolbarOpen ? "Collapse Toolbar" : "Expand Toolbar"}
          >
              <Icon name={isToolbarOpen ? "chevron-up" : "chevron-down"} size={20} />
          </button>

          <div className={`flex flex-col items-end gap-3 transition-all duration-300 origin-top ${isToolbarOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none absolute top-12 right-0'}`}>
            <div className="flex flex-col items-end gap-2">
                <div className="flex gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-1 rounded-full shadow-2xl">
                <ToolButton name="freehand" icon="pen-tool" isActive={activeTool === 'freehand' || activeTool === 'freehand-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setActiveTool(p => p === 'freehand' ? 'freehand-linger' : p === 'freehand-linger' ? null : 'freehand'); }} title="Draw" />
                <ToolButton name="ruler" icon="ruler" isActive={activeTool === 'ruler' || activeTool === 'ruler-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setActiveTool(p => p === 'ruler' ? 'ruler-linger' : p === 'ruler-linger' ? null : 'ruler'); }} />
                <ToolButton name="cone" icon="triangle" isActive={activeTool === 'cone' || activeTool === 'cone-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setActiveTool(p => p === 'cone' ? 'cone-linger' : p === 'cone-linger' ? null : 'cone'); }} />
                <ToolButton name="circle" icon="circle" isActive={activeTool === 'circle' || activeTool === 'circle-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setActiveTool(p => p === 'circle' ? 'circle-linger' : p === 'circle-linger' ? null : 'circle'); }} />
                <ToolButton name="box" icon="square" isActive={activeTool === 'box' || activeTool === 'box-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setActiveTool(p => p === 'box' ? 'box-linger' : p === 'box-linger' ? null : 'box'); }} />
            </div>
            
            {/* Template Style Picker */}
            {activeTool && activeTool.includes('-linger') && activeTool !== 'ruler-linger' && (
                <div className="flex gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-1 rounded-full shadow-2xl animate-in slide-in-from-top-2">
                    <ToolButton name="style-default" icon="mouse-pointer-2" isActive={activeMeasurementStyle === 'default'} onClick={() => setActiveMeasurementStyle('default')} title="Standard" />
                    <ToolButton name="style-fire" icon="flame" isActive={activeMeasurementStyle === 'fire'} onClick={() => setActiveMeasurementStyle('fire')} title="Fire" />
                    <ToolButton name="style-ice" icon="snowflake" isActive={activeMeasurementStyle === 'ice'} onClick={() => setActiveMeasurementStyle('ice')} title="Ice" />
                    <ToolButton name="style-web" icon="box-select" isActive={activeMeasurementStyle === 'web'} onClick={() => setActiveMeasurementStyle('web')} title="Web" />
                    <ToolButton name="style-poison" icon="skull" isActive={activeMeasurementStyle === 'poison'} onClick={() => setActiveMeasurementStyle('poison')} title="Poison" />
                    <ToolButton name="style-radiant" icon="sun" isActive={activeMeasurementStyle === 'radiant'} onClick={() => setActiveMeasurementStyle('radiant')} title="Radiant" />
                </div>
            )}

            {role === 'dm' && (
                <div className="flex gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-1 rounded-full shadow-2xl">
                    <ToolButton name="architect" icon="pen-tool" isActive={isArchitectMode} onClick={() => { setActiveTool(null); setIsDrawingWalls(false); setIsPlacingLights(false); setIsArchitectMode(p => !p); }} />
                    
                    <ToolButton name="draw" icon="pencil" isActive={isDrawingWalls} onClick={() => { setActiveTool(null); setIsArchitectMode(false); setIsPlacingLights(false); setIsDrawingWalls(p => !p); }} />
                    {isDrawingWalls && (
                        <div className="flex gap-1 border-l border-slate-600 pl-1 ml-1 mr-1">
                            <ToolButton name="wall" icon="square" isActive={drawingWallType === 'wall'} onClick={() => setDrawingWallType('wall')} title="Wall" />
                            <ToolButton name="door" icon="door-closed" isActive={drawingWallType === 'door'} onClick={() => setDrawingWallType('door')} title="Door" />
                            <ToolButton name="window" icon="layout" isActive={drawingWallType === 'window'} onClick={() => setDrawingWallType('window')} title="Window" />
                        </div>
                    )}

                    <ToolButton name="light" icon="lightbulb" isActive={isPlacingLights} onClick={() => { setActiveTool(null); setIsArchitectMode(false); setIsDrawingWalls(false); setIsPlacingLights(p => !p); }} />
                    
                    <ToolButton name="delete" icon="trash-2" isActive={isDeleting} onClick={() => {
                        if (isDeleting && (selectedWalls.length > 0 || selectedLights.length > 0 || selectedTokenIds.length > 0)) {
                            let wallsObj = { ...mapData?.walls };
                            let lightsObj = { ...mapData?.lights };
                            let tokensObj = { ...mapData?.tokens };
                            let changed = false;

                            if (selectedWalls.length > 0) {
                                selectedWalls.forEach(id => delete wallsObj[id]);
                                changed = true;
                            }
                            if (selectedLights.length > 0) {
                                selectedLights.forEach(id => delete lightsObj[id]);
                                changed = true;
                            }
                            if (selectedTokenIds.length > 0) {
                                selectedTokenIds.forEach(id => delete tokensObj[id]);
                                changed = true;
                            }

                            if (changed) {
                                updateMap(campaignCode, activeMapId, { walls: wallsObj, lights: lightsObj, tokens: tokensObj });
                                setSelectedWalls([]);
                                setSelectedLights([]);
                                setSelectedTokenIds([]);
                            }
                        } else {
                            setActiveTool(null); setIsArchitectMode(false); setIsDrawingWalls(false); setIsPlacingLights(false); 
                            setIsDeleting(p => {
                                if (p) {
                                    setSelectedWalls([]);
                                    setSelectedLights([]);
                                }
                                return !p;
                            });
                        }
                    }} />
                </div>
            )}
        </div>

        {role === 'dm' && (
            <div className="flex flex-col gap-2">
                <ToolButton name="tokens" icon="users" isActive={showTokenManager} onClick={() => { setActiveTool(null); setShowAssetManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowTokenManager(p => !p); }} isStandalone={true} />
                <ToolButton name="map" icon="map" isActive={showAssetManager} onClick={() => { setActiveTool(null); setShowTokenManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowAssetManager(p => !p); }} isStandalone={true} />
                <ToolButton 
                    name="Combat Tracker" 
                    icon="swords" 
                    isActive={showInitiativeTracker} 
                    onClick={() => {
                        if (!data?.campaign?.combat?.active) {
                            updateCampaign({ 'campaign.combat.active': true });
                        }
                        setShowInitiativeTracker(p => !p);
                    }} 
                    isStandalone={true} 
                />
            </div>
        )}

        <div className="w-8 h-px bg-slate-700/50 my-1 mr-1"></div>

            <div className="flex flex-col gap-2">
                {onOpenDiceTray && <ToolButton name="Dice" icon="dices" onClick={onOpenDiceTray} isStandalone={true} />}
                {onOpenHandouts && <ToolButton name="Handouts" icon="scroll" onClick={onOpenHandouts} isStandalone={true} />}
                {onOpenChat && <ToolButton name="Chat" icon="message-circle" onClick={onOpenChat} isStandalone={true} />}
                {onOpenJournal && <ToolButton name="Journal" icon="book" onClick={onOpenJournal} isStandalone={true} />}
            </div>
          </div>
      </div>

      {/* Actors Manager Drawer */}
      {showTokenManager && role === 'dm' && (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex-none p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-indigo-500 flex items-center gap-2"><Icon name="users" size={18} /> Actors</h3>
                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                        <button onClick={() => setActorViewMode('grid')} className={`p-1 rounded ${actorViewMode === 'grid' ? 'bg-slate-700 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="layout-grid" size={14}/></button>
                        <button onClick={() => setActorViewMode('list')} className={`p-1 rounded ${actorViewMode === 'list' ? 'bg-slate-700 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="list" size={14}/></button>
                    </div>
                    <button onClick={() => setShowTokenManager(false)} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18} /></button>
                </div>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-4 space-y-6">
                <div>
                  <h4 className="text-xs uppercase font-bold text-slate-500 mb-3 tracking-wider">Party</h4>
                  <div className={actorViewMode === 'grid' ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2"}>
                      {data?.players?.map((p, i) => (
                          actorViewMode === 'grid' ? (
                              <div key={`pc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: p.id, name: p.name, type: 'pc', image: p.image });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="aspect-square bg-slate-800 rounded-lg border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-green-500 transition-colors relative group shadow-lg"
                              >
                                  {p.image ? (
                                    <img src={p.image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={p.name} draggable={false} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-slate-600 bg-slate-700 opacity-80 group-hover:opacity-100 transition-opacity">{p.name?.[0] || '?'}</div>
                                  )}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-4 pb-1 px-2 text-[10px] font-bold text-white truncate pointer-events-none text-center shadow-black drop-shadow-md">{p.name}</div>
                                  {/* <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(p, false); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md shadow-lg transition-all z-10" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button> */}
                              </div>
                          ) : (
                              <div key={`pc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: p.id, name: p.name, type: 'pc', image: p.image });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="flex items-center gap-3 bg-slate-800 rounded-lg border border-slate-700 p-2 cursor-grab active:cursor-grabbing hover:border-green-500 transition-colors group shadow-lg"
                              >
                                  <div className="w-10 h-10 rounded bg-slate-700 shrink-0 overflow-hidden relative">
                                      {p.image ? <img src={p.image} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{p.name?.[0] || '?'}</div>}
                                  </div>
                                  <div className="flex-1 min-w-0 font-bold text-sm text-slate-200 truncate">{p.name}</div>
                                  {/* <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(p, false); }} className="opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded shadow-lg transition-all" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button> */}
                              </div>
                          )
                      ))}
                      {(!data?.players || data.players.length === 0) && <div className="col-span-2 text-slate-500 text-xs text-center italic">No players found.</div>}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider">Bestiary</h4>
                      <button onClick={() => setShowCompendium(true)} className="text-[10px] bg-blue-900/40 text-blue-400 hover:text-blue-300 hover:bg-blue-900/60 border border-blue-800/50 px-2 py-0.5 rounded flex items-center gap-1 transition-colors">
                          <Icon name="book" size={12}/> 5e API
                      </button>
                  </div>
                  <div className={actorViewMode === 'grid' ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2"}>
                      {data?.npcs?.map((n, i) => (
                          actorViewMode === 'grid' ? (
                              <div key={`npc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: n.id, name: n.name, type: 'npc', image: n.image, size: n.size || 1, hp: n.hp });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="aspect-square bg-slate-800 rounded-lg border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-red-500 transition-colors relative group shadow-lg"
                              >
                                  {n.image ? (
                                    <img src={n.image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={n.name} draggable={false} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-slate-600 bg-slate-700 opacity-80 group-hover:opacity-100 transition-opacity">{n.name?.[0] || '?'}</div>
                                  )}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-4 pb-1 px-2 text-[10px] font-bold text-white truncate pointer-events-none text-center shadow-black drop-shadow-md">{n.name}</div>
                                  {/* <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(n, true); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md shadow-lg transition-all z-10" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button> */}
                              </div>
                          ) : (
                              <div key={`npc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: n.id, name: n.name, type: 'npc', image: n.image, size: n.size || 1, hp: n.hp });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="flex items-center gap-3 bg-slate-800 rounded-lg border border-slate-700 p-2 cursor-grab active:cursor-grabbing hover:border-red-500 transition-colors group shadow-lg"
                              >
                                  <div className="w-10 h-10 rounded bg-slate-700 shrink-0 overflow-hidden relative">
                                      {n.image ? <img src={n.image} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{n.name?.[0] || '?'}</div>}
                                  </div>
                                  <div className="flex-1 min-w-0 font-bold text-sm text-slate-200 truncate">{n.name}</div>
                                  {/* <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(n, true); }} className="opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded shadow-lg transition-all" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button> */}
                              </div>
                          )
                      ))}
                      {(!data?.npcs || data.npcs.length === 0) && <div className="col-span-2 text-slate-500 text-xs text-center italic">No enemies found.</div>}
                  </div>
                </div>
            </div>
        </div>
      )}

      {/* Asset Manager Drawer */}
      {showAssetManager && role === 'dm' && (
        <AssetManager 
          campaignCode={campaignCode} 
          mapData={mapData}
          activeMapId={activeMapId}
          updateMap={updateMap}
          onClose={() => setShowAssetManager(false)} 
          onSetBackground={handleSetBackground}
          onSetHeightmap={(url) => updateMap(campaignCode, activeMapId, { heightmapUrl: url })}
          onGenerateMap={({ backgroundUrl, heightmapUrl, features, prompt }) => {
              updateMap(campaignCode, activeMapId, {
                  backgroundUrl,
                  heightmapUrl,
                  walls: features.walls || {},
                  lights: features.lights || {},
                  prompt: prompt || ''
              });
          }}
          onNewBlankMap={handleNewBlankMap}
        />
      )}

      {/* Context Menu Overlay */}
      {contextMenu && (
        <>
          {/* Invisible backdrop to catch clicks outside the menu */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setContextMenu(null)} 
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          ></div>
          
          <div 
            ref={tokenMenuRef}
            className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[150px] overflow-hidden"
            style={{ top: tokenMenuDisplayPosition.y, left: tokenMenuDisplayPosition.x, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto' }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {contextMenu.characterId && onOpenSheet && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors"
                onClick={() => {
                  if (onOpenSheet) {
                      const token = tokensList.find(t => t.id === contextMenu.tokenId);
                      const char = allCharacters.find(c => String(c.id) === String(contextMenu.characterId));
                      const hp = token?.hp?.current ?? char?.hp?.current ?? null;
                      const maxHp = token?.hp?.max ?? char?.hp?.max ?? null;
                      onOpenSheet({ isToken: true, tokenId: contextMenu.tokenId, characterId: contextMenu.characterId, hp, maxHp });
                  }
                  setContextMenu(null);
                }}
              >
                Open Sheet
              </button>
            )}
            
            {/* Reset Elevation is only visible if the token is currently flying */}
            {Math.abs(contextMenu.elevationOffset || 0) > 0.01 && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-blue-400 font-bold"
                onClick={() => {
                  updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.elevationOffset`]: 0 });
                  setContextMenu(null);
                }}
              >
                Reset Elevation
              </button>
            )}

            {role === 'dm' && (
              <>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors"
                  onClick={() => {
                    const currentName = contextMenu.name || "Token";
                    const newName = window.prompt("Enter new token name:", currentName);
                    if (newName) { // check for null (cancel)
                        updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.name`]: newName });
                    }
                    setContextMenu(null);
                  }}
                >
                  Rename Token
                </button>

                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-green-400 font-bold"
                  onClick={() => {
                    const idsToToggle = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 
                        ? selectedTokenIds 
                        : [contextMenu.tokenId];
                    const updates = {};
                    idsToToggle.forEach(id => {
                        updates[`tokens.${id}.isSharedControl`] = !contextMenu.isSharedControl;
                    });
                    updateMap(campaignCode, activeMapId, updates);
                    setContextMenu(null);
                  }}
                >
                  <Icon name="unlock" size={14} className="inline mr-2"/>
                  {contextMenu.isSharedControl ? "Revoke Shared Control" : "Allow Shared Control"}
                </button>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-amber-400 font-bold"
                  onClick={() => {
                    const idsToRoll = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 
                        ? selectedTokenIds 
                        : [contextMenu.tokenId];
                    rollGroupInitiative(idsToRoll);
                    setContextMenu(null);
                  }}
                >
                  <Icon name="sword" size={14} className="inline mr-2"/>
                  {selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? `Roll Group Initiative` : "Roll Initiative"}
                </button>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors"
                  onClick={() => {
                    updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.isHidden`]: !contextMenu.isHidden });
                    setContextMenu(null);
                  }}
                >
                  {contextMenu.isHidden ? "Reveal to Players" : "Hide from Players"}
                </button>
              </>
            )}

            {contextMenu.canControl && (
              <>
                {(() => {
                    const setTokenLight = (radius, color) => {
                        const updates = {};
                        const ids = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                        ids.forEach(id => updates[`tokens.${id}.light`] = radius ? { radius, color } : null);
                        updateMap(campaignCode, activeMapId, updates);
                        setContextMenu(null);
                    };
                    return (
                        <>
                            <div className="border-t border-slate-700 my-1"></div>
                            <div className="px-4 py-1 text-xs uppercase font-bold text-slate-500">Light Source</div>
                            <div className="flex flex-wrap gap-1 px-4 py-1 mb-1">
                                <button onClick={() => setTokenLight(0, null)} className="p-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-500 rounded text-xs transition-colors" title="None">🌑</button>
                                <button onClick={() => setTokenLight(5, '#fef08a')} className="p-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-amber-500 rounded text-xs transition-colors" title="Candle (5ft)">🕯️</button>
                                <button onClick={() => setTokenLight(20, '#fb923c')} className="p-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-orange-500 rounded text-xs transition-colors" title="Torch (20ft)">🏮</button>
                                <button onClick={() => setTokenLight(30, '#fde047')} className="p-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-yellow-400 rounded text-xs transition-colors" title="Lantern (30ft)">💡</button>
                                <button onClick={() => setTokenLight(20, '#22d3ee')} className="p-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-cyan-400 rounded text-xs transition-colors" title="Light Spell (20ft)">❇️</button>
                            </div>
                        </>
                    );
                })()}

                <div className="border-t border-slate-700 my-1"></div>
                <div className="flex items-center justify-between px-4 py-1">
                    <span className="text-xs font-bold text-slate-400">Elevation</span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => {
                            const token = mapData.tokens[contextMenu.tokenId];
                            if (!token) return;
                            const newElevation = (token.elevationOffset || 0) - 1;
                            const terrainY = getTerrainHeight(token.x, token.z);
                            const tokenBaseOffset = mapData?.tokenElevationOffset ?? -0.04;
                            const newY = terrainY + newElevation + tokenBaseOffset;
                            updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.elevationOffset`]: newElevation, [`tokens.${contextMenu.tokenId}.y`]: newY });
                            setContextMenu(prev => ({ ...prev, elevationOffset: newElevation }));
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="minus" size={12}/></button>
                        <span className="text-sm font-bold w-12 text-center tabular-nums">{Math.round((contextMenu.elevationOffset || 0) * 5)} ft</span>
                        <button onClick={() => {
                            const token = mapData.tokens[contextMenu.tokenId];
                            if (!token) return;
                            const newElevation = (token.elevationOffset || 0) + 1;
                            const terrainY = getTerrainHeight(token.x, token.z);
                            const tokenBaseOffset = mapData?.tokenElevationOffset ?? -0.04;
                            const newY = terrainY + newElevation + tokenBaseOffset;
                            updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.elevationOffset`]: newElevation, [`tokens.${contextMenu.tokenId}.y`]: newY });
                            setContextMenu(prev => ({ ...prev, elevationOffset: newElevation }));
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="plus" size={12}/></button>
                    </div>
                </div>

                <div className="border-t border-slate-700 my-1"></div>
                <div className="flex items-center justify-between px-4 py-1">
                    <span className="text-xs font-bold text-slate-400">Ring Color</span>
                    <input 
                        type="color" 
                        value={contextMenu.color || (contextMenu.type === 'pc' ? "#22c55e" : "#ef4444")}
                        onChange={(e) => {
                            const newColor = e.target.value;
                            updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.color`]: newColor });
                            setContextMenu({ ...contextMenu, color: newColor }); // Keep menu open and update color instantly
                        }}
                        className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-slate-800"
                    />
                </div>
                <div className="border-t border-slate-700 my-1"></div>
                <div className="flex items-center justify-between px-4 py-1">
                    <span className="text-xs font-bold text-slate-400">Size</span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => {
                            const newSize = Math.max(0.5, (contextMenu.size || 1) - 0.5);
                            updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.size`]: newSize });
                            setContextMenu({ ...contextMenu, size: newSize }); // Keeps menu open!
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="minus" size={12}/></button>
                        <span className="text-sm font-bold w-6 text-center tabular-nums">{contextMenu.size || 1}</span>
                        <button onClick={() => {
                            const newSize = (contextMenu.size || 1) + 0.5;
                            updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.size`]: newSize });
                            setContextMenu({ ...contextMenu, size: newSize }); // Keeps menu open!
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="plus" size={12}/></button>
                    </div>
                </div>
              </>
            )}
            
            {role === 'dm' && (
              <>
                <div className="border-t border-slate-700 my-1"></div>
                
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors"
                  onClick={() => {
                    const updates = {};
                    if (selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1) {
                        selectedTokenIds.forEach(id => {
                            updates[`tokens.${id}`] = null;
                        });
                        setSelectedTokenIds([]);
                    } else {
                        updates[`tokens.${contextMenu.tokenId}`] = null;
                    }
                    updateMap(campaignCode, activeMapId, updates);
                    setContextMenu(null);
                  }}
                >
                  {selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? `Delete Selected (${selectedTokenIds.length})` : "Delete Token"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {wallContextMenu && (
        <>
            <div 
                className="fixed inset-0 z-40" 
                onClick={() => setWallContextMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setWallContextMenu(null); }}
            ></div>
            <div 
                ref={wallMenuRef}
                className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[150px] overflow-hidden"
                style={{ top: wallMenuDisplayPosition.y, left: wallMenuDisplayPosition.x, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto' }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="text-xs uppercase font-bold text-slate-500 px-4 py-1">Set Type</div>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-red-400"
                    onClick={() => {
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}.type`]: 'wall' });
                        setWallContextMenu(null);
                    }}
                >
                    Make Wall
                </button>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-blue-400"
                    onClick={() => {
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}.type`]: 'door' });
                        setWallContextMenu(null);
                    }}
                >
                    Make Door
                </button>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-cyan-400"
                    onClick={() => {
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}.type`]: 'window' });
                        setWallContextMenu(null);
                    }}
                >
                    Make Window
                </button>
                <div className="border-t border-slate-700 my-1"></div>
                <button
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-cyan-400"
                    onClick={() => {
                        const wall = mapData.walls[wallContextMenu.wallId];
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}.isSecret`]: !wall?.isSecret });
                        setWallContextMenu(null);
                    }}
                >
                    {mapData.walls[wallContextMenu.wallId]?.isSecret ? 'Make Not Secret' : 'Make Secret'}
                </button>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors"
                    onClick={() => {
                        const newWalls = { ...mapData.walls };
                        delete newWalls[wallContextMenu.wallId];
                        updateMap(campaignCode, activeMapId, { walls: newWalls });
                        setWallContextMenu(null);
                    }}
                >
                    Delete Wall
                </button>
            </div>
        </>
      )}

      {lightContextMenu && (
        <>
            <div 
                className="fixed inset-0 z-40" 
                onClick={() => setLightContextMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setLightContextMenu(null); }}
            ></div>
            <div 
                ref={lightMenuRef}
                className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[200px] overflow-hidden"
                style={{ top: lightMenuDisplayPosition.y, left: lightMenuDisplayPosition.x, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto' }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="text-xs uppercase font-bold text-slate-500 px-4 py-1 flex justify-between items-center">
                    Light Source
                    <button onClick={() => setLightContextMenu(null)} className="text-slate-400 hover:text-white"><Icon name="x" size={14}/></button>
                </div>
                <div className="border-t border-slate-700 my-1"></div>
                
                <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-slate-300 text-xs font-bold">Color</span>
                    <input 
                        type="color" 
                        value={mapData.lights[lightContextMenu.lightId]?.color || '#fef08a'} 
                        onChange={(e) => {
                            updateMap(campaignCode, activeMapId, { [`lights.${lightContextMenu.lightId}.color`]: e.target.value });
                        }}
                        className="w-8 h-8 rounded cursor-pointer bg-slate-900 border border-slate-700 p-0.5"
                    />
                </div>

                <div className="px-4 py-2">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-300 text-xs font-bold">Radius (ft)</span>
                        <span className="text-xs text-amber-500 font-bold tabular-nums">{mapData.lights[lightContextMenu.lightId]?.radius || 30}</span>
                    </div>
                    <input 
                        type="range" 
                        min="5" 
                        max="120" 
                        step="5" 
                        value={mapData.lights[lightContextMenu.lightId]?.radius || 30} 
                        onChange={(e) => {
                            updateMap(campaignCode, activeMapId, { [`lights.${lightContextMenu.lightId}.radius`]: Number(e.target.value) });
                        }}
                        className="w-full accent-amber-500"
                    />
                </div>
                
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors flex items-center gap-2"
                    onClick={() => {
                        const newLights = { ...mapData.lights };
                        delete newLights[lightContextMenu.lightId];
                        updateMap(campaignCode, activeMapId, { lights: newLights });
                        setLightContextMenu(null);
                    }}
                >
                    <Icon name="trash-2" size={14}/> Delete Light
                </button>
            </div>
        </>
      )}

      {showCompendium && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="max-w-xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                      <h3 className="font-bold text-white flex items-center gap-2"><Icon name="globe" size={18}/> D&D 5e API Search</h3>
                      <button onClick={() => setShowCompendium(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                  </div>
                  <div className="p-4 border-b border-slate-700">
                      <div className="flex gap-2">
                          <input autoFocus value={compendiumSearch} onChange={(e) => setCompendiumSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCompendium()} placeholder="Search (e.g. Owlbear, Lich)..." className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500 select-text"/>
                          <button onClick={searchCompendium} disabled={isLoadingCompendium} className="bg-blue-600 hover:bg-blue-500 px-4 rounded text-white font-bold">{isLoadingCompendium ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}</button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900 custom-scroll">
                      {compendiumResults.map(r => (
                          <div key={r.index} onClick={() => importFromApi(r.url)} className="p-3 bg-slate-800 border border-slate-700 rounded hover:border-blue-500 cursor-pointer flex justify-between items-center group">
                              <div className="font-bold text-white group-hover:text-blue-400 capitalize">{r.name}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1 group-hover:text-blue-300">Import <Icon name="download" size={14}/></div>
                          </div>
                      ))}
                      {compendiumResults.length === 0 && !isLoadingCompendium && <div className="text-center text-slate-500 py-8 italic">Search for a creature to begin.</div>}
                  </div>
              </div>
          </div>
      )}

      {showModelPicker && pendingNpc && (
          <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                      <h3 className="font-bold text-white flex items-center gap-2"><Icon name="box" size={18}/> Select 3D Mini: {pendingNpc.name}</h3>
                      <button onClick={() => { setPendingNpc(null); setShowModelPicker(false); }} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                  </div>
                  <div className="p-4 border-b border-slate-700 bg-slate-900 flex gap-2">
                      <input 
                          autoFocus
                          value={miniSearchQuery} 
                          onChange={e => setMiniSearchQuery(e.target.value)} 
                          onKeyDown={e => e.key === 'Enter' && handleMiniSearch()}
                          placeholder="Search 3D Models (e.g. Dragon, Goblin)..." 
                          className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-amber-500 select-text"
                      />
                      <button 
                          onClick={() => handleMiniSearch()} 
                          disabled={isSearchingMinis} 
                          className="bg-amber-600 hover:bg-amber-500 px-4 rounded text-white font-bold flex items-center justify-center"
                      >
                          {isSearchingMinis ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scroll bg-slate-950 flex-1">
                      {isSearchingMinis ? (
                          <div className="text-center py-10 text-amber-500"><Icon name="loader" size={32} className="animate-spin mx-auto mb-2"/> Searching the Repository...</div>
                      ) : (
                          <>
                              <p className="text-slate-400 mb-4 text-sm">We found {availableModels.length} compatible 3D models.</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {availableModels.map((model, i) => (
                              <div key={i} onClick={() => handleModelSelect(model)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 cursor-pointer hover:border-amber-500 hover:bg-slate-700 transition-all group">
                                  <div className="aspect-square bg-slate-900 rounded-md mb-2 overflow-hidden border border-slate-700 group-hover:border-amber-500/50 relative">
                                      {model.thumb ? <img src={model.thumb} className="w-full h-full object-cover" /> : <Icon name="box" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600"/>}
                                  </div>
                                  <div className="font-bold text-sm text-slate-200 group-hover:text-amber-400 truncate">{model.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate">Scale: {model.scale}x</div>
                              </div>
                          ))}
                          
                          <div onClick={() => handleModelSelect(null)} className="bg-slate-800 border border-slate-700 border-dashed rounded-lg p-2 cursor-pointer hover:border-blue-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center">
                              <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-slate-700 group-hover:border-blue-500/50">
                                  <Icon name="image" size={24} className="text-slate-500 group-hover:text-blue-400"/>
                              </div>
                              <div className="font-bold text-sm text-slate-200 group-hover:text-blue-400 text-center">2D Token Only</div>
                              <div className="text-[10px] text-slate-500 text-center">Skip 3D Model</div>
                          </div>
                      </div>
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
});