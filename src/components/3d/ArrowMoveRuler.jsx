import React, { useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import Icon from '../Icon';

/**
 * ArrowMoveRuler renders a live ruler between the original token position
 * and its current position when moving with arrow keys, including waypoints,
 * a starting ground marker, and a distance badge.
 */
export const ArrowMoveRuler = ({ measurement, onFadeComplete }) => {
    const [opacity, setOpacity] = useState(1);
    const isFading = measurement?.isFading;

    // Reset opacity whenever an active move updates
    useEffect(() => {
        if (!isFading) {
            setOpacity(1);
        }
    }, [isFading, measurement?.current]);

    useFrame((state, delta) => {
        if (isFading) {
            setOpacity(prev => {
                const next = prev - delta * 2.5;
                if (next <= 0) {
                    if (onFadeComplete) onFadeComplete();
                    return 0;
                }
                return next;
            });
        }
    });

    if (!measurement || !measurement.origin || !measurement.current || opacity <= 0) {
        return null;
    }

    const { origin, current, waypoints = [], straightFeet = 0, pathFeet = 0, tokenSize = 1, gridSize = 1 } = measurement;
    const tokenRadius = (tokenSize * (gridSize || 1)) / 2;

    // Path line points elevated slightly above terrain to prevent z-fighting
    const linePoints = waypoints.length >= 2
        ? waypoints.map(p => [p.x, (p.y || 0) + 0.08, p.z])
        : [
            [origin.x, (origin.y || 0) + 0.08, origin.z],
            [current.x, (current.y || 0) + 0.08, current.z]
          ];

    // Midpoint for the distance badge
    const midX = (origin.x + current.x) / 2;
    const midY = Math.max(origin.y || 0, current.y || 0) + 0.35;
    const midZ = (origin.z + current.z) / 2;

    const hasMoved = waypoints.length > 1 || straightFeet > 0 || pathFeet > 0;
    const hasTurned = straightFeet !== pathFeet && pathFeet > 0;

    return (
        <group renderOrder={150}>
            {/* Starting Location Ground Ring */}
            <group position={[origin.x, (origin.y || 0) + 0.04, origin.z]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[Math.max(0.2, tokenRadius * 0.65), Math.max(0.28, tokenRadius * 0.95), 32]} />
                    <meshBasicMaterial color="#f59e0b" transparent opacity={0.75 * opacity} depthTest={false} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[Math.max(0.08, tokenRadius * 0.25), 16]} />
                    <meshBasicMaterial color="#f59e0b" transparent opacity={0.45 * opacity} depthTest={false} />
                </mesh>
                <Html center distanceFactor={8} position={[0, 0.2, 0]} className="pointer-events-none select-none">
                    <div 
                        className="text-[9px] font-black uppercase tracking-wider text-amber-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-amber-500/60 shadow-lg whitespace-nowrap"
                        style={{ opacity }}
                    >
                        Start
                    </div>
                </Html>
            </group>

            {/* Path Trail: Solid amber line connecting waypoints */}
            {hasMoved && linePoints.length >= 2 && (
                <Line 
                    points={linePoints} 
                    color="#f59e0b" 
                    lineWidth={3.5} 
                    depthTest={false} 
                    transparent 
                    opacity={0.8 * opacity} 
                    renderOrder={150} 
                />
            )}

            {/* Direct Line-of-Sight dashed line when token turns a corner */}
            {hasTurned && (
                <Line 
                    points={[
                        [origin.x, (origin.y || 0) + 0.08, origin.z],
                        [current.x, (current.y || 0) + 0.08, current.z]
                    ]} 
                    color="#fbbf24" 
                    dashed 
                    dashScale={3} 
                    dashSize={0.4} 
                    gapSize={0.25} 
                    lineWidth={1.5} 
                    depthTest={false} 
                    transparent 
                    opacity={0.45 * opacity} 
                    renderOrder={149} 
                />
            )}

            {/* Floating Distance Badge at midpoint */}
            {hasMoved && (
                <Html position={[midX, midY, midZ]} center distanceFactor={8} className="pointer-events-none select-none z-[60]">
                    <div 
                        className="bg-slate-900/95 backdrop-blur-md text-amber-400 border border-amber-500/70 font-bold px-3 py-1 rounded-full text-xs shadow-2xl flex items-center gap-1.5 whitespace-nowrap animate-in zoom-in-95 duration-150"
                        style={{ opacity }}
                    >
                        <Icon name="ruler" size={13} className="text-amber-400" />
                        <span className="font-extrabold text-white text-xs">{straightFeet} ft</span>
                        {hasTurned && (
                            <span className="text-[10px] text-amber-200/90 font-medium">({pathFeet} ft path)</span>
                        )}
                    </div>
                </Html>
            )}
        </group>
    );
};

export default ArrowMoveRuler;

