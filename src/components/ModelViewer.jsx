import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Circle, Center } from '@react-three/drei';
import { retrieveChunkedMap } from '../utils/storageUtils';

const Model = ({ modelUrl, scale }) => {
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

    const { scene } = useGLTF(url);
    return (
        <Center>
            <primitive object={scene} scale={scale} />
        </Center>
    );
};

const ModelViewer = ({ modelUrl, scale = 1, yOffset = 0 }) => {
    return (
        <Canvas camera={{ position: [0, 2, 4], fov: 50 }}>
            <ambientLight intensity={0.8} />
            <spotLight intensity={0.5} angle={0.1} penumbra={1} position={[10, 15, 10]} castShadow />
            <Suspense fallback={null}>
                <group position={[0, yOffset, 0]}>
                    <Model modelUrl={modelUrl} scale={scale} />
                </group>
                <Circle args={[1, 32]} rotation-x={-Math.PI / 2} receiveShadow>
                    <meshStandardMaterial color="#444" />
                </Circle>
            </Suspense>
            <OrbitControls minPolarAngle={0} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
    );
};

export default ModelViewer;
