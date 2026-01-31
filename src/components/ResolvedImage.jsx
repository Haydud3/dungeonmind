import React, { useState, useEffect } from 'react';
import { retrieveChunkedMap } from '../utils/storageUtils';
import Icon from './Icon';

const ResolvedImage = ({ id }) => {
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const base64 = await retrieveChunkedMap(id);
                if (!active || !base64) return;
                
                // Convert Base64 to Blob URL for better rendering stability
                const res = await fetch(base64);
                const blob = await res.blob();
                setUrl(URL.createObjectURL(blob));
            } catch (e) {
                console.error("Image reassembly failed:", id, e);
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { 
            active = false; 
            if (url) URL.revokeObjectURL(url); 
        };
    }, [id]);

    if (loading) return (
        <div className="w-full h-48 bg-black/10 rounded-lg flex items-center justify-center animate-pulse border border-current/10 my-4">
            <Icon name="loader" className="animate-spin opacity-30" size={32}/>
        </div>
    );

    if (!url) return null;

    return (
        <img 
            src={url} 
            className="max-w-full h-auto block mx-auto my-6 rounded-lg shadow-lg border border-black/10" 
            alt="Handout Asset"
        />
    );
};

export default ResolvedImage;