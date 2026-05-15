import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const DustMotes = ({ count = 500, bounds = { x: 40, y: 10, z: 40 }, speed = 1.0, opacity = 0.15, color = "#ffffff", size = 1.0, horizontal = false, altitude = 0 }) => {
    const meshRef = useRef();

    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * bounds.x;
            const y = Math.random() * bounds.y + altitude;
            const z = (Math.random() - 0.5) * bounds.z;
            const baseSpeed = 0.05 + Math.random() * 0.05;
            const phase = Math.random() * Math.PI * 2;
            temp.push({ x, y, z, baseSpeed, phase });
        }
        return temp;
    }, [count, bounds, altitude]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const material = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: opacity, depthWrite: false }), [color, opacity]);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();

        particles.forEach((particle, i) => {
            let { x, y, z, baseSpeed, phase } = particle;

            if (horizontal) {
                // Fast horizontal movement for sand/salt spray
                x += baseSpeed * speed;
                y += Math.sin(time * baseSpeed + phase) * 0.01 * speed;
                z += Math.cos(time * baseSpeed + phase) * 0.01 * speed;
                
                if (x > bounds.x / 2) x = -bounds.x / 2;
            } else {
                // Drift slowly upwards and wobble
                y += baseSpeed * 0.05 * speed;
                x += Math.sin(time * baseSpeed + phase) * 0.01 * speed;
                z += Math.cos(time * baseSpeed + phase) * 0.01 * speed;

                if (y > bounds.y + altitude) {
                    y = altitude; // Reset to bottom
                }
            }

            particle.y = y;
            particle.x = x;
            particle.z = z;

            dummy.position.set(x, y, z);
            
            // If vertical, smaller size based on height to simulate fading out roughly
            const s = horizontal ? size : Math.max(0.1, 1 - ((y - altitude) / bounds.y)) * size;
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, material, count]} renderOrder={1}>
            <boxGeometry args={[0.05 * size, 0.05 * size, 0.05 * size]} />
        </instancedMesh>
    );
};
