export const enrichCharacter = async (char) => {
    // Deep copy to avoid mutating original immediately
    const enriched = JSON.parse(JSON.stringify(char));

    // 1. Enrich Spells
    if (enriched.spells && enriched.spells.length > 0) {
        enriched.spells = await enrichSpells(enriched.spells, enriched);
    }

    return enriched;
};

const enrichSpells = async (spells, char) => {
    // Deduplicate by name
    const uniqueSpells = new Map();
    spells.forEach(s => uniqueSpells.set(s.name, s));
    const uniqueArray = Array.from(uniqueSpells.values());

    // Determine Spellcasting Ability & Bonuses
    const spellStat = getSpellcastingAbility(char.class);
    const mod = Math.floor(((char.stats?.[spellStat] || 10) - 10) / 2);
    const prof = char.profBonus || 2;
    const attackBonus = mod + prof;
    const saveDC = 8 + mod + prof;

    const enriched = await Promise.all(uniqueArray.map(async (spell) => {
        // If already enriched (has level and concentration), skip API fetch but ensure hit/save
        if (spell.level !== undefined && spell.concentration !== undefined && spell.school) {
             return {
                 ...spell,
                 hit: spell.hit || (spell.attack_type ? `+${attackBonus}` : undefined),
                 save: spell.save || (!spell.attack_type && spell.desc ? `DC ${saveDC}` : undefined)
             };
        }

        const index = spell.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/2014/spells/${index}`);
            if (!res.ok) throw new Error("Not found");
            
            const data = await res.json();
            
            // Damage Parsing
            let dmg = "";
            if (data.damage) {
                if (data.damage.damage_at_slot_level) {
                    const levels = data.damage.damage_at_slot_level;
                    // Use the spell's base level
                    dmg = levels[data.level] || levels[Object.keys(levels)[0]];
                } else if (data.damage.damage_at_character_level) {
                    dmg = data.damage.damage_at_character_level["1"] || data.damage.damage_at_character_level["5"];
                }
                if (data.damage.damage_type?.name) dmg += ` ${data.damage.damage_type.name}`;
            }

            return {
                ...spell,
                level: data.level,
                school: data.school?.name || spell.school,
                time: data.casting_time || spell.time,
                range: data.range || spell.range,
                duration: data.duration,
                concentration: data.concentration,
                ritual: data.ritual,
                desc: data.desc ? data.desc.join('\n') : spell.desc,
                components: data.components,
                hit: data.attack_type ? `+${attackBonus}` : undefined,
                save: !data.attack_type ? `DC ${saveDC} ${getSaveType(data.desc)}` : undefined,
                dmg: dmg || spell.dmg
            };

        } catch (e) {
            // Fallback: Assume it's a valid spell but API failed. 
            return { 
                ...spell, 
                hit: spell.hit || `+${attackBonus}`, // Optimistically add hit bonus
                level: spell.level !== undefined ? spell.level : 0 // Default to 0 if unknown
            };
        }
    }));

    // Sort: Level -> Name
    return enriched.sort((a, b) => {
        if ((a.level || 0) !== (b.level || 0)) return (a.level || 0) - (b.level || 0);
        return a.name.localeCompare(b.name);
    });
};

const getSpellcastingAbility = (className) => {
    const c = (className || "").toLowerCase();
    if (c.includes('wizard') || c.includes('rogue') || c.includes('fighter')) return 'int';
    if (c.includes('cleric') || c.includes('druid') || c.includes('ranger') || c.includes('monk')) return 'wis';
    if (c.includes('bard') || c.includes('sorcerer') || c.includes('warlock') || c.includes('paladin')) return 'cha';
    return 'int';
};

const getSaveType = (descArray) => {
    if (!descArray) return "";
    const text = Array.isArray(descArray) ? descArray.join(' ') : descArray;
    const match = text.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
    return match ? match[1].substring(0, 3).toUpperCase() : "";
};