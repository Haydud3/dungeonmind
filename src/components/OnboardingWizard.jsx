import React, { useState } from 'react';
import Icon from './Icon';

const OnboardingWizard = ({ onComplete, aiHelper }) => {
    const [step, setStep] = useState(1);
    const [data, setData] = useState({ sourceMode: 'new', campaignName: '', tone: 'Adventurous', conceptDesc: '', conflict: '', loreText: '' });
    const [isThinking, setIsThinking] = useState(false);
    const [verificationData, setVerificationData] = useState(null); 

    const steps = [{ id: 1, title: 'Source', icon: 'book' }, { id: 2, title: 'Tone', icon: 'music' }, { id: 3, title: 'Lore', icon: 'lightbulb' }, { id: 4, title: 'Conflict', icon: 'sword' }];

    const handleNext = () => { 
        if (step < 4) setStep(s => s + 1); 
        else onComplete(data); 
    };

    const verifyCampaign = async () => {
        if (!data.campaignName.trim() || isThinking) return;
        setIsThinking(true);
        const prompt = `Role: D&D 5e Expert. User Module: "${data.campaignName}". 
        Task: 
        1. Write a 1-paragraph summary of the setting/plot (max 150 words). 
        2. Identify the central conflict/BBEG (max 2 sentences). 
        3. Create a Yes/No trivia question to verify this is the correct campaign (e.g. "Is the setting Barovia?"). 
        Format JSON: { "lore": "...", "conflict": "...", "question": "...", "answer": "yes/no" }`;
        
        try {
            // We expect aiHelper to be passed down from App.jsx
            const res = await aiHelper([{ role: "user", content: prompt }]);
            const jsonMatch = res.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const vData = JSON.parse(jsonMatch[0]);
                setVerificationData(vData);
            } else {
                alert("AI couldn't verify. Please enter details manually.");
                setData({...data, sourceMode: 'new'}); 
                setStep(s => s + 1);
            }
        } catch(e) {
            alert("Verification Error: " + e.message);
        }
        setIsThinking(false);
    };

    const confirmVerification = (isYes) => {
        if (isYes) {
            setData(p => ({ ...p, loreText: verificationData.lore, conflict: verificationData.conflict }));
            setVerificationData(null);
            setStep(2); 
        } else {
            alert("Let's try manual entry then.");
            setVerificationData(null);
            setData(p => ({ ...p, sourceMode: 'new', campaignName: '' })); 
        }
    };

    const handleBrainstorm = async () => {
        if (isThinking) return; setIsThinking(true);
        const prompt = `Role: DM Assistant. Context: A ${data.tone} campaign. Concept: ${data.conceptDesc}. Task: Suggest a central conflict. Max 2 sentences.`;
        try { const res = await aiHelper([{ role: "user", content: prompt }]); if (res) setData(p => ({ ...p, conflict: res })); } catch (e) { alert("AI Error: " + e.message); }
        setIsThinking(false);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="max-w-3xl w-full bg-slate-800 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-900 p-6 border-b border-slate-700 flex justify-between items-center"><div><h2 className="text-2xl fantasy-font text-amber-500">Genesis</h2><p className="text-slate-400 text-sm">Forging the world.</p></div><div className="flex gap-2">{steps.map(s => (<div key={s.id} className={`h-2 w-8 rounded-full ${step >= s.id ? 'bg-amber-500' : 'bg-slate-700'}`}></div>))}</div></div>
                
                <div className="flex-1 p-8 overflow-y-auto custom-scroll animate-in fade-in zoom-in duration-300">
                    {step === 1 && !verificationData && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 text-amber-400 mb-2"><Icon name="book" size={24}/><h3 className="text-xl font-bold">1. The Source</h3></div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div onClick={() => setData({...data, sourceMode: 'new'})} className={`p-6 rounded-lg border cursor-pointer ${data.sourceMode === 'new' ? 'bg-amber-900/40 border-amber-500' : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'}`}>
                                    <div className="font-bold text-lg mb-2 text-white">Homebrew World</div>
                                    <p className="text-sm text-slate-300">Forge a world from scratch or your own notes.</p>
                                </div>
                                <div onClick={() => setData({...data, sourceMode: 'official'})} className={`p-6 rounded-lg border cursor-pointer ${data.sourceMode === 'official' ? 'bg-amber-900/40 border-amber-500' : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'}`}>
                                    <div className="font-bold text-lg mb-2 text-white">Official Module</div>
                                    <p className="text-sm text-slate-300">Run a published campaign (e.g. Curse of Strahd).</p>
                                </div>
                            </div>
                            {data.sourceMode === 'official' && (
                                <div className="animate-in fade-in slide-in-from-top-4">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Campaign Name</label>
                                    <div className="flex gap-2">
                                        <input value={data.campaignName} onChange={e => setData({...data, campaignName: e.target.value})} className="flex-1 bg-slate-900 border border-slate-600 p-3 rounded text-slate-200" placeholder="e.g. Lost Mine of Phandelver"/>
                                        <button onClick={verifyCampaign} disabled={isThinking || !data.campaignName} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 rounded font-bold flex items-center gap-2">
                                            {isThinking ? <Icon name="loader-2" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>} Verify
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">The AI will check its archives to auto-fill lore.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 1 && verificationData && (
                        <div className="space-y-6 flex flex-col items-center text-center justify-center h-full">
                            <Icon name="shield-check" size={48} className="text-green-500 mb-4"/>
                            <h3 className="text-2xl font-bold text-white">Knowledge Check</h3>
                            <p className="text-slate-300 max-w-md">I found data on this campaign. To make sure it's the right one:</p>
                            <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 max-w-lg w-full">
                                <p className="text-lg font-bold text-amber-400 mb-6">"{verificationData.question}"</p>
                                <div className="flex gap-4 justify-center">
                                    <button onClick={() => confirmVerification(true)} className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold">Yes</button>
                                    <button onClick={() => confirmVerification(false)} className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-lg font-bold">No</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (<div className="space-y-6"><div className="flex items-center gap-3 text-amber-400 mb-2"><Icon name="music" size={24}/><h3 className="text-xl font-bold">2. Define the Tone</h3></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{['Heroic', 'Epic', 'Gritty', 'Comedic', 'Horror', 'Mystery'].map(t => (<button key={t} onClick={() => setData({...data, tone: t})} className={`p-4 rounded-lg border text-center transition-all ${data.tone === t ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-700 border-slate-600 hover:border-amber-500/50'}`}>{t}</button>))}</div><input value={data.tone} onChange={e => setData({...data, tone: e.target.value})} className="w-full bg-slate-900 border border-slate-600 p-3 rounded text-slate-200" placeholder="Or type custom tone..."/></div>)}
                    
                    {step === 3 && (<div className="space-y-6"><div className="flex items-center gap-3 text-amber-400 mb-2"><Icon name="lightbulb" size={24}/><h3 className="text-xl font-bold">3. {data.sourceMode === 'official' ? "Review Lore" : "The Lore"}</h3></div>{data.sourceMode === 'new' ? (<div><p className="text-slate-300 mb-4">Core premise?</p><textarea value={data.conceptDesc} onChange={e => setData({...data, conceptDesc: e.target.value})} className="w-full h-48 bg-slate-900 border border-slate-600 p-3 rounded text-slate-200 resize-none" placeholder="Enter your campaign pitch..."/></div>) : (<div><p className="text-slate-300 mb-4">Auto-generated from module. Edit if needed:</p><textarea value={data.loreText} onChange={e => setData({...data, loreText: e.target.value})} className="w-full h-64 bg-slate-900 border border-slate-600 p-3 rounded text-slate-200 resize-none custom-scroll" placeholder="Campaign Lore..."/></div>)}</div>)}
                    
                    {step === 4 && (<div className="space-y-6"><div className="flex items-center gap-3 text-amber-400 mb-2"><Icon name="sword" size={24}/><h3 className="text-xl font-bold">4. Central Conflict</h3></div><div className="relative"><textarea value={data.conflict} onChange={e => setData({...data, conflict: e.target.value})} className="w-full h-40 bg-slate-900 border border-slate-600 p-3 rounded text-slate-200 resize-none" placeholder="An evil empire? A tournament?"/>{data.sourceMode === 'new' && (<button onClick={handleBrainstorm} disabled={isThinking} className="absolute right-2 bottom-2 bg-indigo-600/80 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1">{isThinking ? <Icon name="loader-2" size={12} className="animate-spin"/> : <Icon name="wand-2" size={12}/>} AI Suggest</button>)}</div></div>)}
                </div>
                
                <div className="bg-slate-900 p-6 border-t border-slate-700 flex justify-between">
                    {!verificationData && (
                        <>
                            <button onClick={step === 1 ? () => onComplete(null) : () => setStep(s=>s-1)} className="text-slate-500 hover:text-white font-bold px-4 py-2">{step === 1 ? "Skip Wizard" : "Back"}</button>
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