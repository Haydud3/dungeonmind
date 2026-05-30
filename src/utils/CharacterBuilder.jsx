import React, { useEffect, useState } from 'react';
import { useCharacterBuilderStore } from '../stores/useCharacterBuilderStore';
import Step1Setup from './Step1Setup';
import Step2Species from './Step2Species';
import Step3Class from './Step3Class';
import Step4Abilities from './Step4Abilities';
import Step5Background from './Step5Background';
import Step6Equipment from './Step6Equipment';
import Step7Spells from './Step7Spells';
import Icon from '../components/Icon'; 
import { buildDungeonMindSheet } from './builderExporter';
import { enrichCharacter } from './srdEnricher';

const CharacterBuilder = ({ onClose, onComplete }) => {
    const { loadInitialData, isDataLoading } = useCharacterBuilderStore();
    const [currentStep, setCurrentStep] = useState(1);
    const [isFinishing, setIsFinishing] = useState(false);
    
    useEffect(() => {
        // Fetch the 5e JSONs into the Zustand store immediately
        loadInitialData();
    }, [loadInitialData]);

    const steps = [
        { id: 1, name: 'Setup' },
        { id: 2, name: 'Species' },
        { id: 3, name: 'Class' },
        { id: 4, name: 'Abilities' },
        { id: 5, name: 'Background' },
        { id: 6, name: 'Equipment' },
        { id: 7, name: 'Spells' }
    ];

    const handleFinish = async () => {
        setIsFinishing(true);
        try {
            const { draft, pendingChoices } = useCharacterBuilderStore.getState();
            const finalSheet = buildDungeonMindSheet(draft, pendingChoices);
            const enrichedSheet = await enrichCharacter(finalSheet);
            if (onComplete) onComplete(enrichedSheet);
        } catch (error) {
            console.error("Failed to enrich character:", error);
            const { draft, pendingChoices } = useCharacterBuilderStore.getState();
            const finalSheet = buildDungeonMindSheet(draft, pendingChoices);
            if (onComplete) onComplete(finalSheet); // Fallback to raw sheet if API is down
        } finally {
            setIsFinishing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
            {/* Header / Navigation Tabs */}
            <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                        Character Builder
                    </h1>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {steps.map(step => (
                        <button 
                            key={step.id}
                            onClick={() => setCurrentStep(step.id)}
                            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${currentStep === step.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                        >
                            {step.id}. {step.name}
                        </button>
                    ))}
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white font-bold px-4 py-2">
                    Exit
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden p-6">
                {isDataLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                        <Icon name="loader-2" size={32} className="animate-spin text-blue-500" />
                        <p className="font-bold tracking-widest uppercase text-sm">Loading SRD Compendium...</p>
                    </div>
                ) : (
                    <div className="h-full max-w-5xl mx-auto">
                        {currentStep === 1 && <Step1Setup />}
                        {currentStep === 2 && <Step2Species />}
                        {currentStep === 3 && <Step3Class />}
                        {currentStep === 4 && <Step4Abilities />}
                        {currentStep === 5 && <Step5Background />}
                        {currentStep === 6 && <Step6Equipment />}
                        {currentStep === 7 && <Step7Spells />}
                        {currentStep > 7 && (
                            <div className="h-full flex items-center justify-center text-slate-500 italic">
                                Step {currentStep} coming soon...
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Footer Navigation */}
            <div className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 flex justify-between px-8">
                <button onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))} disabled={currentStep === 1} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg disabled:opacity-50 hover:bg-slate-700 transition-colors">Previous</button>
                {currentStep === 7 ? (
                    <button onClick={handleFinish} disabled={isFinishing} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-900/20 flex items-center gap-2">
                        {isFinishing ? <Icon name="loader" size={18} className="animate-spin" /> : <Icon name="check" size={18}/>}
                        {isFinishing ? "Finalizing..." : "Finish & Export"}
                    </button>
                ) : (
                    <button onClick={() => setCurrentStep(prev => Math.min(7, prev + 1))} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20">Next</button>
                )}
            </div>
        </div>
    );
};
export default CharacterBuilder;