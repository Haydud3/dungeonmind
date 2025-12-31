import React, { useState } from 'react';
import Icon from './Icon';

const NpcView = ({ data, setData, role, updateCloud, generateNpc, setChatInput, setView }) => {
    const [genName, setGenName] = useState("");
    const [genContext, setGenContext] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    const npcs = data.npcs || [];
    // If player, hide hidden NPCs
    const visibleNpcs = role === 'dm' ? npcs : npcs.filter(n => !n.isHidden);

    const handleGen = async () => {
        if(isGenerating || !generateNpc) return; 
        setIsGenerating(true);
        // Mock call - will be real AI later
        const npcData = await generateNpc(genName, genContext);
        if(npcData) { 
            const newNpc = { id: Date.now(), isHidden: false, ...npcData }; 
            const newNpcs = [...npcs, newNpc]; 
            const newData = { ...data, npcs: newNpcs }; 
            setData(newData); 
            if(updateCloud) updateCloud(newData); 
            setGenName(""); 
            setGenContext(""); 
            setSelectedNpc(newNpc); 
            setIsEditing(false); 
        }
        setIsGenerating(false);
    };

    const deleteNpc = (id, e) => {
        if(e) e.stopPropagation(); 
        if(!confirm("Delete this NPC?")) return;
        const newNpcs = npcs.filter(n => n.id !== id); 
        const newData = { ...data, npcs: newNpcs }; 
        setData(newData); 
        if(updateCloud) updateCloud(newData); 
        if(selectedNpc?.id === id) setSelectedNpc(null);
    };
    
    const toggleHidden = (npc) => {
        const updated = { ...npc, isHidden: !npc.isHidden }; 
        const newNpcs = npcs.map(n => n.id === npc.id ? updated : n); 
        const newData = { ...data, npcs: newNpcs }; 
        setData(newData); 
        if(updateCloud) updateCloud(newData); 
        if(selectedNpc?.id === npc.id) setSelectedNpc(updated);
    };

    const updateNpcField = (field, value) => {
        if(!selectedNpc) return;
        const updated = { ...selectedNpc, [field]: value };
        setSelectedNpc(updated);
        const newNpcs = npcs.map(n => n.id === updated.id ? updated : n);
        const newData = { ...data, npcs: newNpcs };
        setData(newData);
        if(updateCloud) updateCloud(newData);
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 h-full flex flex-col md:flex-row gap-6 pb-24 md:pb-6">
            {/* Left Col: List & Generator */}
            <div className={`${selectedNpc ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 flex-col glass-panel rounded-xl overflow-hidden max-h-full bg-slate-900/50 border border-slate-700`}>
                <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                    <h3 className="fantasy-font text-xl text-amber-500 mb-2">NPC Registry</h3>
                    {role === 'dm' && (
                        <div className="space-y-2 p-3 bg-slate-900/50 rounded border border-slate-700">
                            <div className="text-xs font-bold text-slate-400 uppercase">Generator</div>
                            <input value={genName} onChange={e=>setGenName(e.target.value)} placeholder="Name (e.g. 'Strahd')" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-2 text-sm text-white outline-none"/>
                            <input value={genContext} onChange={e=>setGenContext(e.target.value)} placeholder="Role (e.g. Shopkeeper)" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-2 text-sm text-white outline-none"/>
                            <button onClick={handleGen} disabled={isGenerating} className="w-full bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold py-3 rounded flex justify-center gap-2 items-center">
                                {isGenerating ? <span className="animate-spin">...</span> : <Icon name="wand-2" size={14}/>} Generate NPC
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
                    {visibleNpcs.map(npc => (
                        <div key={npc.id} onClick={() => { setSelectedNpc(npc); setIsEditing(false); }} className={`p-3 rounded cursor-pointer border transition-all relative group ${selectedNpc?.id === npc.id ? 'bg-amber-900/20 border-amber-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500'} ${npc.isHidden ? 'opacity-50' : ''}`}>
                            <div className="font-bold text-slate-200 flex items-center gap-2">
                                {npc.name}
                                {role === 'dm' && npc.isHidden && <Icon name="eye-off" size={14} className="text-slate-500"/>}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{npc.race} {npc.class}</div>
                            {role === 'dm' && (
                                <button onClick={(e) => deleteNpc(npc.id, e)} className="absolute top-2 right-2 text-slate-600 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="trash-2" size={14}/></button>
                            )}
                        </div>
                    ))}
                    {visibleNpcs.length === 0 && <div className="text-center text-slate-500 text-xs mt-4">No NPCs recorded.</div>}
                </div>
            </div>
            
            {/* Right Col: Details */}
            <div className={`${selectedNpc ? 'flex' : 'hidden md:flex'} flex-1 glass-panel rounded-xl p-4 md:p-6 overflow-y-auto custom-scroll relative flex-col bg-slate-900/50 border border-slate-700`}>
                {selectedNpc && <button onClick={() => setSelectedNpc(null)} className="md:hidden absolute top-4 left-4 text-slate-400 bg-slate-800 rounded-full p-2 z-10"><Icon name="arrow-left" size={20}/></button>}
                {selectedNpc ? (
                    <div className="space-y-4 pt-10 md:pt-0">
                        <div className="flex flex-col md:flex-row justify-between items-start border-b border-slate-700 pb-4 gap-4">
                            <div className="flex-1 w-full">
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <input className="text-3xl font-bold bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full text-white" value={selectedNpc.name} onChange={e => updateNpcField('name', e.target.value)} placeholder="Name"/>
                                        <div className="flex gap-2">
                                            <input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-amber-500 w-1/2" value={selectedNpc.race} onChange={e => updateNpcField('race', e.target.value)} placeholder="Race"/>
                                            <input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-amber-500 w-1/2" value={selectedNpc.class} onChange={e => updateNpcField('class', e.target.value)} placeholder="Class"/>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h2 className="text-3xl fantasy-font text-white">{selectedNpc.name}</h2>
                                        <div className="text-amber-500 font-mono text-sm">{selectedNpc.race} {selectedNpc.class}</div>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-2 w-full md:w-auto justify-end">
                                {role === 'dm' && (
                                    <>
                                        <button onClick={() => toggleHidden(selectedNpc)} className={`p-3 rounded text-sm ${selectedNpc.isHidden ? 'bg-slate-700 text-slate-300' : 'bg-green-900/50 text-green-300'}`} title="Toggle Visibility"><Icon name={selectedNpc.isHidden ? "eye-off" : "eye"} size={16}/></button>
                                        <button onClick={() => setIsEditing(!isEditing)} className={`p-3 rounded text-sm ${isEditing ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300'}`} title="Edit NPC"><Icon name={isEditing ? "check" : "pencil"} size={16}/></button>
                                    </>
                                )}
                                <button onClick={() => { setChatInput(`(Playing as ${selectedNpc.name}) `); setView('session'); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm flex items-center gap-2"><Icon name="message-circle" size={16}/> Chat</button>
                            </div>
                        </div>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Quirk</div>
                                {isEditing ? <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" value={selectedNpc.quirk || ""} onChange={e => updateNpcField('quirk', e.target.value)}/> : <div className="text-slate-300 text-sm">{selectedNpc.quirk}</div>}
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Goal</div>
                                {isEditing ? <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" value={selectedNpc.goal || ""} onChange={e => updateNpcField('goal', e.target.value)}/> : <div className="text-slate-300 text-sm">{selectedNpc.goal}</div>}
                            </div>
                        </div>

                        <div className="bg-red-950/20 p-3 rounded border border-red-900/30">
                            <div className="text-xs font-bold text-red-400 uppercase mb-1 flex items-center gap-2"><Icon name="eye-off" size={12}/> Secret</div>
                            {isEditing ? <input className="w-full bg-slate-900 border border-red-900/50 rounded px-2 py-1 text-sm text-red-200" value={selectedNpc.secret || ""} onChange={e => updateNpcField('secret', e.target.value)}/> : <div className="text-slate-300 text-sm">{selectedNpc.secret}</div>}
                        </div>

                        <div className="bg-slate-900/30 p-4 rounded border border-slate-700">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><Icon name="swords" size={14}/> Combat Stats & Abilities</div>
                            <textarea className="w-full h-48 bg-slate-900/80 border border-slate-700 rounded p-3 text-sm text-green-300 font-mono leading-relaxed resize-none focus:outline-none focus:border-amber-500" value={typeof selectedNpc.stats === 'object' ? JSON.stringify(selectedNpc.stats, null, 2) : (selectedNpc.stats || "No stats generated.")} onChange={(e) => updateNpcField('stats', e.target.value)} />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                        <Icon name="skull" size={48} className="mb-4 opacity-20"/>
                        <p>Select or Generate an NPC to view details.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NpcView;