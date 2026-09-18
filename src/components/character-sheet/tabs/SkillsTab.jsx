import React, { useState } from 'react';
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

const SAVING_THROWS = [
    { key: 'str', label: 'Strength' },
    { key: 'dex', label: 'Dexterity' },
    { key: 'con', label: 'Constitution' },
    { key: 'int', label: 'Intelligence' },
    { key: 'wis', label: 'Wisdom' },
    { key: 'cha', label: 'Charisma' }
];

const SkillsTab = ({ onDiceRoll, onLogAction, isOwner = true }) => {
    const { character, updateInfo } = useCharacterStore();
    const charSkills = character.skills || {};
    const profBonus = character.profBonus || 2;

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('all');

    const getModifier = (stat) => Math.floor(((character.stats?.[stat] || 10) - 10) / 2);

    // Cycle skill proficiency: none -> proficient -> expertise -> none
    const cycleSkill = (skillName) => {
        if (!isOwner) return;
        const newSkills = { ...charSkills };
        const current = newSkills[skillName];
        if (!current) {
            newSkills[skillName] = true; // Proficient
        } else if (current === true || current === 1) {
            newSkills[skillName] = 'expertise'; // Expertise
        } else {
            delete newSkills[skillName]; // None
        }
        updateInfo('skills', newSkills);
    };

    const toggleSave = (stat) => {
        if (!isOwner) return;
        const newSaves = { ...(character.savingThrows || {}) };
        newSaves[stat] = !newSaves[stat];
        updateInfo('savingThrows', newSaves);
    };

    const calculateSkill = (skill) => {
        const val = charSkills[skill.name];
        const isExpertise = val === 'expertise' || val === 2;
        const isProf = val === true || val === 1 || isExpertise;
        const abilityMod = getModifier(skill.stat);
        const bonus = isExpertise ? profBonus * 2 : (isProf ? profBonus : 0);
        const total = abilityMod + bonus;
        return { isProf, isExpertise, abilityMod, total, bonus };
    };

    const handleRoll = async (skill) => {
        if (!onDiceRoll) return;
        const { isProf, isExpertise, total } = calculateSkill(skill);
        const profLabel = isExpertise ? 'Expertise' : (isProf ? 'Proficient' : 'Normal');
        const formula = `1d20${total >= 0 ? '+' : ''}${total}`;
        await onDiceRoll(formula, { 
            alias: `${skill.name} Check`,
            description: `Proficiency: ${profLabel} (${skill.stat.toUpperCase()})`,
            characterName: character.name,
            actionType: 'skill'
        });
    };

    const handleSaveRoll = async (statKey, label, total, isProf) => {
        if (!onDiceRoll) return;
        const formula = `1d20${total >= 0 ? '+' : ''}${total}`;
        await onDiceRoll(formula, {
            alias: `${label} Save`,
            description: `Saving Throw (${isProf ? 'Proficient' : 'Standard'})`,
            characterName: character.name,
            actionType: 'save'
        });
    };

    // Filter skills by search query and ability filter
    const filteredSkills = SKILL_LIST.filter(skill => {
        const matchesSearch = skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            skill.stat.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        if (selectedFilter === 'all') return true;
        if (selectedFilter === 'proficient') {
            const { isProf } = calculateSkill(skill);
            return isProf;
        }
        return skill.stat === selectedFilter;
    });

    return (
        <div className="space-y-6 pb-24">
            {/* Saving Throws Section */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800/80 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                        <h4 className="text-xs uppercase font-bold text-slate-200 tracking-wider">Saving Throws</h4>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Proficiency +{profBonus}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                    {SAVING_THROWS.map(({ key, label }) => {
                        const isProf = !!character.savingThrows?.[key];
                        const mod = getModifier(key);
                        const total = mod + (isProf ? profBonus : 0);

                        return (
                            <div 
                                key={key} 
                                className={`group relative p-2.5 rounded-xl border transition-all flex flex-col items-center justify-between ${
                                    isProf 
                                        ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
                                        : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
                                }`}
                            >
                                <div className="flex items-center justify-between w-full mb-1">
                                    <button 
                                        type="button"
                                        onClick={() => toggleSave(key)}
                                        disabled={!isOwner}
                                        title={isProf ? "Proficient (Click to toggle)" : "Not Proficient (Click to toggle)"}
                                        className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                                            isProf 
                                                ? 'bg-amber-500 border-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]' 
                                                : 'border-slate-600 hover:border-amber-500/50 bg-slate-900/60'
                                        }`}
                                    >
                                        {isProf && <div className="w-1 h-1 rounded-full bg-slate-950" />}
                                    </button>
                                    <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">{key}</span>
                                </div>

                                <div className="text-[11px] text-slate-300 font-semibold truncate w-full text-center mb-1.5">
                                    {label}
                                </div>

                                <RollButton 
                                    onClick={() => handleSaveRoll(key, label, total, isProf)}
                                    type="save"
                                    className="w-full text-xs font-mono font-bold py-1"
                                >
                                    {total >= 0 ? `+${total}` : total}
                                </RollButton>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Passive Senses HUD */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                    { name: 'Perception', stat: 'wis', icon: 'eye', color: 'text-amber-400' },
                    { name: 'Investigation', stat: 'int', icon: 'search', color: 'text-cyan-400' },
                    { name: 'Insight', stat: 'wis', icon: 'sparkles', color: 'text-indigo-400' }
                ].map(sense => {
                    const { total } = calculateSkill(sense);
                    const passiveVal = 10 + total;
                    return (
                        <div 
                            key={sense.name} 
                            className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-xl border border-slate-800/80 shadow-lg flex items-center justify-between group hover:border-slate-700 transition-colors"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center ${sense.color}`}>
                                    <Icon name={sense.icon} size={16} />
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Passive {sense.name}</div>
                                    <div className="text-[11px] text-slate-400 font-mono uppercase">{sense.stat} mod ({total >= 0 ? `+${total}` : total})</div>
                                </div>
                            </div>
                            <div className="text-2xl font-mono font-black text-white px-2">
                                {passiveVal}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Skills Toolbar: Search & Ability Filter Chips */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                    <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search skills..."
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
                    />
                    {searchTerm && (
                        <button 
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                            <Icon name="x" size={13} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'proficient', label: 'Prof' },
                        { id: 'str', label: 'STR' },
                        { id: 'dex', label: 'DEX' },
                        { id: 'int', label: 'INT' },
                        { id: 'wis', label: 'WIS' },
                        { id: 'cha', label: 'CHA' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedFilter(tab.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-all tracking-wider ${
                                selectedFilter === tab.id
                                    ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                    : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Skills Table / List */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-slate-500 px-4 py-2.5 bg-slate-950/40 border-b border-slate-800/80 tracking-wider">
                    <div className="col-span-1 text-center" title="Proficiency status">Prof</div>
                    <div className="col-span-5 md:col-span-4">Skill</div>
                    <div className="hidden md:block col-span-2 text-center">Ability</div>
                    <div className="col-span-3 md:col-span-3 text-center">Formula</div>
                    <div className="col-span-3 md:col-span-2 text-right">Roll</div>
                </div>

                {/* Skill Rows */}
                <div className="divide-y divide-slate-800/40">
                    {filteredSkills.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs italic">
                            No skills matching "{searchTerm || selectedFilter}"
                        </div>
                    ) : (
                        filteredSkills.map((skill) => {
                            const { isProf, isExpertise, abilityMod, total, bonus } = calculateSkill(skill);

                            return (
                                <div 
                                    key={skill.name} 
                                    className="grid grid-cols-12 gap-2 items-center px-4 py-2.5 hover:bg-slate-800/40 transition-colors group"
                                >
                                    {/* Proficiency State Toggle */}
                                    <div className="col-span-1 flex justify-center">
                                        <button 
                                            type="button"
                                            onClick={() => cycleSkill(skill.name)}
                                            disabled={!isOwner}
                                            title={isExpertise ? "Expertise (2x Prof) - Click to clear" : (isProf ? "Proficient (1x Prof) - Click for Expertise" : "Not Proficient - Click to add Prof")}
                                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                                isExpertise 
                                                    ? 'bg-amber-400 border-amber-300 ring-2 ring-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.8)]' 
                                                    : isProf 
                                                        ? 'bg-amber-500 border-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]' 
                                                        : 'border-slate-600 group-hover:border-slate-500 bg-slate-900/60'
                                            }`}
                                        >
                                            {isExpertise ? (
                                                <span className="text-[8px] font-black text-slate-950">★</span>
                                            ) : isProf ? (
                                                <div className="w-1 h-1 rounded-full bg-slate-950" />
                                            ) : null}
                                        </button>
                                    </div>

                                    {/* Skill Name */}
                                    <div className="col-span-5 md:col-span-4 flex items-center gap-2 min-w-0">
                                        <span className={`font-semibold text-xs truncate transition-colors ${
                                            isExpertise ? 'text-amber-300 font-bold' : isProf ? 'text-slate-100 font-medium' : 'text-slate-300'
                                        }`}>
                                            {skill.name}
                                        </span>
                                        {isExpertise && (
                                            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider hidden sm:inline-block">
                                                Exp
                                            </span>
                                        )}
                                    </div>

                                    {/* Ability Pill (Hidden on Mobile) */}
                                    <div className="hidden md:block col-span-2 text-center">
                                        <span className="text-[10px] text-slate-400 font-mono uppercase bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                                            {skill.stat}
                                        </span>
                                    </div>

                                    {/* Math Breakdown */}
                                    <div className="col-span-3 md:col-span-3 flex items-center justify-center gap-1 text-[11px] font-mono">
                                        <span className="text-slate-400">
                                            {abilityMod >= 0 ? `+${abilityMod}` : abilityMod}
                                        </span>
                                        {bonus > 0 && (
                                            <span className={isExpertise ? 'text-amber-300 font-bold' : 'text-amber-500'}>
                                                +{bonus}
                                            </span>
                                        )}
                                    </div>

                                    {/* Roll Button */}
                                    <div className="col-span-3 md:col-span-2 flex justify-end">
                                        <RollButton 
                                            onClick={() => handleRoll(skill)} 
                                            type="skill" 
                                            className="min-w-[48px] py-1 text-xs font-mono font-bold"
                                        >
                                            {total >= 0 ? `+${total}` : total}
                                        </RollButton>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkillsTab;