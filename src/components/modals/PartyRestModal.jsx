import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import {
    calculateConMod,
    getCharacterHitDie,
    getCharacterHp,
    isPreparedCaster,
    getMaxPreparedSpells,
    applyShortRestToCharacter,
    applyLongRestToCharacter
} from '../../utils/restUtils';

const PartyRestModal = ({
    isOpen,
    restType = 'short', // 'short' | 'long'
    role = 'player',    // 'dm' | 'player'
    currentUser,
    players = [],
    activeRest,
    onClose,
    onApplyRest,        // (updatedPlayers, summaryMsg) => void
    onSaveHero,         // (updatedHero, summaryMsg) => void
    onDiceRoll          // (formula, options) => Promise<{ total, natural, rolls, mod }>
}) => {
    if (!isOpen) return null;

    const isDm = role === 'dm';

    // Identify user's owned character(s)
    const myOwnedCharacters = useMemo(() => {
        if (!currentUser?.uid) return [];
        return players.filter(p => String(p.ownerId) === String(currentUser.uid));
    }, [players, currentUser]);

    // Active selected hero (default to player's character, or first party member for DM)
    const [selectedHeroId, setSelectedHeroId] = useState(() => {
        if (!isDm && myOwnedCharacters.length > 0) {
            return String(myOwnedCharacters[0].id);
        }
        return players.length > 0 ? String(players[0]?.id) : null;
    });

    // View tab for DM: 'overview' | 'hero'
    const [dmTab, setDmTab] = useState(isDm ? 'overview' : 'hero');

    // Staged modifications per hero during rest:
    // { [heroId]: { hpGained: number, hitDiceSpent: number, manualHpInput: string, preparedSpells: Set<string>, completed: boolean } }
    const [stagedState, setStagedState] = useState(() => {
        const initial = {};
        players.forEach(p => {
            const id = String(p.id);
            const hitDie = getCharacterHitDie(p);
            const prepSpells = new Set(
                (p.spells || [])
                    .filter(s => s.level > 0 && (s.prepared || s.isPrepared))
                    .map(s => s.name)
            );
            
            // Check if activeRest recorded completion for this hero
            const isCompleted = !!activeRest?.restedHeroIds?.[id];

            initial[id] = {
                hpGained: activeRest?.restedHeroIds?.[id]?.hpGained || 0,
                hitDiceSpent: activeRest?.restedHeroIds?.[id]?.hitDiceSpent || 0,
                manualHpInput: '',
                preparedSpells: prepSpells,
                completed: isCompleted,
                isRolling: false,
                lastRollMessage: ''
            };
        });
        return initial;
    });

    const activeHero = useMemo(() => {
        return players.find(p => String(p.id) === String(selectedHeroId)) || players[0] || null;
    }, [players, selectedHeroId]);

    const activeHeroStaged = stagedState[String(activeHero?.id)] || {
        hpGained: 0,
        hitDiceSpent: 0,
        manualHpInput: '',
        preparedSpells: new Set(),
        completed: false,
        isRolling: false,
        lastRollMessage: ''
    };

    // Calculate live preview HP for active hero
    const activeHeroHp = useMemo(() => {
        if (!activeHero) return { current: 10, max: 10, temp: 0 };
        const base = getCharacterHp(activeHero);
        if (restType === 'long') {
            return { current: base.max, max: base.max, temp: 0 };
        }
        return {
            current: Math.min(base.max, base.current + (activeHeroStaged.hpGained || 0)),
            max: base.max,
            temp: base.temp
        };
    }, [activeHero, restType, activeHeroStaged.hpGained]);

    // Calculate live preview Hit Dice for active hero
    const activeHeroHitDie = useMemo(() => {
        if (!activeHero) return { die: 'd8', current: 0, max: 1 };
        const base = getCharacterHitDie(activeHero);
        if (restType === 'long') {
            const regained = Math.max(1, Math.floor(base.max / 2));
            return {
                die: base.die,
                current: Math.min(base.max, base.current + regained),
                max: base.max
            };
        }
        return {
            die: base.die,
            current: Math.max(0, base.current - (activeHeroStaged.hitDiceSpent || 0)),
            max: base.max
        };
    }, [activeHero, restType, activeHeroStaged.hitDiceSpent]);

    // Handle digital hit die roll (for Short Rest)
    const handleRollHitDie = async () => {
        if (!activeHero || activeHeroHitDie.current <= 0) return;
        const heroId = String(activeHero.id);
        const conMod = calculateConMod(activeHero);
        const conModStr = conMod >= 0 ? `+${conMod}` : `${conMod}`;
        const formula = `1${activeHeroHitDie.die}${conModStr}`;

        setStagedState(prev => ({
            ...prev,
            [heroId]: { ...prev[heroId], isRolling: true }
        }));

        let rolledTotal = 0;
        try {
            if (onDiceRoll) {
                const res = await onDiceRoll(formula, {
                    characterName: activeHero.name,
                    alias: `Short Rest Hit Die (${formula})`,
                    actionType: 'use'
                });
                rolledTotal = res?.total !== undefined ? res.total : 0;
            } else {
                // Internal RNG fallback
                const dieSides = parseInt(activeHeroHitDie.die.replace(/\D/g, ''), 10) || 8;
                const natural = Math.floor(Math.random() * dieSides) + 1;
                rolledTotal = Math.max(1, natural + conMod);
            }
        } catch (e) {
            console.error("Dice roll failed during rest:", e);
            const dieSides = parseInt(activeHeroHitDie.die.replace(/\D/g, ''), 10) || 8;
            rolledTotal = Math.max(1, Math.floor(dieSides / 2) + conMod);
        }

        const healAmount = Math.max(1, rolledTotal);
        const hp = getCharacterHp(activeHero);
        const maxGainable = hp.max - (hp.current + activeHeroStaged.hpGained);
        const actualGain = Math.min(healAmount, Math.max(0, maxGainable));

        setStagedState(prev => {
            const current = prev[heroId];
            return {
                ...prev,
                [heroId]: {
                    ...current,
                    hpGained: current.hpGained + actualGain,
                    hitDiceSpent: current.hitDiceSpent + 1,
                    isRolling: false,
                    lastRollMessage: `Rolled ${rolledTotal} (${formula}) → Healed +${actualGain} HP`
                }
            };
        });
    };

    // Handle manual physical dice entry
    const handleAddManualHp = () => {
        const val = parseInt(activeHeroStaged.manualHpInput, 10);
        if (isNaN(val) || val <= 0) return;
        const heroId = String(activeHero.id);
        const hp = getCharacterHp(activeHero);
        const maxGainable = hp.max - (hp.current + activeHeroStaged.hpGained);
        const actualGain = Math.min(val, Math.max(0, maxGainable));

        setStagedState(prev => {
            const current = prev[heroId];
            return {
                ...prev,
                [heroId]: {
                    ...current,
                    hpGained: current.hpGained + actualGain,
                    hitDiceSpent: current.hitDiceSpent + 1,
                    manualHpInput: '',
                    lastRollMessage: `Manually added +${actualGain} HP (1 Hit Die spent)`
                }
            };
        });
    };

    // Toggle prepared spell during Long Rest
    const handleTogglePreparedSpell = (spellName) => {
        const heroId = String(activeHero.id);
        setStagedState(prev => {
            const current = prev[heroId];
            const nextSet = new Set(current.preparedSpells);
            if (nextSet.has(spellName)) {
                nextSet.delete(spellName);
            } else {
                nextSet.add(spellName);
            }
            return {
                ...prev,
                [heroId]: { ...current, preparedSpells: nextSet }
            };
        });
    };

    // Player or DM clicks "Finish Rest For This Hero"
    const handleCompleteHeroRest = (heroToRest = activeHero) => {
        if (!heroToRest) return;
        const heroId = String(heroToRest.id);
        const staged = stagedState[heroId] || {};

        let updatedHero;
        let summaryMsg = '';

        if (restType === 'short') {
            updatedHero = applyShortRestToCharacter(heroToRest, {
                hpGained: staged.hpGained || 0,
                hitDiceSpent: staged.hitDiceSpent || 0
            });
            summaryMsg = `${heroToRest.name} completed a Short Rest (Healed +${staged.hpGained || 0} HP, spent ${staged.hitDiceSpent || 0} Hit Dice).`;
        } else {
            updatedHero = applyLongRestToCharacter(heroToRest, {
                preparedSpellNames: Array.from(staged.preparedSpells || [])
            });
            summaryMsg = `${heroToRest.name} completed a Long Rest (Fully restored HP, regained Hit Dice & spell slots).`;
        }

        setStagedState(prev => ({
            ...prev,
            [heroId]: { ...prev[heroId], completed: true }
        }));

        if (onSaveHero) {
            onSaveHero(updatedHero, summaryMsg);
        }
    };

    // DM clicks "Auto-Rest for Hero"
    const handleDmAutoRestHero = (hero) => {
        if (!hero) return;
        const heroId = String(hero.id);
        const hp = getCharacterHp(hero);
        const hitDie = getCharacterHitDie(hero);

        if (restType === 'short') {
            // Auto-heal half missing HP or spend 1 die
            const missingHp = hp.max - hp.current;
            const conMod = calculateConMod(hero);
            const dieSides = parseInt(hitDie.die.replace(/\D/g, ''), 10) || 8;
            const avgRoll = Math.max(1, Math.floor(dieSides / 2) + 1 + conMod);
            const diceToSpend = hitDie.current > 0 ? (missingHp > 0 ? 1 : 0) : 0;
            const hpGained = diceToSpend > 0 ? Math.min(missingHp, avgRoll) : 0;

            const updatedHero = applyShortRestToCharacter(hero, {
                hpGained,
                hitDiceSpent: diceToSpend
            });

            setStagedState(prev => ({
                ...prev,
                [heroId]: {
                    ...prev[heroId],
                    hpGained,
                    hitDiceSpent: diceToSpend,
                    completed: true
                }
            }));

            if (onSaveHero) {
                onSaveHero(updatedHero, `${hero.name} auto-completed a Short Rest (+${hpGained} HP).`);
            }
        } else {
            const updatedHero = applyLongRestToCharacter(hero);
            setStagedState(prev => ({
                ...prev,
                [heroId]: { ...prev[heroId], completed: true }
            }));

            if (onSaveHero) {
                onSaveHero(updatedHero, `${hero.name} auto-completed a Long Rest (Full HP & slots).`);
            }
        }
    };

    // DM clicks "Auto-Rest All Remaining Heroes"
    const handleDmAutoRestAllRemaining = () => {
        players.forEach(p => {
            const id = String(p.id);
            if (!stagedState[id]?.completed) {
                handleDmAutoRestHero(p);
            }
        });
    };

    // DM concludes the party rest
    const handleConcludePartyRest = () => {
        // Collect updated heroes
        const updatedList = players.map(p => {
            const id = String(p.id);
            const staged = stagedState[id] || {};
            if (restType === 'short') {
                return applyShortRestToCharacter(p, {
                    hpGained: staged.hpGained || 0,
                    hitDiceSpent: staged.hitDiceSpent || 0
                });
            } else {
                return applyLongRestToCharacter(p, {
                    preparedSpellNames: Array.from(staged.preparedSpells || [])
                });
            }
        });

        const summary = restType === 'short'
            ? `The party finished a Short Rest. Hit dice spent, short-rest abilities & pact slots recharged.`
            : `The party completed a Long Rest! All heroes awakened fully restored to 100% HP with refreshed spell slots.`;

        if (onApplyRest) {
            onApplyRest(updatedList, summary);
        }
        onClose();
    };

    // Count how many heroes are rested vs pending
    const restedCount = players.filter(p => stagedState[String(p.id)]?.completed).length;
    const isAllRested = players.length > 0 && restedCount === players.length;

    // Theme tokens
    const isShort = restType === 'short';
    const themeGradient = isShort 
        ? 'from-amber-950/70 via-slate-900 to-orange-950/70'
        : 'from-indigo-950/70 via-slate-900 to-purple-950/70';
    const themeBorder = isShort ? 'border-amber-500/30' : 'border-indigo-500/30';
    const themeGlow = isShort ? 'bg-amber-500/10' : 'bg-indigo-500/10';
    const themeIconColor = isShort ? 'text-amber-400' : 'text-indigo-400';
    const themeBtnGradient = isShort
        ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950'
        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white';

    const modalContent = (
        <div className="fixed inset-0 z-[10000] bg-black/85 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className={`max-w-4xl w-full bg-slate-900/95 border ${themeBorder} rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[92vh] backdrop-blur-xl`}>
                
                {/* Header Bar */}
                <div className={`p-4 sm:p-5 border-b ${themeBorder} bg-gradient-to-r ${themeGradient} flex items-center justify-between relative overflow-hidden shrink-0`}>
                    <div className={`absolute -top-12 -left-12 w-36 h-36 ${themeGlow} rounded-full blur-3xl pointer-events-none`} />
                    
                    <div className="flex items-center gap-3.5 relative z-10">
                        <div className={`w-11 h-11 rounded-xl bg-slate-950/60 border ${themeBorder} flex items-center justify-center ${themeIconColor} shadow-inner`}>
                            <Icon name={isShort ? "coffee" : "moon"} size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg sm:text-xl font-black text-white fantasy-font tracking-wide">
                                    {isShort ? "Campfire Respite: Short Rest (1 Hour)" : "Sanctuary of the Night: Long Rest (8 Hours)"}
                                </h2>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                    isShort ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                }`}>
                                    {isDm ? "DM View" : "Player View"}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {isShort 
                                    ? "Catch your breath, roll Hit Dice to recover HP, and recharge short-rest abilities."
                                    : "Full 8 hours of sleep: restores 100% HP, spell slots, half Hit Dice, and allows spell preparation."}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 relative z-10">
                        {isDm && (
                            <div className="flex bg-slate-950/80 rounded-xl p-1 border border-slate-800">
                                <button
                                    onClick={() => setDmTab('overview')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        dmTab === 'overview' 
                                            ? 'bg-amber-600 text-slate-950 shadow-md' 
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Party Roster ({restedCount}/{players.length})
                                </button>
                                <button
                                    onClick={() => setDmTab('hero')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        dmTab === 'hero' 
                                            ? 'bg-amber-600 text-slate-950 shadow-md' 
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Hero Detail
                                </button>
                            </div>
                        )}
                        <button 
                            onClick={onClose} 
                            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800/80 transition-colors"
                            title="Close"
                        >
                            <Icon name="x" size={20} />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scroll p-4 sm:p-6 space-y-6">

                    {/* VIEW 1: DM PARTY ROSTER OVERVIEW */}
                    {isDm && dmTab === 'overview' ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                                <div>
                                    <div className="text-xs font-bold text-slate-300">Party Rest Status</div>
                                    <div className="text-[11px] text-slate-400">
                                        Players can roll their own dice and confirm on their screens. You can auto-rest any character below.
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleDmAutoRestAllRemaining}
                                        disabled={isAllRested}
                                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                                    >
                                        <Icon name="sparkles" size={13} className="text-amber-400" />
                                        Auto-Rest All Remaining
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {players.map(p => {
                                    const id = String(p.id);
                                    const staged = stagedState[id] || {};
                                    const hp = getCharacterHp(p);
                                    const hitDie = getCharacterHitDie(p);
                                    const isDone = staged.completed;

                                    return (
                                        <div 
                                            key={id} 
                                            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                                                isDone 
                                                    ? 'bg-slate-950/80 border-emerald-500/40 shadow-[inset_0_0_15px_rgba(16,185,129,0.08)]' 
                                                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden relative shrink-0">
                                                    {p.image ? (
                                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                                                            <Icon name="user" size={20} />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="font-bold text-white text-sm truncate">{p.name}</h4>
                                                        {isDone ? (
                                                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/40 flex items-center gap-1">
                                                                <Icon name="check" size={10} className="stroke-[3]" /> Rested
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1">
                                                                <Icon name="clock" size={10} /> Pending
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 truncate">
                                                        {p.race || 'Hero'} {p.class || 'Adventurer'} (Lv {p.level || 1})
                                                    </div>
                                                    <div className="text-xs text-slate-300 font-mono mt-1 flex items-center gap-2">
                                                        <span>HP: {hp.current}/{hp.max}</span>
                                                        <span>•</span>
                                                        <span>Hit Dice: {hitDie.current}/{hitDie.max} {hitDie.die}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { setSelectedHeroId(id); setDmTab('hero'); }}
                                                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                                                >
                                                    <Icon name="sliders" size={12} /> Inspect / Roll
                                                </button>

                                                {!isDone ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDmAutoRestHero(p)}
                                                        className="px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-xs font-semibold rounded-lg border border-amber-500/40 transition-colors flex items-center gap-1"
                                                    >
                                                        <Icon name="check" size={12} /> Auto-Rest
                                                    </button>
                                                ) : (
                                                    <span className="text-[11px] text-emerald-400 italic">
                                                        {isShort 
                                                            ? (staged.hpGained > 0 ? `+${staged.hpGained} HP recovered` : 'Rested') 
                                                            : 'Fully Restored'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (

                        /* VIEW 2: PLAYER / HERO DETAIL REST TASK */
                        <div className="space-y-6">
                            {/* Hero Selector (if multiple available) */}
                            {players.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto custom-scroll pb-1">
                                    {players.map(p => {
                                        const id = String(p.id);
                                        const isSelected = id === String(activeHero?.id);
                                        const isDone = stagedState[id]?.completed;
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setSelectedHeroId(id)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 border ${
                                                    isSelected
                                                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-md'
                                                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                <span>{p.name}</span>
                                                {isDone && <Icon name="check" size={12} className="text-emerald-400 stroke-[3]" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {activeHero && (
                                <div className="space-y-5">
                                    {/* Hero Banner Card */}
                                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 shadow-lg">
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden relative shrink-0 shadow-inner">
                                            {activeHero.image ? (
                                                <img src={activeHero.image} alt={activeHero.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-500">
                                                    <Icon name="user" size={32} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 w-full text-center sm:text-left">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                <div>
                                                    <h3 className="text-lg font-black text-white fantasy-font tracking-wide">
                                                        {activeHero.name}
                                                    </h3>
                                                    <p className="text-xs text-slate-400">
                                                        {activeHero.race || 'Hero'} {activeHero.class || 'Adventurer'} (Level {activeHero.level || 1})
                                                    </p>
                                                </div>
                                                <div className="flex items-center justify-center sm:justify-end gap-2 mt-1 sm:mt-0 font-mono text-xs">
                                                    <span className="px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-800 text-slate-300">
                                                        CON: {calculateConMod(activeHero) >= 0 ? `+${calculateConMod(activeHero)}` : calculateConMod(activeHero)}
                                                    </span>
                                                    <span className="px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-800 text-amber-300">
                                                        Hit Die: {activeHeroHitDie.die}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Live Health Progress Bar */}
                                            <div className="mt-3">
                                                <div className="flex justify-between text-xs mb-1 font-mono">
                                                    <span className="text-slate-400">Health Points</span>
                                                    <span className="text-white font-bold">
                                                        {activeHeroHp.current} / {activeHeroHp.max} HP
                                                        {activeHeroStaged.hpGained > 0 && isShort && (
                                                            <span className="text-emerald-400 ml-1.5 font-bold">
                                                                (+{activeHeroStaged.hpGained} recovered)
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative shadow-inner">
                                                    <div 
                                                        className={`h-full transition-all duration-500 rounded-full ${
                                                            isShort 
                                                                ? 'bg-gradient-to-r from-amber-600 to-emerald-500' 
                                                                : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                                                        }`}
                                                        style={{ width: `${Math.min(100, Math.round((activeHeroHp.current / activeHeroHp.max) * 100))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SHORT REST INTERACTIVE HIT DICE ROLLING */}
                                    {isShort && (
                                        <div className="bg-slate-950/60 border border-amber-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                                                <div>
                                                    <h4 className="font-bold text-amber-300 text-sm flex items-center gap-2">
                                                        <Icon name="sparkles" size={16} className="text-amber-400" />
                                                        Hit Dice Recovery
                                                    </h4>
                                                    <p className="text-xs text-slate-400">
                                                        Spend hit dice to heal. Roll digitally in-app or enter physical rolls.
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
                                                        {activeHeroHitDie.current} / {activeHeroHitDie.max} {activeHeroHitDie.die} Remaining
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Controls */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {/* In-App Roll */}
                                                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                                                    <div>
                                                        <div className="text-xs font-bold text-white flex items-center gap-1.5 mb-1">
                                                            <Icon name="dices" size={14} className="text-amber-400" />
                                                            Roll In App
                                                        </div>
                                                        <div className="text-[11px] text-slate-400 leading-relaxed">
                                                            Rolls 1{activeHeroHitDie.die} + CON mod ({calculateConMod(activeHero) >= 0 ? `+${calculateConMod(activeHero)}` : calculateConMod(activeHero)}) with dice tray & sounds.
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleRollHitDie}
                                                        disabled={activeHeroHitDie.current <= 0 || activeHeroHp.current >= activeHeroHp.max || activeHeroStaged.isRolling}
                                                        className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                                    >
                                                        {activeHeroStaged.isRolling ? (
                                                            <Icon name="loader-2" size={14} className="animate-spin" />
                                                        ) : (
                                                            <Icon name="coffee" size={14} />
                                                        )}
                                                        <span>
                                                            {activeHeroHitDie.current <= 0 
                                                                ? "No Hit Dice Left" 
                                                                : activeHeroHp.current >= activeHeroHp.max 
                                                                    ? "HP Already Full" 
                                                                    : `Roll 1${activeHeroHitDie.die} (${calculateConMod(activeHero) >= 0 ? `+${calculateConMod(activeHero)}` : calculateConMod(activeHero)})`}
                                                        </span>
                                                    </button>
                                                </div>

                                                {/* Manual Physical Roll Input */}
                                                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                                                    <div>
                                                        <div className="text-xs font-bold text-white flex items-center gap-1.5 mb-1">
                                                            <Icon name="pencil" size={14} className="text-amber-400" />
                                                            Manual Physical Dice
                                                        </div>
                                                        <div className="text-[11px] text-slate-400 leading-relaxed">
                                                            Rolled real dice at your table? Enter your total healed HP here.
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            placeholder="Healed HP (e.g. 9)"
                                                            value={activeHeroStaged.manualHpInput}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setStagedState(prev => ({
                                                                    ...prev,
                                                                    [String(activeHero.id)]: { ...prev[String(activeHero.id)], manualHpInput: val }
                                                                }));
                                                            }}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleAddManualHp()}
                                                            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={handleAddManualHp}
                                                            disabled={!activeHeroStaged.manualHpInput || activeHeroHitDie.current <= 0}
                                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-colors disabled:opacity-40"
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Last Roll Log */}
                                            {activeHeroStaged.lastRollMessage && (
                                                <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2">
                                                    <Icon name="check" size={14} className="text-emerald-400" />
                                                    <span>{activeHeroStaged.lastRollMessage}</span>
                                                </div>
                                            )}

                                            {/* Short Rest Feature Recovery Preview */}
                                            <div className="pt-2 border-t border-slate-800/80">
                                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                    Recharged On Short Rest:
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-amber-300">
                                                        ✓ Warlock Pact Magic Slots
                                                    </span>
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-amber-300">
                                                        ✓ Action Surge & Second Wind
                                                    </span>
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-amber-300">
                                                        ✓ Monk Ki Points & Wild Shape
                                                    </span>
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-amber-300">
                                                        ✓ Channel Divinity & Short Rest Feats
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* LONG REST PREPARATION & RESTORATION PREVIEW */}
                                    {!isShort && (
                                        <div className="space-y-4">
                                            {/* Automatic Long Rest Perks */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                                <div className="bg-slate-950/80 border border-indigo-500/20 rounded-xl p-3 text-center">
                                                    <Icon name="heart" size={18} className="text-emerald-400 mx-auto mb-1" />
                                                    <div className="text-xs font-bold text-white">Full Health</div>
                                                    <div className="text-[10px] text-slate-400">100% HP Restored</div>
                                                </div>
                                                <div className="bg-slate-950/80 border border-indigo-500/20 rounded-xl p-3 text-center">
                                                    <Icon name="sparkles" size={18} className="text-indigo-400 mx-auto mb-1" />
                                                    <div className="text-xs font-bold text-white">All Spell Slots</div>
                                                    <div className="text-[10px] text-slate-400">Levels 1-9 & Pact</div>
                                                </div>
                                                <div className="bg-slate-950/80 border border-indigo-500/20 rounded-xl p-3 text-center">
                                                    <Icon name="dices" size={18} className="text-amber-400 mx-auto mb-1" />
                                                    <div className="text-xs font-bold text-white">Hit Dice Regained</div>
                                                    <div className="text-[10px] text-slate-400">Half Total ({Math.max(1, Math.floor(activeHeroHitDie.max / 2))} dice)</div>
                                                </div>
                                                <div className="bg-slate-950/80 border border-indigo-500/20 rounded-xl p-3 text-center">
                                                    <Icon name="shield" size={18} className="text-purple-400 mx-auto mb-1" />
                                                    <div className="text-xs font-bold text-white">Abilities & Feats</div>
                                                    <div className="text-[10px] text-slate-400">Exhaustion -1 Level</div>
                                                </div>
                                            </div>

                                            {/* Spell Preparation Studio */}
                                            {Array.isArray(activeHero.spells) && activeHero.spells.length > 0 && (
                                                <div className="bg-slate-950/60 border border-indigo-500/20 rounded-2xl p-4 sm:p-5 space-y-3">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-2.5">
                                                        <div>
                                                            <h4 className="font-bold text-indigo-300 text-sm flex items-center gap-2">
                                                                <Icon name="book-open" size={16} className="text-indigo-400" />
                                                                Spell Preparation Studio
                                                            </h4>
                                                            <p className="text-xs text-slate-400">
                                                                Select the spells you wish to memorize and prepare for the day ahead.
                                                            </p>
                                                        </div>
                                                        <div className="text-xs font-mono font-bold text-indigo-300 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                                                            Prepared: {activeHeroStaged.preparedSpells.size} 
                                                            {isPreparedCaster(activeHero) && ` / ${getMaxPreparedSpells(activeHero)} max`}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scroll pr-1">
                                                        {activeHero.spells
                                                            .filter(s => s.level > 0)
                                                            .map(spell => {
                                                                const isPrepared = activeHeroStaged.preparedSpells.has(spell.name);
                                                                return (
                                                                    <div
                                                                        key={spell.name}
                                                                        onClick={() => handleTogglePreparedSpell(spell.name)}
                                                                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between select-none ${
                                                                            isPrepared
                                                                                ? 'bg-indigo-950/60 border-indigo-500/50 text-white shadow-sm'
                                                                                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                                                        }`}
                                                                    >
                                                                        <div className="truncate pr-2">
                                                                            <span className="font-semibold">{spell.name}</span>
                                                                            <span className="text-[10px] text-slate-500 ml-1.5">Lv {spell.level}</span>
                                                                        </div>
                                                                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                                                            isPrepared ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 bg-slate-950'
                                                                        }`}>
                                                                            {isPrepared && <Icon name="check" size={10} className="stroke-[3]" />}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action Bar for This Hero */}
                                    <div className="pt-2 flex items-center justify-between">
                                        <div className="text-xs text-slate-400">
                                            {activeHeroStaged.completed ? (
                                                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                                                    <Icon name="check-circle" size={14} /> Hero rest completed!
                                                </span>
                                            ) : (
                                                <span>Click below when you are ready to apply your rest.</span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleCompleteHeroRest(activeHero)}
                                            className={`px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-lg transition-all flex items-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0 ${themeBtnGradient}`}
                                        >
                                            <Icon name="check" size={16} />
                                            <span>
                                                {isShort 
                                                    ? `Complete ${activeHero.name}'s Short Rest` 
                                                    : `Awaken & Take Long Rest`}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Bar */}
                <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                        <Icon name="users" size={14} className={themeIconColor} />
                        <span>
                            Party Rest: <strong>{restedCount} of {players.length}</strong> heroes rested
                        </span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors"
                        >
                            Cancel
                        </button>

                        {isDm && (
                            <button
                                type="button"
                                onClick={handleConcludePartyRest}
                                className={`px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-lg shadow-amber-950/30 transition-all flex items-center gap-2 ${themeBtnGradient}`}
                            >
                                <Icon name="flag" size={16} />
                                <span>Conclude Party Rest</span>
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );

    if (typeof document !== 'undefined') {
        return createPortal(modalContent, document.body);
    }
    return modalContent;
};

export default PartyRestModal;

