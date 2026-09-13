import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { fetchClassLevelData, fetchClassDetails, fetchFeatureDetails, normalizeClassIndex } from '../../utils/levelUpService';
import { useCharacterStore } from '../../stores/useCharacterStore';

const LevelUpModal = ({ character, onClose }) => {
    const { updateInfo, updateStat } = useCharacterStore();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    
    const [levelData, setLevelData] = useState(null);
    const [classData, setClassData] = useState(null);
    const [newFeatures, setNewFeatures] = useState([]);
    const [hpIncrease, setHpIncrease] = useState(0);
    const [rollMode, setRollMode] = useState('average'); // 'average' or 'roll'
    const [manualRoll, setManualRoll] = useState('');
    
    // ASI States
    const [hasASI, setHasASI] = useState(false);
    const [asiChoice, setAsiChoice] = useState('stats'); // 'stats' or 'feat'
    const [stat1, setStat1] = useState('');
    const [stat2, setStat2] = useState('');
    const [featName, setFeatName] = useState('');
    const [featDesc, setFeatDesc] = useState('');

    const nextLevel = (character.level || 1) + 1;
    const conMod = character.stats ? Math.floor((character.stats.con - 10) / 2) : 0;

    useEffect(() => {
        const loadLevelData = async () => {
            setIsLoading(true);
            try {
                const cData = await fetchClassDetails(character.class);
                setClassData(cData);
                
                const lData = await fetchClassLevelData(character.class, nextLevel);
                setLevelData(lData);

                if (lData && lData.features) {
                    const featurePromises = lData.features.map(f => fetchFeatureDetails(f.url));
                    const resolvedFeatures = await Promise.all(featurePromises);
                    setNewFeatures(resolvedFeatures.filter(f => f !== null));
                }
                
                if (lData && lData.ability_score_bonuses > 0) {
                    // This is a naive check. A better check would be checking if ability_score_bonuses increased compared to prev level, but 5e API accumulates them.
                    // Wait, ability_score_bonuses in 5e API is actually the *accumulated* number of ASIs. 
                    // So we only get one if the current level's ASI count > previous level's ASI count.
                    const prevLData = await fetchClassLevelData(character.class, nextLevel - 1);
                    if (prevLData && lData.ability_score_bonuses > prevLData.ability_score_bonuses) {
                        setHasASI(true);
                    }
                }
            } catch (err) {
                setError(err.message);
            }
            setIsLoading(false);
        };
        loadLevelData();
    }, [character.class, nextLevel]);

    useEffect(() => {
        if (classData && classData.hit_die) {
            if (rollMode === 'average') {
                setHpIncrease(Math.floor(classData.hit_die / 2) + 1 + conMod);
            } else if (manualRoll) {
                setHpIncrease(parseInt(manualRoll) + conMod);
            } else {
                setHpIncrease(conMod);
            }
        }
    }, [classData, rollMode, manualRoll, conMod]);

    const handleConfirm = () => {
        // 1. Update HP
        const currentMax = character.hp?.max || 0;
        const currentCurrent = character.hp?.current || 0;
        updateInfo('hp', { 
            ...character.hp, 
            max: currentMax + hpIncrease, 
            current: currentCurrent + hpIncrease 
        });

        // 2. Update Hit Dice max
        updateInfo('hitDice', {
            ...character.hitDice,
            max: (character.hitDice?.max || 1) + 1,
            current: (character.hitDice?.current || 1) + 1
        });

        // 3. Update Level
        updateInfo('level', nextLevel);

        // 4. Update PB
        if (levelData && levelData.prof_bonus) {
            updateInfo('pb', levelData.prof_bonus);
        }

        // 5. Update Spell Slots
        if (levelData && levelData.spellcasting) {
            const newSlots = { ...character.spellSlots };
            const sc = levelData.spellcasting;
            for (let i = 1; i <= 9; i++) {
                const key = `spell_slots_level_${i}`;
                if (sc[key] !== undefined) {
                    newSlots[i] = { 
                        max: sc[key], 
                        current: sc[key] // Refill slots on level up? Usually long rest does it, but we can update max
                    };
                }
            }
            updateInfo('spellSlots', newSlots);
        }

        // 6. Add Features
        const existingFeatures = character.features || [];
        const addedFeatures = newFeatures.map(f => ({
            id: Date.now() + Math.random(),
            name: f.name,
            description: f.desc,
            source: classData?.name || "Class"
        }));
        
        let allFeatures = [...existingFeatures, ...addedFeatures];

        // 7. Handle ASI
        if (hasASI) {
            if (asiChoice === 'stats') {
                if (stat1) updateStat(stat1, (character.stats[stat1] || 10) + (stat1 === stat2 ? 2 : 1));
                if (stat2 && stat1 !== stat2) updateStat(stat2, (character.stats[stat2] || 10) + 1);
            } else if (asiChoice === 'feat' && featName) {
                allFeatures.push({
                    id: Date.now() + Math.random(),
                    name: featName,
                    description: featDesc,
                    source: "Feat"
                });
            }
        }
        
        if (addedFeatures.length > 0 || (hasASI && asiChoice === 'feat')) {
            updateInfo('features', allFeatures);
        }

        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-indigo-950/20 rounded-t-2xl">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Icon name="arrow-up-circle" className="text-indigo-400" /> 
                        Level Up to {nextLevel}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                </div>

                <div className="p-6 overflow-y-auto custom-scroll flex-1 space-y-6">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                            <Icon name="loader" className="animate-spin mb-4" size={32} />
                            <p>Consulting the ancient tomes (D&D 5e API)...</p>
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-950/30 border border-red-900 rounded-xl text-red-400">
                            Failed to load level data: {error}
                        </div>
                    ) : (
                        <>
                            {/* Hit Points Section */}
                            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                <h3 className="font-bold text-white mb-3 flex items-center gap-2"><Icon name="heart" size={16} className="text-red-400" /> Hit Points Increase</h3>
                                <div className="flex gap-2 mb-3">
                                    <button 
                                        onClick={() => setRollMode('average')} 
                                        className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${rollMode === 'average' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-600 text-slate-400'}`}
                                    >
                                        Average (+{Math.floor(classData?.hit_die / 2) + 1})
                                    </button>
                                    <button 
                                        onClick={() => setRollMode('roll')} 
                                        className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${rollMode === 'roll' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-600 text-slate-400'}`}
                                    >
                                        Roll (d{classData?.hit_die})
                                    </button>
                                </div>
                                {rollMode === 'roll' && (
                                    <div className="mb-3">
                                        <input 
                                            type="number" 
                                            placeholder="Enter roll result..." 
                                            value={manualRoll} 
                                            onChange={e => setManualRoll(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                                            min="1" max={classData?.hit_die}
                                        />
                                    </div>
                                )}
                                <div className="text-sm text-slate-400">
                                    CON Mod: <span className="text-white">+{conMod}</span>
                                </div>
                                <div className="mt-2 text-lg font-bold text-green-400 border-t border-slate-700 pt-2">
                                    Total HP Gained: +{hpIncrease || 0}
                                </div>
                            </div>

                            {/* Features Section */}
                            {newFeatures.length > 0 && (
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                    <h3 className="font-bold text-white mb-3 flex items-center gap-2"><Icon name="star" size={16} className="text-amber-400" /> New Features</h3>
                                    <div className="space-y-3">
                                        {newFeatures.map((f, i) => (
                                            <div key={i} className="bg-slate-900 p-3 rounded border border-slate-700">
                                                <div className="font-bold text-indigo-300">{f.name}</div>
                                                <div className="text-xs text-slate-400 mt-1 line-clamp-2">{f.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Proficiency & Spells Summary */}
                            <div className="grid grid-cols-2 gap-4">
                                {levelData?.prof_bonus && levelData.prof_bonus > character.pb && (
                                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 text-center">
                                        <div className="text-xs text-slate-400 uppercase font-bold mb-1">Proficiency</div>
                                        <div className="text-2xl font-black text-indigo-400">+{levelData.prof_bonus}</div>
                                    </div>
                                )}
                                {levelData?.spellcasting && (
                                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 text-center col-span-2">
                                        <div className="text-xs text-slate-400 uppercase font-bold mb-1">Spellcasting Improved</div>
                                        <div className="text-sm text-white">Your spell slots have been updated automatically.</div>
                                    </div>
                                )}
                            </div>

                            {/* ASI Section */}
                            {hasASI && (
                                <div className="bg-amber-950/20 rounded-xl p-4 border border-amber-900/50">
                                    <h3 className="font-bold text-amber-400 mb-3 flex items-center gap-2"><Icon name="trending-up" size={16} /> Ability Score Improvement</h3>
                                    <div className="flex gap-2 mb-4">
                                        <button 
                                            onClick={() => setAsiChoice('stats')} 
                                            className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors ${asiChoice === 'stats' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                                        >
                                            +2 Stats
                                        </button>
                                        <button 
                                            onClick={() => setAsiChoice('feat')} 
                                            className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors ${asiChoice === 'feat' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                                        >
                                            Feat
                                        </button>
                                    </div>
                                    
                                    {asiChoice === 'stats' ? (
                                        <div className="flex gap-2">
                                            <select value={stat1} onChange={e => setStat1(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-2 text-white">
                                                <option value="">Select Stat...</option>
                                                <option value="str">Strength</option>
                                                <option value="dex">Dexterity</option>
                                                <option value="con">Constitution</option>
                                                <option value="int">Intelligence</option>
                                                <option value="wis">Wisdom</option>
                                                <option value="cha">Charisma</option>
                                            </select>
                                            <select value={stat2} onChange={e => setStat2(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-2 text-white">
                                                <option value="">Select Stat...</option>
                                                <option value="str">Strength</option>
                                                <option value="dex">Dexterity</option>
                                                <option value="con">Constitution</option>
                                                <option value="int">Intelligence</option>
                                                <option value="wis">Wisdom</option>
                                                <option value="cha">Charisma</option>
                                            </select>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <input type="text" placeholder="Feat Name" value={featName} onChange={e => setFeatName(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white" />
                                            <textarea placeholder="Feat Description" value={featDesc} onChange={e => setFeatDesc(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white h-20 resize-none"></textarea>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900 rounded-b-2xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white font-bold">Cancel</button>
                    <button onClick={handleConfirm} disabled={isLoading || (rollMode === 'roll' && !manualRoll)} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed">
                        Apply Level Up
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LevelUpModal;
