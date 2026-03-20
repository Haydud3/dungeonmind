import React, { useState, useEffect, Suspense, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { MapControls, Grid, useTexture, DragControls, Html, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { subscribeToMap, updateMap } from '../utils/mapService';
import AssetManager from './AssetManager';
import Icon from './Icon';
import { retrieveChunkedMap } from '../utils/storageUtils';

const useResolvedUrl = (url) => {
    const [resolvedUrl, setResolvedUrl] = useState(null);
    useEffect(() => {
        if (!url) {
            setResolvedUrl(null);
            return;
        }
        let isActive = true;
        if (url.startsWith('chunked:')) {
            let objectUrl = null;
            retrieveChunkedMap(url).then(blob => {
                if (isActive && blob) {
                    objectUrl = URL.createObjectURL(blob);
                    setResolvedUrl(objectUrl);
                }
            }).catch(console.error);
            return () => { 
                isActive = false; 
                if (objectUrl) URL.revokeObjectURL(objectUrl); 
            };
        } else {
            setResolvedUrl(url);
        }
        return () => { isActive = false; }
    }, [url]);
    return resolvedUrl;
};

const MapPlaneContent = ({ backgroundUrl, scale = 20 }) => {
  const texture = useTexture(backgroundUrl);
  
  const aspect = texture.image ? texture.image.width / texture.image.height : 1;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[scale * aspect, scale]} />
      <meshBasicMaterial map={texture} transparent={true} />
    </mesh>
  );
};

const MapPlane = ({ backgroundUrl, scale = 20 }) => {
  const resolvedUrl = useResolvedUrl(backgroundUrl);

  if (!resolvedUrl) return null;
  return <MapPlaneContent backgroundUrl={resolvedUrl} scale={scale} />;
};

const HeightmapContent = ({ resolvedHeightmapUrl, resolvedBackgroundUrl, heightScale, scale }) => {
    const heightmapTexture = useTexture(resolvedHeightmapUrl);
    const backgroundTexture = useTexture(resolvedBackgroundUrl);
    
    const aspect = backgroundTexture.image ? backgroundTexture.image.width / backgroundTexture.image.height : 1;
    
    backgroundTexture.wrapS = backgroundTexture.wrapT = THREE.RepeatWrapping;

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[scale * aspect, scale, 256, 256]} />
            <meshStandardMaterial
                map={backgroundTexture}
                displacementMap={heightmapTexture}
                displacementScale={heightScale}
            />
        </mesh>
    );
};

const Heightmap = ({ heightmapUrl, backgroundUrl, heightScale, scale = 20 }) => {
    const resolvedHeightmapUrl = useResolvedUrl(heightmapUrl);
    const resolvedBackgroundUrl = useResolvedUrl(backgroundUrl);

    if (!resolvedHeightmapUrl || !resolvedBackgroundUrl) {
        return null;
    }

    return <HeightmapContent 
        resolvedHeightmapUrl={resolvedHeightmapUrl}
        resolvedBackgroundUrl={resolvedBackgroundUrl}
        heightScale={heightScale}
        scale={scale}
    />
};

// Interactive 3D Token
const Token3D = ({ token, updateTokenPosition, gridSize = 1, isSelected, onSelect, onContextMenu, role }) => {
  const meshRef = useRef();
  // Get access to the MapControls so we can disable panning while dragging
  const { controls } = useThree();
  const [hovered, setHover] = useState(false);
  const [resolvedImage, setResolvedImage] = useState(null);

  // Instantly hide hidden tokens from players
  if (token.isHidden && role !== 'dm') return null;
  const opacity = token.isHidden ? 0.4 : 1;

  // Automatically switch mouse to a pointer when hovering over a token
  useCursor(hovered, 'pointer', 'auto');

  const isPc = token.type === 'pc' || token.characterId;
  const baseColor = isPc ? "#22c55e" : "#ef4444"; // Green for players, red for enemies
  const size = (token.size || 1) * gridSize;
  const scale = hovered ? 1.1 : 1;

  // Resolve chunked database images for tokens
  useEffect(() => {
    const imgUrl = token.image || token.img;
    if (!imgUrl) return;
    if (imgUrl.startsWith('chunked:')) {
      let isActive = true;
      let objectUrl = null;
      retrieveChunkedMap(imgUrl).then(blob => {
        if (isActive && blob) {
          objectUrl = URL.createObjectURL(blob);
          setResolvedImage(objectUrl);
        }
      }).catch(console.error);
      return () => { isActive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    } else {
      setResolvedImage(imgUrl);
    }
  }, [token.image, token.img]);

  return (
    <DragControls
      axisLockY // Prevent tokens from floating up into the sky
      onDragStart={() => {
        if (controls) controls.enabled = false;
      }}
      onDragEnd={() => {
        if (controls) controls.enabled = true;
        if (meshRef.current) {
          const p = meshRef.current.position;
          // Snap to the nearest grid intersection
          const snappedX = Math.round(p.x / gridSize) * gridSize;
          const snappedZ = Math.round(p.z / gridSize) * gridSize;
          updateTokenPosition(token.id, { x: snappedX, y: p.y, z: snappedZ });
        }
      }}
    >
      {/* The base cylinder. Rests perfectly on the y=0 grid plane */}
      <mesh 
        ref={meshRef} 
        position={[token.x || 0, token.y || 0.025, token.z || 0]}
        scale={[scale, scale, scale]}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
        onPointerOut={(e) => setHover(false)}
        onClick={(e) => { e.stopPropagation(); onSelect(token.id); }}
        onContextMenu={(e) => {
          e.stopPropagation();
          if (e.nativeEvent) e.nativeEvent.preventDefault();
          if (onContextMenu) onContextMenu(e, token);
        }}
      >
        <cylinderGeometry args={[size * 0.45, size * 0.45, 0.05, 32]} />
        {/* Boost the emissive glow when hovered so it lights up */}
        <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />

        {/* Selection Ring */}
        {isSelected && (
          <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[size * 0.5, size * 0.55, 32]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
          </mesh>
        )}

        {/* HTML Overlay ensures crisp text/images and ignores WebGL CORS headaches */}
        <Html position={[0, 0.1, 0]} center className="pointer-events-none select-none">
          <div className="flex flex-col items-center drop-shadow-xl">
            {resolvedImage ? (
              <img src={resolvedImage} className="w-12 h-12 rounded-full border-[3px] shadow-lg object-cover" style={{ borderColor: baseColor }} alt="" draggable={false} />
            ) : (
              <div className="w-12 h-12 rounded-full border-[3px] shadow-lg flex items-center justify-center font-bold text-lg bg-slate-800 text-white" style={{ borderColor: baseColor }}>
                {(token.name || "?").substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="bg-slate-950/90 text-white text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap mt-1 border border-white/20 shadow-lg">
              {token.name || "Unknown"}
            </div>
          </div>
        </Html>
      </mesh>
    </DragControls>
  );
};

export default function TacticalMapView({ campaignCode, activeMapId, data, onOpenSheet, role }) {
  const [mapData, setMapData] = useState(null);
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showTokenManager, setShowTokenManager] = useState(false);
  const [showMapSettings, setShowMapSettings] = useState(false);

  // Subscribe to real-time map updates from Firebase
  useEffect(() => {
    if (!campaignCode || !activeMapId) return;
    const unsubscribe = subscribeToMap(campaignCode, activeMapId, (data) => {
      setMapData(data);
    });
    return () => unsubscribe();
  }, [campaignCode, activeMapId]);

  const gridSize = mapData?.gridSize || 1;
  const showPlane = mapData?.backgroundUrl && mapData.backgroundUrl.trim() !== '';
  const tokensList = Object.values(mapData?.tokens || {});
  const allCharacters = [...(data?.players || []), ...(data?.npcs || [])];

  // Handle clicking a token to both select it and open the side sheet
  const handleSelectToken = (tokenId) => {
    setSelectedTokenId(tokenId);
    setContextMenu(null);
    const token = mapData?.tokens?.[tokenId];
    if (token && token.characterId && onOpenSheet) {
      onOpenSheet(token.characterId);
    }
  };

  const handleContextMenu = (e, token) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tokenId: token.id,
      characterId: token.characterId
    });
  };

  // Handler triggered by Token3D when a drag ends
  const handleUpdateTokenPosition = (tokenId, position) => {
    updateMap(campaignCode, activeMapId, {
      [`tokens.${tokenId}.x`]: position.x,
      [`tokens.${tokenId}.y`]: position.y,
      [`tokens.${tokenId}.z`]: position.z,
    });
  };

  // Handle dragging an image from the AssetManager directly onto the map
  const handleDrop = (e) => {
    e.preventDefault();
    
    let payload = null;
    
    try {
       // 1. Try parsing text/plain (Maximum browser compatibility)
       const plainText = e.dataTransfer.getData('text/plain');
       if (plainText) {
          const parsed = JSON.parse(plainText);
          if (parsed.format) payload = parsed;
       }
    } catch(err) { /* Not JSON, ignore */ }

    // 2. Fallback to custom mime types
    if (!payload) {
        const assetDataStr = e.dataTransfer.getData('application/dungeonmind-asset');
        const characterDataStr = e.dataTransfer.getData('application/dungeonmind-character');
        
        if (assetDataStr) {
            payload = { format: 'dungeonmind-asset', ...JSON.parse(assetDataStr) };
        } else if (characterDataStr) {
            payload = { format: 'dungeonmind-character', ...JSON.parse(characterDataStr) };
        }
    }

    if (!payload || !campaignCode || !activeMapId) return;

    const newTokenId = `token_${Date.now()}`;

    if (payload.format === 'dungeonmind-asset' || payload.url) {
        updateMap(campaignCode, activeMapId, {
            [`tokens.${newTokenId}`]: {
                id: newTokenId,
                name: 'New Token',
                type: 'npc',
                x: 0, y: 0, z: 0,
                image: payload.url || payload.image || '',
                size: 1,
                isHidden: false
            }
        });
    } else if (payload.format === 'dungeonmind-character' || payload.characterId || payload.id) {
        updateMap(campaignCode, activeMapId, {
            [`tokens.${newTokenId}`]: {
                id: newTokenId,
                // Safe fallback to prevent undefined crashing Firestore
                characterId: payload.id || null, 
                name: payload.name || 'Unknown',
                type: payload.type || 'npc',
                x: 0, y: 0, z: 0,
                image: payload.image || '',
                size: payload.size || 1,
                isHidden: false
            }
        });
    }
  };

  return (
    <div className="w-full relative bg-slate-950" style={{ height: 'calc(100vh - 80px)', display: 'block' }} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <Canvas 
        camera={{ position: [0, 8, 8], fov: 50 }} 
        style={{ width: '100%', height: '100%' }}
        /* Clear selection and context menu when clicking the background void */
        onPointerMissed={() => {
          setSelectedTokenId(null);
          setContextMenu(null);
        }}
      >
        {/* Explicitly set the 3D scene background color */}
        <color attach="background" args={['#1a1a2e']} />
        
        {/* Lighting setup */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} />
        
        {/* Suspense is required when using useTexture to catch the loading state */}
        <Suspense fallback={null}>
            {mapData?.heightmapUrl ? (
                <Heightmap 
                    heightmapUrl={mapData.heightmapUrl}
                    backgroundUrl={mapData.backgroundUrl}
                    heightScale={mapData.heightScale || 1}
                    scale={mapData.scale || 20}
                />
            ) : (
                showPlane && <MapPlane backgroundUrl={mapData.backgroundUrl} scale={mapData.scale || 20} />
            )}
        </Suspense>

        {/* A visual grid to represent the tactical tabletop surface */}
        <Grid 
          infiniteGrid 
          fadeDistance={40} 
          sectionColor="#666" 
          cellColor="#222" 
          cellSize={gridSize}
          sectionSize={gridSize}
        />

        {/* Render all tokens on the map */}
        {tokensList.map(token => {
          // Find the linked character if one exists
          const character = allCharacters.find(c => String(c.id) === String(token.characterId));
          const displayToken = { ...token };
          
          if (character) {
            displayToken.name = character.name || token.name;
            displayToken.image = character.image || token.image || token.img;
            displayToken.type = data?.players?.some(p => String(p.id) === String(character.id)) ? 'pc' : 'npc';
          }
          return (
            <Token3D 
              key={token.id} 
              token={displayToken} 
              updateTokenPosition={handleUpdateTokenPosition}
              gridSize={gridSize}
              isSelected={selectedTokenId === token.id}
              onSelect={handleSelectToken}
              onContextMenu={handleContextMenu}
              role={role}
            />
          );
        })}

        {/* MapControls maps left-click to pan, right-click to rotate, scroll to zoom */}
        <MapControls 
          makeDefault 
          maxPolarAngle={Math.PI / 2 - 0.05} // Prevent camera from going under the board
          minDistance={3} // Limit max zoom in
          maxDistance={40} // Limit max zoom out
          enableDamping={true} // Smooth camera movements
        />
      </Canvas>

      {/* Toolbar for Map */}
      {role === 'dm' && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={() => { setShowTokenManager(false); setShowAssetManager(false); setShowMapSettings(!showMapSettings); }}
            className={`bg-slate-800 border ${showMapSettings ? 'border-blue-500 text-blue-400' : 'border-slate-600 hover:border-blue-500 text-white'} px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-colors`}
          >
            <Icon name="sliders-horizontal" size={16} /> Map
          </button>
          <button 
            onClick={() => { setShowAssetManager(false); setShowTokenManager(!showTokenManager); setShowMapSettings(false); }}
            className={`bg-slate-800 border ${showTokenManager ? 'border-indigo-500 text-indigo-400' : 'border-slate-600 hover:border-indigo-500 text-white'} px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-colors`}
          >
            <Icon name="users" size={16} /> Actors
          </button>
          <button 
            onClick={() => { setShowTokenManager(false); setShowAssetManager(!showAssetManager); setShowMapSettings(false); }}
            className={`bg-slate-800 border ${showAssetManager ? 'border-amber-500 text-amber-400' : 'border-slate-600 hover:border-amber-500 text-white'} px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-colors`}
          >
            <Icon name="image" size={16} /> Assets
          </button>
        </div>
      )}

      {/* Map Settings Drawer */}
      {showMapSettings && role === 'dm' && (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-bold text-blue-500 flex items-center gap-2"><Icon name="sliders-horizontal" size={18} /> Map Settings</h3>
              <button onClick={() => setShowMapSettings(false)} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4">
              <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Height Scale</label>
                  <input 
                      type="range" 
                      min="0" 
                      max="10" 
                      step="0.1" 
                      value={mapData?.heightScale || 1} 
                      onChange={(e) => updateMap(campaignCode, activeMapId, { heightScale: parseFloat(e.target.value) })}
                      className="w-full"
                  />
                   <button onClick={() => updateMap(campaignCode, activeMapId, { heightmapUrl: null, heightScale: 1 })} className="w-full text-center text-xs text-red-400 hover:text-red-300 mt-2">
                      Remove Heightmap
                   </button>
              </div>
          </div>
        </div>
      )}

      {/* Actors Manager Drawer */}
      {showTokenManager && role === 'dm' && (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-indigo-500 flex items-center gap-2"><Icon name="users" size={18} /> Actors</h3>
                <button onClick={() => setShowTokenManager(false)} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
                <div>
                  <h4 className="text-xs uppercase font-bold text-slate-500 mb-3 tracking-wider">Party</h4>
                  <div className="grid grid-cols-2 gap-3">
                      {data?.players?.map((p, i) => (
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
                                <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-slate-600 bg-slate-700 opacity-80 group-hover:opacity-100 transition-opacity">{p.name[0]}</div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-4 pb-1 px-2 text-[10px] font-bold text-white truncate pointer-events-none text-center shadow-black drop-shadow-md">{p.name}</div>
                          </div>
                      ))}
                      {(!data?.players || data.players.length === 0) && <div className="col-span-2 text-slate-500 text-xs text-center italic">No players found.</div>}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs uppercase font-bold text-slate-500 mb-3 tracking-wider">Bestiary</h4>
                  <div className="grid grid-cols-2 gap-3">
                      {data?.npcs?.map((n, i) => (
                          <div key={`npc-${i}`} draggable 
                              onDragStart={(e) => {
                                  const payload = JSON.stringify({ format: 'dungeonmind-character', id: n.id, name: n.name, type: 'npc', image: n.image, size: n.size || 1 });
                                  e.dataTransfer.setData('application/dungeonmind-character', payload);
                                  e.dataTransfer.setData('text/plain', payload);
                              }}
                              className="aspect-square bg-slate-800 rounded-lg border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-red-500 transition-colors relative group shadow-lg"
                          >
                              {n.image ? (
                                <img src={n.image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={n.name} draggable={false} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-slate-600 bg-slate-700 opacity-80 group-hover:opacity-100 transition-opacity">{n.name[0]}</div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-4 pb-1 px-2 text-[10px] font-bold text-white truncate pointer-events-none text-center shadow-black drop-shadow-md">{n.name}</div>
                          </div>
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
          onClose={() => setShowAssetManager(false)} 
          onSetBackground={(url) => updateMap(campaignCode, activeMapId, { backgroundUrl: url })}
          onSetHeightmap={(url) => updateMap(campaignCode, activeMapId, { heightmapUrl: url })}
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
            className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[150px] overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {contextMenu.characterId && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors"
                onClick={() => {
                  if (onOpenSheet) onOpenSheet(contextMenu.characterId);
                  setContextMenu(null);
                }}
              >
                Open Sheet
              </button>
            )}
            
            {role === 'dm' && (
              <>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors"
                  onClick={() => {
                    const token = mapData?.tokens?.[contextMenu.tokenId];
                    if (token) updateMap(campaignCode, activeMapId, { [`tokens.${contextMenu.tokenId}.isHidden`]: !token.isHidden });
                    setContextMenu(null);
                  }}
                >
                  {mapData?.tokens?.[contextMenu.tokenId]?.isHidden ? "Reveal to Players" : "Hide from Players"}
                </button>
                
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors"
                  onClick={() => {
                    const newTokens = { ...mapData.tokens };
                    delete newTokens[contextMenu.tokenId];
                    updateMap(campaignCode, activeMapId, { tokens: newTokens });
                    setContextMenu(null);
                  }}
                >
                  Delete Token
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}