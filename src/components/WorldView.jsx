import React, { useState, useEffect } from 'react';
import InteractiveMap from './map/InteractiveMap';
// START CHANGE: Correct Import Path
import SheetContainer from './character-sheet/SheetContainer'; 
// END CHANGE
import { useCharacterStore } from '../stores/useCharacterStore';

const WorldView = ({ data, role, updateCloud, updateMapState, user, apiKey, onDiceRoll, savePlayer, onInitiative }) => {
    // State to track which sheet is open
    const [activeSheetId, setActiveSheetId] = useState(null);

    // --- HOT SWAP LOGIC ---
    useEffect(() => {
        if (activeSheetId) {
            // Find the character data in Players OR NPCs
            const allChars = [...(data.players || []), ...(data.npcs || [])];
            const targetChar = allChars.find(c => c.id === activeSheetId);
            
            if (targetChar) {
                // Load into Zustand Store
                useCharacterStore.getState().loadCharacter(targetChar);
            }
        }
    }, [activeSheetId, data]);

    const handleMapAction = (action, payload) => {
        if (action === 'open_sheet') {
            setActiveSheetId(payload);
        } else {
            // Pass map-specific actions (fog, tokens) to the parent updater
            updateMapState(action, payload);
        }
    };

    return (
        <div className="absolute inset-0 w-full h-full bg-slate-900 overflow-hidden flex">
            {/* The Main Map Area */}
            <div className="flex-1 relative h-full">
                <InteractiveMap 
                    data={data} 
                    role={role} 
                    updateCloud={updateCloud} 
                    updateMapState={handleMapAction} 
                />
            </div>

            {/* The Sidebar Character Sheet */}
            {activeSheetId && (
                <div className="absolute top-0 right-0 bottom-0 w-full sm:w-96 bg-slate-950 border-l border-slate-700 shadow-2xl z-[80] animate-in slide-in-from-right duration-300 flex flex-col">
                    <SheetContainer 
                        characterId={activeSheetId}
                        role={role}
                        onBack={() => setActiveSheetId(null)}
                        // We pass saving handlers if needed, though the store usually handles auto-save
                        onSave={savePlayer}
                    />
                </div>
            )}
        </div>
    );
};

export default WorldView;