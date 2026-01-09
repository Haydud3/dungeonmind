import * as pdfjsLib from 'pdfjs-dist';

// Dynamic versioning to match your installed package
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const sanitizeForFirestore = (data) => {
    return JSON.parse(JSON.stringify(data));
};

export const parsePdf = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let formFields = {};
        let normalizedFields = {}; 
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const annotations = await page.getAnnotations();
            
            annotations.forEach(ann => {
                if (ann.fieldName) {
                    let val = ann.fieldValue || ann.buttonValue || "";
                    if (Array.isArray(val)) val = val[0]; 
                    
                    const originalKey = ann.fieldName;
                    const cleanKey = originalKey.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    
                    formFields[originalKey] = val;
                    normalizedFields[cleanKey] = val;
                }
            });
        }

        console.log("Parsed PDF Data:", normalizedFields);
        return sanitizeForFirestore(parseFromFields(formFields, normalizedFields));

    } catch (error) {
        console.error("PDF Parsing Failed:", error);
        throw new Error("Failed to read PDF. " + error.message);
    }
};

const parseFromFields = (fields, normFields) => {
    const getVal = (target) => {
        const cleanTarget = target.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return (normFields[cleanTarget] || fields[target] || "").toString().trim();
    };

    const getInt = (target, def = 0) => {
        const val = parseInt(getVal(target));
        return isNaN(val) ? def : val;
    };

    // 1. CLASS & LEVEL
    let classString = getVal("ClassLevel"); 
    let level = 1;
    let className = "Adventurer";
    const lvlMatch = classString.match(/(\d+)/);
    if (lvlMatch) {
        level = parseInt(lvlMatch[0]);
        className = classString.replace(lvlMatch[0], "").trim();
    } else {
        className = classString || "Adventurer";
    }

    // 2. CORE STATS
    const stats = {
        str: getInt("STR"), dex: getInt("DEX"), con: getInt("CON"),
        int: getInt("INT"), wis: getInt("WIS"), cha: getInt("CHA")
    };

    // 3. PROFICIENCIES (Fixed Logic)
    const profText = getVal("ProficienciesLang") || "";
    
    // Regex explanation:
    // ===\s*HEADER\s*===  -> Finds "=== ARMOR ===" or "===ARMOR==="
    // ([\s\S]*?)          -> Captures everything after it...
    // (?:===|$)           -> ...until the NEXT "===" or End of String
    const extractSection = (header) => {
        const regex = new RegExp(`===\\s*${header}\\s*===([\\s\\S]*?)(?:===|$)`, 'i');
        const match = profText.match(regex);
        if (match && match[1]) {
            return match[1].trim().replace(/[\r\n]+/g, ", ");
        }
        return "None";
    };

    const proficiencies = {
        armor: extractSection("ARMOR"),
        weapons: extractSection("WEAPONS"),
        tools: extractSection("TOOLS"),
        languages: extractSection("LANGUAGES")
    };

    // 4. SKILLS
    const skills = {};
    const skillMap = {
        "Acrobatics": "AcrobaticsProf", "Animal Handling": "AnimalHandlingProf",
        "Arcana": "ArcanaProf", "Athletics": "AthleticsProf",
        "Deception": "DeceptionProf", "History": "HistoryProf",
        "Insight": "InsightProf", "Intimidation": "IntimidationProf",
        "Investigation": "InvestigationProf", "Medicine": "MedicineProf",
        "Nature": "NatureProf", "Perception": "PerceptionProf",
        "Performance": "PerformanceProf", "Persuasion": "PersuasionProf",
        "Religion": "ReligionProf", "Sleight of Hand": "SleightOfHandProf",
        "Stealth": "StealthProf", "Survival": "SurvivalProf"
    };

    Object.entries(skillMap).forEach(([skillName, fieldKey]) => {
        const val = getVal(fieldKey);
        if (val === 'P' || val === 'E') {
            skills[skillName] = true;
        }
    });

    // 5. INVENTORY
    const inventory = [];
    const currency = {
        cp: getInt("CP"), sp: getInt("SP"), ep: getInt("EP"), gp: getInt("GP"), pp: getInt("PP")
    };

    for (let i = 0; i < 50; i++) {
        const name = getVal(`EqName${i}`);
        if (name && name !== "undefined") {
            inventory.push({
                name: name,
                qty: getInt(`EqQty${i}`, 1),
                weight: getVal(`EqWeight${i}`)
            });
        }
    }

    // 6. WEAPONS / ACTIONS
    const customActions = [];
    const suffixes = ["", " 2", " 3", " 4", " 5", " 6"];
    suffixes.forEach((s, idx) => {
        const name = getVal(`WpnName${s}`); 
        if (name && name !== "undefined") {
            const id = idx + 1; 
            customActions.push({
                name: name,
                hit: getVal(`Wpn${id}AtkBonus`), 
                dmg: getVal(`Wpn${id}Damage`), 
                type: "Melee",
                notes: getVal(`WpnNotes${id}`)
            });
        }
    });

    // 7. SPELLS
    const spells = [];
    for (let i = 0; i < 50; i++) {
        const name = getVal(`spellName${i}`);
        if (name && name !== "undefined") {
            spells.push({
                name: name,
                level: 0, 
                school: getVal(`spellSource${i}`), 
                time: getVal(`spellCastingTime${i}`)
            });
        }
    }

    // 8. FEATURES & TRAITS
    const features = [];
    const rawTraitText = [
        getVal("FeaturesTraits1"), 
        getVal("FeaturesTraits2"), 
        getVal("FeaturesTraits3")
    ].join("\n");

    if (rawTraitText) {
        const lines = rawTraitText.split(/\r?\n/);
        let currentSection = "Class";
        let currentFeature = null;

        lines.forEach(line => {
            const cleanLine = line.trim();
            const upper = cleanLine.toUpperCase();
            if (!cleanLine) return;

            if (cleanLine.startsWith("===")) {
                if (upper.includes("FEATS") || upper.includes("FEAT ")) currentSection = "Feat";
                else if (upper.includes("SPECIES") || upper.includes("RACE")) currentSection = "Species";
                else if (upper.includes("CLASS") || upper.includes("WARLOCK") || upper.includes("FEATURES")) currentSection = "Class";
                else currentSection = "Other";
                return;
            }

            if (cleanLine.startsWith("*")) {
                if (currentFeature) features.push(currentFeature);
                const content = cleanLine.substring(1).trim(); 
                const parts = content.split("•");
                currentFeature = { name: parts[0].trim(), source: currentSection, desc: parts.length > 1 ? `(${parts[1].trim()})\n` : "" };
            } else if (currentFeature) {
                if (cleanLine.startsWith("|")) currentFeature.desc += "\n" + cleanLine;
                else currentFeature.desc += cleanLine + " ";
            }
        });
        if (currentFeature) features.push(currentFeature);
    }

    // 9. BIO & SENSES
    const bio = {
        backstory: getVal("Backstory") || getVal("CharacterBackstory"),
        appearance: getVal("Appearance") || getVal("CharacterAppearance"),
        traits: getVal("PersonalityTraits"), 
        ideals: getVal("Ideals"), bonds: getVal("Bonds"), flaws: getVal("Flaws"),
        notes: (getVal("AdditionalNotes1") + "\n" + getVal("AlliesOrganizations")).trim()
    };

    const senses = {
        passivePerception: getInt("Passive1"),
        passiveInvestigation: getInt("Passive2"),
        passiveInsight: getInt("Passive3"),
        darkvision: getVal("AdditionalSenses")
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
        speed: getVal("Speed"),
        init: getVal("Init"),
        ac: getInt("AC"),
        profBonus: getInt("ProfBonus", 2),
        currency: currency,
        inventory: inventory,
        customActions: customActions,
        spells: spells,
        features: features,
        bio: bio,
        proficiencies: proficiencies, // NOW CORRECTLY POPULATED
        skills: skills,
        senses: senses
    };
};

export const getDebugText = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let log = `Lib Version: ${pdfjsLib.version}\n`;
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const annotations = await page.getAnnotations();
            log += `\n=== PAGE ${i} FIELDS ===\n`;
            annotations.forEach(a => { log += `[${a.fieldName}]: ${a.fieldValue || a.buttonValue}\n`; });
        }
        return log;
    } catch (e) { return `ERROR: ${e.message}`; }
};