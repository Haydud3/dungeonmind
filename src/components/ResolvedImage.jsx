import React, { useState, useEffect } from 'react';
import { retrieveChunkedMap } from '../utils/storageUtils';
import Icon from './Icon';

const ResolvedImage = ({ id, className, alt }) => {
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        let createdUrl = null;

        const load = async () => {
            try {
                const asset = await retrieveChunkedMap(id);
                if (!active || !asset) return;
                
                if (asset instanceof Blob) {
                    createdUrl = URL.createObjectURL(asset);
                    setUrl(createdUrl);
                } else {
                    setUrl(asset);
                }
            } catch (e) {
                console.error("Image reassembly failed:", id, e);
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { 
            active = false; 
            if (createdUrl) setTimeout(() => URL.revokeObjectURL(createdUrl), 5000); 
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
            className={className || "max-w-full h-auto block mx-auto my-6 rounded-lg shadow-lg border border-black/10"} 
            alt={alt || "Handout Asset"}
        />
    );
};

export default ResolvedImage;