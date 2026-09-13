import { useState, useEffect } from 'react';
import { retrieveChunkedMap } from './storageUtils';

const globalBlobUrlCache = new Map(); // chunkedId -> { url, refCount, timeoutId }
const MAX_CACHED_BLOBS = 15;

export const useResolvedUrl = (url) => {
    const [resolvedUrl, setResolvedUrl] = useState(() => {
        if (!url) return null;
        if (!url.startsWith('chunked:')) return url;
        const cached = globalBlobUrlCache.get(url);
        return cached ? cached.url : null;
    });

    useEffect(() => {
        if (!url) {
            setResolvedUrl(null);
            return;
        }
        if (!url.startsWith('chunked:')) {
            setResolvedUrl(url);
            return;
        }

        let isActive = true;
        const entry = globalBlobUrlCache.get(url);

        if (entry) {
            if (entry.timeoutId) {
                clearTimeout(entry.timeoutId);
                entry.timeoutId = null;
            }
            entry.refCount += 1;
            setResolvedUrl(entry.url);
        } else {
            retrieveChunkedMap(url).then(blob => {
                if (!isActive || !blob) return;

                // Evict oldest if exceeding limit
                if (globalBlobUrlCache.size >= MAX_CACHED_BLOBS) {
                    for (const [k, v] of globalBlobUrlCache.entries()) {
                        if (v.refCount <= 0) {
                            if (v.timeoutId) clearTimeout(v.timeoutId);
                            URL.revokeObjectURL(v.url);
                            globalBlobUrlCache.delete(k);
                            break;
                        }
                    }
                }

                const objectUrl = URL.createObjectURL(blob);
                globalBlobUrlCache.set(url, { url: objectUrl, refCount: 1, timeoutId: null });
                setResolvedUrl(objectUrl);
            }).catch(console.error);
        }

        return () => {
            isActive = false;
            const currentEntry = globalBlobUrlCache.get(url);
            if (currentEntry) {
                currentEntry.refCount = Math.max(0, currentEntry.refCount - 1);
                if (currentEntry.refCount === 0 && !currentEntry.timeoutId) {
                    currentEntry.timeoutId = setTimeout(() => {
                        if (currentEntry.refCount === 0) {
                            URL.revokeObjectURL(currentEntry.url);
                            globalBlobUrlCache.delete(url);
                        }
                    }, 15000);
                }
            }
        };
    }, [url]);

    return resolvedUrl;
};
