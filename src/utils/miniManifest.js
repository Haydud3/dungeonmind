// Enhanced 3D Miniature Catalog & Search Engine
// Supports GitHub Token Compendium + curated fallback catalog + creature token art resolver + multi-token fuzzy search

const CACHE_KEY = 'dungeonmind_mini_catalog_v3';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let inMemoryCache = null;

// Curated high-resolution creature and class token artwork (free public domain / 5e bestiary tokens)
export const KNOWN_CREATURE_TOKENS = {
    // Undead
    "skeleton warrior": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Skeleton.webp",
    "skeleton archer": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Skeleton.webp",
    "skeleton": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Skeleton.webp",
    "zombie": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Zombie.webp",
    "ghoul": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Ghoul.webp",
    "ghast": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Ghast.webp",
    "vampire": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Vampire.webp",
    "vampire lord": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Vampire.webp",
    "wight": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Wight.webp",
    "wraith": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Wraith.webp",
    "specter": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Specter.webp",
    "spectre": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Specter.webp",
    "mummy": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Mummy.webp",
    "lich": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Lich.webp",
    
    // Humanoids & Goblins & Orcs
    "goblin warrior": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Goblin.webp",
    "goblin archer": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Goblin.webp",
    "goblin shaman": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Goblin%20Boss.webp",
    "goblin": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Goblin.webp",
    "hobgoblin": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Hobgoblin.webp",
    "hobgoblin captain": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Hobgoblin%20Captain.webp",
    "bugbear": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Bugbear.webp",
    "orc barbarian": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Orc.webp",
    "orc berserker": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Orc%20War%20Chief.webp",
    "orc": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Orc.webp",
    "kobold": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Kobold.webp",
    "kobold scout": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Kobold.webp",
    "gnoll": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Gnoll.webp",

    // Heroes & Classes
    "human knight": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Knight.webp",
    "knight": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Knight.webp",
    "paladin": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Knight.webp",
    "female paladin": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Gladiator.webp",
    "wizard": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Mage.webp",
    "human mage": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Mage.webp",
    "elf wizard": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Archmage.webp",
    "sorcerer": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Mage.webp",
    "warlock": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Cult%20Fanatic.webp",
    "tiefling warlock": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Cult%20Fanatic.webp",
    "rogue": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Spy.webp",
    "halfling rogue": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Bandit.webp",
    "cleric": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Priest.webp",
    "dwarf cleric": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Priest.webp",
    "dwarf fighter": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Veteran.webp",
    "fighter": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Veteran.webp",
    "ranger": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Scout.webp",
    "druid": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Druid.webp",
    "bard": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Noble.webp",
    "monk": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Martial%20Arts%20Adept.webp",

    // Dragons
    "red dragon adult": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Adult%20Red%20Dragon.webp",
    "red dragon": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Adult%20Red%20Dragon.webp",
    "black dragon": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Adult%20Black%20Dragon.webp",
    "black dragon wyrmling": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Black%20Dragon%20Wyrmling.webp",
    "blue dragon": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Adult%20Blue%20Dragon.webp",
    "green dragon": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Adult%20Green%20Dragon.webp",
    "white dragon": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Adult%20White%20Dragon.webp",

    // Beasts
    "dire wolf": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Dire%20Wolf.webp",
    "wolf": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Wolf.webp",
    "giant spider": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Giant%20Spider.webp",
    "spider": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Giant%20Spider.webp",
    "cave bear": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Cave%20Bear.webp",
    "bear": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Brown%20Bear.webp",
    "rat": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Giant%20Rat.webp",
    "boar": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Boar.webp",

    // Aberrations & Monstrosities
    "beholder": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Beholder.webp",
    "mind flayer": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Mind%20Flayer.webp",
    "illithid": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Mind%20Flayer.webp",
    "owlbear": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Owlbear.webp",
    "minotaur": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Minotaur.webp",
    "manticore": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Manticore.webp",
    "chimera": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Chimera.webp",

    // Fiends
    "pit fiend": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Pit%20Fiend.webp",
    "horned devil": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Horned%20Devil.webp",
    "imp": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Imp.webp",
    "dretch": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Dretch.webp",
    "balor": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Balor.webp",

    // Constructs & Giants & Elementals
    "iron golem": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Iron%20Golem.webp",
    "flesh golem": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Flesh%20Golem.webp",
    "clay golem": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Clay%20Golem.webp",
    "hill giant": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Hill%20Giant.webp",
    "frost giant": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Frost%20Giant.webp",
    "fire giant": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Fire%20Giant.webp",
    "fire elemental": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Fire%20Elemental.webp",
    "water elemental": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Water%20Elemental.webp",
    "earth elemental": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Earth%20Elemental.webp",
    "air elemental": "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/tokens/MM/Air%20Elemental.webp"
};

/**
 * Resolves a high-quality visual thumbnail for a miniature by checking:
 * 1. An image file in the repo matching the model's path (.webp, .png, .jpg)
 * 2. Exact or substring match in KNOWN_CREATURE_TOKENS
 * 3. Category/Tag match
 */
export const resolveModelThumbnail = (rawPath = "", cleanName = "", category = "", tags = [], imageMap = null) => {
    // 1. Exact match from repository imageMap
    if (imageMap && rawPath) {
        const basePath = rawPath.replace(/\.glb$/i, '').toLowerCase();
        if (imageMap.has(basePath)) return imageMap.get(basePath);
        
        // Also check filename alone
        const fileName = rawPath.split('/').pop().replace(/\.glb$/i, '').toLowerCase();
        if (imageMap.has(fileName)) return imageMap.get(fileName);
    }

    // 2. Exact match in KNOWN_CREATURE_TOKENS
    const nameLow = cleanName.toLowerCase().trim();
    if (KNOWN_CREATURE_TOKENS[nameLow]) {
        return KNOWN_CREATURE_TOKENS[nameLow];
    }

    // 3. Substring / keyword match in KNOWN_CREATURE_TOKENS
    const allTokens = [nameLow, ...(tags || []).map(t => t.toLowerCase())];
    for (const key of Object.keys(KNOWN_CREATURE_TOKENS)) {
        for (const token of allTokens) {
            if (token === key || token.includes(key) || key.includes(token)) {
                return KNOWN_CREATURE_TOKENS[key];
            }
        }
    }

    // 4. Fallback based on category
    const catLow = (category || "").toLowerCase();
    if (catLow === "undead") return KNOWN_CREATURE_TOKENS["skeleton"];
    if (catLow === "dragons") return KNOWN_CREATURE_TOKENS["red dragon"];
    if (catLow === "fiends") return KNOWN_CREATURE_TOKENS["pit fiend"];
    if (catLow === "beasts") return KNOWN_CREATURE_TOKENS["wolf"];
    if (catLow === "heroes") return KNOWN_CREATURE_TOKENS["knight"];
    if (catLow === "aberrations") return KNOWN_CREATURE_TOKENS["beholder"];
    if (catLow === "constructs") return KNOWN_CREATURE_TOKENS["iron golem"];
    if (catLow === "elementals") return KNOWN_CREATURE_TOKENS["fire elemental"];
    if (catLow === "giants") return KNOWN_CREATURE_TOKENS["hill giant"];
    if (catLow === "monstrosities") return KNOWN_CREATURE_TOKENS["owlbear"];

    return "";
};

// Curated high-reliability fallback miniatures with pre-resolved thumbnail artwork
const RAW_FALLBACK_MINIS = [
    { name: "Skeleton Warrior", category: "Undead", path: "Creatures/Undead/Skeleton_Warrior.glb", tags: ["undead", "skeleton", "warrior", "sword", "monster"] },
    { name: "Skeleton Archer", category: "Undead", path: "Creatures/Undead/Skeleton_Archer.glb", tags: ["undead", "skeleton", "archer", "bow", "monster"] },
    { name: "Zombie", category: "Undead", path: "Creatures/Undead/Zombie.glb", tags: ["undead", "zombie", "corpse", "monster"] },
    { name: "Ghoul", category: "Undead", path: "Creatures/Undead/Ghoul.glb", tags: ["undead", "ghoul", "monster"] },
    { name: "Vampire Lord", category: "Undead", path: "Creatures/Undead/Vampire.glb", tags: ["undead", "vampire", "lord", "boss"] },
    { name: "Goblin Warrior", category: "Humanoids", path: "Creatures/Humanoids/Goblin_Warrior.glb", tags: ["goblin", "goblinoid", "humanoid", "warrior"] },
    { name: "Goblin Archer", category: "Humanoids", path: "Creatures/Humanoids/Goblin_Archer.glb", tags: ["goblin", "goblinoid", "archer", "bow"] },
    { name: "Goblin Shaman", category: "Humanoids", path: "Creatures/Humanoids/Goblin_Shaman.glb", tags: ["goblin", "shaman", "spellcaster", "caster"] },
    { name: "Orc Barbarian", category: "Humanoids", path: "Creatures/Humanoids/Orc_Barbarian.glb", tags: ["orc", "barbarian", "warrior", "axe"] },
    { name: "Orc Berserker", category: "Humanoids", path: "Creatures/Humanoids/Orc_Berserker.glb", tags: ["orc", "berserker", "axe", "warrior"] },
    { name: "Hobgoblin Captain", category: "Humanoids", path: "Creatures/Humanoids/Hobgoblin_Captain.glb", tags: ["hobgoblin", "goblinoid", "captain", "soldier"] },
    { name: "Kobold Scout", category: "Humanoids", path: "Creatures/Humanoids/Kobold.glb", tags: ["kobold", "reptile", "scout"] },
    { name: "Human Knight", category: "Heroes", path: "Heroes/Fighter/Male_Human_Knight.glb", tags: ["human", "fighter", "knight", "paladin", "armor", "hero"] },
    { name: "Female Paladin", category: "Heroes", path: "Heroes/Paladin/Female_Paladin.glb", tags: ["human", "paladin", "knight", "holy", "shield", "hero"] },
    { name: "Elf Wizard", category: "Heroes", path: "Heroes/Wizard/Elf_Wizard.glb", tags: ["elf", "wizard", "mage", "sorcerer", "magic", "staff", "hero"] },
    { name: "Human Mage", category: "Heroes", path: "Heroes/Wizard/Human_Mage.glb", tags: ["human", "wizard", "mage", "spellcaster", "hero"] },
    { name: "Halfling Rogue", category: "Heroes", path: "Heroes/Rogue/Halfling_Rogue.glb", tags: ["halfling", "rogue", "thief", "dagger", "hero"] },
    { name: "Dwarf Cleric", category: "Heroes", path: "Heroes/Cleric/Dwarf_Cleric.glb", tags: ["dwarf", "cleric", "priest", "healer", "hammer", "hero"] },
    { name: "Dwarf Fighter", category: "Heroes", path: "Heroes/Fighter/Dwarf_Fighter.glb", tags: ["dwarf", "fighter", "warrior", "axe", "shield", "hero"] },
    { name: "Tiefling Warlock", category: "Heroes", path: "Heroes/Warlock/Tiefling_Warlock.glb", tags: ["tiefling", "warlock", "caster", "magic", "horns", "hero"] },
    { name: "Red Dragon Adult", category: "Dragons", path: "Creatures/Dragons/Red_Dragon_Adult.glb", tags: ["dragon", "red", "fire", "flying", "boss", "wyrm"] },
    { name: "Black Dragon Wyrmling", category: "Dragons", path: "Creatures/Dragons/Black_Dragon.glb", tags: ["dragon", "black", "acid"] },
    { name: "Dire Wolf", category: "Beasts", path: "Creatures/Beasts/Dire_Wolf.glb", tags: ["beast", "wolf", "canine", "animal"] },
    { name: "Giant Spider", category: "Beasts", path: "Creatures/Beasts/Giant_Spider.glb", tags: ["beast", "spider", "insect", "poison"] },
    { name: "Cave Bear", category: "Beasts", path: "Creatures/Beasts/Bear.glb", tags: ["beast", "bear", "animal"] },
    { name: "Iron Golem", category: "Constructs", path: "Creatures/Constructs/Iron_Golem.glb", tags: ["construct", "golem", "iron", "metal"] },
    { name: "Flesh Golem", category: "Constructs", path: "Creatures/Constructs/Flesh_Golem.glb", tags: ["construct", "golem", "undead", "stitched"] },
    { name: "Pit Fiend", category: "Fiends", path: "Creatures/Fiends/Pit_Fiend.glb", tags: ["fiend", "demon", "devil", "boss", "fire"] },
    { name: "Horned Devil", category: "Fiends", path: "Creatures/Fiends/Horned_Devil.glb", tags: ["fiend", "devil", "horns", "wings"] },
    { name: "Beholder", category: "Aberrations", path: "Creatures/Aberrations/Beholder.glb", tags: ["aberration", "beholder", "eye", "boss"] },
    { name: "Mind Flayer", category: "Aberrations", path: "Creatures/Aberrations/Mind_Flayer.glb", tags: ["aberration", "mind flayer", "illithid", "psionic"] },
    { name: "Owlbear", category: "Monstrosities", path: "Creatures/Monstrosities/Owlbear.glb", tags: ["monstrosity", "owlbear", "beast"] },
    { name: "Minotaur", category: "Monstrosities", path: "Creatures/Monstrosities/Minotaur.glb", tags: ["monstrosity", "minotaur", "bull", "axe"] },
    { name: "Hill Giant", category: "Giants", path: "Creatures/Giants/Hill_Giant.glb", tags: ["giant", "club", "huge"] },
    { name: "Fire Elemental", category: "Elementals", path: "Creatures/Elementals/Fire_Elemental.glb", tags: ["elemental", "fire", "flame"] },
    { name: "Water Elemental", category: "Elementals", path: "Creatures/Elementals/Water_Elemental.glb", tags: ["elemental", "water"] }
];

const FALLBACK_MINIS = RAW_FALLBACK_MINIS.map((item, idx) => ({
    id: `fallback_${idx}`,
    name: item.name,
    category: item.category,
    url: `https://raw.githubusercontent.com/theripper93/canvas3dtokencompendium/master/${item.path}`,
    thumb: resolveModelThumbnail(item.path, item.name, item.category, item.tags),
    scale: 1.0,
    yOffset: 0,
    tags: item.tags
}));

// D&D Taxonomy & Synonym Expansion
const SYNONYMS = {
    "wizard": ["wizard", "mage", "sorcerer", "warlock", "caster", "magic", "spellcaster"],
    "mage": ["wizard", "mage", "sorcerer", "warlock", "caster"],
    "sorcerer": ["wizard", "mage", "sorcerer", "caster"],
    "warlock": ["wizard", "mage", "sorcerer", "warlock"],
    "fighter": ["fighter", "warrior", "knight", "soldier", "paladin", "guard"],
    "warrior": ["fighter", "warrior", "knight", "soldier", "barbarian"],
    "knight": ["knight", "paladin", "fighter", "warrior", "armor"],
    "paladin": ["paladin", "knight", "cleric", "holy"],
    "rogue": ["rogue", "thief", "assassin", "scoundrel", "scout"],
    "thief": ["rogue", "thief", "assassin"],
    "cleric": ["cleric", "priest", "healer", "paladin", "monk"],
    "priest": ["cleric", "priest", "healer"],
    "undead": ["undead", "skeleton", "zombie", "ghoul", "lich", "vampire", "wight", "wraith", "mummy", "ghost", "spectre"],
    "skeleton": ["skeleton", "undead", "bony"],
    "zombie": ["zombie", "undead", "ghoul", "corpse"],
    "vampire": ["vampire", "undead", "lord"],
    "dragon": ["dragon", "wyrm", "drake", "reptile"],
    "goblin": ["goblin", "goblinoid", "humanoid"],
    "hobgoblin": ["hobgoblin", "goblinoid", "humanoid"],
    "orc": ["orc", "barbarian", "warrior", "humanoid"],
    "fiend": ["fiend", "demon", "devil", "imp"],
    "demon": ["fiend", "demon", "devil"],
    "devil": ["fiend", "demon", "devil"],
    "beast": ["beast", "wolf", "bear", "spider", "animal", "creature"],
    "construct": ["construct", "golem", "automaton", "robot"],
    "golem": ["construct", "golem"],
    "aberration": ["aberration", "beholder", "mind flayer", "illithid", "tentacle"],
    "illithid": ["mind flayer", "illithid", "aberration"]
};

// Clean format names: "Red_Dragon_Adult" -> "Red Dragon Adult"
const formatMiniName = (rawName) => {
    return rawName
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();
};

export const fetchGithubMinis = async () => {
    if (inMemoryCache && inMemoryCache.length > 0) return inMemoryCache;

    // Check LocalStorage cache with TTL
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.timestamp && (Date.now() - parsed.timestamp < CACHE_TTL_MS) && Array.isArray(parsed.data) && parsed.data.length > 0) {
                inMemoryCache = parsed.data;
                return inMemoryCache;
            }
        }
    } catch (e) {
        console.warn("Mini catalog cache read error:", e);
    }

    try {
        let res = await fetch('https://api.github.com/repos/theripper93/canvas3dtokencompendium/git/trees/master?recursive=1');
        if (!res.ok) res = await fetch('https://api.github.com/repos/theripper93/canvas3dtokencompendium/git/trees/main?recursive=1');
        
        if (!res.ok) {
            console.warn(`GitHub API returned status ${res.status}. Using fallback mini library.`);
            inMemoryCache = FALLBACK_MINIS;
            return inMemoryCache;
        }

        const data = await res.json();
        const branch = res.url.includes('/master') ? 'master' : 'main';
        
        if (!data || !Array.isArray(data.tree)) {
            inMemoryCache = FALLBACK_MINIS;
            return inMemoryCache;
        }

        // 1. Index all image files (.webp, .png, .jpg, .jpeg) in repository tree
        const imageMap = new Map();
        const imageExts = ['.webp', '.png', '.jpg', '.jpeg'];
        data.tree.forEach(node => {
            if (!node.path) return;
            const lowPath = node.path.toLowerCase();
            const matchedExt = imageExts.find(ext => lowPath.endsWith(ext));
            if (matchedExt) {
                const basePath = lowPath.slice(0, -matchedExt.length);
                const encodedPath = node.path.split('/').map(encodeURIComponent).join('/');
                const imgUrl = `https://raw.githubusercontent.com/theripper93/canvas3dtokencompendium/${branch}/${encodedPath}`;
                imageMap.set(basePath, imgUrl);
                
                // Also index by filename without path
                const fileName = basePath.split('/').pop();
                if (fileName && !imageMap.has(fileName)) {
                    imageMap.set(fileName, imgUrl);
                }
            }
        });

        // 2. Parse 3D GLB model nodes
        const models = data.tree
            .filter(node => node.path && node.path.endsWith('.glb'))
            .map(node => {
                const parts = node.path.split('/');
                const rawFileName = parts.pop().replace('.glb', '');
                const category = parts.length > 0 ? parts[0] : "General";
                const cleanName = formatMiniName(decodeURIComponent(rawFileName));
                const encodedPath = node.path.split('/').map(encodeURIComponent).join('/');
                
                // Build tag array from path segments and name tokens
                const pathTags = parts.map(p => p.toLowerCase());
                const nameTokens = cleanName.toLowerCase().split(/\s+/);
                const tags = Array.from(new Set([...pathTags, ...nameTokens]));

                // Resolve thumbnail
                const thumbnail = resolveModelThumbnail(node.path, cleanName, category, tags, imageMap);

                return {
                    id: node.sha || node.path,
                    name: cleanName,
                    category: category,
                    rawPath: node.path,
                    url: `https://raw.githubusercontent.com/theripper93/canvas3dtokencompendium/${branch}/${encodedPath}`,
                    thumb: thumbnail,
                    scale: 1.0,
                    yOffset: 0,
                    tags: tags
                };
            });

        // Merge with fallback to ensure rich catalog
        const combined = [...models];
        if (combined.length === 0) {
            inMemoryCache = FALLBACK_MINIS;
        } else {
            inMemoryCache = combined;
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: combined
                }));
            } catch (e) {
                // Storage quota exceeded or disabled
            }
        }
        return inMemoryCache;
    } catch (e) {
        console.error("Failed to fetch minis from GitHub API. Falling back to local catalog:", e);
        inMemoryCache = FALLBACK_MINIS;
        return inMemoryCache;
    }
};

/**
 * Searches the 3D model repository with multi-term fuzzy matching,
 * category filtering, and synonym expansion.
 */
export const searchGithubModels = async (query = "", category = "all") => {
    const all = await fetchGithubMinis();
    if (!all || all.length === 0) return FALLBACK_MINIS;

    let filtered = all;
    if (category && category !== "all") {
        const catLow = category.toLowerCase();
        filtered = filtered.filter(m => 
            (m.category && m.category.toLowerCase() === catLow) ||
            (m.tags && m.tags.includes(catLow))
        );
    }

    if (!query || !query.trim()) {
        return filtered.slice(0, 60);
    }

    const qClean = query.toLowerCase().trim();
    const queryTokens = qClean.split(/[\s,_\-]+/).filter(Boolean);

    // Expand query tokens with synonyms
    const expandedSynonyms = new Set();
    queryTokens.forEach(token => {
        expandedSynonyms.add(token);
        if (SYNONYMS[token]) {
            SYNONYMS[token].forEach(syn => expandedSynonyms.add(syn));
        }
    });

    const matches = [];

    for (const model of filtered) {
        const nameLow = model.name.toLowerCase();
        const pathLow = (model.rawPath || "").toLowerCase();
        const tags = model.tags || [];

        let score = 0;

        // Exact match
        if (nameLow === qClean) {
            score += 150;
        } else if (nameLow.startsWith(qClean)) {
            score += 80;
        }

        // Token match evaluation
        let matchedTokens = 0;
        for (const token of queryTokens) {
            if (nameLow.includes(token)) {
                score += 30;
                matchedTokens++;
            } else if (tags.some(t => t.includes(token))) {
                score += 20;
                matchedTokens++;
            } else if (pathLow.includes(token)) {
                score += 10;
                matchedTokens++;
            }
        }

        // Synonym bonus
        if (matchedTokens === 0) {
            for (const syn of expandedSynonyms) {
                if (nameLow.includes(syn) || tags.some(t => t.includes(syn))) {
                    score += 15;
                    matchedTokens++;
                    break;
                }
            }
        }

        if (score > 0) {
            matches.push({ model, score });
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 60).map(m => m.model);
};

export const getAvailableCategories = async () => {
    const all = await fetchGithubMinis();
    const categories = new Set(["All"]);
    all.forEach(m => {
        if (m.category) categories.add(m.category);
    });
    return Array.from(categories);
};

export const getModelsForCreature = (name, type) => {
    return [];
};