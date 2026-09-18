import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';
import { useDialog } from '../../DialogProvider';
import RollButton from '../widgets/RollButton';
import TrackerPips from '../widgets/TrackerPips';

// START CHANGE: Core Combat Actions Constant
const CORE_COMBAT_ACTIONS = [
    { name: "Dash", desc: "Gain extra movement for the current turn. The increase equals your speed, after applying any modifiers." },
    { name: "Disengage", desc: "Your movement doesn't provoke opportunity attacks for the rest of the turn." },
    { name: "Dodge", desc: "Until the start of your next turn, any attack roll made against you has disadvantage if you can see the attacker, and you make Dexterity saving throws with advantage." },
    { name: "Help", desc: "You can lend your aid to another creature in the completion of a task. The creature you aid gains advantage on the next ability check it makes to perform the task." },
    { name: "Hide", desc: "Make a Dexterity (Stealth) check in an attempt to hide, following the rules for hiding." },
    { name: "Ready", desc: "Wait for a specific circumstance before you act, which lets you act using your reaction before the start of your next turn." },
    { name: "Search", desc: "Devote your attention to finding something. Depending on the nature of your search, the DM might have you make a Wisdom (Perception) check or an Intelligence (Investigation) check." },
    { name: "Use an Object", desc: "Interact with an object, such as drawing a sword, drinking a potion, or pulling a lever." }
];
// END CHANGE

// UPDATE: Added isOwner
const ActionsTab = ({ onDiceRoll, onLogAction, isOwner }) => {
    const dialog = useDialog();
    const { character, updateInfo, toggleCondition, useItemCharge } = useCharacterStore();
    const [showAdd, setShowAdd] = useState(false);
    const [newAction, setNewAction] = useState({ name: "", hit: "", dmg: "", type: "Action", category: "Attack", notes: "" });
    const [lastCritId, setLastCritId] = useState(null);
    const [activeCategory, setActiveCategory] = useState('all');
    
    // Edit State
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // --- 1. DATA GATHERING & MERGING ---
    
    // A. Inventory (Smart Sync: Only Equipped & Combat-Ready Items)
    const inventoryActions = (character?.inventory || [])
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.combat && item.equipped) // Added item.equipped requirement
        .map(({ item, index }) => ({
            ...item.combat,
            name: item.name,
            id: `item-${item.name}-${index}`, // Unique ID generation
            source: "item",
            itemIndex: index, // To map back to the store
            uses: item.limitedUse && item.limitedUse.maxUses > 0 ? {
                max: item.limitedUse.maxUses,
                current: item.limitedUse.maxUses - (item.limitedUse.numberUsed || 0),
                recovery: item.limitedUse.resetTypeDescription
            } : null,
            notes: item.combat.notes || item.description
        }));

    // B. Spells (Directly from Spellbook)
    const spellActions = (character?.spells || [])
        .filter(spell => {
            const t = (spell.time || "").toLowerCase();
            return spell.hit || spell.dmg || t.includes("bonus") || t.includes("reaction") || String(spell.hit).includes("DC");
        })
        .map(spell => ({
            name: spell.name,
            id: `spell-${spell.name}`,
            hit: spell.hit,
            dmg: spell.dmg,
            type: spell.time?.toLowerCase().includes("bonus") ? "Bonus Action" : 
                  spell.time?.toLowerCase().includes("reaction") ? "Reaction" : "Action",
            category: "Spell",
            range: typeof spell.range === 'object' ? (spell.range?.rangeValue ? `${spell.range.rangeValue} ft` : 'Self') : spell.range,
            desc: spell.desc,
            source: "spell"
        }));

    // C. Custom Features
    const customActions = (character?.customActions || []).map(act => ({
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
    const toggleUse = (actionId) => {
        const action = allActions.find(a => a.id === actionId);
        if (!action) return;

        if (action.source === 'custom') {
            const newActions = [...(character?.customActions || [])];
            const idx = newActions.findIndex(a => `custom-${a.name}` === actionId);
            if (idx > -1 && newActions[idx].uses) {
                const uses = newActions[idx].uses;
                if (uses.current > 0) uses.current--;
                else uses.current = uses.max;
                updateInfo('customActions', newActions);
            }
        } else if (action.source === 'item' && action.itemIndex !== undefined) {
            if (action.uses && action.uses.current > 0) {
                useItemCharge(action.itemIndex, 1);
            } else {
                // If it's at 0, don't reset it here, it might be confusing. 
                // Wait, if they click the last empty bubble, should it reset? 
                // Let's implement reset in the inventory tab, or just loop back
                // To keep it simple, if current is 0, we'll reset it to max.
                const resetItemCharges = useCharacterStore.getState().resetItemCharges;
                if (resetItemCharges) resetItemCharges(action.itemIndex);
            }
        }
    };

    const handleRoll = async (action, type, e) => {
        if(e) e.stopPropagation();
        
        // Log the usage to Chat/Toast
        if (type === 'use') {
            if (action.uses && action.uses.current > 0) {
                toggleUse(action.id);
            }
            if (action.name.toLowerCase().includes('rage')) {
                toggleCondition('Raging');
            }
            if (onDiceRoll) {
                onDiceRoll('1d0', {
                    alias: action.name,
                    description: action.desc || action.notes || "",
                    actionType: 'use',
                    characterName: character.name
                });
            } else if (onLogAction) {
                onLogAction(`
                    <div class="font-bold text-indigo-300">${action.name}</div>
                    <div class="text-xs text-slate-400 mt-1">${action.desc || action.notes || ""}</div>
                `);
            }
        }

        // Then handle the actual dice roll logic
        if (type === 'hit') {
            if (!onDiceRoll) return dialog.alert("Dice connection missing.");
            if (String(action.hit).toUpperCase().includes('DC')) {
                const match = String(action.hit).match(/DC\s*(\d+)(?:\s*([a-zA-Z]+))?/i);
                let dcData = null;
                if (match) {
                    dcData = { value: parseInt(match[1], 10), stat: (match[2] || 'dex').toLowerCase().substring(0,3) };
                }

                onDiceRoll('1d0', {
                    alias: action.name,
                    description: `Requires a ${action.hit} save.`,
                    actionType: 'use',
                    characterName: character.name,
                    dc: dcData
                });
                return;
            }

            const mod = parseInt(action.hit) || 0;
            const formula = `1d20${mod >= 0 ? '+' : ''}${mod}`;
            const rollObj = await onDiceRoll(formula, {
                actionType: 'attack',
                weaponName: action.name,
                alias: 'Attack',
                characterName: character.name,
                damageRoll: action.dmg || null,
                damageType: action.notes || null
            });
            
            if (rollObj?.isCrit) {
                setLastCritId(action.id);
            } else if (rollObj) {
                setLastCritId(null);
            }
        } 
        else if (type === 'dmg') {
            if (!onDiceRoll) return dialog.alert("Dice connection missing.");
            if (!action.dmg) {
                onDiceRoll('1d0', {
                    alias: action.name,
                    actionType: 'use',
                    characterName: character.name
                });
                return;
            }
            
            // Handle flat 0 damage
            if (action.dmg === '0' || action.dmg === 0) {
                onDiceRoll('1d0', {
                    actionType: 'damage',
                    weaponName: action.name,
                    alias: 'Damage Roll',
                    damageType: action.notes || '',
                    characterName: character.name
                });
                setLastCritId(null);
                return;
            }

            let formula = action.dmg;
            let alias = 'Damage Roll';
            
            if (lastCritId === action.id) {
                // Double all dice counts (e.g. 1d8 -> 2d8, 2d6 -> 4d6)
                formula = String(formula).replace(/(\d*)d(\d+)/g, (match, countStr, faces) => {
                    const count = countStr ? parseInt(countStr) : 1;
                    return `${count * 2}d${faces}`;
                });
                alias = 'CRITICAL DAMAGE!';
            }

            onDiceRoll(formula, {
                actionType: 'damage',
                weaponName: action.name,
                alias: alias,
                damageType: action.notes || '',
                characterName: character.name
            });
            
            setLastCritId(null); // Consume the crit
        } 
    };

    const deleteAction = async (action) => {
        if(action.source !== 'custom') return dialog.alert("This is a Spell or Item. Remove it from those tabs.");
        if(!(await dialog.confirm(`Delete ${action.name}?`))) return;
        updateInfo('customActions', (character?.customActions || []).filter(a => a.name !== action.name));
    };

    const addAction = () => {
        if (!newAction.name) return;
        updateInfo('customActions', [...(character?.customActions||[]), newAction]);
        setShowAdd(false);
        setNewAction({ name: "", hit: "", dmg: "", type: "Action", category: "Attack", notes: "" });
    };

    const startEdit = (action) => {
        if (action.source !== 'custom') return dialog.alert("Can only edit Custom Actions here.");
        setEditingId(action.id);
        setEditForm({ ...action });
    };

    const saveEdit = () => {
        const newActions = [...(character?.customActions || [])];
        const idx = newActions.findIndex(a => `custom-${a.name}` === editingId);
        if (idx > -1) {
            newActions[idx] = { ...newActions[idx], ...editForm };
            updateInfo('customActions', newActions);
        }
        setEditingId(null);
    };

    // --- 5. ACTION ROW COMPONENT ---
    const getDamageIcon = (type) => {
    const t = String(type || '').toLowerCase();
    if (t.includes('slashing')) return 'sword';
    if (t.includes('piercing')) return 'crosshair';
    if (t.includes('bludgeoning')) return 'hammer';
    if (t.includes('fire')) return 'flame';
    if (t.includes('cold') || t.includes('ice')) return 'snowflake';
    if (t.includes('lightning') || t.includes('thunder')) return 'zap';
    if (t.includes('poison') || t.includes('acid')) return 'flask-conical';
    if (t.includes('radiant')) return 'sun';
    if (t.includes('necrotic')) return 'skull';
    if (t.includes('psychic')) return 'brain';
    if (t.includes('force')) return 'sparkles';
    return null;
};
    const ActionRow = ({ action }) => {
        const hasText = action.desc || action.notes;
        const [isExpanded, setIsExpanded] = useState(false);
        const isCore = action.isCore; // Detect core actions

        return (
            <div className={`bg-slate-900/80 border ${isCore ? 'border-slate-800' : 'border-slate-800/90'} hover:border-amber-500/40 rounded-xl overflow-hidden transition-all group relative mb-2.5 shadow-sm`}>
                
                {/* Normal View */}
                {editingId !== action.id && (
                    <div className="p-3 flex flex-wrap justify-between items-center gap-2.5 hover:bg-slate-800/30 transition-colors">
                        
                        {/* LEFT: Info */}
                        <div className="overflow-hidden flex-1 min-w-[150px] cursor-pointer" onClick={() => hasText && setIsExpanded(!isExpanded)}>
                            <div className={`font-bold ${isCore ? 'text-slate-400 font-serif' : 'text-slate-100 font-serif'} text-sm truncate flex items-center gap-2`}>
                                {action.name}
                                {action.isItem && <Icon name="backpack" size={13} className="text-amber-400/80"/>}
                                {action.source === 'spell' && <Icon name="sparkles" size={13} className="text-purple-400"/>}
                            </div>
                            <div className="text-xs text-slate-500 truncate flex gap-2 items-center">
                                <span>{action.type || "Action"}</span>
                                {action.range && <span>• {action.range}</span>}
                                {(() => {
                                    const match = String(action.dmg || '').match(/^([\d\sd\+\-]+)(.*)$/i);
                                    let typeStr = action.notes || (match ? match[2].trim() : '');
                                    if (!typeStr) return null;
                                    const iconName = getDamageIcon(typeStr);
                                    return (
                                        <span className="flex items-center gap-1 text-slate-400 capitalize bg-slate-900/50 px-1.5 py-0.5 rounded ml-1 border border-slate-700/50">
                                            {iconName && <Icon name={iconName} size={10} />}
                                            {typeStr}
                                        </span>
                                    );
                                })()}
                            </div>
                        </div>
                        
                        {/* RIGHT: Buttons */}
                        <div className="flex gap-2 items-center flex-wrap justify-end shrink-0">
                            
                            {/* Uses Tracker */}
                            {action.uses && (
                                <TrackerPips 
                                    max={action.uses.max} 
                                    current={action.uses.current} 
                                    onChange={(newVal) => isOwner && toggleUse(action.id)} // ActionsTab handles toggleUse internally based on max/current logic, wait toggleUse might just increment. Let's check how toggleUse works. Actually, toggleUse in this file takes (id). If TrackerPips sends `newValue`, toggleUse might need adjustment or we just call `toggleUse(id)`. Let's assume toggleUse handles the logic. I'll pass the `id`. Wait, TrackerPips's onChange provides the raw number. Let's see how `toggleUse` is defined. It probably expects the `id`.
                                    readOnly={!isOwner}
                                    className="mr-1"
                                />
                            )}

                            {/* HIT Button */}
                            {isOwner && (action.hit !== undefined && action.hit !== null && action.hit !== "") && (
                                <RollButton 
                                    onClick={(e) => handleRoll(action, 'hit', e)}
                                    type="hit"
                                    title="Roll Attack"
                                >
                                    {String(action.hit).includes('+') || String(action.hit).includes('-') || String(action.hit).toUpperCase().includes('DC') ? action.hit : `+${action.hit}`}
                                </RollButton>
                            )}

                            {/* DAMAGE Button */}
                            {isOwner && action.dmg && (
                                <div className="flex gap-1">
                                    {String(action.dmg).split('/').map((dmgStr, index) => {
                                        const isCritTarget = lastCritId === action.id;
                                        const critClass = isCritTarget 
                                            ? "bg-amber-400 hover:bg-amber-300 text-slate-900 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,1)] animate-pulse font-extrabold" 
                                            : "max-w-[100px]";
                                            
                                        let rawDmg = dmgStr.trim();
                                        let typeStr = action.notes || "";
                                        const match = rawDmg.match(/^([\d\sd\+\-]+)(.*)$/i);
                                        if (match && match[2].trim().length > 0) {
                                            rawDmg = match[1].trim();
                                            if (!typeStr) typeStr = match[2].trim();
                                        }

                                        let displayDmg = rawDmg;
                                        if (isCritTarget) {
                                            displayDmg = String(displayDmg).replace(/(\d*)d(\d+)/g, (m, countStr, faces) => {
                                                const count = countStr ? parseInt(countStr) : 1;
                                                return `${count * 2}d${faces}`;
                                            });
                                        }
                                        
                                        const iconName = getDamageIcon(typeStr);
                                            
                                        return (
                                            <RollButton 
                                                key={index}
                                                onClick={(e) => {
                                                    const singleDmgAction = { ...action, dmg: dmgStr.trim() };
                                                    handleRoll(singleDmgAction, 'dmg', e);
                                                }}
                                                type={isCritTarget ? "action" : "dmg"}
                                                title={isCritTarget ? "CRITICAL DAMAGE" : (index === 0 ? "Roll Damage" : "Roll Versatile Damage")}
                                                className={critClass}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>{displayDmg}</span>
                                                    {iconName && <Icon name={iconName} size={12} className="opacity-70" />}
                                                </div>
                                            </RollButton>
                                        );
                                    })}
                                </div>
                            )}

                            {/* USE Button */}
                            {isOwner && (!action.hit && !action.dmg) && (
                                <>
                                    {action.name.toLowerCase().includes('rage') && character.conditions?.includes('Raging') ? (
                                        <RollButton 
                                            onClick={(e) => { toggleCondition('Raging'); }} 
                                            type="action"
                                            className="bg-red-900 hover:bg-red-800 border-red-800 text-red-200"
                                        >
                                            END RAGE
                                        </RollButton>
                                    ) : (
                                        <RollButton 
                                            onClick={(e) => handleRoll(action, 'use', e)} 
                                            type="use"
                                        >
                                            USE
                                        </RollButton>
                                    )}
                                </>
                            )}
                            
                            {/* Edit/Delete Toggle */}
                            <div className="flex flex-col gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* UPDATE: Hide Edit if not owner */}
                                {isOwner && action.source === 'custom' && <button onClick={() => startEdit(action)} className="text-slate-500 hover:text-white"><Icon name="more-vertical" size={14}/></button>}
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
                            {String(action.desc || action.notes || "").replace(/<[^>]*>?/gm, '')}
                            {action.uses && <div className="mt-2 text-[10px] text-slate-500 uppercase tracking-widest">Recharge: {action.uses.recovery}</div>}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4 pb-20">
            {/* Top Command Toolbar: Filter Chips & Add Action */}
            <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {[
                        { id: 'all', label: 'All', count: allActions.length },
                        { id: 'attacks', label: 'Attacks', count: attacks.length },
                        { id: 'bonus', label: 'Bonus', count: bonusActions.length },
                        { id: 'reactions', label: 'Reactions', count: reactions.length },
                        { id: 'core', label: '5e Rules', count: CORE_COMBAT_ACTIONS.length },
                    ].map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setActiveCategory(f.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeCategory === f.id
                                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                                    : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                        >
                            <span>{f.label}</span>
                            <span className={`text-[10px] px-1 rounded-full ${
                                activeCategory === f.id ? 'bg-slate-950/20 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                            }`}>
                                {f.count}
                            </span>
                        </button>
                    ))}
                </div>

                {isOwner && (
                    <button 
                        onClick={() => setShowAdd(!showAdd)} 
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ml-auto ${
                            showAdd 
                                ? 'bg-amber-500 text-slate-950 font-bold shadow-md' 
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                    >
                        <Icon name={showAdd ? "x" : "plus"} size={13}/>
                        <span>{showAdd ? "Close" : "Custom Action"}</span>
                    </button>
                )}
            </div>

            {/* ADD FORM */}
            {showAdd && isOwner && (
                <div className="bg-slate-900/95 p-4 rounded-xl border border-amber-500/40 shadow-xl animate-in slide-in-from-top-2">
                    <div className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Icon name="sparkles" size={13} />
                        <span>Create Custom Action</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-400">Action Name</label>
                            <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:border-amber-400" 
                                value={newAction.name} 
                                onChange={e=>setNewAction({...newAction, name:e.target.value})} 
                                placeholder="e.g. Greatsword Slash, Flaming Sphere..."
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400">Hit Bonus / Save DC</label>
                            <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:border-amber-400" 
                                value={newAction.hit} 
                                onChange={e=>setNewAction({...newAction, hit:e.target.value})} 
                                placeholder="+5 or DC 14 Dex"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400">Damage Formula</label>
                            <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:border-amber-400" 
                                value={newAction.dmg} 
                                onChange={e=>setNewAction({...newAction, dmg:e.target.value})} 
                                placeholder="2d6+3 Slashing"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400">Action Economy</label>
                            <select 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:border-amber-400" 
                                value={newAction.type} 
                                onChange={e=>setNewAction({...newAction, type:e.target.value})}
                            >
                                <option>Action</option>
                                <option>Bonus Action</option>
                                <option>Reaction</option>
                            </select>
                        </div>
                    </div>
                    <button 
                        onClick={addAction} 
                        className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black py-2 rounded-lg transition-all shadow-md active:scale-95"
                    >
                        Save Action
                    </button>
                </div>
            )}

            {/* --- SECTIONS --- */}
            {(activeCategory === 'all' || activeCategory === 'attacks') && attacks.length > 0 && (
                <div>
                    <div className="flex justify-between items-baseline mb-2 pl-1 border-b border-slate-800/80 pb-1">
                        <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Icon name="sword" size={12} /> Attacks & Weapon Strikes
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400">
                            Attacks per Action: <strong className="text-white font-bold">{character?.attacksPerAction || 1}</strong>
                        </span>
                    </div>
                    {attacks.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {(activeCategory === 'all' || activeCategory === 'bonus') && bonusActions.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-amber-500 uppercase mb-2 tracking-widest pl-1 border-b border-slate-800/80 pb-1 flex items-center gap-1.5">
                        <Icon name="zap" size={12} /> Bonus Actions
                    </h4>
                    {bonusActions.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {(activeCategory === 'all' || activeCategory === 'reactions') && reactions.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-indigo-400 uppercase mb-2 tracking-widest pl-1 border-b border-slate-800/80 pb-1 flex items-center gap-1.5">
                        <Icon name="shield" size={12} /> Reactions
                    </h4>
                    {reactions.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {activeCategory === 'all' && otherFeatures.length > 0 && (
                <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest pl-1 border-b border-slate-800/80 pb-1 flex items-center gap-1.5">
                        <Icon name="sparkles" size={12} /> Special Actions & Features
                    </h4>
                    {otherFeatures.map((a) => <ActionRow key={a.id} action={a} />)}
                </div>
            )}

            {/* Core Combat Actions */}
            {(activeCategory === 'all' || activeCategory === 'core') && (
                <div className="mt-6 pt-3 border-t border-slate-800/80">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest pl-1 flex items-center gap-1.5">
                        <Icon name="book-open" size={12} /> Standard 5e Combat Actions
                    </h4>
                    {CORE_COMBAT_ACTIONS.map((action, i) => (
                        <ActionRow 
                            key={`core-${i}`} 
                            action={{ ...action, id: `core-${i}`, type: 'Action', isCore: true }} 
                        />
                    ))}
                </div>
            )}

            {allActions.length === 0 && (
                <div className="text-center text-slate-500 py-12 italic border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                    No actions or attacks found. Click &quot;Custom Action&quot; or equip combat weapons to populate.
                </div>
            )}
        </div>
    );
};

export default ActionsTab;