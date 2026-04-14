import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useResolvedUrl } from '../../utils/useResolvedUrl';

export const HeightmapContent = ({ resolvedHeightmapUrl, resolvedBackgroundUrl, resolvedNormalMapUrl, heightScale, scale, aspect = 1 }) => {
    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const backgroundTexture = useTexture(resolvedBackgroundUrl);
    useMemo(() => {
        if (backgroundTexture) {
            backgroundTexture.wrapS = backgroundTexture.wrapT = THREE.RepeatWrapping;
        }
    }, [backgroundTexture]);

    const heightmapTexture = useTexture(resolvedHeightmapUrl);

    // Load normal map conditionally. Since useTexture expects a valid URL or array, we pass a dummy if null, but we don't apply it.
    // However, Drei's useTexture will throw if passing null or an empty string.
    // A better approach is to conditionally load it if the URL exists.
    // Actually, useTexture supports passing an array or single URL, but it can't be conditionally called inside a component (React Hook rules).
    // So we use useLoader directly if we want conditional loading, OR we pass a transparent 1x1 base64 image if null.
    const safeNormalMapUrl = resolvedNormalMapUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; 
    const normalMapTexture = useTexture(safeNormalMapUrl);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[scale * aspect, scale, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={backgroundTexture}
                displacementMap={heightmapTexture}
                displacementScale={heightScale}
                normalMap={resolvedNormalMapUrl ? normalMapTexture : null}
                normalScale={new THREE.Vector2(1, 1)}
            />
        </mesh>
    );
};

export const Heightmap = ({ heightmapUrl, backgroundUrl, normalMapUrl, heightScale, scale = 20, aspect = 1 }) => {
    const resolvedHeightmapUrl = useResolvedUrl(heightmapUrl);
    const resolvedBackgroundUrl = useResolvedUrl(backgroundUrl);
    const resolvedNormalMapUrl = useResolvedUrl(normalMapUrl);

    if (!resolvedHeightmapUrl || !resolvedBackgroundUrl) {
        return null;
    }

    return <HeightmapContent 
        resolvedHeightmapUrl={resolvedHeightmapUrl}
        resolvedBackgroundUrl={resolvedBackgroundUrl}
        resolvedNormalMapUrl={resolvedNormalMapUrl}
        heightScale={heightScale}
        scale={scale}
        aspect={aspect}
    />
};
