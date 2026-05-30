import { create } from 'zustand';
import { loadEssentialData } from '../utils/5eDataUtils';

export const useCharacterBuilderStore = create((set, get) => ({
    ruleset: '2024',
    isDataLoading: false,
    srdData: {
        species: [],
        classes: [],
        backgrounds: []
    },
    
    draft: {
        name: '',
        avatarUrl: '',
        species: null,
        subspecies: null,
        classes: [], // Array of { classId, level, subclassId }
        background: null,
        abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        proficiencies: [],
        spells: [],
        equipment: []
    },
    
    pendingChoices: [], // Tracks decisions the user must make (e.g., "Choose 2 Skills")
    
    setRuleset: async (version) => {
        set({ ruleset: version, isDataLoading: true });
        const data = await loadEssentialData(version);
        set({ srdData: data, isDataLoading: false });
    },

    loadInitialData: async () => {
        const { ruleset, srdData } = get();
        if (srdData.classes.length === 0) {
            set({ isDataLoading: true });
            const data = await loadEssentialData(ruleset);
            set({ srdData: data, isDataLoading: false });
        }
    },

    updateDraft: (updates) => set((state) => ({ 
        draft: { ...state.draft, ...updates } 
    })),
    
    addPendingChoice: (choice) => set((state) => ({ 
        pendingChoices: [...state.pendingChoices, choice] 
    })),
    
    resolvePendingChoice: (choiceId, selection) => set((state) => {
        const remainingChoices = state.pendingChoices.filter(c => c.id !== choiceId);
        // Future step: apply the selection to the draft (e.g., add the chosen skill to proficiencies)
        return { pendingChoices: remainingChoices };
    })
}));