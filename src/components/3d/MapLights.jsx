import React, { useState } from 'react';
import { useCursor } from '@react-three/drei';

export const MapLights = ({ lights, onContextMenu, role, gridSize = 1, showLightRadius, onDelete }) => {
    if (!lights || role !== 'dm') return null;
    const [hovered, setHover] = useState(null);
    useCursor(hovered, 'pointer', 'auto');
    return (
        <group>
            {Object.values(lights).map(light => {
                const radiusInMapUnits = (light.radius || 15) / 5 * gridSize; 
                return (
                    <group key={light.id} position={[light.position.x, light.position.y || 1, light.position.z]}>
                        <mesh 
                            renderOrder={200}
                            visible={showLightRadius || !!onDelete}
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
                        >
                            <sphereGeometry args={[0.4]} />
                            <meshBasicMaterial color={light.color || "#fef08a"} transparent opacity={hovered === light.id ? 1 : 0.8} depthTest={false} />
                        </mesh>
                        {showLightRadius && (
                            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} renderOrder={200}>
                                <ringGeometry args={[Math.max(0.1, radiusInMapUnits - 0.1), radiusInMapUnits, 32]} />
                                <meshBasicMaterial color={light.color || "#fef08a"} transparent opacity={0.3} depthTest={false} />
                            </mesh>
                        )}
                    </group>
                );
            })}
        </group>
    );
};