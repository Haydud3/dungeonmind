import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useVfxStore } from '../../stores/useVfxStore';
import * as THREE from 'three';

const VFX_SHADERS = {
    fire: { color: new THREE.Color('#ff4400'), noiseScale: 5.0, speed: 2.0 },
    frost: { color: new THREE.Color('#00ffff'), noiseScale: 3.0, speed: 1.0 },
    acid: { color: new THREE.Color('#88ff00'), noiseScale: 4.0, speed: 1.5 },
    death: { color: new THREE.Color('#440088'), noiseScale: 6.0, speed: 0.5 },
    magic: { color: new THREE.Color('#ff00ff'), noiseScale: 2.0, speed: 3.0 },
    gold: { color: new THREE.Color('#ffcc00'), noiseScale: 2.0, speed: 2.0 }
};

const VfxMaterial = ({ flavor, isPreview }) => {
    const settings = VFX_SHADERS[flavor] || VFX_SHADERS.magic;
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uColor: { value: settings.color },
        uNoiseScale: { value: settings.noiseScale },
        uOpacity: { value: isPreview ? 0.4 : 0.8 }
    }), [flavor, isPreview]);

    useFrame((state) => {
        uniforms.uTime.value = state.clock.getElapsedTime() * settings.speed;
    });

    return (
        <shaderMaterial
            transparent
            depthWrite={false}
            depthTest={false}
            uniforms={uniforms}
            vertexShader={`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `}
            fragmentShader={`
                uniform float uTime;
                uniform vec3 uColor;
                uniform float uNoiseScale;
                uniform float uOpacity;
                varying vec2 vUv;
                float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
                void main() {
                    float n = noise(vUv * uNoiseScale + uTime);
                    float alpha = uOpacity * (0.5 + 0.5 * sin(uTime + vUv.y * 10.0));
                    gl_FragColor = vec4(uColor, alpha * (1.0 - length(vUv - 0.5) * 2.0));
                }
            `}
        />
    );
};

const Breath = ({ origin, target, flavor, isPreview }) => {
    // Negate Y for Three.js Y-Up space
    const angle = Math.atan2(-(target.y - origin.y), target.x - origin.x);
    const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
    return (
        <mesh position={[origin.x, -origin.y, 0]} rotation={[0, 0, angle - Math.PI / 6]}>
            <ringGeometry args={[0, dist, 32, 1, 0, Math.PI / 3]} />
            <VfxMaterial flavor={flavor} isPreview={isPreview} />
        </mesh>
    );
};

const Beam = ({ origin, target, flavor, isPreview }) => {
    const angle = Math.atan2(-(target.y - origin.y), target.x - origin.x);
    const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
    
    // FIX: Ensure midpoint logic aligns with Three.js coordinate space
    const midX = origin.x + (target.x - origin.x) / 2;
    // NOTE: Y is negated for Three.js, so we calculate the mid of the NEGATED values
    const midY = (-origin.y + (-target.y)) / 2;

    return (
        <mesh position={[midX, midY, 0]} rotation={[0, 0, angle]}>
            <planeGeometry args={[dist, 20]} />
            <VfxMaterial flavor={flavor} isPreview={isPreview} />
        </mesh>
    );
};

const Rocket = ({ origin, target, flavor, isPreview, startTime, duration }) => {
    const meshRef = useRef();
    const addEffect = useVfxStore(state => state.addEffect);
    const hasExploded = useRef(false);
    const angle = Math.atan2(-(target.y - origin.y), target.x - origin.x);

    useFrame(() => {
        if (isPreview || !meshRef.current) return;
        const t = Math.min((Date.now() - startTime) / duration, 1);
        meshRef.current.position.set(
            origin.x + (target.x - origin.x) * t, 
            -(origin.y + (target.y - origin.y) * t), 
            0
        );

        if (t >= 1 && !hasExploded.current) {
            hasExploded.current = true;
            addEffect({ behavior: 'aura', flavor, origin: target, duration: 800 });
        }
    });
    return (
        <mesh ref={meshRef} position={[origin.x, -origin.y, 0]} rotation={[0, 0, angle]}>
            <sphereGeometry args={[10, 16, 16]} />
            <VfxMaterial flavor={flavor} isPreview={isPreview} />
        </mesh>
    );
};

const Aura = ({ origin, flavor, isPreview }) => (
    <mesh position={[origin.x, -origin.y, 0]}>
        <circleGeometry args={[50, 32]} />
        <VfxMaterial flavor={flavor} isPreview={isPreview} />
    </mesh>
);

const Effect = (props) => {
    switch (props.behavior) {
        case 'breath': return <Breath {...props} />;
        case 'beam': return <Beam {...props} />;
        case 'rocket': return <Rocket {...props} />;
        case 'aura': return <Aura {...props} />;
        default: return null;
    }
};

export default function VfxOverlay({ width, height }) {
    const activeEffects = useVfxStore(state => state.activeEffects);
    const targetingPreview = useVfxStore(state => state.targetingPreview);
    if (!width || !height || width <= 0 || height <= 0) return null;
    return (
        <div className="absolute top-0 left-0 pointer-events-none z-[15]" style={{ width: `${width}px`, height: `${height}px` }}>
            <Canvas
                key={`${width}-${height}`} // Force re-mount to update camera frustum when map size changes
                orthographic
                camera={{
                    left: 0, right: width,
                    top: 0, bottom: -height,
                    near: -100, far: 100,
                    position: [0, 0, 10]
                }}
                gl={{ alpha: true }}
                style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
            >
                {activeEffects.map(effect => <Effect key={effect.id} {...effect} />)}
                {targetingPreview && <Effect {...targetingPreview} isPreview />}
            </Canvas>
        </div>
    );
}