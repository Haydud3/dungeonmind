import React, { useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useCursor, Line } from '@react-three/drei';

export const WallDrawingController = ({ isEnabled, onDrawEnd, getTerrainHeight }) => {
    const { controls } = useThree();
    const [isDrawing, setIsDrawing] = useState(false);
    const [points, setPoints] = useState([]);

    useCursor(isEnabled, 'crosshair', 'auto');

    // This effect handles enabling/disabling controls
    useEffect(() => {
        if (controls) {
            controls.enabled = !isDrawing;
        }
    }, [isDrawing, controls]);

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        
        setIsDrawing(true);
        const pt = e.point;
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setPoints([pt]);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled || !isDrawing) return;
        e.stopPropagation();

        const pt = e.point;
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