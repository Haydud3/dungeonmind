import React, { useMemo } from 'react';
import { useVisionMaskMaterial } from './useVisionMaskMaterial';

const WebGLLine = ({ p1, p2, color, width = 4, opacity = 0.8, z = 0.2, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
    const onBeforeCompile = useVisionMaskMaterial(wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM);
    const { center, length, angle } = useMemo(() => {
        const dx = p2.x - p1.x;
        const dy = -(p2.y - p1.y);
        return {
            center: [(p1.x + p2.x) / 2, -(p1.y + p2.y) / 2, z],
            length: Math.hypot(dx, dy),
            angle: Math.atan2(dy, dx)
        };
    }, [p1, p2, z]);

    if (length < 0.1) return null;

    return (
        <mesh position={center} rotation={[0, 0, angle]}>
            <planeGeometry args={[length, width]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} onBeforeCompile={onBeforeCompile} />
        </mesh>
    );
};

export default WebGLLine;