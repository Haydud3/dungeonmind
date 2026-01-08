import React, { useState } from 'react';
import Icon from '../Icon';

const CharacterCreator = ({ aiHelper, onComplete, onCancel }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({ 
        race: '', 
        class: '', 
        gender: '', 
        style: 'optimized', // 'optimized' or 'roleplay'
        name: ''
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusText, setStatusText] = useState("");

    const handleGenerate = async () => {
        setIsGenerating(true);
        setStatusText("Consulting the archives...");

        const prompt = `
        Task: Create a Level 1 D&D 5e Character JSON.
        User Request: Race=${formData.race || 'Any'}, Class=${formData.class || 'Any'}, Gender=${formData.gender || 'Any'}, Name=${formData.name || 'Random'}.
        Optimization Strategy: ${formData.style === 'optimized' ? 'Min-Max (Best Combat Stats)' : 'Roleplay (Flawed, Interesting Personality)'}.
        
        Output MUST be valid JSON only:
        {
            "name": "String",
            "race": "String",
            "class": "String",
            "stats": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },
            "hp": { "current": 10, "max": 10 },
            "profBonus": 2,
            "skills": { "athletics": true, "stealth": false }, 
            "spells": ["String name only"],
            "inventory": ["String name only"],
            "appearance": "Visual description for image generation",
            "personality": "Short description"
        }
        `;

        try {
            const response = await aiHelper([{ role: 'user', content: prompt }]);
            
            // Extract JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Failed to parse AI response");
            
            const charData = JSON.parse(jsonMatch[0]);
            
            // Image Generation Mock (or Real if you have DALL-E hooked up in App.jsx's aiHelper? 
            // For now we'll use a placeholder based on description)
            setStatusText("Forging portrait...");
            // In a real app with DALL-E, you'd call it here. We will use a high-quality placeholder.
            const portraitUrl = `https://ui-avatars.com/api/?name=${charData.name}&background=random&size=256`; 

            const finalChar = { ...charData, image: portraitUrl, id: Date.now() };
            onComplete(finalChar);

        } catch (e) {
            alert("Forge failed: " + e.message);
            setIsGenerating(false);
        }
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl fantasy-font text-amber-500">Character Forge</h2>
                <button onClick={onCancel} className="text-slate-500 hover:text-white"><Icon name="x" size={24}/></button>
            </div>

            {isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-in fade-in">
                    <div className="w-16 h-16 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-amber-500 font-bold text-lg animate-pulse">{statusText}</div>
                    <div className="text-slate-500 text-sm max-w-xs text-center">The AI is calculating ability scores and writing a backstory...</div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto custom-scroll space-y-6">
                    {/* Style Selector */}
                    <div className="grid grid-cols-2 gap-4">
                        <div 
                            onClick={() => setFormData({...formData, style: 'optimized'})}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.style === 'optimized' ? 'bg-amber-900/40 border-amber-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <Icon name="sword" className={formData.style === 'optimized' ? "text-amber-400" : "text-slate-500"} size={24}/>
                                {formData.style === 'optimized' && <div className="w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_10px_orange]"></div>}
                            </div>
                            <div className="font-bold text-white mb-1">Optimized</div>
                            <div className="text-xs text-slate-400">Min-Maxed stats for combat efficiency. Best numbers possible.</div>
                        </div>

                        <div 
                            onClick={() => setFormData({...formData, style: 'roleplay'})}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.style === 'roleplay' ? 'bg-purple-900/40 border-purple-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <Icon name="masks" className={formData.style === 'roleplay' ? "text-purple-400" : "text-slate-500"} size={24}/>
                                {formData.style === 'roleplay' && <div className="w-3 h-3 bg-purple-500 rounded-full shadow-[0_0_10px_purple]"></div>}
                            </div>
                            <div className="font-bold text-white mb-1">Roleplay</div>
                            <div className="text-xs text-slate-400">Stats reflect personality. Flawed, interesting, and unique.</div>
                        </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <div>
                            <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Character Name (Optional)</label>
                            <input 
                                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                                placeholder="Auto-generate if empty" 
                                className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-amber-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Race</label>
                                <input 
                                    value={formData.race} onChange={e => setFormData({...formData, race: e.target.value})}
                                    placeholder="e.g. Elf" 
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-amber-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Class</label>
                                <input 
                                    value={formData.class} onChange={e => setFormData({...formData, class: e.target.value})}
                                    placeholder="e.g. Wizard" 
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-amber-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleGenerate}
                        className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold py-4 rounded-xl shadow-xl flex justify-center items-center gap-2 transform transition-all active:scale-95"
                    >
                        <Icon name="sparkles" size={20}/> <span>Forge Character</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default CharacterCreator;