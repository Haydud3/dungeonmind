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
import { retrieveChunkedMap, storeChunkedMap } from '../utils/storageUtils';

// START CHANGE: Add generateNpc to props
const NpcView = ({ data, setData, role, setChatInput, setView, onPossess, aiHelper, apiKey, edition, onDiceRoll, diceLog, generateNpc, onOpenDiceTray }) => {
    const { updateCampaign, user } = useNewCampaign();
    // View State
    const [viewingNpcId, setViewingNpcId] = useState(null);
    const [editableName, setEditableName] = useState('');

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
    const [viewMode, setViewMode] = useState('grid');
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
    const [isLoadingCompendium, setIsLoadingCompendium] = useState(false);
    const [npcForModelSelection, setNpcForModelSelection] = useState(null);
    const [isNewNpc, setIsNewNpc] = useState(false);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
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

    // START CHANGE: New NPC Forge Handler
    const handleForgeSubmit = async () => {
        if (!forgeName.trim()) return;
        setIsForging(true);
        const instruction = forgeContext ? `Role/Vibe: ${forgeContext}` : "Standard 5e Statblock.";
        
        const newNpc = await generateNpc(forgeName, instruction);
        
        if (newNpc) {
            const finalNpc = { ...newNpc, quirk: "Forged from Lore" };
            
            setShowForge(false); 
            setForgeName(''); 
            setForgeContext('');
            
            setNpcForModelSelection(finalNpc);
            setAvailableModels([]);
            setIsNewNpc(true);
            setShowModelPicker(true);
            setMiniSearchQuery(finalNpc.name);
            handleMiniSearch(finalNpc.name, finalNpc.race);
        } else { alert("The Forge failed."); }
        setIsForging(false);
    };
    // END CHANGE

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
            const resultText = await aiHelper([{ role: 'user', content: prompt }]);
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
                alert("Failed to parse the AI response into a valid NPC. Check the text format.");
                console.error("AI Parse Error:", e, resultText);
            }
        } catch (e) {
            alert("AI request failed.");
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
    const searchCompendium = async () => {
        if (!compendiumSearch.trim()) return;
        setIsLoadingCompendium(true);
        try {
            const res = await fetch('https://www.dnd5eapi.co/api/monsters?name=' + compendiumSearch);
            const data = await res.json();
            
            if (data.count === 0) {
                alert("No monsters found in the SRD with that name.");
                setCompendiumResults([]);
            } else {
                const results = data.results.slice(0, 20);
                setCompendiumResults(results);
            }
        } catch (e) {
            console.error(e);
            alert("Could not connect to D&D 5e API.");
        }
        setIsLoadingCompendium(false);
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
                    const imgEl = await window.puter.ai.txt2img(`D&D Beyond official digital character illustration of a ${m.name} (${m.type}). 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`, { model: 'dall-e-3' });
                    imageUrl = await processPuterImage(imgEl);
                } catch (e) { console.error("Image gen failed", e); }
            }

            const acVal = Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class;
            const speedStr = typeof m.speed === 'object' ? Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;

            const sensesObj = {
                darkvision: m.senses?.darkvision || "",
                passivePerception: m.senses?.passive_perception || 10,
                blindsight: m.senses?.blindsight || "",
                tremorsense: m.senses?.tremorsense || "",
                truesight: m.senses?.truesight || ""
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
                    immunities: [...(m.damage_immunities || []), ...(m.condition_immunities?.map(c => c.name) || [])].join(', '),
                    vulnerabilities: (m.damage_vulnerabilities || []).join(', ')
                },
                senses: sensesObj,
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
            alert("Failed to import monster details. Check console.");
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
                alert("No image available to forge a 3D mini.");
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
            alert("3D Forge Failed: " + e.message);
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
            alert(`Successfully summoned ${finalNpc.name}!`);
        } else {
            handleSheetSave(finalNpc);
            alert(`Updated 3D model for ${finalNpc.name}!`);
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
            alert(`Success! Imported ${charData.name}`);
        } catch (err) { 
            console.error(err);
            alert("Import Failed: " + err.message); 
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

    const deleteNpc = (id, e) => {
        e.stopPropagation(); 
        if(!confirm("Delete this NPC?")) return;
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

    const openSheet = (npc) => {
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
                                const r = await onDiceRoll(formula, { ...options, chat: true, isPrivate: role === 'dm' });
                                if (typeof r === 'number') return r;
                                if (r && typeof r === 'object') {
                                    if (typeof r.total === 'number') return r.total;
                                    if (typeof r.result === 'number') return r.result;
                                }
                                const parsed = parseInt(r);
                                return isNaN(parsed) ? 0 : parsed;
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
                    
                    {/* HEADER */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-700 pb-4">
    <div>
        <h2 className="text-3xl fantasy-font text-amber-500">NPCs & Monsters</h2>
        <p className="text-slate-400 text-sm">Manage the world's inhabitants and enemies.</p>
    </div>
    
    {/* RESTRICTION APPLIED HERE */}
    {role === 'dm' && (
        <div className="flex flex-wrap gap-2 justify-center items-center">
            <button onClick={() => setShowCompendium(true)} className="bg-slate-800 hover:bg-slate-700 text-blue-400 px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all border border-blue-900/50">
                <Icon name="book" size={20}/> <span className="hidden md:inline">5e API</span>
            </button>
            <button onClick={() => setShowCreationMenu(true)} className="bg-gradient-to-r from-red-800 to-red-600 hover:from-red-700 hover:to-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transform transition-all hover:scale-105">
                <Icon name="plus-circle" size={20}/> <span>Summon Entity</span>
            </button>
            <div className="flex bg-slate-800 rounded p-1 border border-slate-700 ml-2">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-red-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="layout-grid" size={16}/></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-700 text-red-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="list" size={16}/></button>
            </div>
        </div>
    )}
</div>

                {/* GRID LAYOUT */}
                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
                    {visibleNpcs.map(npc => (
                        viewMode === 'grid' ? (
                            <div key={npc.id} onClick={() => openSheet(npc)} className={`group relative bg-slate-800 rounded-xl overflow-hidden border transition-all hover:-translate-y-1 cursor-pointer shadow-lg ${npc.isHidden ? 'border-dashed border-slate-600 opacity-75' : 'border-slate-700 hover:border-amber-500/50'}`}>
                            <div className="h-32 bg-slate-700 relative overflow-hidden">
                                {npc.image ? <img src={npc.image} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt={npc.name} /> : <div className="w-full h-full flex items-center justify-center bg-slate-700 opacity-20"><Icon name="skull" size={64}/></div>}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                                <div className="absolute top-2 right-2 flex gap-2">
                                    {npc.isHidden && <div className="bg-slate-900/80 text-slate-300 text-xs font-bold px-2 py-1 rounded border border-slate-600 flex items-center gap-1"><Icon name="eye-off" size={12}/> Hidden</div>}
                                </div>
                            </div>
                            <div className="p-4 relative -mt-8">
                                <div className="flex justify-between items-end">
                                    <div className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-slate-600 shadow-2xl flex items-center justify-center overflow-hidden">
                                        {npc.image ? <img src={npc.image} className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-slate-500">{npc.name?.[0]}</span>}
                                    </div>
                                    <div className="flex-1 ml-3 mb-1 min-w-0">
                                        <h3 className="text-xl font-bold text-slate-100 leading-tight group-hover:text-amber-400 truncate">{npc.name}</h3>
                                        {/* START CHANGE: Master Blueprint Tag */}
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs text-amber-600 font-bold uppercase tracking-wider truncate">{npc.race} {npc.class}</p>
                                            <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1 rounded border border-indigo-500/30 font-mono">MASTER</span>
                                        </div>
                                    </div>
                                </div> {/* START CHANGE: Added missing closing div for nameplate area */}
                            </div>
                            {role === 'dm' && (
                                <div className="absolute top-2 left-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => deleteNpc(npc.id, e)} className="p-2 bg-red-900/80 text-white rounded hover:bg-red-700 shadow-lg" title="Delete"><Icon name="trash-2" size={14}/></button>
                                    <button onClick={(e) => toggleHidden(npc, e)} className="p-2 bg-slate-700/80 text-white rounded hover:bg-slate-600 shadow-lg" title={npc.isHidden ? "Reveal to Players" : "Hide from Players"}><Icon name={npc.isHidden ? "eye" : "eye-off"} size={14}/></button>
                                </div>
                            )}
                            </div>
                        ) : (
                            <div key={npc.id} onClick={() => openSheet(npc)} className={`group bg-slate-800 border rounded-xl p-3 flex items-center gap-4 cursor-pointer shadow-lg transition-all hover:-translate-y-0.5 ${npc.isHidden ? 'border-dashed border-slate-600 opacity-75' : 'border-slate-700 hover:border-amber-500/50'}`}>
                                <div className="w-12 h-12 rounded-lg bg-slate-700 border border-slate-600 overflow-hidden shrink-0 relative">
                                    {npc.image ? <img src={npc.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 text-xl">{npc.name?.[0]}</div>}
                                    {npc.isHidden && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Icon name="eye-off" size={16} className="text-slate-300"/></div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-slate-100 group-hover:text-amber-400 truncate">{npc.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider truncate">{npc.race} {npc.class}</p>
                                        <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1 rounded border border-indigo-500/30 font-mono">MASTER</span>
                                    </div>
                                </div>
                                {role === 'dm' && (
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); toggleHidden(npc, e); }} className="p-2 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors" title={npc.isHidden ? "Reveal to Players" : "Hide from Players"}><Icon name={npc.isHidden ? "eye" : "eye-off"} size={16}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); deleteNpc(npc.id, e); }} className="p-2 bg-red-900/50 text-red-400 rounded hover:bg-red-700 hover:text-white transition-colors" title="Delete"><Icon name="trash-2" size={16}/></button>
                                    </div>
                                )}
                            </div>
                        )
                    ))}
                    {visibleNpcs.length === 0 && <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-700 rounded-xl"><Icon name="ghost" size={48} className="mx-auto text-slate-600 mb-4"/><p className="text-slate-500">No entities found.</p></div>}
                </div>
            </div>
        </div>

        {/* CREATION HUB MODAL */}
        {showCreationMenu && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-5xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700">
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
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                        <div onClick={createManualNpc} className="bg-slate-800 border-2 border-slate-700 hover:border-green-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1 col-span-2 md:col-span-1">
                                            <div className="w-12 h-12 bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="pencil" size={24}/></div>
                                            <h3 className="font-bold text-white">Manual</h3>
                                            <p className="text-[10px] text-slate-400">Blank sheet.</p>
                                        </div>
                                        <div onClick={() => { setShowCreationMenu(false); setShowCompendium(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-blue-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-blue-900/30 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="book" size={24}/></div>
                                            <h3 className="font-bold text-white">5e API</h3>
                                            <p className="text-[10px] text-slate-400">Search Database.</p>
                                        </div>
                                        <div onClick={() => debugInputRef.current.click()} className="bg-slate-800 border-2 border-slate-700 hover:border-amber-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-amber-900/30 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="bug" size={24}/></div>
                                            <h3 className="font-bold text-white">Debug Parser</h3>
                                            <p className="text-[10px] text-slate-400">View Raw PDF JSON.</p>
                                            <input type="file" accept=".pdf" className="hidden" ref={debugInputRef} onChange={handleDebugPdf}/>
                                        </div>
                                        <div onClick={() => fileInputRef.current.click()} className="bg-slate-800 border-2 border-slate-700 hover:border-red-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="file-text" size={24}/></div>
                                            <h3 className="font-bold text-white">PDF</h3>
                                            <p className="text-[10px] text-slate-400">Import + SRD Enrich.</p>
                                            <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handlePdfImport}/>
                                        </div>
                                        <div onClick={() => { setShowCreationMenu(false); setForgeTab('paste'); setShowForge(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-orange-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="clipboard" size={24}/></div>
                                            <h3 className="font-bold text-white">Paste Text</h3>
                                            <p className="text-[10px] text-slate-400">Parse raw statblock.</p>
                                        </div>
                                        {/* START CHANGE: Open new Forge Modal instead of old Creator */}
                                        <div onClick={() => { setShowCreationMenu(false); setForgeTab('generate'); setShowForge(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="sparkles" size={24}/></div>
                                            <h3 className="font-bold text-white">AI Forge</h3>
                                        {/* END CHANGE */}
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
                    <div className="max-w-xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                            <h3 className="font-bold text-white flex items-center gap-2"><Icon name="globe" size={18}/> D&D 5e API Search</h3>
                            <button onClick={() => setShowCompendium(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-700">
                            <div className="flex gap-2">
                                <input autoFocus value={compendiumSearch} onChange={(e) => setCompendiumSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCompendium()} placeholder="Search (e.g. Owlbear, Lich)..." className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500"/>
                                <button onClick={searchCompendium} disabled={isLoadingCompendium} className="bg-blue-600 hover:bg-blue-500 px-4 rounded text-white font-bold">{isLoadingCompendium ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}</button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900">
                            {compendiumResults.map(r => (
                                <div key={r.index} onClick={() => importFromApi(r.url)} className="p-3 bg-slate-800 border border-slate-700 rounded hover:border-blue-500 cursor-pointer flex justify-between items-center group">
                                    <div className="font-bold text-white group-hover:text-blue-400 capitalize">{r.name}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1 group-hover:text-blue-300">Import <Icon name="download" size={14}/></div>
                                </div>
                            ))}
                            {compendiumResults.length === 0 && !isLoadingCompendium && <div className="text-center text-slate-500 py-8 italic">Search for a creature to begin.</div>}
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
                            <button onClick={() => { navigator.clipboard.writeText(debugOutput); alert("Copied to clipboard!"); }} className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1 rounded border border-slate-600 shadow-lg">Copy JSON</button>
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

            {/* START CHANGE: Context-Aware Forge Modal (Combined with Paste Text) */}
            {showForge && (
                <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-2xl p-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-2 shrink-0">
                            <div className="flex gap-6">
                                <button onClick={() => setForgeTab('generate')} className={`text-xl font-bold flex items-center gap-2 transition-colors ${forgeTab === 'generate' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                                    <Icon name="sparkles" className={forgeTab === 'generate' ? "text-purple-500" : ""} /> AI Generate
                                </button>
                                <span className="text-slate-600 text-xl">|</span>
                                <button onClick={() => setForgeTab('paste')} className={`text-xl font-bold flex items-center gap-2 transition-colors ${forgeTab === 'paste' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                                    <Icon name="clipboard" className={forgeTab === 'paste' ? "text-orange-500" : ""} /> Paste Text
                                </button>
                            </div>
                            <button onClick={() => setShowForge(false)} className="text-slate-400 hover:text-white"><Icon name="x"/></button>
                        </div>
                        
                        {forgeTab === 'generate' ? (
                            isForging ? (
                                <div className="text-center py-8">
                                    <Icon name="loader-2" size={48} className="animate-spin text-purple-500 mx-auto mb-4"/>
                                    <p className="text-purple-300 font-bold animate-pulse">Consulting the Archives...</p>
                                    <p className="text-xs text-slate-500 mt-2">Checking Lore for stats...</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">Name / Creature Type</label>
                                        <input autoFocus className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" placeholder="e.g. Glasstaff OR Redbrand Ruffian" value={forgeName} onChange={e => setForgeName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleForgeSubmit()}/>
                                        <p className="text-[10px] text-slate-500 mt-1">If this name appears in your PDFs, we use those stats!</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">Context (Optional)</label>
                                        <input className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" placeholder="e.g. CR 4, fire themed" value={forgeContext} onChange={e => setForgeContext(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleForgeSubmit()}/>
                                    </div>
                                    <button onClick={handleForgeSubmit} disabled={!forgeName.trim()} className="w-full bg-purple-800 hover:bg-purple-700 text-white font-bold py-3 rounded flex justify-center items-center gap-2 mt-4"><Icon name="hammer" size={18}/> Forge Monster</button>
                                </div>
                            )
                        ) : (
                            isParsingText ? (
                                <div className="text-center py-12 flex-1 flex flex-col justify-center">
                                    <Icon name="loader-2" size={48} className="animate-spin text-orange-500 mx-auto mb-4"/>
                                    <p className="text-orange-300 font-bold animate-pulse">Parsing Statblock...</p>
                                    <p className="text-xs text-slate-500 mt-2">The DungeonMind is extracting the stats.</p>
                                </div>
                            ) : (
                                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                    <div className="flex-1 flex flex-col min-h-0">
                                        <label className="block text-xs font-bold text-slate-400 mb-2">Raw Text</label>
                                        <textarea 
                                            autoFocus 
                                            className="flex-1 w-full bg-slate-900 border border-slate-600 rounded p-3 text-white text-sm font-mono custom-scroll resize-none min-h-[200px]" 
                                            placeholder="Paste the raw text from D&D Beyond or a PDF here..." 
                                            value={pasteTextContent} 
                                            onChange={e => setPasteTextContent(e.target.value)} 
                                        />
                                    </div>
                                    <button onClick={handlePasteTextSubmit} disabled={!pasteTextContent.trim()} className="w-full bg-orange-700 hover:bg-orange-600 text-white font-bold py-3 rounded flex justify-center items-center gap-2 shrink-0"><Icon name="wand-2" size={18}/> Extract NPC</button>
                                </div>
                            )
                        )}
                    </div>
                </div>
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
            {/* START CHANGE: Closing the Fragment added at the start of the return */}
        </> 
    );
};

export default NpcView;