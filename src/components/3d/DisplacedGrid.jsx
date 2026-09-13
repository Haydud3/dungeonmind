import React, { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { safeDisposeTexture } from '../../utils/threeDisposalUtils';

const DisplacedGridContent = ({ mapData, aspect, resolvedHeightmapUrl, resolvedNormalMapUrl, dynamicDisplacementMap }) => {
    const { scale = 20, gridSize = 1, heightScale = 1, gridOffsetX = 0, gridOffsetY = 0, gridColor = '#ffffff', gridThickness = 0.5 } = mapData;
    const width = scale * aspect;
    const height = scale;

    const isLowPerf = typeof window !== 'undefined' && localStorage.getItem('vtt_low_performance') === 'true';
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const subdivisions = isLowPerf ? 64 : (isTouchDevice ? 100 : 192);

    const [heightmapTexture, setHeightmapTexture] = useState(null);
    useEffect(() => {
        const url = resolvedHeightmapUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        const loader = new THREE.TextureLoader();
        let active = true;
        const tex = loader.load(url, (loaded) => {
            loaded.colorSpace = THREE.NoColorSpace;
            if (active) setHeightmapTexture(loaded);
            else loaded.dispose();
        });
        return () => {
            active = false;
            safeDisposeTexture(tex);
        };
    }, [resolvedHeightmapUrl]);

    const [normalMapTexture, setNormalMapTexture] = useState(null);
    useEffect(() => {
        if (!resolvedNormalMapUrl) {
            setNormalMapTexture(null);
            return;
        }
        const loader = new THREE.TextureLoader();
        let active = true;
        const tex = loader.load(resolvedNormalMapUrl, (loaded) => {
            loaded.colorSpace = THREE.NoColorSpace;
            if (active) setNormalMapTexture(loaded);
            else loaded.dispose();
        });
        return () => {
            active = false;
            safeDisposeTexture(tex);
        };
    }, [resolvedNormalMapUrl]);

    const gridTexture = useMemo(() => {
        if (!gridSize || gridSize <= 0) return null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        
        ctx.clearRect(0, 0, size, size);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = gridThickness;
        
        ctx.beginPath();
        ctx.moveTo(0, size - (gridThickness / 2));
        ctx.lineTo(size, size - (gridThickness / 2));
        ctx.moveTo(size - (gridThickness / 2), 0);
        ctx.lineTo(size - (gridThickness / 2), size);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        const repeatX = width / gridSize;
        const repeatY = height / gridSize;
        texture.repeat.set(repeatX, repeatY);
        
        texture.offset.set(-(width / 2) / gridSize - gridOffsetX / gridSize, -(height / 2) / gridSize + gridOffsetY / gridSize);

        return texture;
    }, [width, height, gridSize, gridOffsetX, gridOffsetY, gridColor, gridThickness]);

    useEffect(() => {
        return () => {
            safeDisposeTexture(gridTexture);
        };
    }, [gridTexture]);

    return (
        // Placed at y=0.02 to ensure it renders clearly above the Fog of War (y=0.015)
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={101}>
            <planeGeometry args={[width, height, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={gridTexture}
                displacementMap={dynamicDisplacementMap || heightmapTexture}
                displacementScale={heightScale}
                displacementBias={0.01}
                normalMap={resolvedNormalMapUrl ? normalMapTexture : null}
                normalScale={new THREE.Vector2(1, 1)}
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

export const DisplacedGrid = ({ mapData, aspect, resolvedHeightmapUrl, resolvedNormalMapUrl, dynamicDisplacementMap }) => {
    if (!resolvedHeightmapUrl && !dynamicDisplacementMap) return null;
    return <DisplacedGridContent mapData={mapData} aspect={aspect} resolvedHeightmapUrl={resolvedHeightmapUrl} resolvedNormalMapUrl={resolvedNormalMapUrl} dynamicDisplacementMap={dynamicDisplacementMap} />;
};