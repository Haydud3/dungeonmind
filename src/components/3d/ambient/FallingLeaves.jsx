import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const FallingLeaves = ({ count = 1000, bounds = { x: 50, y: 20, z: 50 } }) => {
    const meshRef = useRef();

    const leaves = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const color = new THREE.Color();
            // Varied autumn/green hex codes
            const r = Math.random();
            if (r < 0.3) color.setHex(0xd4a017); // Autumn yellow
            else if (r < 0.6) color.setHex(0xb22222); // Red/brown
            else if (r < 0.8) color.setHex(0x8f9779); // Faded green
            else color.setHex(0x556b2f); // Dark green

            temp.push({
                x: (Math.random() - 0.5) * bounds.x,
                y: Math.random() * bounds.y,
                z: (Math.random() - 0.5) * bounds.z,
                rotX: Math.random() * Math.PI,
                rotY: Math.random() * Math.PI,
                rotZ: Math.random() * Math.PI,
                speedY: 0.02 + Math.random() * 0.03,
                speedX: 0.01 + Math.random() * 0.04,
                speedZ: (Math.random() - 0.5) * 0.02,
                color: color
            });
        }
        return temp;
    }, [count, bounds]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colorArray = useMemo(() => {
        const array = new Float32Array(count * 3);
        leaves.forEach((l, i) => {
            l.color.toArray(array, i * 3);
        });
        return array;
    }, [leaves, count]);

    const material = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), []);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();

        leaves.forEach((leaf, i) => {
            leaf.y -= leaf.speedY;
            leaf.x += leaf.speedX + Math.sin(time + i) * 0.01;
            leaf.z += leaf.speedZ + Math.cos(time + i) * 0.01;

            leaf.rotX += 0.05;
            leaf.rotY += Math.random() * 0.1;
            leaf.rotZ += 0.02;

            if (leaf.y < 0) {
                leaf.y = bounds.y;
                leaf.x = (Math.random() - 0.5) * bounds.x;
                leaf.z = (Math.random() - 0.5) * bounds.z;
            }

            if (leaf.x > bounds.x / 2) leaf.x = -bounds.x / 2;

            dummy.position.set(leaf.x, leaf.y, leaf.z);
            dummy.rotation.set(leaf.rotX, leaf.rotY, leaf.rotZ);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, material, count]} castShadow receiveShadow>
            <planeGeometry args={[0.15, 0.15]} />
            <instancedBufferAttribute attach="instanceColor" args={[colorArray, 3]} />
        </instancedMesh>
    );
};
