export const compressImage = (file, maxWidth = 4096, quality = 0.9) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const elem = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // CRITICAL: Calculate new dimensions to maintain aspect ratio
                // This logic is correct for proportional scaling:
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                
                // If it's a very tall/wide map, also check against max height
                // Default max height is also 4096 to prevent ultra-long images
                if (height > maxWidth) { 
                    width = Math.round((width * maxWidth) / height);
                    height = maxWidth;
                }

                elem.width = width;
                elem.height = height;
                const ctx = elem.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // FIX: Use toBlob to return a Blob directly for Firebase Storage
                // This avoids the Base64 string that crashes memory.
                elem.toBlob(
                    (blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error("Canvas to Blob conversion failed."));
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};