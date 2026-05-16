import { create } from 'zustand';

export const useVfxStore = create((set, get) => ({
    activeEffects: [],
    targetingPreview: null,
    ambientLifeLevel: 'low',
    
    // Global Environmental Factors
    globalWind: { x: 1.0, y: 0.0, z: 0.5 }, // Vector direction & strength
    setGlobalWind: (wind) => set({ globalWind: wind }),
    
    setAmbientLifeLevel: (level) => set({ ambientLifeLevel: level }),
    
    addEffect: (effect) => {
        const id = Date.now() + Math.random();
        const duration = effect.duration || 1000;
        
        const newEffect = { 
            ...effect, 
            id, 
            startTime: Date.now(),
            duration 
        };
        
        set(state => ({ activeEffects: [...state.activeEffects, newEffect] }));
        
        // Auto-cleanup after animation finishes
        setTimeout(() => {
            set(state => ({ activeEffects: state.activeEffects.filter(e => e.id !== id) }));
        }, duration + 200);
    },

    setTargetingPreview: (preview) => set({ targetingPreview: preview })
}));