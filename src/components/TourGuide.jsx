import React, { useState, useEffect } from 'react';
import Icon from './Icon';

const TourGuide = ({ onClose, setView }) => {
    const steps = [
        { title: "Welcome to DungeonMind", content: "Your AI-enhanced TTRPG assistant. This tool combines a 3D tactical map, smart chat, dynamic journaling, and world-building into one synced dashboard.", view: 'session' },
        { title: "Tactical Map (VTT)", content: "A fully integrated 3D Virtual Tabletop. Drag and drop tokens, draw walls, place dynamic lights, and explore with real-time Line of Sight and Fog of War. Right-click tokens for advanced controls.", view: 'map' },
        { title: "Party & Heroes", content: "Manage player characters here. Import character sheets directly from D&D Beyond or PDFs, track HP, and roll dice directly from their sheets.", view: 'party' },
        { title: "The Bestiary", content: "Your custom monster manual. Import creatures from the 5e API, paste raw stat blocks, or use the AI Forge to generate entirely new enemies on the fly. You can also assign 3D minis!", view: 'npcs' },
        { title: "The Archives (Lore)", content: "Feed the DungeonMind. Upload your campaign PDFs and sourcebooks here. The AI will automatically read and remember the lore to answer your questions perfectly in the chat.", view: 'lore' },
        { title: "Smart Journaling", content: "Create rich-text handouts and secret DM notes. You can toggle visibility for specific players, track your campaign, and even ask the AI to help you write.", view: 'journal' },
        { title: "Session Hub & Dice", content: "Chat with the AI, whisper to players, and roll dice using the built-in tray. DMs can generate smart session recaps or apply damage directly from the chat log!", view: 'session' }
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