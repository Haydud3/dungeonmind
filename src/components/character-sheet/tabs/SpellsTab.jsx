import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const SpellsTab = ({ onDiceRoll, onLogAction }) => {
    const { character, castSpell, getModifier, updateInfo } = useCharacterStore();
    const [filterLevel, setFilterLevel] = useState(0);
    
    // Edit State
    const [editingIndex, setEditingIndex] = useState(-1);
    const [editForm, setEditForm] = useState({});

    // SRD State
    const [showSrd, setShowSrd] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [srdResults, setSrdResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const spellStat = 'int'; // Simplified default
    const spellSaveDC = 8 + (character.profBonus || 2) + getModifier(spellStat);
    const spellAttack = (character.profBonus || 2) + getModifier(spellStat);

    const allSpells = character.spells || [];
    const spells = allSpells.filter(s => (s.level || 0) === filterLevel);
    const slots = character.spellSlots?.[filterLevel] || { current: 0, max: 0 };

    // --- ACTIONS ---

    const handleCast = (spell) => {
        if (spell.level > 0) {
            if (slots.current <= 0) {
                alert("No spell slots left!");
                return;
            }
            castSpell(spell.level);
        }

        const msg = `
            <div class="bg-indigo-950 p-2 rounded border-l-4 border-indigo-500">
                <div class="font-bold text-white flex justify-between">
                    <span>${character.name} casts ${spell.name}</span>
                </div>
                <div class="text-xs text-slate-400 mt-1">${spell.time || "1 Action"} • ${spell.range || "Range"}</div>
                <div class="text-xs text-slate-300 mt-2 italic border-t border-indigo-900 pt-1">${spell.desc ? spell.desc.substring(0, 100) + '...' : ''}</div>
            </div>
        `;
        if (onLogAction) onLogAction(msg);
    };

    const handleAttackRoll = async (spell) => {
        if (!onDiceRoll || !spell.hit) return;
        
        try {
            const roll = await onDiceRoll(20);
            const hitMod = parseInt(spell.hit) || 0;
            const total = roll + hitMod;

            const msg = `
                <div class="space-y-2">
                    <div class="font-bold text-cyan-400 text-base border-b border-cyan-900/50 pb-1 flex justify-between">
                        <span>${spell.name} Attack</span>
                        <span class="text-xs text-slate-500 font-normal self-end">Spell</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-slate-300">
                        <span class="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs font-mono">d20${hitMod >= 0 ? '+' : ''}${hitMod}</span>
                        <span>➜</span>
                        <span class="font-mono"><strong>${roll}</strong> ${hitMod >= 0 ? '+' : ''} ${Math.abs(hitMod)}</span>
                        <span>=</span>
                        <span class="text-xl text-cyan-400 font-bold glow">${total}</span>
                    </div>
                </div>
            `;
            if (onLogAction) onLogAction(msg);
        } catch(e) { console.error(e); }
    };

    const handleDamageRoll = async (spell) => {
        if (!onDiceRoll || !spell.dmg) return;

        const diceRegex = /(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/;
        const match = spell.dmg.match(diceRegex);

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
            // Extract damage type if written like "1d10 Fire"
            const damageType = spell.dmg.replace(match[0], '').trim();

            const msg = `
                <div class="space-y-1">
                    <div class="font-bold text-indigo-400 border-b border-indigo-900/50 pb-1 mb-1 flex justify-between">
                        <span>${spell.name} Damage</span>
                        <span class="text-xs text-slate-500 font-normal self-end">${damageType}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                        <span class="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs font-mono">${match[0]}</span>
                        <span>➜</span>
                        <span class="font-mono text-xs text-slate-400">
                            [${rolls.join('+')}]${mod ? (sign > 0 ? '+'+mod : '-'+mod) : ''}
                        </span>
                        <span>=</span>
                        <span class="text-xl text-indigo-400 font-bold">${total}</span>
                    </div>
                </div>
            `;
            if (onLogAction) onLogAction(msg);
        } else {
            // Fallback for flat damage or just text
            if (onLogAction) onLogAction(`<div class="text-indigo-400 font-bold">${spell.name}: ${spell.dmg}</div>`);
        }
    };

    // --- EDITING ---
    const startEdit = (index, spell) => {
        setEditingIndex(index);
        setEditForm({ ...spell });
    };

    const saveEdit = () => {
        const globalIndex = allSpells.findIndex(s => s.name === editForm.name); // Simple match, preferably use ID if available
        if (globalIndex === -1) return; // Fallback logic needed if duplicates exist, but simple match works for now
        
        // Better logic: Map the *original* array to preserve order
        const newSpells = [...allSpells];
        
        // Find the spell in the master list that matches the one we are editing
        // (Using a reference comparison would be better if we had IDs, assuming unique names for now)
        const targetIndex = newSpells.findIndex(s => s.name === spells[editingIndex].name && s.level === spells[editingIndex].level);
        
        if (targetIndex > -1) {
            newSpells[targetIndex] = editForm;
            updateInfo('spells', newSpells);
        }
        
        setEditingIndex(-1);
        setEditForm({});
    };

    // --- SRD INTEGRATION ---
    const searchSrd = async () => {
        if (!searchTerm) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/spells?name=${searchTerm}`);
            const data = await res.json();
            setSrdResults(data.results.slice(0, 10)); 
        } catch (e) { console.error(e); }
        setIsSearching(false);
    };

    const addSrdSpell = async (url) => {
        setIsSearching(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co${url}`);
            const data = await res.json();
            
            // Try to auto-parse damage
            let dmgString = "";
            // Very basic parse attempt from SRD structure
            if (data.damage && data.damage.damage_at_slot_level) {
                dmgString = data.damage.damage_at_slot_level[data.level] || data.damage.damage_at_slot_level[Object.keys(data.damage.damage_at_slot_level)[0]];
                if (data.damage.damage_type?.name) dmgString += ` ${data.damage.damage_type.name}`;
            }

            const newSpell = {
                name: data.name,
                level: data.level,
                school: data.school.name,
                time: "1A",
                range: data.range,
                desc: data.desc.join('\n'),
                hit: data.attack_type ? `+${spellAttack}` : "", // Auto-guess attack bonus
                dmg: dmgString
            };
            
            updateInfo('spells', [...allSpells, newSpell]);
            setShowSrd(false);
            setSrdResults([]);
            setSearchTerm("");
        } catch (e) { alert("Failed to fetch spell details."); }
        setIsSearching(false);
    };

    return (
        <div className="space-y-4 pb-24 relative">
            {/* Header Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Attack</div>
                    <div className="text-xl font-bold text-amber-500">+{spellAttack}</div>
                </div>
                <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Save DC</div>
                    <div className="text-xl font-bold text-white">{spellSaveDC}</div>
                </div>
                <div className="bg-slate-800 p-2 rounded border border-slate-700 text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Ability</div>
                    <div className="text-xl font-bold text-slate-400 uppercase">{spellStat.substring(0,3)}</div>
                </div>
            </div>

            {/* Level Selector */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar items-center">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => (
                    <button
                        key={lvl}
                        onClick={() => { setFilterLevel(lvl); setEditingIndex(-1); }}
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border transition-all ${filterLevel === lvl ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                    >
                        {lvl === 0 ? 'C' : lvl}
                    </button>
                ))}
                <button onClick={() => setShowSrd(true)} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-slate-700 hover:bg-green-600 text-white border border-slate-600 ml-2 shadow-lg"><Icon name="plus" size={18}/></button>
            </div>

            {/* Spell List */}
            <div className="space-y-2">
                {spells.length === 0 ? (
                    <div className="text-center text-slate-500 py-8 italic">
                        {filterLevel === 0 ? "No Cantrips known." : `No Level ${filterLevel} spells found.`}
                    </div>
                ) : (
                    spells.map((spell, i) => (
                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden transition-colors group relative">
                            
                            {/* Normal View */}
                            {editingIndex !== i && (
                                <div className="p-3 flex justify-between items-center hover:border-indigo-500 border border-transparent rounded-lg">
                                    <div className="overflow-hidden flex-1 cursor-pointer" onClick={() => startEdit(i, spell)}>
                                        <div className="font-bold text-slate-200 truncate flex items-center gap-2">
                                            {spell.name}
                                            {spell.hit && <span className="text-[9px] bg-slate-700 text-cyan-400 px-1 rounded border border-cyan-900/50">+{spell.hit}</span>}
                                            {spell.dmg && <span className="text-[9px] bg-slate-700 text-indigo-300 px-1 rounded border border-indigo-900/50">{spell.dmg}</span>}
                                        </div>
                                        <div className="text-xs text-slate-500">{spell.school || "Spell"} • {spell.range} • {spell.time}</div>
                                    </div>
                                    
                                    <div className="flex gap-2 items-center">
                                        {/* Attack Roll Button */}
                                        {spell.hit && (
                                            <button onClick={() => handleAttackRoll(spell)} className="w-8 h-8 rounded bg-slate-700 hover:bg-cyan-700 text-cyan-200 flex items-center justify-center border border-slate-600" title="Roll Attack">
                                                <Icon name="crosshair" size={16}/>
                                            </button>
                                        )}

                                        {/* Damage Roll Button */}
                                        {spell.dmg && (
                                            <button onClick={() => handleDamageRoll(spell)} className="w-8 h-8 rounded bg-slate-700 hover:bg-indigo-700 text-indigo-200 flex items-center justify-center border border-slate-600" title="Roll Damage">
                                                <Icon name="sword" size={16}/>
                                            </button>
                                        )}

                                        {/* Cast / Slot Button */}
                                        <button onClick={() => handleCast(spell)} className="text-[10px] bg-indigo-900 hover:bg-indigo-700 text-white px-3 py-1.5 rounded font-bold uppercase shrink-0 border border-indigo-700">
                                            {filterLevel === 0 ? "Cast" : "Slot"}
                                        </button>
                                        
                                        {/* Edit Toggle (small) */}
                                        <button onClick={() => startEdit(i, spell)} className="text-slate-600 hover:text-white"><Icon name="more-vertical" size={16}/></button>
                                    </div>
                                </div>
                            )}

                            {/* Edit View */}
                            {editingIndex === i && (
                                <div className="p-3 bg-slate-700/50 border-t border-slate-600">
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">Attack Bonus</label>
                                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white" placeholder="+5" value={editForm.hit || ''} onChange={e => setEditForm({...editForm, hit: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">Damage</label>
                                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white" placeholder="8d6 Fire" value={editForm.dmg || ''} onChange={e => setEditForm({...editForm, dmg: e.target.value})} />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingIndex(-1)} className="text-xs text-slate-300 px-2 hover:underline">Cancel</button>
                                        <button onClick={saveEdit} className="text-xs bg-green-600 text-white px-3 py-1 rounded font-bold">Save Stats</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* SRD Modal */}
            {showSrd && (
                <div className="absolute inset-0 bg-slate-900 z-50 flex flex-col animate-in fade-in">
                    <div className="flex items-center gap-2 p-2 border-b border-slate-700">
                        <input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => e.key==='Enter' && searchSrd()} placeholder="Search 5e API..." className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white outline-none"/>
                        <button onClick={searchSrd} disabled={isSearching} className="bg-indigo-600 px-3 py-2 rounded text-white"><Icon name="search" size={18}/></button>
                        <button onClick={() => setShowSrd(false)} className="text-slate-400 p-2"><Icon name="x" size={24}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {srdResults.map(r => (
                            <div key={r.index} onClick={() => addSrdSpell(r.url)} className="p-3 bg-slate-800 border border-slate-700 rounded hover:border-green-500 cursor-pointer flex justify-between items-center">
                                <span className="font-bold text-slate-200">{r.name}</span>
                                <Icon name="download" size={16} className="text-slate-500"/>
                            </div>
                        ))}
                        {isSearching && <div className="text-center p-4 text-slate-500">Consulting the Weave...</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SpellsTab;