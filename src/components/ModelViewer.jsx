import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows, Html } from '@react-three/drei';
import CharacterModel from './CharacterModel';
import Icon from './Icon';

const CanvasLoader = () => (
    <Html center>
        <div className="flex flex-col items-center gap-2 bg-slate-900/90 backdrop-blur-md px-4 py-3 rounded-xl border border-amber-500/30 text-amber-300 shadow-2xl">
            <Icon name="loader-2" size={24} className="animate-spin text-amber-400" />
            <span className="text-xs font-semibold tracking-wide uppercase">Summoning 3D Mesh...</span>
        </div>
    </Html>
);

const ModelViewer = ({ 
    modelUrl, 
    scale = 1, 
    yOffset = 0, 
    modelRotation = 0, 
    hideBaseIf3D = false, 
    forceStatue = false,
    materialStyle = 'original',
    autoRotate = false,
    accentColor = '#f59e0b'
}) => {
    // Simulated token base safeSize matching tactical VTT standard ratio
    const safeSize = 1.0;
    const showModel = !!modelUrl;

    return (
        <div className="relative w-full h-full">
            <Canvas camera={{ position: [0, 2.1, 3.2], fov: 42 }} shadows>
                <ambientLight intensity={0.5} color="#ffffff" />
                <directionalLight 
                    position={[5, 10, 5]} 
                    intensity={1.6} 
                    castShadow 
                    shadow-mapSize={[1024, 1024]} 
                    shadow-bias={-0.0001} 
                    shadow-normalBias={0.05} 
                />
                <directionalLight position={[-5, 6, -5]} intensity={0.7} color="#90b0d0" />
                <directionalLight position={[0, 4, -8]} intensity={0.5} color="#ffe0b2" />
                
                <Suspense fallback={<CanvasLoader />}>
                    <Environment preset="city" />
                    
                    {/* Token Pedestal Base */}
                    <group position={[0, 0.04, 0]}>
                        {!hideBaseIf3D && (
                            <group>
                                {/* Stone Pedestal Base */}
                                <mesh position={[0, -0.0025, 0]} castShadow receiveShadow>
                                    <cylinderGeometry args={[safeSize * 0.48, safeSize * 0.5, 0.02, 32]} />
                                    <meshStandardMaterial color="#1e293b" roughness={0.8} metalness={0.2} />
                                </mesh>
                                
                                {/* Inner Accent Ring */}
                                <mesh position={[0, 0.008, 0]} castShadow receiveShadow>
                                    <cylinderGeometry args={[safeSize * 0.45, safeSize * 0.45, 0.003, 32]} />
                                    <meshStandardMaterial 
                                        color={accentColor} 
                                        roughness={0.4} 
                                        metalness={0.4} 
                                        emissive={accentColor} 
                                        emissiveIntensity={0.4} 
                                    />
                                </mesh>
        
                                {/* Tactical Facing Direction Indicator Arrow */}
                                <mesh position={[0, 0.01, safeSize * 0.43]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                                    <coneGeometry args={[safeSize * 0.08, safeSize * 0.16, 3]} />
                                    <meshStandardMaterial 
                                        color={accentColor} 
                                        roughness={0.3} 
                                        metalness={0.3} 
                                        emissive={accentColor} 
                                        emissiveIntensity={0.6} 
                                    />
                                </mesh>
                            </group>
                        )}

                        {/* Staged 3D Model with scale, elevation offset, and yaw rotation */}
                        {showModel && (
                            <group 
                                position={[0, 0.0075 + (Number(yOffset || 0) * safeSize), 0]} 
                                rotation={[0, (Number(modelRotation || 0) * Math.PI) / 180, 0]}
                            >
                                <CharacterModel 
                                    modelUrl={modelUrl} 
                                    scale={Number(scale || 1) * safeSize} 
                                    forceStatue={forceStatue}
                                    materialStyle={materialStyle} 
                                />
                            </group>
                        )}
                    </group>

                    {/* Ground grid & contact shadow */}
                    <Grid 
                        infiniteGrid 
                        fadeDistance={6} 
                        sectionColor="#475569" 
                        cellColor="#1e293b" 
                        sectionSize={1} 
                        cellSize={0.25} 
                    />
                    <ContactShadows 
                        resolution={512} 
                        scale={8} 
                        blur={2} 
                        opacity={0.6} 
                        far={10} 
                        color="#000000" 
                        position={[0, 0, 0]} 
                    />
                </Suspense>
                
                <OrbitControls 
                    target={[0, 0.85 + (Number(yOffset || 0) * 0.5), 0]}
                    minPolarAngle={0.05} 
                    maxPolarAngle={Math.PI / 2 + 0.15} 
                    minDistance={0.5}
                    maxDistance={8.0}
                    enablePan={true} 
                    autoRotate={autoRotate} 
                    autoRotateSpeed={1.5} 
                />
            </Canvas>
        </div>
    );
};

export default ModelViewer;
