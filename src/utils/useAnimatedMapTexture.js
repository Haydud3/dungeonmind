import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { parseGIF, decompressFrames } from 'gifuct-js';

const EMPTY_TEXTURE = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
EMPTY_TEXTURE.needsUpdate = true;

export const useAnimatedMapTexture = (url, playbackRate = 1) => {
    const [texture, setTexture] = useState(EMPTY_TEXTURE);
    const [aspect, setAspect] = useState(1);
    
    const videoRef = useRef(null);
    const playbackRateRef = useRef(playbackRate);
    
    // Keep our playback rate ref synced and instantly apply it to videos
    useEffect(() => {
        playbackRateRef.current = playbackRate;
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        if (!url) {
            setTexture(EMPTY_TEXTURE);
            return;
        }
        console.log(`[Map Texture Debug] 🎬 Hook mounted. Target URL: ${url.substring(0, 50)}...`);

        let isActive = true;
        let animationFrameId;
        let videoElement = null;

        const lowerUrl = url.toLowerCase();
        let isVideo = lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('data:video');
        let isGif = lowerUrl.includes('.gif') || lowerUrl.includes('data:image/gif');
        let createdTexture = null;

        const loadTexture = async () => {
            if (!isActive) return;

            // If it's a blob url, we need to check its actual mime type
            if (url.startsWith('blob:')) {
                console.log(`[Map Texture Debug] 🔍 Checking blob metadata...`);
                try {
                    // HEAD requests on blob: URLs are not supported in Chrome/WebKit. Use GET.
                    const response = await fetch(url);
                    let contentType = response.headers.get('content-type');
                    if (!contentType) {
                        const cloned = response.clone();
                        contentType = (await cloned.blob()).type;
                    }
                    console.log(`[Map Texture Debug] 📄 Blob Content-Type: ${contentType}`);
                    if (contentType) {
                        if (contentType.startsWith('video/')) isVideo = true;
                        if (contentType === 'image/gif') isGif = true;
                    }
                } catch (e) {
                    console.debug(`[Map Texture Debug] Could not fetch blob metadata. Falling back to default loader.`, e);
                }
            }

            if (!isActive) return;
            console.log(`[Map Texture Debug] 🚀 Starting loader. isVideo: ${isVideo}, isGif: ${isGif}`);

            if (isVideo) {
                videoElement = document.createElement('video');
                videoRef.current = videoElement;
                videoElement.src = url;
                videoElement.crossOrigin = 'Anonymous';
                videoElement.loop = true;
                videoElement.muted = true;
                videoElement.playsInline = true;
                videoElement.autoplay = true;
                videoElement.playbackRate = playbackRateRef.current;
                videoElement.play().catch(console.error);

                const vidTex = new THREE.VideoTexture(videoElement);
                vidTex.colorSpace = THREE.SRGBColorSpace;
                createdTexture = vidTex;

                videoElement.addEventListener('loadedmetadata', () => {
                    if (isActive) {
                        setAspect(videoElement.videoWidth / videoElement.videoHeight);
                        setTexture(vidTex);
                    }
                });
            } else if (isGif) {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d', { willReadFrequently: true });
                let gifTexture = new THREE.CanvasTexture(canvas);
                gifTexture.colorSpace = THREE.SRGBColorSpace;
                createdTexture = gifTexture;
                
                let frames = [];
                let currentFrameIndex = 0;
                let accumulatedTime = 0;
                let lastTime = 0;
                
                let tempCanvas = document.createElement('canvas');
                let tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                
                let bgCanvas = document.createElement('canvas');
                let bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });

                fetch(url)
                    .then(res => res.arrayBuffer())
                    .then(buffer => {
                        if (!isActive) return;
                        const gif = parseGIF(buffer);
                        frames = decompressFrames(gif, true);
                        
                        if (frames.length > 0) {
                            // Pre-process frame data to avoid massive garbage collection pressure and CPU lag during high-speed playback loops
                            frames.forEach(f => {
                                f.imageData = new ImageData(
                                    new Uint8ClampedArray(f.patch),
                                    f.dims.width,
                                    f.dims.height
                                );
                                // gifuct-js already provides the delay in milliseconds.
                                // Default missing/0 delays to 100ms (browser standard) and clamp to 20ms min.
                                const frameDelayMs = f.delay > 0 ? f.delay : 100;
                                f.processedDelay = Math.max(frameDelayMs, 20);
                            });
                            
                            accumulatedTime = frames[0].processedDelay; // Instantly trigger the first frame
                            const width = frames[0].dims.width;
                            const height = frames[0].dims.height;
                            
                            canvas.width = width;
                            canvas.height = height;
                            tempCanvas.width = width;
                            tempCanvas.height = height;
                            bgCanvas.width = width;
                            bgCanvas.height = height;
                            
                            setAspect(width / height);
                            
                            const renderFrame = (time) => {
                                if (!isActive) return;
                                
                                if (frames.length > 1) {
                                    if (lastTime === 0) lastTime = time;
                                    let deltaTime = time - lastTime;
                                    lastTime = time;
                                    
                                    // Avoid death spirals if the user tabs out for a while
                                    if (deltaTime > 1000) deltaTime = 16;
                                    
                                    accumulatedTime += deltaTime * (playbackRateRef.current || 1);
                                    
                                    let frameUpdated = false;
                                    
                                    while (true) {
                                        const frame = frames[currentFrameIndex];
                                        
                                        if (accumulatedTime >= frame.processedDelay) {
                                            accumulatedTime -= frame.processedDelay;
                                            
                                            if (frame.disposalType === 2) {
                                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                            } else if (frame.disposalType === 3) {
                                                 ctx.putImageData(bgCtx.getImageData(0,0, canvas.width, canvas.height), 0, 0);
                                            }

                                            if (frame.disposalType !== 3) {
                                                bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
                                                bgCtx.drawImage(canvas, 0, 0);
                                            }

                                            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                                            tempCtx.putImageData(frame.imageData, frame.dims.left, frame.dims.top);
                                            ctx.drawImage(tempCanvas, 0, 0);
                                            
                                            frameUpdated = true;
                                            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
                                        } else {
                                            break;
                                        }
                                    }
                                    
                                    if (frameUpdated) {
                                        gifTexture.needsUpdate = true;
                                    }
                                    animationFrameId = requestAnimationFrame(renderFrame);
                                } else {
                                    ctx.putImageData(frames[0].imageData, 0, 0);
                                    gifTexture.needsUpdate = true;
                                }
                            };
                            
                            if (isActive) {
                                gifTexture.needsUpdate = true;
                                setTexture(gifTexture);
                            }
                            animationFrameId = requestAnimationFrame(renderFrame);
                        }
                    })
                    .catch(console.error);
            } else {
                const loader = new THREE.TextureLoader();
                loader.load(
                    url, 
                    (loadedTex) => {
                        console.log(`[Map Texture Debug] ✅ TextureLoader SUCCESS! Image dims:`, loadedTex.image?.width, "x", loadedTex.image?.height);
                        if (isActive) {
                            if (loadedTex.image) {
                                setAspect(loadedTex.image.width / loadedTex.image.height);
                            }
                            loadedTex.colorSpace = THREE.SRGBColorSpace;
                            loadedTex.needsUpdate = true;
                            createdTexture = loadedTex;
                            setTexture(loadedTex);
                        } else {
                            console.warn(`[Map Texture Debug] 🛑 Texture loaded, but component is no longer active.`);
                            loadedTex.dispose();
                        }
                    },
                    undefined,
                    (err) => {
                        console.error(`[Map Texture Debug] ❌ TextureLoader FAILED to load: ${url.substring(0, 50)}...`, err);
                    }
                );
            }
        };

        loadTexture();

        return () => {
            isActive = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (videoElement) {
                videoElement.pause();
                videoElement.removeAttribute('src');
                videoElement.load();
            }
            if (createdTexture) createdTexture.dispose();
        };
    }, [url]);

    return { texture, aspect };
};
