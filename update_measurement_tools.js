const fs = require('fs');

const content = `import React, { useState, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Text, Html } from '@react-three/drei';
import * as THREE from 'three';

const RulerTool = ({ getTerrainHeight, gridSize }) => {
    const { controls } = useThree();
    const [points, setPoints] = useState([]);
    const [cursorPos, setCursorPos] = useState(null);
    
    const [isFading, setIsFading] = useState(false);
    const [opacity, setOpacity] = useState(1);
    const lingerTimerRef = useRef(null);

    useFrame((state, delta) => {
        if (isFading) {
            if (opacity > 0) {
                setOpacity(prev => Math.max(0, prev - delta * 1.5));
            } else if (points.length > 0) {
                setPoints([]);
                setIsFading(false);
                setOpacity(1);
            }
        }
    });

    useEffect(() => {
        if (controls) controls.enabled = points.length === 0 || isFading;
        return () => {
            if (controls) controls.enabled = true;
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
        };
    }, [points, isFading, controls]);

    const handlePointerDown = e => {
        if (e.button !== 0) return;
        e.stopPropagation();

        if (lingerTimerRef.current) {
            clearTimeout(lingerTimerRef.current);
            lingerTimerRef.current = null;
        }

        const pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (isFading || opacity < 1) {
            setIsFading(false);
            setOpacity(1);
            setPoints([pt]);
        } else {
            setPoints(p => [...p, pt]);
        }
    };

    const handlePointerMove = e => {
        if (isFading) return;
        e.stopPropagation();
        const pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setCursorPos(pt);
    };

    const handleContextMenu = e => {
        e.preventDefault();
        e.stopPropagation();
        if (points.length > 0 && !isFading) {
            setCursorPos(null);
            lingerTimerRef.current = setTimeout(() => {
                setIsFading(true);
            }, 1500);
        } else if (points.length > 0) {
             if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
             setIsFading(false);
             setOpacity(1);
             setPoints([]);
        }
    };

    const segments = [];
    let totalDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];
        const dist = start.distanceTo(end);
        totalDist += dist;
        segments.push(
            <group key={\`segment-\${i}\`}>
                <Line points={[start, end]} color="#f59e0b" lineWidth={3} dashed dashScale={5} depthTest={false} renderOrder={300} transparent opacity={opacity} />
                <Html position={end.clone().add(new THREE.Vector3(0, 0.3, 0))} center style={{ opacity }}>
                    <div className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none" style={{ opacity }}>
                        {Math.round((dist / gridSize) * 5)} ft
                    </div>
                </Html>
            </group>
        );
    }

    if (points.length > 0 && cursorPos && !isFading) {
        const lastPoint = points[points.length - 1];
        const currentSegmentDist = lastPoint.distanceTo(cursorPos);
        const currentTotal = totalDist + currentSegmentDist;
        segments.push(
            <group key="current-segment">
                <Line points={[lastPoint, cursorPos]} color="#f59e0b" lineWidth={3} dashed dashScale={5} depthTest={false} renderOrder={300} transparent opacity={opacity} />
                <Html position={cursorPos.clone().add(new THREE.Vector3(0, 0.3, 0))} center style={{ opacity }}>
                    <div className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none" style={{ opacity }}>
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

const ShapeToolBase = ({ children, onHitTest, tokens, onCompleteSelection, type, isLingering, onSaveMeasurement }) => {
    const { controls } = useThree();
    const [startPoint, setStartPoint] = useState(null);
    const [endPoint, setEndPoint] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    
    const [isFading, setIsFading] = useState(false);
    const [opacity, setOpacity] = useState(1);
    const lingerTimerRef = useRef(null);

    useFrame((state, delta) => {
        if (isFading) {
            if (opacity > 0) {
                setOpacity(prev => Math.max(0, prev - delta * 1.5));
            } else if (startPoint && endPoint) {
                setStartPoint(null);
                setEndPoint(null);
                setIsFading(false);
                setOpacity(1);
            }
        }
    });

    useEffect(() => {
        if (controls) controls.enabled = (!startPoint && !isDrawing) || isFading;
        return () => {
            if (controls) controls.enabled = true;
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
        };
    }, [startPoint, isDrawing, isFading, controls]);

    const handlePointerDown = e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        
        if (lingerTimerRef.current) {
            clearTimeout(lingerTimerRef.current);
            lingerTimerRef.current = null;
        }

        if (isFading || opacity < 1) {
            setIsFading(false);
            setOpacity(1);
            setStartPoint(null);
            setEndPoint(null);
            setIsDrawing(false);
            setIsFinalizing(false);
        }

        if (startPoint && endPoint && !isDrawing && !isFading) {
            setIsFinalizing(true);
            return;
        }
        
        setStartPoint(e.point);
        setEndPoint(e.point);
        setIsDrawing(true);
    };

    const handlePointerMove = e => {
        if (!startPoint || !isDrawing || isFinalizing || isFading) return;
        e.stopPropagation();
        setEndPoint(e.point);
    };

    const handlePointerUp = e => {
        if (e.button !== 0) return;
        e.stopPropagation();

        if (isDrawing) {
            setIsDrawing(false);
            setIsFinalizing(true);
            if (!isLingering) {
                if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
                lingerTimerRef.current = setTimeout(() => {
                     setIsFading(true);
                }, 5000);
            }
        }
    };

    const handleClick = e => {
        if (e.button !== 0) return;
        e.stopPropagation();

        if (isFinalizing && !isFading) {
            if (onHitTest && tokens && onCompleteSelection) {
                const selectedIds = [];
                tokens.forEach(t => {
                    const tx = t.x || 0;
                    const tz = t.z || 0;
                    if (onHitTest(startPoint, endPoint, tx, tz)) {
                        selectedIds.push(t.id);
                    }
                });
                onCompleteSelection(selectedIds);
            } else if (onCompleteSelection) {
                onCompleteSelection([]);
            }
            
            if (isLingering && onSaveMeasurement) {
                onSaveMeasurement({
                    type,
                    start: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
                    end: { x: endPoint.x, y: endPoint.y, z: endPoint.z }
                });
                setStartPoint(null);
                setEndPoint(null);
            }
            
            setIsFinalizing(false);
        }
    };

    const handleContextMenu = e => {
        e.preventDefault();
        e.stopPropagation();
        if (startPoint && endPoint && !isFading) {
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
            setIsFading(true);
        } else if (!startPoint && !endPoint) {
            // Do nothing
        } else {
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
            setStartPoint(null);
            setEndPoint(null);
            setIsDrawing(false);
            setIsFinalizing(false);
            setIsFading(false);
            setOpacity(1);
        }
    };

    return (
        <>
            {startPoint && endPoint && children(startPoint, endPoint, opacity)}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
            </mesh>
        </>
    );
};

const renderCircle = (start, end, opacity, gridSize, onClick) => {
    const radius = start.distanceTo(end);
    const radiusFt = Math.round((radius / gridSize) * 5);
    return (
        <group position={[start.x, start.y + 0.1, start.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[Math.max(0.01, radius - 0.05), radius, 64]} />
                <meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} depthTest={false} transparent opacity={opacity} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onClick} visible={false}>
                 <circleGeometry args={[radius, 64]} />
            </mesh>
            <Html position={[0, 0.3, radius]} center style={{ opacity }}>
                <div className="bg-slate-900/80 text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none" style={{ opacity }}>{radiusFt} ft</div>
            </Html>
        </group>
    );
};

const renderCone = (start, end, opacity, gridSize, onClick) => {
    const vec = new THREE.Vector3().subVectors(end, start);
    const length = vec.length();
    const angle = Math.atan2(vec.x, vec.z);
    const lengthFt = Math.round((length / gridSize) * 5);
    return (
        <group position={[start.x, start.y + 0.1, start.z]} rotation={[0, angle, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
                <circleGeometry args={[length, 32, -Math.PI / 2 - Math.PI / 6, Math.PI / 3]} />
                <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={opacity * 0.5} depthTest={false} />
            </mesh>
            <Html position={[0, 0.3, length / 2]} center style={{ opacity }}>
                <div className="bg-slate-900/80 text-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none" style={{ opacity }}>{lengthFt} ft Cone</div>
            </Html>
        </group>
    );
};

const renderBox = (start, end, opacity, gridSize, onClick) => {
    const width = Math.abs(start.x - end.x);
    const depth = Math.abs(start.z - end.z);
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const widthFt = Math.round((width / gridSize) * 5);
    const depthFt = Math.round((depth / gridSize) * 5);
    return (
        <group position={[center.x, start.y + 0.1, center.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
                <planeGeometry args={[width, depth]} />
                <meshBasicMaterial color="#a855f7" side={THREE.DoubleSide} transparent opacity={opacity * 0.4} depthTest={false} />
            </mesh>
            <Line points={[[-width/2, 0, -depth/2], [width/2, 0, -depth/2], [width/2, 0, depth/2], [-width/2, 0, depth/2], [-width/2, 0, -depth/2]]} color="#a855f7" lineWidth={2} depthTest={false} transparent opacity={opacity} />
            <Html position={[0, 0.3, 0]} center style={{ opacity }}>
                <div className="bg-slate-900/80 text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none" style={{ opacity }}>{widthFt} x {depthFt} ft</div>
            </Html>
        </group>
    );
};

const CircleTool = ({ gridSize, tokens, onCompleteSelection, isLingering, onSaveMeasurement }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        type="circle"
        isLingering={isLingering}
        onSaveMeasurement={onSaveMeasurement}
        onHitTest={(start, end, tx, tz) => {
            const radius = start.distanceTo(end);
            const dist = Math.sqrt((start.x - tx) ** 2 + (start.z - tz) ** 2);
            return dist <= radius + 0.25;
        }}
    >
        {(start, end, opacity) => renderCircle(start, end, opacity, gridSize, undefined)}
    </ShapeToolBase>
);

const ConeTool = ({ gridSize, tokens, onCompleteSelection, isLingering, onSaveMeasurement }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        type="cone"
        isLingering={isLingering}
        onSaveMeasurement={onSaveMeasurement}
        onHitTest={(start, end, tx, tz) => {
            const vec = new THREE.Vector3().subVectors(end, start);
            const length = vec.length();
            const dist = Math.sqrt((start.x - tx) ** 2 + (start.z - tz) ** 2);
            if (dist > length + 0.25) return false;
            
            const angleToToken = Math.atan2(tx - start.x, tz - start.z);
            const coneAngle = Math.atan2(vec.x, vec.z);
            
            let diff = Math.abs(angleToToken - coneAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            return diff <= Math.PI / 6 + 0.05;
        }}
    >
        {(start, end, opacity) => renderCone(start, end, opacity, gridSize, undefined)}
    </ShapeToolBase>
);

const BoxTool = ({ gridSize, tokens, onCompleteSelection, isLingering, onSaveMeasurement }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        type="box"
        isLingering={isLingering}
        onSaveMeasurement={onSaveMeasurement}
        onHitTest={(start, end, tx, tz) => {
            const minX = Math.min(start.x, end.x) - 0.25;
            const maxX = Math.max(start.x, end.x) + 0.25;
            const minZ = Math.min(start.z, end.z) - 0.25;
            const maxZ = Math.max(start.z, end.z) + 0.25;
            return tx >= minX && tx <= maxX && tz >= minZ && tz <= maxZ;
        }}
    >
        {(start, end, opacity) => renderBox(start, end, opacity, gridSize, undefined)}
    </ShapeToolBase>
);

export const MeasurementTools = ({ activeTool, getTerrainHeight, gridSize, tokens, onCompleteSelection, measurements, onSaveMeasurement, onDeleteMeasurement }) => {
    // Render lingering shapes
    const lingeringDrawings = Object.entries(measurements || {}).map(([id, m]) => {
        if (!m) return null;
        const start = new THREE.Vector3(m.start.x, m.start.y, m.start.z);
        const end = new THREE.Vector3(m.end.x, m.end.y, m.end.z);
        const handleClick = (e) => {
            e.stopPropagation();
            if (onDeleteMeasurement) onDeleteMeasurement(id);
        };
        
        switch (m.type) {
            case 'circle': return <group key={id}>{renderCircle(start, end, 1, gridSize, handleClick)}</group>;
            case 'cone': return <group key={id}>{renderCone(start, end, 1, gridSize, handleClick)}</group>;
            case 'box': return <group key={id}>{renderBox(start, end, 1, gridSize, handleClick)}</group>;
            default: return null;
        }
    });

    const isLingering = activeTool?.endsWith('-linger');
    const baseTool = activeTool ? activeTool.replace('-linger', '') : null;

    let activeToolElement = null;
    switch (baseTool) {
        case 'ruler': activeToolElement = <RulerTool getTerrainHeight={getTerrainHeight} gridSize={gridSize} />; break;
        case 'circle': activeToolElement = <CircleTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} isLingering={isLingering} onSaveMeasurement={onSaveMeasurement} />; break;
        case 'cone': activeToolElement = <ConeTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} isLingering={isLingering} onSaveMeasurement={onSaveMeasurement} />; break;
        case 'box': activeToolElement = <BoxTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} isLingering={isLingering} onSaveMeasurement={onSaveMeasurement} />; break;
    }

    return (
        <>
            {lingeringDrawings}
            {activeToolElement}
        </>
    );
};
`;

fs.writeFileSync('src/components/MeasurementTools.jsx', content);
