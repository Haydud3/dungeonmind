import React from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';
import RollButton from '../widgets/RollButton';

const SKILL_LIST = [
    { name: 'Acrobatics', stat: 'dex' },
    { name: 'Animal Handling', stat: 'wis' },
    { name: 'Arcana', stat: 'int' },
    { name: 'Athletics', stat: 'str' },
    { name: 'Deception', stat: 'cha' },
    { name: 'History', stat: 'int' },
    { name: 'Insight', stat: 'wis' },
    { name: 'Intimidation', stat: 'cha' },
    { name: 'Investigation', stat: 'int' },
    { name: 'Medicine', stat: 'wis' },
    { name: 'Nature', stat: 'int' },
    { name: 'Perception', stat: 'wis' },
    { name: 'Performance', stat: 'cha' },
    { name: 'Persuasion', stat: 'cha' },
    { name: 'Religion', stat: 'int' },
    { name: 'Sleight of Hand', stat: 'dex' },
    { name: 'Stealth', stat: 'dex' },
    { name: 'Survival', stat: 'wis' },
];

const SkillsTab = ({ onDiceRoll, onLogAction }) => {
    const { character, updateInfo } = useCharacterStore();
    const charSkills = character.skills || {};
    const profBonus = character.profBonus || 2;

    const getModifier = (stat) => Math.floor(((character.stats?.[stat] || 10) - 10) / 2);

    const toggleSkill = (skillName) => {
        const newSkills = { ...charSkills };
        if (newSkills[skillName]) {
            delete newSkills[skillName];
        } else {
            newSkills[skillName] = true;
        }
        updateInfo('skills', newSkills);
    };

    const toggleSave = (stat) => {
        const newSaves = { ...(character.savingThrows || {}) };
        newSaves[stat] = !newSaves[stat];
        updateInfo('savingThrows', newSaves);
    };

    const calculateSkill = (skill) => {
        const isProf = charSkills[skill.name];
        const abilityMod = getModifier(skill.stat);
        const total = abilityMod + (isProf ? profBonus : 0);
        return { isProf, abilityMod, total };
    };

    const handleRoll = async (skill) => {
        if (!onDiceRoll) return;
        const { isProf, total } = calculateSkill(skill);
        const formula = `1d20${total >= 0 ? '+' : ''}${total}`;
        await onDiceRoll(formula, { 
            alias: `${skill.name} Check`,
            description: `Proficiency: ${isProf ? 'Yes' : 'No'}`,
            characterName: character.name
        });
    };

    return (
        <div className="space-y-4 pb-24">
            {/* Saving Throws Section */}
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700">
                <h4 className="text-[10px] uppercase font-bold text-amber-500 mb-3 tracking-widest">Saving Throws</h4>
                <div className="grid grid-cols-3 gap-3">
                    {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(stat => {
                        const isProf = character.savingThrows?.[stat] || false;
                        const mod = getModifier(stat);
                        const total = mod + (isProf ? profBonus : 0);
                        return (
                            <div 
                                key={stat} 
                                className="bg-slate-900/50 p-2 rounded border border-slate-700 flex flex-col items-center gap-1 group"
                            >
                                <div className="flex items-center justify-between w-full px-1">
                                    <div 
                                        className="cursor-pointer p-1 -ml-1" 
                                        onClick={() => toggleSave(stat)}
                                        title="Toggle Proficiency"
                                    >
                                        <div className={`w-2.5 h-2.5 rounded-full border transition-colors ${isProf ? 'bg-amber-500 border-amber-500' : 'border-slate-600 hover:border-amber-500/50'}`}></div>
                                    </div>
                                    <span className="text-[9px] text-slate-500 uppercase font-bold">{stat}</span>
                                    <div className="w-2.5 h-2.5"></div> {/* Spacer */}
                                </div>
                                <RollButton 
                                    onClick={() => {
                                        if (!onDiceRoll) return;
                                        const formula = `1d20${total >= 0 ? '+' : ''}${total}`;
                                        onDiceRoll(formula, { alias: `${stat.toUpperCase()} Save`, characterName: character.name });
                                    }}
                                    type="save"
                                    className="w-full"
                                >
                                    {total >= 0 ? '+' : ''}{total}
                                </RollButton>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Passive Senses */}
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700 flex justify-between text-center gap-2">
                {[
                    { name: 'Perception', stat: 'wis' },
                    { name: 'Insight', stat: 'wis' },
                    { name: 'Investigation', stat: 'int' }
                ].map(sense => {
                    const { total } = calculateSkill(sense);
                    return (
                        <div key={sense.name} className="flex-1 bg-slate-900/50 p-2 rounded border border-slate-700">
                            <div className="text-[10px] text-slate-500 uppercase font-bold truncate">Passive {sense.name}</div>
                            <div className="text-xl font-bold text-white">{10 + total}</div>
                        </div>
                    );
                })}
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-slate-500 px-2 mt-2">
                <div className="col-span-1"></div>
                <div className="col-span-5 md:col-span-4">Skill</div>
                <div className="hidden md:block col-span-2 text-center">Stat</div>
                <div className="col-span-3 md:col-span-3 text-center">Math</div>
                <div className="col-span-3 md:col-span-2 flex justify-end">Roll</div>
            </div>

            {/* Skill List */}
            <div className="space-y-1">
                {SKILL_LIST.map((skill) => {
                    const { isProf, abilityMod, total } = calculateSkill(skill);
                    
                    return (
                        <div 
                            key={skill.name} 
                            className="grid grid-cols-12 gap-2 items-center bg-slate-800/50 border border-slate-700/50 rounded-lg p-2 hover:bg-slate-800 transition-colors"
                        >
                            {/* Proficiency Dot */}
                            <div className="col-span-1 flex justify-start md:justify-center cursor-pointer" onClick={() => toggleSkill(skill.name)}>
                                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${isProf ? 'bg-amber-500 border-amber-500' : 'border-slate-600 hover:border-amber-500/50'}`}>
                                </div>
                            </div>

                            {/* Skill Name */}
                            <div className="col-span-5 md:col-span-4 font-bold text-slate-200 text-sm truncate">
                                {skill.name}
                            </div>

                            {/* Stat Label (Hidden on Mobile) */}
                            <div className="hidden md:block col-span-2 text-center text-xs text-slate-500 uppercase font-mono">
                                {skill.stat.substring(0,3)}
                            </div>

                            {/* The Math Breakdown */}
                            <div className="col-span-3 md:col-span-3 flex text-center text-[10px] text-slate-400 font-mono justify-center gap-1">
                                <span>{abilityMod >= 0 ? '+' : ''}{abilityMod}</span>
                                {isProf && <span className="text-amber-500">+{profBonus}</span>}
                            </div>

                            {/* Action Button */}
                            <div className="col-span-3 md:col-span-2 flex justify-end">
                                <RollButton onClick={() => handleRoll(skill)} type="skill" className="w-12">
                                    {total >= 0 ? '+' : ''}{total}
                                </RollButton>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SkillsTab;