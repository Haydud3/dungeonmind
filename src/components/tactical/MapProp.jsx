import React, { useRef, useState, useMemo, lazy, Suspense } from 'react';
import * as THREE from 'three';
const CharacterModel = lazy(() => import('../CharacterModel').then(m => ({ default: m.default })));
import { useResolvedUrl } from '../../utils/useResolvedUrl';
import { DragControls } from '@react-three/drei';

const Prop2DMesh = ({ url, w, h, isSelected, hovered, onSelect, onContextMenu, onPointerOver, onPointerOut }) => {
    const meshRef = useRef();
    
    const [aspect, setAspect] = useState(1);

    const texture = useMemo(() => {
        if (!url) return null;
        const loader = new THREE.TextureLoader();
        return loader.load(
            url, 
            (tex) => {
                if (tex.image) {
                    tex.minFilter = THREE.LinearMipMapLinearFilter;
                    tex.magFilter = THREE.LinearFilter;
                    tex.colorSpace = THREE.SRGBColorSpace;
                    setAspect(tex.image.width / tex.image.height);
                }
            },
            undefined,
            (err) => {
                console.warn('Failed to load map prop texture:', url, err);
            }
        );
    }, [url]);

    // Scale down instead of up to ensure the max dimension perfectly matches the grid cell (w/h)
    const finalW = w * (aspect > 1 ? 1 : aspect);
    const finalH = h * (aspect > 1 ? 1 / aspect : 1);

    return (
        <mesh
            ref={meshRef}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={onSelect}
            onContextMenu={onContextMenu}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
            castShadow
            receiveShadow
        >
            <planeGeometry args={[finalW, finalH]} />
            {texture ? (
                <meshStandardMaterial 
                    map={texture} 
                    transparent 
                    alphaTest={0.1}
                    color={(isSelected || hovered) ? "#ffdd88" : "#ffffff"} 
                    side={THREE.DoubleSide}
                />
            ) : (
                <meshStandardMaterial 
                    color={(isSelected || hovered) ? "#ffdd88" : "#888888"} 
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0.5}
                />
            )}
        </mesh>
    );
};

export const MapProp = ({ propData, isSelected, onSelect, onContextMenu, getTerrainHeight, updatePropPosition, gridSize = 1 }) => {
    const [hovered, setHovered] = useState(false);
    const groupRef = useRef();
    const dragControlsRef = useRef();

    // Resolve CORS issues identically to tokens
    let imgUrl = propData.image;
    if (imgUrl && imgUrl.startsWith('http') && !imgUrl.includes('firebasestorage.googleapis.com') && !imgUrl.includes('wsrv.nl')) {
        imgUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&cors=1`;
    }

    const resolvedUrl = useResolvedUrl(imgUrl);

    // Apply the gridSize multiplier so a default scale of 1.0 perfectly wraps 1 grid square
    const baseScale = (propData.scale || 1.0) * gridSize;

    const x = propData.x || 0;
    const z = propData.z || 0;
    
    // Add small epsilon to avoid Z-fighting with the ground, plus any manual elevation
    const elevation = propData.elevation !== undefined ? propData.elevation : 0;
    const baseY = getTerrainHeight ? getTerrainHeight(x, z) : 0;
    const y = baseY + elevation + 0.05; 
    
    const rotY = (propData.rotation || 0) * (Math.PI / 180);

    const is3D = propData.is3D || propData.modelUrl;

    const longPressTimer = useRef();
    const touchStartPos = useRef({ x: 0, y: 0 });

    const cancelLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handlePointerDown = (e) => {
        if (e.button === 1 || e.button === 2) {
            e.stopPropagation();
            return;
        }
        
        if (e.pointerType === 'touch') {
            touchStartPos.current = { x: e.clientX, y: e.clientY };
            longPressTimer.current = setTimeout(() => {
                longPressTimer.current = null;
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
                const mockEvent = { clientX: touchStartPos.current.x, clientY: touchStartPos.current.y, preventDefault: () => {}, stopPropagation: () => {} };
                if (onContextMenu) onContextMenu(mockEvent, propData.id);
            }, 500);
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

    const content = (
        <group ref={groupRef} position={[x, y, z]} rotation={[0, -rotY, 0]}
               onPointerDown={handlePointerDown}
               onPointerMove={handlePointerMove}
               onPointerUp={handlePointerUp}
               onPointerCancel={handlePointerUp}
               onPointerLeave={handlePointerUp}
               onPointerOut={handlePointerUp}
        >
            {/* The actual prop mesh */}
            {is3D ? (
                <group
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onSelect) onSelect(propData.id, e);
                    }}
                    onContextMenu={(e) => {
                        e.stopPropagation();
                        if (onContextMenu) onContextMenu(e, propData.id);
                    }}
                    onPointerOver={(e) => {
                        e.stopPropagation();
                        setHovered(true);
                    }}
                    onPointerOut={(e) => {
                        e.stopPropagation();
                        setHovered(false);
                    }}
                >
                    <Suspense fallback={null}>
                        <CharacterModel modelUrl={propData.modelUrl || propData.url} scale={baseScale} />
                    </Suspense>
                </group>
            ) : (
                resolvedUrl ? (
                    <Prop2DMesh
                        url={resolvedUrl}
                        w={baseScale}
                        h={baseScale}
                        isSelected={isSelected}
                        hovered={hovered}
                        onSelect={(e) => {
                            e.stopPropagation();
                            if (onSelect) onSelect(propData.id, e);
                        }}
                        onContextMenu={(e) => {
                            e.stopPropagation();
                            if (onContextMenu) onContextMenu(e, propData.id);
                        }}
                        onPointerOver={(e) => {
                            e.stopPropagation();
                            setHovered(true);
                        }}
                        onPointerOut={(e) => {
                            e.stopPropagation();
                            setHovered(false);
                        }}
                    />
                ) : null
            )}

            {/* Selection Highlight Ring */}
            {isSelected && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.01]}>
                    <ringGeometry args={[baseScale / 2 + 0.1, baseScale / 2 + 0.15, 32]} />
                    <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} />
                </mesh>
            )}
        </group>
    );

    if (propData.isLocked) {
        return content;
    }

    return (
        <DragControls
            ref={dragControlsRef}
            axisLockY={true}
            onDragStart={() => setHovered(true)}
            onDrag={cancelLongPress}
            onDragEnd={() => {
                setHovered(false);
                if (groupRef.current && dragControlsRef.current && updatePropPosition) {
                    // Get the true world position resulting from the drag
                    const worldPos = new THREE.Vector3();
                    groupRef.current.getWorldPosition(worldPos);

                    // Reset DragControls wrapper to avoid double-offsetting when props update
                    dragControlsRef.current.position.set(0, 0, 0);
                    dragControlsRef.current.matrix.identity();
                    dragControlsRef.current.updateMatrixWorld();

                    groupRef.current.position.set(worldPos.x, groupRef.current.position.y, worldPos.z);

                    updatePropPosition(propData.id, { 
                        x: worldPos.x, 
                        z: worldPos.z 
                    });
                }
            }}
        >
            {content}
        </DragControls>
    );};

const arePropsEqual = (prev, next) => {
    if (prev.propData === next.propData && prev.isSelected === next.isSelected) return true;
    
    const pp = prev.propData;
    const np = next.propData;

    if (pp.id !== np.id || pp.x !== np.x || pp.y !== np.y || pp.z !== np.z || pp.scale !== np.scale || pp.rotation !== np.rotation || pp.elevation !== np.elevation || pp.image !== np.image || pp.modelUrl !== np.modelUrl || pp.isLocked !== np.isLocked || pp.hasCollision !== np.hasCollision) {
        return false;
    }    
    if (prev.isSelected !== next.isSelected || prev.gridSize !== next.gridSize) return false;
    
    return true;
};

export default React.memo(MapProp, arePropsEqual);
