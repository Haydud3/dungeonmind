import * as pdfjsLib from 'pdfjs-dist';

// Dynamic versioning to match your installed package
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;

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

/** -
 * A map for D&D Beyond's alignment IDs to a common name.
 */
const ALIGNMENT_ID_MAP = {
    1: 'Lawful Good', 2: 'Neutral Good', 3: 'Chaotic Good',
    4: 'Lawful Neutral', 5: 'True Neutral', 6: 'Chaotic Neutral',
    7: 'Lawful Evil', 8: 'Neutral Evil', 9: 'Chaotic Evil',
};

/** -
 * A map of skill names from D&D Beyond to their associated ability score.
 */
const SKILL_ABILITY_MAP = {
    'acrobatics': 'dex', 'animal-handling': 'wis', 'arcana': 'int',
    'athletics': 'str', 'deception': 'cha', 'history': 'int',
    'insight': 'wis', 'intimidation': 'cha', 'investigation': 'int',
    'medicine': 'wis', 'nature': 'int', 'perception': 'wis',
    'performance': 'cha', 'persuasion': 'cha', 'religion': 'int',
    'sleight-of-hand': 'dex', 'stealth': 'dex', 'survival': 'wis'
};

const getAbilityModifier = (score = 10) => Math.floor((score - 10) / 2);
const getProficiencyBonus = (level = 1) => Math.ceil(1 + level / 4);

const sanitizeForFirestore = (data) => {
    return JSON.parse(JSON.stringify(data));
};

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
    characterSheet.speed = data.race?.weightSpeeds?.normal?.walk || 30;

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
    characterSheet.xp = data.currentXp || 0;

    // Stats & Modifiers (bulletproof version)
    (data.stats || []).forEach(stat => {
        const statName = ABILITY_ID_MAP[stat.id];
        const score = (stat.value || 0) + ((data.bonusStats || []).find(bs => bs.id === stat.id)?.value || 0);
        characterSheet.stats[statName] = score;
        characterSheet.modifiers[statName] = getAbilityModifier(score);
    });

    // Initiative (bulletproof version)
    characterSheet.initiative = characterSheet.modifiers.dex || 0;

    // Proficiency Bonus (bulletproof version)
    characterSheet.profBonus = getProficiencyBonus(totalLevel);

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
    
    // Skills (bulletproof version)
    Object.entries(SKILL_ABILITY_MAP).forEach(([skillName, abilityName]) => {
        const formattedSkillName = skillName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        if (proficiencies.has(skillName)) {
            characterSheet.skills[formattedSkillName] = true;
        }
    });

    // HP (bulletproof version)
    const conMod = characterSheet.modifiers.con || 0;
    const maxHp = (data.baseHitPoints || 0) + (data.bonusHitPoints || 0) + (data.overrideHitPoints || 0) + (conMod * characterSheet.level);
    characterSheet.hp = {
        max: maxHp,
        current: maxHp - (data.removedHitPoints || 0),
        temp: data.temporaryHitPoints || 0,
    };

    // AC (bulletproof version)
    let acFormula = "10 + DEX";
    let ac = 10 + (characterSheet.modifiers.dex || 0);
    
    const equippedArmor = (data.inventory || []).find(item => item.equipped && item.definition?.armorTypeId);
    if (equippedArmor?.definition) {
        ac = equippedArmor.definition.armorClass ?? ac;
        acFormula = `${equippedArmor.definition.name || 'Armor'} (${ac})`;
        const armorType = equippedArmor.definition.armorTypeId;
        if (armorType === 1) {
            ac += (characterSheet.modifiers.dex || 0);
            acFormula += " + DEX";
        } else if (armorType === 2) {
            ac += Math.min((characterSheet.modifiers.dex || 0), 2);
            acFormula += " + DEX (max 2)";
        }
    }

    ['item', 'feat', 'race', 'class'].forEach(source => {
        if (data.modifiers?.[source]) {
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
                const isFinesse = wb.properties?.some(p => p.name?.toLowerCase() === 'finesse');
                const isRanged = wb.attackType === 2;
                
                const strMod = characterSheet.modifiers.str || 0;
                const dexMod = characterSheet.modifiers.dex || 0;
                const statMod = (isRanged || (isFinesse && dexMod > strMod)) ? dexMod : strMod;
                const magicBonus = wb.grantedModifiers?.find(m => m.type === 'bonus' && m.subType === 'magic')?.value || 0;
                
                const totalHit = characterSheet.profBonus + statMod + magicBonus;
                const totalDmgMod = statMod + magicBonus;
                
                combat = {
                    hit: totalHit,
                    dmg: `${dmgDice}${totalDmgMod !== 0 ? (totalDmgMod > 0 ? '+' : '') + totalDmgMod : ''}`,
                    type: 'Action',
                    category: 'Attack',
                    range: wb.range ? `${wb.range} ft` : '5 ft',
                    notes: wb.damageType || def.damageType || '',
                    desc: def.description || '' // Added full description
                };
            }
        }
        
        return {
            name: def.name || 'Unknown Item',
            quantity: item.quantity || 1,
            description: def.description || '',
            equipped: item.equipped || false,
            weight: def.weight || 0,
            combat: combat // Maps straight to ActionsTab
        };
    });
    
    characterSheet.currency = data.currencies || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }; // bulletproof version

    // Features and Traits
    const mapFeature = (f, sourceName) => {
        if (!f?.definition) return { name: `Unknown ${sourceName} Feature`, description: '', source: sourceName };
        return { name: f.definition.name, description: f.definition.snippet || f.definition.description || '', source: sourceName };
    };

    characterSheet.features = [
        ...(data.race?.racialTraits || []).map(t => mapFeature(t, 'Race')),
        ...(data.classes || []).flatMap(c => (c.classFeatures || []).map(f => mapFeature(f, 'Class'))),
        ...(data.feats || []).map(f => mapFeature(f, 'Feat'))
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
    characterSheet.senses = {
        darkvision: (data.race?.racialTraits || []).find(t => t?.definition?.name === "Darkvision")?.definition?.description?.match(/(\d+)\s*feet/)?.[1] || 0
    };

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

        let hitString = def.requiresAttackRoll ? characterSheet.spellAttackBonus : "";
        if (def.requiresSavingThrow && def.saveDcAbilityId) hitString = `DC ${characterSheet.spellSaveDc} ${ABILITY_ID_MAP[def.saveDcAbilityId]?.toUpperCase()}`;

        const rangeStr = typeof def.range === 'object' ? (def.range?.rangeValue ? `${def.range.rangeValue} ft` : (def.range?.origin || 'Self')) : (def.range || 'Self');
        const activation = actMap[def.activation?.activationType] || 'Action';

        spellsByLevel[level].push({
            ...def,
            desc: def.description || '',
            time: `${def.activation?.activationTime || ''} ${activation}`.trim(),
            range: rangeStr,
            hit: hitString,
            dmg: dmgString,
            concentration: def.concentration || false,
            ritual: def.ritual || false
        });
    });
    characterSheet.spells = Object.values(spellsByLevel).flat();
    characterSheet.spellsByLevel = spellsByLevel;
    
    // Spell Slots
    if (classInfo?.definition?.canCastSpells && classInfo?.definition?.spellRules) { 
        if (data.pactMagic?.length > 0) {
            const pactSlotInfo = classInfo.definition.spellRules?.levelSpellSlots?.[classInfo.level - 1] || [];
            const slotLevel = pactSlotInfo.findIndex(s => s > 0) + 1;
            if (slotLevel > 0) {
                const total = pactSlotInfo[slotLevel - 1];
                const used = data.pactMagic.find(p => p.level === slotLevel)?.used || 0;
                characterSheet.pactSlots = { level: slotLevel, total, used };
            }
        }
        if (data.spellSlots?.length > 0) {
            const regularSlots = classInfo.definition.spellRules?.levelSpellSlots?.[classInfo.level - 1] || [];
            regularSlots.forEach((total, index) => {
                const level = index + 1;
                if (total > 0) {
                    const used = data.spellSlots.find(s => s.level === level)?.used || 0;
                    characterSheet.spellSlots[level] = { total, used };
                }
            });
        }
    }

    // Inject Unarmed Strike for all characters
    const baseStrMod = characterSheet.modifiers.str || 0;
    characterSheet.customActions.push({
        id: 'unarmed-strike',
        name: "Unarmed Strike",
        hit: characterSheet.profBonus + baseStrMod,
        dmg: `1${baseStrMod !== 0 ? (baseStrMod > 0 ? '+' : '') + baseStrMod : ''}`,
        type: 'Action',
        category: 'Attack',
        range: '5 ft',
        notes: 'Bludgeoning'
    });

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
    const criticalProperties = ['name', 'level', 'class', 'race', 'hp', 'stats', 'modifiers', 'profBonus'];
    criticalProperties.forEach(prop => {
        if (!characterSheet[prop]) {
            console.warn(`DndBeyondParser: Critical property '${prop}' is missing or empty in the final characterSheet. Current value:`, characterSheet[prop]);
        } else if (typeof characterSheet[prop] === 'object' && Object.keys(characterSheet[prop]).length === 0) {
            console.warn(`DndBeyondParser: Critical object property '${prop}' is empty in the final characterSheet.`);
        }
    });

    return characterSheet;
};

export const parsePdf = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let formFields = {};
        let normalizedFields = {}; 
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const annotations = await page.getAnnotations();
            
            annotations.forEach(ann => {
                if (ann.fieldName) {
                    let val = ann.fieldValue || ann.buttonValue || "";
                    if (Array.isArray(val)) val = val[0]; 
                    
                    const originalKey = ann.fieldName;
                    const cleanKey = originalKey.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    
                    formFields[originalKey] = val;
                    normalizedFields[cleanKey] = val;
                }
            });
        }

        console.log("Parsed PDF Data:", normalizedFields);
        return sanitizeForFirestore(parseFromFields(formFields, normalizedFields));

    } catch (error) {
        console.error("PDF Parsing Failed:", error);
        throw new Error("Failed to read PDF. " + error.message);
    }
};

const parseFromFields = (fields, normFields) => {
    const getVal = (target) => {
        const cleanTarget = target.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return (normFields[cleanTarget] || fields[target] || "").toString().trim();
    };

    const getInt = (target, def = 0) => {
        const val = parseInt(getVal(target));
        return isNaN(val) ? def : val;
    };

    // 1. CLASS & LEVEL
    let classString = getVal("ClassLevel"); 
    let level = 1;
    let className = "Adventurer";
    const lvlMatch = classString.match(/(\d+)/);
    if (lvlMatch) {
        level = parseInt(lvlMatch[0]);
        className = classString.replace(lvlMatch[0], "").trim();
    } else {
        className = classString || "Adventurer";
    }

    // 2. CORE STATS
    const stats = {
        str: getInt("STR"), dex: getInt("DEX"), con: getInt("CON"),
        int: getInt("INT"), wis: getInt("WIS"), cha: getInt("CHA")
    };

    // 3. PROFICIENCIES (Fixed Logic)
    const profText = getVal("ProficienciesLang") || "";
    
    // Regex explanation:
    // ===\s*HEADER\s*===  -> Finds "=== ARMOR ===" or "===ARMOR==="
    // ([\s\S]*?)          -> Captures everything after it...
    // (?:===|$)           -> ...until the NEXT "===" or End of String
    const extractSection = (header) => {
        const regex = new RegExp(`===\\s*${header}\\s*===([\\s\\S]*?)(?:===|$)`, 'i');
        const match = profText.match(regex);
        if (match && match[1]) {
            return match[1].trim().replace(/[\r\n]+/g, ", ");
        }
        return "None";
    };

    const proficiencies = {
        armor: extractSection("ARMOR"),
        weapons: extractSection("WEAPONS"),
        tools: extractSection("TOOLS"),
        languages: extractSection("LANGUAGES")
    };

    // 4. SKILLS
    const skills = {};
    const skillMap = {
        "Acrobatics": "AcrobaticsProf", "Animal Handling": "AnimalHandlingProf",
        "Arcana": "ArcanaProf", "Athletics": "AthleticsProf",
        "Deception": "DeceptionProf", "History": "HistoryProf",
        "Insight": "InsightProf", "Intimidation": "IntimidationProf",
        "Investigation": "InvestigationProf", "Medicine": "MedicineProf",
        "Nature": "NatureProf", "Perception": "PerceptionProf",
        "Performance": "PerformanceProf", "Persuasion": "PersuasionProf",
        "Religion": "ReligionProf", "Sleight of Hand": "SleightOfHandProf",
        "Stealth": "StealthProf", "Survival": "SurvivalProf"
    };

    Object.entries(skillMap).forEach(([skillName, fieldKey]) => {
        const val = getVal(fieldKey);
        if (val === 'P' || val === 'E') {
            skills[skillName] = true;
        }
    });

    // 5. INVENTORY
    const inventory = [];
    const currency = {
        cp: getInt("CP"), sp: getInt("SP"), ep: getInt("EP"), gp: getInt("GP"), pp: getInt("PP")
    };

    for (let i = 0; i < 50; i++) {
        const name = getVal(`EqName${i}`);
        if (name && name !== "undefined") {
            inventory.push({
                name: name,
                qty: getInt(`EqQty${i}`, 1),
                weight: getVal(`EqWeight${i}`)
            });
        }
    }

    // 6. WEAPONS / ACTIONS
    const customActions = [];
    const suffixes = ["", " 2", " 3", " 4", " 5", " 6"];
    suffixes.forEach((s, idx) => {
        const name = getVal(`WpnName${s}`); 
        if (name && name !== "undefined") {
            const id = idx + 1; 
            customActions.push({
                name: name,
                hit: getVal(`Wpn${id}AtkBonus`), 
                dmg: getVal(`Wpn${id}Damage`), 
                type: "Melee",
                notes: getVal(`WpnNotes${id}`)
            });
        }
    });

    // 7. SPELLS
    const spells = [];
    for (let i = 0; i < 50; i++) {
        const name = getVal(`spellName${i}`);
        if (name && name !== "undefined") {
            spells.push({
                name: name,
                level: 0, 
                school: getVal(`spellSource${i}`), 
                time: getVal(`spellCastingTime${i}`)
            });
        }
    }

    // 8. FEATURES & TRAITS
    const features = [];
    const rawTraitText = [
        getVal("FeaturesTraits1"), 
        getVal("FeaturesTraits2"), 
        getVal("FeaturesTraits3")
    ].join("\n");

    if (rawTraitText) {
        const lines = rawTraitText.split(/\r?\n/);
        let currentSection = "Class";
        let currentFeature = null;

        lines.forEach(line => {
            const cleanLine = line.trim();
            const upper = cleanLine.toUpperCase();
            if (!cleanLine) return;

            if (cleanLine.startsWith("===")) {
                if (upper.includes("FEATS") || upper.includes("FEAT ")) currentSection = "Feat";
                else if (upper.includes("SPECIES") || upper.includes("RACE")) currentSection = "Species";
                else if (upper.includes("CLASS") || upper.includes("WARLOCK") || upper.includes("FEATURES")) currentSection = "Class";
                else currentSection = "Other";
                return;
            }

            if (cleanLine.startsWith("*")) {
                if (currentFeature) features.push(currentFeature);
                const content = cleanLine.substring(1).trim(); 
                const parts = content.split("•");
                currentFeature = { name: parts[0].trim(), source: currentSection, desc: parts.length > 1 ? `(${parts[1].trim()})\n` : "" };
            } else if (currentFeature) {
                if (cleanLine.startsWith("|")) currentFeature.desc += "\n" + cleanLine;
                else currentFeature.desc += cleanLine + " ";
            }
        });
        if (currentFeature) features.push(currentFeature);
    }

    // 9. BIO & SENSES (UPDATED FOR DARKVISION)
    const bio = {
        backstory: getVal("Backstory") || getVal("CharacterBackstory"),
        appearance: getVal("Appearance") || getVal("CharacterAppearance"),
        traits: getVal("PersonalityTraits"), 
        ideals: getVal("Ideals"), bonds: getVal("Bonds"), flaws: getVal("Flaws"),
        notes: (getVal("AdditionalNotes1") + "\n" + getVal("AlliesOrganizations")).trim()
    };

    // --- SENSE PARSING LOGIC ---
    const senseString = getVal("AdditionalSenses") || ""; 
    let darkvisionRange = 0;
    
    // Look for "Darkvision X ft" pattern (e.g. "Darkvision 60 ft." or "Darkvision 120")
    const dvMatch = senseString.match(/Darkvision\s+(\d+)/i);
    
    if (dvMatch) {
        darkvisionRange = parseInt(dvMatch[1]);
    } else if (senseString.toLowerCase().includes("darkvision")) {
        // Fallback: If it says "Darkvision" but no number found, standard is 60ft
        darkvisionRange = 60;
    }

    const senses = {
        passivePerception: getInt("Passive1"),
        passiveInvestigation: getInt("Passive2"),
        passiveInsight: getInt("Passive3"),
        darkvisionString: senseString, // Keep extracted string for UI display
        darkvision: darkvisionRange    // The raw integer for Raycasting
    };

    return {
        name: getVal("CharacterName") || "Hero",
        race: getVal("Race"),
        class: className,
        level: level,
        stats: stats,
        hp: {
            max: getInt("MaxHP"),
            current: getInt("CurrentHP") || getInt("MaxHP"), 
            temp: getInt("TempHP")
        },
        speed: getVal("Speed"),
        init: getVal("Init"),
        ac: getInt("AC"),
        profBonus: getInt("ProfBonus", 2),
        currency: currency,
        inventory: inventory,
        customActions: customActions,
        spells: spells,
        features: features,
        bio: bio,
        proficiencies: proficiencies,
        skills: skills,
        senses: senses,
        visionRadius: darkvisionRange || 5 // Default to 5ft (standard visibility) if no darkvision
    };
};

export const getDebugText = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let log = `Lib Version: ${pdfjsLib.version}\n`;
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const annotations = await page.getAnnotations();
            log += `\n=== PAGE ${i} FIELDS ===\n`;
            annotations.forEach(a => { log += `[${a.fieldName}]: ${a.fieldValue || a.buttonValue}\n`; });
        }
        return log;
    } catch (e) { return `ERROR: ${e.message}`; }
};