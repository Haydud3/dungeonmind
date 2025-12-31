import React, { useState } from 'react';
import Icon from './Icon';

const WorldView = ({ data, setData, role, updateCloud, generateLoc }) => {
    const [genType, setGenType] = useState("Town");
    const [genNote, setGenNote] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Safety checks for data structure
    const locations = data.locations || [];
    const genesis = data.campaign?.genesis || {};

    const updateGenesis = (field, val) => {
        const newData = { 
            ...data, 
            campaign: { 
                ...data.campaign, 
                genesis: { ...genesis, [field]: val } 
            } 
        };
        setData(newData);
        if(updateCloud) updateCloud(newData);
    };

    const handleGen = async () => {
        if(isGenerating || !generateLoc) return;
        setIsGenerating(true);
        // We will connect the real AI function in App.jsx later
        const loc = await generateLoc(genType, genNote, genesis);
        if(loc) {
            const newData = { ...data, locations: [{id:Date.now(), ...loc}, ...locations] };
            setData(newData);
            if(updateCloud) updateCloud(newData);
        }
        setIsGenerating(false);
    };

    const deleteLoc = (id) => {
        if(confirm("Delete Location?")) {
            const newData = { ...data, locations: locations.filter(l => l.id !== id) };
            setData(newData);
            if(updateCloud) updateCloud(newData);
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 h-full flex flex-col md:flex-row gap-6 overflow-hidden pb-24 md:pb-6">
            {/* Left Col: Campaign Bible */}
            <div className="w-full md:w-1/3 flex flex-col glass-panel rounded-xl overflow-hidden max-h-full bg-slate-900/50 border border-slate-700">
                <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                    <h3 className="fantasy-font text-xl text-amber-500 mb-1">Campaign Bible</h3>
                    <p className="text-xs text-slate-400">The core truths of your world.</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Tone</label>
                        <input 
                            disabled={role!=='dm'} 
                            value={genesis.tone || ""} 
                            onChange={e => updateGenesis('tone', e.target.value)} 
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200 focus:border-amber-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Central Conflict</label>
                        <textarea 
                            disabled={role!=='dm'} 
                            value={genesis.conflict || ""} 
                            onChange={e => updateGenesis('conflict', e.target.value)} 
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200 h-24 resize-none focus:border-amber-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Lore / Concept</label>
                        <textarea 
                            disabled={role!=='dm'} 
                            value={genesis.loreText || genesis.conceptDesc || ""} 
                            onChange={e => updateGenesis(genesis.loreText ? 'loreText' : 'conceptDesc', e.target.value)} 
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200 h-64 resize-none custom-scroll focus:border-amber-500 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Right Col: Atlas */}
            <div className="flex-1 flex flex-col glass-panel rounded-xl overflow-hidden max-h-full bg-slate-900/50 border border-slate-700">
                <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                    <h3 className="fantasy-font text-xl text-amber-500">Atlas</h3>
                </div>
                
                {role === 'dm' && (
                    <div className="p-4 bg-slate-900/30 border-b border-slate-700 flex flex-col md:flex-row gap-2">
                        <div className="flex gap-2 flex-1">
                            <select value={genType} onChange={e => setGenType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white outline-none">
                                <option value="Town">Town</option>
                                <option value="Dungeon">Dungeon</option>
                                <option value="Region">Region</option>
                                <option value="Shop">Shop</option>
                            </select>
                            <input value={genNote} onChange={e => setGenNote(e.target.value)} placeholder="Optional theme (e.g. 'underwater')" className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white outline-none"/>
                        </div>
                        <button onClick={handleGen} disabled={isGenerating} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded font-bold text-sm flex items-center justify-center gap-2">
                            {isGenerating ? <span className="animate-spin">...</span> : <Icon name="wand-2" size={16}/>} Generate
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scroll p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {locations.map(loc => (
                        <div key={loc.id} className="bg-slate-900 border border-slate-800 rounded p-4 relative hover:border-amber-500/30 transition-colors group">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-amber-400">{loc.name}</h4>
                                <span className="text-[10px] uppercase bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-400">{loc.type}</span>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{loc.desc}</p>
                            {role === 'dm' && (
                                <button onClick={() => deleteLoc(loc.id)} className="absolute bottom-2 right-2 text-slate-600 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icon name="trash-2" size={16}/>
                                </button>
                            )}
                        </div>
                    ))}
                    {locations.length === 0 && <div className="col-span-full text-center text-slate-500 mt-10">No locations mapped yet.</div>}
                </div>
            </div>
        </div>
    );
};

export default WorldView;