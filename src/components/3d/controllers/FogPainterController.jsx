import React, { useState, useRef } from 'react';
import { useCursor } from '@react-three/drei';
import * as THREE from 'three';

export const FogPainterController = ({
    isEnabled,
    mode = 'paint',
    fogData,
    mapData,
    aspect = 1,
    brushSize = 40,
    brushShape = 'circle',
    brushSoftness = 0.2,
    getTerrainHeight,
    onPaintEnd,
}) => {
    const [isDrawing, setIsDrawing] = useState(false);
    const [cursorPos, setCursorPos] = useState(null);
    const lastPos = useRef(null);

    useCursor(isEnabled, 'crosshair', 'auto');

    if (!isEnabled || !fogData || !fogData.ctx || !fogData.canvas) return null;

    const scale = mapData?.scale || 20;
    const canvasWidth = fogData?.width || 1024;
    const canvasHeight = fogData?.height || 1024;
    const brushWorldSize = Math.max(0.05, (scale / canvasWidth) * brushSize);

    const paintAt = (point) => {
        const u = (point.x / (scale * aspect)) + 0.5;
        const v = (point.z / scale) + 0.5;
        const px = Math.floor(u * canvasWidth);
        const py = Math.floor(v * canvasHeight);
        const ctx = fogData.ctx;
        const prevOp = ctx.globalCompositeOperation;

        if (mode === 'erase') {
            ctx.globalCompositeOperation = 'destination-out';
            if (brushSoftness > 0 && brushShape === 'circle') {
                const grad = ctx.createRadialGradient(
                    px, py, Math.max(0, brushSize * (1 - brushSoftness)),
                    px, py, brushSize
                );
                grad.addColorStop(0, 'rgba(0,0,0,1)');
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = 'rgba(0,0,0,1)';
            }
        } else {
            ctx.globalCompositeOperation = 'source-over';
            if (brushSoftness > 0 && brushShape === 'circle') {
                const grad = ctx.createRadialGradient(
                    px, py, Math.max(0, brushSize * (1 - brushSoftness)),
                    px, py, brushSize
                );
                grad.addColorStop(0, 'rgba(0,0,0,1)');
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = 'rgba(0,0,0,1)';
            }
        }

        ctx.beginPath();
        if (brushShape === 'square') {
            ctx.fillRect(px - brushSize, py - brushSize, brushSize * 2, brushSize * 2);
        } else {
            ctx.arc(px, py, brushSize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = prevOp;
        if (fogData.texture) {
            fogData.texture.needsUpdate = true;
        }
    };

    const handlePointerDown = (e) => {
        if (e.button !== 0 || !isEnabled) return;
        e.stopPropagation();
        setIsDrawing(true);
        paintAt(e.point);
        lastPos.current = e.point.clone();
    };

    const handlePointerMove = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        const pt = e.point.clone();
        if (getTerrainHeight) {
            pt.y = getTerrainHeight(pt.x, pt.z) + 0.05;
        }
        setCursorPos(pt);

        if (!isDrawing) return;
        if (lastPos.current) {
            const dist = lastPos.current.distanceTo(e.point);
            const steps = Math.max(1, Math.floor(dist / (brushWorldSize * 0.3)));
            for (let i = 1; i <= steps; i++) {
                const p = new THREE.Vector3().lerpVectors(lastPos.current, e.point, i / steps);
                paintAt(p);
            }
        } else {
            paintAt(e.point);
        }
        lastPos.current = e.point.clone();
    };

    const handlePointerUp = (e) => {
        if (e.button !== 0 || !isEnabled) return;
        e.stopPropagation();
        if (isDrawing) {
            setIsDrawing(false);
            lastPos.current = null;
            if (onPaintEnd) onPaintEnd();
        }
    };

    const cursorColor = mode === 'erase' ? '#ef4444' : '#000000';
    const cursorBorderColor = mode === 'erase' ? '#f87171' : '#94a3b8';

    return (
        <group>
            {/* Invisible raycast hit plane */}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerOut={handlePointerUp}
                position={[0, 0.06, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
            </mesh>

            {/* 3D Brush Cursor */}
            {cursorPos && (
                <group position={[cursorPos.x, cursorPos.y || 0.07, cursorPos.z]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                        {brushShape === 'square'
                            ? <planeGeometry args={[brushWorldSize * 2, brushWorldSize * 2]} />
                            : <circleGeometry args={[brushWorldSize, 48]} />
                        }
                        <meshBasicMaterial color={cursorColor} transparent opacity={mode === 'erase' ? 0.25 : 0.45} depthTest={false} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                        {brushShape === 'square'
                            ? <planeGeometry args={[brushWorldSize * 2.05, brushWorldSize * 2.05]} />
                            : <ringGeometry args={[brushWorldSize * 0.9, brushWorldSize, 48]} />
                        }
                        <meshBasicMaterial color={cursorBorderColor} transparent opacity={0.9} depthTest={false} side={THREE.DoubleSide} />
                    </mesh>
                </group>
            )}
        </group>
    );
};
