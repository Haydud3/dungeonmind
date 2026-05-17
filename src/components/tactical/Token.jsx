import React, { useState, useEffect, Suspense, useRef, useMemo, lazy } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { DragControls, Html, useCursor, Text, RoundedBox, Billboard, Line } from '@react-three/drei';
import * as THREE from 'three';
const CharacterModel = lazy(() => import('../CharacterModel').then(m => ({ default: m.default })));
import { retrieveChunkedMap } from '../../utils/storageUtils';
import Icon from '../Icon';
import { checkLineOfSight } from '../../utils/losUtils';
const ConditionParticles = lazy(() => import('../3d/ConditionParticles').then(m => ({ default: m.ConditionParticles })));

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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0075, 0]} castShadow receiveShadow>
            <circleGeometry args={[size * 0.45, 32]} />
            <meshBasicMaterial map={texture} transparent opacity={opacity} />
        </mesh>
    )
}

const DragLine = React.forwardRef((props, ref) => {
  const [lineState, setLineState] = useState({ p1: [0,0,0], p2: [0,0,0], visible: false });
  
  React.useImperativeHandle(ref, () => ({
    update: (p1, p2) => {
      setLineState(prev => {
          const dx = prev.p2[0] - p2.x;
          const dz = prev.p2[2] - p2.z;
          if (prev.visible && dx*dx + dz*dz < 0.0001) return prev;
          return { p1: [p1.x, p1.y, p1.z], p2: [p2.x, p2.y, p2.z], visible: true };
      });
    },
    hide: () => {
      setLineState(prev => prev.visible ? { ...prev, visible: false } : prev);
    }
  }));

  if (!lineState.visible) return null;

  return (
      <Line 
        points={[lineState.p1, lineState.p2]}
        color="#f59e0b" 
        lineWidth={3} 
        depthTest={false} 
        transparent 
        opacity={0.6} 
        renderOrder={100}
      />
  );
});

// Interactive 3D Token
const Token3D = ({ token, updateTokenPosition, gridSize = 1, gridOffsetX = 0, gridOffsetY = 0, isSelected, onSelect, onContextMenu, role, getTerrainHeight, isSnapToGrid, isTerrainReady, activeTool, draggedTokenId, setDraggedTokenId, viewMode, showNameplates, selectedTokenIds, groupDragData, onGroupDragEnd, isActiveTurn, canControl, shiftHeldRef, tokenBaseOffset = -0.12, isInteractive = true, orientation = 0, rtdbDragsRef, broadcastDrag, clearBroadcast, myUid, myClientId, baseVisibility, playerVisionSources, wallsArray, combinedLights, fowEnabled, alwaysVisible, hideBaseIf3D }) => {
  const meshRef = useRef();
  const visualsRef = useRef();
  const rotationRef = useRef();
  const nameplateGlowRef = useRef();
  const { controls } = useThree();
  const [hovered, setHover] = useState(false);
  const [resolvedImage, setResolvedImage] = useState(null);
  const polarAngleRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null

  // --- WAYPOINTS LOGIC ---
  const [waypoints, setWaypoints] = useState([]);
  const totalWaypointDistRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && isLeftDragging.current) {
        e.preventDefault();
        const worldPos = new THREE.Vector3();
        if (meshRef.current) meshRef.current.getWorldPosition(worldPos);
        
        setWaypoints(prev => {
          const lastPt = prev.length > 0 ? prev[prev.length - 1] : dragStartPos.current;
          const distSq = lastPt.distanceToSquared(worldPos);
          if (distSq < 0.1) return prev; // Too close
          
          totalWaypointDistRef.current += Math.sqrt(distSq);
          return [...prev, worldPos.clone()];
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // --- END WAYPOINTS LOGIC ---

  const rulerRef = useRef();
  const rulerLabelRef = useRef();
  const rulerTextRef = useRef();

  const isTopDownView = viewMode === 'top-down';
  const showModel = !!token.modelUrl && !isTopDownView;

  if (token.isHidden && role !== 'dm') return null;
  const opacity = token.isHidden ? 0.4 : (token.conditions?.includes('Invisible') ? 0.6 : 1);

  useCursor(hovered, 'pointer', 'auto');

  const isPc = token.type === 'pc';
  const baseColor = token.color || (isPc ? "#22c55e" : "#ef4444");
  const size = (token.size || 1) * gridSize;
  const safeSize = !Number.isFinite(size) || size < 0.001 ? gridSize : size;
  const scale = hovered ? 1.1 : 1;

  const isLeftDragging = useRef(false);
  const isRightDragging = useRef(false); // Add this line to define isRightDragging
  const hasDragged = useRef(false);
  const dragStartPos = useRef(new THREE.Vector3());
  const velocity = useRef(new THREE.Vector3());
  const previousPos = useRef(new THREE.Vector3(token.x || 0, token.y || 0.001, token.z || 0));
  const targetRotationY = useRef(token.rotationY || 0);
  const dragControlsRef = useRef();
  const longPressTimer = useRef();
  const touchStartPos = useRef({ x: 0, y: 0 });
  const isWaitingForSync = useRef(false);
  const syncTarget = useRef(new THREE.Vector3());
  const hasInitialized = useRef(false);
  const isTopHitRef = useRef(false);

  // Calculate the exact starting position so the token doesn't spawn at [0,0,0] for one frame
  const initialPosition = useMemo(() => {
      const pos = new THREE.Vector3(token.x || 0, token.y || tokenBaseOffset, token.z || 0);
      if (getTerrainHeight && isTerrainReady) {
          const localTerrainY = getTerrainHeight(pos.x, pos.z, safeSize / 2);
          pos.y = localTerrainY + (token.elevationOffset || 0) + tokenBaseOffset;
      }
      return [pos.x, pos.y, pos.z];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // START CHANGE: Make token position reactive to props
  useEffect(() => {
    if (meshRef.current && !isLeftDragging.current) {
        const targetPosition = new THREE.Vector3(token.x || 0, token.y || tokenBaseOffset, token.z || 0);

        if (getTerrainHeight && isTerrainReady) {
            const localTerrainY = getTerrainHeight(targetPosition.x, targetPosition.z, safeSize / 2);
            targetPosition.y = localTerrainY + (token.elevationOffset || 0) + tokenBaseOffset;
        }

        if (isWaitingForSync.current) {
            if (targetPosition.distanceTo(syncTarget.current) < 0.01) {
                isWaitingForSync.current = false;
            } else {
                return; // Wait for Firebase to catch up
            }
        }

        // If the token is far from its target (e.g., on first render), teleport it.
        if (!hasInitialized.current || meshRef.current.position.distanceTo(targetPosition) > 2) {
            meshRef.current.position.copy(targetPosition);
            hasInitialized.current = true;
        }
    }
  }, [token.x, token.y, token.z, token.id, getTerrainHeight, isTerrainReady, safeSize, token.elevationOffset, tokenBaseOffset]);

  useFrame((state, delta) => {
    if (nameplateGlowRef.current && isActiveTurn) {
        const t = state.clock.elapsedTime;
        nameplateGlowRef.current.opacity = opacity * (0.4 + Math.sin(t * 3) * 0.4);
        nameplateGlowRef.current.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.5;
    }

    // --- Main animation loop ---
    if (meshRef.current && visualsRef.current && rotationRef.current && getTerrainHeight) {

      // If another user is dragging, smoothly move the token
      if (!isLeftDragging.current) {
          if (rulerRef.current && rulerRef.current.hide) rulerRef.current.hide();
          if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
          if (rulerTextRef.current) rulerTextRef.current.style.display = 'none';

          visualsRef.current.position.x = 0;
          visualsRef.current.position.z = 0;

          let targetPosition = new THREE.Vector3(token.x || 0, token.y || tokenBaseOffset, token.z || 0);

          if (!isWaitingForSync.current && getTerrainHeight) {
              const localTerrainY = getTerrainHeight(targetPosition.x, targetPosition.z, safeSize / 2);
              targetPosition.y = localTerrainY + (token.elevationOffset || 0) + tokenBaseOffset;
          }

          // Check if this token is being dragged by someone else via RTDB
          if (rtdbDragsRef?.current?.[token.id]) {
              const rDrag = rtdbDragsRef.current[token.id];
              if (rDrag.clientId !== myClientId) {
                  targetPosition.x = rDrag.x;
                  targetPosition.z = rDrag.z;
                  if (getTerrainHeight) {
                      const localTerrainY = getTerrainHeight(targetPosition.x, targetPosition.z, safeSize / 2);
                      targetPosition.y = localTerrainY + (token.elevationOffset || 0) + tokenBaseOffset;
                  }
                  if (rDrag.rotationY !== undefined) {
                      targetRotationY.current = rDrag.rotationY;
                  }
              }
          }

          if (isWaitingForSync.current) {
              targetPosition.copy(syncTarget.current);
          }

          let isFollowerDragging = false;
          if (isSelected && groupDragData?.current?.activeTokenId && groupDragData.current.activeTokenId !== token.id) {
              isFollowerDragging = true;
              targetPosition.add(groupDragData.current.delta);
              const terrainY = getTerrainHeight ? getTerrainHeight(targetPosition.x, targetPosition.z, safeSize / 2) : 0;
              targetPosition.y = terrainY + (token.elevationOffset || 0) + tokenBaseOffset;
              
              const frameDelta = targetPosition.clone().sub(meshRef.current.position);
              frameDelta.y = 0;
              if (frameDelta.lengthSq() > 0.0001) {
                  targetRotationY.current = Math.atan2(frameDelta.x, frameDelta.z);
              }

              if (broadcastDrag) {
                  broadcastDrag(token.id, targetPosition.x, targetPosition.z, targetRotationY.current);
              }
          }

          const p = meshRef.current.position;
          if (isRightDragging.current) targetPosition.y = p.y;
          p.lerp(targetPosition, 0.15); // Follow smoothly

          // Update rotation smoothly as well
          const isRemoteDragging = rtdbDragsRef?.current?.[token.id] && rtdbDragsRef.current[token.id].clientId !== myClientId;
          const targetRotY = (isRotatingToken.current || isRemoteDragging || isFollowerDragging) ? targetRotationY.current : (token.rotationY || 0);
          const diff = targetRotY - rotationRef.current.rotation.y;
          rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.15;
      } else {
      
          // If the current user is dragging
          const worldPos = new THREE.Vector3();
          meshRef.current.getWorldPosition(worldPos);
          
          let displayX = worldPos.x;
          let displayZ = worldPos.z;
    
          if (isSnapToGrid) {
              const tokenSize = token.size || 1;
              const isEvenSize = Math.round(tokenSize) % 2 === 0;
              displayX = isEvenSize ? Math.round((worldPos.x - gridOffsetX) / gridSize) * gridSize + gridOffsetX : Math.floor((worldPos.x - gridOffsetX) / gridSize) * gridSize + gridSize / 2 + gridOffsetX;
              displayZ = isEvenSize ? Math.round((worldPos.z - gridOffsetY) / gridSize) * gridSize + gridOffsetY : Math.floor((worldPos.z - gridOffsetY) / gridSize) * gridSize + gridSize / 2 + gridOffsetY;
          }
    
          visualsRef.current.position.x = displayX - worldPos.x;
          visualsRef.current.position.z = displayZ - worldPos.z;
    
          if (groupDragData?.current?.activeTokenId === token.id) {
              groupDragData.current.delta.subVectors(new THREE.Vector3(displayX, 0, displayZ), dragStartPos.current);
          }
    
          const terrainY = getTerrainHeight(displayX, displayZ, safeSize / 2);
          const targetY = terrainY + (token.elevationOffset || 0) + tokenBaseOffset;
          
          meshRef.current.position.y = targetY; // Stick to terrain locally
          
          // --- Ruler and Velocity Logic (for local drag only) ---
          const activeStart = waypoints.length > 0 ? waypoints[waypoints.length - 1] : dragStartPos.current;
          const end = new THREE.Vector3(displayX, targetY, displayZ);
          const distSq = end.clone().sub(activeStart).lengthSq();
          
          const totalDist = totalWaypointDistRef.current + Math.sqrt(distSq);
    
          if (totalDist > 0.1) {
              const activeSegmentDist = Math.sqrt(distSq);
              if (rulerRef.current && rulerRef.current.update) {
                  rulerRef.current.update(activeStart, end);
              }
              if (rulerLabelRef.current) {
                  rulerLabelRef.current.position.copy(activeStart).lerp(end, 0.5);
                  rulerLabelRef.current.position.y = Math.max(activeStart.y, end.y) + 0.4;
                  rulerLabelRef.current.visible = true;
                  if (rulerTextRef.current) {
                      rulerTextRef.current.innerText = `${Math.round((totalDist / gridSize) * 5)} ft`;
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
              if (rulerRef.current && rulerRef.current.hide) rulerRef.current.hide();
              if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
          }
          
          if (rtdbDragsRef && rtdbDragsRef.current) {
              rtdbDragsRef.current[token.id] = { x: displayX, z: displayZ, rotationY: targetRotationY.current, clientId: myClientId };
          }
    
          if (broadcastDrag) {
              broadcastDrag(token.id, displayX, displayZ, targetRotationY.current);
          }
    
          previousPos.current.copy(worldPos);
          
          // --- Rotation Lerping (for local drag only) ---
          const diff = targetRotationY.current - rotationRef.current.rotation.y;
          rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.3;
      }

      // --- LIVE VISIBILITY ENGINE ---
      const t = state.clock.elapsedTime;
      // We throttle visibility checks to ~10 FPS to save CPU, especially on intense maps
      if (t - (visualsRef.current.lastVisibilityCheck || 0) > 0.1) {
          visualsRef.current.lastVisibilityCheck = t;
          let currentVisibility = baseVisibility;
          let hasActiveDrag = false;
          if (rtdbDragsRef?.current) {
              hasActiveDrag = Object.keys(rtdbDragsRef.current).length > 0;
          }

          if (hasActiveDrag && !alwaysVisible) {
              let isVisible = false;
              const targetPt = { x: meshRef.current.position.x, z: meshRef.current.position.z };
              const isTargetInvisible = (token.conditions || []).some(c => (typeof c === 'string' ? c : c.name)?.toLowerCase() === 'invisible');

              const activeVisionSources = (playerVisionSources || []).map(source => {
                  if (rtdbDragsRef.current[source.id]) {
                      const drag = rtdbDragsRef.current[source.id];
                      return { ...source, x: drag.x, z: drag.z };
                  }
                  return source;
              });

              for (const src of activeVisionSources) {
                  const dist = Math.sqrt(Math.pow(src.x - targetPt.x, 2) + Math.pow(src.z - targetPt.z, 2));
                  const truesightRange = src.truesight ?? 0;
                  const blindsightRange = src.blindsight ?? 0;
                  const tremorsenseRange = src.tremorsense ?? 0;
                  const baseVisionRange = src.darkvision ?? src.range;

                  const hasLOS = checkLineOfSight(src, targetPt, wallsArray);

                  if ((dist <= truesightRange && hasLOS) || 
                      (dist <= blindsightRange && hasLOS) || 
                      (dist <= tremorsenseRange && (token.elevationOffset || 0) === 0)) {
                      isVisible = true; break;
                  }

                  if (isTargetInvisible) continue;

                  if (dist <= baseVisionRange && hasLOS) {
                      isVisible = true; break;
                  }

                  if (combinedLights && fowEnabled !== false && hasLOS) {
                      let illuminated = false;
                      for (const light of Object.values(combinedLights)) {
                          const lightRange = (light.radius || 15) / 5 * gridSize;
                          const lightPt = { x: light.position.x, z: light.position.z };
                          const distToLight = Math.sqrt(Math.pow(lightPt.x - targetPt.x, 2) + Math.pow(lightPt.z - targetPt.z, 2));
                          
                          if (distToLight <= lightRange && checkLineOfSight(lightPt, targetPt, wallsArray)) {
                              illuminated = true; break;
                          }
                      }
                      if (illuminated) {
                          isVisible = true; break;
                      }
                  }
              }
              currentVisibility = isVisible;
          } else if (alwaysVisible) {
              currentVisibility = true;
          }

          meshRef.current.visible = currentVisibility;
      }
    }
  });
  // END CHANGE

  useEffect(() => {
    targetRotationY.current = token.rotationY || 0;
  }, [token.rotationY]);

  // "Ghosting" effect: Overrides raycasting when a tool is active so clicks pass through to the floor
  useEffect(() => {
    if (!meshRef.current) return;

    meshRef.current.traverse((child) => {
        if (typeof child.raycast === 'function') {
            // Save the original raycast function if it's not already our ghost function
            if (child.raycast.name !== 'ghostRaycast' && !child.userData.originalRaycast) {
                child.userData.originalRaycast = child.raycast;
            }

            if (activeTool) {
                child.raycast = function ghostRaycast() {}; // Make invisible to mouse
            } else {
                if (child.userData.originalRaycast) {
                    child.raycast = child.userData.originalRaycast;
                } else {
                    delete child.raycast;
                }
            }
        }
    });
  });

  const isRotatingToken = useRef(false);
  const lastPointerX = useRef(0);

  const handleNameplatePointerDown = (e) => {
    if (!canControl || activeTool) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    isRotatingToken.current = true;
    lastPointerX.current = e.clientX;
    if (controls) controls.enabled = false;
    e.target.setPointerCapture(e.pointerId);
  };

  const handleNameplatePointerMove = (e) => {
    if (!isRotatingToken.current || !meshRef.current) return;
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();

    const deltaX = e.clientX - lastPointerX.current;
    lastPointerX.current = e.clientX;
    
    // Dragging left (negative deltaX) rotates clockwise (negative Y rotation).
    // Dragging right (positive deltaX) rotates counter-clockwise (positive Y rotation).
    targetRotationY.current += deltaX * 0.05;
    
    if (broadcastDrag) {
        const worldPos = new THREE.Vector3();
        meshRef.current.getWorldPosition(worldPos);
        broadcastDrag(token.id, worldPos.x, worldPos.z, targetRotationY.current);
        if (rtdbDragsRef && rtdbDragsRef.current) {
            rtdbDragsRef.current[token.id] = { x: worldPos.x, z: worldPos.z, rotationY: targetRotationY.current, clientId: myClientId };
        }
    }
  };

  const handleNameplatePointerUp = (e) => {
    if (!isRotatingToken.current) return;
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    isRotatingToken.current = false;
    if (e.target.hasPointerCapture(e.pointerId)) {
        e.target.releasePointerCapture(e.pointerId);
    }
    if (controls) controls.enabled = true;
    document.body.style.cursor = 'auto';
    
    updateTokenPosition(token.id, { rotationY: targetRotationY.current }).then(() => {
        if (clearBroadcast) clearBroadcast(token.id);
    });
  };

  const handlePointerDown = (e) => {
    if (!isTerrainReady) return;
    if (e.pointerType === 'touch') {
      touchStartPos.current = { x: e.clientX, y: e.clientY };
      
      const startWorldPos = new THREE.Vector3();
      if (meshRef.current) meshRef.current.getWorldPosition(startWorldPos);

      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        
        if (isLeftDragging.current) {
            const currentWorldPos = new THREE.Vector3();
            if (meshRef.current) meshRef.current.getWorldPosition(currentWorldPos);
            if (currentWorldPos.distanceToSquared(startWorldPos) > 0.01) {
                return; // Token was moved, so cancel the long press
            }
        }

        if (canControl && !hasDragged.current) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
          const mockEvent = { clientX: touchStartPos.current.x, clientY: touchStartPos.current.y, preventDefault: () => {}, stopPropagation: () => {} };
          if (onContextMenu) onContextMenu(mockEvent, token);
        }
      }, 500);
    }
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerMove = (e) => {
    if (longPressTimer.current) {
      const dx = e.clientX - touchStartPos.current.x;
      const dy = e.clientY - touchStartPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        cancelLongPress();
      }
    }
  };

  const handlePointerUp = (e) => {
    cancelLongPress();
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
      return () => { isActive = false; if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 5000); };
    } else {
      setResolvedImage(imgUrl);
    }
  }, [token.image, token.img]);

  const nameplatePos = useMemo(() => {
      const baseZ = viewMode === 'top-down' ? safeSize * 0.75 : safeSize * 0.85;
      const baseY = viewMode === 'top-down' ? 0 : safeSize * 0.2;
      const angle = orientation * (Math.PI / 2);
      
      const offsetX = Math.sin(angle) * baseZ;
      const offsetZ = Math.cos(angle) * baseZ;
      
      return [offsetX, baseY, offsetZ];
  }, [safeSize, viewMode, orientation]);

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
      position={initialPosition}
      scale={[scale, scale, scale]}
      onPointerDown={(!isInteractive || activeTool) ? undefined : (e) => {
        isTopHitRef.current = false;
        if (isTerrainReady) {
            const firstHit = e.intersections[0];
            let isMyHit = false;
            if (firstHit) {
                let obj = firstHit.object;
                while (obj) {
                    if (obj === meshRef.current) {
                        isMyHit = true;
                        break;
                    }
                    obj = obj.parent;
                }
            }
            if (!isMyHit) {
                console.log(`[Token ${token.name}] Swallowing pointer down! firstHit is someone else.`);
                e.stopPropagation();
                return;
            }
            isTopHitRef.current = true;
        }
        console.log(`[Token ${token.name}] Accepted pointer down!`);
        handlePointerDown(e);
      }}
      onPointerMove={(!isInteractive || activeTool) ? undefined : handlePointerMove}
      onPointerUp={(!isInteractive || activeTool) ? undefined : handlePointerUp}
      onPointerOver={(!isInteractive || activeTool) ? undefined : (e) => { 
        e.stopPropagation(); 
        if (isTerrainReady) {
            const firstHit = e.intersections[0];
            let isMyHit = false;
            if (firstHit) {
                let obj = firstHit.object;
                while (obj) {
                    if (obj === meshRef.current) {
                        isMyHit = true;
                        break;
                    }
                    obj = obj.parent;
                }
            }
            if (isMyHit) setHover(true);
        }
      }}
      onPointerOut={(!isInteractive || activeTool) ? undefined : (e) => { cancelLongPress(); if (isTerrainReady) setHover(false); }}
      onPointerCancel={(!isInteractive || activeTool) ? undefined : cancelLongPress}
      onPointerLeave={(!isInteractive || activeTool) ? undefined : cancelLongPress}
      onClick={(!isInteractive || activeTool) ? undefined : (e) => { 
        e.stopPropagation(); 
        if (e.button === 2) return; 
        if (isTerrainReady) {
            const firstHit = e.intersections[0];
            let isMyHit = false;
            if (firstHit) {
                let obj = firstHit.object;
                while (obj) {
                    if (obj === meshRef.current) {
                        isMyHit = true;
                        break;
                    }
                    obj = obj.parent;
                }
            }
            if (isMyHit) onSelect(token.id, e.shiftKey);
        }
      }}
      onContextMenu={(!isInteractive || activeTool) ? undefined : (e) => {
        e.stopPropagation();
        if (e.nativeEvent) e.nativeEvent.preventDefault();
        if (canControl && !hasDragged.current) {
            if (onContextMenu) onContextMenu(e, token);
        }
      }}
    >
      <group ref={visualsRef}>
        <group ref={rotationRef}>
          {showModel && (
            <Suspense fallback={null}>
              <group position={[0, 0.0075 + ((token.modelYOffset || 0) * safeSize), 0]}>
                <CharacterModel modelUrl={token.modelUrl} scale={(token.modelScale || 1) * safeSize} forceStatue={token.forceStatue} opacity={opacity} materialStyle={token.materialStyle} />
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
                <mesh position={[0, 0.0075, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
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

          {!(hideBaseIf3D && showModel) && (
              <>
                {/* Stone Pedestal Base */}
                <mesh position={[0, -0.0025, 0]} castShadow receiveShadow>
                  <cylinderGeometry args={[safeSize * 0.48, safeSize * 0.5, 0.015, 32]} />
                  <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.1} transparent={true} opacity={opacity} />
                </mesh>
                
                {/* Inner colored accent ring */}
                <mesh position={[0, 0.006, 0]} castShadow receiveShadow>
                  <cylinderGeometry args={[safeSize * 0.46, safeSize * 0.46, 0.002, 32]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />
                </mesh>
      
                <mesh position={[0, 0.006, safeSize * 0.45]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                  <coneGeometry args={[safeSize * 0.15, safeSize * 0.2, 3]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />
                </mesh>
              </>
          )}

          {isSelected && (
            <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[safeSize * 0.55, safeSize * 0.6, 32]} />
              <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
            </mesh>
          )}

          <Suspense fallback={null}>
            <ConditionParticles conditions={token.conditions} size={safeSize} />
          </Suspense>
        </group>

        {showNameplates && (() => {
          const nameText = token.name || "Unknown";
          const textWidthApprox = Math.max(safeSize * 1.4, nameText.length * safeSize * 0.14 * 0.6 + safeSize * 0.4);

          return (
          <Billboard position={nameplatePos}>
            <group
                onPointerDown={(!isInteractive || activeTool) ? undefined : handleNameplatePointerDown}
                onPointerMove={(!isInteractive || activeTool) ? undefined : handleNameplatePointerMove}
                onPointerUp={(!isInteractive || activeTool) ? undefined : handleNameplatePointerUp}
                onPointerOut={(!isInteractive || activeTool) ? undefined : (e) => { 
                    if (!isRotatingToken.current) document.body.style.cursor = 'auto'; 
                }}
                onPointerOver={(!isInteractive || activeTool) ? undefined : (e) => { e.stopPropagation(); if (canControl && !activeTool) document.body.style.cursor = 'ew-resize'; }}
                onClick={(!isInteractive || activeTool) ? undefined : (e) => e.stopPropagation()}
            >
                {/* Turn Indicator Glow */}
                {isActiveTurn && (
                    <RoundedBox args={[textWidthApprox + safeSize * 0.1, safeSize * 0.38, 0.01]} radius={safeSize * 0.05} smoothness={4} position={[0, 0, -0.02]}>
                        <meshStandardMaterial ref={nameplateGlowRef} color={baseColor} emissive={baseColor} emissiveIntensity={0.5} transparent opacity={opacity * 0.8} depthTest={true} />
                    </RoundedBox>
                )}

                {/* Stone Plaque Background */}
                <RoundedBox args={[textWidthApprox, safeSize * 0.28, 0.02]} radius={safeSize * 0.05} smoothness={4} position={[0, 0, -0.01]}>
                    <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.3} transparent opacity={opacity * 0.9} depthTest={true} />
                </RoundedBox>
                
                {/* Metal Inner Border */}
                <RoundedBox args={[textWidthApprox - safeSize * 0.05, safeSize * 0.23, 0.02]} radius={safeSize * 0.04} smoothness={4} position={[0, 0, -0.005]}>
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
                >
                    {nameText}
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
          );
        })()}
    </group>
    </group>
  );

  return (
    <group>
      {waypoints.map((wp, i) => {
          const startWp = i === 0 ? dragStartPos.current : waypoints[i - 1];
          return (
              <Line 
                  key={`wp-${i}`} 
                  points={[startWp, wp]} 
                  color="#f59e0b" 
                  lineWidth={3} 
                  depthTest={false} 
                  transparent 
                  opacity={0.6} 
                  renderOrder={100}
              />
          );
      })}

      <DragLine ref={rulerRef} />
      
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

      {canControl && isInteractive ? (
        <DragControls
          ref={dragControlsRef}
          axisLock="y"
          enabled={isTerrainReady && !activeTool && (draggedTokenId === token.id || (draggedTokenId === null && hovered))}
          onDragStart={(e) => {
            if (!isTopHitRef.current && draggedTokenId !== token.id) {
                console.log(`[Token ${token.name}] Aborting drag: not top hit.`);
                return; // Not the top hit, abort drag.
            }
            console.log(`[Token ${token.name}] onDragStart Fired!`);
            if (controls) {
                controls.mouseButtons.LEFT = undefined;
                controls.mouseButtons.RIGHT = 2;
            }
            isLeftDragging.current = true;
            hasDragged.current = true;
            
            const worldPos = new THREE.Vector3();
            if (meshRef.current) meshRef.current.getWorldPosition(worldPos);
            
            dragStartPos.current.copy(worldPos);
            previousPos.current.copy(worldPos);
            velocity.current.set(0, 0, 0);
            setDraggedTokenId(token.id);
            setWaypoints([]);
            totalWaypointDistRef.current = 0;

            // If we are starting a drag on a token that is NOT selected, 
            // OR if we click-drag a token without shift and it was part of a group, 
            // we should isolate the selection to just this token.
            const isShiftHeld = shiftHeldRef?.current;
            let isGroupDrag = selectedTokenIds && selectedTokenIds.includes(token.id) && selectedTokenIds.length > 1;

            if (!isShiftHeld && isGroupDrag && !e?.event?.shiftKey) {
                // User started dragging one token of a selected stack without holding shift.
                // We should break it out of the group and drag it alone.
                isGroupDrag = false;
            }

            if (groupDragData) {
                if (isGroupDrag) {
                    groupDragData.current.activeTokenId = token.id;
                    groupDragData.current.delta.set(0, 0, 0);
                } else {
                    groupDragData.current.activeTokenId = null;
                }
            }
            
            if (!isGroupDrag) {
                onSelect(token.id, false);
            }
          }}
          onDrag={() => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
          }}
          onDragEnd={() => {
            console.log("[Token3D] onDragEnd triggered for", token.id);
            if (controls) {
                controls.mouseButtons.LEFT = 2;
                controls.mouseButtons.RIGHT = 0;
            }
            hasDragged.current = false;
            isLeftDragging.current = false;

            if (rulerRef.current && rulerRef.current.hide) rulerRef.current.hide();
            if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
            if (rulerTextRef.current) rulerTextRef.current.style.display = 'none';
            setWaypoints([]);
            totalWaypointDistRef.current = 0;
            
            if (meshRef.current && dragControlsRef.current) {
              const worldPos = new THREE.Vector3();
              meshRef.current.getWorldPosition(worldPos);
              
              dragControlsRef.current.position.set(0, 0, 0);
              dragControlsRef.current.matrix.identity();
              dragControlsRef.current.updateMatrixWorld();
              
              const tokenSize = token.size || 1;
              const isEvenSize = Math.round(tokenSize) % 2 === 0;
              const snapX = isSnapToGrid ? (isEvenSize ? Math.round((worldPos.x - gridOffsetX) / gridSize) * gridSize + gridOffsetX : Math.floor((worldPos.x - gridOffsetX) / gridSize) * gridSize + gridSize / 2 + gridOffsetX) : worldPos.x;
              const snapZ = isSnapToGrid ? (isEvenSize ? Math.round((worldPos.z - gridOffsetY) / gridSize) * gridSize + gridOffsetY : Math.floor((worldPos.z - gridOffsetY) / gridSize) * gridSize + gridSize / 2 + gridOffsetY) : worldPos.z;
              
              if (groupDragData?.current?.activeTokenId === token.id) {
                  const snappedDelta = new THREE.Vector3(snapX - dragStartPos.current.x, 0, snapZ - dragStartPos.current.z);
                  if (onGroupDragEnd) onGroupDragEnd(token.id, snappedDelta);
                  groupDragData.current.activeTokenId = null;
                  groupDragData.current.delta.set(0, 0, 0);
              }

              const terrainY = getTerrainHeight ? getTerrainHeight(snapX, snapZ, safeSize / 2) : 0;
              const targetY = terrainY + (token.elevationOffset || 0) + tokenBaseOffset;
              
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
                  
                  setTimeout(() => {
                      if (isLeftDragging.current) return; // Prevent clearing if they already started dragging again
                      if (clearBroadcast) {
                          clearBroadcast(token.id);
                          const isGroupDrag = selectedTokenIds && selectedTokenIds.includes(token.id) && selectedTokenIds.length > 1;
                          if (isGroupDrag && selectedTokenIds) {
                              selectedTokenIds.forEach(id => clearBroadcast(id));
                          }
                      }
                      if (rtdbDragsRef && rtdbDragsRef.current) {
                          delete rtdbDragsRef.current[token.id];
                          const isGroupDrag = selectedTokenIds && selectedTokenIds.includes(token.id) && selectedTokenIds.length > 1;
                          if (isGroupDrag && selectedTokenIds) {
                              selectedTokenIds.forEach(id => delete rtdbDragsRef.current[id]);
                          }
                      }
                  }, 750);
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

const areTokensEqual = (prev, next) => {
    // Fast path: if the same object, they are equal
    if (prev.token === next.token && prev.isSelected === next.isSelected && prev.draggedTokenId === next.draggedTokenId && prev.activeTool === next.activeTool && prev.baseVisibility === next.baseVisibility && prev.alwaysVisible === next.alwaysVisible && prev.fowEnabled === next.fowEnabled && prev.getTerrainHeight === next.getTerrainHeight && prev.tokenBaseOffset === next.tokenBaseOffset && prev.hideBaseIf3D === next.hideBaseIf3D) {
        return true;
    }
    
    // Deep comparison of specific token fields to prevent re-renders when other tokens are dragged
    const pt = prev.token;
    const nt = next.token;
    
    if (pt.id !== nt.id || pt.x !== nt.x || pt.y !== nt.y || pt.z !== nt.z || pt.size !== nt.size || pt.rotationY !== nt.rotationY || pt.elevationOffset !== nt.elevationOffset || pt.isHidden !== nt.isHidden || pt.modelUrl !== nt.modelUrl || pt.image !== nt.image) {
        return false;
    }
    
    // Check if conditions arrays are different
    if ((pt.conditions || []).join(',') !== (nt.conditions || []).join(',')) return false;
    
    // Check primitive props
    if (prev.isSelected !== next.isSelected || prev.role !== next.role || prev.gridSize !== next.gridSize || prev.isSnapToGrid !== next.isSnapToGrid || prev.isTerrainReady !== next.isTerrainReady || prev.activeTool !== next.activeTool || prev.draggedTokenId !== next.draggedTokenId || prev.viewMode !== next.viewMode || prev.showNameplates !== next.showNameplates || prev.isActiveTurn !== next.isActiveTurn || prev.canControl !== next.canControl || prev.isInteractive !== next.isInteractive || prev.orientation !== next.orientation || prev.baseVisibility !== next.baseVisibility || prev.alwaysVisible !== next.alwaysVisible || prev.fowEnabled !== next.fowEnabled || prev.getTerrainHeight !== next.getTerrainHeight || prev.tokenBaseOffset !== next.tokenBaseOffset || prev.hideBaseIf3D !== next.hideBaseIf3D) {
        return false;
    }
    
    return true;
};

export default React.memo(Token3D, areTokensEqual);
