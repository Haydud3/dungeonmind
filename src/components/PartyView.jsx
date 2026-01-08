import React, { useState } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { getDebugText, parsePdf } from '../utils/dndBeyondParser'; // Import debug

const PartyView = ({ data, role, updateCloud, setView, user, aiHelper, onDiceRoll, onLogAction }) => {
    const [showCreator, setShowCreator] = useState(false);
    const [viewingCharacterId, setViewingCharacterId] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [debugLog, setDebugLog] = useState("");

    const openSheet = (character) => {
        useCharacterStore.getState().loadCharacter(character);
        setViewingCharacterId(character.id);
    };

    const handleNewCharacter = (newChar) => {
        const charWithId = { ...newChar, id: Date.now(), ownerId: user?.uid };
        const newPlayers = [...(data.players || []), charWithId];
        updateCloud({ ...data, players: newPlayers }, true);
        setShowCreator(false);
    };

    // --- IMPORT HANDLER ---
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
        e.target.value = null; // Reset
    };

    // --- DEBUG HANDLER ---
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
        e.target.value = null; // Reset input
    };

    const deleteCharacter = (id, e) => {
        e.stopPropagation();
        if (!confirm("Delete this hero permanently?")) return;
        const newPlayers = data.players.filter(p => p.id !== id);
        updateCloud({ ...data, players: newPlayers }, true);
    };

    if (viewingCharacterId) {
        return (
            <div className="h-full flex flex-col relative z-10 bg-slate-950">
                <button onClick={() => setViewingCharacterId(null)} className="absolute top-2 left-2 z-50 bg-slate-800 text-slate-400 p-2 rounded-full border border-slate-600 shadow-xl hover:text-white"><Icon name="arrow-left" size={20}/></button>
                <SheetContainer characterId={viewingCharacterId} onSave={(updatedChar) => { const newPlayers = (data.players || []).map(p => p.id === updatedChar.id ? updatedChar : p); updateCloud({ ...data, players: newPlayers }); }} onDiceRoll={onDiceRoll} onLogAction={onLogAction} />
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
                    
                    <div className="flex flex-wrap gap-2">
                        {/* DIAGNOSTIC BUTTON (RESTORED) */}
                        <label className="cursor-pointer bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2">
                            <Icon name="bug" size={18}/> 
                            <span>{isImporting ? 'Scanning...' : 'Run PDF Diagnosis'}</span>
                            <input type="file" accept=".pdf" className="hidden" onChange={handleDebugUpload} />
                        </label>

                        {/* Import PDF */}
                        <label className={`cursor-pointer bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2 ${isImporting ? 'opacity-50 cursor-wait' : ''}`}>
                            <Icon name="upload" size={18}/> 
                            <span>{isImporting ? 'Parsing...' : 'Import D&D Beyond PDF'}</span>
                            <input type="file" accept=".pdf" className="hidden" onChange={handlePdfImport} disabled={isImporting} />
                        </label>

                        <button onClick={() => setShowCreator(true)} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2">
                            <Icon name="sparkles" size={18}/> <span>AI Forge</span>
                        </button>
                    </div>
                </div>

                {/* DEBUG OUTPUT AREA */}
                {debugLog && (
                    <div className="bg-black/50 p-4 rounded border border-amber-900/50 animate-in fade-in slide-in-from-top-4">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-amber-500 font-bold font-mono">PDF RAW DATA</h3>
                            <button onClick={() => {navigator.clipboard.writeText(debugLog); alert("Copied to clipboard!");}} className="text-xs bg-slate-700 px-2 py-1 rounded text-white hover:bg-slate-600">Copy All</button>
                        </div>
                        <textarea 
                            value={debugLog} 
                            readOnly 
                            className="w-full h-64 bg-slate-950 text-green-400 font-mono text-xs p-2 rounded border border-slate-800 focus:outline-none"
                        />
                        <p className="text-slate-400 text-xs mt-2">^ Copy this text and paste it into the chat so I can fix the parser.</p>
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
                            {role === 'dm' && <button onClick={(e) => deleteCharacter(p.id, e)} className="absolute top-2 left-2 p-2 bg-red-900/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"><Icon name="trash-2" size={14}/></button>}
                        </div>
                    ))}
                </div>
            </div>
            {showCreator && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"><div className="max-w-2xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700 h-[90vh]"><CharacterCreator aiHelper={aiHelper} onComplete={handleNewCharacter} onCancel={() => setShowCreator(false)} /></div></div>}
        </div>
    );
};

export default PartyView;