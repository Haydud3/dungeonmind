import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, memo } from 'react';
import * as THREE from 'three';
import { Text, Html } from '@react-three/drei';
import Token from '../components/Token';
import { calculateTokenCenter, getCharacterVisionSettings } from './visionMath';
import { useVisionMaskMaterial } from './useVisionMaskMaterial';
import { idsMatch } from './idUtils';

const WebGLToken = memo(({ token, grid, mapDimensions, isSelected, isTurn, tokenBlobUrl, tokenRefs, isMoving, wallUniforms, viewerUniforms, visionActive, showNameplates, role, user }) => {
    const [texture, setTexture] = useState(null);
    const onBeforeCompile = useVisionMaskMaterial(wallUniforms, viewerUniforms, visionActive);
    const isOwner = role === 'dm' || idsMatch(token.ownerId, user?.uid) || (token.controlledBy || []).some(uid => idsMatch(uid, user?.uid));
    const groupRef = useRef();

    // Health Logic
    const hp = token.hp?.current;
    const maxHp = token.hp?.max;
    const hasHp = typeof hp === 'number' && typeof maxHp === 'number' && maxHp > 0;
    const hpPercent = hasHp ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
    const isDead = (token.statuses || []).includes('dead');
    let hpColor = '#22c55e'; // Green
    if (hpPercent < 50) hpColor = '#eab308'; // Yellow
    if (hpPercent < 25) hpColor = '#ef4444'; // Red

    useEffect(() => {
        let active = true;
        const url = tokenBlobUrl || token.image;
        if (!url) return;
        new THREE.TextureLoader().load(url, (tex) => {
            if (active) {
                tex.colorSpace = THREE.SRGBColorSpace;
                setTexture(tex);
            }
        });
        return () => {
            active = false;
            if (texture) texture.dispose();
        };
    }, [tokenBlobUrl, token.image]);

    useEffect(() => {
        tokenRefs.current[token.id] = groupRef.current;
        return () => { delete tokenRefs.current[token.id]; };
    }, [token.id, tokenRefs]);

    const sizeMap = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
    const sizeMult = typeof token.size === 'number' ? token.size : (sizeMap[token.size] || 1);
    const radius = (grid.size * sizeMult) / 2;

    const baseOpacity = token.isHidden ? 0.4 : 1.0;
    const movingOpacity = isMoving ? 0.6 : 1.0;
    const finalOpacity = baseOpacity * movingOpacity;

    useLayoutEffect(() => {
        if (groupRef.current && !isMoving) {
            groupRef.current.position.x = (token.x / 100) * mapDimensions.width;
            groupRef.current.position.y = -(token.y / 100) * mapDimensions.height;
        }
    }, [token.x, token.y, mapDimensions, isMoving]);

    const tokenColor = token.type === 'pc' ? '#3b82f6' : '#ef4444';

    // Nameplate text
    const nameplateText = token.name || (token.type === 'pc' ? 'PC' : 'NPC');
    const nameplateWidth = Math.max(35, nameplateText.length * 6 + 12);
    const nameplateHeight = 16;
    
    const nameplateShape = useMemo(() => {
        const s = new THREE.Shape();
        const w = nameplateWidth;
        const h = nameplateHeight;
        const r = h / 2;
        s.moveTo(-w/2 + r, -h/2);
        s.lineTo(w/2 - r, -h/2);
        s.absarc(w/2 - r, 0, r, -Math.PI/2, Math.PI/2, false);
        s.lineTo(-w/2 + r, h/2);
        s.absarc(-w/2 + r, 0, r, Math.PI/2, 3*Math.PI/2, false);
        return s;
    }, [nameplateWidth, nameplateHeight]);

    const borderShape = useMemo(() => {
        const s = new THREE.Shape();
        const w = nameplateWidth + 2;
        const h = nameplateHeight + 2;
        const r = h / 2;
        s.moveTo(-w/2 + r, -h/2);
        s.lineTo(w/2 - r, -h/2);
        s.absarc(w/2 - r, 0, r, -Math.PI/2, Math.PI/2, false);
        s.lineTo(-w/2 + r, h/2);
        s.absarc(-w/2 + r, 0, r, Math.PI/2, 3*Math.PI/2, false);
        return s;
    }, [nameplateWidth, nameplateHeight]);

    return (
        <group ref={groupRef} position={[0, 0, 0.1]}>
            {/* Border */}
            <mesh position={[0, 0, 0.001]}>
                <ringGeometry args={[radius, radius + 2, 32]} />
                <meshBasicMaterial color={tokenColor} onBeforeCompile={onBeforeCompile} transparent opacity={finalOpacity} />
            </mesh>

            {/* Token Image */}
            <mesh>
                <circleGeometry args={[radius, 32]} />
                <meshBasicMaterial 
                    map={texture} 
                    color={texture ? 'white' : tokenColor}
                    transparent 
                    opacity={finalOpacity}
                    onBeforeCompile={onBeforeCompile} 
                />
            </mesh>

            {/* Health Ring (WebGL) */}
            {isOwner && hasHp && !isDead && (
                <group position={[0, 0, 0.01]}>
                    <mesh>
                        <ringGeometry args={[radius * 0.88, radius * 0.94, 64]} />
                        <meshBasicMaterial color="black" transparent opacity={0.4 * finalOpacity} onBeforeCompile={onBeforeCompile} />
                    </mesh>
                    <mesh rotation={[0, 0, Math.PI / 2]}>
                        <ringGeometry args={[radius * 0.88, radius * 0.94, 64, 1, 0, -(hpPercent / 100) * Math.PI * 2]} />
                        <meshBasicMaterial color={hpColor} onBeforeCompile={onBeforeCompile} transparent opacity={finalOpacity} />
                    </mesh>
                </group>
            )}

            {(isSelected || token.isHighlighted) && (
                <mesh position={[0, 0, -0.01]}>
                    <ringGeometry args={[radius + 2, radius + 5, 32]} />
                    <meshBasicMaterial color={token.isHighlighted ? "#f59e0b" : "#6366f1"} onBeforeCompile={onBeforeCompile} transparent opacity={finalOpacity} />
                </mesh>
            )}
            {isTurn && (
                <mesh position={[0, 0, -0.02]}>
                    <ringGeometry args={[radius + 6, radius + 10, 32]} />
                    <meshBasicMaterial color="#ef4444" onBeforeCompile={onBeforeCompile} transparent opacity={finalOpacity} />
                </mesh>
            )}

            {/* Nameplate (WebGL) */}
            {showNameplates && (
                <group position={[0, -radius - 8, 0.02]}>
                    <mesh position={[0, 0, -0.001]}>
                        <shapeGeometry args={[nameplateShape]} />
                        <meshBasicMaterial color="#020617" transparent opacity={0.8 * finalOpacity} onBeforeCompile={onBeforeCompile} />
                    </mesh>
                    <mesh position={[0, 0, -0.002]}>
                        <shapeGeometry args={[borderShape]} />
                        <meshBasicMaterial color={tokenColor} transparent opacity={0.4 * finalOpacity} onBeforeCompile={onBeforeCompile} />
                    </mesh>
                    <Text
                        fontSize={9}
                        color="white"
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.1}
                        outlineColor="black"
                        material-onBeforeCompile={onBeforeCompile}
                        opacity={finalOpacity}
                        transparent
                    >
                        {nameplateText}
                    </Text>
                </group>
            )}

            <Html 
                position={[0, 0, 0.05]} 
                center 
                distanceFactor={1} 
                style={{ width: grid.size * sizeMult, height: grid.size * sizeMult, pointerEvents: 'none' }}
            >
                <Token token={token} isOwner={isOwner} cellPx={grid.size} isDragging={isMoving} isSelected={isSelected} isTurn={isTurn} showNameplate={false} showHealth={false} showImage={false} />
            </Html>
        </group>
    );
});

export default WebGLToken;