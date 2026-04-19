import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const ConditionParticles = ({ conditions, size = 1 }) => {
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return null;
    
    const hasPoisoned = conditions.includes('Poisoned');
    const hasBlessed = conditions.some(c => c.includes('Bless'));
    const hasRaging = conditions.some(c => c.includes('Rage') || c.includes('Raging'));
    
    return (
        <group>
            {hasPoisoned && <PoisonParticles size={size} />}
            {hasBlessed && <BlessingAura size={size} />}
            {hasRaging && <RageParticles size={size} />}
        </group>
    );
};

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

const PoisonParticles = ({ size }) => {
    const ref = useRef();
    const count = 25;
    const [positions, velocities, phases] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 3);
        const ph = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * size * 0.45;
            pos[i * 3 + 0] = Math.cos(angle) * r;
            pos[i * 3 + 1] = Math.random() * size;
            pos[i * 3 + 2] = Math.sin(angle) * r;
            vel[i * 3 + 0] = 0;
            vel[i * 3 + 1] = Math.random() * 0.8 + 0.3; // Speed up
            vel[i * 3 + 2] = 0;
            ph[i] = Math.random() * Math.PI * 2;
        }
        return [pos, vel, ph];
    }, [size, count]);

    useFrame((state, delta) => {
        if (!ref.current) return;
        const posAttr = ref.current.geometry.attributes.position.array;
        const time = state.clock.elapsedTime;
        for (let i = 0; i < count; i++) {
            posAttr[i * 3 + 1] += velocities[i * 3 + 1] * delta;
            posAttr[i * 3 + 0] += Math.sin(time * 2 + phases[i]) * 0.2 * delta; // Wiggle
            posAttr[i * 3 + 2] += Math.cos(time * 2 + phases[i]) * 0.2 * delta;
            
            // Loop back to bottom
            if (posAttr[i * 3 + 1] > size * 1.5) {
                posAttr[i * 3 + 1] = 0;
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * size * 0.45;
                posAttr[i * 3 + 0] = Math.cos(angle) * r;
                posAttr[i * 3 + 2] = Math.sin(angle) * r;
            }
        }
        ref.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial 
                size={0.15 * size} 
                color="#22c55e" 
                transparent 
                opacity={0.7} 
                depthWrite={false} 
                map={getCircleTexture()} 
            />
        </points>
    );
};

const RageParticles = ({ size }) => {
    const ref = useRef();
    const count = 50;
    const [positions, velocities, colors] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * size * 0.55;
            pos[i * 3 + 0] = Math.cos(angle) * r;
            pos[i * 3 + 1] = Math.random() * size * 1.2;
            pos[i * 3 + 2] = Math.sin(angle) * r;
            
            // Move outward and upward
            vel[i * 3 + 0] = Math.cos(angle) * (Math.random() * 0.5);
            vel[i * 3 + 1] = Math.random() * 1.5 + 1.0;
            vel[i * 3 + 2] = Math.sin(angle) * (Math.random() * 0.5);
            
            // Fire colors: mostly orange/red, some yellow
            const heat = Math.random();
            col[i * 3 + 0] = 1.0; // Red
            col[i * 3 + 1] = heat * 0.5; // Green
            col[i * 3 + 2] = 0.0; // Blue
        }
        return [pos, vel, col];
    }, [size, count]);

    useFrame((state, delta) => {
        if (!ref.current) return;
        const posAttr = ref.current.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
            posAttr[i * 3 + 0] += velocities[i * 3 + 0] * delta;
            posAttr[i * 3 + 1] += velocities[i * 3 + 1] * delta;
            posAttr[i * 3 + 2] += velocities[i * 3 + 2] * delta;
            
            if (posAttr[i * 3 + 1] > size * 2) {
                posAttr[i * 3 + 1] = 0;
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * size * 0.4; // Restart closer to center
                posAttr[i * 3 + 0] = Math.cos(angle) * r;
                posAttr[i * 3 + 2] = Math.sin(angle) * r;
            }
        }
        ref.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial 
                size={0.25 * size} 
                vertexColors 
                transparent 
                opacity={0.8} 
                blending={THREE.AdditiveBlending} 
                depthWrite={false} 
                map={getCircleTexture()} 
            />
        </points>
    );
};

const BlessingAura = ({ size }) => {
    const ref = useRef();
    
    useFrame((state) => {
        if (ref.current) {
            const time = state.clock.elapsedTime;
            ref.current.rotation.y = time * 0.5;
            ref.current.position.y = 0.05 + Math.sin(time * 2) * 0.05;
            const pulse = 1 + Math.sin(time * 4) * 0.05;
            ref.current.scale.setScalar(pulse);
        }
    });

    return (
        <group ref={ref}>
            {/* Outer Ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <torusGeometry args={[size * 0.65, size * 0.03, 16, 64]} />
                <meshStandardMaterial 
                    color="#fef08a" 
                    emissive="#fef08a" 
                    emissiveIntensity={2} 
                    transparent 
                    opacity={0.8} 
                    blending={THREE.AdditiveBlending} 
                />
            </mesh>
            {/* Inner Ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <torusGeometry args={[size * 0.55, size * 0.015, 16, 64]} />
                <meshStandardMaterial 
                    color="#ffffff" 
                    emissive="#ffffff" 
                    emissiveIntensity={3} 
                    transparent 
                    opacity={0.9} 
                    blending={THREE.AdditiveBlending} 
                />
            </mesh>
        </group>
    );
};