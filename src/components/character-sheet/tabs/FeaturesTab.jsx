import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const FeaturesTab = ({ onUse }) => {
    const { character, updateInfo } = useCharacterStore();
    const [showAdd, setShowAdd] = useState(false);
    const [newFeat, setNewFeat] = useState({ name: "", source: "Class", desc: "" });

    // Ensure array exists to prevent crash
    const features = character.features || [];

    const handleAdd = () => {
        if (!newFeat.name) return;
        const updatedFeatures = [...features, newFeat];
        updateInfo('features', updatedFeatures);
        setNewFeat({ name: "", source: "Class", desc: "" });
        setShowAdd(false);
    };

    const handleDelete = (index) => {
        if(!confirm("Remove feature?")) return;
        const updatedFeatures = features.filter((_, i) => i !== index);
        updateInfo('features', updatedFeatures);
    };

    return (
        <div className="space-y-4 pb-24">
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 className="font-bold text-slate-300">Features & Traits</h3>
                <button onClick={() => setShowAdd(!showAdd)} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded flex items-center gap-1 shadow-md transition-all">
                    <Icon name="plus" size={14}/> Add Feature
                </button>
            </div>
            
            {showAdd && (
                <div className="bg-slate-800 p-4 rounded border border-indigo-500/50 animate-in slide-in-from-top-2 shadow-lg mb-4">
                    <div className="grid gap-3 mb-3">
                        <input 
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-amber-500 outline-none" 
                            placeholder="Feature Name (e.g. Second Wind)" 
                            value={newFeat.name} 
                            onChange={e => setNewFeat({...newFeat, name: e.target.value})} 
                        />
                        <div className="flex gap-2">
                            <select 
                                className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm outline-none" 
                                value={newFeat.source} 
                                onChange={e => setNewFeat({...newFeat, source: e.target.value})}
                            >
                                <option value="Class">Class</option>
                                <option value="Species">Species</option>
                                <option value="Feat">Feat</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <textarea 
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm h-20 resize-none focus:border-amber-500 outline-none" 
                            placeholder="Description..." 
                            value={newFeat.desc} 
                            onChange={e => setNewFeat({...newFeat, desc: e.target.value})} 
                        />
                    </div>
                    <button onClick={handleAdd} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded text-sm shadow">Save Feature</button>
                </div>
            )}

            {features.length === 0 ? (
                <div className="text-center text-slate-500 py-8 italic border border-dashed border-slate-800 rounded bg-slate-900/50">
                    No features recorded. <br/> Use the AI Forge or Add manually.
                </div>
            ) : (
                <div className="space-y-3">
                    {features.map((feat, i) => (
                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-sm hover:border-amber-500/50 transition-colors group relative">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-white text-lg">{feat.name}</div>
                                    <div className="text-[10px] text-amber-500 uppercase font-bold tracking-wider mb-2">{feat.source}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => onUse && onUse(feat, 'Feature')} className="px-3 py-1 bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white rounded text-[10px] font-bold transition-colors">
                                        Use
                                    </button>
                                    <button onClick={() => handleDelete(i)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"><Icon name="trash-2" size={16}/></button>
                                </div>
                            </div>
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {feat.desc || "No description."}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FeaturesTab;