import React, { useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import * as THREE from 'three';

export const StampingController = ({ asset, isEnabled, onStamp, getTerrainHeight, gridSize = 1, isSnapToGrid = true }) => {
    const { controls } = useThree();
    const [cursorPos, setCursorPos] = useState(null);

    useCursor(isEnabled, 'crosshair', 'auto');

    useEffect(() => {
        if (controls) controls.enabled = !isEnabled;
        if (!isEnabled) setCursorPos(null);
    }, [isEnabled, controls]);

    const calculateDropPosition = (point) => {
        const dropX = isSnapToGrid ? Math.round(point.x / gridSize) * gridSize : point.x;
        const dropZ = isSnapToGrid ? Math.round(point.z / gridSize) * gridSize : point.z;
        const dropY = getTerrainHeight(dropX, dropZ) + 0.1;
        return new THREE.Vector3(dropX, dropY, dropZ);
    };

    const handlePointerDown = (e) => {
        if (!isEnabled || !asset || e.button !== 0) return;
        e.stopPropagation();
        const pt = calculateDropPosition(e.point);
        onStamp(pt, asset);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        const pt = calculateDropPosition(e.point);
        setCursorPos(pt);
    };

    if (!isEnabled || !asset) return null;

    return (
        <group>
            {cursorPos && (
                <mesh position={cursorPos} raycast={() => null} renderOrder={200} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[gridSize, gridSize]} />
                    <meshBasicMaterial 
                        transparent 
                        opacity={0.5} 
                        color="#4ade80" 
                        depthTest={false} 
                    />
                </mesh>
            )}
            <mesh onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </group>
    );
};
