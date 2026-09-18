import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { computeGroupRollStats } from '../../utils/groupRollUtils';

const GroupRollCard = ({
    msg,
    user,
    role,
    players = [],
    assignments = {},
    onDiceRoll,
    onEditMessage,
    onDeleteMessage,
    formatTime
}) => {
    const groupData = useMemo(() => {
        try {
            return JSON.parse(msg.content);
        } catch (e) {
            console.error("Failed to parse group roll card content", e);
            return null;
        }
    }, [msg.content]);

    const [advModes, setAdvModes] = useState({});
    const [isRolling, setIsRolling] = useState({});
    const [editingDc, setEditingDc] = useState(false);
    const [dcInput, setDcInput] = useState(() => groupData?.dc || '');
    const [manualInputs, setManualInputs] = useState({});
    const [showManualInput, setShowManualInput] = useState({});

    if (!groupData) {
        return (
            <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-xs text-red-300">
                Invalid Group Roll Data
            </div>
        );
    }

    const {
        title = 'Group Check',
        rollType = 'Perception',
        category = 'skill',
        dc = null,
        participants = [],
        creatorName = 'Dungeon Master',
        status = 'active'
    } = groupData;

    const stats = computeGroupRollStats(participants, dc);

    const getAdvMode = (charId) => advModes[charId] || 'normal';

    const setCharAdvMode = (charId, mode) => {
        setAdvModes(prev => ({ ...prev, [charId]: mode }));
    };

    // Roll single participant
    const handleRollParticipant = async (participant) => {
        if (isRolling[participant.characterId]) return;
        setIsRolling(prev => ({ ...prev, [participant.characterId]: true }));

        const adv = getAdvMode(participant.characterId);
        const mod = participant.modifier || 0;
        const sign = mod >= 0 ? `+${mod}` : `${mod}`;

        let formula = `1d20${sign}`;
        if (adv === 'adv') formula = `2d20kh1${sign}`;
        else if (adv === 'dis') formula = `2d20kl1${sign}`;

        let rollResult = null;
        if (onDiceRoll) {
            try {
                const res = await onDiceRoll(formula, {
                    alias: `${participant.characterName} Group ${rollType}`,
                    characterName: participant.characterName,
                    actionType: 'check',
                    skipChat: true // Don't spam individual messages, GroupRollCard records it
                });

                // Extract roll numbers
                const rawTotal = (res && typeof res.total === 'number') ? res.total : (Number(res) || 10 + mod);
                const rawNatural = (res && typeof res.natural === 'number') ? res.natural : (rawTotal - mod);
                
                rollResult = {
                    total: rawTotal,
                    natural: rawNatural,
                    formula: formula,
                    advMode: adv,
                    isCrit: res?.isCrit || rawNatural === 20,
                    isFumble: res?.isFumble || rawNatural === 1,
                    rolledAt: Date.now(),
                    rolledBy: user?.displayName || (role === 'dm' ? 'DM' : 'Player')
                };
            } catch (err) {
                console.error("Dice roll execution error:", err);
            }
        }

        // Fallback calculation if dice engine failed or returned void
        if (!rollResult) {
            const d1 = Math.floor(Math.random() * 20) + 1;
            const d2 = Math.floor(Math.random() * 20) + 1;
            let natural = d1;
            if (adv === 'adv') natural = Math.max(d1, d2);
            else if (adv === 'dis') natural = Math.min(d1, d2);

            rollResult = {
                total: natural + mod,
                natural: natural,
                formula: formula,
                advMode: adv,
                isCrit: natural === 20,
                isFumble: natural === 1,
                rolledAt: Date.now(),
                rolledBy: user?.displayName || (role === 'dm' ? 'DM' : 'Player')
            };
        }

        // Update participants list and save to Firebase
        const updatedParticipants = participants.map(p => {
            if (p.characterId === participant.characterId) {
                return { ...p, roll: rollResult };
            }
            return p;
        });

        const updatedData = {
            ...groupData,
            participants: updatedParticipants
        };

        if (onEditMessage) {
            await onEditMessage(msg.id, { content: JSON.stringify(updatedData) });
        }

        setIsRolling(prev => ({ ...prev, [participant.characterId]: false }));
    };

    // Manually type in dice roll result (e.g. from physical dice at table)
    const handleManualRoll = async (participant, rawInput) => {
        const val = parseInt(rawInput, 10);
        if (isNaN(val)) return;

        const mod = participant.modifier || 0;
        let natural = val;
        let total = val + mod;
        if (val > 20) {
            total = val;
            natural = Math.max(1, Math.min(20, total - mod));
        }

        const rollResult = {
            total: total,
            natural: natural,
            formula: `Manual (${natural}) ${mod >= 0 ? '+' : ''}${mod}`,
            advMode: getAdvMode(participant.characterId),
            isCrit: natural === 20,
            isFumble: natural === 1,
            isManual: true,
            rolledAt: Date.now(),
            rolledBy: `${user?.displayName || (role === 'dm' ? 'DM' : 'Player')} (Manual)`
        };

        const updatedParticipants = participants.map(p => {
            if (p.characterId === participant.characterId) {
                return { ...p, roll: rollResult };
            }
            return p;
        });

        const updatedData = {
            ...groupData,
            participants: updatedParticipants
        };

        if (onEditMessage) {
            await onEditMessage(msg.id, { content: JSON.stringify(updatedData) });
        }

        setShowManualInput(prev => ({ ...prev, [participant.characterId]: false }));
        setManualInputs(prev => ({ ...prev, [participant.characterId]: '' }));
    };

    // DM: Roll all unrolled participants at once
    const handleRollAllRemaining = async () => {
        const unrolled = participants.filter(p => !p.roll);
        if (unrolled.length === 0) return;

        const updatedParticipants = [...participants];

        for (let i = 0; i < updatedParticipants.length; i++) {
            const p = updatedParticipants[i];
            if (!p.roll) {
                const mod = p.modifier || 0;
                const natural = Math.floor(Math.random() * 20) + 1;
                updatedParticipants[i] = {
                    ...p,
                    roll: {
                        total: natural + mod,
                        natural: natural,
                        formula: `1d20${mod >= 0 ? '+' + mod : mod}`,
                        advMode: 'normal',
                        isCrit: natural === 20,
                        isFumble: natural === 1,
                        rolledAt: Date.now(),
                        rolledBy: 'Dungeon Master'
                    }
                };
            }
        }

        const updatedData = {
            ...groupData,
            participants: updatedParticipants
        };

        if (onEditMessage) {
            await onEditMessage(msg.id, { content: JSON.stringify(updatedData) });
        }
    };

    // Save Target DC
    const handleSaveDc = async () => {
        const parsed = parseInt(dcInput, 10);
        const newDc = isNaN(parsed) || parsed <= 0 ? null : parsed;
        const updatedData = {
            ...groupData,
            dc: newDc
        };
        if (onEditMessage) {
            await onEditMessage(msg.id, { content: JSON.stringify(updatedData) });
        }
        setEditingDc(false);
    };

    // Determine if current user can roll for character
    const canRollCharacter = (participant) => {
        if (role === 'dm') return true;
        if (user?.uid && participant.ownerId === user.uid) return true;
        if (user?.uid && participant.assignedUid === user.uid) return true;
        // Fallback: check dynamic assignments
        if (assignments && user?.uid && assignments[user.uid] && String(assignments[user.uid]) === String(participant.characterId)) {
            return true;
        }
        return false;
    };

    // Skill icon selector
    const getHeaderIcon = () => {
        const lower = rollType.toLowerCase();
        if (lower.includes('percep')) return 'eye';
        if (lower.includes('stealth')) return 'footprints';
        if (lower.includes('initiat')) return 'swords';
        if (lower.includes('investig')) return 'search';
        if (lower.includes('insight')) return 'brain';
        if (lower.includes('athlet')) return 'activity';
        if (lower.includes('acrobat')) return 'wind';
        if (lower.includes('save')) return 'shield';
        return 'dices';
    };

    return (
        <div className="w-full max-w-lg my-3 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-amber-500/40 shadow-2xl p-4 sm:p-5 relative overflow-hidden group">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-32 bg-amber-500/5 blur-3xl pointer-events-none -z-0" />
            
            {/* Top Bar: Title & Target DC */}
            <div className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-amber-500/20 relative z-10">
                <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-md">
                        <Icon name={getHeaderIcon()} size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base text-amber-300 font-serif tracking-wide">
                                {title}
                            </h3>
                            <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-400 font-bold">
                                {category === 'save' ? 'Saving Throw' : 'Group Check'}
                            </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>Called by <strong className="text-slate-300">{creatorName}</strong></span>
                            <span>•</span>
                            <span className="font-mono text-slate-500">{formatTime ? formatTime(msg.timestamp) : ''}</span>
                        </div>
                    </div>
                </div>

                {/* Target DC & DM Options */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {dc ? (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 text-xs font-bold font-mono">
                            <span>🎯 DC {dc}</span>
                            {role === 'dm' && (
                                <button
                                    onClick={() => { setDcInput(String(dc)); setEditingDc(true); }}
                                    className="text-indigo-400 hover:text-white ml-1"
                                    title="Edit DC"
                                >
                                    <Icon name="edit-2" size={11} />
                                </button>
                            )}
                        </div>
                    ) : (
                        role === 'dm' && !editingDc && (
                            <button
                                onClick={() => { setDcInput('15'); setEditingDc(true); }}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 text-[11px] font-bold border border-slate-700 transition-colors flex items-center gap-1"
                                title="Set Target DC for this check"
                            >
                                <Icon name="target" size={12} /> Set DC
                            </button>
                        )
                    )}

                    {role === 'dm' && (
                        <button
                            onClick={() => onDeleteMessage && onDeleteMessage(msg.id)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete Group Roll Card"
                        >
                            <Icon name="trash-2" size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* DM Edit DC Inline Form */}
            {editingDc && role === 'dm' && (
                <div className="mb-3 p-2 bg-slate-950/80 border border-indigo-500/30 rounded-xl flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-bold">Target DC:</span>
                    <input
                        type="number"
                        min="1"
                        max="35"
                        value={dcInput}
                        onChange={(e) => setDcInput(e.target.value)}
                        placeholder="e.g. 15"
                        className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono font-bold"
                    />
                    <button
                        onClick={handleSaveDc}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-[11px]"
                    >
                        Save
                    </button>
                    <button
                        onClick={() => setEditingDc(false)}
                        className="px-2 py-1 text-slate-400 hover:text-slate-200 text-[11px]"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Participants Roster List */}
            <div className="space-y-2 relative z-10 mb-4">
                {participants.map((p) => {
                    const hasRolled = p.roll && typeof p.roll.total === 'number';
                    const canRoll = canRollCharacter(p);
                    const currentAdv = getAdvMode(p.characterId);
                    const modStr = p.modifier >= 0 ? `+${p.modifier}` : `${p.modifier}`;

                    let meetsDc = null;
                    if (hasRolled && dc) {
                        meetsDc = p.roll.total >= dc;
                    }

                    return (
                        <div
                            key={p.characterId}
                            className={`p-2.5 rounded-xl border transition-all ${
                                hasRolled
                                    ? meetsDc === true
                                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                                        : meetsDc === false
                                            ? 'bg-red-950/20 border-red-500/40'
                                            : 'bg-slate-800/60 border-slate-700/60'
                                    : canRoll
                                        ? 'bg-amber-950/20 border-amber-500/40'
                                        : 'bg-slate-900/50 border-slate-800/60'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                {/* Character Info & Modifier */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                    {p.characterAvatar ? (
                                        <img
                                            src={p.characterAvatar}
                                            alt={p.characterName}
                                            className="w-8 h-8 rounded-full object-cover border border-slate-700 shadow-sm shrink-0"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-300 text-xs shrink-0 shadow-sm">
                                            {(p.characterName || '?')[0].toUpperCase()}
                                        </div>
                                    )}

                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-200 text-xs truncate">
                                            {p.characterName}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {/* Exact Modifier Pill */}
                                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-amber-300">
                                                Mod: {modStr}
                                            </span>
                                            {p.roll?.rolledBy && hasRolled && (
                                                <span className="text-[9px] text-slate-500 truncate">
                                                    by {p.roll.rolledBy}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Rolled Result OR Roll Interactive Controls */}
                                <div className="shrink-0">
                                    {hasRolled ? (
                                        <div className="flex items-center gap-2 text-right">
                                            <div className="flex flex-col items-end">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-mono text-slate-400">
                                                        [{p.roll.natural}] {modStr} =
                                                    </span>
                                                    <span className={`text-lg font-black font-mono leading-none ${
                                                        p.roll.isCrit
                                                            ? 'text-amber-400 glow font-black'
                                                            : p.roll.isFumble
                                                                ? 'text-red-500 font-black'
                                                                : meetsDc === true
                                                                    ? 'text-emerald-400'
                                                                    : meetsDc === false
                                                                        ? 'text-red-400'
                                                                        : 'text-white'
                                                    }`}>
                                                        {p.roll.total}
                                                    </span>
                                                </div>

                                                {/* Crit / DC / Manual Result Badges */}
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    {p.roll.isManual && (
                                                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30" title="Manually typed roll result">
                                                            ⌨️ Manual
                                                        </span>
                                                    )}
                                                    {p.roll.isCrit && (
                                                        <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">
                                                            ✨ NAT 20
                                                        </span>
                                                    )}
                                                    {p.roll.isFumble && (
                                                        <span className="text-[9px] font-black uppercase text-red-400 tracking-wider">
                                                            💀 NAT 1
                                                        </span>
                                                    )}
                                                    {meetsDc === true && !p.roll.isCrit && (
                                                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-0.5">
                                                            <Icon name="check" size={10} /> Passed
                                                        </span>
                                                    )}
                                                    {meetsDc === false && !p.roll.isFumble && (
                                                        <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-0.5">
                                                            <Icon name="x" size={10} /> Failed
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* DM Reroll Button */}
                                            {role === 'dm' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRollParticipant(p)}
                                                    className="p-1 text-slate-500 hover:text-amber-300 rounded hover:bg-slate-800 transition-colors"
                                                    title="Reroll this character"
                                                >
                                                    <Icon name="rotate-ccw" size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ) : canRoll ? (
                                        /* Interactive Roll Controller for Eligible Player or DM */
                                        <div className="flex items-center gap-1.5">
                                            {showManualInput[p.characterId] ? (
                                                /* Manual Roll Input Form */
                                                <form
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        handleManualRoll(p, manualInputs[p.characterId]);
                                                    }}
                                                    className="flex items-center gap-1 bg-slate-900 border border-amber-500/60 rounded-lg p-0.5 shadow-md animate-in fade-in zoom-in-95 duration-100"
                                                >
                                                    <span className="text-[10px] text-amber-400 pl-1 font-mono font-bold">1d20:</span>
                                                    <input
                                                        type="number"
                                                        autoFocus
                                                        min="1"
                                                        max="99"
                                                        placeholder="Roll..."
                                                        value={manualInputs[p.characterId] ?? ''}
                                                        onChange={(e) => setManualInputs(prev => ({ ...prev, [p.characterId]: e.target.value }))}
                                                        className="w-14 h-6 bg-slate-950 rounded text-center font-mono text-xs font-bold text-amber-300 border border-slate-700 outline-none focus:border-amber-400 placeholder:text-slate-600"
                                                    />
                                                    <button
                                                        type="submit"
                                                        disabled={!manualInputs[p.characterId]}
                                                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white rounded text-xs font-bold transition-colors"
                                                        title="Submit manual roll"
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowManualInput(prev => ({ ...prev, [p.characterId]: false }))}
                                                        className="px-1 text-slate-500 hover:text-slate-300 text-xs"
                                                        title="Cancel manual entry"
                                                    >
                                                        ✕
                                                    </button>
                                                </form>
                                            ) : (
                                                <>
                                                    {/* Advantage / Disadvantage Selector */}
                                                    <div className="flex bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden text-[9px] font-bold">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCharAdvMode(p.characterId, 'dis')}
                                                            className={`px-1.5 py-1 transition-colors ${currentAdv === 'dis' ? 'bg-red-900 text-red-200' : 'text-slate-500 hover:bg-slate-800'}`}
                                                            title="Disadvantage (Roll 2, Keep Lowest)"
                                                        >
                                                            DIS
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCharAdvMode(p.characterId, 'normal')}
                                                            className={`px-1.5 py-1 border-x border-slate-700/80 transition-colors ${currentAdv === 'normal' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-800'}`}
                                                            title="Normal (Roll 1d20)"
                                                        >
                                                            NORM
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCharAdvMode(p.characterId, 'adv')}
                                                            className={`px-1.5 py-1 transition-colors ${currentAdv === 'adv' ? 'bg-emerald-900 text-emerald-200' : 'text-slate-500 hover:bg-slate-800'}`}
                                                            title="Advantage (Roll 2, Keep Highest)"
                                                        >
                                                            ADV
                                                        </button>
                                                    </div>

                                                    {/* Main Roll Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRollParticipant(p)}
                                                        disabled={isRolling[p.characterId]}
                                                        className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Icon name="dices" size={13} className={isRolling[p.characterId] ? 'animate-spin' : ''} />
                                                        <span>Roll ({modStr})</span>
                                                    </button>

                                                    {/* Manual Type Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowManualInput(prev => ({ ...prev, [p.characterId]: true }))}
                                                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 border border-slate-700 rounded-lg text-xs transition-colors flex items-center justify-center"
                                                        title="Type manual roll (e.g. physical dice)"
                                                    >
                                                        <Icon name="keyboard" size={13} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        /* Waiting indicator for other players */
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                                            <Icon name="hourglass" size={12} className="animate-pulse text-amber-500/60" />
                                            <span>Waiting...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* DM Expedite Action: Roll All Remaining */}
            {role === 'dm' && stats.pendingCount > 0 && (
                <div className="mb-3 pt-2 border-t border-slate-800 flex justify-end">
                    <button
                        type="button"
                        onClick={handleRollAllRemaining}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                        <Icon name="fast-forward" size={13} /> Roll Remaining ({stats.pendingCount})
                    </button>
                </div>
            )}

            {/* Collective Group Result Summary Panel */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 relative z-10 space-y-2.5">
                {/* Progress Bar */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <span>Group Progress</span>
                        <span className="font-mono text-amber-400">
                            {stats.rolledCount} / {stats.totalCount} Rolled
                        </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${stats.totalCount > 0 ? (stats.rolledCount / stats.totalCount) * 100 : 0}%` }}
                        />
                    </div>
                </div>

                {/* Vitals Telemetry (Average, High, Low) */}
                {stats.rolledCount > 0 && (
                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                        <div className="bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg">
                            <div className="text-[9px] text-slate-400 uppercase tracking-widest">Party Average</div>
                            <div className="text-sm font-black text-amber-300 font-mono mt-0.5">{stats.average}</div>
                        </div>
                        <div className="bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg">
                            <div className="text-[9px] text-slate-400 uppercase tracking-widest">Highest</div>
                            <div className="text-sm font-black text-emerald-400 font-mono mt-0.5 truncate" title={stats.highest?.characterName}>
                                {stats.highest?.total} <span className="text-[10px] font-normal text-slate-400">({stats.highest?.characterName})</span>
                            </div>
                        </div>
                        <div className="bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg">
                            <div className="text-[9px] text-slate-400 uppercase tracking-widest">Lowest</div>
                            <div className="text-sm font-black text-slate-300 font-mono mt-0.5 truncate" title={stats.lowest?.characterName}>
                                {stats.lowest?.total} <span className="text-[10px] font-normal text-slate-400">({stats.lowest?.characterName})</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5e Group Check Resolution Banner */}
                {stats.rolledCount > 0 && dc !== null && (
                    <div className="pt-1">
                        {stats.groupSuccess === true ? (
                            <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/70 text-emerald-200 text-xs font-bold flex items-center justify-between gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] animate-in fade-in duration-300">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">🎉</span>
                                    <div>
                                        <div className="text-emerald-300 font-black tracking-wide">
                                            GROUP SUCCESS!
                                        </div>
                                        <div className="text-[11px] text-emerald-400/90 font-normal">
                                            Majority succeeded against DC {dc} ({stats.successCount} of {stats.totalCount} passed).
                                        </div>
                                    </div>
                                </div>
                                <Icon name="check-circle" size={20} className="text-emerald-400 shrink-0" />
                            </div>
                        ) : stats.isAllRolled && stats.groupSuccess === false ? (
                            <div className="p-2.5 rounded-xl bg-red-950/70 border border-red-500/70 text-red-200 text-xs font-bold flex items-center justify-between gap-2 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-in fade-in duration-300">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">⚠️</span>
                                    <div>
                                        <div className="text-red-300 font-black tracking-wide">
                                            GROUP FAILURE
                                        </div>
                                        <div className="text-[11px] text-red-400/90 font-normal">
                                            Less than half met DC {dc} ({stats.failureCount} failed).
                                        </div>
                                    </div>
                                </div>
                                <Icon name="x-circle" size={20} className="text-red-400 shrink-0" />
                            </div>
                        ) : (
                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
                                <span>Currently <strong>{stats.successCount} passed</strong>, <strong>{stats.failureCount} failed</strong>.</span>
                                <span className="text-slate-500 font-mono">Needs {stats.neededSuccesses} for group success</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GroupRollCard;

