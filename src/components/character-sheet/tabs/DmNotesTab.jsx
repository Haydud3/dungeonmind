import React from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const DmNotesTab = () => {
    const character = useCharacterStore((state) => state.character);
    const updateCharacter = useCharacterStore((state) => state.updateCharacter);

    const handleChange = (e) => {
        updateCharacter('dmNotes', e.target.value);
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300 pb-24">
            <div className="bg-purple-950/20 border border-purple-500/40 p-4 rounded-2xl flex items-start gap-3.5 backdrop-blur-md shadow-lg">
                <div className="bg-purple-900/50 p-2.5 rounded-xl text-purple-300 border border-purple-500/30 shrink-0 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
                    <Icon name="eye-off" size={22} />
                </div>
                <div>
                    <h3 className="font-bold text-purple-200 text-sm">DM Shadow Journal</h3>
                    <p className="text-xs text-purple-300/80 mt-0.5 leading-relaxed">
                        These notes are encrypted against player eyes. Only the Dungeon Master can view or edit this tab.
                        Use it for hidden allegiances, cursed items, secret backstories, or trigger conditions.
                    </p>
                </div>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-2 shadow-xl focus-within:border-purple-500/50 transition-colors">
                <textarea
                    value={character.dmNotes || ''}
                    onChange={handleChange}
                    placeholder="Record confidential DM notes, secret plot hooks, passive triggers, or hidden motives here..."
                    className="w-full h-96 bg-transparent text-slate-200 p-3.5 outline-none resize-none custom-scroll font-mono text-xs leading-relaxed placeholder:text-slate-600"
                />
            </div>
            
            <div className="text-center text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                Confidential • DM Eyes Only
            </div>
        </div>
    );
};

export default DmNotesTab;