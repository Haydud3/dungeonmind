import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, Environment, ContactShadows, Edges, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// --- GEOMETRY & NUMBER PLACEMENT ---
// This helper generates positions for numbers on complex shapes (D12, D20)
// It ensures one number is always exactly on top (the result).
const getNumberPositions = (sides, radius) => {
    const positions = [];
    
    // 1. ALWAYS place the Result Number at the "North Pole" (Top)
    // We adjust rotation later to make sure this faces the camera
    positions.push({ pos: [0, radius, 0], isResult: true });

    // 2. Generate decoys for the other sides
    // We use a Fibonacci Sphere algorithm to distribute them evenly
    const count = sides - 1; 
    const goldenRatio = (1 + 5 ** 0.5) / 2;

    for (let i = 0; i < count; i++) {
        const theta = 2 * Math.PI * i / goldenRatio;
        const phi = Math.acos(1 - 2 * (i + 1) / (count + 2)); // Offset to avoid top pole

        // Convert spherical to cartesian
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta); // This creates a band around the middle
        const z = radius * Math.cos(phi);
        
        // Flip Y to distribute them mostly on the bottom/sides (away from top result)
        positions.push({ pos: [x, -Math.abs(z), y], isResult: false });
    }
    return positions;
};

// Explicit mapping for a D6 to ensure it looks perfect
const D6_FACES = [
    { pos: [0, 1.05, 0], rot: [-Math.PI/2, 0, 0], isResult: true }, // Top
    { pos: [0, -1.05, 0], rot: [Math.PI/2, 0, 0] }, // Bottom
    { pos: [0, 0, 1.05], rot: [0, 0, 0] }, // Front
    { pos: [0, 0, -1.05], rot: [0, Math.PI, 0] }, // Back
    { pos: [1.05, 0, 0], rot: [0, Math.PI/2, 0] }, // Right
    { pos: [-1.05, 0, 0], rot: [0, -Math.PI/2, 0] }, // Left
];

const DieMesh = ({ type, result }) => {
    const meshRef = useRef();
    const [time, setTime] = useState(0);
    
    // Config based on die type
    const config = useMemo(() => {
        switch (parseInt(type)) {
            case 4: return { geo: <tetrahedronGeometry args={[1.8]} />, radius: 1.1, sides: 4 };
            case 6: return { geo: <boxGeometry args={[2, 2, 2]} />, radius: 1.1, sides: 6 };
            case 8: return { geo: <octahedronGeometry args={[1.8]} />, radius: 1.2, sides: 8 };
            case 10: return { geo: <octahedronGeometry args={[1.8]} />, scale: [1, 1.3, 1], radius: 1.2, sides: 10 };
            case 12: return { geo: <dodecahedronGeometry args={[1.7]} />, radius: 1.4, sides: 12 };
            case 20: return { geo: <icosahedronGeometry args={[1.8]} />, radius: 1.6, sides: 20 };
            default: return { geo: <boxGeometry args={[2, 2, 2]} />, radius: 1.1, sides: 6 };
        }
    }, [type]);

    // Generate number locations
    const faceData = useMemo(() => {
        if (parseInt(type) === 6) {
            // Assign random numbers to the non-result faces
            const others = [1,2,3,4,5,6].filter(n => n !== result);
            return D6_FACES.map((face, i) => ({
                ...face,
                val: face.isResult ? result : others[i % others.length]
            }));
        } else {
            const positions = getNumberPositions(config.sides, config.radius);
            return positions.map(p => ({
                ...p,
                val: p.isResult ? result : Math.floor(Math.random() * parseInt(type)) + 1,
                // LookAt calc is handled in render
            }));
        }
    }, [type, result, config]);

    // ANIMATION LOOP
    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        // Advance time (Physics Simulation)
        // t goes from 0 to 1 over approx 1.5 seconds
        const speed = 1.2;
        const newTime = Math.min(time + delta * speed, 1);
        setTime(newTime);

        const t = newTime;
        
        // 1. POSITION: Fly in from left (-15) to center (0)
        // EaseOutQuart: 1 - pow(1 - x, 4)
        const easeOut = 1 - Math.pow(1 - t, 4);
        const startX = -12;
        const currentX = startX + (0 - startX) * easeOut;
        
        // 2. BOUNCE: Bouncing ball physics (Abs Sin wave that decays)
        // Decays as (1-t)
        const bounceFreq = 15;
        const bounceHeight = 6 * Math.pow(1 - t, 2); // Decay energy
        const currentY = Math.abs(Math.sin(t * bounceFreq)) * bounceHeight;

        meshRef.current.position.set(currentX, currentY, 0);

        // 3. ROTATION: Spin wildly, then settle to 0,0,0
        // Since our "Result" is at Top (0, radius, 0), stopping at 0,0,0 rotation
        // ensures the result faces Up/Camera.
        if (t < 1) {
            // Spin based on remaining distance
            const spinSpeed = (1 - t) * 20; 
            meshRef.current.rotation.x += spinSpeed * delta;
            meshRef.current.rotation.z -= spinSpeed * delta; // Roll forward
            meshRef.current.rotation.y += (spinSpeed * 0.5) * delta;
        } else {
            // Snap to perfect alignment at the end
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0.4, delta * 10); // Tilt slightly to camera
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, delta * 10);
            meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, delta * 10);
        }
    });

    return (
        <group ref={meshRef}>
            <mesh scale={config.scale || [1,1,1]}>
                {config.geo}
                {/* Material: Dark Obsidian/Onyx */}
                <meshStandardMaterial 
                    color="#1a1a1a"
                    roughness={0.2}
                    metalness={0.6}
                    envMapIntensity={1.5}
                />
                <Edges threshold={15} color="#d97706" />
            </mesh>

            {/* Render Numbers on Faces */}
            {faceData.map((face, i) => (
                <Text
                    key={i}
                    position={face.pos}
                    rotation={face.rot || [0,0,0]}
                    // For polygons, look at center * 2 to face outward
                    lookAt={face.rot ? undefined : (pos) => pos.multiplyScalar(2)} 
                    fontSize={parseInt(type) === 20 ? 0.35 : 0.6}
                    color={face.isResult ? "#fbbf24" : "#a16207"} // Golden result, Darker decoys
                    font="https://fonts.gstatic.com/s/cinzel/v11/8vIJ7ww63mVu7gt78Uk.woff"
                    anchorX="center"
                    anchorY="middle"
                >
                    {face.val}
                </Text>
            ))}
        </group>
    );
};

const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-300"></div>
            
            {/* Full Screen Canvas for the "Throw" */}
            <div className="w-full h-full relative z-10">
                <Canvas camera={{ position: [0, 2, 8], fov: 40 }}>
                    <ambientLight intensity={0.5} />
                    
                    {/* Cinematic Lighting */}
                    <pointLight position={[10, 10, 10]} intensity={2} color="#fbbf24" />
                    <pointLight position={[-10, 5, -5]} intensity={1} color="#fbbf24" />
                    <Environment preset="city" />

                    <DieMesh type={roll.die} result={roll.result} />
                    
                    {/* Shadow moves with the die logically? 
                        No, ContactShadows renders at 0,0,0. 
                        Since our die moves in X/Y, we want the shadow to follow X but stay on floor Y.
                    */}
                    <ShadowFollow />
                </Canvas>
            </div>
        </div>
    );
};

// Helper to make shadow follow the die's X position
const ShadowFollow = () => {
    const shadowRef = useRef();
    // We can cheat: since the die moves from -12 to 0, we can just animate the shadow similarly
    // or just make a huge shadow plane. 
    // Easier: Use a huge blur scale so it looks like a table surface.
    return (
         <ContactShadows 
            position={[0, -2, 0]} 
            opacity={0.7} 
            scale={40} 
            blur={2} 
            far={4} 
            color="#000" 
        />
    );
}

export default DiceOverlay;
