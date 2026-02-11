import { create } from 'zustand';

export const useVfxStore = create((set) => ({
    activeEffects: [],
    targetingPreview: null, // { origin: {x,y}, target: {x,y}, flavor, behavior, tokenId }

    addEffect: (effect) => {
        const id = effect.id || (Date.now() + Math.random());
        const duration = effect.duration || 1000;
        set((state) => ({
            activeEffects: [...state.activeEffects, { ...effect, id, startTime: Date.now() }]
        }));
        
        // Cleanup after duration to prevent memory leaks
        setTimeout(() => {
            set((state) => ({
                activeEffects: state.activeEffects.filter(e => e.id !== id)
            }));
        }, duration);
    },

    setTargetingPreview: (preview) => set({ targetingPreview: preview }),
    clearTargetingPreview: () => set({ targetingPreview: null })
}));