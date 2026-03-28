import React, { useState } from 'react';
import Icon from './Icon';
import { useNewCampaign } from '../contexts/NewCampaignProvider';

const OnboardingWizard = ({ aiHelper }) => {
    const { updateCampaign } = useNewCampaign();
    const [step, setStep] = useState(1);
    const [data, setData] = useState({ sourceMode: 'new', campaignName: '', tone: 'Adventurous', conceptDesc: '', conflict: '', loreText: '' });
    const [isThinking, setIsThinking] = useState(false);
    const [verificationData, setVerificationData] = useState(null); 

    const steps = [{ id: 1, title: 'Source', icon: 'book' }, { id: 2, title: 'Tone', icon: 'music' }, { id: 3, title: 'Lore', icon: 'lightbulb' }, { id: 4, title: 'Conflict', icon: 'sword' }];

    const handleNext = () => { 
        if (step < 4) setStep(s => s + 1); 
        else {
            const updates = { onboardingComplete: true };
            if (data) {
                updates['campaign.genesis'] = {
                    tone: data.tone || 'Heroic',
                    conflict: data.conflict || '',
                    campaignName: data.campaignName || 'New Campaign'
                };
            }
            updateCampaign(updates);
        }
    };
    
    // ... rest of the component
    
    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="max-w-3xl w-full bg-slate-800 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-900 p-6 border-b border-slate-700 flex justify-between items-center"><div><h2 className="text-2xl fantasy-font text-amber-500">Genesis</h2><p className="text-slate-400 text-sm">Forging the world.</p></div><div className="flex gap-2">{steps.map(s => (<div key={s.id} className={`h-2 w-8 rounded-full ${step >= s.id ? 'bg-amber-500' : 'bg-slate-700'}`}></div>))}</div></div>
                
                <div className="flex-1 p-8 overflow-y-auto custom-scroll animate-in fade-in zoom-in duration-300">
                    {/* ... (step rendering logic) */}
                </div>
                
                <div className="bg-slate-900 p-6 border-t border-slate-700 flex justify-between">
                    {!verificationData && (
                        <>
                            <button onClick={step === 1 ? () => updateCampaign({ onboardingComplete: true }) : () => setStep(s=>s-1)} className="text-slate-500 hover:text-white font-bold px-4 py-2">{step === 1 ? "Skip Wizard" : "Back"}</button>
                            <button onClick={handleNext} disabled={step===1 && data.sourceMode==='official'} className={`bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-2 rounded shadow-lg shadow-amber-900/20 ${step===1 && data.sourceMode==='official' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                {step === 4 ? "Initialize Campaign" : "Next Step"}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OnboardingWizard;