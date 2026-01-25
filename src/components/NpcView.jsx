import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { parsePdf } from '../utils/dndBeyondParser.js';
import { enrichCharacter } from '../utils/srdEnricher.js';

// START CHANGE: Add generateNpc to props
const NpcView = ({ data, setData, role, updateCloud, setChatInput, setView, onPossess, aiHelper, apiKey, edition, onDiceRoll, generateNpc }) => {
    // View State
    const [viewingNpcId, setViewingNpcId] = useState(null);
// END CHANGE
    const [showCreationMenu, setShowCreationMenu] = useState(false);
    const [showAiCreator, setShowAiCreator] = useState(false);
    // START CHANGE: Add Forge State
    const [showForge, setShowForge] = useState(false);
    const [forgeName, setForgeName] = useState('');
    const [forgeContext, setForgeContext] = useState('');
    const [isForging, setIsForging] = useState(false);
    // END CHANGE
    // Compendium State
    const [showCompendium, setShowCompendium] = useState(false);
    const [compendiumSearch, setCompendiumSearch] = useState("");
    const [compendiumResults, setCompendiumResults] = useState([]);
    const [isLoadingCompendium, setIsLoadingCompendium] = useState(false);
    // Debug & Tools State
    const [showDebug, setShowDebug] = useState(false);
    const [debugOutput, setDebugOutput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

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
        updateCloud({ ...currentData, npcs: newNpcs }, true);
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
        
        updateCloud({ ...currentData, npcs: newNpcs }, true);
        
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
            handleNpcComplete({ ...newNpc, quirk: "Forged from Lore" });
            setShowForge(false); setForgeName(''); setForgeContext('');
        } else { alert("The Forge failed."); }
        setIsForging(false);
    };
    // END CHANGE

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
                    const imgEl = await window.puter.ai.txt2img(`fantasy rpg token portrait of a ${m.name} ${m.type}, white background, high quality`);
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

            const newNpc = {
                name: m.name,
                race: `${m.size} ${m.type} (${m.alignment})`,
                class: "Monster",
                level: m.challenge_rating,
                hp: { current: m.hit_points, max: m.hit_points },
                ac: acVal,
                speed: speedStr,
                stats: {
                    str: m.strength, dex: m.dexterity, con: m.constitution,
                    int: m.intelligence, wis: m.wisdom, cha: m.charisma
                },
                senses: sensesObj,
                image: imageUrl,
                quirk: "SRD Import",
                bio: { 
                    backstory: `Imported from D&D 5e API.\nXP: ${m.xp}\nLanguages: ${m.languages}`,
                    appearance: `A ${m.size} ${m.type}.` 
                },
                customActions: (m.actions || []).map(a => {
                    let dmgString = "";
                    if (a.damage && a.damage[0] && a.damage[0].damage_dice) {
                        dmgString = a.damage[0].damage_dice;
                        if(a.damage[0].damage_type?.name) dmgString += ` ${a.damage[0].damage_type.name}`;
                    }
                    return {
                        name: a.name,
                        desc: a.desc,
                        type: "Action",
                        hit: a.attack_bonus ? `+${a.attack_bonus}` : "",
                        dmg: dmgString 
                    };
                }),
                features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" })),
                legendaryActions: (m.legendary_actions || []).map(l => ({ name: l.name, desc: l.desc }))
            };

            handleNpcComplete(newNpc);
            alert(`Imported ${newNpc.name} from SRD!`);

        } catch (e) {
            console.error(e);
            alert("Failed to import monster details. Check console.");
        }
        setIsLoadingCompendium(false);
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
        updateCloud({ ...currentData, npcs: newNpcs }, true); 
    };

    const toggleHidden = (npc, e) => {
        e.stopPropagation();
        const updated = { ...npc, isHidden: !npc.isHidden }; 
        const currentData = dataRef.current;
        const currentNpcs = (currentData.npcs || []).filter(n => n && n.id);
        const newNpcs = currentNpcs.map(n => n.id === npc.id ? updated : n);
        updateCloud({ ...currentData, npcs: newNpcs }, true); 
    };

    const openSheet = (npc) => {
        useCharacterStore.getState().loadCharacter(npc);
        setViewingNpcId(npc.id);
    };

    if (viewingNpcId) {
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col h-full w-full">
                <SheetContainer 
                    characterId={viewingNpcId} 
                    onSave={handleSheetSave} 
                    onBack={() => setViewingNpcId(null)} 
                    onDiceRoll={onDiceRoll} 
                    onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                    isNpc={true} 
                    // --- FIX: PASS ROLE HERE ---
                    role={role}
                    // ---------------------------
                />
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
                    
                    <div className="flex flex-wrap gap-2 justify-center">
                        <button onClick={() => setShowCreationMenu(true)} className="bg-gradient-to-r from-red-700 to-orange-700 hover:from-red-600 hover:to-orange-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transform transition-all hover:scale-105">
                            <Icon name="plus-circle" size={20}/> <span>Summon Entity</span>
                        </button>
                    </div>
                </div>

                {/* GRID LAYOUT */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleNpcs.map(npc => (
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
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                        <div onClick={createManualNpc} className="bg-slate-800 border-2 border-slate-700 hover:border-green-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
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
                                        {/* START CHANGE: Open new Forge Modal instead of old Creator */}
                                        <div onClick={() => { setShowCreationMenu(false); setShowForge(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
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

            {/* START CHANGE: Context-Aware Forge Modal */}
            {showForge && (
                <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-2">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Icon name="skull" className="text-red-500"/> Bestiary Forge</h3>
                            <button onClick={() => setShowForge(false)} className="text-slate-400 hover:text-white"><Icon name="x"/></button>
                        </div>
                        {isForging ? (
                            <div className="text-center py-8">
                                <Icon name="loader-2" size={48} className="animate-spin text-red-500 mx-auto mb-4"/>
                                <p className="text-red-300 font-bold animate-pulse">Consulting the Archives...</p>
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
                                <button onClick={handleForgeSubmit} disabled={!forgeName.trim()} className="w-full bg-red-800 hover:bg-red-700 text-white font-bold py-3 rounded flex justify-center items-center gap-2 mt-4"><Icon name="hammer" size={18}/> Forge Monster</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* START CHANGE: Closing the Fragment added at the start of the return */}
        </> 
    );
};

export default NpcView;