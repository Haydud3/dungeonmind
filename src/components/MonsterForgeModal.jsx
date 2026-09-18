import React, { useState } from 'react';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { MonsterStatblockView } from './MonsterStatblockView';
import { enrichCharacter } from '../utils/srdEnricher';

const INSPIRATION_ARCHETYPES = [
    {
        name: "Cinderfang Scorcher",
        label: "🔥 Inferno Dragon",
        cr: "17",
        size: "Huge",
        type: "Dragon",
        alignment: "Chaotic Evil",
        role: "Boss / Legendary",
        abilities: ["Multiattack", "Breath Weapon", "Legendary Resistance", "Flight", "Frightful Presence"],
        environment: "Volcanic / Fiendish Plane",
        notes: "Exhales scorching hellfire, burning aura damaging creatures that start their turn nearby."
    },
    {
        name: "Graveborn Wight",
        label: "💀 Crypt Wight",
        cr: "3",
        size: "Medium",
        type: "Undead",
        alignment: "Neutral Evil",
        role: "Brute / Melee",
        abilities: ["Life Drain", "Sunlight Sensitivity", "Darkvision"],
        environment: "Dungeon / Crypt",
        notes: "Longsword attacks drain maximum hit points; creatures slain by drain rise as zombies."
    },
    {
        name: "Thal'kazzar the Mindbender",
        label: "👁️ Mind Flayer Sage",
        cr: "8",
        size: "Medium",
        type: "Aberration",
        alignment: "Lawful Evil",
        role: "Controller / Debuffer",
        abilities: ["Magic Resistance", "Spellcasting", "Teleportation"],
        environment: "Underdark",
        notes: "Mind Blast stuns enemies in a 60ft cone; tentacle grapple extracts brains."
    },
    {
        name: "Fenris Ironjaw",
        label: "🐺 Alpha Werewolf",
        cr: "4",
        size: "Medium",
        type: "Monstrosity",
        alignment: "Chaotic Evil",
        role: "Skirmisher / Striker",
        abilities: ["Multiattack", "Pack Tactics", "Regeneration"],
        environment: "Deep Forest",
        notes: "Bite inflicts lycanthropy; summons a pack of dire wolves to flank targets."
    },
    {
        name: "Gaelthrum the Tempest",
        label: "⚡ Storm Elemental",
        cr: "5",
        size: "Large",
        type: "Elemental",
        alignment: "True Neutral",
        role: "Artillery / Ranged",
        abilities: ["Flight", "Multiattack", "Damage Resistance"],
        environment: "Mountain Peaks",
        notes: "Hurls arcing chain lightning bolts; transforms into a living whirlwind."
    },
    {
        name: "Kethrix the Broodmother",
        label: "🕷️ Arachnid Queen",
        cr: "6",
        size: "Huge",
        type: "Beast",
        alignment: "Neutral Evil",
        role: "Controller / Debuffer",
        abilities: ["Spider Climb", "Multiattack", "Web", "Darkvision"],
        environment: "Ancient Ruins",
        notes: "Shoots sticky paralyzing webs; venomous fangs cause necrotizing poison."
    },
    {
        name: "Vesper Nightstalker",
        label: "🗡️ Shadow Assassin",
        cr: "8",
        size: "Medium",
        type: "Humanoid",
        alignment: "Lawful Evil",
        role: "Skirmisher / Striker",
        abilities: ["Invisibility", "Multiattack", "Nimble Escape"],
        environment: "Urban / Sewers",
        notes: "Shadow steps between dim areas; delivers lethal sneak attacks with poisoned daggers."
    },
    {
        name: "Rotwood Ancient",
        label: "🌿 Blighted Treant",
        cr: "9",
        size: "Huge",
        type: "Plant",
        alignment: "Neutral Evil",
        role: "Brute / Melee",
        abilities: ["Multiattack", "Damage Resistance", "Siege Monster"],
        environment: "Swamp / Mire",
        notes: "Smashes with rot-infected boughs; animates blighted root tentacles from the ground."
    },
    {
        name: "Ironclad Dreadnought",
        label: "⚙️ Clockwork Golem",
        cr: "10",
        size: "Large",
        type: "Construct",
        alignment: "True Neutral",
        role: "Brute / Melee",
        abilities: ["Magic Resistance", "Multiattack", "Immutable Form"],
        environment: "Dungeon / Crypt",
        notes: "Heavy steam-powered pistons, vents superheated steam, completely immune to psychic & poison."
    },
    {
        name: "Sylphira Whisperthorn",
        label: "👑 Archfey Enchanter",
        cr: "12",
        size: "Medium",
        type: "Fey",
        alignment: "Chaotic Neutral",
        role: "Spellcaster / Mage",
        abilities: ["Spellcasting", "Magic Resistance", "Teleportation", "Legendary Resistance"],
        environment: "Deep Forest",
        notes: "Charms and confuses enemies with illusory mirrors; teleports via misty petals when struck."
    }
];

const RANDOM_NAME_PREFIXES = ["Gore", "Dread", "Shadow", "Ash", "Void", "Cinder", "Blood", "Frost", "Iron", "Storm", "Vile", "Grim", "Blight", "Doom", "Nether", "Soul", "Bone", "Skull"];
const RANDOM_NAME_ROOTS = ["fang", "claw", "hound", "stalker", "weaver", "reaper", "render", "behemoth", "maw", "hide", "fiend", "wraith", "warden", "tyrant", "lurker", "scourge"];
const RANDOM_NAME_TITLES = ["the Unbroken", "the Ruthless", "the Despoiler", "the Devourer", "of the Abyss", "the Dreadlord", "the Soulstealer", "the Blighted", "the Ancient", "the World-Eater", "of Mount Ruin", "the Silent"];

const generateRandomMonsterName = () => {
    const p = RANDOM_NAME_PREFIXES[Math.floor(Math.random() * RANDOM_NAME_PREFIXES.length)];
    const r = RANDOM_NAME_ROOTS[Math.floor(Math.random() * RANDOM_NAME_ROOTS.length)];
    const t = Math.random() > 0.4 ? " " + RANDOM_NAME_TITLES[Math.floor(Math.random() * RANDOM_NAME_TITLES.length)] : "";
    return `${p}${r}${t}`;
};

const CR_BENCHMARKS = [
    { cr: "0", label: "CR 0 (1–6 HP, AC 12, +3 Atk, PB +2)" },
    { cr: "1/8", label: "CR 1/8 (7–15 HP, AC 12, +3 Atk, PB +2)" },
    { cr: "1/4", label: "CR 1/4 (16–35 HP, AC 13, +3 Atk, PB +2)" },
    { cr: "1/2", label: "CR 1/2 (36–49 HP, AC 13, +3 Atk, PB +2)" },
    { cr: "1", label: "CR 1 (50–70 HP, AC 13, +3 Atk, PB +2)" },
    { cr: "2", label: "CR 2 (71–85 HP, AC 13, +3 Atk, PB +2)" },
    { cr: "3", label: "CR 3 (86–100 HP, AC 13, +4 Atk, PB +2)" },
    { cr: "4", label: "CR 4 (101–115 HP, AC 14, +4 Atk, PB +2)" },
    { cr: "5", label: "CR 5 (116–130 HP, AC 15, +7 Atk, PB +3)" },
    { cr: "6", label: "CR 6 (131–145 HP, AC 15, +7 Atk, PB +3)" },
    { cr: "7", label: "CR 7 (146–160 HP, AC 15, +7 Atk, PB +3)" },
    { cr: "8", label: "CR 8 (161–175 HP, AC 16, +7 Atk, PB +3)" },
    { cr: "9", label: "CR 9 (176–190 HP, AC 16, +7 Atk, PB +4)" },
    { cr: "10", label: "CR 10 (191–205 HP, AC 17, +7 Atk, PB +4)" },
    { cr: "11", label: "CR 11 (206–220 HP, AC 17, +8 Atk, PB +4)" },
    { cr: "12", label: "CR 12 (221–235 HP, AC 17, +8 Atk, PB +4)" },
    { cr: "13", label: "CR 13 (236–250 HP, AC 18, +8 Atk, PB +5)" },
    { cr: "14", label: "CR 14 (251–265 HP, AC 18, +8 Atk, PB +5)" },
    { cr: "15", label: "CR 15 (266–280 HP, AC 18, +8 Atk, PB +5)" },
    { cr: "16", label: "CR 16 (281–295 HP, AC 18, +9 Atk, PB +5)" },
    { cr: "17", label: "CR 17 (296–310 HP, AC 19, +10 Atk, PB +6)" },
    { cr: "18", label: "CR 18 (311–325 HP, AC 19, +10 Atk, PB +6)" },
    { cr: "19", label: "CR 19 (326–340 HP, AC 19, +10 Atk, PB +6)" },
    { cr: "20", label: "CR 20 (341–355 HP, AC 19, +10 Atk, PB +6)" },
    { cr: "24", label: "CR 24 (450+ HP, AC 20, +12 Atk, PB +7)" },
    { cr: "30", label: "CR 30 (600+ HP, AC 22, +14 Atk, PB +9)" }
];

const CREATURE_TYPES = [
    "Aberration", "Beast", "Celestial", "Construct", "Dragon", 
    "Elemental", "Fey", "Fiend", "Giant", "Humanoid", 
    "Monstrosity", "Ooze", "Plant", "Undead"
];

const CREATURE_SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

const CREATURE_ALIGNMENTS = [
    "Lawful Good", "Neutral Good", "Chaotic Good",
    "Lawful Neutral", "True Neutral", "Chaotic Neutral",
    "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned"
];

const COMBAT_ROLES = [
    { id: "Brute / Melee", label: "Brute / Tank", desc: "High HP, heavy melee strikes, low mobility" },
    { id: "Skirmisher / Striker", label: "Skirmisher", desc: "High speed, disengage bonus action, hit-and-run" },
    { id: "Artillery / Ranged", label: "Artillery / Sniper", desc: "Deadly ranged arrows or elemental volleys" },
    { id: "Spellcaster / Mage", label: "Spellcaster", desc: "Spells, countermagic, area denial" },
    { id: "Controller / Debuffer", label: "Controller", desc: "Stun, restrain, webs, fear aura, petrification" },
    { id: "Boss / Legendary", label: "Boss / Legendary", desc: "Legendary Actions, Resistances, Lair aura" }
];

const ALL_SIGNATURE_ABILITIES = [
    "Multiattack", "Breath Weapon", "Legendary Resistance", "Pack Tactics",
    "Spellcasting", "Magic Resistance", "Regeneration", "Life Drain",
    "Flight", "Invisibility", "Spider Climb", "Swallow Whole",
    "Teleportation", "Frightful Presence", "Sunlight Sensitivity", "Damage Resistance"
];

const ENVIRONMENTS = [
    "Dungeon / Crypt", "Underdark", "Ancient Ruins", "Deep Forest", 
    "Mountain Peaks", "Arctic / Tundra", "Swamp / Mire", "Desert / Wastes", 
    "Coastal / Ocean", "Fiendish Plane", "Urban / Sewers"
];

export const MonsterForgeModal = ({
    isOpen,
    onClose,
    onForgeComplete,
    generateNpc,
    aiHelper,
    initialTab = 'generate',
    onDiceRoll = null
}) => {
    const toast = useToast();
    const [tab, setTab] = useState(initialTab);
    const [isForging, setIsForging] = useState(false);
    const [isParsingText, setIsParsingText] = useState(false);

    // Form fields
    const [name, setName] = useState('');
    const [cr, setCr] = useState('5');
    const [size, setSize] = useState('Medium');
    const [type, setType] = useState('Monstrosity');
    const [alignment, setAlignment] = useState('Chaotic Evil');
    const [role, setRole] = useState('Brute / Melee');
    const [selectedAbilities, setSelectedAbilities] = useState(['Multiattack']);
    const [environment, setEnvironment] = useState('Dungeon / Crypt');
    const [customNotes, setCustomNotes] = useState('');

    // Paste text tab
    const [pasteText, setPasteText] = useState('');

    // Review / Preview mode
    const [previewNpc, setPreviewNpc] = useState(null);

    if (!isOpen) return null;

    const handleApplyArchetype = (arc) => {
        setName(arc.name);
        setCr(arc.cr);
        setSize(arc.size);
        setType(arc.type);
        setAlignment(arc.alignment);
        setRole(arc.role);
        setSelectedAbilities(arc.abilities);
        setEnvironment(arc.environment);
        setCustomNotes(arc.notes);
        toast(`Loaded preset: ${arc.label}`, "info");
    };

    const toggleAbility = (ab) => {
        setSelectedAbilities(prev => 
            prev.includes(ab) ? prev.filter(x => x !== ab) : [...prev, ab]
        );
    };

    const handleRollRandomName = () => {
        setName(generateRandomMonsterName());
    };

    const handleForge = async () => {
        if (!name.trim()) {
            toast("Please enter a creature name.", "warning");
            return;
        }
        if (!generateNpc) {
            toast("AI generator is unavailable.", "error");
            return;
        }

        setIsForging(true);
        try {
            const compiledInstruction = `Role/Vibe: ${role}. CR: ${cr}. Size: ${size}. Type: ${type}. Alignment: ${alignment}. Environment: ${environment}. Signature Abilities: ${selectedAbilities.join(', ') || 'None'}. Context Details: ${customNotes || 'Standard 5e creature'}.`;

            const forged = await generateNpc(name.trim(), compiledInstruction);
            if (forged) {
                const finalCreature = {
                    ...forged,
                    quirk: "Forged by AI",
                    isHidden: true,
                    id: forged.id || Date.now()
                };
                setPreviewNpc(finalCreature);
                toast(`Forged ${finalCreature.name}! Review statblock below.`, "success");
            } else {
                toast("The Forge could not generate creature. Please try again.", "error");
            }
        } catch (e) {
            console.error("Forge Error:", e);
            toast("Forge failed: " + e.message, "error");
        }
        setIsForging(false);
    };

    const handleParseRawText = async () => {
        if (!pasteText.trim()) return;
        if (!aiHelper) {
            toast("AI helper is unavailable.", "error");
            return;
        }

        setIsParsingText(true);
        const prompt = `You are an expert D&D 5e monster parser. Extract the full 5e statblock from this text into this exact JSON format. DO NOT WRAP IN MARKDOWN. Only return pure valid JSON:
{
  "name": "Monster Name",
  "cr": "5",
  "level": "5",
  "xp": "1,800 XP",
  "race": "Medium humanoid, any alignment",
  "size": "Medium",
  "type": "Humanoid",
  "alignment": "Neutral Evil",
  "hp": { "current": 52, "max": 52, "formula": "8d8 + 16" },
  "ac": 15,
  "acFormula": "studded leather",
  "speed": "30 ft.",
  "profBonus": 3,
  "stats": { "str": 11, "dex": 16, "con": 14, "int": 12, "wis": 13, "cha": 10 },
  "savingThrows": { "str": false, "dex": true, "con": false, "int": false, "wis": true, "cha": false },
  "skills": { "Perception": true, "Stealth": true },
  "senses": { "darkvision": "60 ft.", "passivePerception": 14 },
  "darkvision": 60,
  "passivePerception": 14,
  "defenses": { "resistances": "", "immunities": "", "vulnerabilities": "", "conditionImmunities": "" },
  "proficiencies": { "languages": "Common, Thieves' cant" },
  "features": [
    { "name": "Sneak Attack (1/Turn)", "desc": "Deals an extra 14 (4d6) damage when hitting with advantage." }
  ],
  "customActions": [
    { "name": "Multiattack", "desc": "The creature makes two shortsword attacks.", "type": "Action" },
    { "name": "Shortsword", "desc": "Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage.", "hit": "+6", "dmg": "1d6+3 piercing", "type": "Action" },
    { "name": "Cunning Action", "desc": "Can take Dash, Disengage, or Hide as a bonus action.", "type": "Bonus Action" }
  ],
  "spells": [],
  "bio": { "appearance": "", "backstory": "Extracted from raw text." }
}

Raw Text:
${pasteText}`;

        try {
            let res = await aiHelper([{ role: 'user', content: prompt }]);
            if (typeof res !== 'string') {
                let extracted = res;
                if (res?.message?.content) extracted = res.message.content;
                else if (typeof res?.response?.text === 'function') extracted = await res.response.text();
                else if (typeof res?.text === 'function') extracted = await res.text();
                else if (res?.text) extracted = res.text;
                res = typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
            }

            const match = res.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("No JSON returned from AI parser");
            const parsed = JSON.parse(match[0]);

            // Enrich with SRD
            const enriched = await enrichCharacter(parsed);
            const finalCreature = {
                ...enriched,
                quirk: "Extracted from Text",
                isHidden: true,
                id: Date.now()
            };
            setPreviewNpc(finalCreature);
            toast(`Extracted ${finalCreature.name}! Review statblock below.`, "success");
        } catch (e) {
            console.error("Text Extract Error:", e);
            toast("Failed to parse text into a valid monster statblock: " + e.message, "error");
        }
        setIsParsingText(false);
    };

    const handleAcceptCreature = () => {
        if (!previewNpc) return;
        onForgeComplete(previewNpc);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">
                
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                                <Icon name="wand-2" size={20}/>
                            </div>
                            <div>
                                <h2 className="text-lg sm:text-xl fantasy-font text-white flex items-center gap-2">
                                    AI Monster Forge <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold border border-purple-500/30">5e Engine</span>
                                </h2>
                                <p className="text-[11px] text-slate-400">Create mathematically balanced 5e creature statblocks or parse raw text.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {!previewNpc && (
                            <div className="flex bg-slate-800/80 rounded-xl p-1 border border-slate-700/80">
                                <button
                                    onClick={() => setTab('generate')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        tab === 'generate' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name="sparkles" size={13}/> AI Generator
                                </button>
                                <button
                                    onClick={() => setTab('paste')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        tab === 'paste' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name="clipboard" size={13}/> Paste Text
                                </button>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            <Icon name="x" size={20}/>
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                {previewNpc ? (
                    /* Review / Preview Screen */
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-900">
                        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between text-xs text-amber-300 shrink-0">
                            <span className="flex items-center gap-2 font-medium">
                                <Icon name="check-circle" size={16} className="text-amber-400"/>
                                Creature forged successfully! Review the 5e statblock below before summoning.
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPreviewNpc(null)}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 font-bold transition-colors"
                                >
                                    Adjust / Re-Forge
                                </button>
                                <button
                                    onClick={handleAcceptCreature}
                                    className="px-4 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg font-bold shadow-md transition-all flex items-center gap-1.5"
                                >
                                    <Icon name="check" size={14}/> Summon Monster
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <MonsterStatblockView
                                npc={previewNpc}
                                onDiceRoll={onDiceRoll}
                                hideHeaderActions={true}
                            />
                        </div>
                    </div>
                ) : (
                    /* Generator or Paste Tab */
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-5 sm:p-6 space-y-5">
                        {tab === 'generate' ? (
                            isForging ? (
                                <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center text-purple-400">
                                            <Icon name="sparkles" size={24}/>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-purple-300 fantasy-font">Forging 5e Creature...</h3>
                                        <p className="text-xs text-slate-400 max-w-sm mt-1">
                                            Calculating CR benchmarks, balancing damage output, creating traits, and summoning portrait.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {/* Archetype Quick-Start Chips */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                                                <Icon name="flame" size={14} className="text-amber-400"/>
                                                Quick-Start Inspiration Archetypes
                                            </label>
                                            <span className="text-[10px] text-slate-500 italic">Click to prefill balanced stats</span>
                                        </div>
                                        <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-700">
                                            {INSPIRATION_ARCHETYPES.map((arc, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => handleApplyArchetype(arc)}
                                                    className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-amber-500/50 text-slate-300 hover:text-white text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shadow-sm shrink-0"
                                                >
                                                    {arc.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Name & Randomizer */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-bold text-slate-400 mb-1">
                                                Creature Name / Title <span className="text-red-400">*</span>
                                            </label>
                                            <div className="relative flex items-center">
                                                <input
                                                    autoFocus
                                                    value={name}
                                                    onChange={e => setName(e.target.value)}
                                                    placeholder="e.g. Cinderfang Scorcher OR Glasstaff"
                                                    className="w-full bg-slate-950/80 border border-slate-700 focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-colors pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleRollRandomName}
                                                    className="absolute right-2.5 p-1.5 text-slate-400 hover:text-amber-300 transition-colors"
                                                    title="Roll random fantasy monster name"
                                                >
                                                    <Icon name="dices" size={16}/>
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">
                                                Challenge Rating (CR) Benchmark
                                            </label>
                                            <select
                                                value={cr}
                                                onChange={e => setCr(e.target.value)}
                                                className="w-full bg-slate-950/80 border border-slate-700 focus:border-purple-500 rounded-xl px-3 py-2.5 text-xs text-amber-300 font-mono font-bold outline-none cursor-pointer"
                                            >
                                                {CR_BENCHMARKS.map((b) => (
                                                    <option key={b.cr} value={b.cr}>{b.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Creature Size, Type, Alignment */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Size</label>
                                            <select
                                                value={size}
                                                onChange={e => setSize(e.target.value)}
                                                className="w-full bg-slate-950/80 border border-slate-700 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                                            >
                                                {CREATURE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Creature Type</label>
                                            <select
                                                value={type}
                                                onChange={e => setType(e.target.value)}
                                                className="w-full bg-slate-950/80 border border-slate-700 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                                            >
                                                {CREATURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Alignment</label>
                                            <select
                                                value={alignment}
                                                onChange={e => setAlignment(e.target.value)}
                                                className="w-full bg-slate-950/80 border border-slate-700 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                                            >
                                                {CREATURE_ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Combat Role / Stance */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-2">Combat Stance &amp; Role</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {COMBAT_ROLES.map(r => (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => setRole(r.id)}
                                                    className={`p-2.5 rounded-xl border text-left transition-all ${
                                                        role === r.id
                                                            ? 'bg-purple-950/60 border-purple-500 text-purple-200 shadow-sm'
                                                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                                                    }`}
                                                >
                                                    <div className="text-xs font-bold text-white">{r.label}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{r.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Signature Abilities Chips */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1.5">
                                            Signature Abilities &amp; Features
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {ALL_SIGNATURE_ABILITIES.map(ab => {
                                                const isSel = selectedAbilities.includes(ab);
                                                return (
                                                    <button
                                                        key={ab}
                                                        type="button"
                                                        onClick={() => toggleAbility(ab)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                                            isSel 
                                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold' 
                                                                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                                                        }`}
                                                    >
                                                        {isSel ? '✓ ' : '+ '}{ab}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Environment & Lore Notes */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Environment / Biome</label>
                                            <select
                                                value={environment}
                                                onChange={e => setEnvironment(e.target.value)}
                                                className="w-full bg-slate-950/80 border border-slate-700 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                                            >
                                                {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
                                            </select>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Custom Notes / Unique Lore (Optional)</label>
                                            <input
                                                value={customNotes}
                                                onChange={e => setCustomNotes(e.target.value)}
                                                placeholder="e.g. Wields a flaming glaive, immune to fire, speaks Abyssal"
                                                className="w-full bg-slate-950/80 border border-slate-700 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    <div className="pt-2 border-t border-slate-800 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="px-4 py-2.5 text-xs text-slate-400 hover:text-white transition-colors font-bold"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleForge}
                                            disabled={!name.trim() || isForging}
                                            className="px-6 py-2.5 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-950/50 flex items-center gap-2 transition-all transform hover:scale-[1.01]"
                                        >
                                            <Icon name="hammer" size={15}/> Forge 5e Creature
                                        </button>
                                    </div>
                                </div>
                            )
                        ) : (
                            /* Paste Text Tab */
                            isParsingText ? (
                                <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
                                    <div className="w-14 h-14 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin"></div>
                                    <div>
                                        <h3 className="text-lg font-bold text-orange-300 fantasy-font">Extracting 5e Statblock...</h3>
                                        <p className="text-xs text-slate-400 mt-1">Parsing stats, actions, spells, and defenses from raw text.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">
                                            Raw Statblock Text (D&amp;D Beyond, PDF, or Homebrew)
                                        </label>
                                        <textarea
                                            autoFocus
                                            value={pasteText}
                                            onChange={e => setPasteText(e.target.value)}
                                            placeholder="Paste the raw text of a monster statblock here..."
                                            className="w-full bg-slate-950/90 border border-slate-700 focus:border-orange-500 rounded-xl p-3.5 text-xs font-mono text-slate-200 outline-none h-64 resize-none custom-scroll"
                                        />
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <span className="text-[11px] text-slate-500">
                                            Automatically parses CR, AC, HP, ability scores, saving throws, skills, traits, and action formulas.
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleParseRawText}
                                            disabled={!pasteText.trim() || isParsingText}
                                            className="px-5 py-2.5 bg-gradient-to-r from-orange-700 to-amber-600 hover:from-orange-600 hover:to-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all"
                                        >
                                            <Icon name="wand-2" size={15}/> Extract &amp; Review Statblock
                                        </button>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MonsterForgeModal;

