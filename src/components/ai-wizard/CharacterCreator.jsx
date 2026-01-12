import React, { useState } from 'react';
import Icon from '../Icon';

// Use same constants as MapBoard for ease (or pass via props if preferred)
const GOOGLE_SEARCH_CX = "c38cb56920a4f45df"; 
const GOOGLE_SEARCH_KEY = "AIzaSyBooM1Sk4A37qkWwADGXqwToVGRYgFOeY8"; 

const CharacterCreator = ({ aiHelper, apiKey, onComplete, onCancel, edition = '2014' }) => {
    const [formData, setFormData] = useState({ 
        race: '', class: '', level: 1, style: 'optimized', name: '', concept: '', image: ''
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusText, setStatusText] = useState("");
    
    // Image Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleImageSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        const key = apiKey || GOOGLE_SEARCH_KEY;
        if (key && GOOGLE_SEARCH_CX) {
            try {
                const res = await fetch(`https://customsearch.googleapis.com/customsearch/v1?key=${key}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(searchQuery + " fantasy character portrait")}&searchType=image&num=6&imgSize=medium`);
                const json = await res.json();
                if (json.items) setSearchResults(json.items.map(i => i.link));
                else alert("No results.");
            } catch (e) { alert("Search Error"); }
        } else { alert("No API Key configured."); }
        setIsSearching(false);
    };

    const handleGenerate = async () => {
        if (!aiHelper || typeof aiHelper !== 'function') {
            alert("AI Helper not ready. Please refresh.");
            return;
        }
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
            "spells": [ { "name": "Firebolt", "level": 0, "school": "Evocation", "time": "1A" } ],
            "inventory": [ { "name": "Dagger", "qty": 1 } ],
            "customActions": [ { "name": "Longsword", "hit": "5", "dmg": "1d8+3", "type": "Melee", "notes": "Versatile" } ],
            "features": [ { "name": "Feature Name", "source": "Class/Race/Feat", "desc": "Full description of what it does." } ],
            "bio": { "traits": "String", "ideals": "String", "bonds": "String", "flaws": "String", "backstory": "String", "appearance": "Visual description" }
        }`;

        try {
            const response = await aiHelper([{ role: 'user', content: prompt }]);
            const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const charData = JSON.parse(cleanJson);
            
            // Use selected image OR generate fallback
            const finalImage = formData.image || `https://ui-avatars.com/api/?name=${charData.name.replace(/ /g, '+')}&background=random&size=256&bold=true`;
            
            const finalChar = { ...charData, image: finalImage, id: Date.now() };
            onComplete(finalChar);
        } catch (e) {
            console.error(e);
            alert("Forge failed. Error: " + e.message);
            setIsGenerating(false);
        }
    };

    return (
        <div className="p-6 h-full flex flex-col bg-slate-900 text-slate-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <div><h2 className="text-2xl fantasy-font text-amber-500">Character Forge</h2><span className="text-xs text-slate-500 font-mono uppercase">Edition: {edition}</span></div>
                <button onClick={onCancel} className="text-slate-500 hover:text-white"><Icon name="x" size={24}/></button>
            </div>

            {isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in">
                    <div className="relative"><div className="w-20 h-20 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div><Icon name="sparkles" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-500 animate-pulse"/></div>
                    <div className="text-center space-y-2"><div className="text-amber-500 font-bold text-xl animate-pulse">{statusText}</div><div className="text-slate-500 text-sm max-w-xs mx-auto">Calculating hit probabilities...</div></div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto custom-scroll space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold text-amber-400 mb-1 block flex items-center gap-2"><Icon name="lightbulb" size={14}/> Concept</label>
                        <textarea value={formData.concept} onChange={e => setFormData({...formData, concept: e.target.value})} placeholder="e.g. A nervous goblin rogue..." className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white h-20 resize-none"/>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <div><label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Race</label><input value={formData.race} onChange={e => setFormData({...formData, race: e.target.value})} placeholder="Any" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white"/></div>
                        <div><label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Class</label><input value={formData.class} onChange={e => setFormData({...formData, class: e.target.value})} placeholder="Any" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white"/></div>
                        <div><label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Name</label><input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Random" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white"/></div>
                        <div><label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Level</label><input type="number" min="1" max="20" value={formData.level} onChange={e => setFormData({...formData, level: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white"/></div>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <label className="text-xs uppercase font-bold text-amber-400 mb-2 block flex items-center gap-2"><Icon name="image" size={14}/> Portrait (Optional)</label>
                        <div className="flex gap-2 mb-2">
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleImageSearch()} placeholder="Search for visual..." className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 text-sm text-white"/>
                            <button onClick={handleImageSearch} className="bg-indigo-600 hover:bg-indigo-500 px-3 rounded text-white"><Icon name="search" size={16}/></button>
                        </div>
                        {isSearching ? <div className="text-xs text-center text-slate-500">Searching...</div> : (
                            searchResults.length > 0 && (
                                <div className="grid grid-cols-4 gap-2 mb-2">
                                    {searchResults.map(url => (
                                        <img key={url} src={url} onClick={() => setFormData({...formData, image: url})} className={`w-full h-16 object-cover rounded cursor-pointer border-2 ${formData.image === url ? 'border-green-500' : 'border-transparent hover:border-slate-500'}`}/>
                                    ))}
                                </div>
                            )
                        )}
                        <input value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} placeholder="Or paste Image URL" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-xs text-white"/>
                    </div>

                    <button onClick={handleGenerate} className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold py-4 rounded-xl shadow-xl flex justify-center items-center gap-2 transform transition-all active:scale-95 group">
                        <Icon name="sparkles" size={20} className="group-hover:animate-pulse"/> <span>Forge Character</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default CharacterCreator;