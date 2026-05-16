import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVfxStore } from '../../../stores/useVfxStore';

let circleTexture = null;
function getCircleTexture() {
    if (circleTexture) return circleTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, 2 * Math.PI);
    
    // Glowing gradient
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 100, 0.8)');
    gradient.addColorStop(1, 'rgba(200, 255, 50, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fill();
    circleTexture = new THREE.CanvasTexture(canvas);
    return circleTexture;
}

const vertexShader = `
    uniform float uTime;
    uniform vec3 uWind;
    uniform vec3 uBounds;
    uniform float uMapScale;
    uniform vec3 uCameraPos;

    attribute float aSpeed;
    attribute float aPhase;
    attribute float aBlinkSpeed;

    varying float vAlpha;

    void main() {
        vec3 pos = position;
        
        // Erratic wandering
        pos.y += sin(uTime * aSpeed * 2.0 + aPhase) * 1.5;
        pos.x += cos(uTime * aSpeed * 1.5 + aPhase) * 1.5 + uWind.x * uTime * 0.2;
        pos.z += sin(uTime * aSpeed * 1.7 + aPhase) * 1.5 + uWind.z * uTime * 0.2;

        // Camera-centric modulo wrapping
        vec3 halfBounds = uBounds * 0.5;
        pos.x = mod(pos.x - uCameraPos.x + halfBounds.x, uBounds.x) - halfBounds.x + uCameraPos.x;
        pos.z = mod(pos.z - uCameraPos.z + halfBounds.z, uBounds.z) - halfBounds.z + uCameraPos.z;
        pos.y = mod(pos.y, uBounds.y);

        // Blinking logic
        vAlpha = (sin(uTime * aBlinkSpeed + aPhase) + 1.0) * 0.5;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 40.0 * ((400.0 / uMapScale) / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform sampler2D uMap;
    varying float vAlpha;

    void main() {
        vec4 texColor = texture2D(uMap, gl_PointCoord);
        if (texColor.a < 0.01) discard;
        
        gl_FragColor = vec4(texColor.rgb, texColor.a * vAlpha);
    }
`;

const DEFAULT_BOUNDS = { x: 40, y: 5, z: 40 };

export const Fireflies = ({ count = 50, bounds = DEFAULT_BOUNDS, mapScale = 20 }) => {
    const materialRef = useRef();
    const globalWind = useVfxStore(state => state.globalWind);

    const [positions, attributes] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const speed = new Float32Array(count);
        const phase = new Float32Array(count);
        const blinkSpeed = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            pos[i * 3 + 0] = (Math.random() - 0.5) * bounds.x;
            pos[i * 3 + 1] = Math.random() * bounds.y;
            pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z;
            
            speed[i] = 0.2 + Math.random() * 0.5;
            phase[i] = Math.random() * Math.PI * 2;
            blinkSpeed[i] = 2.0 + Math.random() * 3.0;
        }
        return [pos, { speed, phase, blinkSpeed }];
    }, [count, bounds]);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector3(globalWind.x, globalWind.y, globalWind.z) },
        uBounds: { value: new THREE.Vector3(bounds.x, bounds.y, bounds.z) },
        uMap: { value: getCircleTexture() },
        uMapScale: { value: mapScale }
    }), [bounds, mapScale]);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            materialRef.current.uniforms.uWind.value.set(globalWind.x, globalWind.y, globalWind.z);
        }
    });

    return (
        <points renderOrder={2} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aSpeed" count={count} array={attributes.speed} itemSize={1} />
                <bufferAttribute attach="attributes-aPhase" count={count} array={attributes.phase} itemSize={1} />
                <bufferAttribute attach="attributes-aBlinkSpeed" count={count} array={attributes.blinkSpeed} itemSize={1} />
            </bufferGeometry>
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
};