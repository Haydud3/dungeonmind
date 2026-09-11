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

/**
 * Parses D&D Beyond snippets (e.g. {{(modifier:cha+classlevel)@min:1#unsigned}})
 */
const parseDndBeyondSnippets = (text, sheet, f = null) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, formula) => {
        let val = formula;
        
        if (val.toLowerCase().includes('scalevalue')) {
            let scale = '?';
            if (f?.levelScale?.fixedValue !== undefined && f?.levelScale?.fixedValue !== null) scale = f.levelScale.fixedValue;
            else if (f?.levelScale?.dice?.diceString) scale = f.levelScale.dice.diceString;
            val = val.replace(/scalevalue/gi, scale);
        }
        
        val = val.replace(/modifier:([a-z]{3})/gi, (_, stat) => sheet.modifiers[stat.toLowerCase()] || 0);
        val = val.replace(/savedc:([a-z]{3})/gi, (_, stat) => 8 + (sheet.profBonus || 2) + (sheet.modifiers[stat.toLowerCase()] || 0));
        val = val.replace(/spellattack:([a-z]{3})/gi, (_, stat) => (sheet.profBonus || 2) + (sheet.modifiers[stat.toLowerCase()] || 0));
        val = val.replace(/classlevel/gi, () => sheet.level || 1);
        val = val.replace(/characterlevel/gi, () => sheet.level || 1);
        
        let min = null, max = null, unsigned = false, signed = false;
        if (val.includes('@min:')) { const m = val.match(/@min:([-\d]+)/); if (m) min = parseInt(m[1]); }
        if (val.includes('@max:')) { const m = val.match(/@max:([-\d]+)/); if (m) max = parseInt(m[1]); }
        if (val.includes('#unsigned')) unsigned = true;
        if (val.includes('#signed')) signed = true;
        
        val = val.replace(/@[a-z]+:[-\d]+/gi, '').replace(/#[a-z]+/gi, '').replace(/[()]/g, '');

        try {
            if (/^[-\d\s+*/.]+$/.test(val)) {
                let result = Function(`'use strict'; return (${val})`)();
                if (min !== null) result = Math.max(min, result);
                if (max !== null) result = Math.min(max, result);
                if (signed && result > 0) return `+${result}`;
                return result;
            }
            return val;
        } catch (e) {
            return match; 
        }
    });
};

/** -
 * Parses the raw JSON from D&D Beyond into a structured character sheet object.
 * @param {object} json The raw JSON object from the D&D Beyond API.
 * @returns {object} A structured character sheet.
 */
export const parseDndBeyondJson = (json) => {
    const data = json.data; 
    if (!data) throw new Error("Invalid D&D Beyond JSON: 'data' property not found.");
    
    console.log("Parser received data:", data);
    console.log("[DEBUG] Raw D&D Beyond Actions:", data.actions);
    console.log("[DEBUG] Raw D&D Beyond Custom Actions:", data.customActions);

    // Initialize ALL arrays and objects the sheet expects to prevent crashes (bulletproof version)
    const characterSheet = {
        stats: {}, modifiers: {}, skills: {}, savingThrows: {}, proficiencies: {}, 
        bio: {}, customActions: [], inventory: [], spells: [], spellSlots: {},
        conditions: [], features: []
    };

    const warnings = [];

    // Core Info
    characterSheet.dndBeyondId = data.id;
    characterSheet.name = data.name;
    characterSheet.avatarUrl = data.decorations.avatarUrl;
    characterSheet.inspiration = data.inspiration;
    characterSheet.race = data.race?.fullName || data.race?.baseName || 'Unknown Race';
    characterSheet.background = data.background?.definition?.name || 'Unknown';
    characterSheet.alignment = ALIGNMENT_ID_MAP[data.alignmentId] || 'Unknown';
    characterSheet.image = data.decorations.avatarUrl;
    
    // Speed (Safely grab walking speed)
    let baseSpeed = data.race?.weightSpeeds?.normal?.walk || 30;
    let speedBonus = 0;
    
    ['race', 'class', 'background', 'item', 'feat', 'condition'].forEach(source => {
        if (data.modifiers?.[source]) {
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'bonus' && (mod.subType === 'speed' || mod.subType === 'unarmored-movement')) {
                    // Check if it requires being unarmored for unarmored-movement
                    if (mod.subType === 'unarmored-movement') {
                        const hasArmor = (data.inventory || []).some(item => item.equipped && item.definition?.armorTypeId >= 1 && item.definition?.armorTypeId <= 3);
                        if (!hasArmor) speedBonus += (mod.fixedValue || mod.value || 0);
                    } else {
                        speedBonus += (mod.fixedValue || mod.value || 0);
                    }
                }
            });
        }
    });
    
    characterSheet.speed = baseSpeed + speedBonus;

    // Classes & Level (bulletproof version)
    characterSheet.classes = (data.classes || []).map(cls => {
        if (!cls?.definition) return { name: 'Unknown Class', subclass: null, level: cls?.level || 0 };
        return {
            name: cls.definition.name || 'Unknown Class',
            subclass: cls.subclassDefinition?.name || null,
            level: cls.level || 0,
        };
    });

    // Provide the top-level string the sheet expects (bulletproof version)
    characterSheet.class = characterSheet.classes.map(c => c.name).join(' / ') || 'Unknown Class';

    const totalLevel = characterSheet.classes.reduce((acc, cls) => acc + cls.level, 0);
    characterSheet.level = totalLevel || 1;
    characterSheet.profBonus = getProficiencyBonus(totalLevel);
    characterSheet.xp = data.currentXp || 0;

    // Stats & Modifiers (bulletproof version)
    const statMods = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    const statOverrides = { str: null, dex: null, con: null, int: null, wis: null, cha: null };

    ['race', 'class', 'background', 'item', 'feat', 'condition'].forEach(source => {
        if (data.modifiers?.[source]) {
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'bonus' && mod.subType && mod.subType.endsWith('-score')) {
                    const stat = mod.subType.split('-')[0].substring(0, 3);
                    if (statMods[stat] !== undefined) {
                        statMods[stat] += (mod.fixedValue || mod.value || 0);
                    }
                }
                if (mod.type === 'set' && mod.subType && mod.subType.endsWith('-score')) {
                    const stat = mod.subType.split('-')[0].substring(0, 3);
                    if (statOverrides[stat] !== undefined) {
                        const val = (mod.fixedValue || mod.value || 0);
                        if (statOverrides[stat] === null || val > statOverrides[stat]) {
                            statOverrides[stat] = val;
                        }
                    }
                }
            });
        }
    });

    (data.stats || []).forEach(stat => {
        const statName = ABILITY_ID_MAP[stat.id];
        let score = (stat.value || 0) + ((data.bonusStats || []).find(bs => bs.id === stat.id)?.value || 0);
        
        score += statMods[statName] || 0;

        const explicitOverride = (data.overrideStats || []).find(os => os.id === stat.id)?.value;
        if (explicitOverride !== undefined && explicitOverride !== null) {
            score = explicitOverride;
        } else if (statOverrides[statName] !== null && statOverrides[statName] > score) {
            score = statOverrides[statName];
        }
        
        characterSheet.stats[statName] = score;
        characterSheet.modifiers[statName] = getAbilityModifier(score);
    });

    // Initiative (bulletproof version)
    
    let initBonus = 0;
    ['race', 'class', 'background', 'item', 'feat', 'condition'].forEach(source => {
        if (data.modifiers?.[source]) {
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'bonus' && mod.subType === 'initiative') {
                    initBonus += (mod.fixedValue || mod.value || 0);
                }
                if (mod.type === 'proficiency' && mod.subType === 'initiative') {
                    initBonus += characterSheet.profBonus;
                }
                if (mod.type === 'half-proficiency' && mod.subType === 'initiative') {
                    initBonus += Math.floor(characterSheet.profBonus / 2);
                }
            });
        }
    });
    
    // Fallback for 2024 Alert feat which might not have machine-readable modifiers yet
    let hasAlert = false;
    
    // Check feats
    if (data.feats) {
        hasAlert = hasAlert || data.feats.some(f => f.definition?.name === 'Alert');
    }
    // Check background granted feats
    if (data.background?.definition?.grantedFeats) {
        hasAlert = hasAlert || data.background.definition.grantedFeats.some(f => f.name === 'Alert');
    }
    // Check custom background features
    if (data.customBackground?.featuresBackground) {
        // Just in case it's custom
    }
    
    // Some older versions of Alert added a flat +5
    let flatAlertBonus = 0;
    if (hasAlert) {
        // If the feat description contains "add your Proficiency Bonus", it's the 2024 version
        const alertFeat = (data.feats || []).find(f => f.definition?.name === 'Alert')?.definition || 
                          (data.background?.definition?.featList?.name === 'Alert' ? data.background.definition : null);
        
        // Let's just add prof bonus if it's the 2024 feat
        initBonus += characterSheet.profBonus;
    }

    // Harengon adds proficiency to initiative as well
    const isHarengon = data.race?.fullName?.toLowerCase().includes('harengon');
    if (isHarengon && !hasAlert) { // Assuming they don't stack if both just add proficiency
        initBonus += characterSheet.profBonus;
    }

    // Swashbuckler Rogue adds Charisma, Gloom Stalker adds Wisdom, War Magic adds Int
    (data.classes || []).forEach(cls => {
        const subName = cls.subclassDefinition?.name || '';
        if (subName === 'Swashbuckler' && cls.level >= 3) {
            initBonus += Math.max(0, characterSheet.modifiers.cha || 0);
        }
        if (subName === 'Gloom Stalker' && cls.level >= 3) {
            initBonus += Math.max(0, characterSheet.modifiers.wis || 0);
        }
        if (subName === 'War Magic' && cls.level >= 2) {
            initBonus += Math.max(0, characterSheet.modifiers.int || 0);
        }
    });

    characterSheet.initiative = (characterSheet.modifiers.dex || 0) + initBonus;

    // Collect Proficiencies (bulletproof version)
    const proficiencies = new Set();
    const languages = new Set();
    const armorProfs = new Set();
    const weaponProfs = new Set();
    const toolProfs = new Set();

    ['race', 'class', 'background', 'item', 'feat'].forEach(source => {
        if (data.modifiers?.[source]) {
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'proficiency') proficiencies.add(mod.subType);
                if (mod.type === 'language') languages.add(mod.friendlySubtypeName);
            });
        }
    });

    (data.classes || []).forEach(cls => {
        const profText = cls.definition?.classFeatures?.find(f => f.name === 'Proficiencies')?.description || '';
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

    // Saving Throws (bulletproof version)
    Object.values(ABILITY_ID_MAP).forEach(name => {
        characterSheet.savingThrows[name] = proficiencies.has(`${name}-saving-throws`) || proficiencies.has(`${name === 'str' ? 'strength' : name === 'dex' ? 'dexterity' : name === 'con' ? 'constitution' : name === 'int' ? 'intelligence' : name === 'wis' ? 'wisdom' : 'charisma'}-saving-throws`);
    });
    
    // Defenses
    const allMods = [
        ...(data.modifiers?.race || []), ...(data.modifiers?.class || []), 
        ...(data.modifiers?.background || []), ...(data.modifiers?.item || []), 
        ...(data.modifiers?.feat || []), ...(data.modifiers?.condition || [])
    ];
    const resistances = allMods.filter(m => m.type === "resistance").map(m => m.friendlySubtypeName || m.subType).filter(Boolean);
    const immunities = allMods.filter(m => m.type === "immunity").map(m => m.friendlySubtypeName || m.subType).filter(Boolean);
    const vulnerabilities = allMods.filter(m => m.type === "vulnerability").map(m => m.friendlySubtypeName || m.subType).filter(Boolean);
    
    characterSheet.defenses = {
        resistances: [...new Set(resistances)].join(', '),
        immunities: [...new Set(immunities)].join(', '),
        vulnerabilities: [...new Set(vulnerabilities)].join(', ')
    };

    // Skills (bulletproof version)
    Object.entries(SKILL_ABILITY_MAP).forEach(([skillName, abilityName]) => {
        const formattedSkillName = skillName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        if (proficiencies.has(skillName)) {
            characterSheet.skills[formattedSkillName] = true;
        }
    });

    // HP (bulletproof version)
    const conMod = characterSheet.modifiers.con || 0;
    
    let hpBonusPerLevel = 0;
    let flatHpBonus = 0;
    
    ['race', 'class', 'background', 'item', 'feat', 'condition'].forEach(source => {
        if (data.modifiers?.[source]) {
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'bonus') {
                    if (mod.subType === 'hit-points-per-level') hpBonusPerLevel += (mod.fixedValue || mod.value || 0);
                    if (mod.subType === 'hit-points') flatHpBonus += (mod.fixedValue || mod.value || 0);
                }
            });
        }
    });

    let maxHp = (data.baseHitPoints || 0) + (data.bonusHitPoints || 0) + (conMod * characterSheet.level) + flatHpBonus + (hpBonusPerLevel * characterSheet.level);
    
    if (data.overrideHitPoints !== undefined && data.overrideHitPoints !== null && data.overrideHitPoints !== 0) {
        maxHp = data.overrideHitPoints;
    }
    
    characterSheet.hp = {
        max: maxHp,
        current: maxHp - (data.removedHitPoints || 0),
        temp: data.temporaryHitPoints || 0,
    };

    // AC (bulletproof version)
    let baseAc = 10 + (characterSheet.modifiers.dex || 0);
    let acFormula = "10 + DEX";
    
    // Find base armor (excluding shields, which are type 4)
    const equippedArmor = (data.inventory || []).find(item => item.equipped && item.definition?.armorTypeId >= 1 && item.definition?.armorTypeId <= 3);
    
    if (equippedArmor?.definition) {
        baseAc = equippedArmor.definition.armorClass ?? baseAc;
        acFormula = `${equippedArmor.definition.name || 'Armor'} (${baseAc})`;
        const armorType = equippedArmor.definition.armorTypeId;
        if (armorType === 1) {
            baseAc += (characterSheet.modifiers.dex || 0);
            acFormula += " + DEX";
        } else if (armorType === 2) {
            const maxDex = 2; // Medium armor master feat could change this to 3, handled later if needed
            baseAc += Math.min((characterSheet.modifiers.dex || 0), maxDex);
            acFormula += " + DEX (max 2)";
        }
    }

    let shieldAc = 0;
    const equippedShields = (data.inventory || []).filter(item => item.equipped && item.definition?.armorTypeId === 4);
    equippedShields.forEach(shield => {
        const shieldBase = shield.definition.armorClass || 2;
        shieldAc += shieldBase;
        acFormula += ` + ${shield.definition.name} (${shieldBase})`;
    });

    let ac = baseAc + shieldAc;

    ['item', 'feat', 'race', 'class', 'background'].forEach(source => {
        if (data.modifiers?.[source]) {
            data.modifiers[source].forEach(mod => {
                if (mod.type === 'bonus' && mod.subType === 'armor-class' && mod.fixedValue) {
                    ac += mod.fixedValue;
                    acFormula += ` + ${mod.fixedValue} (${mod.friendlyTypeName || source})`;
                }
            });
        }
    });
    
    // Also check equipped items for grantedModifiers, just in case they aren't in data.modifiers.item
    (data.inventory || []).filter(item => item.equipped).forEach(item => {
        (item.definition?.grantedModifiers || []).forEach(mod => {
            // Avoid double counting if it's already in data.modifiers.item
            const alreadyCounted = (data.modifiers?.item || []).some(m => m.id === mod.id || (m.type === mod.type && m.subType === mod.subType && m.fixedValue === mod.fixedValue));
            if (!alreadyCounted && mod.type === 'bonus' && mod.subType === 'armor-class' && mod.fixedValue) {
                ac += mod.fixedValue;
                acFormula += ` + ${mod.fixedValue} (${item.definition.name})`;
            }
        });
    });

    // Unarmored Defense (Monk/Barbarian)
    const hasMonkUnarmored = (data.classes || []).some(c => c.definition?.name === 'Monk');
    const hasBarbUnarmored = (data.classes || []).some(c => c.definition?.name === 'Barbarian');
    
    if (!equippedArmor && !equippedShields.length) {
        if (hasMonkUnarmored) {
            const monkAc = 10 + (characterSheet.modifiers.dex || 0) + (characterSheet.modifiers.wis || 0);
            if (monkAc > ac) {
                ac = monkAc;
                acFormula = `10 + DEX + WIS (Unarmored Defense)`;
            }
        }
    }
    if (!equippedArmor) {
        if (hasBarbUnarmored) {
            const barbAc = 10 + (characterSheet.modifiers.dex || 0) + (characterSheet.modifiers.con || 0) + shieldAc;
            if (barbAc > ac) {
                ac = barbAc;
                acFormula = `10 + DEX + CON (Unarmored Defense)` + (shieldAc ? ` + Shield (${shieldAc})` : '');
            }
        }
    }

    characterSheet.ac = ac;
    characterSheet.acFormula = acFormula;

    // Inventory (bulletproof version)
    characterSheet.inventory = (data.inventory || []).map(item => {
        const def = item.definition;
        if (!def) return { name: 'Unknown Item', quantity: item?.quantity || 0, description: '', equipped: item?.equipped || false, weight: 0 };
        
        let combat = null;
        const isWeapon = (def.filterType === "Weapon" || def.type === "Weapon" || def.weaponBehaviors?.length > 0);
        
        // ONLY add combat actions for EQUIPPED items
        if (isWeapon && item.equipped) {
            const wb = def.weaponBehaviors?.[0] || def;
            const dmgDice = wb.damage?.diceString;
            
            if (dmgDice) {
                const isFinesse = def.properties?.some(p => p.name?.toLowerCase() === 'finesse') || wb.properties?.some(p => p.name?.toLowerCase() === 'finesse');
                const versatileProp = def.properties?.find(p => p.name?.toLowerCase() === 'versatile') || wb.properties?.find(p => p.name?.toLowerCase() === 'versatile');
                const isRanged = wb.attackType === 2;
                
                const strMod = characterSheet.modifiers.str || 0;
                const dexMod = characterSheet.modifiers.dex || 0;
                const statMod = (isRanged || (isFinesse && dexMod > strMod)) ? dexMod : strMod;
                const magicBonus = def.grantedModifiers?.find(m => m.type === 'bonus' && m.subType === 'magic')?.value || wb.grantedModifiers?.find(m => m.type === 'bonus' && m.subType === 'magic')?.value || 0;
                
                const totalHit = characterSheet.profBonus + statMod + magicBonus;
                const totalDmgMod = statMod + magicBonus;
                
                let dmgString = `${dmgDice}${totalDmgMod !== 0 ? (totalDmgMod > 0 ? '+' : '') + totalDmgMod : ''}`;
                
                if (versatileProp && versatileProp.notes) {
                    const versatileDice = versatileProp.notes.match(/\d+d\d+/);
                    if (versatileDice) {
                         dmgString += ` / ${versatileDice[0]}${totalDmgMod !== 0 ? (totalDmgMod > 0 ? '+' : '') + totalDmgMod : ''}`;
                    }
                }
                
                combat = {
                    hit: totalHit,
                    dmg: dmgString,
                    type: 'Action',
                    category: 'Attack',
                    range: wb.range ? `${wb.range} ft` : '5 ft',
                    notes: wb.damageType || def.damageType || '',
                    desc: parseDndBeyondSnippets(def.description || def.snippet || '', characterSheet, wb)
                };
            }
        }
        
        let itemMagicBonus = 0;
        let isArmor = false;
        let isShield = false;
        if (def.armorTypeId) {
            if (def.armorTypeId === 4) isShield = true;
            else if (def.armorTypeId >= 1 && def.armorTypeId <= 3) isArmor = true;
        } else if (def.name && def.name.toLowerCase().includes('shield')) {
            isShield = true;
        }

        (def.grantedModifiers || []).forEach(m => {
            if (m.type === 'bonus' && m.subType === 'armor-class') {
                itemMagicBonus += (m.fixedValue || m.value || 0);
            }
        });

        return {
            name: def.name || 'Unknown Item',
            quantity: item.quantity || 1,
            description: parseDndBeyondSnippets(def.description || def.snippet || '', characterSheet, def),
            equipped: item.equipped || false,
            weight: def.weight || 0,
            combat: combat,
            limitedUse: item.limitedUse ? {
                maxUses: item.limitedUse.maxUses || 0,
                numberUsed: item.limitedUse.numberUsed || 0,
                resetTypeDescription: item.limitedUse.resetTypeDescription || ''
            } : null,
            // Hidden fields for calcAC
            armorClass: def.armorClass || 0,
            armorTypeId: def.armorTypeId || 0,
            magicBonus: itemMagicBonus,
            isArmor: isArmor,
            isShield: isShield,
            rawType: def.type || def.filterType || ''
        };
    });
    
    characterSheet.currency = data.currencies || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }; // bulletproof version

    // Features and Traits
    const mapFeature = (f, sourceName) => {
        if (!f?.definition) return { name: `Unknown ${sourceName} Feature`, description: '', source: sourceName };
        const rawDesc = f.definition.snippet || f.definition.description || '';
        const parsedDesc = parseDndBeyondSnippets(rawDesc, characterSheet, f);
        
        let uses = undefined;
        if (f.limitedUse && f.limitedUse.maxUses) {
            uses = {
                max: f.limitedUse.maxUses,
                current: f.limitedUse.maxUses - (f.limitedUse.numberUsed || 0),
                recovery: f.limitedUse.resetType === 1 ? 'Short Rest' : (f.limitedUse.resetType === 2 ? 'Long Rest' : 'Other')
            };
        }
        
        return { name: f.definition.name, description: parsedDesc, source: sourceName, uses };
    };

    characterSheet.features = [
        ...(data.race?.racialTraits || []).map(t => mapFeature(t, 'Race')),
        ...(data.classes || []).flatMap(c => (c.classFeatures || [])
            .filter(f => c.level >= (f.definition?.requiredLevel || 0))
            .map(f => mapFeature(f, 'Class'))),
        ...(data.feats || []).map(f => mapFeature(f, 'Feat')),
        ...(data.options?.race || []).map(o => mapFeature(o, 'Race Option')),
        ...(data.options?.class || []).map(o => mapFeature(o, 'Class Option')),
        ...(data.options?.feat || []).map(o => mapFeature(o, 'Feat Option'))
    ];

    // Bio
    characterSheet.bio = {
        appearance: data.traits?.appearance || [data.hair, data.eyes, data.skin, data.height, data.weight].filter(Boolean).join(', '), // bulletproof version
        traits: data.traits?.personalityTraits || '',
        ideals: data.traits?.ideals || '',
        bonds: data.traits?.bonds || '',
        flaws: data.traits?.flaws || '',
        backstory: data.notes?.backstory || '',
        notes: [data.notes?.allies, data.notes?.enemies, data.notes?.organizations].filter(Boolean).join('\n\n')
    };

    // Senses (bulletproof version)
    let darkvision = 0;
    // 1. Check modifiers from all sources (race, class, item, etc.)
    const senseMods = allMods.filter(m => m.subType === 'darkvision');
    if (senseMods.length > 0) {
        darkvision = Math.max(darkvision, ...senseMods.map(m => m.fixedValue || m.value || 0));
    }

    // 2. Check racial traits by name, as this is a common pattern.
    (data.race?.racialTraits || []).forEach(trait => {
        const name = trait.definition?.name?.toLowerCase() || '';
        const desc = trait.definition?.description || '';
        if (name.includes('darkvision')) {
            const match = desc.match(/(\d+)\s*feet/);
            if (match) darkvision = Math.max(darkvision, parseInt(match[1], 10));
        }
    });

    const canSeeInMagicalDarkness = (data.options?.class || [])
        .some(option => option.definition?.name?.toLowerCase() === "devil's sight");

    characterSheet.senses = {
        darkvision: darkvision,
        canSeeInMagicalDarkness: canSeeInMagicalDarkness
    };

    // Assign to top level of character sheet, which is what the UI expects
    characterSheet.darkvision = darkvision;

    // Spells
    const classInfo = data.classes?.[0]; // bulletproof version
    const spellcastingAbilityId = classInfo?.definition?.spellCastingAbilityId;
    const spellcastingAbility = ABILITY_ID_MAP[spellcastingAbilityId];
    if (spellcastingAbility && characterSheet.modifiers[spellcastingAbility] !== undefined) {
        const spellcastingModifier = characterSheet.modifiers[spellcastingAbility];
        characterSheet.spellSaveDc = 8 + characterSheet.profBonus + spellcastingModifier;
        characterSheet.spellAttackBonus = characterSheet.profBonus + spellcastingModifier;
        characterSheet.spellAbility = spellcastingAbility;
    }

    // Get spells from racial traits, feats, AND the main class spellbook
    const allSpellsRaw = [];
    if (data.spells) {
        Object.values(data.spells).forEach(arr => { if (Array.isArray(arr)) allSpellsRaw.push(...arr); });
    }
    if (data.classSpells) {
        data.classSpells.forEach(cs => { if (Array.isArray(cs.spells)) allSpellsRaw.push(...cs.spells); });
    }

    const spellsByLevel = {};
    const uniqueSpells = Array.from(new Map(allSpellsRaw.filter(s => s && s.definition).map(s => [s.definition.name, s])).values());
    const actMap = { 1: 'Action', 3: 'Bonus Action', 4: 'Reaction', 8: 'Special' };

    uniqueSpells.forEach(spell => {
        const def = spell.definition;
        const level = def.level;
        if (!spellsByLevel[level]) spellsByLevel[level] = [];
        
        let dmgString = "";
        const dmgMod = def.modifiers?.find(m => m.type === 'damage');
        if (dmgMod?.die?.diceString) {
            dmgString = dmgMod.die.diceString;
            if (def.name === "Eldritch Blast" && data.options?.class?.some(o => o.definition?.name === "Agonizing Blast")) {
                const chaMod = characterSheet.modifiers.cha || 0;
                dmgString += (chaMod > 0 ? `+${chaMod}` : `${chaMod}`);
            }
        }

        let hitString = "";
        if (def.requiresAttackRoll) {
            const sab = characterSheet.spellAttackBonus || 0;
            hitString = sab >= 0 ? `+${sab}` : `${sab}`;
        }
        if (def.requiresSavingThrow && def.saveDcAbilityId) hitString = `DC ${characterSheet.spellSaveDc} ${ABILITY_ID_MAP[def.saveDcAbilityId]?.toUpperCase()}`;

        const rangeStr = typeof def.range === 'object' ? (def.range?.rangeValue ? `${def.range.rangeValue} ft` : (def.range?.origin || 'Self')) : (def.range || 'Self');
        const activation = actMap[def.activation?.activationType] || 'Action';

        spellsByLevel[level].push({
                name: def.name || 'Unknown Spell',
                level: level,
                school: def.school || 'Unknown',
            desc: parseDndBeyondSnippets(def.description || def.snippet || '', characterSheet, def),
            time: `${def.activation?.activationTime || ''} ${activation}`.trim(),
            range: rangeStr,
            hit: hitString,
            dmg: dmgString,
            concentration: def.concentration || false,
            ritual: def.ritual || false,
                components: def.components ? (Array.isArray(def.components) ? def.components.map(c => c===1?'V':(c===2?'S':(c===3?'M':''))).filter(Boolean).join(', ') : def.components) : ''
        });
    });
    characterSheet.spells = Object.values(spellsByLevel).flat();
    
    // Spell Slots
    if (classInfo?.definition?.canCastSpells && classInfo?.definition?.spellRules) { 
        if (data.pactMagic?.length > 0) {
            const pactSlotInfo = classInfo.definition.spellRules?.levelSpellSlots?.[classInfo.level] || [];
            const slotLevel = pactSlotInfo.findIndex(s => s > 0) + 1;
            if (slotLevel > 0) {
                const total = pactSlotInfo[slotLevel - 1];
                const used = data.pactMagic.find(p => p.level === slotLevel)?.used || 0;
                characterSheet.spellSlots['pact'] = { current: total - used, max: total, level: slotLevel };
            }
        }
        if (data.spellSlots?.length > 0) {
            const regularSlots = classInfo.definition.spellRules?.levelSpellSlots?.[classInfo.level] || [];
            regularSlots.forEach((total, index) => {
                const level = index + 1;
                if (total > 0) {
                    const used = data.spellSlots.find(s => s.level === level)?.used || 0;
                    characterSheet.spellSlots[level] = { current: total - used, max: total };
                }
            });
        }
    }

    // Actions from `data.actions` (class features, racial traits, etc.)
    const rawActions = [
        ...(data.actions?.race || []),
        ...(data.actions?.class?.filter(a => {
            const cls = data.classes?.find(c => c.classFeatures?.some(f => f.definition?.id === a.componentId));
            if (!cls) return true;
            const feature = cls.classFeatures.find(f => f.definition?.id === a.componentId);
            return cls.level >= (feature?.definition?.requiredLevel || 0);
        }) || []),
        ...(data.actions?.item?.filter(a => {
            const item = data.inventory?.find(i => i.id === a.componentId);
            return item ? item.equipped : true;
        }) || []),
        ...(data.actions?.feat || [])
    ];

    const parsedSheetActions = rawActions.map(a => {
        let uses = undefined;
        if (a.limitedUse && a.limitedUse.maxUses) {
            uses = {
                max: a.limitedUse.maxUses,
                current: a.limitedUse.maxUses - (a.limitedUse.numberUsed || 0),
                recovery: a.limitedUse.resetType === 1 ? 'Short Rest' : (a.limitedUse.resetType === 2 ? 'Long Rest' : 'Other')
            };
        }
        return {
            name: a.name,
            desc: parseDndBeyondSnippets(a.description || a.snippet || "", characterSheet, a),
            hit: a.fixedToHit || "",
            dmg: a.dice ? a.dice.diceString : "",
            type: a.activation?.activationType === 3 ? "Bonus Action" : 
                  a.activation?.activationType === 4 ? "Reaction" : "Action",
            category: "Feature",
            uses: uses
        };
    });

    // User-created custom actions from D&D Beyond
    const ddbCustomActions = (data.customActions || []).map(a => ({
        name: a.name,
        desc: parseDndBeyondSnippets(a.description || a.snippet || "", characterSheet, a),
        hit: a.fixedToHit || "",
        dmg: a.dice ? a.dice.diceString : "",
        type: a.activation?.activationType === 3 ? "Bonus Action" : 
              a.activation?.activationType === 4 ? "Reaction" : "Action",
        category: "Attack"
    }));

    // Inject Unarmed Strike for all characters
    const baseStrMod = characterSheet.modifiers.str || 0;
    const unarmedStrike = {
        id: 'unarmed-strike',
        name: "Unarmed Strike",
        hit: characterSheet.profBonus + baseStrMod,
        dmg: Math.max(0, 1 + baseStrMod).toString(),
        type: 'Action',
        category: 'Attack',
        range: '5 ft',
        notes: 'Bludgeoning'
    };

    characterSheet.customActions = [
        ...ddbCustomActions,
        ...parsedSheetActions,
        unarmedStrike
    ];

    // Log all collected warnings at the end
    if (warnings.length > 0) {
        console.warn("DndBeyondParser encountered the following warnings during parsing:");
        warnings.forEach((warning, index) => {
            console.warn(`  ${index + 1}. ${warning}`);
        });
    }

    // NEW DEBUG: Log the final characterSheet object before returning
    console.log("DndBeyondParser: Final characterSheet object:", characterSheet);

    // NEW DEBUG: Add checks for critical properties
    const criticalProperties = ['name', 'level', 'class', 'race', 'hp', 'stats', 'modifiers', 'profBonus', 'darkvision'];
    criticalProperties.forEach(prop => {
        if (!characterSheet[prop]) {
            console.warn(`DndBeyondParser: Critical property '${prop}' is missing or empty in the final characterSheet. Current value:`, characterSheet[prop]);
        } else if (typeof characterSheet[prop] === 'object' && Object.keys(characterSheet[prop]).length === 0) {
            console.warn(`DndBeyondParser: Critical object property '${prop}' is empty in the final characterSheet.`);
        }
    });

    return characterSheet;
};