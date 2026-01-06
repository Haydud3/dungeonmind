import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Float } from '@react-three/drei';
import * as THREE from 'three';

// --- INDIVIDUAL DIE COMPONENT ---
const Die3D = ({ type, result }) => {
    const meshRef = useRef();
    const [stopped, setStopped] = useState(false);
    
    // Spin logic
    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        if (!stopped) {
            // Chaotic spin speed
            meshRef.current.rotation.x += delta * 15;
            meshRef.current.rotation.y += delta * 12;
            meshRef.current.rotation.z += delta * 8;
        } else {
            // Smooth snap to "Face Up" (Zero rotation)
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 10);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, delta * 10);
            meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, delta * 10);
        }
    });

    useEffect(() => {
        // Stop spinning after 0.8s
        const timer = setTimeout(() => setStopped(true), 800);
        return () => clearTimeout(timer);
    }, []);

    // Select Geometry based on die type
    let geometry;
    let color = "#d97706"; // Amber-600 (D&D Orange)
    let scale = 1.5;

    // Use standard Three.js Geometries for shapes
    switch (parseInt(type)) {
        case 4: 
            geometry = <tetrahedronGeometry args={[1.5]} />; 
            break;
        case 6: 
            geometry = <boxGeometry args={[2, 2, 2]} />; 
            break;
        case 8: 
            geometry = <octahedronGeometry args={[1.5]} />; 
            break;
        case 10: 
            // D10 approximation (Octahedron stretched vertically)
            geometry = <octahedronGeometry args={[1.5]} />;
            scale = [1, 1.4, 1]; 
            break;
        case 12: 
            geometry = <dodecahedronGeometry args={[1.5]} />; 
            break;
        case 20: 
            geometry = <icosahedronGeometry args={[1.5]} />; 
            break;
        case 100: 
            geometry = <sphereGeometry args={[1.5, 32, 32]} />; 
            break;
        default: 
            geometry = <boxGeometry args={[2, 2, 2]} />;
    }

    return (
        <group>
            <Float speed={5} rotationIntensity={2} floatIntensity={1}>
                <mesh ref={meshRef} scale={Array.isArray(scale) ? scale : [scale, scale, scale]}>
                    {geometry}
                    <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
                </mesh>
            </Float>
            
            {/* The Result Text - Fades in when stopped */}
            {stopped && (
                <Text
                    position={[0, 0, 2.5]} // Float clearly in front
                    fontSize={2}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.1}
                    outlineColor="black"
                >
                    {result}
                </Text>
            )}
        </group>
    );
};

// --- MAIN OVERLAY COMPONENT ---
const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all duration-300">
            <div className="w-[300px] h-[300px]">
                <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
                    {/* Lighting */}
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1.5} />
                    <pointLight position={[-10, -10, -10]} color="orange" intensity={1} />
                    
                    {/* The Die */}
                    <Die3D type={roll.die} result={roll.result} />
                </Canvas>
            </div>
        </div>
    );
};

export default DiceOverlay;
