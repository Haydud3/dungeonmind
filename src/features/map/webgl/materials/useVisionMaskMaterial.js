import { useMemo, useCallback } from 'react';
import * as THREE from 'three';

export const useVisionMaskMaterial = (wallUniforms, viewerUniforms, visionActive, discoveryTexture = null, mapDimensions = null, isDM = false) => {
    const uniforms = useMemo(() => ({
        uWalls: { value: wallUniforms.buffer },
        uWallCount: { value: wallUniforms.count },
        uViewers: { value: viewerUniforms.buffer },
        uViewerCount: { value: viewerUniforms.count },
        uVisionActive: { value: visionActive },
        uDiscoveryTexture: { value: discoveryTexture || new THREE.Texture() },
        uMapDimensions: { value: new THREE.Vector2(mapDimensions?.width || 1, mapDimensions?.height || 1) },
        uIsDM: { value: isDM },
        uUseDiscovery: { value: !!discoveryTexture }
    }), [wallUniforms, viewerUniforms, visionActive, discoveryTexture, mapDimensions, isDM]);

    const onBeforeCompile = useCallback((shader) => {
        shader.uniforms.uWalls = uniforms.uWalls;
        shader.uniforms.uWallCount = uniforms.uWallCount;
        shader.uniforms.uViewers = uniforms.uViewers;
        shader.uniforms.uViewerCount = uniforms.uViewerCount;
        shader.uniforms.uVisionActive = uniforms.uVisionActive;
        shader.uniforms.uDiscoveryTexture = uniforms.uDiscoveryTexture;
        shader.uniforms.uMapDimensions = uniforms.uMapDimensions;
        shader.uniforms.uIsDM = uniforms.uIsDM;
        shader.uniforms.uUseDiscovery = uniforms.uUseDiscovery;

        shader.vertexShader = `
            varying vec2 vWorldPos;
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xy;
            `
        );

        shader.fragmentShader = `
            uniform vec4 uWalls[100];
            uniform int uWallCount;
            uniform vec4 uViewers[8];
            uniform int uViewerCount;
            uniform bool uVisionActive;
            uniform bool uIsDM;
            uniform sampler2D uDiscoveryTexture;
            uniform vec2 uMapDimensions;
            uniform bool uUseDiscovery;
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

            ${shader.fragmentShader}
        `.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            if (uVisionActive) {
                float currentIntensity = 0.0;
                for (int i = 0; i < 8; i++) {
                    if (i >= uViewerCount) break;
                    vec2 vPos = uViewers[i].xy;
                    float vRad = uViewers[i].z;
                    float dist = distance(vWorldPos, vPos);
                    if (dist > vRad) continue;
                    bool blocked = false;
                    for (int j = 0; j < 100; j++) {
                        if (j >= uWallCount) break;
                        if (rayIntersectsSegment(vPos, vWorldPos, uWalls[j].xy, uWalls[j].zw)) {
                            blocked = true;
                            break;
                        }
                    }
                    if (!blocked) { 
                        currentIntensity += 1.0 - smoothstep(vRad * 0.7, vRad, dist);
                    }
                }
                
                if (uIsDM) {
                    gl_FragColor.rgb *= (0.4 + min(currentIntensity * 0.3, 0.6));
                } else {
                    float visibility = min(currentIntensity, 1.0);
                    if (uUseDiscovery) {
                        vec2 dUv = vec2(vWorldPos.x / uMapDimensions.x, vWorldPos.y / -uMapDimensions.y);
                        float discovered = texture2D(uDiscoveryTexture, dUv).r;
                        visibility = max(visibility, discovered * 0.2);
                    }
                    if (visibility < 0.01) discard;
                    gl_FragColor.rgb *= visibility;
                }
            }
            `
        );
    }, [uniforms]);
    return onBeforeCompile;
};
