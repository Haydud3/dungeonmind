const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src';

/**
 * Fetches JSON data from the 5e-bits database repository.
 * 
 * @param {string} ruleset '2014' or '2024'
 * @param {string} collection The name of the collection (e.g., 'Classes', 'Spells')
 * @param {string} lang The language code (default 'en')
 * @returns {Promise<any[]>} The parsed JSON array
 */
export const fetch5eData = async (ruleset, collection, lang = 'en') => {
    const url = `${GITHUB_RAW_BASE}/${ruleset}/${lang}/5e-SRD-${collection}.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${collection} for ${ruleset} (${response.status})`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error loading 5e data from ${url}:`, error);
        return [];
    }
};

/**
 * Loads the essential data required to bootstrap the character builder.
 * 
 * @param {string} ruleset '2014' or '2024'
 */
export const loadEssentialData = async (ruleset = '2024') => {
    // 2024 ruleset renamed 'Races' to 'Species'
    const speciesCollection = ruleset === '2024' ? 'Species' : 'Races';

    const [species, classes, backgrounds] = await Promise.all([
        fetch5eData(ruleset, speciesCollection),
        fetch5eData(ruleset, 'Classes'),
        fetch5eData(ruleset, 'Backgrounds')
    ]);

    return { species, classes, backgrounds };
};