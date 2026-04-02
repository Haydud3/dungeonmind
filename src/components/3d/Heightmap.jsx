import React, { useState, useMemo } from 'react';
import * as THREE from 'three';
import { useResolvedUrl } from '../../utils/useResolvedUrl';

export const HeightmapContent = ({ resolvedHeightmapUrl, resolvedBackgroundUrl, heightScale, scale }) => {
    const [aspect, setAspect] = useState(1);
    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const backgroundTexture = useMemo(() => {
        if (!resolvedBackgroundUrl) return null;
        const tex = new THREE.TextureLoader().load(resolvedBackgroundUrl, (t) => {
             if (t.image) setAspect(t.image.width / t.image.height);
        });
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }, [resolvedBackgroundUrl]);

    const heightmapTexture = useMemo(() => {
        if (!resolvedHeightmapUrl) return null;
        return new THREE.TextureLoader().load(resolvedHeightmapUrl);
    }, [resolvedHeightmapUrl]);

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

export const Heightmap = ({ heightmapUrl, backgroundUrl, heightScale, scale = 20 }) => {
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
    />
};
