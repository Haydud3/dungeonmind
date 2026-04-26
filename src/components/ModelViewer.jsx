import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Center, Grid } from '@react-three/drei';
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
                setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
            }
        };
    }, [modelUrl]);

    if (error) return <mesh position={[0, 1, 0]}><boxGeometry /><meshStandardMaterial color="red" /></mesh>;
    if (!url) return null;

    const { scene } = useGLTF(url);
    return (
        <Center bottom>
            <primitive object={scene} scale={scale} />
        </Center>
    );
};

const ModelViewer = ({ modelUrl, scale = 1, yOffset = 0 }) => {
    // We use a simulated safeSize of 0.8 to match the typical VTT grid size ratio
    const safeSize = 0.8;
    return (
        <Canvas camera={{ position: [0, 1.5, 2.5], fov: 45 }}>
            <ambientLight intensity={0.6} color="#ffffff" />
            <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
            <directionalLight position={[-5, 5, -5]} intensity={0.5} color="#90b0d0" />
            <directionalLight position={[0, 5, -10]} intensity={0.3} color="#ffe0b2" />
            
            <Suspense fallback={null}>
                {/* Simulated Token Base to match VTT */}
                <group>
                    {/* Stone Pedestal Base */}
                    <mesh position={[0, 0.02, 0]}>
                        <cylinderGeometry args={[safeSize * 0.48, safeSize * 0.5, 0.04, 32]} />
                        <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.1} />
                    </mesh>
                    
                    {/* Inner colored accent ring */}
                    <mesh position={[0, 0.045, 0]}>
                        <cylinderGeometry args={[safeSize * 0.46, safeSize * 0.46, 0.01, 32]} />
                        <meshStandardMaterial color="#3b82f6" roughness={0.5} metalness={0.2} emissive="#3b82f6" emissiveIntensity={0.5} />
                    </mesh>
                </group>

                {/* The Model */}
                <group position={[0, 0.05 + (yOffset * safeSize), 0]}>
                    <Model modelUrl={modelUrl} scale={scale * safeSize} />
                </group>

                {/* Ground plane reference */}
                <Grid infiniteGrid fadeDistance={5} sectionColor="#475569" cellColor="#334155" />
            </Suspense>
            
            <OrbitControls minPolarAngle={0} maxPolarAngle={Math.PI / 2 + 0.1} enablePan={false} />
        </Canvas>
    );
};

export default ModelViewer;
