/** -
 * A map for D&D Beyond's ability score IDs to a common name.
 */
const ABILITY_ID_MAP = {
  1: 'str',
  2: 'dex',
  3: 'con',
  4: 'int',
  5: 'wis',
  6: 'cha',
};

const ALIGNMENT_ID_MAP = {
    1: 'Lawful Good', 2: 'Neutral Good', 3: 'Chaotic Good',
    4: 'Lawful Neutral', 5: 'True Neutral', 6: 'Chaotic Neutral',
    7: 'Lawful Evil', 8: 'Neutral Evil', 9: 'Chaotic Evil',
};

const SKILL_ABILITY_MAP = {
    'acrobatics': 'dex', 'animal-handling': 'wis', 'arcana': 'int',
    'athletics': 'str', 'deception': 'cha', 'history': 'int',
    'insight': 'wis', 'intimidation': 'cha', 'investigation': 'int',
    'medicine': 'wis', 'nature': 'int', 'perception': 'wis',
    'performance': 'cha', 'persuasion': 'cha', 'religion': 'int',
    'sleight-of-hand': 'dex', 'stealth': 'dex', 'survival': 'wis'
};

/** -
 * A map for D&D Beyond's alignment IDs to a common name.
 */
const ALIGNMENT_ID_MAP = {
    1: 'Lawful Good',
    2: 'Neutral Good',
    3: 'Chaotic Good',
    4: 'Lawful Neutral',
    5: 'True Neutral',
    6: 'Chaotic Neutral',
    7: 'Lawful Evil',
    8: 'Neutral Evil',
    9: 'Chaotic Evil',
};

/** -
 * A map of skill names from D&D Beyond to their associated ability score.
 */
const SKILL_ABILITY_MAP = {
    'acrobatics': 'dexterity',
    'animal-handling': 'wisdom',
    'arcana': 'intelligence',
    'athletics': 'strength',
    'deception': 'charisma',
    'history': 'intelligence',
    'insight': 'wisdom',
    'intimidation': 'charisma',
    'investigation': 'intelligence',
    'medicine': 'wisdom',
    'nature': 'intelligence',
    'perception': 'wisdom',
    'performance': 'charisma',
    'persuasion': 'charisma',
    'religion': 'intelligence',
    'sleight-of-hand': 'dexterity',
    'stealth': 'dexterity',
    'survival': 'wisdom'
};


/** -
 * Calculates the ability modifier for a given score.
 * @param {number} score The ability score.
 * @returns {number} The calculated modifier.
 */
const getAbilityModifier = (score = 10) => Math.floor((score - 10) / 2);

/** -
 * Calculates the proficiency bonus for a given character level.
 * @param {number} level The character's total level.
 * @returns {number} The proficiency bonus.
 */
const getProficiencyBonus = (level = 1) => Math.ceil(1 + level / 4);

/** -
 * Parses the raw JSON from D&D Beyond into a structured character sheet object.
 * @param {object} json The raw JSON object from the D&D Beyond API.
 * @returns {object} A structured character sheet.
 */
export const parseDndBeyondJson = (json) => {
    const data = json.data;
    if (!data) throw new Error("Invalid D&D Beyond JSON: 'data' property not found.");

    const characterSheet = {
        stats: {}, modifiers: {}, skills: {}, savingThrows: {}, proficiencies: {}, 
        bio: {}, customActions: [], inventory: [], spells: [], spellSlots: {},
        conditions: [], features: []
    };

    // 1. Core Info & Stats
    characterSheet.name = data.name;
    (data.stats || []).forEach(stat => {
        const statName = ABILITY_ID_MAP[stat.id];
        const score = (stat.value || 0) + ((data.bonusStats || []).find(bs => bs.id === stat.id)?.value || 0);
        characterSheet.stats[statName] = score;
        characterSheet.modifiers[statName] = getAbilityModifier(score);
    });

    // 2. Inventory & Attack Actions
    characterSheet.inventory = (data.inventory || []).map(item => {
        const def = item.definition;
        let combat = null;
        
        // Detect Weapons (Melee or Ranged)
        const isWeapon = def && (def.filterType === "Weapon" || def.type === "Weapon" || def.weaponBehaviors?.length > 0);

        // ONLY add combat actions for EQUIPPED items
        if (isWeapon && item.equipped) {
            const wb = def.weaponBehaviors?.[0] || def;
            const dmgDice = wb.damage?.diceString;
            
            if (dmgDice) {
                const isFinesse = wb.properties?.some(p => p.name === 'Finesse');
                const isRanged = wb.attackType === 2;
                const statMod = (isRanged || (isFinesse && characterSheet.modifiers.dexterity > characterSheet.modifiers.strength)) 
                    ? characterSheet.modifiers.dexterity : characterSheet.modifiers.strength;
                
                combat = {
                    hit: (characterSheet.profBonus || 2) + statMod,
                    dmg: `${dmgDice}${statMod !== 0 ? (statMod > 0 ? '+' : '') + statMod : ''}`,
                    type: 'Action',
                    category: 'Attack',
                    range: wb.range ? `${wb.range} ft` : '5 ft',
                    notes: wb.damageType || def.damageType || '',
                    desc: def.description || '' // Added full description
                };
            }
        }
        
        return { name: def?.name || 'Unknown Item', quantity: item.quantity, combat, equipped: item.equipped };
    });

    // 3. Spells (Merging both 'spells' and 'classSpells' arrays)
    const allSpellsRaw = [];
    if (data.spells) {
        Object.values(data.spells).forEach(arr => { if (Array.isArray(arr)) allSpellsRaw.push(...arr); });
    }
    if (data.classSpells) {
        data.classSpells.forEach(cs => { if (Array.isArray(cs.spells)) allSpellsRaw.push(...cs.spells); });
    }

    const spellsByLevel = {};
    allSpellsRaw.filter(s => s && s.definition).forEach(spell => {
        const def = spell.definition;
        const level = def.level;
        if (!spellsByLevel[level]) spellsByLevel[level] = [];
        
        const activation = def.activation?.activationType === 3 ? 'Bonus Action' : def.activation?.activationType === 4 ? 'Reaction' : 'Action';
        const rangeStr = typeof def.range === 'object' ? (def.range?.rangeValue ? `${def.range.rangeValue} ft` : (def.range?.origin || 'Self')) : (def.range || 'Self');
        const dmgMod = def.modifiers?.find(m => m.type === 'damage');
        
        spellsByLevel[level].push({
            ...def,
            desc: def.description || '', // Ensure this is mapped
            time: `${def.activation?.activationTime || ''} ${activation}`.trim(),
            hit: def.requiresAttackRoll ? (characterSheet.profBonus || 2) + (characterSheet.modifiers[characterSheet.spellAbility] || 0) : "",
            dmg: dmgMod?.die?.diceString || "",
            range: rangeStr // Added range so ActionsTab can display it
        });
    });
    characterSheet.spells = Object.values(spellsByLevel).flat();

    // 4. Inject Unarmed Strike
    const strMod = characterSheet.modifiers.strength || 0;
    characterSheet.customActions.push({
        name: "Unarmed Strike",
        hit: (characterSheet.profBonus || 2) + strMod,
        dmg: `1${strMod !== 0 ? (strMod > 0 ? '+' : '') + strMod : ''}`,
        type: 'Action'
    });

    return characterSheet;
};