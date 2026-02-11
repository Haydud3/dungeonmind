import { create } from 'zustand';

// START CHANGE: Add 5e AC Calculation Helper
export const calcAC = (char) => {
    if (!char || !char.stats) return { value: 10, formula: "10 + DEX" };
    const dex = Math.floor(((char.stats.dex || 10) - 10) / 2);
    const con = Math.floor(((char.stats.con || 10) - 10) / 2);
    const wis = Math.floor(((char.stats.wis || 10) - 10) / 2);
    
    // Check Inventory for Armor/Shields
    const equippedArmor = char.inventory?.find(i => i.equipped && i.desc?.toLowerCase().includes('armor'));
    const equippedShield = char.inventory?.find(i => i.equipped && (i.name.toLowerCase().includes('shield') || i.type === 'Shield'));
    
    let baseAC = 10 + dex; 
    let formula = "Unarmored (10 + DEX)";

    // Unarmored Defense (Barbarian/Monk)
    if (!equippedArmor) {
        if (char.class?.toLowerCase().includes('barbarian')) {
            baseAC = 10 + dex + con;
            formula = "Unarmored (10 + DEX + CON)";
        } else if (char.class?.toLowerCase().includes('monk')) {
            baseAC = 10 + dex + wis;
            formula = "Unarmored (10 + DEX + WIS)";
        }
    } else {
        // Armored Logic
        let armorBase = 11; 
        let maxDex = 100; 
        const name = equippedArmor.name.toLowerCase();
        
        if (name.includes('leather') || name.includes('padded')) { armorBase = 11; formula = "Light Armor"; }
        if (name.includes('studded')) { armorBase = 12; formula = "Light Armor"; }
        
        if (name.includes('hide') || name.includes('chain shirt') || name.includes('scale') || name.includes('breastplate') || name.includes('half plate')) {
            armorBase = name.includes('hide') ? 12 : name.includes('half plate') ? 15 : 13;
            maxDex = 2;
            formula = "Medium Armor (Max DEX +2)";
        }
        
        if (name.includes('ring') || name.includes('chain mail') || name.includes('splint') || name.includes('plate')) {
            armorBase = name.includes('plate') ? 18 : 14;
            maxDex = 0;
            formula = "Heavy Armor";
        }
        const dexBonus = Math.min(dex, maxDex);
        baseAC = armorBase + dexBonus;
    }

    if (equippedShield) {
        baseAC += 2;
        formula += " + Shield";
    }

    return { value: baseAC, formula };
};
// END CHANGE

export const useCharacterStore = create((set, get) => ({
    character: null,
    isDirty: false,
    logs: [],
    // Ensure loading a character resets the dirty flag and logs
    // CRITICAL: Do a deep copy to prevent reference mutations from triggering updates
    loadCharacter: (char) => set({ 
        character: char ? JSON.parse(JSON.stringify({
            ...char,
            hp: char.hp || { current: 10, max: 10 },
            stats: char.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            skills: char.skills || [],
            spells: char.spells || [],
            // START CHANGE: Initialize spell slots if missing
            spellSlots: char.spellSlots || { 
                1: { current: 2, max: 2 }, 
                2: { current: 0, max: 0 }, 
                3: { current: 0, max: 0 } 
            },
            // END CHANGE
            inventory: char.inventory || [],
            features: char.features || [],
            classes: char.classes || [],
            externalSheetUrl: char.externalSheetUrl || "",
            useExternalSheet: char.useExternalSheet || false
        })) : null, 
        isDirty: false,
        logs: [] 
    }),

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
        
        // START CHANGE: Ensure AC recalc handles Master Templates correctly
        if (['dex', 'con', 'wis'].includes(stat)) {
            const acData = calcAC(char);
            char.ac = acData.value;
            char.acFormula = acData.formula;
        }
        // END CHANGE

        return { character: char, isDirty: true };
    }),

    updateInfo: (field, value) => set((state) => {
        const char = { ...state.character };
        char[field] = value;
        return { character: char, isDirty: true };
    }),

    // START CHANGE: Spell Slot Logic
    useSpellSlot: (level) => set((state) => {
        const char = { ...state.character };
        if (!char.spellSlots) char.spellSlots = {};
        if (!char.spellSlots[level]) char.spellSlots[level] = { current: 0, max: 0 };
        
        const current = char.spellSlots[level].current;
        if (current > 0) {
            char.spellSlots[level].current = current - 1;
            return { character: char, isDirty: true };
        }
        return {}; // No change if no slots
    }),

    recoverSlots: () => set((state) => {
        const char = { ...state.character };
        if (char.spellSlots) {
            Object.keys(char.spellSlots).forEach(lvl => {
                char.spellSlots[lvl].current = char.spellSlots[lvl].max;
            });
        }
        return { character: char, isDirty: true };
    }),
    // END CHANGE

    shortRest: (healAmount) => set((state) => {
        if (!state.character) return {};
        const char = { ...state.character };
        const max = char.hp.max;
        char.hp.current = Math.min(max, char.hp.current + healAmount);
        
        // Warlock Pact Magic (Reset slots on Short Rest if class is Warlock)
        if (char.class?.toLowerCase().includes('warlock') && char.spellSlots) {
             Object.keys(char.spellSlots).forEach(lvl => {
                char.spellSlots[lvl].current = char.spellSlots[lvl].max;
            });
        }

        return { character: char, isDirty: true };
    }),

    // START CHANGE: Resource Trackers, Inventory & Equipment Logic
    updateHitDice: (current) => set((state) => {
        const char = { ...state.character };
        if (!char.hitDice) char.hitDice = { current: 1, max: 1, die: "d8" };
        char.hitDice.current = Math.max(0, Math.min(current, char.hitDice.max));
        return { character: char, isDirty: true };
    }),

    updateExhaustion: (level) => set((state) => {
        const char = { ...state.character };
        char.exhaustion = Math.max(0, Math.min(level, 6));
        return { character: char, isDirty: true };
    }),

    toggleCondition: (condition) => set((state) => {
        const char = { ...state.character };
        const list = char.conditions || [];
        if (list.includes(condition)) char.conditions = list.filter(c => c !== condition);
        else char.conditions = [...list, condition];
        return { character: char, isDirty: true };
    }),

    addItem: (item) => set((state) => {
        const char = { ...state.character };
        char.inventory = [...(char.inventory || []), item];
        return { character: char, isDirty: true };
    }),

    removeItem: (index) => set((state) => {
        const char = { ...state.character };
        const newInv = [...char.inventory];
        newInv.splice(index, 1);
        char.inventory = newInv;
        // START CHANGE: Update AC on Remove
        const acData = calcAC(char);
        char.ac = acData.value;
        char.acFormula = acData.formula;
        // END CHANGE
        return { character: char, isDirty: true };
    }),

    toggleEquip: (index) => set((state) => {
        if (!state.character) return {};
        const newInv = [...state.character.inventory];
        const item = newInv[index];
        item.equipped = !item.equipped;
        
        const tempChar = { ...state.character, inventory: newInv };
        // START CHANGE: Update AC on Equip
        const acData = calcAC(tempChar);
        tempChar.ac = acData.value;
        tempChar.acFormula = acData.formula;
        // END CHANGE

        return { character: tempChar, isDirty: true };
    }),
    // END CHANGE

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
    })),

    // START CHANGE: Drag & Drop State
    sidebarDragEntity: null,
    dragPosition: { x: 0, y: 0 },
    setSidebarDragEntity: (entity) => set({ sidebarDragEntity: entity }),
    setDragPosition: (pos) => set({ dragPosition: pos })
}));