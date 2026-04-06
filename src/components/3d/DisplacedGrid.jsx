import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

const DisplacedGridContent = ({ mapData, aspect, resolvedHeightmapUrl }) => {
    const { scale = 20, gridSize = 1, heightScale = 1, gridOffsetX = 0, gridOffsetY = 0, gridColor = '#ffffff', gridThickness = 1 } = mapData;
    const width = scale * aspect;
    const height = scale;

    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const heightmapTexture = useTexture(resolvedHeightmapUrl);

    const gridTexture = useMemo(() => {
        if (!gridSize || gridSize <= 0) return null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 256; // Higher resolution for crispness
        canvas.width = size;
        canvas.height = size;
        
        ctx.clearRect(0, 0, size, size);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = gridThickness;
        
        // Draw lines at the edge to form a grid when tiled
        ctx.beginPath();
        ctx.moveTo(0, size - (gridThickness / 2)); // Draw a line at the bottom edge
        ctx.lineTo(size, size - (gridThickness / 2));
        ctx.moveTo(size - (gridThickness / 2), 0); // Draw a line at the right edge
        ctx.lineTo(size - (gridThickness / 2), size);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        const repeatX = width / gridSize;
        const repeatY = height / gridSize;
        texture.repeat.set(repeatX, repeatY);
        
        // Ensure that world origin (0,0) is always exactly on a grid intersection, and apply user offsets
        texture.offset.set(-(width / 2) / gridSize - gridOffsetX / gridSize, -(height / 2) / gridSize + gridOffsetY / gridSize);

        return texture;
    }, [width, height, gridSize, gridOffsetX, gridOffsetY, gridColor, gridThickness]);

    return (
        // Placed at y=0.02 to ensure it renders clearly above the Fog of War (y=0.015)
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={101}>
            <planeGeometry args={[width, height, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={gridTexture}
                displacementMap={heightmapTexture}
                displacementScale={heightScale}
                displacementBias={0.01}
                transparent={true}
                roughness={1}
                metalness={0}
                depthWrite={false}
                polygonOffset={true}
                polygonOffsetFactor={-4}
            />
        </mesh>
    );
};

export const DisplacedGrid = ({ mapData, aspect, resolvedHeightmapUrl }) => {
    if (!resolvedHeightmapUrl) return null;
    return <DisplacedGridContent mapData={mapData} aspect={aspect} resolvedHeightmapUrl={resolvedHeightmapUrl} />;
};