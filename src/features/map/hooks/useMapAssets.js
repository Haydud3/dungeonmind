import { useState, useRef, useEffect, useCallback } from 'react';
import { useMapStore } from '../state/useMapStore';

const isMobile = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);

export const useMapAssets = (mapImageRef) => {
    // Get state from the store
    const mapData = useMapStore((state) => state.mapData);
    const viewScale = useMapStore((state) => state.view.scale);
    const setMapReady = useMapStore((state) => state.setMapReady);
    const setMapDimensions = useMapStore((state) => state.setMapDimensions);
    const tokens = mapData.tokens;
    const mapUrl = mapData.url;

    // Internal state for asset management
    const [fullTexture, setFullTexture] = useState(null);
    const [lodTexture, setLodTexture] = useState(null);
    const [assembledMapUrl, setAssembledMapUrl] = useState(null);
    const [tokenBlobUrls, setTokenBlobUrls] = useState({});
    
    const maxDimensionsRef = useRef({ width: 0, height: 0 });
    const dataUriToBlobUrlCache = useRef({});

    useEffect(() => {
        setMapReady(false);
        setFullTexture(null);
        setLodTexture(null);
        maxDimensionsRef.current = { width: 0, height: 0 };
        
        let isMounted = true;
        const createdUrls = [];
        const controller = new AbortController();

        const loadMap = async () => {
            try {
                const { retrieveChunkedMap } = await import('../../../utils/storageUtils');
                
                const processMapAsset = async (asset) => {
                    if (!asset) return null;
                    if (asset instanceof Blob) {
                        const url = URL.createObjectURL(asset);
                        createdUrls.push(url);
                        return url;
                    }
                    return asset;
                };

                const isChunked = mapUrl?.startsWith('chunked:');
                if (isChunked && mapData.thumbnailUrl?.startsWith('chunked:')) {
                    try {
                        const thumbBlob = await retrieveChunkedMap(mapData.thumbnailUrl, controller.signal);
                        if (isMounted) setLodTexture(await processMapAsset(thumbBlob));
                    } catch (e) {
                        if (e.name !== 'AbortError' && e.message !== 'Aborted') {
                            console.warn("Failed to load thumbnail chunk:", e);
                        }
                    }
                } else if (isChunked) {
                    setLodTexture(mapData.thumbnailUrl);
                } else {
                    setLodTexture(null);
                }

                if (mapUrl?.startsWith('chunked:')) {
                    try {
                        const fullBlob = await retrieveChunkedMap(mapUrl, controller.signal);
                        if (fullBlob) {
                            try {
                                const probe = await createImageBitmap(fullBlob);
                                const dims = { width: probe.width, height: probe.height };
                                if (isMounted) {
                                    setMapDimensions(dims);
                                    maxDimensionsRef.current = dims;
                                }
                                probe.close();
                            } catch (e) { console.warn("Dimension probe failed", e); }

                            if (isMobile) {
                                const MAX_SAFE = 2048;
                                const bmp = await createImageBitmap(fullBlob);
                                if (bmp.width > MAX_SAFE || bmp.height > MAX_SAFE) {
                                    const scale = Math.min(MAX_SAFE / bmp.width, MAX_SAFE / bmp.height);
                                    const canvas = document.createElement('canvas');
                                    canvas.width = Math.floor(bmp.width * scale);
                                    canvas.height = Math.floor(bmp.height * scale);
                                    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
                                    const downsampled = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
                                    if (isMounted) setFullTexture(await processMapAsset(downsampled));
                                    bmp.close();
                                } else {
                                    if (isMounted) setFullTexture(await processMapAsset(fullBlob));
                                }
                            } else {
                                try {
                                    const bmp = await createImageBitmap(fullBlob);
                                    const MAX_DIM = 4096;
                                    
                                    const scale = Math.min(MAX_DIM / bmp.width, MAX_DIM / bmp.height, 1); // Never upscale
                                    const canvas = document.createElement('canvas');
                                    canvas.width = Math.floor(bmp.width * scale);
                                    canvas.height = Math.floor(bmp.height * scale);
                                    const ctx = canvas.getContext('2d');
                                    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
                                    
                                    const processedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                                    if (isMounted) setFullTexture(await processMapAsset(processedBlob));
                                    bmp.close();
                                } catch (err) {
                                    if (isMounted) setFullTexture(await processMapAsset(fullBlob));
                                }
                            }
                        }
                    } catch (e) {
                        if (e.name !== 'AbortError' && e.message !== 'Aborted') {
                            console.error("Chunk Error:", e);
                        }
                    }
                } else {
                    setFullTexture(mapUrl);
                }
            } catch (e) {
                console.error("Init Fail:", e);
            }
        };
        loadMap();

        return () => {
            isMounted = false;
            controller.abort();
            createdUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [mapUrl, mapData.thumbnailUrl, setMapReady, setMapDimensions]);

    useEffect(() => {
        const isValid = (u) => u && typeof u === 'string' && !u.startsWith('chunked:');
        const useLOD = isMobile && viewScale < 0.25;
        
        if (useLOD && isValid(lodTexture)) setAssembledMapUrl(lodTexture);
        else if (isValid(fullTexture)) setAssembledMapUrl(fullTexture);
        else if (isValid(lodTexture)) setAssembledMapUrl(lodTexture);
        else setAssembledMapUrl(null);
     }, [viewScale, fullTexture, lodTexture, mapUrl]);

    useEffect(() => {
        let active = true;
        const newTokenBlobUrls = {};
        const urlsToRevoke = new Set(Object.values(tokenBlobUrls));

        const processTokens = async () => {
            for (const t of tokens) {
                if (t.image?.startsWith('data:')) {
                    if (dataUriToBlobUrlCache.current[t.image]) {
                        newTokenBlobUrls[t.id] = dataUriToBlobUrlCache.current[t.image];
                        urlsToRevoke.delete(newTokenBlobUrls[t.id]);
                    } else {
                        try {
                            const res = await fetch(t.image);
                            const blob = await res.blob();
                            const blobUrl = URL.createObjectURL(blob);
                            if (active) {
                                newTokenBlobUrls[t.id] = blobUrl;
                                dataUriToBlobUrlCache.current[t.image] = blobUrl;
                            }
                        } catch (e) {
                            console.warn("Failed to blobify token:", t.id, e);
                        }
                    }
                } else {
                    newTokenBlobUrls[t.id] = t.image;
                    urlsToRevoke.delete(newTokenBlobUrls[t.id]);
                }
            }
            
            if (active) {
                urlsToRevoke.forEach(url => {
                    if (url?.startsWith('blob:')) {
                        URL.revokeObjectURL(url);
                        for (const dataUri in dataUriToBlobUrlCache.current) {
                            if (dataUriToBlobUrlCache.current[dataUri] === url) {
                                delete dataUriToBlobUrlCache.current[dataUri];
                            }
                        }
                    }
                });
                setTokenBlobUrls(newTokenBlobUrls);
            }
        };
        processTokens();

        return () => {
            active = false;
            Object.values(newTokenBlobUrls).forEach(url => {
                if (url?.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, [tokens]);

    const handleMapLoad = useCallback(() => {
        const img = mapImageRef.current;
        if (img && img.naturalWidth > 0) {
            if (img.naturalWidth > maxDimensionsRef.current.width) {
                maxDimensionsRef.current = { width: img.naturalWidth, height: img.naturalHeight };
            }
            const realWidth = maxDimensionsRef.current.width || img.naturalWidth;
            const realHeight = maxDimensionsRef.current.height || img.naturalHeight;
            setMapDimensions({ width: realWidth, height: realHeight });
            setMapReady(true);
        }
    }, [mapImageRef, setMapDimensions, setMapReady]);

    useEffect(() => {
        if (mapImageRef.current?.complete) {
            handleMapLoad();
        }
    }, [mapUrl, handleMapLoad]);

    return { assembledMapUrl, tokenBlobUrls, handleMapLoad };
};