import React, { useRef, useMemo, Suspense, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, ContactShadows, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { rtdb } from '../firebase';
import { ref, onValue, set, remove } from 'firebase/database';

// --- CONFIGURATION ---
const ANIM_DURATION = 3.0;

// --- COIN GEOMETRY GENERATOR (D2) ---
const createCoinGeometry = (radius = 1.1, height = 0.16, segments = 36) => {
    return new THREE.CylinderGeometry(radius, radius, height, segments);
};

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
        const nonIndexed = geo.index ? geo.toNonIndexed() : geo; 
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
    else if (type === 2) {
        faces = [
            { pos: new THREE.Vector3(0, 0.08, 0), normal: new THREE.Vector3(0, 1, 0) },
            { pos: new THREE.Vector3(0, -0.08, 0), normal: new THREE.Vector3(0, -1, 0) }
        ];
    }

    return faces;
};


// --- CONFIGURATION ---
const DICE_SCALE = 0.6; // Scale down dice to fit more on screen
const CONFIG = {
    2:  { scale: 1.25 * DICE_SCALE, offset: 1.05, color: "#f59e0b", geo: () => createCoinGeometry() },
    4:  { scale: 1.5 * DICE_SCALE, offset: 1.05,  color: "#be123c", geo: () => new THREE.TetrahedronGeometry(1) },
    6:  { scale: 0.9 * DICE_SCALE, offset: 1.05, color: "#4338ca", geo: () => new THREE.BoxGeometry(1, 1, 1) },
    8:  { scale: 0.9 * DICE_SCALE, offset: 1.05, color: "#047857", geo: () => new THREE.OctahedronGeometry(1) },
    10: { scale: 0.84 * DICE_SCALE, offset: 1.02, color: "#7e22ce", geo: () => createD10Geometry() },
    12: { scale: 1.02 * DICE_SCALE, offset: 1.01, color: "#c2410c", geo: () => new THREE.DodecahedronGeometry(1) },
    20: { scale: 1.02 * DICE_SCALE, offset: 1.02, color: "#b91c1c", geo: () => new THREE.IcosahedronGeometry(1) },
    100:{ scale: 0.84 * DICE_SCALE, offset: 1.02, color: "#1e293b", geo: () => createD10Geometry() }
};

// Global geometry cache prevents WebGL Context Loss by reusing GPU buffers instead of leaking them
const SHARED_GEOMETRIES = {};
const getGeometry = (type) => {
    if (!SHARED_GEOMETRIES[type]) {
        SHARED_GEOMETRIES[type] = CONFIG[type].geo();
    }
    return SHARED_GEOMETRIES[type];
};

// Global registry to allow dice to detect and collide with each other
const DICE_PHYSICS_REGISTRY = {};

// --- DIE MESH ---
const DieMesh = ({ id, dieType, result, actionType, index = 0, total = 1, isRemote = false, physicsParams = null }) => {
    const meshRef = useRef();
    
    // START CHANGE: Robust parsing for dieType (e.g. "d20", "1d20", 20)
    let type = 6;
    const strType = String(dieType).toLowerCase();
    if (strType.includes('d')) {
        const parts = strType.split('d');
        // Find the last numeric part (handles "d1d4" -> 4, "1d20" -> 20, "2d20kh1" -> 20)
        for (let i = parts.length - 1; i >= 0; i--) {
            const match = parts[i].match(/^(\d+)/);
            if (match) {
                const val = parseInt(match[1]);
                if (!isNaN(val) && val > 0) {
                    type = val;
                    break;
                }
            }
        }
    } else {
        type = parseInt(strType) || 6;
    }
    const safeType = CONFIG[type] ? type : 6;
    const cfg = CONFIG[safeType];
    // END CHANGE
    
    const baseColor = actionType === 'save' ? '#f59e0b' : cfg.color;
    const dieColor = isRemote ? '#06b6d4' : baseColor; // Holographic Cyan for remote dice
    
    // START CHANGE: Sanitize result to prevent NaN
    const safeResult = useMemo(() => {
        if (result === null || result === undefined) return 1;
        
        // Handle object if passed directly
        if (typeof result === 'object') {
             const val = result.total ?? result.result ?? result.value;
             if (val !== undefined) return parseInt(val) || 1;
        }

        const r = parseInt(result);
        return isNaN(r) ? 1 : r;
    }, [result]);
    // END CHANGE

    const geometry = useMemo(() => getGeometry(safeType), [safeType]);

    const { faceData, targetQuat, d4GroupRot } = useMemo(() => {
        let rawFaces = calculateFaces(safeType);
        
        // START CHANGE: Safety fallback if faces are missing
        if (!rawFaces || rawFaces.length === 0) {
            rawFaces = calculateFaces(6);
        }
        // END CHANGE
        
        // --- FACE SELECTION ---
        if (safeType === 2) {
            const isHeads = safeResult === 1;
            const targetQ = new THREE.Quaternion();
            if (isHeads) {
                targetQ.set(0, 0, 0, 1);
            } else {
                targetQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
            }
            return { faceData: [], targetQuat: targetQ, d4GroupRot: [0, 0, 0] };
        }

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
                let val = safeResult;
                if (safeType === 10 && safeResult === 10) val = 0;
                valueMap.set(f, val);
            } else {
                let val = Math.floor(Math.random() * safeType) + 1;
                if (val === safeResult) val = (val % safeType) + 1;
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
                isResult: (val === safeResult),
                visible: true
            };
        });

        return { faceData: textItems, targetQuat: targetQ, d4GroupRot: groupRot };
    }, [safeType, safeResult]);

    const physicsRef = useRef(null);
    if (!physicsRef.current) {
        let spawnX, spawnZ, vx, vz;
        let rx, ry, rz;
        
        if (physicsParams) {
            ({ spawnX, spawnZ, vx, vz, rx, ry, rz } = physicsParams);
        } else {
            const edge = Math.floor(Math.random() * 4);
            
            if (edge === 0) { // Left
                spawnX = -12;
                spawnZ = (Math.random() - 0.5) * 8;
                vx = 15 + Math.random() * 10;
                vz = (Math.random() - 0.5) * 10;
            } else if (edge === 1) { // Right
                spawnX = 12;
                spawnZ = (Math.random() - 0.5) * 8;
                vx = -(15 + Math.random() * 10);
                vz = (Math.random() - 0.5) * 10;
            } else if (edge === 2) { // Top
                spawnX = (Math.random() - 0.5) * 12;
                spawnZ = -8;
                vx = (Math.random() - 0.5) * 10;
                vz = 10 + Math.random() * 10;
            } else { // Bottom
                spawnX = (Math.random() - 0.5) * 12;
                spawnZ = 8;
                vx = (Math.random() - 0.5) * 10;
                vz = -(10 + Math.random() * 10);
            }

            rx = (Math.random() - 0.5) * 60;
            ry = (Math.random() - 0.5) * 60;
            rz = (Math.random() - 0.5) * 60;
        }

        const rotVel = safeType === 2
            ? new THREE.Vector3(
                (Math.random() > 0.5 ? 1 : -1) * (45 + Math.random() * 25),
                (Math.random() - 0.5) * 12,
                (Math.random() - 0.5) * 15
            )
            : new THREE.Vector3(rx, ry, rz);

        const yOffset = safeType === 4 ? 0.0 : (safeType === 2 ? 0.12 : cfg.scale * 0.7);

        physicsRef.current = {
            id,
            radius: cfg.scale * 0.8, // Approximate sphere radius for collisions
            pos: new THREE.Vector3(spawnX, 8 + (index * 2), spawnZ + (index * 1.5)),
            vel: new THREE.Vector3(vx, -5 - (index * 2), vz),
            rotVel,
            time: 0,
            yOffset
        };
    }

    useEffect(() => {
        DICE_PHYSICS_REGISTRY[id] = physicsRef.current;
        return () => {
            delete DICE_PHYSICS_REGISTRY[id];
        };
    }, [id]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const phys = physicsRef.current;
        const dt = Math.min(delta, 0.1);
        phys.time += dt;

        if (phys.time < ANIM_DURATION * 0.7) {
            phys.vel.y -= 50 * dt; // Gravity
            
            // Air friction (lowered to maintain horizontal throwing momentum)
            phys.vel.x *= Math.pow(0.98, dt * 60);
            phys.vel.z *= Math.pow(0.98, dt * 60);
            phys.pos.addScaledVector(phys.vel, dt);

            // --- DIE-TO-DIE COLLISION ---
            Object.values(DICE_PHYSICS_REGISTRY).forEach(other => {
                // Only check each pair once by comparing IDs
                if (other.id > phys.id) {
                    const distSq = phys.pos.distanceToSquared(other.pos);
                    const minDist = phys.radius + other.radius;
                    if (distSq < minDist * minDist && distSq > 0.0001) {
                        const dist = Math.sqrt(distSq);
                        const normal = new THREE.Vector3().subVectors(phys.pos, other.pos).normalize();
                        
                        // Instantly resolve overlap (push apart)
                        const overlap = minDist - dist;
                        phys.pos.addScaledVector(normal, overlap * 0.5);
                        other.pos.addScaledVector(normal, -overlap * 0.5);

                        // Exchange velocity (Elastic bounce)
                        const relVel = new THREE.Vector3().subVectors(phys.vel, other.vel);
                        const speed = relVel.dot(normal);
                        if (speed < 0) { // Only bounce if moving towards each other
                            const restitution = 0.6; // Bounciness factor
                            const impulse = -(1 + restitution) * speed * 0.5;
                            phys.vel.addScaledVector(normal, impulse);
                            other.vel.addScaledVector(normal, -impulse);
                            
                            // Add a little spin to both dice on impact
                            phys.rotVel.x += (Math.random() - 0.5) * impulse * 2;
                            phys.rotVel.z += (Math.random() - 0.5) * impulse * 2;
                            other.rotVel.x -= (Math.random() - 0.5) * impulse * 2;
                            other.rotVel.z -= (Math.random() - 0.5) * impulse * 2;
                        }
                    }
                }
            });

            if (phys.pos.y < phys.yOffset) {
                phys.pos.y = phys.yOffset;
                
                // Ground friction
                if (phys.vel.y < -2) {
                    // Significant bounce
                    phys.vel.x *= 0.85;
                    phys.vel.z *= 0.85;
                    phys.rotVel.multiplyScalar(0.85);
                } else {
                    // Rolling on the ground
                    phys.vel.x *= Math.pow(0.90, dt * 60);
                    phys.vel.z *= Math.pow(0.90, dt * 60);
                    phys.rotVel.multiplyScalar(Math.pow(0.97, dt * 60));
                }
                
                phys.vel.y *= -0.55; // Bounce height
            }

            // Dynamically calculate the visible screen boundaries based on the camera's view
            const vFov = state.camera.fov * Math.PI / 180;
            const visibleZ = 2 * Math.tan(vFov / 2) * Math.abs(state.camera.position.y);
            const visibleX = visibleZ * state.camera.aspect;
            
            const padding = cfg.scale * 1.2; // Padding ensures the full 3D mesh stays inside
            const extentX = Math.max(1, (visibleX / 2) - padding);
            const extentZ = Math.max(1, (visibleZ / 2) - padding);

            // Bounce if heading OUT of bounds, allows them to fly IN from off-screen
            if (phys.pos.x > extentX && phys.vel.x > 0) { phys.pos.x = extentX; phys.vel.x *= -0.7; }
            if (phys.pos.x < -extentX && phys.vel.x < 0) { phys.pos.x = -extentX; phys.vel.x *= -0.7; }
            if (phys.pos.z > extentZ && phys.vel.z > 0) { phys.pos.z = extentZ; phys.vel.z *= -0.7; }
            if (phys.pos.z < -extentZ && phys.vel.z < 0) { phys.pos.z = -extentZ; phys.vel.z *= -0.7; }

            // If still out of bounds (e.g., pushed out by a collision and stopped), gently pull them back in
            if (phys.pos.x > extentX) phys.pos.x -= 10 * dt;
            if (phys.pos.x < -extentX) phys.pos.x += 10 * dt;
            if (phys.pos.z > extentZ) phys.pos.z -= 10 * dt;
            if (phys.pos.z < -extentZ) phys.pos.z += 10 * dt;

            meshRef.current.rotation.x += phys.rotVel.x * dt;
            meshRef.current.rotation.y += phys.rotVel.y * dt;
            meshRef.current.rotation.z += phys.rotVel.z * dt;
            meshRef.current.position.copy(phys.pos);
        } else {
            meshRef.current.quaternion.slerp(targetQuat, dt * 8);
            meshRef.current.position.y += (phys.yOffset - meshRef.current.position.y) * (dt * 10);
        }
    });

    if (safeType === 2) {
        return (
            <group ref={meshRef}>
                {/* Main Gold Coin Body */}
                <mesh geometry={geometry} scale={[cfg.scale, cfg.scale, cfg.scale]}>
                    <meshStandardMaterial 
                        color={isRemote ? '#06b6d4' : '#f59e0b'} 
                        roughness={0.25} 
                        metalness={0.85} 
                        transparent={isRemote}
                        opacity={isRemote ? 0.8 : 1}
                        emissive={isRemote ? '#06b6d4' : '#78350f'}
                        emissiveIntensity={isRemote ? 0.5 : 0.15}
                    />
                    <Edges threshold={20} color={isRemote ? "#67e8f9" : "#fef08a"} />
                </mesh>

                {/* Coin Inner Embossed Rings */}
                <mesh position={[0, 0.084 * cfg.scale, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.74 * cfg.scale, 0.82 * cfg.scale, 36]} />
                    <meshStandardMaterial color="#fef08a" metalness={0.9} roughness={0.2} />
                </mesh>
                <mesh position={[0, -0.084 * cfg.scale, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.74 * cfg.scale, 0.82 * cfg.scale, 36]} />
                    <meshStandardMaterial color="#fef08a" metalness={0.9} roughness={0.2} />
                </mesh>

                {/* Heads Face (Top, normal 0, 1, 0) */}
                <group position={[0, 0.088 * cfg.scale, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <Text
                        position={[0, 0.38 * cfg.scale, 0]}
                        fontSize={0.20 * DICE_SCALE}
                        color="#ffffff"
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.03 * DICE_SCALE}
                        outlineColor="#78350f"
                    >
                        HEADS
                    </Text>
                    <Text
                        position={[0, -0.08 * cfg.scale, 0]}
                        fontSize={0.52 * DICE_SCALE}
                        color="#fef08a"
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.04 * DICE_SCALE}
                        outlineColor="#78350f"
                    >
                        I
                    </Text>
                </group>

                {/* Tails Face (Bottom, normal 0, -1, 0) */}
                <group position={[0, -0.088 * cfg.scale, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <Text
                        position={[0, 0.38 * cfg.scale, 0]}
                        fontSize={0.20 * DICE_SCALE}
                        color="#ffffff"
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.03 * DICE_SCALE}
                        outlineColor="#78350f"
                    >
                        TAILS
                    </Text>
                    <Text
                        position={[0, -0.08 * cfg.scale, 0]}
                        fontSize={0.52 * DICE_SCALE}
                        color="#fef08a"
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.04 * DICE_SCALE}
                        outlineColor="#78350f"
                    >
                        II
                    </Text>
                </group>
            </group>
        );
    }

    return (
        <group rotation={d4GroupRot}>
            <group ref={meshRef}>
                <mesh geometry={geometry} scale={[cfg.scale, cfg.scale, cfg.scale]}>
                    <meshStandardMaterial 
                        color={dieColor} 
                        roughness={isRemote ? 0.2 : 0.1} 
                        metalness={isRemote ? 0.8 : 0.1} 
                        transparent={isRemote}
                        opacity={isRemote ? 0.8 : 1}
                        emissive={isRemote ? dieColor : "#000000"}
                        emissiveIntensity={isRemote ? 0.5 : 0}
                    />
                    <Edges threshold={15} color={isRemote ? "#67e8f9" : "#fbbf24"} />
                </mesh>
                {faceData.map((f, i) => (
                    f.visible && (
                        <Text
                            key={i}
                            position={f.pos}
                            rotation={f.rot}
                            fontSize={(safeType === 100 || safeType === 20 ? 0.35 : 0.5) * DICE_SCALE}
                            color={f.isResult ? "#ffffff" : "#fbbf24"}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={0.05 * DICE_SCALE}
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

const RollHUD = ({ roll, isStacked }) => {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setShow(true), 2000);
        return () => clearTimeout(timer);
    }, []);

    const { rollsNode, finalTotal } = useMemo(() => {
        const getRollVal = (r) => {
            if (r === null || r === undefined) return 0;
            if (typeof r === 'object') return Number(r.value ?? r.total ?? r.result ?? 0);
            return Number(r);
        };
        const activeNatural = roll.natural ?? roll.naturalRoll ?? roll.rolls?.[0] ?? roll.total ?? roll.result ?? roll.value;
        const activeTotal = roll.total ?? roll.result ?? roll.value ?? 0;
        const modifier = roll.modifier ?? roll.mod ?? 0;
        
        const activeRollsList = roll.diceAnimations || roll.rolls;
        let rollsNode = activeRollsList ? activeRollsList.map(r => getRollVal(r)).join(' + ') : activeNatural;
        let finalTotal = activeTotal;

        let inferredAdvMode = roll.advMode;
        if ((!inferredAdvMode || inferredAdvMode === 'normal') && roll.alias && typeof roll.alias === 'string') {
            const lowerAlias = roll.alias.toLowerCase();
            if (lowerAlias.includes('advantage') && !lowerAlias.includes('disadvantage')) inferredAdvMode = 'adv';
            else if (lowerAlias.includes('disadvantage')) inferredAdvMode = 'dis';
        }

        // NEW: Detect from formula directly
        const formulaStr = String(roll.formulaDisplay || '') + ' ' + String(roll.formula || '') + ' ' + String(roll.die || '');
        const lowerFormula = formulaStr.toLowerCase();
        if (lowerFormula.includes('kh1')) inferredAdvMode = 'adv';
        if (lowerFormula.includes('kl1')) inferredAdvMode = 'dis';

        if (inferredAdvMode && inferredAdvMode !== 'normal' && activeRollsList && activeRollsList.length >= 2) {
            const r1 = getRollVal(activeRollsList[0]);
            const r2 = getRollVal(activeRollsList[1]);
            let keptIdx = (inferredAdvMode === 'adv') ? (r1 >= r2 ? 0 : 1) : (r1 <= r2 ? 0 : 1);
            const droppedIdx = keptIdx === 0 ? 1 : 0;
            
            rollsNode = (
                <>
                    {activeRollsList.map((rObj, i) => {
                        const r = getRollVal(rObj);
                        return (
                        <React.Fragment key={i}>
                            {i === droppedIdx ? (
                                <span className="opacity-40 line-through decoration-red-500">{r}</span>
                            ) : i === keptIdx ? (
                                <span className="text-amber-400 font-bold">{r}</span>
                            ) : (
                                <span>{r}</span>
                            )}
                            {i < activeRollsList.length - 1 && <span className="text-slate-500 mx-1">, </span>}
                        </React.Fragment>
                        );
                    })}
                </>
            );
            
            finalTotal = activeTotal - getRollVal(activeRollsList[droppedIdx]);
        }
        
        return { rollsNode, finalTotal };
    }, [roll]);

    const isCoin = useMemo(() => {
        const formulaStr = String(roll.formulaDisplay || '') + ' ' + String(roll.formula || '') + ' ' + String(roll.die || '');
        const lowerAlias = String(roll.alias || '').toLowerCase();
        // Strictly match d2 or 1d2 as an isolated token (not d20, 2d20, etc.)
        const isD2Formula = /\b(?:1)?d2(?!\d)/i.test(formulaStr) || roll.die === 2 || roll.die === '2' || roll.die === '1d2' || roll.die === 'd2';
        const isCoinAlias = lowerAlias.includes('coin') || lowerAlias.includes('heads or tails') || lowerAlias === 'coin flip';
        return isD2Formula || isCoinAlias;
    }, [roll]);

    const coinOutcome = useMemo(() => {
        if (!isCoin) return null;
        const raw = roll.natural ?? roll.naturalRoll ?? roll.rolls?.[0] ?? roll.total ?? roll.result ?? roll.value;
        const num = typeof raw === 'object' ? Number(raw.value ?? raw.total ?? raw.result ?? 1) : Number(raw);
        return num === 1 ? 'HEADS' : 'TAILS';
    }, [isCoin, roll]);

    if (!show) return null;

    return (
        <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-3 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-right-10 fade-in duration-500 pointer-events-none mb-2">
            <div className="flex flex-col text-right">
                <div className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    {roll.alias || roll.characterName ? `${roll.characterName ? roll.characterName + ' ' : ''}${roll.alias || ''}` : 'Dice Result'}
                </div>
                <div className="flex items-baseline justify-end gap-2">
                    {((roll.modifier ?? roll.mod) !== undefined && (roll.modifier ?? roll.mod) !== 0) && (
                        <span className="text-sm text-slate-500 font-bold">
                            ([{rollsNode}] {(roll.modifier ?? roll.mod) >= 0 ? '+' : ''}{(roll.modifier ?? roll.mod)})
                        </span>
                    )}
                    {isCoin ? (
                        <span className="text-2xl font-black text-amber-400 drop-shadow-md flex items-center gap-1.5">
                            <span>🪙</span>
                            <span>{coinOutcome}</span>
                        </span>
                    ) : (
                        <span className="text-3xl font-black text-amber-500 drop-shadow-md">{finalTotal}</span>
                    )}
                </div>
            </div>
            {roll.saveDc !== undefined && (
                <div className={`px-4 py-2 rounded-lg font-black tracking-widest shadow-md flex items-center ${finalTotal >= roll.saveDc ? 'bg-green-500/20 text-green-400 border border-green-500/50 shadow-green-900/20' : 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-red-900/20'}`}>
                    {finalTotal >= roll.saveDc ? 'SUCCESS' : 'FAILED'}
                </div>
            )}
        </div>
    );
};

// Procedural Web Audio API Coin Flip Ring & Clink Synthesizer
const playCoinFlipSFX = () => {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!diceAudioContext) {
            diceAudioContext = new AudioContextClass();
        }
        if (diceAudioContext.state === 'suspended') {
            diceAudioContext.resume().catch(() => {});
        }

        const now = diceAudioContext.currentTime;
        // Ringing frequencies of a flipped gold coin
        const freqs = [2800, 3400, 5600];
        freqs.forEach((freq, idx) => {
            const osc = diceAudioContext.createOscillator();
            const gain = diceAudioContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 1.2);

            const vol = 0.08 / (idx + 1);
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

            osc.connect(gain);
            gain.connect(diceAudioContext.destination);
            osc.start(now);
            osc.stop(now + 1.2);
        });

        // Gentle metallic clinks as it lands
        const clinkTimes = [0.45, 0.65, 0.82];
        clinkTimes.forEach((t, i) => {
            const clinkOsc = diceAudioContext.createOscillator();
            const clinkGain = diceAudioContext.createGain();
            clinkOsc.type = 'triangle';
            clinkOsc.frequency.setValueAtTime(3200 + i * 400, now + t);

            clinkGain.gain.setValueAtTime(0.05 / (i + 1), now + t);
            clinkGain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.08);

            clinkOsc.connect(clinkGain);
            clinkGain.connect(diceAudioContext.destination);
            clinkOsc.start(now + t);
            clinkOsc.stop(now + t + 0.08);
        });
    } catch (e) {
        // Safe failover
    }
};

// Procedural Web Audio API Dice Clatter Sound Synthesizer (Zero external dependencies)
let diceAudioContext = null;
const playDiceClatterSFX = () => {
    if (localStorage.getItem('dm_sfx_dice') === 'false') return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!diceAudioContext) {
            diceAudioContext = new AudioContextClass();
        }
        if (diceAudioContext.state === 'suspended') {
            diceAudioContext.resume().catch(() => {});
        }

        const now = diceAudioContext.currentTime;
        const numClatters = 4 + Math.floor(Math.random() * 3); // 4-6 random clatters

        for (let i = 0; i < numClatters; i++) {
            const impactTime = now + (i * 0.055) + (Math.random() * 0.035);
            const bufferDuration = 0.045;
            const bufferSize = Math.floor(diceAudioContext.sampleRate * bufferDuration);
            const buffer = diceAudioContext.createBuffer(1, bufferSize, diceAudioContext.sampleRate);
            const data = buffer.getChannelData(0);
            for (let j = 0; j < bufferSize; j++) {
                data[j] = (Math.random() * 2 - 1) * (1 - j / bufferSize);
            }

            const noiseSource = diceAudioContext.createBufferSource();
            noiseSource.buffer = buffer;

            // Resin / plastic dice impact resonance
            const filter = diceAudioContext.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600 + Math.random() * 1400, impactTime);
            filter.Q.setValueAtTime(3.5, impactTime);

            const gain = diceAudioContext.createGain();
            const volume = (0.10 + Math.random() * 0.06) * Math.pow(0.72, i);
            gain.gain.setValueAtTime(volume, impactTime);
            gain.gain.exponentialRampToValueAtTime(0.001, impactTime + bufferDuration);

            noiseSource.connect(filter);
            filter.connect(gain);
            gain.connect(diceAudioContext.destination);

            noiseSource.start(impactTime);
            noiseSource.stop(impactTime + bufferDuration);
        }
    } catch (e) {
        // Safe failover for restricted media environments
    }
};

const DiceOverlay = ({ roll }) => {
    const [activeRolls, setActiveRolls] = useState([]);
    const [activeDice, setActiveDice] = useState([]);
    const lastProcessedRoll = useRef(null);

    const dismissRolls = useCallback(() => {
        setActiveRolls([]);
        setActiveDice([]);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && activeRolls.length > 0) {
                dismissRolls();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeRolls.length, dismissRolls]);

    // --- NEW MULTIPLAYER SYNC ---
    const context = useNewCampaign();
    const chatLog = context?.chatLog || [];
    const user = context?.user;
    const isDm = context?.campaign?.dmIds?.includes(user?.uid);
    const campaignCode = context?.gameParams?.code || context?.campaign?.id || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('join') : null);
    
    const clientId = useMemo(() => Math.random().toString(36).substring(2, 10), []);
    const seenRollsRef = useRef(new Set());

    useEffect(() => {
        if (!campaignCode) return;
        const liveRollsRef = ref(rtdb, `live_drags/rolls_${campaignCode}`);
        
        const unsub = onValue(liveRollsRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const incomingRolls = [];
            const now = Date.now();

            Object.values(data).forEach(r => {
                if (r.clientId === clientId) return; // Skip own broadcast
                
                // Tolerate massive clock skew (up to 1 hour) between devices.
                // If a player's PC clock is out of sync, a 60-second limit will silently drop their rolls.
                // Tokens work because they don't check timestamps!
                if (Math.abs(now - r.timestamp) > 3600000) {
                    return;
                }

                // Respect DM privacy
                if (r.type === 'roll-private' && !isDm) {
                    return;
                }

                if (!seenRollsRef.current.has(r._rtId)) {
                    seenRollsRef.current.add(r._rtId);
                    incomingRolls.push(r);
                }
            });

            if (incomingRolls.length > 0) {
                const newActiveDice = [];
                incomingRolls.forEach(r => {
                    const animations = r.diceAnimations || r.rolls || [];
                    if (animations.length > 0) {
                        animations.forEach((anim, index) => {
                            const val = typeof anim === 'object' ? (anim.result ?? anim.value ?? anim.total ?? 1) : anim;
                            const die = typeof anim === 'object' ? (anim.die ?? anim.side ?? r.die ?? 20) : (r.die ?? 20);
                            newActiveDice.push({ 
                                ...r, 
                                _dieId: r._rtId + '-' + index, 
                                _subResult: val, 
                                die, 
                                isRemote: true, 
                                physicsParams: (typeof anim === 'object' ? anim.physicsParams : undefined) || r.physics 
                            });
                        });
                    } else {
                        const val = r.natural ?? r.naturalRoll ?? r.total ?? r.result ?? r.value ?? 1;
                        newActiveDice.push({ ...r, _dieId: r._rtId + '-0', _subResult: val, die: r.die ?? 20, isRemote: true, physicsParams: r.physics });
                    }
                });

                setActiveRolls(prev => [...prev, ...incomingRolls]);
                setActiveDice(prev => [...prev, ...newActiveDice]);
                const isIncomingCoin = incomingRolls.some(r => r.die === 2 || r.die === '1d2' || r.die === 'd2' || /\b(?:1)?d2(?!\d)/i.test(String(r.die || '')) || (r.diceAnimations || []).some(a => a.die === 2 || a.side === 2) || (typeof r.alias === 'string' && r.alias.toLowerCase().includes('coin')));
                if (isIncomingCoin) {
                    playCoinFlipSFX();
                } else {
                    playDiceClatterSFX();
                }
                
                setTimeout(() => {
                    setActiveRolls(prev => prev.filter(p => !incomingRolls.some(n => n._rtId === p._rtId)));
                    setActiveDice(prev => prev.filter(p => !newActiveDice.some(n => n._dieId === p._dieId)));
                }, 6000);
            }
    }, (error) => {
        console.error("[DiceOverlay] ❌ Listener permission denied! Check Firebase RTDB rules.", error);
    });

        return () => unsub();
    }, [campaignCode, clientId, isDm]);
    // --- END MULTIPLAYER SYNC ---

    useEffect(() => {
        if (roll && roll !== lastProcessedRoll.current) {
            lastProcessedRoll.current = roll;
            const rtId = Date.now() + Math.random().toString(36).substring(2,9);
            
            let animations = roll.diceAnimations || (Array.isArray(roll) ? roll : [roll]);
            
            const processedAnimations = animations.map(anim => {
                const rx = (Math.random() - 0.5) * 60;
                const ry = (Math.random() - 0.5) * 60;
                const rz = (Math.random() - 0.5) * 60;

                const edge = Math.floor(Math.random() * 4);
                let spawnX, spawnZ, vx, vz;
                if (edge === 0) { spawnX = -12; spawnZ = (Math.random() - 0.5) * 8; vx = 15 + Math.random() * 10; vz = (Math.random() - 0.5) * 10; } 
                else if (edge === 1) { spawnX = 12; spawnZ = (Math.random() - 0.5) * 8; vx = -(15 + Math.random() * 10); vz = (Math.random() - 0.5) * 10; } 
                else if (edge === 2) { spawnX = (Math.random() - 0.5) * 12; spawnZ = -8; vx = (Math.random() - 0.5) * 10; vz = 10 + Math.random() * 10; } 
                else { spawnX = (Math.random() - 0.5) * 12; spawnZ = 8; vx = (Math.random() - 0.5) * 10; vz = -(10 + Math.random() * 10); }
                
                return {
                    ...anim,
                    physicsParams: { spawnX, spawnZ, vx, vz, rx, ry, rz }
                };
            });
                
            let rollPayload = { 
                _rtId: rtId,
                clientId,
                timestamp: Date.now(),
                formula: roll.formula,
                formulaDisplay: roll.formulaDisplay || roll.alias,
                total: roll.total,
                result: roll.total,
                value: roll.total,
                natural: roll.naturalRoll || roll.natural,
                naturalRoll: roll.naturalRoll || roll.natural,
                isSave: roll.isSave || roll.actionType === 'save',
                actionType: roll.actionType,
                alias: roll.alias,
                characterName: roll.characterName,
                advMode: roll.advMode,
                modifier: roll.modifier || roll.mod,
                mod: roll.modifier || roll.mod,
                saveDc: roll.saveDc,
                type: roll.type,
                diceAnimations: processedAnimations
            };

            // Remove undefined keys to prevent Firebase errors
            Object.keys(rollPayload).forEach(key => {
                if (rollPayload[key] === undefined) delete rollPayload[key];
            });
            
            setActiveRolls(prev => [...prev, rollPayload]);
            seenRollsRef.current.add(rtId);
            
            const newActiveDice = processedAnimations.map((anim, index) => ({
                ...rollPayload,
                _dieId: rtId + '-' + index,
                _subResult: anim.result || anim.value || anim.total || 1,
                die: anim.die || anim.side || roll.die || 20,
                isRemote: false,
                physicsParams: anim.physicsParams
            }));
            
            setActiveDice(prev => [...prev, ...newActiveDice]);
            const isLocalCoin = processedAnimations.some(a => a.die === 2 || a.side === 2) || roll.die === 2 || roll.die === '1d2' || roll.die === 'd2' || /\b(?:1)?d2(?!\d)/i.test(String(roll.die || '')) || (typeof roll.alias === 'string' && roll.alias.toLowerCase().includes('coin'));
            if (isLocalCoin) {
                playCoinFlipSFX();
            } else {
                playDiceClatterSFX();
            }
            
            if (campaignCode) {
                const rollRef = ref(rtdb, `live_drags/rolls_${campaignCode}/${rtId}`);
                set(rollRef, rollPayload)
                    .catch(e => console.error("[DiceOverlay] ❌ Roll broadcast failed", e));
                setTimeout(() => remove(rollRef).catch(() => {}), 6000);
            }
            
            setTimeout(() => {
                setActiveRolls(prev => prev.filter(p => p._rtId !== rtId));
                setActiveDice(prev => prev.filter(p => !newActiveDice.some(n => n._dieId === p._dieId)));
            }, 6000); 
        }
    }, [roll, campaignCode, clientId]);

    return (
        <div className={`fixed inset-0 z-[99999] pointer-events-none flex items-center justify-center w-screen h-screen transition-opacity duration-500 ${activeRolls.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
            {activeRolls.length > 0 && (
                <div 
                    onClick={dismissRolls}
                    className="absolute inset-0 pointer-events-auto cursor-pointer"
                    title="Click anywhere to dismiss dice"
                />
            )}
            <div className="w-full h-full relative z-10 pointer-events-none">
                <Canvas style={{ pointerEvents: 'none' }} dpr={[1, 1.5]} camera={{ position: [0, 10, 0], fov: 40 }} gl={{ antialias: false, powerPreference: "high-performance" }}>
                    <ambientLight intensity={3} />
                    <pointLight position={[10, 10, 10]} intensity={2} />
                    <pointLight position={[-10, 10, -10]} intensity={1} color="orange" />
                    
                    {activeDice.length > 0 && (
                        <Suspense fallback={null}>
                            {activeDice.map((r, i) => (
                                <DieMesh key={r._dieId} id={r._dieId} dieType={r.die || r.sides || r.formula} result={r._subResult} actionType={r.isSave ? 'save' : r.actionType} index={i} total={activeDice.length} isRemote={r.isRemote} physicsParams={r.physicsParams} />
                            ))}
                        </Suspense>
                    )}
                    
                    <ContactShadows position={[0, 0, 0]} opacity={0.3} scale={50} blur={2.5} far={10} color="#000" />
                </Canvas>
                
                {activeRolls.length > 0 && (
                    <>
                        <button
                            type="button"
                            onClick={dismissRolls}
                            className="absolute top-5 right-5 pointer-events-auto bg-slate-950/85 hover:bg-slate-900 border border-slate-700/80 hover:border-amber-500/60 text-slate-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 transition-all shadow-xl backdrop-blur-md cursor-pointer z-50 group"
                        >
                            <span className="text-[11px] group-hover:text-amber-400">Dismiss</span>
                            <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-400 border border-slate-700 font-sans">Esc</kbd>
                        </button>

                        <div className="absolute bottom-6 right-6 flex flex-col items-end pointer-events-none z-50">
                            {activeRolls.map(r => (
                                <RollHUD key={r._rtId} roll={r} isStacked={activeRolls.length > 1} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DiceOverlay;