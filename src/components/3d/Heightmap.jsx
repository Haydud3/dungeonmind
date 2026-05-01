import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useResolvedUrl } from '../../utils/useResolvedUrl';

export const HeightmapContent = ({ resolvedHeightmapUrl, resolvedBackgroundUrl, resolvedNormalMapUrl, heightScale, scale, aspect = 1, dynamicDisplacementMap }) => {
    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const backgroundTexture = useTexture(resolvedBackgroundUrl);

    const safeHeightmapUrl = resolvedHeightmapUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const heightmapTexture = useTexture(safeHeightmapUrl);

    // Provide a safe default for the normal map to prevent Drei's useTexture from crashing if null
    const safeNormalMapUrl = resolvedNormalMapUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; 
    const normalMapTexture = useTexture(safeNormalMapUrl);

    useMemo(() => {
        // FIX: Texture properties must be explicitly flagged for update in Three.js
        if (backgroundTexture) {
            backgroundTexture.colorSpace = THREE.SRGBColorSpace;
            backgroundTexture.wrapS = backgroundTexture.wrapT = THREE.RepeatWrapping;
            backgroundTexture.needsUpdate = true;
        }
        if (dynamicDisplacementMap) {
            dynamicDisplacementMap.colorSpace = THREE.NoColorSpace;
            dynamicDisplacementMap.wrapS = dynamicDisplacementMap.wrapT = THREE.RepeatWrapping;
            dynamicDisplacementMap.needsUpdate = true;
        }
        if (heightmapTexture) {
            heightmapTexture.colorSpace = THREE.NoColorSpace;
            heightmapTexture.wrapS = heightmapTexture.wrapT = THREE.RepeatWrapping;
            heightmapTexture.needsUpdate = true;
        }
        if (normalMapTexture) {
            normalMapTexture.colorSpace = THREE.NoColorSpace;
            normalMapTexture.needsUpdate = true;
        }
    }, [backgroundTexture, heightmapTexture, normalMapTexture, dynamicDisplacementMap]);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[scale * aspect, scale, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={backgroundTexture}
                displacementMap={dynamicDisplacementMap || heightmapTexture}
                displacementScale={heightScale}
                normalMap={resolvedNormalMapUrl ? normalMapTexture : null}
                normalScale={new THREE.Vector2(1, 1)}
            />
        </mesh>
    );
};

export const Heightmap = ({ heightmapUrl, backgroundUrl, normalMapUrl, heightScale, scale = 20, aspect = 1, dynamicDisplacementMap }) => {
    const resolvedHeightmapUrl = useResolvedUrl(heightmapUrl);
    const resolvedBackgroundUrl = useResolvedUrl(backgroundUrl);
    const resolvedNormalMapUrl = useResolvedUrl(normalMapUrl);

    if (!resolvedBackgroundUrl) {
        return null;
    }

    return <HeightmapContent 
        resolvedHeightmapUrl={resolvedHeightmapUrl}
        resolvedBackgroundUrl={resolvedBackgroundUrl}
        resolvedNormalMapUrl={resolvedNormalMapUrl}
        heightScale={heightScale}
        scale={scale}
        aspect={aspect}
        dynamicDisplacementMap={dynamicDisplacementMap}
    />
};
