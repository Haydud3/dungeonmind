import React from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';

const FeaturesTab = () => {
    const { character } = useCharacterStore();
    // FIX: Default to empty array to prevent crash
    const features = character.features || [];

    return (
        <div className="space-y-4 pb-24">
            <h3 className="font-bold text-slate-300 border-b border-slate-700 pb-2">Class Features & Traits</h3>
            
            {features.length === 0 ? (
                <div className="text-center text-slate-500 py-8 italic">
                    No features recorded. 
                    <br/><span className="text-xs">Import a D&D Beyond PDF to populate.</span>
                </div>
            ) : (
                <div className="space-y-3">
                    {features.map((feat, i) => (
                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-sm hover:border-amber-500/50 transition-colors">
                            <div className="font-bold text-white text-lg mb-1">{feat.name}</div>
                            {feat.source && <div className="text-xs text-amber-500 uppercase font-bold mb-2 tracking-wider">{feat.source}</div>}
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {feat.desc || "No description."}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FeaturesTab;