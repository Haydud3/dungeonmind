import React, { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

export const Rain = ({ viewMode, mapScale, aspect }) => {
    const ref = useRef();
    const { camera } = useThree();
    const count = 3000;

    const [positions, velocities] = useMemo(() => {
        const pos = new Float32Array(count * 2 * 3); // 2 points per line
        const vel = new Float32Array(count * 2 * 3);
        const areaScale = 2.5;
        const mapWidth = mapScale * aspect * areaScale;
        const mapHeight = mapScale * areaScale;

        for (let i = 0; i < count; i++) {
            const i6 = i * 6;
            const x = (Math.random() - 0.5) * mapWidth;
            const y = Math.random() * 20 + 10;
            const z = (Math.random() - 0.5) * mapHeight;
            
            pos[i6 + 0] = x;
            pos[i6 + 1] = y;
            pos[i6 + 2] = z;

            const streakLength = viewMode === 'isometric' ? 1.0 : 0.2;
            pos[i6 + 3] = x;
            pos[i6 + 4] = y - streakLength;
            pos[i6 + 5] = z;

            const fallSpeed = viewMode === 'isometric' 
                ? -Math.random() * 20 - 15 
                : -Math.random() * 40 - 30; // Faster for top-down to look like quick splashes
            vel[i6 + 1] = fallSpeed;
            vel[i6 + 4] = fallSpeed;
        }
        return [pos, vel];
    }, [viewMode, mapScale, aspect]);

    useFrame((state, delta) => {
        if (ref.current) {
            const positions = ref.current.geometry.attributes.position.array;
            const velocities = ref.current.geometry.attributes.velocity.array;
            const areaScale = 2.5;
            const mapWidth = mapScale * aspect * areaScale;
            const mapHeight = mapScale * areaScale;

            for (let i = 0; i < count; i++) {
                const i6 = i * 6;
                positions[i6 + 1] += velocities[i6 + 1] * delta;
                positions[i6 + 4] += velocities[i6 + 4] * delta;

                if (positions[i6 + 1] < 0) {
                    const newX = (Math.random() - 0.5) * mapWidth + camera.position.x;
                    const newY = camera.position.y + 10 + Math.random() * 10;
                    const newZ = (Math.random() - 0.5) * mapHeight + camera.position.z;
                    const streakLength = viewMode === 'isometric' ? 1.0 : 0.2;

                    positions[i6 + 0] = newX;
                    positions[i6 + 1] = newY;
                    positions[i6 + 2] = newZ;
                    positions[i6 + 3] = newX;
                    positions[i6 + 4] = newY - streakLength;
                    positions[i6 + 5] = newZ;
                }
            }
            ref.current.geometry.attributes.position.needsUpdate = true;
        }
    });

    return (
        <lineSegments ref={ref} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-velocity" count={velocities.length / 3} array={velocities} itemSize={3} />
            </bufferGeometry>
            <lineBasicMaterial color="#a0b0c0" transparent opacity={0.4} depthWrite={false} />
        </lineSegments>
    );
};