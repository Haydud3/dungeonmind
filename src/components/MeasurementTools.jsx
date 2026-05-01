import React, { useState, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import Icon from './Icon';

const RulerTool = ({ getTerrainHeight, gridSize }) => {
    const { controls } = useThree();
    const [points, setPoints] = useState([]);
    const [cursorPos, setCursorPos] = useState(null);
    
    
    const [isFading, setIsFading] = useState(false);
    const [opacity, setOpacity] = useState(1);
    const lingerTimerRef = useRef(null);

    // Calculate total fixed distance for completed segments
    let totalDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalDist += points[i].distanceTo(points[i+1]);
    }

    useFrame((state, delta) => {
        if (isFading) {
            if (opacity > 0) {
                setOpacity(prev => Math.max(0, prev - delta * 1.5));
            } else if (points.length > 0) {
                setPoints([]);
                setCursorPos(null);
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
        setCursorPos(pt);

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
        if (e.nativeEvent) e.nativeEvent.preventDefault();
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
             setCursorPos(null);
        }
    };

    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];
        const dist = start.distanceTo(end);
        segments.push(
            <group key={`segment-${i}`}>
                <Line points={[start, end]} color="#f59e0b" lineWidth={3} dashed dashScale={5} depthTest={false} renderOrder={300} transparent opacity={opacity} />
                <Html position={[end.x, end.y + 0.3, end.z]} center style={{ opacity }}>
                    <div className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none" style={{ opacity }}>
                        {Math.round((dist / gridSize) * 5)} ft
                    </div>
                </Html>
            </group>
        );
    }

    return (
        <>
            {segments}
            
            {points.length > 0 && cursorPos && !isFading && (
                <group>
                    <Line 
                        points={[points[points.length - 1], cursorPos]} 
                        color="#f59e0b" 
                        lineWidth={3} 
                        dashed 
                        dashScale={5} 
                        depthTest={false} 
                        renderOrder={300} 
                        transparent 
                        opacity={opacity} 
                        frustumCulled={false}
                    />
                    <Html position={[cursorPos.x, cursorPos.y + 0.3, cursorPos.z]} center className="pointer-events-none select-none z-50">
                        <div 
                            className="bg-slate-900/80 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none"
                            style={{ opacity }}
                        >
                            {Math.round(((totalDist + points[points.length - 1].distanceTo(cursorPos)) / gridSize) * 5)} ft
                        </div>
                    </Html>
                </group>
            )}

            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onContextMenu={handleContextMenu}
                rotation={[-Math.PI / 2, 0, 0]}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
            </mesh>
        </>
    );
};

const ShapeToolBase = ({ children, onHitTest, tokens, onCompleteSelection, type, isLingering, onSaveMeasurement, getTerrainHeight }) => {
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
        
        const pt = e.point.clone();
        if (getTerrainHeight) pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        
        setStartPoint(pt);
        setEndPoint(pt);
        setIsDrawing(true);
    };

    const handlePointerMove = e => {
        if (!startPoint || !isDrawing || isFinalizing || isFading) return;
        e.stopPropagation();
        const pt = e.point.clone();
        if (getTerrainHeight) pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setEndPoint(pt);
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
        if (e.nativeEvent) e.nativeEvent.preventDefault();
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
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
            </mesh>
        </>
    );
};

const STYLES = {
    default: { color: { circle: '#3b82f6', cone: '#10b981', box: '#a855f7', freehand: '#ef4444' }, opacity: 0.4, blend: THREE.NormalBlending },
    fire: { color: '#ef4444', opacity: 0.8, blend: THREE.AdditiveBlending },
    web: { color: '#cbd5e1', opacity: 0.8, blend: THREE.NormalBlending, useWeb: true },
    poison: { color: '#22c55e', opacity: 0.7, blend: THREE.AdditiveBlending },
    radiant: { color: '#fef08a', opacity: 0.8, blend: THREE.AdditiveBlending },
    ice: { color: '#7dd3fc', opacity: 0.6, blend: THREE.AdditiveBlending }
};

let webTexture = null;
function getWebTexture() {
    if (webTexture) return webTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
        ctx.moveTo(256, 256);
        ctx.lineTo(256 + 256 * Math.cos(i * Math.PI / 8), 256 + 256 * Math.sin(i * Math.PI / 8));
    }
    for (let r = 40; r < 256; r += 40) {
        ctx.moveTo(256 + r, 256);
        for(let a=0; a<=Math.PI*2; a+=0.1) {
            ctx.lineTo(256 + (r + Math.sin(a*10)*5) * Math.cos(a), 256 + (r + Math.sin(a*10)*5) * Math.sin(a));
        }
    }
    ctx.stroke();
    webTexture = new THREE.CanvasTexture(canvas);
    webTexture.wrapS = THREE.RepeatWrapping;
    webTexture.wrapT = THREE.RepeatWrapping;
    return webTexture;
}

const getMaterialProps = (type, styleKey = 'default') => {
    const s = STYLES[styleKey] || STYLES.default;
    const color = typeof s.color === 'object' ? s.color[type] : s.color;
    return {
        color,
        transparent: true,
        opacity: s.opacity,
        blending: s.blend,
        map: s.useWeb ? getWebTexture() : null,
        depthWrite: false,
        side: THREE.DoubleSide
    };
};

const renderCircle = (start, end, opacity, gridSize, onDelete, styleKey = 'default') => {
    const radius = start.distanceTo(end) || 0.01;
    const radiusFt = Math.round((radius / gridSize) * 5);
    
    const circleBorder = [];
    for(let i=0; i<=64; i++) {
        const a = (i/64) * Math.PI * 2;
        circleBorder.push([Math.cos(a) * radius, 0, -Math.sin(a) * radius]);
    }

    return (
        <group position={[start.x, start.y + 0.1, start.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[radius, radius, 1]}>
                <circleGeometry args={[1, 64]} />
                <meshBasicMaterial {...getMaterialProps('circle', styleKey)} opacity={STYLES[styleKey || 'default']?.opacity * opacity} />
            </mesh>
            <Line points={circleBorder} color={getMaterialProps('circle', styleKey).color} lineWidth={2} depthTest={false} transparent opacity={opacity} />
            <Html position={[0, 0.3, radius]} center style={{ opacity }}>
                <div className={`group bg-slate-900/80 text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap flex items-center gap-2 transition-all ${onDelete ? 'pointer-events-auto hover:bg-slate-800' : 'pointer-events-none'}`} style={{ opacity }}>
                    <span>{radiusFt} ft</span>
                    {onDelete && (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className="hidden group-hover:block text-slate-400 hover:text-red-400 transition-colors" title="Remove Measurement">
                            <Icon name="x" size={12} />
                        </button>
                    )}
                </div>
            </Html>
        </group>
    );
};

const renderCone = (start, end, opacity, gridSize, onDelete, styleKey = 'default') => {
    const vec = new THREE.Vector3().subVectors(end, start);
    const length = vec.length() || 0.01;
    const angle = Math.atan2(vec.x, vec.z);
    const lengthFt = Math.round((length / gridSize) * 5);

    const coneBorder = [[0, 0, 0]];
    for(let i=0; i<=32; i++) {
        const a = -Math.PI / 2 - Math.PI / 6 + (i/32) * (Math.PI / 3);
        coneBorder.push([Math.cos(a) * length, 0, -Math.sin(a) * length]);
    }
    coneBorder.push([0, 0, 0]);

    return (
        <group position={[start.x, start.y + 0.1, start.z]} rotation={[0, angle, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[length, length, 1]}>
                <circleGeometry args={[1, 32, -Math.PI / 2 - Math.PI / 6, Math.PI / 3]} />
                <meshBasicMaterial {...getMaterialProps('cone', styleKey)} opacity={STYLES[styleKey || 'default']?.opacity * opacity} />
            </mesh>
            <Line points={coneBorder} color={getMaterialProps('cone', styleKey).color} lineWidth={2} depthTest={false} transparent opacity={opacity} />
            <Html position={[0, 0.3, length / 2]} center style={{ opacity }}>
                <div className={`group bg-slate-900/80 text-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap flex items-center gap-2 transition-all ${onDelete ? 'pointer-events-auto hover:bg-slate-800' : 'pointer-events-none'}`} style={{ opacity }}>
                    <span>{lengthFt} ft Cone</span>
                    {onDelete && (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className="hidden group-hover:block text-slate-400 hover:text-red-400 transition-colors" title="Remove Measurement">
                            <Icon name="x" size={12} />
                        </button>
                    )}
                </div>
            </Html>
        </group>
    );
};

const renderBox = (start, end, opacity, gridSize, onDelete, styleKey = 'default') => {
    const width = Math.abs(start.x - end.x) || 0.01;
    const depth = Math.abs(start.z - end.z) || 0.01;
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const widthFt = Math.round((width / gridSize) * 5);
    const depthFt = Math.round((depth / gridSize) * 5);
    const matProps = getMaterialProps('box', styleKey);
    return (
        <group position={[center.x, start.y + 0.1, center.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[width, depth, 1]}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial {...matProps} opacity={STYLES[styleKey || 'default']?.opacity * opacity} />
            </mesh>
            <Line points={[[-width/2, 0, -depth/2], [width/2, 0, -depth/2], [width/2, 0, depth/2], [-width/2, 0, depth/2], [-width/2, 0, -depth/2]]} color={matProps.color} lineWidth={2} depthTest={false} transparent opacity={opacity} />
            <Html position={[0, 0.3, 0]} center style={{ opacity }}>
                <div className={`group bg-slate-900/80 text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap flex items-center gap-2 transition-all ${onDelete ? 'pointer-events-auto hover:bg-slate-800' : 'pointer-events-none'}`} style={{ opacity }}>
                    <span>{widthFt} x {depthFt} ft</span>
                    {onDelete && (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className="hidden group-hover:block text-slate-400 hover:text-red-400 transition-colors" title="Remove Measurement">
                            <Icon name="x" size={12} />
                        </button>
                    )}
                </div>
            </Html>
        </group>
    );
};

const CircleTool = ({ gridSize, tokens, onCompleteSelection, isLingering, onSaveMeasurement, activeStyle, getTerrainHeight }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        type="circle"
        isLingering={isLingering}
        onSaveMeasurement={onSaveMeasurement}
        getTerrainHeight={getTerrainHeight}
        onHitTest={(start, end, tx, tz) => {
            const radius = start.distanceTo(end);
            const dist = Math.sqrt((start.x - tx) ** 2 + (start.z - tz) ** 2);
            return dist <= radius + 0.25;
        }}
    >
        {(start, end, opacity) => renderCircle(start, end, opacity, gridSize, undefined, activeStyle)}
    </ShapeToolBase>
);

const FreehandTool = ({ getTerrainHeight, isLingering, onSaveMeasurement, activeStyle }) => {
    const { controls } = useThree();
    const [points, setPoints] = useState([]);
    const [isDrawing, setIsDrawing] = useState(false);
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
        if (controls) controls.enabled = (!isDrawing && points.length === 0) || isFading;
        return () => {
            if (controls) controls.enabled = true;
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
        };
    }, [isDrawing, points, isFading, controls]);

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
            setPoints([]);
        }

        const pt = e.point.clone();
        if (getTerrainHeight) pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setPoints([pt]);
        setIsDrawing(true);
    };

    const handlePointerMove = e => {
        if (!isDrawing || isFading) return;
        e.stopPropagation();
        const pt = e.point.clone();
        if (getTerrainHeight) pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        
        setPoints(p => {
            if (p.length > 0 && p[p.length - 1].distanceToSquared(pt) < 0.05) return p;
            return [...p, pt];
        });
    };

    const handlePointerUp = e => {
        if (e.button !== 0 || !isDrawing) return;
        e.stopPropagation();
        setIsDrawing(false);

        if (isLingering && onSaveMeasurement && points.length > 1) {
            onSaveMeasurement({
                type: 'freehand',
                style: activeStyle,
                points: points.map(p => ({ x: p.x, y: p.y, z: p.z }))
            });
            setPoints([]);
        } else if (!isLingering && points.length > 1) {
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
            lingerTimerRef.current = setTimeout(() => {
                setIsFading(true);
            }, 5000);
        } else {
            setPoints([]);
        }
    };

    const handleContextMenu = e => {
        if (e.nativeEvent) e.nativeEvent.preventDefault();
        e.stopPropagation();
        if (points.length > 0 && !isFading) {
            if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
            setIsFading(true);
        }
    };

    return (
        <>
            {points.length > 1 && (
                <Line points={points} color={getMaterialProps('freehand', activeStyle).color} lineWidth={3} depthTest={false} renderOrder={300} transparent opacity={opacity} frustumCulled={false} />
            )}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onContextMenu={handleContextMenu}
                rotation={[-Math.PI / 2, 0, 0]}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
            </mesh>
        </>
    );
};

const renderFreehand = (pointsData, opacity, onDelete, getTerrainHeight, styleKey = 'default') => {
    if (!pointsData || pointsData.length < 2) return null;
    
    // Map stored point objects back to Vector3, optionally snapping to terrain
    const points = pointsData.map(p => {
        const pt = new THREE.Vector3(p.x, p.y, p.z);
        if (getTerrainHeight) pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        return pt;
    });

    const centerIdx = Math.floor(points.length / 2);
    const centerPt = points[centerIdx];
    const color = getMaterialProps('freehand', styleKey).color;
    
    return (
        <group>
            <Line points={points} color={color} lineWidth={3} depthTest={false} renderOrder={300} transparent opacity={opacity} />
            {onDelete && (
                <Html position={[centerPt.x, centerPt.y + 0.3, centerPt.z]} center style={{ opacity }}>
                    <div className={`group bg-slate-900/80 text-red-300 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center transition-all pointer-events-auto hover:bg-slate-800`} style={{ opacity }}>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className="text-slate-400 hover:text-red-400 transition-colors" title="Remove Drawing">
                            <Icon name="x" size={12} />
                        </button>
                    </div>
                </Html>
            )}
        </group>
    );
};

const ConeTool = ({ gridSize, tokens, onCompleteSelection, isLingering, onSaveMeasurement, activeStyle, getTerrainHeight }) => (
    <ShapeToolBase
        tokens={tokens}
        onCompleteSelection={onCompleteSelection}
        type="cone"
        isLingering={isLingering}
        onSaveMeasurement={onSaveMeasurement}
        getTerrainHeight={getTerrainHeight}
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
        {(start, end, opacity) => renderCone(start, end, opacity, gridSize, undefined, activeStyle)}
    </ShapeToolBase>
);

const BoxTool = ({ gridSize, tokens, onCompleteSelection, isLingering, onSaveMeasurement, activeStyle }) => (
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
        {(start, end, opacity) => renderBox(start, end, opacity, gridSize, undefined, activeStyle)}
    </ShapeToolBase>
);

export const MeasurementTools = ({ activeTool, getTerrainHeight, gridSize, tokens, onCompleteSelection, measurements, onSaveMeasurement, onDeleteMeasurement, activeStyle }) => {
    // Render lingering shapes
    const lingeringDrawings = Object.entries(measurements || {}).map(([id, m]) => {
        if (!m) return null;
        
        const handleDelete = onDeleteMeasurement ? () => {
            onDeleteMeasurement(id);
        } : undefined;

        if (m.type === 'freehand') {
            return <group key={id}>{renderFreehand(m.points, 1, handleDelete, getTerrainHeight, m.style)}</group>;
        }

        const start = new THREE.Vector3(m.start.x, m.start.y, m.start.z);
        const end = new THREE.Vector3(m.end.x, m.end.y, m.end.z);
        
        // Ensure legacy elements or static stamps also hug the terrain height
        if (getTerrainHeight) {
            start.y = getTerrainHeight(start.x, start.z) + 0.1;
            end.y = getTerrainHeight(end.x, end.z) + 0.1;
        }
        
        switch (m.type) {
            case 'circle': return <group key={id}>{renderCircle(start, end, 1, gridSize, handleDelete, m.style)}</group>;
            case 'cone': return <group key={id}>{renderCone(start, end, 1, gridSize, handleDelete, m.style)}</group>;
            case 'box': return <group key={id}>{renderBox(start, end, 1, gridSize, handleDelete, m.style)}</group>;
            default: return null;
        }
    });

    const isLingering = activeTool?.endsWith('-linger');
    const baseTool = activeTool ? activeTool.replace('-linger', '') : null;

    let activeToolElement = null;
    switch (baseTool) {
        case 'freehand': activeToolElement = <FreehandTool getTerrainHeight={getTerrainHeight} isLingering={isLingering} onSaveMeasurement={onSaveMeasurement} />; break;
        case 'ruler': activeToolElement = <RulerTool getTerrainHeight={getTerrainHeight} gridSize={gridSize} />; break;
        case 'circle': activeToolElement = <CircleTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} isLingering={isLingering} onSaveMeasurement={onSaveMeasurement} activeStyle={activeStyle} getTerrainHeight={getTerrainHeight} />; break;
        case 'cone': activeToolElement = <ConeTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} isLingering={isLingering} onSaveMeasurement={onSaveMeasurement} activeStyle={activeStyle} getTerrainHeight={getTerrainHeight} />; break;
        case 'box': activeToolElement = <BoxTool gridSize={gridSize} tokens={tokens} onCompleteSelection={onCompleteSelection} isLingering={isLingering} onSaveMeasurement={onSaveMeasurement} activeStyle={activeStyle} getTerrainHeight={getTerrainHeight} />; break;
    }

    return (
        <>
            {lingeringDrawings}
            {activeToolElement}
        </>
    );
};
