import React, { useState, useRef, useEffect, useMemo } from 'react';
import Icon from './Icon';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
// START CHANGE: Import D&D Beyond Importer
import { parsePdf } from '../utils/dndBeyondParser.js'; // This seems to be a misnamed file in the original code, should be pdfParser.js
import DndBeyondImporter from './character-sheet/DndBeyondImporter';
import { parseDndBeyondJson } from './character-sheet/dndBeyondParser.js';
import CharacterBuilder from '../utils/CharacterBuilder';
// END CHANGE
import { enrichCharacter } from '../utils/srdEnricher.js';
import { searchGithubModels } from '../utils/miniManifest';
import { Client } from "@gradio/client";
import { retrieveChunkedMap, storeChunkedMap } from '../utils/storageUtils';

import { useNewCampaign } from '../contexts/NewCampaignProvider';

// START CHANGE: Add generatePlayer to props
const PartyView = ({ data, role, setView, user, aiHelper, onDiceRoll, diceLog, onLogAction, edition, apiKey, onOpenDiceTray }) => {
    const { updateCampaign } = useNewCampaign();
    
    // FIX: Add a safety check. If data is missing, use an empty array.
    const playersList = data?.players || []; 

    const [viewMode, setViewMode] = useState(() => localStorage.getItem('dm_party_view_mode') || 'grid');
    useEffect(() => {
        localStorage.setItem('dm_party_view_mode', viewMode);
    }, [viewMode]);
    // START CHANGE: Add state for D&D Beyond Importer
    const [showDndBeyondImport, setShowDndBeyondImport] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [refreshCharacter, setRefreshCharacter] = useState(null);
    // END CHANGE
    // END CHANGE
    const [viewingCharacterId, setViewingCharacterId] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState("Initializing...");
    const fileInputRef = useRef(null);

    const [characterForModelSelection, setCharacterForModelSelection] = useState(null);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [miniSearchQuery, setMiniSearchQuery] = useState("");
    const [isSearchingMinis, setIsSearchingMinis] = useState(false);
    const [isForging3D, setIsForging3D] = useState(false);
    const [forge3DStatus, setForge3DStatus] = useState("");

    // --- STALE STATE FIX ---
    // We use a Ref to hold the latest data to prevent overwriting updates
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    const [editableName, setEditableName] = useState('');

    const viewingCharacter = useMemo(() => {
        if (!viewingCharacterId) return null;
        return (data?.players || []).find(p => String(p.id) === String(viewingCharacterId));
    }, [viewingCharacterId, data?.players]);

    const isOwnerOf = (char) => {
        if (!char) return false;
        const myAssignedCharId = data?.assignments?.[user?.uid];
        return String(char.ownerId) === String(user?.uid) || (myAssignedCharId && String(char.id) === String(myAssignedCharId));
    };

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
            const dndBeyondRaw = String(refreshCharacter.dndBeyondId);
            const characterId = dndBeyondRaw.match(/\/characters\/(\d+)/)?.[1] || dndBeyondRaw.match(/^\d+$/)?.[0] || dndBeyondRaw;
            const encodedUrl = encodeURIComponent(`https://character-service.dndbeyond.com/character/v5/character/${characterId}`);
            let response = await fetch(`https://corsproxy.io/?url=${encodedUrl}`).catch(() => null);

            if (!response || !response.ok) {
                response = await fetch(`https://api.allorigins.win/raw?url=${encodedUrl}`).catch(() => null);
            }

            if (!response || !response.ok) throw new Error(`Fetch failed. D&D Beyond's security might be blocking the request.`);
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

    };

    // START CHANGE: Anti-Meta Privacy Lock Handler
    const handleCharacterClick = (char) => {
        // 1. DM can see everyone
        if (role === 'dm') {
            openSheet(char);
            return;
        }

        // 2. Spectators (users with no character yet) can see everyone
        const myChar = data.players?.find(p => isOwnerOf(p));
        if (!myChar) {
            openSheet(char);
            return;
        }

        // 3. Owners can see their own character
        if (isOwnerOf(char)) {
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
    };
    // END CHANGE

    const handleDelete = (id, e) => {
        e.stopPropagation();
        if (!confirm("Delete this hero permanently?")) return;
        const currentData = dataRef.current;
        const newPlayers = currentData.players.filter(p => p.id !== id);
        updateCampaign({ players: newPlayers });
    };

    const handleMiniSearch = async (overrideQuery, typeFallback) => {
        const q = overrideQuery !== undefined ? overrideQuery : miniSearchQuery;
        if (!q) return;
        setIsSearchingMinis(true);
        let results = await searchGithubModels(q);
        if (results.length === 0 && typeFallback) results = await searchGithubModels(typeFallback);
        setAvailableModels(results);
        setIsSearchingMinis(false);
    };

    const handleForge3D = async (charForModel) => {
        if (!charForModel) return;
        try {
            setIsForging3D(true);
            setForge3DStatus("The Forge is hot... Sculpting 3D mesh (this may take a minute).");
            
            let imageBlob = null;
            let imageUrl = charForModel.image;
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
            
            setForge3DStatus("Connecting to AI... (May take 30-60s)");
            const app = await Client.connect("stabilityai/TripoSR");
            
            setForge3DStatus("Sculpting 3D Mesh... Please wait.");
            const result = await app.predict("/predict", [
                imageBlob,
                true, // Remove Background
                85    // Foreground Ratio
            ]);
            
            let glbUrl = "";
            const glbOutput = result.data[0];
            if (typeof glbOutput === 'string') glbUrl = glbOutput;
            else if (glbOutput && glbOutput.url) glbUrl = glbOutput.url;
            else if (glbOutput && glbOutput.path) {
                glbUrl = "https://stabilityai-triposr.hf.space/file=" + glbOutput.path;
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

            const newChunkedUrl = await storeChunkedMap(glbBase64, (charForModel.name || "char") + "_mini.glb");
            
            handleModelSelect({ url: newChunkedUrl, scale: 1, yOffset: 0 });
            
        } catch (e) {
            console.error(e);
            alert("3D Forge Failed: " + e.message);
        } finally {
            setIsForging3D(false);
        }
    };

    const handleModelSelect = (model, forceStatue = false) => {
        const finalChar = { ...characterForModelSelection };
        if (model) {
            finalChar.modelUrl = model.url;
            finalChar.modelScale = 1;
            finalChar.modelYOffset = 0;
            finalChar.forceStatue = forceStatue;
        } else {
            delete finalChar.modelUrl;
            delete finalChar.modelScale;
            delete finalChar.modelYOffset;
            delete finalChar.forceStatue;
        }
        
        handleSheetSave(finalChar);
        alert(`Updated 3D model for ${finalChar.name}!`);
        if (viewingCharacterId === finalChar.id) {
            useCharacterStore.getState().loadCharacter(finalChar);
        }
        
        setCharacterForModelSelection(null);
        setShowModelPicker(false);
    };

    const openModelPickerForExisting = (charId) => {
        const currentData = dataRef.current || {};
        const char = (currentData.players || []).find(n => String(n.id) === String(charId));
        if (!char) return;
        setCharacterForModelSelection(char);
        setAvailableModels([]);
        setShowModelPicker(true);
        setMiniSearchQuery(char.name);
        handleMiniSearch(char.name, char.race);
    };

    if (viewingCharacterId) {
        return (
            <div className="flex flex-col h-full w-full bg-slate-950">
                <div className="flex-1 min-h-0">
                    <SheetContainer 
                        // Pass the full viewingCharacter object instead of just the ID
                        character={viewingCharacter}
                        isOwner={role === 'dm' || isOwnerOf(viewingCharacter)}
                        onSave={handleSheetSave} 
                        onDiceRoll={async (formula, options) => {
                            if (onDiceRoll) {
                                return await onDiceRoll(formula, { ...options, chat: true, isPrivate: role === 'dm' });
                            }
                        }}
                        diceLog={diceLog}
                        onLogAction={onLogAction}
                        onBack={() => setViewingCharacterId(null)} 
                        role={role}
                        onOpenModelPicker={() => openModelPickerForExisting(viewingCharacterId)}
                        onOpenDiceTray={onOpenDiceTray}
                    />
                    {showModelPicker && characterForModelSelection && (
                        <div className="absolute inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                                <h3 className="font-bold text-white flex items-center gap-2"><Icon name="box" size={18}/> Select 3D Mini: {characterForModelSelection.name}</h3>
                                <button onClick={() => { setCharacterForModelSelection(null); setShowModelPicker(false); }} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
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
                                    
                                    <div onClick={() => handleForge3D(characterForModelSelection)} className="bg-slate-800 border border-purple-500/50 border-dashed rounded-lg p-2 cursor-pointer hover:border-purple-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                                        <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-purple-500/30 group-hover:border-purple-500 group-hover:scale-110 transition-transform">
                                            <Icon name="sparkles" size={24} className="text-purple-500 group-hover:text-purple-400"/>
                                        </div>
                                        <div className="font-bold text-sm text-purple-400 group-hover:text-purple-300 text-center">Forge 3D Mini</div>
                                        <div className="text-[10px] text-purple-500/70 text-center">AI Generate (Free)</div>
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
        <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-24">
            <div className="max-w-6xl mx-auto space-y-6">
                
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-700 pb-4">
                    <div>
                        <h2 className="text-3xl fantasy-font text-amber-500">Heroes</h2>
                        <p className="text-slate-400 text-sm">Manage your party roster.</p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 justify-center items-center">
                        <button onClick={() => setShowDndBeyondImport(true)} className="bg-slate-800 hover:bg-slate-700 text-white py-2 px-4 rounded-lg font-bold flex items-center gap-2 shadow-lg transition-all border border-slate-700 hover:border-indigo-500/50">
                            <Icon name="download" size={18} /> <span className="hidden md:inline">Import D&D Beyond</span>
                        </button>
                        <button 
                            onClick={() => setShowBuilder(true)} 
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all border border-indigo-500/50"
                        >
                            <Icon name="user-plus" size={18}/> <span className="hidden md:inline">Create Character</span>
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
                                {p.image ? <img src={p.image} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt={p.name} referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center bg-slate-700 opacity-20"><Icon name="user" size={64}/></div>}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                                <div className="absolute top-3 right-3 bg-amber-600 text-white text-xs font-bold px-2 py-1 rounded shadow-md border border-amber-400">LVL {p.level || 1}</div>
                            </div>
                            <div className="p-4 relative -mt-8">
                                <div className="flex justify-between items-end">
                                    <div className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-amber-500 shadow-2xl flex items-center justify-center overflow-hidden">
                                        {p.image ? <img src={p.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-2xl font-bold text-slate-500">{p.name?.[0]}</span>}
                                    </div>
                                    <div className="flex-1 ml-3 mb-1">
                                        <h3 className="text-xl font-bold text-slate-100 leading-tight group-hover:text-amber-400 truncate">{p.name}</h3>
                                        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">{p.race} {p.class}</p>
                                    </div>
                                </div>
                            </div>
                            {(role === 'dm' || isOwnerOf(p)) && (
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
                                    {p.image ? <img src={p.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 text-xl">{p.name?.[0]}</div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-slate-100 group-hover:text-amber-400 truncate">{p.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider truncate">{p.race} {p.class} • LVL {p.level || 1}</p>
                                    </div>
                                </div>
                                {(role === 'dm' || isOwnerOf(p)) && (
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
            
            {/* Native Builder Modal */}
            {showBuilder && (
                <CharacterBuilder 
                    onClose={() => setShowBuilder(false)}
                    onComplete={(finalSheet) => {
                        handleNewCharacter(finalSheet);
                        setShowBuilder(false);
                    }}
                />
            )}

        </div>
    );
};

export default PartyView;