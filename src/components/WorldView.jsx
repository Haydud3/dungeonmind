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
            // START CHANGE: Hybrid Logic - Merge Instance data with Master stats
            const tokens = data.campaign?.activeMap?.tokens || [];
            const instance = tokens.find(t => t.id === activeSheetId);
            
            const allMasters = [...(data.players || []), ...(data.npcs || [])];
            const master = allMasters.find(c => c.id === (instance?.characterId || activeSheetId));
            
            if (master) {
                // START CHANGE: Deep copy to break reference and force state refresh
                const sheetData = instance 
                    ? { ...master, ...instance, id: instance.id, isInstance: true } 
                    : { ...master, isInstance: false };
                
                // Clear old state before loading new to prevent "Stickiness"
                useCharacterStore.getState().loadCharacter(null);
                setTimeout(() => useCharacterStore.getState().loadCharacter(sheetData), 0);
                // END CHANGE
            }
        }
    }, [activeSheetId, data]);

    const handleMapAction = (action, payload) => {
        if (action === 'open_sheet') {
            // START CHANGE: Set local ID for sidebar, DO NOT change global currentView
            setActiveSheetId(payload);
            // setView('sheet'); <--- DELETE THIS LINE IF IT EXISTS
            // END CHANGE
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
                    {/* START CHANGE: Added unique key using activeSheetId to force re-render */}
                    <SheetContainer 
                        key={activeSheetId}
                        characterId={activeSheetId}
                        role={role}
                        onBack={() => setActiveSheetId(null)}
                        // START CHANGE: Redirect save based on Instance flag
                        onSave={(char) => {
                            if (char.isInstance) {
                                // Save only volatile state back to the map token
                                updateMapState('update_token', { 
                                    id: char.id, 
                                    hp: char.hp, 
                                    statuses: char.statuses || [],
                                    name: char.name // Allow renaming "Goblin 2" to "Goblin Boss"
                                });
                            } else {
                                // Standard global save for Masters/PCs
                                savePlayer(char);
                            }
                        }}
                        // END CHANGE
                    />
                </div>
            )}
        </div>
    );
};

export default WorldView;