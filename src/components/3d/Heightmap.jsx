import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useResolvedUrl } from '../../utils/useResolvedUrl';

export const HeightmapContent = ({ resolvedHeightmapUrl, resolvedBackgroundUrl, heightScale, scale, aspect = 1 }) => {
    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const backgroundTexture = useTexture(resolvedBackgroundUrl);
    useMemo(() => {
        if (backgroundTexture) {
            backgroundTexture.wrapS = backgroundTexture.wrapT = THREE.RepeatWrapping;
        }
    }, [backgroundTexture]);

    const heightmapTexture = useTexture(resolvedHeightmapUrl);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[scale * aspect, scale, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={backgroundTexture}
                displacementMap={heightmapTexture}
                displacementScale={heightScale}
            />
        </mesh>
    );
};

export const Heightmap = ({ heightmapUrl, backgroundUrl, heightScale, scale = 20, aspect = 1 }) => {
    const resolvedHeightmapUrl = useResolvedUrl(heightmapUrl);
    const resolvedBackgroundUrl = useResolvedUrl(backgroundUrl);

    if (!resolvedHeightmapUrl || !resolvedBackgroundUrl) {
        return null;
    }

    return <HeightmapContent 
        resolvedHeightmapUrl={resolvedHeightmapUrl}
        resolvedBackgroundUrl={resolvedBackgroundUrl}
        heightScale={heightScale}
        scale={scale}
        aspect={aspect}
    />
};
