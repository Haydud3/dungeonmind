/**
 * Splits a 4-panel Master Asset Sheet into separate data URIs for WebGL ingestion.
 * Assumes a perfectly symmetrical 2x2 grid output from the AI.
 * 
 * @param {File|Blob|string} imageSource - The uploaded AI 4-panel image.
 * @returns {Promise<{reference: string, depth: string, albedo: string, axo: string}>}
 */
export const splitMasterAssetSheet = (imageSource) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        img.onload = () => {
            // Assuming a 2x2 grid layout from the AI prompt
            const panelWidth = img.width / 2;
            const panelHeight = img.height / 2;

            const extractPanel = (x, y) => {
                const canvas = document.createElement('canvas');
                canvas.width = panelWidth;
                canvas.height = panelHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, x, y, panelWidth, panelHeight, 0, 0, panelWidth, panelHeight);
                return canvas.toDataURL('image/webp', 0.9); // WebP for optimization
            };

            resolve({
                reference: extractPanel(0, 0),                       // Top-Left (Panel 1)
                depth: extractPanel(panelWidth, 0),                  // Top-Right (Panel 2)
                albedo: extractPanel(0, panelHeight),                // Bottom-Left (Panel 3)
                axo: extractPanel(panelWidth, panelHeight)           // Bottom-Right (Panel 4)
            });
        };
        
        img.onerror = (err) => reject(new Error("Failed to load image for splitting."));
        img.src = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);
    });
};