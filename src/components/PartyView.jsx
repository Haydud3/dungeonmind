import React, { useState } from 'react';
import Icon from './Icon';

const PartyView = ({ data, setData, role, updateCloud }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const handleAdd = () => {
        const newP = { 
            id: Date.now(), 
            name: 'New Hero', 
            class: 'Fighter', 
            race: 'Human', 
            level: 1, 
            aliases: '',
            appearance: '',
            personality: '',
            backstory: ''
        };
        const newData = { ...data, players: [...(data.players||[]), newP] };
        updateCloud(newData, true);
        startEdit(newP);
    };

    const startEdit = (p) => { setEditingId(p.id); setEditForm(p); };

    const saveEdit = () => {
        const newPlayers = data.players.map(p => p.id === editingId ? editForm : p);
        updateCloud({ ...data, players: newPlayers }, true);
        setEditingId(null);
    };

    const deletePlayer = (id) => {
        if(!confirm("Delete character?")) return;
        updateCloud({ ...data, players: data.players.filter(p => p.id !== id) }, true);
    };

    return (
        <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-24">
            <div className="max-w-4xl mx-auto space-y-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl text-amber-500 fantasy-font">Party Roster</h2>
                    {role === 'dm' && <button onClick={handleAdd} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded flex items-center gap-2"><Icon name="plus" size={16}/> Add Character</button>}
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {(data.players || []).map(p => (
                        <div key={p.id} className="bg-slate-800 border border-slate-700 p-6 rounded-lg shadow-lg relative group transition-all hover:border-slate-600">
                            {editingId === p.id ? (
                                <div className="space-y-4">
                                    {/* Header Info */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="text-xs text-slate-400 uppercase font-bold">Name</label>
                                            <input className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 uppercase font-bold">Race</label>
                                            <input className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white text-sm" value={editForm.race} onChange={e => setEditForm({...editForm, race: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 uppercase font-bold">Class & Level</label>
                                            <input className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white text-sm" value={editForm.class} onChange={e => setEditForm({...editForm, class: e.target.value})} placeholder="e.g. Rogue 3" />
                                        </div>
                                    </div>

                                    {/* Aliases */}
                                    <div>
                                        <label className="text-xs text-slate-400 uppercase font-bold">Aliases (Comma separated)</label>
                                        <input className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white text-sm" value={editForm.aliases || ''} onChange={e => setEditForm({...editForm, aliases: e.target.value})} placeholder="e.g. Raven, Dad, The Tank" />
                                        <p className="text-[10px] text-slate-500 mt-1">Help the AI identify this character by other names.</p>
                                    </div>

                                    {/* Roleplay Fields */}
                                    <div className="space-y-3 pt-2 border-t border-slate-700">
                                        <div>
                                            <label className="text-xs text-amber-500 uppercase font-bold flex items-center gap-2"><Icon name="user" size={12}/> Appearance</label>
                                            <textarea className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white text-sm h-20 resize-none" value={editForm.appearance || ''} onChange={e => setEditForm({...editForm, appearance: e.target.value})} placeholder="Tall, scarred, wears a cloak of shadows..." />
                                        </div>
                                        <div>
                                            <label className="text-xs text-amber-500 uppercase font-bold flex items-center gap-2"><Icon name="brain" size={12}/> Personality & Motivations</label>
                                            <textarea className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white text-sm h-24 resize-none" value={editForm.personality || ''} onChange={e => setEditForm({...editForm, personality: e.target.value})} placeholder="Brave but reckless. Wants to find the lost mine to restore family honor." />
                                        </div>
                                        <div>
                                            <label className="text-xs text-amber-500 uppercase font-bold flex items-center gap-2"><Icon name="book-open" size={12}/> Backstory Brief</label>
                                            <textarea className="w-full bg-slate-900 border border-slate-600 p-2 rounded text-white text-sm h-24 resize-none" value={editForm.backstory || ''} onChange={e => setEditForm({...editForm, backstory: e.target.value})} placeholder="Exiled from the dwarven kingdom for a crime they didn't commit..." />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 mt-4">
                                        <button onClick={saveEdit} className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded text-white font-bold flex items-center gap-2"><Icon name="save" size={16}/> Save</button>
                                        <button onClick={() => setEditingId(null)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-white">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-xl font-bold text-amber-500 border border-slate-600 shadow-inner">
                                                {p.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-100 fantasy-font leading-none">{p.name}</h3>
                                                <p className="text-amber-500 text-sm font-bold">{p.race} {p.class} <span className="text-slate-500 font-normal">| Lvl {p.level || 1}</span></p>
                                                {p.aliases && <p className="text-xs text-slate-500 mt-0.5">aka: {p.aliases}</p>}
                                            </div>
                                        </div>
                                        {role === 'dm' && <button onClick={() => startEdit(p)} className="text-slate-500 hover:text-amber-400 p-2"><Icon name="pencil" size={20}/></button>}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-300">
                                        {p.appearance && (
                                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                                <h4 className="text-amber-600 font-bold text-xs uppercase mb-1">Appearance</h4>
                                                <p className="leading-relaxed">{p.appearance}</p>
                                            </div>
                                        )}
                                        {p.personality && (
                                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                                <h4 className="text-amber-600 font-bold text-xs uppercase mb-1">Personality</h4>
                                                <p className="leading-relaxed">{p.personality}</p>
                                            </div>
                                        )}
                                        {p.backstory && (
                                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                                <h4 className="text-amber-600 font-bold text-xs uppercase mb-1">Backstory</h4>
                                                <p className="leading-relaxed line-clamp-4 hover:line-clamp-none transition-all">{p.backstory}</p>
                                            </div>
                                        )}
                                    </div>

                                    {role === 'dm' && (
                                        <button onClick={() => deletePlayer(p.id)} className="absolute bottom-4 right-4 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="trash-2" size={18}/></button>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PartyView;
