/**
 * Utility functions for D&D 5e Short and Long Rest calculations and mechanics.
 */

export const CLASS_HIT_DICE = {
    barbarian: 'd12',
    fighter: 'd10',
    paladin: 'd10',
    ranger: 'd10',
    bard: 'd8',
    cleric: 'd8',
    druid: 'd8',
    monk: 'd8',
    rogue: 'd8',
    warlock: 'd8',
    sorcerer: 'd6',
    wizard: 'd6',
    artificer: 'd8'
};

export const PREPARED_CASTER_CLASSES = ['wizard', 'cleric', 'druid', 'paladin', 'artificer'];

/**
 * Returns the Constitution modifier for a character.
 */
export const calculateConMod = (character) => {
    const con = character?.stats?.con ?? 10;
    return Math.floor((con - 10) / 2);
};

/**
 * Returns the character's hit die configuration: die type, current available, and maximum.
 */
export const getCharacterHitDie = (character) => {
    const rawClass = (character?.class || '').toLowerCase();
    let die = character?.hitDice?.die;

    if (!die) {
        for (const [cls, d] of Object.entries(CLASS_HIT_DICE)) {
            if (rawClass.includes(cls)) {
                die = d;
                break;
            }
        }
    }
    if (!die) die = 'd8';

    const max = character?.hitDice?.max !== undefined 
        ? character.hitDice.max 
        : (character?.level || 1);

    const current = character?.hitDice?.current !== undefined 
        ? Math.max(0, Math.min(character.hitDice.current, max))
        : max;

    return { die, current, max };
};

/**
 * Normalizes HP data regardless of whether character uses flat or object notation.
 */
export const getCharacterHp = (character) => {
    if (typeof character?.hp === 'object' && character?.hp !== null) {
        return {
            current: Number(character.hp.current) || 0,
            max: Number(character.hp.max) || Number(character.maxHp) || 10,
            temp: Number(character.hp.temp) || 0
        };
    }
    return {
        current: Number(character?.hp) || Number(character?.maxHp) || 10,
        max: Number(character?.maxHp) || 10,
        temp: 0
    };
};

/**
 * Checks if this character is a prepared spellcaster.
 */
export const isPreparedCaster = (character) => {
    const rawClass = (character?.class || '').toLowerCase();
    return PREPARED_CASTER_CLASSES.some(cls => rawClass.includes(cls));
};

/**
 * Calculates maximum prepared spells based on class, level, and mental ability score.
 */
export const getMaxPreparedSpells = (character) => {
    const rawClass = (character?.class || '').toLowerCase();
    const lvl = Number(character?.level) || 1;

    let abilityKey = 'int';
    if (rawClass.includes('cleric') || rawClass.includes('druid')) abilityKey = 'wis';
    if (rawClass.includes('paladin')) abilityKey = 'cha';

    const abilityScore = character?.stats?.[abilityKey] ?? 10;
    const abilityMod = Math.floor((abilityScore - 10) / 2);

    if (rawClass.includes('paladin')) {
        return Math.max(1, Math.floor(lvl / 2) + abilityMod);
    }
    return Math.max(1, lvl + abilityMod);
};

/**
 * Applies a Short Rest to a character object.
 */
export const applyShortRestToCharacter = (character, { hpGained = 0, hitDiceSpent = 0 } = {}) => {
    const clean = JSON.parse(JSON.stringify(character));
    const hp = getCharacterHp(clean);
    const hitDie = getCharacterHitDie(clean);

    // 1. Recover HP
    const newCurrentHp = Math.min(hp.max, hp.current + Math.max(0, hpGained));
    if (typeof clean.hp === 'object' && clean.hp !== null) {
        clean.hp.current = newCurrentHp;
    } else {
        clean.hp = newCurrentHp;
    }

    // 2. Spend Hit Dice
    const newHitDiceCurrent = Math.max(0, hitDie.current - Math.max(0, hitDiceSpent));
    clean.hitDice = {
        die: hitDie.die,
        max: hitDie.max,
        current: newHitDiceCurrent
    };

    // 3. Warlock Pact Magic slots recovery
    if (clean.spellSlots && typeof clean.spellSlots === 'object') {
        const isWarlock = (clean.class || '').toLowerCase().includes('warlock');
        if (isWarlock) {
            Object.keys(clean.spellSlots).forEach(lvl => {
                if (clean.spellSlots[lvl]) {
                    clean.spellSlots[lvl].current = clean.spellSlots[lvl].max;
                }
            });
        } else if (clean.spellSlots.pact) {
            clean.spellSlots.pact.current = clean.spellSlots.pact.max;
        }
    }

    // 4. Short-rest ability uses recovery
    if (clean.abilityUses && typeof clean.abilityUses === 'object') {
        Object.keys(clean.abilityUses).forEach(k => {
            const ab = clean.abilityUses[k];
            if (ab && (ab.reset === 'short' || ab.reset === 'short_rest')) {
                ab.current = ab.max;
            }
        });
    }

    // 5. Features and customActions marked for Short Rest recovery
    if (Array.isArray(clean.features)) {
        clean.features = clean.features.map(f => {
            const recovery = (f.recovery || '').toLowerCase();
            if (recovery.includes('short') || recovery === 'sr') {
                return { ...f, usesRemaining: f.usesMax !== undefined ? f.usesMax : f.usesRemaining };
            }
            return f;
        });
    }

    if (Array.isArray(clean.customActions)) {
        clean.customActions = clean.customActions.map(a => {
            const recovery = (a.recovery || '').toLowerCase();
            if (recovery.includes('short') || recovery === 'sr') {
                return { ...a, usesRemaining: a.usesMax !== undefined ? a.usesMax : a.usesRemaining };
            }
            return a;
        });
    }

    return clean;
};

/**
 * Applies a Long Rest to a character object.
 */
export const applyLongRestToCharacter = (character, { preparedSpellNames = null } = {}) => {
    const clean = JSON.parse(JSON.stringify(character));
    const hp = getCharacterHp(clean);
    const hitDie = getCharacterHitDie(clean);

    // 1. Full HP restoration & temp HP reset
    if (typeof clean.hp === 'object' && clean.hp !== null) {
        clean.hp.current = hp.max;
        clean.hp.temp = 0;
    } else {
        clean.hp = hp.max;
    }

    // 2. Regain half of maximum Hit Dice (minimum 1, up to max)
    const diceToRegain = Math.max(1, Math.floor(hitDie.max / 2));
    const newHitDiceCurrent = Math.min(hitDie.max, hitDie.current + diceToRegain);
    clean.hitDice = {
        die: hitDie.die,
        max: hitDie.max,
        current: newHitDiceCurrent
    };

    // 3. Refill all Spell Slots
    if (clean.spellSlots && typeof clean.spellSlots === 'object') {
        Object.keys(clean.spellSlots).forEach(lvl => {
            if (clean.spellSlots[lvl]) {
                clean.spellSlots[lvl].current = clean.spellSlots[lvl].max;
            }
        });
    }

    // 4. Refill all limited abilities (both short and long rest)
    if (clean.abilityUses && typeof clean.abilityUses === 'object') {
        Object.keys(clean.abilityUses).forEach(k => {
            const ab = clean.abilityUses[k];
            if (ab) ab.current = ab.max;
        });
    }

    // 5. Reset death saves
    clean.deathSaves = { successes: 0, failures: 0 };

    // 6. Remove Unconscious condition (if stabilized / resting)
    if (Array.isArray(clean.conditions)) {
        clean.conditions = clean.conditions.filter(c => c !== 'Unconscious');
    }

    // 7. Reduce Exhaustion by 1
    if (clean.exhaustion !== undefined && clean.exhaustion > 0) {
        clean.exhaustion = Math.max(0, clean.exhaustion - 1);
    }

    // 8. Recharge limited features, customActions, and items
    if (Array.isArray(clean.features)) {
        clean.features = clean.features.map(f => {
            return { ...f, usesRemaining: f.usesMax !== undefined ? f.usesMax : f.usesRemaining };
        });
    }

    if (Array.isArray(clean.customActions)) {
        clean.customActions = clean.customActions.map(a => {
            return { ...a, usesRemaining: a.usesMax !== undefined ? a.usesMax : a.usesRemaining };
        });
    }

    if (Array.isArray(clean.inventory)) {
        clean.inventory = clean.inventory.map(item => {
            if (item.limitedUse) {
                return {
                    ...item,
                    limitedUse: {
                        ...item.limitedUse,
                        numberUsed: 0
                    }
                };
            }
            return item;
        });
    }

    // 9. Update prepared spells if specified
    if (Array.isArray(preparedSpellNames) && Array.isArray(clean.spells)) {
        const prepSet = new Set(preparedSpellNames);
        clean.spells = clean.spells.map(spell => {
            if (spell.level === 0) return spell; // Cantrips are always prepared
            return {
                ...spell,
                prepared: prepSet.has(spell.name)
            };
        });
    }

    return clean;
};

