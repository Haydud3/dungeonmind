import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVfxStore } from '../../../stores/useVfxStore';

// We can use an InstancedMesh for tumbleweeds since there won't be many of them,
// and we want them to have 3D geometry (like an Icosahedron) rather than flat points.
const DEFAULT_BOUNDS = { x: 50, z: 50 };

export const Tumbleweeds = ({ count = 5, bounds = DEFAULT_BOUNDS }) => {
    const meshRef = useRef();
    const globalWind = useVfxStore(state => state.globalWind);

    const tumbleweeds = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            temp.push({
                x: (Math.random() - 0.5) * bounds.x,
                y: 0.5 + Math.random() * 0.2, // Rough radius
                z: (Math.random() - 0.5) * bounds.z,
                rotX: Math.random() * Math.PI,
                rotY: Math.random() * Math.PI,
                rotZ: Math.random() * Math.PI,
                scale: 0.3 + Math.random() * 0.4,
                speedMultiplier: 0.5 + Math.random() * 1.5,
                bouncePhase: Math.random() * Math.PI * 2
            });
        }
        return temp;
    }, [count, bounds]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const time = state.clock.elapsedTime;

        // Calculate a wind vector with slight turbulence
        const wx = globalWind.x + Math.sin(time) * 0.2;
        const wz = globalWind.z + Math.cos(time) * 0.2;
        const windSpeed = Math.sqrt(wx*wx + wz*wz);

        tumbleweeds.forEach((tw, i) => {
            // Move based on wind
            tw.x += wx * delta * 5.0 * tw.speedMultiplier;
            tw.z += wz * delta * 5.0 * tw.speedMultiplier;

            // Roll based on movement
            const rollSpeed = windSpeed * delta * 10.0 * tw.speedMultiplier;
            tw.rotX += rollSpeed * (wz > 0 ? 1 : -1);
            tw.rotZ -= rollSpeed * (wx > 0 ? 1 : -1);

            // Occasional bounce
            tw.y = tw.scale + Math.abs(Math.sin(time * 3.0 * tw.speedMultiplier + tw.bouncePhase)) * windSpeed * 0.5;

            // Wrap around bounds
            if (tw.x > bounds.x / 2) tw.x = -bounds.x / 2;
            if (tw.x < -bounds.x / 2) tw.x = bounds.x / 2;
            if (tw.z > bounds.z / 2) tw.z = -bounds.z / 2;
            if (tw.z < -bounds.z / 2) tw.z = bounds.z / 2;

            dummy.position.set(tw.x, tw.y, tw.z);
            dummy.rotation.set(tw.rotX, tw.rotY, tw.rotZ);
            dummy.scale.setScalar(tw.scale);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, null, count]} castShadow receiveShadow>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color="#8b7355" wireframe={true} roughness={0.9} />
        </instancedMesh>
    );
};