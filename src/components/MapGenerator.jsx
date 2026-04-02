import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Icon from './Icon';
import { storeChunkedMap } from '../utils/storageUtils';

// The AI Ingestion Pixel Scanner
const scanFeatures = (architectUrl, illuminationUrl, scale = 20) => {
    return new Promise((resolve) => {
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

            const walls = {};
            const lights = {};

            const stepX = Math.max(1, Math.floor(canvas.width / 150));
            const stepY = Math.max(1, Math.floor(canvas.height / 150));
            const aspect = canvas.width / canvas.height || 1;

            const get3DCoord = (px, py) => ({
                x: (px / canvas.width - 0.5) * (scale * aspect),
                y: 0,
                z: (py / canvas.height - 0.5) * scale
            });

            const getPixelType = (r, g, b) => {
                if (r > 150 && g < 100 && b < 100) return 'wall';
                if (r < 100 && g < 100 && b > 150) return 'door';
                if (r < 100 && g > 150 && b > 150) return 'window';
                return null;
            };

            const cols = Math.ceil(canvas.width / stepX);
            const rows = Math.ceil(canvas.height / stepY);

            if (archData) {
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

                const extractComponents = (targetType) => {
                    const visited = Array(rows).fill(null).map(() => Array(cols).fill(false));
                    const components = [];
                    for (let y = 0; y < rows; y++) {
                        for (let x = 0; x < cols; x++) {
                            if (grid[y][x] === targetType && !visited[y][x]) {
                                const comp = [];
                                const queue = [[x, y]];
                                visited[y][x] = true;
                                while(queue.length > 0) {
                                    const [cx, cy] = queue.shift();
                                    comp.push([cx, cy]);
                                    for(let dy=-1; dy<=1; dy++){
                                        for(let dx=-1; dx<=1; dx++){
                                            if(dx===0 && dy===0) continue;
                                            const nx=cx+dx, ny=cy+dy;
                                            if(nx>=0 && nx<cols && ny>=0 && ny<rows && grid[ny][nx]===targetType && !visited[ny][nx]){
                                                visited[ny][nx]=true;
                                                queue.push([nx, ny]);
                                            }
                                        }
                                    }
                                }
                                components.push(comp);
                            }
                        }
                    }
                    return components;
                };

                const getLineOfBestFit = (points) => {
                    if (points.length === 0) return null;
                    if (points.length === 1) return [points[0], points[0]];
                    let sumX = 0, sumY = 0;
                    points.forEach(([x, y]) => { sumX += x; sumY += y; });
                    const meanX = sumX / points.length;
                    const meanY = sumY / points.length;
                    let sumXX = 0, sumYY = 0, sumXY = 0;
                    points.forEach(([x, y]) => {
                        const dx = x - meanX, dy = y - meanY;
                        sumXX += dx * dx; sumYY += dy * dy; sumXY += dx * dy;
                    });
                    // Handling pure horizontal/vertical
                    let theta = 0.5 * Math.atan2(2 * sumXY, sumXX - sumYY);
                    const vx = Math.cos(theta), vy = Math.sin(theta);
                    let minT = Infinity, maxT = -Infinity;
                    points.forEach(([x, y]) => {
                        const t = (x - meanX) * vx + (y - meanY) * vy;
                        minT = Math.min(minT, t); maxT = Math.max(maxT, t);
                    });
                    return [
                        [meanX + vx * minT, meanY + vy * minT],
                        [meanX + vx * maxT, meanY + vy * maxT]
                    ];
                };

                ['door', 'window'].forEach(type => {
                    const comps = extractComponents(type);
                    comps.forEach(comp => {
                        if (comp.length < 2) return;
                        const line = getLineOfBestFit(comp);
                        if (!line) return;
                        const id = `${type}_gen_${wallCounter++}`;
                        const px1 = Math.min(line[0][0] * stepX, canvas.width);
                        const py1 = Math.min(line[0][1] * stepY, canvas.height);
                        const px2 = Math.min(line[1][0] * stepX, canvas.width);
                        const py2 = Math.min(line[1][1] * stepY, canvas.height);
                        walls[id] = { id, type, points: [get3DCoord(px1, py1), get3DCoord(px2, py2)], isOpen: false };
                    });
                });

                // --- 2. Morphological Thinning (Zhang-Suen) for Walls ---
                const wallGrid = Array(rows).fill(null).map((_, y) => Array(cols).fill(null).map((_, x) => grid[y][x] === 'wall'));
                let hasChanged = true;
                const getNeighbors = (x, y) => {
                    const p2 = y > 0 ? wallGrid[y - 1][x] : false;
                    const p3 = y > 0 && x < cols - 1 ? wallGrid[y - 1][x + 1] : false;
                    const p4 = x < cols - 1 ? wallGrid[y][x + 1] : false;
                    const p5 = y < rows - 1 && x < cols - 1 ? wallGrid[y + 1][x + 1] : false;
                    const p6 = y < rows - 1 ? wallGrid[y + 1][x] : false;
                    const p7 = y < rows - 1 && x > 0 ? wallGrid[y + 1][x - 1] : false;
                    const p8 = x > 0 ? wallGrid[y][x - 1] : false;
                    const p9 = y > 0 && x > 0 ? wallGrid[y - 1][x - 1] : false;
                    return [p2, p3, p4, p5, p6, p7, p8, p9];
                };
                const getTransitions = (neighbors) => {
                    let count = 0;
                    for (let i = 0; i < 8; i++) { if (!neighbors[i] && neighbors[(i + 1) % 8]) count++; }
                    return count;
                };

                while (hasChanged) {
                    hasChanged = false;
                    const toDelete1 = [];
                    for (let y = 0; y < rows; y++) {
                        for (let x = 0; x < cols; x++) {
                            if (!wallGrid[y][x]) continue;
                            const n = getNeighbors(x, y);
                            const B = n.filter(Boolean).length;
                            const A = getTransitions(n);
                            if (B >= 2 && B <= 6 && A === 1 && (!n[0] || !n[2] || !n[4]) && (!n[2] || !n[4] || !n[6])) toDelete1.push([x, y]);
                        }
                    }
                    toDelete1.forEach(([x, y]) => { wallGrid[y][x] = false; hasChanged = true; });

                    const toDelete2 = [];
                    for (let y = 0; y < rows; y++) {
                        for (let x = 0; x < cols; x++) {
                            if (!wallGrid[y][x]) continue;
                            const n = getNeighbors(x, y);
                            const B = n.filter(Boolean).length;
                            const A = getTransitions(n);
                            if (B >= 2 && B <= 6 && A === 1 && (!n[0] || !n[2] || !n[6]) && (!n[0] || !n[4] || !n[6])) toDelete2.push([x, y]);
                        }
                    }
                    toDelete2.forEach(([x, y]) => { wallGrid[y][x] = false; hasChanged = true; });
                }

                // --- 3. Path Extraction ---
                const visited = Array(rows).fill(null).map(() => Array(cols).fill(false));
                const paths = [];
                const getWallNeighbors = (x, y) => {
                    const n = [];
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && wallGrid[ny][nx]) n.push([nx, ny]);
                        }
                    }
                    return n;
                };

                // Find endpoints first
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        if (!wallGrid[y][x] || visited[y][x]) continue;
                        const n = getWallNeighbors(x, y);
                        if (n.length === 1 || n.length === 0) {
                            let curr = [x, y];
                            const path = [curr];
                            visited[curr[1]][curr[0]] = true;
                            while (true) {
                                const unvisitedNeighbors = getWallNeighbors(curr[0], curr[1]).filter(([nx, ny]) => !visited[ny][nx]);
                                if (unvisitedNeighbors.length === 0) break;
                                const next = unvisitedNeighbors[0];
                                path.push(next);
                                visited[next[1]][next[0]] = true;
                                curr = next;
                            }
                            paths.push(path);
                        }
                    }
                }
                
                // Then closed loops
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        if (!wallGrid[y][x] || visited[y][x]) continue;
                        let curr = [x, y];
                        const path = [curr];
                        visited[curr[1]][curr[0]] = true;
                        while (true) {
                            const unvisitedNeighbors = getWallNeighbors(curr[0], curr[1]).filter(([nx, ny]) => !visited[ny][nx]);
                            if (unvisitedNeighbors.length === 0) {
                                const allN = getWallNeighbors(curr[0], curr[1]);
                                if (allN.some(([nx, ny]) => nx === path[0][0] && ny === path[0][1])) path.push(path[0]);
                                break;
                            }
                            const next = unvisitedNeighbors[0];
                            path.push(next);
                            visited[next[1]][next[0]] = true;
                            curr = next;
                        }
                        paths.push(path);
                    }
                }

                // --- 4. Ramer-Douglas-Peucker Simplification ---
                const getSqSegDist = (p, p1, p2) => {
                    let x = p1[0], y = p1[1], dx = p2[0]-x, dy = p2[1]-y;
                    if (dx !== 0 || dy !== 0) {
                        const t = ((p[0]-x)*dx + (p[1]-y)*dy) / (dx*dx + dy*dy);
                        if (t > 1) { x = p2[0]; y = p2[1]; } else if (t > 0) { x += dx*t; y += dy*t; }
                    }
                    dx = p[0]-x; dy = p[1]-y;
                    return dx*dx + dy*dy;
                };

                const simplifyDPStep = (points, first, last, sqTolerance, simplified) => {
                    let maxSqDist = sqTolerance, index = -1;
                    for (let i = first + 1; i < last; i++) {
                        const sqDist = getSqSegDist(points[i], points[first], points[last]);
                        if (sqDist > maxSqDist) { index = i; maxSqDist = sqDist; }
                    }
                    if (index > -1) {
                        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
                        simplified.push(points[index]);
                        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
                    }
                };

                const simplifyDP = (points, tolerance) => {
                    if (points.length <= 2) return points;
                    const sqTolerance = tolerance * tolerance;
                    const simplified = [points[0]];
                    simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
                    simplified.push(points[points.length - 1]);
                    return simplified;
                };

                paths.forEach(path => {
                    if (path.length < 2) return;
                    const simplified = simplifyDP(path, 1.5); // 1.5 grid cells tolerance for smoothing
                    if (simplified.length < 2) return;
                    
                    const id = `wall_gen_${wallCounter++}`;
                    const mappedPoints = simplified.map(([x, y]) => {
                        const px = Math.min(x * stepX, canvas.width);
                        const py = Math.min(y * stepY, canvas.height);
                        return get3DCoord(px, py);
                    });
                    walls[id] = { id, type: 'wall', points: mappedPoints };
                });
            }

            if (illData) {
                const gridW = Math.ceil(canvas.width / stepX);
                const gridH = Math.ceil(canvas.height / stepY);
                const isLight = new Array(gridW * gridH).fill(false);
                const visited = new Array(gridW * gridH).fill(false);

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

                            if (count > 2) {
                                const px = (sumX / count) * stepX;
                                const py = (sumY / count) * stepY;
                                const coord = get3DCoord(px, py);
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
            }
            
            resolve({ walls, lights: Object.values(lights) });
        };
        
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
        architectMask: null,
        illuminationMask: null
    });
    const [isProcessing, setIsProcessing] = useState({});
    const [copied, setCopied] = useState(null);

    const prompts = {
        baseMap: "System Role: You are the DungeonMind Architect Engine. Generate a detailed top-down TTRPG battlemap. NO text or labels.",
        heightMap: "System Role: You are the DungeonMind Architect Engine. Generate a colored topographical heightmap of the previous battlemap (use colors to represent elevation). NO text or labels.",
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

            if (layerType === 'baseMap' || layerType === 'heightMap') {
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
                title="3. Architect Mask" 
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
                title="4. Illumination Data" 
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