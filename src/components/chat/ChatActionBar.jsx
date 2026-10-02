import React, { useState, useRef, useEffect, useMemo } from 'react';
import Icon from '../Icon';

export const SKILL_LIST = [
    { name: 'Acrobatics', stat: 'dex' },
    { name: 'Animal Handling', stat: 'wis' },
    { name: 'Arcana', stat: 'int' },
    { name: 'Athletics', stat: 'str' },
    { name: 'Deception', stat: 'cha' },
    { name: 'History', stat: 'int' },
    { name: 'Insight', stat: 'wis' },
    { name: 'Intimidation', stat: 'cha' },
    { name: 'Investigation', stat: 'int' },
    { name: 'Medicine', stat: 'wis' },
    { name: 'Nature', stat: 'int' },
    { name: 'Perception', stat: 'wis' },
    { name: 'Performance', stat: 'cha' },
    { name: 'Persuasion', stat: 'cha' },
    { name: 'Religion', stat: 'int' },
    { name: 'Sleight of Hand', stat: 'dex' },
    { name: 'Stealth', stat: 'dex' },
    { name: 'Survival', stat: 'wis' },
];

export const SAVING_THROWS = [
    { key: 'str', label: 'Strength' },
    { key: 'dex', label: 'Dexterity' },
    { key: 'con', label: 'Constitution' },
    { key: 'int', label: 'Intelligence' },
    { key: 'wis', label: 'Wisdom' },
    { key: 'cha', label: 'Charisma' }
];

const getStatMod = (val) => Math.floor(((Number(val) || 10) - 10) / 2);

export const ChatActionBar = ({
    activePersona,
    activeCharacter,
    onDiceRoll,
    postCustomMessage,
    onApplyHpChange,
    onOpenDamageModal,
    role = 'player'
}) => {
    // Active popover modal: null | 'attack' | 'cast' | 'check' | 'save' | 'hp'
    const [openMenu, setOpenMenu] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [hpInput, setHpInput] = useState('');
    const popoverRef = useRef(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setOpenMenu(null);
                setSearchQuery('');
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setOpenMenu(null);
                setSearchQuery('');
            }
        };
        if (openMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [openMenu]);

    const stats = activeCharacter?.stats || {};
    const profBonus = Math.floor(((Number(activeCharacter?.level) || 1) - 1) / 4) + 2;

    // 1. Calculate Attacks
    const attacks = useMemo(() => {
        const list = [];
        if (!activeCharacter) {
            return [{ name: 'Standard Attack', hit: '+0', dmg: '1d6', type: 'melee' }];
        }

        // Inventory equipped weapons
        (activeCharacter.inventory || [])
            .filter(item => (item.combat || item.equipped) && (item.hit || item.dmg || item.combat?.hit || item.combat?.dmg))
            .forEach(item => {
                const c = item.combat || {};
                list.push({
                    name: item.name,
                    hit: item.hit || c.hit || '+0',
                    dmg: item.dmg || c.dmg || '1d6',
                    damageType: item.damageType || c.damageType || '',
                    range: item.range || c.range || 'Melee'
                });
            });

        // NPC Actions (for monsters/creatures)
        if (Array.isArray(activeCharacter.actions)) {
            activeCharacter.actions.forEach(a => {
                const hitMatch = (a.desc || '').match(/([+-]\d+)\s+to\s+hit/i);
                const dmgMatch = (a.desc || '').match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*([a-zA-Z]+)?\s*damage/i);
                list.push({
                    name: a.name,
                    hit: a.attack_bonus !== undefined ? (a.attack_bonus >= 0 ? `+${a.attack_bonus}` : `${a.attack_bonus}`) : (hitMatch ? hitMatch[1] : '+0'),
                    dmg: a.damage_dice || (dmgMatch ? dmgMatch[1] : '1d6'),
                    damageType: dmgMatch ? (dmgMatch[2] || '') : '',
                    desc: a.desc
                });
            });
        }

        // Custom actions or fallbacks
        (activeCharacter.customActions || []).forEach(ca => {
            if (ca.hit || ca.dmg) {
                list.push({
                    name: ca.name,
                    hit: ca.hit || '+0',
                    dmg: ca.dmg || '1d6',
                    damageType: ca.damageType || '',
                    desc: ca.desc
                });
            }
        });

        if (list.length === 0) {
            const strMod = getStatMod(stats.str || 10);
            const strSign = strMod >= 0 ? `+${strMod}` : `${strMod}`;
            list.push({
                name: 'Unarmed Strike',
                hit: strSign,
                dmg: `1${strMod !== 0 ? (strMod > 0 ? `+${strMod}` : `${strMod}`) : ''}`,
                damageType: 'bludgeoning',
                range: 'Melee'
            });
        }

        return list;
    }, [activeCharacter, stats]);

    // 2. Calculate Spells
    const spells = useMemo(() => {
        if (!activeCharacter?.spells || !Array.isArray(activeCharacter.spells)) return [];
        return activeCharacter.spells;
    }, [activeCharacter]);

    // 3. Calculate Skills with Modifiers
    const skills = useMemo(() => {
        const charSkills = activeCharacter?.skills || {};
        return SKILL_LIST.map(skill => {
            const statVal = stats[skill.stat] || 10;
            const statMod = getStatMod(statVal);
            const skillProf = charSkills[skill.name] || charSkills[skill.name.toLowerCase()];
            
            let mod = statMod;
            if (skillProf === 'expertise' || skillProf === 2) {
                mod += profBonus * 2;
            } else if (skillProf) {
                mod += profBonus;
            }

            return {
                name: skill.name,
                stat: skill.stat.toUpperCase(),
                mod: mod,
                modDisplay: mod >= 0 ? `+${mod}` : `${mod}`,
                isProf: Boolean(skillProf),
                isExpert: skillProf === 'expertise' || skillProf === 2
            };
        });
    }, [activeCharacter, stats, profBonus]);

    // 4. Calculate Saves
    const saves = useMemo(() => {
        const charSaves = activeCharacter?.savingThrows || activeCharacter?.saves || {};
        return SAVING_THROWS.map(st => {
            const statVal = stats[st.key] || 10;
            const statMod = getStatMod(statVal);
            const isProf = Boolean(charSaves[st.key] || charSaves[st.label]);
            const mod = isProf ? statMod + profBonus : statMod;
            return {
                key: st.key,
                label: st.label,
                mod: mod,
                modDisplay: mod >= 0 ? `+${mod}` : `${mod}`,
                isProf: isProf
            };
        });
    }, [activeCharacter, stats, profBonus]);

    // HP Details
    const currentHp = Number(activeCharacter?.hp?.current ?? activeCharacter?.hp ?? 0);
    const maxHp = Number(activeCharacter?.hp?.max ?? 10);
    const tempHp = Number(activeCharacter?.hp?.temp ?? 0);

    // Roll Handlers
    const handleAttackRoll = (atk) => {
        setOpenMenu(null);
        if (!onDiceRoll) return;

        const hitStr = String(atk.hit || '+0').replace(/[^0-9+-]/g, '');
        const hitMod = parseInt(hitStr) || 0;
        const hitFormula = `1d20${hitMod !== 0 ? (hitMod > 0 ? `+${hitMod}` : `${hitMod}`) : ''}`;

        onDiceRoll(hitFormula, {
            actionType: 'attack',
            weaponName: atk.name,
            alias: `${atk.name} Attack`,
            characterName: activePersona.name,
            damageRoll: atk.dmg,
            damageType: atk.damageType || ''
        });
    };

    const handleSpellCast = (spell) => {
        setOpenMenu(null);
        if (!onDiceRoll) return;

        const spellLvl = Number(spell.level || 0);
        const lvlLabel = spellLvl === 0 ? 'Cantrip' : `Level ${spellLvl}`;

        if (spell.hit) {
            const hitStr = String(spell.hit).replace(/[^0-9+-]/g, '');
            const hitMod = parseInt(hitStr) || 0;
            const hitFormula = `1d20${hitMod !== 0 ? (hitMod > 0 ? `+${hitMod}` : `${hitMod}`) : ''}`;

            onDiceRoll(hitFormula, {
                actionType: 'spell',
                weaponName: spell.name,
                alias: `${spell.name} (${lvlLabel})`,
                characterName: activePersona.name,
                damageRoll: spell.dmg,
                damageType: spell.school || 'Spell',
                description: spell.desc
            });
        } else if (spell.dmg) {
            onDiceRoll(spell.dmg, {
                actionType: 'damage',
                weaponName: spell.name,
                alias: `${spell.name} (${lvlLabel})`,
                characterName: activePersona.name,
                damageType: spell.school || 'Spell',
                description: spell.desc
            });
        } else {
            // Narrative / Effect Spell
            if (postCustomMessage) {
                postCustomMessage({
                    content: `casts **${spell.name}** (${lvlLabel})${spell.desc ? `\n> *${spell.desc.slice(0, 160)}${spell.desc.length > 160 ? '...' : ''}*` : ''}`,
                    type: 'chat-emote'
                });
            }
        }
    };

    const handleSkillRoll = (skill) => {
        setOpenMenu(null);
        if (!onDiceRoll) return;
        const formula = `1d20${skill.mod !== 0 ? (skill.mod > 0 ? `+${skill.mod}` : `${skill.mod}`) : ''}`;
        onDiceRoll(formula, {
            alias: `${skill.name} Check`,
            characterName: activePersona.name,
            actionType: 'check'
        });
    };

    const handleSaveRoll = (save) => {
        setOpenMenu(null);
        if (!onDiceRoll) return;
        const formula = `1d20${save.mod !== 0 ? (save.mod > 0 ? `+${save.mod}` : `${save.mod}`) : ''}`;
        onDiceRoll(formula, {
            alias: `${save.label} Saving Throw`,
            characterName: activePersona.name,
            actionType: 'save'
        });
    };

    const handleApplyHp = (delta, isHeal = false) => {
        const val = Math.abs(parseInt(delta)) || 0;
        if (val === 0) return;
        setOpenMenu(null);
        setHpInput('');
        if (onApplyHpChange) {
            onApplyHpChange(isHeal ? val : -val);
        } else if (postCustomMessage) {
            postCustomMessage({
                content: isHeal ? `heals for **${val} HP**.` : `takes **${val} damage**.`,
                type: 'chat-emote'
            });
        }
    };

    return (
        <div className="relative flex items-center gap-1.5 py-0.5 select-none" ref={popoverRef}>
            {/* Quick Action Pill Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto custom-scroll no-scrollbar py-0.5">
                {/* 1. Attack Button */}
                <button
                    type="button"
                    onClick={() => { setOpenMenu(openMenu === 'attack' ? null : 'attack'); setSearchQuery(''); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 border ${
                        openMenu === 'attack'
                            ? 'bg-amber-500/25 border-amber-500/60 text-amber-200'
                            : 'bg-slate-900/80 hover:bg-slate-850 border-slate-700/80 hover:border-amber-500/40 text-slate-300 hover:text-white'
                    }`}
                    title="Quick Attack Roll"
                >
                    <Icon name="sword" size={12} className="text-amber-400" />
                    <span>Attack</span>
                </button>

                {/* 2. Cast Spell Button */}
                <button
                    type="button"
                    onClick={() => { setOpenMenu(openMenu === 'cast' ? null : 'cast'); setSearchQuery(''); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 border ${
                        openMenu === 'cast'
                            ? 'bg-indigo-500/25 border-indigo-500/60 text-indigo-200'
                            : 'bg-slate-900/80 hover:bg-slate-850 border-slate-700/80 hover:border-indigo-500/40 text-slate-300 hover:text-white'
                    }`}
                    title="Cast Spell / Cantrip"
                >
                    <Icon name="wand-2" size={12} className="text-indigo-400" />
                    <span>Cast</span>
                </button>

                {/* 3. Skill Check Button */}
                <button
                    type="button"
                    onClick={() => { setOpenMenu(openMenu === 'check' ? null : 'check'); setSearchQuery(''); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 border ${
                        openMenu === 'check'
                            ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-200'
                            : 'bg-slate-900/80 hover:bg-slate-850 border-slate-700/80 hover:border-emerald-500/40 text-slate-300 hover:text-white'
                    }`}
                    title="Roll Ability / Skill Check"
                >
                    <Icon name="dice-5" size={12} className="text-emerald-400" />
                    <span>Check</span>
                </button>

                {/* 4. Saving Throw Button */}
                <button
                    type="button"
                    onClick={() => { setOpenMenu(openMenu === 'save' ? null : 'save'); setSearchQuery(''); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 border ${
                        openMenu === 'save'
                            ? 'bg-rose-500/25 border-rose-500/60 text-rose-200'
                            : 'bg-slate-900/80 hover:bg-slate-850 border-slate-700/80 hover:border-rose-500/40 text-slate-300 hover:text-white'
                    }`}
                    title="Roll Saving Throw"
                >
                    <Icon name="shield" size={12} className="text-rose-400" />
                    <span>Save</span>
                </button>

                {/* 5. HP Quick Modifier */}
                {(activeCharacter?.hp !== undefined || role === 'dm') && (
                    <button
                        type="button"
                        onClick={() => {
                            if (activeCharacter?.hp !== undefined) {
                                setOpenMenu(openMenu === 'hp' ? null : 'hp');
                                setHpInput('');
                            } else {
                                onOpenDamageModal?.();
                            }
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95 border ${
                            openMenu === 'hp'
                                ? 'bg-red-500/25 border-red-500/60 text-red-200'
                                : 'bg-slate-900/80 hover:bg-slate-850 border-slate-700/80 hover:border-red-500/40 text-slate-300 hover:text-white'
                        }`}
                        title={activeCharacter?.hp !== undefined ? "Quick HP / Damage / Heal" : "Party Damage / Heal Targets"}
                    >
                        <Icon name="heart" size={12} className="text-red-400 fill-red-400/30" />
                        <span className="font-mono text-[10px] text-slate-300">
                            {activeCharacter?.hp !== undefined ? `${currentHp}/${maxHp}` : 'HP'}
                        </span>
                    </button>
                )}
            </div>

            {/* FLOATING ACTION POPOVER PALETTE */}
            {openMenu && (
                <div className="absolute left-0 bottom-full mb-2 w-72 sm:w-80 bg-slate-950/95 border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
                        <span className="font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                            {openMenu === 'attack' && <><Icon name="sword" size={14} className="text-amber-400" /> Weapon Attacks</>}
                            {openMenu === 'cast' && <><Icon name="wand-2" size={14} className="text-indigo-400" /> Spellbook</>}
                            {openMenu === 'check' && <><Icon name="dice-5" size={14} className="text-emerald-400" /> Skill Checks</>}
                            {openMenu === 'save' && <><Icon name="shield" size={14} className="text-rose-400" /> Saving Throws</>}
                            {openMenu === 'hp' && <><Icon name="heart" size={14} className="text-red-400" /> Health & Recovery</>}
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono truncate max-w-[110px]">
                            {activePersona.name}
                        </span>
                    </div>

                    {/* Attack List */}
                    {openMenu === 'attack' && (
                        <div className="space-y-1 max-h-56 overflow-y-auto custom-scroll pr-1">
                            {attacks.map((atk, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleAttackRoll(atk)}
                                    className="w-full text-left p-2 rounded-xl bg-slate-900/60 hover:bg-amber-500/15 border border-slate-800/80 hover:border-amber-500/40 flex items-center justify-between group transition-all cursor-pointer"
                                >
                                    <div className="min-w-0">
                                        <div className="font-bold text-xs text-slate-200 group-hover:text-amber-300 truncate">
                                            {atk.name}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            {atk.dmg} {atk.damageType && `(${atk.damageType})`}
                                        </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-bold text-xs border border-amber-500/30 shrink-0">
                                        {atk.hit}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Spell List */}
                    {openMenu === 'cast' && (
                        <div className="space-y-1.5">
                            {spells.length > 5 && (
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search spells..."
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500 mb-1"
                                    autoFocus
                                />
                            )}
                            <div className="space-y-1 max-h-56 overflow-y-auto custom-scroll pr-1">
                                {spells
                                    .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .map((spell, idx) => {
                                        const lvl = Number(spell.level || 0);
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleSpellCast(spell)}
                                                className="w-full text-left p-2 rounded-xl bg-slate-900/60 hover:bg-indigo-500/15 border border-slate-800/80 hover:border-indigo-500/40 flex items-center justify-between group transition-all cursor-pointer"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-bold text-xs text-slate-200 group-hover:text-indigo-300 truncate">
                                                        {spell.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {lvl === 0 ? 'Cantrip' : `Lvl ${lvl}`} • {spell.school || 'Spell'}
                                                    </div>
                                                </div>
                                                {spell.dmg && (
                                                    <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono text-[11px] border border-indigo-500/30 shrink-0">
                                                        {spell.dmg}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                {spells.length === 0 && (
                                    <div className="text-center text-slate-500 text-xs py-4">
                                        No prepared spells found on sheet.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Skill Checks */}
                    {openMenu === 'check' && (
                        <div className="space-y-1 max-h-60 overflow-y-auto custom-scroll pr-1">
                            {skills.map(skill => (
                                <button
                                    key={skill.name}
                                    type="button"
                                    onClick={() => handleSkillRoll(skill)}
                                    className="w-full text-left px-2.5 py-1.5 rounded-xl bg-slate-900/60 hover:bg-emerald-500/15 border border-slate-800/80 hover:border-emerald-500/40 flex items-center justify-between group transition-all cursor-pointer"
                                >
                                    <span className="text-xs text-slate-300 group-hover:text-emerald-300 font-medium flex items-center gap-1.5">
                                        {skill.isExpert ? '⭐ ' : skill.isProf ? '● ' : ''}
                                        {skill.name}
                                        <span className="text-[10px] text-slate-500 font-mono">({skill.stat})</span>
                                    </span>
                                    <span className="font-mono text-xs font-bold text-emerald-400">
                                        {skill.modDisplay}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Saving Throws */}
                    {openMenu === 'save' && (
                        <div className="grid grid-cols-2 gap-1.5">
                            {saves.map(save => (
                                <button
                                    key={save.key}
                                    type="button"
                                    onClick={() => handleSaveRoll(save)}
                                    className="p-2 rounded-xl bg-slate-900/60 hover:bg-rose-500/15 border border-slate-800/80 hover:border-rose-500/40 flex flex-col items-center justify-center text-center group transition-all cursor-pointer"
                                >
                                    <span className="text-[11px] text-slate-400 group-hover:text-rose-300 font-bold uppercase tracking-wider">
                                        {save.label.slice(0, 3)}
                                    </span>
                                    <span className="font-mono text-sm font-black text-rose-400 mt-0.5">
                                        {save.modDisplay}
                                    </span>
                                    {save.isProf && (
                                        <span className="text-[9px] text-amber-400 font-semibold mt-0.5">Proficient</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Quick HP Modifier */}
                    {openMenu === 'hp' && (
                        <div className="space-y-3 p-1">
                            {/* Current Health Status */}
                            <div className="flex items-center justify-between px-2 py-1.5 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                                <span className="text-slate-400 font-medium">Health Pool</span>
                                <span className="font-mono font-bold text-amber-400 text-sm">
                                    {currentHp} / {maxHp} HP
                                    {tempHp > 0 && <span className="text-sky-300 text-xs ml-1">(+{tempHp} Temp)</span>}
                                </span>
                            </div>

                            {/* Quick Presets */}
                            <div className="grid grid-cols-4 gap-1 text-xs">
                                <button
                                    type="button"
                                    onClick={() => handleApplyHp(1, false)}
                                    className="p-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 border border-red-500/40 text-red-300 font-bold cursor-pointer"
                                >
                                    -1
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyHp(5, false)}
                                    className="p-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 border border-red-500/40 text-red-300 font-bold cursor-pointer"
                                >
                                    -5
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyHp(1, true)}
                                    className="p-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-300 font-bold cursor-pointer"
                                >
                                    +1
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyHp(5, true)}
                                    className="p-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-300 font-bold cursor-pointer"
                                >
                                    +5
                                </button>
                            </div>

                            {/* Custom Amount Form */}
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    value={hpInput}
                                    onChange={(e) => setHpInput(e.target.value)}
                                    placeholder="Amount..."
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-mono"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleApplyHp(hpInput, false);
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => handleApplyHp(hpInput, false)}
                                    className="px-2.5 py-1.5 rounded-lg bg-red-900/80 hover:bg-red-800 text-red-100 font-bold text-xs transition-colors cursor-pointer"
                                >
                                    Damage
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyHp(hpInput, true)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 text-emerald-100 font-bold text-xs transition-colors cursor-pointer"
                                >
                                    Heal
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
