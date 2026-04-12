// --- Phase 3 & 4 Math Helpers ---
function get3DCoord(px, py, width, height, scale, aspect) {
    return {
        x: (px / width - 0.5) * (scale * aspect),
        y: 0,
        z: (py / height - 0.5) * scale
    };
}

function probabilisticHoughTransform(mask, width, height, minLength = 15) {
    const edgePoints = [];
    const edges = new Uint8Array(width * height);
    
    // Edge Detection: Find binary pixels that have an empty neighbor
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            if (mask[i]) {
                if (!mask[i-1] || !mask[i+1] || !mask[i-width] || !mask[i+width]) {
                    edgePoints.push({x, y});
                    edges[i] = 1;
                }
            }
        }
    }

    const numAngles = 180;
    const rhoMax = Math.ceil(Math.sqrt(width * width + height * height));
    const numRhos = rhoMax * 2 + 1;
    const accum = new Int32Array(numAngles * numRhos);

    // Precompute sine and cosine for extreme performance
    const sinT = new Float32Array(numAngles);
    const cosT = new Float32Array(numAngles);
    for (let t = 0; t < numAngles; t++) {
        const rad = (t * Math.PI) / 180;
        sinT[t] = Math.sin(rad);
        cosT[t] = Math.cos(rad);
    }

    // Shuffle points for true probabilistic randomness
    for (let i = edgePoints.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [edgePoints[i], edgePoints[j]] = [edgePoints[j], edgePoints[i]];
    }

    const lines = [];
    for (let i = 0; i < edgePoints.length; i++) {
        const pt = edgePoints[i];
        if (edges[pt.y * width + pt.x] === 0) continue; // Pixel already consumed

        let maxVote = 0;
        let bestT = 0;
        let bestR = 0;

        // Vote for all possible lines intersecting this pixel
        for (let t = 0; t < numAngles; t++) {
            const r = Math.round(pt.x * cosT[t] + pt.y * sinT[t]);
            const idx = t * numRhos + r + rhoMax;
            accum[idx]++;
            if (accum[idx] > maxVote) {
                maxVote = accum[idx];
                bestT = t;
                bestR = r;
            }
        }

        // If a geometric line is found above the noise threshold
        if (maxVote > 15) {
            const dx = -sinT[bestT];
            const dy = cosT[bestT];
            
            let x1 = pt.x, y1 = pt.y;
            let x2 = pt.x, y2 = pt.y;
            
            // Walk the line vector in both directions to find structural endpoints
            let gap = 0;
            while (gap < 5) {
                x1 += dx; y1 += dy;
                const ix = Math.round(x1), iy = Math.round(y1);
                if (ix < 0 || ix >= width || iy < 0 || iy >= height) break;
                if (edges[iy * width + ix]) gap = 0;
                else gap++;
            }
            
            gap = 0;
            while (gap < 5) {
                x2 -= dx; y2 -= dy;
                const ix = Math.round(x2), iy = Math.round(y2);
                if (ix < 0 || ix >= width || iy < 0 || iy >= height) break;
                if (edges[iy * width + ix]) gap = 0;
                else gap++;
            }

            const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (dist >= minLength) {
                lines.push({ x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) });
                
                // Unvote along the generated segment to prevent duplicate detections
                const steps = Math.ceil(dist);
                for (let s = 0; s <= steps; s++) {
                    const cx = Math.round(x1 + (x2 - x1) * (s / steps));
                    const cy = Math.round(y1 + (y2 - y1) * (s / steps));
                    // Clear a 3x3 pixel area around the line to reduce noisy edge fragments
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = cx + dx;
                            const ny = cy + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                if (edges[ny * width + nx]) {
                                    edges[ny * width + nx] = 0;
                                    for (let t = 0; t < numAngles; t++) {
                                        const r = Math.round(nx * cosT[t] + ny * sinT[t]);
                                        accum[t * numRhos + r + rhoMax]--;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return lines;
}

function mergeCollinearLines(lines, maxWallThickness = 35, angleThreshold = 0.15) {
    const merged = [];
    const used = new Array(lines.length).fill(false);
    const angle = (l) => Math.atan2(l.y2 - l.y1, l.x2 - l.x1);
    const dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    
    for (let i = 0; i < lines.length; i++) {
        if (used[i]) continue;
        let current = lines[i];
        used[i] = true;
        let changed = true;
        
        while(changed) {
            changed = false;
            for (let j = i + 1; j < lines.length; j++) {
                if (used[j]) continue;
                const candidate = lines[j];
                
                let aDiff = Math.abs(angle(current) - angle(candidate));
                if (aDiff > Math.PI / 2) aDiff = Math.abs(aDiff - Math.PI);
                
                if (aDiff < angleThreshold) {
                    const d1 = dist(current.x1, current.y1, candidate.x1, candidate.y1);
                    const d2 = dist(current.x1, current.y1, candidate.x2, candidate.y2);
                    const d3 = dist(current.x2, current.y2, candidate.x1, candidate.y1);
                    const d4 = dist(current.x2, current.y2, candidate.x2, candidate.y2);
                    
                    // Check if lines are right next to each other (thick walls) or touch
                    const midX = (candidate.x1 + candidate.x2) / 2;
                    const midY = (candidate.y1 + candidate.y2) / 2;
                    const num = Math.abs((current.y2 - current.y1)*midX - (current.x2 - current.x1)*midY + current.x2*current.y1 - current.y2*current.x1);
                    const perpDist = num / (dist(current.x1, current.y1, current.x2, current.y2) || 1);

                    const minGap = Math.min(d1, d2, d3, d4);
                    
                    // If they are parallel, close perpendicularly, and overlap or touch longitudinally
                    if (perpDist < maxWallThickness && minGap < maxWallThickness * 2) {
                        const pts = [
                            {x: current.x1, y: current.y1}, {x: current.x2, y: current.y2},
                            {x: candidate.x1, y: candidate.y1}, {x: candidate.x2, y: candidate.y2}
                        ];
                        
                        // Find Center of Mass
                        let cx = 0, cy = 0;
                        pts.forEach(p => { cx += p.x; cy += p.y; });
                        cx /= 4; cy /= 4;
                        
                        // Average the angle vectors
                        const dx1 = current.x2 - current.x1;
                        const dy1 = current.y2 - current.y1;
                        const len1 = Math.sqrt(dx1*dx1 + dy1*dy1) || 1;
                        
                        const dx2 = candidate.x2 - candidate.x1;
                        const dy2 = candidate.y2 - candidate.y1;
                        const len2 = Math.sqrt(dx2*dx2 + dy2*dy2) || 1;
                        
                        // Align directions via dot product
                        const dot = (dx1/len1)*(dx2/len2) + (dy1/len1)*(dy2/len2);
                        const sign = dot >= 0 ? 1 : -1;
                        
                        let avgDx = (dx1/len1) + sign * (dx2/len2);
                        let avgDy = (dy1/len1) + sign * (dy2/len2);
                        const avgLen = Math.sqrt(avgDx*avgDx + avgDy*avgDy);
                        
                        if (avgLen > 0) {
                            avgDx /= avgLen;
                            avgDy /= avgLen;
                        } else {
                            avgDx = dx1/len1;
                            avgDy = dy1/len1;
                        }
                        
                        // Project all 4 points onto the average direction vector
                        let minT = Infinity, maxT = -Infinity;
                        pts.forEach(p => {
                            const t = (p.x - cx) * avgDx + (p.y - cy) * avgDy;
                            if (t < minT) minT = t;
                            if (t > maxT) maxT = t;
                        });
                        
                        current = {
                            x1: cx + avgDx * minT,
                            y1: cy + avgDy * minT,
                            x2: cx + avgDx * maxT,
                            y2: cy + avgDy * maxT
                        };
                        
                        used[j] = true;
                        changed = true;
                    }
                }
            }
        }
        merged.push(current);
    }
    return merged;
}

function snapEndpoints(lines, snapRadius = 15) {
    const endpoints = [];
    lines.forEach((l, i) => {
        endpoints.push({x: l.x1, y: l.y1, lineIndex: i, isStart: true});
        endpoints.push({x: l.x2, y: l.y2, lineIndex: i, isStart: false});
    });
    
    // Run two passes to solidify corner clusters
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < endpoints.length; i++) {
            for (let j = i + 1; j < endpoints.length; j++) {
                const p1 = endpoints[i], p2 = endpoints[j];
                const d = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
                if (d > 0 && d < snapRadius) {
                    const avgX = (p1.x + p2.x) / 2, avgY = (p1.y + p2.y) / 2;
                    p1.x = avgX; p1.y = avgY; p2.x = avgX; p2.y = avgY;
                }
            }
        }
    }
    
    const snappedLines = lines.map(() => ({}));
    endpoints.forEach(p => {
        if (p.isStart) { snappedLines[p.lineIndex].x1 = p.x; snappedLines[p.lineIndex].y1 = p.y; } 
        else { snappedLines[p.lineIndex].x2 = p.x; snappedLines[p.lineIndex].y2 = p.y; }
    });
    return snappedLines;
}

function extractLights(mask, width, height, scale, aspect) {
    const visited = new Uint8Array(width * height);
    const lights = {};
    let lightCounter = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] && !visited[idx]) {
                const queue = [[x, y]];
                visited[idx] = 1;
                let sumX = 0, sumY = 0, count = 0;
                let minX = x, maxX = x, minY = y, maxY = y;

                while (queue.length > 0) {
                    const [cx, cy] = queue.shift();
                    sumX += cx; sumY += cy; count++;
                    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = cx + dx, ny = cy + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nIdx = ny * width + nx;
                                if (mask[nIdx] && !visited[nIdx]) {
                                    visited[nIdx] = 1;
                                    queue.push([nx, ny]);
                                }
                            }
                        }
                    }
                }

                if (count > 5) {
                    const coord = get3DCoord(sumX / count, sumY / count, width, height, scale, aspect);
                    const avgDiameterPx = ((maxX - minX) + (maxY - minY)) / 2;
                    const mapUnitsDiameter = avgDiameterPx / (height / scale);
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
    return lights;
}

self.onmessage = function (e) {
    const { type, archData, illData, width, height, scale, aspect } = e.data;

    if (type === 'EXTRACT_FEATURES') {
        console.log(`[Feature Worker] Received data: ${width}x${height} pixels.`);
        
        // --- Phase 2: Color Distance Masking ---
        console.log('[Feature Worker] Generating Color Distance Masks...');
        
        const wallMask = new Uint8Array(width * height);
        const doorMask = new Uint8Array(width * height);
        const windowMask = new Uint8Array(width * height);
        const lightMask = new Uint8Array(width * height);

        // Tolerance squared (a 120 Euclidean color distance roughly equates to 15000)
        // This handles compression artifacts and anti-aliasing perfectly without breaking.
        const TOLERANCE_SQ = 15000; 

        function colorDistSq(r1, g1, b1, r2, g2, b2) {
            return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
        }

        if (archData) {
            for (let i = 0; i < width * height; i++) {
                const idx = i * 4;
                const r = archData[idx];
                const g = archData[idx + 1];
                const b = archData[idx + 2];
                const a = archData[idx + 3];

                // Ignore completely transparent or very dark/background pixels
                if (a < 50 || (r < 50 && g < 50 && b < 50)) continue;

                if (colorDistSq(r, g, b, 255, 0, 0) < TOLERANCE_SQ) {
                    wallMask[i] = 1; // Pure Red
                } else if (colorDistSq(r, g, b, 0, 0, 255) < TOLERANCE_SQ) {
                    doorMask[i] = 1; // Pure Blue
                } else if (colorDistSq(r, g, b, 0, 255, 255) < TOLERANCE_SQ) {
                    windowMask[i] = 1; // Pure Cyan
                }
            }
        }

        if (illData) {
            console.log('[Feature Worker] Generating Color Distance Mask for Illumination...');
            for (let i = 0; i < width * height; i++) {
                const idx = i * 4;
                const r = illData[idx];
                const g = illData[idx + 1];
                const b = illData[idx + 2];
                const a = illData[idx + 3];

                if (a < 50) continue;

                if (colorDistSq(r, g, b, 255, 255, 0) < TOLERANCE_SQ) {
                    lightMask[i] = 1; // Pure Yellow
                }
            }
        }

        console.log('[Feature Worker] Mask generation complete. Ready for Edge Detection and PHT.');
        console.log('[Feature Worker] Running Probabilistic Hough Transform...');
        
        const wallLines = snapEndpoints(mergeCollinearLines(probabilisticHoughTransform(wallMask, width, height)), 25);
        const doorLines = snapEndpoints(mergeCollinearLines(probabilisticHoughTransform(doorMask, width, height)), 25);
        const windowLines = snapEndpoints(mergeCollinearLines(probabilisticHoughTransform(windowMask, width, height)), 25);
        
        let wallCounter = 0;
        const finalWalls = {};
        
        const processSegments = (lines, featureType) => {
            lines.forEach(l => {
                const id = `${featureType}_gen_${wallCounter++}`;
                finalWalls[id] = {
                    id, type: featureType, isOpen: false,
                    points: [get3DCoord(l.x1, l.y1, width, height, scale, aspect), get3DCoord(l.x2, l.y2, width, height, scale, aspect)]
                };
            });
        };

        processSegments(wallLines, 'wall');
        processSegments(doorLines, 'door');
        processSegments(windowLines, 'window');

        console.log(`[Feature Worker] Extracted ${Object.keys(finalWalls).length} geometric vectors!`);
        console.log('[Feature Worker] Extracting Illumination sources...');
        const finalLights = extractLights(lightMask, width, height, scale, aspect);

        self.postMessage({ type: 'FEATURES_EXTRACTED', payload: { walls: finalWalls, lights: finalLights }});
    }
};