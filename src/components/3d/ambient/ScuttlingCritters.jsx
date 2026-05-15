import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const ScuttlingCritters = ({ count = 5, mapBounds = 30 }) => {
    const meshRef = useRef();

    // Spline paths for critters
    const critters = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            // Generate a random simple path along the edges or across
            const startPt = new THREE.Vector3((Math.random() - 0.5) * mapBounds, 0.1, (Math.random() - 0.5) * mapBounds);
            const midPt = new THREE.Vector3(startPt.x + (Math.random() - 0.5) * 5, 0.1, startPt.z + (Math.random() - 0.5) * 5);
            const endPt = new THREE.Vector3(midPt.x + (Math.random() - 0.5) * 5, 0.1, midPt.z + (Math.random() - 0.5) * 5);
            
            const curve = new THREE.QuadraticBezierCurve3(startPt, midPt, endPt);
            
            temp.push({
                curve,
                t: 0,
                speed: 0.01 + Math.random() * 0.02,
                waiting: Math.random() * 5, // Wait time in seconds
                visible: false
            });
        }
        return temp;
    }, [count, mapBounds]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const material = useMemo(() => new THREE.MeshLambertMaterial({ color: 0x222222 }), []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        critters.forEach((critter, i) => {
            if (critter.waiting > 0) {
                critter.waiting -= delta;
                if (critter.waiting <= 0) {
                    critter.visible = true;
                    critter.t = 0;
                    
                    // Generate new path
                    const startPt = new THREE.Vector3((Math.random() - 0.5) * mapBounds, 0.1, (Math.random() - 0.5) * mapBounds);
                    const midPt = new THREE.Vector3(startPt.x + (Math.random() - 0.5) * 5, 0.1, startPt.z + (Math.random() - 0.5) * 5);
                    const endPt = new THREE.Vector3(midPt.x + (Math.random() - 0.5) * 5, 0.1, midPt.z + (Math.random() - 0.5) * 5);
                    critter.curve = new THREE.QuadraticBezierCurve3(startPt, midPt, endPt);
                }
            } else {
                critter.t += critter.speed;
                if (critter.t >= 1) {
                    critter.visible = false;
                    critter.waiting = 5 + Math.random() * 10;
                }
            }

            if (critter.visible) {
                const pos = critter.curve.getPoint(critter.t);
                dummy.position.copy(pos);
                
                // Point in direction of movement
                if (critter.t + 0.01 <= 1) {
                    const nextPos = critter.curve.getPoint(critter.t + 0.01);
                    dummy.lookAt(nextPos);
                }
                
                dummy.scale.set(1, 1, 1);
            } else {
                dummy.scale.set(0, 0, 0); // Hide
            }

            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, material, count]} castShadow>
            <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
        </instancedMesh>
    );
};
