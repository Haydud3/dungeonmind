import React, { useState, useEffect } from 'react';
import Icon from './Icon';

const TourGuide = ({ onClose, setView }) => {
    const steps = [
        { title: "Welcome to DungeonMind", content: "Your AI-enhanced TTRPG assistant. This tool combines chat, journaling, and world-building into one synced dashboard.", view: 'session' },
        { title: "The Session Hub", content: "Chat with the AI, roll dice, and interact with the world. Click the 'Book' icon in the top right to save the current chat directly to your Journal.", view: 'session' },
        { title: "Journal Pro", content: "The new Journal supports full rich text. Insert images, grid tables, bold text, and more. It looks exactly like the final document while you type.", view: 'journal' },
        { title: "The World Tab", content: "Your Campaign Bible and Atlas. DMs can define the 'Truths' of the world here, which the AI reads to stay in character.", view: 'world' },
        { title: "NPC Registry", content: "Create fully fleshed-out characters with stats, quirks, and secrets. You can even click 'Chat' to speak *as* that NPC.", view: 'npcs' },
        { title: "DM Tools", content: "In Settings, configure the AI model, edition (5e 2014 vs 2024), and even upload a PDF sourcebook for the AI to read.", view: 'settings' }
    ];

    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        if(steps[currentStep].view) setView(steps[currentStep].view);
    }, [currentStep]);

    const handleNext = () => {
        if (currentStep < steps.length - 1) setCurrentStep(c => c + 1);
        else onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none flex flex-col justify-end pb-20 px-4 md:pb-8">
            <div className="pointer-events-auto bg-slate-900/95 backdrop-blur border-t-4 border-amber-500 rounded-xl p-6 max-w-2xl w-full shadow-2xl mx-auto relative animate-in slide-in-from-bottom-10 fade-in duration-500">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white bg-slate-800 rounded-full p-1 transition-colors"><Icon name="x" size={16}/></button>
                <div className="flex gap-4 items-start">
                    <div className="bg-amber-900/20 p-3 rounded-full hidden sm:block"><Icon name="compass" size={32} className="text-amber-500"/></div>
                    <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="text-lg md:text-xl fantasy-font text-amber-500 font-bold">{steps[currentStep].title}</h3>
                            <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded-full">{currentStep + 1} / {steps.length}</span>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed mb-4">{steps[currentStep].content}</p>
                        <div className="flex justify-between items-center">
                            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 underline">Dismiss</button>
                            <div className="flex gap-2">
                                {currentStep > 0 && <button onClick={() => setCurrentStep(c => c - 1)} className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors">Back</button>}
                                <button onClick={handleNext} className="px-6 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-900/20 transition-colors">
                                    {currentStep === steps.length - 1 ? "Finish Tour" : "Next Tip"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TourGuide;