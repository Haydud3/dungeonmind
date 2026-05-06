import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { retrieveChunkedMap } from '../utils/storageUtils';
import * as THREE from 'three';

const CharacterModel = ({ modelUrl, scale, forceStatue, opacity = 1 }) => {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let objectUrl;
        const loadModel = async () => {
            try {
                if (modelUrl && modelUrl.startsWith('chunked:')) {
                    const blob = await retrieveChunkedMap(modelUrl);
                    if (blob) {
                        objectUrl = URL.createObjectURL(blob);
                        setUrl(objectUrl);
                    } else {
                        throw new Error('Failed to retrieve chunked model data.');
                    }
                } else if (modelUrl) {
                    setUrl(modelUrl);
                } else {
                    setUrl(null);
                }
            } catch (e) {
                console.error("Error loading model:", e);
                setError(e.message);
            }
        };

        loadModel();

        return () => {
            if (objectUrl) {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
            }
        };
    }, [modelUrl]);

    if (error) return <mesh position={[0, 1, 0]}><boxGeometry /><meshStandardMaterial color="red" /></mesh>;
    if (!url) return null;

    return (
        <Suspense fallback={null}>
            <GLTFModel url={url} scale={scale} forceStatue={forceStatue} opacity={opacity} />
        </Suspense>
    )
};

const GLTFModel = ({ url, scale, forceStatue, opacity = 1 }) => {
    const { scene } = useGLTF(url);

    const statueMaterial = useMemo(() => {
        const mat = new THREE.MeshStandardMaterial({
            color: '#a0aab5', // base stone gray
            roughness: 0.9,
            metalness: 0.1,
            transparent: opacity < 1,
            opacity: opacity
        });

        mat.onBeforeCompile = (shader) => {
            // Pass world position from vertex to fragment shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `
                #include <common>
                varying vec3 vWorldPos;
                `
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `
                #include <worldpos_vertex>
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                `
            );
            
            // Add noise function and modify color and normal
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `
                #include <common>
                varying vec3 vWorldPos;
                
                // Simple 3D noise
                float hash(vec3 p) {
                    p = fract(p * 0.3183099 + .1);
                    p *= 17.0;
                    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                }
                
                float noise(vec3 x) {
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    f = f * f * (3.0 - 2.0 * f);
                    
                    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
                }
                `
            );
            
            // Modify diffuse color based on noise
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                float n1 = noise(vWorldPos * 50.0);
                float n2 = noise(vWorldPos * 200.0);
                float totalNoise = n1 * 0.7 + n2 * 0.3;
                
                // Mix between dark gray and light gray
                vec3 stoneColor = mix(vec3(0.45, 0.47, 0.49), vec3(0.75, 0.78, 0.8), totalNoise);
                diffuseColor.rgb *= stoneColor;
                `
            );

            // Perturb normal to create bumpiness
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                `
                #include <normal_fragment_begin>
                
                // Calculate gradient of noise for bump mapping
                vec3 eps = vec3(0.01, 0.0, 0.0);
                float nx = noise(vWorldPos * 100.0 + eps.xyy) - noise(vWorldPos * 100.0 - eps.xyy);
                float ny = noise(vWorldPos * 100.0 + eps.yxy) - noise(vWorldPos * 100.0 - eps.yxy);
                float nz = noise(vWorldPos * 100.0 + eps.yyx) - noise(vWorldPos * 100.0 - eps.yyx);
                
                vec3 noiseNormal = normalize(vec3(nx, ny, nz));
                // Blend with original normal
                normal = normalize(normal + noiseNormal * 0.4);
                `
            );
        };
        return mat;
    }, [opacity]);

    const clonedScene = useMemo(() => {
        const clone = scene.clone(true);
        const applyOpacity = (material) => {
            if (opacity < 1) {
                const newMat = material.clone();
                newMat.transparent = true;
                newMat.opacity = opacity;
                return newMat;
            }
            return material;
        };

        const isUntextured = (mat) => {
            return mat && !mat.map && !mat.vertexColors;
        };

        clone.traverse((child) => {
            if (child.isMesh) {
                if (forceStatue) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => applyOpacity(mat.map || mat.vertexColors ? mat : statueMaterial));
                    } else if (isUntextured(child.material)) {
                        child.material = statueMaterial;
                    } else {
                        child.material = applyOpacity(child.material);
                    }
                } else if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => applyOpacity(isUntextured(mat) ? statueMaterial : mat));
                    } else {
                        child.material = applyOpacity(isUntextured(child.material) ? statueMaterial : child.material);
                    }
                }
            }
        });
        return clone;
    }, [scene, forceStatue, statueMaterial, opacity]);

    // Auto-Size & Auto-Align: Calculate bounding box of the raw model
    const { normalizedScale, bottomOffset, centerOffsetX, centerOffsetZ } = useMemo(() => {
        if (!scene) return { normalizedScale: 1, bottomOffset: 0, centerOffsetX: 0, centerOffsetZ: 0 };
        
        // Ensure matrices are updated before calculating bounds, fixes invisible scales from certain GLTF exporters
        scene.updateMatrixWorld(true);
        
        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        
        let calcScale = 1.5; 
        // Fallback checks just in case the GLTF is completely empty/unbounded
        if (maxDim > 0.0001 && isFinite(maxDim)) {
            // Multiply by 1.5 to double the default base size
            calcScale = (1.0 / maxDim) * 1.5;
        }
        
        // Calculate the lowest Y point so we can shift it exactly to the floor (0)
        const calcBottomOffset = isFinite(box.min.y) ? -box.min.y : 0;
        
        // Calculate center for X and Z to ensure the model sits strictly in the middle of the grid
        const calcCenterOffsetX = isFinite(box.max.x) && isFinite(box.min.x) ? -(box.max.x + box.min.x) / 2 : 0;
        const calcCenterOffsetZ = isFinite(box.max.z) && isFinite(box.min.z) ? -(box.max.z + box.min.z) / 2 : 0;

        return { 
            normalizedScale: calcScale, 
            bottomOffset: calcBottomOffset,
            centerOffsetX: calcCenterOffsetX,
            centerOffsetZ: calcCenterOffsetZ
        };
    }, [scene]);

    return (
        <group scale={scale * normalizedScale}>
            <group position={[centerOffsetX, bottomOffset, centerOffsetZ]}>
                <primitive object={clonedScene} />
            </group>
        </group>
    );
}

export default CharacterModel;
