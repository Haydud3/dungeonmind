import React, { useState } from 'react';
import Icon from './Icon';

const PartyView = ({ data, setData, role, activeChar, updateCloud }) => {
    const [viewMode, setViewMode] = useState('stats');

    const updatePlayer = (idx, field, val) => {
        const newPlayers = data.players.map((p, i) => i === idx ? { ...p, [field]: val } : p);
        const newData = { ...data, players: newPlayers };
        setData(newData);
        if(updateCloud) updateCloud(newData);
    };

    const addPlayer = () => {
        const newData = { 
            ...data, 
            players: [...(data.players || []), { 
                id: Date.now(), 
                name: "New Hero", 
                race: "Human", 
                class: "Fighter", 
                notes: "", 
                backstory: "", 
                appearance: "", 
                motivation: "" 
            }] 
        };
        setData(newData);
        if(updateCloud) updateCloud(newData);
    };

    const removePlayer = (id) => {
        if(!confirm("Remove this character?")) return;
        const newData = { ...data, players: data.players.filter(p => p.id !== id) };
        setData(newData);
        if(updateCloud) updateCloud(newData);
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 overflow-y-auto h-full custom-scroll pb-24 md:pb-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-2">
                <h2 className="text-3xl fantasy-font text-amber-500">Party</h2>
                {role === 'dm' && (
                    <button onClick={addPlayer} className="bg-amber-600 hover:bg-amber-500 px-3 py-1 rounded text-sm font-bold flex items-center gap-2">
                        <Icon name="plus" size={16}/> Add Character
                    </button>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(data.players || []).map((p, idx) => {
                    const canEdit = role === 'dm' || activeChar === p.id;
                    return (
                        <div key={p.id} className={`glass-panel p-4 rounded-xl border-l-4 relative group ${activeChar == p.id ? 'border-green-500 bg-green-900/10' : 'border-amber-600 bg-slate-900/50'}`}>
                            <div className="flex justify-between mb-2">
                                <input 
                                    disabled={!canEdit} 
                                    className={`bg-transparent font-bold text-lg w-full outline-none ${!canEdit && 'text-slate-200 cursor-default'}`} 
                                    value={p.name} 
                                    onChange={e => updatePlayer(idx, 'name', e.target.value)} 
                                    placeholder="Name"
                                />
                                {role === 'dm' && (
                                    <button onClick={() => removePlayer(p.id)} className="text-slate-600 hover:text-red-500 p-2">
                                        <Icon name="trash-2" size={16}/>
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex gap-2 mb-2">
                                <input disabled={!canEdit} className="w-1/2 bg-slate-800/50 rounded p-2 text-sm border border-transparent focus:border-amber-500 outline-none" value={p.race} placeholder="Race" onChange={e => updatePlayer(idx, 'race', e.target.value)}/>
                                <input disabled={!canEdit} className="w-1/2 bg-slate-800/50 rounded p-2 text-sm border border-transparent focus:border-amber-500 outline-none" value={p.class} placeholder="Class" onChange={e => updatePlayer(idx, 'class', e.target.value)}/>
                            </div>

                            {/* Mini Tabs */}
                            <div className="flex border-b border-slate-700 mb-2">
                                <button onClick={() => setViewMode('stats')} className={`flex-1 text-xs py-2 ${viewMode === 'stats' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500'}`}>Stats</button>
                                <button onClick={() => setViewMode('appearance')} className={`flex-1 text-xs py-2 ${viewMode === 'appearance' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500'}`}>Looks</button>
                                <button onClick={() => setViewMode('bio')} className={`flex-1 text-xs py-2 ${viewMode === 'bio' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500'}`}>Bio</button>
                            </div>

                            {viewMode === 'stats' && (
                                <textarea disabled={!canEdit} className="w-full bg-slate-800/30 rounded p-2 text-sm h-32 resize-none custom-scroll border border-transparent focus:border-amber-500 outline-none" value={p.notes} placeholder="Inventory, Stats, Loot..." onChange={e => updatePlayer(idx, 'notes', e.target.value)}/>
                            )}
                            {viewMode === 'bio' && (
                                <div className="space-y-2">
                                    <textarea disabled={!canEdit} className="w-full bg-slate-800/30 rounded p-2 text-sm h-20 resize-none custom-scroll border border-transparent focus:border-amber-500 outline-none" value={p.backstory} placeholder="Character backstory..." onChange={e => updatePlayer(idx, 'backstory', e.target.value)}/>
                                    <input disabled={!canEdit} className="w-full bg-indigo-900/20 border border-indigo-900/50 rounded p-2 text-sm text-indigo-200 outline-none focus:border-indigo-500" value={p.motivation || ""} placeholder="Primary Goal..." onChange={e => updatePlayer(idx, 'motivation', e.target.value)}/>
                                </div>
                            )}
                            {viewMode === 'appearance' && (
                                <textarea disabled={!canEdit} className="w-full bg-slate-800/30 rounded p-2 text-sm h-32 resize-none custom-scroll border border-transparent focus:border-amber-500 outline-none" value={p.appearance || ""} placeholder="Physical description (e.g. 'Tall, scar on left cheek')..." onChange={e => updatePlayer(idx, 'appearance', e.target.value)}/>
                            )}
                        </div>
                    );
                })}
                {(data.players || []).length === 0 && <div className="col-span-full text-center text-slate-500 mt-10">No players yet. Add one!</div>}
            </div>
        </div>
    );
};

export default PartyView;