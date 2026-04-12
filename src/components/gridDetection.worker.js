// --- Math Helpers for Phase 3 ---
function nextPowerOf2(n) {
    return Math.pow(2, Math.ceil(Math.log2(n)));
}

// In-place 1D Radix-2 Cooley-Tukey FFT
function fft(real, imag) {
    const n = real.length;
    if (n <= 1) return;

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tempReal = real[i];
            let tempImag = imag[i];
            real[i] = real[j];
            imag[i] = imag[j];
            real[j] = tempReal;
            imag[j] = tempImag;
        }
        let m = n >> 1;
        while (j >= m) {
            j -= m;
            m >>= 1;
        }
        j += m;
    }

    // Cooley-Tukey Decimation-in-Time
    for (let size = 2; size <= n; size *= 2) {
        const halfSize = size / 2;
        const angle = -2 * Math.PI / size;
        const wReal = Math.cos(angle);
        const wImag = Math.sin(angle);

        for (let i = 0; i < n; i += size) {
            let uReal = 1;
            let uImag = 0;
            for (let j = 0; j < halfSize; j++) {
                const tReal = uReal * real[i + j + halfSize] - uImag * imag[i + j + halfSize];
                const tImag = uReal * imag[i + j + halfSize] + uImag * real[i + j + halfSize];
                
                real[i + j + halfSize] = real[i + j] - tReal;
                imag[i + j + halfSize] = imag[i + j] - tImag;
                real[i + j] += tReal;
                imag[i + j] += tImag;

                const nextUReal = uReal * wReal - uImag * wImag;
                uImag = uReal * wImag + uImag * wReal;
                uReal = nextUReal;
            }
        }
    }
}

self.onmessage = function (e) {
    const { type, imageData, width, height } = e.data;

    if (type === 'DETECT_GRID') {
        console.log(`[Grid Worker] Received image data: ${width}x${height} pixels.`);
        
        // --- Phase 2: Image Preprocessing ---
        console.log('[Grid Worker] Converting to grayscale...');
        // We only need 1 byte per pixel for grayscale
        const gray = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const r = imageData[i * 4];
            const g = imageData[i * 4 + 1];
            const b = imageData[i * 4 + 2];
            // Standard luminance formula
            gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        }

        console.log('[Grid Worker] Running Sobel edge detection...');
        // Float32 is better here because edge magnitudes can exceed 255
        const edges = new Float32Array(width * height);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = y * width + x;
                
                // Grab the 3x3 pixel neighborhood around the current pixel
                const p00 = gray[i - width - 1]; const p01 = gray[i - width]; const p02 = gray[i - width + 1];
                const p10 = gray[i - 1];         /* center pixel */           const p12 = gray[i + 1];
                const p20 = gray[i + width - 1]; const p21 = gray[i + width]; const p22 = gray[i + width + 1];

                // Sobel kernels for X and Y directions
                const gx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22;
                const gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;
                
                // Calculate edge magnitude
                edges[i] = Math.sqrt(gx * gx + gy * gy);
            }
        }

        // --- Phase 3: 1D Axis Projections ---
        console.log('[Grid Worker] Calculating 1D axis projections...');
        const projX = new Float32Array(width);
        const projY = new Float32Array(height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const val = edges[y * width + x];
                projX[x] += val; // Sums vertically (highlights vertical lines)
                projY[y] += val; // Sums horizontally (highlights horizontal lines)
            }
        }

        console.log('[Grid Worker] Running 1D FFT to find cell size...');
        
        // Analyzes a 1D projection and returns the dominant spatial frequency (cell size)
        function findGridFrequency(projection, minCellSize = 35, maxCellSize = 250) {
            const n = projection.length;
            const paddedN = nextPowerOf2(n);
            
            const real = new Float32Array(paddedN);
            const imag = new Float32Array(paddedN);
            
            // Copy data and apply Hanning window to reduce spectral leakage
            for (let i = 0; i < n; i++) {
                const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
                real[i] = projection[i] * window;
            }
            
            fft(real, imag);
            
            let maxMag = 0;
            let peakIndex = -1;
            
            // We only search for spikes within our expected VTT cell size limits (e.g. 35px to 250px)
            const minFreqIndex = Math.floor(paddedN / maxCellSize);
            const maxFreqIndex = Math.ceil(paddedN / minCellSize);
            
            for (let i = Math.max(1, minFreqIndex); i <= maxFreqIndex && i < paddedN / 2; i++) {
                const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
                if (mag > maxMag) {
                    maxMag = mag;
                    peakIndex = i;
                }
            }
            
            return peakIndex > 0 ? paddedN / peakIndex : null;
        }

        const cellWidth = findGridFrequency(projX);
        const cellHeight = findGridFrequency(projY);
        const predictedCellSize = (cellWidth + cellHeight) / 2; // VTT grids are square, so we average them
        
        console.log(`[Grid Worker] FFT complete! Calculated Cell Size: ~${predictedCellSize.toFixed(2)}px`);

        console.log('[Grid Worker] Running Cross-Correlation to find offsets...');

        // Slides a synthetic comb across the projection to find the offset that maximizes the score
        function findGridOffset(projection, cellSize) {
            let maxScore = -1;
            let bestOffset = 0;
            let sumScores = 0;

            const checkRange = Math.ceil(cellSize);

            for (let offset = 0; offset < checkRange; offset++) {
                let score = 0;
                let count = 0;
                
                // Sample the projection at intervals of cellSize
                for (let i = offset; i < projection.length; i += cellSize) {
                    const idx = Math.round(i);
                    if (idx >= 0 && idx < projection.length) {
                        score += projection[idx];
                        count++;
                    }
                }
                
                // Average the score so smaller offsets don't cheat by squeezing in one extra line
                const avgScore = count > 0 ? score / count : 0;
                
                if (avgScore > maxScore) {
                    maxScore = avgScore;
                    bestOffset = offset;
                }
                sumScores += avgScore;
            }

            const meanScore = sumScores / checkRange;
            // Confidence metric: how sharp is the peak compared to the average noise?
            const confidence = meanScore > 0 ? Math.min(1, (maxScore / meanScore - 1) / 3) : 0;
            
            return { offset: bestOffset, confidence };
        }

        const xResult = findGridOffset(projX, predictedCellSize);
        const yResult = findGridOffset(projY, predictedCellSize);
        
        // Average confidence between X and Y axes
        const finalConfidence = (xResult.confidence + yResult.confidence) / 2;

        console.log(`[Grid Worker] Offset complete! X: ${xResult.offset}px, Y: ${yResult.offset}px (Confidence: ${Math.round(finalConfidence * 100)}%)`);

        self.postMessage({
            type: 'GRID_DETECTED',
            payload: {
                success: true,
                cellSize: predictedCellSize,
                offsetX: xResult.offset,
                offsetY: yResult.offset,
                confidence: finalConfidence,
                imageWidth: width,
                imageHeight: height
            }
        });
    }
};