import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const FeaturesTab = ({ onDiceRoll, onLogAction, isOwner }) => {
    const { character, updateInfo, toggleCondition } = useCharacterStore();
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

    const toggleUse = (index) => {
        if (!isOwner) return;
        const updatedFeatures = [...features];
        if (updatedFeatures[index].uses) {
            const u = updatedFeatures[index].uses;
            if (u.current > 0) u.current--;
            else u.current = u.max;
            updateInfo('features', updatedFeatures);
        }
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
                                    <div className="font-bold text-white text-lg flex items-center gap-2">
                                        {feat.name}
                                        {feat.uses && (
                                            <div className="flex flex-wrap max-w-[120px] gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                                                {Array.from({ length: feat.uses.max }).map((_, ui) => (
                                                    <div
                                                        key={ui}
                                                        onClick={() => toggleUse(i)}
                                                        className={`w-2.5 h-2.5 rounded-full border transition-colors ${ui < feat.uses.current ? 'bg-amber-500 border-amber-600' : 'bg-slate-900 border-slate-600'} ${isOwner ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
                                                    />
                                                ))}
                                                {feat.uses.recovery && <span className="text-[9px] text-slate-500 uppercase tracking-widest ml-1 bg-slate-900 px-1 rounded border border-slate-700 w-full mt-1">{feat.uses.recovery}</span>}
                                            </div>
                                        )}                                    </div>
                                    <div className="text-[10px] text-amber-500 uppercase font-bold tracking-wider mb-2">{feat.source}</div>
                                </div>
                                <div className="flex gap-2">
                                    {feat.name.toLowerCase().includes('rage') && character.conditions?.includes('Raging') ? (
                                        <button onClick={() => toggleCondition('Raging')} className="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-200 hover:text-white rounded text-[10px] font-bold transition-colors">
                                            End Rage
                                        </button>
                                    ) : (
                                        <button onClick={() => {
                                            if (onDiceRoll) {
                                                onDiceRoll('1d0', {
                                                    alias: feat.name,
                                                    description: feat.description || feat.desc || "",
                                                    actionType: 'use',
                                                    characterName: character.name
                                                });
                                            } else if (onLogAction) {
                                                onLogAction(`
                                                    <div class="font-bold text-indigo-300">${feat.name}</div>
                                                    <div class="text-xs text-slate-400 mt-1">${feat.description || feat.desc || ""}</div>
                                                `);
                                            }
                                            if (feat.name.toLowerCase().includes('rage')) toggleCondition('Raging');
                                        }} className="px-3 py-1 bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white rounded text-[10px] font-bold transition-colors">
                                            Use
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(i)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"><Icon name="trash-2" size={16}/></button>
                                </div>
                            </div>
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {String(feat.description || feat.desc || "No description.").replace(/<[^>]*>?/gm, '')}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FeaturesTab;