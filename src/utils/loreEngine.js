import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker to use the same version as the installed library
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * 1. INGEST: Converts a raw PDF file into searchable text chunks.
 * We chunk by page to keep context together (e.g., "Page 42: Goblin Stat Block").
 */
export const ingestPDF = async (file, onProgress) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let chunks = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Join all text items on the page into a single string
            const pageText = textContent.items.map(item => item.str).join(' ');
            
            // Basic cleaning: remove excessive whitespace
            const cleanText = pageText.replace(/\s+/g, ' ').trim();
            
            // Only save pages that actually have content (ignore blank pages)
            if (cleanText.length > 50) { 
                chunks.push({
                    id: `page-${i}`,
                    source: "PDF",
                    page: i,
                    content: cleanText
                });
            }
            
            // Report progress back to the UI
            if (onProgress) onProgress(Math.round((i / pdf.numPages) * 100));
        }
        
        return chunks;
    } catch (e) {
        console.error("PDF Ingest Error", e);
        throw new Error("Could not read PDF. Ensure it is a valid text-based PDF.");
    }
};

/**
 * 2. SEARCH: Finds relevant chunks from PDF + Journal based on a query.
 * Uses a simple but effective keyword scoring system.
 */
export const retrieveContext = (query, pdfChunks, journalPages) => {
    if (!query) return [];

    // Split query into keywords (ignore small words like "the", "and")
    const terms = query.toLowerCase().split(" ").filter(w => w.length > 3);
    const results = [];

    // --- A. Search Journal (The Truth - High Priority) ---
    // We scan every journal page. Matches here get a 3x multiplier score.
    Object.values(journalPages).forEach(page => {
        let score = 0;
        // Strip HTML tags from journal content for cleaner searching
        const rawContent = page.content ? page.content.replace(/<[^>]*>?/gm, '') : "";
        const lowerContent = rawContent.toLowerCase();
        const lowerTitle = (page.title || "").toLowerCase();
        
        terms.forEach(term => {
            // Title matches are worth a lot
            if (lowerTitle.includes(term)) score += 10;
            // Body matches
            if (lowerContent.includes(term)) score += 3; 
        });

        if (score > 0) {
            results.push({ 
                source: "Journal", 
                title: page.title, 
                content: rawContent.substring(0, 1500), // Limit length to save tokens
                score 
            });
        }
    });

    // --- B. Search PDF (The Book - Reference) ---
    // We scan the PDF chunks. Matches here are normal score.
    pdfChunks.forEach(chunk => {
        let score = 0;
        const lower = chunk.content.toLowerCase();
        
        terms.forEach(term => {
            if (lower.includes(term)) score += 1;
        });

        if (score > 0) {
            results.push({ 
                source: `PDF Page ${chunk.page}`, 
                title: `Page ${chunk.page}`, 
                content: chunk.content, 
                score 
            });
        }
    });

    // Sort by relevance (Highest Score First) and take top 5 entries
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
};

// START CHANGE: Ensure this function exists and is exported
export const packLore = (chunks) => {
    const volumes = [];
    let currentVolume = [];
    let currentSize = 0;
    
    chunks.forEach(chunk => {
        const size = chunk.content.length + 50; 
        if (currentSize + size > 500000) { 
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
// END CHANGE

/**
 * 3. PROMPT: Constructs the final prompt for the AI.
 */
export const buildPrompt = (query, context, recentChat = "", isPublic = false) => {
    // Separate the sources for clarity
// END CHANGE
    const journalText = context
        .filter(c => c.source === 'Journal')
        .map(c => `[NOTE: ${c.title}]: ${c.content}`)
        .join("\n\n");

    const pdfText = context
        .filter(c => c.source !== 'Journal')
        .map(c => `[BOOK: ${c.title}]: ${c.content}`)
        .join("\n\n");

    // START CHANGE: Dynamic System Instruction based on Privacy
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