import React, { useState, useEffect } from 'react';
import Icon from './Icon';

const SideSheet = ({ characterId, data, onClose, onSave }) => {
    // 1. Find the character data from the Master List (Players or NPCs)
    const character = [...(data.players || []), ...(data.npcs || [])].find(c => c.id === characterId);
    
    // Local State for editing (prevents lag while typing)
    const [form, setForm] = useState(character || {});

    // If character changes (Hot-Swap), update local form immediately
    useEffect(() => {
        if (character) setForm(character);
    }, [characterId, character]);

    if (!character) return null;

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    // Auto-save when closing or swapping
    const handleSave = () => {
        onSave(form);
    };

    return (
        <div className="absolute top-0 right-0 bottom-0 w-96 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded overflow-hidden bg-slate-800 border border-slate-600">
                        {form.image ? <img src={form.image} className="w-full h-full object-cover"/> : <div className="p-2 text-center text-xs">{form.name?.[0]}</div>}
                    </div>
                    <div>
                        <input 
                            className="bg-transparent font-bold text-white text-lg outline-none w-full placeholder:text-slate-600" 
                            value={form.name || ''} 
                            onChange={e => handleChange('name', e.target.value)}
                        />
                        <div className="text-xs text-slate-500 uppercase font-mono">{form.race} {form.class}</div>
                    </div>
                </div>
                <button onClick={() => { handleSave(); onClose(); }} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><Icon name="x" size={18}/></button>
            </div>

            {/* Quick Stats (HP / AC) */}
            <div className="grid grid-cols-3 gap-2 p-4 border-b border-slate-800 bg-slate-900/50">
                <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                    <label className="text-[10px] text-slate-500 uppercase font-bold block">Armor Class</label>
                    <input type="number" value={form.ac || 10} onChange={e => handleChange('ac', parseInt(e.target.value))} className="bg-transparent text-white font-bold text-xl text-center w-full outline-none"/>
                </div>
                <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                    <label className="text-[10px] text-green-500 uppercase font-bold block">Hit Points</label>
                    <div className="flex items-center justify-center gap-1">
                        <input type="number" value={form.hp || 0} onChange={e => handleChange('hp', parseInt(e.target.value))} className="bg-transparent text-white font-bold text-xl text-center w-12 outline-none"/>
                        <span className="text-slate-500">/</span>
                        <input type="number" value={form.maxHp || 0} onChange={e => handleChange('maxHp', parseInt(e.target.value))} className="bg-transparent text-slate-400 font-bold text-sm text-center w-8 outline-none"/>
                    </div>
                </div>
                <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                    <label className="text-[10px] text-blue-500 uppercase font-bold block">Speed</label>
                    <input value={form.speed || '30ft'} onChange={e => handleChange('speed', e.target.value)} className="bg-transparent text-white font-bold text-xl text-center w-full outline-none"/>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
                {/* Stats Grid */}
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 border-b border-slate-800 pb-1">Ability Scores</h4>
                    <div className="grid grid-cols-6 gap-1">
                        {['str','dex','con','int','wis','cha'].map(stat => (
                            <div key={stat} className="flex flex-col items-center bg-slate-800/50 p-1 rounded">
                                <span className="text-[9px] uppercase font-bold text-slate-500">{stat}</span>
                                <input 
                                    type="number" 
                                    value={(form.stats && form.stats[stat]) || 10} 
                                    onChange={e => handleChange('stats', { ...(form.stats || {}), [stat]: parseInt(e.target.value) })}
                                    className="w-full bg-transparent text-center font-bold text-white outline-none"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Notes / Bio */}
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 border-b border-slate-800 pb-1">Notes & Abilities</h4>
                    <textarea 
                        value={form.notes || ''} 
                        onChange={e => handleChange('notes', e.target.value)}
                        className="w-full h-40 bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-300 outline-none focus:border-indigo-500 resize-none"
                        placeholder="Character abilities, attacks, and notes..."
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950">
                <button onClick={handleSave} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded flex items-center justify-center gap-2">
                    <Icon name="save" size={16}/> Save Changes
                </button>
            </div>
        </div>
    );
};

export default SideSheet;