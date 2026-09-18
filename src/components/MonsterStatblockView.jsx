import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import ResolvedImage from './ResolvedImage';

const SafeImage = ({ src, className, alt }) => {
    if (!src) return null;
    if (src.startsWith('chunked:')) {
        return <ResolvedImage id={src} className={className} alt={alt} />;
    }
    return <img src={src} className={className} alt={alt} draggable={false} referrerPolicy="no-referrer" />;
};

// Helper: Calculate Ability Modifier
const getModifier = (score) => {
    const num = Number(score) || 10;
    const mod = Math.floor((num - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
};

const getModifierValue = (score) => {
    const num = Number(score) || 10;
    return Math.floor((num - 10) / 2);
};

// Helper: CR to XP lookup
const CR_TO_XP = {
    "0": "10 XP",
    "1/8": "25 XP",
    "0.125": "25 XP",
    "1/4": "50 XP",
    "0.25": "50 XP",
    "1/2": "100 XP",
    "0.5": "100 XP",
    "1": "200 XP",
    "2": "450 XP",
    "3": "700 XP",
    "4": "1,100 XP",
    "5": "1,800 XP",
    "6": "2,300 XP",
    "7": "2,900 XP",
    "8": "3,900 XP",
    "9": "5,000 XP",
    "10": "5,900 XP",
    "11": "7,200 XP",
    "12": "8,400 XP",
    "13": "10,000 XP",
    "14": "11,500 XP",
    "15": "13,000 XP",
    "16": "15,000 XP",
    "17": "18,000 XP",
    "18": "20,000 XP",
    "19": "22,000 XP",
    "20": "25,000 XP",
    "21": "33,000 XP",
    "22": "41,000 XP",
    "23": "50,000 XP",
    "24": "62,000 XP",
    "30": "155,000 XP"
};

const getCrBadgeColor = (cr) => {
    const num = parseFloat(cr);
    if (isNaN(num) || num <= 2) return 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40';
    if (num <= 5) return 'bg-blue-950/90 text-blue-300 border-blue-500/40';
    if (num <= 10) return 'bg-amber-950/90 text-amber-300 border-amber-500/40';
    if (num <= 16) return 'bg-orange-950/90 text-orange-300 border-orange-500/40';
    return 'bg-purple-950/90 text-purple-300 border-purple-500/50';
};

export const MonsterStatblockView = ({
    npc,
    onOpenSheet,
    onDuplicate,
    onToggleFavorite,
    onDiceRoll,
    onLogAction,
    onHpChange,
    role = 'dm',
    liveHp = null,
    hideHeaderActions = false
}) => {
    const [rollFeedback, setRollFeedback] = useState(null);

    // Support live token HP if provided (safe fallbacks)
    const baseHpCurrent = liveHp?.current ?? npc?.hp?.current ?? npc?.hp?.max ?? 10;
    const baseHpMax = liveHp?.max ?? npc?.hp?.max ?? 10;
    const baseHpTemp = liveHp?.temp ?? npc?.hp?.temp ?? 0;

    const [currentHp, setCurrentHp] = useState(baseHpCurrent);
    const [maxHp, setMaxHp] = useState(baseHpMax);
    const [tempHp, setTempHp] = useState(baseHpTemp);
    const [deltaAmount, setDeltaAmount] = useState('');
    const [showHpAdjuster, setShowHpAdjuster] = useState(false);
    const [isEditingHp, setIsEditingHp] = useState(false);

    // Sync from props when external updates happen (e.g. tactical map damage or entity switch)
    useEffect(() => {
        if (!isEditingHp) {
            setCurrentHp(baseHpCurrent);
            setMaxHp(baseHpMax);
            setTempHp(baseHpTemp);
        }
    }, [baseHpCurrent, baseHpMax, baseHpTemp, isEditingHp]);

    if (!npc) return null;

    const stats = npc.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const ac = typeof npc.ac === 'object' ? npc.ac.value : (npc.ac || 10);

    const handleApplyHp = (newCurrent, newMax, newTemp, label = null) => {
        const parsedMax = Math.max(1, parseInt(newMax, 10) || 10);
        const parsedCurrent = Math.max(0, parseInt(newCurrent, 10) || 0);
        const parsedTemp = Math.max(0, parseInt(newTemp, 10) || 0);

        setCurrentHp(parsedCurrent);
        setMaxHp(parsedMax);
        setTempHp(parsedTemp);

        if (onHpChange) {
            onHpChange({ current: parsedCurrent, max: parsedMax, temp: parsedTemp });
        }

        if (label && onLogAction) {
            onLogAction(`${npc.name}: ${label} (HP: ${parsedCurrent}/${parsedMax}${parsedTemp > 0 ? ` +${parsedTemp} Temp` : ''})`);
        }
    };

    const handleDamage = (amount) => {
        const amt = parseInt(amount, 10);
        if (isNaN(amt) || amt <= 0) return;
        let rem = amt;
        let newTemp = tempHp;
        if (newTemp > 0) {
            if (rem <= newTemp) {
                newTemp -= rem;
                rem = 0;
            } else {
                rem -= newTemp;
                newTemp = 0;
            }
        }
        const newCurrent = Math.max(0, currentHp - rem);
        handleApplyHp(newCurrent, maxHp, newTemp, `took ${amt} damage`);
        setDeltaAmount('');
    };

    const handleHeal = (amount) => {
        const amt = parseInt(amount, 10);
        if (isNaN(amt) || amt <= 0) return;
        const newCurrent = Math.min(maxHp, currentHp + amt);
        handleApplyHp(newCurrent, maxHp, tempHp, `healed ${amt} HP`);
        setDeltaAmount('');
    };

    const handleSetTempHp = (amount) => {
        const amt = parseInt(amount, 10);
        if (isNaN(amt) || amt < 0) return;
        handleApplyHp(currentHp, maxHp, amt, `gained ${amt} Temp HP`);
        setDeltaAmount('');
    };

    const speed = npc.speed || "30 ft.";
    const cr = npc.level ?? npc.cr ?? (npc.classes ? `Level ${npc.level || 1}` : "1");
    const xp = CR_TO_XP[String(cr)] || `${cr}`;

    const handleRoll = async (formula, alias, isDamage = false) => {
        if (!onDiceRoll) return;
        try {
            let clean = String(formula).trim();
            if (!clean) return;
            if (!clean.includes('d') && !isDamage) {
                const mod = parseInt(clean) || 0;
                clean = `1d20${mod >= 0 ? '+' + mod : mod}`;
            }
            setRollFeedback(`Rolling ${alias}...`);
            setTimeout(() => setRollFeedback(null), 2500);

            const result = await onDiceRoll(clean, { 
                alias: `${npc.name}: ${alias}`, 
                chat: true, 
                actionType: isDamage ? 'damage' : 'check' 
            });

            if (onLogAction) {
                onLogAction(`${npc.name} rolled ${alias} (${clean})`);
            }
            return result;
        } catch (e) {
            console.error("Statblock roll error:", e);
        }
    };

    const handleAbilityRoll = (statKey, isSave = false) => {
        const modVal = getModifierValue(stats[statKey]);
        const profBonus = npc.profBonus || 2;
        const isProf = isSave && (npc.savingThrows?.[statKey] || npc.savingThrows?.[statKey.toLowerCase()]);
        const totalMod = isProf ? modVal + profBonus : modVal;
        const sign = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;
        const formula = `1d20${sign}`;
        const label = isSave ? `${statKey.toUpperCase()} Save` : `${statKey.toUpperCase()} Check`;
        handleRoll(formula, label);
    };

    // Actions Categorization
    const actions = (npc.customActions || []).filter(a => !a.type || a.type === 'Action');
    const bonusActions = (npc.customActions || []).filter(a => a.type === 'Bonus Action');
    const reactions = (npc.customActions || []).filter(a => a.type === 'Reaction');
    const legendaryActions = (npc.customActions || []).filter(a => a.type === 'Legendary Action');
    const traits = npc.features || [];
    const spells = npc.spells || [];

    // Also include equipped weapons from inventory if no custom actions
    const weaponAttacks = [];
    if (actions.length === 0 && Array.isArray(npc.inventory)) {
        npc.inventory.forEach(item => {
            if (item.combat && (item.equipped ?? true)) {
                weaponAttacks.push({
                    name: item.name,
                    desc: item.combat.notes || item.description || '',
                    hit: item.combat.hit ? `+${item.combat.hit}` : '',
                    dmg: item.combat.dmg || '',
                    type: item.combat.type || 'Action'
                });
            }
        });
    }
    const finalActions = [...actions, ...weaponAttacks];

    // Defenses
    const resistances = npc.defenses?.resistances;
    const immunities = npc.defenses?.immunities;
    const vulnerabilities = npc.defenses?.vulnerabilities;
    const conditionImmunities = npc.defenses?.conditionImmunities;

    // Senses
    const sensesList = [];
    if (npc.darkvision) sensesList.push(`Darkvision ${npc.darkvision} ft.`);
    if (npc.blindsight) sensesList.push(`Blindsight ${npc.blindsight} ft.`);
    if (npc.tremorsense) sensesList.push(`Tremorsense ${npc.tremorsense} ft.`);
    if (npc.truesight) sensesList.push(`Truesight ${npc.truesight} ft.`);
    sensesList.push(`Passive Perception ${npc.passivePerception || (10 + getModifierValue(stats.wis))}`);

    // Saves list
    const savesList = [];
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
        if (npc.savingThrows?.[k]) {
            const mod = getModifierValue(stats[k]) + (npc.profBonus || 2);
            savesList.push(`${k.toUpperCase()} ${mod >= 0 ? '+' + mod : mod}`);
        }
    });

    // Skills list
    const skillsList = [];
    if (npc.skills && typeof npc.skills === 'object') {
        Object.entries(npc.skills).forEach(([sName, isProf]) => {
            if (isProf) skillsList.push(sName);
        });
    }

    return (
        <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-5 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-200">
            {/* Creature Header */}
            <div className="flex items-start gap-4 pb-3 border-b-2 border-red-800/70">
                {(npc.image || npc.avatarUrl) && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-amber-500/40 shadow-lg shrink-0 bg-slate-800 relative">
                        <SafeImage src={npc.image || npc.avatarUrl} className="w-full h-full object-cover" alt={npc.name} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h1 className="text-2xl font-bold fantasy-font text-amber-400 leading-tight truncate">
                            {npc.name}
                        </h1>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border font-mono shrink-0 shadow-sm ${getCrBadgeColor(cr)}`}>
                            {String(cr).startsWith('Level') ? cr : `CR ${cr}`}
                        </span>
                    </div>
                    <p className="text-sm italic text-slate-300 mt-0.5">
                        {npc.race || 'Medium humanoid'} {npc.class ? `(${npc.class})` : ''}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs text-amber-500/80 font-mono">
                            {xp} • Prof. Bonus +{npc.profBonus || 2}
                        </p>
                        {rollFeedback && (
                            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded animate-pulse font-mono truncate">
                                {rollFeedback}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Vitals Ribbon (AC, HP, Speed) */}
            <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2.5 p-3 bg-slate-800/70 rounded-xl border border-slate-700/80 shadow-inner">
                    {/* AC */}
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                            <Icon name="shield" size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Armor Class</div>
                            <div className="text-base font-extrabold text-white font-mono">{ac}</div>
                        </div>
                    </div>

                    {/* Interactive HP Widget */}
                    <div className="flex items-center justify-between gap-1.5 px-2 py-1 bg-red-950/30 border border-red-900/40 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                                <Icon name="heart" size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] uppercase font-bold text-red-300 tracking-wider">Hit Points</span>
                                    {tempHp > 0 && (
                                        <span className="text-[9px] bg-blue-900/80 text-blue-200 px-1 rounded font-mono font-bold">
                                            +{tempHp}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        value={currentHp}
                                        onFocus={() => setIsEditingHp(true)}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            setCurrentHp(isNaN(val) ? 0 : val);
                                        }}
                                        onBlur={(e) => {
                                            setIsEditingHp(false);
                                            const val = parseInt(e.target.value, 10);
                                            handleApplyHp(isNaN(val) ? 0 : val, maxHp, tempHp);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') e.target.blur();
                                        }}
                                        className="w-12 bg-slate-950/90 border border-red-900/60 focus:border-red-400 rounded px-1 text-sm font-extrabold text-white font-mono text-center outline-none"
                                        title="Click to edit current HP directly"
                                    />
                                    <span className="text-xs text-slate-400 font-mono">/ {maxHp}</span>
                                </div>
                            </div>
                        </div>

                        {/* Quick Adjuster Toggle */}
                        <button
                            type="button"
                            onClick={() => setShowHpAdjuster(prev => !prev)}
                            className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                                showHpAdjuster 
                                    ? 'bg-red-600 text-white border-red-400 shadow-md' 
                                    : 'bg-slate-900/90 hover:bg-red-950/80 text-red-300 hover:text-white border-red-900/50'
                            }`}
                            title="Quick Damage & Healing"
                        >
                            <Icon name="plus-minus" size={13} />
                        </button>
                    </div>

                    {/* Speed */}
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                            <Icon name="zap" size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Speed</div>
                            <div className="text-xs font-bold text-white truncate" title={speed}>{speed}</div>
                        </div>
                    </div>
                </div>

                {/* Health Bar */}
                <div className="w-full bg-slate-950/80 rounded-full h-1.5 overflow-hidden border border-slate-800">
                    <div 
                        className={`h-full transition-all duration-300 ${
                            currentHp <= 0 ? 'bg-slate-700' :
                            currentHp / maxHp > 0.5 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                            currentHp / maxHp > 0.2 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                            'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, (currentHp / maxHp) * 100))}%` }}
                    />
                </div>

                {/* Quick Damage / Heal / Temp Adjustment Tray */}
                {showHpAdjuster && (
                    <div className="p-3 bg-slate-950/90 border border-red-900/50 rounded-xl space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200 shadow-xl">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-300 flex items-center gap-1.5">
                                <Icon name="heart" size={14} className="text-red-400" />
                                <span>Adjust Health:</span>
                                <strong className="text-amber-400 font-mono">{currentHp}</strong>
                                <span className="text-slate-500">/</span>
                                <span className="text-slate-400 font-mono">{maxHp}</span>
                            </span>
                            <span className="text-[10px] text-slate-500">
                                {currentHp <= 0 ? '💀 Defeated' : `${Math.round((currentHp / maxHp) * 100)}% remaining`}
                            </span>
                        </div>

                        {/* Quick +/- Increments */}
                        <div className="grid grid-cols-4 gap-1.5 font-mono text-xs font-bold">
                            <button
                                type="button"
                                onClick={() => handleDamage(5)}
                                className="py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 hover:text-white border border-red-800/60 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                                <Icon name="minus" size={12}/> 5 Dmg
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDamage(1)}
                                className="py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 hover:text-white border border-red-800/60 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                                <Icon name="minus" size={12}/> 1 Dmg
                            </button>
                            <button
                                type="button"
                                onClick={() => handleHeal(1)}
                                className="py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-white border border-emerald-800/60 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                                <Icon name="plus" size={12}/> 1 Heal
                            </button>
                            <button
                                type="button"
                                onClick={() => handleHeal(5)}
                                className="py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-white border border-emerald-800/60 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                                <Icon name="plus" size={12}/> 5 Heal
                            </button>
                        </div>

                        {/* Custom Amount Calculator */}
                        <div className="flex items-center gap-1.5">
                            <input
                                type="number"
                                placeholder="Amount (e.g. 12)..."
                                value={deltaAmount}
                                onChange={(e) => setDeltaAmount(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleDamage(deltaAmount);
                                }}
                                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-red-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => handleDamage(deltaAmount)}
                                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1"
                            >
                                <Icon name="shield-off" size={12}/> Damage
                            </button>
                            <button
                                type="button"
                                onClick={() => handleHeal(deltaAmount)}
                                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1"
                            >
                                <Icon name="heart" size={12}/> Heal
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetTempHp(deltaAmount)}
                                className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1"
                                title="Set Temporary HP"
                            >
                                <Icon name="shield" size={12}/> Temp
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 6 Ability Scores Bar (Interactive Click to Roll) */}
            <div>
                <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ability Scores</span>
                    <span className="text-[10px] text-amber-400/80 italic">Click score for Check • &quot;Save&quot; for Saving Throw</span>
                </div>
                <div className="grid grid-cols-6 gap-2">
                    {[
                        { key: 'str', label: 'STR' },
                        { key: 'dex', label: 'DEX' },
                        { key: 'con', label: 'CON' },
                        { key: 'int', label: 'INT' },
                        { key: 'wis', label: 'WIS' },
                        { key: 'cha', label: 'CHA' },
                    ].map(({ key, label }) => {
                        const score = stats[key] ?? 10;
                        const modStr = getModifier(score);
                        const isProfSave = npc.savingThrows?.[key];

                        return (
                            <div 
                                key={key} 
                                className="bg-slate-800/80 border border-slate-700 hover:border-amber-500/70 rounded-lg p-2 text-center transition-all group relative flex flex-col justify-between"
                            >
                                <div className="text-[11px] font-bold text-amber-400/90">{label}</div>
                                <button 
                                    type="button"
                                    onClick={() => handleAbilityRoll(key, false)}
                                    className="my-1 py-1 px-1 bg-slate-900/80 hover:bg-amber-600/30 rounded border border-slate-700/60 hover:border-amber-500/60 transition-colors"
                                    title={`Roll ${label} Check (${modStr})`}
                                >
                                    <div className="text-sm font-extrabold text-white font-mono">{modStr}</div>
                                    <div className="text-[10px] text-slate-400">{score}</div>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={() => handleAbilityRoll(key, true)}
                                    className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${
                                        isProfSave 
                                            ? 'bg-red-950/80 text-red-300 border border-red-700/50 hover:bg-red-900' 
                                            : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                    title={`Roll ${label} Saving Throw`}
                                >
                                    Save {isProfSave ? '★' : ''}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Defenses, Senses, Languages, Saves List */}
            <div className="space-y-1.5 text-xs border-y border-slate-800 py-3 text-slate-300 font-sans leading-relaxed">
                {savesList.length > 0 && (
                    <div>
                        <span className="font-bold text-white">Saving Throws: </span>
                        <span className="text-amber-300">{savesList.join(', ')}</span>
                    </div>
                )}
                {skillsList.length > 0 && (
                    <div>
                        <span className="font-bold text-white">Skills: </span>
                        <span className="text-slate-300">{skillsList.join(', ')}</span>
                    </div>
                )}
                {vulnerabilities && (
                    <div>
                        <span className="font-bold text-white">Damage Vulnerabilities: </span>
                        <span className="text-red-400">{vulnerabilities}</span>
                    </div>
                )}
                {resistances && (
                    <div>
                        <span className="font-bold text-white">Damage Resistances: </span>
                        <span className="text-blue-300">{resistances}</span>
                    </div>
                )}
                {immunities && (
                    <div>
                        <span className="font-bold text-white">Damage Immunities: </span>
                        <span className="text-purple-300">{immunities}</span>
                    </div>
                )}
                {conditionImmunities && (
                    <div>
                        <span className="font-bold text-white">Condition Immunities: </span>
                        <span className="text-purple-300">{conditionImmunities}</span>
                    </div>
                )}
                <div>
                    <span className="font-bold text-white">Senses: </span>
                    <span className="text-slate-400">{sensesList.join(', ')}</span>
                </div>
                <div>
                    <span className="font-bold text-white">Languages: </span>
                    <span className="text-slate-400">{npc.proficiencies?.languages || '—'}</span>
                </div>
            </div>

            {/* Traits & Features */}
            {traits.length > 0 && (
                <div className="space-y-2.5">
                    <h3 className="text-xs uppercase font-bold text-amber-500 tracking-wider flex items-center gap-1.5">
                        <Icon name="sparkles" size={14} /> Traits &amp; Special Abilities
                    </h3>
                    <div className="space-y-2">
                        {traits.map((trait, idx) => (
                            <div key={idx} className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800 text-xs">
                                <span className="font-bold text-white italic">{trait.name || trait.title}. </span>
                                <span className="text-slate-300">{trait.desc || trait.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            {finalActions.length > 0 && (
                <div className="space-y-3 pt-1">
                    <h3 className="text-sm font-bold fantasy-font text-red-400 tracking-wide border-b border-red-900/60 pb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Icon name="swords" size={16}/> Actions</span>
                        <span className="text-[10px] font-sans font-normal text-slate-400">Click hit/damage to roll</span>
                    </h3>
                    <div className="space-y-2.5">
                        {finalActions.map((action, idx) => (
                            <div key={idx} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/70 hover:border-red-900/80 transition-colors">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <span className="font-bold text-white text-sm italic">{action.name}</span>
                                    
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {action.hit && (
                                            <button
                                                type="button"
                                                onClick={() => handleRoll(action.hit, `${action.name} Attack`)}
                                                className="px-2 py-0.5 bg-red-900/60 hover:bg-red-700 text-white font-mono font-bold text-xs rounded border border-red-500/40 transition-colors flex items-center gap-1 shadow-sm"
                                                title={`Roll Attack (${action.hit})`}
                                            >
                                                <Icon name="dices" size={12}/> {action.hit}
                                            </button>
                                        )}
                                        {action.dmg && (
                                            <button
                                                type="button"
                                                onClick={() => handleRoll(action.dmg, `${action.name} Damage`, true)}
                                                className="px-2 py-0.5 bg-orange-900/60 hover:bg-orange-700 text-orange-200 font-mono font-bold text-xs rounded border border-orange-500/40 transition-colors flex items-center gap-1 shadow-sm"
                                                title={`Roll Damage (${action.dmg})`}
                                            >
                                                <Icon name="flame" size={12}/> {action.dmg}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                                    {action.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Bonus Actions */}
            {bonusActions.length > 0 && (
                <div className="space-y-2.5 pt-2">
                    <h3 className="text-sm font-bold fantasy-font text-amber-400 tracking-wide border-b border-amber-900/60 pb-1 flex items-center gap-1.5">
                        <Icon name="zap" size={16}/> Bonus Actions
                    </h3>
                    <div className="space-y-2">
                        {bonusActions.map((action, idx) => (
                            <div key={idx} className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/60 text-xs">
                                <div className="flex justify-between items-start gap-2 mb-1">
                                    <span className="font-bold text-white italic">{action.name}</span>
                                    {action.hit && (
                                        <button
                                            type="button"
                                            onClick={() => handleRoll(action.hit, `${action.name} Roll`)}
                                            className="px-2 py-0.5 bg-amber-900/60 hover:bg-amber-700 text-white font-mono font-bold text-xs rounded border border-amber-500/40"
                                        >
                                            {action.hit}
                                        </button>
                                    )}
                                </div>
                                <span className="text-slate-300">{action.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Reactions */}
            {reactions.length > 0 && (
                <div className="space-y-2.5 pt-2">
                    <h3 className="text-sm font-bold fantasy-font text-indigo-400 tracking-wide border-b border-indigo-900/60 pb-1 flex items-center gap-1.5">
                        <Icon name="shield" size={16}/> Reactions
                    </h3>
                    <div className="space-y-2">
                        {reactions.map((action, idx) => (
                            <div key={idx} className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/60 text-xs">
                                <span className="font-bold text-white italic">{action.name}. </span>
                                <span className="text-slate-300">{action.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Legendary Actions */}
            {legendaryActions.length > 0 && (
                <div className="space-y-2.5 pt-2">
                    <h3 className="text-sm font-bold fantasy-font text-purple-400 tracking-wide border-b border-purple-900/60 pb-1 flex items-center gap-1.5">
                        <Icon name="crown" size={16}/> Legendary Actions
                    </h3>
                    <p className="text-[11px] text-slate-400 italic">
                        The creature can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature&apos;s turn.
                    </p>
                    <div className="space-y-2">
                        {legendaryActions.map((action, idx) => (
                            <div key={idx} className="bg-purple-950/20 p-2.5 rounded-lg border border-purple-900/40 text-xs">
                                <span className="font-bold text-purple-200 italic">{action.name}. </span>
                                <span className="text-slate-300">{action.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Spells */}
            {spells.length > 0 && (
                <div className="space-y-2.5 pt-2">
                    <h3 className="text-sm font-bold fantasy-font text-cyan-400 tracking-wide border-b border-cyan-900/60 pb-1 flex items-center gap-1.5">
                        <Icon name="sparkles" size={16}/> Spells &amp; Spellcasting
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {spells.map((spell, idx) => (
                            <div key={idx} className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/60 text-xs flex justify-between items-center group">
                                <div>
                                    <div className="font-bold text-white group-hover:text-cyan-300 transition-colors">
                                        {spell.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                        {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} {spell.time ? `• ${spell.time}` : ''}
                                    </div>
                                </div>
                                {(spell.hit || spell.dmg) && (
                                    <button
                                        type="button"
                                        onClick={() => handleRoll(spell.dmg || spell.hit, `${spell.name} Cast`, Boolean(spell.dmg))}
                                        className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-800 text-cyan-200 font-mono font-bold text-[11px] rounded border border-cyan-500/40 transition-colors"
                                    >
                                        {spell.dmg || spell.hit}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Switch to Full Sheet Button at bottom if provided */}
            {onOpenSheet && (
                <div className="pt-4 border-t border-slate-800 flex justify-end">
                    <button
                        type="button"
                        onClick={onOpenSheet}
                        className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-lg shadow-lg transition-all flex items-center gap-2"
                    >
                        <Icon name="external-link" size={14}/> Open Full Character Sheet
                    </button>
                </div>
            )}
        </div>
    );
};

export default MonsterStatblockView;

