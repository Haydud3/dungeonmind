import React, { useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useCursor, Line } from '@react-three/drei';

export const WallDrawingController = ({ isEnabled, onDrawEnd, getTerrainHeight }) => {
    const { controls } = useThree();
    const [isDrawing, setIsDrawing] = useState(false);
    const [points, setPoints] = useState([]);

    useCursor(isEnabled, 'crosshair', 'auto');

    // This effect handles mapping controls so left click draws and right click pans
    useEffect(() => {
        if (controls) {
            if (isEnabled) {
                // Save original mapping to restore later if needed, though they are usually PAN and ROTATE
                // We'll just force the mappings while the tool is active
                controls.mouseButtons.LEFT = 0; // Disable left click pan
                controls.mouseButtons.RIGHT = 2; // THREE.MOUSE.PAN is 2
            } else {
                // Restore defaults for MapControls (LEFT: PAN(2), RIGHT: ROTATE(0))
                // Note: enableRotate={false} is set on MapControls so rotate doesn't actually rotate
                controls.mouseButtons.LEFT = 2; // THREE.MOUSE.PAN
                controls.mouseButtons.RIGHT = 0; // THREE.MOUSE.ROTATE
            }
        }
    }, [isEnabled, controls]);

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        
        setIsDrawing(true);
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setPoints([pt]);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled || !isDrawing) return;
        e.stopPropagation();

        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (points.length > 0 && points[points.length-1].distanceTo(pt) < 0.1) return;

        setPoints(prev => [...prev, pt]);
    };

    const handlePointerUp = (e) => {
        if (!isEnabled || !isDrawing || e.button !== 0) return;
        e.stopPropagation();

        setIsDrawing(false);
        
        if (points.length > 1) {
            onDrawEnd(points);
        }
        setPoints([]);
    };
    
    if (!isEnabled) return null;

    return (
        <>
            {/* Show the line being actively drawn */}
            {points.length > 1 && <Line points={points} color="magenta" lineWidth={5} renderOrder={200} depthTest={false} />}

            {/* The large invisible plane to capture drawing events */}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </>
    );
};