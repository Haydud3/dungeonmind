import React from 'react';
import WebGLLine from './WebGLLine';
import { useVisionMaskMaterial } from './useVisionMaskMaterial';

const WebGLInteractionLayer = ({ walls, activeMeasurement, templates, activeTool, cursorPos, wallStart, mapDimensions, grid, selectionStart, multiSelectStart, wallUniforms, viewerUniforms, visionActive, discoveryTexture, isDM }) => {
    const showWalls = isDM && (activeTool === 'objects' || activeTool === 'delete');
    const onBeforeCompile = useVisionMaskMaterial(wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM);

    return (
        <group>
            {/* Walls & Doors */}
            {showWalls && walls.map(w => (
                <WebGLLine 
                    key={w.id} 
                    p1={w.p1} p2={w.p2} 
                    color={w.type === 'door' ? (w.isOpen ? '#22c55e' : '#f59e0b') : '#3b82f6'} 
                    wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM}
                />
            ))}
            {/* Wall/Door Drawing Preview */}
            {wallStart && (activeTool === 'objects') && (
                <WebGLLine p1={wallStart} p2={cursorPos} color="#3b82f6" opacity={0.5} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />
            )}
            {/* Ruler Preview */}
            {activeMeasurement && activeMeasurement.type === 'ruler' && (
                <WebGLLine p1={activeMeasurement.start} p2={activeMeasurement.end} color="#fbbf24" width={2} opacity={0.6} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />
            )}
            {/* Static Templates */}
            {(templates || []).map(tpl => (
                <mesh key={tpl.id} position={[tpl.x, -tpl.y, 0.15]}>
                    <ringGeometry args={[tpl.radius - 1, tpl.radius + 1, 64]} />
                    <meshBasicMaterial color={tpl.borderColor || "#f59e0b"} transparent opacity={0.8} onBeforeCompile={onBeforeCompile} />
                </mesh>
            ))}
            {/* Selection Box (Initiative) */}
            {selectionStart && activeTool === 'init_select' && (
                <mesh position={[(selectionStart.x + cursorPos.x) / 2, -(selectionStart.y + cursorPos.y) / 2, 0.25]}>
                    <planeGeometry args={[Math.abs(cursorPos.x - selectionStart.x), Math.abs(cursorPos.y - selectionStart.y)]} />
                    <meshBasicMaterial color="#f59e0b" transparent opacity={0.15} onBeforeCompile={onBeforeCompile} />
                </mesh>
            )}
            {/* Multi-Select Box */}
            {multiSelectStart && activeTool === 'move' && (
                <mesh position={[(multiSelectStart.x + cursorPos.x) / 2, -(multiSelectStart.y + cursorPos.y) / 2, 0.25]}>
                    <planeGeometry args={[Math.abs(cursorPos.x - multiSelectStart.x), Math.abs(cursorPos.y - multiSelectStart.y)]} />
                    <meshBasicMaterial color="#6366f1" transparent opacity={0.15} onBeforeCompile={onBeforeCompile} />
                </mesh>
            )}
        </group>
    );
};

export default WebGLInteractionLayer;