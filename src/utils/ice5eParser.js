export const parseIce5e = (json) => {
    try {
        const char = json.character;
        const details = char.details;
        const attr = char.attributes;
        const combat = char.combat;

        return {
            name: details.name || "New Hero",
            // START CHANGE: Map Saving Throw Proficiencies and Actions
            savingThrows: {
                str: attr.strength.savingThrowProficiency,
                dex: attr.dexterity.savingThrowProficiency,
                con: attr.constitution.savingThrowProficiency,
                int: attr.intelligence.savingThrowProficiency,
                wis: attr.wisdom.savingThrowProficiency,
                cha: attr.charisma.savingThrowProficiency
            },
            customActions: [
                // REMOVED: Weapons mapping (moved to Smart Inventory logic)
                ...(char.magic.spells || []).map(s => ({
                    name: s.name,
                    hit: s.attackBonus || "",
                    dmg: s.damage || "",
                    type: s.activationTime || "Action",
                    category: "Spell",
                    notes: s.description,
                    source: "spell"
                }))
            ],
            // END CHANGE
            race: details.species || "",
            class: details.class || "",
            level: details.level || 1,
            stats: {
                str: attr.strength.score,
                dex: attr.dexterity.score,
                con: attr.constitution.score,
                int: attr.intelligence.score,
                wis: attr.wisdom.score,
                cha: attr.charisma.score
            },
            hp: {
                max: combat.hitPoints.maximum,
                current: combat.hitPoints.current,
                temp: combat.hitPoints.temporary || 0
            },
            // START CHANGE: Map Advanced Resources (Hit Dice, Exhaustion)
            hitDice: {
                max: combat.hitDice.total || 1,
                current: combat.hitDice.remaining || 1,
                die: combat.hitDice.dieType || "d8"
            },
            exhaustion: combat.exhaustion || 0,
            conditions: [], // ICE doesn't typically export active conditions, start empty
            // END CHANGE
            ac: combat.armorClass,
            speed: combat.speed.walk + "ft",
            profBonus: Math.ceil(1 + (details.level / 4)), // Standard 5e calc
            currency: {
                cp: char.equipment.currency.copper,
                sp: char.equipment.currency.silver,
                ep: char.equipment.currency.electrum,
                gp: char.equipment.currency.gold,
                pp: char.equipment.currency.platinum
            },
            inventory: char.equipment.items.map(i => ({
                name: i.name,
                qty: i.quantity,
                weight: i.weight,
                desc: i.description,
                equipped: i.equipped
            })),
            // Map ICE Traits to Features
            features: [
                ...char.traits.class.map(t => ({ name: t.name, source: 'Class', desc: t.description })),
                ...char.traits.species.map(t => ({ name: t.name, source: 'Race', desc: t.description })),
                ...char.traits.background.map(t => ({ name: t.name, source: 'Background', desc: t.description }))
            ],
            // Map personality fields
            bio: {
                appearance: char.personality.appearance,
                backstory: char.personality.backstory,
                traits: char.personality.traits,
                ideals: char.personality.ideals,
                bonds: char.personality.bonds,
                flaws: char.personality.flaws,
                notes: char.personality.allies + "\n" + char.personality.treasure
            },
            // Map skills
            skills: Object.keys(char.skills).reduce((acc, key) => {
                if (char.skills[key].proficiency) {
                    // Convert camelCase to Title Case (perception -> Perception)
                    const name = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                    acc[name] = true;
                }
                return acc;
            }, {})
        };
    } catch (e) {
        console.error("ICE Parser Error:", e);
        throw new Error("Invalid ICE 5e JSON format.");
    }
};