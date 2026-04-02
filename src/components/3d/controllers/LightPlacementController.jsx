import React, { useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';

export const LightPlacementController = ({ isEnabled, onPlaceLight, getTerrainHeight }) => {
    const { controls } = useThree();
    const [cursorPos, setCursorPos] = useState(null);

    useEffect(() => {
        if (controls) controls.enabled = !isEnabled;
        if (!isEnabled) setCursorPos(null);
    }, [isEnabled, controls]);

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        onPlaceLight(pt);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setCursorPos(pt);
    };

    if (!isEnabled) return null;

    return (
        <group>
            {cursorPos && (
                <mesh position={cursorPos} raycast={() => null} renderOrder={200}>
                    <sphereGeometry args={[0.5]} />
                    <meshBasicMaterial color="#fef08a" transparent opacity={0.5} depthTest={false} />
                </mesh>
            )}
            <mesh onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </group>
    );
};