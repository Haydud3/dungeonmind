import React, { useState, useRef, useEffect, useMemo } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
// START CHANGE: Import D&D Beyond Importer
import { parsePdf } from '../utils/dndBeyondParser.js'; // This seems to be a misnamed file in the original code, should be pdfParser.js
import DndBeyondImporter from './character-sheet/DndBeyondImporter';
import { parseDndBeyondJson } from './character-sheet/dndBeyondParser.js';
// END CHANGE
import { enrichCharacter } from '../utils/srdEnricher.js';

import { useNewCampaign } from '../contexts/NewCampaignProvider';

// START CHANGE: Add generatePlayer to props
const PartyView = ({ data, role, setView, user, aiHelper, onDiceRoll, diceLog, onLogAction, edition, apiKey, generatePlayer }) => {
    const { updateCampaign } = useNewCampaign();
    
    // FIX: Add a safety check. If data is missing, use an empty array.
    const playersList = data?.players || []; 

    const [showCreationMenu, setShowCreationMenu] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    // START CHANGE: Add Forge State
    const [showForge, setShowForge] = useState(false);
    const [forgeName, setForgeName] = useState('');
    const [forgeContext, setForgeContext] = useState('');
    const [isForging, setIsForging] = useState(false);
    // START CHANGE: Add state for D&D Beyond Importer
    const [showDndBeyondImport, setShowDndBeyondImport] = useState(false);
    const [refreshCharacter, setRefreshCharacter] = useState(null);
    // END CHANGE
    // END CHANGE
    const [viewingCharacterId, setViewingCharacterId] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState("Initializing...");
    const fileInputRef = useRef(null);

    // --- STALE STATE FIX ---
    // We use a Ref to hold the latest data to prevent overwriting updates
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    const [editableName, setEditableName] = useState('');

    const viewingCharacter = useMemo(() => {
        if (!viewingCharacterId) return null;
        return (data?.players || []).find(p => String(p.id) === String(viewingCharacterId));
    }, [viewingCharacterId, data?.players]);

    useEffect(() => {
        if (viewingCharacter) {
            setEditableName(viewingCharacter.name);
        }
    }, [viewingCharacter]);

    const handleRefreshDndBeyond = async (mode) => {
        if (!refreshCharacter?.dndBeyondId) return;
        setIsImporting(true);
        setImportStatus("Fetching from D&D Beyond...");
        try {
            const encodedUrl = encodeURIComponent(`https://character-service.dndbeyond.com/character/v5/character/${refreshCharacter.dndBeyondId}`);
            const response = await fetch(`https://corsproxy.io/?${encodedUrl}`);
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const jsonData = await response.json();
            const parsedData = parseDndBeyondJson(jsonData);
            const enrichedChar = await enrichCharacter(parsedData);
            
            const currentData = dataRef.current || {};
            const pList = currentData.players || [];
            const existingIndex = pList.findIndex(p => String(p.id) === String(refreshCharacter.id));
            
            if (existingIndex !== -1) {
                const existing = pList[existingIndex];
                let cleanChar;
                
                if (mode === 'combine') {
                    // Combine mode: Keep current inventory, HP, current slots, conditions, image, and ID.
                    cleanChar = JSON.parse(JSON.stringify({
                        ...enrichedChar,
                        id: existing.id,
                        ownerId: existing.ownerId,
                        image: existing.image || enrichedChar.image,
                        hp: existing.hp,
                        inventory: existing.inventory,
                        conditions: existing.conditions,
                        bio: { ...enrichedChar.bio, notes: existing.bio?.notes || enrichedChar.bio?.notes },
                        spellSlots: existing.spellSlots,
                        currency: existing.currency
                    }, (k, v) => v === undefined ? null : v));
                    alert(`Combined updates for ${cleanChar.name}`);
                } else {
                    // Overwrite mode: Completely replace the character except for ID, Owner, Image
                    cleanChar = JSON.parse(JSON.stringify({
                        ...enrichedChar,
                        id: existing.id,
                        ownerId: existing.ownerId,
                        image: existing.image || enrichedChar.image,
                        bio: { ...enrichedChar.bio, notes: existing.bio?.notes || enrichedChar.bio?.notes }
                    }, (k, v) => v === undefined ? null : v));
                    alert(`Overwrote ${cleanChar.name} with fresh D&D Beyond data.`);
                }
                
                const newPlayers = [...pList];
                newPlayers[existingIndex] = cleanChar;
                updateCampaign({ players: newPlayers });
            }
        } catch(err) {
            alert("Refresh failed: " + err.message);
        }
        setRefreshCharacter(null);
        setIsImporting(false);
    };



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

    const handleNameSave = () => {
        if (viewingCharacter && editableName && viewingCharacter.name !== editableName) {
            handleSheetSave({ ...viewingCharacter, name: editableName });
        }
    };

    const handleSheetSave = async (updatedChar) => {
        // Double check specifically for undefined here as a failsafe
        const cleanChar = JSON.parse(JSON.stringify(updatedChar, (k, v) => v === undefined ? null : v));
        
        const currentData = dataRef.current;
        const newPlayers = (currentData.players || []).map(p => p.id === cleanChar.id ? cleanChar : p);
        updateCampaign({ players: newPlayers });
    };

    const openSheet = (character) => {
        useCharacterStore.getState().loadCharacter(character);
        setViewingCharacterId(character.id);
    };

    const handleNewCharacter = (newChar) => {
        // FIX: Fallback to an empty object if data is missing
        const currentData = dataRef.current || {};
        const playersList = currentData.players || [];
        
        const existingIndex = playersList.findIndex(p => p.name === newChar.name);
        
        let finalChar;

        if (existingIndex !== -1) {
            // MERGE STRATEGY: Keep ID and Image, overwrite stats/inventory
            const existing = playersList[existingIndex];
            finalChar = {
                ...newChar,
                id: existing.id, // Keep original ID
                image: existing.image || newChar.image, // Prefer existing image if set
                ownerId: existing.ownerId || user?.uid,
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
        
        let newPlayers;
        if (existingIndex !== -1) {
            newPlayers = [...playersList];
            newPlayers[existingIndex] = cleanChar;
            alert(`Updated existing hero: ${cleanChar.name}`);
        } else {
            newPlayers = [...playersList, cleanChar];
        }
        updateCampaign({ players: newPlayers });
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
        const currentData = dataRef.current;
        const newPlayers = currentData.players.filter(p => p.id !== id);
        updateCampaign({ players: newPlayers });
    };

    if (viewingCharacterId) {
        return (
            <div className="flex flex-col h-full w-full bg-slate-950">
                <div className="flex-1 min-h-0">
                    <SheetContainer 
                        // Pass the full viewingCharacter object instead of just the ID
                        character={viewingCharacter}
                        isOwner={role === 'dm' || viewingCharacter.ownerId === user?.uid}
                        onSave={handleSheetSave} 
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
                        onLogAction={onLogAction}
                        onBack={() => setViewingCharacterId(null)} 
                        role={role}
                        onOpenDiceTray={onOpenDiceTray}
                    />
                </div>
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
                    
                    <div className="flex flex-wrap gap-2 justify-center items-center">
                        <button 
                            onClick={() => setShowCreationMenu(true)} 
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transform transition-all hover:scale-105"
                        >
                            <Icon name="plus-circle" size={20}/> <span>Create New Hero</span>
                        </button>
                        <div className="flex bg-slate-800 rounded p-1 border border-slate-700 ml-2">
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="layout-grid" size={16}/></button>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-700 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="list" size={16}/></button>
                        </div>
                    </div>
                </div>

                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
                    {playersList.map(p => (
                        viewMode === 'grid' ? (
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
                                    <div className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-amber-500 shadow-2xl flex items-center justify-center overflow-hidden">
                                        {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-slate-500">{p.name?.[0]}</span>}
                                    </div>
                                    <div className="flex-1 ml-3 mb-1">
                                        <h3 className="text-xl font-bold text-slate-100 leading-tight group-hover:text-amber-400 truncate">{p.name}</h3>
                                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">{p.race} {p.class}</p>
                                    </div>
                                </div>
                            </div>
                            {(role === 'dm' || p.ownerId === user?.uid) && (
                                <div className="absolute top-2 left-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => handleDelete(p.id, e)} className="p-2 bg-red-900/80 text-white rounded hover:bg-red-700" title="Delete"><Icon name="trash-2" size={14}/></button>
                                    {p.dndBeyondId && (
                                        <button onClick={(e) => { e.stopPropagation(); setRefreshCharacter(p); }} className="p-2 bg-blue-900/80 text-white rounded hover:bg-blue-700" title="Refresh from D&D Beyond"><Icon name="refresh-cw" size={14}/></button>
                                    )}
                                </div>
                            )}
                        </div>
                        ) : (
                            <div key={p.id} onClick={() => handleCharacterClick(p)} className="group bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-3 flex items-center gap-4 cursor-pointer shadow-lg transition-all hover:-translate-y-0.5">
                                <div className="w-12 h-12 rounded-lg bg-slate-700 border border-slate-600 overflow-hidden shrink-0 relative">
                                    {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 text-xl">{p.name?.[0]}</div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-slate-100 group-hover:text-amber-400 truncate">{p.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider truncate">{p.race} {p.class} • LVL {p.level || 1}</p>
                                    </div>
                                </div>
                                {role === 'dm' && (
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {p.dndBeyondId && (
                                            <button onClick={(e) => { e.stopPropagation(); setRefreshCharacter(p); }} className="p-2 bg-blue-900/50 text-blue-400 rounded hover:bg-blue-700 hover:text-white transition-colors" title="Refresh from D&D Beyond"><Icon name="refresh-cw" size={16}/></button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id, e); }} className="p-2 bg-red-900/50 text-red-400 rounded hover:bg-red-700 hover:text-white transition-colors" title="Delete"><Icon name="trash-2" size={16}/></button>
                                    </div>
                                )}
                            </div>
                        )
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

                                        {/* AI FORGE */}
                                        {/* START CHANGE: Update onClick to use setShowForge instead of setShowAiCreator */}
                                        <div onClick={() => { setShowCreationMenu(false); setShowForge(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-16 h-16 bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="sparkles" size={32}/></div>
                                            <h3 className="font-bold text-xl text-white mb-2">AI Forge</h3>
                                            <p className="text-xs text-slate-400">Generate instantly.</p>
                                        </div>
                                        {/* END CHANGE */}
                                        {/* START CHANGE: Add D&D Beyond URL Import Option */}
                                        <div onClick={() => { setShowCreationMenu(false); setShowDndBeyondImport(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-red-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-16 h-16 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="link" size={32}/></div>
                                            <h3 className="font-bold text-xl text-white mb-2">D&D Beyond URL</h3>
                                            <p className="text-xs text-slate-400">Import from public URL.</p>
                                        </div>
                                        {/* END CHANGE */}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Refresh Character Modal */}
            {refreshCharacter && (
                <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-md w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700 p-6 relative">
                        <button onClick={() => setRefreshCharacter(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Icon name="refresh-cw" className="text-blue-400"/> Refresh {refreshCharacter.name}</h3>
                        
                        {isImporting ? (
                            <div className="py-8 text-center">
                                <Icon name="loader-2" size={48} className="animate-spin text-blue-500 mx-auto mb-4"/>
                                <p className="text-blue-400 font-bold animate-pulse">{importStatus}</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-slate-400 mb-6">How would you like to apply the fresh data from D&D Beyond?</p>
                                <div className="space-y-4">
                                    <button onClick={() => handleRefreshDndBeyond('combine')} className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-4 group transition-colors">
                                        <div className="font-bold text-white group-hover:text-blue-400 flex items-center gap-2 mb-1"><Icon name="git-merge" size={16}/> Combine (Recommended)</div>
                                        <p className="text-xs text-slate-400">Updates stats, spells, and features but keeps your current Inventory, HP, and Conditions.</p>
                                    </button>
                                    <button onClick={() => handleRefreshDndBeyond('overwrite')} className="w-full text-left bg-slate-800 hover:bg-red-900/50 border border-slate-600 hover:border-red-500/50 rounded-lg p-4 group transition-colors">
                                        <div className="font-bold text-white group-hover:text-red-400 flex items-center gap-2 mb-1"><Icon name="alert-triangle" size={16}/> Overwrite</div>
                                        <p className="text-xs text-slate-400">Completely replaces this character with the D&D Beyond sheet. You will lose local inventory changes.</p>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* START CHANGE: D&D Beyond Importer Modal */}
            {showDndBeyondImport && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <DndBeyondImporter 
                        onImport={(charData) => {
                            if (charData) handleNewCharacter(charData);
                            setShowDndBeyondImport(false);
                        }} 
                        onCancel={() => setShowDndBeyondImport(false)} 
                    />
                </div>
            )}
            {/* END CHANGE */}

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