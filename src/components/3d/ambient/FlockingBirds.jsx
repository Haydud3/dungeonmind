import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const FlockingBirds = ({ count = 50, mapScale = 20, altitude = 25, color = '#111111', speed = 1.0, scale = 1.0 }) => {
    const meshRef = useRef();
    const { camera } = useThree();

    const actualBoundsX = mapScale * 3.5;
    const actualBoundsZ = mapScale * 3.5;
    const actualBoundsY = 15;

    // Boids setup
    const boids = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            temp.push({
                position: new THREE.Vector3(
                    (Math.random() - 0.5) * actualBoundsX,
                    (Math.random() - 0.5) * actualBoundsY + altitude,
                    (Math.random() - 0.5) * actualBoundsZ
                ),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 2
                ).normalize().multiplyScalar(0.1 + Math.random() * 0.05),
                acceleration: new THREE.Vector3(),
                speedMultiplier: 0.8 + Math.random() * 0.4,
                noisePhase: Math.random() * Math.PI * 2
            });
        }
        return temp;
    }, [count, actualBoundsX, actualBoundsZ, actualBoundsY, altitude]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const material = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false }), [color]);

    useFrame((state) => {
        if (!meshRef.current) return;
        
        for (let i = 0; i < count; i++) {
            const boid = boids[i];
            
            // Per-bird varied parameters
            const maxSpeed = 0.2 * speed * boid.speedMultiplier;
            const maxForce = 0.01 * speed;
            const neighborDist = 10;
            const desiredSeparation = 3;

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

            // Add subtle noise/wander to break up perfect lines
            const time = state.clock.elapsedTime;
            const wander = new THREE.Vector3(
                Math.sin(time * 2.0 + boid.noisePhase),
                Math.cos(time * 1.5 + boid.noisePhase) * 0.5,
                Math.sin(time * 2.2 + boid.noisePhase)
            ).multiplyScalar(maxForce * 0.3);

            // Camera avoidance
            const distToCam = boid.position.distanceTo(camera.position);
            if (distToCam < 15) {
                const avoidCam = boid.position.clone().sub(camera.position).normalize().multiplyScalar(maxForce * 6.0);
                boid.acceleration.add(avoidCam);
            }

            boid.acceleration.add(separation);
            boid.acceleration.add(alignment);
            boid.acceleration.add(cohesion);
            boid.acceleration.add(wander);

            // Boundary avoidance
            const halfBoundsX = actualBoundsX / 2;
            const halfBoundsZ = actualBoundsZ / 2;
            const halfBoundsY = actualBoundsY / 2;

            if (Math.abs(boid.position.x) > halfBoundsX) boid.acceleration.x -= Math.sign(boid.position.x) * 0.05 * speed;
            if (Math.abs(boid.position.z) > halfBoundsZ) boid.acceleration.z -= Math.sign(boid.position.z) * 0.05 * speed;
            if (boid.position.y > altitude + halfBoundsY) boid.acceleration.y -= 0.02 * speed;
            if (boid.position.y < altitude - halfBoundsY) boid.acceleration.y += 0.02 * speed;

            // Update physics
            boid.velocity.add(boid.acceleration).clampLength(0, maxSpeed);
            boid.position.add(boid.velocity);
            boid.acceleration.set(0,0,0);

            // Hard wrap bounds as a fallback if they fly off the map
            
            if (boid.position.x > halfBoundsX + 10) boid.position.x = -halfBoundsX;
            if (boid.position.x < -halfBoundsX - 10) boid.position.x = halfBoundsX;
            if (boid.position.z > halfBoundsZ + 10) boid.position.z = -halfBoundsZ;
            if (boid.position.z < -halfBoundsZ - 10) boid.position.z = halfBoundsZ;
            if (boid.position.y > altitude + halfBoundsY + 10) boid.position.y = altitude - halfBoundsY;
            if (boid.position.y < altitude - halfBoundsY - 10) boid.position.y = altitude + halfBoundsY;

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
