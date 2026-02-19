import React, { useRef, useMemo, useLayoutEffect, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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

const VfxMaterial = ({ flavor, isPreview, hasRim = false, isBeam = false }) => {
    const settings = VFX_SHADERS[flavor] || VFX_SHADERS.magic;
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uColor: { value: settings.color },
        uNoiseScale: { value: settings.noiseScale },
        uOpacity: { value: isPreview ? 0.4 : 0.8 },
        uHasRim: { value: hasRim ? 1.0 : 0.0 },
        uIsBeam: { value: isBeam ? 1.0 : 0.0 }
    }), [flavor, isPreview, hasRim, isBeam]);

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
                uniform float uHasRim;
                uniform float uIsBeam;
                varying vec2 vUv;
                float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
                void main() {
                    float n = noise(vUv * uNoiseScale + uTime);
                    float alpha = uOpacity * (0.5 + 0.5 * sin(uTime + vUv.y * 10.0));
                    
                    // For beams, use Y-distance from center. For others, use radial distance.
                    float dist = uIsBeam > 0.5 ? abs(vUv.y - 0.5) * 2.0 : length(vUv - 0.5) * 2.0;
                    float finalAlpha = alpha * (1.0 - dist);

                    if (uHasRim > 0.5) {
                        float rim = smoothstep(0.85, 1.0, dist);
                        // Dim the core slightly and add the rim
                        finalAlpha = (finalAlpha * 0.6) + (rim * uOpacity * 1.2);
                    }

                    gl_FragColor = vec4(uColor, finalAlpha);
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
            <VfxMaterial flavor={flavor} isPreview={isPreview} hasRim={true} />
        </mesh>
    );
};

const Beam = ({ origin, target, flavor, isPreview }) => {
    // Memoize the math to prevent jitter during fast mouse movements
    const { angle, dist, midX, midY } = useMemo(() => {
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        return {
            angle: Math.atan2(-dy, dx),
            dist: Math.hypot(dx, dy),
            midX: origin.x + dx / 2,
            midY: -(origin.y + dy / 2) // Negate the averaged screen Y
        };
    }, [origin, target]);

    return (
        <mesh position={[midX, midY, 0]} rotation={[0, 0, angle]}>
            <planeGeometry args={[dist, 20]} />
            <VfxMaterial flavor={flavor} isPreview={isPreview} isBeam={true} />
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

const Weather = ({ type, width, height }) => {
    const count = 2500; // Increased density for better visibility
    const pointsRef = useRef();
    
    const [positions, velocities] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = Math.random() * width;
            pos[i * 3 + 1] = -Math.random() * height;
            pos[i * 3 + 2] = 2;

            if (type === 'rain') {
                vel[i * 3] = -1.0; // Slower slant
                vel[i * 3 + 1] = -25 - Math.random() * 15; // Slower fall speed
            } else if (type === 'snow') {
                vel[i * 3] = (Math.random() - 0.5) * 1.0;
                vel[i * 3 + 1] = -1.5 - Math.random() * 1.5;
            } else if (type === 'ash') {
                vel[i * 3] = (Math.random() - 0.5) * 0.8;
                vel[i * 3 + 1] = -0.8 - Math.random() * 0.8;
            }
        }
        return [pos, vel];
    }, [type, width, height]);

    useFrame((state) => {
        if (!pointsRef.current) return;
        const posAttr = pointsRef.current.geometry.attributes.position;
        const array = posAttr.array;
        const time = state.clock.getElapsedTime();
        
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            array[idx] += velocities[idx];
            array[idx + 1] += velocities[idx + 1];

            if (type === 'snow' || type === 'ash') {
                array[idx] += Math.sin(time + i) * 0.3;
            }

            if (array[idx + 1] < -height) {
                array[idx + 1] = 0;
                array[idx] = Math.random() * width;
            }
            if (array[idx] < 0) array[idx] = width;
            if (array[idx] > width) array[idx] = 0;
        }
        posAttr.needsUpdate = true;
    });

    const material = useMemo(() => ({
        rain: { color: '#88ccff', size: 3, opacity: 0.7 }, // Brighter and more opaque
        snow: { color: '#ffffff', size: 4, opacity: 0.8 },
        ash: { color: '#bbbbbb', size: 3, opacity: 0.4 }
    }[type] || { color: '#ffffff', size: 0, opacity: 0 }), [type]);

    const uniforms = useMemo(() => ({
        uType: { value: type === 'rain' ? 0.0 : type === 'snow' ? 1.0 : 2.0 },
        uColor: { value: new THREE.Color(material.color) },
        uOpacity: { value: material.opacity },
    }), [type, material]);

    return (
        <points ref={pointsRef} key={`weather-${type}`} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <shaderMaterial
                transparent
                depthWrite={false}
                depthTest={false}
                uniforms={uniforms}
                vertexShader={`
                    uniform float uType;
                    void main() {
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        // Rain needs a larger point size to draw the streak
                        gl_PointSize = (uType < 0.5) ? 48.0 : (uType < 1.5 ? 4.0 : 3.0);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `}
                fragmentShader={`
                    uniform float uType;
                    uniform vec3 uColor;
                    uniform float uOpacity;
                    void main() {
                        float alpha = uOpacity;
                        if (uType < 0.5) {
                            // Rain Streaks
                            // Create a slanted line. PointCoord is 0->1
                            // Velocity is approx (-1, -30), so slope is ~30.
                            // Line: x = 0.5 + (y-0.5) * (dx/dy)
                            float lineX = 0.5 + (gl_PointCoord.y - 0.5) * 0.03;
                            float dist = abs(gl_PointCoord.x - lineX);
                            alpha *= smoothstep(0.04, 0.0, dist);
                            // Fade edges of the streak
                            alpha *= smoothstep(0.0, 0.2, gl_PointCoord.y) * smoothstep(1.0, 0.8, gl_PointCoord.y);
                        } else {
                            // Snow/Ash: Simple circles
                            float dist = length(gl_PointCoord - 0.5);
                            if (dist > 0.5) discard;
                            alpha *= smoothstep(0.5, 0.4, dist);
                        }
                        gl_FragColor = vec4(uColor, alpha);
                    }
                `}
            />
        </points>
    );
};

const Burst = ({ origin, flavor, isPreview, startTime, radius = 30, duration = 1000 }) => {
    const meshRef = useRef();
    
    useFrame(() => {
        if (isPreview || !meshRef.current) return;
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const scale = 1.0 + Math.sin(progress * Math.PI) * 0.5;
        meshRef.current.scale.set(scale, scale, 1);
    });

    return (
        <mesh ref={meshRef} position={[origin.x, -origin.y, 0]}>
            <circleGeometry args={[radius, 32]} />
            <VfxMaterial flavor={flavor} isPreview={isPreview} hasRim={true} />
        </mesh>
    );
};

const Aura = ({ origin, flavor, isPreview, radius = 50 }) => (
    <mesh position={[origin.x, -origin.y, 0]}>
        <circleGeometry args={[radius, 32]} />
        <VfxMaterial flavor={flavor} isPreview={isPreview} hasRim={true} />
    </mesh>
);

const DebugMarker = ({ position, color = "cyan" }) => (
    <group position={position}>
        <mesh>
            <sphereGeometry args={[4, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} />
        </mesh>
        <mesh rotation={[0, 0, 0]}>
            <boxGeometry args={[1, 20, 1]} />
            <meshBasicMaterial color={color} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[1, 20, 1]} />
            <meshBasicMaterial color={color} />
        </mesh>
    </group>
);

const Effect = memo((props) => {
    const isDebug = localStorage.getItem('vtt_debug_vfx') === 'true';
    switch (props.behavior) {
        case 'breath': return <><Breath {...props} />{isDebug && <DebugMarker position={[props.origin.x, -props.origin.y, 1]} />}</>;
        case 'beam': return <><Beam {...props} />{isDebug && <><DebugMarker position={[props.origin.x, -props.origin.y, 1]} /><DebugMarker position={[props.target.x, -props.target.y, 1]} color="magenta" /></>}</>;
        case 'rocket': return <><Rocket {...props} />{isDebug && <DebugMarker position={[props.origin.x, -props.origin.y, 1]} />}</>;
        case 'aura': return <><Aura {...props} />{isDebug && <DebugMarker position={[props.origin.x, -props.origin.y, 1]} />}</>;
        case 'burst': return <><Burst {...props} />{isDebug && <DebugMarker position={[props.origin.x, -props.origin.y, 1]} />}</>;
        default: return null;
    }
});

const CameraController = ({ width, height }) => {
    const { camera, size, gl } = useThree();
    useLayoutEffect(() => {
        if (!width || !height) return;
        
        // FORCE the drawing buffer to match map pixels exactly (3500x3850)
        // The 'true' argument updates the style.width/height as well
        gl.setSize(width, height, true);
        
        camera.left = 0;
        camera.right = width;
        camera.top = 0;
        camera.bottom = -height;
        camera.position.set(0, 0, 10); // Top-left origin in Three.js space
        camera.zoom = 1;
        camera.updateProjectionMatrix();
    }, [camera, width, height, size.width, size.height, gl]);
    return null;
};

export default function VfxOverlay({ width, height, templates = [], weather, pixelRatio = 1 }) {
    const activeEffects = useVfxStore(state => state.activeEffects);
    const targetingPreview = useVfxStore(state => state.targetingPreview);
    
    if (!width || !height) return null;
    
    // Cap dimensions to prevent WebGL context loss on huge maps
    const MAX_DIM = 4096;
    const scale = Math.min(1, MAX_DIM / Math.max(width, height));
    const renderWidth = Math.floor(width * scale);
    const renderHeight = Math.floor(height * scale);

    return (
        <div 
            className="absolute top-0 left-0 pointer-events-none z-[15]" 
            style={{ 
                width: `${width}px`, 
                height: `${height}px`, 
                maxWidth: 'none', 
                maxHeight: 'none',
                willChange: 'transform' 
            }}
        >
            <Canvas
                dpr={1} // Force 1:1 pixel mapping to match Vision Canvas
                resize={{ debounce: 0 }}
                orthographic
                camera={{
                    left: 0, right: width,
                    top: 0, bottom: -height,
                    near: -100, far: 100,
                    position: [0, 0, 10],
                    manual: true
                }}
                gl={{ alpha: true, antialias: true }}
                events={null}
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    display: 'block',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                    imageRendering: 'pixelated',
                    willChange: 'transform'
                }}
            >
                <CameraController width={width} height={height} />
                {weather && <Weather type={weather} width={width} height={height} />}
                {activeEffects.map(effect => <Effect key={effect.id} {...effect} />)}
                {targetingPreview && <Effect {...targetingPreview} isPreview />}
                
                {/* Render Persistent Templates as VFX */}
                {templates.map(tpl => {
                    if (!tpl.flavor) return null;
                    return (
                        <Effect 
                            key={`tpl-vfx-${tpl.id}-${tpl.flavor}-${tpl.radius}`} 
                            behavior="aura" 
                            origin={{ x: tpl.x, y: tpl.y }} 
                            radius={tpl.radius} 
                            flavor={tpl.flavor} 
                        />
                    );
                })}
            </Canvas>
        </div>
    );
}