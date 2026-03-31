import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useGLTF, Center } from '@react-three/drei';
import { retrieveChunkedMap } from '../utils/storageUtils';
import * as THREE from 'three';

const CharacterModel = ({ modelUrl, scale, forceStatue }) => {
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
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [modelUrl]);

    if (error) return <mesh position={[0, 1, 0]}><boxGeometry /><meshStandardMaterial color="red" /></mesh>;
    if (!url) return null;

    return (
        <Suspense fallback={null}>
            <GLTFModel url={url} scale={scale} forceStatue={forceStatue} />
        </Suspense>
    )
};

const GLTFModel = ({ url, scale, forceStatue }) => {
    const { scene } = useGLTF(url);

    const statueMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#94a3b8', // slate-400
        roughness: 0.7,
        metalness: 0.2,
    }), []);

    const clonedScene = useMemo(() => {
        const clone = scene.clone(true);
        if (forceStatue) {
            clone.traverse((child) => {
                if (child.isMesh) {
                    // Ensure we don't override materials that already have textures
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => mat.map ? mat : statueMaterial);
                    } else if (child.material && !child.material.map) {
                        child.material = statueMaterial;
                    }
                }
            });
        }
        return clone;
    }, [scene, forceStatue, statueMaterial]);


    return (
        <Center>
            <primitive object={clonedScene} scale={scale} />
        </Center>
    );
}

export default CharacterModel;
