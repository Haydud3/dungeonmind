import React, { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { DragControls, Html, useCursor, Text, RoundedBox, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import CharacterModel from '../CharacterModel';
import { retrieveChunkedMap } from '../../utils/storageUtils';
import Icon from '../Icon';

const CONDITION_ICONS = {
  Blinded: { icon: 'eye-off', color: '#64748b' },
  Charmed: { icon: 'heart', color: '#ec4899' },
  Deafened: { icon: 'ear-off', color: '#eab308' },
  Frightened: { icon: 'ghost', color: '#a855f7' },
  Grappled: { icon: 'link', color: '#f97316' },
  Incapacitated: { icon: 'ban', color: '#ef4444' },
  Invisible: { icon: 'eye-off', color: '#93c5fd' },
  Paralyzed: { icon: 'zap', color: '#14b8a6' },
  Poisoned: { icon: 'skull', color: '#22c55e' },
  Prone: { icon: 'arrow-down-to-line', color: '#78350f' },
  Restrained: { icon: 'lock', color: '#ea580c' },
  Stunned: { icon: 'stars', color: '#eab308' },
  Unconscious: { icon: 'moon', color: '#1e293b' }
};

const TokenImage = ({ imageUrl, size, opacity }) => {
    const texture = useMemo(() => {
        if (!imageUrl) return null;
        return new THREE.TextureLoader().load(imageUrl);
    }, [imageUrl]);
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.051, 0]}>
            <circleGeometry args={[size * 0.45, 32]} />
            <meshBasicMaterial map={texture} transparent opacity={opacity} />
        </mesh>
    )
}

// Interactive 3D Token
const Token3D = ({ token, updateTokenPosition, gridSize = 1, isSelected, onSelect, onContextMenu, role, getTerrainHeight, isSnapToGrid, isTerrainReady, activeTool, draggedTokenId, setDraggedTokenId, viewMode, showNameplates, selectedTokenIds, groupDragData, onGroupDragEnd, isActiveTurn, canControl, shiftHeldRef }) => {
  const meshRef = useRef();
  const visualsRef = useRef();
  const rotationRef = useRef();
  const { controls } = useThree();
  const [hovered, setHover] = useState(false);
  const [resolvedImage, setResolvedImage] = useState(null);
  const polarAngleRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null

  const rulerRef = useRef();
  const rulerLabelRef = useRef();
  const rulerTextRef = useRef();

  const isTopDownView = viewMode === 'top-down';
  const showModel = !!token.modelUrl && !isTopDownView;

  if (token.isHidden && role !== 'dm') return null;
  const opacity = token.isHidden ? 0.4 : (token.conditions?.includes('Invisible') ? 0.6 : 1);

  useCursor(hovered, 'pointer', 'auto');

  const isPc = token.type === 'pc' || token.characterId;
  const baseColor = isPc ? "#22c55e" : "#ef4444";
  const size = (token.size || 1) * gridSize;
  const safeSize = !Number.isFinite(size) || size < 0.001 ? gridSize : size;
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
  const dragControlsRef = useRef();
  const longPressTimer = useRef();
  const touchStartPos = useRef({ x: 0, y: 0 });
  const isWaitingForSync = useRef(false);
  const syncTarget = useRef(new THREE.Vector3());

  // START CHANGE: Make token position reactive to props
  useEffect(() => {
    if (meshRef.current && !isLeftDragging.current) {
        const targetPosition = new THREE.Vector3(token.x || 0, token.y || 0.025, token.z || 0);

        if (isWaitingForSync.current) {
            if (targetPosition.distanceTo(syncTarget.current) < 0.1) {
                isWaitingForSync.current = false;
            } else {
                return; // Wait for Firebase to catch up
            }
        }

        // If the token is very far from its target (e.g., on first render), teleport it.
        if (meshRef.current.position.distanceTo(targetPosition) > 10) {
            meshRef.current.position.copy(targetPosition);
        }
    }
  }, [token.x, token.y, token.z, token.id]);

  useFrame((state, delta) => {
    // --- Main animation loop ---
    if (meshRef.current && visualsRef.current && rotationRef.current && getTerrainHeight) {

      // If another user is dragging, smoothly move the token
      if (!isLeftDragging.current) {
          if (rulerRef.current) rulerRef.current.visible = false;
          if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
          if (rulerTextRef.current) rulerTextRef.current.style.display = 'none';

          visualsRef.current.position.x = 0;
          visualsRef.current.position.z = 0;

          let targetPosition = new THREE.Vector3(token.x || 0, token.y || 0.025, token.z || 0);

          if (isWaitingForSync.current) {
              targetPosition.copy(syncTarget.current);
          }

          if (isSelected && groupDragData?.current?.activeTokenId && groupDragData.current.activeTokenId !== token.id) {
              targetPosition.add(groupDragData.current.delta);
              const terrainY = getTerrainHeight ? getTerrainHeight(targetPosition.x, targetPosition.z) : 0;
              targetPosition.y = terrainY + (token.elevationOffset || 0) + 0.025;
          }

          const p = meshRef.current.position;
          if (isRightDragging.current) targetPosition.y = p.y;
          p.lerp(targetPosition, 0.15); // Follow smoothly

          // Update rotation smoothly as well
          const targetRotY = token.rotationY || 0;
          const diff = targetRotY - rotationRef.current.rotation.y;
          rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.15;
          return; // Skip the rest of the logic if we're just observing
      }
      
      // If the current user is dragging
      const worldPos = new THREE.Vector3();
      meshRef.current.getWorldPosition(worldPos);
      
      let displayX = worldPos.x;
      let displayZ = worldPos.z;

      if (isSnapToGrid) {
          const tokenSize = token.size || 1;
          const isEvenSize = Math.round(tokenSize) % 2 === 0;
          displayX = isEvenSize ? Math.round(worldPos.x / gridSize) * gridSize : Math.floor(worldPos.x / gridSize) * gridSize + gridSize / 2;
          displayZ = isEvenSize ? Math.round(worldPos.z / gridSize) * gridSize : Math.floor(worldPos.z / gridSize) * gridSize + gridSize / 2;
      }

      visualsRef.current.position.x = displayX - worldPos.x;
      visualsRef.current.position.z = displayZ - worldPos.z;

      if (groupDragData?.current?.activeTokenId === token.id) {
          groupDragData.current.delta.subVectors(new THREE.Vector3(displayX, 0, displayZ), dragStartPos.current);
      }

      const terrainY = getTerrainHeight(displayX, displayZ);
      const targetY = terrainY + (token.elevationOffset || 0) + 0.025;
      
      meshRef.current.position.y = targetY; // Stick to terrain locally
      
      // --- Ruler and Velocity Logic (for local drag only) ---
      const start = dragStartPos.current;
      const end = new THREE.Vector3(displayX, targetY, displayZ);
      const distSq = end.clone().sub(start).lengthSq();
      
      if (distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          if (rulerRef.current) {
              rulerRef.current.scale.y = dist;
              rulerRef.current.position.copy(start).lerp(end, 0.5);
              rulerRef.current.position.y = Math.max(start.y, end.y) + 0.1;
              const dir = end.clone().sub(start).normalize();
              rulerRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
              rulerRef.current.visible = true;
          }
          if (rulerLabelRef.current) {
              rulerLabelRef.current.position.copy(start).lerp(end, 0.5);
              rulerLabelRef.current.position.y = Math.max(start.y, end.y) + 0.4;
              rulerLabelRef.current.visible = true;
              if (rulerTextRef.current) {
                  rulerTextRef.current.innerText = `${Math.round((dist / gridSize) * 5)} ft`;
              rulerTextRef.current.style.display = 'block';
              }
          }

          const frameDelta = worldPos.clone().sub(previousPos.current);
          frameDelta.y = 0;
          velocity.current.add(frameDelta);
          velocity.current.multiplyScalar(0.8);
          
          if (velocity.current.lengthSq() > 0.0001) {
              targetRotationY.current = Math.atan2(velocity.current.x, velocity.current.z);
          }
      } else {
          if (rulerRef.current) rulerRef.current.visible = false;
          if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
      }

      previousPos.current.copy(worldPos);
      
      // --- Rotation Lerping (for local drag only) ---
      const diff = targetRotationY.current - rotationRef.current.rotation.y;
      rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.3;
    }
  });
  // END CHANGE

  useEffect(() => {
    targetRotationY.current = token.rotationY || 0;
  }, [token.rotationY]);

  const handlePointerDown = (e) => {
    if (!isTerrainReady || e.button === 2) {
      e.stopPropagation();
      // Stop the native event so the MarqueeSelector doesn't accidentally trigger
      // when you are right-clicking a token to change its elevation.
      if (e.nativeEvent) e.nativeEvent.stopPropagation();
      if (!canControl) return; // Prevent elevation change if not controllable
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
          const tokenSize = token.size || 1;
          const isEvenSize = Math.round(tokenSize) % 2 === 0;
          const x = isSnapToGrid ? (isEvenSize ? Math.round(p.x / gridSize) * gridSize : Math.floor(p.x / gridSize) * gridSize + gridSize / 2) : p.x;
          const z = isSnapToGrid ? (isEvenSize ? Math.round(p.z / gridSize) * gridSize : Math.floor(p.z / gridSize) * gridSize + gridSize / 2) : p.z;
          const terrainY = getTerrainHeight ? getTerrainHeight(x, z) : 0;
          const offset = p.y - terrainY - 0.025;
          const isFlying = Math.abs(offset) > 0.1;
          
          meshRef.current.position.set(x, p.y, z);
          syncTarget.current.set(x, p.y, z);
          isWaitingForSync.current = true;
          
          setSaveStatus('saving');
          const updates = { 
              x, 
              y: p.y, 
              z,
              elevationOffset: isFlying ? offset : 0
          };
          console.log("[Token3D] Right-drag ended, requesting position update:", updates);
          updateTokenPosition(token.id, updates).then(() => {
              console.log("[Token3D] Right-drag position update successful!");
              setSaveStatus('saved');
              setTimeout(() => setSaveStatus(null), 2000);
          }).catch(err => {
              console.error("[Token3D] Right-drag position update failed:", err);
              setSaveStatus(null);
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

  const nameplatePos = useMemo(() => {
      return viewMode === 'top-down' 
          ? [0, 0, safeSize * 0.75] 
          : [0, 0.2, safeSize * 0.85]; // Hover slightly off the ground, shifted South (towards camera)
  }, [safeSize, viewMode]);

  const initials = useMemo(() => {
      const name = token.name || "Unknown";
      const parts = name.split(/[\s-]+/).filter(p => p.length > 0);
      if (parts.length >= 2) {
          return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
  }, [token.name]);

  const tokenContent = (
    <group 
      ref={meshRef} 
      scale={[scale, scale, scale]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerOver={(e) => { e.stopPropagation(); if (isTerrainReady) setHover(true); }}
      onPointerOut={(e) => { if (isTerrainReady) setHover(false); }}
      onClick={(e) => { e.stopPropagation(); if (isTerrainReady) onSelect(token.id, e.shiftKey); }}
      onContextMenu={(e) => {
        e.stopPropagation();
        if (e.nativeEvent) e.nativeEvent.preventDefault();
        if (canControl && !hasDragged.current) {
            if (onContextMenu) onContextMenu(e, token);
        }
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        longPressTimer.current = setTimeout(() => {
          if (canControl && !hasDragged.current) {
            const mockEvent = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, preventDefault: () => {}, stopPropagation: () => {} };
            if (onContextMenu) onContextMenu(mockEvent, token);
          }
        }, 500);
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        const distance = Math.sqrt(Math.pow(touch.clientX - touchStartPos.current.x, 2) + Math.pow(touch.clientY - touchStartPos.current.y, 2));
        if (distance > 10) {
          clearTimeout(longPressTimer.current);
        }
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        clearTimeout(longPressTimer.current);
      }}
    >
      <group ref={visualsRef}>
        <group ref={rotationRef}>
          {showModel && (
            <Suspense fallback={null}>
              <group position={[0, (token.modelYOffset || 0) * safeSize, 0]}>
                <CharacterModel modelUrl={token.modelUrl} scale={(token.modelScale || 1) * safeSize} forceStatue={token.forceStatue} opacity={opacity} />
              </group>
            </Suspense>
          )}

          {!showModel && (
              <>
                {resolvedImage ? (
                    <Suspense fallback={null}>
                        <TokenImage imageUrl={resolvedImage} size={safeSize} opacity={opacity} />
                    </Suspense>
                ) : (
                  <mesh position={[0, 0.051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <circleGeometry args={[safeSize * 0.45, 32]} />
                      <meshStandardMaterial color="#1e293b" transparent opacity={opacity} />
                      <Text
                          position={[0, 0, 0.01]}
                          fontSize={safeSize * 0.35}
                          color={baseColor}
                          anchorX="center"
                          anchorY="middle"
                          fontWeight="bold"
                          fillOpacity={opacity}
                      >
                          {initials}
                      </Text>
                  </mesh>
                )}
              </>
          )}

          {/* Stone Pedestal Base */}
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[safeSize * 0.48, safeSize * 0.5, 0.04, 32]} />
            <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.1} transparent={true} opacity={opacity} />
          </mesh>
          
          {/* Inner colored accent ring */}
          <mesh position={[0, 0.045, 0]}>
            <cylinderGeometry args={[safeSize * 0.46, safeSize * 0.46, 0.01, 32]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />
          </mesh>

          <mesh position={[0, 0.05, safeSize * 0.45]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[safeSize * 0.15, safeSize * 0.2, 3]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />
          </mesh>

          {isSelected && (
            <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[safeSize * 0.55, safeSize * 0.6, 32]} />
              <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
            </mesh>
          )}
        </group>

        {showNameplates && (
          <Billboard position={nameplatePos}>
            <group>
                {/* Stone Plaque Background */}
                <RoundedBox args={[safeSize * 1.4, safeSize * 0.28, 0.02]} radius={safeSize * 0.05} smoothness={4} position={[0, 0, -0.01]}>
                    <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.3} transparent opacity={opacity * 0.9} depthTest={true} />
                </RoundedBox>
                
                {/* Metal Inner Border */}
                <RoundedBox args={[safeSize * 1.35, safeSize * 0.23, 0.02]} radius={safeSize * 0.04} smoothness={4} position={[0, 0, -0.005]}>
                    <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.8} transparent opacity={opacity * 0.9} depthTest={true} />
                </RoundedBox>

                {/* NAME */}
                <Text
                    position={[0, 0, 0.01]}
                    fontSize={safeSize * 0.14}
                    color="#e2e8f0"
                    anchorX="center"
                    anchorY="middle"
                    fontWeight="bold"
                    fillOpacity={opacity}
                    depthTest={true}
                    maxWidth={safeSize * 1.3}
                >
                    {token.name || "Unknown"}
                </Text>

                {/* ELEVATION */}
                {Math.abs(token.elevationOffset || 0) > 0.1 && (
                    <Text
                        position={[0, safeSize * 0.25, 0]}
                        fontSize={safeSize * 0.12}
                        color="#93c5fd"
                        outlineWidth={safeSize * 0.02}
                        outlineColor="#1e3a8a"
                        anchorX="center"
                        anchorY="middle"
                        fontWeight="bold"
                        fillOpacity={opacity}
                        outlineOpacity={opacity}
                        depthTest={true}
                    >
                        {token.elevationOffset > 0 ? '↑ ' : '↓ '}{Math.round((token.elevationOffset || 0) * 5)}ft
                    </Text>
                )}

                {/* CONDITIONS */}
                {token.conditions && token.conditions.length > 0 && (
                    <Html center position={[0, safeSize * 0.45, 0]} className="pointer-events-none z-10" zIndexRange={[100, 0]}>
                        <div className="flex flex-wrap justify-center gap-0.5 bg-slate-900/80 backdrop-blur-sm border border-slate-700 p-0.5 rounded shadow-lg max-w-[80px]" style={{ opacity }}>
                            {token.conditions.map(cond => {
                                const info = CONDITION_ICONS[cond];
                                if (!info) return null;
                                return (
                                    <div key={cond} className="rounded p-0.5" style={{ backgroundColor: info.color }} title={cond}>
                                        <Icon name={info.icon} size={10} color="white" />
                                    </div>
                                );
                            })}
                        </div>
                    </Html>
                )}
                
                {/* SAVE STATUS */}
                {saveStatus && (
                    <Text
                        position={[0, -safeSize * 0.25, 0]}
                        fontSize={safeSize * 0.1}
                        color="#fbbf24"
                        outlineWidth={safeSize * 0.015}
                        outlineColor="#78350f"
                        anchorX="center"
                        anchorY="middle"
                        fontWeight="bold"
                        fillOpacity={opacity}
                        outlineOpacity={opacity}
                        depthTest={true}
                    >
                        {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                    </Text>
                )}
            </group>
        </Billboard>
      )}
    </group>
    </group>
  );

  return (
    <group>
      <mesh ref={rulerRef} visible={false} raycast={() => null}>
        <cylinderGeometry args={[0.08, 0.08, 1, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} depthTest={false} />
      </mesh>
      
      <group ref={rulerLabelRef} visible={false}>
        <Html center className="pointer-events-none select-none z-50" distanceFactor={8}>
          <div 
            ref={rulerTextRef} 
            className="bg-amber-600/90 text-white border border-amber-400 text-[10px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap"
            style={{ display: 'none' }}
          >
            0 ft
          </div>
        </Html>
      </group>

      {canControl ? (
        <DragControls
          ref={dragControlsRef}
          axisLock="y"
          enabled={isTerrainReady && !activeTool && (draggedTokenId === null || draggedTokenId === token.id)}
          onDragStart={() => {
            if (controls) controls.enabled = false;
            isLeftDragging.current = true;
            
            const worldPos = new THREE.Vector3();
            if (meshRef.current) meshRef.current.getWorldPosition(worldPos);
            
            dragStartPos.current.copy(worldPos);
            previousPos.current.copy(worldPos);
            velocity.current.set(0, 0, 0);
            setDraggedTokenId(token.id);

            const isGroupDrag = shiftHeldRef.current && selectedTokenIds && selectedTokenIds.includes(token.id) && selectedTokenIds.length > 1;

            if (isGroupDrag) {
                if (groupDragData) {
                    groupDragData.current.activeTokenId = token.id;
                    groupDragData.current.delta.set(0, 0, 0);
                }
            } else {
                onSelect(token.id, false);
                if (groupDragData) groupDragData.current.activeTokenId = null;
            }
          }}
          onDragEnd={() => {
            console.log("[Token3D] onDragEnd triggered for", token.id);
            if (controls) controls.enabled = true;
            isLeftDragging.current = false;
            
            if (rulerRef.current) rulerRef.current.visible = false;
            if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
            if (rulerTextRef.current) rulerTextRef.current.style.display = 'none';
            
            if (meshRef.current && dragControlsRef.current) {
              const worldPos = new THREE.Vector3();
              meshRef.current.getWorldPosition(worldPos);
              
              dragControlsRef.current.position.set(0, 0, 0);
              dragControlsRef.current.matrix.identity();
              dragControlsRef.current.updateMatrixWorld();
              
              const tokenSize = token.size || 1;
              const isEvenSize = Math.round(tokenSize) % 2 === 0;
              const snapX = isSnapToGrid ? (isEvenSize ? Math.round(worldPos.x / gridSize) * gridSize : Math.floor(worldPos.x / gridSize) * gridSize + gridSize / 2) : worldPos.x;
              const snapZ = isSnapToGrid ? (isEvenSize ? Math.round(worldPos.z / gridSize) * gridSize : Math.floor(worldPos.z / gridSize) * gridSize + gridSize / 2) : worldPos.z;
              
              if (groupDragData?.current?.activeTokenId === token.id) {
                  const snappedDelta = new THREE.Vector3(snapX - dragStartPos.current.x, 0, snapZ - dragStartPos.current.z);
                  if (onGroupDragEnd) onGroupDragEnd(token.id, snappedDelta);
                  groupDragData.current.activeTokenId = null;
                  groupDragData.current.delta.set(0, 0, 0);
              }

              const terrainY = getTerrainHeight ? getTerrainHeight(snapX, snapZ) : 0;
              const targetY = terrainY + (token.elevationOffset || 0) + 0.025;
              
              meshRef.current.position.set(snapX, targetY, snapZ);
              syncTarget.current.set(snapX, targetY, snapZ);
              isWaitingForSync.current = true;
              
              setSaveStatus('saving');
              const updates = { 
                x: snapX, 
                y: targetY, 
                z: snapZ,
                elevationOffset: token.elevationOffset || 0,
                rotationY: targetRotationY.current
              };
              console.log("[Token3D] Requesting position update with:", updates);
              updateTokenPosition(token.id, updates).then(() => {
                  console.log("[Token3D] Position update successful!");
                  setSaveStatus('saved');
                  setTimeout(() => setSaveStatus(null), 2000);
              }).catch(err => {
                  console.error("[Token3D] Position update failed:", err);
                  setSaveStatus(null);
              });
            }
            setDraggedTokenId(null);
          }}
        >
          {tokenContent}
        </DragControls>
      ) : (
        tokenContent
      )}
    </group>
  );
};

export default Token3D;
