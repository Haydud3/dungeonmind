import React, { useState } from 'react';
import Icon from './Icon';

const PartyView = ({ data, setData, role, updateCloud }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const handleAdd = () => {
        const newP = { id: Date.now(), name: 'New Hero', class: 'Fighter', race: 'Human', level: 1, aliases: '' };
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(data.players || []).map(p => (
                        <div key={p.id} className="bg-slate-800 border border-slate-700 p-4 rounded-lg shadow-lg relative group">
                            {editingId === p.id ? (
                                <div className="space-y-2">
                                    <input className="w-full bg-slate-900 border border-slate-600 p-1 rounded text-white" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Name" />
                                    <div className="flex gap-2">
                                        <input className="w-1/2 bg-slate-900 border border-slate-600 p-1 rounded text-white text-sm" value={editForm.race} onChange={e => setEditForm({...editForm, race: e.target.value})} placeholder="Race" />
                                        <input className="w-1/2 bg-slate-900 border border-slate-600 p-1 rounded text-white text-sm" value={editForm.class} onChange={e => setEditForm({...editForm, class: e.target.value})} placeholder="Class" />
                                    </div>
                                    {/* NEW: Alias Input */}
                                    <div>
                                        <label className="text-[10px] text-slate-400 uppercase font-bold">Aliases (Comma separated)</label>
                                        <input className="w-full bg-slate-900 border border-slate-600 p-1 rounded text-white text-sm" value={editForm.aliases || ''} onChange={e => setEditForm({...editForm, aliases: e.target.value})} placeholder="e.g. Raven, Dad, The Tank" />
                                    </div>
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={saveEdit} className="text-xs bg-green-700 px-3 py-1 rounded text-white">Save</button>
                                        <button onClick={() => setEditingId(null)} className="text-xs bg-slate-700 px-3 py-1 rounded text-white">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-200">{p.name}</h3>
                                            <p className="text-amber-500 text-sm">{p.race} {p.class} • Lvl {p.level || 1}</p>
                                            {p.aliases && <p className="text-xs text-slate-500 mt-1 italic">aka: {p.aliases}</p>}
                                        </div>
                                        {role === 'dm' && <button onClick={() => startEdit(p)} className="text-slate-500 hover:text-amber-400"><Icon name="pencil" size={16}/></button>}
                                    </div>
                                    {role === 'dm' && (
                                        <button onClick={() => deletePlayer(p.id)} className="absolute bottom-2 right-2 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="trash-2" size={16}/></button>
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
