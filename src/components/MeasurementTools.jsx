import React, { useState, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Text, Html } from '@react-three/drei';
import * as THREE from 'three';

const RulerTool = ({ getTerrainHeight, gridSize }) => {
    const { controls } = useThree();
    const [points, setPoints] = useState([]);
    const [cursorPos, setCursorPos] = useState(null);
    
    // Add Linger and Fade
    const [isFading, setIsFading] = useState(false);
    const [opacity, setOpacity] = useState(1);
    const lingerTimerRef = useRef(null);

    useFrame((state, delta) => {
        if (isFading) {
            if (opacity > 0) {
                setOpacity(prev => Math.max(0, prev - delta * 1.5)); // Fade out over ~0.66 seconds
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
            }, 1500); // Linger for 1.5 seconds before fading
        } else if (points.length === 0) {
            // Already empty, do nothing
        } else {
             // Force clear if they right click again while lingering/fading
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
            <group key={`segment-${i}`}>
                <Line points={[start, end]} color="#f59e0b" lineWidth={3} dashed dashScale={5} depthTest={false} renderOrder={300} transparent opacity={opacity} />
                <Html position={end.clone().add(new THREE.Vector3(0, 0.3, 0))} center style={{ opacity }}>
                    <div className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap" style={{ opacity }}>
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
                    <div className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap" style={{ opacity }}>
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

const ShapeToolBase = ({ children, onHitTest, tokens, onCompleteSelection }) => {
    const { controls } = useThree();
    const [startPoint, setStartPoint] = useState(null);
    const [endPoint, setEndPoint] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    
    // Add Linger and Fade
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

        // If the shape is already drawn, the second click prepares to finalize
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
            // Auto finalize to avoid requiring a second click
            setIsFinalizing(true);
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
            lingerTimerRef.current = setTimeout(() => {
                 setIsFading(true);
            }, 5000); // Linger for 5 seconds
        }
    };

    const handleClick = e => {
        if (e.button !== 0) return;
        e.stopPropagation();

        // Delaying finalization to the 'click' event ensures the shape mesh consumes the 
        // click before unmounting, preventing the canvas from firing onPointerMissed!
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
            setIsFinalizing(false); // Reset finalizing state after check
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

const CircleTool = ({ gridSize, tokens, onCompleteSelection }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        onHitTest={(start, end, tx, tz) => {
            const radius = start.distanceTo(end);
            const dist = Math.sqrt((start.x - tx) ** 2 + (start.z - tz) ** 2);
            return dist <= radius + 0.25; // 0.25 leniency grabs tokens slightly touching the edge
        }}
    >
        {(start, end, opacity) => {
            const radius = start.distanceTo(end);
            const radiusFt = Math.round((radius / gridSize) * 5);
            return (
                <group position={[start.x, start.y + 0.1, start.z]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[radius - 0.05, radius, 64]} />
                        <meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} depthTest={false} transparent opacity={opacity} />
                    </mesh>
                    <Html position={[0, 0.3, radius]} center style={{ opacity }}>
                        <div className="bg-slate-900/80 text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap" style={{ opacity }}>{radiusFt} ft</div>
                    </Html>
                </group>
            );
        }}
    </ShapeToolBase>
);

const ConeTool = ({ gridSize, tokens, onCompleteSelection }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        onHitTest={(start, end, tx, tz) => {
            const vec = new THREE.Vector3().subVectors(end, start);
            const length = vec.length();
            const dist = Math.sqrt((start.x - tx) ** 2 + (start.z - tz) ** 2);
            if (dist > length + 0.25) return false; // Too far
            
            const angleToToken = Math.atan2(tx - start.x, tz - start.z);
            const coneAngle = Math.atan2(vec.x, vec.z);
            
            let diff = Math.abs(angleToToken - coneAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            return diff <= Math.PI / 6 + 0.05; // 30 degrees + slight leniency = 60 degree cone
        }}
    >
        {(start, end, opacity) => {
            const vec = new THREE.Vector3().subVectors(end, start);
            const length = vec.length();
            const angle = Math.atan2(vec.x, vec.z);
            const lengthFt = Math.round((length / gridSize) * 5);
            return (
                <group position={[start.x, start.y + 0.1, start.z]} rotation={[0, angle, 0]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <circleGeometry args={[length, 32, -Math.PI / 2 - Math.PI / 6, Math.PI / 3]} />
                        <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={opacity * 0.5} depthTest={false} />
                    </mesh>
                    <Html position={[0, 0.3, length / 2]} center style={{ opacity }}>
                        <div className="bg-slate-900/80 text-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap" style={{ opacity }}>{lengthFt} ft Cone</div>
                    </Html>
                </group>
            );
        }}
    </ShapeToolBase>
);

const BoxTool = ({ gridSize, tokens, onCompleteSelection }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        onHitTest={(start, end, tx, tz) => {
            const minX = Math.min(start.x, end.x) - 0.25;
            const maxX = Math.max(start.x, end.x) + 0.25;
            const minZ = Math.min(start.z, end.z) - 0.25;
            const maxZ = Math.max(start.z, end.z) + 0.25;
            return tx >= minX && tx <= maxX && tz >= minZ && tz <= maxZ;
        }}
    >
        {(start, end, opacity) => {
            const width = Math.abs(start.x - end.x);
            const depth = Math.abs(start.z - end.z);
            const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            const widthFt = Math.round((width / gridSize) * 5);
            const depthFt = Math.round((depth / gridSize) * 5);
            return (
                <group position={[center.x, start.y + 0.1, center.z]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[width, depth]} />
                        <meshBasicMaterial color="#a855f7" side={THREE.DoubleSide} transparent opacity={opacity * 0.4} depthTest={false} />
                    </mesh>
                    <Line points={[[-width/2, 0, -depth/2], [width/2, 0, -depth/2], [width/2, 0, depth/2], [-width/2, 0, depth/2], [-width/2, 0, -depth/2]]} color="#a855f7" lineWidth={2} depthTest={false} transparent opacity={opacity} />
                    <Html position={[0, 0.3, 0]} center style={{ opacity }}>
                        <div className="bg-slate-900/80 text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap" style={{ opacity }}>{widthFt} x {depthFt} ft</div>
                    </Html>
                </group>
            );
        }}
    </ShapeToolBase>
);

export const MeasurementTools = ({ activeTool, getTerrainHeight, gridSize, tokens, onCompleteSelection }) => {
    if (!activeTool) return null;
    switch (activeTool) {
        case 'ruler': return <RulerTool getTerrainHeight={getTerrainHeight} gridSize={gridSize} />;
        case 'circle': return <CircleTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} />;
        case 'cone': return <ConeTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} />;
        case 'box': return <BoxTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} />;
        default: return null;
    }
};