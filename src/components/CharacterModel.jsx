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

    const statueMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#94a3b8', // slate-400
        roughness: 0.7,
        metalness: 0.2,
        transparent: opacity < 1,
        opacity: opacity
    }), [opacity]);

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

        clone.traverse((child) => {
            if (child.isMesh) {
                if (forceStatue) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => applyOpacity(mat.map ? mat : statueMaterial));
                    } else if (child.material && !child.material.map) {
                        child.material = statueMaterial;
                    } else {
                        child.material = applyOpacity(child.material);
                    }
                } else if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(applyOpacity);
                    } else {
                        child.material = applyOpacity(child.material);
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
