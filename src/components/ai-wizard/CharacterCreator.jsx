import React, { useState } from 'react';
import Icon from '../Icon';

const CharacterCreator = ({ aiHelper, onComplete, onCancel, edition = '2014' }) => {
    const [formData, setFormData] = useState({ 
        race: '', 
        class: '', 
        level: 1,
        style: 'optimized', 
        name: '',
        concept: '' // New Field
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusText, setStatusText] = useState("");

    const handleGenerate = async () => {
        setIsGenerating(true);
        setStatusText(`Consulting the ${edition} Archives...`);

        const prompt = `
        Role: D&D 5e Expert Character Generator.
        Ruleset: Use D&D 5e ${edition} Rules specifically.
        Task: Generate a COMPLETE Level ${formData.level} Character JSON.
        
        Request:
        - Race: ${formData.race || 'Random'}
        - Class: ${formData.class || 'Random'}
        - Name: ${formData.name || 'Random Fantasy Name'}
        - Strategy: ${formData.style === 'optimized' ? 'Min-Max (Combat Optimized)' : 'Roleplay (Flawed & Flavorful)'}
        - User Concept: "${formData.concept}" (IMPORTANT: Base the stats, backstory, and quirks heavily on this description).

        CRITICAL: The output must be valid, parseable JSON with NO markdown formatting. Use this exact structure:
        {
            "name": "String",
            "race": "String",
            "class": "String",
            "level": Number,
            "profBonus": Number,
            "stats": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },
            "hp": { "current": Number, "max": Number },
            "currency": { "cp": 0, "sp": 0, "ep": 0, "gp": 15, "pp": 0 },
            "skills": { "SkillName": true }, 
            "spells": [
                { "name": "Firebolt", "level": 0, "school": "Evocation", "time": "1A" }
            ],
            "inventory": [
                { "name": "Dagger", "qty": 1 },
                { "name": "Backpack", "qty": 1 }
            ],
            "customActions": [
                { "name": "Longsword", "hit": "5", "dmg": "1d8+3", "type": "Melee", "notes": "Versatile" }
            ],
            "features": [
                { "name": "Feature Name", "source": "Class/Race/Feat", "desc": "Full description of what it does." }
            ],
            "bio": {
                "traits": "String",
                "ideals": "String",
                "bonds": "String",
                "flaws": "String",
                "backstory": "String",
                "appearance": "Visual description"
            }
        }

        ENSURE:
        1. Calculate HP correctly for Level ${formData.level} (Con mod + Hit Die).
        2. Calculate Attack Bonus (Str/Dex + Prof) and Damage correctly in 'customActions'.
        3. Include ALL class features, racial traits, and feats appropriate for Level ${formData.level} in the 'features' array.
        4. If Spellcaster, fill 'spells' array with valid ${edition} spells.
        `;

        try {
            const response = await aiHelper([{ role: 'user', content: prompt }]);
            
            // Clean markdown if the AI adds it despite instructions
            const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const charData = JSON.parse(cleanJson);
            
            setStatusText("Drawing Portrait...");
            const portraitUrl = `https://ui-avatars.com/api/?name=${charData.name.replace(/ /g, '+')}&background=random&size=256&bold=true`; 

            const finalChar = { ...charData, image: portraitUrl, id: Date.now() };
            onComplete(finalChar);

        } catch (e) {
            console.error(e);
            alert("Forge failed. The AI spirit is confused.\nError: " + e.message);
            setIsGenerating(false);
        }
    };

    return (
        <div className="p-6 h-full flex flex-col bg-slate-900 text-slate-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <div>
                    <h2 className="text-2xl fantasy-font text-amber-500">Character Forge</h2>
                    <span className="text-xs text-slate-500 font-mono uppercase">Edition: {edition}</span>
                </div>
                <button onClick={onCancel} className="text-slate-500 hover:text-white"><Icon name="x" size={24}/></button>
            </div>

            {isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                        <Icon name="sparkles" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-500 animate-pulse"/>
                    </div>
                    <div className="text-center space-y-2">
                        <div className="text-amber-500 font-bold text-xl animate-pulse">{statusText}</div>
                        <div className="text-slate-500 text-sm max-w-xs mx-auto">Calculating hit probabilities, memorizing spells, and trauma-dumping into the backstory...</div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto custom-scroll space-y-6">
                    {/* Concept Box */}
                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold text-amber-400 mb-1 block flex items-center gap-2">
                            <Icon name="lightbulb" size={14}/> Concept / Description
                        </label>
                        <textarea 
                            value={formData.concept} 
                            onChange={e => setFormData({...formData, concept: e.target.value})} 
                            placeholder="e.g. A nervous goblin rogue who steals silverware, or a noble paladin who lost their faith..." 
                            className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white focus:border-amber-500 outline-none h-24 resize-none transition-colors"
                        />
                    </div>

                    {/* Inputs */}
                    <div className="space-y-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Race</label>
                                <input 
                                    value={formData.race} onChange={e => setFormData({...formData, race: e.target.value})} 
                                    placeholder="Any" 
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-amber-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Class</label>
                                <input 
                                    value={formData.class} onChange={e => setFormData({...formData, class: e.target.value})} 
                                    placeholder="Any" 
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-amber-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Name</label>
                            <input 
                                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} 
                                placeholder="Auto-generate if empty" 
                                className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-amber-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Level</label>
                            <div className="flex items-center gap-4 bg-slate-900 border border-slate-600 rounded p-2">
                                <input 
                                    type="range" min="1" max="20" 
                                    value={formData.level} onChange={e => setFormData({...formData, level: parseInt(e.target.value)})} 
                                    className="flex-1 accent-amber-500 cursor-pointer"
                                />
                                <span className="font-bold text-amber-500 w-8 text-center">{formData.level}</span>
                            </div>
                        </div>
                    </div>

                    {/* Style Selector */}
                    <div className="grid grid-cols-2 gap-4">
                        <div 
                            onClick={() => setFormData({...formData, style: 'optimized'})}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.style === 'optimized' ? 'bg-amber-900/40 border-amber-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                        >
                            <div className="font-bold text-white mb-1 flex items-center gap-2"><Icon name="sword" size={16}/> Combat Ready</div>
                            <div className="text-xs text-slate-400">Min-Maxed stats. Best gear.</div>
                        </div>

                        <div 
                            onClick={() => setFormData({...formData, style: 'roleplay'})}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.style === 'roleplay' ? 'bg-purple-900/40 border-purple-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                        >
                            <div className="font-bold text-white mb-1 flex items-center gap-2"><Icon name="masks" size={16}/> Roleplay Focus</div>
                            <div className="text-xs text-slate-400">Stats fit the personality.</div>
                        </div>
                    </div>

                    <button 
                        onClick={handleGenerate}
                        className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold py-4 rounded-xl shadow-xl flex justify-center items-center gap-2 transform transition-all active:scale-95 group"
                    >
                        <Icon name="sparkles" size={20} className="group-hover:animate-pulse"/> <span>Forge Character</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default CharacterCreator;