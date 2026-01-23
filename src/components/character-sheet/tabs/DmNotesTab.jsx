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
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="bg-purple-900/20 border border-purple-500/50 p-4 rounded-xl flex items-start gap-3">
                <div className="bg-purple-900/50 p-2 rounded-full text-purple-300 shrink-0">
                    <Icon name="eye-off" size={24} />
                </div>
                <div>
                    <h3 className="font-bold text-purple-200">Shadow Journal</h3>
                    <p className="text-xs text-purple-300/70">
                        These notes are encrypted against player eyes. Only you (the DM) can see this tab.
                        Use it for true motives, secret loot, or plot hooks.
                    </p>
                </div>
            </div>

            <div className="bg-slate-800 p-1 rounded-xl border border-slate-700 shadow-inner">
                <textarea
                    value={character.dmNotes || ''}
                    onChange={handleChange}
                    placeholder="Write secret notes here..."
                    className="w-full h-96 bg-transparent text-slate-300 p-4 outline-none resize-none custom-scroll font-mono text-sm leading-relaxed placeholder:text-slate-600"
                />
            </div>
            
            <div className="text-center text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                Secret • Secure • Silent
            </div>
        </div>
    );
};

export default DmNotesTab;