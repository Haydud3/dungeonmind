import React from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

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
    const { character, getModifier, toggleSkill } = useCharacterStore();
    const charSkills = character.skills || {};
    const profBonus = character.profBonus || 2;

    // Helper to calculate bonus locally so we can show the math
    const calculateSkill = (skill) => {
        const isProf = charSkills[skill.name];
        const abilityMod = getModifier(skill.stat);
        const total = abilityMod + (isProf ? profBonus : 0);
        return { isProf, abilityMod, total };
    };

    const handleRoll = async (skill) => {
        if (!onDiceRoll) return;

        const { abilityMod, isProf, total } = calculateSkill(skill);

        try {
            const roll = await onDiceRoll(20);
            if (typeof roll !== 'number') return;

            const finalResult = roll + total;

            const msg = `
                <div class="font-bold text-white border-b border-slate-700 pb-1 mb-1 flex justify-between">
                    <span>${skill.name} Check</span>
                    <span class="text-xs text-slate-400 uppercase self-center">${skill.stat}</span>
                </div>
                <div class="flex items-center gap-2 text-sm text-slate-300">
                    <span class="font-mono bg-slate-800 px-1 rounded">d20(${roll})</span>
                    <span>+</span>
                    <span class="text-xs text-slate-400">${abilityMod >= 0 ? '+' : ''}${abilityMod} (${skill.stat.substring(0,3).toUpperCase()})</span>
                    ${isProf ? `<span>+</span> <span class="text-xs text-green-400">${profBonus} (PROF)</span>` : ''}
                    <span>=</span>
                    <span class="text-xl text-amber-500 font-bold">${finalResult}</span>
                </div>
            `;
            if (onLogAction) onLogAction(msg);

        } catch (e) {
            console.error("Skill Roll interrupted", e);
        }
    };

    return (
        <div className="space-y-4 pb-24">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-slate-500 px-2 mt-2">
                <div className="col-span-1">Prof</div>
                <div className="col-span-4">Skill</div>
                <div className="col-span-2 text-center">Stat</div>
                <div className="col-span-3 text-center">Math</div>
                <div className="col-span-2 text-right">Total</div>
            </div>

            {/* Skill List */}
            <div className="space-y-1">
                {SKILL_LIST.map((skill) => {
                    const { isProf, abilityMod, total } = calculateSkill(skill);
                    
                    return (
                        <div 
                            key={skill.name} 
                            onClick={() => handleRoll(skill)}
                            className="grid grid-cols-12 gap-2 items-center bg-slate-800/50 border border-slate-700/50 rounded-lg p-2 hover:bg-slate-800 hover:border-amber-500/50 cursor-pointer transition-all group"
                        >
                            {/* Proficiency Dot */}
                            <div className="col-span-1 flex justify-center" onClick={(e) => { e.stopPropagation(); toggleSkill(skill.name); }}>
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${isProf ? 'bg-amber-500 border-amber-500' : 'border-slate-600 group-hover:border-slate-400'}`}>
                                    {isProf && <Icon name="check" size={10} className="text-black stroke-[3]"/>}
                                </div>
                            </div>

                            {/* Skill Name */}
                            <div className="col-span-4 font-bold text-slate-200 text-sm truncate group-hover:text-white">
                                {skill.name}
                            </div>

                            {/* Stat Label */}
                            <div className="col-span-2 text-center text-xs text-slate-500 uppercase font-mono">
                                {skill.stat.substring(0,3)}
                            </div>

                            {/* The Math Breakdown */}
                            <div className="col-span-3 text-center text-[10px] text-slate-400 font-mono flex justify-center gap-1">
                                <span>{abilityMod >= 0 ? '+' : ''}{abilityMod}</span>
                                {isProf && <span className="text-green-400">+{profBonus}</span>}
                            </div>

                            {/* Total Bonus */}
                            <div className="col-span-2 text-right font-bold text-amber-500 text-sm">
                                {total >= 0 ? '+' : ''}{total}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SkillsTab;