import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { useVisionMaskMaterial } from './useVisionMaskMaterial';

const WebGLMap = ({ url, width, height, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
    const [texture, setTexture] = useState(null);
    const onBeforeCompile = useVisionMaskMaterial(wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM);

    useEffect(() => {
        if (!url) return;
        if (url.startsWith('chunked:')) return;

        let active = true;
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
            url, 
            (tex) => {
                if (active) {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.minFilter = THREE.LinearFilter;
                    tex.magFilter = THREE.LinearFilter;
                    setTexture(tex);
                }
            },
            undefined,
            (err) => console.error("[WebGLMap] Texture Load Failed:", err)
        );
        return () => {
            active = false;
            if (texture) texture.dispose();
        };
    }, [url]);

    if (!width || !height || !texture) return null;

    return (
        <mesh position={[width / 2, -height / 2, 0]}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial map={texture} transparent onBeforeCompile={onBeforeCompile} />
        </mesh>
    );
};

export default WebGLMap;