import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVfxStore } from '../../../stores/useVfxStore';

let leafTexture = null;
function getLeafTexture() {
    if (leafTexture) return leafTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Draw a simple leaf shape
    ctx.beginPath();
    ctx.moveTo(32, 10);
    ctx.bezierCurveTo(60, 20, 60, 50, 32, 60);
    ctx.bezierCurveTo(4, 50, 4, 20, 32, 10);
    ctx.fillStyle = 'white';
    ctx.fill();

    leafTexture = new THREE.CanvasTexture(canvas);
    return leafTexture;
}

const vertexShader = `
    uniform float uTime;
    uniform vec3 uWind;
    uniform vec3 uBounds;
    uniform float uMapScale;
    uniform vec3 uCameraPos;

    attribute float aSpeedY;
    attribute float aSpeedX;
    attribute float aPhase;
    attribute vec3 aColor;
    attribute float aRotationSpeed;

    varying vec3 vColor;
    varying float vRotation;

    void main() {
        vec3 pos = position;
        
        // Gravity and wind drift
        pos.y -= uTime * aSpeedY * 50.0;
        pos.x += uTime * aSpeedX * 50.0 + sin(uTime + aPhase) * 2.0 + uWind.x * uTime * 2.0;
        pos.z += cos(uTime + aPhase) * 2.0 + uWind.z * uTime * 2.0;

        // Camera-centric modulo wrapping
        vec3 halfBounds = uBounds * 0.5;
        pos.x = mod(pos.x - uCameraPos.x + halfBounds.x, uBounds.x) - halfBounds.x + uCameraPos.x;
        pos.z = mod(pos.z - uCameraPos.z + halfBounds.z, uBounds.z) - halfBounds.z + uCameraPos.z;
        pos.y = mod(pos.y, uBounds.y);

        vColor = aColor;
        vRotation = uTime * aRotationSpeed + aPhase;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 25.0 * ((400.0 / uMapScale) / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform sampler2D uMap;

    varying vec3 vColor;
    varying float vRotation;

    void main() {
        // Rotate the point coordinates to simulate tumbling leaves
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = gl_PointCoord - center;
        
        float s = sin(vRotation);
        float c = cos(vRotation);
        
        mat2 rot = mat2(c, -s, s, c);
        vec2 rotatedCoord = rot * coord + center;

        vec4 texColor = texture2D(uMap, rotatedCoord);
        if (texColor.a < 0.1) discard;
        
        gl_FragColor = vec4(vColor, texColor.a);
    }
`;

const DEFAULT_BOUNDS = { x: 50, y: 20, z: 50 };

export const FallingLeaves = ({ count = 1000, bounds = DEFAULT_BOUNDS, mapScale = 20 }) => {
    const materialRef = useRef();
    const globalWind = useVfxStore(state => state.globalWind);

    const [positions, attributes] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const speedY = new Float32Array(count);
        const speedX = new Float32Array(count);
        const phase = new Float32Array(count);
        const rotationSpeed = new Float32Array(count);
        const color = new Float32Array(count * 3);

        const tempColor = new THREE.Color();
        for (let i = 0; i < count; i++) {
            pos[i * 3 + 0] = (Math.random() - 0.5) * bounds.x;
            pos[i * 3 + 1] = Math.random() * bounds.y;
            pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z;
            
            speedY[i] = 0.02 + Math.random() * 0.03;
            speedX[i] = 0.01 + Math.random() * 0.04;
            phase[i] = Math.random() * Math.PI * 2;
            rotationSpeed[i] = (Math.random() - 0.5) * 5.0; // Fast rotation

            const r = Math.random();
            if (r < 0.3) tempColor.setHex(0xd4a017); // Autumn yellow
            else if (r < 0.6) tempColor.setHex(0xb22222); // Red/brown
            else if (r < 0.8) tempColor.setHex(0x8f9779); // Faded green
            else tempColor.setHex(0x556b2f); // Dark green
            
            tempColor.toArray(color, i * 3);
        }
        return [pos, { speedY, speedX, phase, rotationSpeed, color }];
    }, [count, bounds]);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector3(globalWind.x, globalWind.y, globalWind.z) },
        uBounds: { value: new THREE.Vector3(bounds.x, bounds.y, bounds.z) },
        uMap: { value: getLeafTexture() },
        uMapScale: { value: mapScale }
    }), [bounds, mapScale]);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            materialRef.current.uniforms.uWind.value.set(globalWind.x, globalWind.y, globalWind.z);
        }
    });

    return (
        <points renderOrder={1} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aSpeedY" count={count} array={attributes.speedY} itemSize={1} />
                <bufferAttribute attach="attributes-aSpeedX" count={count} array={attributes.speedX} itemSize={1} />
                <bufferAttribute attach="attributes-aPhase" count={count} array={attributes.phase} itemSize={1} />
                <bufferAttribute attach="attributes-aRotationSpeed" count={count} array={attributes.rotationSpeed} itemSize={1} />
                <bufferAttribute attach="attributes-aColor" count={count} array={attributes.color} itemSize={3} />
            </bufferGeometry>
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                depthWrite={false}
                side={THREE.DoubleSide}
            />
        </points>
    );
};