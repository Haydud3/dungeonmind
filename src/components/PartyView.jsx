import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { parsePdf } from '../utils/dndBeyondParser.js';
import { enrichCharacter } from '../utils/srdEnricher.js';

// START CHANGE: Add generatePlayer to props
const PartyView = ({ data, role, updateCloud, savePlayer, deletePlayer, setView, user, aiHelper, onDiceRoll, onLogAction, edition, apiKey, generatePlayer }) => {
    const [showCreationMenu, setShowCreationMenu] = useState(false);
    // START CHANGE: Add Forge State
    const [showForge, setShowForge] = useState(false);
    const [forgeName, setForgeName] = useState('');
    const [forgeContext, setForgeContext] = useState('');
    const [isForging, setIsForging] = useState(false);
    // END CHANGE
    const [viewingCharacterId, setViewingCharacterId] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState("Initializing...");
    const fileInputRef = useRef(null);

    // --- STALE STATE FIX ---
    // We use a Ref to hold the latest data to prevent overwriting updates
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    // START CHANGE: New Forge Handler
    const handleForgeSubmit = async () => {
        if (!forgeName.trim()) return;
        setIsForging(true);
        const instruction = forgeContext ? `Class/Race/Vibe: ${forgeContext}` : "Create a standard Level 1 adventurer.";
        const newChar = await generatePlayer(forgeName, instruction);
        if (newChar) {
            handleNewCharacter({
                ...newChar,
                xp: 0, level: 1, maxHp: newChar.hp, currentHp: newChar.hp,
                conditions: [], spellSlots: {}, isPublic: true
            });
            setShowForge(false); setForgeName(''); setForgeContext('');
        } else { alert("The Forge failed."); }
        setIsForging(false);
    };
    // END CHANGE

    const handleSheetSave = async (updatedChar) => {
        // Double check specifically for undefined here as a failsafe
        const cleanChar = JSON.parse(JSON.stringify(updatedChar, (k, v) => v === undefined ? null : v));
        
        if (savePlayer) {
            await savePlayer(cleanChar);
        } else {
            // Use dataRef.current to get the LATEST players list
            const currentData = dataRef.current;
            const newPlayers = (currentData.players || []).map(p => p.id === cleanChar.id ? cleanChar : p);
            updateCloud({ ...currentData, players: newPlayers });
        }
    };

    const openSheet = (character) => {
        useCharacterStore.getState().loadCharacter(character);
        setViewingCharacterId(character.id);
    };

    const handleNewCharacter = (newChar) => {
        // Ensure ID is a string if your DB expects it, or number if you use Date.now()
        // START CHANGE: Smart Overwrite Logic
        const currentData = dataRef.current;
        const existingIndex = (currentData.players || []).findIndex(p => p.name === newChar.name);
        
        let finalChar;

        if (existingIndex !== -1) {
            // MERGE STRATEGY: Keep ID and Image, overwrite stats/inventory
            const existing = currentData.players[existingIndex];
            finalChar = {
                ...newChar,
                id: existing.id, // Keep original ID
                image: existing.image || newChar.image, // Prefer existing image if set
                ownerId: existing.ownerId,
                // Preserve specific fields if needed
                bio: { ...newChar.bio, notes: existing.bio?.notes || newChar.bio?.notes } 
            };
        } else {
            // Create New
            finalChar = { 
                ...newChar, 
                id: Date.now(), 
                ownerId: user?.uid || "anon" 
            };
        }
        
        // Sanitization
        const cleanChar = JSON.parse(JSON.stringify(finalChar, (k, v) => v === undefined ? null : v));
        
        if(savePlayer) {
            savePlayer(cleanChar);
        } else {
            let newPlayers;
            if (existingIndex !== -1) {
                newPlayers = [...currentData.players];
                newPlayers[existingIndex] = cleanChar;
                alert(`Updated existing hero: ${cleanChar.name}`);
            } else {
                newPlayers = [...(currentData.players || []), cleanChar];
            }
            updateCloud({ ...currentData, players: newPlayers }, true);
        }
        // END CHANGE

        setShowForge(false);
        setShowCreationMenu(false);
    };

    // START CHANGE: Anti-Meta Privacy Lock Handler
    const handleCharacterClick = (char) => {
        // 1. DM can see everyone
        if (role === 'dm') {
            openSheet(char);
            return;
        }

        // 2. Spectators (users with no character yet) can see everyone
        const myChar = data.players?.find(p => p.ownerId === user?.uid);
        if (!myChar) {
            openSheet(char);
            return;
        }

        // 3. Owners can see their own character
        if (char.ownerId === user?.uid) {
            openSheet(char);
            return;
        }

        // 4. Block everyone else
        alert("You cannot peer into the soul of another adventurer.");
    };
    // END CHANGE

    // START CHANGE: Missing File Import Handler
    const handleFileImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);
        setImportStatus("Consulting the Weave (API)...");
        try {
            const rawData = await parsePdf(file); // Parse D&D Beyond PDF
            let charData = await enrichCharacter(rawData); // Add Rules/Spells
            
            handleNewCharacter(charData);
        } catch (err) {
            console.error(err);
            alert("Import Failed: " + err.message);
        }
        setIsImporting(false);
        e.target.value = null;
        setShowCreationMenu(false);
    };
    // END CHANGE

    const createManualCharacter = () => {
        const blankChar = {
            name: "New Hero",
            race: "Human",
            class: "Fighter",
            level: 1,
            hp: { current: 10, max: 10, temp: 0 },
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            bio: {}
        };
        handleNewCharacter(blankChar);
    };

    const handleDelete = (id, e) => {
        e.stopPropagation();
        if (!confirm("Delete this hero permanently?")) return;
        if(deletePlayer) deletePlayer(id);
        else {
            const currentData = dataRef.current;
            const newPlayers = currentData.players.filter(p => p.id !== id);
            updateCloud({ ...currentData, players: newPlayers }, true);
        }
    };

    if (viewingCharacterId) {
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col h-full w-full">
                <SheetContainer 
                    characterId={viewingCharacterId} 
                    onSave={handleSheetSave} 
                    onDiceRoll={onDiceRoll} 
                    onLogAction={onLogAction}
                    onBack={() => setViewingCharacterId(null)} 
                    // START CHANGE: Pass Role here to enable DM Tab
                    role={role}
                    // END CHANGE
                />
            </div>
        );
    }

    return (
        <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-24">
            <div className="max-w-6xl mx-auto space-y-6">
                
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-700 pb-4">
                    <div>
                        <h2 className="text-3xl fantasy-font text-amber-500">Heroes</h2>
                        <p className="text-slate-400 text-sm">Manage your party roster.</p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 justify-center">
                        <button 
                            onClick={() => setShowCreationMenu(true)} 
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transform transition-all hover:scale-105"
                        >
                            <Icon name="plus-circle" size={20}/> <span>Create New Hero</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(data.players || []).map(p => (
                        <div key={p.id} 
                            // START CHANGE: Use Privacy Lock Handler
                            onClick={() => handleCharacterClick(p)}
                            // END CHANGE
                            className="group relative bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-amber-500/50 shadow-lg cursor-pointer transition-all hover:-translate-y-1">
                            <div className="h-32 bg-slate-700 relative overflow-hidden">
                                {p.image ? <img src={p.image} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt={p.name} /> : <div className="w-full h-full flex items-center justify-center bg-slate-700 opacity-20"><Icon name="user" size={64}/></div>}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                                <div className="absolute top-3 right-3 bg-amber-600 text-white text-xs font-bold px-2 py-1 rounded shadow-md border border-amber-400">LVL {p.level || 1}</div>
                            </div>
                            <div className="p-4 relative -mt-8">
                                <div className="flex justify-between items-end">
                                    <div className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-slate-600 shadow-2xl flex items-center justify-center overflow-hidden">
                                        {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-slate-500">{p.name?.[0]}</span>}
                                    </div>
                                    <div className="flex-1 ml-3 mb-1">
                                        <h3 className="text-xl font-bold text-slate-100 leading-tight group-hover:text-amber-400 truncate">{p.name}</h3>
                                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">{p.race} {p.class}</p>
                                    </div>
                                </div>
                            </div>
                            {role === 'dm' && <button onClick={(e) => handleDelete(p.id, e)} className="absolute top-2 left-2 p-2 bg-red-900/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"><Icon name="trash-2" size={14}/></button>}
                        </div>
                    ))}
                </div>
            </div>

            {/* CREATION HUB MODAL */}
            {showCreationMenu && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-4xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700">
                        <button onClick={() => setShowCreationMenu(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                        
                        <div className="p-8 text-center">
                            <h2 className="text-3xl fantasy-font text-amber-500 mb-2">Summon a Hero</h2>
                            
                            {isImporting ? (
                                <div className="py-10">
                                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-indigo-400 font-bold animate-pulse">{importStatus}</p>
                                    <p className="text-xs text-slate-500">Cross-referencing spells with SRD Database.</p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-slate-400 mb-8">Choose your method of creation.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* MANUAL */}
                                        <div onClick={createManualCharacter} className="bg-slate-800 border-2 border-slate-700 hover:border-green-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-16 h-16 bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="pencil" size={32}/></div>
                                            <h3 className="font-bold text-xl text-white mb-2">Manual</h3>
                                            <p className="text-xs text-slate-400">Build from scratch.</p>
                                        </div>

                                        {/* D&D BEYOND */}
                                        <div onClick={() => fileInputRef.current.click()} className="bg-slate-800 border-2 border-slate-700 hover:border-red-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-16 h-16 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="file-text" size={32}/></div>
                                            <h3 className="font-bold text-xl text-white mb-2">PDF/JSON Import</h3>
                                            <p className="text-xs text-slate-400">D&D Beyond or ICE 5e.</p>
                                            <input type="file" accept=".pdf,.json" className="hidden" ref={fileInputRef} onChange={handleFileImport}/>
                                        </div>

                                        {/* AI FORGE */}
                                        {/* START CHANGE: Update onClick to use setShowForge instead of setShowAiCreator */}
                                        <div onClick={() => { setShowCreationMenu(false); setShowForge(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-16 h-16 bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="sparkles" size={32}/></div>
                                            <h3 className="font-bold text-xl text-white mb-2">AI Forge</h3>
                                            <p className="text-xs text-slate-400">Generate instantly.</p>
                                        </div>
                                        {/* END CHANGE */}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* AI CREATOR / FORGE */}
            {/* START CHANGE: New Context-Aware Forge Modal */}
            {showForge && (
                <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-2">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Icon name="sparkles" className="text-indigo-400"/> Character Forge</h3>
                            <button onClick={() => setShowForge(false)} className="text-slate-400 hover:text-white"><Icon name="x"/></button>
                        </div>
                        {isForging ? (
                            <div className="text-center py-8">
                                <Icon name="loader-2" size={48} className="animate-spin text-indigo-500 mx-auto mb-4"/>
                                <p className="text-indigo-300 font-bold animate-pulse">Consulting the Archives...</p>
                                <p className="text-xs text-slate-500 mt-2">Checking Lore & Rules...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Name</label>
                                    <input autoFocus className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" placeholder="e.g. Sildar Hallwinter" value={forgeName} onChange={e => setForgeName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleForgeSubmit()}/>
                                    <p className="text-[10px] text-slate-500 mt-1">If this name exists in your PDF/Journal, the AI will use that history!</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Concept (Optional)</label>
                                    <input className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" placeholder="e.g. Dwarf Cleric" value={forgeContext} onChange={e => setForgeContext(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleForgeSubmit()}/>
                                </div>
                                <button onClick={handleForgeSubmit} disabled={!forgeName.trim()} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded flex justify-center items-center gap-2 mt-4"><Icon name="hammer" size={18}/> Forge Hero</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* END CHANGE */}
        </div>
    );
};

export default PartyView;