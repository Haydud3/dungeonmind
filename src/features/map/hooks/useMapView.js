import { useRef, useEffect, useCallback } from 'react';
import { useMapStore } from '../state/useMapStore';
import { idsMatch } from '../../../utils/idUtils';

export const useMapView = ({ containerRef, mapImageRef, role, user, data, code }) => {
    // Get state and actions from the store
    const view = useMapStore((state) => state.view);
    const setView = useMapStore((state) => state.setView);
    const zoom = useMapStore((state) => state.zoom);
    const mapData = useMapStore((state) => state.mapData);
    const tokens = mapData.tokens;

    // The viewRef is still useful for event handlers that need the latest view without causing re-renders.
    const viewRef = useRef(view);
    useEffect(() => {
        viewRef.current = view;
    }, [view]);

    // Initialize view from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(`vtt_view_${mapData.id || code}`);
            const parsed = saved ? JSON.parse(saved) : null;
            if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) && Number.isFinite(parsed.scale)) {
                setView(parsed);
            }
        } catch (e) { console.warn("Corrupt view state reset"); }
    }, [mapData.id, code, setView]);

    const centerOnTarget = useCallback(() => {
        const container = containerRef.current;
        const img = mapImageRef.current;
        if (!container || !img || !img.complete) return;

        const rect = container.getBoundingClientRect();
        const currentScale = viewRef.current.scale;
        let targetPx = { x: img.naturalWidth / 2, y: img.naturalHeight / 2 };

        if (role !== 'dm') {
            const myCharId = data.assignments?.[user?.uid];
            const myToken = tokens.find(t => idsMatch(t.characterId, myCharId)) || 
                            tokens.find(t => idsMatch(t.ownerId, user?.uid));
            
            if (myToken) {
                targetPx = {
                    x: (myToken.x / 100) * img.naturalWidth,
                    y: (myToken.y / 100) * img.naturalHeight
                };
            }
        }

        const newView = {
            scale: currentScale,
            x: (rect.width / 2) - (targetPx.x * currentScale),
            y: (rect.height / 2) - (targetPx.y * currentScale)
        };

        setView(newView);
    }, [containerRef, mapImageRef, role, data.assignments, user?.uid, tokens, mapData.id, setView]);

    const handleZoom = useCallback((factor) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const center = { x: rect.width / 2, y: rect.height / 2 };
        zoom(factor, center);
    }, [containerRef, zoom]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e) => {
            if (e.target.closest('.overflow-y-auto') || e.target.closest('.custom-scroll')) {
                return;
            }
            e.preventDefault();
            
            const scaleSensitivity = 0.001; 
            const delta = 1 - (e.deltaY * scaleSensitivity);
            
            const rect = container.getBoundingClientRect();
            const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            
            zoom(delta, center);
        };

        container.addEventListener('wheel', onWheel, { passive: false });

        return () => container.removeEventListener('wheel', onWheel);
    }, [containerRef, zoom]);
    
    // Save view to localStorage whenever it changes
    useEffect(() => {
        if (mapData.id || code) {
            localStorage.setItem(`vtt_view_${mapData.id || code}`, JSON.stringify(view));
        }
    }, [view, mapData.id, code]);

    return { centerOnTarget, handleZoom };
};