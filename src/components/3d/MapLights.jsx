import React, { useState, useRef } from 'react';
import { useCursor } from '@react-three/drei';

const LightNode = ({ light, onContextMenu, role, gridSize, showLightRadius, onDelete, hovered, setHover }) => {
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
            <pointLight color={light.color || "#fef08a"} intensity={2.5} distance={radiusInMapUnits * 1.5} decay={2} />
            {role === 'dm' && (
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
                        if (onDelete || showLightRadius) {
                            e.stopPropagation();
                            setHover(light.id);
                        }
                    }}
                    onPointerOut={(e) => {
                        if (onDelete || showLightRadius) {
                            e.stopPropagation();
                            setHover(null);
                        }
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
                    <meshBasicMaterial color={light.color || "#fef08a"} transparent opacity={0.3} depthTest={false} />
                </mesh>
            )}
        </group>
    );
};

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