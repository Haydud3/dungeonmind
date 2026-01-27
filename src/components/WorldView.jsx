import React, { useState, useEffect } from 'react';
import InteractiveMap from './map/InteractiveMap';
// START CHANGE: Correct Import Path
import SheetContainer from './character-sheet/SheetContainer'; 
// END CHANGE
import { useCharacterStore } from '../stores/useCharacterStore';

const WorldView = ({ data, role, updateCloud, updateMapState, user, apiKey, onDiceRoll, savePlayer, onInitiative, updateCombatant, removeCombatant, onClearRolls }) => {
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
            // START CHANGE: Apply Gatekeeper Logic with HUD Override
            // If forceOpen is true (HUD button clicked), always open regardless of sidebar state
            // Otherwise, only open if sidebar is already visible
            if (payload?.forceOpen || activeSheetId !== null) {
                // Sidebar is open OR user clicked HUD button: open/swap the sheet
                if (payload?.type === 'token') {
                    setActiveSheetId(payload.tokenId);
                    setSheetContext({ tokenId: payload.tokenId, isTokenSheet: true, token: payload.token });
                } else {
                    // It's a regular character sheet (from bestiary)
                    setActiveSheetId(payload);
                    setSheetContext({ characterId: payload, isTokenSheet: false });
                }
            }
            // If sidebar is closed and no forceOpen flag, ignore the request silently
            // Token remains selected on the map for movement/interaction
            // END CHANGE
        } else if (action === 'update_token') {
            // START CHANGE: Handle token updates from SheetContainer onSave
            const tokens = data.campaign?.activeMap?.tokens || [];
            const updatedTokens = tokens.map(t => 
                t.id === payload.id 
                    ? { ...t, hp: payload.hp, statuses: payload.statuses, name: payload.name }
                    : t
            );
            updateCloud({ ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, tokens: updatedTokens } } });
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
                    sidebarIsOpen={activeSheetId !== null}
                    updateCombatant={updateCombatant} // Pass down
                    removeCombatant={removeCombatant} // Pass down
                    onClearRolls={onClearRolls}
                />
            </div>

            {/* The Sidebar Character Sheet */}
            {activeSheetId && (
                <div className="absolute top-0 right-0 bottom-0 w-full sm:w-96 bg-slate-950 border-l border-slate-700 shadow-2xl z-[80] animate-in slide-in-from-right duration-300 flex flex-col">
                    {/* START CHANGE: Hot-Swap - Remove key to allow data swap without re-render */}
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
                                // Token instance - update using tokenId, not id
                                updateMapState('update_token', { 
                                    id: char.tokenId || char.id,  // Use tokenId if available
                                    hp: char.hp, 
                                    statuses: char.statuses || [],
                                    name: char.name
                                });
                            } else {
                                // Regular character - save to bestiary
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