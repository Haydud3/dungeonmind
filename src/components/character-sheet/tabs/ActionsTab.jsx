import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const ActionsTab = ({ onDiceRoll, onLogAction }) => {
    const { character, updateInfo } = useCharacterStore();
    const [showAdd, setShowAdd] = useState(false);
    const [newAction, setNewAction] = useState({ name: "", hit: "", dmg: "", type: "Melee", notes: "" });

    const handleRollAttack = async (action) => {
        if (!onDiceRoll) {
            alert("Dice Roller not connected!");
            return;
        }

        try {
            // 1. Roll d20
            const roll = await onDiceRoll(20); 

            if (typeof roll !== 'number') return;

            // 2. Calculate
            const hitMod = parseInt(action.hit) || 0;
            const total = roll + hitMod;

            // 3. Log
            const msg = `
                <div class="space-y-2">
                    <div class="font-bold text-white text-base border-b border-slate-700 pb-1 flex justify-between">
                        <span>${action.name}</span>
                        <span class="text-xs text-slate-400 font-normal self-end">${action.type}</span>
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

        } catch (e) {
            console.error("Roll interrupted", e);
        }
    };

    const handleRollDamage = async (e, action) => {
        e.stopPropagation(); // Stop the click from triggering the Attack Roll
        
        if (!onDiceRoll || !action.dmg) return;

        // Regex to parse "2d6 + 3" or "1d8 Necrotic"
        // Captures: 1: Count, 2: Die, 3: Sign (optional), 4: Mod (optional)
        const diceRegex = /(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/;
        const match = action.dmg.match(diceRegex);

        if (match) {
            const count = parseInt(match[1], 10);
            const die = parseInt(match[2], 10);
            const sign = match[3] === '-' ? -1 : 1;
            const mod = parseInt(match[4], 10) || 0;
            
            let rollTotal = 0;
            const rolls = [];

            // Roll dice sequentially
            for(let i=0; i<count; i++) {
                const r = await onDiceRoll(die);
                if (typeof r === 'number') {
                    rolls.push(r);
                    rollTotal += r;
                }
            }

            const total = rollTotal + (sign * mod);
            
            // Remove the formula from the string to get the type (e.g. "Necrotic")
            const damageType = action.dmg.replace(match[0], '').trim();

            // Format Log
            const msg = `
                <div class="space-y-1">
                    <div class="font-bold text-red-400 border-b border-red-900/30 pb-1 mb-1 flex justify-between">
                        <span>${action.name} Damage</span>
                        <span class="text-xs text-slate-500 font-normal self-end">${damageType}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                        <span class="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs font-mono">${match[0]}</span>
                        <span>➜</span>
                        <span class="font-mono text-xs text-slate-400">
                            [${rolls.join('+')}]${mod ? (sign > 0 ? '+'+mod : '-'+mod) : ''}
                        </span>
                        <span>=</span>
                        <span class="text-xl text-red-500 font-bold">${total}</span>
                    </div>
                </div>
            `;
            if (onLogAction) onLogAction(msg);
        } else {
            console.warn("Could not parse damage string:", action.dmg);
        }
    };

    const addAction = () => {
        if (!newAction.name) return;
        const currentActions = character.customActions || [];
        updateInfo('customActions', [...currentActions, newAction]);
        setShowAdd(false);
        setNewAction({ name: "", hit: "", dmg: "", type: "Melee", notes: "" });
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
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-500">Name</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.name} onChange={e => setNewAction({...newAction, name: e.target.value})} placeholder="e.g. Longsword" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Hit Bonus</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.hit} onChange={e => setNewAction({...newAction, hit: e.target.value})} placeholder="+5" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Damage</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm" value={newAction.dmg} onChange={e => setNewAction({...newAction, dmg: e.target.value})} placeholder="1d8+3" />
                        </div>
                    </div>
                    <button onClick={addAction} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded text-sm shadow">Save Action</button>
                </div>
            )}

            <div className="grid gap-3">
                {actions.length === 0 && <div className="text-center text-slate-500 py-8 bg-slate-900/50 rounded border border-dashed border-slate-800">No actions found. Import PDF or add custom.</div>}
                
                {actions.map((act, i) => (
                    <div key={i} onClick={() => handleRollAttack(act)} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center gap-4 shadow-sm hover:border-amber-500 hover:shadow-md cursor-pointer transition-all group active:scale-[0.98]">
                        <div className="bg-slate-900 w-12 h-12 rounded-lg flex flex-col items-center justify-center border border-slate-700 group-hover:border-amber-500/50 transition-colors">
                            <span className="text-[9px] text-slate-500 uppercase font-bold">HIT</span>
                            <span className="text-lg font-bold text-amber-500">{act.hit && !act.hit.includes('+') && parseInt(act.hit) > 0 ? `+${act.hit}` : act.hit}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-200 truncate">{act.name}</div>
                            <div className="text-xs text-slate-400 truncate">{act.notes || act.type}</div>
                        </div>
                        <div className="text-right">
                            {/* CLICKABLE DAMAGE BOX */}
                            <div 
                                onClick={(e) => handleRollDamage(e, act)}
                                className="text-sm font-bold text-slate-300 bg-slate-900/50 px-2 py-1 rounded hover:bg-red-900/40 hover:text-red-200 hover:border-red-500/30 border border-transparent transition-colors z-10 relative"
                                title="Click to Roll Damage"
                            >
                                {act.dmg || "No Dmg"}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ActionsTab;