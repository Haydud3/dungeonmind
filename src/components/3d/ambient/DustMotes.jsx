import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVfxStore } from '../../../stores/useVfxStore';

let circleTexture = null;
function getCircleTexture() {
    if (circleTexture) return circleTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
    circleTexture = new THREE.CanvasTexture(canvas);
    return circleTexture;
}

const vertexShader = `
    uniform float uTime;
    uniform vec3 uWind;
    uniform vec3 uBounds;
    uniform float uAltitude;
    uniform float uSpeed;
    uniform float uHorizontal;
    uniform float uSize;
    uniform float uMapScale;

    attribute float aBaseSpeed;
    attribute float aPhase;
    attribute float aScale;

    varying float vOpacityScale;

    void main() {
        vec3 pos = position;
        
        if (uHorizontal > 0.5) {
            // Fast horizontal movement
            pos.x += uTime * aBaseSpeed * uSpeed + uWind.x * uTime * 2.0;
            pos.y += sin(uTime * aBaseSpeed + aPhase) * 0.5 * uSpeed;
            pos.z += cos(uTime * aBaseSpeed + aPhase) * 0.5 * uSpeed + uWind.z * uTime * 2.0;
        } else {
            // Slow vertical drift
            pos.y += uTime * aBaseSpeed * 0.5 * uSpeed;
            pos.x += sin(uTime * aBaseSpeed + aPhase) * 0.5 * uSpeed + uWind.x * uTime * 0.5;
            pos.z += cos(uTime * aBaseSpeed + aPhase) * 0.5 * uSpeed + uWind.z * uTime * 0.5;
        }

        // Modulo wrapping for bounds
        vec3 halfBounds = uBounds * 0.5;
        
        pos.x = mod(pos.x + halfBounds.x, uBounds.x) - halfBounds.x;
        pos.z = mod(pos.z + halfBounds.z, uBounds.z) - halfBounds.z;
        pos.y = mod(pos.y - uAltitude, uBounds.y) + uAltitude;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Calculate size based on perspective
        gl_PointSize = uSize * aScale * ((400.0 / uMapScale) / -mvPosition.z);
        
        // Fade out near the top of bounds for vertical motes
        if (uHorizontal < 0.5) {
            vOpacityScale = clamp(1.0 - ((pos.y - uAltitude) / uBounds.y), 0.0, 1.0);
        } else {
            vOpacityScale = 1.0;
        }

        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform sampler2D uMap;

    varying float vOpacityScale;

    void main() {
        vec4 texColor = texture2D(uMap, gl_PointCoord);
        if (texColor.a < 0.01) discard;
        
        float finalOpacity = uOpacity * vOpacityScale * texColor.a;
        gl_FragColor = vec4(uColor, finalOpacity);
    }
`;

const DEFAULT_BOUNDS = { x: 40, y: 10, z: 40 };

export const DustMotes = ({ count = 500, bounds = DEFAULT_BOUNDS, speed = 1.0, opacity = 0.15, color = "#ffffff", size = 1.0, horizontal = false, altitude = 0, mapScale = 20 }) => {
    const materialRef = useRef();
    const globalWind = useVfxStore(state => state.globalWind);

    const [positions, attributes] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const baseSpeed = new Float32Array(count);
        const phase = new Float32Array(count);
        const scale = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            pos[i * 3 + 0] = (Math.random() - 0.5) * bounds.x;
            pos[i * 3 + 1] = Math.random() * bounds.y + altitude;
            pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z;
            
            baseSpeed[i] = 0.5 + Math.random() * 1.5;
            phase[i] = Math.random() * Math.PI * 2;
            scale[i] = 0.5 + Math.random() * 1.0;
        }
        return [pos, { baseSpeed, phase, scale }];
    }, [count, bounds, altitude]);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector3(globalWind.x, globalWind.y, globalWind.z) },
        uBounds: { value: new THREE.Vector3(bounds.x, bounds.y, bounds.z) },
        uCameraPos: { value: new THREE.Vector3() },
        uAltitude: { value: altitude },
        uSpeed: { value: speed },
        uHorizontal: { value: horizontal ? 1.0 : 0.0 },
        uSize: { value: size * 15.0 }, // Base pixel size multiplier
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uMap: { value: getCircleTexture() },
        uMapScale: { value: mapScale }
    }), [bounds, altitude, speed, horizontal, size, color, opacity, mapScale]);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            // Smoothly lerp towards global wind if it changes, or just set it
            materialRef.current.uniforms.uWind.value.set(globalWind.x, globalWind.y, globalWind.z);
            materialRef.current.uniforms.uCameraPos.value.copy(state.camera.position);
        }
    });

    return (
        <points renderOrder={1} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aBaseSpeed" count={count} array={attributes.baseSpeed} itemSize={1} />
                <bufferAttribute attach="attributes-aPhase" count={count} array={attributes.phase} itemSize={1} />
                <bufferAttribute attach="attributes-aScale" count={count} array={attributes.scale} itemSize={1} />
            </bufferGeometry>
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                depthWrite={false}
                blending={THREE.NormalBlending}
            />
        </points>
    );
};