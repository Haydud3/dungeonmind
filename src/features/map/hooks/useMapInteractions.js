import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useMapStore } from '../state/useMapStore';
import { idsMatch } from '../../../utils/idUtils';
import { isPointInPolygon } from '../utils/visionMath';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import { useVfxStore } from '../../../stores/useVfxStore';
import { enrichCharacter } from '../../../utils/srdEnricher';

export const useMapInteractions = ({
    role,
    user,
    data,
    npcs,
    players,
    code,
    containerRef,
    mapImageRef,
    tokenRefs,
    myCharFarPolyRef,
    updateCampaign,
    sendPing,
    updateToken,
    deleteToken,
    sidebarMode,
    updateMapState,
    onDiceRoll,
    onClearRolls,
}) => {
    // Zustand store integration
    const store = useMapStore.getState();
    const { activeTool, movingTokenId, isPanning, view, mapData, mapDimensions, selectedTokenId, multiSelectedIds } = useMapStore();
    const { setActiveTool, setMovingTokenId, setIsPanning, setSelectedTokenId, pan } = useMapStore();
    const viewRef = useRef(view);
    useEffect(() => { viewRef.current = view; }, [view]);

    const addEffect = useVfxStore(state => state.addEffect);
    const setTargetingPreview = useVfxStore(state => state.setTargetingPreview);
    const targetingPreview = useVfxStore(state => state.targetingPreview);

    // Local state for UI that isn't global
    const movingTokenPosRef = useRef(null);
    const [activeMeasurement, setActiveMeasurement] = useState(null);
    const [gridCalStart, setGridCalStart] = useState(null);
    const gridCalStartRef = useRef(null);
    const [selectionStart, setSelectionStart] = useState(null);
    const selectionStartRef = useRef(null);
    const [multiSelectStart, setMultiSelectStart] = useState(null);
    const multiSelectStartRef = useRef(null);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [wallStart, setWallStart] = useState(null);
    const [activeLightId, setActiveLightId] = useState(null);
    const [shakingTokenId, setShakingTokenId] = useState(null);
    const [spawningToken, setSpawningToken] = useState(null);
    const [isDraggingToken, setIsDraggingToken] = useState(false);
    const [pings, setPings] = useState([]);
    const [activeStack, setActiveStack] = useState(null);
    const [fxSettings, setFxSettings] = useState({ type: 'burst', flavor: 'fire' });
    const [objectSettings, setObjectSettings] = useState({ type: 'wall' });

    const latestDataRef = useRef(data);
    const latestTokensRef = useRef(mapData.tokens);
    
    useEffect(() => {
        latestDataRef.current = data;
        latestTokensRef.current = mapData.tokens;
    }, [data, mapData.tokens]);

    const triggerHaptic = useCallback((style = 'light') => {
        if (window.navigator.vibrate) {
            if (style === 'light') window.navigator.vibrate(5);
            else if (style === 'medium') window.navigator.vibrate(40);
            else if (style === 'heavy') window.navigator.vibrate([40, 60, 40]);
        }
    }, []);

    const getMapCoords = useCallback((e) => {
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - viewRef.current.x) / viewRef.current.scale,
            y: (e.clientY - rect.top - viewRef.current.y) / viewRef.current.scale
        };
    }, [containerRef]);

    const handlePointerDown = useCallback((e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);

        if (activeTool === 'move') {
            setIsPanning(true);
        }
        // More logic will be ported here...
    }, [activeTool, setIsPanning]);

    const handleGlobalMove = useCallback((e) => {
        if (isPanning) {
            pan({ x: e.movementX, y: e.movementY });
        }
        // More logic will be ported here...
    }, [isPanning, pan]);

    const handleGlobalUp = useCallback((e) => {
        setIsPanning(false);
        // More logic will be ported here...
    }, [setIsPanning]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        
        el.addEventListener('pointermove', handleGlobalMove);
        el.addEventListener('pointerup', handleGlobalUp);
        el.addEventListener('pointercancel', handleGlobalUp);

        return () => {
            el.removeEventListener('pointermove', handleGlobalMove);
            el.removeEventListener('pointerup', handleGlobalUp);
            el.removeEventListener('pointercancel', handleGlobalUp);
        };
    }, [handleGlobalMove, handleGlobalUp, containerRef]);

    // Return values needed by UI
    return {
        activeTool,
        setActiveTool,
        handlePointerDown,
        // ... other handlers and state to be exposed to the UI
        pings,
        spawningToken,
        activeMeasurement,
        cursorPos,
        wallStart,
        selectionStart,
        multiSelectStart,
        activeStack,
        setActiveStack,
        selectedTokenId,
        setSelectedTokenId,
        activeLightId,
        setActiveLightId,
        fxSettings,
        setFxSettings,
        objectSettings,
        setObjectSettings,
    };
};
