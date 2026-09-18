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
        const cleanFileName = (file?.name || "Campaign Tome").replace(/\.[^/.]+$/, "");
        const docId = `tome_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
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
            
            if (cleanText.length > 30) { 
                chunks.push({
                    id: `page-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    docId: docId,
                    docTitle: cleanFileName,
                    source: cleanFileName,
                    page: i,
                    totalPages: pdf.numPages,
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
 * Ingest plain text / markdown sourcebooks
 */
export const ingestText = async (text, fileName = "Custom Tome", onProgress) => {
    const cleanFileName = fileName.replace(/\.[^/.]+$/, "");
    const docId = `tome_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Split text into ~2,000 char "pages"
    const PAGE_SIZE = 2200;
    const pages = [];
    let cur = 0;
    while (cur < text.length) {
        let end = Math.min(cur + PAGE_SIZE, text.length);
        if (end < text.length) {
            const lastBreak = text.lastIndexOf('\n', end);
            if (lastBreak > cur + 1000) end = lastBreak;
        }
        const pageContent = text.slice(cur, end).trim();
        if (pageContent.length > 20) {
            pages.push(pageContent);
        }
        cur = end;
    }

    const totalPages = Math.max(1, pages.length);
    const chunks = pages.map((content, idx) => ({
        id: `page-${idx + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        docId: docId,
        docTitle: cleanFileName,
        source: cleanFileName,
        page: idx + 1,
        totalPages: totalPages,
        content: content
    }));

    if (onProgress) onProgress(100);
    return chunks;
};

/**
 * Monster Statblock Extraction Prompt for AI
 */
export const buildMonsterExtractionPrompt = (textExcerpt, instruction = '') => {
    return `Role: Expert D&D 5e monster and bestiary stat block designer.
Task: Analyze the provided text from an adventure or sourcebook and generate a complete, balanced D&D 5e monster statblock for the creature mentioned.
${instruction ? `Special Instruction: ${instruction}` : ''}

Output ONLY valid JSON adhering strictly to this schema (no markdown formatting, no explanations):
{
  "name": "Creature Name",
  "cr": "1/2" or "3" or "10",
  "race": "Large Monstrosity (Chaotic Evil)",
  "class": "Monster",
  "ac": 14,
  "hp": { "current": 45, "max": 45 },
  "speed": "30 ft., fly 60 ft.",
  "stats": { "str": 16, "dex": 12, "con": 14, "int": 6, "wis": 12, "cha": 8 },
  "savingThrows": { "con": 4, "wis": 3 },
  "skills": { "perception": 3, "stealth": 3 },
  "damageResistances": "fire, poison",
  "conditionImmunities": "charmed, frightened",
  "senses": "darkvision 60 ft., passive Perception 13",
  "languages": "Abyssal, Common",
  "bio": {
    "appearance": "Visual description of the creature...",
    "backstory": "Tactics and lore from the text..."
  },
  "customActions": [
    {
      "name": "Bite",
      "desc": "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 3) piercing damage.",
      "type": "Action",
      "hit": "+5",
      "dmg": "1d8+3"
    },
    {
      "name": "Claw",
      "desc": "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.",
      "type": "Action",
      "hit": "+5",
      "dmg": "1d6+3"
    }
  ]
}

SOURCE TEXT:
${textExcerpt.substring(0, 5000)}`;
};

/**
 * Chapter Monster Scan Prompt for discovering encounters
 */
export const buildChapterMonsterScanPrompt = (textExcerpt) => {
    return `Role: D&D 5e Encounter & Bestiary analyzer.
Task: Read the following adventure text and identify all unique monsters, creatures, bosses, NPCs with combat stats, or enemies mentioned in the text.
Output ONLY a valid JSON array of objects with no surrounding markdown or explanation.
Format:
[
  {
    "name": "Nothic",
    "type": "Aberration",
    "cr": "2",
    "description": "One-eyed subterranean aberration that guards the laboratory."
  }
]

SOURCE TEXT:
${textExcerpt.substring(0, 6000)}`;
};

/**
 * Grounded Q&A Prompt for "Ask the Archives"
 */
export const buildArchiveQAPrompt = (question, contextChunks = []) => {
    const formattedContext = contextChunks.map((c, i) => {
        return `[EXCERPT ${i + 1} | Tome: "${c.source || c.docTitle || 'Unknown'}" | Page ${c.page || '?'}]\n${c.content}`;
    }).join('\n\n---\n\n');

    return `Role: Sage of the High Archives and Master Lorekeeper.
Task: Answer the Dungeon Master's question accurately based PRIMARILY on the provided excerpts from their uploaded campaign sourcebooks and adventure modules.
Rules:
1. Always cite your source with the book title and page number (e.g. *[Lost Mine of Phandelver, Page 12]*).
2. If the excerpt mentions specific numbers, room keys, NPC motivations, secret doors, or treasure, be precise.
3. If the answer is not in the excerpts, you may offer helpful 5e advice while explicitly stating that it was inferred beyond the provided text.
4. Format with clean Markdown (headers, bullet points, bold names).

CAMPAIGN EXCERPTS:
${formattedContext || "No excerpts found."}

DUNGEON MASTER'S QUESTION:
"${question}"`;
};

/**
 * 2. SEARCH: Finds relevant chunks.
 */
// START CHANGE: Added 'players', 'userRole', and 'myCharId' to arguments
export const retrieveContext = (query, pdfChunks, journalPages, players, userRole, myCharId) => {
    if (!query) return [];
    
    const terms = query.toLowerCase().split(" ").filter(w => w.length > 3);
    // END CHANGE
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
    let currentSize = 0;
    
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