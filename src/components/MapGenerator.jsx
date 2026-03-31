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
            const stepX = Math.max(1, Math.floor(canvas.width / 150));
            const stepY = Math.max(1, Math.floor(canvas.height / 150));
            
            // FIX 1: Aspect Ratio Scaling
            const aspect = canvas.width / canvas.height || 1;

            const get3DCoord = (px, py) => ({
                x: (px / canvas.width - 0.5) * (scale * aspect),
                y: 0,
                z: (py / canvas.height - 0.5) * scale
            });

            // Tolerant Color Classifier to handle AI anti-aliasing & compression
            const getPixelType = (r, g, b) => {
                if (r > 150 && g < 100 && b < 100) return 'wall';   // Red
                if (r < 100 && g < 100 && b > 150) return 'door';   // Blue
                if (r < 100 && g > 150 && b > 150) return 'window'; // Cyan
                return null;
            };

            // 1. Contour Tracing (Marching Squares) for Features (Walls, Doors, Windows)
            // This traces the OUTSIDE edges of AI-generated thick lines so we can capture
            // curves, diagonals, and organic shapes perfectly without cross-hatching inside.
            const cols = Math.ceil(canvas.width / stepX);
            const rows = Math.ceil(canvas.height / stepY);
            const grid = Array(rows).fill(null).map(() => Array(cols).fill(null));

            for (let gy = 0; gy < rows; gy++) {
                for (let gx = 0; gx < cols; gx++) {
                    const x = Math.min(gx * stepX, canvas.width - 1);
                    const y = Math.min(gy * stepY, canvas.height - 1);
                    const i = (y * canvas.width + x) * 4;
                    grid[gy][gx] = getPixelType(archData[i], archData[i+1], archData[i+2]);
                }
            }

            let wallCounter = 0;
            const addSegment = (type, x1, y1, x2, y2) => {
                if (x1 === x2 && y1 === y2) return;
                const id = `${type}_gen_${wallCounter++}`;
                const px1 = Math.min(x1 * stepX, canvas.width);
                const py1 = Math.min(y1 * stepY, canvas.height);
                const px2 = Math.min(x2 * stepX, canvas.width);
                const py2 = Math.min(y2 * stepY, canvas.height);
                walls[id] = { id, type, points: [get3DCoord(px1, py1), get3DCoord(px2, py2)] };
                if (type === 'door' || type === 'window') walls[id].isOpen = false;
            };

            const getType = (x, y) => (x >= 0 && x < cols && y >= 0 && y < rows) ? grid[y][x] : null;
            const featureTypes = ['wall', 'door', 'window'];

            for (const t of featureTypes) {
                // Horizontal boundaries
                for (let gy = 0; gy <= rows; gy++) {
                    let startX = null;
                    let currentDir = null; // 1 for top boundary, -1 for bottom boundary

                    const commit = (x) => {
                        if (startX !== null) addSegment(t, startX, gy, x, gy);
                        startX = null;
                        currentDir = null;
                    };

                    for (let gx = 0; gx <= cols; gx++) {
                        const isTBelow = getType(gx, gy) === t;
                        const isTAbove = getType(gx, gy - 1) === t;
                        
                        let edgeDir = null;
                        if (isTBelow && !isTAbove) edgeDir = 1;
                        else if (isTAbove && !isTBelow) edgeDir = -1;

                        if (edgeDir !== currentDir) {
                            commit(gx);
                            if (edgeDir) {
                                startX = gx;
                                currentDir = edgeDir;
                            }
                        }
                    }
                    commit(cols);
                }

                // Vertical boundaries
                for (let gx = 0; gx <= cols; gx++) {
                    let startY = null;
                    let currentDir = null;

                    const commit = (y) => {
                        if (startY !== null) addSegment(t, gx, startY, gx, y);
                        startY = null;
                        currentDir = null;
                    };

                    for (let gy = 0; gy <= rows; gy++) {
                        const isTRight = getType(gx, gy) === t;
                        const isTLeft = getType(gx - 1, gy) === t;

                        let edgeDir = null;
                        if (isTRight && !isTLeft) edgeDir = 1;
                        else if (isTLeft && !isTRight) edgeDir = -1;

                        if (edgeDir !== currentDir) {
                            commit(gy);
                            if (edgeDir) {
                                startY = gy;
                                currentDir = edgeDir;
                            }
                        }
                    }
                    commit(rows);
                }
            }

            // 3. Scan for Light Sources (Center of Mass Blob Detection)
            const gridW = Math.ceil(canvas.width / stepX);
            const gridH = Math.ceil(canvas.height / stepY);
            const isLight = new Array(gridW * gridH).fill(false);
            const visited = new Array(gridW * gridH).fill(false);

            // Pass 1: Build downsampled boolean grid of light pixels
            for (let gy = 0; gy < gridH; gy++) {
                for (let gx = 0; gx < gridW; gx++) {
                    const x = Math.min(gx * stepX, canvas.width - 1);
                    const y = Math.min(gy * stepY, canvas.height - 1);
                    const i = (y * canvas.width + x) * 4;
                    if (illData[i] > 150 && illData[i+1] > 150 && illData[i+2] < 100) {
                        isLight[gy * gridW + gx] = true;
                    }
                }
            }

            // Pass 2: Flood Fill (BFS) to find connected blobs
            let lightCounter = 0;
            for (let gy = 0; gy < gridH; gy++) {
                for (let gx = 0; gx < gridW; gx++) {
                    const idx = gy * gridW + gx;
                    if (isLight[idx] && !visited[idx]) {
                        const queue = [[gx, gy]];
                        visited[idx] = true;

                        let sumX = 0, sumY = 0, count = 0;
                        let minX = gx, maxX = gx, minY = gy, maxY = gy;

                        while (queue.length > 0) {
                            const [cx, cy] = queue.shift();
                            sumX += cx; sumY += cy; count++;
                            minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                            minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);

                            // Check 8-way neighbors
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    if (dx === 0 && dy === 0) continue;
                                    const nx = cx + dx, ny = cy + dy;
                                    if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                                        const nIdx = ny * gridW + nx;
                                        if (isLight[nIdx] && !visited[nIdx]) {
                                            visited[nIdx] = true;
                                            queue.push([nx, ny]);
                                        }
                                    }
                                }
                            }
                        }

                        // Ignore tiny noise artifacts (e.g., 1-2 stray pixels)
                        if (count > 2) {
                            const px = (sumX / count) * stepX;
                            const py = (sumY / count) * stepY;
                            const coord = get3DCoord(px, py);

                            // Dynamic Radius: Calculate size in map units, multiply by 5 for feet
                            const avgDiameterPx = ((maxX - minX) * stepX + (maxY - minY) * stepY) / 2;
                            const mapUnitsDiameter = avgDiameterPx / (canvas.height / scale);
                            const radiusFt = Math.max(10, Math.min(100, Math.round((mapUnitsDiameter / 2) * 5)));

                            const lightId = `light_gen_${lightCounter++}`;
                            lights[lightId] = { 
                                id: lightId, 
                                position: { x: coord.x, y: 1, z: coord.z }, 
                                color: '#fef08a', 
                                radius: radiusFt, 
                                intensity: 1.5 
                            };
                        }
                    }
                }
            }
            
            resolve({ walls, lights: Object.values(lights) });
        };
        archImg.onload = processPixels; illImg.onload = processPixels;
        archImg.src = architectUrl; illImg.src = illuminationUrl;
    });
};

const MapGenerator = ({ onGenerateMap, mapData }) => {
    const [panels, setPanels] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [copied, setCopied] = useState(false);

    const promptText = "System Role: You are the DungeonMind Architect Engine. Generate a single 2x2 grid image (Master Sheet) representing a tactical TTRPG battlemap. NO text or labels.\nTop-Left: Detailed top-down reference map.\nTop-Right: Grayscale topographical heightmap (White=high, Black=low).\nBottom-Left (Architect Mask): Pure Black background. Use THICK, SOLID, UN-ALIASED strokes for features: Pure Red (#FF0000) for impassable Walls. Pure Blue (#0000FF) for Doors. Pure Cyan (#00FFFF) for Windows. Do NOT use gradients or soft edges here!\nBottom-Right (Illumination): Pure Black background. Pure Yellow (#FFFF00) solid circles representing light source origins (e.g., torches, lanterns, campfires, glowing crystals).\nConstraints: All 4 quadrants must be exactly the same size and perfectly aligned.";

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
            const scale = mapData?.scale || 20;
            const features = await scanFeatures(architectPanel.dataUrl, illuminationPanel.dataUrl, scale);

            const mapId = await storeChunkedMap(mapPanel.dataUrl, `generated_map_${Date.now()}.png`);
            const heightId = await storeChunkedMap(heightPanel.dataUrl, `generated_heightmap_${Date.now()}.png`);

            onGenerateMap({
                backgroundUrl: mapId,
                heightmapUrl: heightId,
                features,
                prompt: promptText
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
