import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import CharacterModel from './CharacterModel';

const ModelViewer = ({ modelUrl, scale = 1, yOffset = 0 }) => {
    // We use a simulated safeSize of 1.0 to match the typical VTT grid size ratio
    const safeSize = 1.0;
    return (
        <Canvas camera={{ position: [0, 1.5, 2.5], fov: 45 }}>
            <ambientLight intensity={0.6} color="#ffffff" />
            <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
            <directionalLight position={[-5, 5, -5]} intensity={0.5} color="#90b0d0" />
            <directionalLight position={[0, 5, -10]} intensity={0.3} color="#ffe0b2" />
            
            <Suspense fallback={null}>
                {/* Simulated Token Base to match VTT */}
                <group position={[0, 0.04, 0]}>
                    <group>
                        {/* Stone Pedestal Base */}
                        <mesh position={[0, -0.0025, 0]}>
                            <cylinderGeometry args={[safeSize * 0.48, safeSize * 0.5, 0.015, 32]} />
                            <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.1} />
                        </mesh>
                        
                        {/* Inner colored accent ring */}
                        <mesh position={[0, 0.006, 0]}>
                            <cylinderGeometry args={[safeSize * 0.46, safeSize * 0.46, 0.002, 32]} />
                            <meshStandardMaterial color="#3b82f6" roughness={0.5} metalness={0.2} emissive="#3b82f6" emissiveIntensity={0.5} />
                        </mesh>

                        {/* Direction Cone */}
                        <mesh position={[0, 0.006, safeSize * 0.45]} rotation={[Math.PI / 2, 0, 0]}>
                            <coneGeometry args={[safeSize * 0.15, safeSize * 0.2, 3]} />
                            <meshStandardMaterial color="#3b82f6" roughness={0.5} metalness={0.2} emissive="#3b82f6" emissiveIntensity={0.5} />
                        </mesh>
                    </group>

                    {/* The Model */}
                    <group position={[0, 0.0075 + (yOffset * safeSize), 0]}>
                        <CharacterModel modelUrl={modelUrl} scale={scale * safeSize} />
                    </group>
                </group>

                {/* Ground plane reference */}
                <Grid infiniteGrid fadeDistance={5} sectionColor="#475569" cellColor="#334155" />
            </Suspense>
            
            <OrbitControls minPolarAngle={0} maxPolarAngle={Math.PI / 2 + 0.1} enablePan={false} />
        </Canvas>
    );
};

export default ModelViewer;
