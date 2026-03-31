import React, { useState, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Text, Html } from '@react-three/drei';
import * as THREE from 'three';

const RulerTool = ({ getTerrainHeight, gridSize }) => {
    const { controls } = useThree();
    const [points, setPoints] = useState([]);
    const [cursorPos, setCursorPos] = useState(null);

    useEffect(() => {
        if (controls) controls.enabled = points.length === 0;
    }, [points, controls]);

    const handlePointerDown = e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setPoints(p => [...p, pt]);
    };

    const handlePointerMove = e => {
        e.stopPropagation();
        const pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setCursorPos(pt);
    };

    const handleContextMenu = e => {
        e.preventDefault();
        e.stopPropagation();
        setPoints([]);
        setCursorPos(null);
    };

    const segments = [];
    let totalDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];
        const dist = start.distanceTo(end);
        totalDist += dist;
        segments.push(
            <group key={`segment-${i}`}>
                <Line points={[start, end]} color="#f59e0b" lineWidth={3} dashed dashScale={5} depthTest={false} renderOrder={300} />
                <Html position={end.clone().add(new THREE.Vector3(0, 0.3, 0))} center>
                    <div className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                        {Math.round((dist / gridSize) * 5)} ft
                    </div>
                </Html>
            </group>
        );
    }

    if (points.length > 0 && cursorPos) {
        const lastPoint = points[points.length - 1];
        const currentSegmentDist = lastPoint.distanceTo(cursorPos);
        const currentTotal = totalDist + currentSegmentDist;
        segments.push(
            <group key="current-segment">
                <Line points={[lastPoint, cursorPos]} color="#f59e0b" lineWidth={3} dashed dashScale={5} depthTest={false} renderOrder={300} />
                <Html position={cursorPos.clone().add(new THREE.Vector3(0, 0.3, 0))} center>
                    <div className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                        {Math.round((currentTotal / gridSize) * 5)} ft
                    </div>
                </Html>
            </group>
        );
    }

    return (
        <>
            {segments}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onContextMenu={handleContextMenu}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
            </mesh>
        </>
    );
};

const ShapeToolBase = ({ children }) => {
    const { controls } = useThree();
    const [startPoint, setStartPoint] = useState(null);
    const [endPoint, setEndPoint] = useState(null);

    useEffect(() => {
        if (controls) controls.enabled = !startPoint;
    }, [startPoint, controls]);

    const handlePointerDown = e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        setStartPoint(e.point);
        setEndPoint(e.point);
    };

    const handlePointerMove = e => {
        if (!startPoint) return;
        e.stopPropagation();
        setEndPoint(e.point);
    };

    const handlePointerUp = e => {
        // Persist the shape until right-click
    };

    const handleContextMenu = e => {
        e.preventDefault();
        e.stopPropagation();
        setStartPoint(null);
        setEndPoint(null);
    };

    return (
        <>
            {startPoint && endPoint && children(startPoint, endPoint)}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onContextMenu={handleContextMenu}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
            </mesh>
        </>
    );
};

const CircleTool = ({ gridSize }) => (
    <ShapeToolBase>
        {(start, end) => {
            const radius = start.distanceTo(end);
            const radiusFt = Math.round((radius / gridSize) * 5);
            return (
                <group position={[start.x, start.y + 0.1, start.z]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[radius - 0.05, radius, 64]} />
                        <meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} depthTest={false} />
                    </mesh>
                    <Html position={[0, 0.3, radius]} center>
                        <div className="bg-slate-900/80 text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">{radiusFt} ft</div>
                    </Html>
                </group>
            );
        }}
    </ShapeToolBase>
);

const ConeTool = ({ gridSize }) => (
    <ShapeToolBase>
        {(start, end) => {
            const vec = new THREE.Vector3().subVectors(end, start);
            const length = vec.length();
            const angle = Math.atan2(vec.x, vec.z);
            const lengthFt = Math.round((length / gridSize) * 5);
            return (
                <group position={[start.x, start.y + 0.1, start.z]} rotation={[0, angle, 0]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[length, length, 32, 1, true, -Math.PI / 6, Math.PI / 3]} />
                        <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={0.5} depthTest={false} />
                    </mesh>
                    <Html position={[0, 0.3, length / 2]} center>
                        <div className="bg-slate-900/80 text-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">{lengthFt} ft Cone</div>
                    </Html>
                </group>
            );
        }}
    </ShapeToolBase>
);

const BoxTool = ({ gridSize }) => (
    <ShapeToolBase>
        {(start, end) => {
            const width = Math.abs(start.x - end.x);
            const depth = Math.abs(start.z - end.z);
            const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            const widthFt = Math.round((width / gridSize) * 5);
            const depthFt = Math.round((depth / gridSize) * 5);
            return (
                <group position={[center.x, start.y + 0.1, center.z]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[width, depth]} />
                        <meshBasicMaterial color="#a855f7" side={THREE.DoubleSide} transparent opacity={0.4} depthTest={false} />
                    </mesh>
                    <Line points={[[-width/2, 0, -depth/2], [width/2, 0, -depth/2], [width/2, 0, depth/2], [-width/2, 0, depth/2], [-width/2, 0, -depth/2]]} color="#a855f7" lineWidth={2} depthTest={false} />
                    <Html position={[0, 0.3, 0]} center>
                        <div className="bg-slate-900/80 text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">{widthFt} x {depthFt} ft</div>
                    </Html>
                </group>
            );
        }}
    </ShapeToolBase>
);

export const MeasurementTools = ({ activeTool, getTerrainHeight, gridSize }) => {
    if (!activeTool) return null;
    switch (activeTool) {
        case 'ruler': return <RulerTool getTerrainHeight={getTerrainHeight} gridSize={gridSize} />;
        case 'circle': return <CircleTool gridSize={gridSize} />;
        case 'cone': return <ConeTool gridSize={gridSize} />;
        case 'box': return <BoxTool gridSize={gridSize} />;
        default: return null;
    }
};