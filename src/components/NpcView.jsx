import React, { useState, useRef, useEffect, useMemo } from 'react';
import Icon from './Icon'; 
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { parsePdf } from '../utils/dndBeyondParser.js';
import { enrichCharacter } from '../utils/srdEnricher.js';

import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { searchGithubModels } from '../utils/miniManifest';
import { Client } from "@gradio/client";
import { retrieveChunkedMap, storeChunkedMap, fileToBase64 } from '../utils/storageUtils';
import ResolvedImage from './ResolvedImage';
import { useDialog } from './DialogProvider';
import { useToast } from './ToastProvider';
import MonsterStatblockDrawer from './MonsterStatblockDrawer';
import MonsterForgeModal from './MonsterForgeModal';

const SafeImage = ({ src, className, alt }) => {
    if (!src) return null;
    if (src.startsWith('chunked:')) {
        return <ResolvedImage id={src} className={className} alt={alt} />;
    }
    return <img src={src} className={className} alt={alt} draggable={false} referrerPolicy="no-referrer" />;
};

// START CHANGE: Add generateNpc to props
const NpcView = ({ data, setData, role, setChatInput, setView, onPossess, aiHelper, apiKey, edition, onDiceRoll, diceLog, generateNpc, onOpenDiceTray }) => {
    const { updateCampaign, user } = useNewCampaign();
    const dialog = useDialog();
    const toast = useToast();
    // View State
    const [viewingNpcId, setViewingNpcId] = useState(null);
    const [editableName, setEditableName] = useState('');
    const [quickActorModal, setQuickActorModal] = useState(null); // { isOpen: boolean, category: 'npc' | 'companion', editId?: string, name?: string, image?: string, size?: number, ownerId?: string }

    const viewingNpc = useMemo(() => {
        if (!viewingNpcId) return null;
        const npcs = (data?.npcs || []).filter(n => n && n.id);
        return npcs.find(n => String(n.id) === String(viewingNpcId));
    }, [viewingNpcId, data?.npcs]);

    useEffect(() => {
        if (viewingNpc) {
            setEditableName(viewingNpc.name);
        }
    }, [viewingNpc]);

// END CHANGE
    const [showCreationMenu, setShowCreationMenu] = useState(false);
    const [showAiCreator, setShowAiCreator] = useState(false);
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('dm_npc_view_mode') || 'grid');
    useEffect(() => {
        localStorage.setItem('dm_npc_view_mode', viewMode);
    }, [viewMode]);
    // START CHANGE: Add Forge State
    const [showForge, setShowForge] = useState(false);
    const [forgeTab, setForgeTab] = useState('generate');
    const [forgeName, setForgeName] = useState('');
    const [forgeContext, setForgeContext] = useState('');
    const [isForging, setIsForging] = useState(false);
    // END CHANGE
    // Paste Text State
    const [pasteTextContent, setPasteTextContent] = useState('');
    const [isParsingText, setIsParsingText] = useState(false);
    // Compendium State
    const [showCompendium, setShowCompendium] = useState(false);
    const [compendiumSearch, setCompendiumSearch] = useState("");
    const [compendiumResults, setCompendiumResults] = useState([]);
    const [compendiumPreview, setCompendiumPreview] = useState(null);
    const [isLoadingCompendium, setIsLoadingCompendium] = useState(false);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [npcForModelSelection, setNpcForModelSelection] = useState(null);
    const [isNewNpc, setIsNewNpc] = useState(false);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);

    // Bestiary Search, Filter & Inspection State
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedType, setSelectedType] = useState("all");
    const [selectedCrBracket, setSelectedCrBracket] = useState("all");
    const [onlyFavorites, setOnlyFavorites] = useState(false);
    const [sortBy, setSortBy] = useState("name-asc");
    const [inspectingNpcId, setInspectingNpcId] = useState(null);

    const parseCrValue = (cr) => {
        if (cr === undefined || cr === null || cr === '') return 0;
        const str = String(cr).trim();
        if (str === '1/8' || str === '0.125') return 0.125;
        if (str === '1/4' || str === '0.25') return 0.25;
        if (str === '1/2' || str === '0.5') return 0.5;
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    };

    const formatCrDisplay = (cr) => {
        if (cr === undefined || cr === null || cr === '') return '1';
        const str = String(cr).trim();
        if (str === '0.125') return '1/8';
        if (str === '0.25') return '1/4';
        if (str === '0.5') return '1/2';
        return str;
    };

    const getCreatureType = (npc) => {
        const text = `${npc.race || ''} ${npc.class || ''} ${npc.type || ''}`.toLowerCase();
        const standardTypes = [
            'aberration', 'beast', 'celestial', 'construct', 'dragon', 
            'elemental', 'fey', 'fiend', 'giant', 'humanoid', 
            'monstrosity', 'ooze', 'plant', 'undead'
        ];
        for (const t of standardTypes) {
            if (text.includes(t)) return t;
        }
        return 'other';
    };

    const getCrBadgeColor = (cr) => {
        const val = parseCrValue(cr);
        if (val <= 2) return 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40';
        if (val <= 5) return 'bg-blue-950/90 text-blue-300 border-blue-500/40';
        if (val <= 10) return 'bg-amber-950/90 text-amber-300 border-amber-500/40';
        if (val <= 16) return 'bg-orange-950/90 text-orange-300 border-orange-500/40';
        return 'bg-purple-950/90 text-purple-300 border-purple-500/50';
    };

    // Debug & Tools State
    const [showDebug, setShowDebug] = useState(false);
    const [debugOutput, setDebugOutput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [miniSearchQuery, setMiniSearchQuery] = useState("");
    const [isSearchingMinis, setIsSearchingMinis] = useState(false);

    const handleMiniSearch = async (overrideQuery, typeFallback) => {
        const q = overrideQuery !== undefined ? overrideQuery : miniSearchQuery;
        if (!q) return;
        setIsSearchingMinis(true);
        let results = await searchGithubModels(q);
        if (results.length === 0 && typeFallback) results = await searchGithubModels(typeFallback);
        setAvailableModels(results);
        setIsSearchingMinis(false);
    };

    const fileInputRef = useRef(null);
    const debugInputRef = useRef(null); 
    const addLogEntry = useCharacterStore((state) => state.addLogEntry);

    // --- STALE STATE FIX ---
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    // Safety check for data
    const npcs = (data?.npcs || []).filter(n => n && n.id);
    
    // --- FIX: FILTER OUT INSTANCES (CLONES) ---
    // This stops the list from showing "Goblin", "Goblin", "Goblin" if you have 3 on the map.
    const visibleNpcs = (role === 'dm' ? npcs : npcs.filter(n => !n.isHidden)).filter(n => !n.isInstance);
    const assignedNpcs = visibleNpcs.filter(n => n.ownerId);
    const unassignedNpcs = visibleNpcs.filter(n => !n.ownerId);

    const inspectingNpc = useMemo(() => {
        if (!inspectingNpcId) return null;
        const npcsList = (data?.npcs || []).filter(n => n && n.id);
        return npcsList.find(n => String(n.id) === String(inspectingNpcId));
    }, [inspectingNpcId, data?.npcs]);

    const filteredUnassignedNpcs = useMemo(() => {
        return unassignedNpcs.filter(npc => {
            if (onlyFavorites && !npc.isFavorite) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const nameMatch = (npc.name || '').toLowerCase().includes(q);
                const raceMatch = (npc.race || '').toLowerCase().includes(q);
                const classMatch = (npc.class || '').toLowerCase().includes(q);
                const actionMatch = (npc.customActions || []).some(a => (a.name || '').toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q));
                const traitMatch = (npc.features || []).some(f => (f.name || '').toLowerCase().includes(q) || (f.desc || '').toLowerCase().includes(q));
                if (!nameMatch && !raceMatch && !classMatch && !actionMatch && !traitMatch) {
                    return false;
                }
            }

            if (selectedType !== 'all') {
                const cType = getCreatureType(npc);
                if (cType !== selectedType) return false;
            }

            if (selectedCrBracket !== 'all') {
                const crVal = parseCrValue(npc.level ?? npc.cr);
                if (selectedCrBracket === '0-1' && (crVal < 0 || crVal > 1)) return false;
                if (selectedCrBracket === '2-4' && (crVal < 2 || crVal > 4)) return false;
                if (selectedCrBracket === '5-10' && (crVal < 5 || crVal > 10)) return false;
                if (selectedCrBracket === '11-16' && (crVal < 11 || crVal > 16)) return false;
                if (selectedCrBracket === '10+' && crVal < 10) return false;
                if (selectedCrBracket === '17+' && crVal < 17) return false;
            }

            return true;
        }).sort((a, b) => {
            if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'name-desc') return (b.name || '').localeCompare(a.name || '');
            if (sortBy === 'cr-asc') return parseCrValue(a.level ?? a.cr) - parseCrValue(b.level ?? b.cr);
            if (sortBy === 'cr-desc') return parseCrValue(b.level ?? b.cr) - parseCrValue(a.level ?? a.cr);
            if (sortBy === 'hp-desc') return (b.hp?.max || b.hp?.current || 0) - (a.hp?.max || a.hp?.current || 0);
            return 0;
        });
    }, [unassignedNpcs, searchQuery, selectedType, selectedCrBracket, onlyFavorites, sortBy]);

    const handleDuplicateNpc = (npc, e) => {
        if (e) e.stopPropagation();
        const currentData = dataRef.current || {};
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        
        const newNpc = JSON.parse(JSON.stringify(npc));
        newNpc.id = Date.now();
        newNpc.name = `${npc.name || 'Entity'} (Copy)`;
        delete newNpc.isInstance;
        
        const updatedNpcs = [...currentNpcs, newNpc];
        updateCampaign({ npcs: updatedNpcs });
        toast(`Duplicated ${npc.name}!`, "success");
    };

    const handleToggleFavorite = (npc, e) => {
        if (e) e.stopPropagation();
        const currentData = dataRef.current || {};
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        
        const updatedNpcs = currentNpcs.map(n => {
            if (String(n.id) === String(npc.id)) {
                return { ...n, isFavorite: !n.isFavorite };
            }
            return n;
        });
        updateCampaign({ npcs: updatedNpcs });
    };

    const handleUpdateNpcHp = (npc, newHp) => {
        if (!npc?.id) return;
        const currentData = dataRef.current || {};
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        
        const updatedNpcs = currentNpcs.map(n => {
            if (String(n.id) === String(npc.id)) {
                return { ...n, hp: { ...(n.hp || {}), ...newHp } };
            }
            return n;
        });
        updateCampaign({ npcs: updatedNpcs });
    };

    const handleCardClick = (npc) => {
        if (npc.isSimple || npc.noSheet) {
            setQuickActorModal({
                isOpen: true,
                category: npc.ownerId ? 'companion' : 'npc',
                editId: npc.id,
                name: npc.name,
                image: npc.image,
                size: npc.size || 1,
                ownerId: npc.ownerId || null
            });
            return;
        }
        setInspectingNpcId(npc.id);
    };

    const getPlayerDisplayName = (ownerId) => {
        if (!ownerId) return 'Unassigned';
        const active = data?.activeUsers?.[ownerId];
        if (active) {
            const raw = typeof active === 'object' ? active.displayName : active;
            if (raw) return raw.includes('@') ? raw.split('@')[0] : raw;
        }
        const playerChar = (data?.players || []).find(p => p.ownerId === ownerId || String(data?.assignments?.[ownerId]) === String(p.id));
        if (playerChar) return playerChar.name;
        return 'Player';
    };

    const handleAssignNpc = (npc, targetUid, e) => {
        if (e) e.stopPropagation();
        const currentData = dataRef.current;
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        const newNpcs = currentNpcs.map(n => {
            if (String(n.id) === String(npc.id)) {
                return {
                    ...n,
                    ownerId: targetUid || null,
                    isHidden: targetUid ? false : n.isHidden // Automatically reveal when assigned!
                };
            }
            return n;
        });
        updateCampaign({ npcs: newNpcs });
    };

    // --- HELPER: Process Puter Image ---
    const processPuterImage = async (imgElement) => {
        try {
            const response = await fetch(imgElement.src);
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (e) { return null; }
    };

    // --- SAVE / UPDATE ---
    const handleSheetSave = (updatedNpc) => {
        const currentData = dataRef.current;
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        
        // Update the specific NPC by ID
        const newNpcs = currentNpcs.map(n => String(n.id) === String(updatedNpc.id) ? updatedNpc : n);
        
        // Force Cloud Save immediately
        updateCampaign({ npcs: newNpcs });
    };

    const handleNpcComplete = (npcData) => {
        const newNpc = { 
            isHidden: role === 'dm',
            quirk: npcData.quirk || "Imported",
            ...npcData,
            id: Date.now()
        };
        const currentData = dataRef.current;
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        const newNpcs = [...currentNpcs, newNpc];
        
        updateCampaign({ npcs: newNpcs });
        
        setShowAiCreator(false);
        setShowCreationMenu(false);
        setShowCompendium(false);
    };

    const handleForgeComplete = (finalNpc) => {
        setShowForge(false);
        setNpcForModelSelection(finalNpc);
        setAvailableModels([]);
        setIsNewNpc(true);
        setShowModelPicker(true);
        setMiniSearchQuery(finalNpc.name);
        handleMiniSearch(finalNpc.name, finalNpc.race);
    };

    const handlePasteTextSubmit = async () => {
        if (!pasteTextContent.trim()) return;
        setIsParsingText(true);
        
        const prompt = `You are a D&D 5e parser. The user will paste raw text from a monster stat block. Extract the stats, actions, HP, AC, and spells, and return it in this exact JSON format. DO NOT WRAP IN MARKDOWN. Only return valid JSON.
{
  "name": "Monster Name",
  "race": "Size Type (Alignment)",
  "class": "Monster",
  "level": "CR",
  "hp": { "current": 20, "max": 20 },
  "ac": 15,
  "speed": "30 ft.",
  "stats": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },
  "senses": { "darkvision": "60 ft.", "passivePerception": 10 },
  "bio": { "backstory": "Imported from text.", "appearance": "" },
  "inventory": [
    { "name": "Item Name", "qty": 1, "equipped": true, "baseAc": 13, "acBonus": 1, "desc": "Description" }
  ],
  "spells": [
    { "name": "Spell Name", "level": 1, "time": "1A", "desc": "Spell desc" }
  ],
  "customActions": [
    { "name": "Action Name", "desc": "Action description", "type": "Action", "hit": "+5", "dmg": "1d6+3" }
  ],
  "features": [
    { "name": "Trait Name", "desc": "Trait description", "source": "Trait" }
  ]
}

Instructions:
- Include all spells from 'Spellcasting' in the "spells" array.
- Include any 'Special Equipment' (like Staff of Defense) or armor mentioned in AC (like Mage Armor) in the "inventory" array.
- If an item provides an AC bonus (like a shield or magic item), include "acBonus": X.
- If an item is base armor (like Leather Armor), include "baseAc": X.
- Ensure armor, shields, and wielded weapons are marked "equipped": true.
- Include all Actions, Bonus Actions, and Reactions in "customActions", ensuring the "type" field matches appropriately (e.g., "Action", "Bonus Action", "Reaction").

Raw Statblock:
${pasteTextContent}`;

        try {
            let resultText = await aiHelper([{ role: 'user', content: prompt }]);
            if (typeof resultText !== 'string') {
                let extracted = resultText;
                if (resultText?.message?.content) extracted = resultText.message.content;
                else if (typeof resultText?.response?.text === 'function') extracted = await resultText.response.text();
                else if (typeof resultText?.text === 'function') extracted = await resultText.text();
                else if (resultText?.text) extracted = resultText.text;
                resultText = typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
            }
            let parsedData = {};
            try {
                const jsonMatch = resultText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsedData = JSON.parse(jsonMatch[0]);
                } else {
                    parsedData = JSON.parse(resultText);
                }
                
                // Enrich the extracted data using the 5e SRD
                const enrichedData = await enrichCharacter(parsedData);
                
                const finalNpc = { ...enrichedData, quirk: "Parsed from Text", isHidden: true, id: Date.now() };
                
                setShowForge(false);
                setPasteTextContent('');
                
                setNpcForModelSelection(finalNpc);
                setAvailableModels([]);
                setIsNewNpc(true);
                setShowModelPicker(true);
                setMiniSearchQuery(finalNpc.name);
                handleMiniSearch(finalNpc.name, finalNpc.race);
            } catch (e) {
                toast("Failed to parse the AI response into a valid NPC. Check the text format.", "error");
                console.error("AI Parse Error:", e, resultText);
            }
        } catch (e) {
            toast("AI request failed.", "error");
            console.error(e);
        }
        setIsParsingText(false);
    };

    const handleNameSave = () => {
        if (viewingNpc && editableName && viewingNpc.name !== editableName) {
            handleSheetSave({ ...viewingNpc, name: editableName });
        }
    };

    // --- D&D 5e API INTEGRATION ---
    const handleSelectCompendiumResult = async (result) => {
        if (!result || !result.url) return;
        setIsLoadingPreview(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co${result.url}`);
            const m = await res.json();
            setCompendiumPreview(m);
        } catch (e) {
            console.error("Failed to load compendium preview", e);
        }
        setIsLoadingPreview(false);
    };

    const searchCompendium = async (overrideQuery) => {
        const q = overrideQuery !== undefined ? overrideQuery : compendiumSearch;
        if (!q.trim()) return;
        setIsLoadingCompendium(true);
        try {
            const res = await fetch('https://www.dnd5eapi.co/api/monsters?name=' + encodeURIComponent(q.trim()));
            const data = await res.json();
            
            if (data.count === 0) {
                toast("No monsters found in the SRD with that name.", "error");
                setCompendiumResults([]);
                setCompendiumPreview(null);
            } else {
                const results = data.results.slice(0, 30);
                setCompendiumResults(results);
                if (results[0]) {
                    handleSelectCompendiumResult(results[0]);
                }
            }
        } catch (e) {
            console.error(e);
            toast("Could not connect to D&D 5e API.", "error");
        }
        setIsLoadingCompendium(false);
    };

    const handleCompendiumCategory = (cat) => {
        setCompendiumSearch(cat);
        searchCompendium(cat);
    };

    const importFromApi = async (monsterIndexUrl) => {
        setIsLoadingCompendium(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co${monsterIndexUrl}`);
            const m = await res.json();

            let imageUrl = "";
            if (m.image) {
                imageUrl = `https://www.dnd5eapi.co${m.image}`;
            } else if (window.puter) {
                try {
                    const imgEl = await window.puter.ai.txt2img(`High quality fantasy digital character illustration of a ${m.name} (${m.type}). 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`, { provider: 'replicate-image-generation', model: 'black-forest-labs/flux-schnell', ratio: { w: 1, h: 1 } });
                    imageUrl = await processPuterImage(imgEl);
                } catch (e) { console.error("Image gen failed", e); }
            }

            const acVal = Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class;
            const speedStr = typeof m.speed === 'object' ? Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;

            const parseSenseString = (senseStr) => {
                if (!senseStr) return 0;
                const match = String(senseStr).match(/(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
            };

            const getMod = (score) => Math.floor((score - 10) / 2);
            const modifiers = {
                str: getMod(m.strength), dex: getMod(m.dexterity), con: getMod(m.constitution),
                int: getMod(m.intelligence), wis: getMod(m.wisdom), cha: getMod(m.charisma)
            };

            const savingThrows = { str: false, dex: false, con: false, int: false, wis: false, cha: false };
            const skills = {};
            (m.proficiencies || []).forEach(p => {
                if (p.proficiency.index.startsWith('saving-throw-')) {
                    savingThrows[p.proficiency.index.replace('saving-throw-', '')] = true;
                } else if (p.proficiency.index.startsWith('skill-')) {
                    skills[p.proficiency.name.replace('Skill: ', '')] = true;
                }
            });

            const mapAction = (a, type) => {
                let dmgString = (a.damage || []).map(d => `${d.damage_dice || ''} ${d.damage_type?.name || ''}`).join(' + ').trim();
                let hitString = a.attack_bonus ? `+${a.attack_bonus}` : "";
                let dcString = a.dc ? `DC ${a.dc.dc_value} ${a.dc.dc_type?.name || ''}` : "";
                let desc = a.desc || "";
                if (dcString && !hitString) hitString = dcString;
                else if (dcString) desc = `**${dcString}**: ` + desc;
                return {
                    name: a.name + (a.usage ? ` (${a.usage.type} ${a.usage.times || a.usage.dice || ''})` : ""),
                    desc: desc,
                    type: type,
                    category: "Attack",
                    hit: hitString,
                    dmg: dmgString
                };
            };

            const spells = [];
            const spellSlots = {};
            (m.special_abilities || []).forEach(sa => {
                if (sa.spellcasting) {
                    if (sa.spellcasting.slots) {
                        Object.entries(sa.spellcasting.slots).forEach(([lvl, count]) => {
                            spellSlots[lvl] = { current: count, max: count };
                        });
                    }
                    if (sa.spellcasting.spells) {
                        sa.spellcasting.spells.forEach(sp => {
                            spells.push({
                                name: sp.name,
                                level: sp.level,
                                desc: sp.usage ? `Usage: ${sp.usage.type} ${sp.usage.times || ''}` : 'See SRD for details.',
                                time: 'Action',
                                range: 'Self',
                                hit: sp.level > 0 ? `DC ${sa.spellcasting.dc || 10}` : '',
                                dmg: ''
                            });
                        });
                    }
                }
            });

            const newNpc = {
                id: Date.now(),
                isHidden: true,
                name: m.name,
                race: `${m.size} ${m.type} (${m.alignment})`,
                class: "Monster",
                level: m.challenge_rating,
                hp: { current: m.hit_points, max: m.hit_points },
                ac: acVal,
                speed: speedStr,
                stats: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
                modifiers: modifiers,
                profBonus: m.proficiency_bonus || 2,
                initiative: modifiers.dex,
                savingThrows: savingThrows,
                skills: skills,
                proficiencies: { armor: '', weapons: '', tools: '', languages: m.languages || '' },
                defenses: {
                    resistances: (m.damage_resistances || []).join(', '),
                    immunities: [...(m.damage_immunities || []), ...(m.condition_immunities?.map(c => c.name || (typeof c === 'string' ? c : '')) || [])].join(', '),
                    vulnerabilities: (m.damage_vulnerabilities || []).join(', ')
                },
                darkvision: parseSenseString(m.senses?.darkvision),
                blindsight: parseSenseString(m.senses?.blindsight),
                tremorsense: parseSenseString(m.senses?.tremorsense),
                truesight: parseSenseString(m.senses?.truesight),
                passivePerception: m.senses?.passive_perception || 10,
                image: imageUrl,
                quirk: "SRD Import",
                bio: { backstory: `Imported from D&D 5e API.\nXP: ${m.xp}`, appearance: `A ${m.size} ${m.type}.` },
                customActions: [
                    ...(m.actions || []).map(a => mapAction(a, 'Action')),
                    ...(m.legendary_actions || []).map(a => mapAction(a, 'Legendary Action')),
                    ...(m.reactions || []).map(a => mapAction(a, 'Reaction'))
                ],
                features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" })),
                spells: spells,
                spellSlots: spellSlots
            };

            // Enrich the imported monster with SRD descriptions for missing spells and actions
            const enrichedNpc = await enrichCharacter(newNpc);

            setNpcForModelSelection(enrichedNpc);
            setAvailableModels([]);
            setIsNewNpc(true);
            setShowCompendium(false);
            setShowModelPicker(true);
            setMiniSearchQuery(m.name);
            handleMiniSearch(m.name, m.type);

        } catch (e) {
            console.error(e);
            toast("Failed to import monster details. Check console.", "error");
        }
        setIsLoadingCompendium(false);
    };

    const [isForging3D, setIsForging3D] = useState(false);
    const [forge3DStatus, setForge3DStatus] = useState("");

    const handleForge3D = async (npcForModel) => {
        if (!npcForModel) return;
        try {
            setIsForging3D(true);
            setForge3DStatus("The Forge is hot... Sculpting 3D mesh (this may take a minute).");
            
            let imageBlob = null;
            let imageUrl = npcForModel.image;
            if (!imageUrl) {
                toast("No image available to forge a 3D mini.", "error");
                setIsForging3D(false);
                return;
            }

            if (imageUrl.startsWith('chunked:')) {
                const result = await retrieveChunkedMap(imageUrl);
                if (result) {
                    if (typeof result === 'string') {
                        const res = await fetch(result);
                        imageBlob = await res.blob();
                    } else if (result instanceof Blob) {
                        imageBlob = result;
                    }
                }
            } else {
                const res = await fetch(imageUrl);
                imageBlob = await res.blob();
            }

            if (!imageBlob) throw new Error("Could not prepare image blob.");
            
            setForge3DStatus("Connecting to AI Forge... (May take 30-60s)");
            let app = null;
            const hfToken = import.meta.env.VITE_HF_TOKEN || localStorage.getItem('hf_token');
            const options = hfToken ? { hf_token: hfToken } : {};
            
            try {
                setForge3DStatus(`Waking up VAST-AI/TripoSG...`);
                app = await Client.connect("VAST-AI/TripoSG", options);
            } catch (e) {
                console.warn(`Space VAST-AI/TripoSG is asleep or unavailable.`, e);
            }
            
            if (!app) {
                throw new Error("The 3D Forge AI server is currently asleep or overloaded. Please try again later, or add a Hugging Face token in your Settings to wake it up!");
            }
            
            setForge3DStatus("Starting Forge Session...");
            try {
                await app.predict("/start_session", {});
            } catch (e) {
                console.warn("Failed to start session, may not be required", e);
            }
            
            setForge3DStatus("Sculpting 3D Mesh... Please wait. (1/2)");
            const meshResult = await app.predict("/image_to_3d", {
                image: imageBlob,
                seed: 0,
                num_inference_steps: 8,
                guidance_scale: 0,
                simplify: true,
                target_face_num: 10000
            });

            if (!meshResult.data || !meshResult.data[0]) {
                throw new Error("Invalid response from AI during 3D generation.");
            }

            setForge3DStatus("Texturing 3D Mesh... Please wait. (2/2)");
            const textureResult = await app.predict("/run_texture", {
                image: imageBlob,
                mesh_path: meshResult.data[0],
                seed: 0
            });

            if (!textureResult.data || !textureResult.data[0]) {
                throw new Error("Invalid response from AI during texturing.");
            }

            let glbUrl = "";
            const glbOutput = textureResult.data[0];
            if (typeof glbOutput === 'string') glbUrl = glbOutput;
            else if (glbOutput && glbOutput.url) glbUrl = glbOutput.url;
            else if (glbOutput && glbOutput.path) {
                glbUrl = `https://vast-ai-triposg.hf.space/file=${glbOutput.path}`;
            } else {
                 throw new Error("Invalid response from AI.");
            }

            setForge3DStatus("Downloading 3D Mesh...");
            const glbRes = await fetch(glbUrl);
            const glbBlob = await glbRes.blob();
            
            setForge3DStatus("Saving to DungeonMind...");
            const glbBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(glbBlob);
            });

            const newChunkedUrl = await storeChunkedMap(glbBase64, (npcForModel.name || "npc") + "_mini.glb");
            
            handleModelSelect({ url: newChunkedUrl, scale: 1, yOffset: 0 });
            
        } catch (e) {
            console.error(e);
            toast("3D Forge Failed: " + e.message, "error");
        } finally {
            setIsForging3D(false);
        }
    };

    const openModelPickerForExisting = (npcId) => {
        const npc = (data?.npcs || []).find(n => String(n.id) === String(npcId));
        if (!npc) return;
        setNpcForModelSelection(npc);
        setIsNewNpc(false);
        setAvailableModels([]);
        setShowModelPicker(true);
        setMiniSearchQuery(npc.name);
        handleMiniSearch(npc.name, npc.race);
    };

    const handleModelSelect = (model, forceStatue = false) => {
        const finalNpc = { ...npcForModelSelection };
        if (model) {
            finalNpc.modelUrl = model.url;
            finalNpc.modelScale = 1;
            finalNpc.modelYOffset = 0;
            finalNpc.forceStatue = forceStatue;
        } else {
            delete finalNpc.modelUrl;
            delete finalNpc.modelScale;
            delete finalNpc.modelYOffset;
            delete finalNpc.forceStatue;
        }
        if (isNewNpc) {
            handleNpcComplete(finalNpc);
            toast(`Successfully summoned ${finalNpc.name}!`, "success");
        } else {
            handleSheetSave(finalNpc);
            toast(`Updated 3D model for ${finalNpc.name}!`, "success");
            if (viewingNpcId === finalNpc.id) {
                useCharacterStore.getState().loadCharacter(finalNpc);
            }
        }
        setNpcForModelSelection(null);
        setShowModelPicker(false);
    };

    const createManualNpc = () => {
        handleNpcComplete({
            name: "New Enemy",
            race: "Unknown",
            class: "Monster",
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            hp: { current: 10, max: 10 },
            bio: { backstory: "..." }
        });
    };

    const handlePdfImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsProcessing(true);
        try {
            const rawData = await parsePdf(file);
            const charData = await enrichCharacter(rawData);
            handleNpcComplete(charData);
            toast(`Success! Imported ${charData.name}`, "success");
        } catch (err) { 
            console.error(err);
            toast("Import Failed: " + err.message, "error"); 
        }
        setIsProcessing(false);
        e.target.value = null; 
        setShowCreationMenu(false);
    };

    const handleDebugPdf = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const charData = await parsePdf(file);
            setDebugOutput(JSON.stringify(charData, null, 2));
            setShowDebug(true);
            setShowCreationMenu(false);
        } catch (err) {
            setDebugOutput("Error parsing PDF:\n" + err.message + "\n\nStack:\n" + err.stack);
            setShowDebug(true);
        }
        e.target.value = null;
    };

    const deleteNpc = async (id, e) => {
        e.stopPropagation(); 
        if(!(await dialog.confirm("Delete this NPC?"))) return;
        const currentData = dataRef.current;
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        const newNpcs = currentNpcs.filter(n => n.id !== id); 
        updateCampaign({ npcs: newNpcs });
    };

    const toggleHidden = (npc, e) => {
        e.stopPropagation();
        const updated = { ...npc, isHidden: !npc.isHidden }; 
        const currentData = dataRef.current;
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        const newNpcs = currentNpcs.map(n => n.id === npc.id ? updated : n);
        updateCampaign({ npcs: newNpcs });
    };

    const handleSaveQuickActor = async ({ category, editId, name, image, size, ownerId }) => {
        const cleanName = (name || '').trim() || 'New Entity';
        const cleanImage = (image || '').trim();
        const cleanSize = Number(size) || 1;
        const cleanOwnerId = ownerId || null;

        const currentData = dataRef.current || {};
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);

        if (editId) {
            const updatedNpcs = currentNpcs.map(n => String(n.id) === String(editId) ? {
                ...n,
                name: cleanName,
                image: cleanImage,
                size: cleanSize,
                ownerId: cleanOwnerId,
                isHidden: cleanOwnerId ? false : (n.isHidden ?? false),
                isSimple: true,
                noSheet: true
            } : n);
            updateCampaign({ npcs: updatedNpcs });
        } else {
            const newNpc = {
                id: `npc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                name: cleanName,
                image: cleanImage,
                size: cleanSize,
                type: 'npc',
                hp: { current: 10, max: 10 },
                ac: 10,
                speed: 30,
                ownerId: cleanOwnerId,
                isHidden: false,
                isSimple: true,
                noSheet: true
            };
            updateCampaign({ npcs: [...currentNpcs, newNpc] });
        }

        setQuickActorModal(null);
    };

    const handleDeleteQuickActor = async (modalData) => {
        if (!modalData?.editId) return;
        if (!(await dialog.confirm(`Delete ${modalData.name || 'this actor'}?`))) return;
        const currentData = dataRef.current || {};
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id && String(n.id) !== String(modalData.editId));
        updateCampaign({ npcs: currentNpcs });
        setQuickActorModal(null);
    };

    const openSheet = (npc) => {
        if (npc.isSimple || npc.noSheet) {
            setQuickActorModal({
                isOpen: true,
                category: npc.ownerId ? 'companion' : 'npc',
                editId: npc.id,
                name: npc.name,
                image: npc.image,
                size: npc.size || 1,
                ownerId: npc.ownerId || null
            });
            return;
        }
        useCharacterStore.getState().loadCharacter(npc);
        setViewingNpcId(npc.id);
    };

    if (viewingNpcId) {
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col h-full w-full animate-in fade-in">
                <div className="p-4 border-b border-slate-700 flex items-center gap-4 shrink-0 bg-slate-900">
                    <button onClick={() => setViewingNpcId(null)} className="text-slate-400 hover:text-white">
                        <Icon name="arrow-left" size={24} />
                    </button>
                    <input 
                        type="text"
                        value={editableName}
                        onChange={e => setEditableName(e.target.value)}
                        onBlur={handleNameSave}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        className="text-2xl font-bold text-white bg-transparent outline-none focus:bg-slate-800 rounded px-2 -mx-2 w-full"
                    />
                </div>
                <div className="flex-1 min-h-0 relative">
                    <SheetContainer 
                        character={viewingNpc} 
                        onSave={handleSheetSave} 
                        onBack={() => setViewingNpcId(null)} 
                        onDiceRoll={async (formula, options) => {
                            if (onDiceRoll) {
                                return await onDiceRoll(formula, { ...options, chat: true });
                            }
                        }} 
                        diceLog={diceLog}
                        onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                        isNpc={true} 
                        // --- FIX: PASS ROLE HERE ---
                        role={role}
                        // ---------------------------
                        onOpenModelPicker={() => openModelPickerForExisting(viewingNpcId)}
                        onOpenDiceTray={onOpenDiceTray}
                    />
                    {showModelPicker && npcForModelSelection && (
                        <div className="absolute inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                                <h3 className="font-bold text-white flex items-center gap-2"><Icon name="box" size={18}/> Select 3D Mini: {npcForModelSelection.name}</h3>
                                <button onClick={() => { setNpcForModelSelection(null); setShowModelPicker(false); }} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                            </div>
                            <div className="p-4 border-b border-slate-700 bg-slate-900 flex gap-2">
                                <input 
                                    autoFocus
                                    value={miniSearchQuery} 
                                    onChange={e => setMiniSearchQuery(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && handleMiniSearch()}
                                    placeholder="Search 3D Models (e.g. Dragon, Goblin)..." 
                                    className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-amber-500"
                                />
                                <button 
                                    onClick={() => handleMiniSearch()} 
                                    disabled={isSearchingMinis} 
                                    className="bg-amber-600 hover:bg-amber-500 px-4 rounded text-white font-bold flex items-center justify-center"
                                >
                                    {isSearchingMinis ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto custom-scroll bg-slate-950 flex-1">
                                {isSearchingMinis ? (
                                    <div className="text-center py-10 text-amber-500"><Icon name="loader" size={32} className="animate-spin mx-auto mb-2"/> Searching the Repository...</div>
                                ) : (
                                    <>
                                        <p className="text-slate-400 mb-4 text-sm">We found {availableModels.length} compatible 3D models.</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {availableModels.map((model, i) => (
                                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-2 flex flex-col justify-between transition-all group">
                                            <div>
                                                <div className="aspect-square bg-slate-900 rounded-md mb-2 overflow-hidden border border-slate-700 relative">
                                                {model.thumb ? <img src={model.thumb} className="w-full h-full object-cover" /> : <Icon name="box" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600"/>}
                                            </div>
                                                <div className="font-bold text-sm text-slate-200 truncate">{model.name}</div>
                                                <div className="text-[10px] text-slate-500 truncate">Scale: {model.scale}x</div>
                                            </div>
                                            <div className="flex gap-2 mt-2">
                                                <button onClick={() => handleModelSelect(model)} className="flex-1 text-center text-xs px-2 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-white font-bold transition-colors">Select</button>
                                                <button onClick={() => handleModelSelect(model, true)} className="text-center text-xs p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors" title="Select as stone statue">
                                                    <Icon name="gem" size={14}/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    <div onClick={() => handleForge3D(npcForModelSelection)} className="bg-slate-800 border border-purple-500/50 border-dashed rounded-lg p-2 cursor-pointer hover:border-purple-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                                        <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-purple-500/30 group-hover:border-purple-500 group-hover:scale-110 transition-transform">
                                            <Icon name="sparkles" size={24} className="text-purple-500 group-hover:text-purple-400"/>
                                        </div>
                                        <div className="font-bold text-sm text-purple-400 group-hover:text-purple-300 text-center">Forge 3D Mini</div>
                                        <div className="text-[10px] text-purple-500/70 text-center flex items-center gap-1">AI Generate <a href="https://huggingface.co/spaces/VAST-AI/TripoSG" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:text-purple-300" title="Powered by VAST-AI/TripoSG"><Icon name="external-link" size={10} /></a></div>
                                    </div>
                                
                                <div onClick={() => handleModelSelect(null)} className="bg-slate-800 border border-slate-700 border-dashed rounded-lg p-2 cursor-pointer hover:border-blue-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-slate-700 group-hover:border-blue-500/50">
                                            <Icon name="image" size={24} className="text-slate-500 group-hover:text-blue-400"/>
                                        </div>
                                        <div className="font-bold text-sm text-slate-200 group-hover:text-blue-400 text-center">2D Token Only</div>
                                        <div className="text-[10px] text-slate-500 text-center">Skip 3D Model</div>
                                    </div>
                                </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </div>
        );
    }

    return (
        <> {/* START CHANGE: Added Fragment wrapper */}
            <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-24">
                <div className="max-w-6xl mx-auto space-y-6">
                    
                    {/* REVAMPED HERO HEADER */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/30 border border-amber-900/40 p-5 sm:p-6 shadow-2xl backdrop-blur-md">
                        <div className="absolute -right-8 -bottom-10 opacity-5 pointer-events-none text-amber-400">
                            <Icon name="skull" size={240} />
                        </div>

                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-[10px] tracking-widest font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                        Campaign Compendium
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl lg:text-4xl fantasy-font text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 drop-shadow">
                                    Bestiary &amp; Entities
                                </h2>
                                <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-lg leading-relaxed">
                                    Manage world encounters, tactical adversary statblocks, and player companions with live health tracking.
                                </p>
                            </div>

                            {role === 'dm' && (
                                <div className="flex flex-wrap gap-2 items-center">
                                    <button 
                                        onClick={() => setShowCreationMenu(true)} 
                                        className="bg-gradient-to-r from-red-700 via-red-600 to-amber-600 hover:from-red-600 hover:to-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-red-950/50 flex items-center gap-2 transform transition-all hover:scale-[1.02] border border-red-500/40"
                                    >
                                        <Icon name="plus-circle" size={16}/> <span>Summon Entity</span>
                                    </button>

                                    {/* View Toggle */}
                                    <div className="flex bg-slate-950/80 rounded-xl p-1 border border-slate-700/80 ml-1 shadow-inner">
                                        <button 
                                            onClick={() => setViewMode('grid')} 
                                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                                viewMode === 'grid' 
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm' 
                                                    : 'text-slate-400 hover:text-slate-200'
                                            }`}
                                            title="Grid Cards View"
                                        >
                                            <Icon name="layout-grid" size={14}/>
                                            <span className="hidden sm:inline">Grid</span>
                                        </button>
                                        <button 
                                            onClick={() => setViewMode('list')} 
                                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                                viewMode === 'list' 
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm' 
                                                    : 'text-slate-400 hover:text-slate-200'
                                            }`}
                                            title="Tactical Table View"
                                        >
                                            <Icon name="list" size={14}/>
                                            <span className="hidden sm:inline">Table</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Live Quick Stats Strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-slate-800/80 text-xs">
                            <div 
                                onClick={() => { setSearchQuery(''); setSelectedType('all'); setSelectedCrBracket('all'); setOnlyFavorites(false); }}
                                className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 p-3 rounded-xl cursor-pointer transition-all shadow-sm"
                            >
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Monsters</div>
                                <div className="text-xl font-black text-amber-400 font-mono mt-0.5">{unassignedNpcs.length}</div>
                            </div>
                            <div 
                                onClick={() => { setSelectedCrBracket('10+'); setOnlyFavorites(false); }}
                                className={`p-3 rounded-xl cursor-pointer transition-all shadow-sm border ${
                                    selectedCrBracket === '10+'
                                        ? 'bg-orange-950/60 border-orange-500/50'
                                        : 'bg-slate-900/80 hover:bg-slate-800/80 border-slate-800 hover:border-orange-900/40'
                                }`}
                            >
                                <div className="text-[10px] uppercase font-bold text-orange-400 tracking-wider">High Threat (CR 10+)</div>
                                <div className="text-xl font-black text-orange-300 font-mono mt-0.5">
                                    {unassignedNpcs.filter(n => parseCrValue(n.level ?? n.cr) >= 10).length}
                                </div>
                            </div>
                            <div 
                                onClick={() => setOnlyFavorites(prev => !prev)}
                                className={`p-3 rounded-xl cursor-pointer transition-all shadow-sm border ${
                                    onlyFavorites 
                                        ? 'bg-amber-950/60 border-amber-500/50' 
                                        : 'bg-slate-900/80 hover:bg-slate-800/80 border-slate-800 hover:border-amber-900/40'
                                }`}
                            >
                                <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider flex items-center gap-1">
                                    <Icon name="star" size={11} className="fill-amber-400 text-amber-400" /> Favorites
                                </div>
                                <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
                                    {unassignedNpcs.filter(n => n.isFavorite).length}
                                </div>
                            </div>
                            <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl shadow-sm">
                                <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Companions</div>
                                <div className="text-xl font-black text-indigo-300 font-mono mt-0.5">{assignedNpcs.length}</div>
                            </div>
                        </div>
                    </div>

                {/* 1. COMPANIONS & ASSIGNED NPCS SECTION */}
                {assignedNpcs.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-indigo-900/60 pb-2">
                            <div className="p-1.5 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-500/30">
                                <Icon name="shield" size={18} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-indigo-300">Companions & Assigned NPCs</h3>
                                <p className="text-xs text-slate-400">Creatures, familiars, and allies under player control</p>
                            </div>
                            <span className="ml-auto bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-1 rounded-full border border-indigo-500/30 font-bold">
                                {assignedNpcs.length}
                            </span>
                        </div>
                        <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
                            {assignedNpcs.map(npc => {
                                const assignedName = getPlayerDisplayName(npc.ownerId);
                                return viewMode === 'grid' ? (
                                    <div key={npc.id} onClick={() => handleCardClick(npc)} className={`group relative bg-slate-800 rounded-xl overflow-hidden border transition-all hover:-translate-y-1 cursor-pointer shadow-lg border-indigo-500/50 hover:border-indigo-400`}>
                                        <div className="h-32 bg-slate-700 relative overflow-hidden">
                                            {npc.image ? <SafeImage src={npc.image} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt={npc.name} /> : <div className="w-full h-full flex items-center justify-center bg-slate-700 opacity-20"><Icon name="skull" size={64}/></div>}
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                                            <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-10">
                                                <div className="bg-indigo-950/95 text-indigo-200 text-xs font-bold px-2 py-1 rounded border border-indigo-500/40 flex items-center gap-1.5 shadow-md">
                                                    <Icon name="user" size={12} className="text-indigo-400"/>
                                                    <span>Assigned: <strong className="text-white">{assignedName}</strong></span>
                                                </div>
                                                {npc.isHidden && <div className="bg-slate-900/80 text-slate-300 text-xs font-bold px-2 py-1 rounded border border-slate-600 flex items-center gap-1"><Icon name="eye-off" size={12}/> Hidden</div>}
                                            </div>
                                        </div>
                                        <div className="p-4 relative -mt-8">
                                            <div className="flex justify-between items-end">
                                                <div className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-indigo-500/50 shadow-2xl flex items-center justify-center overflow-hidden shrink-0">
                                                    {npc.image ? <SafeImage src={npc.image} className="w-full h-full object-cover" alt={npc.name} /> : <span className="text-2xl font-bold text-slate-500">{npc.name?.[0]}</span>}
                                                </div>
                                                <div className="flex-1 ml-3 mb-1 min-w-0">
                                                    <h3 className="text-xl font-bold text-slate-100 leading-tight group-hover:text-indigo-300 truncate">{npc.name}</h3>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider truncate">{npc.race || 'Companion'} {npc.class || ''}</p>
                                                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded border border-indigo-500/30 font-mono font-bold">COMPANION</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {role === 'dm' && (
                                                <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                        <Icon name="user" size={13} className="text-indigo-400 shrink-0" />
                                                        <select 
                                                            value={npc.ownerId || ""}
                                                            onChange={(e) => handleAssignNpc(npc, e.target.value || null, e)}
                                                            className="bg-slate-900 border border-indigo-900/80 hover:border-indigo-500 text-xs text-indigo-200 rounded px-2 py-1 outline-none cursor-pointer w-full transition-colors font-medium"
                                                            title="Reassign or unassign player"
                                                        >
                                                            <option value="">Clear Assignment</option>
                                                            {Object.entries(data?.activeUsers || {}).map(([uid, rawName]) => {
                                                                const displayName = typeof rawName === 'object' ? rawName?.displayName : rawName;
                                                                const cleanName = displayName?.includes('@') ? displayName.split('@')[0] : (displayName || 'Player');
                                                                return (
                                                                    <option key={uid} value={uid}>
                                                                        Assign: {cleanName}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {role === 'dm' && (
                                            <div className="absolute top-2 left-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                <button onClick={(e) => deleteNpc(npc.id, e)} className="p-2 bg-red-900/80 text-white rounded hover:bg-red-700 shadow-lg" title="Delete"><Icon name="trash-2" size={14}/></button>
                                                <button onClick={(e) => toggleHidden(npc, e)} className="p-2 bg-slate-700/80 text-white rounded hover:bg-slate-600 shadow-lg" title={npc.isHidden ? "Reveal to Players" : "Hide from Players"}><Icon name={npc.isHidden ? "eye" : "eye-off"} size={14}/></button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div key={npc.id} onClick={() => handleCardClick(npc)} className={`group bg-slate-800 border border-indigo-500/50 hover:border-indigo-400 rounded-xl p-3 flex items-center gap-4 cursor-pointer shadow-lg transition-all hover:-translate-y-0.5`}>
                                        <div className="w-12 h-12 rounded-lg bg-slate-700 border border-indigo-500/40 overflow-hidden shrink-0 relative">
                                            {npc.image ? <SafeImage src={npc.image} className="w-full h-full object-cover" alt={npc.name} /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 text-xl">{npc.name?.[0]}</div>}
                                            {npc.isHidden && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Icon name="eye-off" size={16} className="text-slate-300"/></div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-100 group-hover:text-indigo-300 truncate">{npc.name}</h3>
                                                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded border border-indigo-500/30 font-mono font-bold shrink-0">COMPANION</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                <p className="text-xs text-amber-600 font-bold uppercase tracking-wider truncate">{npc.race || 'Companion'} {npc.class || ''}</p>
                                                <span className="text-xs bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded flex items-center gap-1 font-semibold">
                                                    <Icon name="user" size={11} className="text-indigo-400"/>
                                                    <span>Assigned to <strong className="text-white">{assignedName}</strong></span>
                                                </span>
                                            </div>
                                        </div>
                                        {role === 'dm' && (
                                            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                                <select 
                                                    value={npc.ownerId || ""}
                                                    onChange={(e) => handleAssignNpc(npc, e.target.value || null, e)}
                                                    className="bg-slate-900 border border-indigo-900/80 hover:border-indigo-500 text-xs text-indigo-200 rounded px-2 py-1 outline-none cursor-pointer"
                                                    title="Reassign or unassign player"
                                                >
                                                    <option value="">Clear Assignment</option>
                                                    {Object.entries(data?.activeUsers || {}).map(([uid, rawName]) => {
                                                        const displayName = typeof rawName === 'object' ? rawName?.displayName : rawName;
                                                        const cleanName = displayName?.includes('@') ? displayName.split('@')[0] : (displayName || 'Player');
                                                        return (
                                                            <option key={uid} value={uid}>
                                                                Assign: {cleanName}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                                <button onClick={(e) => { e.stopPropagation(); toggleHidden(npc, e); }} className="p-2 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors" title={npc.isHidden ? "Reveal to Players" : "Hide from Players"}><Icon name={npc.isHidden ? "eye" : "eye-off"} size={16}/></button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteNpc(npc.id, e); }} className="p-2 bg-red-900/50 text-red-400 rounded hover:bg-red-700 hover:text-white transition-colors" title="Delete"><Icon name="trash-2" size={16}/></button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 2. BESTIARY / UNASSIGNED NPCS SECTION */}
                <div className="space-y-4">
                    {/* Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3 pt-2">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                <Icon name="skull" size={20} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                    Monsters &amp; Bestiary
                                </h3>
                                <p className="text-xs text-slate-400">World encounters, adversary statblocks, and lore entities</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full border border-slate-700 font-mono font-bold flex items-center gap-1.5">
                                <span className="text-amber-400">{filteredUnassignedNpcs.length}</span>
                                <span className="text-slate-500">/</span>
                                <span>{unassignedNpcs.length} Creatures</span>
                            </span>
                        </div>
                    </div>

                    {/* Filter & Search Toolbar */}
                    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Search Input */}
                            <div className="relative flex-1 min-w-[220px]">
                                <Icon name="search" size={16} className="absolute left-3 top-2.5 text-slate-500" />
                                <input 
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by name, race, action, trait..."
                                    className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-500 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
                                />
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                                    >
                                        <Icon name="x" size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Creature Type Filter */}
                            <select
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                                className="bg-slate-950 border border-slate-700/80 hover:border-slate-600 focus:border-amber-500 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none cursor-pointer transition-colors"
                            >
                                <option value="all">All Creature Types</option>
                                <option value="aberration">Aberration</option>
                                <option value="beast">Beast</option>
                                <option value="celestial">Celestial</option>
                                <option value="construct">Construct</option>
                                <option value="dragon">Dragon</option>
                                <option value="elemental">Elemental</option>
                                <option value="fey">Fey</option>
                                <option value="fiend">Fiend</option>
                                <option value="giant">Giant</option>
                                <option value="humanoid">Humanoid</option>
                                <option value="monstrosity">Monstrosity</option>
                                <option value="ooze">Ooze</option>
                                <option value="plant">Plant</option>
                                <option value="undead">Undead</option>
                            </select>

                            {/* CR Bracket Filter */}
                            <select
                                value={selectedCrBracket}
                                onChange={(e) => setSelectedCrBracket(e.target.value)}
                                className="bg-slate-950 border border-slate-700/80 hover:border-slate-600 focus:border-amber-500 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none cursor-pointer transition-colors"
                            >
                                <option value="all">All Challenge Ratings</option>
                                <option value="0-1">CR 0 – 1 (Minion / Low)</option>
                                <option value="2-4">CR 2 – 4 (Standard)</option>
                                <option value="5-10">CR 5 – 10 (Challenging)</option>
                                <option value="11-16">CR 11 – 16 (High Threat)</option>
                                <option value="10+">CR 10+ (Bosses &amp; Titans)</option>
                                <option value="17+">CR 17+ (Legendary / Epic)</option>
                            </select>

                            {/* Sort Dropdown */}
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="bg-slate-950 border border-slate-700/80 hover:border-slate-600 focus:border-amber-500 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none cursor-pointer transition-colors"
                            >
                                <option value="name-asc">Sort: Name (A – Z)</option>
                                <option value="name-desc">Sort: Name (Z – A)</option>
                                <option value="cr-asc">Sort: CR (Low to High)</option>
                                <option value="cr-desc">Sort: CR (High to Low)</option>
                                <option value="hp-desc">Sort: HP (Highest)</option>
                            </select>
                        </div>

                        {/* Quick Filter Chips */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Quick:</span>
                                {[
                                    { label: 'All', active: selectedType === 'all' && selectedCrBracket === 'all' && !onlyFavorites, onClick: () => { setSelectedType('all'); setSelectedCrBracket('all'); setOnlyFavorites(false); } },
                                    { label: '⭐ Starred', active: onlyFavorites, onClick: () => setOnlyFavorites(p => !p) },
                                    { label: '🔥 Bosses (CR 10+)', active: selectedCrBracket === '10+', onClick: () => setSelectedCrBracket(selectedCrBracket === '10+' ? 'all' : '10+') },
                                    { label: '🐉 Dragons', active: selectedType === 'dragon', onClick: () => setSelectedType(selectedType === 'dragon' ? 'all' : 'dragon') },
                                    { label: '💀 Undead', active: selectedType === 'undead', onClick: () => setSelectedType(selectedType === 'undead' ? 'all' : 'undead') },
                                    { label: '👿 Fiends', active: selectedType === 'fiend', onClick: () => setSelectedType(selectedType === 'fiend' ? 'all' : 'fiend') },
                                    { label: '🐺 Beasts', active: selectedType === 'beast', onClick: () => setSelectedType(selectedType === 'beast' ? 'all' : 'beast') },
                                    { label: '⚔️ Humanoids', active: selectedType === 'humanoid', onClick: () => setSelectedType(selectedType === 'humanoid' ? 'all' : 'humanoid') }
                                ].map((chip, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={chip.onClick}
                                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all font-medium ${
                                            chip.active
                                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold shadow-sm'
                                                : 'bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
                                        }`}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[11px] text-slate-400 font-mono">
                                    Showing <strong className="text-amber-400">{filteredUnassignedNpcs.length}</strong> of {unassignedNpcs.length}
                                </span>
                                {(searchQuery || selectedType !== 'all' || selectedCrBracket !== 'all' || onlyFavorites) && (
                                    <button
                                        onClick={() => {
                                            setSearchQuery('');
                                            setSelectedType('all');
                                            setSelectedCrBracket('all');
                                            setOnlyFavorites(false);
                                        }}
                                        className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 transition-colors"
                                    >
                                        <Icon name="rotate-ccw" size={12} /> Reset
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Monster Grid or List */}
                    <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
                        {filteredUnassignedNpcs.map(npc => {
                            const acVal = typeof npc.ac === 'object' ? npc.ac.value : (npc.ac || 10);
                            const hpCurrent = npc.hp?.current ?? npc.hp?.max ?? 10;
                            const hpMax = npc.hp?.max ?? 10;
                            const hpPercent = Math.max(0, Math.min(100, Math.round((hpCurrent / hpMax) * 100)));
                            const crDisplay = formatCrDisplay(npc.level ?? npc.cr);
                            const speedVal = npc.speed || "30 ft.";
                            const topAction = npc.customActions?.[0];

                            return viewMode === 'grid' ? (
                                <div 
                                    key={npc.id} 
                                    onClick={() => handleCardClick(npc)} 
                                    className={`group relative bg-slate-900/90 hover:bg-slate-900 rounded-2xl overflow-hidden border transition-all duration-200 hover:-translate-y-1 cursor-pointer shadow-lg flex flex-col justify-between ${
                                        npc.isHidden 
                                            ? 'border-dashed border-slate-700 opacity-80' 
                                            : npc.isFavorite 
                                                ? 'border-amber-500/50 hover:border-amber-400 shadow-amber-950/20' 
                                                : 'border-slate-800 hover:border-amber-500/50'
                                    }`}
                                >
                                    <div>
                                        {/* Card Banner / Art */}
                                        <div className="h-36 bg-slate-950 relative overflow-hidden">
                                            {npc.image ? (
                                                <SafeImage src={npc.image} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-300" alt={npc.name} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-700 opacity-30"><Icon name="skull" size={72}/></div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
                                            
                                            {/* CR Badge Top-Left */}
                                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                                                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border font-mono shadow-md backdrop-blur-md ${getCrBadgeColor(npc.level ?? npc.cr)}`}>
                                                    CR {crDisplay}
                                                </span>
                                            </div>

                                            {/* Action Icons Top-Right */}
                                            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10" onClick={e => e.stopPropagation()}>
                                                {/* Favorite Button */}
                                                <button 
                                                    onClick={(e) => handleToggleFavorite(npc, e)}
                                                    className={`p-1.5 rounded-lg border transition-all ${
                                                        npc.isFavorite 
                                                            ? 'bg-amber-950/90 text-amber-400 border-amber-500/50 shadow-md' 
                                                            : 'bg-slate-900/80 text-slate-400 hover:text-amber-300 border-slate-700/80 opacity-0 group-hover:opacity-100'
                                                    }`}
                                                    title={npc.isFavorite ? "Favorited" : "Favorite"}
                                                >
                                                    <Icon name="star" size={13} className={npc.isFavorite ? "fill-amber-400 text-amber-400" : ""} />
                                                </button>

                                                {/* Hidden State Indicator & Toggle */}
                                                {role === 'dm' && (
                                                    <button 
                                                        onClick={(e) => toggleHidden(npc, e)}
                                                        className={`p-1.5 rounded-lg border transition-all ${
                                                            npc.isHidden 
                                                                ? 'bg-slate-900/90 text-slate-300 border-slate-600' 
                                                                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-700/80 opacity-0 group-hover:opacity-100'
                                                        }`}
                                                        title={npc.isHidden ? "Hidden from Players (Click to Reveal)" : "Visible to Players (Click to Hide)"}
                                                    >
                                                        <Icon name={npc.isHidden ? "eye-off" : "eye"} size={13}/>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Hover Quick Action Bar */}
                                            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10" onClick={e => e.stopPropagation()}>
                                                <button 
                                                    onClick={() => handleCardClick(npc)} 
                                                    className="px-2.5 py-1 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold rounded-lg text-xs shadow-lg flex items-center gap-1 transition-colors"
                                                    title="View 5e Statblock"
                                                >
                                                    <Icon name="scroll" size={12} /> Statblock
                                                </button>
                                                <button 
                                                    onClick={() => openSheet(npc)} 
                                                    className="p-1.5 bg-slate-900/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg shadow-md transition-colors"
                                                    title="Edit Full Sheet"
                                                >
                                                    <Icon name="edit-3" size={13} />
                                                </button>
                                                {role === 'dm' && (
                                                    <>
                                                        <button 
                                                            onClick={(e) => handleDuplicateNpc(npc, e)} 
                                                            className="p-1.5 bg-slate-900/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg shadow-md transition-colors"
                                                            title="Duplicate (Clone)"
                                                        >
                                                            <Icon name="copy" size={13} />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => deleteNpc(npc.id, e)} 
                                                            className="p-1.5 bg-red-950/90 hover:bg-red-800 text-red-300 hover:text-white border border-red-800/60 rounded-lg shadow-md transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Icon name="trash-2" size={13} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card Details */}
                                        <div className="p-4 pt-3 space-y-3">
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-100 leading-tight group-hover:text-amber-400 transition-colors truncate" title={npc.name}>
                                                    {npc.name}
                                                </h3>
                                                <p className="text-xs text-amber-600/90 font-medium tracking-wide truncate mt-0.5">
                                                    {npc.race || 'Creature'} {npc.class && npc.class !== 'Monster' ? `• ${npc.class}` : ''}
                                                </p>
                                            </div>

                                            {/* Combat Vitals Strip */}
                                            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800">
                                                {/* AC */}
                                                <div className="bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5 text-xs" title="Armor Class">
                                                    <Icon name="shield" size={13} className="text-blue-400 shrink-0"/>
                                                    <div>
                                                        <div className="font-bold text-white font-mono leading-none">{acVal}</div>
                                                        <div className="text-[9px] text-slate-500 uppercase font-semibold">AC</div>
                                                    </div>
                                                </div>

                                                {/* HP with health bar */}
                                                <div className="bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 text-xs col-span-1 min-w-0" title={`Hit Points: ${hpCurrent} / ${hpMax}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className="flex items-center gap-1 font-bold text-white font-mono leading-none">
                                                            <Icon name="heart" size={11} className="text-red-400 shrink-0"/>
                                                            {hpCurrent}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500 font-mono">/{hpMax}</span>
                                                    </div>
                                                    {/* Mini health bar */}
                                                    <div className="w-full bg-slate-900 rounded-full h-1 mt-1 overflow-hidden">
                                                        <div 
                                                            className={`h-full ${
                                                                hpPercent > 50 ? 'bg-emerald-500' :
                                                                hpPercent > 25 ? 'bg-amber-500' : 'bg-red-500'
                                                            }`}
                                                            style={{ width: `${hpPercent}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Speed */}
                                                <div className="bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5 text-xs truncate" title={`Speed: ${speedVal}`}>
                                                    <Icon name="zap" size={13} className="text-emerald-400 shrink-0"/>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-slate-200 truncate leading-none">{String(speedVal).split(' ')?.[0] || '30'}</div>
                                                        <div className="text-[9px] text-slate-500 uppercase font-semibold">ft.</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Primary Action Snippet Preview */}
                                            {topAction && (
                                                <div className="bg-slate-950/60 rounded-lg px-2.5 py-1.5 border border-slate-800/80 text-[11px] text-slate-300 flex items-center justify-between gap-2 truncate">
                                                    <span className="font-semibold text-amber-300/90 truncate flex items-center gap-1">
                                                        <Icon name="swords" size={11} className="text-amber-400 shrink-0"/>
                                                        {topAction.name}
                                                    </span>
                                                    {(topAction.hit || topAction.dmg) && (
                                                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                                            {topAction.hit ? `${topAction.hit}` : ''} {topAction.dmg ? `(${topAction.dmg})` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Assign to player dropdown (DM mode only) */}
                                    {role === 'dm' && (
                                        <div className="px-4 pb-3 pt-1" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-1.5">
                                                <Icon name="user" size={12} className="text-slate-500 shrink-0" />
                                                <select 
                                                    value={npc.ownerId || ""}
                                                    onChange={(e) => handleAssignNpc(npc, e.target.value || null, e)}
                                                    className="bg-slate-950 border border-slate-800 hover:border-indigo-500 text-[11px] text-slate-400 hover:text-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer w-full transition-colors font-medium"
                                                    title="Assign Monster to Player"
                                                >
                                                    <option value="">Assign to Player...</option>
                                                    {Object.entries(data?.activeUsers || {}).map(([uid, rawName]) => {
                                                        const displayName = typeof rawName === 'object' ? rawName?.displayName : rawName;
                                                        const cleanName = displayName?.includes('@') ? displayName.split('@')[0] : (displayName || 'Player');
                                                        return (
                                                            <option key={uid} value={uid}>
                                                                Assign: {cleanName}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Revamped List View Row (Tactical Table) */
                                <div 
                                    key={npc.id} 
                                    onClick={() => handleCardClick(npc)} 
                                    className={`group bg-slate-900/90 hover:bg-slate-900 border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer shadow-md transition-all hover:-translate-y-0.5 ${
                                        npc.isHidden 
                                            ? 'border-dashed border-slate-700 opacity-80' 
                                            : npc.isFavorite 
                                                ? 'border-amber-500/50 hover:border-amber-400' 
                                                : 'border-slate-800 hover:border-amber-500/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 relative">
                                            {npc.image ? (
                                                <SafeImage src={npc.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={npc.name} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center font-bold text-slate-600 text-xl">{npc.name?.[0]}</div>
                                            )}
                                            {npc.isHidden && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <Icon name="eye-off" size={14} className="text-slate-300"/>
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-100 group-hover:text-amber-400 truncate text-base leading-tight">{npc.name}</h3>
                                                {npc.isFavorite && <Icon name="star" size={13} className="text-amber-400 fill-amber-400 shrink-0"/>}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-xs text-amber-600/90 font-medium truncate">
                                                    {npc.race || 'Creature'} {npc.class && npc.class !== 'Monster' ? `• ${npc.class}` : ''}
                                                </p>
                                                {topAction && (
                                                    <span className="hidden md:inline text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-mono truncate max-w-[200px]">
                                                        {topAction.name}: {topAction.hit || ''} {topAction.dmg || ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Vitals Badges */}
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border font-mono ${getCrBadgeColor(npc.level ?? npc.cr)}`}>
                                            CR {crDisplay}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-950 border border-slate-800 text-blue-300 font-mono flex items-center gap-1.5" title="Armor Class">
                                            <Icon name="shield" size={13} className="text-blue-400"/> {acVal}
                                        </span>
                                        <div className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-950 border border-slate-800 text-red-300 font-mono flex items-center gap-1.5" title={`HP: ${hpCurrent}/${hpMax}`}>
                                            <Icon name="heart" size={13} className="text-red-400"/>
                                            <span>{hpCurrent}<span className="text-slate-500 font-normal">/{hpMax}</span></span>
                                        </div>
                                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-950 border border-slate-800 text-emerald-300 font-mono flex items-center gap-1.5" title="Speed">
                                            <Icon name="zap" size={13} className="text-emerald-400"/> {String(speedVal).split(' ')?.[0] || '30'}ft
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                        <button 
                                            onClick={() => handleCardClick(npc)} 
                                            className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30 text-xs font-bold flex items-center gap-1 transition-colors"
                                            title="View 5e Statblock"
                                        >
                                            <Icon name="scroll" size={14} />
                                            <span className="hidden lg:inline">Statblock</span>
                                        </button>
                                        <button 
                                            onClick={() => openSheet(npc)} 
                                            className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors"
                                            title="Full Sheet"
                                        >
                                            <Icon name="edit-3" size={15} />
                                        </button>
                                        <button 
                                            onClick={(e) => handleToggleFavorite(npc, e)} 
                                            className={`p-1.5 rounded-lg border transition-colors ${npc.isFavorite ? 'bg-amber-950 text-amber-400 border-amber-500/50' : 'bg-slate-950 text-slate-400 hover:text-amber-300 border-slate-800'}`}
                                            title="Favorite"
                                        >
                                            <Icon name="star" size={15} className={npc.isFavorite ? "fill-amber-400" : ""} />
                                        </button>
                                        {role === 'dm' && (
                                            <>
                                                <button 
                                                    onClick={(e) => handleDuplicateNpc(npc, e)} 
                                                    className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors"
                                                    title="Duplicate"
                                                >
                                                    <Icon name="copy" size={15} />
                                                </button>
                                                <button 
                                                    onClick={(e) => toggleHidden(npc, e)} 
                                                    className="p-1.5 bg-slate-950 text-slate-300 rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors"
                                                    title={npc.isHidden ? "Reveal to Players" : "Hide from Players"}
                                                >
                                                    <Icon name={npc.isHidden ? "eye" : "eye-off"} size={15}/>
                                                </button>
                                                <button 
                                                    onClick={(e) => deleteNpc(npc.id, e)} 
                                                    className="p-1.5 bg-red-950/80 text-red-300 rounded-lg border border-red-800/60 hover:bg-red-800 hover:text-white transition-colors"
                                                    title="Delete"
                                                >
                                                    <Icon name="trash-2" size={15}/>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Empty States */}
                    {filteredUnassignedNpcs.length === 0 && unassignedNpcs.length > 0 && (
                        <div className="py-12 text-center border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
                            <Icon name="search" size={36} className="mx-auto text-slate-500 mb-3" />
                            <h4 className="text-slate-200 font-bold mb-1">No matching creatures found</h4>
                            <p className="text-slate-500 text-xs mb-4">Try clearing or adjusting your search filters.</p>
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setSelectedType('all');
                                    setSelectedCrBracket('all');
                                    setOnlyFavorites(false);
                                }}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs rounded-lg border border-slate-700 transition-colors"
                            >
                                Clear All Filters
                            </button>
                        </div>
                    )}

                    {visibleNpcs.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
                            <Icon name="ghost" size={48} className="mx-auto text-slate-600 mb-4"/>
                            <h4 className="text-slate-300 font-bold mb-1">Your Bestiary is empty</h4>
                            <p className="text-slate-500 text-xs mb-4">Summon an entity from the 5e SRD, AI Forge, or create a quick token.</p>
                            {role === 'dm' && (
                                <button
                                    onClick={() => setShowCreationMenu(true)}
                                    className="px-4 py-2 bg-gradient-to-r from-red-800 to-red-600 hover:from-red-700 hover:to-red-500 text-white font-bold text-xs rounded-lg shadow-lg"
                                >
                                    Summon First Creature
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* CREATION HUB MODAL */}
        {showCreationMenu && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-3xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700">
                        <button onClick={() => setShowCreationMenu(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                        <div className="p-8 text-center">
                            <h2 className="text-3xl fantasy-font text-amber-500 mb-2">Summon an Entity</h2>
                            {isProcessing ? (
                                <div className="py-12 flex flex-col items-center gap-4">
                                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                    <div className="text-amber-500 font-bold animate-pulse">Consulting the Archives (API)...</div>
                                    <p className="text-sm text-slate-500">Enriching stats and spells from SRD.</p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-slate-400 mb-8">How shall this creature arrive?</p>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div onClick={() => { setShowCreationMenu(false); setQuickActorModal({ isOpen: true, category: 'npc' }); }} className="bg-slate-800 border-2 border-slate-700 hover:border-emerald-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-emerald-900/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="image" size={24}/></div>
                                            <h3 className="font-bold text-white">Quick Token</h3>
                                            <p className="text-[10px] text-slate-400">Name & Photo only.</p>
                                        </div>
                                        <div onClick={() => { setShowCreationMenu(false); setShowCompendium(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-blue-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-blue-900/30 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="book" size={24}/></div>
                                            <h3 className="font-bold text-white">5e API</h3>
                                            <p className="text-[10px] text-slate-400">Search Database.</p>
                                        </div>
                                        <div onClick={() => { setShowCreationMenu(false); setForgeTab('paste'); setShowForge(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-orange-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="clipboard" size={24}/></div>
                                            <h3 className="font-bold text-white">Paste Text</h3>
                                            <p className="text-[10px] text-slate-400">Parse raw statblock.</p>
                                        </div>
                                        <div onClick={() => { setShowCreationMenu(false); setForgeTab('generate'); setShowForge(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="sparkles" size={24}/></div>
                                            <h3 className="font-bold text-white">AI Forge</h3>
                                            <p className="text-[10px] text-slate-400">Generative NPC.</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {showCompendium && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="max-w-4xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 shrink-0">
                            <div>
                                <h3 className="font-bold text-white flex items-center gap-2 text-base">
                                    <Icon name="globe" size={18} className="text-blue-400"/> D&amp;D 5e SRD Compendium
                                </h3>
                                <p className="text-[11px] text-slate-400">Search official monsters and preview full stats before importing</p>
                            </div>
                            <button onClick={() => { setShowCompendium(false); setCompendiumPreview(null); }} className="text-slate-400 hover:text-white p-1">
                                <Icon name="x" size={20}/>
                            </button>
                        </div>

                        {/* Search & Category Chips */}
                        <div className="p-4 border-b border-slate-700/80 bg-slate-950/60 space-y-2.5 shrink-0">
                            <div className="flex gap-2">
                                <input 
                                    autoFocus 
                                    value={compendiumSearch} 
                                    onChange={(e) => setCompendiumSearch(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && searchCompendium()} 
                                    placeholder="Search 5e SRD (e.g. Dragon, Owlbear, Lich, Goblin, Beholder)..." 
                                    className="flex-1 bg-slate-900 border border-slate-600 focus:border-blue-500 rounded-lg px-3.5 py-2 text-sm text-white outline-none transition-colors"
                                />
                                <button 
                                    onClick={() => searchCompendium()} 
                                    disabled={isLoadingCompendium} 
                                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 rounded-lg text-white font-bold flex items-center gap-2 text-xs transition-colors shadow-md"
                                >
                                    {isLoadingCompendium ? <Icon name="loader" size={16} className="animate-spin"/> : <Icon name="search" size={16}/>}
                                    <span>Search</span>
                                </button>
                            </div>

                            {/* Quick Category Chips */}
                            <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1">
                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider shrink-0 mr-1">Quick:</span>
                                {['Dragon', 'Undead', 'Beast', 'Fiend', 'Giant', 'Goblin', 'Demon', 'Orc', 'Lich'].map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => handleCompendiumCategory(cat)}
                                        className="px-2.5 py-0.5 rounded-full text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-blue-300 border border-slate-700 transition-colors shrink-0"
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Split Pane: Results List & Preview */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 min-h-0 overflow-hidden bg-slate-950">
                            
                            {/* Left Pane: Search Results */}
                            <div className="flex flex-col h-full min-h-0">
                                <div className="p-2.5 bg-slate-900/80 border-b border-slate-800 text-xs font-semibold text-slate-400 flex justify-between items-center shrink-0">
                                    <span>Results ({compendiumResults.length})</span>
                                    <span className="text-[10px] text-slate-500">Click to preview</span>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1.5">
                                    {isLoadingCompendium && (
                                        <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                                            <Icon name="loader" size={24} className="animate-spin text-blue-400" />
                                            <span className="text-xs">Consulting the SRD archives...</span>
                                        </div>
                                    )}

                                    {!isLoadingCompendium && compendiumResults.map(r => {
                                        const isSelected = compendiumPreview?.index === r.index;
                                        return (
                                            <div 
                                                key={r.index} 
                                                onClick={() => handleSelectCompendiumResult(r)} 
                                                className={`p-2.5 rounded-lg border cursor-pointer flex justify-between items-center transition-all ${
                                                    isSelected 
                                                        ? 'bg-blue-950/40 border-blue-500/80 text-white shadow-sm' 
                                                        : 'bg-slate-900/90 border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/80 text-slate-300'
                                                }`}
                                            >
                                                <div className="min-w-0 flex-1 mr-2">
                                                    <div className="font-bold text-xs truncate capitalize">{r.name}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono">5e SRD • {r.index}</div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            importFromApi(r.url);
                                                        }}
                                                        className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white rounded text-[11px] font-semibold border border-blue-500/30 transition-all flex items-center gap-1"
                                                        title="Import Directly"
                                                    >
                                                        <span>Import</span>
                                                        <Icon name="download" size={12}/>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {!isLoadingCompendium && compendiumResults.length === 0 && (
                                        <div className="text-center text-slate-500 py-12 italic text-xs">
                                            Type a creature name or click a quick category above.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Pane: Live Preview */}
                            <div className="flex flex-col h-full min-h-0 bg-slate-900/60">
                                <div className="p-2.5 bg-slate-900/80 border-b border-slate-800 text-xs font-semibold text-slate-400 shrink-0">
                                    <span>Creature Preview</span>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto custom-scroll p-4">
                                    {isLoadingPreview && (
                                        <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                                            <Icon name="loader" size={24} className="animate-spin text-blue-400" />
                                            <span className="text-xs">Loading statblock details...</span>
                                        </div>
                                    )}

                                    {!isLoadingPreview && compendiumPreview && (
                                        <div className="space-y-4">
                                            {/* Preview Header */}
                                            <div className="border-b border-slate-700/80 pb-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <h4 className="text-xl font-bold fantasy-font text-amber-400 capitalize">
                                                            {compendiumPreview.name}
                                                        </h4>
                                                        <p className="text-xs italic text-slate-400 capitalize">
                                                            {compendiumPreview.size} {compendiumPreview.type} ({compendiumPreview.alignment})
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold border font-mono ${getCrBadgeColor(compendiumPreview.challenge_rating)}`}>
                                                        CR {compendiumPreview.challenge_rating}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Vitals */}
                                            <div className="grid grid-cols-3 gap-2 p-2 bg-slate-950/70 rounded-lg border border-slate-800 text-center font-mono">
                                                <div>
                                                    <div className="text-[10px] text-slate-500 uppercase">AC</div>
                                                    <div className="text-sm font-bold text-white">
                                                        {Array.isArray(compendiumPreview.armor_class) ? compendiumPreview.armor_class[0]?.value : compendiumPreview.armor_class}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-500 uppercase">HP</div>
                                                    <div className="text-sm font-bold text-white">
                                                        {compendiumPreview.hit_points}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-slate-500 uppercase">Speed</div>
                                                    <div className="text-xs font-bold text-white truncate">
                                                        {typeof compendiumPreview.speed === 'object' 
                                                            ? Object.entries(compendiumPreview.speed).map(([k, v]) => `${k} ${v}`).join(', ') 
                                                            : compendiumPreview.speed}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Ability Scores */}
                                            <div className="grid grid-cols-6 gap-1 p-2 bg-slate-950/70 rounded-lg border border-slate-800 text-center font-mono text-xs">
                                                {[
                                                    { l: 'STR', v: compendiumPreview.strength },
                                                    { l: 'DEX', v: compendiumPreview.dexterity },
                                                    { l: 'CON', v: compendiumPreview.constitution },
                                                    { l: 'INT', v: compendiumPreview.intelligence },
                                                    { l: 'WIS', v: compendiumPreview.wisdom },
                                                    { l: 'CHA', v: compendiumPreview.charisma },
                                                ].map(s => (
                                                    <div key={s.l}>
                                                        <div className="text-[9px] text-slate-500">{s.l}</div>
                                                        <div className="font-bold text-slate-200">{s.v}</div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Key Actions Preview */}
                                            {compendiumPreview.actions?.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">Actions</span>
                                                    <div className="space-y-1 text-xs">
                                                        {compendiumPreview.actions.slice(0, 3).map((a, i) => (
                                                            <div key={i} className="bg-slate-900/60 p-2 rounded border border-slate-800">
                                                                <span className="font-bold text-white">{a.name}. </span>
                                                                <span className="text-slate-400 line-clamp-2">{a.desc}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Import Button */}
                                            <div className="pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => importFromApi(compendiumPreview.url)}
                                                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all"
                                                >
                                                    <Icon name="download" size={16} />
                                                    <span>Import {compendiumPreview.name} to Bestiary</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!isLoadingPreview && !compendiumPreview && (
                                        <div className="py-20 text-center text-slate-500 text-xs italic flex flex-col items-center gap-2">
                                            <Icon name="book-open" size={32} className="text-slate-600" />
                                            <span>Select any creature on the left to inspect its statblock.</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showDebug && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="max-w-4xl w-full bg-slate-900 rounded-xl border border-amber-500/50 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                            <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="bug" size={18}/> Debug: PDF Parser Output</h3>
                            <button onClick={() => setShowDebug(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                        </div>
                        <div className="flex-1 p-0 overflow-hidden relative">
                            <textarea readOnly value={debugOutput} className="w-full h-full bg-slate-950 text-green-400 font-mono text-xs p-4 resize-none outline-none custom-scroll"/>
                            <button onClick={() => { navigator.clipboard.writeText(debugOutput); toast("Copied to clipboard!", "success"); }} className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1 rounded border border-slate-600 shadow-lg">Copy JSON</button>
                        </div>
                    </div>
                </div>
            )}
            {showAiCreator && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700 h-[90vh]">
                        <CharacterCreator aiHelper={aiHelper} apiKey={apiKey} onComplete={handleNpcComplete} onCancel={() => setShowAiCreator(false)} edition={edition} />
                    </div>
                </div>
            )}

            {showForge && (
                <MonsterForgeModal
                    isOpen={showForge}
                    onClose={() => setShowForge(false)}
                    onForgeComplete={handleForgeComplete}
                    generateNpc={generateNpc}
                    aiHelper={aiHelper}
                    initialTab={forgeTab}
                    onDiceRoll={onDiceRoll}
                />
            )}
            
            {showModelPicker && npcForModelSelection && (
                <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                            <h3 className="font-bold text-white flex items-center gap-2"><Icon name="box" size={18}/> Select 3D Mini: {npcForModelSelection.name}</h3>
                            <button onClick={() => { setNpcForModelSelection(null); setShowModelPicker(false); }} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-700 bg-slate-900 flex gap-2">
                            <input 
                                autoFocus
                                value={miniSearchQuery} 
                                onChange={e => setMiniSearchQuery(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && handleMiniSearch()}
                                placeholder="Search 3D Models (e.g. Dragon, Goblin)..." 
                                className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-amber-500"
                            />
                            <button 
                                onClick={() => handleMiniSearch()} 
                                disabled={isSearchingMinis} 
                                className="bg-amber-600 hover:bg-amber-500 px-4 rounded text-white font-bold flex items-center justify-center"
                            >
                                {isSearchingMinis ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scroll bg-slate-950 flex-1">
                            {isSearchingMinis ? (
                                <div className="text-center py-10 text-amber-500"><Icon name="loader" size={32} className="animate-spin mx-auto mb-2"/> Searching the Repository...</div>
                            ) : isForging3D ? (
                                <div className="text-center py-10 text-purple-500">
                                    <Icon name="loader-2" size={48} className="animate-spin mx-auto mb-4"/>
                                    <p className="font-bold animate-pulse">{forge3DStatus}</p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-slate-400 mb-4 text-sm">We found {availableModels.length} compatible 3D models.</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {availableModels.map((model, i) => (
                                    <div key={i} onClick={() => handleModelSelect(model)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 cursor-pointer hover:border-amber-500 hover:bg-slate-700 transition-all group">
                                        <div className="aspect-square bg-slate-900 rounded-md mb-2 overflow-hidden border border-slate-700 group-hover:border-amber-500/50 relative">
                                            {model.thumb ? <img src={model.thumb} className="w-full h-full object-cover" /> : <Icon name="box" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600"/>}
                                        </div>
                                        <div className="font-bold text-sm text-slate-200 group-hover:text-amber-400 truncate">{model.name}</div>
                                        <div className="text-[10px] text-slate-500 truncate">Scale: {model.scale}x</div>
                                    </div>
                                ))}
                                
                                <div onClick={() => handleForge3D(npcForModelSelection)} className="bg-slate-800 border border-purple-500/50 border-dashed rounded-lg p-2 cursor-pointer hover:border-purple-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                                    <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-purple-500/30 group-hover:border-purple-500 group-hover:scale-110 transition-transform">
                                        <Icon name="sparkles" size={24} className="text-purple-500 group-hover:text-purple-400"/>
                                    </div>
                                    <div className="font-bold text-sm text-purple-400 group-hover:text-purple-300 text-center">Forge 3D Mini</div>
                                    <div className="text-[10px] text-purple-500/70 text-center flex items-center gap-1">AI Generate <a href="https://huggingface.co/spaces/VAST-AI/TripoSG" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:text-purple-300" title="Powered by VAST-AI/TripoSG"><Icon name="external-link" size={10} /></a></div>
                                </div>
                                
                                <div onClick={() => handleModelSelect(null)} className="bg-slate-800 border border-slate-700 border-dashed rounded-lg p-2 cursor-pointer hover:border-blue-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center">
                                    <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-slate-700 group-hover:border-blue-500/50">
                                        <Icon name="image" size={24} className="text-slate-500 group-hover:text-blue-400"/>
                                    </div>
                                    <div className="font-bold text-sm text-slate-200 group-hover:text-blue-400 text-center">2D Token Only</div>
                                    <div className="text-[10px] text-slate-500 text-center">Skip 3D Model</div>
                                </div>
                            </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Quick Actor Modal (Name & Photo Only) */}
            {quickActorModal && (
                <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                                    <Icon name="image" size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-base">{quickActorModal.editId ? 'Edit Quick Token' : 'Create Quick Token'}</h3>
                                    <p className="text-[11px] text-slate-400">Name & photo only • No character sheet</p>
                                </div>
                            </div>
                            <button onClick={() => setQuickActorModal(null)} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={20}/></button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scroll">
                            {/* Name Input */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Entity Name</label>
                                <input 
                                    type="text"
                                    value={quickActorModal.name || ''}
                                    onChange={(e) => setQuickActorModal(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Goblin Scout, Tavern Keeper"
                                    autoFocus
                                    className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-white text-sm outline-none transition-colors font-medium"
                                />
                            </div>

                            {/* Photo & Avatar Preview */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Token Photo</label>
                                <div className="flex gap-3 items-center">
                                    <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700 overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                                        {quickActorModal.image ? (
                                            <SafeImage src={quickActorModal.image} className="w-full h-full object-cover" alt="Preview" />
                                        ) : (
                                            <div className="font-bold text-2xl text-slate-500 uppercase">{quickActorModal.name?.[0] || '?'}</div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <input 
                                            type="text"
                                            value={quickActorModal.image || ''}
                                            onChange={(e) => setQuickActorModal(prev => ({ ...prev, image: e.target.value }))}
                                            placeholder="Paste Image URL (https://...)"
                                            className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-xs text-white outline-none transition-colors"
                                        />
                                        <div className="flex items-center gap-2">
                                            <label className="cursor-pointer text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded border border-slate-700 flex items-center gap-1.5 transition-colors">
                                                <Icon name="upload" size={13} /> Upload File
                                                <input 
                                                    type="file" 
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        try {
                                                            const b64 = await fileToBase64(file);
                                                            const chunkedUrl = await storeChunkedMap(b64, file.name);
                                                            setQuickActorModal(prev => ({ ...prev, image: chunkedUrl }));
                                                        } catch(err) {
                                                            dialog.alert("Failed to upload image: " + err.message);
                                                        }
                                                    }} 
                                                    accept="image/*" 
                                                    className="hidden" 
                                                />
                                            </label>
                                            {quickActorModal.image && (
                                                <button
                                                    type="button"
                                                    onClick={() => setQuickActorModal(prev => ({ ...prev, image: '' }))}
                                                    className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Size Selector */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Grid Size</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { val: 1, label: '1x1 (Med)' },
                                        { val: 2, label: '2x2 (Lrg)' },
                                        { val: 3, label: '3x3 (Huge)' },
                                        { val: 4, label: '4x4 (Garg)' },
                                    ].map(s => (
                                        <button
                                            key={s.val}
                                            type="button"
                                            onClick={() => setQuickActorModal(prev => ({ ...prev, size: s.val }))}
                                            className={`py-1.5 text-xs font-semibold rounded border transition-all ${
                                                Number(quickActorModal.size || 1) === s.val ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Player Assignment */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Player Assignment (Optional)</label>
                                <select
                                    value={quickActorModal.ownerId || ''}
                                    onChange={(e) => setQuickActorModal(prev => ({ ...prev, ownerId: e.target.value || null }))}
                                    className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                                >
                                    <option value="">-- No Player Assigned --</option>
                                    {Object.entries(data?.activeUsers || {}).map(([uid, rawName]) => {
                                        const displayName = typeof rawName === 'object' ? rawName?.displayName : rawName;
                                        const clean = displayName?.includes('@') ? displayName.split('@')[0] : (displayName || 'Player');
                                        return <option key={uid} value={uid}>{clean}</option>;
                                    })}
                                </select>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
                            <div>
                                {quickActorModal.editId && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteQuickActor(quickActorModal)}
                                        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/50 px-2.5 py-1.5 rounded border border-red-900/50 flex items-center gap-1 transition-colors"
                                    >
                                        <Icon name="trash-2" size={13} /> Delete
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setQuickActorModal(null)}
                                    className="px-4 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaveQuickActor(quickActorModal)}
                                    className="px-5 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs rounded-lg shadow-lg transition-all"
                                >
                                    {quickActorModal.editId ? 'Save Changes' : 'Create Token'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 5e Monster Statblock Drawer */}
            <MonsterStatblockDrawer 
                npc={inspectingNpc}
                isOpen={Boolean(inspectingNpc)}
                onClose={() => setInspectingNpcId(null)}
                onOpenSheet={(targetNpc) => {
                    setInspectingNpcId(null);
                    openSheet(targetNpc);
                }}
                onDuplicate={(targetNpc) => handleDuplicateNpc(targetNpc)}
                onToggleFavorite={(targetNpc) => handleToggleFavorite(targetNpc)}
                onDiceRoll={onDiceRoll}
                onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                onHpChange={handleUpdateNpcHp}
                role={role}
            />
            {/* START CHANGE: Closing the Fragment added at the start of the return */}
        </> 
    );
};

export default NpcView;