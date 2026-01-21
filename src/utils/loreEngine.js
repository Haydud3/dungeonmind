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
// START CHANGE: Added 'players', 'userRole', and 'myCharId' to arguments
export const retrieveContext = (query, pdfChunks, journalPages, players, userRole, myCharId) => {
    if (!query) return [];
// END CHANGE
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

    // START CHANGE: Search Character Bios (Respecting Fog of War)
    if (players && Array.isArray(players)) {
        const bioChunks = ingestCharacterBios(players);
        bioChunks.forEach(chunk => {
            // Permission Check
            const isVisible = (userRole === 'dm') || (chunk.ownerId === null) || (String(chunk.ownerId) === String(myCharId));
            
            if (isVisible) {
                let score = 0;
                const lower = chunk.content.toLowerCase();
                terms.forEach(term => { if (lower.includes(term)) score += 5; }); // High relevance
                if (score > 0) results.push({ source: "Character Sheet", title: "Bio Data", content: chunk.content, score });
            }
        });
    }
    // END CHANGE

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
    let cufrrentSize = 0;
    
    chunks.forEach(chunk => {
        const size = chunk.content.length + 50; 
        if (currentSize + size > 400000) {
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

// Option A: Live Chunking Logic
export const ingestCharacterBios = (players) => {
    const bioChunks = [];
    players.forEach(p => {
        if (!p.bio) return;
        const name = p.name;
        // Public Chunks
        if (p.bio.appearance) bioChunks.push({ content: `[Character: ${name}] Appearance: ${p.bio.appearance}`, ownerId: null });
        if (p.bio.traits) bioChunks.push({ content: `[Character: ${name}] Traits: ${p.bio.traits}`, ownerId: null });
        // Private Chunks
        if (p.bio.backstory) bioChunks.push({ content: `[Character: ${name}] Secret Backstory: ${p.bio.backstory}`, ownerId: String(p.id) });
        if (p.bio.notes) bioChunks.push({ content: `[Character: ${name}] Secret Notes: ${p.bio.notes}`, ownerId: String(p.id) });
    });
    return bioChunks;
};

// Generates the Identity Matrix and Party Snapshot for the AI
export const buildCastList = (data) => {
    if (!data.activeUsers || !data.players) return "";
    let castLines = [];
    Object.entries(data.activeUsers).forEach(([uid, email]) => {
        const realName = email.split('@')[0];
        const charId = data.assignments?.[uid];
        const char = data.players.find(p => String(p.id) === String(charId));
        if (char) {
            // Option B: Always inject Name, Race, and Class into the prompt
            castLines.push(`- Player: ${realName} | Character: ${char.name} (${char.race} ${char.class})`);
        }
    });
    if (castLines.length === 0) return "";
    return `\n=== ACTIVE PARTY SNAPSHOT ===\n${castLines.join("\n")}\n\nINSTRUCTION: If a Real Name (alias) is used, attribute the action to their corresponding Character.`;
};
// END CHANGE

/**
 * 4. PROMPT: Constructs the final prompt for the AI.
 */
export const buildPrompt = (query, context, recentChat = "", isPublic = false, castList = "") => {
    const journalText = context
        .filter(c => c.source === 'Journal')
        .map(c => `[NOTE: ${c.title}]: ${c.content}`)
        .join("\n\n");

    const pdfText = context
        .filter(c => c.source !== 'Journal' && c.source !== 'Character Sheet')
        .map(c => `[BOOK: ${c.title}]: ${c.content}`)
        .join("\n\n");

    const bioText = context
        .filter(c => c.source === 'Character Sheet')
        .map(c => `[BIO]: ${c.content}`)
        .join("\n\n");

    // Dynamic System Instruction based on Privacy
    const roleInstruction = isPublic 
        ? `ROLE: You are an immersive Narrator. 
           SAFETY RULE: You are speaking to PLAYERS. Do NOT reveal secret plot points or hidden motivations.`
        : `ROLE: You are an expert Dungeon Master Assistant.
           SAFETY RULE: You are speaking to the DM. Reveal ALL secrets, traps, and hidden lore.`;

    return `
    ${roleInstruction}
    
    CRITICAL INSTRUCTION: Format with Markdown (### Headers, **Bold**, - Lists).
    HIERARCHY OF TRUTH: Player Notes > Character Bios > Book Source.

    ${castList ? castList : ""}

    === CONTEXT: RECENT CHAT HISTORY ===
    ${recentChat || "No recent chat."}

    === CONTEXT: CHARACTER BIOS (DYNAMIC SEARCH) ===
    ${bioText || "No relevant bio info found."}

    === CONTEXT: PLAYER NOTES (THE TRUTH) ===
    ${journalText || "No relevant notes found."}

    === CONTEXT: CAMPAIGN BOOK (SOURCE MATERIAL) ===
    ${pdfText || "No relevant book sections found."}

    === USER QUESTION ===
    "${query}"
    `;
};