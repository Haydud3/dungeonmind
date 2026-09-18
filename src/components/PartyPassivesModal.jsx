import React, { useState } from 'react';
import Icon from './Icon';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { createGroupRollPayload, ALL_SKILLS, ALL_ABILITIES } from '../utils/groupRollUtils';

export const PartyPassivesModal = ({
    isOpen,
    onClose,
    players = [],
    onDiceRoll = null,
    onLogAction = null
}) => {
    // All hooks must be called unconditionally at top of component
    const [groupRollStatus, setGroupRollStatus] = useState(null);
    const [showCustomRoll, setShowCustomRoll] = useState(false);
    const [customCategory, setCustomCategory] = useState('skill'); // 'skill' | 'save' | 'ability'
    const [customSelection, setCustomSelection] = useState('Perception');
    const [customDc, setCustomDc] = useState('');

    const campaignContext = useNewCampaign ? useNewCampaign() : {};
    const sendMessage = campaignContext?.sendMessage;
    const user = campaignContext?.user;
    const campaign = campaignContext?.campaign;
    const role = campaignContext?.role;

    if (!isOpen) return null;

    // Helper calculation functions
    const getMod = (score) => Math.floor(((score || 10) - 10) / 2);

    const getProfBonus = (p) => {
        if (p.profBonus) return p.profBonus;
        const lvl = parseInt(p.level, 10) || 1;
        return Math.floor((lvl - 1) / 4) + 2;
    };

    const getPassive = (p, skillName, statKey) => {
        const stats = p.stats || {};
        const mod = p.modifiers?.[statKey] ?? getMod(stats[statKey]);
        const prof = getProfBonus(p);
        const isProf = p.skills?.[skillName] || p.skills?.[skillName.toLowerCase()];
        return 10 + mod + (isProf ? prof : 0);
    };

    const getSaveMod = (p, statKey) => {
        const stats = p.stats || {};
        const mod = p.modifiers?.[statKey] ?? getMod(stats[statKey]);
        const prof = getProfBonus(p);
        const isProf = p.savingThrows?.[statKey] || p.savingThrows?.[statKey.toLowerCase()];
        return mod + (isProf ? prof : 0);
    };

    // Calculate highest passives for highlighting
    const highestPerception = Math.max(...players.map(p => getPassive(p, 'Perception', 'wis')), 10);
    const highestInsight = Math.max(...players.map(p => getPassive(p, 'Insight', 'wis')), 10);
    const highestInvestigation = Math.max(...players.map(p => getPassive(p, 'Investigation', 'int')), 10);

    const handlePromptGroupRoll = async (rollType, category = 'skill', targetDc = null) => {
        if (players.length === 0) return;

        setGroupRollStatus(`Dispatching Group ${rollType} prompt to chat...`);

        const payload = createGroupRollPayload({
            rollType,
            category,
            dc: targetDc,
            players,
            assignments: campaign?.assignments || {},
            user,
            role: role || 'dm'
        });

        try {
            if (sendMessage) {
                await sendMessage({
                    type: 'group-roll',
                    role: 'group-roll',
                    senderId: user?.uid || 'dm',
                    senderName: user?.displayName || (role === 'dm' ? 'Dungeon Master' : 'Player'),
                    timestamp: Date.now(),
                    content: JSON.stringify(payload)
                });
            }

            if (onLogAction) {
                onLogAction(`🎲 Called Group ${rollType} ${category === 'save' ? 'Save' : 'Check'}${targetDc ? ` (DC ${targetDc})` : ''} — Check chat to roll!`);
            }

            setGroupRollStatus(`✓ Group ${rollType} prompt sent to chat!`);
            setShowCustomRoll(false);
            setTimeout(() => setGroupRollStatus(null), 4000);
        } catch (e) {
            console.error("Failed to post group roll to chat:", e);
            setGroupRollStatus("Error dispatching to chat");
            setTimeout(() => setGroupRollStatus(null), 3000);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                            <Icon name="eye" size={20}/>
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl fantasy-font text-white flex items-center gap-2">
                                Party Passives &amp; Senses Inspector
                            </h2>
                            <p className="text-[11px] text-slate-400">
                                Compare passive awareness, defenses, and saving throws across all active heroes.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <Icon name="x" size={20}/>
                    </button>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-x-auto overflow-y-auto custom-scroll p-4 sm:p-6">
                    {players.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <Icon name="users" size={48} className="mx-auto text-slate-600 mb-2 opacity-40"/>
                            <p className="font-bold text-slate-400">No Heroes in Party</p>
                            <p className="text-xs text-slate-500">Add heroes to view their passive statistics.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-950/40">
                                    <th className="p-3">Hero</th>
                                    <th className="p-3 text-center">AC</th>
                                    <th className="p-3 text-center">HP</th>
                                    <th className="p-3 text-center">
                                        <span className="text-amber-400 flex items-center justify-center gap-1">
                                            <Icon name="eye" size={12}/> Pass. Perception
                                        </span>
                                    </th>
                                    <th className="p-3 text-center">
                                        <span className="text-blue-400 flex items-center justify-center gap-1">
                                            <Icon name="search" size={12}/> Pass. Invest.
                                        </span>
                                    </th>
                                    <th className="p-3 text-center">
                                        <span className="text-purple-400 flex items-center justify-center gap-1">
                                            <Icon name="brain" size={12}/> Pass. Insight
                                        </span>
                                    </th>
                                    <th className="p-3 text-center">STR</th>
                                    <th className="p-3 text-center">DEX</th>
                                    <th className="p-3 text-center">CON</th>
                                    <th className="p-3 text-center">INT</th>
                                    <th className="p-3 text-center">WIS</th>
                                    <th className="p-3 text-center">CHA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {players.map((p) => {
                                    const passPerc = getPassive(p, 'Perception', 'wis');
                                    const passInvest = getPassive(p, 'Investigation', 'int');
                                    const passInsight = getPassive(p, 'Insight', 'wis');

                                    const hpCur = typeof p.hp === 'object' ? (p.hp?.current ?? p.hp?.max ?? 20) : (p.hp || 20);
                                    const hpMax = typeof p.hp === 'object' ? (p.hp?.max ?? 20) : (p.maxHp || 20);
                                    const acVal = typeof p.ac === 'object' ? (p.ac?.value || 10) : (p.ac || 10);

                                    return (
                                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                                            {/* Name & Avatar */}
                                            <td className="p-3 flex items-center gap-2.5 min-w-[160px]">
                                                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-300">
                                                    {p.image ? (
                                                        <img src={p.image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        p.name?.[0] || '?'
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-slate-200 truncate">{p.name}</div>
                                                    <div className="text-[10px] text-slate-400 truncate">
                                                        Lvl {p.level || 1} {p.class || 'Hero'}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* AC */}
                                            <td className="p-3 text-center font-mono font-bold text-slate-200">
                                                <span className="px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-900/40">
                                                    {acVal}
                                                </span>
                                            </td>

                                            {/* HP */}
                                            <td className="p-3 text-center font-mono">
                                                <span className={`px-2 py-0.5 rounded font-bold ${
                                                    hpCur <= 0 ? 'bg-red-950 text-red-300 border border-red-800' :
                                                    hpCur / hpMax <= 0.5 ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50' :
                                                    'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                                                }`}>
                                                    {hpCur}/{hpMax}
                                                </span>
                                            </td>

                                            {/* Passive Perception */}
                                            <td className="p-3 text-center font-mono font-bold">
                                                <span className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${
                                                    passPerc === highestPerception && players.length > 1
                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                                                        : 'bg-slate-800/70 text-slate-300 border border-slate-700'
                                                }`}>
                                                    {passPerc}
                                                    {passPerc === highestPerception && players.length > 1 && (
                                                        <span className="text-[10px]" title="Party Highest Awareness">★</span>
                                                    )}
                                                </span>
                                            </td>

                                            {/* Passive Investigation */}
                                            <td className="p-3 text-center font-mono font-bold">
                                                <span className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${
                                                    passInvest === highestInvestigation && players.length > 1
                                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-sm'
                                                        : 'bg-slate-800/70 text-slate-300 border border-slate-700'
                                                }`}>
                                                    {passInvest}
                                                </span>
                                            </td>

                                            {/* Passive Insight */}
                                            <td className="p-3 text-center font-mono font-bold">
                                                <span className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${
                                                    passInsight === highestInsight && players.length > 1
                                                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-sm'
                                                        : 'bg-slate-800/70 text-slate-300 border border-slate-700'
                                                }`}>
                                                    {passInsight}
                                                </span>
                                            </td>

                                            {/* Saves (STR, DEX, CON, INT, WIS, CHA) */}
                                            {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => {
                                                const sMod = getSaveMod(p, k);
                                                const isProf = p.savingThrows?.[k] || p.savingThrows?.[k.toUpperCase()];
                                                return (
                                                    <td key={k} className="p-3 text-center font-mono">
                                                        <span className={`text-[11px] ${
                                                            isProf ? 'font-extrabold text-amber-300' : 'text-slate-400'
                                                        }`}>
                                                            {sMod >= 0 ? `+${sMod}` : sMod}
                                                            {isProf ? '★' : ''}
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer Controls & Group Rolls */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        {groupRollStatus && (
                            <span className="text-xs text-amber-300 font-mono animate-pulse flex items-center gap-1.5">
                                <Icon name="dices" size={14}/> {groupRollStatus}
                            </span>
                        )}
                        {!groupRollStatus && (
                            <span className="text-xs text-slate-500">
                                Click below to prompt group checks directly into campaign chat.
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => handlePromptGroupRoll('Perception', 'skill')}
                            disabled={players.length === 0}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 rounded-xl text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                            title="Prompt players in chat for Group Perception check"
                        >
                            <Icon name="eye" size={14}/> Group Perception
                        </button>
                        <button
                            type="button"
                            onClick={() => handlePromptGroupRoll('Stealth', 'skill')}
                            disabled={players.length === 0}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 rounded-xl text-xs font-bold border border-indigo-500/30 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                            title="Prompt players in chat for Group Stealth check"
                        >
                            <Icon name="footprints" size={14}/> Group Stealth
                        </button>
                        <button
                            type="button"
                            onClick={() => handlePromptGroupRoll('Initiative', 'initiative')}
                            disabled={players.length === 0}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 rounded-xl text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                            title="Prompt players in chat for Group Initiative"
                        >
                            <Icon name="swords" size={14}/> Group Initiative
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCustomRoll(prev => !prev)}
                            disabled={players.length === 0}
                            className="px-3 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                            title="Configure custom group skill or save with target DC"
                        >
                            <Icon name="sliders" size={14}/> Custom Check...
                        </button>
                    </div>
                </div>

                {/* Custom Group Check Popover Drawer */}
                {showCustomRoll && (
                    <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-end gap-3 animate-in slide-in-from-bottom-2 duration-150">
                        {/* Category Selector */}
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Check Type</label>
                            <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden text-xs">
                                {['skill', 'save', 'ability'].map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => {
                                            setCustomCategory(cat);
                                            setCustomSelection(cat === 'skill' ? 'Perception' : cat === 'save' ? 'Dexterity' : 'Strength');
                                        }}
                                        className={`px-3 py-1.5 font-bold uppercase text-[10px] tracking-wider transition-colors ${
                                            customCategory === cat ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Skill / Save Selection Dropdown */}
                        <div className="flex-1 min-w-[140px]">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Select Check / Save</label>
                            <select
                                value={customSelection}
                                onChange={(e) => setCustomSelection(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                            >
                                {customCategory === 'skill' && ALL_SKILLS.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                                {customCategory === 'save' && ALL_ABILITIES.map(a => (
                                    <option key={a} value={a}>{a} Saving Throw</option>
                                ))}
                                {customCategory === 'ability' && ALL_ABILITIES.map(a => (
                                    <option key={a} value={a}>{a} Check</option>
                                ))}
                            </select>
                        </div>

                        {/* Target DC */}
                        <div className="w-24">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Target DC (opt)</label>
                            <input
                                type="number"
                                min="1"
                                max="35"
                                placeholder="e.g. 15"
                                value={customDc}
                                onChange={(e) => setCustomDc(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-center text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500 font-mono"
                            />
                        </div>

                        {/* Dispatch Button */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handlePromptGroupRoll(customSelection, customCategory, customDc)}
                                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
                            >
                                <Icon name="send" size={13}/> Prompt in Chat
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCustomRoll(false)}
                                className="px-2.5 py-2 text-slate-400 hover:text-white text-xs"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default PartyPassivesModal;

