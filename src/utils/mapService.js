import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db, appId } from '../firebase';

/**
 * @typedef {Object} TokenData
 * @property {string} id - Unique token identifier.
 * @property {string} name - Token display name.
 * @property {number} x - Grid X position.
 * @property {number} y - Grid Y position (elevation).
 * @property {number} z - Grid Z position.
 * @property {string} image - Token portrait/image URL.
 * @property {number} size - Size multiplier (1 = 1x1, 2 = 2x2 grid spaces).
 * @property {boolean} isHidden - If true, only the DM can see it.
 * @property {string} [characterId] - Optional link to a PC or NPC.
 */

/**
 * @typedef {Object} WallData
 * @property {string} id - Unique wall identifier.
 * @property {number} x1 - Starting X coordinate.
 * @property {number} y1 - Starting Z/Y coordinate.
 * @property {number} x2 - Ending X coordinate.
 * @property {number} y2 - Ending Z/Y coordinate.
 * @property {'normal'|'invisible'|'door'} type - The wall's type for vision/movement blocking.
 */

/**
 * @typedef {Object} TacticalMapData
 * @property {string} id - Unique map identifier.
 * @property {string} name - Map display name.
 * @property {string} backgroundUrl - URL for the map background image.
 * @property {number} gridSize - Dimension of the grid cells.
 * @property {number} offsetX - X offset for aligning background to grid.
 * @property {number} offsetY - Y/Z offset for aligning background to grid.
 * @property {number} scale - Scale multiplier for the background image.
 * @property {Record<string, TokenData>} tokens - Dictionary of tokens on the map.
 * @property {Record<string, WallData>} walls - Dictionary of walls on the map.
 * @property {string} [albedoUrl] - Flat texture map without baked shadows.
 * @property {string} [depthMapUrl] - Grayscale heightmap for WebGL displacement.
 * @property {string} [heightmapUrl] - URL of the heightmap image.
 * @property {number} [heightScale] - Multiplier for the heightmap effect.
 */

/**
 * Returns the Firestore reference for a specific map in a campaign.
 */
const getMapRef = (campaignCode, mapId) => {
    return doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'maps', mapId);
};

/**
 * Creates or overwrites a map document.
 * @param {string} campaignCode 
 * @param {TacticalMapData} mapData 
 */
export const createMap = async (campaignCode, mapData) => {
    const ref = getMapRef(campaignCode, mapData.id);
    await setDoc(ref, mapData);
};

/**
 * Updates specific fields on an existing map document.
 * @param {string} campaignCode 
 * @param {string} mapId 
 * @param {Partial<TacticalMapData>} updates 
 */
export const updateMap = async (campaignCode, mapId, updates) => {
    const ref = getMapRef(campaignCode, mapId);
    
    // Sanitize token position updates to prevent bad data
    for (const key in updates) {
        if (key.endsWith('.x') || key.endsWith('.y') || key.endsWith('.z')) {
            const numValue = Number(updates[key]);
            if (isNaN(numValue)) {
                console.warn(`Invalid value for ${key}. Expected number, got:`, updates[key]);
                // Setting to 0 as a safe fallback, or you could delete the key
                updates[key] = 0;
            } else {
                updates[key] = numValue;
            }
        }
    }

    try {
        // Attempt to update the existing map
        await updateDoc(ref, updates);
    } catch (err) {
        if (err.code === 'not-found') {
            // If the map document doesn't exist yet, create a blank baseline first!
            await setDoc(ref, {
                gridSize: 1,
                scale: 20,
                backgroundUrl: '',
                tokens: {}
            });
            // Then re-apply the original updates (which might contain nested dot-notation paths)
            await updateDoc(ref, updates);
        } else {
            console.error("Error updating map:", err);
            throw err;
        }
    }
};

/**
 * Subscribes to real-time changes for a specific map.
 * @param {string} campaignCode 
 * @param {string} mapId 
 * @param {function(TacticalMapData|null): void} callback 
 * @returns {function(): void} Unsubscribe function
 */
export const subscribeToMap = (campaignCode, mapId, callback) => {
    const ref = getMapRef(campaignCode, mapId);
    return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
            callback(snap.data());
        } else {
            callback(null);
        }
    });
};