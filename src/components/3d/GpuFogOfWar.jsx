import React, { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { checkLineOfSight } from '../../utils/losUtils';

export const GpuFogOfWar = ({ enabled, walls, lights, gridSize, mapData, aspect, resolvedHeightmapUrl, playerVisionSources, role, fowWallsEnabled }) => {
    const { gl } = useThree();
    const scale = mapData?.scale || 20;
    const width = scale * aspect;
    const height = scale;

    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const heightmapTexture = useMemo(() => {
        if (!resolvedHeightmapUrl) return null;
        return new THREE.TextureLoader().load(resolvedHeightmapUrl);
    }, [resolvedHeightmapUrl]);

    const fowScene = useMemo(() => new THREE.Scene(), []);
    const fowCamera = useMemo(() => {
        if (!width || !height || isNaN(width) || isNaN(height)) return null;
        const cam = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
        cam.position.z = 5;
        return cam;
    }, [width, height]);
    
    const fowTarget = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(1024, 1024, { stencilBuffer: true });
        rt.texture.generateMipmaps = false;
        rt.texture.minFilter = THREE.LinearFilter;
        rt.texture.magFilter = THREE.LinearFilter;
        return rt;
    }, []);
    const exploredTarget = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(1024, 1024);
        rt.texture.generateMipmaps = false;
        rt.texture.minFilter = THREE.LinearFilter;
        rt.texture.magFilter = THREE.LinearFilter;
        return rt;
    }, []);
    const hasClearedExplored = useRef(false);

    // Reset exploration memory if the map changes or FOW is toggled off/on
    useEffect(() => {
        hasClearedExplored.current = false;
    }, [width, height, enabled]);

    const accumulatorScene = useMemo(() => new THREE.Scene(), []);
    const accumulatorCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
    const accumulatorMaterial = useMemo(() => new THREE.MeshBasicMaterial({
        map: fowTarget.texture,
        blending: THREE.MultiplyBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    }), [fowTarget]);

    useEffect(() => {
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accumulatorMaterial);
        accumulatorScene.add(quad);
        return () => { accumulatorScene.remove(quad); quad.geometry.dispose(); };
    }, [accumulatorScene, accumulatorMaterial]);
    
    const visionGeometry = useMemo(() => new THREE.CircleGeometry(1, 32), []); // Unit circle

    const visionMaterial = useMemo(() => new THREE.MeshBasicMaterial({ 
        color: 0x000000, depthTest: false, depthWrite: false,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.EqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp
    }), []);

    // Material for shadow polygons to write to stencil buffer without touching color
    const shadowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ 
        color: 0xffffff, depthTest: false, depthWrite: false, colorWrite: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
        side: THREE.DoubleSide
    }), []);

    useFrame((state, delta) => {
        if (!fowCamera) return;

        const oldColor = gl.getClearColor(new THREE.Color());
        const oldAlpha = gl.getClearAlpha();

        const oldAutoClear = gl.autoClear;
        gl.autoClear = false;

        const wallsArray = Object.values(walls || {});
        gl.setRenderTarget(fowTarget);
        gl.setClearColor(0xffffff, 1); // 1. Clear to white (fully fogged)
        gl.clear(true, true, true); // color, depth, stencil

        const allSources = [...playerVisionSources];
        // Only factor in lights if FOW is actually enabled.
        if (enabled && lights) {
            Object.values(lights).forEach(light => {
                // FIX: Use light.radius, not light.range. The value is in feet.
                const lightRangeInMapUnits = (light.radius || 15) / 5 * gridSize; 
                
                let isVisibleToPlayers = role === 'dm';
                if (!isVisibleToPlayers) { // If not DM, check if any player token can see this light
                    const lightPt = { x: light.position.x, y: light.position.y || 0, z: light.position.z };
                    for (const src of playerVisionSources) {
                        if (checkLineOfSight(src, lightPt, wallsArray)) {
                            isVisibleToPlayers = true;
                            break;
                        }
                    }
                }

                if (isVisibleToPlayers) {
                    allSources.push({
                        x: light.position.x,
                        z: light.position.z,
                        range: lightRangeInMapUnits
                    });
                }
            });
        }

        allSources.forEach(source => {
            gl.clear(false, false, true); // Clear stencil buffer to 0 for this light
            fowScene.clear();

            let shadowGeo = null;
            if (wallsArray.length > 0 && fowWallsEnabled !== false) {
                const vertices = [];
                Object.values(walls).forEach(wall => {
                    if (wall.isOpen || !wall.points || wall.points.length < 2) return;
                    for (let i = 0; i < wall.points.length - 1; i++) {
                        const p1 = wall.points[i];
                        const p2 = wall.points[i+1];
                        const A = new THREE.Vector2(p1.x, -p1.z);
                        const B = new THREE.Vector2(p2.x, -p2.z);
                        const S = new THREE.Vector2(source.x, -source.z);

                        const SA = new THREE.Vector2().subVectors(A, S);
                        const SB = new THREE.Vector2().subVectors(B, S);
                        
                        const far = 1000;
                        const A_far = new THREE.Vector2().copy(A).add(SA.clone().multiplyScalar(far));
                        const B_far = new THREE.Vector2().copy(B).add(SB.clone().multiplyScalar(far));

                        // Create 2 triangles to form the occlusion quad
                        vertices.push(
                            A.x, A.y, 0,
                            B.x, B.y, 0,
                            B_far.x, B_far.y, 0,
                            A.x, A.y, 0,
                            B_far.x, B_far.y, 0,
                            A_far.x, A_far.y, 0
                        );
                    }
                });

                if (vertices.length > 0) {
                    shadowGeo = new THREE.BufferGeometry();
                    shadowGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMaterial);
                    shadowMesh.renderOrder = 1;
                    fowScene.add(shadowMesh);
                }
            }

            const visionMesh = new THREE.Mesh(visionGeometry, visionMaterial);
            visionMesh.scale.set(source.range, source.range, 1);
            visionMesh.position.set(source.x, -source.z, 0); // INVERT Z
            visionMesh.renderOrder = 2;
            fowScene.add(visionMesh);

            gl.render(fowScene, fowCamera);
            if (shadowGeo) shadowGeo.dispose(); // Prevent Memory leaks
        });

        gl.setRenderTarget(exploredTarget);
        if (!hasClearedExplored.current) {
            gl.setClearColor(0xffffff, 1);
            gl.clear(true, true, true);
            hasClearedExplored.current = true;
        }
        gl.render(accumulatorScene, accumulatorCamera);
        
        gl.autoClear = oldAutoClear;

        gl.setRenderTarget(null);
        gl.setClearColor(oldColor, oldAlpha); // Restore map background color
    });

    if (!width || !height || isNaN(width) || isNaN(height)) {
        return null;
    }

    return (
        <group>
            {/* Shroud: Permanent Memory of Explored Areas (Pitch Black) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} renderOrder={99}>
                <planeGeometry args={[width, height, resolvedHeightmapUrl ? subdivisions : 1, resolvedHeightmapUrl ? subdivisions : 1]} />
                {resolvedHeightmapUrl ? (
                    <meshStandardMaterial
                        color={0x000000}
                        roughness={1}
                        metalness={0}
                        alphaMap={exploredTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.3 : 0.98}
                        displacementMap={heightmapTexture}
                        displacementScale={mapData?.heightScale || 1}
                        depthWrite={false}
                    />
                ) : (
                    <meshBasicMaterial
                        color={0x000000}
                        alphaMap={exploredTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.3 : 0.98}
                        depthWrite={false}
                    />
                )}
            </mesh>

            {/* Current Vision: Shadows for unseen areas (Grayed Out) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={100}>
                <planeGeometry args={[width, height, resolvedHeightmapUrl ? subdivisions : 1, resolvedHeightmapUrl ? subdivisions : 1]} />
                {resolvedHeightmapUrl ? (
                    <meshStandardMaterial
                        color={0x000000}
                        roughness={1}
                        metalness={0}
                        alphaMap={fowTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.2 : 0.6}
                        displacementMap={heightmapTexture}
                        displacementScale={mapData?.heightScale || 1}
                        depthWrite={false}
                    />
                ) : (
                    <meshBasicMaterial
                        color={0x000000}
                        alphaMap={fowTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.2 : 0.6}
                        depthWrite={false}
                    />
                )}
            </mesh>
        </group>
    );
};