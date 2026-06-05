import { useState, useEffect } from 'react';
import { retrieveChunkedMap } from './storageUtils';

export const useResolvedUrl = (url) => {
    const [resolvedUrl, setResolvedUrl] = useState(null);
    useEffect(() => {
        if (!url) {
            setResolvedUrl(null);
            return;
        }
        let isActive = true;
        if (url.startsWith('chunked:')) {
            let objectUrl = null;
            retrieveChunkedMap(url).then(blob => {
                if (isActive && blob) {
                    objectUrl = URL.createObjectURL(blob);
                    console.log(`[Map Texture Debug] 🔗 Created Blob URL: ${objectUrl.substring(0, 40)}... (Size: ${(blob.size / 1024 / 1024).toFixed(2)}MB)`);
                    setResolvedUrl(objectUrl);
                }
            }).catch(console.error);
            return () => { 
                isActive = false; 
                if (objectUrl) {
                    // Delay revoke to avoid interrupting in-flight fetches during StrictMode remounts
                    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000); 
                }
            };
        } else {
            setResolvedUrl(url);
        }
        return () => { isActive = false; }
    }, [url]);
    return resolvedUrl;
};
