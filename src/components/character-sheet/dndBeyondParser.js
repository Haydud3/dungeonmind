/** -
 * A map for D&D Beyond's ability score IDs to a common name.
 */
const ABILITY_ID_MAP = {
  1: 'strength',
  2: 'dexterity',
  3: 'constitution',
  4: 'intelligence',
  5: 'wisdom',
  6: 'charisma',
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
    const data = json.data; // CRITICAL FIX: Access json.data to get the actual character object
    if (!data) {
        throw new Error("Invalid D&D Beyond JSON: 'data' property not found or is empty."); // Corrected typo: new new Error -> new Error
    }

    // This will be the final character sheet object, structured to match the app's state
    const characterSheet = {
        stats: {}, modifiers: {}, skills: {}, savingThrows: {}, proficiencies: {}, bio: {}, customActions: []
    };

    // Core Info
    characterSheet.dndBeyondId = data.id;
    characterSheet.name = data.name;
    characterSheet.avatarUrl = data.decorations.avatarUrl;
    characterSheet.inspiration = data.inspiration;
    characterSheet.race = data.race?.fullName || 'Unknown Race'; // Added optional chaining for race
    characterSheet.background = data.background?.definition?.name || 'Unknown'; // Added optional chaining
    characterSheet.alignment = ALIGNMENT_ID_MAP[data.alignmentId] || 'Unknown';
    characterSheet.image = data.decorations.avatarUrl;

    // Classes & Level
    characterSheet.classes = (data.classes || []).map(cls => ({ // Ensure data.classes is an array
        name: cls.definition?.name || 'Unknown Class', // Added optional chaining
        subclass: cls.subclassDefinition?.name || null, // Added optional chaining
        level: cls.level || 0,
    }));
    const totalLevel = characterSheet.classes.reduce((acc, cls) => acc + cls.level, 0);
    characterSheet.level = totalLevel;
    characterSheet.xp = data.currentXp;

    // Stats & Modifiers
    // Already initialized
    (data.stats || []).forEach(stat => { // Ensure data.stats is an array before iterating
        const statName = ABILITY_ID_MAP[stat.id];
        const score = (stat.value || 0) + (data.bonusStats.find(bs => bs.id === stat.id)?.value || 0);
        characterSheet.stats[statName] = score;
        characterSheet.modifiers[statName] = getAbilityModifier(score);
    });

    // Proficiency Bonus
    characterSheet.profBonus = getProficiencyBonus(totalLevel);

    // Collect all proficiencies from different sources
    const proficiencies = new Set();
    const languages = new Set();
    const armorProfs = new Set();
    const weaponProfs = new Set();
    const toolProfs = new Set();

    ['race', 'class', 'background', 'item', 'feat'].forEach(source => {
        if (data.modifiers?.[source]) { // Ensure modifiers source exists
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'proficiency') {
                    proficiencies.add(mod.subType);
                }
                if (mod.type === 'language') {
                    languages.add(mod.friendlySubtypeName);
                }
            });
        }
    });

    // D&D Beyond sometimes grants proficiencies via `definition.description` text.
    // This is a simplified parse. A more robust solution would be needed for all cases.
    (data.classes || []).forEach(cls => { // Ensure data.classes is an array
        const profText = cls.definition?.classFeatures.find(f => f.name === 'Proficiencies')?.description || '';
        if (profText.includes('Light armor')) armorProfs.add('Light Armor');
        if (profText.includes('Medium armor')) armorProfs.add('Medium Armor');
        if (profText.includes('Heavy armor')) armorProfs.add('Heavy Armor');
        if (profText.includes('Shields')) armorProfs.add('Shields');
        if (profText.includes('Simple weapons')) weaponProfs.add('Simple Weapons');
        if (profText.includes('Martial weapons')) weaponProfs.add('Martial Weapons');
    });

    characterSheet.proficiencies = {
        armor: [...armorProfs].join(', '),
        weapons: [...weaponProfs].join(', '),
        tools: [...toolProfs].join(', '),
        languages: [...languages].join(', '),
    };

    // Saving Throws
    Object.values(ABILITY_ID_MAP).forEach(name => {
        characterSheet.savingThrows[name.substring(0, 3)] = proficiencies.has(`${name}-saving-throws`);
    });

    // Skills
    Object.entries(SKILL_ABILITY_MAP).forEach(([skillName, abilityName]) => {
        // Capitalize skill name for compatibility with SKILL_LIST in SkillsTab
        const formattedSkillName = skillName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        if (proficiencies.has(skillName)) {
            characterSheet.skills[formattedSkillName] = true;
        }
    });

    // HP
    const maxHp = data.baseHitPoints + (data.bonusHitPoints || 0) + (data.overrideHitPoints || 0);
    characterSheet.hp = {
        max: maxHp,
        current: maxHp - (data.removedHitPoints || 0),
        temp: data.temporaryHitPoints || 0,
    };

    // AC
    let acFormula = "10 + DEX";
    let ac = 10 + characterSheet.modifiers.dexterity; // Default AC
    const equippedArmor = (data.inventory || []).find(i => i.equipped && i.definition?.filterType === 'Armor'); // CRITICAL FIX: Added optional chaining to i.definition in the find predicate
    if (equippedArmor?.definition) { // Added optional chaining for definition
        ac = equippedArmor.definition.armorClass ?? ac; // Fallback to default AC if armorClass is null or undefined
        acFormula = `${equippedArmor.definition.name || 'Armor'} (${ac})`;
        const armorType = equippedArmor.definition.armorTypeId;
        if (armorType === 1) {
            ac += characterSheet.modifiers.dexterity; // No change needed here, as base ac is already calculated with DEX. This adds it again if light.
            acFormula += " + DEX";
        } else if (armorType === 2) {
            ac += Math.min(characterSheet.modifiers.dexterity, 2);
            acFormula += " + DEX (max 2)";
        }
    }
    // Add bonuses from items, feats, etc.
    ['item', 'feat', 'race', 'class'].forEach(source => { // Iterate through modifier sources
        if (data.modifiers?.[source]) { // Added optional chaining for modifiers source
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'bonus' && mod.subType === 'armor-class' && mod.fixedValue) {
                    ac += mod.fixedValue;
                    acFormula += ` + ${mod.fixedValue} (${mod.friendlyTypeName})`;
                }
            });
        }
    });
    characterSheet.ac = ac;
    characterSheet.acFormula = acFormula;

    // Inventory and Currency
    characterSheet.inventory = (data.inventory || []).map(item => ({ // Ensure data.inventory is an array before mapping
        name: item.definition?.name || 'Unknown Item', // Safely access item name
        quantity: item.quantity,
        description: item.definition?.description || '', // Safely access item description
        equipped: item.equipped,
        weight: item.definition?.weight || 0, // Added optional chaining
    }));
    characterSheet.currency = data.currencies;

    // Features and Traits
    characterSheet.features = [
        ...(data.race?.racialTraits || []).map(t => ({ name: t.definition?.name || 'Unknown Trait', description: t.definition?.snippet || t.definition?.description || '', source: 'Race' })), // Safely map racial traits
        ...(data.classes || []).flatMap(c => (c.classFeatures || []).map(f => ({ name: f.definition?.name || 'Unknown Feature', description: f.definition?.snippet || f.definition?.description || '', source: 'Class' }))), // Safely map class features
        ...(data.feats || []).map(f => ({ name: f.definition?.name || 'Unknown Feat', description: f.definition?.snippet || f.definition?.description || '', source: 'Feat' })) // Safely map feats
    ];

    // Bio
    characterSheet.bio = {
        appearance: data.traits?.appearance || [data.hair, data.eyes, data.skin, data.height, data.weight].filter(Boolean).join(', '), // Safely access appearance
        traits: data.traits?.personalityTraits || '', // Safely access personality traits
        ideals: data.traits?.ideals || '', // Safely access ideals
        bonds: data.traits?.bonds || '', // Safely access bonds
        flaws: data.traits?.flaws || '', // Safely access flaws
        backstory: data.notes?.backstory || '', // Safely access backstory
        notes: [data.notes?.allies, data.notes?.enemies, data.notes?.organizations].filter(Boolean).join('\n\n') // Safely access other notes
    };

    // Senses
    characterSheet.senses = {
        darkvision: data.race?.racialTraits?.find(t => t.definition?.name === "Darkvision")?.definition?.description?.match(/(\d+)\s*feet/)?.[1] || 0 // More robust optional chaining
    };

    // Spells
    // CRITICAL FIX: Ensure all parts of the chain are optional, especially data.classes[0] itself
    const spellcastingAbilityId = data.classes?.[0]?.definition?.spellCastingAbilityId;
    const spellcastingAbility = ABILITY_ID_MAP[spellcastingAbilityId];
    if (spellcastingAbility && characterSheet.modifiers[spellcastingAbility] !== undefined) { // Also check if modifier exists
        const spellcastingModifier = characterSheet.modifiers[spellcastingAbility];
        characterSheet.spellSaveDc = 8 + characterSheet.profBonus + spellcastingModifier;
        characterSheet.spellAttackBonus = characterSheet.profBonus + spellcastingModifier;
        characterSheet.spellAbility = spellcastingAbility.substring(0, 3);
    }

    const allSpells = Object.values(data.spells || {}).flat(); // Ensure data.spells is an object before getting values
    (allSpells || []).forEach(spell => {
        // CRITICAL FIX: Ensure spell.definition exists before accessing its properties
        if (!spell.definition) {
            return; // Skip this spell if its definition is missing
        }
        const level = spell.definition.level; // Level should be present if definition exists
        if (!spellsByLevel[level]) spellsByLevel[level] = [];
        spellsByLevel[level].push({
            ...spell.definition, // Safely spread properties of spell.definition
            desc: spell.definition.description || '', // Align with srdEnricher, provide fallback
            time: `${spell.definition.activation?.activationTime || ''} ${spell.definition.activation?.activationType || ''}`.trim(), // CRITICAL FIX: Optional chaining for activation
        });
    });
    characterSheet.spells = Object.values(spellsByLevel).flat();
    characterSheet.spellsByLevel = spellsByLevel; // Keep for detailed views if needed

    // Spell Slots
    characterSheet.spellSlots = {};
    if (classInfo?.definition?.canCastSpells && classInfo?.definition?.spellRules) {
        if (data.pactMagic?.length > 0) { // Warlock Pact Magic
            const pactSlotInfo = classInfo.definition.spellRules?.levelSpellSlots?.[classInfo.level - 1] || []; // Safely access pact slot info
            const slotLevel = pactSlotInfo.findIndex(s => s > 0) + 1; // Determine slot level
            if (slotLevel > 0) {
                const total = pactSlotInfo[slotLevel - 1];
                const used = data.pactMagic.find(p => p.level === slotLevel)?.used || 0;
                characterSheet.pactSlots = { level: slotLevel, total, used };
            }
        }
        if (data.spellSlots?.length > 0) { // For other casters
            const regularSlots = classInfo.definition.spellRules?.levelSpellSlots?.[classInfo.level - 1] || []; // Safely access regular slots
            regularSlots.forEach((total, index) => {
                const level = index + 1;
                if (total > 0) {
                    const used = data.spellSlots.find(s => s.level === level)?.used || 0;
                    characterSheet.spellSlots[level] = { total, used };
                }
            });
        }
    }

    return characterSheet;
};