import React, { useState, useEffect, Suspense, useRef, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, Grid, useTexture, DragControls, Html, useCursor, Line } from '@react-three/drei';
import * as THREE from 'three';
import { subscribeToMap, updateMap } from '../utils/mapService';
import AssetManager from './AssetManager';
import Icon from './Icon';
import { retrieveChunkedMap } from '../utils/storageUtils';
import CharacterModel from './CharacterModel';

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

const WallSegment = ({ start, end, onContextMenu, wallId }) => {
    const vec = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
    const midpoint = useMemo(() => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5), [start, end]);
    const quat = useMemo(() => {
        const quaternion = new THREE.Quaternion();
        const axis = new THREE.Vector3(0, 1, 0);
        quaternion.setFromUnitVectors(axis, vec.clone().normalize());
        return quaternion;
    }, [vec]);
    
    const length = vec.length();

    return (
        <mesh 
            position={midpoint} 
            quaternion={quat}
            onContextMenu={(e) => {
                e.stopPropagation();
                onContextMenu(e, wallId);
            }}
        >
            <cylinderGeometry args={[0.2, 0.2, length, 8]} />
            <meshBasicMaterial visible={false} />
        </mesh>
    );
};

const Wall = ({ wall, onContextMenu }) => {
    const points = wall.points.map(p => new THREE.Vector3(p.x, p.y, p.z));

    const segments = [];
    if (onContextMenu) {
        for (let i = 0; i < points.length - 1; i++) {
            segments.push(
                <WallSegment 
                    key={i} 
                    start={points[i]} 
                    end={points[i+1]} 
                    onContextMenu={onContextMenu}
                    wallId={wall.id}
                />
            );
        }
    }
    
    return (
        <group>
            <Line points={points} color={'#ff00ff'} lineWidth={5} />
            {segments}
        </group>
    );
};

const Walls = ({ walls, onWallContextMenu }) => {
    if (!walls) return null;
    return (
        <group>
            {Object.values(walls).map(wall => (
                <Wall key={wall.id} wall={wall} onContextMenu={onWallContextMenu} />
            ))}
        </group>
    );
};


const WallDrawingController = ({ isEnabled, onDrawEnd, getTerrainHeight }) => {
    const { controls } = useThree();
    const [isDrawing, setIsDrawing] = useState(false);
    const [points, setPoints] = useState([]);

    useCursor(isEnabled, 'crosshair', 'auto');

    // This effect handles enabling/disabling controls
    useEffect(() => {
        if (controls) {
            controls.enabled = !isDrawing;
        }
    }, [isDrawing, controls]);

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        
        setIsDrawing(true);
        const pt = e.point;
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setPoints([pt]);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled || !isDrawing) return;
        e.stopPropagation();

        const pt = e.point;
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (points.length > 0 && points[points.length-1].distanceTo(pt) < 0.1) return;

        setPoints(prev => [...prev, pt]);
    };

    const handlePointerUp = (e) => {
        if (!isEnabled || !isDrawing || e.button !== 0) return;
        e.stopPropagation();

        setIsDrawing(false);
        
        if (points.length > 1) {
            onDrawEnd(points);
        }
        setPoints([]);
    };
    
    if (!isEnabled) return null;

    return (
        <>
            {/* Show the line being actively drawn */}
            {points.length > 1 && <Line points={points} color="magenta" lineWidth={5} />}

            {/* The large invisible plane to capture drawing events */}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </>
    );
};

const TokenImage = ({ imageUrl, size }) => {
    const texture = useTexture(imageUrl);
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <circleGeometry args={[size * 0.45, 32]} />
            <meshBasicMaterial map={texture} transparent />
        </mesh>
    )
}

// Interactive 3D Token
const Token3D = ({ token, updateTokenPosition, gridSize = 1, isSelected, onSelect, onContextMenu, role, getTerrainHeight }) => {
  const meshRef = useRef();
  const { controls } = useThree();
  const [hovered, setHover] = useState(false);
  const [resolvedImage, setResolvedImage] = useState(null);
  const [isTopDown, setIsTopDown] = useState(false);
  const polarAngleRef = useRef(0);

  const rulerRef = useRef();
  const rulerLabelRef = useRef();
  const rulerTextRef = useRef();

  useFrame(() => {
    if (controls) {
        const newAngle = controls.getPolarAngle();
        if (Math.abs(newAngle - polarAngleRef.current) > 0.01) {
            polarAngleRef.current = newAngle;
            const topDownThreshold = 0.3; // ~17 degrees
            setIsTopDown(newAngle < topDownThreshold);
        }
    }
    
    const isDragging = isLeftDragging.current;

    if (rulerRef.current) rulerRef.current.visible = isDragging;
    if (rulerLabelRef.current) rulerLabelRef.current.visible = isDragging;

    if (meshRef.current && getTerrainHeight && !isRightDragging.current) {
      const p = meshRef.current.position;
      const terrainY = getTerrainHeight(p.x, p.z);
      const targetY = terrainY + (token.elevationOffset || 0) + 0.025;
      
      if (isDragging) {
        p.y = targetY;
        const start = dragStartPos.current;
        const end = p;
        const deltaX = end.x - start.x;
        const deltaZ = end.z - start.z;
        const distSq = deltaX * deltaX + deltaZ * deltaZ;
        
        if (distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            if (rulerRef.current) {
                rulerRef.current.scale.y = dist;
                rulerRef.current.position.copy(start).lerp(end, 0.5);
                rulerRef.current.position.y = Math.max(start.y, end.y) + 0.1;
                const dir = end.clone().sub(start).normalize();
                rulerRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            }
            if (rulerLabelRef.current) {
                rulerLabelRef.current.position.copy(start).lerp(end, 0.5);
                rulerLabelRef.current.position.y = Math.max(start.y, end.y) + 0.4;
                if (rulerTextRef.current) {
                    rulerTextRef.current.innerText = `${Math.round((dist / gridSize) * 5)} ft`;
                }
            }
        } else {
            if (rulerRef.current) rulerRef.current.scale.y = 0.001;
            if (rulerTextRef.current) rulerTextRef.current.innerText = '0 ft';
        }

        const frameDelta = p.clone().sub(previousPos.current);
        frameDelta.y = 0;
        velocity.current.add(frameDelta);
        velocity.current.multiplyScalar(0.8);
        
        if (velocity.current.lengthSq() > 0.0001) {
            targetRotationY.current = Math.atan2(velocity.current.x, velocity.current.z);
        }

        previousPos.current.copy(p);
      } else {
        p.y = THREE.MathUtils.lerp(p.y, targetY, 0.2);
        previousPos.current.copy(p);
        velocity.current.set(0, 0, 0);
      }

      const diff = targetRotationY.current - meshRef.current.rotation.y;
      meshRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.3;
    }
  });

  const showModel = !!token.modelUrl && !isTopDown;

  if (token.isHidden && role !== 'dm') return null;
  const opacity = token.isHidden ? 0.4 : 1;

  useCursor(hovered, 'pointer', 'auto');

  const isPc = token.type === 'pc' || token.characterId;
  const baseColor = isPc ? "#22c55e" : "#ef4444";
  const size = (token.size || 1) * gridSize;
  const scale = hovered ? 1.1 : 1;

  const isRightDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStartY = useRef(0);
  const isLeftDragging = useRef(false);
  const startMouseY = useRef(0);
  const dragStartPos = useRef(new THREE.Vector3());
  const velocity = useRef(new THREE.Vector3());
  const previousPos = useRef(new THREE.Vector3(token.x || 0, token.y || 0.025, token.z || 0));
  const targetRotationY = useRef(token.rotationY || 0);

  useEffect(() => {
    targetRotationY.current = token.rotationY || 0;
  }, [token.rotationY]);

  const handlePointerDown = (e) => {
    if (e.button === 2) {
      e.stopPropagation();
      e.target.setPointerCapture(e.pointerId);
      isRightDragging.current = true;
      hasDragged.current = false;
      dragStartY.current = meshRef.current.position.y;
      startMouseY.current = e.clientY;
      if (controls) controls.enabled = false;
    }
  };

  const handlePointerMove = (e) => {
    if (isRightDragging.current) {
      e.stopPropagation();
      if (Math.abs(e.clientY - startMouseY.current) > 5) {
        hasDragged.current = true;
      }
      const deltaY = -(e.clientY - startMouseY.current) * 0.05;
      meshRef.current.position.y = Math.max(0.025, dragStartY.current + deltaY);
    }
  };

  const handlePointerUp = (e) => {
    if (isRightDragging.current) {
      e.stopPropagation();
      e.target.releasePointerCapture(e.pointerId);
      isRightDragging.current = false;
      if (controls) controls.enabled = true;
      
      if (hasDragged.current && meshRef.current) {
          const p = meshRef.current.position;
          const snappedX = Math.round(p.x / gridSize) * gridSize;
          const snappedZ = Math.round(p.z / gridSize) * gridSize;
          const terrainY = getTerrainHeight ? getTerrainHeight(snappedX, snappedZ) : 0;
          const offset = p.y - terrainY - 0.025;
          const isFlying = Math.abs(offset) > 0.1;
          
          updateTokenPosition(token.id, { 
              x: snappedX, 
              y: p.y, 
              z: snappedZ,
              elevationOffset: isFlying ? offset : 0
          });
      }
    }
  };

  useEffect(() => {
    const imgUrl = token.image || token.img;
    if (!imgUrl) {
        setResolvedImage(null);
        return;
    }
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

  const nameplateY = useMemo(() => {
    // Consistently position it below the token base.
    return -size * 0.7;
}, [size]);

  return (
    <group>
      <mesh ref={rulerRef} visible={false} raycast={() => null}>
        <cylinderGeometry args={[0.08, 0.08, 1, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} depthTest={false} />
      </mesh>
      
      <group ref={rulerLabelRef} visible={false}>
        <Html center className="pointer-events-none select-none z-50">
          <div 
            ref={rulerTextRef} 
            className="bg-amber-600/90 text-white border border-amber-400 text-[10px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap"
          >
            0 ft
          </div>
        </Html>
      </group>

      <DragControls
        axisLock="y"
        onDragStart={() => {
          if (controls) controls.enabled = false;
          isLeftDragging.current = true;
          dragStartPos.current.copy(meshRef.current.position);
          previousPos.current.copy(meshRef.current.position);
          velocity.current.set(0, 0, 0);
        }}
        onDragEnd={() => {
          if (controls) controls.enabled = true;
          isLeftDragging.current = false;
          if (meshRef.current) {
            const p = meshRef.current.position;
            const snappedX = Math.round(p.x / gridSize) * gridSize;
            const snappedZ = Math.round(p.z / gridSize) * gridSize;
            const terrainY = getTerrainHeight ? getTerrainHeight(snappedX, snappedZ) : 0;
            const targetY = terrainY + (token.elevationOffset || 0) + 0.025;
            updateTokenPosition(token.id, { 
              x: snappedX, 
              y: targetY, 
              z: snappedZ,
              elevationOffset: token.elevationOffset || 0,
              rotationY: targetRotationY.current
            });
          }
        }}
      >
        <mesh 
          ref={meshRef} 
          position={[token.x || 0, token.y || 0.025, token.z || 0]}
          scale={[scale, scale, scale]}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
          onPointerOut={(e) => { setHover(false); }}
          onClick={(e) => { e.stopPropagation(); onSelect(token.id); }}
          onContextMenu={(e) => {
            e.stopPropagation();
            if (e.nativeEvent) e.nativeEvent.preventDefault();
            if (!hasDragged.current) {
                if (onContextMenu) onContextMenu(e, token);
            }
          }}
        >
          {showModel && (
            <Suspense fallback={null}>
              <group position={[0, token.modelYOffset || 0, 0]}>
                <CharacterModel modelUrl={token.modelUrl} scale={token.modelScale || 1} />
              </group>
            </Suspense>
          )}

          {!showModel && (
              <>
                {resolvedImage ? (
                    <Suspense fallback={null}>
                        <TokenImage imageUrl={resolvedImage} size={size} />
                    </Suspense>
                ) : (
                    <Html position={[0, 0.03, 0]} center>
                        <div className="w-12 h-12 rounded-full border-[3px] shadow-lg flex items-center justify-center font-bold text-lg bg-slate-800 text-white" style={{ borderColor: baseColor }}>
                            {(token.name || "?").substring(0, 2).toUpperCase()}
                        </div>
                    </Html>
                )}
              </>
          )}

          <Html position={[0, nameplateY, 0]} center occlude="raycast" className="pointer-events-none select-none">
            <div className="bg-slate-950/90 text-white text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap border border-white/20 shadow-lg flex items-center gap-1 justify-center">
                <span>{token.name || "Unknown"}</span>
                {Math.abs(token.elevationOffset || 0) > 0.1 && (
                  <span className="text-blue-400 drop-shadow-md">
                    {token.elevationOffset > 0 ? '+' : ''}{Math.round((token.elevationOffset || 0) * 5)}ft
                  </span>
                )}
            </div>
          </Html>
          
          <cylinderGeometry args={[size * 0.45, size * 0.45, 0.05, 32]} />
          <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />

          <mesh position={[0, 0, size * 0.45]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[size * 0.15, size * 0.2, 3]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />
          </mesh>

          {isSelected && (
            <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[size * 0.5, size * 0.55, 32]} />
              <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
            </mesh>
          )}
        </mesh>
      </DragControls>
    </group>
  );
};

export default function TacticalMapView({ campaignCode, activeMapId, data, onOpenSheet, role }) {
  const [mapData, setMapData] = useState(null);
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showTokenManager, setShowTokenManager] = useState(false);
  const [isDrawingWalls, setIsDrawingWalls] = useState(false);
  const [wallContextMenu, setWallContextMenu] = useState(null);
  
  // Setup CPU-side Terrain Matrix logic
  const [aspect, setAspect] = useState(1);
  const [terrainData, setTerrainData] = useState(null);

  const resolvedBackgroundUrl = useResolvedUrl(mapData?.backgroundUrl);
  const resolvedHeightmapUrl = useResolvedUrl(mapData?.heightmapUrl);

  useEffect(() => {
    if (!resolvedBackgroundUrl) return;
    const img = new Image();
    img.onload = () => setAspect(img.width / img.height || 1);
    img.src = resolvedBackgroundUrl;
  }, [resolvedBackgroundUrl]);

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
    if (!terrainData || !mapData || !mapData.heightmapUrl) return 0;
    const scale = mapData.scale || 20;
    const heightScale = mapData.heightScale || 1;
    
    const u = (x / (scale * aspect)) + 0.5;
    const v = (z / scale) + 0.5;

    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const pixelX = Math.floor(u * terrainData.width);
    const pixelY = Math.floor(v * terrainData.height);
    
    const safeX = Math.max(0, Math.min(pixelX, terrainData.width - 1));
    const safeY = Math.max(0, Math.min(pixelY, terrainData.height - 1));

    const index = (safeY * terrainData.width + safeX) * 4;
    const r = terrainData.data[index];

    return (r / 255.0) * heightScale;
  }, [terrainData, mapData, aspect]);

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
  };

  const handleContextMenu = (e, token) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tokenId: token.id,
      characterId: token.characterId
    });
  };

  const handleWallContextMenu = (e, wallId) => {
    e.stopPropagation();
    setContextMenu(null); // Close token context menu
    setWallContextMenu({
      x: e.clientX,
      y: e.clientY,
      wallId: wallId,
    });
  };

  // Handler triggered by Token3D when a drag ends
  const handleUpdateTokenPosition = (tokenId, position) => {
    const updates = {
      [`tokens.${tokenId}.x`]: position.x,
      [`tokens.${tokenId}.y`]: position.y,
      [`tokens.${tokenId}.z`]: position.z,
    };
    if (position.elevationOffset !== undefined) {
        updates[`tokens.${tokenId}.elevationOffset`] = position.elevationOffset;
    }
    if (position.rotationY !== undefined) {
        updates[`tokens.${tokenId}.rotationY`] = position.rotationY;
    }
    updateMap(campaignCode, activeMapId, updates);
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
        onPointerMissed={(e) => {
          if (isDrawingWalls) return;
          if (e.target.tagName !== 'CANVAS') return;
          setSelectedTokenId(null);
          setContextMenu(null);
          setWallContextMenu(null);
        }}
        onContextMenu={(e) => setWallContextMenu(null)}
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
            displayToken.modelUrl = character.modelUrl;
            displayToken.modelScale = character.modelScale;
            displayToken.modelYOffset = character.modelYOffset;
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
              getTerrainHeight={getTerrainHeight}
            />
          );
        })}

        <Walls walls={mapData?.walls} onWallContextMenu={handleWallContextMenu} />

        {role === 'dm' && (
            <WallDrawingController
                isEnabled={isDrawingWalls}
                getTerrainHeight={getTerrainHeight}
                onDrawEnd={(points) => {
                    const wallId = `wall_${Date.now()}`;
                    const storablePoints = points.map(p => ({ x: p.x, y: p.y, z: p.z }));
                    updateMap(campaignCode, activeMapId, {
                        [`walls.${wallId}`]: { id: wallId, points: storablePoints }
                    });
                }}
            />
        )}

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
            {isDrawingWalls && (
                <button 
                    onClick={() => {
                        if (window.confirm('Are you sure you want to clear all walls?')) {
                            updateMap(campaignCode, activeMapId, { walls: null });
                        }
                    }}
                    className="bg-slate-800 border border-red-500 text-red-400 hover:bg-red-500 hover:text-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-colors"
                >
                    <Icon name="trash-2" size={16} /> Clear Walls
                </button>
            )}
           <button 
            onClick={() => { 
                setShowAssetManager(false); 
                setShowTokenManager(false);
                setIsDrawingWalls(!isDrawingWalls);
            }}
            className={`bg-slate-800 border ${isDrawingWalls ? 'border-blue-500 text-blue-400' : 'border-slate-600 hover:border-blue-500 text-white'} px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-colors`}
          >
            <Icon name="pencil" size={16} /> Draw
          </button>
          <button 
            onClick={() => { setShowAssetManager(false); setShowTokenManager(!showTokenManager); setIsDrawingWalls(false); }}
            className={`bg-slate-800 border ${showTokenManager ? 'border-indigo-500 text-indigo-400' : 'border-slate-600 hover:border-indigo-500 text-white'} px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-colors`}
          >
            <Icon name="users" size={16} /> Actors
          </button>
          <button 
            onClick={() => { setShowTokenManager(false); setShowAssetManager(!showAssetManager); setIsDrawingWalls(false); }}
            className={`bg-slate-800 border ${showAssetManager ? 'border-amber-500 text-amber-400' : 'border-slate-600 hover:border-amber-500 text-white'} px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-colors`}
          >
            <Icon name="map" size={16} /> Map Editor
          </button>
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
          mapData={mapData}
          activeMapId={activeMapId}
          updateMap={updateMap}
          onClose={() => setShowAssetManager(false)} 
          onSetBackground={(url) => updateMap(campaignCode, activeMapId, { backgroundUrl: url })}
          onSetHeightmap={(url) => updateMap(campaignCode, activeMapId, { heightmapUrl: url })}
          onGenerateMap={({ backgroundUrl, heightmapUrl }) => {
              updateMap(campaignCode, activeMapId, { backgroundUrl, heightmapUrl });
          }}
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
            
            {/* Reset Elevation is only visible if the token is currently flying */}
            {Math.abs(mapData?.tokens?.[contextMenu.tokenId]?.elevationOffset || 0) > 0.01 && (
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

      {wallContextMenu && (
        <>
            <div 
                className="fixed inset-0 z-40" 
                onClick={() => setWallContextMenu(null)} 
                onContextMenu={(e) => { e.preventDefault(); setWallContextMenu(null); }}
            ></div>
            <div 
                className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[150px] overflow-hidden"
                style={{ top: wallContextMenu.y, left: wallContextMenu.x }}
                onContextMenu={(e) => e.preventDefault()}
            >
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
    </div>
  );
}