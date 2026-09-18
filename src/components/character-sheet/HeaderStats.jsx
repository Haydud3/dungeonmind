import React, { useState, useRef } from 'react';
import { useCharacterStore, calcAC } from '../../stores/useCharacterStore';
import Icon from '../Icon';
import LevelUpModal from './LevelUpModal';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const HeaderStats = ({ 
    character: propCharacter, 
    onDiceRoll, 
    onLogAction, 
    onBack, 
    role, 
    onOpenModelPicker, 
    onOpenDiceTray 
}) => {
    const storeCharacter = useCharacterStore(state => state.character);
    const character = storeCharacter || propCharacter;
    const { 
        updateHP, 
        updateInfo, 
        updateHitDice, 
        updateExhaustion, 
        toggleCondition, 
        updateStat, 
        takeShortRest, 
        takeLongRest, 
        setDeathSaves, 
        updateDeathSaves 
    } = useCharacterStore();

    const [isExpanded, setIsExpanded] = useState(false);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [showCalculator, setShowCalculator] = useState(false);
    const [customDelta, setCustomDelta] = useState('');
    const [tempHpInput, setTempHpInput] = useState('');
    const fileInputRef = useRef(null);

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const base64 = await fileToBase64(file);
            updateInfo('image', base64);
        } catch (err) {
            console.error("Avatar upload failed:", err);
        }
    };

    if (!character) return null;

    // HP & Temp HP Logic
    const currentHP = character.hp?.current ?? 0;
    const maxHP = character.hp?.max ?? 0;
    const tempHP = character.hp?.temp ?? 0;
    const hpPercent = Math.min((currentHP / (maxHP || 1)) * 100, 100);
    const hpColor = hpPercent <= 25 
        ? 'from-rose-600 to-red-600' 
        : hpPercent <= 50 
            ? 'from-amber-500 to-yellow-600' 
            : 'from-emerald-500 to-green-600';

    // Damage and Healing Handlers
    const handleApplyDamage = (amount) => {
        const dmg = Math.max(0, parseInt(amount, 10) || 0);
        if (dmg === 0) return;

        let remainingDmg = dmg;
        let newTemp = tempHP;

        if (newTemp > 0) {
            if (newTemp >= remainingDmg) {
                newTemp -= remainingDmg;
                remainingDmg = 0;
            } else {
                remainingDmg -= newTemp;
                newTemp = 0;
            }
            updateHP('temp', newTemp);
        }

        if (remainingDmg > 0) {
            const newCurrent = Math.max(0, currentHP - remainingDmg);
            updateHP('current', newCurrent);
        }
        setCustomDelta('');
    };

    const handleApplyHealing = (amount) => {
        const heal = Math.max(0, parseInt(amount, 10) || 0);
        if (heal === 0) return;
        const newCurrent = Math.min(maxHP, currentHP + heal);
        updateHP('current', newCurrent);
        setCustomDelta('');
    };

    const handleApplyTempHP = (amount) => {
        const val = Math.max(0, parseInt(amount, 10) || 0);
        updateHP('temp', val);
        setTempHpInput('');
    };

    // Vitals and derived metrics
    const calculatedAc = calcAC ? calcAC(character) : { value: character.ac || 10 };
    const ac = character.ac ?? calculatedAc.value;
    const init = character.initiative ?? (Math.floor(((character.stats?.dex || 10) - 10) / 2));
    const hitDice = character.hitDice || { current: 1, max: 1, die: "d8" };
    const pb = character.proficiencyBonus || Math.ceil((character.level || 1) / 4) + 1;
    const exhaustion = character.exhaustion || 0;
    const conditions = character.conditions || [];
    const ds = character.deathSaves || { successes: 0, failures: 0 };

    // Senses
    const wisMod = Math.floor(((character.stats?.wis || 10) - 10) / 2);
    const intMod = Math.floor(((character.stats?.int || 10) - 10) / 2);
    const isPerceptionProf = Boolean(character.skills?.Perception || character.skills?.perception);
    const isInsightProf = Boolean(character.skills?.Insight || character.skills?.insight);
    const isInvestigationProf = Boolean(character.skills?.Investigation || character.skills?.investigation);
    
    const passivePerception = 10 + wisMod + (isPerceptionProf ? pb : 0);
    const passiveInsight = 10 + wisMod + (isInsightProf ? pb : 0);
    const passiveInvestigation = 10 + intMod + (isInvestigationProf ? pb : 0);

    return (
        <div className="bg-slate-950/95 border-b border-amber-500/30 shadow-2xl shrink-0 relative backdrop-blur-xl">
            {/* Top Bar: Avatar, Identity, HP, Vitals HUD */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                {/* Left: Back Button + Avatar + Identity */}
                <div className="flex items-center gap-3 min-w-0">
                    {onBack && (
                        <button 
                            onClick={onBack} 
                            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
                            title="Back"
                        >
                            <Icon name="arrow-left" size={18}/>
                        </button>
                    )}

                    {/* Avatar with level corner badge & upload trigger */}
                    <div className="relative group shrink-0">
                        <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={handleAvatarUpload} 
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()} 
                            className="w-12 h-12 rounded-2xl bg-slate-800 border-2 border-amber-500/40 overflow-hidden shadow-lg group-hover:border-amber-400 transition-all flex items-center justify-center relative cursor-pointer"
                            title="Click to upload custom character portrait"
                        >
                            {character.image ? (
                                <img 
                                    src={character.image} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                    alt={character.name} 
                                    referrerPolicy="no-referrer" 
                                />
                            ) : (
                                <span className="font-serif font-black text-amber-300 text-lg">
                                    {(character.name || '?')[0].toUpperCase()}
                                </span>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Icon name="camera" size={16} className="text-white" />
                            </div>
                        </button>
                        <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-md bg-amber-600 text-slate-950 text-[9px] font-black font-mono shadow-md border border-amber-400 select-none">
                            L{character.level || 1}
                        </span>
                    </div>

                    {/* Identity: Name, Race, Class, Subclass */}
                    <div className="min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2 min-w-0">
                            <h2 className="font-serif font-black text-amber-200 text-base sm:text-lg tracking-wide truncate">
                                {character.name}
                            </h2>
                            {/* Inspiration Star Toggle */}
                            <button 
                                onClick={() => updateInfo('inspiration', !character.inspiration)} 
                                className={`transition-all p-1 rounded-lg border text-xs cursor-pointer ${
                                    character.inspiration 
                                        ? 'text-amber-400 bg-amber-500/20 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse' 
                                        : 'text-slate-600 hover:text-slate-400 border-transparent hover:bg-slate-800'
                                }`} 
                                title={character.inspiration ? "Inspiration Active (Click to expend)" : "Give Inspiration"}
                            >
                                <Icon name="sparkles" size={13} />
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300">
                                {character.race || 'Human'} {character.class || 'Adventurer'}
                            </span>
                            {character.subclass && (
                                <span className="text-[10px] text-slate-400 font-mono italic truncate max-w-[120px]">
                                    {character.subclass}
                                </span>
                            )}
                            <button 
                                onClick={() => setShowLevelUp(true)} 
                                className="text-[10px] font-bold text-indigo-300 bg-indigo-950/40 border border-indigo-500/40 hover:bg-indigo-900/60 hover:text-white px-1.5 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                                title="Level Up Character"
                            >
                                <Icon name="arrow-up" size={10} /> Lvl Up
                            </button>
                        </div>
                    </div>
                </div>

                {/* Center / Right: Interactive Health Bar & Calculator Launcher */}
                <div className="flex-1 max-w-xs min-w-[200px] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hit Points</span>
                            {tempHP > 0 && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950/60 border border-blue-500/40 text-blue-300 font-bold">
                                    +{tempHP} temp
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2 py-0.5 shadow-inner">
                            <input 
                                type="number" 
                                className="w-10 bg-transparent text-right text-xs font-bold font-mono text-emerald-300 outline-none focus:text-white" 
                                value={currentHP} 
                                onChange={e => updateHP('current', parseInt(e.target.value, 10) || 0)} 
                                title="Current HP"
                            />
                            <span className="text-slate-500 font-bold">/</span>
                            <input 
                                type="number" 
                                className="w-10 bg-transparent text-left text-xs font-bold font-mono text-slate-300 outline-none focus:text-white" 
                                value={maxHP} 
                                onChange={e => updateHP('max', parseInt(e.target.value, 10) || 0)} 
                                title="Max HP"
                            />
                        </div>
                    </div>

                    {/* Percentage Progress Health Bar */}
                    <div className="relative h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700/80 shadow-inner">
                        <div 
                            className={`h-full bg-gradient-to-r ${hpColor} transition-all duration-300 rounded-full`} 
                            style={{ width: `${hpPercent}%` }}
                        />
                    </div>

                    {/* Health Actions Bar */}
                    <div className="flex items-center justify-between gap-1 pt-0.5">
                        <button 
                            type="button" 
                            onClick={() => setShowCalculator(!showCalculator)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                                showCalculator 
                                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm' 
                                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                            }`}
                        >
                            <Icon name="calculator" size={11} />
                            <span>Damage / Heal</span>
                        </button>

                        <div className="flex items-center gap-1">
                            {onOpenDiceTray && (
                                <button 
                                    onClick={onOpenDiceTray} 
                                    className="p-1 rounded-md bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors"
                                    title="Open Full Dice Tray"
                                >
                                    <Icon name="dices" size={13} />
                                </button>
                            )}
                            <button 
                                onClick={() => setIsExpanded(!isExpanded)} 
                                className="p-1 rounded-md bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
                                title={isExpanded ? "Collapse Sheet Controls" : "Expand Senses & Stats"}
                            >
                                <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Combat Vitals HUD (AC, SPD, INIT, PB) */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* AC Shield */}
                    <div 
                        className="flex flex-col items-center justify-center bg-slate-900/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5 min-w-[50px] shadow-sm"
                        title={calculatedAc?.formula ? `Armor Class: ${calculatedAc.formula}` : 'Armor Class'}
                    >
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                            <Icon name="shield" size={10} className="text-amber-400" /> AC
                        </span>
                        <div className="text-sm font-black font-mono text-white leading-tight mt-0.5">{ac}</div>
                    </div>

                    {/* SPD */}
                    <div className="flex flex-col items-center justify-center bg-slate-900/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5 min-w-[50px] shadow-sm">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                            <Icon name="footprints" size={10} className="text-cyan-400" /> SPD
                        </span>
                        <div className="text-sm font-black font-mono text-white leading-tight mt-0.5">
                            {character.speed || 30}<span className="text-[9px] font-normal text-slate-500">ft</span>
                        </div>
                    </div>

                    {/* INIT (Clickable d20 Roll) */}
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (onDiceRoll) {
                                onDiceRoll(`1d20${init >= 0 ? '+' : ''}${init}`, {
                                    alias: `${character.name} Initiative`,
                                    characterName: character.name,
                                    actionType: 'check'
                                });
                            }
                        }}
                        className="flex flex-col items-center justify-center bg-slate-900/90 hover:bg-amber-950/30 border border-slate-700/80 hover:border-amber-500/50 rounded-xl px-2.5 py-1.5 min-w-[50px] shadow-sm transition-all group cursor-pointer active:scale-95"
                        title="Click to roll Initiative"
                    >
                        <span className="text-[9px] font-bold text-slate-400 group-hover:text-amber-300 uppercase tracking-wider flex items-center gap-0.5">
                            <Icon name="zap" size={10} className="text-amber-400" /> INIT
                        </span>
                        <div className="text-sm font-black font-mono text-amber-300 group-hover:text-amber-200 leading-tight mt-0.5">
                            {init >= 0 ? `+${init}` : init}
                        </div>
                    </button>

                    {/* PB */}
                    <div className="flex flex-col items-center justify-center bg-slate-900/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5 min-w-[50px] shadow-sm">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                            <Icon name="star" size={10} className="text-purple-400" /> PB
                        </span>
                        <div className="text-sm font-black font-mono text-white leading-tight mt-0.5">
                            +{pb}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Damage & Healing Calculator Drawer */}
            {showCalculator && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 bg-slate-950/80 animate-in slide-in-from-top-2 duration-150">
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-500/30 shadow-inner flex flex-wrap items-center justify-between gap-2.5">
                        {/* Instant Delta Buttons */}
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick:</span>
                            {[-10, -5, -1].map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => handleApplyDamage(Math.abs(d))}
                                    className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-mono text-xs font-bold transition-all cursor-pointer active:scale-95"
                                >
                                    {d}
                                </button>
                            ))}
                            {[1, 5, 10].map(h => (
                                <button
                                    key={h}
                                    type="button"
                                    onClick={() => handleApplyHealing(h)}
                                    className="px-2 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 font-mono text-xs font-bold transition-all cursor-pointer active:scale-95"
                                >
                                    +{h}
                                </button>
                            ))}
                        </div>

                        {/* Custom Amount Form */}
                        <div className="flex items-center gap-1.5">
                            <input
                                type="number"
                                min="1"
                                placeholder="Amount..."
                                value={customDelta}
                                onChange={(e) => setCustomDelta(e.target.value)}
                                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center text-xs font-mono font-bold text-white outline-none focus:border-amber-400"
                            />
                            <button
                                type="button"
                                onClick={() => handleApplyDamage(customDelta)}
                                disabled={!customDelta}
                                className="px-2.5 py-1 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow transition-all cursor-pointer active:scale-95"
                            >
                                Damage
                            </button>
                            <button
                                type="button"
                                onClick={() => handleApplyHealing(customDelta)}
                                disabled={!customDelta}
                                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow transition-all cursor-pointer active:scale-95"
                            >
                                Heal
                            </button>
                        </div>

                        {/* Temp HP Assignment */}
                        <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2.5">
                            <input
                                type="number"
                                min="0"
                                placeholder="Temp..."
                                value={tempHpInput}
                                onChange={(e) => setTempHpInput(e.target.value)}
                                className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center text-xs font-mono font-bold text-blue-300 outline-none focus:border-blue-400"
                            />
                            <button
                                type="button"
                                onClick={() => handleApplyTempHP(tempHpInput)}
                                disabled={!tempHpInput}
                                className="px-2.5 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow transition-all cursor-pointer active:scale-95"
                            >
                                +Temp HP
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Death Saves Banner (Appears when current HP is 0) */}
            {currentHP <= 0 && (
                <div className="bg-gradient-to-r from-rose-950 via-slate-950 to-rose-950 border-t border-rose-500/50 p-3 flex flex-wrap items-center justify-around gap-3 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                        <Icon name="skull" size={16} className="animate-pulse" />
                        <span>Death Saving Throws</span>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Successes */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-emerald-400">Successes:</span>
                            <div className="flex gap-1">
                                {[1, 2, 3].map(i => (
                                    <button
                                        key={`s-${i}`}
                                        type="button"
                                        onClick={() => setDeathSaves('successes', ds.successes === i ? i - 1 : i)}
                                        className={`w-4 h-4 rounded-full border-2 transition-all cursor-pointer ${
                                            i <= ds.successes 
                                                ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' 
                                                : 'bg-slate-900 border-slate-600 hover:border-emerald-500/50'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Roll Death Save Button */}
                        <button 
                            type="button"
                            onClick={async () => {
                                if (!onDiceRoll) return;
                                const r = await onDiceRoll('1d20', { alias: 'Death Saving Throw', characterName: character.name });
                                const roll = (r && typeof r === 'object') ? (r.natural ?? r.naturalRoll ?? r.total ?? r.result) : r;
                                if (roll === 1) updateDeathSaves('failure');
                                else if (roll === 20) updateDeathSaves('success');
                                else if (roll >= 10) updateDeathSaves('success');
                                else updateDeathSaves('failure');
                            }}
                            className="px-3.5 py-1 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs rounded-lg shadow-md border border-rose-400 transition-transform active:scale-95 cursor-pointer"
                        >
                            Roll d20
                        </button>

                        {/* Failures */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-rose-400">Failures:</span>
                            <div className="flex gap-1">
                                {[1, 2, 3].map(i => (
                                    <button
                                        key={`f-${i}`}
                                        type="button"
                                        onClick={() => setDeathSaves('failures', ds.failures === i ? i - 1 : i)}
                                        className={`w-4 h-4 rounded-full border-2 transition-all cursor-pointer ${
                                            i <= ds.failures 
                                                ? 'bg-rose-600 border-rose-400 shadow-[0_0_8px_rgba(225,29,72,0.6)]' 
                                                : 'bg-slate-900 border-slate-600 hover:border-rose-500/50'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Expanded Drawer: 6-Ability Scores, Senses, Rest Controls, Conditions */}
            {isExpanded && (
                <div className="p-3 sm:p-4 border-t border-slate-800/90 bg-slate-950/70 animate-in slide-in-from-top-2 duration-200 space-y-3.5">
                    {/* 6-Ability Scores Ribbon */}
                    <div>
                        <div className="text-[10px] uppercase font-bold text-amber-500 tracking-widest mb-1.5">
                            Ability Scores & Direct Checks
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                            {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(s => {
                                const score = character.stats?.[s] ?? 10;
                                const mod = Math.floor((score - 10) / 2);
                                const modSign = mod >= 0 ? `+${mod}` : `${mod}`;

                                return (
                                    <div 
                                        key={s} 
                                        className="bg-slate-900/90 rounded-xl border border-slate-800 p-2 text-center flex flex-col items-center justify-between shadow-sm hover:border-amber-500/40 transition-colors"
                                    >
                                        <div className="text-[10px] uppercase font-bold text-amber-400 font-mono tracking-wider">
                                            {s}
                                        </div>
                                        
                                        {/* Roll Modifier Button */}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                if (onDiceRoll) {
                                                    onDiceRoll(`1d20${modSign}`, {
                                                        alias: `${character.name} ${s.toUpperCase()} Check`,
                                                        characterName: character.name,
                                                        actionType: 'check'
                                                    });
                                                }
                                            }}
                                            className="my-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-slate-700 hover:border-amber-500/50 font-mono text-sm font-black transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                                            title={`Roll ${s.toUpperCase()} Check`}
                                        >
                                            <Icon name="dices" size={11} className="opacity-70" />
                                            <span>{modSign}</span>
                                        </button>

                                        {/* Editable Base Score */}
                                        <div className="flex items-center justify-center gap-0.5 text-slate-500 text-[10px] font-mono">
                                            <span>(</span>
                                            <input
                                                type="number"
                                                value={score}
                                                onChange={e => updateStat(s, parseInt(e.target.value, 10) || 10)}
                                                className="w-7 bg-transparent text-center text-[10px] font-bold text-slate-400 outline-none hover:text-white focus:text-white"
                                                title={`Edit base ${s.toUpperCase()} score`}
                                            />
                                            <span>)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Middle Row: Passive Senses & Hit Dice / Exhaustion */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Passive Senses Telemetry */}
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-2.5 flex items-center justify-around gap-2 text-center">
                            <div className="flex-1">
                                <div className="text-[9px] uppercase font-bold text-slate-400">Passive Perception</div>
                                <div className="text-sm font-black font-mono text-amber-300 mt-0.5">{passivePerception}</div>
                            </div>
                            <div className="w-px h-6 bg-slate-800" />
                            <div className="flex-1">
                                <div className="text-[9px] uppercase font-bold text-slate-400">Passive Insight</div>
                                <div className="text-sm font-black font-mono text-indigo-300 mt-0.5">{passiveInsight}</div>
                            </div>
                            <div className="w-px h-6 bg-slate-800" />
                            <div className="flex-1">
                                <div className="text-[9px] uppercase font-bold text-slate-400">Passive Invest.</div>
                                <div className="text-sm font-black font-mono text-cyan-300 mt-0.5">{passiveInvestigation}</div>
                            </div>
                        </div>

                        {/* Hit Dice & Exhaustion */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* Hit Dice */}
                            <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-2 flex items-center justify-between">
                                <div className="min-w-0">
                                    <div className="text-[9px] uppercase font-bold text-slate-400 truncate">Hit Dice ({hitDice.die})</div>
                                    <div className="text-xs font-black font-mono text-white mt-0.5">{hitDice.current}/{hitDice.max}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => updateHitDice(Math.max(0, hitDice.current - 1))}
                                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs"
                                    >
                                        -
                                    </button>
                                    <button 
                                        onClick={() => updateHitDice(Math.min(hitDice.max, hitDice.current + 1))}
                                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {/* Exhaustion */}
                            <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-2 flex items-center justify-between">
                                <div className="min-w-0">
                                    <div className="text-[9px] uppercase font-bold text-slate-400 truncate">Exhaustion</div>
                                    <div className={`text-xs font-black font-mono mt-0.5 ${exhaustion > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                                        Level {exhaustion}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => updateExhaustion(Math.max(0, exhaustion - 1))}
                                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs"
                                    >
                                        -
                                    </button>
                                    <button 
                                        onClick={() => updateExhaustion(Math.min(6, exhaustion + 1))}
                                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Senses Inputs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            { id: 'darkvision', label: 'Darkvision' },
                            { id: 'blindsight', label: 'Blindsight' },
                            { id: 'tremorsense', label: 'Tremorsense' },
                            { id: 'truesight', label: 'Truesight' }
                        ].map(sense => (
                            <div key={sense.id} className="bg-slate-900/70 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between">
                                <span className="text-[9px] uppercase font-bold text-slate-400 truncate">{sense.label}</span>
                                <div className="flex items-center gap-1 font-mono text-xs font-bold text-indigo-300">
                                    <input
                                        type="number"
                                        min="0"
                                        step="5"
                                        value={parseInt(character[sense.id], 10) || 0}
                                        onChange={e => updateInfo(sense.id, parseInt(e.target.value, 10) || 0)}
                                        className="w-10 bg-slate-950 rounded px-1 text-center border border-slate-700 outline-none"
                                    />
                                    <span className="text-[9px] text-slate-500 font-normal">ft</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Conditions Palette */}
                    <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                            <Icon name="activity" size={12} className="text-amber-400" />
                            <span>Active Conditions</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                'Blinded', 'Charmed', 'Deafened', 'Frightened', 
                                'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 
                                'Petrified', 'Poisoned', 'Prone', 'Restrained', 
                                'Stunned', 'Unconscious'
                            ].map(cond => {
                                const isActive = conditions.includes(cond);
                                return (
                                    <button
                                        key={cond}
                                        type="button"
                                        onClick={() => toggleCondition(cond)}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer active:scale-95 ${
                                            isActive 
                                                ? 'bg-rose-950/80 text-rose-300 border border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.3)]' 
                                                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        {cond}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Rest & Recovery Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
                        <button
                            type="button"
                            onClick={takeShortRest}
                            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                            <Icon name="coffee" size={13} className="text-amber-400" />
                            <span>Short Rest</span>
                        </button>
                        <button
                            type="button"
                            onClick={takeLongRest}
                            className="px-3.5 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                            <Icon name="moon" size={13} />
                            <span>Long Rest</span>
                        </button>
                    </div>
                </div>
            )}

            {showLevelUp && <LevelUpModal character={character} onClose={() => setShowLevelUp(false)} />}
        </div>
    );
};

export default HeaderStats;