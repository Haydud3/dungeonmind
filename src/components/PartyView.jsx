import React, { useState, useRef } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { parsePdf } from '../utils/dndBeyondParser.js'; 

const PartyView = ({ data, role, updateCloud, savePlayer, deletePlayer, setView, user, aiHelper, onDiceRoll, onLogAction, edition, apiKey }) => {
    const [showCreationMenu, setShowCreationMenu] = useState(false); 
    const [showAiCreator, setShowAiCreator] = useState(false);        
    const [viewingCharacterId, setViewingCharacterId] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    
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
            <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col h-full w-full">
                <SheetContainer 
                    characterId={viewingCharacterId} 
                    onSave={handleSheetSave} 
                    onDiceRoll={onDiceRoll} 
                    onLogAction={onLogAction}
                    onBack={() => setViewingCharacterId(null)} 
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
                            <p className="text-slate-400 mb-8">Choose your method of creation.</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* MANUAL */}
                                <div onClick={createManualCharacter} className="bg-slate-800 border-2 border-slate-700 hover:border-green-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                    <div className="w-16 h-16 bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="pencil" size={32}/></div>
                                    <h3 className="font-bold text-xl text-white mb-2">Manual</h3>
                                    <p className="text-xs text-slate-400">Build from scratch. Full control over stats, bio, and abilities.</p>
                                </div>

                                {/* D&D BEYOND */}
                                <div onClick={() => fileInputRef.current.click()} className="bg-slate-800 border-2 border-slate-700 hover:border-red-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                    <div className="w-16 h-16 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="file-text" size={32}/></div>
                                    <h3 className="font-bold text-xl text-white mb-2">D&D Beyond</h3>
                                    <p className="text-xs text-slate-400">Import a PDF character sheet directly from D&D Beyond.</p>
                                    <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handlePdfImport}/>
                                </div>

                                {/* AI FORGE */}
                                <div onClick={() => { setShowCreationMenu(false); setShowAiCreator(true); }} className="bg-slate-800 border-2 border-slate-700 hover:border-purple-500 rounded-xl p-6 cursor-pointer group transition-all hover:-translate-y-1">
                                    <div className="w-16 h-16 bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"><Icon name="sparkles" size={32}/></div>
                                    <h3 className="font-bold text-xl text-white mb-2">AI Forge</h3>
                                    <p className="text-xs text-slate-400">Generate a unique character with portrait and backstory instantly.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI CREATOR */}
            {showAiCreator && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700 h-[90vh]">
                        <CharacterCreator aiHelper={aiHelper} apiKey={apiKey} onComplete={handleNewCharacter} onCancel={() => setShowAiCreator(false)} edition={edition} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default PartyView;