import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase';

// =================================================================
// New Dedicated Map Service
// =================================================================

/**
 * Returns the Firestore reference for a specific map in a campaign.
 * @param {string} campaignCode
 * @param {string} mapId
 */
export const getMapRef = (campaignCode, mapId) => {
    return doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'maps', mapId);
};

/**
 * Subscribes to real-time changes for a specific map.
 * @param {string} campaignCode
 * @param {string} mapId
 * @param {function(Object|null): void} callback
 * @returns {function(): void} Unsubscribe function
 */
export const subscribeToMap = (campaignCode, mapId, callback) => {
    const ref = getMapRef(campaignCode, mapId);
    return onSnapshot(ref, (snap) => {
        callback(snap.exists() ? snap.data() : null);
    });
};

/**
 * Creates a new map document. This will overwrite any existing map with the same ID.
 * @param {string} campaignCode
 * @param {string} mapId
 * @param {Object} mapData
 */
export const createMap = (campaignCode, mapId, mapData) => {
    const ref = getMapRef(campaignCode, mapId);
    return setDoc(ref, mapData);
};

/**
 * Updates fields on a map document. If the document doesn't exist, it's created.
 * This function is used by the TacticalMapView for both creating and updating maps.
 * @param {string} campaignCode
 * @param {string} mapId
 * @param {Object} updates - For new maps, this should be the full map object. For existing maps, a partial object with fields to update.
 */
export const updateMap = async (campaignCode, mapId, updates) => {
    const ref = getMapRef(campaignCode, mapId);
    const docSnap = await getDoc(ref);

    if (docSnap.exists()) {
        // Document exists, so update it.
        await updateDoc(ref, updates);
    } else {
        // Document does not exist, so create it.
        // We assume 'updates' contains the full initial map data.
        await setDoc(ref, updates);
    }
};


// =================================================================
// Generic Asset Service (Kept for other potential asset types)
// =================================================================

const getAssetRef = (campaignCode, assetId) => {
    return doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', assetId);
};

export const createAsset = async (campaignCode, assetData) => {
    const ref = getAssetRef(campaignCode, assetData.id);
    await setDoc(ref, assetData);
};

export const updateAsset = async (campaignCode, assetId, updates) => {
    const ref = getAssetRef(campaignCode, assetId);
    await updateDoc(ref, updates);
};

export const subscribeToAsset = (campaignCode, assetId, callback) => {
    const ref = getAssetRef(campaignCode, assetId);
    return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
            callback(snap.data());
        } else {
            callback(null);
        }
    });
};

