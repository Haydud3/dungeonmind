import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
uniform float time;

// Simple 2D noise function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}

void main() {
    // Scroll the UVs to simulate wind
    vec2 uv = vUv * 3.0; // Scale of clouds
    uv.x += time * 0.01;
    uv.y += time * 0.005;

    float n = fbm(uv);
    
    // Threshold to create distinct cloud shapes
    float alpha = smoothstep(0.4, 0.6, n);
    
    // We only want to cast shadows, so we discard fragments that aren't "cloud"
    if (alpha < 0.5) discard;
    
    // The color doesn't matter much for a shadow caster, but we set it to white
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`;

export const CloudShadows = ({ bounds = 100, height = 30 }) => {
    const materialRef = useRef();

    const uniforms = useMemo(() => ({
        time: { value: 0 }
    }), []);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.time.value = state.clock.elapsedTime;
        }
    });

    return (
        <mesh position={[0, height, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow={false}>
            <planeGeometry args={[bounds, bounds]} />
            <shaderMaterial 
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                depthWrite={false}
                colorWrite={false} // Don't render the plane itself, just cast shadow
            />
        </mesh>
    );
};
