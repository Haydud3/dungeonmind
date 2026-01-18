import { create } from 'zustand';

export const useCharacterStore = create((set, get) => ({
    character: null,
    isDirty: false,
    logs: [],

    loadCharacter: (char) => set({ character: char, isDirty: false }),

    updateHP: (type, value) => set((state) => {
        if (!state.character) return {};
        
        const char = { ...state.character };
        const current = char.hp.current;
        const max = char.hp.max;

        let newVal = value;

        if (type === 'current') {
            // Rule: Strictly Clamp between 0 and Max
            newVal = Math.max(0, Math.min(value, max));
            
            // Rule: If healing from 0, reset Death Saves
            if (current === 0 && newVal > 0) {
                char.deathSaves = { successes: 0, failures: 0 };
            }
        }

        char.hp[type] = newVal;
        return { character: char, isDirty: true };
    }),

    // Manual setter for clicking bubbles
    setDeathSaves: (type, count) => set((state) => {
        const char = { ...state.character };
        if (!char.deathSaves) char.deathSaves = { successes: 0, failures: 0 };
        
        char.deathSaves[type] = count;

        // Auto-Heal Check on Manual Click
        if (char.deathSaves.successes >= 3) {
            char.hp.current = 1;
            char.deathSaves = { successes: 0, failures: 0 };
        }

        return { character: char, isDirty: true };
    }),

    // Rolling logic
    updateDeathSaves: (result) => set((state) => {
        const char = { ...state.character };
        if (!char.deathSaves) char.deathSaves = { successes: 0, failures: 0 };

        if (result === 'reset') {
            char.deathSaves = { successes: 0, failures: 0 };
        } else if (result === 'success') {
            char.deathSaves.successes = Math.min(3, (char.deathSaves.successes || 0) + 1);
        } else if (result === 'failure') {
            char.deathSaves.failures = Math.min(3, (char.deathSaves.failures || 0) + 1);
        } else if (result === 'crit_fail') {
            char.deathSaves.failures = Math.min(3, (char.deathSaves.failures || 0) + 2);
        }

        // Auto-Heal Check on Roll
        if (char.deathSaves.successes >= 3) {
            char.hp.current = 1;
            char.deathSaves = { successes: 0, failures: 0 };
        }

        return { character: char, isDirty: true };
    }),

    updateStat: (stat, value) => set((state) => {
        const char = { ...state.character };
        if (!char.stats) char.stats = {};
        char.stats[stat] = value;
        return { character: char, isDirty: true };
    }),

    updateInfo: (field, value) => set((state) => {
        const char = { ...state.character };
        char[field] = value;
        return { character: char, isDirty: true };
    }),

    recoverSlots: () => set((state) => ({ isDirty: true })),

    shortRest: (healAmount) => set((state) => {
        if (!state.character) return {};
        const char = { ...state.character };
        const max = char.hp.max;
        char.hp.current = Math.min(max, char.hp.current + healAmount);
        return { character: char, isDirty: true };
    }),

    markSaved: () => set({ isDirty: false }),
    
    // FIX: Handle both string and object inputs to prevent [object Object]
    addLogEntry: (entry) => set((state) => {
        const msgContent = typeof entry === 'object' && entry.message ? entry.message : entry;
        return { 
            logs: [{ id: Date.now(), message: msgContent }, ...(state.logs || [])].slice(0, 5) 
        };
    }),

    removeLog: (id) => set((state) => ({
        logs: state.logs.filter(l => l.id !== id)
    }))
}));