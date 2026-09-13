import React, { useState, useEffect, Suspense, useRef, useMemo, lazy } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Html, useCursor, Text, RoundedBox, Billboard, Line } from '@react-three/drei';
import * as THREE from 'three';
import { safeDisposeTexture } from '../../utils/threeDisposalUtils';
import { useResolvedUrl } from '../../utils/useResolvedUrl';
const CharacterModel = lazy(() => import('../CharacterModel').then(m => ({ default: m.default })));
import { retrieveChunkedMap } from '../../utils/storageUtils';
import Icon from '../Icon';
import { checkLineOfSight, isPointInManualFog, isSegmentBlockedByManualFog } from '../../utils/losUtils';
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
        const loader = new THREE.TextureLoader();
        const tex = loader.load(imageUrl);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }, [imageUrl]);

    useEffect(() => {
        return () => {
            if (texture) safeDisposeTexture(texture);
        };
    }, [texture]);

    if (!texture) return null;

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0075, 0]} castShadow receiveShadow>
            <circleGeometry args={[size * 0.45, 32]} />
            <meshBasicMaterial map={texture} transparent opacity={opacity} />
        </mesh>
    );
};

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

// ─── Interactive 3D Token ────────────────────────────────────────────────────
const Token3D = ({
  token, updateTokenPosition, gridSize = 1, gridOffsetX = 0, gridOffsetY = 0,
  isSelected, onSelect, onContextMenu, role, getTerrainHeight,
  isSnapToGrid, isTerrainReady, activeTool, draggedTokenId, setDraggedTokenId,
  viewMode, showNameplates, selectedTokenIds, groupDragData, onGroupDragEnd,
  isActiveTurn, canControl, shiftHeldRef, tokenBaseOffset = -0.12,
  isInteractive = true, orientation = 0, rtdbDragsRef, broadcastDrag,
  clearBroadcast, myUid, myClientId, baseVisibility, playerVisionSources,
  wallsArray, combinedLights, fowEnabled, alwaysVisible, hideBaseIf3D,
  isGlobalHovered, isSpaceDown = false, manualFogAlphaRef, aspect = 1, mapScale = 20,
  setIsDraggingToken
}) => {
  const meshRef    = useRef();
  const visualsRef = useRef();
  const rotationRef = useRef();
  const nameplateGlowRef = useRef();
  const { controls, gl, camera } = useThree();
  const resolvedImage = useResolvedUrl(token.image || token.img);
  const [saveStatus, setSaveStatus] = useState(null);

  // ── Core drag refs ─────────────────────────────────────────────────────────
  const isLeftDragging  = useRef(false);
  const hasDragged      = useRef(false);
  const dragStartPos    = useRef(new THREE.Vector3());
  const previousPos     = useRef(new THREE.Vector3(token.x || 0, token.y || 0.001, token.z || 0));
  const targetRotationY = useRef(token.rotationY || 0);
  const isWaitingForSync = useRef(false);
  const syncTarget      = useRef(new THREE.Vector3());
  const hasInitialized  = useRef(false);
  const dropLockUntil   = useRef(0);

  // ── Waypoints ──────────────────────────────────────────────────────────────
  const waypointsRef = useRef([]);
  const [waypoints, setWaypoints] = useState([]);
  const totalWaypointDistRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && isLeftDragging.current && meshRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const wp = new THREE.Vector3();
        meshRef.current.getWorldPosition(wp);
        const lastPt = waypointsRef.current.length > 0
          ? waypointsRef.current[waypointsRef.current.length - 1]
          : dragStartPos.current;
        const distSq = lastPt.distanceToSquared(wp);
        if (distSq < 0.05) return; // ignore duplicate/tiny movements
        totalWaypointDistRef.current += Math.sqrt(distSq);
        waypointsRef.current.push(wp.clone());
        setWaypoints([...waypointsRef.current]);

        if (rulerRef.current) {
          rulerRef.current.update(wp, wp);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const rulerRef      = useRef();
  const rulerLabelRef = useRef();
  const rulerTextRef  = useRef();

  const isTopDownView = viewMode === 'top-down';
  const showModel = !!token.modelUrl && !isTopDownView;

  if (token.isHidden && role !== 'dm') return null;
  const opacity  = token.isHidden ? 0.4 : (token.conditions?.includes('Invisible') ? 0.6 : 1);
  const isPc     = token.type === 'pc';
  const baseColor = token.color || (isPc ? '#22c55e' : '#ef4444');
  const size     = (token.size || 1) * gridSize;
  const safeSize = !Number.isFinite(size) || size < 0.001 ? gridSize : size;
  const scale    = isGlobalHovered ? 1.1 : 1;

  // ── Custom-drag internals (replaces DragControls) ──────────────────────────
  const dragPlane   = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragRay     = useRef(new THREE.Raycaster());
  const dragHit     = useRef(new THREE.Vector3());
  const dragOffset  = useRef(new THREE.Vector3());
  const dragCleanup = useRef(null); // stores { move, up } for removeEventListener

  // ── Touch / long-press ────────────────────────────────────────────────────
  const longPressTimer  = useRef();
  const touchStartPos   = useRef({ x: 0, y: 0 });

  // ── Rotation (nameplate drag) ─────────────────────────────────────────────
  const isRotatingToken = useRef(false);
  const lastPointerX    = useRef(0);
  const [isHoveringNameplate, setIsHoveringNameplate] = useState(false);

  useCursor(!isSpaceDown && isHoveringNameplate && canControl && !activeTool, 'ew-resize', 'auto');
  useCursor(!isSpaceDown && !isHoveringNameplate && isGlobalHovered && canControl && !activeTool, 'grab', 'auto');
  useCursor(!isSpaceDown && !isHoveringNameplate && isGlobalHovered && !canControl && !activeTool, 'pointer', 'auto');

  // ── Snap helpers ───────────────────────────────────────────────────────────
  const snapToGrid = (rawX, rawZ) => {
    if (!isSnapToGrid) return { x: rawX, z: rawZ };
    const tokenSize  = token.size || 1;
    const isEvenSize = Math.round(tokenSize) % 2 === 0;
    const x = isEvenSize
      ? Math.round((rawX - gridOffsetX) / gridSize) * gridSize + gridOffsetX
      : Math.floor((rawX - gridOffsetX) / gridSize) * gridSize + gridSize / 2 + gridOffsetX;
    const z = isEvenSize
      ? Math.round((rawZ - gridOffsetY) / gridSize) * gridSize + gridOffsetY
      : Math.floor((rawZ - gridOffsetY) / gridSize) * gridSize + gridSize / 2 + gridOffsetY;
    return { x, z };
  };

  const ndcFromEvent = (nativeEvent) => {
    const rect = gl.domElement.getBoundingClientRect();
    const clientX = nativeEvent?.clientX ?? (nativeEvent?.touches && nativeEvent.touches[0]?.clientX) ?? (nativeEvent?.changedTouches && nativeEvent.changedTouches[0]?.clientX) ?? 0;
    const clientY = nativeEvent?.clientY ?? (nativeEvent?.touches && nativeEvent.touches[0]?.clientY) ?? (nativeEvent?.changedTouches && nativeEvent.changedTouches[0]?.clientY) ?? 0;
    return {
      x:  ((clientX - rect.left) / rect.width)  *  2 - 1,
      y: -((clientY - rect.top)  / rect.height) *  2 + 1,
    };
  };

  // ── beginDrag ─────────────────────────────────────────────────────────────
  const beginDrag = (nativeEvent) => {
    if (!nativeEvent) return;
    if (nativeEvent.button !== undefined && nativeEvent.button !== 0 && nativeEvent.button !== -1) return;
    if (!canControl || activeTool || isSpaceDown || !isTerrainReady) return;
    
    // For mouse, only initiate drag if hovered topmost; for touch, we are already interacting with the target
    if (nativeEvent.pointerType === 'mouse' && !isGlobalHovered) return;
    if (draggedTokenId && draggedTokenId !== token.id) return; // another token owns this drag

    const worldPos = new THREE.Vector3();
    if (!meshRef.current) return;
    meshRef.current.getWorldPosition(worldPos);

    // Horizontal drag plane locked to the token's current Y — exact, no lerp ambiguity
    dragPlane.current.constant = -worldPos.y;

    // Compute the initial cursor-plane intersection and store the grab offset
    const ndc = ndcFromEvent(nativeEvent);
    dragRay.current.setFromCamera(ndc, camera);
    if (!dragRay.current.ray.intersectPlane(dragPlane.current, dragHit.current)) {
      dragHit.current.copy(worldPos); // fallback: no intersection (shouldn't happen)
    }
    dragOffset.current.subVectors(dragHit.current, worldPos).setY(0);

    dragStartPos.current.copy(worldPos);
    previousPos.current.copy(worldPos);
    isLeftDragging.current = true;
    hasDragged.current     = false;
    dropLockUntil.current  = 0;
    document.body.style.cursor = 'grabbing';
    waypointsRef.current = [];
    setWaypoints([]);
    totalWaypointDistRef.current = 0;

    setDraggedTokenId(token.id);
    setIsDraggingToken?.(true);
    if (controls) controls.enabled = false;

    // Group drag: set this token as leader so follower tokens know to move with it
    const isGroupDrag = selectedTokenIds?.includes(token.id) && selectedTokenIds.length > 1;
    if (groupDragData) {
      groupDragData.current.activeTokenId = isGroupDrag ? token.id : null;
      groupDragData.current.delta.set(0, 0, 0);
    }

    // Capture pointer so all events go to the canvas even when cursor leaves the token
    const pointerId = nativeEvent.pointerId;
    if (pointerId !== undefined && gl?.domElement?.setPointerCapture) {
      try {
        gl.domElement.setPointerCapture(pointerId);
      } catch (err) {}
    }

    const onMove = (e) => moveDrag(e);
    const onUp   = (e) => {
      endDrag(e);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
      if (pointerId !== undefined && gl?.domElement?.releasePointerCapture) {
        try {
          if (gl.domElement.hasPointerCapture && gl.domElement.hasPointerCapture(pointerId)) {
            gl.domElement.releasePointerCapture(pointerId);
          }
        } catch (err) {}
      }
    };
    dragCleanup.current = { move: onMove, up: onUp };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
  };

  // ── moveDrag ──────────────────────────────────────────────────────────────
  const moveDrag = (nativeEvent) => {
    if (!isLeftDragging.current || !meshRef.current) return;

    const ndc = ndcFromEvent(nativeEvent);
    dragRay.current.setFromCamera(ndc, camera);
    if (!dragRay.current.ray.intersectPlane(dragPlane.current, dragHit.current)) return;

    const rawX = dragHit.current.x - dragOffset.current.x;
    const rawZ = dragHit.current.z - dragOffset.current.z;
    const { x: snapX, z: snapZ } = snapToGrid(rawX, rawZ);

    const terrainY = getTerrainHeight ? getTerrainHeight(snapX, snapZ, safeSize / 2) : 0;
    const newY     = terrainY + (token.elevationOffset || 0) + tokenBaseOffset;

    // Directly set position — no DragControls internal state to fight
    meshRef.current.position.set(snapX, newY, snapZ);

    // Group drag: update delta so follower tokens can compute their own target
    if (groupDragData?.current?.activeTokenId === token.id) {
      groupDragData.current.delta.subVectors(
        new THREE.Vector3(snapX, 0, snapZ),
        dragStartPos.current
      );
    }

    // Ruler & Waypoints calculation
    const currentWps = waypointsRef.current;
    const activeStart = currentWps.length > 0 ? currentWps[currentWps.length - 1] : dragStartPos.current;
    const endPt       = new THREE.Vector3(snapX, newY, snapZ);
    const totalDist   = totalWaypointDistRef.current + endPt.distanceTo(activeStart);
    if (totalDist > 0.1) {
      rulerRef.current?.update(activeStart, endPt);
      if (rulerLabelRef.current) {
        rulerLabelRef.current.position.copy(activeStart).lerp(endPt, 0.5);
        rulerLabelRef.current.position.y = Math.max(activeStart.y, endPt.y) + 0.4;
        rulerLabelRef.current.visible = true;
      }
      if (rulerTextRef.current) {
        rulerTextRef.current.innerText = `${Math.round((totalDist / gridSize) * 5)} ft`;
        rulerTextRef.current.style.display = 'block';
      }
      // Model rotation follows drag direction
      const vel = new THREE.Vector3(snapX - previousPos.current.x, 0, snapZ - previousPos.current.z);
      if (vel.lengthSq() > 0.0001) targetRotationY.current = Math.atan2(vel.x, vel.z);
    } else {
      rulerRef.current?.hide();
      if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
    }

    // RTDB live broadcast so other players see the token move in real time
    if (rtdbDragsRef?.current) {
      rtdbDragsRef.current[token.id] = { x: snapX, z: snapZ, rotationY: targetRotationY.current, clientId: myClientId };
    }
    broadcastDrag?.(token.id, snapX, snapZ, targetRotationY.current);

    previousPos.current.set(snapX, 0, snapZ);
    hasDragged.current = true;

    // Cancel touch long-press if user starts moving
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ── endDrag ───────────────────────────────────────────────────────────────
  const endDrag = (nativeEvent) => {
    if (!isLeftDragging.current) return;
    isLeftDragging.current = false;

    if (controls) controls.enabled = true;
    setIsDraggingToken?.(false);
    document.body.style.cursor = 'auto';

    // Hide ruler
    rulerRef.current?.hide();
    if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
    if (rulerTextRef.current)  rulerTextRef.current.style.display = 'none';
    waypointsRef.current = [];
    setWaypoints([]);
    totalWaypointDistRef.current = 0;

    if (!meshRef.current) { setDraggedTokenId(null); return; }

    const worldPos = new THREE.Vector3();
    meshRef.current.getWorldPosition(worldPos);
    const dragDist = worldPos.distanceTo(dragStartPos.current);

    // ── Click guard: no real movement → restore and bail ─────────────────
    if (!hasDragged.current || dragDist < 0.05) {
      meshRef.current.position.copy(dragStartPos.current);
      hasDragged.current = false;
      setDraggedTokenId(null);
      const isMulti = shiftHeldRef?.current;
      if (!isMulti && selectedTokenIds && selectedTokenIds.length > 1) {
        onSelect?.(null, token.id, false);
      }
      return;
    }

    // Position was already snapped in moveDrag, just read it back
    const snapX   = worldPos.x;
    const snapZ   = worldPos.z;
    const terrainY = getTerrainHeight ? getTerrainHeight(snapX, snapZ, safeSize / 2) : 0;
    const targetY  = terrainY + (token.elevationOffset || 0) + tokenBaseOffset;

    // Lock position hard and prevent the lerp from rubber-banding for 600ms
    meshRef.current.position.set(snapX, targetY, snapZ);
    syncTarget.current.set(snapX, targetY, snapZ);
    isWaitingForSync.current = true;
    dropLockUntil.current    = performance.now() + 600;

    // Group drag finalization
    if (groupDragData?.current?.activeTokenId === token.id) {
      const delta = new THREE.Vector3(snapX - dragStartPos.current.x, 0, snapZ - dragStartPos.current.z);
      onGroupDragEnd?.(token.id, delta);
      groupDragData.current.activeTokenId = null;
      groupDragData.current.delta.set(0, 0, 0);
    }

    setSaveStatus('saving');
    updateTokenPosition(token.id, {
      x: snapX, y: targetY, z: snapZ,
      elevationOffset: token.elevationOffset || 0,
      rotationY: targetRotationY.current
    }).then(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
      // Release drop lock now that Firebase has confirmed
      dropLockUntil.current   = 0;
      isWaitingForSync.current = false;
      setTimeout(() => {
        if (isLeftDragging.current) return;
        clearBroadcast?.(token.id);
        if (rtdbDragsRef?.current) {
          delete rtdbDragsRef.current[token.id];
          if (selectedTokenIds?.length > 1) {
            selectedTokenIds.forEach(id => {
              clearBroadcast?.(id);
              delete rtdbDragsRef.current[id];
            });
          }
        }
      }, 750);
    }).catch(err => {
      console.error('[Token] save failed:', err);
      setSaveStatus(null);
      dropLockUntil.current = 0;
    });

    hasDragged.current = false;
    setDraggedTokenId(null);
  };

  // ── Token position: sync from Firebase (not during local drag) ─────────────
  const initialPosition = useMemo(() => {
    const pos = new THREE.Vector3(token.x || 0, token.y || tokenBaseOffset, token.z || 0);
    if (getTerrainHeight && isTerrainReady) {
      const ty = getTerrainHeight(pos.x, pos.z, safeSize / 2);
      pos.y = ty + (token.elevationOffset || 0) + tokenBaseOffset;
    }
    return [pos.x, pos.y, pos.z];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!meshRef.current || isLeftDragging.current) return;
    const isRemoteDragging = rtdbDragsRef?.current?.[token.id] &&
      rtdbDragsRef.current[token.id].clientId !== myClientId;
    if (isRemoteDragging) return;

    const target = new THREE.Vector3(token.x || 0, token.y || tokenBaseOffset, token.z || 0);
    if (getTerrainHeight && isTerrainReady) {
      const ty = getTerrainHeight(target.x, target.z, safeSize / 2);
      target.y = ty + (token.elevationOffset || 0) + tokenBaseOffset;
    }

    if (isWaitingForSync.current) {
      if (target.distanceTo(syncTarget.current) < 0.01) isWaitingForSync.current = false;
      else return;
    }

    if (!hasInitialized.current || meshRef.current.position.distanceTo(target) > 2) {
      meshRef.current.position.copy(target);
      hasInitialized.current = true;
    }
  }, [token.x, token.y, token.z, token.id, getTerrainHeight, isTerrainReady, safeSize, token.elevationOffset, tokenBaseOffset, rtdbDragsRef, myClientId]);

  useEffect(() => {
    targetRotationY.current = token.rotationY || 0;
  }, [token.rotationY]);

  // ── useFrame ───────────────────────────────────────────────────────────────
  useFrame((state) => {
    // Turn indicator glow pulse
    if (nameplateGlowRef.current && isActiveTurn) {
      const t = state.clock.elapsedTime;
      nameplateGlowRef.current.opacity = opacity * (0.4 + Math.sin(t * 3) * 0.4);
      nameplateGlowRef.current.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.5;
    }

    if (!meshRef.current || !visualsRef.current || !rotationRef.current || !getTerrainHeight) return;

    if (!isLeftDragging.current) {
      // ── Remote / idle: lerp toward Firebase position ─────────────────────
      if (rulerRef.current?.hide) rulerRef.current.hide();
      if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
      if (rulerTextRef.current)  rulerTextRef.current.style.display = 'none';

      // visualsRef is always at local-space 0 when not in DragControls snap-preview mode
      visualsRef.current.position.x = 0;
      visualsRef.current.position.z = 0;

      let targetPos = new THREE.Vector3(token.x || 0, token.y || tokenBaseOffset, token.z || 0);

      if (!isWaitingForSync.current && getTerrainHeight) {
        const ty = getTerrainHeight(targetPos.x, targetPos.z, safeSize / 2);
        targetPos.y = ty + (token.elevationOffset || 0) + tokenBaseOffset;
      }

      // Follow remote drag via RTDB
      const rDrag = rtdbDragsRef?.current?.[token.id];
      if (rDrag && rDrag.clientId !== myClientId) {
        targetPos.x = rDrag.x;
        targetPos.z = rDrag.z;
        const ty = getTerrainHeight(rDrag.x, rDrag.z, safeSize / 2);
        targetPos.y = ty + (token.elevationOffset || 0) + tokenBaseOffset;
        if (rDrag.rotationY !== undefined) targetRotationY.current = rDrag.rotationY;
      }

      if (isWaitingForSync.current) targetPos.copy(syncTarget.current);

      // Group follower: move with the leader token's delta
      let isFollower = false;
      if (isSelected && groupDragData?.current?.activeTokenId && groupDragData.current.activeTokenId !== token.id) {
        isFollower = true;
        targetPos = targetPos.clone().add(groupDragData.current.delta);
        const ty = getTerrainHeight ? getTerrainHeight(targetPos.x, targetPos.z, safeSize / 2) : 0;
        targetPos.y = ty + (token.elevationOffset || 0) + tokenBaseOffset;
        const moveDelta = targetPos.clone().sub(meshRef.current.position);
        moveDelta.y = 0;
        if (moveDelta.lengthSq() > 0.0001) {
          targetRotationY.current = Math.atan2(moveDelta.x, moveDelta.z);
        }
        broadcastDrag?.(token.id, targetPos.x, targetPos.z, targetRotationY.current);
      }

      const p = meshRef.current.position;
      // Hold snapped position during drop-lock window; otherwise lerp smoothly
      if (performance.now() < dropLockUntil.current) {
        p.copy(targetPos);
      } else {
        p.lerp(targetPos, 0.15);
      }

      // Rotation lerp
      const isRemoteDragging = rDrag && rDrag.clientId !== myClientId;
      const targetRotY = (isRotatingToken.current || isRemoteDragging || isFollower)
        ? targetRotationY.current
        : (token.rotationY || 0);
      const diff = targetRotY - rotationRef.current.rotation.y;
      rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.15;

    } else {
      // ── Local drag active: update rotation only (position set directly in moveDrag) ─
      visualsRef.current.position.x = 0;
      visualsRef.current.position.z = 0;
      const terrainY = getTerrainHeight(meshRef.current.position.x, meshRef.current.position.z, safeSize / 2);
      meshRef.current.position.y = terrainY + (token.elevationOffset || 0) + tokenBaseOffset;

      const diff = targetRotationY.current - rotationRef.current.rotation.y;
      rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.3;
    }

    // ── Live Visibility Engine (throttled to ~10 FPS) ──────────────────────
    const t = state.clock.elapsedTime;
    if (t - (visualsRef.current.lastVisibilityCheck || 0) > 0.1) {
      visualsRef.current.lastVisibilityCheck = t;
      let currentVisibility = baseVisibility;
      const hasActiveDrag = rtdbDragsRef?.current ? Object.keys(rtdbDragsRef.current).length > 0 : false;

      if (hasActiveDrag && !alwaysVisible) {
        let isVisible = false;
        const targetPt = { x: meshRef.current.position.x, z: meshRef.current.position.z };
        const fogAlpha = manualFogAlphaRef?.current;

        if (isPointInManualFog(targetPt.x, targetPt.z, fogAlpha, mapScale, aspect)) {
          meshRef.current.visible = false;
          return;
        }

        const isTargetInvisible = (token.conditions || []).some(c =>
          (typeof c === 'string' ? c : c.name)?.toLowerCase() === 'invisible'
        );

        const activeVisionSources = (playerVisionSources || []).map(src => {
          const d = rtdbDragsRef.current[src.id];
          return d ? { ...src, x: d.x, z: d.z } : src;
        });

        for (const src of activeVisionSources) {
          const dist = Math.sqrt((src.x - targetPt.x) ** 2 + (src.z - targetPt.z) ** 2);
          const hasLOS = checkLineOfSight(src, targetPt, wallsArray) &&
            !isSegmentBlockedByManualFog(src, targetPt, fogAlpha, mapScale, aspect);

          if ((dist <= (src.truesight ?? 0) && hasLOS) ||
              (dist <= (src.blindsight ?? 0) && hasLOS) ||
              (dist <= (src.tremorsense ?? 0) && (token.elevationOffset || 0) === 0)) {
            isVisible = true; break;
          }
          if (isTargetInvisible) continue;
          if (dist <= (src.darkvision ?? src.range) && hasLOS) { isVisible = true; break; }

          if (combinedLights && fowEnabled !== false && hasLOS) {
            for (const light of Object.values(combinedLights)) {
              const lr = (light.radius || 15) / 5 * gridSize;
              const lp = { x: light.position.x, z: light.position.z };
              const dl = Math.sqrt((lp.x - targetPt.x) ** 2 + (lp.z - targetPt.z) ** 2);
              if (dl <= lr && checkLineOfSight(lp, targetPt, wallsArray) &&
                  !isSegmentBlockedByManualFog(lp, targetPt, fogAlpha, mapScale, aspect)) {
                isVisible = true; break;
              }
            }
            if (isVisible) break;
          }
        }
        currentVisibility = isVisible;
      } else if (alwaysVisible) {
        currentVisibility = true;
      }

      meshRef.current.visible = currentVisibility;
    }
  });

  // ── Ghosting: make token transparent to raycaster when a tool is active ───
  useEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.traverse(child => {
      if (typeof child.raycast !== 'function') return;
      if (child.raycast.name !== 'ghostRaycast' && !child.userData.originalRaycast) {
        child.userData.originalRaycast = child.raycast;
      }
      if (activeTool || isSpaceDown) {
        child.raycast = function ghostRaycast() {};
      } else {
        child.raycast = child.userData.originalRaycast || child.raycast;
      }
    });
  });

  // ── Nameplate rotation handlers ────────────────────────────────────────────
  const handleNameplatePointerDown = (e) => {
    if (!canControl || activeTool) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();

    isRotatingToken.current = true;
    const clientX = e.clientX ?? (e.nativeEvent?.touches && e.nativeEvent.touches[0]?.clientX) ?? 0;
    lastPointerX.current = clientX;
    document.body.style.cursor = 'ew-resize';
    if (controls) controls.enabled = false;

    const nativeEvent = e.nativeEvent;
    const pointerId = nativeEvent?.pointerId;

    if (gl?.domElement && pointerId !== undefined) {
      try {
        gl.domElement.setPointerCapture(pointerId);
      } catch (err) {}
    }

    const onMove = (moveEv) => {
      if (!isRotatingToken.current || !meshRef.current) return;
      const currentX = moveEv.clientX ?? (moveEv.touches && moveEv.touches[0]?.clientX) ?? lastPointerX.current;
      const deltaX = currentX - lastPointerX.current;
      lastPointerX.current = currentX;
      targetRotationY.current += deltaX * 0.05;
      if (broadcastDrag) {
        const wp = new THREE.Vector3();
        meshRef.current.getWorldPosition(wp);
        broadcastDrag(token.id, wp.x, wp.z, targetRotationY.current);
        if (rtdbDragsRef?.current) {
          rtdbDragsRef.current[token.id] = { x: wp.x, z: wp.z, rotationY: targetRotationY.current, clientId: myClientId };
        }
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);

      if (gl?.domElement && pointerId !== undefined) {
        try {
          if (gl.domElement.hasPointerCapture(pointerId)) {
            gl.domElement.releasePointerCapture(pointerId);
          }
        } catch (err) {}
      }

      isRotatingToken.current = false;
      if (controls) controls.enabled = true;
      document.body.style.cursor = isHoveringNameplate ? 'ew-resize' : 'auto';

      updateTokenPosition(token.id, { rotationY: targetRotationY.current }).then(() => {
        clearBroadcast?.(token.id);
      }).catch(err => {
        console.error('[Token3D] rotation update failed:', err);
      });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
  };

  // ── Touch / long-press helpers ─────────────────────────────────────────────
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const handleTouchStart = (e) => {
    if (draggedTokenId && draggedTokenId !== token.id) return;
    if (!isTerrainReady) return;
    if (!(e.pointerType === 'touch' || e.pointerType === 'pen')) return;

    touchStartPos.current = { x: e.clientX, y: e.clientY };
    const startWorldPos = new THREE.Vector3();
    if (meshRef.current) meshRef.current.getWorldPosition(startWorldPos);

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      let moved = false;
      if (hasDragged.current) {
        const cur = new THREE.Vector3();
        if (meshRef.current) meshRef.current.getWorldPosition(cur);
        if (cur.distanceToSquared(startWorldPos) > 0.01) moved = true;
      }
      if (canControl && !moved) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
        const mockEvent = { clientX: touchStartPos.current.x, clientY: touchStartPos.current.y, preventDefault: () => {}, stopPropagation: () => {} };
        onContextMenu?.(mockEvent, token);
      }
    }, 500);
  };

  const handlePointerMoveForLongPress = (e) => {
    if (longPressTimer.current) {
      const dx = e.clientX - touchStartPos.current.x;
      const dy = e.clientY - touchStartPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) cancelLongPress();
    }
  };

  // ── Derived layout ─────────────────────────────────────────────────────────
  const nameplatePos = useMemo(() => {
    const baseZ  = viewMode === 'top-down' ? safeSize * 0.75 : safeSize * 0.85;
    const baseY  = viewMode === 'top-down' ? 0 : safeSize * 0.2;
    const angle  = orientation * (Math.PI / 2);
    return [Math.sin(angle) * baseZ, baseY, Math.cos(angle) * baseZ];
  }, [safeSize, viewMode, orientation]);

  const initials = useMemo(() => {
    const name  = token.name || 'Unknown';
    const parts = name.split(/[\s-]+/).filter(p => p.length > 0);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }, [token.name]);

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <group>
      {/* Waypoint trail lines */}
      {waypoints.map((wp, i) => {
        const startWp = i === 0 ? dragStartPos.current : waypoints[i - 1];
        return (
          <Line key={`wp-${i}`} points={[startWp, wp]}
            color="#f59e0b" lineWidth={3} depthTest={false} transparent opacity={0.6} renderOrder={100} />
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

      {/* ── Token body ─────────────────────────────────────────────────── */}
      <group
        ref={meshRef}
        position={initialPosition}
        scale={[scale, scale, scale]}
        userData={{ tokenId: token.id }}
        onPointerDown={(!isInteractive || activeTool || isSpaceDown) ? undefined : (e) => {
          if (e.button === 1 || e.button === 2) { e.stopPropagation(); return; }
          e.stopPropagation();
          const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
          if (isTouch) {
            const tokenHits = (e.intersections || [])
              .map(h => {
                let curr = h.object;
                while (curr) {
                  if (curr.userData?.tokenId) return curr.userData.tokenId;
                  curr = curr.parent;
                }
                return null;
              })
              .filter(Boolean);
            if (tokenHits.length > 0 && tokenHits[0] !== token.id) return;
          }

          if (onSelect) {
            const isMulti = e.shiftKey || shiftHeldRef?.current;
            if (isMulti) {
              onSelect(e, token.id, true);
            } else if (!selectedTokenIds?.includes(token.id)) {
              onSelect(e, token.id, false);
            }
          }

          handleTouchStart(e);
          beginDrag(e.nativeEvent);
        }}
        onPointerMove={(!isInteractive || activeTool || isSpaceDown) ? undefined : handlePointerMoveForLongPress}
        onPointerUp={(!isInteractive || activeTool || isSpaceDown) ? undefined : cancelLongPress}
        onPointerOut={(!isInteractive || activeTool || isSpaceDown) ? undefined : cancelLongPress}
        onPointerCancel={(!isInteractive || activeTool || isSpaceDown) ? undefined : cancelLongPress}
        onPointerLeave={(!isInteractive || activeTool || isSpaceDown) ? undefined : cancelLongPress}
        onClick={(!isInteractive || activeTool || isSpaceDown) ? undefined : (e) => {
          e.stopPropagation();
          if (e.button === 2) return;
          if (!isTerrainReady) return;
          const isMulti = e.shiftKey || shiftHeldRef?.current;
          onSelect?.(e, token.id, isMulti);
        }}
        onContextMenu={(!isInteractive || activeTool || isSpaceDown) ? undefined : (e) => {
          e.stopPropagation();
          if (e.nativeEvent) e.nativeEvent.preventDefault();
          if (canControl) onContextMenu?.(e, token);
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
                    <Text position={[0, 0, 0.01]} fontSize={safeSize * 0.35} color={baseColor} anchorX="center" anchorY="middle" fontWeight="bold" fillOpacity={opacity}>
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
                  <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.1} transparent opacity={opacity} />
                </mesh>
                {/* Inner colored accent ring */}
                <mesh position={[0, 0.006, 0]} castShadow receiveShadow>
                  <cylinderGeometry args={[safeSize * 0.46, safeSize * 0.46, 0.002, 32]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={isGlobalHovered ? 0.5 : 0.1} transparent opacity={opacity} />
                </mesh>
                {/* Direction cone */}
                <mesh position={[0, 0.006, safeSize * 0.45]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                  <coneGeometry args={[safeSize * 0.15, safeSize * 0.2, 3]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={isGlobalHovered ? 0.5 : 0.1} transparent opacity={opacity} />
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

          {/* ── Nameplate ──────────────────────────────────────────────── */}
          {showNameplates && (() => {
            const nameText = token.name || 'Unknown';
            const textWidthApprox = Math.max(safeSize * 1.4, nameText.length * safeSize * 0.14 * 0.6 + safeSize * 0.4);
            return (
              <Billboard position={nameplatePos}>
                <group
                  onPointerDown={(!isInteractive || activeTool || isSpaceDown) ? undefined : handleNameplatePointerDown}
                  onPointerOut={(!isInteractive || activeTool || isSpaceDown) ? undefined : (e) => { 
                    e.stopPropagation(); 
                    setIsHoveringNameplate(false); 
                    if (!isRotatingToken.current) document.body.style.cursor = 'auto'; 
                  }}
                  onPointerOver={(!isInteractive || activeTool || isSpaceDown) ? undefined : (e) => { 
                    e.stopPropagation(); 
                    if (canControl && !activeTool) {
                      setIsHoveringNameplate(true);
                      document.body.style.cursor = 'ew-resize';
                    }
                  }}
                  onClick={(!isInteractive || activeTool || isSpaceDown) ? undefined : (e) => e.stopPropagation()}
                  onContextMenu={(!isInteractive || activeTool || isSpaceDown) ? undefined : (e) => {
                    e.stopPropagation();
                    if (e.nativeEvent) e.nativeEvent.preventDefault();
                    if (canControl) onContextMenu?.(e, token);
                  }}
                >
                  {isActiveTurn && (
                    <RoundedBox args={[textWidthApprox + safeSize * 0.1, safeSize * 0.38, 0.01]} radius={safeSize * 0.05} smoothness={4} position={[0, 0, -0.02]}>
                      <meshStandardMaterial ref={nameplateGlowRef} color={baseColor} emissive={baseColor} emissiveIntensity={0.5} transparent opacity={opacity * 0.8} depthTest />
                    </RoundedBox>
                  )}
                  <RoundedBox args={[textWidthApprox, safeSize * 0.28, 0.02]} radius={safeSize * 0.05} smoothness={4} position={[0, 0, -0.01]}>
                    <meshStandardMaterial 
                      color={isHoveringNameplate && canControl ? "#334155" : "#1e293b"} 
                      roughness={0.7} 
                      metalness={0.3} 
                      emissive={isHoveringNameplate && canControl ? baseColor : "#000000"}
                      emissiveIntensity={isHoveringNameplate && canControl ? 0.3 : 0}
                      transparent 
                      opacity={opacity * 0.9} 
                      depthTest 
                    />
                  </RoundedBox>
                  <RoundedBox args={[textWidthApprox - safeSize * 0.05, safeSize * 0.23, 0.02]} radius={safeSize * 0.04} smoothness={4} position={[0, 0, -0.005]}>
                    <meshStandardMaterial color={isHoveringNameplate && canControl ? "#1e293b" : "#0f172a"} roughness={0.4} metalness={0.8} transparent opacity={opacity * 0.9} depthTest />
                  </RoundedBox>
                  <Text position={[0, 0, 0.01]} fontSize={safeSize * 0.14} color="#e2e8f0" anchorX="center" anchorY="middle" fontWeight="bold" fillOpacity={opacity} depthTest>
                    {nameText}
                  </Text>
                  {Math.abs(token.elevationOffset || 0) > 0.1 && (
                    <Text position={[0, safeSize * 0.25, 0]} fontSize={safeSize * 0.12} color="#93c5fd" outlineWidth={safeSize * 0.02} outlineColor="#1e3a8a" anchorX="center" anchorY="middle" fontWeight="bold" fillOpacity={opacity} outlineOpacity={opacity} depthTest>
                      {token.elevationOffset > 0 ? '↑ ' : '↓ '}{Math.round((token.elevationOffset || 0) * 5)}ft
                    </Text>
                  )}
                  {token.conditions?.length > 0 && (
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
                  {saveStatus && (
                    <Text position={[0, -safeSize * 0.25, 0]} fontSize={safeSize * 0.1} color="#fbbf24" outlineWidth={safeSize * 0.015} outlineColor="#78350f" anchorX="center" anchorY="middle" fontWeight="bold" fillOpacity={opacity} outlineOpacity={opacity} depthTest>
                      {saveStatus === 'saving' ? 'Saving...' : 'Saved ✓'}
                    </Text>
                  )}
                </group>
              </Billboard>
            );
          })()}
        </group>
      </group>
    </group>
  );
};

// ── Memo equality: only re-render when relevant props change ─────────────────
const areTokensEqual = (prev, next) => {
  if (prev.token === next.token && prev.isSelected === next.isSelected && prev.draggedTokenId === next.draggedTokenId && prev.activeTool === next.activeTool && prev.baseVisibility === next.baseVisibility && prev.alwaysVisible === next.alwaysVisible && prev.fowEnabled === next.fowEnabled && prev.getTerrainHeight === next.getTerrainHeight && prev.tokenBaseOffset === next.tokenBaseOffset && prev.hideBaseIf3D === next.hideBaseIf3D && prev.isGlobalHovered === next.isGlobalHovered && prev.isSpaceDown === next.isSpaceDown) {
    return true;
  }
  const pt = prev.token, nt = next.token;
  if (pt.id !== nt.id || pt.x !== nt.x || pt.y !== nt.y || pt.z !== nt.z || pt.size !== nt.size || pt.rotationY !== nt.rotationY || pt.elevationOffset !== nt.elevationOffset || pt.isHidden !== nt.isHidden || pt.modelUrl !== nt.modelUrl || pt.image !== nt.image) return false;
  if ((pt.conditions || []).join(',') !== (nt.conditions || []).join(',')) return false;
  if (prev.isSelected !== next.isSelected || prev.role !== next.role || prev.gridSize !== next.gridSize || prev.isSnapToGrid !== next.isSnapToGrid || prev.isTerrainReady !== next.isTerrainReady || prev.activeTool !== next.activeTool || prev.draggedTokenId !== next.draggedTokenId || prev.viewMode !== next.viewMode || prev.showNameplates !== next.showNameplates || prev.isActiveTurn !== next.isActiveTurn || prev.canControl !== next.canControl || prev.isInteractive !== next.isInteractive || prev.orientation !== next.orientation || prev.baseVisibility !== next.baseVisibility || prev.alwaysVisible !== next.alwaysVisible || prev.fowEnabled !== next.fowEnabled || prev.getTerrainHeight !== next.getTerrainHeight || prev.tokenBaseOffset !== next.tokenBaseOffset || prev.hideBaseIf3D !== next.hideBaseIf3D || prev.isGlobalHovered !== next.isGlobalHovered || prev.isSpaceDown !== next.isSpaceDown) return false;
  return true;
};

export default React.memo(Token3D, areTokensEqual);
