/**
 * Group Roll Utilities for D&D 5e checks, saves, and initiative
 */

export const SKILL_ABILITY_MAP = {
    'Athletics': 'str',
    'Acrobatics': 'dex',
    'Sleight of Hand': 'dex',
    'Stealth': 'dex',
    'Arcana': 'int',
    'History': 'int',
    'Investigation': 'int',
    'Nature': 'int',
    'Religion': 'int',
    'Animal Handling': 'wis',
    'Insight': 'wis',
    'Medicine': 'wis',
    'Perception': 'wis',
    'Survival': 'wis',
    'Deception': 'cha',
    'Intimidation': 'cha',
    'Performance': 'cha',
    'Persuasion': 'cha'
};

export const ALL_SKILLS = Object.keys(SKILL_ABILITY_MAP);
export const ALL_ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
export const ABILITY_SHORT = {
    'Strength': 'str',
    'Dexterity': 'dex',
    'Constitution': 'con',
    'Intelligence': 'int',
    'Wisdom': 'wis',
    'Charisma': 'cha'
};

export const getAbilityModifier = (score) => Math.floor(((score ?? 10) - 10) / 2);

export const getProficiencyBonus = (character) => {
    if (character?.profBonus && Number.isFinite(character.profBonus)) return character.profBonus;
    const lvl = parseInt(character?.level, 10) || 1;
    return Math.floor((lvl - 1) / 4) + 2;
};

/**
 * Calculates the exact check/save modifier for a character.
 */
export const calculateCharacterModifier = (character, rollType, category = 'skill') => {
    if (!character) return 0;
    const stats = character.stats || {};
    const prof = getProficiencyBonus(character);

    // 1. Initiative
    if (rollType.toLowerCase() === 'initiative') {
        if (typeof character.initiative === 'number') return character.initiative;
        const dexMod = character.modifiers?.dex ?? getAbilityModifier(stats.dex);
        return dexMod;
    }

    // 2. Saving Throws
    if (category === 'save' || rollType.toLowerCase().includes('save')) {
        const cleanStat = rollType.toLowerCase().replace(/ saving throw| save/g, '').trim();
        const statKey = ABILITY_SHORT[Object.keys(ABILITY_SHORT).find(k => k.toLowerCase() === cleanStat)] || cleanStat.substring(0, 3);
        const baseMod = character.modifiers?.[statKey] ?? getAbilityModifier(stats[statKey]);
        const isProf = character.savingThrows?.[statKey] || character.savingThrows?.[statKey.toLowerCase()] || character.savingThrows?.[statKey.toUpperCase()];
        return baseMod + (isProf ? prof : 0);
    }

    // 3. Skills
    const skillKey = Object.keys(SKILL_ABILITY_MAP).find(s => s.toLowerCase() === rollType.toLowerCase());
    if (skillKey) {
        const ability = SKILL_ABILITY_MAP[skillKey];
        const baseMod = character.modifiers?.[ability] ?? getAbilityModifier(stats[ability]);
        const skillEntry = character.skills?.[skillKey] || character.skills?.[skillKey.toLowerCase()];
        
        let profMultiplier = 0;
        if (skillEntry === true || skillEntry === 1 || skillEntry?.proficient) {
            profMultiplier = 1;
        } else if (skillEntry === 2 || skillEntry?.expertise) {
            profMultiplier = 2;
        }
        return baseMod + (prof * profMultiplier);
    }

    // 4. Pure Ability Check
    const abilityKey = ABILITY_SHORT[Object.keys(ABILITY_SHORT).find(k => k.toLowerCase() === rollType.toLowerCase())] || rollType.toLowerCase().substring(0, 3);
    if (stats[abilityKey] !== undefined || character.modifiers?.[abilityKey] !== undefined) {
        return character.modifiers?.[abilityKey] ?? getAbilityModifier(stats[abilityKey]);
    }

    return 0;
};

/**
 * Creates the initial payload for a group roll.
 */
export const createGroupRollPayload = ({
    rollType = 'Perception',
    category = 'skill', // 'skill' | 'save' | 'ability' | 'initiative'
    dc = null,
    players = [],
    assignments = {},
    user = null,
    role = 'dm'
}) => {
    const participants = players.map(p => {
        const mod = calculateCharacterModifier(p, rollType, category);
        
        // Find assigned UID if available
        let assignedUid = null;
        if (assignments) {
            for (const [uid, charId] of Object.entries(assignments)) {
                if (String(charId) === String(p.id)) {
                    assignedUid = uid;
                    break;
                }
            }
        }
        if (!assignedUid && p.ownerId) {
            assignedUid = p.ownerId;
        }

        return {
            characterId: p.id,
            characterName: p.name || 'Hero',
            characterAvatar: p.image || null,
            ownerId: p.ownerId || null,
            assignedUid: assignedUid,
            modifier: mod,
            roll: null
        };
    });

    return {
        id: `grouproll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: `Group ${rollType} ${category === 'save' ? 'Save' : 'Check'}`,
        rollType: rollType,
        category: category,
        dc: dc ? parseInt(dc, 10) : null,
        createdAt: Date.now(),
        creatorId: user?.uid || 'dm',
        creatorName: user?.displayName || (role === 'dm' ? 'Dungeon Master' : 'Player'),
        status: 'active',
        participants: participants
    };
};

/**
 * Computes collective group statistics from current participant rolls.
 */
export const computeGroupRollStats = (participants = [], dc = null) => {
    const totalCount = participants.length;
    const rolledParticipants = participants.filter(p => p.roll && typeof p.roll.total === 'number');
    const rolledCount = rolledParticipants.length;
    const pendingCount = totalCount - rolledCount;
    const isAllRolled = totalCount > 0 && rolledCount === totalCount;

    if (rolledCount === 0) {
        return {
            totalCount,
            rolledCount,
            pendingCount,
            isAllRolled: false,
            average: 0,
            highest: null,
            lowest: null,
            successCount: 0,
            failureCount: 0,
            neededSuccesses: Math.ceil(totalCount / 2),
            groupSuccess: null
        };
    }

    const totalSum = rolledParticipants.reduce((acc, p) => acc + p.roll.total, 0);
    const average = parseFloat((totalSum / rolledCount).toFixed(1));

    let highest = rolledParticipants[0];
    let lowest = rolledParticipants[0];

    rolledParticipants.forEach(p => {
        if (p.roll.total > highest.roll.total) highest = p;
        if (p.roll.total < lowest.roll.total) lowest = p;
    });

    const numDc = dc ? parseInt(dc, 10) : null;
    let successCount = 0;
    let failureCount = 0;
    let groupSuccess = null;
    const neededSuccesses = Math.ceil(totalCount / 2);

    if (numDc !== null) {
        successCount = rolledParticipants.filter(p => p.roll.total >= numDc).length;
        failureCount = rolledParticipants.filter(p => p.roll.total < numDc).length;
        groupSuccess = successCount >= neededSuccesses;
    }

    return {
        totalCount,
        rolledCount,
        pendingCount,
        isAllRolled,
        average,
        highest: {
            characterName: highest.characterName,
            total: highest.roll.total,
            natural: highest.roll.natural
        },
        lowest: {
            characterName: lowest.characterName,
            total: lowest.roll.total,
            natural: lowest.roll.natural
        },
        successCount,
        failureCount,
        neededSuccesses,
        groupSuccess
    };
};

