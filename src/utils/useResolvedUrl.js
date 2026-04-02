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
                    setResolvedUrl(objectUrl);
                }
            }).catch(console.error);
            return () => { 
                isActive = false; 
                if (objectUrl) URL.revokeObjectURL(objectUrl); 
            };
        } else {
            setResolvedUrl(url);
        }
        return () => { isActive = false; }
    }, [url]);
    return resolvedUrl;
};
