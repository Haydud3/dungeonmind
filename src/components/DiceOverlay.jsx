import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Float, Environment, ContactShadows, Edges } from '@react-three/drei';
import * as THREE from 'three';

const Die3D = ({ type, result }) => {
    const meshRef = useRef();
    const [stopped, setStopped] = useState(false);
    
    useFrame((state, delta) => {
        if (!meshRef.current) return;
        if (!stopped) {
            meshRef.current.rotation.x += delta * 15;
            meshRef.current.rotation.y += delta * 12;
            meshRef.current.rotation.z += delta * 8;
        } else {
            // Smooth snap to zero
            const speed = delta * 8;
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, speed);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, speed);
            meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, speed);
        }
    });

    useEffect(() => {
        const timer = setTimeout(() => setStopped(true), 800);
        return () => clearTimeout(timer);
    }, []);

    let geometry;
    // D&D Orange color
    const baseColor = "#d97706"; 
    
    switch (parseInt(type)) {
        case 4: geometry = <tetrahedronGeometry args={[1.6]} />; break;
        case 6: geometry = <boxGeometry args={[2, 2, 2]} />; break;
        case 8: geometry = <octahedronGeometry args={[1.6]} />; break;
        case 10: geometry = <octahedronGeometry args={[1.6]} />; break; // D10 is complex, using octahedron approx
        case 12: geometry = <dodecahedronGeometry args={[1.6]} />; break;
        case 20: geometry = <icosahedronGeometry args={[1.6]} />; break;
        default: geometry = <boxGeometry args={[2, 2, 2]} />;
    }

    return (
        <group>
            <Float speed={5} rotationIntensity={1} floatIntensity={0.5}>
                <mesh ref={meshRef}>
                    {geometry}
                    {/* Glassy Plastic Material */}
                    <meshPhysicalMaterial 
                        color={baseColor} 
                        roughness={0.2} 
                        metalness={0.1} 
                        clearcoat={1} 
                        clearcoatRoughness={0.1}
                    />
                    {/* Outline Edges for "Cartoon/Sketch" definition */}
                    <Edges threshold={15} color="#fbbf24" />
                </mesh>
            </Float>

            {/* The Result Text */}
            {stopped && (
                <Text
                    position={[0, 0, 2.2]}
                    fontSize={1.8}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.08}
                    outlineColor="#78350f"
                >
                    {result}
                </Text>
            )}
        </group>
    );
};

const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
            {/* Darken background slightly to focus attention */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-all duration-500"></div>
            
            <div className="w-[300px] h-[300px] relative z-10">
                <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1.5} />
                    
                    {/* Realistic Environment Reflection (Sunset looks nice on orange dice) */}
                    <Environment preset="sunset" />
                    
                    <Die3D type={roll.die} result={roll.result} />
                    
                    {/* Shadow on the "floor" */}
                    <ContactShadows position={[0, -2, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />
                </Canvas>
            </div>
        </div>
    );
};

export default DiceOverlay;
