const API_BASE = "https://www.dnd5eapi.co";

/**
 * Normalizes the class name to the index used by the 5e API.
 * e.g., "Fighter" -> "fighter", "Way of the Open Hand Monk" -> "monk"
 */
export const normalizeClassIndex = (className) => {
    if (!className) return "fighter";
    const lower = className.toLowerCase();
    const coreClasses = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
    for (const c of coreClasses) {
        if (lower.includes(c)) return c;
    }
    return "fighter"; // Fallback
};

/**
 * Fetches the level data for a specific class and level.
 */
export const fetchClassLevelData = async (className, level) => {
    const classIndex = normalizeClassIndex(className);
    try {
        const response = await fetch(`${API_BASE}/api/classes/${classIndex}/levels/${level}`);
        if (!response.ok) throw new Error("Failed to fetch level data");
        return await response.json();
    } catch (e) {
        console.error(e);
        return null;
    }
};

/**
 * Fetches the base class details to get hit dice.
 */
export const fetchClassDetails = async (className) => {
    const classIndex = normalizeClassIndex(className);
    try {
        const response = await fetch(`${API_BASE}/api/classes/${classIndex}`);
        if (!response.ok) throw new Error("Failed to fetch class details");
        return await response.json();
    } catch (e) {
        console.error(e);
        return null;
    }
};

/**
 * Fetches the description of a specific feature using its URL from the API.
 */
export const fetchFeatureDetails = async (featureUrl) => {
    try {
        const response = await fetch(`${API_BASE}${featureUrl}`);
        if (!response.ok) throw new Error("Failed to fetch feature");
        const data = await response.json();
        return {
            name: data.name,
            desc: data.desc?.join("\n") || ""
        };
    } catch (e) {
        console.error(e);
        return null;
    }
};
