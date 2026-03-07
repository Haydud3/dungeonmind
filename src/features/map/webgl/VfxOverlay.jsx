import React, { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useVfxStore } from '../../../stores/useVfxStore';
import * as THREE from 'three';

const isMobile = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);

const VFX_SHADERS = {
    fire: { color: new THREE.Color('#ff4400'), noiseScale: 5.0, speed: 2.0 },
    frost: { color: new THREE.Color('#00ffff'), noiseScale: 3.0, speed: 1.0 },
    acid: { color: new THREE.Color('#88ff00'), noiseScale: 4.0, speed: 1.5 },
    death: { color: new THREE.Color('#440088'), noiseScale: 6.0, speed: 0.5 },
    magic: { color: new THREE.Color('#ff00ff'), noiseScale: 2.0, speed: 3.0 },
    gold: { color: new THREE.Color('#ffcc00'), noiseScale: 2.0, speed: 2.0 }
};

const VfxMaterial = ({ flavor, isPreview, hasRim = false, isBeam = false, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
    const settings = VFX_SHADERS[flavor] || VFX_SHADERS.magic;
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uColor: { value: settings.color },
        uNoiseScale: { value: settings.noiseScale },
        uOpacity: { value: isPreview ? 0.4 : 0.8 },
        uHasRim: { value: hasRim ? 1.0 : 0.0 },
        uIsBeam: { value: isBeam ? 1.0 : 0.0 },
        uWalls: { value: wallUniforms.buffer },
        uWallCount: { value: wallUniforms.count },
        uViewers: { value: viewerUniforms.buffer },
        uViewerCount: { value: viewerUniforms.count },
        uVisionActive: { value: visionActive },
        uDiscoveryTexture: { value: discoveryTexture || new THREE.Texture() },
        uMapDimensions: { value: new THREE.Vector2(mapDimensions.width || 1, mapDimensions.height || 1) },
        uIsDM: { value: isDM }
    }), [flavor, isPreview, hasRim, isBeam, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM]);

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
                varying vec2 vWorldPos;
                void main() {
                    vUv = uv;
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xy;
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
                uniform vec4 uWalls[100];
                uniform int uWallCount;
                uniform vec4 uViewers[8];
                uniform int uViewerCount;
                uniform bool uVisionActive;
                uniform bool uIsDM;
                uniform sampler2D uDiscoveryTexture;
                uniform vec2 uMapDimensions;
                varying vec2 vUv;
                varying vec2 vWorldPos;

                float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

                bool rayIntersectsSegment(vec2 a, vec2 b, vec2 c, vec2 d) {
                    vec2 r = b - a;
                    vec2 s = d - c;
                    float det = r.x * s.y - r.y * s.x;
                    if (abs(det) < 0.0001) return false;
                    float t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / det;
                    float u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / det;
                    return (t > 0.0 && t < 1.0 && u > 0.0 && u < 1.0);
                }

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

                    if (uVisionActive) {
                        float currentIntensity = 0.0;
                        for (int i = 0; i < 8; i++) {
                            if (i >= uViewerCount) break;
                            float dist = distance(vWorldPos, uViewers[i].xy);
                            if (dist > uViewers[i].z) continue;
                            bool blocked = false;
                            for (int j = 0; j < 100; j++) {
                                if (j >= uWallCount) break;
                                if (rayIntersectsSegment(uViewers[i].xy, vWorldPos, uWalls[j].xy, uWalls[j].zw)) { blocked = true; break; }
                            }
                            if (!blocked) {
                                currentIntensity += 1.0 - smoothstep(uViewers[i].z * 0.7, uViewers[i].z, dist);
                            }
                        }

                        vec2 dUv = vec2(vWorldPos.x / uMapDimensions.x, vWorldPos.y / -uMapDimensions.y);
                        float discovered = texture2D(uDiscoveryTexture, dUv).r;

                        if (uIsDM) {
                            finalAlpha *= (0.4 + min(currentIntensity * 0.3, 0.6));
                        } else {
                            float visibility = max(min(currentIntensity, 1.0), discovered * 0.2);
                            finalAlpha *= visibility;
                        }
                    }

                    gl_FragColor = vec4(uColor, finalAlpha);
                }
            `}
        />
    );
};

const Breath = ({ origin, target, flavor, isPreview, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
    // Negate Y for Three.js Y-Up space
    const angle = Math.atan2(-(target.y - origin.y), target.x - origin.x);
    const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
    return (
        <mesh position={[origin.x, -origin.y, 0]} rotation={[0, 0, angle - Math.PI / 6]}>
            <ringGeometry args={[0, dist, 32, 1, 0, Math.PI / 3]} />
            <VfxMaterial flavor={flavor} isPreview={isPreview} hasRim={true} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />
        </mesh>
    );
};

const Beam = ({ origin, target, flavor, isPreview, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
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
            <VfxMaterial flavor={flavor} isPreview={isPreview} isBeam={true} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />
        </mesh>
    );
};

const Rocket = ({ origin, target, flavor, isPreview, startTime, duration, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
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
            <VfxMaterial flavor={flavor} isPreview={isPreview} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />
        </mesh>
    );
};

const Weather = ({ type, width, height, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
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
        uWalls: { value: wallUniforms.buffer },
        uWallCount: { value: wallUniforms.count },
        uViewers: { value: viewerUniforms.buffer },
        uViewerCount: { value: viewerUniforms.count },
        uVisionActive: { value: visionActive },
        uDiscoveryTexture: { value: discoveryTexture || new THREE.Texture() },
        uMapDimensions: { value: new THREE.Vector2(mapDimensions.width || 1, mapDimensions.height || 1) },
        uIsDM: { value: isDM }
    }), [type, material, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM]);

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
                    varying vec2 vWorldPos;
                    void main() {
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        vWorldPos = (modelMatrix * vec4(position, 1.0)).xy;
                        // Rain needs a larger point size to draw the streak
                        gl_PointSize = (uType < 0.5) ? 48.0 : (uType < 1.5 ? 4.0 : 3.0);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `}
                fragmentShader={`
                    uniform float uType;
                    uniform vec3 uColor;
                    uniform float uOpacity;
                    uniform vec4 uWalls[100];
                    uniform int uWallCount;
                    uniform vec4 uViewers[8];
                    uniform int uViewerCount;
                    uniform bool uVisionActive;
                    uniform bool uIsDM;
                    uniform sampler2D uDiscoveryTexture;
                    uniform vec2 uMapDimensions;
                    varying vec2 vWorldPos;

                    bool rayIntersectsSegment(vec2 a, vec2 b, vec2 c, vec2 d) {
                        vec2 r = b - a;
                        vec2 s = d - c;
                        float det = r.x * s.y - r.y * s.x;
                        if (abs(det) < 0.0001) return false;
                        float t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / det;
                        float u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / det;
                        return (t > 0.0 && t < 1.0 && u > 0.0 && u < 1.0);
                    }

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

                        if (uVisionActive) {
                            float currentIntensity = 0.0;
                            for (int i = 0; i < 8; i++) {
                                if (i >= uViewerCount) break;
                                float dist = distance(vWorldPos, uViewers[i].xy);
                                if (dist > uViewers[i].z) continue;
                                bool blocked = false;
                                for (int j = 0; j < 100; j++) {
                                    if (j >= uWallCount) break;
                                    if (rayIntersectsSegment(uViewers[i].xy, vWorldPos, uWalls[j].xy, uWalls[j].zw)) { blocked = true; break; }
                                }
                                if (!blocked) {
                                    currentIntensity += 1.0 - smoothstep(uViewers[i].z * 0.7, uViewers[i].z, dist);
                                }
                            }

                            vec2 dUv = vec2(vWorldPos.x / uMapDimensions.x, vWorldPos.y / -uMapDimensions.y);
                            float discovered = texture2D(uDiscoveryTexture, dUv).r;

                            if (uIsDM) {
                                alpha *= (0.4 + min(currentIntensity * 0.3, 0.6));
                            } else {
                                float visibility = max(min(currentIntensity, 1.0), discovered * 0.2);
                                alpha *= visibility;
                            }
                        }

                        gl_FragColor = vec4(uColor, alpha);
                    }
                `}
            />
        </points>
    );
};

const Burst = ({ origin, flavor, isPreview, startTime, radius = 30, duration = 1000, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
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
            <VfxMaterial flavor={flavor} isPreview={isPreview} hasRim={true} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />
        </mesh>
    );
};

const Aura = ({ origin, flavor, isPreview, radius = 50, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => (
    <mesh position={[origin.x, -origin.y, 0]}>
        <circleGeometry args={[radius, 32]} />
        <VfxMaterial flavor={flavor} isPreview={isPreview} hasRim={true} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />
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

const VfxOverlay = memo(({ width, height, templates = [], weather, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
    const activeEffects = useVfxStore(state => state.activeEffects);
    const targetingPreview = useVfxStore(state => state.targetingPreview);
    
    if (!width || !height) return null;

    return (
        <group position={[0, 0, 1]}>
            {weather && <Weather type={weather} width={width} height={height} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />}
            {activeEffects.map(effect => <Effect key={effect.id} {...effect} wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />)}
            {targetingPreview && <Effect {...targetingPreview} isPreview wallUniforms={wallUniforms} viewerUniforms={viewerUniforms} visionActive={visionActive} discoveryTexture={discoveryTexture} mapDimensions={mapDimensions} isDM={isDM} />}
            
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
                        wallUniforms={wallUniforms}
                        viewerUniforms={viewerUniforms}
                        visionActive={visionActive}
                        discoveryTexture={discoveryTexture}
                        mapDimensions={mapDimensions}
                        isDM={isDM}
                    />
                );
            })}
        </group>
    );
});

export default VfxOverlay;