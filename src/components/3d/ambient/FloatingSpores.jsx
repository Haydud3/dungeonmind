import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const FloatingSpores = ({ count = 300, bounds = { x: 40, y: 8, z: 40 } }) => {
    const meshRef = useRef();

    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * bounds.x;
            const y = Math.random() * bounds.y;
            const z = (Math.random() - 0.5) * bounds.z;
            const speed = 0.02 + Math.random() * 0.03;
            const phase = Math.random() * Math.PI * 2;
            const color = new THREE.Color().setHSL(0.3 + Math.random() * 0.1, 0.8, 0.5); // Greenish/yellowish
            temp.push({ x, y, z, speed, phase, color });
        }
        return temp;
    }, [count, bounds]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colorArray = useMemo(() => {
        const array = new Float32Array(count * 3);
        particles.forEach((p, i) => {
            p.color.toArray(array, i * 3);
        });
        return array;
    }, [particles, count]);

    const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false }), []);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();

        particles.forEach((particle, i) => {
            let { x, y, z, speed, phase } = particle;

            y += Math.sin(time * speed + phase) * 0.01;
            x += Math.cos(time * speed + phase) * 0.02;
            z += Math.sin(time * speed * 0.8 + phase) * 0.02;

            if (x > bounds.x / 2) x = -bounds.x / 2;
            if (x < -bounds.x / 2) x = bounds.x / 2;
            if (z > bounds.z / 2) z = -bounds.z / 2;
            if (z < -bounds.z / 2) z = bounds.z / 2;

            particle.y = y;
            particle.x = x;
            particle.z = z;

            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, material, count]} renderOrder={1}>
            <sphereGeometry args={[0.04, 4, 4]} />
            <instancedBufferAttribute attach="instanceColor" args={[colorArray, 3]} />
        </instancedMesh>
    );
};
