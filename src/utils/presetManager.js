import { retrieveChunkedMap } from './storageUtils';

/**
 * Converts a remote URL (Image or .glb file) into a Base64 string.
 * NOTE: The server hosting the asset (e.g., Firebase Storage) MUST have CORS enabled.
 */
export const urlToBase64 = async (url) => {
  if (!url) return null;

  // If it's already a Base64 string from your database, return it directly
  if (url.startsWith('data:')) {
    return url;
  }

  if (url.startsWith('chunked:')) {
    try {
      const blob = await retrieveChunkedMap(url);
      if (!blob) return null;
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Failed to convert chunked map to Base64:", url, error);
      return null;
    }
  }

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Failed to convert URL to Base64:", url, error);
    return null;
  }
};

/**
 * Gathers all map state and assets, serializes them, and triggers a JSON download.
 * 
 * @param {Object} mapSettings - Dimensions, grid size, background, current image URLs.
 * @param {Object} geometry - Object containing arrays: { walls, doors, windows }
 * @param {Array} lights - Array of light objects.
 * @param {Array} tokens - Array of placed token objects (positions, linked character IDs).
 * @param {Array} characters - Array of full Character/NPC sheets linked to the tokens.
 */
export const exportMapPreset = async (
  mapSettings,
  geometry,
  lights,
  tokens,
  characters
) => {
  try {
    console.log("Starting export... converting map assets to Base64.");
    
    // 1. Convert core map assets
    const mapImageBase64 = await urlToBase64(mapSettings.mapImageUrl);
    const heightmapBase64 = await urlToBase64(mapSettings.heightmapUrl);
    const normalMapBase64 = await urlToBase64(mapSettings.normalMapUrl);

    // 2. Convert character 3D models
    console.log("Converting 3D Token models...");
    const charactersWithModels = await Promise.all(
      characters.map(async (char) => {
        let modelBase64 = null;
        if (char.modelUrl) {
          modelBase64 = await urlToBase64(char.modelUrl);
        }
        return { ...char, modelBase64 };
      })
    );

    // 3. Assemble Payload
    const payload = {
      version: "1.0",
      type: "dungeonmind-preset",
      mapSettings: {
        ...mapSettings,
        mapImageBase64,
        heightmapBase64,
        normalMapBase64,
      },
      geometry,
      lights,
      tokens,
      characters: charactersWithModels
    };

    // 4. Trigger Download
    console.log("Packaging complete. Triggering download.");
    
    const jsonString = JSON.stringify(payload);
    const blob = new Blob([jsonString], { type: "application/json" });
    const blobUrl = URL.createObjectURL(blob);

    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", blobUrl);
    downloadAnchorNode.setAttribute("download", `dungeonmind-preset-${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(blobUrl); // Clean up memory
    
    return true;
  } catch (error) {
    console.error("Export failed:", error);
    throw error;
  }
};

/**
 * Reads an uploaded JSON file and parses it back into a JavaScript object.
 * 
 * @param {File} file - The file object from an HTML <input type="file">
 */
export const importMapPreset = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.type !== 'dungeonmind-preset') {
          throw new Error("Invalid file format. Not a DungeonMind preset.");
        }
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};