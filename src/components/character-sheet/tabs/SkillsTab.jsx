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
    const { character, getSkillBonus, toggleSkill } = useCharacterStore();
    const charSkills = character.skills || {};

    const handleRoll = async (skill) => {
        if (!onDiceRoll) return;

        try {
            const roll = await onDiceRoll(20);
            if (typeof roll !== 'number') return;

            const mod = getSkillBonus(skill.name, skill.stat);
            const total = roll + mod;

            const msg = `
                <div class="font-bold text-white border-b border-slate-700 pb-1 mb-1">${skill.name} Check</div>
                <div class="flex items-center gap-2 text-sm text-slate-300">
                    <span class="font-mono">d20 (${roll}) ${mod >= 0 ? '+' : ''}${mod}</span>
                    <span>=</span>
                    <span class="text-xl text-amber-500 font-bold">${total}</span>
                </div>
            `;
            if (onLogAction) onLogAction(msg);

        } catch (e) {
            console.error("Skill Roll interrupted", e);
        }
    };

    return (
        <div className="space-y-2 pb-24">
            <div className="grid grid-cols-6 gap-2 mb-4 text-[10px] uppercase font-bold text-slate-500 px-2">
                <div className="col-span-1">Prof</div>
                <div className="col-span-3">Skill</div>
                <div className="col-span-1 text-center">Stat</div>
                <div className="col-span-1 text-right">Bonus</div>
            </div>

            {SKILL_LIST.map((skill) => {
                const isProf = charSkills[skill.name];
                const bonus = getSkillBonus(skill.name, skill.stat);
                
                return (
                    <div 
                        key={skill.name} 
                        onClick={() => handleRoll(skill)}
                        className="bg-slate-800 border border-slate-700 rounded p-3 flex items-center hover:border-amber-500 cursor-pointer transition-colors group"
                    >
                        <div className="w-8 shrink-0" onClick={(e) => { e.stopPropagation(); toggleSkill(skill.name); }}>
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isProf ? 'bg-amber-500 border-amber-500' : 'border-slate-600 group-hover:border-slate-400'}`}>
                                {isProf && <Icon name="check" size={10} className="text-black"/>}
                            </div>
                        </div>
                        <div className="flex-1 font-bold text-slate-200 text-sm group-hover:text-white">{skill.name}</div>
                        <div className="w-10 text-center text-xs text-slate-500 uppercase font-mono">{skill.stat.substring(0,3)}</div>
                        <div className="w-10 text-right font-bold text-amber-500">{bonus >= 0 ? '+' : ''}{bonus}</div>
                    </div>
                );
            })}
        </div>
    );
};

export default SkillsTab;