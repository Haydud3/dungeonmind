import React, { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

export const Rain = ({ viewMode, mapScale, aspect }) => {
    const ref = useRef();
    const { camera } = useThree();
    const count = 3000;

    const [positions, velocities] = useMemo(() => {
        const pos = new Float32Array(count * 2 * 3); // 2 points per line
        const vel = new Float32Array(count * 2 * 3);
        const areaScale = 3.5;
        const mapWidth = mapScale * aspect * areaScale;
        const mapHeight = mapScale * areaScale;
        const isTopDown = viewMode === 'top-down';

        for (let i = 0; i < count; i++) {
            const i6 = i * 6;
            const x = (Math.random() - 0.5) * mapWidth;
            const y = Math.random() * 20 + 10;
            const z = (Math.random() - 0.5) * mapHeight;
            
            pos[i6 + 0] = x;
            pos[i6 + 1] = y;
            pos[i6 + 2] = z;

            const streakY = isTopDown ? 0.2 : 1.0;
            const streakZ = isTopDown ? -1.5 : 0.1;
            const streakX = isTopDown ? -0.5 : 0.1;

            pos[i6 + 3] = x + streakX;
            pos[i6 + 4] = y + streakY;
            pos[i6 + 5] = z + streakZ;

            const fallSpeedY = isTopDown ? -15 : -Math.random() * 20 - 15;
            const fallSpeedZ = isTopDown ? Math.random() * 30 + 20 : 0;
            const fallSpeedX = isTopDown ? Math.random() * 10 + 5 : 0;

            vel[i6 + 0] = fallSpeedX;
            vel[i6 + 1] = fallSpeedY;
            vel[i6 + 2] = fallSpeedZ;
            
            vel[i6 + 3] = fallSpeedX;
            vel[i6 + 4] = fallSpeedY;
            vel[i6 + 5] = fallSpeedZ;
        }
        return [pos, vel];
    }, [viewMode, mapScale, aspect]);

    useFrame((state, delta) => {
        if (ref.current) {
            const positions = ref.current.geometry.attributes.position.array;
            const velocities = ref.current.geometry.attributes.velocity.array;
            const areaScale = 3.5;
            const mapWidth = mapScale * aspect * areaScale;
            const mapHeight = mapScale * areaScale;
            const isTopDown = viewMode === 'top-down';

            for (let i = 0; i < count; i++) {
                const i6 = i * 6;
                
                positions[i6 + 0] += velocities[i6 + 0] * delta;
                positions[i6 + 1] += velocities[i6 + 1] * delta;
                positions[i6 + 2] += velocities[i6 + 2] * delta;
                
                positions[i6 + 3] += velocities[i6 + 3] * delta;
                positions[i6 + 4] += velocities[i6 + 4] * delta;
                positions[i6 + 5] += velocities[i6 + 5] * delta;

                let isOutOfBounds = false;
                
                if (isTopDown) {
                    if (positions[i6 + 2] > camera.position.z + mapHeight / 2 || positions[i6 + 1] < 0) {
                        isOutOfBounds = true;
                    }
                } else {
                    if (positions[i6 + 1] < 0) {
                        isOutOfBounds = true;
                    }
                }

                if (isOutOfBounds) {
                    const newX = isTopDown 
                        ? (camera.position.x - mapWidth / 2 - Math.random() * 10) 
                        : ((Math.random() - 0.5) * mapWidth + camera.position.x);
                        
                    const newY = isTopDown 
                        ? (camera.position.y - 5 + Math.random() * 20) 
                        : (camera.position.y + 10 + Math.random() * 10);
                        
                    const newZ = isTopDown 
                        ? (camera.position.z - mapHeight / 2 - Math.random() * 10) 
                        : ((Math.random() - 0.5) * mapHeight + camera.position.z);
                    
                    const streakY = isTopDown ? 0.2 : 1.0;
                    const streakZ = isTopDown ? -1.5 : 0.1;
                    const streakX = isTopDown ? -0.5 : 0.1;

                    positions[i6 + 0] = newX;
                    positions[i6 + 1] = newY;
                    positions[i6 + 2] = newZ;
                    
                    positions[i6 + 3] = newX + streakX;
                    positions[i6 + 4] = newY + streakY;
                    positions[i6 + 5] = newZ + streakZ;
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