export const buildDungeonMindSheet = (draft, pendingChoices) => {
    // Returns the exact format expected by DungeonMind's VTT and Sheet components
    const sheet = {
        dndBeyondId: null,
        name: draft.name || 'Unknown Hero',
        avatarUrl: draft.avatarUrl || '',
        image: draft.avatarUrl || '',
        inspiration: false,
        race: draft.species?.name || 'Unknown Race',
        background: draft.background?.name || 'Unknown',
        alignment: draft.bio?.alignment || 'True Neutral',
        speed: draft.species?.speed || 30,
        level: draft.classes?.[0]?.level || 1,
        xp: 0,
        class: draft.classData?.name || 'Unknown Class',
        classes: [{
            name: draft.classData?.name || 'Unknown',
            subclass: null, // Subclass mapping is a future enhancement
            level: draft.classes?.[0]?.level || 1
        }],
        stats: { ...draft.abilityScores },
        modifiers: {},
        initiative: 0,
        profBonus: Math.ceil(1 + (draft.classes?.[0]?.level || 1) / 4),
        proficiencies: { armor: '', weapons: '', tools: '', languages: 'Common' },
        savingThrows: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
        defenses: { resistances: '', immunities: '', vulnerabilities: '' },
        skills: {},
        hp: { max: 10, current: 10, temp: 0 },
        ac: 10,
        acFormula: '10 + DEX',
        inventory: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        features: [],
        bio: draft.bio || {},
        darkvision: 0,
        spells: [],
        spellsByLevel: {},
        spellSlots: {},
        actions: [],
        customActions: []
    };

    // Calculate modifiers and apply racial/background bonuses
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => {
        let score = sheet.stats[stat] || 10;
        
        if (draft.species?.ability_bonuses) {
            const bonus = draft.species.ability_bonuses.find(b => b.ability_score?.index === stat);
            if (bonus) score += bonus.bonus;
        }

        pendingChoices.forEach(choice => {
            if (choice.type === 'ability_bonuses' && choice.selections?.includes(stat)) {
                const opt = choice.options.find(o => o.value === stat);
                score += (opt?.bonus || 1);
            }
        });

        sheet.stats[stat] = score;
        sheet.modifiers[stat] = Math.floor((score - 10) / 2);
    });

    sheet.initiative = sheet.modifiers.dex;
    sheet.ac = 10 + sheet.modifiers.dex;

    // Base HP Calculation
    const hitDie = draft.classData?.hit_die || 8;
    const conMod = sheet.modifiers.con;
    const maxHp = hitDie + conMod + ((hitDie / 2 + 1 + conMod) * (sheet.level - 1));
    sheet.hp = { max: Math.floor(maxHp), current: Math.floor(maxHp), temp: 0 };

    // Apply Saving Throws
    if (draft.classData?.saving_throws) {
        draft.classData.saving_throws.forEach(st => {
            sheet.savingThrows[st.index] = true;
        });
    }

    // Apply Pending Choices (Skills, Languages, Equipment)
    pendingChoices.forEach(choice => {
        choice.selections?.forEach(val => {
            if (typeof val === 'string' && val.startsWith('skill-')) {
                const skillName = val.replace('skill-', '').split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                sheet.skills[skillName] = true;
            }
            if (typeof val === 'string' && choice.desc.toLowerCase().includes('language')) {
                sheet.proficiencies.languages += `, ${val.charAt(0).toUpperCase() + val.slice(1)}`;
            }
            if (choice.source?.startsWith('equipment')) {
                sheet.inventory.push({ name: typeof val === 'string' ? val.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Item', qty: 1, weight: 0, equipped: false });
            }
        });
    });

    // Apply Fixed Equipment
    const addEquipment = (equipList) => {
        if (!equipList) return;
        equipList.forEach(e => sheet.inventory.push({ name: e.equipment?.name || 'Item', qty: e.quantity || 1, weight: 0, equipped: false }));
    };
    addEquipment(draft.classData?.starting_equipment);
    addEquipment(draft.background?.starting_equipment);

    // Apply Features & Traits
    if (draft.background?.feature) {
        sheet.features.push({
            name: draft.background.feature.name,
            description: Array.isArray(draft.background.feature.desc) ? draft.background.feature.desc.join('\n') : draft.background.feature.desc,
            source: "Background"
        });
    }

    // Extract active Subclass Features based on character level
    if (draft.subclassData?.features) {
        draft.subclassData.features.forEach(f => {
            if (f.level <= sheet.level) {
                sheet.features.push({
                    name: f.name,
                    description: f.description || f.desc || "",
                    source: draft.subclassData.name
                });
            }
        });
    }

    // Apply Spells
    if (draft.spells) {
        draft.spells.forEach(spell => {
            const level = spell.level || 0;
            if (!sheet.spellsByLevel[level]) sheet.spellsByLevel[level] = [];
            
            let dmgString = "";
            if (spell.damage?.damage_at_slot_level) {
                const levels = Object.keys(spell.damage.damage_at_slot_level);
                dmgString = spell.damage.damage_at_slot_level[levels[0]] || "";
                if (spell.damage.damage_type?.name) dmgString += ` ${spell.damage.damage_type.name}`;
            } else if (spell.damage?.damage_at_character_level) {
                const levels = Object.keys(spell.damage.damage_at_character_level);
                dmgString = spell.damage.damage_at_character_level[levels[0]] || "";
                if (spell.damage.damage_type?.name) dmgString += ` ${spell.damage.damage_type.name}`;
            }

            const mappedSpell = {
                name: spell.name,
                level: level,
                school: spell.school?.name || "Universal",
                desc: (spell.desc || []).join('\n\n'),
                time: spell.casting_time || "1 Action",
                range: spell.range || "Self",
                hit: spell.attack_type ? "+Spell" : (spell.dc ? `DC ${spell.dc.dc_type?.name}` : ""),
                dmg: dmgString,
                concentration: spell.concentration || false,
                ritual: spell.ritual || false,
                components: (spell.components || []).join(', ')
            };
            sheet.spellsByLevel[level].push(mappedSpell);
            sheet.spells.push(mappedSpell);
        });
    }

    return sheet;
};