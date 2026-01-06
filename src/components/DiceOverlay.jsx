import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Float, Environment, ContactShadows, Edges } from '@react-three/drei';
import * as THREE from 'three';

// --- HELPER: SCATTER DECOY NUMBERS ---
// This component places random numbers on the die surface to make it look "real"
const DecoyNumbers = ({ type, radius }) => {
    // Generate ~12 random positions around a sphere
    const decoys = useMemo(() => {
        const arr = [];
        const count = type === 20 ? 12 : 6; // More numbers for D20
        const goldenRatio = (1 + 5 ** 0.5) / 2;
        
        for (let i = 0; i < count; i++) {
            // Fibonacci Sphere distribution (keeps them evenly spaced)
            const theta = 2 * Math.PI * i / goldenRatio;
            const phi = Math.acos(1 - 2 * (i + 0.5) / count);
            
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            // Don't put a decoy on the very top (where result goes)
            if (z > radius * 0.8) continue; 
            if (z < -radius * 0.8) continue; // Skip bottom too

            // Random number between 1 and type
            const val = Math.floor(Math.random() * type) + 1;
            arr.push({ pos: [x, y, z], val });
        }
        return arr;
    }, [type, radius]);

    return (
        <group>
            {decoys.map((d, i) => (
                <Text
                    key={i}
                    position={d.pos}
                    rotation={[0, 0, 0]} // Simplified rotation
                    lookAt={d.pos.map(v => v * 2)} // Make text face outward
                    fontSize={type === 20 ? 0.25 : 0.4}
                    color="#fbbf24" // Amber Gold
                    font="https://fonts.gstatic.com/s/cinzel/v11/8vIJ7ww63mVu7gt78Uk.woff" // Cinzel Font
                    anchorX="center"
                    anchorY="middle"
                    fillOpacity={0.6}
                >
                    {d.val}
                </Text>
            ))}
        </group>
    );
};

const Die3D = ({ type, result }) => {
    const meshRef = useRef();
    const [stopped, setStopped] = useState(false);
    
    // Spin Logic
    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        if (!stopped) {
            // Fast chaotic spin
            meshRef.current.rotation.x += delta * 20;
            meshRef.current.rotation.y += delta * 15;
            meshRef.current.rotation.z += delta * 10;
        } else {
            // Snap to 0,0,0 (Top Face Up)
            const speed = delta * 12;
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, speed);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, speed);
            meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, speed);
        }
    });

    useEffect(() => {
        const timer = setTimeout(() => setStopped(true), 800);
        return () => clearTimeout(timer);
    }, []);

    // Geometry Selection
    let GeometryComponent = THREE.BoxGeometry;
    let args = [2, 2, 2];
    let radius = 1; // Approximate radius for placing numbers
    
    switch (parseInt(type)) {
        case 4: 
            GeometryComponent = THREE.TetrahedronGeometry; 
            args = [1.8]; 
            radius = 1.2;
            break;
        case 6: 
            GeometryComponent = THREE.BoxGeometry; 
            args = [2, 2, 2]; 
            radius = 1.01; // Just on surface
            break;
        case 8: 
            GeometryComponent = THREE.OctahedronGeometry; 
            args = [1.8]; 
            radius = 1.2;
            break;
        case 10: 
            // D10 approximation (stretched octahedron)
            GeometryComponent = THREE.OctahedronGeometry; 
            args = [1.8];
            radius = 1.2;
            break;
        case 12: 
            GeometryComponent = THREE.DodecahedronGeometry; 
            args = [1.7]; 
            radius = 1.4;
            break;
        case 20: 
            GeometryComponent = THREE.IcosahedronGeometry; 
            args = [1.8]; 
            radius = 1.6;
            break;
        default: 
            GeometryComponent = THREE.BoxGeometry; 
            args = [2, 2, 2];
            radius = 1.1;
    }

    return (
        <group>
            <Float speed={5} rotationIntensity={0.5} floatIntensity={0.5}>
                <group ref={meshRef}>
                    {/* THE DIE SHAPE */}
                    <mesh>
                        <primitive object={new GeometryComponent(...args)} />
                        {/* Obsidian / Dark Stone Material */}
                        <meshStandardMaterial 
                            color="#1c1917" // Warm Black
                            roughness={0.2}
                            metalness={0.5}
                            envMapIntensity={1}
                        />
                        {/* Gold Edges */}
                        <Edges threshold={10} color="#b45309" />
                    </mesh>

                    {/* DECOY NUMBERS (Sides) */}
                    <DecoyNumbers type={type} radius={radius} />

                    {/* RESULT NUMBER (Always Top Face) */}
                    <Text
                        position={[0, 0, radius + 0.05]} // Slightly above top face
                        rotation={[0, 0, 0]}
                        fontSize={type === 20 ? 0.8 : 1}
                        color="#fbbf24" // Bright Amber
                        font="https://fonts.gstatic.com/s/cinzel/v11/8vIJ7ww63mVu7gt78Uk.woff"
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.05}
                        outlineColor="#451a03"
                    >
                        {result}
                    </Text>
                </group>
            </Float>
        </group>
    );
};

const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
            {/* Dark Backdrop for Drama */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"></div>
            
            <div className="w-[320px] h-[320px] relative z-10 animate-in zoom-in duration-300">
                <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
                    <ambientLight intensity={0.5} />
                    
                    {/* Dynamic Lighting for "Magical" feel */}
                    <pointLight position={[10, 10, 10]} intensity={1.5} color="#fbbf24" />
                    <pointLight position={[-10, -5, -5]} intensity={1} color="#ef4444" />
                    
                    <Environment preset="lobby" />
                    
                    <Die3D type={roll.die} result={roll.result} />
                    
                    {/* Shadow */}
                    <ContactShadows position={[0, -2.5, 0]} opacity={0.6} scale={10} blur={2} far={4.5} color="#000" />
                </Canvas>
            </div>
        </div>
    );
};

export default DiceOverlay;
