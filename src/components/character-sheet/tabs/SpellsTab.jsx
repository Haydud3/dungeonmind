import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';
import { useDialog } from '../../DialogProvider';
import SpellSlotTracker from '../SpellSlotTracker';
import RollButton from '../widgets/RollButton';

const SCHOOL_COLORS = {
    abjuration: 'border-sky-500/40 text-sky-300 bg-sky-500/10',
    conjuration: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
    divination: 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10',
    enchantment: 'border-pink-500/40 text-pink-300 bg-pink-500/10',
    evocation: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
    illusion: 'border-purple-500/40 text-purple-300 bg-purple-500/10',
    necromancy: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
    transmutation: 'border-teal-500/40 text-teal-300 bg-teal-500/10',
};

const SpellsTab = ({ onDiceRoll, onLogAction, onPlaceTemplate, isOwner = true, onUse }) => {
    const dialog = useDialog();
    const { character, castSpell, updateInfo } = useCharacterStore();
    const [filterLevel, setFilterLevel] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Edit State
    const [editingIndex, setEditingIndex] = useState(-1);
    const [editForm, setEditForm] = useState({});
    const [lastCritIndex, setLastCritIndex] = useState(null);

    // Custom Spell Modal
    const [showAddCustom, setShowAddCustom] = useState(false);
    const [newCustomSpell, setNewCustomSpell] = useState({
        name: '',
        level: 0,
        school: 'Evocation',
        time: '1 Action',
        range: '60 ft',
        components: 'V, S',
        hit: '',
        dmg: '',
        desc: '',
        concentration: false,
        ritual: false
    });

    // SRD State
    const [showSrd, setShowSrd] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [srdResults, setSrdResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const getModifier = (stat) => Math.floor(((character.stats?.[stat] || 10) - 10) / 2);

    // Vitals
    const spellStat = character.spellAbility || 'int';
    const statMod = getModifier(spellStat);
    const spellSaveDC = 8 + (character.profBonus || 2) + statMod;
    const spellAttack = (character.profBonus || 2) + statMod;

    // All Spells & Filter
    const allSpells = character.spells || [];

    const filteredSpells = allSpells.filter(s => {
        // Query match
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const nameMatch = s.name?.toLowerCase().includes(q);
            const schoolMatch = s.school?.toLowerCase().includes(q);
            const descMatch = s.desc?.toLowerCase().includes(q);
            if (!nameMatch && !schoolMatch && !descMatch) return false;
        }

        // Level filter
        if (filterLevel === 'All') return true;
        if (filterLevel === 'Conc') return s.concentration;
        if (filterLevel === 'Ritual') return s.ritual;
        if (filterLevel === 'Pact') return s.level > 0 && s.level <= (character.spellSlots?.['pact']?.level || 9);
        return (s.level || 0) === parseInt(filterLevel);
    });

    // --- CASTING & ROLLING ---
    const handleCast = (spell, e) => {
        if (e) e.stopPropagation();
        
        let dcData = null;
        if (spell.hit && String(spell.hit).toUpperCase().includes('DC')) {
            const match = String(spell.hit).match(/DC\s*(\d+)(?:\s*([a-zA-Z]+))?/i);
            if (match) {
                dcData = { value: parseInt(match[1], 10), stat: (match[2] || 'dex').toLowerCase().substring(0, 3) };
            }
        }
        if (!dcData && spell.desc) {
            const match = String(spell.desc).match(/DC\s*(\d+)\s*([a-zA-Z]+)/i);
            if (match) {
                dcData = { value: parseInt(match[1], 10), stat: (match[2] || 'dex').toLowerCase().substring(0, 3) };
            }
        }

        if (onDiceRoll) {
            onDiceRoll('1d0', {
                alias: spell.name,
                description: spell.desc || '',
                actionType: 'use',
                characterName: character.name,
                dc: dcData
            });
        } else if (onLogAction) {
            onLogAction(`
                <div class="font-bold text-amber-500">${spell.name}</div>
                <div class="text-xs text-slate-300 mt-1">${(spell.desc || '').substring(0, 150)}...</div>
                <div class="text-[10px] text-slate-500 mt-1 uppercase">${spell.school} • ${spell.time} ${spell.components ? `• ${spell.components}` : ''}</div>
            `);
        }

        if (spell.level > 0 && castSpell) castSpell(spell.level);
    };

    const handleRoll = async (spell, index, type, e) => {
        if (e) e.stopPropagation();
        if (!onDiceRoll) return;

        if (type === 'hit') {
            if (String(spell.hit).toUpperCase().includes('DC')) {
                const match = String(spell.hit).match(/DC\s*(\d+)(?:\s*([a-zA-Z]+))?/i);
                let dcData = null;
                if (match) {
                    dcData = { value: parseInt(match[1], 10), stat: (match[2] || 'dex').toLowerCase().substring(0, 3) };
                }

                onDiceRoll('1d0', { 
                    alias: spell.name, 
                    description: `Requires a ${spell.hit} save.`,
                    actionType: 'use',
                    characterName: character.name,
                    dc: dcData
                });
                return;
            }

            const mod = parseInt(spell.hit) || 0;
            const formula = `1d20${mod >= 0 ? '+' : ''}${mod}`;
            const rollObj = await onDiceRoll(formula, {
                actionType: 'spell-attack',
                weaponName: spell.name,
                alias: 'Spell Attack',
                characterName: character.name,
                damageRoll: spell.dmg || null
            });
            
            if (rollObj?.isCrit) {
                setLastCritIndex(index);
            } else if (rollObj) {
                setLastCritIndex(null);
            }
        } 
        else if (type === 'dmg') {
            if (!spell.dmg) return;
            const regex = /(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/;
            const match = spell.dmg.match(regex);
            
            if (match) {
                let [fullStr] = match;
                const typeLabel = spell.dmg.replace(fullStr, '').trim();
                
                let alias = 'Spell Damage';
                if (lastCritIndex === index) {
                    fullStr = String(fullStr).replace(/(\d*)d(\d+)/g, (m, countStr, faces) => {
                        const count = countStr ? parseInt(countStr) : 1;
                        return `${count * 2}d${faces}`;
                    });
                    alias = 'CRITICAL DAMAGE!';
                }
                
                onDiceRoll(fullStr, {
                    actionType: 'damage',
                    weaponName: spell.name,
                    alias: alias,
                    characterName: character.name,
                    damageType: typeLabel
                });
                setLastCritIndex(null);
            } else {
                onDiceRoll('1d0', {
                    actionType: 'damage',
                    weaponName: spell.name,
                    alias: 'Spell Damage',
                    characterName: character.name,
                    damageType: spell.dmg
                });
                setLastCritIndex(null);
            }
        }
    };

    const handleUpdateSlots = (level, newCurrent) => {
        const updatedSpellSlots = {
            ...character.spellSlots,
            [level]: {
                ...character.spellSlots[level],
                current: newCurrent
            }
        };
        updateInfo('spellSlots', updatedSpellSlots);
    };

    // --- EDITING & CREATING ---
    const startEdit = (index, spell, e) => {
        if (e) e.stopPropagation();
        setEditingIndex(index);
        setEditForm({ ...spell });
    };

    const saveEdit = () => {
        const newSpells = [...allSpells];
        newSpells[editingIndex] = editForm;
        updateInfo('spells', newSpells);
        setEditingIndex(-1);
        setEditForm({});
    };

    const deleteSpell = async (spell) => {
        if (!(await dialog.confirm(`Delete ${spell.name}?`))) return;
        const newSpells = allSpells.filter(s => s !== spell);
        updateInfo('spells', newSpells);
    };

    const handleAddCustomSpell = () => {
        if (!newCustomSpell.name.trim()) return;
        updateInfo('spells', [...allSpells, { ...newCustomSpell, level: parseInt(newCustomSpell.level) || 0 }]);
        setShowAddCustom(false);
        setNewCustomSpell({
            name: '',
            level: 0,
            school: 'Evocation',
            time: '1 Action',
            range: '60 ft',
            components: 'V, S',
            hit: '',
            dmg: '',
            desc: '',
            concentration: false,
            ritual: false
        });
    };

    // --- SRD INTEGRATION ---
    const searchSrd = async () => {
        if (!searchTerm) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/spells?name=${searchTerm}`);
            const data = await res.json();
            setSrdResults(data.results.slice(0, 10)); 
        } catch (e) { 
            console.error(e); 
        }
        setIsSearching(false);
    };

    const addSrdSpell = async (url) => {
        setIsSearching(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co${url}`);
            const data = await res.json();
            
            let dmgString = '';
            if (data.damage && data.damage.damage_at_slot_level) {
                dmgString = data.damage.damage_at_slot_level[data.level] || data.damage.damage_at_slot_level[Object.keys(data.damage.damage_at_slot_level)[0]];
                if (data.damage.damage_type?.name) dmgString += ` ${data.damage.damage_type.name}`;
            }

            const newSpell = {
                name: data.name,
                level: data.level,
                school: data.school?.name || 'Evocation',
                time: data.casting_time || '1 Action',
                range: data.range || 'Self',
                desc: (data.desc || []).join('\n'),
                hit: data.attack_type ? `+${spellAttack}` : (data.dc ? `DC ${data.dc.dc_type?.name?.toUpperCase() || ''}` : ''),
                dmg: dmgString,
                concentration: data.concentration || false,
                ritual: data.ritual || false,
                components: (data.components || []).join(', ')
            };
            
            updateInfo('spells', [...allSpells, newSpell]);
            setShowSrd(false);
            setSrdResults([]);
            setSearchTerm('');
        } catch (e) { 
            dialog.alert('Failed to fetch spell details.'); 
        }
        setIsSearching(false);
    };

    // --- CARD COMPONENT ---
    const SpellCard = ({ spell, index }) => {
        const [expanded, setExpanded] = useState(false);
        const hasText = !!spell.desc;

        const getRangeStr = (r) => {
            if (!r) return 'Unknown Range';
            if (typeof r === 'string') return r;
            if (typeof r === 'object') {
                const origin = r.origin || '';
                const val = r.rangeValue ? `${r.rangeValue} ft` : '';
                return `${val} ${origin}`.trim() || 'Self';
            }
            return 'Unknown Range';
        };
        
        const rangeStr = getRangeStr(spell.meta?.range || spell.range);
        const isAoE = rangeStr.toLowerCase().includes('foot') || rangeStr.toLowerCase().includes('ft') || rangeStr.toLowerCase().includes('mile') || 
                      (spell.desc && (spell.desc.toLowerCase().includes('radius') || spell.desc.toLowerCase().includes('cone') || spell.desc.toLowerCase().includes('cube')));

        const schoolKey = (spell.school || 'evocation').toLowerCase();
        const schoolClass = SCHOOL_COLORS[schoolKey] || 'border-slate-700 text-slate-300 bg-slate-800/40';

        return (
            <div className={`bg-slate-900/60 backdrop-blur-md border rounded-2xl transition-all shadow-md group ${
                expanded ? 'border-indigo-500/60 ring-1 ring-indigo-500/30' : 'border-slate-800/80 hover:border-slate-700'
            }`}>
                {/* Main Row */}
                {editingIndex !== index ? (
                    <div className="p-3.5 flex flex-col gap-2.5">
                        <div className="flex flex-wrap justify-between items-start gap-2">
                            {/* Left: Info */}
                            <div className="flex-1 min-w-[160px] cursor-pointer" onClick={() => hasText && setExpanded(!expanded)}>
                                <div className="font-bold text-slate-100 text-sm truncate flex items-center gap-2">
                                    <span>{spell.name}</span>
                                    {spell.concentration && (
                                        <span className="text-[9px] bg-sky-950/60 text-sky-400 px-1.5 py-0.5 rounded border border-sky-800/60 font-bold" title="Concentration">
                                            C
                                        </span>
                                    )}
                                    {spell.ritual && (
                                        <span className="text-[9px] bg-emerald-950/60 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800/60 font-bold" title="Ritual">
                                            R
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                                    <span className="font-mono font-semibold text-slate-300">
                                        {spell.level === 0 ? 'Cantrip' : `Lv ${spell.level}`}
                                    </span>
                                    <span>•</span>
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${schoolClass}`}>
                                        {spell.school || 'Magic'}
                                    </span>
                                    <span>•</span>
                                    <span className="text-slate-400">{rangeStr}</span>
                                    {spell.time && (
                                        <>
                                            <span>•</span>
                                            <span className="text-slate-400">{spell.time}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                                <RollButton 
                                    onClick={(e) => handleCast(spell, e)} 
                                    type="action"
                                    className="px-4 py-1 text-xs font-bold"
                                >
                                    Cast
                                </RollButton>
                            </div>
                        </div>

                        {/* Secondary Row: Roll Buttons */}
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                            {/* Hit / DC Button */}
                            {isOwner && spell.hit && (
                                <RollButton 
                                    onClick={(e) => handleRoll(spell, index, 'hit', e)}
                                    type="hit"
                                    className="text-xs font-mono font-bold"
                                >
                                    {String(spell.hit).toUpperCase().includes('DC') ? spell.hit : (String(spell.hit).includes('+') || String(spell.hit).includes('-') ? spell.hit : `+${spell.hit}`)}
                                </RollButton>
                            )}

                            {/* Damage Button */}
                            {isOwner && spell.dmg && (() => {
                                const isCritTarget = lastCritIndex === index;
                                let displayDmg = String(spell.dmg).trim();
                                if (isCritTarget) {
                                    displayDmg = displayDmg.replace(/(\d*)d(\d+)/g, (match, countStr, faces) => {
                                        const count = countStr ? parseInt(countStr) : 1;
                                        return `${count * 2}d${faces}`;
                                    });
                                }
                                
                                return (
                                    <RollButton 
                                        onClick={(e) => handleRoll(spell, index, 'dmg', e)}
                                        type={isCritTarget ? "action" : "dmg"}
                                        className={isCritTarget ? "bg-amber-400 hover:bg-amber-300 text-slate-900 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,1)] animate-pulse font-extrabold text-xs" : "max-w-[120px] text-xs font-mono font-bold"}
                                        title={isCritTarget ? "CRITICAL DAMAGE" : "Roll Damage"}
                                    >
                                        {displayDmg}
                                    </RollButton>
                                );
                            })()}

                            {/* Template Button */}
                            {isAoE && onPlaceTemplate && isOwner && (
                                <button 
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        onPlaceTemplate(spell);
                                    }} 
                                    className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 border border-orange-500/40 px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all" 
                                    title="Place Template on Map"
                                >
                                    <Icon name="crosshair" size={13}/>
                                    <span className="hidden sm:inline">AoE</span>
                                </button>
                            )}

                            <div className="flex-1" />

                            {/* Menu & Details expander */}
                            <div className="flex items-center gap-1">
                                {isOwner && (
                                    <button 
                                        type="button"
                                        onClick={(e) => startEdit(index, spell, e)} 
                                        className="text-slate-500 hover:text-slate-300 p-1 transition-colors"
                                        title="Edit Spell"
                                    >
                                        <Icon name="edit-3" size={13}/>
                                    </button>
                                )}
                                {hasText && (
                                    <button 
                                        type="button"
                                        onClick={() => setExpanded(!expanded)} 
                                        className="text-slate-500 hover:text-slate-300 p-1 transition-colors"
                                        title={expanded ? "Collapse" : "Expand Description"}
                                    >
                                        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14}/>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Edit Form */
                    <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 space-y-3 rounded-b-2xl">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Spell Name</label>
                                <input 
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                    value={editForm.name || ''} 
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })} 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Level</label>
                                <input 
                                    type="number"
                                    min="0"
                                    max="9"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                    value={editForm.level ?? 0} 
                                    onChange={e => setEditForm({ ...editForm, level: parseInt(e.target.value) || 0 })} 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Hit / DC</label>
                                <input 
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                    value={editForm.hit || ''} 
                                    placeholder="e.g. +7 or DC 15"
                                    onChange={e => setEditForm({ ...editForm, hit: e.target.value })} 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Damage / Healing</label>
                                <input 
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500" 
                                    value={editForm.dmg || ''} 
                                    placeholder="e.g. 8d6 fire"
                                    onChange={e => setEditForm({ ...editForm, dmg: e.target.value })} 
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                            <textarea 
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-amber-500 h-20 resize-none" 
                                value={editForm.desc || ''} 
                                onChange={e => setEditForm({ ...editForm, desc: e.target.value })} 
                            />
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <button 
                                type="button"
                                onClick={() => deleteSpell(spell)} 
                                className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                            >
                                Delete Spell
                            </button>
                            <div className="flex items-center gap-2">
                                <button 
                                    type="button"
                                    onClick={() => setEditingIndex(-1)} 
                                    className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="button"
                                    onClick={saveEdit} 
                                    className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-lg shadow-sm"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Description Expanded */}
                {expanded && hasText && editingIndex !== index && (
                    <div className="px-4 pb-3.5 pt-0">
                        <div className="border-t border-slate-800/80 pt-2.5 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {String(spell.desc || 'No description available.').replace(/<[^>]*>?/gm, '')}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-24 relative">
            {/* Spellcasting Hero Vitals */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg text-center relative overflow-hidden">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Spell Attack</div>
                    <div className="text-2xl font-mono font-black text-amber-400">
                        +{spellAttack}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">Prof +{character.profBonus || 2} & Mod</div>
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg text-center relative overflow-hidden">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Save DC</div>
                    <div className="text-2xl font-mono font-black text-white">
                        {spellSaveDC}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">8 + Prof + Mod</div>
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800/80 shadow-lg text-center relative overflow-hidden">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Ability</div>
                    <div className="text-2xl font-mono font-black text-indigo-400 uppercase">
                        {spellStat.substring(0, 3)}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">Mod {statMod >= 0 ? `+${statMod}` : statMod}</div>
                </div>
            </div>

            {/* Spell Slots Tracker */}
            {isOwner && (
                <SpellSlotTracker 
                    spellSlots={character.spellSlots} 
                    onUpdateSlots={handleUpdateSlots} 
                    isOwner={isOwner}
                />
            )}

            {/* Filter Bar & Search */}
            <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                    {/* Search Input */}
                    <div className="relative flex-1 max-w-sm">
                        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search spells..."
                            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
                        />
                        {searchQuery && (
                            <button 
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                <Icon name="x" size={13} />
                            </button>
                        )}
                    </div>

                    {/* Action buttons */}
                    {isOwner && (
                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                type="button"
                                onClick={() => setShowAddCustom(true)}
                                className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                            >
                                <Icon name="plus" size={14}/>
                                <span>Custom</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => setShowSrd(true)}
                                className="bg-indigo-600/80 hover:bg-indigo-500 text-white border border-indigo-500/50 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                            >
                                <Icon name="sparkles" size={14}/>
                                <span>SRD 5e</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Level / Category Filter Pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
                    {[
                        { id: 'All', label: 'All' },
                        { id: '0', label: 'Cantrip' },
                        { id: '1', label: '1st' },
                        { id: '2', label: '2nd' },
                        { id: '3', label: '3rd' },
                        { id: '4', label: '4th' },
                        { id: '5', label: '5th' },
                        { id: '6', label: '6th' },
                        { id: '7', label: '7th' },
                        { id: '8', label: '8th' },
                        { id: '9', label: '9th' },
                        ...(character.spellSlots?.['pact'] ? [{ id: 'Pact', label: 'Pact' }] : []),
                        { id: 'Conc', label: 'Conc' },
                        { id: 'Ritual', label: 'Ritual' },
                    ].map(f => (
                        <button 
                            key={f.id} 
                            type="button"
                            onClick={() => setFilterLevel(f.id)} 
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                filterLevel === f.id 
                                    ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.4)]' 
                                    : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Spell Cards List */}
            <div className="space-y-2.5">
                {filteredSpells.length === 0 ? (
                    <div className="text-center text-slate-500 py-12 italic border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                        {filterLevel === 'All' 
                            ? 'No spells prepared or known.' 
                            : `No spells found for filter "${filterLevel}".`}
                    </div>
                ) : (
                    filteredSpells.map((spell, i) => (
                        <SpellCard key={`${spell.name}-${i}`} index={i} spell={spell} />
                    ))
                )}
            </div>

            {/* Custom Spell Modal */}
            {showAddCustom && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                                <Icon name="sparkles" size={16} className="text-amber-500" />
                                Add Custom Spell
                            </h3>
                            <button 
                                type="button" 
                                onClick={() => setShowAddCustom(false)} 
                                className="text-slate-500 hover:text-slate-300"
                            >
                                <Icon name="x" size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="col-span-2">
                                <label className="text-slate-400 font-bold block mb-1">Spell Name</label>
                                <input 
                                    value={newCustomSpell.name}
                                    onChange={e => setNewCustomSpell({ ...newCustomSpell, name: e.target.value })}
                                    placeholder="e.g. Eldritch Blast"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-500"
                                />
                            </div>
                            <div>
                                <label className="text-slate-400 font-bold block mb-1">Level</label>
                                <select 
                                    value={newCustomSpell.level}
                                    onChange={e => setNewCustomSpell({ ...newCustomSpell, level: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-500"
                                >
                                    <option value={0}>Cantrip (0)</option>
                                    {[1,2,3,4,5,6,7,8,9].map(lvl => (
                                        <option key={lvl} value={lvl}>Level {lvl}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-slate-400 font-bold block mb-1">School</label>
                                <select 
                                    value={newCustomSpell.school}
                                    onChange={e => setNewCustomSpell({ ...newCustomSpell, school: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-500"
                                >
                                    {['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'].map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-slate-400 font-bold block mb-1">Hit / Save</label>
                                <input 
                                    value={newCustomSpell.hit}
                                    onChange={e => setNewCustomSpell({ ...newCustomSpell, hit: e.target.value })}
                                    placeholder="e.g. +7 or DC 15 Dex"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-500"
                                />
                            </div>
                            <div>
                                <label className="text-slate-400 font-bold block mb-1">Damage / Healing</label>
                                <input 
                                    value={newCustomSpell.dmg}
                                    onChange={e => setNewCustomSpell({ ...newCustomSpell, dmg: e.target.value })}
                                    placeholder="e.g. 1d10 force"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-500"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-slate-400 font-bold block mb-1">Description</label>
                                <textarea 
                                    value={newCustomSpell.desc}
                                    onChange={e => setNewCustomSpell({ ...newCustomSpell, desc: e.target.value })}
                                    placeholder="Spell effects and details..."
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-500 h-24 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                            <button 
                                type="button" 
                                onClick={() => setShowAddCustom(false)} 
                                className="px-4 py-1.5 text-xs text-slate-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                onClick={handleAddCustomSpell} 
                                className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-sm"
                            >
                                Add Spell
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SRD Modal */}
            {showSrd && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-3 shadow-2xl flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                                <Icon name="sparkles" size={16} className="text-indigo-400" />
                                Search 5e SRD Spell Compendium
                            </h3>
                            <button 
                                type="button" 
                                onClick={() => setShowSrd(false)} 
                                className="text-slate-500 hover:text-slate-300"
                            >
                                <Icon name="x" size={18} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    autoFocus 
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && searchSrd()} 
                                    placeholder="e.g. Fireball, Cure Wounds, Shield..." 
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                                />
                            </div>
                            <button 
                                type="button"
                                onClick={searchSrd} 
                                disabled={isSearching} 
                                className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm transition-all"
                            >
                                {isSearching ? 'Searching...' : 'Search'}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 py-2 custom-scroll">
                            {srdResults.map(r => (
                                <div 
                                    key={r.index} 
                                    onClick={() => addSrdSpell(r.url)} 
                                    className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl hover:border-indigo-500/50 hover:bg-slate-800 cursor-pointer flex justify-between items-center transition-all group"
                                >
                                    <span className="font-bold text-slate-200 text-xs group-hover:text-indigo-300">
                                        {r.name}
                                    </span>
                                    <Icon name="download" size={14} className="text-slate-500 group-hover:text-indigo-400" />
                                </div>
                            ))}
                            {isSearching && (
                                <div className="text-center p-6 text-slate-500 text-xs italic">
                                    Consulting the Arcane Archives...
                                </div>
                            )}
                            {!isSearching && srdResults.length === 0 && searchTerm && (
                                <div className="text-center p-6 text-slate-500 text-xs italic">
                                    No spells found matching "{searchTerm}".
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SpellsTab;