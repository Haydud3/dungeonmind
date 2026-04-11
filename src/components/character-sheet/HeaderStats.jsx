import React, { useState, useRef } from 'react';
import { useCharacterStore } from '../../stores/useCharacterStore';
import Icon from '../Icon';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const HeaderStats = ({ character: propCharacter, onDiceRoll, onLogAction, onBack, role, onOpenModelPicker, onOpenDiceTray }) => { // Keep all original props
    const storeCharacter = useCharacterStore(state => state.character);
    const character = storeCharacter || propCharacter;
    const { updateHP, updateInfo, updateHitDice, updateExhaustion, toggleCondition, updateStat, takeShortRest, takeLongRest, setDeathSaves, updateDeathSaves } = useCharacterStore(); // Added setDeathSaves, updateDeathSaves
    const [isExpanded, setIsExpanded] = useState(false);
    const fileInputRef = useRef(null);

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const base64 = await fileToBase64(file);
            updateInfo('image', base64);
        } catch (err) {
            console.error("Avatar upload failed:", err);
        }
    };

    if (!character) return null;

    // HP Logic
    const currentHP = character.hp?.current ?? 0;
    const maxHP = character.hp?.max ?? 0;
    const hpPercent = Math.min((currentHP / (maxHP || 1)) * 100, 100);
    const hpColor = hpPercent < 30 ? 'bg-red-600' : hpPercent < 60 ? 'bg-amber-500' : 'bg-green-500';

    // Existing stats and resources
    const ac = character.ac || 10;
    const init = character.initiative || 0;
    const hitDice = character.hitDice || { current: 1, max: 1, die: "d8" };
    const exhaustion = character.exhaustion || 0;
    const conditions = character.conditions || [];
    const ds = character.deathSaves || { successes: 0, failures: 0 };
    
    return (
        <div className="bg-slate-900 border-b border-slate-800 shadow-lg shrink-0 relative">
            {/* Top Bar: HP, AC, Init */}
            <div className="flex items-center gap-3 p-3 h-16">
                {onBack && <button onClick={onBack} className="text-slate-400 hover:text-white p-1"><Icon name="arrow-left" size={20}/></button>}
                
                <div className="flex-1 min-w-0 flex items-center gap-2"> {/* Combined character info and HP bar */}
                    <div className="flex items-center gap-2">
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarUpload} />
                        <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex-shrink-0 relative"> {/* Avatar button */}
                            <img src={character.image} className="w-full h-full object-cover" alt="Character" />
                        </button>
                        {/* HP Input */}
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] text-slate-500 font-bold">HP</span>
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    className="w-10 bg-transparent text-center text-sm font-bold text-green-400 outline-none"
                                    value={currentHP}
                                    onChange={e => updateHP('current', parseInt(e.target.value) || 0)}
                                />
                                <span className="text-sm font-bold text-white">/</span>
                                <input
                                    type="number"
                                    className="w-10 bg-transparent text-center text-sm font-bold text-white outline-none"
                                    value={maxHP}
                                    onChange={e => updateHP('max', parseInt(e.target.value) || 0)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col justify-center" onClick={() => setIsExpanded(!isExpanded)}>
                            <div className="flex items-center gap-2">
                                <div className="font-bold text-white text-sm truncate">{character.name}</div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); updateInfo('inspiration', !character.inspiration); }}
                                    className={`transition-colors p-0.5 rounded-full ${character.inspiration ? 'text-amber-400 bg-amber-900/30' : 'text-slate-600 hover:text-slate-400'}`}
                                    title="Inspiration"
                                >
                                    <Icon name="sparkles" size={14} />
                                </button>
                            </div>
                            <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                                <div className={`h-full ${hpColor}`} style={{ width: `${hpPercent}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center bg-slate-800 px-2 py-1 rounded">
                        <span className="text-[9px] text-slate-500 font-bold">AC</span>
                        <div className="text-sm font-bold text-white">{ac}</div>
                    </div>
                    <div className="flex flex-col items-center bg-slate-800 px-2 py-1 rounded">
                        <span className="text-[9px] text-slate-500 font-bold">INIT</span>
                        <div className="text-sm font-bold text-amber-500">{init >= 0 ? `+${init}` : init}</div>
                        <button onClick={() => onDiceRoll(`1d20+${init}`, { alias: 'Initiative' })} className="text-[8px] text-slate-500 hover:text-white mt-0.5">
                            Roll
                        </button>
                    </div>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="text-slate-400 ml-2">
                        <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={20} />
                    </button>
                </div>
            </div>

            {/* Death Saves Floating Panel (Shows only when HP <= 0) */}
            {currentHP <= 0 && (
                <div className="bg-red-950/80 border-t border-red-900 p-3 animate-in slide-in-from-top-2 flex flex-col items-center gap-2">
                    <div className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
                        <Icon name="skull" size={14} /> Death Saving Throws
                    </div>
                    <div className="flex gap-6 items-center">
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-slate-400">SUCCESSES</span>
                            <div className="flex gap-1">
                                {[1, 2, 3].map(i => (
                                    <div key={`s-${i}`} onClick={() => setDeathSaves('successes', ds.successes === i ? i - 1 : i)} className={`w-4 h-4 rounded-full border-2 cursor-pointer transition-colors ${i <= ds.successes ? 'bg-green-500 border-green-400' : 'bg-slate-900 border-slate-600 hover:border-green-500/50'}`}></div>
                                ))}
                            </div>
                        </div>
                        
                        <button 
                            onClick={async () => {
                                if (!onDiceRoll) return;
                                const roll = await onDiceRoll(20, { alias: 'Death Save' });
                                if (roll === 1) updateDeathSaves('crit_fail');
                                else if (roll === 20) updateDeathSaves('success'); // Usually 2 successes, but let's just trigger standard success or let user handle healing manually. Wait, rules say 20 is regain 1 HP, we handled this in store optionally or manually.
                                else if (roll >= 10) updateDeathSaves('success');
                                else updateDeathSaves('failure');
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 py-1 rounded shadow-lg border border-slate-600 text-sm"
                        >
                            ROLL
                        </button>

                        <div className="flex flex-col items-start gap-1">
                            <span className="text-[10px] text-slate-400">FAILURES</span>
                            <div className="flex gap-1">
                                {[1, 2, 3].map(i => (
                                    <div key={`f-${i}`} onClick={() => setDeathSaves('failures', ds.failures === i ? i - 1 : i)} className={`w-4 h-4 rounded-full border-2 cursor-pointer transition-colors ${i <= ds.failures ? 'bg-red-500 border-red-400' : 'bg-slate-900 border-slate-600 hover:border-red-500/50'}`}></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Expanded Drawer */}
            {isExpanded && (
                <div className="p-4 border-t border-slate-800 bg-slate-950/50 animate-in slide-in-from-top-2 space-y-4">
                    <div className="flex gap-4">
                        {/* Hit Dice */}
                        <div className="flex flex-col items-center bg-slate-800 p-2 rounded flex-1">
                            <span className="text-[10px] text-slate-500 uppercase">Hit Dice ({hitDice.die})</span>
                            <div className="flex items-center gap-2 mt-1">
                                <button onClick={() => updateHitDice(hitDice.current - 1)} className="text-slate-400 hover:text-white">-</button>
                                <span className="font-bold text-white text-sm">{hitDice.current}/{hitDice.max}</span>
                                <button onClick={() => updateHitDice(hitDice.current + 1)} className="text-slate-400 hover:text-white">+</button>
                            </div>
                        </div>
                        {/* Exhaustion */}
                        <div className="flex flex-col items-center bg-slate-800 p-2 rounded flex-1">
                            <span className="text-[10px] text-slate-500 uppercase">Exhaustion</span>
                            <div className="flex items-center gap-2 mt-1">
                                <button onClick={() => updateExhaustion(exhaustion - 1)} className="text-slate-400 hover:text-white">-</button>
                                <span className="font-bold text-red-400 text-sm">{exhaustion}</span>
                                <button onClick={() => updateExhaustion(exhaustion + 1)} className="text-slate-400 hover:text-white">+</button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-6 gap-2">
                        {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(s => (
                            <div key={s} className="bg-slate-800 p-1.5 rounded text-center">
                                <div className="text-[9px] uppercase text-slate-500">{s}</div>
                                <input
                                    className="w-full bg-transparent text-center text-sm font-bold text-white outline-none"
                                    value={character.stats?.[s] || 10}
                                    onChange={e => updateStat(s, parseInt(e.target.value) || 0)}
                                    type="number"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Senses Grid */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'darkvision', label: 'Darkvision' },
                            { id: 'blindsight', label: 'Blindsight' },
                            { id: 'tremorsense', label: 'Tremorsense' },
                            { id: 'truesight', label: 'Truesight' }
                        ].map(sense => (
                            <div key={sense.id} className="bg-slate-800 p-1.5 rounded text-center">
                                <div className="text-[9px] uppercase text-slate-500 truncate" title={sense.label}>{sense.label}</div>
                                <input
                                    className="w-full bg-transparent text-center text-sm font-bold text-indigo-400 outline-none"
                                    value={parseInt(character[sense.id]) || 0}
                                    onChange={e => updateInfo(sense.id, parseInt(e.target.value) || 0)}
                                    type="number"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Conditions */}
                    <div className="flex flex-wrap gap-2 bg-slate-800 p-2 rounded">
                        <span className="text-[10px] text-slate-500 uppercase font-bold w-full mb-1">Conditions</span>
                        {['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'].map(cond => (
                            <button
                                key={cond}
                                onClick={() => toggleCondition(cond)}
                                className={`px-2 py-1 rounded text-[10px] font-bold ${conditions.includes(cond) ? 'bg-red-900 text-white border border-red-500' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                            >
                                {cond}
                            </button>
                        ))}
                    </div>

                    {/* Rest Buttons */}
                    <div className="flex gap-2 justify-center mt-4">
                        <button
                            onClick={takeShortRest}
                            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-sm"
                        >
                            Short Rest
                        </button>
                        <button
                            onClick={takeLongRest}
                            className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-sm"
                        >
                            Long Rest
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HeaderStats;