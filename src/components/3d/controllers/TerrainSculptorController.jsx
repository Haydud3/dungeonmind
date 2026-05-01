import React, { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import * as THREE from 'three';

export const TerrainSculptorController = ({
    isEnabled,
    terrainData,
    mapData,
    aspect,
    getTerrainHeight,
    brushSize = 2, 
    brushType = 'raise',
    brushStrength = 0.05,
    onSculptEnd
}) => {
    const { controls } = useThree();
    const [cursorPos, setCursorPos] = useState(null);
    const isDragging = useRef(false);
    const lastSyncTime = useRef(0);
    const flattenTargetHeight = useRef(0);
    const tempCanvasRef = useRef(null);

    useCursor(isEnabled, 'crosshair', 'auto');

    useEffect(() => {
        if (controls) controls.enabled = !isEnabled;
        return () => { if (controls) controls.enabled = true; };
    }, [isEnabled, controls]);

    // Sync the GPU canvas back to the CPU physics engine (getTerrainHeight) in real-time
    const syncCPUData = (force = false) => {
        const now = performance.now();
        if (force || now - lastSyncTime.current > 50) { // Throttle to ~20fps to save CPU
            if (terrainData && terrainData.ctx && terrainData.canvas) {
                try {
                    const imgData = terrainData.ctx.getImageData(0, 0, terrainData.width, terrainData.height);
                    // Overwrite the original array reference directly so React doesn't rerender, 
                    // but getTerrainHeight instantly uses the new data!
                    terrainData.data.set(imgData.data);
                    lastSyncTime.current = now;
                } catch(err) { console.error("Failed to sync terrain CPU data", err); }
            }
        }
    };

    const applyBrush = (point) => {
        if (!terrainData || !terrainData.ctx || !terrainData.texture) return;

        const mapScale = mapData?.scale || 20;
        const heightScale = mapData?.heightScale || 1;
        
        // UV Mapping: 3D World (x, z) -> 2D Canvas (u, v)
        const u = (point.x / (mapScale * aspect)) + 0.5;
        const v = (point.z / mapScale) + 0.5;

        if (u < 0 || u > 1 || v < 0 || v > 1) return; // Out of bounds

        const { ctx, canvas, texture } = terrainData;

        const pixelX = Math.floor(u * canvas.width);
        const pixelY = Math.floor(v * canvas.height);
        const brushPixelRadius = brushSize * (canvas.height / mapScale);

        if (brushType === 'smooth') {
            ctx.save();
            ctx.beginPath();
            ctx.arc(pixelX, pixelY, brushPixelRadius, 0, Math.PI * 2);
            ctx.clip();
            
            ctx.globalAlpha = Math.min(1, brushStrength * 2);
            
            if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas');
            const tempCanvas = tempCanvasRef.current;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            
            const boxSize = Math.ceil(brushPixelRadius * 2);
            const srcX = Math.max(0, pixelX - brushPixelRadius);
            const srcY = Math.max(0, pixelY - brushPixelRadius);
            
            tempCanvas.width = boxSize;
            tempCanvas.height = boxSize;
            tempCtx.clearRect(0, 0, boxSize, boxSize);
            tempCtx.drawImage(canvas, srcX, srcY, boxSize, boxSize, 0, 0, boxSize, boxSize);
            
            ctx.filter = `blur(${Math.max(1, Math.floor(brushPixelRadius / 4))}px)`;
            ctx.drawImage(tempCanvas, 0, 0, boxSize, boxSize, srcX, srcY, boxSize, boxSize);
            ctx.filter = 'none';
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(pixelX, pixelY, brushPixelRadius, 0, Math.PI * 2);
            const gradient = ctx.createRadialGradient(pixelX, pixelY, 0, pixelX, pixelY, brushPixelRadius);
            if (brushType === 'raise') {
                gradient.addColorStop(0, `rgba(255, 255, 255, ${brushStrength})`);
                gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
                ctx.globalCompositeOperation = 'lighter';
            } else if (brushType === 'lower') {
                const strengthInt = Math.max(0, 255 - Math.floor(brushStrength * 255 * 2));
                gradient.addColorStop(0, `rgb(${strengthInt}, ${strengthInt}, ${strengthInt})`);
                gradient.addColorStop(1, `rgb(255, 255, 255)`);
                ctx.globalCompositeOperation = 'multiply';
            } else if (brushType === 'flatten') {
                const targetR = Math.min(255, Math.max(0, Math.floor((flattenTargetHeight.current / heightScale) * 255)));
                gradient.addColorStop(0, `rgba(${targetR}, ${targetR}, ${targetR}, ${Math.min(1, brushStrength * 4)})`);
                gradient.addColorStop(1, `rgba(${targetR}, ${targetR}, ${targetR}, 0)`);
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over'; // Reset
        }
        
        // Tell the Three.js material to update its displacement map!
        texture.needsUpdate = true;

        syncCPUData();
    };

    const handlePointerDown = (e) => {
        if (e.button !== 0 || !isEnabled) return;
        e.stopPropagation();
        isDragging.current = true;
        
        if (brushType === 'flatten' && getTerrainHeight) {
            flattenTargetHeight.current = getTerrainHeight(e.point.x, e.point.z);
        }
        
        applyBrush(e.point);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        const pt = e.point.clone();
        // Snap the visual cursor to the exact current terrain height
        if (getTerrainHeight) pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setCursorPos(pt);

        if (isDragging.current) applyBrush(e.point);
    };

    const handlePointerUp = (e) => {
        if (e.button !== 0 || !isEnabled) return;
        e.stopPropagation();
        if (isDragging.current) {
            isDragging.current = false;
            syncCPUData(true); // Force a final physics sync
            if (onSculptEnd) onSculptEnd();
        }
    };

    if (!isEnabled) return null;

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
                    <ringGeometry args={[Math.max(0.1, brushSize - 0.2), brushSize, 64]} />
                    <meshBasicMaterial color={brushType === 'raise' ? '#3b82f6' : brushType === 'lower' ? '#ef4444' : brushType === 'flatten' ? '#eab308' : '#10b981'} transparent opacity={0.8} depthTest={false} />
                </mesh>
            )}
        </group>
    );
};