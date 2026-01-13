const API_BASE = 'https://www.dnd5eapi.co';

// --- MANUAL SPELLBOOK (Non-SRD / Expanded Spells) ---
const MANUAL_SPELLS = {
    "hex": {
        level: 1,
        school: "Enchantment",
        time: "1 Bonus Action",
        range: "90 feet",
        desc: "You place a curse on a creature that you can see within range. Until the spell ends, you deal an extra 1d6 necrotic damage to the target whenever you hit it with an attack. Also, choose one ability when you cast the spell. The target has disadvantage on ability checks made with the chosen ability.",
        dmg: "1d6 Necrotic",
        hit: "", // Auto-hit effect on next attack
        type: "Bonus Action"
    },
    "hellish-rebuke": {
        level: 1,
        school: "Evocation",
        time: "1 Reaction",
        range: "60 feet",
        desc: "You point your finger, and the creature that damaged you is momentarily surrounded by hellish flames. The creature must make a Dexterity saving throw. It takes 2d10 fire damage on a failed save, or half as much damage on a successful one.",
        dmg: "2d10 Fire",
        hit: "", // Save based
        type: "Reaction"
    },
    "arms-of-hadar": {
        level: 1,
        school: "Conjuration",
        time: "1 Action",
        range: "Self (10-foot radius)",
        desc: "You invoke the power of Hadar, the Dark Hunger. Tendrils of dark energy erupt from you and batter all creatures within 10 feet of you. Each creature in that area must make a Strength saving throw. On a failed save, a target takes 2d6 necrotic damage and can't take reactions until its next turn. On a successful save, the creature takes half damage, but suffers no other effect.",
        dmg: "2d6 Necrotic",
        hit: "",
        type: "Action"
    },
    "armor-of-agathys": {
        level: 1,
        school: "Abjuration",
        time: "1 Action",
        range: "Self",
        desc: "A protective magical force surrounds you, manifesting as a spectral frost that covers you and your gear. You gain 5 temporary hit points for the duration. If a creature hits you with a melee attack while you have these hit points, the creature takes 5 cold damage.",
        dmg: "5 Cold",
        hit: "",
        type: "Action"
    },
    "toll-the-dead": {
        level: 0,
        school: "Necromancy",
        time: "1 Action",
        range: "60 feet",
        desc: "You point at one creature you can see within range, and the sound of a dolorous bell fills the air around it for a moment. The target must succeed on a Wisdom saving throw or take 1d8 necrotic damage. If the target is missing any of its hit points, it instead takes 1d12 necrotic damage.",
        dmg: "1d8 Necrotic", // Logic for 1d12 implies damaged, stick to base or note it
        hit: "",
        type: "Action"
    },
    "green-flame-blade": {
        level: 0,
        school: "Evocation",
        time: "1 Action",
        range: "Self (5-foot radius)",
        desc: "You brandish the weapon used in the spell’s casting and make a melee attack with it against one creature within 5 feet of you. On a hit, the target suffers the weapon attack’s normal effects, and you can cause green fire to leap from the target to a different creature of your choice that you can see within 5 feet of it. The second creature takes fire damage equal to your spellcasting ability modifier.",
        dmg: "Fire", // Dynamic based on level
        hit: "+Melee",
        type: "Action"
    },
    "booming-blade": {
        level: 0,
        school: "Evocation",
        time: "1 Action",
        range: "Self (5-foot radius)",
        desc: "You brandish the weapon used in the spell’s casting and make a melee attack with it against one creature within 5 feet of you. On a hit, the target suffers the weapon attack’s normal effects and then becomes sheathed in booming energy until the start of your next turn. If the target willingly moves 5 feet or more before then, the target takes 1d8 thunder damage, and the spell ends.",
        dmg: "1d8 Thunder",
        hit: "+Melee",
        type: "Action"
    }
};

// --- HELPERS ---

const normalize = (str) => {
    if (!str) return "";
    return str.toLowerCase()
        .replace(/['’]/g, '') 
        .replace(/[^a-z0-9\s-]/g, '') 
        .trim()
        .replace(/\s+/g, '-');
};

const getMod = (score) => Math.floor(((score || 10) - 10) / 2);

const getCastingStat = (className) => {
    const c = (className || "").toLowerCase();
    if (c.includes('wizard') || c.includes('rogue') || c.includes('fighter')) return 'int';
    if (c.includes('cleric') || c.includes('druid') || c.includes('ranger') || c.includes('monk')) return 'wis';
    if (c.includes('warlock') || c.includes('sorcerer') || c.includes('bard') || c.includes('paladin')) return 'cha';
    return 'int'; 
};

// Robust Action Type Detection
const detectActionType = (name, text, time) => {
    const t = (text || "").toLowerCase();
    const n = (name || "").toLowerCase();
    const tm = (time || "").toLowerCase();

    // 1. Explicit Time Check
    if (tm.includes("bonus")) return "Bonus Action";
    if (tm.includes("reaction")) return "Reaction";
    if (tm.includes("action") && !tm.includes("reaction") && !tm.includes("bonus")) return "Action";

    // 2. Specific Feature Overrides
    if (n.includes("second wind") || n.includes("healing word") || n.includes("misty step") || n.includes("hex") || n.includes("giant's might") || n.includes("two-weapon")) return "Bonus Action";
    if (n.includes("action surge")) return "Free Action"; 
    if (n.includes("opportunity attack") || n.includes("shield") || n.includes("hellish rebuke") || n.includes("rune carver") || n.includes("counterspell")) return "Reaction";

    // 3. Text Scanning
    if (t.includes("bonus action")) return "Bonus Action";
    if (t.includes("reaction")) return "Reaction";
    
    return "Action";
};

const detectUses = (text) => {
    const t = (text || "").toLowerCase();
    let max = 0;
    let recovery = "";

    if (t.includes("short rest") || t.includes("short or long rest")) recovery = "SR";
    else if (t.includes("long rest")) recovery = "LR";

    if (recovery) {
        if (t.includes("twice") || t.includes("2 times") || t.includes("2 /")) max = 2;
        else if (t.includes("three times") || t.includes("3 times")) max = 3;
        else if (t.includes("once") || t.includes("1/")) max = 1;
        else max = 1; 
    }

    return { max, recovery };
};

const sanitizeForFirestore = (obj) => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    const newObj = {};
    for (const key in obj) {
        if (obj[key] === undefined) newObj[key] = null;
        else newObj[key] = sanitizeForFirestore(obj[key]);
    }
    return newObj;
};

// --- API FETCHER ---

const fetchApiData = async (category, name) => {
    try {
        const index = normalize(name);
        if (!index) return null;

        // 1. Try Direct Index Match
        let res = await fetch(`${API_BASE}/api/${category}/${index}`);
        
        if (!res.ok) {
            // 2. Fallback: Search Endpoint
            const searchRes = await fetch(`${API_BASE}/api/${category}?name=${encodeURIComponent(name)}`);
            const searchData = await searchRes.json();
            if (searchData.count > 0) {
                res = await fetch(`${API_BASE}${searchData.results[0].url}`);
            } else {
                return null;
            }
        }

        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
};

// --- MAIN ENRICHER ---

export const enrichCharacter = async (charData) => {
    const newChar = JSON.parse(JSON.stringify(charData));

    const strMod = getMod(newChar.stats?.str);
    const dexMod = getMod(newChar.stats?.dex);
    const prof = newChar.profBonus || 2;
    const castingStat = getCastingStat(newChar.class);
    const spellAttack = getMod(newChar.stats?.[castingStat]) + prof;

    // --- 1. ENRICH INVENTORY ---
    if (newChar.inventory) {
        const itemPromises = newChar.inventory.map(async (item) => {
            let apiItem = await fetchApiData('equipment', item.name);
            if (!apiItem) apiItem = await fetchApiData('magic-items', item.name);

            let combatStats = null;

            if (apiItem) {
                if (apiItem.equipment_category?.index === 'weapon') {
                    const isFinesse = apiItem.properties?.some(p => p.index === 'finesse');
                    const isRanged = apiItem.weapon_range === 'Ranged';
                    const useDex = isRanged || (isFinesse && dexMod > strMod);
                    const mod = useDex ? dexMod : strMod;
                    
                    const dmgDice = apiItem.damage?.damage_dice || "1d4";
                    const dmgType = apiItem.damage?.damage_type?.name || "";

                    combatStats = {
                        type: "Action", 
                        hit: `+${mod + prof}`,
                        dmg: `${dmgDice}${mod >= 0 ? '+'+mod : mod} ${dmgType}`,
                        notes: apiItem.properties?.map(p => p.name).join(', ') || ""
                    };
                }

                let desc = apiItem.desc ? apiItem.desc.join('\n') : "";
                if (!desc && apiItem.properties) desc = apiItem.properties.map(p => p.name).join(', ');

                return {
                    ...item,
                    weight: apiItem.weight || item.weight || 0,
                    desc: desc || item.desc || "",
                    cost: apiItem.cost ? `${apiItem.cost.quantity} ${apiItem.cost.unit}` : (item.cost || ""),
                    combat: combatStats,
                    equipped: item.equipped || false
                };
            }
            return item;
        });

        newChar.inventory = await Promise.all(itemPromises);
    }

    // --- 2. ENRICH FEATURES ---
    if (newChar.features) {
        const featurePromises = newChar.features.map(async (feat) => {
            let apiFeat = await fetchApiData('features', feat.name);
            if (!apiFeat) apiFeat = await fetchApiData('feats', feat.name);
            if (!apiFeat) apiFeat = await fetchApiData('traits', feat.name);

            const fullDesc = apiFeat && apiFeat.desc ? apiFeat.desc.join('\n') : (feat.desc || "");
            const source = apiFeat ? (apiFeat.class?.name || apiFeat.race?.name || "Feat") : (feat.source || "Other");

            const actionType = detectActionType(feat.name, fullDesc, "");
            const useInfo = detectUses(fullDesc);

            // Create Custom Action if it is actionable
            if (actionType !== "Action" || useInfo.recovery) {
                const newAction = {
                    name: feat.name,
                    category: "Feature",
                    type: actionType, 
                    desc: fullDesc,
                    uses: useInfo.max > 0 ? { current: useInfo.max, max: useInfo.max, recovery: useInfo.recovery } : null
                };

                newChar.customActions = newChar.customActions || [];
                if (!newChar.customActions.find(a => a.name === newAction.name)) {
                    newChar.customActions.push(newAction);
                }
            }

            return { ...feat, desc: fullDesc, source: source };
        });
        newChar.features = await Promise.all(featurePromises);
    }

    // --- 3. ENRICH SPELLS ---
    if (newChar.spells) {
        console.log("Enriching Spells...");
        const spellPromises = newChar.spells.map(async (spell) => {
            
            // CHECK MANUAL SPELLBOOK FIRST
            const manualData = MANUAL_SPELLS[normalize(spell.name)];
            if (manualData) {
                // If it's an attack roll based spell, calc hit
                let hitBonus = manualData.hit;
                if (hitBonus === "+Spell" || hitBonus === "") {
                    // If the manual data implies a hit but no specific number, calc it
                    if(manualData.desc.toLowerCase().includes("spell attack")) hitBonus = `+${spellAttack}`;
                }

                const actionType = manualData.type || detectActionType(spell.name, manualData.desc, manualData.time);

                // Add to customActions so it shows on front page
                if (manualData.dmg || hitBonus || actionType !== "Action") {
                    newChar.customActions = newChar.customActions || [];
                    if (!newChar.customActions.find(a => a.name === spell.name)) {
                        newChar.customActions.push({
                            name: spell.name,
                            category: "Spell",
                            type: actionType,
                            hit: hitBonus,
                            dmg: manualData.dmg,
                            range: manualData.range,
                            notes: manualData.desc
                        });
                    }
                }

                return { ...spell, ...manualData, hit: hitBonus };
            }

            // FALLBACK TO API
            const apiData = await fetchApiData('spells', spell.name);
            
            let finalDmg = spell.dmg || "";
            let finalHit = spell.hit || "";
            let finalTime = spell.time || "1 Action";
            let finalDesc = spell.desc || "";
            let finalRange = spell.range || "";

            if (apiData) {
                if (apiData.damage) {
                     if (apiData.damage.damage_at_slot_level) {
                        const levels = Object.keys(apiData.damage.damage_at_slot_level);
                        const val = apiData.damage.damage_at_slot_level[levels[0]]; 
                        if (val) finalDmg = val;
                        if (apiData.damage.damage_type?.name) finalDmg += ` ${apiData.damage.damage_type.name}`;
                    } else if (apiData.damage.damage_at_character_level) {
                        const levels = Object.keys(apiData.damage.damage_at_character_level);
                        const val = apiData.damage.damage_at_character_level[levels[0]];
                        if (val) finalDmg = val;
                        if (apiData.damage.damage_type?.name) finalDmg += ` ${apiData.damage.damage_type.name}`;
                    }
                }

                if (apiData.attack_type) finalHit = `+${spellAttack}`;
                if (apiData.casting_time) finalTime = apiData.casting_time;
                if (apiData.desc) finalDesc = apiData.desc.join('\n\n');
                if (apiData.range) finalRange = apiData.range;
            }

            const actionType = detectActionType(spell.name, "", finalTime);
            
            if (finalDmg || finalHit || actionType !== "Action") {
                newChar.customActions = newChar.customActions || [];
                if (!newChar.customActions.find(a => a.name === spell.name)) {
                    newChar.customActions.push({
                        name: spell.name,
                        category: "Spell",
                        type: actionType,
                        hit: finalHit,
                        dmg: finalDmg,
                        range: finalRange,
                        notes: finalDesc
                    });
                }
            }

            return {
                ...spell,
                level: spell.level !== undefined ? spell.level : (apiData?.level || 0),
                school: apiData?.school?.name || "Universal",
                range: finalRange,
                time: finalTime,
                type: actionType, 
                desc: finalDesc,
                dmg: finalDmg,
                hit: finalHit
            };
        });
        newChar.spells = await Promise.all(spellPromises);
    }

    return sanitizeForFirestore(newChar);
};