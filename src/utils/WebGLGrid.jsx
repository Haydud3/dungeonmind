import React, { useMemo } from 'react';
import * as THREE from 'three';

const WebGLGrid = ({ grid, width, height, wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM }) => {
    const uniforms = useMemo(() => ({
        uSize: { value: grid.size },
        uOffset: { value: new THREE.Vector2(grid.offsetX, grid.offsetY) },
        uColor: { value: new THREE.Color('#ffffff') },
        uOpacity: { value: 0.3 },
        uLineWidth: { value: Math.max(0.8, grid.size / 60) },
        uResolution: { value: new THREE.Vector2(width, height) }
    }), [grid.size, grid.offsetX, grid.offsetY, width, height]);

    if (!grid.visible || !width || !height) return null;

    return (
        <mesh position={[width / 2, -height / 2, 0.06]}>
            <planeGeometry args={[width, height]} />
            <shaderMaterial
                transparent
                uniforms={{
                    ...uniforms,
                    uWalls: { value: wallUniforms.buffer },
                    uWallCount: { value: wallUniforms.count },
                    uViewers: { value: viewerUniforms.buffer },
                    uViewerCount: { value: viewerUniforms.count },
                    uVisionActive: { value: visionActive },
                    uDiscoveryTexture: { value: discoveryTexture || new THREE.Texture() },
                    uMapDimensions: { value: new THREE.Vector2(mapDimensions?.width || 1, mapDimensions?.height || 1) },
                    uIsDM: { value: isDM }
                }}
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
                    uniform float uSize;
                    uniform vec2 uOffset;
                    uniform vec3 uColor;
                    uniform float uOpacity;
                    uniform float uLineWidth;
                    uniform vec2 uResolution;
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
                        vec2 pixelPos = vUv * uResolution;
                        pixelPos.y = uResolution.y - pixelPos.y;
                        vec2 grid = abs(fract((pixelPos - uOffset) / uSize - 0.5) - 0.5) / (uLineWidth / uSize);
                        float line = min(grid.x, grid.y);
                        float alpha = (1.0 - smoothstep(0.0, 0.8, line)) * uOpacity;
                        
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
                        if (alpha < 0.01) discard;
                        gl_FragColor = vec4(uColor, alpha);
                    }
                `}
            />
        </mesh>
    );
};

export default WebGLGrid;