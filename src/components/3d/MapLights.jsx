import React, { useState, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';

const LightPool = ({ lights, gridSize = 1, maxLights = 8 }) => {
    const poolRefs = useRef([]);
    const { camera } = useThree();

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const lightsArray = Object.values(lights || {}).filter(Boolean);
        
        // Sort by distance to camera's position (ignoring Y to prevent top-down sorting bias)
        const sorted = lightsArray.map(l => {
            const dx = l.position.x - camera.position.x;
            const dz = l.position.z - camera.position.z;
            return { light: l, distSq: dx*dx + dz*dz };
        }).sort((a, b) => a.distSq - b.distSq);

        for (let i = 0; i < maxLights; i++) {
            const pl = poolRefs.current[i];
            if (!pl) continue;

            if (i < sorted.length) {
                const l = sorted[i].light;
                const radiusInMapUnits = (l.radius || 15) / 5 * gridSize;
                
                pl.position.set(l.position.x, l.position.y || 1, l.position.z);
                pl.color.set(l.color || "#fef08a");
                pl.distance = radiusInMapUnits * 1.5;
                
                let flicker = Math.sin(t * 10) * 0.05 + Math.sin(t * 23) * 0.05;
                const isFlame = l.color === '#fb923c' || l.color === '#fef08a' || l.color === '#fde047';
                if (isFlame) {
                    flicker += Math.sin(t * 45) * 0.05 + Math.random() * 0.1;
                }
                pl.intensity = (l.intensity || 2.5) + flicker;
                pl.visible = true;
            } else {
                pl.visible = false;
                pl.intensity = 0;
            }
        }
    });

    return (
        <group>
            {Array.from({ length: maxLights }).map((_, i) => (
                <pointLight 
                    key={`pool-light-${i}`} 
                    ref={el => poolRefs.current[i] = el} 
                    decay={2} 
                    castShadow={false}
                />
            ))}
        </group>
    );
};

const LightNodeComponent = ({ light, onContextMenu, role, gridSize, showLightRadius, onDelete, hovered, setHover }) => {
    const touchStartPos = useRef({ x: 0, y: 0 });
    const longPressTimer = useRef(null);

    const handleTouchStart = (e) => {
        if (e.touches && e.touches.length > 0) {
            touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            longPressTimer.current = setTimeout(() => {
                longPressTimer.current = null;
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(50); // Haptic feedback on long-press
                }
                if (onDelete) return;
                if (onContextMenu) {
                    onContextMenu({ clientX: touchStartPos.current.x, clientY: touchStartPos.current.y, stopPropagation: () => e.stopPropagation(), preventDefault: () => {} }, light.id);
                }
            }, 500);
        }
    };

    const handleTouchMove = (e) => {
        if (longPressTimer.current && e.touches && e.touches.length > 0) {
            const dx = e.touches[0].clientX - touchStartPos.current.x;
            const dy = e.touches[0].clientY - touchStartPos.current.y;
            if (Math.sqrt(dx * dx + dy * dy) > 10) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const radiusInMapUnits = (light.radius || 15) / 5 * gridSize; 

    return (
        <group position={[light.position.x, light.position.y || 1, light.position.z]} userData={{ isLight: true, lightId: light.id }}>
            {role === 'dm' && showLightRadius && !light.isTokenLight && (
                <mesh 
                    renderOrder={200}
                    onClick={(e) => {
                        if (onDelete) {
                            e.stopPropagation();
                            onDelete(light.id);
                        }
                    }}
                    onContextMenu={(e) => {
                        if (onDelete) return;
                        e.stopPropagation();
                        if (onContextMenu) onContextMenu(e, light.id);
                    }}
                    onPointerOver={(e) => {
                        e.stopPropagation();
                        setHover(light.id);
                    }}
                    onPointerOut={(e) => {
                        e.stopPropagation();
                        setHover(null);
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                >
                    <sphereGeometry args={[0.4]} />
                    <meshBasicMaterial color={light.color || "#fef08a"} transparent opacity={hovered === light.id ? 1 : 0.8} depthTest={false} />
                </mesh>
            )}
            {role === 'dm' && showLightRadius && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} renderOrder={200}>
                    <ringGeometry args={[Math.max(0.1, radiusInMapUnits - 0.1), radiusInMapUnits, 32]} />
                    <meshBasicMaterial color={light.color || "#fef08a"} transparent opacity={light.isTokenLight ? 0.15 : 0.3} depthTest={false} />
                </mesh>
            )}
        </group>
    );
};

const areLightsEqual = (prev, next) => {
    if (prev.light === next.light && prev.showLightRadius === next.showLightRadius && prev.hovered === next.hovered) return true;
    
    const pl = prev.light;
    const nl = next.light;
    if (pl.id !== nl.id || pl.position.x !== nl.position.x || pl.position.y !== nl.position.y || pl.position.z !== nl.position.z || pl.color !== nl.color || pl.radius !== nl.radius || pl.intensity !== nl.intensity) return false;
    
    if (prev.showLightRadius !== next.showLightRadius || prev.hovered !== next.hovered || prev.role !== next.role || prev.gridSize !== next.gridSize) return false;
    
    return true;
};

const LightNode = React.memo(LightNodeComponent, areLightsEqual);

export const MapLights = ({ lights, onContextMenu, role, gridSize = 1, showLightRadius, onDelete }) => {
    const [hovered, setHover] = useState(null);
    useCursor(hovered, 'pointer', 'auto');

    if (!lights) return null;

    const isLowPerf = typeof window !== 'undefined' && localStorage.getItem('vtt_low_performance') === 'true';
    const maxLights = isLowPerf ? 4 : 8;

    return (
        <group>
            <LightPool lights={lights} gridSize={gridSize} maxLights={maxLights} />
            {Object.values(lights).filter(Boolean).map(light => (
                <LightNode
                    key={light.id}
                    light={light}
                    onContextMenu={onContextMenu}
                    role={role}
                    gridSize={gridSize}
                    showLightRadius={showLightRadius}
                    onDelete={onDelete}
                    hovered={hovered}
                    setHover={setHover}
                />
            ))}
        </group>
    );
};
