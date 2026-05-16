import React, { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { ENV_SETTINGS } from '../../constants/environment';
import * as THREE from 'three';

let circleTexture = null;
function getCircleTexture() {
    if (circleTexture) return circleTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, 2 * Math.PI);
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    circleTexture = new THREE.CanvasTexture(canvas);
    return circleTexture;
}

export const WeatherParticles = ({ environment, viewMode, mapScale, aspect, particleDensity = 1.0 }) => {
    const ref = useRef();
    const { camera } = useThree();
    
    const envSetting = ENV_SETTINGS[environment || 'day'] || ENV_SETTINGS.day;
    const particleType = envSetting.particles;
    
    const baseCount = particleType === 'rain' ? 1000 : particleType === 'snow' ? 500 : particleType === 'ash' ? 200 : particleType === 'spores' ? 100 : 0;
    const count = Math.max(0, Math.floor(baseCount * particleDensity * 0.4));

    const [positions, velocities, colors, sizes] = useMemo(() => {
        if (!count) return [new Float32Array(), new Float32Array(), new Float32Array(), new Float32Array()];
        
        const isLine = particleType === 'rain';
        const numPoints = isLine ? count * 2 : count;
        
        const pos = new Float32Array(numPoints * 3);
        const vel = new Float32Array(numPoints * 3);
        const col = new Float32Array(numPoints * 3);
        const sizeArr = new Float32Array(numPoints);
        
        const areaScale = 3.5;
        const mapWidth = mapScale * aspect * areaScale;
        const mapHeight = mapScale * areaScale;
        const isTopDown = viewMode === 'top-down';

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * mapWidth;
            const y = Math.random() * 20 + 10;
            const z = (Math.random() - 0.5) * mapHeight;
            
            if (isLine) {
                const i6 = i * 6;
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
            } else {
                const i3 = i * 3;
                pos[i3 + 0] = x;
                pos[i3 + 1] = y;
                pos[i3 + 2] = z;

                if (particleType === 'snow') {
                    vel[i3 + 0] = (Math.random() - 0.5) * 2;
                    vel[i3 + 1] = -Math.random() * 3 - 2;
                    vel[i3 + 2] = (Math.random() - 0.5) * 2;
                    col[i3 + 0] = 1.0; col[i3 + 1] = 1.0; col[i3 + 2] = 1.0;
                    sizeArr[i] = Math.random() * 0.1 + 0.05;
                } else if (particleType === 'ash') {
                    vel[i3 + 0] = (Math.random() - 0.5) * 3;
                    vel[i3 + 1] = Math.random() * 2 + 1;
                    vel[i3 + 2] = (Math.random() - 0.5) * 3;
                    col[i3 + 0] = 0.4; col[i3 + 1] = 0.4; col[i3 + 2] = 0.4;
                    sizeArr[i] = Math.random() * 0.15 + 0.05;
                } else if (particleType === 'spores') {
                    vel[i3 + 0] = (Math.random() - 0.5) * 1;
                    vel[i3 + 1] = (Math.random() - 0.5) * 1;
                    vel[i3 + 2] = (Math.random() - 0.5) * 1;
                    const brightness = Math.random() * 0.5 + 0.5;
                    col[i3 + 0] = brightness * 0.5; col[i3 + 1] = brightness; col[i3 + 2] = brightness * 0.7;
                    sizeArr[i] = Math.random() * 0.2 + 0.1;
                }
            }
        }
        return [pos, vel, col, sizeArr];
    }, [particleType, viewMode, mapScale, aspect, count]);

    useFrame((state, delta) => {
        if (ref.current && count > 0) {
            const positions = ref.current.geometry.attributes.position.array;
            const velocities = ref.current.geometry.attributes.velocity ? ref.current.geometry.attributes.velocity.array : null;
            const areaScale = 3.5;
            const mapWidth = mapScale * aspect * areaScale;
            const mapHeight = mapScale * areaScale;
            const isTopDown = viewMode === 'top-down';
            const isLine = particleType === 'rain';

            for (let i = 0; i < count; i++) {
                if (isLine) {
                    const i6 = i * 6;
                    positions[i6 + 0] += velocities[i6 + 0] * delta;
                    positions[i6 + 1] += velocities[i6 + 1] * delta;
                    positions[i6 + 2] += velocities[i6 + 2] * delta;
                    
                    positions[i6 + 3] += velocities[i6 + 3] * delta;
                    positions[i6 + 4] += velocities[i6 + 4] * delta;
                    positions[i6 + 5] += velocities[i6 + 5] * delta;

                    let isOutOfBounds = false;
                    if (isTopDown) {
                        if (positions[i6 + 2] > camera.position.z + mapHeight / 2 || positions[i6 + 1] < 0) isOutOfBounds = true;
                    } else {
                        if (positions[i6 + 1] < 0) isOutOfBounds = true;
                    }

                    if (isOutOfBounds) {
                        const newX = isTopDown ? (camera.position.x - mapWidth / 2 - Math.random() * 10) : ((Math.random() - 0.5) * mapWidth + camera.position.x);
                        const newY = isTopDown ? (camera.position.y - 5 + Math.random() * 20) : (camera.position.y + 10 + Math.random() * 10);
                        const newZ = isTopDown ? (camera.position.z - mapHeight / 2 - Math.random() * 10) : ((Math.random() - 0.5) * mapHeight + camera.position.z);
                        
                        const streakY = isTopDown ? 0.2 : 1.0;
                        const streakZ = isTopDown ? -1.5 : 0.1;
                        const streakX = isTopDown ? -0.5 : 0.1;

                        positions[i6 + 0] = newX; positions[i6 + 1] = newY; positions[i6 + 2] = newZ;
                        positions[i6 + 3] = newX + streakX; positions[i6 + 4] = newY + streakY; positions[i6 + 5] = newZ + streakZ;
                    }
                } else {
                    const i3 = i * 3;
                    const time = state.clock.elapsedTime;
                    
                    if (particleType === 'snow') {
                        positions[i3 + 0] += (velocities[i3 + 0] + Math.sin(time + i) * 0.5) * delta;
                        positions[i3 + 1] += velocities[i3 + 1] * delta;
                        positions[i3 + 2] += (velocities[i3 + 2] + Math.cos(time + i) * 0.5) * delta;
                    } else if (particleType === 'ash') {
                        positions[i3 + 0] += (velocities[i3 + 0] + Math.sin(time * 2 + i) * 1) * delta;
                        positions[i3 + 1] += velocities[i3 + 1] * delta;
                        positions[i3 + 2] += (velocities[i3 + 2] + Math.cos(time * 2 + i) * 1) * delta;
                    } else if (particleType === 'spores') {
                        positions[i3 + 0] += (velocities[i3 + 0] + Math.sin(time * 0.5 + i)) * delta;
                        positions[i3 + 1] += (velocities[i3 + 1] + Math.cos(time * 0.3 + i)) * delta;
                        positions[i3 + 2] += (velocities[i3 + 2] + Math.sin(time * 0.7 + i)) * delta;
                    }

                    if (positions[i3 + 1] < -5 || positions[i3 + 1] > 30 || Math.abs(positions[i3 + 0] - camera.position.x) > mapWidth/2 || Math.abs(positions[i3 + 2] - camera.position.z) > mapHeight/2) {
                        positions[i3 + 0] = ((Math.random() - 0.5) * mapWidth + camera.position.x);
                        positions[i3 + 1] = particleType === 'ash' ? -2 : (Math.random() * 20 + 5);
                        positions[i3 + 2] = ((Math.random() - 0.5) * mapHeight + camera.position.z);
                    }
                }
            }
            ref.current.geometry.attributes.position.needsUpdate = true;
        }
    });

    if (count === 0) return null;

    if (particleType === 'rain') {
        return (
            <lineSegments key={particleType} ref={ref} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-velocity" count={velocities.length / 3} array={velocities} itemSize={3} />
                </bufferGeometry>
                <lineBasicMaterial color="#a0b0c0" transparent opacity={0.4} depthWrite={false} />
            </lineSegments>
        );
    } else {
        return (
            <points key={particleType} ref={ref} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-velocity" count={velocities.length / 3} array={velocities} itemSize={3} />
                    <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial 
                    size={0.3} 
                    vertexColors 
                    transparent 
                    opacity={particleType === 'spores' ? 0.8 : 0.6} 
                    depthWrite={false} 
                    sizeAttenuation 
                    map={getCircleTexture()}
                />
            </points>
        );
    }
};