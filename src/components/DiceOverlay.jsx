import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Environment, ContactShadows, Edges } from '@react-three/drei';
import * as THREE from 'three';

// --- GEOMETRY CONFIG ---
const DIE_CONFIG = {
    4:  { geo: THREE.TetrahedronGeometry, args: [1.8], radius: 1.2 },
    6:  { geo: THREE.BoxGeometry,         args: [2, 2, 2], radius: 1.01 },
    8:  { geo: THREE.OctahedronGeometry,  args: [1.8], radius: 1.3 },
    10: { geo: THREE.OctahedronGeometry,  args: [1.8], radius: 1.3, scale: [1, 1.3, 1] }, // Stretched
    12: { geo: THREE.DodecahedronGeometry, args: [1.7], radius: 1.5 },
    20: { geo: THREE.IcosahedronGeometry, args: [1.8], radius: 1.7 },
    100:{ geo: THREE.SphereGeometry,      args: [1.8, 32, 32], radius: 1.8 }
};

// --- HELPER: Generate Number Positions ---
const getFaceData = (type, result) => {
    const faces = [];
    const config = DIE_CONFIG[type] || DIE_CONFIG[6];
    const r = config.radius;

    // 1. RESULT FACE: Always place at [0, 0, r] (Facing Camera/Front)
    // We will rotate the die to [0,0,0] at the end, so this face will show.
    faces.push({ pos: [0, 0, r], val: result, isResult: true, rot: [0, 0, 0] });

    // 2. DECOY FACES: Distribute random numbers around the shape
    // using a Fibonacci Sphere algorithm to ensure they cover all sides.
    const count = type === 20 ? 18 : type === 12 ? 10 : 6; 
    const goldenRatio = (1 + 5 ** 0.5) / 2;

    for (let i = 0; i < count; i++) {
        const theta = 2 * Math.PI * i / goldenRatio;
        const phi = Math.acos(1 - 2 * (i + 1) / (count + 1));
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        // Avoid placing a decoy too close to the front result face
        if (z > r * 0.5) continue; 

        // Calculate rotation to make text face outward
        const vector = new THREE.Vector3(x, y, z);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vector.normalize());
        const rotation = new THREE.Euler().setFromQuaternion(quaternion);

        faces.push({ 
            pos: [x, y, z], 
            val: Math.floor(Math.random() * type) + 1, 
            isResult: false,
            rot: [rotation.x, rotation.y, rotation.z]
        });
    }
    return faces;
};

const DieMesh = ({ type, result }) => {
    const meshRef = useRef();
    const timeRef = useRef(0); // Use Ref for animation time (Performance)

    const config = DIE_CONFIG[type] || DIE_CONFIG[6];
    const faces = useMemo(() => getFaceData(type, result), [type, result]);
    const Geometry = config.geo;

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        // Update Time
        timeRef.current += delta * 1.5; // Speed multiplier
        const t = Math.min(timeRef.current, 1);

        // 1. POSITION: Fly in from Left (-15) to Center (0)
        // EaseOutBack: Overshoots slightly and comes back
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const easeOutBack = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        
        const startX = -15;
        const currentX = startX + (0 - startX) * (t < 1 ? easeOutBack : 1);
        
        // 2. BOUNCE: Decaying Sine Wave
        const bounce = Math.abs(Math.sin(t * 10)) * (1 - t) * 3;
        
        meshRef.current.position.set(currentX, bounce, 0);

        // 3. ROTATION: Spin -> Stop
        if (t < 1) {
            // Spin wildly
            const spinLeft = (1 - t) * 15;
            meshRef.current.rotation.x += spinLeft * delta;
            meshRef.current.rotation.y += spinLeft * delta;
        } else {
            // Snap to 0,0,0 (Result Face)
            const lerpSpeed = delta * 10;
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, lerpSpeed);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, lerpSpeed);
            meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, lerpSpeed);
        }
    });

    return (
        <group ref={meshRef}>
            <mesh scale={config.scale || [1, 1, 1]}>
                <primitive object={new Geometry(...config.args)} />
                {/* MATERIAL: Obsidian Black with Reflection */}
                <meshStandardMaterial 
                    color="#111827" 
                    roughness={0.1} 
                    metalness={0.8}
                    envMapIntensity={2} 
                />
                {/* EDGES: Gold */}
                <Edges threshold={15} color="#d97706" />
            </mesh>

            {/* NUMBERS */}
            {faces.map((f, i) => (
                <Text
                    key={i}
                    position={f.pos}
                    rotation={f.rot}
                    fontSize={type === 20 ? 0.35 : 0.6}
                    color={f.isResult ? "#fbbf24" : "#78350f"} // Bright Gold vs Dark Copper
                    font="https://fonts.gstatic.com/s/cinzel/v11/8vIJ7ww63mVu7gt78Uk.woff"
                    anchorX="center"
                    anchorY="middle"
                >
                    {f.val}
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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-300"></div>
            
            {/* Canvas */}
            <div className="w-full h-full relative z-10">
                <Canvas camera={{ position: [0, 2, 6], fov: 45 }}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={2} color="#fbbf24" />
                    <pointLight position={[-10, 5, -5]} intensity={1} color="#f87171" />
                    
                    {/* Environment Reflection */}
                    <Environment preset="city" />

                    <DieMesh type={roll.die} result={roll.result} />
                    
                    {/* Ground Shadow */}
                    <ContactShadows position={[0, -2, 0]} opacity={0.6} scale={40} blur={2.5} far={4} color="#000" />
                </Canvas>
            </div>
        </div>
    );
};

export default DiceOverlay;
