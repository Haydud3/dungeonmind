import React, { useState, useEffect, Suspense, useRef, useCallback, useMemo, lazy } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, Grid, useTexture, DragControls, Html, useCursor, Line, Text, RoundedBox, Billboard, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { subscribeToMap, updateMap, createMap } from '../utils/mapService';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { useCharacterStore } from '../stores/useCharacterStore';
const AssetManager = lazy(() => import('./AssetManager'));
const MeasurementTools = lazy(() => import('./MeasurementTools').then(m => ({ default: m.MeasurementTools })));
import Icon from './Icon';
import { retrieveChunkedMap, storeChunkedMap, deleteChunkedMap } from '../utils/storageUtils';
const Token3D = lazy(() => import('./tactical/Token').then(m => ({ default: m.default })));
const MapProp = lazy(() => import('./tactical/MapProp').then(m => ({ default: m.default })));
import CameraController from '../utils/CameraController';
import { collection, doc, query, where, getDocs } from 'firebase/firestore';
import { db, rtdb, appId } from '../firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { searchGithubModels } from '../utils/miniManifest';

import { ENV_SETTINGS } from '../constants/environment';
import { segmentsIntersect } from '../utils/mathUtils';
import { checkLineOfSight } from '../utils/losUtils';
import { useResolvedUrl } from '../utils/useResolvedUrl';

const MapPlane = lazy(() => import('./3d/MapPlane').then(m => ({ default: m.MapPlane })));

const MarqueeSelector = lazy(() => import('./3d/MarqueeSelector').then(m => ({ default: m.MarqueeSelector })));

const Heightmap = lazy(() => import('./3d/Heightmap').then(m => ({ default: m.Heightmap })));

const Walls = lazy(() => import('./3d/Walls').then(m => ({ default: m.Walls })));

const CombatTrackerSidebar = lazy(() => import('./ui/CombatTrackerSidebar').then(m => ({ default: m.CombatTrackerSidebar })));
const CombatRibbon = lazy(() => import('./ui/CombatTrackerSidebar').then(m => ({ default: m.CombatRibbon })));

const CombatCameraDirector = lazy(() => import('./3d/CombatCameraDirector').then(m => ({ default: m.CombatCameraDirector })));
const ArchitectPenController = lazy(() => import('./3d/controllers/ArchitectPenController').then(m => ({ default: m.ArchitectPenController })));
const LightPlacementController = lazy(() => import('./3d/controllers/LightPlacementController').then(m => ({ default: m.LightPlacementController })));
const MapLights = lazy(() => import('./3d/MapLights').then(m => ({ default: m.MapLights })));
const MapPings = lazy(() => import('./3d/MapPings').then(m => ({ default: m.MapPings })));

const GpuFogOfWar = lazy(() => import('./3d/GpuFogOfWar').then(m => ({ default: m.GpuFogOfWar })));

const ZoomHandler = lazy(() => import('./3d/ZoomHandler').then(m => ({ default: m.ZoomHandler })));
const WallDrawingController = lazy(() => import('./3d/controllers/WallDrawingController').then(m => ({ default: m.WallDrawingController })));
const StampingController = lazy(() => import('./3d/controllers/StampingController').then(m => ({ default: m.StampingController })));
const TerrainSculptorController = lazy(() => import('./3d/controllers/TerrainSculptorController').then(m => ({ default: m.TerrainSculptorController })));
const MaterialPainterController = lazy(() => import('./3d/controllers/MaterialPainterController').then(m => ({ default: m.MaterialPainterController })));
const WeatherParticles = lazy(() => import('./3d/WeatherParticles').then(m => ({ default: m.WeatherParticles })));
const AmbientEcosystem = lazy(() => import('./3d/AmbientEcosystem').then(m => ({ default: m.AmbientEcosystem })));
const PostProcessingEffects = lazy(() => import('./3d/PostProcessingEffects').then(m => ({ default: m.PostProcessingEffects })));
import { DropZone } from './ui/DropZone';
const DisplacedGrid = lazy(() => import('./3d/DisplacedGrid').then(m => ({ default: m.DisplacedGrid })));
import { ToolButton } from './ui/ToolButton';

// Helper: UI images to avoid CORS issues natively
const getProxiedImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http') && !url.includes('firebasestorage.googleapis.com') && !url.includes('wsrv.nl')) {
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}&cors=1`;
    }
    return url;
};

// Helper: Error boundary to prevent broken textures from crashing the canvas
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
        console.warn("3D Asset Error Caught:", error, errorInfo);
    }
    render() {
        return this.state.hasError ? (this.props.fallback || null) : this.props.children;
    }
}

const LoadingOverlay = ({ activeMapId, isMapDataReady }) => {
    const { active, progress, loaded, total } = useProgress();
    const [prevMapId, setPrevMapId] = useState(activeMapId);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    if (activeMapId !== prevMapId) {
        setPrevMapId(activeMapId);
        setIsInitialLoad(true);
    }

    useEffect(() => {
        if (isInitialLoad && isMapDataReady && !active) {
            const timer = setTimeout(() => setIsInitialLoad(false), 500);
            return () => clearTimeout(timer);
        }
    }, [isInitialLoad, isMapDataReady, active]);
    
    const showFullscreen = isInitialLoad || !isMapDataReady;
    const showMini = !showFullscreen && active;

    return (
        <>
            {/* Fullscreen Overlay for Initial Load */}
            <div className={`absolute inset-0 z-50 flex items-center justify-center bg-slate-950 text-white transition-opacity duration-500 ${showFullscreen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
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

            {/* Mini Loader for Subsequent Asset Loads */}
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-2 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-full shadow-2xl transition-all duration-500 ${showMini ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                <Icon name="loader" size={16} className="text-amber-500 animate-spin" />
                <span className="text-xs font-bold text-slate-300 font-mono tracking-wider">
                    Downloading... {loaded}/{total || 1}
                </span>
            </div>
        </>
    );
};

const ViewManager = React.memo(({ aspect, scale, orientation, fitTrigger }) => {
    const { camera } = useThree();
    const controls = useThree(state => state.controls);
    
    useEffect(() => {
        if (!controls || !fitTrigger) return;

        const fitLogic = () => {
            // When orientation is 90 or 270 degrees, the map is effectively rotated.
            // We need to swap width and height for fitting calculations.
            const isPortraitOrientation = orientation % 2 !== 0;
            const mapWidth = scale * aspect;
            const mapHeight = scale;

            const fov = camera.fov * (Math.PI / 180);
            const currentAspect = camera.aspect;
            
            // The dimension that needs to fit the viewport's height is now mapWidth, and vice-versa.
            const distanceForHeight = (isPortraitOrientation ? mapWidth : mapHeight) / (2 * Math.tan(fov / 2));
            const distanceForWidth = (isPortraitOrientation ? mapHeight : mapWidth) / (2 * currentAspect * Math.tan(fov / 2));
            
            const targetDistance = Math.max(distanceForHeight, distanceForWidth); // Fit exactly
            
            controls.target.set(0, 0, 0);
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            camera.position.copy(controls.target).addScaledVector(direction, -targetDistance);
            controls.update();
        };

        // The orientation update has a 100ms timeout. We wait slightly longer to ensure rotation is complete.
        const timeout = setTimeout(fitLogic, 150);
        return () => clearTimeout(timeout);

    }, [fitTrigger, scale, aspect, camera, controls, orientation]);

    useEffect(() => {
        if (controls) {
            const timeout = setTimeout(() => {
                controls.setAzimuthalAngle(orientation * (Math.PI / 2));
                controls.update();
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [orientation, controls]);

    return null;
});

export default React.memo(function TacticalMapView({ campaignCode, activeMapId, onOpenSheet, role, onOpenHandouts, onOpenChat, onOpenJournal, onOpenDiceTray, onOpenCast, isCastMode: propIsCastMode, onBack }) {
  const isCastMode = propIsCastMode || (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('cast') === 'true' || window.location.hash.includes('cast=true')));
  const isLowPerformance = typeof window !== 'undefined' && localStorage.getItem('vtt_low_performance') === 'true';
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
      if (data?.campaign?.combat?.active && !isCastMode) {
          setShowInitiativeTracker(true);
      }
  }, [data?.campaign?.combat?.active, isCastMode]);

  const [isDrawingWalls, setIsDrawingWalls] = useState(false);
  const [drawingWallType, setDrawingWallType] = useState('wall');
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [activeStampingAsset, setActiveStampingAsset] = useState(null);
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingLineWidth, setDrawingLineWidth] = useState(5);
  const [selectedWalls, setSelectedWalls] = useState([]);
  const [selectedLights, setSelectedLights] = useState([]);
  const [isArchitectMode, setIsArchitectMode] = useState(false);
  const [isPlacingLights, setIsPlacingLights] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [wallContextMenu, setWallContextMenu] = useState(null);
  const [lightContextMenu, setLightContextMenu] = useState(null);
  const [propContextMenu, setPropContextMenu] = useState(null);
  const tokenMenuRef = useRef(null);
  const wallMenuRef = useRef(null);
  const lightMenuRef = useRef(null);
  const propMenuRef = useRef(null);
  const [activeTool, setActiveTool] = useState(null);
  const [activeMeasurementStyle, setActiveMeasurementStyle] = useState('default');
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [viewModeState, setViewModeState] = useState('isometric');
  const viewMode = isCastMode ? 'top-down' : viewModeState;
  const setViewMode = setViewModeState;
  const [draggedTokenId, setDraggedTokenId] = useState(null);
  const [remountKey, setRemountKey] = useState(0);
  const [assetTab, setAssetTab] = useState('library');

  const [sculptBrushType, setSculptBrushType] = useState('raise');
  const [sculptBrushSize, setSculptBrushSize] = useState(2);
  const [sculptBrushStrength, setSculptBrushStrength] = useState(0.05);

  const [materialData, setMaterialData] = useState(null);
  const [materialBrushType, setMaterialBrushType] = useState('#00FF00'); // Green = Grass by default
  const [materialBrushSize, setMaterialBrushSize] = useState(15);
  const [materialBrushShape, setMaterialBrushShape] = useState('circle');
  const [materialBrushSoftness, setMaterialBrushSoftness] = useState(0);
  const [materialLimitToGround, setMaterialLimitToGround] = useState(false);

  const shiftHeldRef = useRef(false);
  const [fitTrigger, setFitTrigger] = useState(0);

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
      isAnyMenuOpenRef.current = showAssetManager || showTokenManager || !!contextMenu || !!wallContextMenu || !!lightContextMenu || !!propContextMenu || showCompendium || showModelPicker;
      if (isAnyMenuOpenRef.current) {
          setIsIdle(false);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      }
  }, [showAssetManager, showTokenManager, contextMenu, wallContextMenu, lightContextMenu, propContextMenu, showCompendium, showModelPicker]);

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

  useEffect(() => {
      if (isCastMode && mapData && isAspectReady) {
          setFitTrigger(p => p + 1);
      }
  }, [isCastMode, mapData?.activeMapId, isAspectReady]);

  const resolvedBackgroundUrl = useResolvedUrl(mapData?.backgroundUrl);
  const resolvedHeightmapUrl = useResolvedUrl(mapData?.heightmapUrl);
  const resolvedNormalMapUrl = useResolvedUrl(mapData?.normalMapUrl);
  const resolvedMaterialMaskUrl = useResolvedUrl(mapData?.materialMaskUrl);

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
      // Create a blank heightmap canvas so sculpting works on new/blank maps
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#000000'; // Black is zero height
      ctx.fillRect(0, 0, size, size);
      
      const imageData = ctx.getImageData(0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.NoColorSpace;
      
      setTerrainData({
          data: imageData.data, width: size, height: size,
          canvas: canvas, ctx: ctx, texture: texture
      });
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
        
        // Phase 1: Create the dynamic CanvasTexture for real-time sculpting
        const texture = new THREE.CanvasTexture(canvas);

        setTerrainData({
          data: imageData.data,
          width: img.width,
          height: img.height,
          canvas: canvas,
          ctx: ctx,
          texture: texture
        });
      } catch (err) {
        console.warn("Failed to read heightmap data (CORS?)", err);
      }
    };
    img.src = resolvedHeightmapUrl;
    return () => { isActive = false; };
  }, [resolvedHeightmapUrl]);

  useEffect(() => {
      const size = 1024;
      if (!resolvedMaterialMaskUrl) {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.fillStyle = '#000000'; // Black background
          ctx.fillRect(0, 0, size, size);
          
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.NoColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          
          setMaterialData({ width: size, height: size, canvas: canvas, ctx: ctx, texture: texture });
          return () => texture.dispose();
      }
      let isActive = true;
      let texture = null;
      const img = new Image();
      if (!resolvedMaterialMaskUrl.startsWith('blob:') && !resolvedMaterialMaskUrl.startsWith('data:')) {
          img.crossOrigin = "Anonymous";
      }
      img.onload = () => {
          if (!isActive) return;
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          
          texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.NoColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          setMaterialData({ width: img.width, height: img.height, canvas: canvas, ctx: ctx, texture: texture });
      };
      img.src = resolvedMaterialMaskUrl;
      return () => { isActive = false; if (texture) texture.dispose(); };
  }, [resolvedMaterialMaskUrl]);

  const mapScale = mapData?.scale || 20;
  const mapHeightScale = mapData?.heightScale || 1;
  const mapHeightmapUrl = mapData?.heightmapUrl;

  const latestPropsRef = useRef(mapData?.props);
  useEffect(() => {
    latestPropsRef.current = mapData?.props;
  }, [mapData?.props]);

  const getTerrainHeight = useCallback((x, z, radius = 0) => {
    if (isCastMode) return 0; // Force tokens and measurements to be flat against the TV glass

    let terrainHeight = 0;
    if (terrainData && mapHeightmapUrl) {
      const getHForPoint = (px_val, pz_val) => {
        const u = (px_val / (mapScale * aspect)) + 0.5;
        const v = (pz_val / mapScale) + 0.5;

        // The GPU uses a mesh with limited subdivisions. 
        // We must sample the texture at the exact same vertices the GPU does, 
        // and interpolate across the exact same triangles using Barycentric coordinates.
        const isLowPerf = typeof window !== 'undefined' && window.localStorage?.getItem('vtt_low_performance') === 'true';
        const subdivisions = isLowPerf ? 128 : 256;

        const gridX = u * subdivisions;
        const gridZ = v * subdivisions;

        const x0 = Math.floor(gridX);
        const x1 = Math.ceil(gridX);
        const z0 = Math.floor(gridZ);
        const z1 = Math.ceil(gridZ);

        const tx = gridX - x0;
        const tz = gridZ - z0;

        const getVertexHeight = (vx, vz) => {
            const clampedVX = Math.max(0, Math.min(vx, subdivisions));
            const clampedVZ = Math.max(0, Math.min(vz, subdivisions));
            
            const vu = clampedVX / subdivisions;
            const vv = clampedVZ / subdivisions;

            // WebGL texture sampling exact match: p = u * size - 0.5
            let px = vu * terrainData.width - 0.5;
            let py = vv * terrainData.height - 0.5;

            const px0 = Math.floor(px);
            const px1 = px0 + 1;
            const py0 = Math.floor(py);
            const py1 = py0 + 1;

            const ix = px - px0;
            const iy = py - py0;

            // Emulate THREE.RepeatWrapping for texture boundaries
            const wrap = (val, max) => {
                let res = val % max;
                return res < 0 ? res + max : res;
            };

            const getTex = (cx, cy) => {
                const wx = Math.floor(wrap(cx, terrainData.width));
                const wy = Math.floor(wrap(cy, terrainData.height));
                
                // Raw byte from canvas is sRGB (gamma encoded)
                let val = terrainData.data[(wy * terrainData.width + wx) * 4] / 255.0;
                
                // Decode sRGB to Linear to perfectly match the GPU's hardware decode
                val = val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);

                return val * mapHeightScale;
            };

            const t00 = getTex(px0, py0);
            const t10 = getTex(px1, py0);
            const t01 = getTex(px0, py1);
            const t11 = getTex(px1, py1);

            const t0 = t00 * (1 - ix) + t10 * ix;
            const t1 = t01 * (1 - ix) + t11 * ix;

            return t0 * (1 - iy) + t1 * iy;
        };

        const hA = getVertexHeight(x0, z0); // Top Left
        const hB = getVertexHeight(x0, z1); // Bottom Left
        const hC = getVertexHeight(x1, z1); // Bottom Right
        const hD = getVertexHeight(x1, z0); // Top Right

        // Three.js PlaneGeometry splits quads into two triangles: (TopLeft, BottomLeft, TopRight) and (BottomLeft, BottomRight, TopRight)
        if (tx + tz <= 1) {
            return hA + tx * (hD - hA) + tz * (hB - hA);
        } else {
            return hC + (1 - tx) * (hB - hC) + (1 - tz) * (hD - hC);
        }
      };

      // Use the center point for terrain elevation to prevent tokens from artificially floating on slopes.
      terrainHeight = getHForPoint(x, z);
      
      // Add the visual mesh offsets so tokens perfectly align with the rendered mesh
      terrainHeight += 0.03; 
    }

    let finalHeight = terrainHeight;
    const props = latestPropsRef.current;
    if (props) {
        const currentGridSize = mapData?.gridSize || 1;
        Object.values(props).forEach(prop => {
            if (prop && prop.hasCollision !== false) {
                const propX = prop.x || 0;
                const propZ = prop.z || 0;
                const baseScale = (prop.scale || 1.0) * currentGridSize;
                const dx = x - propX;
                const dz = z - propZ;
                
                const propRadius = baseScale * 0.5;
                const tokenRadius = radius || 0;
                const combinedRadius = propRadius + tokenRadius;

                if (dx * dx + dz * dz <= combinedRadius * combinedRadius) {
                    const propHeight = terrainHeight + (prop.elevation || 0) + ((prop.is3D || prop.modelUrl) ? (baseScale * 0.8) : 0.05);
                    if (propHeight > finalHeight) {
                        finalHeight = propHeight;
                    }
                }
            }
        });
    }

    return finalHeight;
  }, [terrainData, mapHeightmapUrl, mapScale, mapHeightScale, aspect, isCastMode, mapData?.gridSize]);
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

  const tokensList = useMemo(() => Object.values(tokens).filter(Boolean), [tokens]); // Filter out null/undefined tokens

  // Stabilize context objects that secretly bust React caches on every UI click
  const playersStr = JSON.stringify(data?.players || []);
  const npcsStr = JSON.stringify(data?.npcs || []);
  const assignmentsStr = JSON.stringify(data?.assignments || {});
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allCharacters = useMemo(() => [...(data?.players || []), ...(data?.npcs || [])], [playersStr, npcsStr]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableAssignments = useMemo(() => data?.assignments || {}, [assignmentsStr]);

  const groupDragData = useRef({ activeTokenId: null, delta: new THREE.Vector3() });

  // RTDB Live Dragging Listeners & Broadcasters
  const clientId = useMemo(() => Math.random().toString(36).substring(2, 10), []);
  const rtdbDragsRef = useRef({});
  useEffect(() => {
      if (!campaignCode || !activeMapId) return;
      const dragsRef = ref(rtdb, `live_drags/${campaignCode}_${activeMapId}`);
      const unsubscribe = onValue(dragsRef, (snapshot) => {
          rtdbDragsRef.current = snapshot.val() || {};
      });
      return () => unsubscribe();
  }, [campaignCode, activeMapId]);

  const lastBroadcasts = useRef({});
  const broadcastDrag = useCallback((tokenId, x, z, rotationY) => {
      if (!campaignCode || !activeMapId || !user?.uid) return;
      const now = performance.now();
      const last = lastBroadcasts.current[tokenId] || 0;
      if (now - last > 50) { // ~20 FPS limit per token
          lastBroadcasts.current[tokenId] = now;
          set(ref(rtdb, `live_drags/${campaignCode}_${activeMapId}/${tokenId}`), { x, z, rotationY: rotationY ?? 0, clientId, uid: user.uid });
      }
  }, [campaignCode, activeMapId, user?.uid, clientId]);

  const clearBroadcast = useCallback((tokenId) => {
      if (!campaignCode || !activeMapId) return;
      remove(ref(rtdb, `live_drags/${campaignCode}_${activeMapId}/${tokenId}`));
  }, [campaignCode, activeMapId]);

  const handleGroupDragEnd = useCallback((leaderId, delta) => {
      const updates = {};

      selectedTokenIds.forEach(id => {
          if (id === leaderId) return;
          const t = latestTokensRef.current[id];
          if (!t) return;

          if (role !== 'dm') {
              const character = allCharacters.find(c => String(c.id) === String(t.characterId));
              const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || 
                              (t.ownerId && String(t.ownerId) === String(user?.uid));
              const myCharId = stableAssignments[user?.uid];
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

          const radius = (tokenSize * gridSize) / 2;
          const terrainY = getTerrainHeight ? getTerrainHeight(finalX, finalZ, radius) : 0;
          const finalY = terrainY + (t.elevationOffset || 0) + ((isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12));

          updates[`tokens.${id}.x`] = finalX;
          updates[`tokens.${id}.y`] = finalY;
          updates[`tokens.${id}.z`] = finalZ;
          updates[`tokens.${id}.elevationOffset`] = t.elevationOffset || 0;
      });
      
      if (Object.keys(updates).length > 0) {
          updateMap(campaignCode, activeMapId, updates);
      }
  }, [selectedTokenIds, isSnapToGrid, gridSize, getTerrainHeight, campaignCode, activeMapId, mapData?.gridOffsetX, mapData?.gridOffsetY, mapData?.tokenElevationOffset, role, allCharacters, user?.uid, stableAssignments]);

  // Calculate Player Vision Sources (Used by both Fog Renderer and CPU Visibility checks)
  const playerVisionSources = useMemo(() => {
      if (!tokensList || !allCharacters) return [];

      let relevantTokens;
      if (role === 'dm' || isCastMode) {
          const playerCharIds = new Set((data?.players || []).map(p => String(p.id)));
          relevantTokens = tokensList.filter(t => t.isSharedControl || (t.characterId && playerCharIds.has(String(t.characterId))));
      } else {
          const myCharId = stableAssignments[user?.uid];
          relevantTokens = tokensList.filter(t => {
              if (t.isSharedControl) return true;
              if (!t.characterId) return false;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensList, role, user?.uid, stableAssignments, allCharacters, gridSize, playersStr, mapData?.fowEnabled]);

  // Calculate which doors and windows are visible to players based on their vision sources
  const visibleDoorWindowIds = useMemo(() => {
      if (role === 'dm' && !isCastMode) {
          // DM sees all walls, so all doors/windows are visible to DM
          return new Set(Object.values(mapData?.walls || {}).filter(w => w && (w.type === 'door' || w.type === 'window')).map(w => w.id));
      }

      const visibleIds = new Set();
      if (!mapData?.walls || !playerVisionSources || playerVisionSources.length === 0) {
          return visibleIds;
      }

      Object.values(mapData.walls).filter(Boolean).forEach(wall => {
          if (wall && (wall.type === 'door' || wall.type === 'window')) {
              const wallMidpoint = {
                  x: (wall.points[0].x + wall.points[1].x) / 2,
                  z: (wall.points[0].z + wall.points[1].z) / 2,
              };

              const wallsToCheck = mapData?.fowWallsEnabled !== false ? mapData.walls : null;

              for (const source of playerVisionSources) {
                  const dist = Math.sqrt(Math.pow(source.x - wallMidpoint.x, 2) + Math.pow(source.z - wallMidpoint.z, 2));

                  // Check if within vision range and if there's line of sight
                  if (dist <= source.range && checkLineOfSight(source, wallMidpoint, wallsToCheck, wall.id)) {
                      visibleIds.add(wall.id);
                      break; // This door/window is visible, no need to check other sources
                  }
              }
          }
      });
      return visibleIds;
  }, [mapData?.walls, mapData?.fowWallsEnabled, playerVisionSources, role, isCastMode]);

  // Calculate combined lights (map lights + dynamic token lights)
  const combinedLights = useMemo(() => {
      const allLights = {};
      Object.values(mapData?.lights || {}).filter(Boolean).forEach(l => {
          allLights[l.id] = l;
      });
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
      if (role === 'dm' && !isCastMode) return new Set(tokensList.map(t => t.id)); // DM sees everything
      const visibleIds = new Set();

      const playerCharIds = isCastMode ? new Set((data?.players || []).map(p => String(p.id))) : new Set();

      tokensList.forEach(t => {
          if (t.isHidden) return; // Hidden tokens are completely excluded
          
          // In cast mode, always see all PCs and shared control tokens
          if (isCastMode && (t.isSharedControl || (t.characterId && playerCharIds.has(String(t.characterId))))) {
              visibleIds.add(t.id);
              return;
          }

          const character = allCharacters.find(c => String(c.id) === String(t.characterId));
          const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || (t.ownerId && String(t.ownerId) === String(user?.uid));
          const myCharAssigned = stableAssignments[user?.uid] && String(t.characterId) === String(stableAssignments[user.uid]);
          
          // You can always see yourself and tokens you share control over
          if (!isCastMode && (isOwner || myCharAssigned || t.isSharedControl)) {
              visibleIds.add(t.id);
              return;
          }

          const wallsArray = mapData?.fowWallsEnabled !== false ? Object.values(mapData?.walls || {}) : [];
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
  }, [tokensList, role, playerVisionSources, mapData?.walls, mapData?.lights, mapData?.fowEnabled, mapData?.fowWallsEnabled, allCharacters, user?.uid, stableAssignments, gridSize, isCastMode, data?.players]);

  // CPU-based Line of Sight / Prop Visibility Filter
  const visiblePropIds = useMemo(() => {
      const props = mapData?.props ? Object.values(mapData.props).filter(Boolean) : [];
      if (role === 'dm' && !isCastMode) return new Set(props.map(p => p.id)); // DM sees everything
      
      const visibleIds = new Set();
      const wallsArray = mapData?.fowWallsEnabled !== false ? Object.values(mapData?.walls || {}) : [];

      props.forEach(p => {
          const targetPt = { x: p.x || 0, z: p.z || 0 };

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
              const canSeeWithTremorsense = dist <= tremorsenseRange && (p.elevation || 0) === 0;

              if (canSeeWithTruesight || canSeeWithBlindsight || canSeeWithTremorsense) {
                  visibleIds.add(p.id);
                  return; // Visible, no need to check further for this prop
              }

              // Condition 1: Is the target within darkvision/base range AND there is line of sight?
              if (dist <= baseVisionRange && hasLOS) {
                  visibleIds.add(p.id);
                  return; // Visible
              }

              // Condition 2: Is the target illuminated by a light source AND does the player have line of sight to it?
              if (combinedLights && mapData?.fowEnabled !== false) {
                  if (hasLOS) {
                      for (const light of Object.values(combinedLights)) {
                          const lightRange = (light.radius || 15) / 5 * gridSize;
                          const lightPt = { x: light.position.x, z: light.position.z };
                          const distToLight = Math.sqrt(Math.pow(lightPt.x - targetPt.x, 2) + Math.pow(lightPt.z - targetPt.z, 2));
                          
                          if (distToLight <= lightRange && checkLineOfSight(lightPt, targetPt, wallsArray)) {
                              visibleIds.add(p.id);
                              return; // Visible
                          }
                      }
                  }
              }
          }
      });
      return visibleIds;
  }, [mapData?.props, role, playerVisionSources, mapData?.walls, mapData?.lights, mapData?.fowEnabled, mapData?.fowWallsEnabled, combinedLights, gridSize, isCastMode]);

  // Calculate which 3D lights are visible to the players (prevents unseen lights from shining through walls via normal maps)
  const visibleLights = useMemo(() => {
      if (!combinedLights) return {};
      if ((role === 'dm' && !isCastMode) || mapData?.fowEnabled === false) return combinedLights;

      const filteredLights = {};
      const wallsArray = mapData?.fowWallsEnabled !== false ? Object.values(mapData?.walls || {}) : [];

      Object.values(combinedLights).filter(Boolean).forEach(light => {
          const lightPt = { x: light.position.x, z: light.position.z };
          for (const src of playerVisionSources) {
              if (checkLineOfSight(src, lightPt, wallsArray)) {
                  filteredLights[light.id] = light;
                  break;
              }
          }
      });
      return filteredLights;
  }, [mapData?.lights, mapData?.walls, mapData?.fowEnabled, mapData?.fowWallsEnabled, playerVisionSources, role, combinedLights, isCastMode]);

  // Extract active combatant early so the Camera Director can hook into it
  const activeCombatantId = mapData && data?.campaign?.combat?.active && data?.campaign?.combat?.combatants?.length 
      ? data.campaign.combat.combatants[(data.campaign.combat.turn || 0) % data.campaign.combat.combatants.length].tokenId 
      : null;

  // Handle clicking a token to both select it and open the side sheet
  const handleSelectToken = useCallback((tokenId, isMulti) => {
    if (isMulti) {
        setSelectedTokenIds(prev => prev.includes(tokenId) ? prev.filter(id => id !== tokenId) : [...prev, tokenId]);
    } else {
        setSelectedTokenIds([tokenId]);
    }
    setContextMenu(null);
  }, [setSelectedTokenIds]);

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
          
          // Parse Senses
          const parseSenseString = (senseStr) => {
              if (!senseStr) return 0;
              const match = String(senseStr).match(/(\d+)/);
              return match ? parseInt(match[1], 10) : 0;
          };

          // Parse Proficiencies
          const skills = {};
          const savingThrows = {};
          (m.proficiencies || []).forEach(p => {
              const name = p.proficiency?.name || "";
              if (name.startsWith("Skill:")) {
                  skills[name.replace("Skill: ", "")] = true;
              } else if (name.startsWith("Saving Throw:")) {
                  const stat = name.replace("Saving Throw: ", "").substring(0, 3).toLowerCase();
                  if (stat) savingThrows[stat] = true;
              }
          });

          // Parse Actions and Reactions
          const mappedActions = (m.actions || []).map(a => {
              let dmgString = "";
              if (a.damage && a.damage[0] && a.damage[0].damage_dice) {
                  dmgString = a.damage[0].damage_dice;
                  if(a.damage[0].damage_type?.name) dmgString += ` ${a.damage[0].damage_type.name}`;
              }
              return { name: a.name, desc: a.desc, type: "Action", hit: a.attack_bonus ? `+${a.attack_bonus}` : "", dmg: dmgString };
          });
          const mappedReactions = (m.reactions || []).map(r => {
              return { name: r.name, desc: r.desc, type: "Reaction" };
          });
          const allCustomActions = [...mappedActions, ...mappedReactions];

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
              darkvision: parseSenseString(m.senses?.darkvision),
              blindsight: parseSenseString(m.senses?.blindsight),
              tremorsense: parseSenseString(m.senses?.tremorsense),
              truesight: parseSenseString(m.senses?.truesight),
              passivePerception: m.senses?.passive_perception || 10,
              skills,
              savingThrows,
              defenses: {
                  vulnerabilities: (m.damage_vulnerabilities || []).join(', ') || "",
                  resistances: (m.damage_resistances || []).join(', ') || "",
                  immunities: [
                      ...(m.damage_immunities || []),
                      ...(m.condition_immunities || []).map(c => typeof c === 'string' ? c : c.name).map(c => `${c} (Condition)`)
                  ].join(', ') || ""
              },
              image: imageUrl,
              quirk: "SRD Import",
              bio: { backstory: `Imported from D&D 5e API.\nXP: ${m.xp}\nLanguages: ${m.languages}`, appearance: `A ${m.size} ${m.type}.` },
              customActions: allCustomActions,
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

  const [isForging3D, setIsForging3D] = useState(false);
  const [forge3DStatus, setForge3DStatus] = useState("");

  const handleForge3D = async (npcForModel) => {
      if (!npcForModel) return;
      try {
          setIsForging3D(true);
          setForge3DStatus("The Forge is hot... Sculpting 3D mesh (this may take a minute).");
          
          let imageBlob = null;
          let imageUrl = npcForModel.image;
          if (!imageUrl) {
              alert("No image available to forge a 3D mini.");
              setIsForging3D(false);
              return;
          }

          if (imageUrl.startsWith('chunked:')) {
              const result = await retrieveChunkedMap(imageUrl);
              if (result) {
                  if (typeof result === 'string') {
                      const res = await fetch(result);
                      imageBlob = await res.blob();
                  } else if (result instanceof Blob) {
                      imageBlob = result;
                  }
              }
          } else {
              const res = await fetch(imageUrl);
              imageBlob = await res.blob();
          }

          if (!imageBlob) throw new Error("Could not prepare image blob.");
          
          setForge3DStatus("Connecting to AI Forge... (May take 30-60s)");
          let app = null;
          const hfToken = import.meta.env.VITE_HF_TOKEN || localStorage.getItem('hf_token');
          const options = hfToken ? { hf_token: hfToken } : {};
          
          try {
              setForge3DStatus(`Waking up VAST-AI/TripoSG...`);
              const { Client } = await import("@gradio/client");
              app = await Client.connect("VAST-AI/TripoSG", options);
          } catch (e) {
              console.warn(`Space VAST-AI/TripoSG is asleep or unavailable.`, e);
          }
          
          if (!app) {
              throw new Error("The 3D Forge AI server is currently asleep or overloaded. Please try again later, or add a Hugging Face token in your Settings to wake it up!");
          }
          
          setForge3DStatus("Starting Forge Session...");
          try {
              await app.predict("/start_session", {});
          } catch (e) {
              console.warn("Failed to start session, may not be required", e);
          }
          
          setForge3DStatus("Sculpting 3D Mesh... Please wait. (1/2)");
          const meshResult = await app.predict("/image_to_3d", {
              image: imageBlob,
              seed: 0,
              num_inference_steps: 8,
              guidance_scale: 0,
              simplify: true,
              target_face_num: 10000
          });

          if (!meshResult.data || !meshResult.data[0]) {
              throw new Error("Invalid response from AI during 3D generation.");
          }

          setForge3DStatus("Texturing 3D Mesh... Please wait. (2/2)");
          const textureResult = await app.predict("/run_texture", {
              image: imageBlob,
              mesh_path: meshResult.data[0],
              seed: 0
          });

          if (!textureResult.data || !textureResult.data[0]) {
              throw new Error("Invalid response from AI during texturing.");
          }

          let glbUrl = "";
          const glbOutput = textureResult.data[0];
          if (typeof glbOutput === 'string') glbUrl = glbOutput;
          else if (glbOutput && glbOutput.url) glbUrl = glbOutput.url;
          else if (glbOutput && glbOutput.path) {
              glbUrl = `https://vast-ai-triposg.hf.space/file=${glbOutput.path}`;
          } else {
               throw new Error("Invalid response from AI.");
          }

          setForge3DStatus("Downloading 3D Mesh...");
          const glbRes = await fetch(glbUrl);
          const glbBlob = await glbRes.blob();
          
          setForge3DStatus("Saving to DungeonMind...");
          const glbBase64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(glbBlob);
          });

          const newChunkedUrl = await storeChunkedMap(glbBase64, (npcForModel.name || "npc") + "_mini.glb");
          
          handleModelSelect({ url: newChunkedUrl, scale: 1, yOffset: 0 });
          
      } catch (e) {
          console.error(e);
          alert("3D Forge Failed: " + e.message);
      } finally {
          setIsForging3D(false);
      }
  };

  const handleModelSelect = async (model) => {
    if (!pendingNpc) return;
    const finalNpc = { ...pendingNpc };
    if (model) {
        finalNpc.modelUrl = model.url;
        finalNpc.modelScale = 1;
        finalNpc.modelYOffset = 0;
    }
    
    updateCampaign({ npcs: [...(data?.npcs || []), finalNpc] });
    
    const dropX = 0;
    const dropZ = 0;
    const radius = ((finalNpc.size || 1) * gridSize) / 2;
    const terrainY = getTerrainHeight ? getTerrainHeight(dropX, dropZ, radius) : 0;
    
    const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tokenData = {
        id: newTokenId, characterId: finalNpc.id, name: finalNpc.name,
        type: 'npc', x: dropX, y: terrainY + ((isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12)), z: dropZ,
        image: finalNpc.image || '', size: finalNpc.size || 1, hp: finalNpc.hp
    };

    await updateMap(campaignCode, activeMapId, { [`tokens.${newTokenId}`]: tokenData });
    
    setPendingNpc(null);
    setShowModelPicker(false);
  };

  const [tokenMenuDisplayPosition, setTokenMenuDisplayPosition] = useState({ x: 0, y: 0 });
  const [wallMenuDisplayPosition, setWallMenuDisplayPosition] = useState({ x: 0, y: 0 });
  const [lightMenuDisplayPosition, setLightMenuDisplayPosition] = useState({ x: 0, y: 0 });
  const [propMenuDisplayPosition, setPropMenuDisplayPosition] = useState({ x: 0, y: 0 });

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

  // Effect for prop context menu positioning
  useEffect(() => {
    if (propContextMenu && propMenuRef.current) {
      requestAnimationFrame(() => {
        const menuWidth = propMenuRef.current.offsetWidth;
        const menuHeight = propMenuRef.current.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newX = propContextMenu.x;
        let newY = propContextMenu.y;

        if (newX + menuWidth > viewportWidth) {
          newX = viewportWidth - menuWidth - 10;
        }
        if (newY + menuHeight > viewportHeight) {
          newY = viewportHeight - menuHeight - 10;
        }
        setPropMenuDisplayPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
      });
    }
  }, [propContextMenu]);

  const handleContextMenu = useCallback((e, token) => {
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
  }, [allCharacters, user?.uid, data?.assignments, role]);

  const handleWallContextMenu = useCallback((e, wallId) => {
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
  }, []);

  const handleLightContextMenu = useCallback((e, lightId) => {
      e.stopPropagation();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50); // Haptic feedback on light long-press/right-click
      }
      setContextMenu(null);
      setWallContextMenu(null);
      setPropContextMenu(null);
      setLightContextMenu({
          x: e.clientX,
          y: e.clientY,
          lightId: lightId
      });
  }, []);

  const handlePropContextMenu = useCallback((e, propId) => {
      e.stopPropagation();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      setContextMenu(null);
      setWallContextMenu(null);
      setLightContextMenu(null);
      setPropContextMenu({
          x: e.clientX,
          y: e.clientY,
          propId: propId
      });
  }, []);

  const handleToggleDoor = useCallback((e, wallId) => {
      e.stopPropagation();
      const wall = mapData?.walls?.[wallId];
      if (wall && (wall.type === 'door' || wall.type === 'window')) {
          updateMap(campaignCode, activeMapId, { [`walls.${wallId}.isOpen`]: !wall.isOpen });
      }
  }, [mapData?.walls, campaignCode, activeMapId]);

  // Handler triggered by Token3D when a drag ends
  const handleUpdateTokenPosition = useCallback(async (tokenId, position) => {
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
  }, [campaignCode, activeMapId]);

  // Handler triggered by MapProp when a drag ends
  const handleUpdatePropPosition = useCallback(async (propId, position) => {
    try {
        const updates = {};
        Object.keys(position).forEach(key => {
            updates[`props.${propId}.${key}`] = position[key];
        });
        await updateMap(campaignCode, activeMapId, updates);
    } catch (e) {
        console.error("[TacticalMapView] Failed to updateProp in Firestore:", e);
    }
  }, [campaignCode, activeMapId]);

  // Handle dragging an image from the AssetManager directly onto the map
  const handleDrop = async (e, position) => {
    if (!position) return;

    if (activeTool || isDrawingFreehand) return; // Prevent drops while tools are active

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
    const radius = (tokenSize * gridSize) / 2;
    const terrainY = getTerrainHeight ? getTerrainHeight(dropX, dropZ, radius) : 0;

    if (payload.category === 'Props') {
        const newPropId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const propData = {
            id: newPropId,
            name: payload.name || 'New Prop',
            x: position.x, // Props usually don't snap to grid on raw drop
            y: position.y,
            z: position.z,
            image: payload.url || payload.image || '',
            scale: 1.0,
            elevation: 0,
            rotation: 0,
            is3D: payload.is3D || false,
            modelUrl: payload.modelUrl || null,
            isLocked: false,
            hasCollision: true        };
        await updateMap(campaignCode, activeMapId, { [`props.${newPropId}`]: propData });
        return;
    }

    const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let tokenData;

    if (payload.format === 'dungeonmind-asset' || payload.url) {
        tokenData = {
            id: newTokenId,
            name: 'New Token',
            type: 'npc',
            x: dropX, y: terrainY + ((isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12)), z: dropZ,
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
            x: dropX, y: terrainY + ((isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12)), z: dropZ,
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

      // Zoom Shortcuts
      if (e.key === '+' || e.key === '=') {
          zoomRef.current?.zoomIn();
          return;
      }
      if (e.key === '-' || e.key === '_') {
          zoomRef.current?.zoomOut();
          return;
      }

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
          if (role === 'dm') { 
              setIsDrawingWalls(false); 
              setIsArchitectMode(false); 
              setIsPlacingLights(false); 
              setActiveStampingAsset(null); 
              setIsDeleting(false); 
          }
          setActiveTool(null);
          setIsDrawingFreehand(false);
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
          walls: {},
          gridSize: 1,
          scale: 20,
          environment: 'day',
          tokens: {},
          lights: {},
          fowEnabled: false,
          fowWallsEnabled: true,
          hide3DTokenBases: true
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
            walls: existingMapData.walls || asset.generatedFeatures?.walls || {},
            lights: existingMapData.lights || asset.generatedFeatures?.lights || {}
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
        const newMapData = {
            name: assetName ? assetName.replace(/\.[^/.]+$/, "") : "New Map",
            backgroundUrl: assetUrl,
            heightmapUrl: asset.generatedHeightmapUrl || null,
            normalMapUrl: asset.generatedNormalMapUrl || null,
            walls: asset.generatedFeatures?.walls || {},
            lights: asset.generatedFeatures?.lights || {},
            gridSize: 1,
            scale: 20,
            environment: 'day',
            tokens: {},
            fowEnabled: false,
            fowWallsEnabled: true,
            hide3DTokenBases: true
        };
        await createMap(campaignCode, newMapId, newMapData);
        await updateCampaign({ activeMapId: newMapId });
    }
    if (closeManager !== false) {
        setShowAssetManager(false);
    }
        return isNew;
  };

  // Memoize Props to prevent UI states from reloading their 3D models
  const propsJSX = useMemo(() => {
      if (!mapData || !mapData.props || !isAspectReady || (mapData.heightmapUrl && !terrainData)) return null;

      return Object.values(mapData.props).filter(Boolean).map(prop => {
          if ((role !== 'dm' || isCastMode) && !visiblePropIds.has(prop.id)) {
              return null;
          }
          return (
              <ErrorBoundary key={prop.id} fallback={null}>
                  <MapProp
                      propData={prop}
                      isSelected={false} 
                      onContextMenu={role === 'dm' ? handlePropContextMenu : null}
                      getTerrainHeight={getTerrainHeight}
                      updatePropPosition={handleUpdatePropPosition}
                      gridSize={gridSize}
                  />
              </ErrorBoundary>
          );
      });
  }, [mapData?.props, isAspectReady, mapData?.heightmapUrl, terrainData, role, visiblePropIds, handlePropContextMenu, getTerrainHeight, handleUpdatePropPosition, gridSize, isCastMode]);

  // Memoize Tokens to prevent UI states (like activeTool) from reloading their 3D models
  const tokensJSX = useMemo(() => {
      if (!mapData || !isAspectReady || (mapData.heightmapUrl && !terrainData)) return null;

      return tokensList.map(token => {
          if ((role !== 'dm' || isCastMode) && token.isHidden) {
              return null;
          }

          const character = allCharacters.find(c => String(c.id) === String(token.characterId));
          const type = data?.players?.some(p => String(p.id) === String(character?.id)) ? 'pc' : 'npc';

          if (isCastMode && mapData.hidePlayerTokensOnCast && type === 'pc') {
              return null;
          }

          const displayToken = { ...token };

          if (character) {
              displayToken.name = token.name || character.name;
              displayToken.image = character.image || token.image || token.img;
              displayToken.type = type;
              displayToken.modelUrl = character.modelUrl;
              displayToken.modelScale = character.modelScale;
              displayToken.modelYOffset = character.modelYOffset;
              displayToken.materialStyle = character.materialStyle;
              displayToken.conditions = character.conditions || token.conditions || [];
          } else {
              displayToken.image = token.image || token.img;
              displayToken.conditions = token.conditions || [];
          }

          // Move 3D tokens down if their bases are hidden to match 2D token base height
          const has3DModel = !!displayToken.modelUrl;
          const hideBaseIf3D = mapData?.hide3DTokenBases !== false;
          if (has3DModel && hideBaseIf3D) {
              displayToken.y = (displayToken.y || 0) - 0.04;
          }

          // Fix CORS for token images in WebGL using a dedicated image proxy
          if (displayToken.image && displayToken.image.startsWith('http')) {
              let cleanUrl = displayToken.image;
              if (cleanUrl.includes('corsproxy.io/?')) cleanUrl = decodeURIComponent(cleanUrl.split('corsproxy.io/?')[1] || cleanUrl);
              if (cleanUrl.includes('api.allorigins.win/raw?url=')) cleanUrl = decodeURIComponent(cleanUrl.split('api.allorigins.win/raw?url=')[1] || cleanUrl);

              if (!cleanUrl.includes('firebasestorage.googleapis.com') && !cleanUrl.includes('wsrv.nl')) {
                  displayToken.image = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&cors=1`;
              } else {
                  displayToken.image = cleanUrl;
              }
          }

          const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) ||
                          (token.ownerId && String(token.ownerId) === String(user?.uid));
          const myCharId = stableAssignments[user?.uid];
          const myCharAssigned = myCharId && String(token.characterId) === String(myCharId);
          const canControl = role === 'dm' || isOwner || myCharAssigned || token.isSharedControl;

          const isInteractive = true;

          return (
              <ErrorBoundary key={token.id} fallback={null}>
                  <Token3D
                      token={displayToken}                      updateTokenPosition={handleUpdateTokenPosition}
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
                      showNameplates={showNameplates}
                      selectedTokenIds={selectedTokenIds}
                      groupDragData={groupDragData}
                      onGroupDragEnd={handleGroupDragEnd}
                      isActiveTurn={activeCombatantId === token.id}
                      canControl={canControl && isInteractive}
                      shiftHeldRef={shiftHeldRef}
                      tokenBaseOffset={((isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12)) - (has3DModel && hideBaseIf3D ? 0.04 : 0)}
                      isInteractive={isInteractive}
                      orientation={mapData?.orientation || 0}
                      activeTool={activeTool || (isDrawingFreehand ? 'freehand' : null)}
                      rtdbDragsRef={rtdbDragsRef}
                      broadcastDrag={broadcastDrag}
                      clearBroadcast={clearBroadcast}
                      myUid={user?.uid}
                      myClientId={clientId}
                      baseVisibility={visibleTokenIds.has(token.id)}
                      playerVisionSources={playerVisionSources}
                      wallsArray={mapData?.fowWallsEnabled !== false ? Object.values(mapData?.walls || {}) : []}
                      combinedLights={combinedLights}
                      fowEnabled={mapData?.fowEnabled}
                      alwaysVisible={(role === 'dm' && !isCastMode) || (isCastMode && type === 'pc') || (canControl && !isCastMode)}
                      hideBaseIf3D={mapData?.hide3DTokenBases !== false}
                  />
              </ErrorBoundary>
          );
      });
  }, [
      mapData?.heightmapUrl, isAspectReady, terrainData, tokensList, allCharacters, data?.players, visibleTokenIds, role, user?.uid, stableAssignments,
      handleUpdateTokenPosition, gridSize, mapData?.gridOffsetX, mapData?.gridOffsetY, selectedTokenIds,
      handleSelectToken, handleContextMenu, getTerrainHeight, isSnapToGrid, draggedTokenId, viewMode, showNameplates,
      activeCombatantId, mapData?.tokenElevationOffset, groupDragData, handleGroupDragEnd, shiftHeldRef,
          mapData?.orientation, isCastMode, activeTool, isDrawingFreehand
  ]);


  const orientation = mapData?.orientation || 0;
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
        shadows={!isLowPerformance}
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
          if (isDrawingWalls || isArchitectMode || isPlacingLights || activeStampingAsset) {
              if (e.button === 2 && activeStampingAsset) setActiveStampingAsset(null); // Right click cancels stamp
              return;
          }
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
        <directionalLight 
            color={envSetting.dir.color} 
            position={envSetting.dir.position} 
            intensity={envSetting.dir.intensity * lightingMultiplier} 
            castShadow={!isLowPerformance}
            shadow-mapSize={[512, 512]}
            shadow-camera-near={0.1}
            shadow-camera-far={200}
            shadow-camera-left={-(mapData?.scale || 20)}
            shadow-camera-right={mapData?.scale || 20}
            shadow-camera-top={mapData?.scale || 20}
            shadow-camera-bottom={-(mapData?.scale || 20)}
            shadow-bias={-0.0005}
            shadow-normalBias={0.05}
        />
        
        <Suspense fallback={null}>
            <WeatherParticles 
                environment={mapData?.environment} 
                viewMode={viewMode} 
                mapScale={mapData?.scale || 20} 
                aspect={aspect} 
                particleDensity={mapData?.particleDensity ?? 1.0}
            />
            {/* NEW SYSTEM: Ambient Life */}
            <AmbientEcosystem 
                environment={mapData?.biomeType || 'generic'} 
                ambientLifeLevel={mapData?.ambientLifeLevel || 'off'}
                mapScale={mapData?.scale || 20}
                particleDensity={mapData?.particleDensity ?? 1.0}
            />
            <PostProcessingEffects 
                environment={mapData?.environment} 
                lightingMultiplier={lightingMultiplier} 
            />
        </Suspense>

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
                onDeleteMeasurement={role === 'dm' && !isCastMode ? (id) => {
                    updateMap(campaignCode, activeMapId, { [`measurements.${id}`]: null });
                } : null}
                onCompleteSelection={(ids) => {
                    setSelectedTokenIds(ids);
                    setActiveTool(null);
                }}
            />
        </Suspense>
        {/* Suspense is required when using useTexture to catch the loading state */}
        <Suspense fallback={null}>
            <ErrorBoundary fallback={null}>
                {(mapData?.heightmapUrl || activeTool === 'sculpt') && !isCastMode ? (
                    <Heightmap 
                        heightmapUrl={mapData.heightmapUrl}
                        backgroundUrl={mapData.backgroundUrl}
                        normalMapUrl={mapData.normalMapUrl}
                        materialMaskUrl={mapData.materialMaskUrl}
                        dynamicMaterialMask={materialData?.texture}
                        heightScale={mapData.heightScale || 1}
                        scale={mapData.scale || 20}
                        aspect={aspect}
                        dynamicDisplacementMap={terrainData?.texture}
                        tokensList={tokensList}
                        rtdbDragsRef={rtdbDragsRef}
                        gridSize={gridSize}
                        animatedEnvironment={mapData?.animatedEnvironment !== false}
                        isPaintingMaterial={activeTool === 'paintMaterial'}
                    />
                ) : (
                    showPlane && <MapPlane backgroundUrl={mapData.backgroundUrl} materialMaskUrl={mapData.materialMaskUrl} dynamicMaterialMask={materialData?.texture} scale={mapData.scale || 20} tokensList={tokensList} rtdbDragsRef={rtdbDragsRef} gridSize={gridSize} animatedEnvironment={mapData?.animatedEnvironment !== false} isPaintingMaterial={activeTool === 'paintMaterial'} />
                )}
            </ErrorBoundary>
        </Suspense>

        <Suspense fallback={null}>
            <MarqueeSelector 
                tokens={role === 'dm' ? tokensList : tokensList.filter(t => visibleTokenIds.has(t.id))} 
                walls={mapData?.walls}
                lights={mapData?.lights}
                isDeleting={isDeleting}
                onSelectTokens={setSelectedTokenIds} 
                onSelectWalls={setSelectedWalls}
                onSelectLights={setSelectedLights}
            />
        </Suspense>

        {mapData?.showGrid !== false && (
            (mapData?.heightmapUrl || activeTool === 'sculpt') && !isCastMode ? (
                <Suspense fallback={null}>
                    <ErrorBoundary fallback={null}>
                        <DisplacedGrid 
                            mapData={mapData}
                            aspect={aspect}
                            resolvedHeightmapUrl={resolvedHeightmapUrl}
                            resolvedNormalMapUrl={resolvedNormalMapUrl}
                            dynamicDisplacementMap={terrainData?.texture}
                        />
                    </ErrorBoundary>
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
        <Suspense fallback={null}>
            <CombatCameraDirector activeTokenId={activeCombatantId} tokensList={tokensList} />
        </Suspense>
        
        {/* Render all map props */}
        <Suspense fallback={null}>
            {propsJSX}
        </Suspense>

        {/* Render all tokens on the map */}
        <Suspense fallback={null}>
            {tokensJSX}
        </Suspense>

        <Suspense fallback={null}>
            <Walls 
                walls={mapData?.walls} 
                selectedWalls={selectedWalls}
                onWallContextMenu={isDeleting ? null : handleWallContextMenu} 
                onToggleDoor={handleToggleDoor} 
                showWalls={role === 'dm' && !isCastMode && (isDrawingWalls || isArchitectMode || isDeleting)}
                role={isCastMode ? 'player' : role}
                playerDoorVisibility={mapData?.playerDoorVisibility}
                visibleDoorWindowIds={visibleDoorWindowIds} // Pass calculated visibility for doors/windows
                onDelete={isDeleting && role === 'dm' && !isCastMode ? (wallId) => {
                    updateMap(campaignCode, activeMapId, { [`walls.${wallId}`]: null });
                } : null}
            />
        </Suspense>

        {/* The Dynamic Fog of War layer */}
        <Suspense fallback={null}>
            {mapData && <GpuFogOfWar
                key={`fow-${activeMapId}-${mapData?.scale}-${aspect}`}
                enabled={mapData?.fowEnabled}
                fowWallsEnabled={mapData?.fowWallsEnabled}
                walls={mapData?.walls}
                lights={combinedLights}
                gridSize={gridSize}
                mapData={mapData}
                aspect={aspect}
                resolvedHeightmapUrl={isCastMode ? null : resolvedHeightmapUrl}
                playerVisionSources={playerVisionSources}
                role={isCastMode ? 'player' : role}
                groupDragData={groupDragData}
                selectedTokenIds={selectedTokenIds}
                rtdbDragsRef={rtdbDragsRef}
            />}
        </Suspense>
        <Suspense fallback={null}>
            <MapLights 
                lights={visibleLights} 
                selectedLights={selectedLights}
                onContextMenu={handleLightContextMenu} 
                role={isCastMode ? 'player' : role} 
                gridSize={gridSize} 
                showLightRadius={!isCastMode && (isPlacingLights || isDeleting)} 
                onDelete={isDeleting && role === 'dm' && !isCastMode ? (lightId) => {
                    updateMap(campaignCode, activeMapId, { [`lights.${lightId}`]: null });
                } : null}
            />
        </Suspense>

        <Suspense fallback={null}>
            <MapPings 
                pings={mapData?.pings || {}} 
                campaignCode={campaignCode} 
                activeMapId={activeMapId} 
                getTerrainHeight={getTerrainHeight}
                userColor={role === 'dm' ? "#ef4444" : "#3b82f6"}
            />
        </Suspense>

        {role === 'dm' && (
            <Suspense fallback={null}>
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
                <TerrainSculptorController
                    isEnabled={activeTool === 'sculpt'}
                    terrainData={terrainData}
                    mapData={mapData}
                    aspect={aspect}
                    getTerrainHeight={getTerrainHeight}
                    brushSize={sculptBrushSize}
                    brushType={sculptBrushType}
                    brushStrength={sculptBrushStrength}
                    onSculptEnd={async () => {
                        if (!terrainData || !terrainData.canvas) return;
                        try {
                            const base64 = terrainData.canvas.toDataURL('image/jpeg', 0.8);
                            const url = await storeChunkedMap(base64, `sculpted_${Date.now()}.jpg`);
                            updateMap(campaignCode, activeMapId, { heightmapUrl: url });
                        } catch (err) {
                            console.error("Failed to upload sculpted terrain", err);
                        }
                    }}
                />
                <MaterialPainterController
                    isEnabled={activeTool === 'paintMaterial'}
                    materialData={materialData}
                    mapData={mapData}
                    aspect={aspect}
                    brushSize={materialBrushSize}
                    brushColor={materialBrushType}
                    brushShape={materialBrushShape}
                    brushSoftness={materialBrushSoftness}
                    limitToGround={materialLimitToGround}
                    getTerrainHeight={getTerrainHeight}
                    onPaintEnd={async () => {
                        if (!materialData || !materialData.canvas) return;
                        try {
                            const base64 = materialData.canvas.toDataURL('image/png'); // Needs to be lossless PNG to retain solid colors
                            const url = await storeChunkedMap(base64, `material_${Date.now()}.png`);
                            updateMap(campaignCode, activeMapId, { materialMaskUrl: url });
                        } catch (err) { console.error("Failed to upload material mask", err); }
                    }}
                />
            </Suspense>
        )}
        
        {activeStampingAsset && (
            <Suspense fallback={null}>
                <StampingController 
                    isEnabled={!!activeStampingAsset}
                    asset={activeStampingAsset}
                    getTerrainHeight={getTerrainHeight}
                    gridSize={gridSize}
                    isSnapToGrid={false}
                    onStamp={(pt, asset) => {
                        const newPropId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const propData = {
                            id: newPropId,
                            name: asset.name || 'New Prop',
                            x: pt.x, y: pt.y, z: pt.z, // Use the literal dropped y
                            image: asset.generatedMapUrl || asset.url || asset.image || '',
                            scale: 1.0,
                            elevation: 0,
                            rotation: 0,
                            is3D: asset.is3D || false,
                            modelUrl: asset.modelUrl || null,
                            isLocked: false,
                            hasCollision: true
                        };
                        updateMap(campaignCode, activeMapId, {
                            [`props.${newPropId}`]: propData
                        });
                    }}
                />
            </Suspense>
        )}

        {/* MapControls maps left-click to pan, right-click to rotate, scroll to zoom */}
        <MapControls 
          makeDefault 
          maxPolarAngle={Math.PI / 2 - 0.05} // Prevent camera from going under the board
          minDistance={1} // Limit max zoom in
          maxDistance={500} // Limit max zoom out so large maps can still "Fit to Screen"
          enableDamping={true} // Smooth camera movements
          enableRotate={false}
        />
        <CameraController ref={cameraControllerRef} view={viewMode} />
        <Suspense fallback={null}>
            <ZoomHandler zoomRef={zoomRef} />
        </Suspense>
        <ViewManager 
            aspect={aspect} 
            scale={mapData?.scale || 20} 
            orientation={orientation} 
            fitTrigger={fitTrigger} 
        />
      </Canvas>

      {/* Floating Action Button for active stamp tool */}
      {activeStampingAsset && !isCastMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70]">
              <button 
                  onClick={() => setActiveStampingAsset(null)}
                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-full font-bold shadow-xl flex items-center gap-2 transition-colors border border-red-800"
              >
                  <Icon name="x" size={16}/> Cancel Stamp (Esc)
              </button>
          </div>
      )}

      {/* Top-Left: Connection & Camera Controls */}
      {!isCastMode && (
          <div className={`absolute top-4 left-4 vtt-safe-top vtt-safe-left z-[70] flex flex-col gap-2 items-start ${uiOpacityClass}`}>
              {/* Row 1: Connection Status & Navigation */}
              <div className="flex items-center gap-2">
                  {onBack && (
                      <button 
                          onClick={onBack} 
                          className="h-10 px-3 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl shadow-2xl flex items-center justify-center text-slate-300 hover:text-white hover:border-amber-500 transition-colors"
                          title="Back to Previous View"
                      >
                          <Icon name="arrow-left" size={18} />
                      </button>
                  )}
                  <div className="h-10 px-3 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl shadow-2xl flex items-center gap-2 cursor-help hover:border-indigo-500 transition-colors" title={`Connected to Realm: ${campaignCode}`}>
                      <div className="w-2 h-2 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] bg-green-500"></div>
                      <span className="text-sm font-bold text-amber-500 fantasy-font tracking-widest">{campaignCode}</span>
                  </div>
              </div>
              
              {/* Row 2: View Modes */}
              <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-md border border-slate-700 p-1 rounded-xl shadow-2xl h-10">
                  <ToolButton name="Reset View" icon="camera" onClick={() => { cameraControllerRef.current?.reset(); }} title="Reset Camera" />
                  <div className="w-px h-5 bg-slate-700 mx-1"></div>
                  <ToolButton name={viewMode === 'isometric' ? 'Switch to Top-Down (V)' : 'Switch to Isometric (V)'} icon={viewMode === 'isometric' ? 'layout-grid' : 'box'} onClick={() => setViewMode(prev => prev === 'isometric' ? 'top-down' : 'isometric')} title={viewMode === 'isometric' ? 'Switch to Top-Down (V)' : 'Switch to Isometric (V)'} />
                  <ToolButton name="Toggle Fullscreen" icon={isFullscreen ? "minimize" : "maximize"} onClick={toggleFullscreen} title="Toggle Fullscreen" />
              </div>

          {/* Row 3: Zoom Controls */}
          <div className="flex flex-row items-center gap-1 bg-slate-900/80 backdrop-blur-md border border-slate-700 p-1 rounded-xl shadow-2xl h-10">
              <ToolButton name="Zoom Out" icon="zoom-out" onClick={() => zoomRef.current?.zoomOut()} title="Zoom Out" />
              <ToolButton name="Zoom In" icon="zoom-in" onClick={() => zoomRef.current?.zoomIn()} title="Zoom In" />
              <div className="w-px h-5 bg-slate-700 mx-1"></div>
              <ToolButton name="Fit to Screen" icon="expand" onClick={() => setFitTrigger(p => p + 1)} title="Fit Map to Screen" />
              <ToolButton 
                  name="Rotate View" 
                  icon="rotate-cw" 
                  onClick={() => updateMap(campaignCode, activeMapId, { 'orientation': ((mapData?.orientation || 0) + 1) % 4 })} 
                  title="Rotate Map Orientation" 
              />
          </div>
          </div>
      )}

      <Suspense fallback={null}>
        {!isCastMode && <CombatRibbon combat={data?.campaign?.combat} updateCampaign={updateCampaign} tokens={tokensList} role={role} campaignData={data?.campaign} className={uiOpacityClass} />}
      </Suspense>

      {showInitiativeTracker && !isCastMode && (
        <Suspense fallback={null}>
          <CombatTrackerSidebar combat={data?.campaign?.combat} updateCampaign={updateCampaign} tokens={tokensList} role={role} campaignCode={campaignCode} activeMapId={activeMapId} campaignData={data?.campaign} allCharacters={allCharacters} data={data} onOpenSheet={onOpenSheet} className={uiOpacityClass} onClose={() => setShowInitiativeTracker(false)} />
        </Suspense>
      )}

      {/* Primary Right Dock */}
      {!isCastMode && (
          <div className={`absolute top-4 right-4 vtt-safe-right z-[70] flex flex-col gap-2 ${uiOpacityClass}`}>
                  {role === 'dm' && (
                      <>
                      <ToolButton name="Tokens" icon="users" isActive={showTokenManager} onClick={() => { setActiveTool(null); setShowAssetManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowTokenManager(p => !p); }} isStandalone={true} />
                      <ToolButton name="Map" icon="map" isActive={showAssetManager} onClick={() => { setActiveTool(null); setShowTokenManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowAssetManager(p => !p); }} isStandalone={true} />
                      <ToolButton 
                          name="Combat" 
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
                      {!isCastMode && (
                          <ToolButton 
                              name="Cast to TV" 
                              icon="monitor" 
                              onClick={() => {
                                  if (onOpenCast) onOpenCast();
                                  else {
                                      const url = new URL(window.location.href);
                                      if (url.hash) {
                                          url.hash += url.hash.includes('?') ? '&cast=true' : '?cast=true';
                                      } else {
                                          url.searchParams.set('cast', 'true');
                                      }
                                      window.open(url.toString(), 'DungeonMindCast');
                                  }
                              }} 
                              isStandalone={true} 
                          />
                      )}
                      <div className="h-px w-8 bg-slate-700/50 my-1 mx-auto"></div>
                  </>
              )}

              {onOpenDiceTray && <ToolButton name="Dice" icon="dices" onClick={onOpenDiceTray} isStandalone={true} />}
              {onOpenHandouts && <ToolButton name="Handouts" icon="scroll" onClick={onOpenHandouts} isStandalone={true} />}
              {onOpenChat && <ToolButton name="Chat" icon="message-circle" onClick={onOpenChat} isStandalone={true} />}
              {onOpenJournal && <ToolButton name="Journal" icon="book" onClick={onOpenJournal} isStandalone={true} />}
              
              <div className="h-px w-8 bg-slate-700/50 my-1 mx-auto"></div>

              {/* Map Tools */}
              <div className="relative group flex justify-center">
                  <ToolButton 
                      name="Measure" 
                      icon="ruler" 
                      isActive={['freehand', 'freehand-linger', 'ruler', 'ruler-linger', 'cone', 'cone-linger', 'circle', 'circle-linger', 'box', 'box-linger'].includes(activeTool) || isDrawingFreehand || !!activeStampingAsset} 
                      onClick={() => setIsToolbarOpen(p => p === 'measure' ? null : 'measure')} 
                      isStandalone={true} 
                  />
                  {isToolbarOpen === 'measure' && (
                      <div className="absolute top-1/2 right-[110%] -translate-y-1/2 flex items-center gap-2">
                          {isDrawingFreehand && (
                              <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-2 rounded-full shadow-2xl animate-in slide-in-from-right-2">
                                  <input type="color" value={drawingColor} onChange={e => setDrawingColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" title="Color" />
                                  <input type="range" min="1" max="20" value={drawingLineWidth} onChange={e => setDrawingLineWidth(Number(e.target.value))} className="w-24 accent-amber-500" title="Line Width" />
                                  <div className="w-px h-4 bg-slate-700"></div>
                                  <ToolButton name="clear-drawings" icon="trash-2" onClick={() => { if (window.confirm("Clear all map drawings?")) { updateMap(campaignCode, activeMapId, { drawings: {} }); } }} title="Clear All Drawings" />
                              </div>
                          )}

                          {activeTool && activeTool.includes('-linger') && activeTool !== 'ruler-linger' && (
                              <div className="flex gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-1 rounded-full shadow-2xl animate-in slide-in-from-right-2">
                                  <ToolButton name="style-default" icon="mouse-pointer-2" isActive={activeMeasurementStyle === 'default'} onClick={() => setActiveMeasurementStyle('default')} title="Standard" />
                                  <ToolButton name="style-fire" icon="flame" isActive={activeMeasurementStyle === 'fire'} onClick={() => setActiveMeasurementStyle('fire')} title="Fire" />
                                  <ToolButton name="style-ice" icon="snowflake" isActive={activeMeasurementStyle === 'ice'} onClick={() => setActiveMeasurementStyle('ice')} title="Ice" />
                                  <ToolButton name="style-web" icon="box-select" isActive={activeMeasurementStyle === 'web'} onClick={() => setActiveMeasurementStyle('web')} title="Web" />
                                  <ToolButton name="style-poison" icon="skull" isActive={activeMeasurementStyle === 'poison'} onClick={() => setActiveMeasurementStyle('poison')} title="Poison" />
                                  <ToolButton name="style-radiant" icon="sun" isActive={activeMeasurementStyle === 'radiant'} onClick={() => setActiveMeasurementStyle('radiant')} title="Radiant" />
                              </div>
                          )}

                          <div className="flex gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-1 rounded-full shadow-2xl animate-in slide-in-from-right-2">
                              <ToolButton 
                                  name="Stamp Measurement" 
                                  icon="stamp" 
                                  isActive={activeTool && activeTool.includes('-linger')} 
                                  onClick={() => {
                                      setActiveTool(prev => {
                                          if (!prev) return null;
                                          return prev.includes('-linger') ? prev.replace('-linger', '') : `${prev}-linger`;
                                      });
                                  }} 
                                  title="Leave Measurements on Map (Toggle Stamp)" 
                              />

                              <div className="w-px h-6 bg-slate-700 self-center mx-1"></div>

                              <ToolButton name="freehand" icon="pen-tool" isActive={activeTool === 'freehand' || activeTool === 'freehand-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setIsDrawingFreehand(false); setActiveTool(p => (p === 'freehand' || p === 'freehand-linger') ? null : (p?.includes('-linger') ? 'freehand-linger' : 'freehand')); }} title="Measure Freehand" />
                              <ToolButton name="ruler" icon="ruler" isActive={activeTool === 'ruler' || activeTool === 'ruler-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setIsDrawingFreehand(false); setActiveTool(p => (p === 'ruler' || p === 'ruler-linger') ? null : (p?.includes('-linger') ? 'ruler-linger' : 'ruler')); }} />
                              <ToolButton name="cone" icon="triangle" isActive={activeTool === 'cone' || activeTool === 'cone-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setIsDrawingFreehand(false); setActiveTool(p => (p === 'cone' || p === 'cone-linger') ? null : (p?.includes('-linger') ? 'cone-linger' : 'cone')); }} />
                              <ToolButton name="circle" icon="circle" isActive={activeTool === 'circle' || activeTool === 'circle-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setIsDrawingFreehand(false); setActiveTool(p => (p === 'circle' || p === 'circle-linger') ? null : (p?.includes('-linger') ? 'circle-linger' : 'circle')); }} />
                              <ToolButton name="box" icon="square" isActive={activeTool === 'box' || activeTool === 'box-linger'} onClick={() => { if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); } setIsDrawingFreehand(false); setActiveTool(p => (p === 'box' || p === 'box-linger') ? null : (p?.includes('-linger') ? 'box-linger' : 'box')); }} />
                          </div>
                      </div>
                  )}
              </div>
              
              {role === 'dm' && (
                  <div className="relative group flex justify-center">
                      <ToolButton
                          name="Sculpt" icon="mountain" isActive={activeTool === 'sculpt'} isStandalone={true}
                          onClick={() => {
                              setIsToolbarOpen(p => p === 'sculpt' ? null : 'sculpt');
                              if (activeTool !== 'sculpt') {
                                  setActiveTool('sculpt'); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setIsDeleting(false);
                              } else { setActiveTool(null); }
                          }}
                      />
                      {isToolbarOpen === 'sculpt' && (
                          <div className="absolute top-1/2 right-[110%] -translate-y-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-2 rounded-full shadow-2xl animate-in slide-in-from-right-2">
                              <ToolButton name="Raise" icon="arrow-up" isActive={sculptBrushType === 'raise'} onClick={() => setSculptBrushType('raise')} title="Raise" />
                              <ToolButton name="Lower" icon="arrow-down" isActive={sculptBrushType === 'lower'} onClick={() => setSculptBrushType('lower')} title="Lower" />
                              <ToolButton name="Flatten" icon="minus" isActive={sculptBrushType === 'flatten'} onClick={() => setSculptBrushType('flatten')} title="Flatten" />
                              <ToolButton name="Smooth" icon="waves" isActive={sculptBrushType === 'smooth'} onClick={() => setSculptBrushType('smooth')} title="Smooth" />
                              <div className="w-px h-6 bg-slate-700 mx-1"></div>
                              <input type="range" min="0.5" max="10" step="0.5" value={sculptBrushSize} onChange={e => setSculptBrushSize(Number(e.target.value))} className="w-20 accent-amber-500" title="Brush Size" />
                              <input type="range" min="0.01" max="0.2" step="0.01" value={sculptBrushStrength} onChange={e => setSculptBrushStrength(Number(e.target.value))} className="w-20 accent-blue-500" title="Brush Strength" />
                          </div>
                      )}
                  </div>
              )}

              {role === 'dm' && (
                  <div className="relative group flex justify-center">
                      <ToolButton
                          name="Paint Effects" icon="brush" isActive={activeTool === 'paintMaterial'} isStandalone={true}
                          onClick={() => {
                              setIsToolbarOpen(p => p === 'paintMaterial' ? null : 'paintMaterial');
                              if (activeTool !== 'paintMaterial') {
                                  setActiveTool('paintMaterial'); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setIsDeleting(false);
                              } else { setActiveTool(null); }
                          }}
                      />
                      {isToolbarOpen === 'paintMaterial' && (
                          <div className="absolute top-1/2 right-[110%] -translate-y-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-2 rounded-full shadow-2xl animate-in slide-in-from-right-2">
                              <ToolButton name="Grass" icon="leaf" isActive={materialBrushType === '#00FF00'} onClick={() => setMaterialBrushType('#00FF00')} title="Grass (Green)" />
                              <ToolButton name="Trees" icon="tree-pine" isActive={materialBrushType === '#FF00FF'} onClick={() => setMaterialBrushType('#FF00FF')} title="Trees (Magenta)" />
                              <ToolButton name="Water" icon="droplets" isActive={materialBrushType === '#0000FF'} onClick={() => setMaterialBrushType('#0000FF')} title="Water (Blue)" />
                              <ToolButton name="Lava" icon="flame" isActive={materialBrushType === '#FF0000'} onClick={() => setMaterialBrushType('#FF0000')} title="Lava (Red)" />
                              <ToolButton name="Ice" icon="snowflake" isActive={materialBrushType === '#FFFF00'} onClick={() => setMaterialBrushType('#FFFF00')} title="Ice (Yellow)" />
                              <div className="w-px h-6 bg-slate-700 mx-1"></div>
                              <ToolButton name="Erase" icon="eraser" isActive={materialBrushType === '#000000'} onClick={() => setMaterialBrushType('#000000')} title="Erase (Black)" />
                              <div className="w-px h-6 bg-slate-700 mx-1"></div>
                              <ToolButton name="Circle Brush" icon="circle" isActive={materialBrushShape === 'circle'} onClick={() => setMaterialBrushShape('circle')} title="Circle Brush" />
                              <ToolButton name="Square Brush" icon="square" isActive={materialBrushShape === 'square'} onClick={() => setMaterialBrushShape('square')} title="Square Brush" />
                              <ToolButton name="Ground Only" icon="mountain" isActive={materialLimitToGround} onClick={() => setMaterialLimitToGround(p => !p)} title="Limit to Ground (Don't paint walls)" />
                              <div className="w-px h-6 bg-slate-700 mx-1"></div>
                              <input type="range" min="2" max="100" step="2" value={materialBrushSize} onChange={e => setMaterialBrushSize(Number(e.target.value))} className="w-20 accent-amber-500" title="Brush Size" />
                              <input type="range" min="0" max="1" step="0.1" value={materialBrushSoftness} onChange={e => setMaterialBrushSoftness(Number(e.target.value))} className="w-20 accent-blue-500" title="Brush Softness" />
                          </div>
                      )}
                  </div>
              )}

              {role === 'dm' && (
                  <div className="relative group flex justify-center">
                      <ToolButton 
                          name="Architect" 
                          icon="hammer" 
                          isActive={isArchitectMode || isDrawingWalls || isPlacingLights || isDeleting} 
                          onClick={() => setIsToolbarOpen(p => p === 'architect' ? null : 'architect')} 
                          isStandalone={true} 
                      />
                      {isToolbarOpen === 'architect' && (
                          <div className="absolute top-1/2 right-[110%] -translate-y-1/2 flex items-center gap-2">
                              {isDrawingWalls && (
                                  <div className="flex gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-1 rounded-full shadow-2xl animate-in slide-in-from-right-2">
                                      <ToolButton name="wall" icon="square" isActive={drawingWallType === 'wall'} onClick={() => setDrawingWallType('wall')} title="Wall" />
                                      <ToolButton name="door" icon="door-closed" isActive={drawingWallType === 'door'} onClick={() => setDrawingWallType('door')} title="Door" />
                                      <ToolButton name="window" icon="layout" isActive={drawingWallType === 'window'} onClick={() => setDrawingWallType('window')} title="Window" />
                                  </div>
                              )}
                              <div className="flex gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-1 rounded-full shadow-2xl animate-in slide-in-from-right-2">
                                  <ToolButton name="architect" icon="pen-tool" isActive={isArchitectMode} onClick={() => { setActiveTool(null); setIsDrawingWalls(false); setIsPlacingLights(false); setIsArchitectMode(p => !p); }} />
                                  <ToolButton name="draw" icon="pencil" isActive={isDrawingWalls} onClick={() => { setActiveTool(null); setIsArchitectMode(false); setIsPlacingLights(false); setIsDrawingWalls(p => !p); }} />
                                  <ToolButton name="light" icon="lightbulb" isActive={isPlacingLights} onClick={() => { setActiveTool(null); setIsArchitectMode(false); setIsDrawingWalls(false); setIsPlacingLights(p => !p); }} />
                                  <ToolButton name="delete" icon="trash-2" isActive={isDeleting} onClick={() => {
                                      if (isDeleting && (selectedWalls.length > 0 || selectedLights.length > 0 || selectedTokenIds.length > 0)) {
                                          let updates = {};
                                          let changed = false;

                                          if (selectedWalls.length > 0) {
                                              selectedWalls.forEach(id => updates[`walls.${id}`] = null);
                                              changed = true;
                                          }
                                          if (selectedLights.length > 0) {
                                              selectedLights.forEach(id => updates[`lights.${id}`] = null);
                                              changed = true;
                                          }
                                          if (selectedTokenIds.length > 0) {
                                              selectedTokenIds.forEach(id => updates[`tokens.${id}`] = null);
                                              changed = true;
                                          }

                                          if (changed) {
                                              updateMap(campaignCode, activeMapId, updates);
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
                          </div>
                      )}
                  </div>
              )}
          </div>
      )}

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
                                    <img src={getProxiedImageUrl(p.image)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={p.name} draggable={false} />
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
                                      {p.image ? <img src={getProxiedImageUrl(p.image)} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{p.name?.[0] || '?'}</div>}
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
                                    <img src={getProxiedImageUrl(n.image)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={n.name} draggable={false} />
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
                                      {n.image ? <img src={getProxiedImageUrl(n.image)} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{n.name?.[0] || '?'}</div>}
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
        <Suspense fallback={null}>
          <AssetManager 
            campaignCode={campaignCode} 
            mapData={mapData}
            activeMapId={activeMapId}
            updateMap={updateMap}
            allCharacters={allCharacters}
            campaignData={data}
            updateCampaign={updateCampaign}
            onSelectStamper={(asset) => {
               setActiveStampingAsset(asset);
               setShowAssetManager(false);
            }}
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
        </Suspense>
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

            {contextMenu.characterId && onOpenSheet && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors flex items-center gap-2"
                onClick={() => {
                  if (onOpenSheet) {
                      const token = tokensList.find(t => t.id === contextMenu.tokenId);
                      const char = allCharacters.find(c => String(c.id) === String(contextMenu.characterId));
                      const hp = token?.hp?.current ?? char?.hp?.current ?? null;
                      const maxHp = token?.hp?.max ?? char?.hp?.max ?? null;
                      onOpenSheet({ isToken: true, tokenId: contextMenu.tokenId, characterId: contextMenu.characterId, hp, maxHp, initialTab: 'bio' });
                  }
                  setContextMenu(null);
                }}
              >
                <Icon name="box" size={14} className="text-amber-400" /> Model Editor
              </button>
            )}
            
            {/* Reset Elevation is only visible if the token is currently flying */}
            {Math.abs(contextMenu.elevationOffset || 0) > 0.01 && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-blue-400 font-bold"
                onClick={() => {
                  const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                  const updates = {};
                  idsToUpdate.forEach(id => {
                      const t = mapData.tokens[id];
                      if (!t) return;
                      const tokenSize = t.size || 1;
                      const radius = (tokenSize * gridSize) / 2;
                      const terrainY = getTerrainHeight(t.x, t.z, radius);
                      const tokenBaseOffset = (isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12);
                      updates[`tokens.${id}.elevationOffset`] = 0;
                      updates[`tokens.${id}.y`] = terrainY + tokenBaseOffset;
                  });
                  updateMap(campaignCode, activeMapId, updates);
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
                      const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                      const updates = {};
                      idsToUpdate.forEach(id => updates[`tokens.${id}.name`] = newName);
                      updateMap(campaignCode, activeMapId, updates);
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
                    const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                    const updates = {};
                    idsToUpdate.forEach(id => updates[`tokens.${id}.isHidden`] = !contextMenu.isHidden);
                    updateMap(campaignCode, activeMapId, updates);
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
                            const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                            const updates = {};
                            let newElevationForMenu = contextMenu.elevationOffset || 0;
                            idsToUpdate.forEach(id => {
                                const token = mapData.tokens[id];
                                if (!token) return;
                                const newElevation = (token.elevationOffset || 0) - 1;
                                const tokenSize = token.size || 1;
                                const radius = (tokenSize * gridSize) / 2;
                                const terrainY = getTerrainHeight(token.x, token.z, radius);
                                const tokenBaseOffset = (isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12);
                                const newY = terrainY + newElevation + tokenBaseOffset;
                                updates[`tokens.${id}.elevationOffset`] = newElevation;
                                updates[`tokens.${id}.y`] = newY;
                                if (id === contextMenu.tokenId) newElevationForMenu = newElevation;
                            });
                            if (Object.keys(updates).length > 0) {
                                updateMap(campaignCode, activeMapId, updates);
                            }
                            setContextMenu(prev => ({ ...prev, elevationOffset: newElevationForMenu }));
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="minus" size={12}/></button>
                        <span className="text-sm font-bold w-12 text-center tabular-nums">{Math.round((contextMenu.elevationOffset || 0) * 5)} ft</span>
                        <button onClick={() => {
                            const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                            const updates = {};
                            let newElevationForMenu = contextMenu.elevationOffset || 0;
                            idsToUpdate.forEach(id => {
                                const token = mapData.tokens[id];
                                if (!token) return;
                                const newElevation = (token.elevationOffset || 0) + 1;
                                const tokenSize = token.size || 1;
                                const radius = (tokenSize * gridSize) / 2;
                                const terrainY = getTerrainHeight(token.x, token.z, radius);
                                const tokenBaseOffset = (isCastMode || !mapData?.heightmapUrl) ? 0.04 : (mapData?.tokenElevationOffset ?? -0.12);
                                const newY = terrainY + newElevation + tokenBaseOffset;
                                updates[`tokens.${id}.elevationOffset`] = newElevation;
                                updates[`tokens.${id}.y`] = newY;
                                if (id === contextMenu.tokenId) newElevationForMenu = newElevation;
                            });
                            if (Object.keys(updates).length > 0) {
                                updateMap(campaignCode, activeMapId, updates);
                            }
                            setContextMenu(prev => ({ ...prev, elevationOffset: newElevationForMenu }));
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
                            const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                            const updates = {};
                            idsToUpdate.forEach(id => updates[`tokens.${id}.color`] = newColor);
                            updateMap(campaignCode, activeMapId, updates);
                            setContextMenu(prev => ({ ...prev, color: newColor })); // Keep menu open and update color instantly
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
                            const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                            const updates = {};
                            idsToUpdate.forEach(id => updates[`tokens.${id}.size`] = newSize);
                            updateMap(campaignCode, activeMapId, updates);
                            setContextMenu(prev => ({ ...prev, size: newSize })); // Keeps menu open!
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="minus" size={12}/></button>
                        <span className="text-sm font-bold w-6 text-center tabular-nums">{contextMenu.size || 1}</span>
                        <button onClick={() => {
                            const newSize = (contextMenu.size || 1) + 0.5;
                            const idsToUpdate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                            const updates = {};
                            idsToUpdate.forEach(id => updates[`tokens.${id}.size`] = newSize);
                            updateMap(campaignCode, activeMapId, updates);
                            setContextMenu(prev => ({ ...prev, size: newSize })); // Keeps menu open!
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="plus" size={12}/></button>
                    </div>
                </div>
              </>
            )}
            
            {role === 'dm' && (
              <>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors flex items-center gap-2 text-indigo-400"
                  onClick={() => {
                    const idsToDuplicate = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? selectedTokenIds : [contextMenu.tokenId];
                    const updates = {};
                    idsToDuplicate.forEach(id => {
                        const originalToken = mapData.tokens[id];
                        if (originalToken) {
                            const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                            updates[`tokens.${newTokenId}`] = {
                                ...originalToken,
                                id: newTokenId,
                                x: (originalToken.x || 0) + (gridSize || 1), // Offset by 1 grid size
                                z: (originalToken.z || 0) + (gridSize || 1)
                            };
                        }
                    });
                    if (Object.keys(updates).length > 0) {
                        updateMap(campaignCode, activeMapId, updates);
                    }
                    setContextMenu(null);
                  }}
                >
                  <Icon name="copy" size={14}/>
                  {selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? `Duplicate Selected (${selectedTokenIds.length})` : "Duplicate Token"}
                </button>
                
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
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}`]: null });
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
                        updateMap(campaignCode, activeMapId, { [`lights.${lightContextMenu.lightId}`]: null });
                        setLightContextMenu(null);
                    }}
                >
                    <Icon name="trash-2" size={14}/> Delete Light
                </button>
            </div>
        </>
      )}

      {propContextMenu && (
        <>
            <div 
                className="fixed inset-0 z-40" 
                onClick={() => setPropContextMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setPropContextMenu(null); }}
            ></div>
            <div 
                ref={propMenuRef}
                className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[220px] overflow-hidden"
                style={{ top: propMenuDisplayPosition.y, left: propMenuDisplayPosition.x, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto' }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="text-xs uppercase font-bold text-slate-500 px-4 py-1 flex justify-between items-center">
                    Map Prop
                    <button onClick={() => setPropContextMenu(null)} className="text-slate-400 hover:text-white"><Icon name="x" size={14}/></button>
                </div>
                <div className="border-t border-slate-700 my-1"></div>

                <div className="px-4 py-2">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-300 text-xs font-bold">Scale</span>
                        <span className="text-xs text-amber-500 font-bold tabular-nums">{(mapData.props[propContextMenu.propId]?.scale || 1.0).toFixed(3)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.001" 
                        max="10.0" 
                        step="0.001" 
                        value={mapData.props[propContextMenu.propId]?.scale || 1.0} 
                        onChange={(e) => {
                            updateMap(campaignCode, activeMapId, { [`props.${propContextMenu.propId}.scale`]: Number(e.target.value) });
                        }}
                        className="w-full accent-amber-500"
                    />
                </div>

                <div className="px-4 py-2">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-300 text-xs font-bold">Elevation</span>
                        <span className="text-xs text-amber-500 font-bold tabular-nums">{mapData.props[propContextMenu.propId]?.elevation || 0}</span>
                    </div>
                    <input 
                        type="range" 
                        min="-2" 
                        max="10" 
                        step="0.1" 
                        value={mapData.props[propContextMenu.propId]?.elevation || 0} 
                        onChange={(e) => {
                            updateMap(campaignCode, activeMapId, { [`props.${propContextMenu.propId}.elevation`]: Number(e.target.value) });
                        }}
                        className="w-full accent-amber-500"
                    />
                </div>

                <div className="px-4 py-2">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-300 text-xs font-bold">Rotation</span>
                        <span className="text-xs text-amber-500 font-bold tabular-nums">{mapData.props[propContextMenu.propId]?.rotation || 0}°</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="359" 
                        step="1" 
                        value={mapData.props[propContextMenu.propId]?.rotation || 0} 
                        onChange={(e) => {
                            updateMap(campaignCode, activeMapId, { [`props.${propContextMenu.propId}.rotation`]: Number(e.target.value) });
                        }}
                        className="w-full accent-amber-500"
                    />
                </div>
                
                <div className="border-t border-slate-700 my-1"></div>
                <button
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors flex items-center justify-between"
                    onClick={() => {
                        const isLocked = mapData.props[propContextMenu.propId]?.isLocked;
                        updateMap(campaignCode, activeMapId, { [`props.${propContextMenu.propId}.isLocked`]: !isLocked });
                        setPropContextMenu(null);
                    }}
                >
                    <span className="flex items-center gap-2"><Icon name={mapData.props[propContextMenu.propId]?.isLocked ? "lock" : "unlock"} size={14}/> Lock Prop</span>
                    <span className="text-xs text-slate-500">{mapData.props[propContextMenu.propId]?.isLocked ? "ON" : "OFF"}</span>
                </button>
                <button
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors flex items-center justify-between"
                    onClick={() => {
                        const hasCollision = mapData.props[propContextMenu.propId]?.hasCollision !== false; // Default true
                        updateMap(campaignCode, activeMapId, { [`props.${propContextMenu.propId}.hasCollision`]: !hasCollision });
                        setPropContextMenu(null);
                    }}
                >
                    <span className="flex items-center gap-2"><Icon name="box" size={14}/> Collision</span>
                    <span className="text-xs text-slate-500">{mapData.props[propContextMenu.propId]?.hasCollision !== false ? "ON" : "OFF"}</span>
                </button>

                <div className="border-t border-slate-700 my-1"></div>
                <button
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors flex items-center gap-2 text-indigo-400"
                    onClick={() => {
                        const originalProp = mapData.props[propContextMenu.propId];
                        if (originalProp) {                            const newPropId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                            const newPropData = {
                                ...originalProp,
                                id: newPropId,
                                x: (originalProp.x || 0) + 1, // Offset by 1 unit so it doesn't perfectly overlap
                                z: (originalProp.z || 0) + 1
                            };
                            updateMap(campaignCode, activeMapId, { [`props.${newPropId}`]: newPropData });
                        }
                        setPropContextMenu(null);
                    }}
                >
                    <Icon name="copy" size={14}/> Duplicate Prop
                </button>

                <div className="border-t border-slate-700 my-1"></div>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors flex items-center gap-2"
                    onClick={() => {
                        updateMap(campaignCode, activeMapId, { [`props.${propContextMenu.propId}`]: null });
                        setPropContextMenu(null);
                    }}
                >
                    <Icon name="trash-2" size={14}/> Delete Prop
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
                      ) : isForging3D ? (
                          <div className="text-center py-10 text-purple-500">
                              <Icon name="loader-2" size={48} className="animate-spin mx-auto mb-4"/>
                              <p className="font-bold animate-pulse">{forge3DStatus}</p>
                          </div>
                      ) : (
                          <>                              <p className="text-slate-400 mb-4 text-sm">We found {availableModels.length} compatible 3D models.</p>
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