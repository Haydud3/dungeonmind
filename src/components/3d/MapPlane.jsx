import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useResolvedUrl } from '../../utils/useResolvedUrl';
import { useFrame } from '@react-three/fiber';

export const InstancedGrass = ({ scale = 20, aspect = 1, uniforms: parentUniforms, animatedEnvironment = true }) => {
    const meshRef = useRef();
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

    const onBeforeCompile = (shader) => {
        shader.uniforms.uMaterialMask = parentUniforms.uMaterialMask;
        shader.uniforms.uBackground = parentUniforms.uBackground;
        shader.uniforms.uScale = parentUniforms.uScale;
        shader.uniforms.uAspect = parentUniforms.uAspect;
        shader.uniforms.uTime = parentUniforms.uTime;
        shader.uniforms.uTokens = parentUniforms.uTokens;
        shader.uniforms.uTokenCount = parentUniforms.uTokenCount;

        shader.vertexShader = `
            uniform sampler2D uMaterialMask;
            uniform sampler2D uBackground;
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
                
                vVisibility = minVisibility * step(0.01, lodFade);

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
        <instancedMesh key={count} ref={meshRef} args={[geometry, null, count]} castShadow receiveShadow position={[0, -0.01, 0]} frustumCulled={false}>
            <meshLambertMaterial alphaMap={grassAlphaMap} alphaTest={0.5} side={THREE.DoubleSide} onBeforeCompile={onBeforeCompile} customProgramCacheKey={() => "grass_plane_" + animatedEnvironment} />
        </instancedMesh>
    );
};

export const MapPlaneContent = ({ backgroundUrl, materialMaskUrl, dynamicMaterialMask, scale = 20, tokensList = [], rtdbDragsRef, gridSize = 1, animatedEnvironment = true, isPaintingMaterial = false }) => {
  const [aspect, setAspect] = useState(1);
  const texture = useMemo(() => {
      if (!backgroundUrl) return null;
      const loader = new THREE.TextureLoader();
      return loader.load(backgroundUrl, (tex) => {
          if (tex.image) {
              setAspect(tex.image.width / tex.image.height);
          }
      });
  }, [backgroundUrl]);

  const materialMaskTexture = useMemo(() => {
      if (!materialMaskUrl) return null;
      const loader = new THREE.TextureLoader();
      return loader.load(materialMaskUrl, (tex) => {
          tex.colorSpace = THREE.NoColorSpace;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.needsUpdate = true;
      });
  }, [materialMaskUrl]);
  
  const activeMaskTexture = dynamicMaterialMask || materialMaskTexture;

  const uniforms = useMemo(() => {
      const tokenVecs = Array(30).fill(null).map(() => new THREE.Vector3(-9999, -9999, 0));
      return {
          uTime: { value: 0 },
          uMaterialMask: { value: new THREE.Texture() },
          uBackground: { value: new THREE.Texture() },
          uScale: { value: scale },
          uAspect: { value: aspect },
          uTokens: { value: tokenVecs },
          uTokenCount: { value: 0 },
          uIsPainting: { value: 0 }
      };
  }, []);

  useMemo(() => {
      uniforms.uMaterialMask.value = activeMaskTexture || new THREE.Texture();
  }, [activeMaskTexture, uniforms]);

  useMemo(() => {
      uniforms.uBackground.value = texture || new THREE.Texture();
      uniforms.uScale.value = scale;
      uniforms.uAspect.value = aspect;
  }, [texture, scale, aspect, uniforms]);

  useMemo(() => {
      uniforms.uIsPainting.value = isPaintingMaterial ? 1.0 : 0.0;
  }, [isPaintingMaterial, uniforms]);

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

  const segments = activeMaskTexture ? 128 : 1;

  return (
    <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[scale * aspect, scale, segments, segments]} />
          <meshStandardMaterial 
              map={texture} 
              transparent={true} 
              roughness={0.8} 
              metalness={0.1} 
              onBeforeCompile={onBeforeCompile}
              customProgramCacheKey={() => (activeMaskTexture ? "masked" : "default") + "_" + animatedEnvironment}
          />
        </mesh>
        {activeMaskTexture && <InstancedGrass scale={scale} aspect={aspect} uniforms={uniforms} animatedEnvironment={animatedEnvironment} />}
    </group>
  );
};

export const MapPlane = ({ backgroundUrl, materialMaskUrl, dynamicMaterialMask, scale = 20, tokensList = [], rtdbDragsRef, gridSize = 1, animatedEnvironment = true, isPaintingMaterial = false }) => {
  const resolvedUrl = useResolvedUrl(backgroundUrl);
  const resolvedMaterialMaskUrl = useResolvedUrl(materialMaskUrl);

  if (!resolvedUrl) return null;
  return <MapPlaneContent backgroundUrl={resolvedUrl} materialMaskUrl={resolvedMaterialMaskUrl} dynamicMaterialMask={dynamicMaterialMask} scale={scale} tokensList={tokensList} rtdbDragsRef={rtdbDragsRef} gridSize={gridSize} animatedEnvironment={animatedEnvironment} isPaintingMaterial={isPaintingMaterial} />;
};
