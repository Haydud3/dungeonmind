import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../DialogProvider';
import { useToast } from '../ToastProvider';
import Icon from '../Icon';
import { updateMap } from '../../utils/mapService';
import { useCharacterStore } from '../../stores/useCharacterStore';
import { rtdb } from '../../firebase';
import { ref, set, remove } from 'firebase/database';
import { getInitiativeBonus } from '../../utils/initiativeUtils';

const ALL_CONDITIONS = [
    "Blinded", "Charmed", "Deafened", "Frightened", "Grappled", 
    "Incapacitated", "Invisible", "Paralyzed", "Petrified", 
    "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion"
];

/* -------------------------------------------------------------------------- */
/*                                COMBAT RIBBON                               */
/* -------------------------------------------------------------------------- */
export const CombatRibbon = ({ 
    combat, 
    updateCampaign,
    tokens = [], 
    role, 
    campaignData = {}, 
    className = "", 
    allCharacters = [], 
    user, 
    assignments = {}, 
    onOpenSheet,
    showNameplates = true
}) => {
    if (role === 'dm' || !combat?.active || !combat?.combatants?.length) return null;

    const combatants = combat.combatants;
    const turn = combat.turn || 0;
    const activeIndex = turn % combatants.length;
    const roundNumber = combat.round || (combatants.length > 0 ? Math.floor(turn / combatants.length) + 1 : 1);
    
    // Active combatant first, then the remaining in order
    const displayOrder = [
        combatants[activeIndex],
        ...combatants.slice(activeIndex + 1),
        ...combatants.slice(0, activeIndex)
    ].filter(Boolean);

    const checkIsMyToken = (combatant) => {
        if (!user) return false;
        const t = tokens.find(tok => tok.id === combatant.tokenId);
        const charIdForSheet = t?.characterId || combatant.characterId;
        const char = allCharacters.find(c => String(c.id) === String(charIdForSheet));
        const myCharId = assignments?.[user.uid];
        const isOwner = (char?.ownerId && (String(char.ownerId) === String(user.uid) || (myCharId && String(char.ownerId) === String(myCharId)))) ||
                        (t?.ownerId && (String(t.ownerId) === String(user.uid) || (myCharId && String(t.ownerId) === String(myCharId))));
        const myCharAssigned = myCharId && String(charIdForSheet) === String(myCharId);
        return Boolean(isOwner || myCharAssigned);
    };

    const checkCanOpen = (combatant, isMyChar) => {
        if (role === 'dm') return true;
        const t = tokens.find(tok => tok.id === combatant.tokenId);
        const charIdForSheet = t?.characterId || combatant.characterId;
        const char = allCharacters.find(c => String(c.id) === String(charIdForSheet));
        const isNpc = Boolean(
            combatant.isNpc ||
            t?.isNpc ||
            char?.isNpc ||
            char?.type === 'npc' ||
            t?.type === 'npc' ||
            (campaignData?.npcs || []).some(n => String(n.id) === String(charIdForSheet))
        );
        if (isNpc) {
            // Monsters and NPCs can ONLY be viewed if given shared control or owned by this player
            return Boolean(isMyChar || t?.isSharedControl || combatant.isSharedControl);
        }
        // Player characters in the party can be viewed
        return true;
    };

    return (
        <div className={`absolute top-4 vtt-safe-top left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 sm:gap-3 bg-slate-950/85 backdrop-blur-xl border border-slate-800/90 p-2 sm:p-2.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.7)] max-w-[calc(100vw-2rem)] pointer-events-auto transition-all ${className}`}>
            
            {/* Round Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 text-amber-300 font-black text-xs tracking-wider uppercase shrink-0 shadow-sm">
                <Icon name="swords" size={14} className="text-amber-400" />
                <span>Rnd {roundNumber}</span>
            </div>

            {/* Combatant Carousel */}
            <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden custom-scroll max-w-[85vw] sm:max-w-[62vw] py-0.5 px-1">
                {displayOrder.map((c, i) => {
                    const t = tokens.find(tok => tok.id === c.tokenId);
                    const charIdForSheet = t?.characterId || c.characterId;
                    const char = allCharacters.find(ch => String(ch.id) === String(charIdForSheet || c.tokenId));
                    const isActive = i === 0;
                    const isMyChar = checkIsMyToken(c);
                    const rawDisplayName = t?.name || char?.name || c.name || 'Unknown';
                    const displayImage = t?.image || t?.img || char?.image;
                    const tokenHp = t?.hp?.current ?? char?.hp?.current;
                    const tokenMaxHp = t?.hp?.max ?? char?.hp?.max;
                    const isNpc = Boolean(
                        c.isNpc ||
                        t?.isNpc ||
                        char?.isNpc ||
                        char?.type === 'npc' ||
                        t?.type === 'npc' ||
                        (campaignData?.npcs || []).some(n => String(n.id) === String(charIdForSheet))
                    );
                    const isPc = !isNpc;

                    // Linked token name hiding logic:
                    // When names for tokens are turned off (!showNameplates) or this token has hideName set,
                    // hide the name in the player combat view for unowned NPCs/monsters.
                    const isNameHidden = role !== 'dm' && isNpc && !isMyChar && (!showNameplates || Boolean(t?.hideName || c?.hideName));
                    const displayName = isNameHidden ? 'Unknown Creature' : rawDisplayName;
                    const shortDisplayName = isNameHidden ? 'Unknown' : rawDisplayName;

                    // A hidden creature cannot be inspected
                    const canOpen = !isNameHidden && checkCanOpen(c, isMyChar);

                    const handleOpenSheet = () => {
                        if (!canOpen || !charIdForSheet || !onOpenSheet) return;
                        onOpenSheet({
                            isToken: true,
                            tokenId: c.tokenId,
                            characterId: charIdForSheet,
                            hp: tokenHp,
                            maxHp: tokenMaxHp,
                            isPc: isPc,
                            defaultMode: isPc ? 'sheet' : 'statblock',
                            ownerId: t?.ownerId || char?.ownerId
                        });
                    };

                    if (isActive) {
                        return (
                            <div 
                                key={c.tokenId + i}
                                onClick={canOpen ? handleOpenSheet : undefined}
                                className={`relative flex items-center gap-2.5 rounded-xl border-2 p-1.5 pr-3.5 transition-all shrink-0 ${
                                    isNameHidden
                                        ? 'border-purple-500/80 bg-gradient-to-r from-purple-950/85 via-slate-900/95 to-slate-900 shadow-[0_0_25px_rgba(168,85,247,0.35)] ring-2 ring-purple-500/30 cursor-default'
                                        : `border-amber-400/90 bg-gradient-to-r from-amber-950/70 via-slate-900/95 to-slate-900 shadow-[0_0_25px_rgba(245,158,11,0.35)] ring-2 ring-amber-400/20 ${canOpen ? 'cursor-pointer group' : 'cursor-default'}`
                                }`}
                                title={isNameHidden ? 'Unknown Creature (Current Turn)' : (canOpen ? `${displayName} (Current Turn - Click to view)` : `${displayName} (Current Turn)`)}
                            >
                                <div className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 relative shadow ${
                                    isNameHidden ? 'bg-slate-950 border border-purple-500/80' : 'bg-slate-950 border border-amber-400/80'
                                }`}>
                                    {displayImage ? (
                                        <div className="w-full h-full relative">
                                            <img 
                                                src={displayImage} 
                                                className={`w-full h-full object-cover ${isNameHidden ? 'filter brightness-75 contrast-110 saturate-75' : ''}`} 
                                                referrerPolicy="no-referrer" 
                                                alt={displayName} 
                                            />
                                            {isNameHidden && (
                                                <>
                                                    <div className="absolute inset-0 bg-gradient-to-t from-purple-950/75 via-transparent to-transparent pointer-events-none" />
                                                    <div className="absolute bottom-0 right-0 p-0.5 bg-purple-950/90 rounded-tl border-t border-l border-purple-500/50 text-purple-300 shadow-sm" title="Identity Shrouded">
                                                        <Icon name="eye-off" size={9} />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className={`w-full h-full flex items-center justify-center font-black text-sm ${
                                            isNameHidden ? 'bg-gradient-to-br from-purple-950 via-slate-950 to-slate-900 text-purple-300' : 'bg-amber-950/40 text-amber-400'
                                        }`}>
                                            {isNameHidden ? (
                                                <Icon name="help-circle" size={18} className="text-purple-400 animate-pulse" />
                                            ) : (
                                                displayName[0] || '?'
                                            )}
                                        </div>
                                    )}
                                    <div className="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-lg pointer-events-none" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${
                                            isMyChar 
                                                ? 'bg-amber-400 text-slate-950 animate-pulse' 
                                                : isNameHidden
                                                    ? 'bg-purple-900/80 text-purple-200 border border-purple-500/40'
                                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                        }`}>
                                            {isMyChar ? 'Your Turn' : 'Active'}
                                        </span>
                                        {isNameHidden && (
                                            <span className="text-[8px] font-extrabold uppercase tracking-wider px-1 py-0.2 rounded bg-purple-950/90 text-purple-300 border border-purple-500/40 flex items-center gap-0.5 shadow-sm">
                                                <Icon name="eye-off" size={8} /> Hidden
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5 ${isNameHidden ? 'text-purple-300' : 'text-amber-400'}`}>
                                            <Icon name="clock" size={10} /> {c.initiative}
                                        </span>
                                    </div>
                                    <span className={`text-xs sm:text-sm whitespace-nowrap truncate max-w-[130px] transition-colors flex items-center gap-1.5 ${
                                        isNameHidden 
                                            ? 'font-medium italic text-purple-200/90 tracking-wide' 
                                            : `font-bold text-white ${canOpen ? 'group-hover:text-amber-300' : ''}`
                                    }`}>
                                        {isNameHidden && <Icon name="eye-off" size={12} className="text-purple-400 shrink-0" />}
                                        <span>{displayName}</span>
                                    </span>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div 
                            key={c.tokenId + i}
                            onClick={canOpen ? handleOpenSheet : undefined}
                            className={`relative flex items-center gap-2 rounded-xl p-1.5 transition-all shrink-0 ${
                                isNameHidden
                                    ? 'border border-dashed border-purple-500/40 bg-purple-950/25 hover:border-purple-400/60 cursor-default opacity-90 shadow-sm'
                                    : `border border-slate-700/80 bg-slate-900/80 ${canOpen ? 'cursor-pointer group hover:bg-slate-800 hover:border-slate-500' : 'cursor-default opacity-85'}`
                            }`}
                            title={isNameHidden ? `Unknown Creature (Init: ${c.initiative})` : (canOpen ? `${displayName} (Init: ${c.initiative} - Click to view)` : `${displayName} (Init: ${c.initiative})`)}
                        >
                            <div className={`w-8 h-8 rounded-lg overflow-hidden shrink-0 relative ${
                                isNameHidden ? 'bg-slate-950 border border-purple-500/50' : 'bg-slate-950 border border-slate-700'
                            }`}>
                                {displayImage ? (
                                    <div className="w-full h-full relative">
                                        <img 
                                            src={displayImage} 
                                            className={`w-full h-full object-cover ${isNameHidden ? 'filter brightness-75 contrast-110 saturate-75' : ''}`} 
                                            referrerPolicy="no-referrer" 
                                            alt={displayName} 
                                        />
                                        {isNameHidden && (
                                            <>
                                                <div className="absolute inset-0 bg-gradient-to-t from-purple-950/70 via-transparent to-transparent pointer-events-none" />
                                                <div className="absolute bottom-0 right-0 p-0.5 bg-purple-950/90 rounded-tl border-t border-l border-purple-500/40 text-purple-300">
                                                    <Icon name="eye-off" size={8} />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className={`w-full h-full flex items-center justify-center font-bold text-xs ${
                                        isNameHidden ? 'bg-purple-950/60 text-purple-300' : 'text-slate-400'
                                    }`}>
                                        {isNameHidden ? (
                                            <Icon name="help-circle" size={14} className="text-purple-400/90" />
                                        ) : (
                                            displayName[0] || '?'
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col hidden sm:flex pr-1 min-w-0">
                                <span className={`text-xs whitespace-nowrap truncate max-w-[90px] transition-colors flex items-center gap-1 ${
                                    isNameHidden 
                                        ? 'font-medium italic text-purple-200/85 tracking-wide' 
                                        : `font-semibold text-slate-200 ${canOpen ? 'group-hover:text-white' : ''}`
                                }`}>
                                    {isNameHidden && <Icon name="eye-off" size={10} className="text-purple-400/80 shrink-0" />}
                                    <span>{shortDisplayName}</span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-bold ${isNameHidden ? 'text-purple-400/80' : 'text-slate-400'}`}>Init {c.initiative}</span>
                                    {isNameHidden ? (
                                        <span className="text-[7px] font-bold uppercase text-purple-300 bg-purple-950/80 px-0.5 rounded border border-purple-500/30">
                                            Hidden
                                        </span>
                                    ) : isMyChar ? (
                                        <span className="text-[8px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-1 rounded border border-emerald-500/30">
                                            You
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div className={`sm:hidden absolute -top-1.5 -right-1.5 text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border shadow-sm ${
                                isNameHidden ? 'bg-purple-900 border-purple-500 text-purple-200' : 'bg-slate-800 border-slate-600 text-slate-300'
                            }`}>
                                {c.initiative}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/* -------------------------------------------------------------------------- */
/*                                 EDITABLE HP                                */
/* -------------------------------------------------------------------------- */
export const EditableHP = ({ currentHp, maxHp, onSave }) => {
    const [val, setVal] = useState(currentHp ?? '');
    useEffect(() => setVal(currentHp ?? ''), [currentHp]);

    const numericHp = typeof currentHp === 'number' ? currentHp : parseInt(currentHp, 10) || 0;
    const numericMax = typeof maxHp === 'number' ? maxHp : parseInt(maxHp, 10) || 0;
    const pct = numericMax > 0 ? Math.max(0, Math.min(100, Math.round((numericHp / numericMax) * 100))) : 100;

    let colorClass = 'text-emerald-400';
    if (pct <= 20) colorClass = 'text-rose-400';
    else if (pct <= 50) colorClass = 'text-amber-400';

    const commitChange = () => {
        const str = String(val).trim();
        if (!str) {
            setVal(currentHp ?? '');
            return;
        }

        // Support delta notation: "+5" or "-10"
        if (str.startsWith('+') || str.startsWith('-')) {
            const delta = parseInt(str, 10);
            if (!isNaN(delta)) {
                const nextVal = Math.max(0, numericHp + delta);
                onSave(nextVal);
                return;
            }
        }

        const num = parseInt(str, 10);
        if (!isNaN(num) && num !== currentHp) {
            onSave(Math.max(0, num));
        } else {
            setVal(currentHp ?? '');
        }
    };

    return (
        <div 
            className="flex items-center bg-slate-950/90 border border-slate-700/80 rounded-md overflow-hidden shadow-inner focus-within:border-amber-500/80 transition-colors h-5" 
            onClick={e => e.stopPropagation()}
            title="Edit HP (supports direct numbers or +/- delta)"
        >
            <input 
                className={`w-8 sm:w-9 bg-transparent text-center text-[10px] font-black ${colorClass} outline-none py-0 focus:bg-slate-800/80`}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={commitChange}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                onFocus={(e) => e.target.select()}
                placeholder="HP"
            />
            <span className="text-[9px] text-slate-400 px-1 border-l border-slate-800 bg-slate-900/90 leading-none flex items-center h-full select-none font-bold">
                /{maxHp ?? '-'}
            </span>
        </div>
    );
};

/* -------------------------------------------------------------------------- */
/*                              INITIATIVE BONUS HELPER                       */
/* -------------------------------------------------------------------------- */
export { getInitiativeBonus };

/* -------------------------------------------------------------------------- */
/*                              INITIATIVE PROMPT                             */
/* -------------------------------------------------------------------------- */
export const InitiativePrompt = ({ 
    combat, 
    tokens = [], 
    allCharacters = [], 
    user, 
    assignments = {}, 
    updateCampaign, 
    campaignData, 
    role, 
    sendMessage, 
    campaignCode, 
    onDiceRoll,
    isClashing = false
}) => {
    const [dismissedForCombat, setDismissedForCombat] = useState(false);
    const [manualRolls, setManualRolls] = useState({});
    const [manualModes, setManualModes] = useState({}); // { [tokenId]: 'dice' | 'total' }
    
    // Reset dismissal when combat toggles active OR when DM calls initiative
    useEffect(() => {
        setDismissedForCombat(false);
        setManualRolls({});
        setManualModes({});
    }, [combat?.active, combat?.initiativeCalledAt]);

    // Don't show modal while the two swords are clanking or if dismissed/dm
    if (!combat?.active || dismissedForCombat || role === 'dm' || isClashing) return null;

    // Find all tokens controlled by this user on the map
    const controlledTokens = (tokens || []).filter(t => {
        const character = allCharacters.find(c => String(c.id) === String(t.characterId));
        const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || (t.ownerId && String(t.ownerId) === String(user?.uid));
        const myCharAssigned = assignments?.[user?.uid] && String(t.characterId) === String(assignments[user?.uid]);
        return isOwner || myCharAssigned;
    });

    // Also include assigned/owned characters who might not yet be placed on the active map
    const controlledCharIds = new Set(controlledTokens.map(t => String(t.characterId)));
    const unplacedCharacters = (allCharacters || []).filter(char => {
        const isOwner = char?.ownerId && String(char.ownerId) === String(user?.uid);
        const isAssigned = assignments?.[user?.uid] && String(char.id) === String(assignments[user?.uid]);
        return (isOwner || isAssigned) && !controlledCharIds.has(String(char.id));
    });

    const virtualTokens = unplacedCharacters.map(char => ({
        id: `char_${char.id}`,
        characterId: char.id,
        name: char.name || 'Hero',
        image: char.image || char.avatar,
        stats: char.stats || { dex: 10 }
    }));

    const allCandidateTokens = [...controlledTokens, ...virtualTokens];

    const combatants = combat.combatants || [];
    const pending = combat.pendingInitiatives || {};
    
    const needsInitiative = allCandidateTokens.filter(t => {
        const inCombat = combatants.some(c => c.tokenId === t.id || String(c.characterId) === String(t.characterId));
        const isPending = pending[t.id] !== undefined || pending[t.characterId] !== undefined;
        return !inCombat && !isPending;
    });

    if (needsInitiative.length === 0) return null;

    const submitDigital = (tokensToRoll) => {
        const newPending = { ...pending };
        
        tokensToRoll.forEach(t => {
            const char = allCharacters.find(c => String(c.id) === String(t.characterId));
            const mod = getInitiativeBonus(t, char);
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
                
                const payload = {
                    formula: `1d20${mod >= 0 ? `+${mod}` : `${mod}`}`,
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
                naturalRoll: total - mod,
                modifier: mod,
                isNpc: !!(campaignData?.npcs || []).some(n => String(n.id) === String(t.characterId))
            };
        });
        
        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, pendingInitiatives: newPending } } });
    };
    
    const submitManual = (t, finalTotal, rawDie, mode = 'dice') => {
        if (finalTotal === undefined || finalTotal === null || isNaN(finalTotal)) return;
        
        const char = allCharacters.find(c => String(c.id) === String(t.characterId));
        const name = t.name || char?.name || 'Unknown';
        const mod = getInitiativeBonus(t, char);
        
        const newPending = { 
            ...pending,
            [t.id]: {
                initiative: finalTotal,
                name: name,
                characterId: t.characterId,
                method: 'manual',
                naturalRoll: mode === 'dice' ? rawDie : null,
                modifier: mod,
                isNpc: !!(campaignData?.npcs || []).some(n => String(n.id) === String(t.characterId))
            }
        };
        
        if (sendMessage) {
            const payload = {
                formula: mode === 'dice'
                    ? `1d20 (${rawDie}) ${mod >= 0 ? `+ ${mod}` : `- ${Math.abs(mod)}`} = ${finalTotal}`
                    : `Initiative Total: ${finalTotal}`,
                naturalRoll: mode === 'dice' ? rawDie : finalTotal,
                rolls: mode === 'dice' ? [rawDie] : [finalTotal],
                modifier: mod,
                total: finalTotal,
                characterName: name,
                isDmRoll: false,
                actionType: 'Roll',
                weaponName: 'Initiative (Manual)',
                alias: 'Initiative',
                type: 'roll-public'
            };
            sendMessage({
                content: JSON.stringify(payload),
                type: payload.type,
                senderId: user?.uid || 'anon',
                senderName: name,
                targetId: null,
                timestamp: Date.now()
            });
        }
        
        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, pendingInitiatives: newPending } } });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200 pointer-events-auto">
            <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/40 shadow-[0_0_50px_rgba(245,158,11,0.25)] rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                
                {/* Modal Header */}
                <div className="p-4 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/50 via-slate-900 to-amber-950/30 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                            <Icon name="swords" size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-white fantasy-font tracking-wide">
                                Roll for Initiative
                            </h3>
                            <p className="text-[11px] text-amber-300/80">Combat has begun! Roll to join the turn order.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setDismissedForCombat(true)} 
                        className="text-slate-400 hover:text-white p-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700/80 transition-colors"
                        title="Dismiss for now"
                    >
                        <Icon name="x" size={16} />
                    </button>
                </div>
                
                {/* Modal Body */}
                <div className="p-4 space-y-3 overflow-y-auto custom-scroll flex-1 min-h-0">
                    {needsInitiative.map(t => {
                        const char = allCharacters.find(c => String(c.id) === String(t.characterId));
                        const img = t.image || t.img || char?.image;
                        const name = t.name || char?.name || 'Unknown';
                        const mod = getInitiativeBonus(t, char);
                        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
                        
                        const mode = manualModes[t.id] || 'dice';
                        const rawInput = manualRolls[t.id] ?? '';
                        const parsedVal = rawInput === '' ? null : parseInt(rawInput, 10);
                        const hasVal = parsedVal !== null && !isNaN(parsedVal);
                        const calculatedTotal = hasVal ? (mode === 'dice' ? parsedVal + mod : parsedVal) : null;
                        const isNat20 = mode === 'dice' && parsedVal === 20;
                        const isNat1 = mode === 'dice' && parsedVal === 1;
                        
                        return (
                            <div 
                                key={t.id} 
                                className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-700/80 flex flex-col gap-3 shadow-md hover:border-amber-500/40 transition-all"
                            >
                                {/* Character Identity */}
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-slate-950 shrink-0 border border-slate-700 overflow-hidden shadow">
                                        {img ? (
                                            <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={name} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-black text-amber-400 text-sm bg-amber-950/30">
                                                {name[0] || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-white text-sm truncate">{name}</div>
                                        <div className="text-[11px] text-amber-400/90 font-semibold flex items-center gap-1.5 mt-0.5">
                                            <span>Sheet Modifier:</span>
                                            <span className="bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-500/30 font-black text-amber-300">
                                                {modStr}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Option 1: 1-Click Digital Auto-Roll */}
                                <button 
                                    onClick={() => submitDigital([t])}
                                    className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-black py-2.5 px-3 rounded-xl shadow-md shadow-amber-950/40 flex items-center justify-center gap-2 transition-all active:scale-98"
                                >
                                    <Icon name="dice" size={15} />
                                    <span>Digital Roll (1d20 {modStr})</span>
                                </button>

                                {/* Divider */}
                                <div className="flex items-center gap-2 my-0.5">
                                    <div className="h-px bg-slate-800 flex-1" />
                                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">or enter physical roll</span>
                                    <div className="h-px bg-slate-800 flex-1" />
                                </div>

                                {/* Option 2: Physical Dice Entry with Live Math Breakdown */}
                                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 font-semibold">
                                            {mode === 'dice' ? 'Enter die number (bonus added automatically):' : 'Enter final total directly:'}
                                        </span>
                                        <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px]">
                                            <button
                                                type="button"
                                                onClick={() => setManualModes(p => ({ ...p, [t.id]: 'dice' }))}
                                                className={`px-2 py-0.5 rounded transition-all ${mode === 'dice' ? 'bg-amber-600 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                d20 + Mod
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setManualModes(p => ({ ...p, [t.id]: 'total' }))}
                                                className={`px-2 py-0.5 rounded transition-all ${mode === 'total' ? 'bg-amber-600 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Total
                                            </button>
                                        </div>
                                    </div>

                                    {mode === 'dice' ? (
                                        /* Live Equation: [ d20 ] + [ Mod ] = [ Total ] [ Save ] */
                                        <div className="flex items-center gap-2">
                                            {/* d20 Input */}
                                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 focus-within:border-amber-500 shrink-0 shadow-inner">
                                                <span className="text-[11px] font-black text-slate-400">d20</span>
                                                <input 
                                                    type="number"
                                                    min="1"
                                                    max="20"
                                                    value={rawInput}
                                                    onChange={(e) => setManualRolls(p => ({ ...p, [t.id]: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter' && hasVal) submitManual(t, calculatedTotal, parsedVal, 'dice'); }}
                                                    placeholder="e.g. 14"
                                                    className="w-14 bg-transparent text-sm text-white text-center outline-none no-spinner font-black placeholder-slate-600"
                                                />
                                            </div>

                                            {/* Plus / Minus Operator */}
                                            <span className="text-slate-400 font-black text-sm shrink-0">
                                                {mod >= 0 ? '+' : '−'}
                                            </span>

                                            {/* Sheet Bonus */}
                                            <div className="bg-amber-950/70 border border-amber-500/30 rounded-xl px-2.5 py-1.5 text-center min-w-[36px] shrink-0" title={`Sheet Initiative Modifier: ${modStr}`}>
                                                <span className="text-xs font-black text-amber-300">
                                                    {Math.abs(mod)}
                                                </span>
                                            </div>

                                            {/* Equals */}
                                            <span className="text-slate-400 font-black text-sm shrink-0">=</span>

                                            {/* Calculated Total Box */}
                                            <div className="flex-1 flex items-center justify-center bg-slate-900/90 border border-slate-700/80 rounded-xl py-1.5 px-2 min-w-[56px]">
                                                <div className="flex flex-col items-center">
                                                    <span className={`text-sm font-black leading-tight ${hasVal ? 'text-amber-400' : 'text-slate-600'}`}>
                                                        {hasVal ? calculatedTotal : '—'}
                                                    </span>
                                                    <span className="text-[8px] font-bold uppercase tracking-wider leading-none mt-0.5">
                                                        {isNat20 ? (
                                                            <span className="text-emerald-400">Nat 20!</span>
                                                        ) : isNat1 ? (
                                                            <span className="text-rose-400">Nat 1</span>
                                                        ) : (
                                                            <span className="text-slate-500">Total</span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Submit Button */}
                                            <button 
                                                onClick={() => submitManual(t, calculatedTotal, parsedVal, 'dice')}
                                                disabled={!hasVal}
                                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white text-xs font-black px-3 py-2 rounded-xl transition-all shadow-md active:scale-95 shrink-0 flex items-center gap-1"
                                                title={hasVal ? `Submit Initiative ${calculatedTotal}` : 'Enter your d20 roll first'}
                                            >
                                                <Icon name="check" size={14} />
                                                <span>Save</span>
                                            </button>
                                        </div>
                                    ) : (
                                        /* Direct Total Input */
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 focus-within:border-amber-500">
                                                <span className="text-xs font-bold text-slate-400">Total Initiative:</span>
                                                <input 
                                                    type="number"
                                                    value={rawInput}
                                                    onChange={(e) => setManualRolls(p => ({ ...p, [t.id]: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter' && hasVal) submitManual(t, parsedVal, null, 'total'); }}
                                                    placeholder="e.g. 18"
                                                    className="flex-1 bg-transparent text-sm text-white font-black outline-none no-spinner placeholder-slate-600"
                                                />
                                            </div>
                                            <button 
                                                onClick={() => submitManual(t, parsedVal, null, 'total')}
                                                disabled={!hasVal}
                                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white text-xs font-black px-3.5 py-2 rounded-xl transition-all shadow-md active:scale-95 shrink-0 flex items-center gap-1"
                                                title={hasVal ? `Submit Initiative ${parsedVal}` : 'Enter total initiative'}
                                            >
                                                <Icon name="check" size={14} />
                                                <span>Save</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {/* Modal Footer */}
                {needsInitiative.length > 1 && (
                    <div className="p-4 border-t border-slate-800/90 bg-slate-950/80 shrink-0">
                        <button 
                            onClick={() => submitDigital(needsInitiative)}
                            className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-white font-black py-2.5 rounded-xl shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 transition-all active:scale-98 text-sm"
                        >
                            <Icon name="dice" size={16} /> Roll All ({needsInitiative.length}) Digitally
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

/* -------------------------------------------------------------------------- */
/*                            COMBAT TRACKER SIDEBAR                          */
/* -------------------------------------------------------------------------- */
export const CombatTrackerSidebar = ({ 
    combat, 
    updateCampaign, 
    updateMap,
    showNameplates = true,
    tokens = [], 
    role, 
    campaignData, 
    allCharacters = [], 
    onOpenSheet, 
    data, 
    campaignCode, 
    activeMapId, 
    className = "", 
    onClose, 
    onDiceRoll,
    onCallInitiative
}) => {
    const [showAddModal, setShowAddModal] = useState(false);
    const [addModalSearch, setAddModalSearch] = useState('');
    const [conditionMenuTokenId, setConditionMenuTokenId] = useState(null);

    const dialog = useDialog();
    const toast = useToast();
    const selectedTokenIds = useCharacterStore(state => state.selectedTokenIds);
    const setSelectedTokenIds = useCharacterStore(state => state.setSelectedTokenIds);
    const scrollContainerRef = useRef(null);
    const [sidebarWidth, setSidebarWidth] = useState(320);

    // Derive combat state unconditionally for hooks
    const combatants = combat?.combatants || [];
    const turn = combat?.turn || 0;
    const sortedCombatants = [...combatants].sort((a,b) => (b.initiative ?? 0) - (a.initiative ?? 0));
    const activeIndex = sortedCombatants.length > 0 ? turn % sortedCombatants.length : 0;
    const activeCombatant = sortedCombatants.length > 0 ? sortedCombatants[activeIndex] : null;
    const currentRound = combat?.round || (combatants.length > 0 ? Math.floor(turn / combatants.length) + 1 : 1);

    const handleResizeMouseDown = useCallback((e) => {
        if (e.cancelable) e.preventDefault();
        const startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const startWidth = sidebarWidth;

        const handleMouseMove = (moveEvent) => {
            const clientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX) || 0;
            const deltaX = clientX - startX;
            const newWidth = Math.max(280, Math.min(750, startWidth + deltaX));
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

    // Auto-scroll to whoever's turn it is in initiative, or to selected token
    useEffect(() => {
        if (!scrollContainerRef.current) return;

        const scrollToActiveOrSelected = () => {
            if (!scrollContainerRef.current) return;

            // 1. If combat is active, auto-scroll down to whoever's turn it is
            if (combat?.active && activeCombatant?.tokenId) {
                const activeEl = scrollContainerRef.current.querySelector(`[data-token-id="${activeCombatant.tokenId}"]`);
                if (activeEl) {
                    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    return;
                }
            }

            // 2. Otherwise scroll to selected token if clicked
            if (selectedTokenIds.length > 0) {
                const selectedEl = scrollContainerRef.current.querySelector(`[data-token-id="${selectedTokenIds[0]}"]`);
                if (selectedEl) {
                    selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        };

        scrollToActiveOrSelected();
        const timer = setTimeout(scrollToActiveOrSelected, 60);
        return () => clearTimeout(timer);
    }, [combat?.active, turn, activeCombatant?.tokenId, selectedTokenIds]);

    if (role !== 'dm') return null;

    const handleCallInitiative = () => {
        const now = Date.now();
        if (onCallInitiative) onCallInitiative();
        updateCampaign({ 
            campaign: { 
                ...campaignData, 
                combat: { 
                    ...(combat || {}), 
                    active: true, 
                    initiativeCalledAt: now 
                } 
            } 
        });
        toast("⚔️ Called for Initiative! Swords clashing for all players.", "success");
    };

    const handleAddTokenToCombat = (token) => {
        const currentCombat = combat || { active: false, round: 1, turn: 0, combatants: [] };
        const combatants = currentCombat.combatants || [];

        if (combatants.some(c => c.tokenId === token.id)) {
            toast(`${token.name || 'Token'} is already in combat.`, "info");
            return;
        }

        const char = allCharacters?.find(c => String(c.id) === String(token.characterId));
        const mod = getInitiativeBonus(token, char);

        let total;
        if (onDiceRoll) {
            const formula = `1d20${mod >= 0 ? `+${mod}` : `${mod}`}`;
            const res = onDiceRoll(formula, {
                alias: 'Initiative',
                characterName: token.name || char?.name || 'Unknown',
                actionType: 'Roll',
                weaponName: 'Initiative'
            });
            total = (res && typeof res.total === 'number') ? res.total : (Number(res) || (10 + mod));
        } else {
            const roll = Math.floor(Math.random() * 20) + 1;
            total = roll + mod;
        }

        const isNpc = !data?.players?.some(p => String(p.id) === String(token.characterId));

        const newCombatant = {
            tokenId: token.id,
            characterId: token.characterId || token.id,
            initiative: total,
            name: token.name || char?.name || 'Unknown',
            isNpc: isNpc
        };

        const newCombatants = [...combatants, newCombatant].sort((a,b) => b.initiative - a.initiative);
        updateCampaign({ campaign: { ...campaignData, combat: { ...currentCombat, active: true, combatants: newCombatants } } });
        toast(`Added ${newCombatant.name} to combat (Init: ${total})`, "success");
    };

    const handleAddAllMapTokens = () => {
        const currentCombat = combat || { active: false, round: 1, turn: 0, combatants: [] };
        const combatants = currentCombat.combatants || [];
        const unaddedTokens = (tokens || []).filter(t => t?.id && !combatants.some(c => c.tokenId === t.id));

        if (unaddedTokens.length === 0) {
            toast("All map tokens are already in combat.", "info");
            return;
        }

        const newEntries = unaddedTokens.map(token => {
            const char = allCharacters?.find(c => String(c.id) === String(token.characterId));
            const mod = getInitiativeBonus(token, char);
            let total;
            if (onDiceRoll) {
                const res = onDiceRoll(`1d20${mod >= 0 ? `+${mod}` : `${mod}`}`, {
                    alias: 'Initiative',
                    characterName: token.name || char?.name || 'Unknown',
                    actionType: 'Roll',
                    weaponName: 'Initiative'
                });
                total = (res && typeof res.total === 'number') ? res.total : (Number(res) || (10 + mod));
            } else {
                const roll = Math.floor(Math.random() * 20) + 1;
                total = roll + mod;
            }
            const isNpc = !data?.players?.some(p => String(p.id) === String(token.characterId));
            return {
                tokenId: token.id,
                characterId: token.characterId || token.id,
                initiative: total,
                name: token.name || char?.name || 'Unknown',
                isNpc: isNpc
            };
        });

        const newCombatants = [...combatants, ...newEntries].sort((a,b) => b.initiative - a.initiative);
        updateCampaign({ campaign: { ...campaignData, combat: { ...currentCombat, active: true, combatants: newCombatants } } });
        toast(`Added ${newEntries.length} tokens to combat`, "success");
    };

    const handleAddActorToCombat = (actor, isNpc) => {
        const currentCombat = combat || { active: false, round: 1, turn: 0, combatants: [] };
        const combatants = currentCombat.combatants || [];
        
        const mapToken = (tokens || []).find(t => String(t.characterId) === String(actor.id) && !combatants.some(c => c.tokenId === t.id));
        const targetTokenId = mapToken ? mapToken.id : `tracker_${actor.id}_${Date.now()}`;

        if (combatants.some(c => c.tokenId === targetTokenId || (!mapToken && c.characterId === actor.id))) {
            toast(`${actor.name} is already in combat.`, "info");
            return;
        }
    
        const mod = getInitiativeBonus(mapToken, actor);
        
        let total;
        if (onDiceRoll) {
            const formula = `1d20${mod >= 0 ? `+${mod}` : `${mod}`}`;
            const res = onDiceRoll(formula, {
                alias: 'Initiative',
                characterName: actor.name || 'Unknown',
                actionType: 'Roll',
                weaponName: 'Initiative'
            });
            total = (res && typeof res.total === 'number') ? res.total : (Number(res) || (10 + mod));
        } else {
            const roll = Math.floor(Math.random() * 20) + 1;
            total = roll + mod;
        }
        
        const newCombatant = {
            tokenId: targetTokenId,
            characterId: actor.id,
            initiative: total,
            name: mapToken?.name || actor.name || 'Unknown',
            isNpc: isNpc
        };
        
        const newCombatants = [...combatants, newCombatant].sort((a,b) => b.initiative - a.initiative);
        updateCampaign({ campaign: { ...campaignData, combat: { ...currentCombat, active: true, combatants: newCombatants } } });
        toast(`Added ${newCombatant.name} to combat (Init: ${total})`, "success");
    };

    if (!combat) return null;

    const handleNext = () => {
        const nextTurn = turn + 1;
        const nextRound = combatants.length > 0 ? Math.floor(nextTurn / combatants.length) + 1 : (combat.round || 1);
        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, turn: nextTurn, round: nextRound } } });
    };

    const handlePrev = () => {
        const prevTurn = Math.max(0, turn - 1);
        const prevRound = combatants.length > 0 ? Math.floor(prevTurn / combatants.length) + 1 : (combat.round || 1);
        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, turn: prevTurn, round: prevRound } } });
    };

    const handleEnd = async () => {
        if (await dialog.confirm("End combat and clear initiative tracker?")) {
            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, active: false, combatants: [], turn: 0, round: 1 } } });
            if (onClose) onClose();
        }
    };

    const editInit = async (tokenId, currentInit) => {
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

    const handleToggleCondition = (tokenId, charId, isNpc, condName) => {
        const targetCombatant = combatants.find(c => c.tokenId === tokenId);
        const token = tokens.find(t => t.id === tokenId);
        const char = allCharacters.find(ch => String(ch.id) === String(charId));
        const currentConditions = targetCombatant?.conditions || token?.conditions || char?.conditions || [];
        
        const exists = currentConditions.some(c => (typeof c === 'string' ? c : c?.name)?.toLowerCase() === condName.toLowerCase());
        const nextConditions = exists 
            ? currentConditions.filter(c => (typeof c === 'string' ? c : c?.name)?.toLowerCase() !== condName.toLowerCase())
            : [...currentConditions, condName];
            
        const newCombatants = combatants.map(c => c.tokenId === tokenId ? { ...c, conditions: nextConditions } : c);
        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants } } });
        
        if (token && campaignCode && activeMapId) {
            updateMap(campaignCode, activeMapId, { [`tokens.${tokenId}.conditions`]: nextConditions });
        }
    };

    return (
        <div 
            className={`relative pointer-events-auto max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] bg-slate-950/95 backdrop-blur-2xl border border-slate-800/90 shadow-[0_12px_40px_rgba(0,0,0,0.8)] rounded-2xl z-[60] flex flex-col overflow-hidden transition-all ${className} ${combat.active ? 'border-amber-500/40 shadow-amber-950/20' : 'border-slate-800'}`}
            style={{ width: `${sidebarWidth}px` }}
        >
            {/* Resize Handle */}
            <div 
                className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-amber-500/40 z-[100] touch-none transition-colors"
                onMouseDown={handleResizeMouseDown}
                onTouchStart={handleResizeMouseDown}
                title="Drag to resize tracker"
            />

            {/* DM Header */}
            <div className="px-3 py-2 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border-b border-slate-800/90 flex justify-between items-center shrink-0 gap-2 overflow-hidden">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                        <Icon name="swords" size={13} />
                    </div>
                    <h3 className="text-xs font-black fantasy-font text-white tracking-wide truncate">
                        Initiative
                    </h3>
                </div>

                {/* Toolbar buttons */}
                <div className="flex items-center gap-1 shrink-0">
                    <button 
                        type="button"
                        onClick={handleCallInitiative} 
                        className="p-1 hover:bg-amber-950/60 rounded-lg text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/60 shadow-sm transition-all" 
                        title="Call for Initiative (Clash Swords & Prompt Players)"
                    >
                        <Icon name="swords" size={14} />
                    </button>
                    <button 
                        type="button"
                        onClick={() => setShowAddModal(true)} 
                        className="p-1 hover:bg-slate-800 rounded-lg text-amber-400 hover:text-amber-300 border border-transparent hover:border-slate-700 transition-all" 
                        title="Add Combatant"
                    >
                        <Icon name="plus" size={14} />
                    </button>
                    {combat.active && (
                        <>
                            <div className="w-px h-3.5 bg-slate-800 my-auto mx-0.5" />
                            <button 
                                type="button"
                                onClick={handleEnd} 
                                className="p-1 hover:bg-rose-950/50 rounded-lg text-rose-500 hover:text-rose-400 transition-all" 
                                title="End Combat"
                            >
                                <Icon name="trash-2" size={14} />
                            </button>
                        </>
                    )}
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white border border-transparent hover:border-slate-700 transition-all" 
                        title="Close Tracker"
                    >
                        <Icon name="x" size={14} />
                    </button>
                </div>
            </div>

            {/* Active Combat Turn & Round Control Bar */}
            {combat.active && (
                <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 px-2.5 py-1.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-950/70 border border-amber-500/40 text-amber-400 text-[10px] font-black uppercase tracking-wider shrink-0 shadow-inner">
                            Round {currentRound}
                        </span>
                        {activeCombatant && (
                            <span className="text-[11px] text-slate-300 truncate">
                                Turn: <strong className="text-white font-bold">{activeCombatant.name}</strong>
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button 
                            type="button"
                            onClick={handlePrev} 
                            className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-all border border-slate-700/60" 
                            title="Previous Turn"
                        >
                            <Icon name="chevron-left" size={13} />
                        </button>
                        <button 
                            type="button"
                            onClick={handleNext} 
                            className="px-2 py-0.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-[11px] font-black rounded-md transition-all flex items-center gap-1 shadow-md shadow-amber-950/40 active:scale-95" 
                            title="Next Turn"
                        >
                            <span>Next</span>
                            <Icon name="chevron-right" size={12} />
                        </button>
                    </div>
                </div>
            )}
            
            {/* Pending Player Rolls Banner */}
            {combat.active && Object.keys(combat.pendingInitiatives || {}).length > 0 && (
                <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/40 px-2.5 py-1.5 border-b border-amber-500/30 flex justify-between items-center shrink-0">
                    <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1.5">
                        <Icon name="clock" size={12} className="text-amber-400 animate-pulse" />
                        <span>Pending ({Object.keys(combat.pendingInitiatives).length})</span>
                    </span>
                    <button 
                        onClick={() => {
                            const newCombatants = [...(combat.combatants || [])];
                            Object.entries(combat.pendingInitiatives || {}).forEach(([tokenId, pendingData]) => {
                                const idx = newCombatants.findIndex(c => c.tokenId === tokenId);
                                if (idx !== -1) {
                                    newCombatants[idx].initiative = pendingData.initiative;
                                } else {
                                    newCombatants.push({
                                        tokenId,
                                        characterId: pendingData.characterId,
                                        initiative: pendingData.initiative,
                                        name: pendingData.name,
                                        isNpc: pendingData.isNpc
                                    });
                                }
                            });
                            updateCampaign({ 
                                campaign: { 
                                    ...campaignData, 
                                    combat: { 
                                        ...combat, 
                                        combatants: newCombatants.sort((a,b) => b.initiative - a.initiative), 
                                        pendingInitiatives: {} 
                                    } 
                                } 
                            });
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 shadow transition-all active:scale-95"
                    >
                        <Icon name="check" size={12} /> Accept All
                    </button>
                </div>
            )}
            
            {/* Combatant List Container */}
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1.5" ref={scrollContainerRef}>
                
                {/* Render Pending Roll Cards */}
                {Object.entries(combat.pendingInitiatives || {}).map(([tokenId, pendingData]) => {
                    const t = tokens.find(tok => tok.id === tokenId);
                    const char = allCharacters.find(ch => String(ch.id) === String(t?.characterId || pendingData.characterId));
                    const img = t?.image || t?.img || char?.image;
                    const name = pendingData.name;
                    
                    return (
                        <div 
                            key={`pending-${tokenId}`} 
                            className="relative flex items-center gap-2 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-950/40 to-slate-900/90 p-2 shadow-md animate-in fade-in"
                        >
                            <div className="w-8 h-8 rounded-lg bg-slate-950 border border-amber-500/50 shrink-0 overflow-hidden shadow">
                                {img ? (
                                    <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center font-black text-amber-400 text-xs">
                                        {name[0] || '?'}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-xs text-white truncate flex items-center gap-1">
                                    <span>{name}</span>
                                    <span className="text-amber-400 text-[8px] uppercase font-bold bg-amber-950/60 px-1 py-0.2 rounded border border-amber-500/30">
                                        {pendingData.method}
                                    </span>
                                </div>
                                <div className="text-sm font-black text-amber-400 mt-0.5 leading-none flex items-baseline gap-1 flex-wrap">
                                    <span>{pendingData.initiative}</span>
                                    <span className="text-[9px] text-slate-400 font-normal">Init</span>
                                    {pendingData.naturalRoll !== undefined && pendingData.naturalRoll !== null && (
                                        <span className="text-[9px] text-slate-400 font-semibold">
                                            (d20: {pendingData.naturalRoll}{pendingData.modifier !== undefined ? `${pendingData.modifier >= 0 ? ` + ${pendingData.modifier}` : ` − ${Math.abs(pendingData.modifier)}`}` : ''})
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button 
                                    onClick={() => {
                                        const newCombatants = [...(combat.combatants || [])];
                                        const idx = newCombatants.findIndex(c => c.tokenId === tokenId);
                                        if (idx !== -1) {
                                            newCombatants[idx].initiative = pendingData.initiative;
                                        } else {
                                            newCombatants.push({
                                                tokenId,
                                                characterId: pendingData.characterId,
                                                initiative: pendingData.initiative,
                                                name: pendingData.name,
                                                isNpc: pendingData.isNpc
                                            });
                                        }
                                        const newPending = { ...combat.pendingInitiatives };
                                        delete newPending[tokenId];
                                        updateCampaign({ 
                                            campaign: { 
                                                ...campaignData, 
                                                combat: { 
                                                    ...combat, 
                                                    combatants: newCombatants.sort((a,b) => b.initiative - a.initiative), 
                                                    pendingInitiatives: newPending 
                                                } 
                                            } 
                                        });
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg p-1 shadow transition-colors"
                                    title="Accept Roll"
                                >
                                    <Icon name="check" size={13} />
                                </button>
                                <button 
                                    onClick={() => {
                                        const newPending = { ...combat.pendingInitiatives };
                                        delete newPending[tokenId];
                                        updateCampaign({ 
                                            campaign: { 
                                                ...campaignData, 
                                                combat: { 
                                                    ...combat, 
                                                    pendingInitiatives: newPending 
                                                } 
                                            } 
                                        });
                                    }}
                                    className="bg-rose-600 hover:bg-rose-500 text-white rounded-lg p-1 shadow transition-colors"
                                    title="Deny Roll"
                                >
                                    <Icon name="x" size={13} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Render Combatants */}
                {sortedCombatants.length > 0 ? sortedCombatants.map((c, i) => {
                    const t = tokens.find(tok => tok.id === c.tokenId);
                    const char = allCharacters.find(ch => String(ch.id) === String(t?.characterId || c.characterId || c.tokenId));
                    const isActive = combat.active && activeCombatant?.tokenId === c.tokenId;
                    const isSelected = selectedTokenIds.includes(c.tokenId);
                    
                    const displayName = t?.name || char?.name || c.name || 'Unknown';
                    const displayImage = t?.image || t?.img || char?.image;
                    const charIdForSheet = t?.characterId || char?.id;
                    const isNpc = Boolean(
                        c.isNpc ||
                        t?.isNpc ||
                        char?.isNpc ||
                        char?.type === 'npc' ||
                        t?.type === 'npc' ||
                        (campaignData?.npcs || data?.npcs || []).some(n => String(n.id) === String(charIdForSheet))
                    );
                    const isPc = !isNpc;
                    const hp = isNpc ? (t?.hp?.current ?? char?.hp?.current ?? '-') : (char?.hp?.current ?? '-');
                    const maxHp = isNpc ? (t?.hp?.max ?? char?.hp?.max ?? '-') : (char?.hp?.max ?? '-');
                    const ac = char?.ac ?? t?.ac ?? '-';

                    const tokenHpNum = typeof hp === 'number' ? hp : parseInt(hp, 10) || 0;
                    const tokenMaxHpNum = typeof maxHp === 'number' ? maxHp : parseInt(maxHp, 10) || 0;
                    const hpPct = tokenMaxHpNum > 0 ? Math.max(0, Math.min(100, Math.round((tokenHpNum / tokenMaxHpNum) * 100))) : 100;

                    let hpBarColor = 'bg-emerald-500';
                    if (hpPct <= 20) hpBarColor = 'bg-rose-500';
                    else if (hpPct <= 50) hpBarColor = 'bg-amber-500';

                    const conditions = c.conditions || t?.conditions || char?.conditions || [];
                    
                    return (
                        <div 
                            key={c.tokenId} 
                            data-token-id={c.tokenId}
                            onClick={() => setSelectedTokenIds([c.tokenId])}
                            className={`relative flex flex-col rounded-xl border transition-all cursor-pointer overflow-hidden ${
                                isActive 
                                    ? 'bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/40' 
                                    : isSelected 
                                        ? 'bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border-indigo-500/80 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                                        : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/90'
                            }`}
                        >
                            {/* Left Accent Bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                isActive ? 'bg-amber-400' : isSelected ? 'bg-indigo-400' : 'bg-transparent'
                            }`} />

                            <div className="p-1.5 pl-2.5 flex flex-col gap-1">
                                {/* Row 1: Order Number, Avatar, Name, Turn Badge, and Actions */}
                                <div className="flex items-center gap-1.5 min-w-0">
                                    {/* Order Number */}
                                    <span className="text-[9px] font-bold text-slate-500 w-3 text-right shrink-0">
                                        {i + 1}
                                    </span>

                                    {/* Avatar (w-7 h-7 = 28px) */}
                                    <div 
                                        className={`w-7 h-7 rounded-lg bg-slate-950 overflow-hidden cursor-pointer transition-all shrink-0 border relative shadow ${
                                            isActive 
                                                ? 'border-amber-400 ring-1 ring-amber-400/40' 
                                                : isNpc ? 'border-rose-500/50 hover:border-rose-400' : 'border-indigo-500/50 hover:border-indigo-400'
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTokenIds([c.tokenId]);
                                            if (charIdForSheet && onOpenSheet) {
                                                onOpenSheet({ 
                                                    isToken: true, 
                                                    tokenId: c.tokenId, 
                                                    characterId: charIdForSheet, 
                                                    hp: tokenHpNum, 
                                                    maxHp: tokenMaxHpNum,
                                                    isPc: isPc,
                                                    defaultMode: isPc ? 'sheet' : 'statblock',
                                                    ownerId: t?.ownerId || char?.ownerId
                                                });
                                            }
                                        }}
                                        title={`Open ${displayName}'s ${isNpc ? 'Statblock' : 'Character Sheet'}`}
                                    >
                                        {displayImage ? (
                                            <img src={displayImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={displayName} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-[10px] bg-slate-900">
                                                {displayName[0] || '?'}
                                            </div>
                                        )}
                                    </div>

                                    {/* Name and Turn badge */}
                                    <div className="flex-1 min-w-0 flex items-center gap-1">
                                        <span className="font-bold text-xs text-white truncate" title={displayName}>
                                            {displayName}
                                        </span>
                                        {isNpc && (!showNameplates || t?.hideName || c.hideName) && (
                                            <span 
                                                className="text-[8px] font-bold text-purple-300 bg-purple-950/80 border border-purple-500/40 px-1 py-0.2 rounded flex items-center gap-0.5 shrink-0 shadow-sm" 
                                                title={!showNameplates ? "Name is hidden from players (Names OFF)" : "Name is hidden from players for this token"}
                                            >
                                                <Icon name="eye-off" size={8} /> Hidden
                                            </span>
                                        )}
                                        {isActive && (
                                            <span className="text-[8px] font-black uppercase tracking-wider text-amber-300 bg-amber-950/80 px-1 py-0.2 rounded border border-amber-500/40 shrink-0">
                                                Turn
                                            </span>
                                        )}
                                    </div>

                                    {/* DM Quick-Toggle Name Visibility for this Token */}
                                    {isNpc && updateMap && activeMapId && c.tokenId && (
                                        <button 
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateMap(campaignCode, activeMapId, {
                                                    [`tokens.${c.tokenId}.hideName`]: !t?.hideName
                                                });
                                            }}
                                            className={`p-0.5 rounded transition-colors shrink-0 ${
                                                t?.hideName ? 'text-purple-400 hover:text-purple-300 bg-purple-950/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/80'
                                            }`}
                                            title={t?.hideName ? "Token name is hidden from players (Click to reveal)" : (showNameplates ? "Click to hide token name from players" : "Token names are currently OFF globally")}
                                        >
                                            <Icon name={t?.hideName ? "eye-off" : "eye"} size={12} />
                                        </button>
                                    )}

                                    {/* Remove from Combat Button */}
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newCombatants = combatants.filter(x => x.tokenId !== c.tokenId);
                                            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants, active: newCombatants.length > 0 } } });
                                        }}
                                        className="text-slate-500 hover:text-rose-400 p-0.5 rounded hover:bg-slate-800/80 transition-colors shrink-0"
                                        title="Remove from Combat"
                                    >
                                        <Icon name="x" size={13} />
                                    </button>
                                </div>

                                {/* Row 2: Badges (Init, AC, Condition Toggle) + HP Input */}
                                <div className="flex items-center justify-between gap-1.5 pl-4 min-w-0">
                                    {/* Badges */}
                                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                                        {/* Initiative */}
                                        <button 
                                            type="button"
                                            className={`flex items-center gap-0.5 text-[9px] uppercase font-bold hover:text-amber-300 px-1.5 py-0.2 rounded border transition-colors ${
                                                isActive 
                                                    ? 'text-amber-400 bg-amber-950/50 border-amber-500/30' 
                                                    : 'text-slate-400 bg-slate-800/70 border-slate-700/60 hover:border-slate-600'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                editInit(c.tokenId, c.initiative);
                                            }}
                                            title="Click to edit initiative"
                                        >
                                            <Icon name="clock" size={9} /> {c.initiative}
                                        </button>

                                        {/* AC */}
                                        <div className="flex items-center gap-0.5 text-[9px] uppercase font-bold text-sky-400 bg-sky-950/40 px-1.5 py-0.2 rounded border border-sky-500/20" title="Armor Class">
                                            <Icon name="shield" size={9} /> {ac}
                                        </div>

                                        {/* Condition Toggle Icon */}
                                        <button 
                                            type="button"
                                            className={`text-[9px] px-1 py-0.2 rounded border flex items-center gap-0.5 transition-colors ${
                                                conditionMenuTokenId === c.tokenId || conditions.length > 0
                                                    ? 'text-amber-400 bg-amber-950/50 border-amber-500/40' 
                                                    : 'text-slate-400 hover:text-amber-400 bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConditionMenuTokenId(conditionMenuTokenId === c.tokenId ? null : c.tokenId);
                                            }}
                                            title="Toggle conditions"
                                        >
                                            <Icon name="activity" size={10} />
                                            {conditions.length > 0 && (
                                                <span className="text-[8px] font-black">{conditions.length}</span>
                                            )}
                                        </button>
                                    </div>

                                    {/* HP Editor */}
                                    <div className="shrink-0">
                                        <EditableHP 
                                            currentHp={hp} 
                                            maxHp={maxHp} 
                                            onSave={(val) => updateCharHp(c.tokenId, charIdForSheet, isNpc, val)} 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Slim Bottom Health Progress Bar */}
                            {tokenMaxHpNum > 0 && (
                                <div 
                                    className="w-full h-1 bg-slate-950/90 overflow-hidden border-t border-slate-800/50"
                                    title={`${tokenHpNum} / ${tokenMaxHpNum} HP (${hpPct}%)`}
                                >
                                    <div 
                                        className={`h-full transition-all duration-300 ${hpBarColor}`}
                                        style={{ width: `${hpPct}%` }}
                                    />
                                </div>
                            )}

                            {/* Condition Chips List */}
                            {conditions.length > 0 && (
                                <div className="px-2.5 pb-1.5 flex flex-wrap gap-1">
                                    {conditions.map(cond => {
                                        const cName = typeof cond === 'string' ? cond : cond.name;
                                        return (
                                            <span 
                                                key={cName}
                                                className="inline-flex items-center gap-1 text-[8px] font-bold bg-amber-950/70 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded"
                                            >
                                                <span>{cName}</span>
                                                <button 
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleCondition(c.tokenId, charIdForSheet, isNpc, cName);
                                                    }}
                                                    className="hover:text-rose-400 transition-colors"
                                                    title={`Remove ${cName}`}
                                                >
                                                    <Icon name="x" size={8} />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Conditions Selector Popover */}
                            {conditionMenuTokenId === c.tokenId && (
                                <div 
                                    className="p-2 border-t border-slate-800 bg-slate-950/95 flex flex-wrap gap-1 animate-in fade-in"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="w-full flex justify-between items-center mb-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                        <span>Conditions</span>
                                        <button 
                                            onClick={() => setConditionMenuTokenId(null)}
                                            className="text-slate-400 hover:text-white"
                                        >
                                            <Icon name="x" size={11} />
                                        </button>
                                    </div>
                                    {ALL_CONDITIONS.map(condName => {
                                        const isActiveCond = conditions.some(co => (typeof co === 'string' ? co : co?.name)?.toLowerCase() === condName.toLowerCase());
                                        return (
                                            <button 
                                                key={condName}
                                                type="button"
                                                onClick={() => handleToggleCondition(c.tokenId, charIdForSheet, isNpc, condName)}
                                                className={`text-[8px] font-bold px-1.5 py-0.5 rounded transition-all ${
                                                    isActiveCond 
                                                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm' 
                                                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                                }`}
                                            >
                                                {condName}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                }) : (
                    <div className="text-center p-6 text-xs text-slate-500 italic space-y-2.5 flex flex-col items-center">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-inner">
                            <Icon name="swords" size={20} />
                        </div>
                        <div className="font-bold text-slate-300 text-xs">No one is in combat yet.</div>
                        <p className="text-[10px] leading-relaxed text-slate-400 max-w-xs">
                            Start combat and sound the battle call! Players will see the clashing swords animation and get a popup to roll initiative.
                        </p>
                        <button
                            type="button"
                            onClick={handleCallInitiative}
                            className="mt-1 px-3 py-1.5 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-black rounded-lg shadow-lg shadow-amber-950/60 flex items-center gap-1.5 transition-all active:scale-95 not-italic"
                        >
                            <Icon name="swords" size={13} />
                            <span>Call for Initiative</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Controls */}
            <div className="p-2.5 px-3 bg-gradient-to-t from-slate-950 to-slate-900 border-t border-slate-800/90 shrink-0">
                {!combat.active ? (
                    <button 
                        type="button"
                        onClick={handleCallInitiative} 
                        className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-white py-2 rounded-xl font-black text-xs shadow-lg shadow-amber-950/50 flex items-center justify-center gap-1.5 transition-all active:scale-98"
                    >
                        <Icon name="swords" size={14} />
                        <span>Call for Initiative</span>
                    </button>
                ) : (
                    <button 
                        type="button"
                        onClick={handleNext} 
                        className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-white py-2 rounded-xl font-black text-xs shadow-lg shadow-amber-950/50 flex items-center justify-center gap-1.5 transition-all active:scale-98"
                    >
                        <span>Next Turn</span>
                        <Icon name="arrow-right" size={14} />
                    </button>
                )}
            </div>

            {/* Add Combatant Modal */}
            {showAddModal && (() => {
                const query = addModalSearch.toLowerCase().trim();

                const formatClasses = (classes) => {
                    if (!classes) return '';
                    if (typeof classes === 'string') return classes;
                    if (Array.isArray(classes)) {
                        return classes.map(c => {
                            if (typeof c === 'string') return c;
                            if (typeof c === 'object' && c !== null) {
                                return `${c.name || ''}${c.level ? ` ${c.level}` : ''}${c.subclass ? ` (${c.subclass})` : ''}`.trim();
                            }
                            return String(c);
                        }).filter(Boolean).join(' / ');
                    }
                    if (typeof classes === 'object' && classes !== null) {
                        return `${classes.name || ''}${classes.level ? ` ${classes.level}` : ''}${classes.subclass ? ` (${classes.subclass})` : ''}`.trim();
                    }
                    return String(classes);
                };

                const formatType = (type) => {
                    if (!type) return 'NPC / Monster';
                    if (typeof type === 'string') return type;
                    if (typeof type === 'object' && type !== null) return type.name || 'NPC / Monster';
                    return String(type);
                };

                const filteredMapTokens = (tokens || []).filter(t => {
                    if (!t?.id) return false;
                    if (!query) return true;
                    const char = allCharacters?.find(c => String(c.id) === String(t.characterId));
                    const name = (t.name || char?.name || '').toLowerCase();
                    return name.includes(query);
                });

                const unaddedMapTokensCount = (tokens || []).filter(t => t?.id && !combatants.some(c => c.tokenId === t.id)).length;

                const filteredPlayers = (data?.players || []).filter(p => {
                    if (!p?.id) return false;
                    if (!query) return true;
                    const classStr = formatClasses(p.classes);
                    return (p.name || '').toLowerCase().includes(query) || classStr.toLowerCase().includes(query);
                });

                const filteredNpcs = (data?.npcs || []).filter(n => {
                    if (!n?.id) return false;
                    if (!query) return true;
                    const typeStr = formatType(n.type);
                    return (n.name || '').toLowerCase().includes(query) || typeStr.toLowerCase().includes(query);
                });

                return createPortal(
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setShowAddModal(false)}>
                        <div 
                            className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/80 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex justify-between items-center shrink-0">
                                <h3 className="font-black text-white flex items-center gap-2 text-base fantasy-font tracking-wide">
                                    <Icon name="users" size={18} className="text-amber-400" /> Add to Combat
                                </h3>
                                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
                                    <Icon name="x" size={18} />
                                </button>
                            </div>
                            
                            <div className="p-3 border-b border-slate-800 bg-slate-950/80 shrink-0">
                                <div className="relative">
                                    <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search tokens, party, NPCs..."
                                        value={addModalSearch}
                                        onChange={(e) => setAddModalSearch(e.target.value)}
                                        className="w-full bg-slate-900 text-sm text-white pl-9 pr-8 py-2 rounded-xl border border-slate-700/80 focus:border-amber-500/80 focus:outline-none placeholder-slate-500 transition-colors"
                                        autoFocus
                                    />
                                    {addModalSearch && (
                                        <button 
                                            onClick={() => setAddModalSearch('')} 
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                        >
                                            <Icon name="x" size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 overflow-y-auto custom-scroll flex-1 min-h-0 space-y-6">
                                {/* SECTION 1: Active On Map */}
                                {filteredMapTokens.length > 0 && (
                                    <div>
                                        <div className="flex justify-between items-center mb-2.5">
                                            <h4 className="text-xs uppercase font-black text-amber-400 tracking-wider flex items-center gap-1.5">
                                                <Icon name="map-pin" size={13} /> Active on Map ({filteredMapTokens.length})
                                            </h4>
                                            {unaddedMapTokensCount > 1 && (
                                                <button 
                                                    onClick={handleAddAllMapTokens}
                                                    className="text-[10px] uppercase font-black bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded-lg shadow flex items-center gap-1 transition-all active:scale-95"
                                                >
                                                    <Icon name="plus" size={12} /> Add All ({unaddedMapTokensCount})
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            {filteredMapTokens.map(t => {
                                                const isAlreadyInCombat = combatants.some(c => c.tokenId === t.id);
                                                const char = allCharacters?.find(c => String(c.id) === String(t.characterId));
                                                const img = t.image || t.img || char?.image;
                                                const name = t.name || char?.name || 'Token';
                                                const isNpc = !data?.players?.some(p => String(p.id) === String(t.characterId));
                                                
                                                return (
                                                    <div 
                                                        key={`map-token-${t.id}`}
                                                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                                            isAlreadyInCombat 
                                                                ? 'bg-slate-900/40 border-slate-800/60 opacity-60' 
                                                                : 'bg-slate-900/90 border-slate-800 hover:border-amber-500/60 cursor-pointer group shadow-sm'
                                                        }`}
                                                        onClick={() => !isAlreadyInCombat && handleAddTokenToCombat(t)}
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden shrink-0">
                                                            {img ? (
                                                                <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={name} />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-xs">
                                                                    {name[0] || '?'}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-white text-sm truncate flex items-center gap-2">
                                                                <span>{name}</span>
                                                                <span className="text-[9px] bg-amber-950/80 text-amber-400 border border-amber-800/60 px-1.5 py-0.2 rounded font-normal">
                                                                    On Map
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                                                <span>{isNpc ? 'NPC / Monster' : 'Party Member'}</span>
                                                                <span>•</span>
                                                                <span>Pos: ({Math.round(t.x || 0)}, {Math.round(t.z || 0)})</span>
                                                            </div>
                                                        </div>
                                                        {isAlreadyInCombat ? (
                                                            <span className="text-xs text-slate-500 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 font-bold">
                                                                In Combat
                                                            </span>
                                                        ) : (
                                                            <button className="px-3 py-1.5 bg-amber-600 group-hover:bg-amber-500 text-white text-xs font-black rounded-lg shadow flex items-center gap-1 transition-colors">
                                                                <Icon name="plus" size={13} /> Add
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* SECTION 2: Party */}
                                {filteredPlayers.length > 0 && (
                                    <div>
                                        <div className="flex justify-between items-center mb-2.5">
                                            <h4 className="text-xs uppercase font-black text-indigo-400 tracking-wider flex items-center gap-1.5">
                                                <Icon name="shield" size={13} /> Party ({filteredPlayers.length})
                                            </h4>
                                        </div>
                                        <div className="space-y-1.5">
                                            {filteredPlayers.map(p => {
                                                const mapToken = (tokens || []).find(t => String(t.characterId) === String(p.id));
                                                const isAlreadyInCombat = combatants.some(c => c.characterId === p.id || (mapToken && c.tokenId === mapToken.id));
                                                const classLabel = formatClasses(p.classes);
                                                
                                                return (
                                                    <div 
                                                        key={`player-${p.id}`}
                                                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                                            isAlreadyInCombat 
                                                                ? 'bg-slate-900/40 border-slate-800/60 opacity-60' 
                                                                : 'bg-slate-900/90 border-slate-800 hover:border-indigo-500/60 cursor-pointer group shadow-sm'
                                                        }`}
                                                        onClick={() => !isAlreadyInCombat && handleAddActorToCombat(p, false)}
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden shrink-0">
                                                            {p.image ? (
                                                                <img src={p.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={p.name} />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-xs">
                                                                    {p.name?.[0] || '?'}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-white text-sm truncate flex items-center gap-2">
                                                                <span>{p.name}</span>
                                                                {mapToken && (
                                                                    <span className="text-[9px] bg-amber-950/80 text-amber-400 border border-amber-800/60 px-1.5 py-0.2 rounded font-normal">
                                                                        On Map
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                                                <span>Player Character</span>
                                                                {classLabel && <span>• {classLabel}</span>}
                                                            </div>
                                                        </div>
                                                        {isAlreadyInCombat ? (
                                                            <span className="text-xs text-slate-500 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 font-bold">
                                                                In Combat
                                                            </span>
                                                        ) : (
                                                            <button className="px-3 py-1.5 bg-indigo-600 group-hover:bg-indigo-500 text-white text-xs font-black rounded-lg shadow flex items-center gap-1 transition-colors">
                                                                <Icon name="plus" size={13} /> Add
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* SECTION 3: NPCs & Monsters */}
                                {filteredNpcs.length > 0 && (
                                    <div>
                                        <div className="flex justify-between items-center mb-2.5">
                                            <h4 className="text-xs uppercase font-black text-rose-400 tracking-wider flex items-center gap-1.5">
                                                <Icon name="skull" size={13} /> NPCs & Monsters ({filteredNpcs.length})
                                            </h4>
                                        </div>
                                        <div className="space-y-1.5">
                                            {filteredNpcs.map(n => {
                                                const mapToken = (tokens || []).find(t => String(t.characterId) === String(n.id));
                                                const isAlreadyInCombat = combatants.some(c => c.characterId === n.id || (mapToken && c.tokenId === mapToken.id));
                                                const typeLabel = formatType(n.type);
                                                
                                                return (
                                                    <div 
                                                        key={`npc-${n.id}`}
                                                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                                            isAlreadyInCombat 
                                                                ? 'bg-slate-900/40 border-slate-800/60 opacity-60' 
                                                                : 'bg-slate-900/90 border-slate-800 hover:border-rose-500/60 cursor-pointer group shadow-sm'
                                                        }`}
                                                        onClick={() => !isAlreadyInCombat && handleAddActorToCombat(n, true)}
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden shrink-0">
                                                            {n.image ? (
                                                                <img src={n.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={n.name} />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-xs">
                                                                    {n.name?.[0] || '?'}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-white text-sm truncate flex items-center gap-2">
                                                                <span>{n.name}</span>
                                                                {mapToken && (
                                                                    <span className="text-[9px] bg-amber-950/80 text-amber-400 border border-amber-800/60 px-1.5 py-0.2 rounded font-normal">
                                                                        On Map
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                                                <span>{typeLabel}</span>
                                                                {n.cr && <span>• CR {n.cr}</span>}
                                                            </div>
                                                        </div>
                                                        {isAlreadyInCombat ? (
                                                            <span className="text-xs text-slate-500 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 font-bold">
                                                                In Combat
                                                            </span>
                                                        ) : (
                                                            <button className="px-3 py-1.5 bg-rose-600 group-hover:bg-rose-500 text-white text-xs font-black rounded-lg shadow flex items-center gap-1 transition-colors">
                                                                <Icon name="plus" size={13} /> Add
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {filteredMapTokens.length === 0 && filteredPlayers.length === 0 && filteredNpcs.length === 0 && (
                                    <div className="text-center p-8 text-slate-500 text-sm">
                                        <Icon name="search" size={28} className="mx-auto text-slate-600 mb-2 opacity-50" />
                                        No characters or tokens found matching "{addModalSearch}".
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                );
            })()}
        </div>
    );
};