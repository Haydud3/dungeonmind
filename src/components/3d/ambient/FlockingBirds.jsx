import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const FlockingBirds = ({ count = 50, bounds = { x: 100, y: 10, z: 100 }, altitude = 25, color = '#111111', speed = 1.0, scale = 1.0 }) => {
    const meshRef = useRef();

    // Boids setup
    const boids = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            temp.push({
                position: new THREE.Vector3(
                    (Math.random() - 0.5) * bounds.x,
                    (Math.random() - 0.5) * bounds.y + altitude,
                    (Math.random() - 0.5) * bounds.z
                ),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 2
                ).normalize().multiplyScalar(0.1 + Math.random() * 0.05),
                acceleration: new THREE.Vector3()
            });
        }
        return temp;
    }, [count, bounds, altitude]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const material = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }), [color]);

    useFrame((state) => {
        if (!meshRef.current) return;
        
        // Very basic boids flocking parameters
        const maxSpeed = 0.2 * speed;
        const maxForce = 0.01 * speed;
        const neighborDist = 10;
        const desiredSeparation = 3;

        for (let i = 0; i < count; i++) {
            const boid = boids[i];
            
            // Forces
            const separation = new THREE.Vector3();
            const alignment = new THREE.Vector3();
            const cohesion = new THREE.Vector3();
            let neighborCount = 0;
            let sepCount = 0;

            for (let j = 0; j < count; j++) {
                if (i === j) continue;
                const other = boids[j];
                const d = boid.position.distanceTo(other.position);

                if (d > 0 && d < neighborDist) {
                    alignment.add(other.velocity);
                    cohesion.add(other.position);
                    neighborCount++;

                    if (d < desiredSeparation) {
                        const diff = boid.position.clone().sub(other.position);
                        diff.normalize().divideScalar(d);
                        separation.add(diff);
                        sepCount++;
                    }
                }
            }

            if (neighborCount > 0) {
                alignment.divideScalar(neighborCount).normalize().multiplyScalar(maxSpeed).sub(boid.velocity).clampLength(0, maxForce);
                cohesion.divideScalar(neighborCount).sub(boid.position).normalize().multiplyScalar(maxSpeed).sub(boid.velocity).clampLength(0, maxForce);
            }
            if (sepCount > 0) {
                separation.divideScalar(sepCount).normalize().multiplyScalar(maxSpeed).sub(boid.velocity).clampLength(0, maxForce * 1.5);
            }

            boid.acceleration.add(separation);
            boid.acceleration.add(alignment);
            boid.acceleration.add(cohesion);

            // Boundary avoidance
            if (Math.abs(boid.position.x) > bounds.x / 2) boid.acceleration.x -= Math.sign(boid.position.x) * 0.05;
            if (Math.abs(boid.position.z) > bounds.z / 2) boid.acceleration.z -= Math.sign(boid.position.z) * 0.05;
            if (boid.position.y > altitude + bounds.y / 2) boid.acceleration.y -= 0.02 * speed;
            if (boid.position.y < altitude - bounds.y / 2) boid.acceleration.y += 0.02 * speed;

            // Update physics
            boid.velocity.add(boid.acceleration).clampLength(0, maxSpeed);
            boid.position.add(boid.velocity);
            boid.acceleration.set(0,0,0);

            // Update instance
            dummy.position.copy(boid.position);
            dummy.scale.set(scale, scale, scale);
            
            // Orient bird in direction of movement
            const target = boid.position.clone().add(boid.velocity);
            dummy.lookAt(target);
            // Since it's a cone, we rotate it so the point faces forward. Cone point is +Y, lookAt aims +Z
            dummy.rotateX(Math.PI / 2); 

            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, material, count]} castShadow>
            <coneGeometry args={[0.2, 0.6, 4]} />
        </instancedMesh>
    );
};
