import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';
import { useDialog } from '../../DialogProvider';
import RollButton from '../widgets/RollButton';
import TrackerPips from '../widgets/TrackerPips';

const SOURCE_COLORS = {
    class: 'border-blue-500/40 text-blue-300 bg-blue-500/10',
    species: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
    feat: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
    other: 'border-purple-500/40 text-purple-300 bg-purple-500/10'
};

const FeaturesTab = ({ onDiceRoll, onLogAction, isOwner = true }) => {
    const dialog = useDialog();
    const { character, updateInfo, toggleCondition } = useCharacterStore();
    const [showAdd, setShowAdd] = useState(false);
    const [newFeat, setNewFeat] = useState({ name: '', source: 'Class', desc: '', usesMax: 0, recovery: 'Long Rest' });
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSource, setFilterSource] = useState('all');

    const features = character.features || [];

    const handleAdd = () => {
        if (!newFeat.name.trim()) return;
        const featToAdd = {
            name: newFeat.name.trim(),
            source: newFeat.source,
            desc: newFeat.desc.trim(),
            description: newFeat.desc.trim()
        };

        if (newFeat.usesMax > 0) {
            featToAdd.uses = {
                current: parseInt(newFeat.usesMax),
                max: parseInt(newFeat.usesMax),
                recovery: newFeat.recovery
            };
        }

        const updatedFeatures = [...features, featToAdd];
        updateInfo('features', updatedFeatures);
        setNewFeat({ name: '', source: 'Class', desc: '', usesMax: 0, recovery: 'Long Rest' });
        setShowAdd(false);
    };

    const handleDelete = async (index) => {
        if (!isOwner) return;
        if (!(await dialog.confirm('Remove this feature?'))) return;
        const updatedFeatures = features.filter((_, i) => i !== index);
        updateInfo('features', updatedFeatures);
    };

    const toggleUse = (index) => {
        if (!isOwner) return;
        const updatedFeatures = [...features];
        if (updatedFeatures[index].uses) {
            const u = { ...updatedFeatures[index].uses };
            if (u.current > 0) u.current--;
            else u.current = u.max;
            updatedFeatures[index].uses = u;
            updateInfo('features', updatedFeatures);
        }
    };

    const handleUseFeature = (feat) => {
        const featName = feat.name || '';
        const desc = feat.description || feat.desc || '';

        if (onDiceRoll) {
            onDiceRoll('1d0', {
                alias: featName,
                description: desc,
                actionType: 'use',
                characterName: character.name
            });
        } else if (onLogAction) {
            onLogAction(`
                <div class="font-bold text-amber-400">${featName}</div>
                <div class="text-xs text-slate-300 mt-1">${desc}</div>
            `);
        }

        if (featName.toLowerCase().includes('rage')) {
            toggleCondition('Raging');
        }
    };

    const filteredFeatures = features.filter(feat => {
        const nameMatch = (feat.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (feat.description || feat.desc || '').toLowerCase().includes(searchQuery.toLowerCase());
        if (!nameMatch) return false;

        if (filterSource === 'all') return true;
        return (feat.source || 'Class').toLowerCase() === filterSource.toLowerCase();
    });

    return (
        <div className="space-y-6 pb-24">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                    <h3 className="font-bold text-slate-200 text-sm">Features & Traits</h3>
                    <span className="text-[10px] text-slate-500 font-mono">({features.length})</span>
                </div>

                {isOwner && (
                    <button 
                        type="button"
                        onClick={() => setShowAdd(!showAdd)} 
                        className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                        <Icon name={showAdd ? 'x' : 'plus'} size={14}/>
                        <span>{showAdd ? 'Cancel' : 'Add Feature'}</span>
                    </button>
                )}
            </div>
            
            {/* Add Feature Form Drawer */}
            {showAdd && (
                <div className="bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-amber-500/40 shadow-xl space-y-3">
                    <h4 className="text-xs uppercase font-bold text-amber-400 tracking-wider">New Feature or Trait</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label className="text-slate-400 font-bold block mb-1">Feature Name</label>
                            <input 
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none focus:border-amber-500" 
                                placeholder="e.g. Action Surge, Darkvision, War Caster" 
                                value={newFeat.name} 
                                onChange={e => setNewFeat({ ...newFeat, name: e.target.value })} 
                            />
                        </div>
                        <div>
                            <label className="text-slate-400 font-bold block mb-1">Source</label>
                            <select 
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none focus:border-amber-500" 
                                value={newFeat.source} 
                                onChange={e => setNewFeat({ ...newFeat, source: e.target.value })}
                            >
                                <option value="Class">Class</option>
                                <option value="Species">Species</option>
                                <option value="Feat">Feat</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-slate-400 font-bold block mb-1">Resource Uses (Optional Max)</label>
                            <input 
                                type="number"
                                min="0"
                                max="20"
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none focus:border-amber-500 font-mono" 
                                placeholder="0 = unlimited" 
                                value={newFeat.usesMax} 
                                onChange={e => setNewFeat({ ...newFeat, usesMax: e.target.value })} 
                            />
                        </div>
                        <div>
                            <label className="text-slate-400 font-bold block mb-1">Recovery Rate</label>
                            <select 
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none focus:border-amber-500" 
                                value={newFeat.recovery} 
                                onChange={e => setNewFeat({ ...newFeat, recovery: e.target.value })}
                            >
                                <option value="Short Rest">Short Rest</option>
                                <option value="Long Rest">Long Rest</option>
                                <option value="Dawn">Dawn</option>
                                <option value="Special">Special</option>
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="text-slate-400 font-bold block mb-1">Description</label>
                            <textarea 
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-white text-xs h-24 resize-none focus:border-amber-500 outline-none leading-relaxed" 
                                placeholder="Rules, mechanics, and text..." 
                                value={newFeat.desc} 
                                onChange={e => setNewFeat({ ...newFeat, desc: e.target.value })} 
                            />
                        </div>
                    </div>
                    <div className="flex justify-end pt-1">
                        <button 
                            type="button"
                            onClick={handleAdd} 
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow-md transition-all"
                        >
                            Save Feature
                        </button>
                    </div>
                </div>
            )}

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                    <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search features..."
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
                    />
                    {searchQuery && (
                        <button 
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                            <Icon name="x" size={13} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'class', label: 'Class' },
                        { id: 'species', label: 'Species' },
                        { id: 'feat', label: 'Feats' },
                        { id: 'other', label: 'Other' },
                    ].map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFilterSource(f.id)}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                filterSource === f.id
                                    ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                    : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Feature Cards */}
            {filteredFeatures.length === 0 ? (
                <div className="text-center text-slate-500 py-12 italic border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                    {features.length === 0 
                        ? 'No features recorded. Use the AI Forge or click "+ Add Feature".' 
                        : `No features match "${searchQuery || filterSource}".`}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredFeatures.map((feat, i) => {
                        const originalIndex = features.indexOf(feat);
                        const isRaging = feat.name?.toLowerCase().includes('rage') && character.conditions?.includes('Raging');
                        const sourceKey = (feat.source || 'class').toLowerCase();
                        const sourceClass = SOURCE_COLORS[sourceKey] || SOURCE_COLORS.class;

                        return (
                            <div 
                                key={`${feat.name}-${i}`} 
                                className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 rounded-2xl p-4 shadow-lg transition-all group relative"
                            >
                                <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                                    <div className="flex-1 min-w-[200px]">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="font-bold text-slate-100 text-sm">
                                                {feat.name}
                                            </h4>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${sourceClass}`}>
                                                {feat.source || 'Class'}
                                            </span>
                                        </div>

                                        {feat.uses && (
                                            <div className="flex items-center gap-3 mt-2" onClick={(e) => e.stopPropagation()}>
                                                <TrackerPips 
                                                    max={feat.uses.max} 
                                                    current={feat.uses.current} 
                                                    onChange={() => isOwner && toggleUse(originalIndex)} 
                                                    readOnly={!isOwner}
                                                />
                                                {feat.uses.recovery && (
                                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 font-mono">
                                                        {feat.uses.recovery}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {isRaging ? (
                                            <RollButton 
                                                onClick={() => toggleCondition('Raging')} 
                                                type="action"
                                                className="bg-rose-950 hover:bg-rose-900 border-rose-700 text-rose-200 text-xs px-3"
                                            >
                                                End Rage
                                            </RollButton>
                                        ) : (
                                            <RollButton 
                                                onClick={() => handleUseFeature(feat)} 
                                                type="use"
                                                className="text-xs px-3 font-semibold"
                                            >
                                                Use
                                            </RollButton>
                                        )}

                                        {isOwner && (
                                            <button 
                                                type="button"
                                                onClick={() => handleDelete(originalIndex)} 
                                                className="text-slate-600 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                                                title="Delete Feature"
                                            >
                                                <Icon name="trash-2" size={14}/>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap pt-1 border-t border-slate-800/50">
                                    {String(feat.description || feat.desc || 'No description provided.').replace(/<[^>]*>?/gm, '')}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default FeaturesTab;