/**
 * Resolves the character or token's full initiative modifier, correctly honoring feats (Alert, etc.),
 * subclass features, items, modifiers, and manual initiative overrides from the character sheet.
 *
 * @param {Object} token - The tactical token object (optional)
 * @param {Object} char - The character or actor object
 * @returns {number} - The integer initiative modifier
 */
export const getInitiativeBonus = (token, char) => {
    // 1. Check direct initiative overrides or totals from sheet/token
    const candidates = [
        token?.initiativeBonus,
        token?.initiative,
        token?.stats?.initiative,
        char?.initiative,
        char?.initiativeBonus,
        char?.modifiers?.initiative,
        char?.stats?.initiative
    ];

    for (const val of candidates) {
        if (val !== undefined && val !== null && val !== '') {
            const num = Number(val);
            if (!isNaN(num)) return num;
        }
    }

    // 2. Modifiers DEX or raw ability score DEX
    const dexMod = char?.modifiers?.dex;
    if (dexMod !== undefined && dexMod !== null && dexMod !== '') {
        const num = Number(dexMod);
        if (!isNaN(num)) return num;
    }

    const dexScore = token?.stats?.dex ?? char?.stats?.dex ?? 10;
    const computedMod = Math.floor((Number(dexScore) - 10) / 2);
    return isNaN(computedMod) ? 0 : computedMod;
};

export default getInitiativeBonus;

