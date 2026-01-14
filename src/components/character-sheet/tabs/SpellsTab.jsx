import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const SpellsTab = ({ onDiceRoll, onLogAction }) => {
    // FIX: Removed getModifier from store destructuring
    const { character, castSpell, updateInfo } = useCharacterStore();
    const [filterLevel, setFilterLevel] = useState(0);
    
    // Edit State
    const [editingIndex, setEditingIndex] = useState(-1);
    const [editForm, setEditForm] = useState({});

    // SRD State
    const [showSrd, setShowSrd] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [srdResults, setSrdResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // FIX: Defined getModifier locally to prevent crash
    const getModifier = (stat) => Math.floor(((character.stats?.[stat] || 10) - 10) / 2);

    // Stats
    const spellStat = character.spellAbility || 'int'; // Default to int if undefined
    const spellSaveDC = 8 + (character.profBonus || 2) + getModifier(spellStat);
    const spellAttack = (character.profBonus || 2) + getModifier(spellStat);

    // Filter Spells
    const allSpells = character.spells || [];
    const spells = allSpells.filter(s => (s.level || 0) === filterLevel);
    const slots = character.spellSlots?.[filterLevel] || { current: 0, max: 0 };

    // --- HANDLERS ---

    const handleCast = (spell, e) => {
        if(e) e.stopPropagation();
        
        if (spell.level > 0) {
            if (slots.current <= 0) {
                alert("No spell slots left!");
                return;
            }
            if (castSpell) castSpell(spell.level);
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

    const handleRoll = async (spell, type, e) => {
        if(e) e.stopPropagation();
        if (!onDiceRoll) return;

        if (type === 'hit') {
            const roll = await onDiceRoll(20);
            const mod = parseInt(spell.hit) || 0;
            const total = roll + mod;
            const isCrit = roll === 20;
            
            onLogAction && onLogAction(`
                <div class="space-y-1">
                    <div class="font-bold text-cyan-400 border-b border-cyan-900/50 pb-1 flex justify-between">
                        <span>${spell.name} Attack</span>
                        <span class="text-xs text-slate-500 font-normal self-end">Spell</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-slate-300">
                        <span class="bg-slate-800 px-2 py-1 rounded text-xs font-mono">d20 ${mod >= 0 ? '+' : ''}${mod}</span>
                        <span>➜</span>
                        <span class="font-mono text-slate-400">${roll}</span>
                        <span>=</span>
                        <span class="text-2xl font-bold ${isCrit ? 'text-green-400 glow' : 'text-white'}">${total}</span>
                    </div>
                </div>
            `);
        } 
        else if (type === 'dmg') {
            const regex = /(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/;
            const match = spell.dmg.match(regex);
            
            if (match) {
                const [fullStr, count, die, sign, modVal] = match;
                const typeLabel = spell.dmg.replace(fullStr, '').trim();
                
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
                            <span>${spell.name} Damage</span>
                            <span class="text-xs text-slate-500 font-normal self-end">${typeLabel}</span>
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
                onLogAction && onLogAction(`<div class="font-bold text-indigo-300">${spell.name}: ${spell.dmg}</div>`);
            }
        }
    };

    // --- EDITING ---
    const startEdit = (index, spell, e) => {
        if(e) e.stopPropagation();
        setEditingIndex(index);
        setEditForm({ ...spell });
    };

    const saveEdit = () => {
        const newSpells = [...allSpells];
        const targetIndex = newSpells.findIndex(s => s.name === spells[editingIndex].name && s.level === spells[editingIndex].level);
        
        if (targetIndex > -1) {
            newSpells[targetIndex] = editForm;
            updateInfo('spells', newSpells);
        }
        setEditingIndex(-1);
        setEditForm({});
    };

    const deleteSpell = (spell) => {
        if(!confirm(`Delete ${spell.name}?`)) return;
        const newSpells = allSpells.filter(s => s !== spell);
        updateInfo('spells', newSpells);
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
            
            let dmgString = "";
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
                hit: data.attack_type ? `+${spellAttack}` : "",
                dmg: dmgString
            };
            
            updateInfo('spells', [...allSpells, newSpell]);
            setShowSrd(false);
            setSrdResults([]);
            setSearchTerm("");
        } catch (e) { alert("Failed to fetch spell details."); }
        setIsSearching(false);
    };

    // --- CARD COMPONENT ---
    const SpellCard = ({ spell, index }) => {
        const [expanded, setExpanded] = useState(false);
        const hasText = spell.desc;

        return (
            <div className={`bg-slate-800 border border-slate-700 rounded-xl mb-2 transition-all hover:border-indigo-500/50 shadow-sm group ${expanded ? 'ring-1 ring-indigo-500/50' : ''}`}>
                
                {/* Main Row */}
                {editingIndex !== index && (
                    <div className="p-3 flex justify-between items-center gap-3">
                        
                        {/* Left: Info */}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => hasText && setExpanded(!expanded)}>
                            <div className="font-bold text-slate-200 truncate flex items-center gap-2">
                                {spell.name}
                                {spell.ritual && <Icon name="book" size={12} className="text-slate-500"/>}
                                {spell.concentration && <Icon name="brain" size={12} className="text-slate-500"/>}
                            </div>
                            <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                                {spell.school} • {spell.range}
                            </div>
                        </div>

                        {/* Right: Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                            
                            {/* Hit Button */}
                            {spell.hit && (
                                <button 
                                    onClick={(e) => handleRoll(spell, 'hit', e)}
                                    className="bg-slate-700 hover:bg-cyan-900/50 text-cyan-400 border border-slate-600 hover:border-cyan-500/50 px-2 py-1 rounded text-[10px] font-bold font-mono transition-colors uppercase"
                                >
                                    {spell.hit.includes('+') ? spell.hit : `+${spell.hit}`}
                                </button>
                            )}

                            {/* Damage Button */}
                            {spell.dmg && (
                                <button 
                                    onClick={(e) => handleRoll(spell, 'dmg', e)}
                                    className="bg-slate-700 hover:bg-indigo-900/50 text-indigo-300 border border-slate-600 hover:border-indigo-500/50 px-2 py-1 rounded text-[10px] font-bold font-mono transition-colors max-w-[100px] truncate"
                                >
                                    {spell.dmg}
                                </button>
                            )}

                            {/* Cast / Slot Button */}
                            <button 
                                onClick={(e) => handleCast(spell, e)} 
                                className="bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 px-3 py-1 rounded text-[10px] font-bold uppercase shadow-lg shadow-indigo-900/20"
                            >
                                {spell.level === 0 ? "CAST" : "SLOT"}
                            </button>

                            {/* Menu */}
                            <div className="flex flex-col gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => startEdit(index, spell, e)} className="text-slate-500 hover:text-white p-0.5"><Icon name="more-vertical" size={14}/></button>
                                {hasText && <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-white p-0.5"><Icon name={expanded ? "chevron-up" : "chevron-down"} size={14}/></button>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Mode */}
                {editingIndex === index && (
                    <div className="p-3 bg-slate-700/50 border-t border-slate-600">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <div><label className="text-[10px] font-bold text-slate-400">Hit</label><input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white" value={editForm.hit || ''} onChange={e => setEditForm({...editForm, hit: e.target.value})} /></div>
                            <div><label className="text-[10px] font-bold text-slate-400">Dmg</label><input className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white" value={editForm.dmg || ''} onChange={e => setEditForm({...editForm, dmg: e.target.value})} /></div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => deleteSpell(spell)} className="text-xs text-red-400 hover:text-red-300 mr-auto">Delete</button>
                            <button onClick={() => setEditingIndex(-1)} className="text-xs text-slate-300 px-2 hover:underline">Cancel</button>
                            <button onClick={saveEdit} className="text-xs bg-green-600 text-white px-3 py-1 rounded font-bold">Save</button>
                        </div>
                    </div>
                )}

                {/* Description Expanded */}
                {expanded && hasText && editingIndex !== index && (
                    <div className="px-3 pb-3 pt-0">
                        <div className="border-t border-slate-700/50 pt-2 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap animate-in fade-in">
                            {spell.desc}
                        </div>
                    </div>
                )}
            </div>
        );
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
                    <div className="text-center text-slate-500 py-8 italic border-2 border-dashed border-slate-800 rounded-xl">
                        {filterLevel === 0 ? "No Cantrips known." : `No Level ${filterLevel} spells found.`}
                    </div>
                ) : (
                    spells.map((spell, i) => <SpellCard key={i} index={i} spell={spell} />)
                )}
            </div>

            {/* SRD Modal */}
            {showSrd && (
                <div className="absolute inset-0 bg-slate-900 z-50 flex flex-col animate-in fade-in rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 p-2 border-b border-slate-700 bg-slate-800">
                        <input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => e.key==='Enter' && searchSrd()} placeholder="Search 5e API..." className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white outline-none"/>
                        <button onClick={searchSrd} disabled={isSearching} className="bg-indigo-600 px-3 py-2 rounded text-white"><Icon name="search" size={18}/></button>
                        <button onClick={() => setShowSrd(false)} className="text-slate-400 p-2"><Icon name="x" size={24}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900">
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