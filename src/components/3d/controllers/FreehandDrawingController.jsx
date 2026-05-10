import React, { useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useCursor, Line } from '@react-three/drei';

export const FreehandDrawingController = ({ isEnabled, color, lineWidth, onDrawEnd, getTerrainHeight }) => {
    const { controls } = useThree();
    const [isDrawing, setIsDrawing] = useState(false);
    const [points, setPoints] = useState([]);

    useCursor(isEnabled, 'crosshair', 'auto');

    // This effect handles mapping controls so left click draws and right click pans
    useEffect(() => {
        if (controls) {
            if (isEnabled) {
                controls.mouseButtons.LEFT = 0;
                controls.mouseButtons.RIGHT = 2; // THREE.MOUSE.PAN
            } else {
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
            onDrawEnd({
                points,
                color,
                lineWidth
            });
        }
        setPoints([]);
    };
    
    if (!isEnabled) return null;

    return (
        <>
            {/* Show the line being actively drawn */}
            {points.length > 1 && <Line points={points} color={color} lineWidth={lineWidth} renderOrder={200} depthTest={false} />}

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