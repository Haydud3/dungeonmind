import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, ContactShadows, Edges } from '@react-three/drei';
import * as THREE from 'three';

// --- CONFIGURATION ---
const ANIM_DURATION = 3.0;

// --- D10 GEOMETRY GENERATOR ---
const createD10Geometry = (radius = 1, height = 1.3) => {
    const vertices = [];
    const indices = [];
    vertices.push(0, height, 0); 
    vertices.push(0, -height, 0); 
    const angleStep = (Math.PI * 2) / 5;
    const r = radius;
    const h = 0.3; 
    for (let i = 0; i < 5; i++) {
        const a = i * angleStep;
        vertices.push(Math.sin(a) * r, h, Math.cos(a) * r);
    }
    for (let i = 0; i < 5; i++) {
        const a = (i * angleStep) + (angleStep / 2);
        vertices.push(Math.sin(a) * r, -h, Math.cos(a) * r);
    }
    const wrap = (i) => i % 5;
    for (let i = 0; i < 5; i++) {
        const upCurr = 2 + i;
        const upNext = 2 + wrap(i + 1);
        const downCurr = 7 + i;
        const downNext = 7 + wrap(i + 1);
        indices.push(0, upCurr, downCurr);
        indices.push(0, downCurr, upNext);
        indices.push(1, downNext, upNext);
        indices.push(1, upNext, downCurr);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
};

// --- ROBUST FACE CALCULATOR ---
const calculateFaces = (type) => {
    let faces = [];
    
    // --- SCANNED GEOMETRY (D4, D12, & D20) ---
    // Added D20 here because Icosahedron geometry is indexed and needs 
    // to be expanded to find faces correctly.
    if (type === 12 || type === 4 || type === 20) {
        let geo;
        if (type === 12) geo = new THREE.DodecahedronGeometry(1);
        if (type === 4) geo = new THREE.TetrahedronGeometry(1); 
        if (type === 20) geo = new THREE.IcosahedronGeometry(1); 
        
        // Convert to non-indexed to get raw triangle data
        const nonIndexed = geo.toNonIndexed(); 
        const pos = nonIndexed.attributes.position;
        const normal = nonIndexed.attributes.normal;
        
        const uniqueFaces = [];

        for (let i = 0; i < pos.count; i++) {
            // Get normal for this vertex
            const n = new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize();
            
            // Check if we already have a face pointing this way
            let existingFace = uniqueFaces.find(f => f.normal.distanceTo(n) < 0.1);

            if (!existingFace) {
                existingFace = { normal: n, points: [] };
                uniqueFaces.push(existingFace);
            }
            existingFace.points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        }

        faces = uniqueFaces.map(f => {
            // Calculate exact center of the face
            const center = new THREE.Vector3();
            f.points.forEach(p => center.add(p));
            center.divideScalar(f.points.length);
            return { pos: center, normal: f.normal };
        });
    }

    // --- STANDARD SHAPES ---
    else if (type === 6) {
        faces = [
            { pos: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 1, 0) },
            { pos: new THREE.Vector3(0, -1, 0), normal: new THREE.Vector3(0, -1, 0) },
            { pos: new THREE.Vector3(1, 0, 0), normal: new THREE.Vector3(1, 0, 0) },
            { pos: new THREE.Vector3(-1, 0, 0), normal: new THREE.Vector3(-1, 0, 0) },
            { pos: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(0, 0, 1) },
            { pos: new THREE.Vector3(0, 0, -1), normal: new THREE.Vector3(0, 0, -1) }
        ];
        faces.forEach(f => f.pos.multiplyScalar(0.5));
    }
    else if (type === 8) {
        const vals = [1, -1];
        vals.forEach(x => vals.forEach(y => vals.forEach(z => {
            const v = new THREE.Vector3(x, y, z).normalize();
            faces.push({ pos: v.clone().multiplyScalar(0.577), normal: v });
        })));
    }
    else if (type === 10 || type === 100) {
        const angleStep = (Math.PI * 2) / 5;
        const r = 1; const h = 0.3; const topH = 1.3;
        const getV = (i, isDown) => {
            const a = (i * angleStep) + (isDown ? angleStep/2 : 0);
            return new THREE.Vector3(Math.sin(a)*r, isDown ? -h : h, Math.cos(a)*r);
        };
        for (let i = 0; i < 5; i++) {
            const top = new THREE.Vector3(0, topH, 0);
            const up1 = getV(i, false); const down = getV(i, true); const up2 = getV((i+1)%5, false);
            const center = new THREE.Vector3().add(top).add(up1).add(down).add(up2).divideScalar(4);
            faces.push({ pos: center, normal: center.clone().normalize() });
        }
        for (let i = 0; i < 5; i++) {
            const bot = new THREE.Vector3(0, -topH, 0);
            const down1 = getV(i, true); const up = getV((i+1)%5, false); const down2 = getV((i+1)%5, true);
            const center = new THREE.Vector3().add(bot).add(down1).add(up).add(down2).divideScalar(4);
            faces.push({ pos: center, normal: center.clone().normalize() });
        }
    }

    return faces;
};


// --- CONFIGURATION ---
const CONFIG = {
    4:  { scale: 2.5, offset: 1.05,  color: "#be123c", geo: () => new THREE.TetrahedronGeometry(1) },
    6:  { scale: 1.5, offset: 1.05, color: "#4338ca", geo: () => new THREE.BoxGeometry(1, 1, 1) },
    8:  { scale: 1.5, offset: 1.05, color: "#047857", geo: () => new THREE.OctahedronGeometry(1) },
    10: { scale: 1.4, offset: 1.02, color: "#7e22ce", geo: () => createD10Geometry() },
    12: { scale: 1.7, offset: 1.01, color: "#c2410c", geo: () => new THREE.DodecahedronGeometry(1) },
    20: { scale: 1.7, offset: 1.02, color: "#b91c1c", geo: () => new THREE.IcosahedronGeometry(1) },
    100:{ scale: 1.4, offset: 1.02, color: "#1e293b", geo: () => createD10Geometry() }
};

// --- DIE MESH ---
const DieMesh = ({ dieType, result }) => {
    const meshRef = useRef();
    const safeType = parseInt(dieType) || 6;
    const cfg = CONFIG[safeType] || CONFIG[6];

    const geometry = useMemo(() => cfg.geo(), [safeType]);

    const { faceData, targetQuat, d4GroupRot } = useMemo(() => {
        let rawFaces = calculateFaces(safeType);
        
        // --- FACE SELECTION ---
        rawFaces.sort((a, b) => b.pos.y - a.pos.y);
        const winnerFace = rawFaces[0];

        // --- TARGET ROTATION ---
        const up = new THREE.Vector3(0, 1, 0);
        const targetQ = new THREE.Quaternion().setFromUnitVectors(winnerFace.normal.clone().normalize(), up);

        // --- GROUP ROTATION TWEAKS ---
        let groupRot = [0, 0, 0];
        if (safeType === 4) {
            groupRot = [0, Math.PI / 6, 0]; 
        }

        // --- VALUE ASSIGNMENT LOGIC ---
        const valueMap = new Map();

        rawFaces.forEach(f => {
            if (f === winnerFace) {
                let val = result;
                if (safeType === 10 && result === 10) val = 0;
                valueMap.set(f, val);
            } else {
                let val = Math.floor(Math.random() * safeType) + 1;
                if (val === result) val = (val % safeType) + 1;
                if (safeType === 10 && val === 10) val = 0;
                if (safeType === 100) val = Math.floor(Math.random() * 10) * 10;
                valueMap.set(f, val);
            }
        });

        // --- GENERATE RENDER DATA ---
        const textItems = rawFaces.map((f, i) => {
            const val = valueMap.get(f);
            
            // POSITIONING
            const finalPos = f.pos.clone().multiplyScalar(cfg.scale).multiplyScalar(cfg.offset);
            
            // ROTATION
            const dummy = new THREE.Object3D();
            dummy.position.copy(finalPos);
            dummy.lookAt(finalPos.clone().add(f.normal)); // Z axis points out from face
            
            // TEXT TWISTS
            if ([8, 20].includes(safeType)) dummy.rotateZ(Math.PI / 6);
            if (safeType === 12) dummy.rotateZ(Math.PI / 5); 
            if (safeType === 4) dummy.rotateZ(-Math.PI / 6); 

            let displayVal = val;
            if (safeType === 100 && (val === 0 || val === 100)) displayVal = "00";

            return {
                pos: [finalPos.x, finalPos.y, finalPos.z],
                rot: [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z],
                val: displayVal,
                isResult: (val === result),
                visible: true
            };
        });

        return { faceData: textItems, targetQuat: targetQ, d4GroupRot: groupRot };
    }, [safeType, result]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        if (!meshRef.current.userData.time) meshRef.current.userData.time = 0;
        meshRef.current.userData.time += Math.min(delta, 0.1);
        const t = Math.min(meshRef.current.userData.time / ANIM_DURATION, 1);

        const ease = 1 - Math.pow(1 - t, 3);
        const yPos = Math.abs(Math.sin(t * 12)) * (1 - t) * 3;
        
        const yOffset = safeType === 4 ? 0.0 : 1.5;

        meshRef.current.position.y = yPos + yOffset; 
        meshRef.current.position.x = -8 + (8 * ease);

        if (t < 0.7) {
            meshRef.current.rotation.x += delta * 15;
            meshRef.current.rotation.y += delta * 10;
        } else {
            meshRef.current.quaternion.slerp(targetQuat, delta * 6);
        }
    });

    return (
        <group rotation={d4GroupRot}>
            <group ref={meshRef}>
                <mesh geometry={geometry} scale={[cfg.scale, cfg.scale, cfg.scale]}>
                    <meshStandardMaterial color={cfg.color} roughness={0.1} metalness={0.1} />
                    <Edges threshold={15} color="#fbbf24" />
                </mesh>
                {faceData.map((f, i) => (
                    f.visible && (
                        <Text
                            key={i}
                            position={f.pos}
                            rotation={f.rot}
                            fontSize={safeType === 100 || safeType === 20 ? 0.4 : 0.6}
                            color={f.isResult ? "#ffffff" : "#fbbf24"}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={0.05}
                            outlineColor="#000000"
                        >
                            {(f.val === 6 || f.val === 9) ? `${f.val}.` : f.val}
                        </Text>
                    )
                ))}
            </group>
        </group>
    );
};

const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center w-screen h-screen">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-300"></div>
            <div className="w-full h-full relative z-10">
                <Canvas camera={{ position: [0, 10, 0], fov: 40 }}>
                    <ambientLight intensity={3} />
                    <pointLight position={[10, 10, 10]} intensity={2} />
                    <pointLight position={[-10, 10, -10]} intensity={1} color="orange" />
                    
                    <DieMesh dieType={roll.die} result={roll.result} />
                    
                    <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={40} blur={2} far={10} color="#000" />
                </Canvas>
            </div>
        </div>
    );
};

export default DiceOverlay;