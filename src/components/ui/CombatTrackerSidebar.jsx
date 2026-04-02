import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { updateMap } from '../../utils/mapService';

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
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 bg-slate-900/90 backdrop-blur border border-slate-700 p-2 rounded-2xl shadow-2xl ${className}`}>

            <div className="flex items-center gap-2 overflow-hidden max-w-[60vw]">
                {displayOrder.map((c, i) => {
                    const t = tokens.find(t => t.id === c.tokenId);
                    const isActive = i === 0;
                    
                    return (
                        <div 
                            key={c.tokenId + i} 
                            className={`relative flex items-center gap-2 rounded-xl border p-1 transition-all ${isActive ? 'bg-slate-800 border-amber-500 scale-100 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-slate-800 border-slate-600 scale-90 opacity-80 hover:opacity-100'}`}
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
        <div className="flex items-center bg-slate-900 border border-slate-600 rounded overflow-hidden">
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

export const CombatTrackerSidebar = ({ combat, updateCampaign, tokens, role, campaignData, allCharacters, onOpenSheet, data, campaignCode, activeMapId, className = "", onClose }) => {
    const [showAddModal, setShowAddModal] = useState(false);

    // The initiative tracker is a DM-only tool. Players see the top ribbon instead.
    if (role !== 'dm') return null;
    const handleAddActorToCombat = (actor, isNpc) => {
        const currentCombat = combat || { active: false, round: 1, turn: 0, combatants: [] };
        const combatants = currentCombat.combatants || [];
        
        if (combatants.some(c => c.characterId === actor.id)) {
            alert(`${actor.name} is already in combat.`);
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
    const handleEnd = () => {
        if (window.confirm("End combat and clear initiative tracker?")) {
            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, active: false, combatants: [], turn: 0 } } });
            if (onClose) onClose();
        }
    };

    const editInit = (tokenId, currentInit) => {
        if (role !== 'dm') return;
        const newVal = window.prompt("Set new initiative:", currentInit);
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
        <div className={`absolute top-44 left-4 bottom-24 w-72 bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl rounded-xl z-[60] flex flex-col overflow-hidden transition-all ${className} ${combat.active ? 'border-amber-500/30' : 'border-slate-700'}`}>
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="sword" size={16}/> Initiative</h3>
                {role === 'dm' && (
                    <div className="flex gap-1">
                        <button onClick={() => setShowAddModal(true)} className="p-1.5 hover:bg-slate-600 rounded text-slate-400 hover:text-white" title="Add Combatant">
                            <Icon name="plus" size={14}/>
                        </button>
                        <button onClick={handlePrev} disabled={!combat.active} className="p-1.5 hover:bg-slate-600 rounded text-slate-400 hover:text-white disabled:text-slate-600 disabled:hover:bg-transparent" title="Previous Turn"><Icon name="chevron-left" size={14}/></button>
                        <button onClick={handleNext} disabled={!combat.active} className="p-1.5 hover:bg-slate-600 rounded text-slate-400 hover:text-white disabled:text-slate-600 disabled:hover:bg-transparent" title="Next Turn"><Icon name="chevron-right" size={14}/></button>
                        <button onClick={handleEnd} disabled={!combat.active} className="p-1.5 hover:bg-red-900/50 rounded text-red-500 hover:text-red-400 ml-1 disabled:text-slate-600 disabled:hover:bg-transparent" title="End Combat"><Icon name="trash-2" size={14}/></button>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-600 rounded text-slate-400 hover:text-white ml-1" title="Close Tracker"><Icon name="x" size={14}/></button>
                    </div>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
                {sortedCombatants.length > 0 ? sortedCombatants.map((c, i) => {
                    const t = tokens.find(tok => tok.id === c.tokenId);
                    const char = allCharacters.find(ch => String(ch.id) === String(t?.characterId || c.characterId || c.tokenId));
                    const isActive = combat.active && activeCombatant?.tokenId === c.tokenId;
                    
                    const isNpc = c.isNpc;
                    const hp = isNpc ? (t?.hp?.current ?? char?.hp?.current ?? '-') : (char?.hp?.current ?? '-');
                    const maxHp = isNpc ? (t?.hp?.max ?? char?.hp?.max ?? '-') : (char?.hp?.max ?? '-');
                    const ac = char?.ac ?? '-';
                    
                    const displayName = t?.name || char?.name || c.name;
                    const displayImage = t?.image || t?.img || char?.image;
                    const charIdForSheet = t?.characterId || char?.id;
                    
                    return (
                        <div key={c.tokenId} className={`relative flex flex-col rounded-lg border p-2 transition-all ${isActive ? 'bg-slate-800 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'bg-slate-800/50 border-slate-700'}`}>
                            <div className="flex items-center gap-3">
                                {/* Avatar (Click to open sheet) */}
                                <div 
                                    className="w-10 h-10 rounded bg-slate-900 border border-slate-600 shrink-0 overflow-hidden cursor-pointer hover:border-amber-400 transition-colors"
                                    onClick={() => {
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
                                            onClick={() => editInit(c.tokenId, c.initiative)}
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
        </div>
    );
};