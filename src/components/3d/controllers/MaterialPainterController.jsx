import React, { useState, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import * as THREE from 'three';

export const MaterialPainterController = ({ isEnabled, materialData, mapData, aspect, brushSize = 20, brushColor = '#00FF00', brushShape = 'circle', brushSoftness = 0, limitToGround = false, getTerrainHeight, onPaintEnd }) => {
    const { controls } = useThree();
    const [isDrawing, setIsDrawing] = useState(false);
    const [cursorPos, setCursorPos] = useState(null);
    const lastPos = useRef(null);

    useCursor(isEnabled, 'crosshair', 'auto');

    useEffect(() => {
        if (controls) {
            if (isEnabled) {
                controls.mouseButtons.LEFT = 0;
                controls.mouseButtons.RIGHT = 2; // THREE.MOUSE.PAN
            } else {
                controls.mouseButtons.LEFT = 2; // THREE.MOUSE.PAN
                controls.mouseButtons.RIGHT = 0; // THREE.MOUSE.ROTATE
            }
        }
        return () => {
            if (controls) {
                controls.mouseButtons.LEFT = 2;
                controls.mouseButtons.RIGHT = 0;
            }
        };
    }, [isEnabled, isDrawing, controls]);

    if (!isEnabled || !materialData) return null;

    const scale = mapData?.scale || 20;
    const canvasWidth = materialData?.width || 1024;
    const brushWorldSize = Math.max(0.02, (scale / canvasWidth) * brushSize);

    const paintAt = (point) => {
        if (limitToGround && getTerrainHeight) {
            const h = getTerrainHeight(point.x, point.z);
            const hx = getTerrainHeight(point.x + 0.2, point.z);
            const hz = getTerrainHeight(point.x, point.z + 0.2);
            if (Math.abs(hx - h) > 0.2 || Math.abs(hz - h) > 0.2) return; // Ignores slopes steeper than 45 degrees
        }

        const u = (point.x / (scale * aspect)) + 0.5;
        const v = (point.z / scale) + 0.5;

        const px = Math.floor(u * materialData.width);
        const py = Math.floor(v * materialData.height);

        const ctx = materialData.ctx;
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        const colorWithAlpha = (alpha) => {
            if (brushColor === '#000000') return `rgba(0,0,0,${alpha})`;
            const r = parseInt(brushColor.slice(1, 3), 16);
            const g = parseInt(brushColor.slice(3, 5), 16);
            const b = parseInt(brushColor.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        };

        ctx.beginPath();

        if (brushSoftness > 0 && brushShape === 'circle') {
            const gradient = ctx.createRadialGradient(px, py, Math.max(0, brushSize * (1 - brushSoftness)), px, py, brushSize);
            gradient.addColorStop(0, colorWithAlpha(1));
            gradient.addColorStop(1, colorWithAlpha(0));
            ctx.fillStyle = gradient;
        } else if (brushSoftness > 0 && brushShape === 'square') {
            ctx.shadowBlur = brushSize * brushSoftness;
            ctx.shadowColor = brushColor;
            ctx.fillStyle = colorWithAlpha(1);
        } else {
            ctx.fillStyle = colorWithAlpha(1);
        }

        if (brushShape === 'square') {
            ctx.fillRect(px - brushSize, py - brushSize, brushSize * 2, brushSize * 2);
        } else {
            ctx.arc(px, py, brushSize, 0, Math.PI * 2);
            ctx.fill();
        }

        materialData.texture.needsUpdate = true;
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
        if (getTerrainHeight) pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setCursorPos(pt);

        if (!isDrawing) return;

        // Simple interpolation for smooth lines if the mouse moves fast
        if (lastPos.current) {
            const dist = lastPos.current.distanceTo(e.point);
            const steps = Math.max(1, Math.floor(dist / (brushWorldSize * 0.5))); 
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

    return (
        <group>
            {/* Invisible plane that catches the mouse raycast */}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerOut={handlePointerUp}
                position={[0, 0.05, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
            </mesh>

            {/* The 3D Brush Cursor */}
            {cursorPos && (
                <mesh position={[cursorPos.x, cursorPos.y, cursorPos.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                    {brushShape === 'square' ? (
                        <planeGeometry args={[brushWorldSize * 2, brushWorldSize * 2]} />
                    ) : (
                        <ringGeometry args={[Math.max(0.01, brushWorldSize * 0.85), brushWorldSize, 64]} />
                    )}
                    <meshBasicMaterial color={brushColor === '#000000' ? '#ffffff' : brushColor} transparent opacity={brushShape === 'square' ? 0.3 : 0.8} depthTest={false} side={THREE.DoubleSide} />
                </mesh>
            )}
        </group>
    );
};