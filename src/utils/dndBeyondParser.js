import * as pdfjsLib from 'pdfjs-dist';

// FIX: Dynamic versioning to match your project's installed library
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const sanitizeForFirestore = (data) => {
    return JSON.parse(JSON.stringify(data));
};

export const parsePdf = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let formFields = {};
        let normalizedFields = {}; // Store stripped keys here
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const annotations = await page.getAnnotations();
            
            annotations.forEach(ann => {
                if (ann.fieldName) {
                    let val = ann.fieldValue || ann.buttonValue || "";
                    if (Array.isArray(val)) val = val[0]; 
                    
                    const originalKey = ann.fieldName;
                    // STRIP EVERYTHING except letters/numbers (e.g. "CLASS  LEVEL" -> "classlevel")
                    const cleanKey = originalKey.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    
                    formFields[originalKey] = val;
                    normalizedFields[cleanKey] = val;
                }
            });
        }

        console.log("Normalized Keys:", Object.keys(normalizedFields));
        return sanitizeForFirestore(parseFromFields(formFields, normalizedFields));

    } catch (error) {
        console.error("PDF Parsing Failed:", error);
        throw new Error("Failed to read PDF. " + error.message);
    }
};

const parseFromFields = (fields, normFields) => {
    // Helper: Look up by normalized key (e.g. getVal("ClassLevel") finds "CLASS  LEVEL")
    const getVal = (target) => {
        const cleanTarget = target.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return (normFields[cleanTarget] || fields[target] || "").toString().trim();
    };

    const getInt = (target, def = 0) => {
        const val = parseInt(getVal(target));
        return isNaN(val) ? def : val;
    };

    // 1. CLASS & LEVEL
    // Your log showed: [CLASS  LEVEL]: Warlock 2
    // normalizing matches "classlevel" -> "Warlock 2"
    let classString = getVal("ClassLevel"); 
    let level = 1;
    let className = "Adventurer";
    
    // Parse "Warlock 2"
    const lvlMatch = classString.match(/(\d+)/);
    if (lvlMatch) {
        level = parseInt(lvlMatch[0]);
        className = classString.replace(lvlMatch[0], "").trim();
    } else {
        className = classString || "Adventurer";
    }

    // 2. STATS
    const stats = {
        str: getInt("STR"),
        dex: getInt("DEX"),
        con: getInt("CON"),
        int: getInt("INT"),
        wis: getInt("WIS"),
        cha: getInt("CHA")
    };

    // 3. INVENTORY (Iterate through EqName0...)
    const inventory = [];
    const currency = {
        cp: getInt("CP"), sp: getInt("SP"), ep: getInt("EP"), gp: getInt("GP"), pp: getInt("PP")
    };

    for (let i = 0; i < 50; i++) {
        const name = getVal(`EqName${i}`); // Matches "Eq Name0"
        if (name && name !== "undefined") {
            inventory.push({
                name: name,
                qty: getInt(`EqQty${i}`, 1),
                weight: getVal(`EqWeight${i}`)
            });
        }
    }

    // 4. WEAPONS
    const customActions = [];
    // Your log showed: [Wpn Name], [Wpn Name 2]
    const suffixes = ["", " 2", " 3", " 4", " 5", " 6"];
    
    suffixes.forEach((s, idx) => {
        // Matches "Wpn Name" or "Wpn Name 2"
        const name = getVal(`WpnName${s}`); 
        if (name && name !== "undefined") {
            // Logic to find the matching Bonus/Damage fields
            // Your log showed: [Wpn1 AtkBonus], [Wpn2 AtkBonus]
            const id = idx + 1; 
            
            customActions.push({
                name: name,
                hit: getVal(`Wpn${id}AtkBonus`), 
                dmg: getVal(`Wpn${id}Damage`), 
                type: "Melee",
                notes: getVal(`WpnNotes${id}`) // Matches "Wpn Notes 1"
            });
        }
    });

    // 5. SPELLS
    const spells = [];
    for (let i = 0; i < 50; i++) {
        const name = getVal(`spellName${i}`);
        if (name && name !== "undefined") {
            spells.push({
                name: name,
                level: 0, 
                school: getVal(`spellSource${i}`), // "Warlock"
                time: getVal(`spellCastingTime${i}`) // "1A"
            });
        }
    }

    // 6. BIO
    const bio = {
        backstory: getVal("Backstory") || getVal("CharacterBackstory"),
        appearance: getVal("Appearance") || getVal("CharacterAppearance"),
        traits: getVal("PersonalityTraits"), // Matches "PersonalityTraits "
        ideals: getVal("Ideals"),
        bonds: getVal("Bonds"),
        flaws: getVal("Flaws"),
        notes: getVal("AdditionalNotes1") + "\n" + getVal("AlliesOrganizations")
    };

    return {
        name: getVal("CharacterName") || "Hero",
        race: getVal("Race"),
        class: className,
        level: level,
        stats: stats,
        hp: {
            max: getInt("MaxHP"),
            current: getInt("CurrentHP") || getInt("MaxHP"), 
            temp: getInt("TempHP")
        },
        profBonus: getInt("ProfBonus", 2),
        currency: currency,
        inventory: inventory,
        customActions: customActions,
        spells: spells,
        features: [],
        bio: bio
    };
};

// --- DEBUG TOOL (Keep as requested) ---
export const getDebugText = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let log = `Lib Version: ${pdfjsLib.version}\n`;
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const anns = await page.getAnnotations();
            
            log += `\n=== PAGE ${i} FIELDS ===\n`;
            anns.forEach(a => {
                log += `[${a.fieldName}]: ${a.fieldValue || a.buttonValue}\n`;
            });
        }
        return log;
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
};