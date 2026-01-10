import React, { useState } from 'react';
import Icon from './Icon';

const NpcView = ({ data, setData, role, updateCloud, generateNpc, setChatInput, setView, onPossess }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showWizard, setShowWizard] = useState(false);

    // Generator State
    const [wizName, setWizName] = useState("");
    const [wizContext, setWizContext] = useState("");
    const [wizHidden, setWizHidden] = useState(true); // Default to hidden for safety

    // CRASH FIX: Ensure array exists
    const npcs = (data?.npcs || []).filter(n => n && n.id);
    const visibleNpcs = role === 'dm' ? npcs : npcs.filter(n => !n.isHidden);
    const safeText = (val) => (typeof val === 'object' && val !== null) ? (val.primary || JSON.stringify(val)) : (val || "");

    const handleGen = async () => {
        if(isGenerating) return; 
        setIsGenerating(true);
        
        // Pass context to AI
        const npcData = await generateNpc(wizName, wizContext);
        
        if(npcData) { 
            const newNpc = { 
                id: Date.now(), 
                isHidden: wizHidden, // Use the checkbox value 
                name: "Unknown", 
                race: "???", 
                class: "Commoner", 
                quirk: "None", 
                ...npcData 
            }; 
            const newNpcs = [...npcs, newNpc]; 
            const nd = { ...data, npcs: newNpcs }; 
            setData(nd); updateCloud(nd); 
            
            // Reset Wizard
            setWizName(""); 
            setWizContext(""); 
            setWizHidden(true);
            setShowWizard(false);

            // Select new NPC
            setSelectedNpc(newNpc); 
            setIsEditing(false); 
        }
        setIsGenerating(false);
    };

    const deleteNpc = (id, e) => {
        if(e) e.stopPropagation(); 
        if(!confirm("Delete this NPC?")) return;
        const newNpcs = npcs.filter(n => n.id !== id); 
        const nd = { ...data, npcs: newNpcs }; 
        setData(nd); updateCloud(nd, true); 
        if(selectedNpc?.id === id) setSelectedNpc(null);
    };
    
    const toggleHidden = (npc) => {
        const updated = { ...npc, isHidden: !npc.isHidden }; 
        const newNpcs = npcs.map(n => n.id === npc.id ? updated : n); 
        const nd = { ...data, npcs: newNpcs }; 
        setData(nd); updateCloud(nd); 
        if(selectedNpc?.id === npc.id) setSelectedNpc(updated);
    };

    const updateNpcField = (field, value) => {
        if(!selectedNpc) return;
        const updated = { ...selectedNpc, [field]: value };
        setSelectedNpc(updated);
        const newNpcs = npcs.map(n => n.id === updated.id ? updated : n);
        const nd = { ...data, npcs: newNpcs }; 
        setData(nd); updateCloud(nd);
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 h-full flex flex-col md:flex-row gap-6 pb-20 md:pb-6">
            {/* NPC LIST SIDEBAR */}
            <div className={`${selectedNpc ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 flex-col glass-panel rounded-xl overflow-hidden max-h-full bg-slate-900/50`}>
                <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                    <h3 className="fantasy-font text-xl text-amber-500">NPC Registry</h3>
                    {role === 'dm' && (
                        <button 
                            onClick={() => setShowWizard(true)}
                            className="bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-2 shadow-lg transition-transform hover:scale-105"
                        >
                            <Icon name="plus" size={14}/> Summon NPC
                        </button>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
                    {visibleNpcs.length === 0 && <div className="text-slate-500 text-center text-sm py-4 italic">No NPCs found.</div>}
                    {visibleNpcs.map(npc => (
                        <div key={npc.id} onClick={() => { setSelectedNpc(npc); setIsEditing(false); }} className={`p-3 rounded cursor-pointer border transition-all relative group ${selectedNpc?.id === npc.id ? 'bg-amber-900/20 border-amber-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500'} ${npc.isHidden ? 'opacity-75 border-dashed border-slate-600' : ''}`}>
                            <div className="font-bold text-slate-200 flex items-center gap-2">
                                {safeText(npc.name)}
                                {role === 'dm' && npc.isHidden && <Icon name="eye-off" size={14} className="text-slate-500"/>}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{safeText(npc.race)} {safeText(npc.class)}</div>
                            {role === 'dm' && (
                                <button onClick={(e) => deleteNpc(npc.id, e)} className="absolute top-2 right-2 text-slate-600 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icon name="trash-2" size={14}/>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* NPC DETAILS PANEL */}
            <div className={`${selectedNpc ? 'flex' : 'hidden md:flex'} flex-1 glass-panel rounded-xl p-4 md:p-6 overflow-y-auto custom-scroll relative flex-col bg-slate-900/50`}>
                {selectedNpc ? (
                    <div className="space-y-4 pt-10 md:pt-0">
                        <div className="flex flex-col md:flex-row justify-between items-start border-b border-slate-700 pb-4 gap-4">
                            <div className="flex-1 w-full">
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <input className="text-3xl font-bold bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full text-white" value={selectedNpc.name} onChange={e => updateNpcField('name', e.target.value)} placeholder="Name"/>
                                        <div className="flex gap-2">
                                            <input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-amber-500 w-1/2" value={safeText(selectedNpc.race)} onChange={e => updateNpcField('race', e.target.value)} placeholder="Race"/>
                                            <input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-amber-500 w-1/2" value={safeText(selectedNpc.class)} onChange={e => updateNpcField('class', e.target.value)} placeholder="Class"/>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h2 className="text-3xl fantasy-font text-white">{safeText(selectedNpc.name)}</h2>
                                        <div className="text-amber-500 font-mono text-sm">{safeText(selectedNpc.race)} {safeText(selectedNpc.class)}</div>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-2 w-full md:w-auto justify-end">
                                {role === 'dm' && (
                                    <>
                                        <button onClick={() => toggleHidden(selectedNpc)} className={`p-3 rounded text-sm ${selectedNpc.isHidden ? 'bg-slate-700 text-slate-300' : 'bg-green-900/50 text-green-300'}`}><Icon name={selectedNpc.isHidden ? "eye-off" : "eye"} size={16}/></button>
                                        <button onClick={() => setIsEditing(!isEditing)} className={`p-3 rounded text-sm ${isEditing ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300'}`}><Icon name={isEditing ? "check" : "pencil"} size={16}/></button>
                                        <button onClick={() => onPossess(selectedNpc.id)} className="bg-purple-900/50 hover:bg-purple-800 text-purple-200 px-4 py-2 rounded text-sm flex items-center gap-2"><Icon name="ghost" size={16}/> Possess</button>
                                    </>
                                )}
                                <button onClick={() => { setChatInput(`(Playing as ${selectedNpc.name}) `); setView('session'); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm flex items-center gap-2"><Icon name="message-circle" size={16}/> Chat</button>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Quirk</div>
                                {isEditing ? <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" value={selectedNpc.quirk || ""} onChange={e => updateNpcField('quirk', e.target.value)}/> : <div className="text-slate-300 text-sm">{safeText(selectedNpc.quirk)}</div>}
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Goal</div>
                                {isEditing ? <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" value={selectedNpc.goal || ""} onChange={e => updateNpcField('goal', e.target.value)}/> : <div className="text-slate-300 text-sm">{safeText(selectedNpc.goal)}</div>}
                            </div>
                        </div>
                        <div className="mt-2">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Personality</div>
                            {isEditing ? (
                                <textarea className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-2 text-sm text-slate-200 h-24 resize-none focus:border-amber-500 outline-none" value={selectedNpc.personality || ""} onChange={e => updateNpcField('personality', e.target.value)}/>
                            ) : (
                                <div className="text-slate-400 text-sm italic">{safeText(selectedNpc.personality)}</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                        <Icon name="skull" size={48} className="mb-4 opacity-20"/>
                        <p>Select or Summon an NPC.</p>
                        {role === 'dm' && <button onClick={() => setShowWizard(true)} className="mt-4 text-amber-500 hover:text-amber-400 text-sm font-bold">Summon New NPC</button>}
                    </div>
                )}
            </div>

            {/* --- NPC WIZARD MODAL --- */}
            {showWizard && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-lg w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative border border-slate-700">
                        <button onClick={() => setShowWizard(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                        
                        <div className="p-6">
                            <h2 className="text-2xl fantasy-font text-amber-500 mb-6 text-center">Summon NPC</h2>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Name</label>
                                    <input 
                                        value={wizName} 
                                        onChange={e => setWizName(e.target.value)} 
                                        placeholder="e.g. Grommash, The Shopkeeper" 
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-amber-500 outline-none"
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Role / Context</label>
                                    <textarea 
                                        value={wizContext} 
                                        onChange={e => setWizContext(e.target.value)} 
                                        placeholder="e.g. A grumpy blacksmith who hates elves but loves gold. Has a secret map." 
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-amber-500 outline-none h-24 resize-none"
                                    />
                                </div>

                                <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer" onClick={() => setWizHidden(!wizHidden)}>
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${wizHidden ? 'bg-amber-600 border-amber-600' : 'border-slate-500'}`}>
                                        {wizHidden && <Icon name="check" size={14} className="text-white"/>}
                                    </div>
                                    <span className="text-sm text-slate-300 select-none">Hide from Players immediately</span>
                                </div>

                                <button 
                                    onClick={handleGen} 
                                    disabled={isGenerating || !wizName} 
                                    className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex justify-center items-center gap-2 mt-4 ${!wizName ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500'}`}
                                >
                                    {isGenerating ? <><Icon name="loader-2" size={20} className="animate-spin"/> Summoning...</> : <><Icon name="wand-2" size={20}/> Generate Specs</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NpcView;