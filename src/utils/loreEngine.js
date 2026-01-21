import * as pdfjsLib from 'pdfjs-dist';

// FORCE WORKER: Use a CDN to avoid local bundler issues with Vite
// We explicitly set the version to match the installed package to prevent conflicts
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;

/**
 * 1. INGEST: Converts a raw PDF file into searchable text chunks.
 */
export const ingestPDF = async (file, onProgress) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Load the document
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let chunks = [];
        
        // Loop through pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Join text items
            const pageText = textContent.items.map(item => item.str).join(' ');
            const cleanText = pageText.replace(/\s+/g, ' ').trim();
            
            if (cleanText.length > 50) { 
                chunks.push({
                    id: `page-${i}-${Date.now()}`,
                    source: "PDF",
                    page: i,
                    content: cleanText
                });
            }
            
            if (onProgress) onProgress(Math.round((i / pdf.numPages) * 100));
        }
        
        return chunks;
    } catch (e) {
        console.error("PDF Ingest Error:", e);
        throw new Error("Could not parse PDF. It might be password protected or image-only.");
    }
};

/**
 * 2. SEARCH: Finds relevant chunks.
 */
export const retrieveContext = (query, pdfChunks, journalPages) => {
    if (!query) return [];
    const terms = query.toLowerCase().split(" ").filter(w => w.length > 3);
    const results = [];

    // Search Journal
    Object.values(journalPages || {}).forEach(page => {
        let score = 0;
        const rawContent = page.content ? page.content.replace(/<[^>]*>?/gm, '') : "";
        const lowerContent = rawContent.toLowerCase();
        const lowerTitle = (page.title || "").toLowerCase();
        
        terms.forEach(term => {
            if (lowerTitle.includes(term)) score += 10;
            if (lowerContent.includes(term)) score += 3; 
        });

        if (score > 0) results.push({ source: "Journal", title: page.title, content: rawContent.substring(0, 1500), score });
    });

    // Search PDF
    (pdfChunks || []).forEach(chunk => {
        let score = 0;
        const lower = chunk.content.toLowerCase();
        terms.forEach(term => { if (lower.includes(term)) score += 1; });
        if (score > 0) results.push({ source: `PDF Page ${chunk.page}`, title: `Page ${chunk.page}`, content: chunk.content, score });
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 5);
};

/**
 * 3. PACKER: Splits chunks for Firebase storage.
 */
export const packLore = (chunks) => {
    const volumes = [];
    let currentVolume = [];
    let currentSize = 0;
    
    chunks.forEach(chunk => {
        const size = chunk.content.length + 50; 
        if (currentSize + size > 400000) { // Limit to 400KB to be safe
            volumes.push(currentVolume);
            currentVolume = [];
            currentSize = 0;
        }
        currentVolume.push(chunk);
        currentSize += size;
    });
    
    if (currentVolume.length > 0) volumes.push(currentVolume);
    return volumes;
};
/**
 * 4. PROMPT: Constructs the final prompt for the AI.
 */
export const buildPrompt = (query, context, recentChat = "", isPublic = false) => {
    const journalText = context
        .filter(c => c.source === 'Journal')
        .map(c => `[NOTE: ${c.title}]: ${c.content}`)
        .join("\n\n");

    const pdfText = context
        .filter(c => c.source !== 'Journal')
        .map(c => `[BOOK: ${c.title}]: ${c.content}`)
        .join("\n\n");

    // Dynamic System Instruction based on Privacy
    const roleInstruction = isPublic 
        ? `ROLE: You are an immersive Narrator. 
           SAFETY RULE: You are speaking to PLAYERS. Do NOT reveal secret plot points, stat blocks, or hidden motivations. Describe the scene or answer the question based on what characters would see/know.`
        : `ROLE: You are an expert Dungeon Master Assistant.
           SAFETY RULE: You are speaking to the DM. Reveal ALL secrets, traps, mechanics, and hidden lore. Be explicit and technical.`;

    return `
    ${roleInstruction}
    
    CRITICAL INSTRUCTION: Format with Markdown (### Headers, **Bold**, - Lists).
    HIERARCHY OF TRUTH: Player Notes > Book Source.

    === CONTEXT: RECENT CHAT HISTORY (SHORT-TERM MEMORY) ===
    ${recentChat || "No recent chat."}

    === CONTEXT: PLAYER NOTES (THE TRUTH) ===
    ${journalText || "No relevant notes found."}

    === CONTEXT: CAMPAIGN BOOK (SOURCE MATERIAL) ===
    ${pdfText || "No relevant book sections found."}

    === USER QUESTION ===
    "${query}"
    `;
};