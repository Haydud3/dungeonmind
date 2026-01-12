// src/utils/srdEnricher.js

const API_BASE = 'https://www.dnd5eapi.co';

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

// Heuristic to detect action type from text description
const detectActionTime = (text) => {
    const t = text.toLowerCase();
    if (t.includes("bonus action")) return "1BA";
    if (t.includes("reaction")) return "1R";
    if (t.includes("action")) return "1A";
    return "";
};

// Heuristic to detect limited uses (e.g. "Once per short rest")
const detectUses = (text) => {
    const t = text.toLowerCase();
    let max = 0;
    let recovery = "";

    if (t.includes("short rest") || t.includes("short or long rest")) recovery = "SR";
    else if (t.includes("long rest")) recovery = "LR";

    if (recovery) {
        if (t.includes("twice")) max = 2;
        else if (t.includes("three times")) max = 3;
        else if (t.includes("once") || t.includes("1/")) max = 1;
        // Default to 1 if we found a rest type but no number, usually safe for things like Second Wind
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

        let res = await fetch(`${API_BASE}/api/${category}/${index}`);
        
        if (!res.ok) {
            // Fallback search
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
        console.warn(`SRD Fetch Error (${category}/${name}):`, e);
        return null;
    }
};

// --- MAIN ENRICHER ---

export const enrichCharacter = async (charData) => {
    const newChar = JSON.parse(JSON.stringify(charData));

    // Stats for calculations
    const strMod = getMod(newChar.stats?.str);
    const dexMod = getMod(newChar.stats?.dex);
    const prof = newChar.profBonus || 2;
    const castingStat = getCastingStat(newChar.class);
    const spellAttack = getMod(newChar.stats?.[castingStat]) + prof;

    // --- 1. ENRICH INVENTORY & GENERATE WEAPON ACTIONS ---
    if (newChar.inventory) {
        console.log("Enriching Inventory & Weapons...");
        const weaponActions = [];

        const itemPromises = newChar.inventory.map(async (item) => {
            // Try Equipment first
            let apiItem = await fetchApiData('equipment', item.name);
            if (!apiItem) apiItem = await fetchApiData('magic-items', item.name);

            if (apiItem) {
                // If it's a Weapon, create a Custom Action for it
                if (apiItem.equipment_category?.index === 'weapon') {
                    const isFinesse = apiItem.properties?.some(p => p.index === 'finesse');
                    const isRanged = apiItem.weapon_range === 'Ranged';
                    
                    // Determine modifier (Dex for ranged/finesse usually, Str otherwise)
                    // Simple logic: Use Dex if Ranged or (Finesse AND Dex > Str)
                    const useDex = isRanged || (isFinesse && dexMod > strMod);
                    const mod = useDex ? dexMod : strMod;
                    
                    const dmgDice = apiItem.damage?.damage_dice || "1d4";
                    const dmgType = apiItem.damage?.damage_type?.name || "";

                    weaponActions.push({
                        name: item.name,
                        type: "Weapon Attack",
                        time: "1A",
                        hit: `+${mod + prof}`,
                        dmg: `${dmgDice}${mod >= 0 ? '+'+mod : mod} ${dmgType}`,
                        notes: apiItem.properties?.map(p => p.name).join(', ') || ""
                    });
                }

                // Enrich the Item description
                let desc = apiItem.desc ? apiItem.desc.join('\n') : "";
                if (!desc && apiItem.properties) desc = apiItem.properties.map(p => p.name).join(', ');

                return {
                    ...item,
                    weight: apiItem.weight || item.weight || 0,
                    desc: desc || item.desc || "",
                    cost: apiItem.cost ? `${apiItem.cost.quantity} ${apiItem.cost.unit}` : (item.cost || "")
                };
            }
            return item;
        });

        newChar.inventory = await Promise.all(itemPromises);
        
        // Merge generated weapons into customActions (avoiding duplicates)
        newChar.customActions = newChar.customActions || [];
        weaponActions.forEach(action => {
            if (!newChar.customActions.find(a => a.name === action.name)) {
                newChar.customActions.push(action);
            }
        });
    }

    // --- 2. ENRICH FEATURES & GENERATE LIMITED USE ACTIONS ---
    const featureList = [...(newChar.features || [])];
    // Also check feats if they exist in a separate list or mixed in
    
    if (featureList.length > 0) {
        console.log("Enriching Features...");
        const featurePromises = featureList.map(async (feat) => {
            // Try 'features' endpoint first, then 'feats', then 'traits'
            let apiFeat = await fetchApiData('features', feat.name);
            if (!apiFeat) apiFeat = await fetchApiData('feats', feat.name);
            if (!apiFeat) apiFeat = await fetchApiData('traits', feat.name);

            if (apiFeat) {
                const fullDesc = apiFeat.desc ? apiFeat.desc.join('\n') : "";
                
                // Check if this feature should be an Action
                const actionTime = detectActionTime(fullDesc);
                const useInfo = detectUses(fullDesc);

                // If it has a specific action time (Bonus Action/Reaction) OR has limited uses, add to Actions
                if (actionTime || useInfo.recovery) {
                    const newAction = {
                        name: feat.name,
                        type: "Feature",
                        time: actionTime || "1A", // Default to Action if not specified but has uses
                        desc: fullDesc,
                        uses: useInfo.max > 0 ? { current: useInfo.max, max: useInfo.max, recovery: useInfo.recovery } : null
                    };

                    // Avoid duplicates
                    newChar.customActions = newChar.customActions || [];
                    if (!newChar.customActions.find(a => a.name === newAction.name)) {
                        newChar.customActions.push(newAction);
                    }
                }

                return {
                    ...feat,
                    desc: fullDesc || feat.desc,
                    source: apiFeat.class?.name || apiFeat.race?.name || "Feat"
                };
            }
            return feat;
        });
        newChar.features = await Promise.all(featurePromises);
    }

    // --- 3. ENRICH SPELLS (Existing Logic) ---
    if (newChar.spells) {
        const spellPromises = newChar.spells.map(async (spell) => {
            const apiData = await fetchApiData('spells', spell.name);
            if (apiData) {
                let finalDmg = spell.dmg || "";
                // ... (Existing Spell Damage Parsing Logic) ...
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

                return {
                    ...spell,
                    level: spell.level !== undefined ? spell.level : (apiData.level || 0),
                    school: apiData.school?.name || "Universal",
                    range: apiData.range || "Unknown",
                    time: apiData.casting_time || "1 Action",
                    desc: apiData.desc ? apiData.desc.join('\n\n') : "",
                    dmg: finalDmg,
                    hit: apiData.attack_type ? `+${spellAttack}` : (spell.hit || "")
                };
            }
            return spell;
        });
        newChar.spells = await Promise.all(spellPromises);
    }

    return sanitizeForFirestore(newChar);
};