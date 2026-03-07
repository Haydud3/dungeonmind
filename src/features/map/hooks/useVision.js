import { useState, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { calculateVisibilityPolygon, getCharacterVisionSettings, calculateTokenCenter } from '../utils/visionMath';
import { idsMatch } from '../../../utils/idUtils';

export const useVisionEngine = ({
    mapReady,
    mapDimensions,
    isMobile,
    view,
    containerDimensions,
    tokens,
    walls,
    lights,
    visionActive,
    role,
    user,
    myCharId,
    mapGrid,
    players,
    npcs,
    movingTokenId,
    movingTokenPosRef,
    isPanning,
    disableVision = false
}) => {
    const discoveryCanvasRef = useRef(null);
    const visionCanvasRef = useRef(null);
    const visionWorkerRef = useRef(null);
    const lastVisionStateRef = useRef('');

    const [visionTexture, setVisionTexture] = useState(null);
    const [discoveryTexture, setDiscoveryTexture] = useState(null);

    // Initialize Vision Worker
    useEffect(() => {
        visionWorkerRef.current = new Worker(new URL('../workers/vision.worker.js', import.meta.url), { type: 'module' });
        return () => {
            visionWorkerRef.current?.terminate();
        };
    }, []);

    // Initialize Textures
    useEffect(() => {
        if (mapReady && !visionTexture) {
            if (!visionCanvasRef.current) visionCanvasRef.current = document.createElement('canvas');
            const tex = new THREE.CanvasTexture(visionCanvasRef.current);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            setVisionTexture(tex);
        }
        if (mapReady && !discoveryTexture) {
            if (!discoveryCanvasRef.current) discoveryCanvasRef.current = document.createElement('canvas');
            const tex = new THREE.CanvasTexture(discoveryCanvasRef.current);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            setDiscoveryTexture(tex);
        }
    }, [mapReady]);

    // Discovery Canvas Management
    useEffect(() => {
        if (!mapReady || !mapDimensions.width) return;
        
        if (!discoveryCanvasRef.current) discoveryCanvasRef.current = document.createElement('canvas');
        const dCanvas = discoveryCanvasRef.current;
        
        const D_MAX = isMobile ? 1024 : 2048;
        const dRatio = Math.min(1, D_MAX / Math.max(mapDimensions.width, mapDimensions.height));
        const dW = Math.floor(mapDimensions.width * dRatio);
        const dH = Math.floor(mapDimensions.height * dRatio);

        if (dCanvas.width !== dW || dCanvas.height !== dH) {
            dCanvas.width = dW;
            dCanvas.height = dH;
            const ctx = dCanvas.getContext('2d');
            ctx.clearRect(0, 0, dW, dH);
        }
    }, [mapDimensions.width, mapDimensions.height, mapReady, isMobile]);

    const visionResolutionBucket = useMemo(() => {
        if (!isMobile) return 1;
        if (view.scale < 0.2) return 0.2;
        if (view.scale < 0.4) return 0.4;
        return 1;
    }, [view.scale, isMobile]);

    const wallUniforms = useMemo(() => {
        const buffer = new Float32Array(100 * 4);
        const activeWalls = walls.filter(w => !(w.type === 'door' && w.isOpen));
        activeWalls.slice(0, 100).forEach((w, i) => {
            buffer[i * 4] = w.p1.x;
            buffer[i * 4 + 1] = -w.p1.y;
            buffer[i * 4 + 2] = w.p2.x;
            buffer[i * 4 + 3] = -w.p2.y;
        });
        return { buffer, count: Math.min(activeWalls.length, 100) };
    }, [walls]);

    const viewerUniforms = useMemo(() => {
        const buffer = new Float32Array(8 * 4);
        const activeViewers = tokens.filter(token => {
            if (role === 'dm') return token.type === 'pc';
            return idsMatch(token.characterId, myCharId) || idsMatch(token.ownerId, user?.uid) || (token.controlledBy || []).includes(user?.uid);
        });
        activeViewers.slice(0, 8).forEach((t, i) => {
            const center = calculateTokenCenter(t, mapDimensions.width, mapDimensions.height);
            const character = players?.find(p => idsMatch(p.id, t.characterId)) || npcs?.find(n => idsMatch(n.id, t.characterId));
            const settings = getCharacterVisionSettings(character, mapGrid.size || 50);
            buffer[i * 4] = center.x;
            buffer[i * 4 + 1] = -center.y;
            buffer[i * 4 + 2] = settings.radius;
            buffer[i * 4 + 3] = 0;
        });
        return { buffer, count: Math.min(activeViewers.length, 8) };
    }, [tokens, role, myCharId, user?.uid, mapDimensions, mapGrid.size, players, npcs]);

    const myCharFarPoly = useMemo(() => {
        if (role === 'dm' || !mapDimensions.width || !mapReady) return null;
        const myToken = tokens.find(t => idsMatch(t.characterId, myCharId)) || idsMatch(t.ownerId, user?.uid);
        if (!myToken) return null;
        const origin = calculateTokenCenter(myToken, mapDimensions.width, mapDimensions.height);
        const maxMapDim = Math.max(mapDimensions.width, mapDimensions.height) * 1.5;
        const blockingSegments = walls.filter(w => !(w.type === 'door' && w.isOpen));
        return calculateVisibilityPolygon(origin, blockingSegments, { width: mapDimensions.width, height: mapDimensions.height }, maxMapDim);
    }, [role, myCharId, user?.uid, tokens, walls, mapDimensions, mapReady]);

    const drawVisionFrame = (polyResults, logicalW, logicalH, lowPerf) => {
        const canvas = visionCanvasRef.current;
        const dCanvas = discoveryCanvasRef.current;
        if (!canvas || !dCanvas) return;

        const emittersToDraw = tokens.filter(token => {
            if (role === 'dm') return token.type === 'pc';
            return idsMatch(token.characterId, myCharId) || idsMatch(token.ownerId, user?.uid) || (token.controlledBy || []).includes(user?.uid);
        }).map(token => {
            const isMoving = token.id === movingTokenId;
            const posSource = (isMoving && movingTokenPosRef.current) ? { ...token, ...movingTokenPosRef.current } : token;
            const origin = calculateTokenCenter(posSource, logicalW, logicalH);
            const result = polyResults.find(r => r.id === token.id);
            return { token, origin, visionRadius: result ? result.radius : 0, nearPoly: result ? result.nearPoly : [], farPoly: result ? result.farPoly : [] };
        });

        const ctx = canvas.getContext('2d', { alpha: true });
        ctx.imageSmoothingEnabled = !lowPerf;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

        if (visionActive && role !== 'dm') {
            const dCtx = dCanvas.getContext('2d');
            const dRatio = dCanvas.width / logicalW;
            dCtx.save();
            dCtx.setTransform(dRatio, 0, 0, dRatio, 0, 0);
            dCtx.fillStyle = '#ffffff';
            emittersToDraw.forEach(({ origin, visionRadius, nearPoly }) => {
                if (!nearPoly || nearPoly.length === 0) {
                    dCtx.beginPath(); dCtx.arc(origin.x, origin.y, visionRadius, 0, Math.PI * 2); dCtx.fill();
                    return;
                }
                dCtx.beginPath(); dCtx.moveTo(nearPoly[0].x, nearPoly[0].y);
                for (let i = 1; i < nearPoly.length; i++) dCtx.lineTo(nearPoly[i].x, nearPoly[i].y);
                dCtx.closePath(); dCtx.fill();
            });
            dCtx.restore();
        }

        if (visionActive) {
            ctx.fillStyle = '#000000';
            ctx.globalAlpha = role === 'dm' ? 0.5 : 1.0;
            ctx.fillRect(0, 0, logicalW, logicalH);
            if (role !== 'dm') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.globalAlpha = 0.5;
                ctx.drawImage(dCanvas, 0, 0, logicalW, logicalH);
            }

            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'destination-out';
            emittersToDraw.forEach(({ origin, visionRadius, nearPoly }) => {
                if (!nearPoly || nearPoly.length === 0) {
                    ctx.beginPath();
                    ctx.arc(origin.x, origin.y, visionRadius, 0, Math.PI * 2);
                    ctx.fill();
                    return;
                }
                
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(nearPoly[0].x, nearPoly[0].y);
                for (let i = 1; i < nearPoly.length; i++) ctx.lineTo(nearPoly[i].x, nearPoly[i].y);
                ctx.closePath();
                ctx.clip();
                
                const grad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, visionRadius);
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.8, '#ffffff');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.restore();
            });
        } else {
            const hasWalls = walls.some(w => !(w.type === 'door' && w.isOpen));
            const validPolys = emittersToDraw.filter(e => e.farPoly && e.farPoly.length > 0);
            
            if (hasWalls && validPolys.length > 0 && role !== 'dm') {
                ctx.fillStyle = '#000000';
                ctx.globalAlpha = 1.0;
                ctx.fillRect(0, 0, logicalW, logicalH);
                
                ctx.globalCompositeOperation = 'destination-out';
                validPolys.forEach(({ farPoly }) => {
                    ctx.beginPath();
                    ctx.moveTo(farPoly[0].x, farPoly[0].y);
                    for (let i = 1; i < farPoly.length; i++) ctx.lineTo(farPoly[i].x, farPoly[i].y);
                    ctx.closePath();
                    ctx.fill();
                });
            }
        }

        // Light Sources
        const clippingPolygons = emittersToDraw.map(e => e.farPoly).filter(p => p && p.length > 0);
        if (lights.length > 0 && clippingPolygons.length > 0) {
            ctx.save();
            ctx.beginPath();
            clippingPolygons.forEach(poly => {
                if (!poly || poly.length === 0) return;
                ctx.moveTo(poly[0].x, poly[0].y);
                for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
                ctx.closePath();
            });
            ctx.clip();

            lights.forEach(light => {
                const origin = { 
                    x: Math.floor((light.x / 100) * logicalW), 
                    y: Math.floor((light.y / 100) * logicalH) 
                };
                const radiusPx = (light.radius / 5) * (mapGrid.size || 50);
                const blockingSegments = walls.filter(w => !(w.type === 'door' && w.isOpen));
                const poly = calculateVisibilityPolygon(origin, blockingSegments, { width: logicalW, height: logicalH }, radiusPx);

                ctx.save();
                if (poly && poly.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(poly[0].x, poly[0].y);
                    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
                    ctx.closePath();
                    ctx.clip();
                }

                const grad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radiusPx);
                grad.addColorStop(0, light.color || 'rgba(255, 200, 100, 1)');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                
                ctx.fillStyle = grad;
                ctx.globalCompositeOperation = 'destination-out'; 
                ctx.beginPath();
                ctx.arc(origin.x, origin.y, radiusPx, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
            ctx.restore();
        }

        if (discoveryTexture) discoveryTexture.needsUpdate = true;
        if (visionTexture) visionTexture.needsUpdate = true;

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
    };

    const updateVision = () => {
        const canvas = visionCanvasRef.current;
        const worker = visionWorkerRef.current;
        if (!canvas || isPanning || !mapReady || disableVision || !worker || !mapDimensions.width) return; 

        const movingPos = movingTokenId && movingTokenPosRef.current 
            ? `${movingTokenPosRef.current.x.toFixed(1)}-${movingTokenPosRef.current.y.toFixed(1)}` 
            : 'none';
        // OPTIMIZATION: Only track tokens that actually contribute to vision in the dirty check
        const viewers = tokens.filter(token => {
            if (role === 'dm') return token.type === 'pc';
            return idsMatch(token.characterId, myCharId) || idsMatch(token.ownerId, user?.uid) || (token.controlledBy || []).includes(user?.uid);
        });
        const visionStateKey = JSON.stringify([viewers.map(t => `${t.id}-${t.x}-${t.y}-${t.isHidden}`), walls.length, lights.length, visionActive, movingTokenId, movingPos]);
        
        if (visionStateKey === lastVisionStateRef.current) return;
        lastVisionStateRef.current = visionStateKey;

        const logicalW = mapDimensions.width;
        const logicalH = mapDimensions.height;
        const lowPerf = isMobile || localStorage.getItem('vtt_low_performance') === 'true';

        const dpr = isMobile ? 1 : window.devicePixelRatio;
        const targetW = Math.floor(containerDimensions.width * dpr);
        const targetH = Math.floor(containerDimensions.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        const emitters = tokens.filter(token => {
            if (role === 'dm') return token.type === 'pc';
            return idsMatch(token.characterId, myCharId) || idsMatch(token.ownerId, user?.uid) || (token.controlledBy || []).includes(user?.uid);
        }).map(token => {
            const isMoving = token.id === movingTokenId;
            const posSource = (isMoving && movingTokenPosRef.current) ? { ...token, ...movingTokenPosRef.current } : token;
            const origin = calculateTokenCenter(posSource, logicalW, logicalH);
            const character = players?.find(p => idsMatch(p.id, token.characterId)) || npcs?.find(n => idsMatch(n.id, token.characterId));
            const settings = getCharacterVisionSettings(character, mapGrid.size || 50);
            return { id: token.id, x: origin.x, y: origin.y, radius: settings.radius };
        });

        worker.onmessage = (e) => {
            drawVisionFrame(e.data, logicalW, logicalH, lowPerf);
        };

        worker.postMessage({
            emitters,
            walls,
            bounds: { width: logicalW, height: logicalH },
            maxDim: Math.max(logicalW, logicalH) * 2
        });
    };

    useEffect(() => { 
        const frame = requestAnimationFrame(updateVision); 
        return () => cancelAnimationFrame(frame);
    }, [tokens, walls, lights, visionActive, role, mapReady, visionResolutionBucket, view, containerDimensions, movingTokenId]);

    return { visionTexture, discoveryTexture, wallUniforms, viewerUniforms, myCharFarPoly };
};