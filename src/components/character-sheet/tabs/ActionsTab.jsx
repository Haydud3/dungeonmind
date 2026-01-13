import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const ActionsTab = ({ onDiceRoll, onLogAction }) => {
    const { character, updateInfo } = useCharacterStore();
    const [showAdd, setShowAdd] = useState(false);
    const [newAction, setNewAction] = useState({ name: "", hit: "", dmg: "", type: "Action", category: "Attack", notes: "" });
    
    // Edit State
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // --- 1. DATA GATHERING & MERGING ---
    
    // A. Inventory (Equipped Weapons) - FIXED VARIABLE NAME HERE
    const inventoryActions = (character.inventory || [])
        .filter(item => item.equipped && item.combat)
        .map(item => ({
            ...item.combat,
            name: item.name,
            id: `item-${item.name}`,
            source: "item",
            notes: item.combat.notes || item.desc
        }));

    // B. Spells (Directly from Spellbook)
    const spellActions = (character.spells || [])
        .filter(spell => {
            const t = (spell.time || "").toLowerCase();
            return spell.hit || spell.dmg || t.includes("bonus") || t.includes("reaction");
        })
        .map(spell => ({
            name: spell.name,
            id: `spell-${spell.name}`,
            hit: spell.hit,
            dmg: spell.dmg,
            type: spell.time?.toLowerCase().includes("bonus") ? "Bonus Action" : 
                  spell.time?.toLowerCase().includes("reaction") ? "Reaction" : "Action",
            category: "Spell",
            range: spell.range,
            desc: spell.desc,
            source: "spell"
        }));

    // C. Custom Features
    const customActions = (character.customActions || []).map(act => ({
        ...act,
        id: `custom-${act.name}`,
        source: "custom"
    }));

    // --- 2. DEDUPLICATION & MERGE ---
    const uniqueMap = new Map();
    // Spread spellActions first so they take priority if names collide
    [...spellActions, ...inventoryActions, ...customActions].forEach(action => {
        const key = action.name.trim().toLowerCase();
        if (!uniqueMap.has(key)) uniqueMap.set(key, action);
    });
    const allActions = Array.from(uniqueMap.values());

    // --- 3. CATEGORIZATION ---
    const isReaction = (a) => (a.type || "").toLowerCase().includes("reaction");
    const isBonus = (a) => (a.type || "").toLowerCase().includes("bonus");

    const reactions = allActions.filter(isReaction);
    const bonusActions = allActions.filter(a => !reactions.includes(a) && isBonus(a));
    
    // Attacks = Has Hit/Dmg OR is explicitly an Attack, BUT NOT a bonus/reaction
    const attacks = allActions.filter(a => 
        !reactions.includes(a) && 
        !bonusActions.includes(a) && 
        (a.hit || a.dmg || a.category === "Attack")
    );

    const otherFeatures = allActions.filter(a => !reactions.includes(a) && !bonusActions.includes(a) && !attacks.includes(a));

    // --- 4. HANDLERS ---
    const handleRoll = async (action, type, e) => {
        if(e) e.stopPropagation();
        if (!onDiceRoll) return alert("Dice connection missing.");

        if (type === 'hit') {
            const roll = await onDiceRoll(20);
            const mod = parseInt(action.hit) || 0;
            const total = roll + mod;
            const isCrit = roll === 20;
            const isFail = roll === 1;
            
            onLogAction && onLogAction(`
                <div class="space-y-1">
                    <div class="font-bold text-cyan-400 border-b border-cyan-900/50 pb-1 flex justify-between">
                        <span>${action.name}</span>
                        <span class="text-xs text-slate-500 font-normal self-end">Attack</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-slate-300">
                        <span class="bg-slate-800 px-2 py-1 rounded text-xs font-mono">d20 ${mod >= 0 ? '+' : ''}${mod}</span>
                        <span>➜</span>
                        <span class="font-mono text-slate-400">${roll}</span>
                        <span>=</span>
                        <span class="text-2xl font-bold ${isCrit ? 'text-green-400 glow' : isFail ? 'text-red-500' : 'text-white'}">${total}</span>
                    </div>
                </div>
            `);
        } 
        else if (type === 'dmg') {
            const regex = /(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/;
            const match = action.dmg.match(regex);
            
            if (match) {
                const [fullStr, count, die, sign, modVal] = match;
                const typeLabel = action.dmg.replace(fullStr, '').trim();
                
                let rollTotal = 0;
                const rolls = [];
                for(let i=0; i<parseInt(count); i++) {
                    const r = await onDiceRoll(parseInt(die));
                    rolls.push(r);
                    rollTotal += r;
                }
                if(modVal) rollTotal += (sign === '-' ? -1 : 1) * parseInt(modVal);

                onLogAction && onLogAction(`
                    <div class="space-y-1">
                        <div class="font-bold text-indigo-400 border-b border-indigo-900/50 pb-1 flex justify-between">
                            <span>${action.name}</span>
                            <span class="text-xs text-slate-500 font-normal self-end">${typeLabel || 'Damage'}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                            <span class="bg-slate-800 px-2 py-1 rounded text-xs font-mono">${fullStr}</span>
                            <span>➜</span>
                            <span class="font-mono text-xs text-slate-400">[${rolls.join('+')}]${modVal ? (sign + modVal) : ''}</span>
                            <span>=</span>
                            <span class="text-2xl font-bold text-indigo-300">${rollTotal}</span>
                        </div>
                    </div>
                `);
            } else {
                onLogAction && onLogAction(`<div class="font-bold text-indigo-300">${action.name}: ${action.dmg}</div>`);
            }
        } 
        else {
            onLogAction && onLogAction(`
                <div class="bg-slate-800 p-2 rounded border-l-4 border-slate-600">
                    <div class="font-bold text-white">${character.name} uses ${action.name}</div>
                    <div class="text-xs text-slate-400 mt-1">${action.desc || action.notes || "No details."}</div>
                </div>
            `);
        }
    };

    const toggleUse = (actionId) => {
        // Only works for custom actions
        const newActions = [...(character.customActions || [])];
        const idx = newActions.findIndex(a => `custom-${a.name}` === actionId);
        if (idx > -1 && newActions[idx].uses) {
            const uses = newActions[idx].uses;
            if (uses.current > 0) uses.current--;
            else uses.current = uses.max;
            updateInfo('customActions', newActions);
        }
    };

    const deleteAction = (action) => {
        if(action.source !== 'custom') return alert("This is a Spell or Item. Remove it from those tabs.");
        if(!confirm(`Delete ${action.name}?`)) return;
        updateInfo('customActions', character.customActions.filter(a => a.name !== action.name));
    };

    const addAction = () => {
        if (!newAction.name) return;
        updateInfo('customActions', [...(character.customActions||[]), newAction]);
        setShowAdd(false);
        setNewAction({ name: "", hit: "", dmg: "", type: "Action", category: "Attack", notes: "" });
    };

    const startEdit = (action) => {
        if (action.source !== 'custom') return alert("Can only edit Custom Actions here.");
        setEditingId(action.id);
        setEditForm({ ...action });
    };

    const saveEdit = () => {
        const newActions = [...(character.customActions || [])];
        const idx = newActions.findIndex(a => `custom-${a.name}` === editingId);
        if (idx > -1) {
            newActions[idx] = { ...newActions[idx], ...editForm };
            updateInfo('customActions', newActions);
        }
        setEditingId(null);
    };

    // --- 5. ACTION ROW COMPONENT ---
    const ActionRow = ({ action }) => {
        const hasText = action.desc || action.notes;
        const [isExpanded, setIsExpanded] = useState(false);

        return (
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden transition-colors group relative mb-2">
                
                {/* Normal View */}
                {editingId !== action.id && (
                    <div className="p-3 flex justify-between items-center hover:border-indigo-500 border border-transparent rounded-lg">
                        
                        {/* LEFT: Info */}
                        <div className="overflow-hidden flex-1 cursor-pointer" onClick={() => hasText && setIsExpanded(!isExpanded)}>
                            <div className="font-bold text-slate-200 truncate flex items-center gap-2">
                                {action.name}
                                {action.isItem && <Icon name="backpack" size={12} className="text-slate-500"/>}
                                {action.source === 'spell' && <Icon name="sparkles" size={12} className="text-purple-400"/>}
                            </div>
                            <div className="text-xs text-slate-500 truncate flex gap-2">
                                <span>{action.type || "Action"}</span>
                                {action.range && <span>• {action.range}</span>}
                            </div>
                        </div>
                        
                        {/* RIGHT: Buttons */}
                        <div className="flex gap-2 items-center">
                            
                            {/* Uses Tracker */}
                            {action.uses && (
                                <div className="flex gap-1 mr-1" onClick={(e) => e.stopPropagation()}>
                                    {Array.from({ length: Math.min(5, action.uses.max) }).map((_, i) => (
                                        <div 
                                            key={i} 
                                            onClick={() => toggleUse(action.id)}
                                            className={`w-2.5 h-2.5 rounded-full border cursor-pointer transition-colors ${i < action.uses.current ? 'bg-amber-500 border-amber-600' : 'bg-slate-900 border-slate-600'}`} 
                                        />
                                    ))}
                                </div>
                            )}

                            {/* HIT Button */}
                            {action.hit && (
                                <button 
                                    onClick={(e) => handleRoll(action, 'hit', e)}
                                    className="h-7 px-2 rounded bg-slate-700 hover:bg-cyan-900 text-cyan-200 border border-slate-600 hover:border-cyan-500 text-xs font-bold font-mono transition-colors" 
                                    title="Roll Attack"
                                >
                                    {action.hit.includes('+') || action.hit.includes('-') ? action.hit : `+${action.hit}`}
                                </button>
                            )}

                            {/* DAMAGE Button */}
                            {action.dmg && (
                                <button 
                                    onClick={(e) => handleRoll(action, 'dmg', e)}
                                    className="h-7 px-2 rounded bg-slate-700 hover:bg-indigo-900 text-indigo-200 border border-slate-600 hover:border-indigo-500 text-xs font-bold font-mono transition-colors max-w-[100px] truncate" 
                                    title="Roll Damage"
                                >
                                    {action.dmg}
                                </button>
                            )}

                            {/* CAST/USE Button */}
                            {(!action.hit && !action.dmg) && (
                                <button onClick={(e) => handleRoll(action, 'use', e)} className="h-7 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold uppercase border border-indigo-500 shadow-md transition-colors">
                                    USE
                                </button>
                            )}
                            
                            {/* Edit/Delete Toggle */}
                            <div className="flex flex-col gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {action.source === 'custom' && <button onClick={() => startEdit(action)} className="text-slate-500 hover:text-white"><Icon name="more-vertical" size={14}/></button>}
                                {hasText && <button onClick={() => setIsExpanded(!isExpanded)} className="text-slate-500 hover:text-white"><Icon name={isExpanded?"chevron-up":"chevron-down"} size={14}/></button>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit View */}
                {editingId === action.id && (
                    <div className="p-3 bg-slate-700/50 border-t border-slate-600">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <div><label className="text-[10px] font-bold text-slate-400">Hit</label><input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white" value={editForm.hit || ''} onChange={e => setEditForm({...editForm, hit: e.target.value})} /></div>
                            <div><label className="text-[10px] font-bold text-slate-400">Dmg</label><input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white" value={editForm.dmg || ''} onChange={e => setEditForm({...editForm, dmg: e.target.value})} /></div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => deleteAction(action)} className="text-xs text-red-400 hover:text-red-300 mr-auto">Delete</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-slate-300 px-2 hover:underline">Cancel</button>
                            <button onClick={saveEdit} className="text-xs bg-green-600 text-white px-3 py-1 rounded font-bold">Save</button>
                        </div>
                    </div>
                )}

                {/* Expanded Details */}
                {isExpanded && hasText && editingId !== action.id && (
                    <div className="px-3 pb-3 pt-0 border-t border-slate-700/50 animate-in fade-in">
                        <div className="pt-2 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {action.desc || action.notes}
                            {action.uses && <div className="mt-2 text-[10px] text-slate-500 uppercase tracking-widest">Recharge: {action.uses.recovery}</div>}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-24">
            
            {/* ADD BUTTON */}
            <button onClick={() => setShowAdd(!showAdd)} className="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-500 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 text-sm font-bold">
                <Icon name="plus" size={16}/> Add Action
            </button>

            {/* ADD FORM */}
            {showAdd && (
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-600 shadow-xl animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-500">Name</label>
                            <input className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={newAction.name} onChange={e=>setNewAction({...newAction, name:e.target.value})} placeholder="Fireball"/>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Hit Bonus</label>
                            <input className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={newAction.hit} onChange={e=>setNewAction({...newAction, hit:e.target.value})} placeholder="+5"/>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Damage</label>
                            <input className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={newAction.dmg} onChange={e=>setNewAction({...newAction, dmg:e.target.value})} placeholder="8d6 Fire"/>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Type</label>
                            <select className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={newAction.type} onChange={e=>setNewAction({...newAction, type:e.target.value})}>
                                <option>Action</option>
                                <option>Bonus Action</option>
                                <option>Reaction</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={addAction} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg">Save Action</button>
                </div>
            )}

            {/* --- SECTIONS --- */}
            {attacks.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest pl-1">Attacks</h4>
                    {attacks.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {bonusActions.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-amber-500 uppercase mb-2 tracking-widest pl-1 border-b border-amber-900/30 pb-1">Bonus Actions</h4>
                    {bonusActions.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {reactions.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-indigo-400 uppercase mb-2 tracking-widest pl-1 border-b border-indigo-900/30 pb-1">Reactions</h4>
                    {reactions.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {otherFeatures.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest pl-1 border-b border-slate-800 pb-1">Features</h4>
                    {otherFeatures.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {allActions.length === 0 && (
                <div className="text-center text-slate-500 py-12 italic border-2 border-dashed border-slate-800 rounded-xl">
                    No actions found.
                </div>
            )}
        </div>
    );
};

export default ActionsTab;