import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Icon from './Icon';
import { storeChunkedMap } from '../utils/storageUtils';

// The AI Ingestion Pixel Scanner
const scanFeatures = (architectUrl, illuminationUrl, scale = 20) => {
    return new Promise((resolve, reject) => {
        const archImg = new Image();
        const illImg = new Image();
        let loaded = 0;
        
        const processPixels = () => {
            if (++loaded < 2) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, archImg.width, illImg.width);
            canvas.height = Math.max(1, archImg.height, illImg.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            let archData = null;
            let illData = null;

            if (archImg.width > 0 && archImg.src !== "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7") {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(archImg, 0, 0, canvas.width, canvas.height);
                archData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            }

            if (illImg.width > 0 && illImg.src !== "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7") {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(illImg, 0, 0, canvas.width, canvas.height);
                illData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            }

            const aspect = canvas.width / canvas.height || 1;

            const worker = new Worker(new URL('./featureExtraction.worker.js', import.meta.url), { type: 'module' });
            
            worker.onmessage = (e) => {
                const { type, payload } = e.data;
                if (type === 'FEATURES_EXTRACTED') {
                    resolve(payload);
                    worker.terminate();
                }
            };
            
            worker.onerror = (err) => {
                console.error("Feature Extraction Worker error:", err);
                reject(err);
                worker.terminate();
            };
            
            worker.postMessage({
                type: 'EXTRACT_FEATURES',
                archData,
                illData,
                width: canvas.width,
                height: canvas.height,
                scale,
                aspect
            });
        };
        
        archImg.crossOrigin = "Anonymous";
        illImg.crossOrigin = "Anonymous";
        archImg.onload = processPixels; 
        illImg.onload = processPixels;
        archImg.onerror = processPixels;
        illImg.onerror = processPixels;
        
        archImg.src = architectUrl; 
        illImg.src = illuminationUrl;
    });
};

const ImageDropzone = ({ label, onDrop, imageUrl }) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: (files) => onDrop(files[0]),
        accept: { 'image/*': [] },
        multiple: false
    });

    return (
        <div {...getRootProps()} className={`relative w-full h-24 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-500 cursor-pointer overflow-hidden hover:border-purple-500 hover:text-purple-400 transition-colors ${isDragActive ? 'bg-slate-800 border-purple-500' : 'bg-slate-900'}`}>
            <input {...getInputProps()} />
            {imageUrl ? (
                <div className="w-full h-full relative group">
                    <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-bold">Replace</span>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center text-center px-4 pointer-events-none">
                    <Icon name="upload-cloud" size={20} className="mb-1" />
                    <p className="text-[10px]">Drop image</p>
                </div>
            )}
        </div>
    );
};

const Section = ({ title, promptText, layerType, image, onDrop, onApply, isProcessing, copied, onCopy }) => {
    return (
        <div className="border border-slate-800 bg-slate-950 p-4 rounded-xl space-y-4">
            <h4 className="text-sm font-bold text-amber-500 flex items-center gap-2">
                <Icon name="image" size={16} /> {title}
            </h4>
            
            <div>
                <label className="block text-[10px] uppercase font-bold text-purple-400 mb-1">1. Copy Prompt</label>
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 relative group">
                    <p className="text-[11px] font-mono text-slate-300 pr-8 leading-relaxed">{promptText}</p>
                    <button onClick={() => onCopy(layerType, promptText)} className="absolute top-2 right-2 bg-slate-800 hover:bg-purple-600 text-white p-1.5 rounded shadow transition-colors" title="Copy Prompt">
                        <Icon name={copied === layerType ? "check" : "copy"} size={14} />
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-[10px] uppercase font-bold text-purple-400 mb-1">2. Upload Result</label>
                <ImageDropzone label={title} onDrop={(f) => onDrop(f, layerType)} imageUrl={image} />
            </div>

            <button 
                onClick={() => onApply(layerType)} 
                disabled={isProcessing || !image}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white text-sm font-bold rounded flex items-center justify-center gap-2 shadow-lg transition-colors"
            >
                {isProcessing ? <Icon name="loader" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
                Apply {title}
            </button>
        </div>
    );
};

const MapGenerator = ({ onUpdateAssetLayer, mapData }) => {
    const [images, setImages] = useState({
        baseMap: null,
        heightMap: null,
        normalMap: null,
        architectMask: null,
        illuminationMask: null
    });
    const [isProcessing, setIsProcessing] = useState({});
    const [copied, setCopied] = useState(null);

    const prompts = {
        baseMap: "System Role: You are the DungeonMind Architect Engine. Generate a detailed top-down TTRPG battlemap. NO text or labels.",
        heightMap: "System Role: You are the DungeonMind Architect Engine. First, perfectly visualize how the previous 2D battlemap would look as a physical 3D environment with depth and verticality. Then, generate a clean, colored topographical heightmap of this 3D structure. Use smooth, continuous color gradients to represent elevation (darker for low ground, lighter for high structures). CRITICAL AVOIDANCE: Do NOT add any noise, textures, patterns, or 'dots'. The gradients MUST be perfectly smooth to prevent jagged spikes when rendered in 3D. NO text or labels.",
        normalMap: "System Role: You are the DungeonMind Architect Engine. Generate a tangent-space normal map of the previous battlemap (using standard purple/blue/green hues for XYZ vectors). NO text or labels.",
        architectMask: "System Role: You are the DungeonMind Architect Engine. Generate an Architect Mask of the previous battlemap: Pure Black background. Use THICK, SOLID, UN-ALIASED strokes for features: Pure Red (#FF0000) for impassable Walls. Pure Blue (#0000FF) for Doors. Pure Cyan (#00FFFF) for Windows. Do NOT use gradients or soft edges here!",
        illuminationMask: "System Role: You are the DungeonMind Architect Engine. Generate Illumination Data of the previous battlemap: Pure Black background. Pure Yellow (#FFFF00) solid circles representing light source origins (e.g., torches, lanterns, campfires, glowing crystals)."
    };

    const handleCopy = (layerType, text) => {
        navigator.clipboard.writeText(text);
        setCopied(layerType);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleDrop = useCallback((file, type) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setImages(prev => ({ ...prev, [type]: reader.result }));
        };
        reader.readAsDataURL(file);
    }, []);

    const handleApply = async (layerType) => {
        if (!onUpdateAssetLayer || !images[layerType]) return;

        setIsProcessing(prev => ({ ...prev, [layerType]: true }));
        try {
            const scale = mapData?.scale || 20;
            const dataUrl = images[layerType];

            if (layerType === 'baseMap' || layerType === 'heightMap' || layerType === 'normalMap') {
                const url = await storeChunkedMap(dataUrl, `generated_${layerType}_${Date.now()}.png`);
                await onUpdateAssetLayer(layerType, url);
            } else if (layerType === 'architectMask' || layerType === 'illuminationMask') {
                const emptyImg = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                const archUrl = layerType === 'architectMask' ? dataUrl : emptyImg;
                const illUrl = layerType === 'illuminationMask' ? dataUrl : emptyImg;
                
                const features = await scanFeatures(archUrl, illUrl, scale);
                
                if (layerType === 'architectMask') {
                    await onUpdateAssetLayer('architectMask', { walls: features.walls });
                } else if (layerType === 'illuminationMask') {
                    await onUpdateAssetLayer('illuminationMask', { lights: features.lights });
                }
            }
        } catch (err) {
            console.error(`Failed to apply ${layerType}`, err);
            alert(`Failed to apply ${layerType}.`);
        }
        setIsProcessing(prev => ({ ...prev, [layerType]: false }));
    };

    return (
        <div className="pt-6 border-t border-slate-800 space-y-6">
            <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2">Step-by-Step Terrain Generation</h4>
            
            <Section 
                title="1. Base Map" 
                promptText={prompts.baseMap} 
                layerType="baseMap" 
                image={images.baseMap} 
                onDrop={handleDrop} 
                onApply={handleApply} 
                isProcessing={isProcessing.baseMap} 
                copied={copied} 
                onCopy={handleCopy} 
            />
            <Section 
                title="2. Colored Heightmap" 
                promptText={prompts.heightMap} 
                layerType="heightMap" 
                image={images.heightMap} 
                onDrop={handleDrop} 
                onApply={handleApply} 
                isProcessing={isProcessing.heightMap} 
                copied={copied} 
                onCopy={handleCopy} 
            />
            <Section 
                title="3. Normal Map" 
                promptText={prompts.normalMap} 
                layerType="normalMap" 
                image={images.normalMap} 
                onDrop={handleDrop} 
                onApply={handleApply} 
                isProcessing={isProcessing.normalMap} 
                copied={copied} 
                onCopy={handleCopy} 
            />
            <Section 
                title="4. Architect Mask" 
                promptText={prompts.architectMask} 
                layerType="architectMask" 
                image={images.architectMask} 
                onDrop={handleDrop} 
                onApply={handleApply} 
                isProcessing={isProcessing.architectMask} 
                copied={copied} 
                onCopy={handleCopy} 
            />
            <Section 
                title="5. Illumination Data" 
                promptText={prompts.illuminationMask} 
                layerType="illuminationMask" 
                image={images.illuminationMask} 
                onDrop={handleDrop} 
                onApply={handleApply} 
                isProcessing={isProcessing.illuminationMask} 
                copied={copied} 
                onCopy={handleCopy} 
            />
        </div>
    );
}

export default MapGenerator;