import React, { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { updateMap } from '../../utils/mapService';

const PingEffect = ({ ping }) => {
    const meshRef = useRef();
    const materialRef = useRef();
    const materialRef2 = useRef();
    
    useFrame((state, delta) => {
        if (!meshRef.current || !materialRef.current || !materialRef2.current) return;
        
        // Scale up the rings quickly
        meshRef.current.scale.x += delta * 8;
        meshRef.current.scale.y += delta * 8;
        meshRef.current.scale.z += delta * 8;
        
        // Fade out
        materialRef.current.opacity = Math.max(0, materialRef.current.opacity - delta * 1.5);
        materialRef2.current.opacity = Math.max(0, materialRef2.current.opacity - delta * 2.0);
    });

    return (
        <group position={[ping.x, ping.y + 0.1, ping.z]}>
            <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.8, 1.0, 64]} />
                <meshBasicMaterial 
                    ref={materialRef} 
                    color={ping.color || "#ef4444"} 
                    transparent 
                    opacity={1} 
                    depthTest={false} 
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.5, 64]} />
                <meshBasicMaterial 
                    ref={materialRef2}
                    color={ping.color || "#ef4444"} 
                    transparent 
                    opacity={0.8} 
                    depthTest={false} 
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </group>
    );
};

export const MapPings = ({ pings = {}, campaignCode, activeMapId, getTerrainHeight, userColor = "#ef4444" }) => {
    const { gl, camera, raycaster } = useThree();
    
    // We only render active pings (ones created in the last 3 seconds)
    const now = Date.now();
    const activePings = Object.values(pings).filter(p => p && (now - p.createdAt < 3000));
    
    // Cleanup old pings periodically
    useEffect(() => {
        const interval = setInterval(() => {
            const currentNow = Date.now();
            const updates = {};
            let hasUpdates = false;
            
            Object.entries(pings).forEach(([id, p]) => {
                if (p && (currentNow - p.createdAt > 3500)) {
                    updates[`pings.${id}`] = null;
                    hasUpdates = true;
                }
            });
            
            if (hasUpdates && campaignCode && activeMapId) {
                updateMap(campaignCode, activeMapId, updates).catch(console.error);
            }
        }, 2000);
        
        return () => clearInterval(interval);
    }, [pings, campaignCode, activeMapId]);

    useEffect(() => {
        const handlePointerDown = (e) => {
            if (e.altKey && e.button === 0) {
                // Prevent default browser behavior
                e.preventDefault();
                e.stopPropagation();
                // If possible, stop R3F from seeing this click to avoid selecting tokens or drawing walls
                e.stopImmediatePropagation();

                const rect = gl.domElement.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                
                raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                const target = new THREE.Vector3();
                raycaster.ray.intersectPlane(plane, target);
                
                if (target) {
                    const terrainY = getTerrainHeight ? getTerrainHeight(target.x, target.z) : 0;
                    
                    const pingId = `ping_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    const pingData = {
                        id: pingId,
                        x: target.x,
                        y: terrainY,
                        z: target.z,
                        color: userColor,
                        createdAt: Date.now()
                    };
                    
                    if (campaignCode && activeMapId) {
                        updateMap(campaignCode, activeMapId, { [`pings.${pingId}`]: pingData }).catch(console.error);
                    }
                }
            }
        };

        // Use capture phase to intercept the event before R3F synthetic events
        const canvas = gl.domElement;
        canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
        return () => canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    }, [gl, camera, raycaster, campaignCode, activeMapId, getTerrainHeight, userColor]);

    return (
        <group>
            {activePings.map(ping => (
                <PingEffect key={ping.id} ping={ping} />
            ))}
        </group>
    );
};
