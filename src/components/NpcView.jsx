import React, { useState, useRef } from 'react';
import Icon from './Icon';
import CharacterCreator from './ai-wizard/CharacterCreator';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import { parsePdf } from '../utils/dndBeyondParser.js'; 
import { enrichCharacter } from '../utils/srdEnricher.js'; // <--- IMPORT

const NpcView = ({ data, setData, role, updateCloud, setChatInput, setView, onPossess, aiHelper, apiKey, edition, onDiceRoll }) => {
    // ... (Existing State) ...
    const [viewingNpcId, setViewingNpcId] = useState(null);
    const [showCreationMenu, setShowCreationMenu] = useState(false);
    const [showAiCreator, setShowAiCreator] = useState(false);
    
    // Compendium State
    const [showCompendium, setShowCompendium] = useState(false);
    const [compendiumSearch, setCompendiumSearch] = useState("");
    const [compendiumResults, setCompendiumResults] = useState([]);
    const [isLoadingCompendium, setIsLoadingCompendium] = useState(false);
    
    // Debug & Tools State
    const [showDebug, setShowDebug] = useState(false);
    const [debugOutput, setDebugOutput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false); // <--- NEW LOADING STATE

    const fileInputRef = useRef(null);
    const debugInputRef = useRef(null);
    const addLogEntry = useCharacterStore((state) => state.addLogEntry);

    // ... (Existing Helpers like processPuterImage, handleSheetSave, handleNpcComplete) ...
    // ... (Existing Compendium search functions) ...

    // --- UPDATED PDF IMPORT HANDLER ---
    const handlePdfImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsProcessing(true); // Start Loading
        try {
            // 1. Parse raw text from PDF
            const rawData = await parsePdf(file);
            
            // 2. Enrich with API Data (Spells, Items, etc.)
            const charData = await enrichCharacter(rawData);

            handleNpcComplete(charData);
            alert(`Success! Imported ${charData.name} (Enhanced with SRD Data)`);
        } catch (err) { 
            console.error(err);
            alert("Import Failed: " + err.message); 
        }
        setIsProcessing(false); // End Loading
        e.target.value = null; 
        setShowCreationMenu(false);
    };

    // ... (rest of the component remains the same) ...

    return (
        <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-24">
            {/* ... (Header and Grid Layout) ... */}

            {/* --- CREATION HUB MODAL --- */}
            {showCreationMenu && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-5xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700">
                        <button onClick={() => setShowCreationMenu(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                        <div className="p-8 text-center">
                            <h2 className="text-3xl fantasy-font text-amber-500 mb-2">Summon an Entity</h2>
                            
                            {/* NEW: Loading Indicator */}
                            {isProcessing ? (
                                <div className="py-12 flex flex-col items-center gap-4">
                                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                    <div className="text-amber-500 font-bold animate-pulse">Consulting the Archives (API)...</div>
                                    <div className="text-sm text-slate-500">Cross-referencing spells and equipment.</div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-slate-400 mb-8">How shall this creature arrive?</p>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                        {/* ... (Other tiles: Manual, 5e API, Debug) ... */}
                                        
                                        {/* UPDATED PDF TILE */}
                                        <div onClick={() => fileInputRef.current.click()} className="bg-slate-800 border-2 border-slate-700 hover:border-red-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-1">
                                            <div className="w-12 h-12 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="file-text" size={24}/></div>
                                            <h3 className="font-bold text-white">PDF Import</h3>
                                            <p className="text-[10px] text-slate-400">D&D Beyond + SRD Enrich.</p>
                                            <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handlePdfImport}/>
                                        </div>

                                        {/* ... (AI Forge Tile) ... */}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* ... (Rest of component) ... */}
        </div>
    );
};

export default NpcView;