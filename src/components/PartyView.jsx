import React, { useState, useRef } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { getDebugText, parsePdf } from '../utils/dndBeyondParser.js'; 

const PartyView = ({ data, role, updateCloud, savePlayer, deletePlayer, setView, user, aiHelper, onDiceRoll, onLogAction, edition }) => {
    const [showCreationMenu, setShowCreationMenu] = useState(false); // Controls the "Hub"
    const [showAiCreator, setShowAiCreator] = useState(false);       // Controls the AI Wizard
    const [viewingCharacterId, setViewingCharacterId] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [debugLog, setDebugLog] = useState("");
    
    // hidden file input ref
    const fileInputRef = useRef(null);

    const handleSheetSave = async (updatedChar) => {
        if (savePlayer) {
            await savePlayer(updatedChar);
        } else {
            const newPlayers = (data.players || []).map(p => p.id === updatedChar.id ? updatedChar : p);
            updateCloud({ ...data, players: newPlayers });
        }
    };

    const openSheet = (character) => {
        useCharacterStore.getState().loadCharacter(character);
        setViewingCharacterId(character.id);
    };

    const handleNewCharacter = (newChar) => {
        const charWithId = { ...newChar, id: Date.now(), ownerId: user?.uid };
        if(savePlayer) savePlayer(charWithId);
        else {
            const newPlayers = [...(data.players || []), charWithId];
            updateCloud({ ...data, players: newPlayers }, true);
        }
        setShowAiCreator(false);
        setShowCreationMenu(false);
    };

    // --- MANUAL CREATION ---
    const createManualCharacter = () => {
        const blankChar = {
            name: "New Hero",
            race: "Human",
            class: "Fighter",
            level: 1,
            profBonus: 2,
            hp: { current: 10, max: 10, temp: 0 },
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
            skills: {},
            spells: [],
            inventory: [],
            features: [],
            bio: { backstory: "", appearance: "", traits: "", ideals: "", bonds: "", flaws: "" }
        };
        handleNewCharacter(blankChar);
    };

    const handlePdfImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);
        try {
            const charData = await parsePdf(file);
            handleNewCharacter(charData);
            alert(`Success! Imported ${charData.name}`);
        } catch (err) {
            console.error(err);
            alert("Import Failed: " + err.message);
        }
        setIsImporting(false);
        e.target.value = null; 
        setShowCreationMenu(false);
    };

    const handleDebugUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);
        setDebugLog("Reading PDF structure...");
        try {
            const text = await getDebugText(file);
            setDebugLog(text);
        } catch (err) {
            setDebugLog("Error: " + err.message);
        }
        setIsImporting(false);
        e.target.value = null; 
    };

    const handleDelete = (id, e) => {
        e.stopPropagation();
        if (!confirm("Delete this hero permanently?")) return;
        if(deletePlayer) deletePlayer(id);
        else {
            const newPlayers = data.players.filter(p => p.id !== id);
            updateCloud({ ...data, players: newPlayers }, true);
        }
    };

    if (viewingCharacterId) {
        return (
            <div className="h-full flex flex-col relative z-10 bg-slate-950">
                <button onClick={() => setViewingCharacterId(null)} className="absolute top-2 left-2 z-50 bg-slate-800 text-slate-400 p-2 rounded-full border border-slate-600 shadow-xl hover:text-white"><Icon name="arrow-left" size={20}/></button>
                <SheetContainer characterId={viewingCharacterId} onSave={handleSheetSave} onDiceRoll={onDiceRoll} onLogAction={onLogAction} />
            </div>
        );
    }

    return (
        <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-24">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Header Actions */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-700 pb-4">
                    <div>
                        <h2 className="text-3xl fantasy-font text-amber-500">Heroes</h2>
                        <p className="text-slate-400 text-sm">Manage your party roster.</p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 justify-center">
                        {/* 1. PDF DIAGNOSTIC (Small Debug Tool) */}
                        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-500 border border-slate-700 px-3 py-2 rounded-lg flex items-center gap-2" title="Debug PDF">
                            <Icon name="bug" size={16}/> 
                            <input type="file" accept=".pdf" className="hidden" onChange={handleDebugUpload} />
                        </label>

                        {/* 2. MAIN CREATE BUTTON */}
                        <button 
                            onClick={() => setShowCreationMenu(true)} 
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transform transition-all hover:scale-105"
                        >
                            <Icon name="plus-circle" size={20}/> <span>Create New Hero</span>
                        </button>
                    </div>
                </div>

                {/* DEBUG OUTPUT AREA */}
                {debugLog && (
                    <div className="bg-black/50 p-4 rounded border border-amber-900/50 animate-in fade-in slide-in-from-top-4 relative group">
                        <button onClick={() => setDebugLog("")} className="absolute top-2 right-2 text-slate-500 hover:text-white"><Icon name="x" size={20}/></button>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-amber-500 font-bold font-mono">PDF RAW DATA</h3>
                            <button onClick={() => {navigator.clipboard.writeText(debugLog); alert("Copied!");}} className="text-xs bg-slate-700 px-2 py-1 rounded text-white hover:bg-slate-600">Copy All</button>
                        </div>
                        <textarea 
                            value={debugLog} 
                            readOnly 
                            className="w-full h-64 bg-slate-950 text-green-400 font-mono text-xs p-2 rounded border border-slate-800 focus:outline-none"
                        />
                    </div>
                )}

                {/* Character Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(data.players || []).map(p => (
                        <div key={p.id} onClick={() => openSheet(p)} className="group relative bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-amber-500/50 shadow-lg cursor-pointer transition-all hover:-translate-y-1">
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
                            <p className="text-slate-400 mb-8">Choose how you want to bring your character to life.</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* OPTION 1: MANUAL */}
                                <div 
                                    onClick={createManualCharacter}
                                    className="bg-slate-800 border-2 border-slate-700 hover:border-green-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1"
                                >
                                    <div className="w-16 h-16 bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Icon name="pencil" size={32}/>
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">Manual Entry</h3>
                                    <p className="text-sm text-slate-400">Start with a blank sheet and fill in the stats yourself. Good for pen & paper veterans.</p>
                                </div>

                                {/* OPTION 2: D&D BEYOND */}
                                <div 
                                    onClick={() => fileInputRef.current.click()}
                                    className="bg-slate-800 border-2 border-slate-700 hover:border-red-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1"
                                >
                                    <div className="w-16 h-16 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Icon name="file-text" size={32}/>
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">Import PDF</h3>
                                    <p className="text-sm text-slate-400">Upload a "Standard" PDF exported from D&D Beyond. Parses stats automatically.</p>
                                    {/* Hidden Input */}
                                    <input 
                                        type="file" 
                                        accept=".pdf" 
                                        className="hidden" 
                                        ref={fileInputRef} 
                                        onChange={handlePdfImport}
                                    />
                                    {isImporting && <div className="mt-2 text-xs text-amber-500 animate-pulse">Processing...</div>}
                                </div>

                                {/* OPTION 3: AI FORGE */}
                                <div 
                                    onClick={() => { setShowCreationMenu(false); setShowAiCreator(true); }}
                                    className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1"
                                >
                                    <div className="w-16 h-16 bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Icon name="sparkles" size={32}/>
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">AI Forge</h3>
                                    <p className="text-sm text-slate-400">Describe your concept and let the AI generate stats, backstory, and inventory.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI WIZARD MODAL */}
            {showAiCreator && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700 h-[90vh]">
                        <CharacterCreator 
                            aiHelper={aiHelper} 
                            onComplete={handleNewCharacter} 
                            onCancel={() => setShowAiCreator(false)} 
                            edition={edition} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default PartyView;