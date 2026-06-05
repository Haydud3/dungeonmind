import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useResolvedUrl } from '../../utils/useResolvedUrl';
import { useAnimatedMapTexture } from '../../utils/useAnimatedMapTexture';

const defaultFowTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
defaultFowTexture.minFilter = THREE.NearestFilter;
defaultFowTexture.magFilter = THREE.NearestFilter;
defaultFowTexture.colorSpace = THREE.NoColorSpace;
defaultFowTexture.needsUpdate = true;

export const InstancedGrassHeightmap = ({ scale = 20, aspect = 1, uniforms: parentUniforms, animatedEnvironment = true, fowTexture }) => {
    const meshRef = useRef();
    const materialRef = useRef();
    const shaderRef = useRef();
    const isLowPerf = typeof window !== 'undefined' && localStorage.getItem('vtt_low_performance') === 'true';
    const grassDensity = isLowPerf ? 70 : 120;

    const grassAlphaMap = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffffff';
        
        for(let i=0; i<20; i++) {
            const rootX = 128 + (Math.random() - 0.5) * 180;
            const tipX = rootX + (Math.random() - 0.5) * 150;
            const tipY = Math.random() * 80;
            const cpX = (rootX + tipX) / 2 + (Math.random() - 0.5) * 50;
            const cpY = 128 + (Math.random() - 0.5) * 50;
            const bladeWidth = 6 + Math.random() * 8;
            
            ctx.beginPath();
            ctx.moveTo(rootX - bladeWidth/2, 256);
            ctx.quadraticCurveTo(cpX - bladeWidth/2, cpY, tipX, tipY);
            ctx.quadraticCurveTo(cpX + bladeWidth/2, cpY, rootX + bladeWidth/2, 256);
            ctx.fill();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.NoColorSpace;
        return texture;
    }, []);

    const { geometry, count } = useMemo(() => {
        const height = 0.25;
        const width = 0.25;
        const planes = 3;
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i < planes; i++) {
            const angle = (Math.PI / planes) * i;
            const sin = Math.sin(angle) * width / 2;
            const cos = Math.cos(angle) * width / 2;

            const baseIdx = i * 4;
            positions.push(-cos, 0, -sin); uvs.push(0, 0);
            positions.push(cos, 0, sin); uvs.push(1, 0);
            positions.push(-cos, height, -sin); uvs.push(0, 1);
            positions.push(cos, height, sin); uvs.push(1, 1);

            indices.push(
                baseIdx, baseIdx + 1, baseIdx + 2,
                baseIdx + 2, baseIdx + 1, baseIdx + 3
            );
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const normals = geo.attributes.normal.array;
        for (let i = 0; i < normals.length; i += 3) {
            normals[i] = 0;
            normals[i + 1] = 1;
            normals[i + 2] = 0;
        }
        const countX = Math.floor(grassDensity * aspect);
        const countZ = grassDensity;
        const total = countX * countZ;
        return { geometry: geo, count: total };
    }, [aspect, grassDensity]);

    useEffect(() => {
        if (!meshRef.current) return;
        const countX = Math.floor(grassDensity * aspect);
        const countZ = grassDensity;
        const dummy = new THREE.Object3D();
        let i = 0;
        for (let z = 0; z < countZ; z++) {
            for (let x = 0; x < countX; x++) {
                const u = x / countX;
                const v = z / countZ;
                
                // Add noise to placement (Poisson-disk like feel via large random scatter)
                const posX = (u - 0.5) * (scale * aspect) + (Math.random() - 0.5) * (scale * aspect / countX) * 2.5;
                const posZ = (v - 0.5) * scale + (Math.random() - 0.5) * (scale / countZ) * 2.5;
                
                dummy.position.set(posX, 0, posZ);
                dummy.rotation.y = Math.random() * Math.PI * 2;
                // Add some tilt to the blades
                dummy.rotation.x = (Math.random() - 0.5) * 0.5;
                dummy.rotation.z = (Math.random() - 0.5) * 0.5;
                
                // Varied scale for natural look
                const s = Math.random() * 0.6 + 0.4;
                dummy.scale.set(s, s, s);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
                i++;
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [scale, aspect, grassDensity]);

    useEffect(() => {
        if (materialRef.current) materialRef.current.needsUpdate = true;
    }, [fowTexture]);

    useFrame(() => {
        if (shaderRef.current && parentUniforms) {
            for (const key in parentUniforms) {
                if (shaderRef.current.uniforms[key]) {
                    shaderRef.current.uniforms[key].value = parentUniforms[key].value;
                }
            }
        }
    });

    const onBeforeCompile = (shader) => {
        shaderRef.current = shader;
        shader.uniforms.uMaterialMask = parentUniforms.uMaterialMask;
        shader.uniforms.uBackground = parentUniforms.uBackground;
        shader.uniforms.uHeightmap = parentUniforms.uHeightmap;
        shader.uniforms.uHeightScale = parentUniforms.uHeightScale;
        shader.uniforms.uScale = parentUniforms.uScale;
        shader.uniforms.uAspect = parentUniforms.uAspect;
        shader.uniforms.uTime = parentUniforms.uTime;
        shader.uniforms.uTokens = parentUniforms.uTokens;
        shader.uniforms.uTokenCount = parentUniforms.uTokenCount;
        shader.uniforms.uFowTexture = parentUniforms.uFowTexture;
        shader.uniforms.uFowEnabled = parentUniforms.uFowEnabled;
        shader.uniforms.uIsDm = parentUniforms.uIsDm;

        shader.vertexShader = `
            uniform sampler2D uMaterialMask;
            uniform sampler2D uBackground;
            uniform sampler2D uHeightmap;
            uniform sampler2D uFowTexture;
            uniform float uFowEnabled;
            uniform float uIsDm;
            uniform float uHeightScale;
            uniform float uScale;
            uniform float uAspect;
            uniform float uTime;
            uniform vec3 uTokens[30];
            uniform int uTokenCount;
            varying vec3 vColor;
            varying float vVisibility;
            varying float vGrassY;
            ${shader.vertexShader}
        `.replace(
            `#include <begin_vertex>`,
            `
            #include <begin_vertex>
            vGrassY = position.y;
            
            vec3 instanceWorldPos = vec3(0.0);
            #ifdef USE_INSTANCING
                instanceWorldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            #endif

            vec2 instanceUv = vec2(
                (instanceWorldPos.x / (uScale * uAspect)) + 0.5,
                (-instanceWorldPos.z / uScale) + 0.5
            );
            
            vec4 maskColor = texture2D(uMaterialMask, instanceUv);
            
            if (maskColor.g > 0.4 && maskColor.r < 0.3 && maskColor.b < 0.3) {
                // Inherit the exact map color underneath to match the terrain biome perfectly
                vec3 baseColor = texture2D(uBackground, instanceUv).rgb;
                
                // Add fake translucency and depth
                vec3 tipColor = baseColor * 1.5 + vec3(0.1, 0.1, 0.0);
                vec3 rootColor = baseColor * 0.3;
                
                vColor = mix(rootColor, tipColor, vGrassY / 0.25);
                
                // Phase 3 & 4: Token Interaction and LOD
                float minVisibility = 1.0;
                float maxCrush = 0.0;
                vec2 crushDir = vec2(0.0);
                
                for(int i = 0; i < 30; i++) {
                    if (i >= uTokenCount) break;
                    float tokenRadius = uTokens[i].z;
                    if (tokenRadius < 0.01) continue;

                    vec2 toToken = instanceWorldPos.xz - uTokens[i].xy;
                    float dist = length(toToken);

                    // Calculate visibility based on distance (cull under token)
                    float visibility = smoothstep(tokenRadius * 0.4, tokenRadius * 0.8, dist);
                    minVisibility = min(minVisibility, visibility);

                    // Calculate crush factor (flatten around token)
                    float crush = 1.0 - smoothstep(tokenRadius * 0.5, tokenRadius * 1.5, dist);
                    if (crush > maxCrush) {
                        maxCrush = crush;
                        if (dist > 0.01) crushDir = normalize(toToken);
                    }
                }

                // Phase 4: Distance Culling & LOD Fading
                float camDist = distance(cameraPosition, instanceWorldPos);
                float lodFade = 1.0 - smoothstep(30.0, 60.0, camDist);
                
                vec4 fowColor = texture2D(uFowTexture, instanceUv);
                float isPlayerFow = step(0.5, uFowEnabled) * (1.0 - step(0.5, uIsDm));
                float rawFowVisibility = 1.0 - smoothstep(0.01, 0.1, fowColor.r);
                float fowVisibility = mix(1.0, rawFowVisibility, isPlayerFow);
                
                vVisibility = minVisibility * step(0.01, lodFade) * step(0.01, fowVisibility);

                if (vVisibility > 0.5) {
                    // Phase 3: Apply physical crushing to the geometry
                    float crushFactor = maxCrush * (vGrassY / 0.25); 
                    transformed.y *= (1.0 - maxCrush * 0.6); // Squish down
                    transformed.x -= crushDir.x * crushFactor * 0.3; // Push outward
                    transformed.z -= crushDir.y * crushFactor * 0.3;
                    
                    // Scale down gracefully in the distance
                    transformed *= lodFade;

                    ${animatedEnvironment ? `
                    // Complex Wind Sway
                    float windX = sin(uTime * 0.8 + instanceWorldPos.x * 1.0 + instanceWorldPos.z * 1.0) * 0.03 + sin(uTime * 1.5 + instanceWorldPos.x * 3.0) * 0.01;
                    float windZ = cos(uTime * 0.7 + instanceWorldPos.z * 1.0 - instanceWorldPos.x * 1.0) * 0.03;
                    
                    float swayFactor = pow(vGrassY / 0.25, 1.5);
                    
                    transformed.x += windX * swayFactor * (1.0 - maxCrush);
                    transformed.z += windZ * swayFactor * (1.0 - maxCrush);
                    ` : ''}
                    
                    float h = texture2D(uHeightmap, instanceUv).r * uHeightScale;
                    float instScaleY = length(vec3(instanceMatrix[0][1], instanceMatrix[1][1], instanceMatrix[2][1]));
                    transformed.y += h / instScaleY;
                } else {
                    transformed *= 0.0;
                }
            } else {
                vVisibility = 0.0;
                transformed *= 0.0;
            }
            `
        );

        shader.fragmentShader = `
            varying vec3 vColor;
            varying float vVisibility;
            varying float vGrassY;
            ${shader.fragmentShader}
        `.replace(
            `#include <color_fragment>`,
            `
            #include <color_fragment>
            if (vVisibility < 0.5) discard;
            diffuseColor.rgb = vColor;
            `
        );
    };

    return (
        <instancedMesh key={count} ref={meshRef} args={[geometry, null, count]} castShadow receiveShadow position={[0, 0, 0]} frustumCulled={false} raycast={() => null}>
            <meshLambertMaterial key={fowTexture ? "mat_fow" : "mat_def"} ref={materialRef} alphaMap={grassAlphaMap} alphaTest={0.5} side={THREE.DoubleSide} onBeforeCompile={onBeforeCompile} customProgramCacheKey={() => "grass_heightmap_" + animatedEnvironment + (fowTexture ? "_fow" : "_def")} />
        </instancedMesh>
    );
};

export const HeightmapContent = ({ resolvedHeightmapUrl, resolvedBackgroundUrl, resolvedNormalMapUrl, resolvedMaterialMaskUrl, dynamicMaterialMask, heightScale, scale, aspect = 1, dynamicDisplacementMap, tokensList = [], rtdbDragsRef, gridSize = 1, animatedEnvironment = true, isPaintingMaterial = false, fowTexture, fowEnabled, isDm, playbackRate = 1 }) => {
    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const { texture: animatedBgTexture } = useAnimatedMapTexture(resolvedBackgroundUrl, playbackRate);
    
    const backgroundTexture = useMemo(() => {
        if (animatedBgTexture) {
             animatedBgTexture.colorSpace = THREE.SRGBColorSpace;
             animatedBgTexture.wrapS = animatedBgTexture.wrapT = THREE.RepeatWrapping;
             return animatedBgTexture;
        }
        return null;
    }, [animatedBgTexture]);

    const heightmapTexture = useMemo(() => {
        const url = resolvedHeightmapUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        const tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }, [resolvedHeightmapUrl]);

    const normalMapTexture = useMemo(() => {
        const url = resolvedNormalMapUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; 
        const tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.NoColorSpace;
        return tex;
    }, [resolvedNormalMapUrl]);
    
    const materialMaskTexture = useMemo(() => {
        const url = resolvedMaterialMaskUrl || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        const tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }, [resolvedMaterialMaskUrl]);
    
    const activeMaskTexture = dynamicMaterialMask || materialMaskTexture;

    useMemo(() => {
        if (dynamicDisplacementMap) {
            dynamicDisplacementMap.colorSpace = THREE.NoColorSpace;
            dynamicDisplacementMap.wrapS = dynamicDisplacementMap.wrapT = THREE.RepeatWrapping;
            dynamicDisplacementMap.needsUpdate = true;
        }
    }, [dynamicDisplacementMap]);

    const uniforms = useMemo(() => {
        const tokenVecs = Array(30).fill(null).map(() => new THREE.Vector3(-9999, -9999, 0));
        return {
            uTime: { value: 0 },
            uMaterialMask: { value: new THREE.Texture() },
            uBackground: { value: new THREE.Texture() },
            uHeightmap: { value: new THREE.Texture() },
            uHeightScale: { value: heightScale },
            uScale: { value: scale },
            uAspect: { value: aspect },
            uTokens: { value: tokenVecs },
            uTokenCount: { value: 0 },
            uIsPainting: { value: 0 },
            uFowTexture: { value: defaultFowTexture },
            uFowEnabled: { value: 0 },
            uIsDm: { value: 0 }
        };
    }, []);

    useMemo(() => {
        uniforms.uMaterialMask.value = activeMaskTexture || new THREE.Texture();
    }, [activeMaskTexture, uniforms]);

    useMemo(() => {
        uniforms.uBackground.value = backgroundTexture || new THREE.Texture();
        uniforms.uHeightmap.value = dynamicDisplacementMap || heightmapTexture || new THREE.Texture();
        uniforms.uHeightScale.value = heightScale;
        uniforms.uScale.value = scale;
        uniforms.uAspect.value = aspect;
    }, [backgroundTexture, dynamicDisplacementMap, heightmapTexture, heightScale, scale, aspect, uniforms]);

    useMemo(() => {
        uniforms.uIsPainting.value = isPaintingMaterial ? 1.0 : 0.0;
    }, [isPaintingMaterial, uniforms]);

    useMemo(() => {
        if (fowTexture) uniforms.uFowTexture.value = fowTexture;
        uniforms.uFowEnabled.value = fowEnabled ? 1.0 : 0.0;
        uniforms.uIsDm.value = isDm ? 1.0 : 0.0;
    }, [fowTexture, fowEnabled, isDm, uniforms]);

    useFrame((state) => {
        uniforms.uTime.value = state.clock.elapsedTime;
        
        let count = 0;
        tokensList.forEach((t) => {
            if (count < 30) {
                const radius = (t.size || 1) * gridSize * 0.5;
                const liveDrag = rtdbDragsRef?.current?.[t.id];
                const px = liveDrag ? liveDrag.x : (t.x || 0);
                const pz = liveDrag ? liveDrag.z : (t.z || 0);
                uniforms.uTokens.value[count].set(px, pz, radius);
                count++;
            }
        });
        for (let i = count; i < 30; i++) {
            uniforms.uTokens.value[i].set(-9999, -9999, 0);
        }
        uniforms.uTokenCount.value = count;
    });

    const onBeforeCompile = (shader) => {
        if (!activeMaskTexture) return; 
        
        shader.uniforms.uTime = uniforms.uTime;
        shader.uniforms.uMaterialMask = uniforms.uMaterialMask;
        shader.uniforms.uTokens = uniforms.uTokens;
        shader.uniforms.uTokenCount = uniforms.uTokenCount;
        shader.uniforms.uIsPainting = uniforms.uIsPainting;

        shader.vertexShader = `
            uniform float uTime;
            uniform sampler2D uMaterialMask;
            varying vec3 vCustomWorldPos;
            varying vec2 vCustomUv;
            ${shader.vertexShader}
        `.replace(
            `#include <begin_vertex>`,
            `
            #include <begin_vertex>
            
            vCustomWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vCustomUv = uv;
            
            vec4 maskColor = texture2D(uMaterialMask, vCustomUv);
            `
        );

        shader.fragmentShader = `
            uniform float uTime;
            uniform float uIsPainting;
            uniform sampler2D uMaterialMask;
            varying vec3 vCustomWorldPos;
            varying vec2 vCustomUv;
            ${shader.fragmentShader}
        `.replace(
            `#include <map_fragment>`,
            `
            #ifdef USE_MAP
              vec2 modifiedUv = vMapUv;
              vec4 preMask = texture2D(uMaterialMask, vCustomUv);
  
              ${animatedEnvironment ? `
              // Blue Channel: Water flow
              if (preMask.b > 0.4 && preMask.r < 0.3 && preMask.g < 0.3) {
                  float flow = uTime * 0.5;
                  modifiedUv.x += sin(modifiedUv.y * 10.0 + flow) * 0.003 + sin(modifiedUv.x * 15.0 - flow * 0.8) * 0.002;
                  modifiedUv.y += cos(modifiedUv.x * 10.0 + flow) * 0.003 + cos(modifiedUv.y * 15.0 - flow * 0.8) * 0.002;
              }
              
              // Yellow Channel: Ice Frost
              if (preMask.r > 0.4 && preMask.g > 0.4 && preMask.b < 0.3) {
                  modifiedUv.x += sin(modifiedUv.y * 150.0) * 0.001;
                  modifiedUv.y += cos(modifiedUv.x * 150.0) * 0.001;
              }
              
              // Magenta Channel: Tree Canopy / Leaves
              if (preMask.r > 0.4 && preMask.b > 0.4 && preMask.g < 0.3) {
                  float rustle = uTime * 1.0;
                  float sway = uTime * 0.25;
                  modifiedUv.x += sin(modifiedUv.y * 40.0 + rustle) * 0.0005 + sin(modifiedUv.x * 5.0 + sway) * 0.001;
                  modifiedUv.y += cos(modifiedUv.x * 40.0 + rustle) * 0.0005 + cos(modifiedUv.y * 5.0 + sway) * 0.001;
              }
              ` : ''}

              vec4 sampledDiffuseColor = texture2D( map, modifiedUv );
              #ifdef DECODE_VIDEO_TEXTURE
                  sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
              #endif
              diffuseColor *= sampledDiffuseColor;

              if (uIsPainting > 0.5) {
                 float maskStrength = max(max(preMask.r, preMask.g), preMask.b);
                 diffuseColor.rgb = mix(diffuseColor.rgb, preMask.rgb, 0.5 * maskStrength);
              }
            #endif
            `
        ).replace(
            `#include <color_fragment>`,
            `
            #include <color_fragment>
            
            vec4 mMaskColorFragment = texture2D(uMaterialMask, vCustomUv);
            
            // Deepen water color slightly to make it look wet
            if (mMaskColorFragment.b > 0.4 && mMaskColorFragment.r < 0.3 && mMaskColorFragment.g < 0.3) {
                diffuseColor.rgb *= 0.85; 
            }
            `
        ).replace(
            `#include <emissivemap_fragment>`,
            `
            #include <emissivemap_fragment>
            vec4 maskColor = texture2D(uMaterialMask, vCustomUv);
            
            // Red Channel: Emissive Pulse (Lava/Magic)
            if (maskColor.r > 0.4 && maskColor.g < 0.3 && maskColor.b < 0.3) {
                ${animatedEnvironment ? `
                float churn = sin(vCustomUv.x * 30.0 + uTime) * cos(vCustomUv.y * 30.0 + uTime);
                float pulse = 1.0 + 0.5 * sin(uTime * 3.0) + (churn * 0.3);
                totalEmissiveRadiance += diffuseColor.rgb * pulse;
                ` : `
                totalEmissiveRadiance += diffuseColor.rgb * 1.5;
                `}
            }
            `
        ).replace(
            `#include <roughnessmap_fragment>`,
            `
            #include <roughnessmap_fragment>
            vec4 mMaskColor = texture2D(uMaterialMask, vCustomUv);
            
            // Blue Channel: Water/Liquid (Highly reflective)
            // Yellow Channel (Red+Green): Ice/Glass (Highly reflective)
            if ((mMaskColor.b > 0.4 && mMaskColor.r < 0.3 && mMaskColor.g < 0.3) || (mMaskColor.r > 0.4 && mMaskColor.g > 0.4 && mMaskColor.b < 0.3)) {
                roughnessFactor = 0.1; 
            }
            `
        );
    };

    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[scale * aspect, scale, subdivisions, subdivisions]} />
                <meshStandardMaterial
                    map={backgroundTexture}
                    displacementMap={dynamicDisplacementMap || heightmapTexture}
                    displacementScale={heightScale}
                    normalMap={resolvedNormalMapUrl ? normalMapTexture : null}
                    normalScale={new THREE.Vector2(1, 1)}
                    onBeforeCompile={onBeforeCompile}
                    customProgramCacheKey={() => (activeMaskTexture ? "masked" : "default") + "_" + animatedEnvironment}
                />
            </mesh>
            {activeMaskTexture && (
                <InstancedGrassHeightmap 
                    scale={scale} 
                    aspect={aspect} 
                    uniforms={uniforms} 
                    animatedEnvironment={animatedEnvironment}
                    fowTexture={fowTexture}
                />
            )}
        </group>
    );
};

export const Heightmap = ({ heightmapUrl, backgroundUrl, normalMapUrl, materialMaskUrl, dynamicMaterialMask, heightScale, scale = 20, aspect = 1, dynamicDisplacementMap, tokensList = [], rtdbDragsRef, gridSize = 1, animatedEnvironment = true, isPaintingMaterial = false, fowTexture, fowEnabled, isDm, playbackRate = 1 }) => {
    const resolvedHeightmapUrl = useResolvedUrl(heightmapUrl);
    const resolvedBackgroundUrl = useResolvedUrl(backgroundUrl);
    const resolvedNormalMapUrl = useResolvedUrl(normalMapUrl);
    const resolvedMaterialMaskUrl = useResolvedUrl(materialMaskUrl);

    if (!resolvedBackgroundUrl) {
        return null;
    }

    return <HeightmapContent 
        resolvedHeightmapUrl={resolvedHeightmapUrl}
        resolvedBackgroundUrl={resolvedBackgroundUrl}
        resolvedNormalMapUrl={resolvedNormalMapUrl}
        resolvedMaterialMaskUrl={resolvedMaterialMaskUrl}
        dynamicMaterialMask={dynamicMaterialMask}
        heightScale={heightScale}
        scale={scale}
        aspect={aspect}
        dynamicDisplacementMap={dynamicDisplacementMap}
        tokensList={tokensList}
        rtdbDragsRef={rtdbDragsRef}
        gridSize={gridSize}
        animatedEnvironment={animatedEnvironment}
        isPaintingMaterial={isPaintingMaterial}
        fowTexture={fowTexture}
        fowEnabled={fowEnabled}
        isDm={isDm}
        playbackRate={playbackRate}
    />
};
