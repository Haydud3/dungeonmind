import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const ActionsTab = ({ onDiceRoll, onLogAction }) => {
    const { character, updateInfo } = useCharacterStore();
    const [showAdd, setShowAdd] = useState(false);
    const [newAction, setNewAction] = useState({ name: "", hit: "", dmg: "", type: "Melee", time: "1A", notes: "" });

    // Helper to determine time badge style
    const getTimeBadge = (act) => {
        const t = (act.time || "").toLowerCase();
        const n = (act.notes || "").toLowerCase();
        
        if (t.includes('ba') || t.includes('bonus') || n.includes('bonus action')) {
            return { label: 'BONUS', color: 'bg-orange-900/50 text-orange-200 border-orange-700' };
        }
        if (t.includes('r') || t.includes('reaction') || n.includes('reaction')) {
            return { label: 'REACTION', color: 'bg-slate-600 text-slate-200 border-slate-500' };
        }
        return { label: 'ACTION', color: 'bg-slate-800 text-slate-400 border-slate-700' };
    };

    const handleRollAttack = async (action) => {
        if (!onDiceRoll) { alert("Dice Roller not connected!"); return; }

        try {
            const roll = await onDiceRoll(20); 
            if (typeof roll !== 'number') return;

            const hitMod = parseInt(action.hit) || 0;
            const total = roll + hitMod;

            const msg = `
                <div class="space-y-2">
                    <div class="font-bold text-white text-base border-b border-slate-700 pb-1 flex justify-between">
                        <span>${action.name}</span>
                        <span class="text-xs text-slate-400 font-normal self-end">${action.type || 'Action'}</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-slate-300">
                        <span class="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs font-mono">d20${hitMod >= 0 ? '+' : ''}${hitMod}</span>
                        <span>➜</span>
                        <span class="font-mono"><strong>${roll}</strong> ${hitMod >= 0 ? '+' : ''} ${Math.abs(hitMod)}</span>
                        <span>=</span>
                        <span class="text-xl text-amber-500 font-bold glow">${total}</span>
                    </div>
                    ${action.dmg ? `<div class="text-xs text-slate-400 flex items-center gap-2 mt-1"><Icon name="sword" size={12}/> <span>Attack Roll Complete</span></div>` : ''}
                </div>
            `;
            if (onLogAction) onLogAction(msg);
        } catch (e) { console.error("Roll interrupted", e); }
    };

    const handleRollDamage = async (e, action) => {
        e.stopPropagation();
        if (!onDiceRoll || !action.dmg) return;

        const diceRegex = /(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/;
        const match = action.dmg.match(diceRegex);

        if (match) {
            const count = parseInt(match[1], 10);
            const die = parseInt(match[2], 10);
            const sign = match[3] === '-' ? -1 : 1;
            const mod = parseInt(match[4], 10) || 0;
            
            let rollTotal = 0;
            const rolls = [];

            for(let i=0; i<count; i++) {
                const r = await onDiceRoll(die);
                if (typeof r === 'number') {
                    rolls.push(r);
                    rollTotal += r;
                }
            }

            const total = rollTotal + (sign * mod);
            const damageType = action.dmg.replace(match[0], '').trim();

            const msg = `
                <div class="space-y-1">
                    <div class="font-bold text-red-400 border-b border-red-900/30 pb-1 mb-1 flex justify-between">
                        <span>${action.name} Damage</span>
                        <span class="text-xs text-slate-500 font-normal self-end">${damageType}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                        <span class="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs font-mono">${match[0]}</span>
                        <span>➜</span>
                        <span class="font-mono text-xs text-slate-400">[${rolls.join('+')}]${mod ? (sign > 0 ? '+'+mod : '-'+mod) : ''}</span>
                        <span>=</span>
                        <span class="text-xl text-red-500 font-bold">${total}</span>
                    </div>
                </div>
            `;
            if (onLogAction) onLogAction(msg);
        } else {
            if (onLogAction) onLogAction(`<div class="text-red-400 font-bold">${action.name}: ${action.dmg}</div>`);
        }
    };

    const toggleUse = (actionIndex, currentUses) => {
        const newActions = [...character.customActions];
        const action = newActions[actionIndex];
        
        if (action.uses) {
            // Decrement, or reset if at 0 (optional logic, usually just stop at 0)
            if (action.uses.current > 0) {
                action.uses.current -= 1;
            } else {
                // Optional: Allow resetting to max by clicking again or handled via Long Rest button elsewhere
                action.uses.current = action.uses.max; 
            }
            updateInfo('customActions', newActions);
        }
    };

    const addAction = () => {
        if (!newAction.name) return;
        const currentActions = character.customActions || [];
        updateInfo('customActions', [...currentActions, newAction]);
        setShowAdd(false);
        setNewAction({ name: "", hit: "", dmg: "", type: "Melee", time: "1A", notes: "" });
    };

    const deleteAction = (index, e) => {
        e.stopPropagation();
        if(!confirm("Remove action?")) return;
        const currentActions = character.customActions || [];
        updateInfo('customActions', currentActions.filter((_, i) => i !== index));
    };

    const actions = character.customActions || [];

    return (
        <div className="space-y-4 pb-20">
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex justify-between items-center shadow-sm">
                <span className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Icon name="sword" size={16}/> Weapons & Actions
                </span>
                <button onClick={() => setShowAdd(!showAdd)} className="text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded text-white flex items-center gap-1 font-bold shadow transition-all">
                    <Icon name="plus" size={12}/> Custom
                </button>
            </div>

            {showAdd && (
                <div className="bg-slate-800/50 p-4 rounded-lg border border-indigo-500/50 animate-in slide-in-from-top-2">
                    {/* (Same add form as before) */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-500">Name</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.name} onChange={e => setNewAction({...newAction, name: e.target.value})} placeholder="e.g. Second Wind" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Hit Bonus</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.hit} onChange={e => setNewAction({...newAction, hit: e.target.value})} placeholder="+5 (Optional)" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Damage/Effect</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.dmg} onChange={e => setNewAction({...newAction, dmg: e.target.value})} placeholder="1d10+2" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Type</label>
                            <select className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.time} onChange={e => setNewAction({...newAction, time: e.target.value})}>
                                <option value="1A">Action</option>
                                <option value="1BA">Bonus Action</option>
                                <option value="1R">Reaction</option>
                                <option value="">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Notes</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.notes} onChange={e => setNewAction({...newAction, notes: e.target.value})} placeholder="Regain HP..." />
                        </div>
                    </div>
                    <button onClick={addAction} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded text-sm shadow">Save Action</button>
                </div>
            )}

            <div className="grid gap-3">
                {actions.length === 0 && <div className="text-center text-slate-500 py-8 bg-slate-900/50 rounded border border-dashed border-slate-800">No actions found.</div>}
                
                {actions.map((act, i) => {
                    const badge = getTimeBadge(act);
                    return (
                        <div key={i} onClick={() => handleRollAttack(act)} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex flex-col gap-2 shadow-sm hover:border-amber-500 hover:shadow-md cursor-pointer transition-all group active:scale-[0.98] relative">
                            
                            {/* Top Row: Icon/Hit, Name, Badge, Delete */}
                            <div className="flex items-center gap-3">
                                <div className="bg-slate-900 w-10 h-10 rounded-lg flex flex-col items-center justify-center border border-slate-700 group-hover:border-amber-500/50 transition-colors shrink-0">
                                    {act.hit ? (
                                        <>
                                            <span className="text-[8px] text-slate-500 uppercase font-bold">HIT</span>
                                            <span className="text-sm font-bold text-amber-500">{!act.hit.includes('+') && parseInt(act.hit) > 0 ? `+${act.hit}` : act.hit}</span>
                                        </>
                                    ) : (
                                        <Icon name="zap" size={16} className="text-slate-500"/>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div className="font-bold text-slate-200 truncate">{act.name}</div>
                                        <button onClick={(e) => deleteAction(i, e)} className="text-slate-600 hover:text-red-500 p-1"><Icon name="x" size={12}/></button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${badge.color}`}>{badge.label}</span>
                                        {act.notes && <span className="text-xs text-slate-400 truncate max-w-[150px]">{act.notes}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Row: Uses & Damage */}
                            {(act.dmg || act.uses) && (
                                <div className="flex justify-between items-center pt-2 border-t border-slate-700/50 mt-1">
                                    {/* USES TRACKER */}
                                    {act.uses ? (
                                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                            {Array.from({ length: act.uses.max }).map((_, idx) => (
                                                <div 
                                                    key={idx}
                                                    onClick={() => toggleUse(i)} 
                                                    className={`w-3 h-3 rounded-full border border-slate-500 cursor-pointer ${idx < act.uses.current ? 'bg-green-500 border-green-400' : 'bg-slate-800'}`}
                                                    title={`${act.uses.current}/${act.uses.max} Uses`}
                                                />
                                            ))}
                                            <span className="text-[9px] text-slate-500 ml-1 self-center">{act.uses.recovery}</span>
                                        </div>
                                    ) : <div></div>}

                                    {/* DAMAGE BUTTON */}
                                    {act.dmg && (
                                        <div 
                                            onClick={(e) => handleRollDamage(e, act)}
                                            className="text-xs font-bold text-slate-300 bg-slate-900/80 px-2 py-1 rounded hover:bg-red-900/40 hover:text-red-200 border border-transparent hover:border-red-500/30 transition-colors"
                                        >
                                            {act.dmg}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ActionsTab;