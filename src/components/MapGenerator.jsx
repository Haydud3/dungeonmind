import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Icon from './Icon';
import { storeChunkedMap } from '../utils/storageUtils';

const splitImage = (image) => {
    const width = image.width / 2;
    const height = image.height / 2;
    const panelNames = ["Reference Map", "Heightmap (Grayscale)", "Architect Mask", "Illumination Data"];
    const panels = [];

    for (let i = 0; i < 4; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const x = (i % 2) * width;
        const y = Math.floor(i / 2) * height;
        ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
        panels.push({
            name: panelNames[i],
            dataUrl: canvas.toDataURL()
        });
    }
    return panels;
};

// The AI Ingestion Pixel Scanner
const scanFeatures = (architectUrl, illuminationUrl, scale = 20) => {
    return new Promise((resolve) => {
        const archImg = new Image();
        const illImg = new Image();
        let loaded = 0;
        
        const processPixels = () => {
            if (++loaded < 2) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = archImg.width;
            canvas.height = archImg.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            ctx.drawImage(archImg, 0, 0);
            const archData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            ctx.drawImage(illImg, 0, 0);
            const illData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            const walls = {};
            const lights = {};

            // Downsample scan resolution to avoid millions of 3D objects
            const stepX = Math.max(1, Math.floor(canvas.width / 100));
            const stepY = Math.max(1, Math.floor(canvas.height / 100));

            const get3DCoord = (px, py) => ({
                x: (px / canvas.width - 0.5) * scale,
                y: 0,
                z: (py / canvas.height - 0.5) * scale
            });

            // 1. Run-Length Encoding for Horizontal Walls
            for (let y = 0; y < canvas.height; y += stepY) {
                let wallStart = null;
                for (let x = 0; x < canvas.width; x += stepX) {
                    const i = (y * canvas.width + x) * 4;
                    const ar = archData[i], ag = archData[i+1], ab = archData[i+2];
                    const isWall = ar > 200 && ag < 50 && ab < 50;

                    if (isWall) {
                        if (wallStart === null) wallStart = x;
                    } else {
                        if (wallStart !== null) {
                            if (x - wallStart > stepX * 2) {
                                const id = `wall_h_${wallStart}_${y}`;
                                walls[id] = { id, type: 'wall', points: [get3DCoord(wallStart, y), get3DCoord(x, y)] };
                            }
                            wallStart = null;
                        }
                    }
                }
                if (wallStart !== null && canvas.width - wallStart > stepX * 2) {
                    const id = `wall_h_${wallStart}_${y}`;
                    walls[id] = { id, type: 'wall', points: [get3DCoord(wallStart, y), get3DCoord(canvas.width, y)] };
                }
            }

            // 2. Run-Length Encoding for Vertical Walls
            for (let x = 0; x < canvas.width; x += stepX) {
                let wallStart = null;
                for (let y = 0; y < canvas.height; y += stepY) {
                    const i = (y * canvas.width + x) * 4;
                    const ar = archData[i], ag = archData[i+1], ab = archData[i+2];
                    const isWall = ar > 200 && ag < 50 && ab < 50;

                    if (isWall) {
                        if (wallStart === null) wallStart = y;
                    } else {
                        if (wallStart !== null) {
                            if (y - wallStart > stepY * 2) {
                                const id = `wall_v_${x}_${wallStart}`;
                                walls[id] = { id, type: 'wall', points: [get3DCoord(x, wallStart), get3DCoord(x, y)] };
                            }
                            wallStart = null;
                        }
                    }
                }
                if (wallStart !== null && canvas.height - wallStart > stepY * 2) {
                    const id = `wall_v_${x}_${wallStart}`;
                    walls[id] = { id, type: 'wall', points: [get3DCoord(x, wallStart), get3DCoord(x, canvas.height)] };
                }
            }

            // 3. Scan for Doors, Windows, and Lights
            for (let y = 0; y < canvas.height; y += stepY) {
                for (let x = 0; x < canvas.width; x += stepX) {
                    const i = (y * canvas.width + x) * 4;
                    const ar = archData[i], ag = archData[i+1], ab = archData[i+2];
                    const ir = illData[i], ig = illData[i+1], ib = illData[i+2];

                    const coord = get3DCoord(x, y);
                    const id = `node_${x}_${y}`;

                    if (ar < 50 && ag < 50 && ab > 200) {
                        walls[`door_${id}`] = { id: `door_${id}`, type: 'door', isOpen: false, points: [coord, { ...coord, x: coord.x + 1, z: coord.z + 1 }] };
                    } else if (ar < 50 && ag > 200 && ab > 200) {
                        walls[`window_${id}`] = { id: `window_${id}`, type: 'window', points: [coord, { ...coord, x: coord.x + 1, z: coord.z + 1 }] };
                    }

                    if (ir > 200 && ig > 200 && ib < 50) {
                        const gridX = Math.floor(coord.x / 4) * 4;
                        const gridZ = Math.floor(coord.z / 4) * 4;
                        const lightId = `light_${gridX}_${gridZ}`;
                        if (!lights[lightId]) lights[lightId] = { id: lightId, position: { x: gridX, y: 1, z: gridZ }, color: '#fef08a', radius: 15, intensity: 1.5 };
                    }
                }
            }
            
            resolve({ walls, doors: {}, lights: Object.values(lights) });
        };
        archImg.onload = processPixels; illImg.onload = processPixels;
        archImg.src = architectUrl; illImg.src = illuminationUrl;
    });
};

const MapGenerator = ({ onGenerateMap }) => {
    const [panels, setPanels] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [copied, setCopied] = useState(false);

    const promptText = "System Role: You are the DungeonMind Architect Engine. Analyze the provided map and generate a single 2x2 grid image (Master Sheet) with NO text or labels.\nTop-Left: 1:1 Reference of the original map.\nTop-Right: Grayscale topographical heightmap. White is highest elevation, black is lowest.\nBottom-Left (Architect Mask): Black background. Pure Red (#FF0000) for Walls. Pure Blue (#0000FF) for Doors. Pure Cyan (#00FFFF) for Windows.\nBottom-Right (Illumination): Black background. Pure Yellow (#FFFF00) circular blobs for all static light sources.\nConstraint: All pixels must align perfectly across quadrants. Use only 3-pixel wide lines for walls.";

    const handleCopy = () => {
        navigator.clipboard.writeText(promptText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const onDrop = useCallback(acceptedFiles => {
        const file = acceptedFiles[0];
        if (!file) return;

        setIsProcessing(true);
        setPanels([]);
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const generatedPanels = splitImage(img);
                setPanels(generatedPanels);
                setIsProcessing(false);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false
    });

    const handleGenerateMap = async () => {
        if (!onGenerateMap || panels.length < 4) return;

        setIsProcessing(true);
        try {
            const mapPanel = panels.find(p => p.name === "Reference Map");
            const heightPanel = panels.find(p => p.name === "Heightmap (Grayscale)");
            const architectPanel = panels.find(p => p.name === "Architect Mask");
            const illuminationPanel = panels.find(p => p.name === "Illumination Data");

            // Pass to Pixel Scanner to extract vectors
            const features = await scanFeatures(architectPanel.dataUrl, illuminationPanel.dataUrl, 20);

            const mapId = await storeChunkedMap(mapPanel.dataUrl, "generated_map.png");
            const heightId = await storeChunkedMap(heightPanel.dataUrl, "generated_heightmap.png");

            onGenerateMap({
                backgroundUrl: mapId,
                heightmapUrl: heightId,
                features
            });

        } catch (err) {
            console.error("Failed to generate map", err);
            alert("Map generation failed.");
        }
        setIsProcessing(false);
    };

    return (
        <div className="pt-6 border-t border-slate-800 space-y-4">
            <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2">Generate 3D Terrain</h4>
            
            <div>
                <label className="block text-[10px] uppercase font-bold text-purple-400 mb-1">1. Copy AI Prompt</label>
                <div className="bg-slate-950 border border-slate-700 rounded-lg p-3 relative group">
                    <p className="text-[11px] font-mono text-slate-300 pr-8 leading-relaxed max-h-48 overflow-y-auto custom-scroll">{promptText}</p>
                    <button onClick={handleCopy} className="absolute top-2 right-2 bg-slate-800 hover:bg-purple-600 text-white p-1.5 rounded shadow transition-colors" title="Copy Prompt">
                        <Icon name={copied ? "check" : "copy"} size={14} />
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-[10px] uppercase font-bold text-purple-400 mb-1">2. Upload Master Sheet</label>
                <div {...getRootProps()} className={`w-full h-32 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-500 cursor-pointer hover:border-purple-500 hover:text-purple-400 transition-colors ${isDragActive ? 'bg-slate-800 border-purple-500' : ''}`}>
                    <input {...getInputProps()} />
                    {isProcessing ? (
                        <div className="flex flex-col items-center">
                            <Icon name="loader" className="animate-spin mb-2" />
                            <span className="text-xs">Processing...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center text-center px-4">
                            <Icon name="upload-cloud" size={24} className="mb-2" />
                            {isDragActive ?
                                <p className="text-xs">Drop the sheet here...</p> :
                                <p className="text-xs">Drop 2x2 Master Sheet here<br/>or click to select</p>
                            }
                        </div>
                    )}
                </div>
            </div>

            {panels.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-sm font-bold mb-2">Generated Panels</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {panels.map((panel, index) => (
                            <div key={index} className="border border-slate-700 rounded overflow-hidden">
                                <img src={panel.dataUrl} alt={panel.name} className="w-full h-full object-cover" />
                                <p className="text-[10px] bg-slate-800 p-1 text-center font-semibold text-slate-300">{panel.name}</p>
                            </div>
                        ))}
                    </div>
                    <button 
                        onClick={handleGenerateMap} 
                        disabled={isProcessing}
                        className="w-full mt-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded flex items-center justify-center gap-2 shadow-lg"
                    >
                        {isProcessing ? <Icon name="loader" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
                        Apply 3D Terrain
                    </button>
                </div>
            )}
        </div>
    );
}

export default MapGenerator;
