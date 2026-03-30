import React, { useState, useEffect, Suspense } from 'react';
import { useGLTF, Center } from '@react-three/drei';
import { retrieveChunkedMap } from '../utils/storageUtils';

const CharacterModel = ({ modelUrl, scale }) => {
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
            <GLTFModel url={url} scale={scale} />
        </Suspense>
    )
};

const GLTFModel = ({ url, scale }) => {
    const { scene } = useGLTF(url);
    return (
        <Center>
            <primitive object={scene.clone(true)} scale={scale} />
        </Center>
    );
}

export default CharacterModel;
