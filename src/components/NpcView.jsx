import React, { useState, useRef } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { parsePdf } from '../utils/dndBeyondParser.js'; 

const NpcView = ({ data, setData, role, updateCloud, setChatInput, setView, onPossess, aiHelper, apiKey, edition, onDiceRoll }) => {
    // View State
    const [viewingNpcId, setViewingNpcId] = useState(null);
    const [showCreationMenu, setShowCreationMenu] = useState(false);
    const [showAiCreator, setShowAiCreator] = useState(false);
    
    // Compendium State
    const [showCompendium, setShowCompendium] = useState(false);
    const [compendiumSearch, setCompendiumSearch] = useState("");
    const [compendiumResults, setCompendiumResults] = useState([]);
    const [isLoadingCompendium, setIsLoadingCompendium] = useState(false);
    
    // Text Import State
    const [showTextImport, setShowTextImport] = useState(false);
    const [statblockText, setStatblockText] = useState("");

    const fileInputRef = useRef(null);
    const addLogEntry = useCharacterStore((state) => state.addLogEntry); // Hook for logging rolls

    const npcs = (data?.npcs || []).filter(n => n && n.id);
    const visibleNpcs = role === 'dm' ? npcs : npcs.filter(n => !n.isHidden);

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
        const newNpcs = npcs.map(n => n.id === updatedNpc.id ? updatedNpc : n);
        updateCloud({ ...data, npcs: newNpcs });
    };

    const handleNpcComplete = (npcData) => {
        const newNpc = { 
            isHidden: role === 'dm',
            quirk: npcData.quirk || "Imported",
            ...npcData,
            id: Date.now()
        };
        const newNpcs = [...npcs, newNpc];
        updateCloud({ ...data, npcs: newNpcs });
        
        setShowAiCreator(false);
        setShowCreationMenu(false);
        setShowCompendium(false);
        setShowTextImport(false);
        setStatblockText("");
    };

    // --- D&D 5e API INTEGRATION ---
    const searchCompendium = async () => {
        if (!compendiumSearch.trim()) return;
        setIsLoadingCompendium(true);
        try {
            const res = await fetch('https://www.dnd5eapi.co/api/monsters');
            const data = await res.json();
            const results = data.results.filter(m => 
                m.name.toLowerCase().includes(compendiumSearch.toLowerCase())
            ).slice(0, 20); 
            setCompendiumResults(results);
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

            const newNpc = {
                name: m.name,
                race: `${m.size} ${m.type} (${m.alignment})`,
                class: "Monster",
                level: m.challenge_rating,
                hp: { current: m.hit_points, max: m.hit_points },
                ac: acVal,
                speed: parseInt(m.speed?.walk) || 30,
                stats: {
                    str: m.strength, dex: m.dexterity, con: m.constitution,
                    int: m.intelligence, wis: m.wisdom, cha: m.charisma
                },
                image: imageUrl,
                quirk: "SRD Import",
                bio: { 
                    backstory: `Imported from D&D 5e API.\nXP: ${m.xp}`,
                    appearance: `A ${m.size} ${m.type}.` 
                },
                customActions: (m.actions || []).map(a => {
                    const dmgString = (a.damage && a.damage.length > 0 && a.damage[0].damage_dice) 
                        ? a.damage[0].damage_dice 
                        : "";
                    return {
                        name: a.name,
                        desc: a.desc,
                        hit: a.attack_bonus ? `+${a.attack_bonus}` : "",
                        dmg: dmgString 
                    };
                }),
                features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" })),
                legendaryActions: (m.legendary_actions || []).map(l => ({ name: l.name, desc: l.desc }))
            };

            handleNpcComplete(newNpc);

        } catch (e) {
            console.error(e);
            alert("Failed to import monster details.");
        }
        setIsLoadingCompendium(false);
    };

    // --- TEXT PARSER ---
    const parseStatblock = async () => {
        if (!statblockText.trim()) return;
        setIsLoadingCompendium(true);

        const text = statblockText;
        const lines = text.split('\n').filter(l => l.trim());
        
        const name = lines[0].trim();
        const typeLine = lines[1] || "Unknown Type";
        const acMatch = text.match(/Armor Class\s*(\d+)/i);
        const hpMatch = text.match(/Hit Points\s*(\d+)/i);
        const statMatches = text.matchAll(/(\d+)\s*\([+-]?\d+\)/g);
        const statsArray = Array.from(statMatches).map(m => parseInt(m[1]));
        
        let imageUrl = "";
        if (window.puter) {
            try {
                const imgEl = await window.puter.ai.txt2img(`fantasy rpg portrait of ${name}, token style`);
                imageUrl = await processPuterImage(imgEl);
            } catch (e) {}
        }

        const newNpc = {
            name,
            race: typeLine,
            class: "Monster",
            ac: acMatch ? parseInt(acMatch[1]) : 10,
            hp: { current: hpMatch ? parseInt(hpMatch[1]) : 10, max: hpMatch ? parseInt(hpMatch[1]) : 10 },
            stats: {
                str: statsArray[0] || 10, dex: statsArray[1] || 10, con: statsArray[2] || 10,
                int: statsArray[3] || 10, wis: statsArray[4] || 10, cha: statsArray[5] || 10
            },
            image: imageUrl,
            quirk: "Parsed Text",
            bio: { backstory: "Parsed from text block." }
        };

        handleNpcComplete(newNpc);
        setIsLoadingCompendium(false);
    };

    // --- OTHER METHODS ---
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
        try {
            const charData = await parsePdf(file);
            handleNpcComplete(charData);
            alert(`Success! Imported ${charData.name}`);
        } catch (err) { alert("Import Failed: " + err.message); }
        e.target.value = null; 
        setShowCreationMenu(false);
    };

    const deleteNpc = (id, e) => {
        e.stopPropagation(); 
        if(!confirm("Delete this NPC?")) return;
        const newNpcs = npcs.filter(n => n.id !== id); 
        updateCloud({ ...data, npcs: newNpcs }, true); 
    };
    
    const toggleHidden = (npc, e) => {
        e.stopPropagation();
        const updated = { ...npc, isHidden: !npc.isHidden }; 
        const newNpcs = npcs.map(n => n.id === npc.id ? updated : n); 
        updateCloud({ ...data, npcs: newNpcs }); 
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
                    // FIXED: CONNECTING DICE & LOGGING
                    onDiceRoll={onDiceRoll} 
                    onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                />
            </div>
        );
    }

    return (
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
                                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider truncate">{npc.race} {npc.class}</p>
                                    </div>
                                </div>
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

            {/* --- CREATION HUB MODAL --- */}
            {showCreationMenu && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-5xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700">
                        <button onClick={() => setShowCreationMenu(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                        <div className="p-8 text-center">
                            <h2 className="text-3xl fantasy-font text-amber-500 mb-2">Summon an Entity</h2>
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
                                <div onClick={() => { setShowCreationMenu(false); setShowTextImport(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-amber-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                    <div className="w-12 h-12 bg-amber-900/30 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="clipboard" size={24}/></div>
                                    <h3 className="font-bold text-white">Paste Text</h3>
                                    <p className="text-[10px] text-slate-400">Parse statblock.</p>
                                </div>
                                <div onClick={() => fileInputRef.current.click()} className="bg-slate-800 border-2 border-slate-700 hover:border-red-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                    <div className="w-12 h-12 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="file-text" size={24}/></div>
                                    <h3 className="font-bold text-white">PDF</h3>
                                    <p className="text-[10px] text-slate-400">D&D Beyond PDF.</p>
                                    <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handlePdfImport}/>
                                </div>
                                <div onClick={() => { setShowCreationMenu(false); setShowAiCreator(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                    <div className="w-12 h-12 bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="sparkles" size={24}/></div>
                                    <h3 className="font-bold text-white">AI Forge</h3>
                                    <p className="text-[10px] text-slate-400">Generative NPC.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- COMPENDIUM MODAL (D&D 5E API) --- */}
            {showCompendium && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="max-w-xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                            <h3 className="font-bold text-white flex items-center gap-2"><Icon name="globe" size={18}/> D&D 5e API Search</h3>
                            <button onClick={() => setShowCompendium(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-700">
                            <div className="flex gap-2">
                                <input 
                                    autoFocus
                                    value={compendiumSearch} 
                                    onChange={(e) => setCompendiumSearch(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && searchCompendium()}
                                    placeholder="Search (e.g. Wolf, Aboleth, Lich)..." 
                                    className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                                />
                                <button onClick={searchCompendium} disabled={isLoadingCompendium} className="bg-blue-600 hover:bg-blue-500 px-4 rounded text-white font-bold">
                                    {isLoadingCompendium ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900">
                            {compendiumResults.map(m => (
                                <div key={m.index} onClick={() => importFromApi(m.url)} className="p-3 bg-slate-800 border border-slate-700 rounded hover:border-blue-500 cursor-pointer flex justify-between items-center group">
                                    <div className="font-bold text-white group-hover:text-blue-400 capitalize">{m.name}</div>
                                    <Icon name="download" size={16} className="text-slate-500 group-hover:text-blue-400"/>
                                </div>
                            ))}
                            {compendiumResults.length === 0 && !isLoadingCompendium && <div className="text-center text-slate-500 py-8 italic">Search for a creature to begin.</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* --- TEXT PARSER MODAL --- */}
            {showTextImport && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                            <h3 className="font-bold text-white flex items-center gap-2"><Icon name="clipboard" size={18}/> Parse Statblock</h3>
                            <button onClick={() => setShowTextImport(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-4">
                            <p className="text-sm text-slate-400">Paste text from 5thsrd.org, D&D Beyond, or Roll20 below.</p>
                            <textarea 
                                value={statblockText} 
                                onChange={e => setStatblockText(e.target.value)} 
                                placeholder={`Goblin\nSmall humanoid (goblinoid)...\nArmor Class 15...`} 
                                className="flex-1 bg-slate-950 border border-slate-600 rounded p-4 text-xs font-mono text-slate-300 resize-none h-64 focus:border-amber-500 outline-none"
                            />
                            <button onClick={parseStatblock} disabled={isLoadingCompendium} className="w-full bg-amber-600 hover:bg-amber-500 py-3 rounded font-bold text-white">
                                {isLoadingCompendium ? "Parsing..." : "Parse & Import"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- AI CREATOR --- */}
            {showAiCreator && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700 h-[90vh]">
                        <CharacterCreator aiHelper={aiHelper} apiKey={apiKey} onComplete={handleNpcComplete} onCancel={() => setShowAiCreator(false)} edition={edition} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default NpcView;