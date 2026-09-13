import React, { useEffect, useMemo, useRef, useImperativeHandle } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { checkLineOfSight } from '../../utils/losUtils';
import { safeDisposeRenderTarget, safeDisposeTexture, safeDisposeMaterial, safeDisposeGeometry } from '../../utils/threeDisposalUtils';

// Pre-allocate buffer outside component to avoid GC spikes during FOW calculation
const MAX_SHADOW_VERTICES = 10000 * 6; // up to 10k wall segments
const shadowVertexBuffer = new Float32Array(MAX_SHADOW_VERTICES * 3);
const sharedPixelBuffer = new Uint8Array(1024 * 1024 * 4);
let sharedFogCanvas = null;

export const GpuFogOfWar = React.forwardRef(({ enabled, walls, lights, gridSize, mapData, aspect, resolvedHeightmapUrl, playerVisionSources, role, fowWallsEnabled, rtdbDragsRef, onTextureReady, isMagicalDarkness, userRole, playerSenses, darknessVolumes, onSaveFog }, ref) => {
    const { gl } = useThree();
    const scale = mapData?.scale || 20;
    const width = scale * aspect;
    const height = scale;

    const isDM = userRole === 'dm';
    const canSee = playerSenses?.canSeeInMagicalDarkness;

    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const subdivisions = isLowPerf || isTouchDevice ? 64 : 128;

    const [heightmapTexture, setHeightmapTexture] = React.useState(null);

    useEffect(() => {
        if (!resolvedHeightmapUrl) {
            setHeightmapTexture(null);
            return;
        }
        const loader = new THREE.TextureLoader();
        let active = true;
        const tex = loader.load(resolvedHeightmapUrl, (loaded) => {
            if (active) setHeightmapTexture(loaded);
            else loaded.dispose();
        });
        return () => {
            active = false;
            safeDisposeTexture(tex);
        };
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
        rt.texture.minFilter = THREE.NearestFilter;
        rt.texture.magFilter = THREE.NearestFilter;
        return rt;
    }, []);
    const exploredTarget = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(1024, 1024);
        rt.texture.generateMipmaps = false;
        rt.texture.minFilter = THREE.NearestFilter;
        rt.texture.magFilter = THREE.NearestFilter;
        return rt;
    }, []);

    // Clean up WebGLRenderTargets when GpuFogOfWar unmounts or remounts
    useEffect(() => {
        return () => {
            safeDisposeRenderTarget(fowTarget);
            safeDisposeRenderTarget(exploredTarget);
        };
    }, [fowTarget, exploredTarget]);

    const hasClearedExplored = useRef(false);
    const hasNotifiedTexture = useRef(false);

    const pendingLoadFog = useRef(null);
    const lastSaveTime = useRef(Date.now());
    const needsSave = useRef(false);

    const extractFogDataUrl = () => {
        try {
            gl.readRenderTargetPixels(exploredTarget, 0, 0, 1024, 1024, sharedPixelBuffer);
            if (!sharedFogCanvas) {
                sharedFogCanvas = document.createElement('canvas');
                sharedFogCanvas.width = 1024;
                sharedFogCanvas.height = 1024;
            }
            const canvas = sharedFogCanvas;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const imgData = new ImageData(new Uint8ClampedArray(sharedPixelBuffer.buffer), 1024, 1024);
            ctx.putImageData(imgData, 0, 0);
            
            const flipCanvas = document.createElement('canvas');
            flipCanvas.width = 1024;
            flipCanvas.height = 1024;
            const fctx = flipCanvas.getContext('2d');
            fctx.translate(0, 1024);
            fctx.scale(1, -1);
            fctx.drawImage(canvas, 0, 0);
            
            return flipCanvas.toDataURL('image/webp', 0.5);
        } catch (e) {
            console.error('Failed to extract FOW data URL', e);
            return null;
        }
    };

    useImperativeHandle(ref, () => ({
        loadFogState: (dataUrl) => {
            if (!dataUrl) {
                hasClearedExplored.current = false;
            } else {
                pendingLoadFog.current = dataUrl;
            }
        },
        saveFogState: () => {
            return extractFogDataUrl();
        }
    }));


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

    useEffect(() => {
        return () => {
            safeDisposeMaterial(accumulatorMaterial);
            safeDisposeGeometry(visionGeometry);
            safeDisposeMaterial(visionMaterial);
            safeDisposeMaterial(shadowMaterial);
        };
    }, [accumulatorMaterial, visionGeometry, visionMaterial, shadowMaterial]);

    const darknessContext = useMemo(() => {
        return {
            material: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            circle: new THREE.CircleGeometry(1, 32),
            box: new THREE.PlaneGeometry(1, 1)
        };
    }, []);

    useEffect(() => {
        return () => {
            darknessContext.material.dispose();
            darknessContext.circle.dispose();
            darknessContext.box.dispose();
        }
    }, [darknessContext]);

    const fowNeedsUpdate = useRef(true);
    useEffect(() => {
        fowNeedsUpdate.current = true;
    }, [walls, lights, playerVisionSources, enabled, fowWallsEnabled, role, gridSize, darknessVolumes]);

    useFrame((state, delta) => {
        let hasActiveDrag = false;
        if (rtdbDragsRef && rtdbDragsRef.current) {
            hasActiveDrag = Object.keys(rtdbDragsRef.current).length > 0;
        }

        
        if (pendingLoadFog.current) {
            const url = pendingLoadFog.current;
            pendingLoadFog.current = null;
            new THREE.TextureLoader().load(url, (tex) => {
                tex.minFilter = THREE.NearestFilter;
                tex.magFilter = THREE.NearestFilter;
                
                const oldTarget = gl.getRenderTarget();
                gl.setRenderTarget(exploredTarget);
                
                const scene = new THREE.Scene();
                const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const mat = new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
                const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
                scene.add(quad);
                
                gl.clear(true, true, true);
                gl.render(scene, cam);
                
                gl.setRenderTarget(oldTarget);
                
                mat.dispose();
                quad.geometry.dispose();
                tex.dispose();
                
                hasClearedExplored.current = true;
                // Force a render next frame so players see the loaded fog immediately
                fowNeedsUpdate.current = true;
            });
        }

        if (!fowCamera || (!fowNeedsUpdate.current && !hasActiveDrag)) {
            if (needsSave.current && Date.now() - lastSaveTime.current > 30000) {
                needsSave.current = false;
                lastSaveTime.current = Date.now();
                if (onSaveFog) {
                    const url = extractFogDataUrl();
                    if (url) onSaveFog(url);
                }
            }
            return;
        }

        fowNeedsUpdate.current = false;

        const oldColor = gl.getClearColor(new THREE.Color());
        const oldAlpha = gl.getClearAlpha();

        const oldAutoClear = gl.autoClear;
        gl.autoClear = false;

        const wallsArray = Object.values(walls || {}).filter(Boolean);
        gl.setRenderTarget(fowTarget);
        gl.setClearColor(0xffffff, 1); // 1. Clear to white (fully fogged)
        gl.clear(true, true, true); // color, depth, stencil

        const activeVisionSources = playerVisionSources.map(source => {
            if (rtdbDragsRef?.current?.[source.id]) {
                const drag = rtdbDragsRef.current[source.id];
                return { ...source, x: drag.x, z: drag.z };
            }
            return source;
        });

        const allSources = [...activeVisionSources];
        // Only factor in lights if FOW is actually enabled.
        if (enabled && lights) {
            Object.values(lights).forEach(light => {
                // FIX: Use light.radius, not light.range. The value is in feet.
                const lightRangeInMapUnits = (light.radius || 15) / 5 * gridSize; 
                
                let isVisibleToPlayers = role === 'dm';
                if (!isVisibleToPlayers) { // If not DM, check if any player token can see this light
                    const lightPt = { x: light.position.x, y: light.position.y || 0, z: light.position.z };
                    for (const src of activeVisionSources) {
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
                Object.values(walls).filter(Boolean).forEach(wall => {
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

        if (!isDM && !canSee && darknessVolumes && darknessVolumes.length > 0) {
            const darknessMesh = new THREE.Mesh(undefined, darknessContext.material);
            fowScene.add(darknessMesh);
        
            darknessVolumes.forEach(volume => {
                if (volume.shape === 'circle') {
                    const radius = Math.hypot(volume.points[1].x - volume.points[0].x, volume.points[1].z - volume.points[0].z);
                    darknessMesh.geometry = darknessContext.circle;
                    darknessMesh.position.set(volume.points[0].x, -volume.points[0].z, 0);
                    darknessMesh.scale.set(radius, radius, 1);
                    gl.render(fowScene, fowCamera);
                } else if (volume.shape === 'box') {
                    const width = Math.abs(volume.points[1].x - volume.points[0].x);
                    const height = Math.abs(volume.points[1].z - volume.points[0].z);
                    darknessMesh.geometry = darknessContext.box;
                    darknessMesh.position.set(
                        (volume.points[0].x + volume.points[1].x) / 2,
                        -(volume.points[0].z + volume.points[1].z) / 2,
                        0
                    );
                    darknessMesh.scale.set(width, height, 1);
                    gl.render(fowScene, fowCamera);
                }
            });
            fowScene.remove(darknessMesh);
        }

        gl.setRenderTarget(exploredTarget);
        if (!hasClearedExplored.current) {
            gl.setClearColor(0xffffff, 1);
            gl.clear(true, true, true);
            hasClearedExplored.current = true;
        }
        gl.render(accumulatorScene, accumulatorCamera);
        needsSave.current = true;
        
        gl.autoClear = oldAutoClear;

        gl.setRenderTarget(null);
        gl.setClearColor(oldColor, oldAlpha); // Restore map background color
        
        // Pass the texture to the grass shader ONLY AFTER it has been fully rendered to once.
        // This prevents WebGL from caching an empty/invalid texture state during compilation.
        if (!hasNotifiedTexture.current && onTextureReady) {
            hasNotifiedTexture.current = true;
            onTextureReady(exploredTarget.texture);
        }
    });

    if (isMagicalDarkness) {
        if (!isDM && !canSee) {
            // Player is in magical darkness and can't see.
            return (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={100}>
                    <planeGeometry args={[width, height]} />
                    <meshBasicMaterial color={0x000000} depthWrite={false} />
                </mesh>
            );
        } else {
            // DM or player can see through the magical darkness.
            return null;
        }
    }

    if (!width || !height || isNaN(width) || isNaN(height)) {
        return null;
    }

    return (
        <group>
            {/* Shroud: Permanent Memory of Explored Areas (Pitch Black) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} renderOrder={99} raycast={() => null}>
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
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={100} raycast={() => null}>
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
});
