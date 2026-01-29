import React, { useState, useEffect } from 'react';
import InteractiveMap from './map/InteractiveMap';
// START CHANGE: Correct Import Path
import SheetContainer from './character-sheet/SheetContainer'; 
// END CHANGE
import { useCharacterStore } from '../stores/useCharacterStore';

// START CHANGE: Add manual combatant props to destructuring
const WorldView = ({ data, role, updateCloud, updateMapState, user, apiKey, onDiceRoll, savePlayer, onInitiative, updateCombatant, removeCombatant, onClearRolls, onAutoRoll, setShowHandoutCreator, code, addManualCombatant, players, npcs }) => {
    // State to track which sheet is open
    const [activeSheetId, setActiveSheetId] = useState(null);
    const [sheetContext, setSheetContext] = useState(null); // NEW STATE FOR SHEET CONTEXT

    // --- HOT SWAP LOGIC ---
    useEffect(() => {
        if (activeSheetId) {
            // START CHANGE: Remove store loading logic - centralized in SheetContainer
            // We only need to track activeSheetId to render the sidebar.
            // SheetContainer now handles its own loading.
            // END CHANGE
        }
    }, [activeSheetId, data]);

    const handleMapAction = (action, payload) => {
        if (action === 'open_sheet') {
            // Apply Gatekeeper Logic with HUD Override
            if (payload?.forceOpen || activeSheetId !== null) {
                if (payload?.type === 'token') {
                    setActiveSheetId(payload.tokenId);
                    setSheetContext({ tokenId: payload.tokenId, isTokenSheet: true, token: payload.token });
                } else {
                    setActiveSheetId(payload);
                    setSheetContext({ characterId: payload, isTokenSheet: false });
                }
            }
            // If sidebar is closed and no forceOpen flag, ignore the request silently
            // Token remains selected on the map for movement/interaction
            // END CHANGE
        } else if (action === 'update_token') {
            const tokens = data.campaign?.activeMap?.tokens || [];
            const updatedTokens = tokens.map(t => 
                t.id === payload.id 
                    ? { ...t, hp: payload.hp, statuses: payload.statuses, name: payload.name }
                    : t
            );
            updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: updatedTokens } } });
        } else {
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
                    user={user} // CRITICAL FIX: Pass user prop for LOS calculations
                    updateCloud={updateCloud} 
                    updateMapState={handleMapAction}
                    sidebarIsOpen={activeSheetId !== null}
                    updateCombatant={updateCombatant} 
                    removeCombatant={removeCombatant} 
                    onClearRolls={onClearRolls}
                    onAutoRoll={onAutoRoll}
                    setShowHandoutCreator={setShowHandoutCreator}
                    code={code}
                    addManualCombatant={addManualCombatant}
                    players={players}
                    npcs={npcs}
                    // END CHANGE
                />
            </div>

            {/* The Sidebar Character Sheet */}
            {activeSheetId && (
                <div className="absolute top-0 right-0 bottom-0 w-full sm:w-96 bg-slate-950 border-l border-slate-700 shadow-2xl z-[80] animate-in slide-in-from-right duration-300 flex flex-col">
                    <SheetContainer 
                        data={data}
                        role={role}
                        characterId={sheetContext?.characterId}
                        tokenId={sheetContext?.tokenId}
                        isTokenSheet={sheetContext?.isTokenSheet}
                        onClose={() => { setActiveSheetId(null); setSheetContext(null); }}
                        onDiceRoll={onDiceRoll}
                        onInitiative={onInitiative}
                        onLogAction={(msg) => {}}
                        onPlaceTemplate={(spell) => {}}
                        onPossess={(npcId) => {}}
                        onSave={(char) => {
                            if (char.isInstance) {
                                updateMapState('update_token', { 
                                    id: char.tokenId || char.id, 
                                    hp: char.hp, 
                                    statuses: char.statuses || [],
                                    name: char.name
                                });
                            } else {
                                savePlayer(char);
                            }
                        }}
                    />
                    {/* END CHANGE */}
                </div>
            )}
        </div>
    );
};

export default WorldView;