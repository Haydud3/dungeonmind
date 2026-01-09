import { create } from 'zustand';

const getMod = (score) => Math.floor((score - 10) / 2);
const getProficiency = (level) => Math.ceil(level / 4) + 1;

export const useCharacterStore = create((set, get) => ({
  // --- STATE ---
  character: null,
  isDirty: false,
  rollHistory: [],

  // --- ACTIONS ---
  loadCharacter: (charData) => set({ 
      character: {
          ...charData,
          stats: charData.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          hp: charData.hp || { current: 10, max: 10, temp: 0 },
          skills: charData.skills || {},
          spells: charData.spells || [],
          spellSlots: charData.spellSlots || { 1: { current: 0, max: 0 } },
          inventory: charData.inventory || [],
          currency: charData.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
          level: charData.level || 1,
          profBonus: charData.profBonus || 2,
          features: charData.features || [],
          customActions: charData.customActions || [],
          bio: charData.bio || {}
      },
      isDirty: false 
  }),

  addLogEntry: (entry) => set((state) => {
      const newLog = typeof entry === 'string' ? { message: entry } : entry;
      return {
          rollHistory: [{ id: Date.now(), ...newLog }, ...state.rollHistory].slice(0, 5) 
      };
  }),

  updateInfo: (field, value) => set((state) => {
      let updates = { [field]: value };
      if (field === 'level') {
          const lvl = parseInt(value) || 1;
          updates.level = lvl;
          updates.profBonus = getProficiency(lvl);
      }
      return { character: { ...state.character, ...updates }, isDirty: true };
  }),

  updateStat: (stat, value) => set((state) => ({
    character: { 
        ...state.character, 
        stats: { ...state.character.stats, [stat]: parseInt(value) || 10 } 
    },
    isDirty: true
  })),

  updateHP: (field, value) => set((state) => ({
    character: { 
        ...state.character, 
        hp: { ...state.character.hp, [field]: parseInt(value) || 0 } 
    },
    isDirty: true
  })),

  updateCurrency: (type, value) => set((state) => ({
      character: { 
          ...state.character, 
          currency: { ...state.character.currency, [type]: parseInt(value) || 0 } 
      },
      isDirty: true
  })),

  recoverSlots: () => set((state) => {
      const slots = state.character.spellSlots || {};
      const newSlots = {};
      Object.keys(slots).forEach(lvl => {
          newSlots[lvl] = { ...slots[lvl], current: slots[lvl].max };
      });
      return {
          character: { 
              ...state.character, 
              spellSlots: newSlots, 
              hp: { ...state.character.hp, current: state.character.hp.max } 
          },
          isDirty: true
      };
  }),

  shortRest: (hpRegen) => set((state) => {
      let newHp = state.character.hp.current + hpRegen;
      if (newHp > state.character.hp.max) newHp = state.character.hp.max;
      return {
          character: { ...state.character, hp: { ...state.character.hp, current: newHp } },
          isDirty: true
      };
  }),

  castSpell: (level) => set((state) => {
      const slots = state.character.spellSlots || {};
      const slotData = slots[level];
      if (slotData && slotData.current > 0) {
          const newSlots = { ...slots, [level]: { ...slotData, current: slotData.current - 1 } };
          return { character: { ...state.character, spellSlots: newSlots }, isDirty: true };
      }
      return state; 
  }),

  addItem: (item) => set((state) => ({
      character: { ...state.character, inventory: [...(state.character.inventory || []), item] },
      isDirty: true
  })),

  removeItem: (index) => set((state) => {
      const newInv = [...(state.character.inventory || [])];
      newInv.splice(index, 1);
      return { character: { ...state.character, inventory: newInv }, isDirty: true };
  }),

  toggleSkill: (skill) => set((state) => {
    const newSkills = { ...state.character.skills };
    newSkills[skill] = !newSkills[skill]; 
    return { character: { ...state.character, skills: newSkills }, isDirty: true };
  }),

  markSaved: () => set({ isDirty: false }),

  getModifier: (stat) => {
      const s = get().character?.stats?.[stat] || 10;
      return getMod(s);
  },

  // --- ADDED THIS FUNCTION TO FIX THE CRASH ---
  getSkillBonus: (skillName, stat) => {
      const state = get();
      const char = state.character;
      if (!char) return 0;
      const modifier = state.getModifier(stat);
      const isProficient = char.skills?.[skillName];
      return modifier + (isProficient ? char.profBonus : 0);
  }
}));