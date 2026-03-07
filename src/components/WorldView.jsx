import React, { useState, useEffect } from 'react';
import TacticalMap from '../../features/map';
// START CHANGE: Correct Import Path
import SheetContainer from './character-sheet/SheetContainer'; 
// END CHANGE
import { useCharacterStore } from '../stores/useCharacterStore';
// START CHANGE: Import Campaign Context
import { useCampaign } from '../contexts/CampaignContext';
// START CHANGE: Import Sidebar Views
import JournalView from './JournalView';
import SessionView from './SessionView';
// END CHANGE

// START CHANGE: Add manual combatant props to destructuring
const WorldView = ({ data, role, updateCloud, updateMapState, user, apiKey, onDiceRoll, diceLog, savePlayer, onInitiative, updateCombatant, removeCombatant, onClearRolls, onAutoRoll, setShowHandoutCreator, code, addManualCombatant, players, npcs, sidebarMode, onLogAction, sidebarIsOpen }) => {
    // START CHANGE: Use Context Actions
    const { updateMapState: contextUpdateMapState, sendMessage, saveJournalPage, deleteJournalPage } = useCampaign();
    // END CHANGE

    // State to track which sheet is open
    const [activeSheetId, setActiveSheetId] = useState(null);
    const [sheetContext, setSheetContext] = useState(null); // NEW STATE FOR SHEET CONTEXT
    // START CHANGE: Local Chat State for Sidebar
    const [chatInput, setChatInput] = useState("");
    // END CHANGE

    // START CHANGE: Escape Key Drawing Cancellation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleMapAction('clear_active_path');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    // END CHANGE

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
        // List of actions handled by CampaignContext
        const contextActions = ['move_token', 'update_token', 'delete_token', 'add_token', 'load_map', 'rename_map', 'delete_map', 'update_map', 'toggle_journal', 'toggle_chat'];

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
        } else if (action === 'close_sheet') {
            // Handle local state cleanup AND context update
            setActiveSheetId(null);
            setSheetContext(null);
            contextUpdateMapState(action, payload);
        } else if (contextActions.includes(action)) {
            // Delegate known actions to CampaignContext (Fixes "Deprecated updateCloud" warning)
            contextUpdateMapState(action, payload);
        } else {
            // Fallback for legacy actions (e.g. fog drawing)
            updateMapState(action, payload);
        }
    };

    // START CHANGE: Determine active sidebar content
    const activeSidebar = data.ui?.sidebar; 
    const showSidebar = activeSheetId || activeSidebar;
    // END CHANGE

     return (
        <div className="absolute inset-0 w-full h-full bg-slate-900 overflow-hidden flex flex-row">
            {/* The Main Map Area */}
            <div className="flex-1 relative h-full min-w-0 flex flex-col">
                <div className="flex-1 relative w-full h-full overflow-hidden">
                    <TacticalMap 
                        data={data} 
                        role={role} 
                        user={user}
                        updateCloud={updateCloud} 
                        updateMapState={handleMapAction}
                        sidebarIsOpen={sidebarIsOpen || showSidebar}
                        sidebarMode={activeSheetId ? 'sheet' : activeSidebar}
                        updateCombatant={updateCombatant} 
                        removeCombatant={removeCombatant} 
                        onClearRolls={onClearRolls}
                        onAutoRoll={onAutoRoll}
                        setShowHandoutCreator={setShowHandoutCreator}
                        code={code}
                        addManualCombatant={addManualCombatant}
                        players={players}
                        npcs={npcs}
                        diceLog={diceLog}
                        onLogAction={onLogAction}
                    />
                </div>
            </div>

            {/* The Sidebar Character Sheet */}
            {showSidebar && (
                <div className="relative h-full w-full sm:w-96 bg-slate-950 border-l border-slate-700 shadow-2xl z-[80] animate-in slide-in-from-right duration-300 flex flex-col shrink-0">
                    {activeSheetId ? (
                        <SheetContainer 
                        data={data}
                        role={role}
                        characterId={sheetContext?.characterId}
                        tokenId={sheetContext?.tokenId}
                        isTokenSheet={sheetContext?.isTokenSheet}
                        diceLog={diceLog}
                        onClose={() => { setActiveSheetId(null); setSheetContext(null); }}
                        onDiceRoll={async (formula, options) => {
                            if (onDiceRoll) {
                                const r = await onDiceRoll(formula, { ...options, chat: true, isPrivate: role === 'dm' });
                                if (typeof r === 'number') return r;
                                if (r && typeof r === 'object') {
                                    if (typeof r.total === 'number') return r.total;
                                    if (typeof r.result === 'number') return r.result;
                                    if (typeof r.value === 'number') return r.value;
                                }
                                const parsed = parseInt(r);
                                return isNaN(parsed) ? 0 : parsed;
                            }
                        }}
                        onInitiative={onInitiative}
                        onLogAction={onLogAction}
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
                    ) : activeSidebar === 'journal' ? (
                        <JournalView 
                            data={data}
                            role={role}
                            userId={user?.uid}
                            onSavePage={saveJournalPage}
                            onDeletePage={deleteJournalPage}
                            onClose={() => contextUpdateMapState('toggle_journal')}
                        />
                    ) : activeSidebar === 'chat' ? (
                        <SessionView 
                            data={data}
                            chatLog={data.chatLog || []}
                            role={role}
                            user={user}
                            onSendMessage={sendMessage}
                            diceLog={diceLog}
                            handleDiceRoll={onDiceRoll}
                            compact={true}
                            inputText={chatInput} setInputText={setChatInput}
                        />
                    ) : null}
                    {/* END CHANGE */}
                </div>
            )}
        </div>
    );
};

export default WorldView;