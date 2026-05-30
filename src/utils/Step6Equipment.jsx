import React, { useState, useEffect } from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';
import { resolveChoice } from './choiceResolver';
import Icon from '../components/Icon';

const Step6Equipment = () => {
    const { draft, ruleset, pendingChoices, addPendingChoice } = useCharacterBuilderStore();
    const [mode, setMode] = useState('starting'); // 'starting' or 'gold'
    const [isResolving, setIsResolving] = useState(false);

    useEffect(() => {
        const resolveEquipment = async () => {
            setIsResolving(true);
            const toResolve = [];
            
            if (draft.classData?.starting_equipment_options) {
                draft.classData.starting_equipment_options.forEach(opt => toResolve.push({ opt, source: 'equipment_class' }));
            }
            if (draft.background?.starting_equipment_options) {
                draft.background.starting_equipment_options.forEach(opt => toResolve.push({ opt, source: 'equipment_bg' }));
            }

            for (const item of toResolve) {
                // Prevent duplicates by checking descriptions
                const existing = useCharacterBuilderStore.getState().pendingChoices.find(c => c.desc === (item.opt.desc || `Choose ${item.opt.choose}`));
                if (!existing) {
                    const resolved = await resolveChoice(item.opt, ruleset);
                    if (resolved) addPendingChoice({ ...resolved, source: item.source });
                }
            }
            setIsResolving(false);
        };
        
        if (mode === 'starting') resolveEquipment();
    }, [draft.classData, draft.background, mode, ruleset, addPendingChoice]);

    const handleChoiceToggle = (choiceId, optionValue, isChecked, maxChoices) => {
        const choiceIndex = pendingChoices.findIndex(c => c.id === choiceId);
        if (choiceIndex === -1) return;

        const choice = pendingChoices[choiceIndex];
        let newSelections = [...(choice.selections || [])];

        if (isChecked) {
            if (newSelections.length >= maxChoices) {
                if (maxChoices === 1) newSelections = [optionValue];
                else return; 
            } else newSelections.push(optionValue);
        } else {
            newSelections = newSelections.filter(v => v !== optionValue);
        }

        const updatedChoices = [...pendingChoices];
        updatedChoices[choiceIndex] = { ...choice, selections: newSelections };
        useCharacterBuilderStore.setState({ pendingChoices: updatedChoices });
    };

    return (
        <div className="flex h-full gap-6 animate-in fade-in">
            {/* Left Column: Mode Selection */}
            <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-24">
                <h3 className="text-xl font-bold text-white mb-2">Equipment Type</h3>
                <button onClick={() => setMode('starting')} className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${mode === 'starting' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                    <div className="font-bold text-lg">Starting Equipment</div>
                    <div className="text-xs mt-1 opacity-80">Choose from predetermined class and background packages.</div>
                </button>
                <button onClick={() => setMode('gold')} className={`text-left px-4 py-4 rounded-xl border transition-all shadow-sm ${mode === 'gold' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                    <div className="font-bold text-lg">Starting Gold</div>
                    <div className="text-xs mt-1 opacity-80">Roll for gold and buy items individually (Standard rules).</div>
                </button>
            </div>

            {/* Right Column: Selections */}
            <div className="w-2/3 bg-slate-800 border border-slate-700 rounded-xl p-8 overflow-y-auto pb-24 shadow-xl">
                <h2 className="text-3xl font-black text-white mb-6">Starting Gear</h2>
                
                {mode === 'starting' ? (
                    <div className="space-y-8">
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Fixed Items Given</h3>
                            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1 pl-2">
                                {draft.classData?.starting_equipment?.map((eq, i) => <li key={`ce-${i}`}>{eq.quantity}x {eq.equipment?.name}</li>)}
                                {draft.background?.starting_equipment?.map((eq, i) => <li key={`be-${i}`}>{eq.quantity}x {eq.equipment?.name}</li>)}
                                {!draft.classData?.starting_equipment?.length && !draft.background?.starting_equipment?.length && <li className="italic text-slate-500">None</li>}
                            </ul>
                        </div>

                        {isResolving ? (
                            <div className="text-center py-8 text-slate-500 animate-pulse">Loading equipment choices...</div>
                        ) : (
                            pendingChoices.filter(c => c.source?.startsWith('equipment')).length > 0 && (
                                <div className="space-y-6">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2">Equipment Choices</h3>
                                    {pendingChoices.filter(c => c.source?.startsWith('equipment')).map(choice => {
                                        const selections = choice.selections || [];
                                        const isMaxed = selections.length >= choice.choose;
                                        return (
                                            <div key={choice.id} className="bg-slate-900 p-4 rounded-lg border border-indigo-800/50">
                                                <p className="text-sm font-bold text-slate-200 mb-3">{choice.desc || `Choose ${choice.choose}`} <span className="text-indigo-400">({selections.length}/{choice.choose})</span></p>
                                                <div className="flex flex-col gap-2">
                                                    {choice.options.map(opt => {
                                                        const isSelected = selections.includes(opt.value);
                                                        const isDisabled = !isSelected && isMaxed && choice.choose > 1;
                                                        return (
                                                            <label key={opt.value} className={`flex items-center gap-3 text-sm p-3 rounded-lg border transition-colors ${isSelected ? 'bg-indigo-900/40 border-indigo-500 text-white shadow-inner' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-indigo-500/50 cursor-pointer'} ${isDisabled ? 'opacity-50 cursor-not-allowed hover:border-slate-700' : ''}`}>
                                                                <input type={choice.choose === 1 ? 'radio' : 'checkbox'} name={choice.id} value={opt.value} checked={isSelected} disabled={isDisabled} onChange={(e) => handleChoiceToggle(choice.id, opt.value, e.target.checked, choice.choose)} className="accent-indigo-500 w-4 h-4 shrink-0" />
                                                                <span className="font-medium">{opt.label}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </div>
                ) : (
                    <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700 text-center">
                        <Icon name="coins" size={48} className="text-amber-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-amber-500 mb-2">Starting Gold Option</h3>
                        <p className="text-slate-300 text-sm mb-6">By selecting this option, you forgo your class and background starting equipment. You will start with a random amount of gold based on your class to purchase gear manually.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
export default Step6Equipment;