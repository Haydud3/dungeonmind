import React, { useState } from 'react';
import Icon from './Icon';
import MapBoard from './MapBoard';

const WorldView = ({ data, setData, role, updateCloud, generateLoc, updateMapState }) => {
    const [tab, setTab] = useState('atlas'); 
    const [genType, setGenType] = useState("Town");
    const [genNote, setGenNote] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [editingLoc, setEditingLoc] = useState(null);

    // CRASH FIX: Ensure array exists
    const locations = data?.locations || [];
    const genesis = data?.campaign?.genesis || {};
    const currentLocation = data?.campaign?.location || "";

    const updateGenesis = (field, val) => {
        const nd = { ...data, campaign: { ...data.campaign, genesis: { ...genesis, [field]: val } } };
        setData(nd); updateCloud(nd);
    };

    const updateCurrentLocation = (val) => {
        const nd = { ...data, campaign: { ...data.campaign, location: val } };
        setData(nd); updateCloud(nd);
    };

    const handleGen = async () => {
        if(isGenerating) return;
        setIsGenerating(true);
        const loc = await generateLoc(genType, genNote, genesis);
        if(loc) {
            const nd = { ...data, locations: [{id:Date.now(), ...loc}, ...locations] };
            setData(nd); updateCloud(nd);
        }
        setIsGenerating(false);
    };

    const updateLocation = (id, field, val) => {
        const newLocs = locations.map(l => l.id === id ? { ...l, [field]: val } : l);
        const nd = { ...data, locations: newLocs };
        setData(nd); updateCloud(nd);
    };

    const deleteLoc = (id) => {
        if(confirm("Delete Location?")) {
            const nd = { ...data, locations: locations.filter(l => l.id !== id) };
            setData(nd); updateCloud(nd, true); 
        }
    };

    const safeText = (val) => (typeof val === 'string' ? val : JSON.stringify(val));

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex border-b border-slate-700 bg-slate-900 shrink-0">
                <button onClick={() => setTab('atlas')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${tab==='atlas' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-slate-500'}`}><Icon name="book" size={16}/> Atlas & Bible</button>
                <button onClick={() => setTab('map')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${tab==='map' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-slate-500'}`}><Icon name="map" size={16}/> Map Board</button>
            </div>
            <div className="flex-1 overflow-hidden relative">
                {tab === 'map' ? (<MapBoard data={data} role={role} updateMapState={updateMapState} />) : (
                    <div className="max-w-7xl mx-auto p-4 md:p-6 h-full flex flex-col md:flex-row gap-6 overflow-y-auto custom-scroll">
                        <div className="w-full md:w-1/3 flex flex-col glass-panel rounded-xl overflow-hidden shrink-0">
                            <div className="p-4 border-b border-slate-700 bg-slate-800/50"><h3 className="fantasy-font text-xl text-amber-500 mb-2">Campaign Bible</h3><p className="text-xs text-slate-400">The core truths.</p></div>
                            <div className="p-4 space-y-4">
                                <div><label className="text-xs font-bold text-green-400 uppercase flex items-center gap-1 mb-1"><Icon name="map-pin" size={12}/> Current Party Location</label><input disabled={role!=='dm'} value={currentLocation} onChange={e => updateCurrentLocation(e.target.value)} placeholder="Where are they now?" className="w-full bg-slate-900 border border-green-900/50 rounded px-2 py-2 text-sm text-green-100 focus:border-green-500 outline-none font-bold"/></div>
                                <div className="border-t border-slate-700 my-4"></div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">Tone</label><input disabled={role!=='dm'} value={genesis.tone || ""} onChange={e => updateGenesis('tone', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200"/></div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">Lore</label><textarea disabled={role!=='dm'} value={genesis.loreText || genesis.conceptDesc || ""} onChange={e => updateGenesis(genesis.loreText ? 'loreText' : 'conceptDesc', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200 h-64 resize-none custom-scroll"/></div>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col glass-panel rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-700 bg-slate-800/50"><h3 className="fantasy-font text-xl text-amber-500">Atlas</h3></div>
                            {role === 'dm' && (<div className="p-4 bg-slate-900/30 border-b border-slate-700 flex flex-col md:flex-row gap-2"><div className="flex gap-2 flex-1"><input list="loc-types" value={genType} onChange={e => setGenType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white outline-none w-32" placeholder="Type..." /><datalist id="loc-types"><option value="Town"/><option value="Dungeon"/></datalist><input value={genNote} onChange={e => setGenNote(e.target.value)} placeholder="Theme / Note" className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white outline-none"/></div><button onClick={handleGen} disabled={isGenerating} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded font-bold text-sm flex items-center justify-center gap-2">{isGenerating ? <span className="animate-spin">...</span> : <Icon name="wand-2" size={16}/>} Generate</button></div>)}
                            <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {locations.map(loc => (<div key={loc.id} className="bg-slate-900/50 border border-slate-700 rounded p-4 relative hover:border-amber-500/30 transition-colors group">{editingLoc === loc.id ? ( <div className="space-y-2"><input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm font-bold text-amber-400" value={loc.name} onChange={e => updateLocation(loc.id, 'name', e.target.value)} /><textarea className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300 h-24" value={loc.desc} onChange={e => updateLocation(loc.id, 'desc', e.target.value)} /><button onClick={() => setEditingLoc(null)} className="bg-green-700 text-white text-xs px-2 py-1 rounded">Done</button></div>) : (<><div className="flex justify-between items-start mb-2"><h4 className="font-bold text-amber-400">{safeText(loc.name)}</h4><span className="text-[10px] uppercase bg-slate-800 px-2 py-1 rounded text-slate-400">{safeText(loc.type)}</span></div><p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{safeText(loc.desc)}</p>{role === 'dm' && (<div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => setEditingLoc(loc.id)} className="text-slate-500 hover:text-white p-1 bg-slate-800 rounded"><Icon name="pencil" size={14}/></button><button onClick={() => deleteLoc(loc.id)} className="text-slate-500 hover:text-red-500 p-1 bg-slate-800 rounded"><Icon name="trash-2" size={14}/></button></div>)}</>)}</div>))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
export default WorldView;
