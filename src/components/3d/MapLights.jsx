import React, { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';

const LightNodeComponent = ({ light, onContextMenu, role, gridSize, showLightRadius, onDelete, hovered, setHover }) => {
    const touchStartPos = useRef({ x: 0, y: 0 });
    const pointLightRef = useRef();
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

    // Add a dynamic flicker effect to lights (more intense for orange/yellow flame colors)
    useFrame((state) => {
        if (pointLightRef.current) {
            const t = state.clock.elapsedTime;
            // Base subtle pulse for all lights
            let flicker = Math.sin(t * 10) * 0.05 + Math.sin(t * 23) * 0.05;
            
            // If the light is orange or yellow (like a torch/candle), make it flicker more erratically
            const isFlame = light.color === '#fb923c' || light.color === '#fef08a' || light.color === '#fde047';
            if (isFlame) {
                flicker += Math.sin(t * 45) * 0.05 + Math.random() * 0.1;
            }
            
            // Prevent intensity from dropping too low or spiking too high
            const baseIntensity = light.intensity || 2.5;
            pointLightRef.current.intensity = baseIntensity + flicker;
        }
    });

    return (
        <group position={[light.position.x, light.position.y || 1, light.position.z]} userData={{ isLight: true, lightId: light.id }}>
            <pointLight ref={pointLightRef} color={light.color || "#fef08a"} intensity={2.5} distance={radiusInMapUnits * 1.5} decay={2} />
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

    return (
        <group>
            {Object.values(lights).map(light => (
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