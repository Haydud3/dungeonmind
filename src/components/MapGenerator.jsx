import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Icon from './Icon';
import { storeChunkedMap } from '../utils/storageUtils';

import { compressImage } from '../utils/imageCompressor';
import { useToast } from './ToastProvider';
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

const MapGenerator = ({ asset, onUpdateLayer, mapData, importTarget }) => {
    const toast = useToast();
    const [images, setImages] = useState({
        baseMap: null,
        heightMap: null,
        normalMap: null,
        architectMask: null,
        illuminationMask: null,
        materialMask: null,
    });
    const [isProcessing, setIsProcessing] = useState({});
    const [copied, setCopied] = useState(null);

    const targetName = importTarget ? importTarget.name : (asset?.name || 'the environment');
    const prompts = {
        baseMap: `System Role: You are the DungeonMind Architect Engine. Generate a detailed top-down TTRPG battlemap of ${targetName}. NO text or labels.`,
        heightMap: `System Role: You are the DungeonMind Architect Engine. First, perfectly visualize how the previous 2D battlemap of ${targetName} would look as a physical 3D environment with depth and verticality. Then, generate a clean, colored topographical heightmap of this 3D structure. Use smooth, continuous color gradients to represent elevation (darker for low ground, lighter for high structures). CRITICAL AVOIDANCE: Do NOT add any noise, textures, patterns, or 'dots'. The gradients MUST be perfectly smooth to prevent jagged spikes when rendered in 3D. NO text or labels.`,
        normalMap: "System Role: You are the DungeonMind Architect Engine. Generate a perfect orthographic, top-down tangent-space normal map of the provided battlemap. The base, flat areas (such as floors and water surfaces) must be represented as neutral, non-sloping (128, 128, 255) cyan/magenta.\n\nSurface Encoding Logic:\n- Red Channel (X-axis slope): Gradients from left (0) to right (255), where '0' is a downward slope to the left (cyan) and '255' is a downward slope to the right (red).\n- Green Channel (Y-axis slope): Gradients from top (0) to bottom (255), where '0' is an upward slope (magenta) and '255' is a downward slope (green).\n- Blue Channel (Z-axis direction): A constant (128) on flat areas, increasing to (255) for all raised surfaces.\n\nDetailed Feature Mapping:\n- Vertical Structures (Walls, Buildings, Cliffs): Must have raised Z-values (255) with sharp, crisp color-shifts at the edges to show steep slope directions: cyan on left edges, red on right, magenta on top, and green on bottom.\n- Ground Textures (Tiles, Planks): The main surfaces must remain mostly neutral but have fine, narrow color-shifts at the seams/cracks to represent recessed grooves.\n- Natural Terrain (Dirt, Rock): Show micro-bumpiness (slight color variances) across the surface.\n- Organic Objects (Trees, Boulders, Props): Simplify complex geometry. Treat round objects as smooth, raised domes, with symmetrical gradients: magenta (top) fading to green (bottom) and cyan (left) fading to red (right).\n- Elevation Changes: Drop-offs, ramps, and stairs must have dramatic normal map gradients from the high edge to the low level. NO text or labels.",
        architectMask: "System Role: You are a Virtual Tabletop (VTT) Line-of-Sight engine. Generate a vision-blocking Architect Mask. This mask will be scanned by a script to extract 2D collision geometry for dynamic lighting and fog of war. Pure Black background. Draw THIN, 1-PIXEL solid lines representing ONLY the absolute boundaries that block a player's vision (walls, heavy doors, closed rooms, cave boundaries). CRITICAL INSTRUCTIONS: 1. For thick walls, do NOT outline both the inner and outer edges; instead, draw exactly ONE single line directly down the center of the wall's mass. 2. Ignore all scatter terrain that doesn't fully block tall vision (tables, wagons, barrels, bushes, trees, statues). Use Pure Red (#FF0000) for vision-blocking walls, Pure Blue (#0000FF) for doors, and Pure Cyan (#00FFFF) for windows. The result must be a clean, minimalist neon wireframe. Precision is required for the engine to parse the lines.",
        illuminationMask: "System Role: You are the DungeonMind Architect Engine. Generate Illumination Data of the battlemap. This mask will be scanned by a script to place interactive 3D point lights in the game engine. Pure Black background. Pure Yellow (#FFFF00) solid circles representing EXACTLY the origins of light sources (e.g., torches, lanterns, campfires, glowing crystals). Do NOT draw light gradients or ambient light, ONLY solid yellow circles at the exact source emitter.",
        materialMask: "System Role: You are the DungeonMind Architect Engine. Generate an RGB Material Mask for this battlemap to drive interactive 3D shader effects. Pure Black background. Paint specific features using ONLY these solid, pure colors: Pure Green (#00FF00) for short, flat vegetation like grass or wheat fields. CRITICAL: Do NOT paint tall objects like trees or large bushes green. Pure Magenta (#FF00FF) for tall vegetation like tree canopies, leaves, and large bushes. Pure Blue (#0000FF) for water/liquids/acid. Pure Red (#FF0000) for emissive/glowing objects like lava, fire, or magic runes. Pure Yellow (#FFFF00) for slippery/shiny surfaces like ice or polished glass. Do not use gradients or anti-aliasing; use flat blocks of color."
    };

    const handleCopy = (layerType, text) => {
        navigator.clipboard.writeText(text);
        setCopied(layerType);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleDrop = (acceptedFiles, layerType) => {
        const file = acceptedFiles[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setImages(prev => ({ ...prev, [layerType]: e.target.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleApply = async (layerType) => {
        if (!onUpdateLayer || !images[layerType]) return;
        setIsProcessing(prev => ({ ...prev, [layerType]: true }));
        try {
            const scale = mapData?.scale || 20;
            const dataUrl = images[layerType];

            if (['baseMap', 'heightMap', 'normalMap', 'materialMask'].includes(layerType)) {
                let finalDataUrl = dataUrl;
                
                if (layerType === 'baseMap') {
                    // Use lossy JPEG compression for the visual base map to save space
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    finalDataUrl = await compressImage(blob, 2048, 0.9);
                } else {
                    try {
                        // Losslessly resize 3D data maps (Height/Normal) as PNGs to prevent 
                        // database crashes while perfectly preserving their smooth gradients
                        const res = await fetch(dataUrl);
                        const blob = await res.blob();
                        const bitmap = await createImageBitmap(blob);
                        const canvas = document.createElement('canvas');
                        let w = bitmap.width, h = bitmap.height;
                        const maxDim = 2048; // Max safe resolution for WebGL displacement
                        if (w > maxDim || h > maxDim) {
                            const ratio = Math.min(maxDim / w, maxDim / h);
                            w = Math.round(w * ratio); h = Math.round(h * ratio);
                        }
                        canvas.width = w; canvas.height = h;
                        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
                        finalDataUrl = canvas.toDataURL('image/png'); // Lossless PNG
                    } catch (e) {
                        console.warn("Failed to losslessly resize 3D map, falling back to raw.", e);
                    }
                }
                
                const url = await storeChunkedMap(finalDataUrl, `${asset.name}_${layerType}_${Date.now()}.png`);
                await onUpdateLayer(layerType, url);
            } else {
                const emptyImg = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                const archUrl = layerType === 'architectMask' ? dataUrl : emptyImg;
                const illUrl = layerType === 'illuminationMask' ? dataUrl : emptyImg;
                const features = await scanFeatures(archUrl, illUrl, scale);
                
                if (layerType === 'architectMask') {
                    await onUpdateLayer('architectMask', { walls: features.walls });
                } else if (layerType === 'illuminationMask') {
                    await onUpdateLayer('illuminationMask', { lights: features.lights });
                }
            }
            
            // Clear the preview image once successfully applied
            setImages(prev => ({ ...prev, [layerType]: null }));
            toast(`Successfully applied ${layerType}!`, "success");
        } catch (err) {
            console.error(`Failed to apply ${layerType}`, err);
            toast(`Failed to apply ${layerType}.`, "error");
        }
        setIsProcessing(prev => ({ ...prev, [layerType]: false }));
    };

    const LayerSection = ({ type, title, description }) => {
        const { getRootProps, getInputProps, isDragActive } = useDropzone({
            onDrop: (files) => handleDrop(files, type),
            accept: { 'image/*': [] },
            maxFiles: 1
        });

        let hasLayer = false;
        if (type === 'baseMap') hasLayer = !!asset.generatedMapUrl || !!asset.url;
        if (type === 'heightMap') hasLayer = !!asset.generatedHeightmapUrl;
        if (type === 'normalMap') hasLayer = !!asset.generatedNormalMapUrl;
        if (type === 'architectMask') hasLayer = !!asset.generatedFeatures?.walls && Object.keys(asset.generatedFeatures.walls).length > 0;
        if (type === 'illuminationMask') hasLayer = !!asset.generatedFeatures?.lights && Object.keys(asset.generatedFeatures.lights).length > 0;
        if (type === 'materialMask') hasLayer = !!asset.materialMaskUrl || !!asset.generatedMaterialMaskUrl;

        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-slate-200 flex items-center gap-2">
                            {title}
                            {hasLayer && <Icon name="check-circle" size={14} className="text-green-500" />}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">{description}</p>
                    </div>
                </div>
                
                <div className="p-4 space-y-4">
                    <div className="relative">
                        <textarea 
                            readOnly 
                            value={prompts[type]} 
                            className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-xs text-slate-300 font-mono resize-none h-24 focus:outline-none focus:border-amber-500"
                        />
                        <button 
                            onClick={() => handleCopy(type, prompts[type])}
                            className={`absolute bottom-3 right-3 px-3 py-1.5 rounded text-xs font-bold transition-all shadow ${copied === type ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                        >
                            {copied === type ? '✓ Copied' : 'Copy Prompt'}
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <div 
                            {...getRootProps()} 
                            className={`flex-1 border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors min-h-[120px] ${
                                isDragActive ? 'border-amber-500 bg-amber-900/20' : 'border-slate-600 hover:border-slate-400 bg-slate-900/50'
                            }`}
                        >
                            <input {...getInputProps()} />
                            {images[type] ? (
                                <img src={images[type]} alt="Preview" className="max-h-32 object-contain rounded mb-2 shadow" />
                            ) : (
                                <Icon name="image" size={32} className="text-slate-500 mb-2" />
                            )}
                            <p className="text-sm text-slate-400 font-bold">
                                {images[type] ? "Click or drag to replace image" : "Drop AI generated image here"}
                            </p>
                        </div>
                        
                        <div className="sm:w-32 flex flex-col justify-end">
                            <button 
                                onClick={() => handleApply(type)}
                                disabled={!images[type] || isProcessing[type]}
                                className="w-full h-full sm:h-auto bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 sm:py-3 rounded-lg shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                {isProcessing[type] ? <Icon name="loader" size={18} className="animate-spin" /> : <Icon name="sparkles" size={18} />}
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-6 space-y-6 text-white pb-20">
            <div>
                <h2 className="text-2xl font-bold text-amber-500 mb-2 flex items-center gap-2">
                    <Icon name="wand-2" size={28} /> AI Map Generator
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                    Copy the system prompts below into your favorite AI Image Generator (like ChatGPT, Midjourney, or DALL-E). Drag and drop the results below to assemble a full 3D map layer-by-layer.
                </p>
            </div>

            <div className="space-y-4">
                <LayerSection 
                    type="baseMap" 
                    title="1. Base Map (Albedo)" 
                    description="The primary top-down visual texture of the map." 
                />
                <LayerSection 
                    type="heightMap" 
                    title="2. Heightmap (Displacement)" 
                    description="Grayscale image where white is high elevation and black is low." 
                />
                <LayerSection 
                    type="normalMap" 
                    title="3. Normal Map" 
                    description="Tangent-space vector map used for dynamic 3D lighting calculation." 
                />
                <LayerSection 
                    type="architectMask" 
                    title="4. Architect Mask (Walls, Doors, Windows)" 
                    description="Extracts physical 3D walls and boundaries automatically." 
                />
                <LayerSection 
                    type="illuminationMask" 
                    title="5. Illumination Data" 
                    description="Identifies the position and radius of built-in light sources." 
                />
                <LayerSection 
                    type="materialMask" 
                    title="6. Material Mask (RGB)" 
                    description="Drives animated grass, tree canopies, flowing water, and pulsing lava." 
                />
            </div>
        </div>
    );
};

export default MapGenerator;