import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../DialogProvider';
import { useToast } from '../ToastProvider';
import Icon from '../Icon';
import { updateMap } from '../../utils/mapService';
import { useCharacterStore } from '../../stores/useCharacterStore';
import { rtdb } from '../../firebase';
import { ref, set, remove } from 'firebase/database';

export const CombatRibbon = ({ combat, tokens, role, className = "" }) => {
    if (role === 'dm' || !combat?.active || !combat?.combatants?.length) return null;

    const combatants = combat.combatants;
    const turn = combat.turn || 0;
    const activeIndex = turn % combatants.length;
    
    // Build the display order (Active first, then the rest wrapping around)
    const displayOrder = [
        combatants[activeIndex],
        ...combatants.slice(activeIndex + 1),
        ...combatants.slice(0, activeIndex)
    ];

    return (
        <div className={`absolute top-4 vtt-safe-top left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 bg-slate-900/90 backdrop-blur border border-slate-700 p-2 rounded-2xl shadow-2xl ${className}`}>

            <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden custom-scroll max-w-[60vw] pb-1 px-1">
                {displayOrder.map((c, i) => {
                    const t = tokens.find(t => t.id === c.tokenId);
                    const isActive = i === 0;
                    
                    return (
                        <div 
                            key={c.tokenId + i} 
                            className={`relative flex items-center gap-2 rounded-xl border p-1 transition-all shrink-0 ${isActive ? 'bg-slate-800 border-amber-500 scale-100 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-slate-800 border-slate-600 scale-90 opacity-80 hover:opacity-100'}`}
                        >
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 shrink-0">
                                {t?.image || t?.img ? <img src={t.image || t.img} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{t?.name?.[0] || c.name[0] || '?'}</div>}
                            </div>
                            {isActive && (
                                <div className="flex flex-col pr-3">
                                    <span className="text-sm font-bold text-white whitespace-nowrap">{t?.name || c.name}</span>
                                    <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Init: {c.initiative}</span>
                                </div>
                            )}
                            {!isActive && (
                                <div className="absolute -top-2 -right-2 bg-slate-700 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-slate-500 shadow-md">
                                    {c.initiative}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const EditableHP = ({ currentHp, maxHp, onSave }) => {
    const [val, setVal] = useState(currentHp);
    useEffect(() => setVal(currentHp), [currentHp]);
    
    return (
        <div className="flex items-center bg-slate-900 border border-slate-600 rounded overflow-hidden" onClick={e => e.stopPropagation()}>
            <input 
                className="w-10 bg-transparent text-center text-xs font-bold text-green-400 outline-none py-1"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={() => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num !== currentHp) onSave(num);
                    else setVal(currentHp);
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                onFocus={(e) => e.target.select()}
            />
            <span className="text-[10px] text-slate-500 px-1.5 border-l border-slate-700 bg-slate-800 leading-none flex items-center h-full">/ {maxHp}</span>
        </div>
    );
};

export const InitiativePrompt = ({ combat, tokens, allCharacters, user, assignments, updateCampaign, campaignData, role, sendMessage, campaignCode, onDiceRoll }) => {
    const [dismissedForCombat, setDismissedForCombat] = useState(false);
    const [manualRolls, setManualRolls] = useState({});
    
    // Reset dismissal when combat toggles active
    useEffect(() => {
        if (!combat?.active) {
            setDismissedForCombat(false);
            setManualRolls({});
        }
    }, [combat?.active]);

    if (!combat?.active || dismissedForCombat) return null;

    // Find all tokens controlled by this user
    const controlledTokens = tokens.filter(t => {
        const character = allCharacters.find(c => String(c.id) === String(t.characterId));
        const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || (t.ownerId && String(t.ownerId) === String(user?.uid));
        const myCharAssigned = assignments?.[user?.uid] && String(t.characterId) === String(assignments[user?.uid]);
        return isOwner || myCharAssigned; // Exclude DM unlinked tokens to prevent spam
    });
    
    if (role === 'dm') return null; // DM rolls directly from sidebar or context menu

    // Filter out tokens that already have an active or pending initiative
    const combatants = combat.combatants || [];
    const pending = combat.pendingInitiatives || {};
    
    const needsInitiative = controlledTokens.filter(t => {
        const inCombat = combatants.some(c => c.tokenId === t.id);
        const isPending = pending[t.id] !== undefined;
        return !inCombat && !isPending;
    });

    if (needsInitiative.length === 0) return null;

    const submitDigital = (tokensToRoll) => {
        const newPending = { ...pending };
        
        tokensToRoll.forEach(t => {
            const char = allCharacters.find(c => String(c.id) === String(t.characterId));
            const dex = char?.stats?.dex || 10;
            const mod = Math.floor((dex - 10) / 2);
            const name = t.name || char?.name || 'Unknown';
            
            let total;
            if (onDiceRoll) {
                const formula = `1d20${mod >= 0 ? `+${mod}` : `${mod}`}`;
                const res = onDiceRoll(formula, {
                    alias: 'Initiative',
                    characterName: name,
                    actionType: 'Roll',
                    weaponName: 'Initiative'
                });
                total = (res && typeof res.total === 'number') ? res.total : (Number(res) || (10 + mod));
            } else {
                const roll = Math.floor(Math.random() * 20) + 1;
                total = roll + mod;
                
                // Fallback chat payload
                const payload = {
                    formula: '1d20',
                    naturalRoll: roll,
                    rolls: [roll],
                    modifier: mod,
                    total: total,
                    characterName: name,
                    isDmRoll: false,
                    actionType: 'Roll',
                    weaponName: 'Initiative',
                    alias: 'Initiative',
                    type: 'roll-public'
                };
                
                if (sendMessage) {
                    sendMessage({
                        content: JSON.stringify(payload),
                        type: payload.type,
                        senderId: user?.uid || 'anon',
                        senderName: name,
                        targetId: null,
                        timestamp: Date.now()
                    });
                }
            }
            
            newPending[t.id] = {
                initiative: total,
                name: name,
                characterId: t.characterId,
                method: 'digital',
                isNpc: !!(campaignData?.npcs || []).some(n => String(n.id) === String(t.characterId))
            };
        });
        
        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, pendingInitiatives: newPending } } });
    };
    
    const submitManual = (t) => {
        const val = parseInt(manualRolls[t.id], 10);
        if (isNaN(val)) return;
        
        const char = allCharacters.find(c => String(c.id) === String(t.characterId));
        const newPending = { 
            ...pending,
            [t.id]: {
                initiative: val,
                name: t.name || char?.name || 'Unknown',
                characterId: t.characterId,
                method: 'manual',
                isNpc: !!(campaignData?.npcs || []).some(n => String(n.id) === String(t.characterId))
            }
        };
        
        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, pendingInitiatives: newPending } } });
    };

    return (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-slate-900/95 backdrop-blur-md border-2 border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)] rounded-xl p-4 w-[350px] animate-in zoom-in-95 fade-in duration-200 pointer-events-auto">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-700">
                <h3 className="text-lg font-bold text-amber-500 flex items-center gap-2"><Icon name="swords" size={18}/> Roll Initiative</h3>
                <button onClick={() => setDismissedForCombat(true)} className="text-slate-400 hover:text-white p-1 bg-slate-800 rounded"><Icon name="x" size={16}/></button>
            </div>
            
            <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scroll pr-1">
                {needsInitiative.map(t => {
                    const char = allCharacters.find(c => String(c.id) === String(t.characterId));
                    const img = t.image || t.img || char?.image;
                    const name = t.name || char?.name || 'Unknown';
                    
                    return (
                        <div key={t.id} className="bg-slate-800 rounded-lg p-2 border border-slate-700 flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-slate-900 shrink-0 border border-slate-600 overflow-hidden">
                                {img ? <img src={img} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{name[0]}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-white text-sm truncate">{name}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <button 
                                        onClick={() => submitDigital([t])}
                                        className="text-[10px] uppercase font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded shadow flex items-center gap-1"
                                    >
                                        <Icon name="dices" size={12}/>
                                        {(() => {
                                            const dex = char?.stats?.dex || 10;
                                            const mod = Math.floor((dex - 10) / 2);
                                            return mod >= 0 ? `+${mod}` : mod;
                                        })()}
                                    </button>
                                    <div className="text-slate-500 text-[10px] uppercase font-bold">or</div>
                                    <div className="flex items-center gap-1 bg-slate-900 rounded border border-slate-600 focus-within:border-amber-500 overflow-hidden px-1 h-6">
                                        <input 
                                            type="number"
                                            value={manualRolls[t.id] || ''}
                                            onChange={(e) => setManualRolls(p => ({...p, [t.id]: e.target.value}))}
                                            onKeyDown={e => { if (e.key === 'Enter') submitManual(t); }}
                                            placeholder="Manual"
                                            className="w-14 bg-transparent text-xs text-white text-center py-1 outline-none no-spinner"
                                        />
                                        <button onClick={() => submitManual(t)} className="text-amber-500 hover:text-amber-400 p-0.5" disabled={!manualRolls[t.id]}>
                                            <Icon name="check" size={14}/>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {needsInitiative.length > 1 && (
                <div className="mt-4 pt-3 border-t border-slate-700">
                    <button 
                        onClick={() => submitDigital(needsInitiative)}
                        className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-lg shadow-lg flex items-center justify-center gap-2"
                    >
                        <Icon name="dices" size={16}/> Roll All Digitally
                    </button>
                </div>
            )}
        </div>
    );
};

export const CombatTrackerSidebar = ({ combat, updateCampaign, tokens, role, campaignData, allCharacters, onOpenSheet, data, campaignCode, activeMapId, className = "", onClose, onDiceRoll }) => {
    const [showAddModal, setShowAddModal] = useState(false);
    const dialog = useDialog();
    const toast = useToast();
    const selectedTokenIds = useCharacterStore(state => state.selectedTokenIds);
    const setSelectedTokenIds = useCharacterStore(state => state.setSelectedTokenIds);
    const scrollContainerRef = useRef(null);
    const [sidebarWidth, setSidebarWidth] = useState(288);

    const handleResizeMouseDown = useCallback((e) => {
        if (e.cancelable) e.preventDefault();
        const startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const startWidth = sidebarWidth;

        const handleMouseMove = (moveEvent) => {
            const clientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX) || 0;
            const deltaX = clientX - startX;
            const newWidth = Math.max(250, Math.min(800, startWidth + deltaX));
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleMouseMove);
            document.removeEventListener('touchend', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleMouseMove, { passive: false });
        document.addEventListener('touchend', handleMouseUp);
    }, [sidebarWidth]);

    // Auto-scroll to selected token in the initiative list
    useEffect(() => {
        if (selectedTokenIds.length > 0 && scrollContainerRef.current) {
            const selectedEl = scrollContainerRef.current.querySelector(`[data-token-id="${selectedTokenIds[0]}"]`);
            if (selectedEl) {
                selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [selectedTokenIds]);

    // The initiative tracker is a DM-only tool. Players see the top ribbon instead.
    if (role !== 'dm') return null;
    const handleAddActorToCombat = (actor, isNpc) => {
        const currentCombat = combat || { active: false, round: 1, turn: 0, combatants: [] };
        const combatants = currentCombat.combatants || [];
        
        if (combatants.some(c => c.characterId === actor.id)) {
            toast(`${actor.name} is already in combat.`, "info");
            return;
        }
    
        const dex = actor?.stats?.dex || 10;
        const mod = Math.floor((dex - 10) / 2);
        const roll = Math.floor(Math.random() * 20) + 1;
        
        const newCombatant = {
            tokenId: `tracker_${actor.id}_${Date.now()}`,
            characterId: actor.id,
            initiative: roll + mod,
            name: actor.name || 'Unknown',
            isNpc: isNpc
        };
        
        const newCombatants = [...combatants, newCombatant].sort((a,b) => b.initiative - a.initiative);
        updateCampaign({ campaign: { ...campaignData, combat: { ...currentCombat, active: true, combatants: newCombatants } } });
    };

    if (!combat) return null;

    const combatants = combat.combatants || [];
    const turn = combat.turn || 0;
    const activeIndex = combatants.length > 0 ? turn % combatants.length : 0;
    const sortedCombatants = [...combatants].sort((a,b) => b.initiative - a.initiative);
    const activeCombatant = combatants.length > 0 ? combatants[activeIndex] : null;

    const handleNext = () => updateCampaign({ campaign: { ...campaignData, combat: { ...combat, turn: turn + 1 } } });
    const handlePrev = () => updateCampaign({ campaign: { ...campaignData, combat: { ...combat, turn: Math.max(0, turn - 1) } } });
    const handleEnd = async () => {
        if (await dialog.confirm("End combat and clear initiative tracker?")) {
            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, active: false, combatants: [], turn: 0 } } });
            if (onClose) onClose();
        }
    };

    const editInit = async (tokenId, currentInit) => {
        if (role !== 'dm') return;
        const newVal = await dialog.prompt("Set new initiative:", currentInit);
        if (!newVal || isNaN(newVal)) return;
        
        const newCombatants = [...combatants];
        const idx = newCombatants.findIndex(c => c.tokenId === tokenId);
        if (idx !== -1) {
            newCombatants[idx].initiative = Number(newVal);
            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants } } });
        }
    };

    const updateCharHp = (tokenId, charId, isNpc, newHp) => {
        if (isNpc) {
            const token = tokens.find(t => t.id === tokenId);
            if (token) {
                const oldHp = token.hp || allCharacters.find(ch => String(ch.id) === String(charId))?.hp || {};
                updateMap(campaignCode, activeMapId, { [`tokens.${tokenId}.hp`]: { ...oldHp, current: newHp } });
            } else {
                const newNpcs = (data?.npcs || []).map(n => String(n.id) === String(charId) ? { ...n, hp: { ...n.hp, current: newHp } } : n);
                updateCampaign({ npcs: newNpcs });
            }
        } else {
            const newPlayers = (data?.players || []).map(p => String(p.id) === String(charId) ? { ...p, hp: { ...p.hp, current: newHp } } : p);
            updateCampaign({ players: newPlayers });
        }
    };

    return (
        <div 
            className={`relative pointer-events-auto max-h-[calc(100vh-8rem)] bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl rounded-xl z-[60] flex flex-col overflow-hidden transition-all ${className} ${combat.active ? 'border-amber-500/30' : 'border-slate-700'}`}
            style={{ width: `${sidebarWidth}px` }}
        >
            <div 
                className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-amber-500/50 z-[100] touch-none"
                onMouseDown={handleResizeMouseDown}
                onTouchStart={handleResizeMouseDown}
            />
            <div className="p-2 sm:p-2.5 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0 gap-1 overflow-hidden">
                <h3 className="text-base sm:text-lg fantasy-font text-amber-500 flex items-center gap-1.5 truncate shrink min-w-0"><Icon name="sword" size={16}/> Initiative</h3>
                {role === 'dm' && (
                    <div className="flex gap-0.5 shrink-0 ml-auto items-center">
                        <button onClick={() => setShowAddModal(true)} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white" title="Add Combatant">
                            <Icon name="plus" size={14}/>
                        </button>
                        <button onClick={handlePrev} disabled={!combat.active} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white disabled:text-slate-600 disabled:hover:bg-transparent" title="Previous Turn"><Icon name="chevron-left" size={14}/></button>
                        <button onClick={handleNext} disabled={!combat.active} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white disabled:text-slate-600 disabled:hover:bg-transparent" title="Next Turn"><Icon name="chevron-right" size={14}/></button>
                        <div className="w-px h-4 bg-slate-700 my-auto mx-0.5"></div>
                        <button onClick={handleEnd} disabled={!combat.active} className="p-1 hover:bg-red-900/50 rounded text-red-500 hover:text-red-400 disabled:text-slate-600 disabled:hover:bg-transparent" title="End Combat"><Icon name="trash-2" size={14}/></button>
                        <button onClick={onClose} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white" title="Close Tracker"><Icon name="x" size={14}/></button>
                    </div>
                )}
            </div>
            
            {role === 'dm' && combat.active && Object.keys(combat.pendingInitiatives || {}).length > 0 && (
                <div className="bg-slate-800/50 px-3 py-2 border-b border-slate-700 flex justify-end items-center shrink-0">
                    <button 
                        onClick={() => {
                            const newCombatants = [...(combat.combatants || [])];
                            Object.entries(combat.pendingInitiatives || {}).forEach(([tokenId, data]) => {
                                const idx = newCombatants.findIndex(c => c.tokenId === tokenId);
                                if (idx !== -1) {
                                    newCombatants[idx].initiative = data.initiative;
                                } else {
                                    newCombatants.push({
                                        tokenId,
                                        characterId: data.characterId,
                                        initiative: data.initiative,
                                        name: data.name,
                                        isNpc: data.isNpc
                                    });
                                }
                            });
                            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants.sort((a,b) => b.initiative - a.initiative), pendingInitiatives: {} } } });
                        }}
                        className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-md transition-colors"
                    >
                        <Icon name="check-check" size={14}/> Accept All Pending
                    </button>
                </div>
            )}
            
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2" ref={scrollContainerRef}>
                {role === 'dm' && Object.entries(combat.pendingInitiatives || {}).map(([tokenId, data]) => {
                    const t = tokens.find(tok => tok.id === tokenId);
                    const char = allCharacters.find(ch => String(ch.id) === String(t?.characterId || data.characterId));
                    const img = t?.image || t?.img || char?.image;
                    const name = data.name;
                    
                    return (
                        <div key={`pending-${tokenId}`} className="relative flex flex-col rounded-lg border border-amber-500/50 bg-amber-900/20 p-2">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded bg-slate-900 border border-slate-600 shrink-0 overflow-hidden">
                                    {img ? <img src={img} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{name[0]}</div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-white truncate">{name} <span className="text-amber-500 text-[10px] uppercase ml-1">({data.method})</span></div>
                                    <div className="text-xl font-bold text-amber-400 mt-1">{data.initiative}</div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                    <button 
                                        onClick={() => {
                                            const newCombatants = [...(combat.combatants || [])];
                                            if (!newCombatants.some(c => c.tokenId === tokenId)) {
                                                newCombatants.push({
                                                    tokenId,
                                                    characterId: data.characterId,
                                                    initiative: data.initiative,
                                                    name: data.name,
                                                    isNpc: data.isNpc
                                                });
                                            } else {
                                                // Update existing initiative
                                                const idx = newCombatants.findIndex(c => c.tokenId === tokenId);
                                                newCombatants[idx].initiative = data.initiative;
                                            }
                                            const newPending = { ...combat.pendingInitiatives };
                                            delete newPending[tokenId];
                                            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants.sort((a,b) => b.initiative - a.initiative), pendingInitiatives: newPending } } });
                                        }}
                                        className="bg-green-600 hover:bg-green-500 text-white rounded p-1"
                                        title="Accept Roll"
                                    >
                                        <Icon name="check" size={14}/>
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const newPending = { ...combat.pendingInitiatives };
                                            delete newPending[tokenId];
                                            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, pendingInitiatives: newPending } } });
                                        }}
                                        className="bg-red-600 hover:bg-red-500 text-white rounded p-1"
                                        title="Deny Roll"
                                    >
                                        <Icon name="x" size={14}/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {sortedCombatants.length > 0 ? sortedCombatants.map((c, i) => {
                    const t = tokens.find(tok => tok.id === c.tokenId);
                    const char = allCharacters.find(ch => String(ch.id) === String(t?.characterId || c.characterId || c.tokenId));
                    const isActive = combat.active && activeCombatant?.tokenId === c.tokenId;
                    const isSelected = selectedTokenIds.includes(c.tokenId);
                    
                    const isNpc = c.isNpc;
                    const hp = isNpc ? (t?.hp?.current ?? char?.hp?.current ?? '-') : (char?.hp?.current ?? '-');
                    const maxHp = isNpc ? (t?.hp?.max ?? char?.hp?.max ?? '-') : (char?.hp?.max ?? '-');
                    const ac = char?.ac ?? '-';
                    
                    const displayName = t?.name || char?.name || c.name;
                    const displayImage = t?.image || t?.img || char?.image;
                    const charIdForSheet = t?.characterId || char?.id;
                    
                    return (
                        <div 
                            key={c.tokenId} 
                            data-token-id={c.tokenId}
                            onClick={() => setSelectedTokenIds([c.tokenId])}
                            className={`relative flex flex-col rounded-lg border p-2 transition-all cursor-pointer ${
                                isActive ? 'bg-slate-800 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 
                                isSelected ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 
                                'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {/* Avatar (Click to open sheet) */}
                                <div 
                                    className="w-10 h-10 rounded bg-slate-900 border border-slate-600 shrink-0 overflow-hidden cursor-pointer hover:border-amber-400 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTokenIds([c.tokenId]);
                                        if (charIdForSheet && onOpenSheet) {
                                            const tokenHp = t?.hp?.current ?? char?.hp?.current;
                                            const tokenMaxHp = t?.hp?.max ?? char?.hp?.max;
                                            onOpenSheet({ isToken: true, tokenId: c.tokenId, characterId: charIdForSheet, hp: tokenHp, maxHp: tokenMaxHp });
                                        }
                                    }}
                                    title={`Open ${displayName}'s Sheet`}
                                >
                                    {displayImage ? <img src={displayImage} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 text-lg">{displayName?.[0] || '?'}</div>}
                                </div>
                                
                                {/* Info */}
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <div className="font-bold text-sm text-white truncate pr-5">{displayName}</div>
                                    <div className="flex items-center gap-3 mt-1">
                                        {/* Init */}
                                        <div 
                                            className={`flex items-center gap-1 text-[10px] uppercase font-bold cursor-pointer hover:text-amber-400 ${isActive ? 'text-amber-500' : 'text-slate-400'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                editInit(c.tokenId, c.initiative);
                                            }}
                                            title="Edit Initiative"
                                        >
                                            <Icon name="clock" size={10}/> {c.initiative}
                                        </div>
                                        {/* AC */}
                                        <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-400" title="Armor Class">
                                            <Icon name="shield" size={10}/> {ac}
                                        </div>
                                    </div>
                                </div>

                                {/* HP (Editable) */}
                                {char && (role === 'dm' || !isNpc) && (
                                    <div className="shrink-0 flex flex-col items-end">
                                        <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">HP</div>
                                        {role === 'dm' ? (
                                            <EditableHP currentHp={hp} maxHp={maxHp} onSave={(val) => updateCharHp(c.tokenId, charIdForSheet, isNpc, val)} />
                                        ) : (
                                            <div className="text-xs font-bold text-green-400">{hp} <span className="text-slate-500 text-[10px]">/ {maxHp}</span></div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {role === 'dm' && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newCombatants = combatants.filter(x => x.tokenId !== c.tokenId);
                                        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants, active: newCombatants.length > 0 } } });
                                    }}
                                    className="absolute top-1 right-1 text-slate-600 hover:text-red-500 transition-colors p-1"
                                    title="Remove from Combat"
                                >
                                    <Icon name="x" size={12} />
                                </button>
                            )}
                        </div>
                    );
                }) : (
                    <div className="text-center p-6 text-xs text-slate-500 italic">
                        <Icon name="swords" size={24} className="mx-auto text-slate-600 mb-2" />
                        No one is in combat yet.
                        <br/>
                        Roll initiative from a token's context menu or add actors manually via the <Icon name="plus" size={12} className="inline"/> button above.
                    </div>
                )}
            </div>
            {role === 'dm' && combat.active && (
                <div className="p-2 bg-slate-900 border-t border-slate-700">
                    <button onClick={handleNext} className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 transition-all">
                        Next Turn <Icon name="arrow-right" size={16}/>
                    </button>
                </div>
            )}

            {/* Add Combatant Modal */}
            {showAddModal && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in zoom-in-95">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl shrink-0">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Icon name="users" size={18} className="text-amber-500"/> Add to Combat
                            </h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                                <Icon name="x" size={20}/>
                            </button>
                        </div>
                        
                        <div className="p-4 overflow-y-auto custom-scroll flex-1 min-h-0 space-y-2">
                            {allCharacters?.length > 0 ? allCharacters.map(actor => {
                                const isNpc = data?.npcs?.some(n => String(n.id) === String(actor.id));
                                const isAlreadyInCombat = combatants.some(c => c.characterId === actor.id);
                                
                                return (
                                    <div 
                                        key={actor.id} 
                                        className={`flex items-center gap-3 p-2 rounded-lg border ${isAlreadyInCombat ? 'bg-slate-800/50 border-slate-700 opacity-50' : 'bg-slate-800 border-slate-600 hover:border-amber-500 cursor-pointer'}`}
                                        onClick={() => !isAlreadyInCombat && handleAddActorToCombat(actor, isNpc)}
                                    >
                                        <div className="w-10 h-10 rounded bg-slate-900 overflow-hidden shrink-0">
                                            {actor.image ? <img src={actor.image} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{actor.name?.[0] || '?'}</div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-white text-sm truncate">{actor.name}</div>
                                            <div className="text-[10px] uppercase text-slate-400 font-bold">{isNpc ? 'NPC' : 'Player'}</div>
                                        </div>
                                        {!isAlreadyInCombat ? (
                                            <button className="p-2 text-amber-500 hover:text-amber-400">
                                                <Icon name="plus" size={16}/>
                                            </button>
                                        ) : (
                                            <span className="text-xs text-slate-500 px-2">Added</span>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="text-center p-4 text-slate-500 text-sm">No characters found.</div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};