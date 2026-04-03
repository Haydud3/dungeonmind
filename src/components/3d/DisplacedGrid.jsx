import React, { useMemo } from 'react';
import * as THREE from 'three';

export const DisplacedGrid = ({ mapData, aspect, resolvedHeightmapUrl }) => {
    const { scale = 20, gridSize = 1, heightScale = 1 } = mapData;
    const width = scale * aspect;
    const height = scale;

    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const heightmapTexture = useMemo(() => {
        if (!resolvedHeightmapUrl) return null;
        return new THREE.TextureLoader().load(resolvedHeightmapUrl);
    }, [resolvedHeightmapUrl]);

    const gridTexture = useMemo(() => {
        if (!gridSize || gridSize <= 0) return null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 256; // Higher resolution for crispness
        canvas.width = size;
        canvas.height = size;
        
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // Slightly less transparent
        ctx.lineWidth = 1; // Use 1 pixel line for crisp grid
        
        // Draw lines at the edge to form a grid when tiled
        ctx.beginPath();
        ctx.moveTo(0, size - 0.5); // Draw a line at the bottom edge
        ctx.lineTo(size, size - 0.5);
        ctx.moveTo(size - 0.5, 0); // Draw a line at the right edge
        ctx.lineTo(size - 0.5, size);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        const repeatX = width / gridSize;
        const repeatY = height / gridSize;
        texture.repeat.set(repeatX, repeatY);
        
        // Ensure that world origin (0,0) is always exactly on a grid intersection
        texture.offset.set(-(width / 2) / gridSize, -(height / 2) / gridSize);

        return texture;
    }, [width, height, gridSize]);

    return (
        // Placed at y=0.02 to ensure it renders clearly above the Fog of War (y=0.015)
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={101}>
            <planeGeometry args={[width, height, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={gridTexture}
                displacementMap={heightmapTexture}
                displacementScale={heightScale}
                transparent={true}
                roughness={1}
                metalness={0}
                depthWrite={false}
            />
        </mesh>
    );
};