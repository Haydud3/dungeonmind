import React, { useState } from 'react';
import { useCharacterStore } from '../../stores/useCharacterStore';
import Icon from '../Icon';
import { compressImage } from '../../utils/imageCompressor';

const HeaderStats = ({ onDiceRoll, onLogAction, onBack, onPossess, isNpc }) => {
  const { character, updateHP, updateStat, recoverSlots, shortRest, updateInfo } = useCharacterStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  if (!character) return null;

  // Helper to calc modifier
  const calcMod = (val) => Math.floor(((val || 10) - 10) / 2);

  const dexMod = calcMod(character.stats?.dex);
  const wisMod = calcMod(character.stats?.wis);
  const intMod = calcMod(character.stats?.int);
  const prof = character.profBonus || 2;
  
  const ac = 10 + dexMod; 
  const init = dexMod;

  // Passive Senses
  const getPassive = (mod, skillName) => 10 + mod + (character.skills?.[skillName] ? prof : 0);
  const passPerc = getPassive(wisMod, 'Perception');
  const passInv = getPassive(intMod, 'Investigation');
  const passIns = getPassive(wisMod, 'Insight');

  const hpPercent = Math.min((character.hp.current / character.hp.max) * 100, 100);
  const hpColor = hpPercent < 30 ? 'bg-red-600' : hpPercent < 60 ? 'bg-amber-500' : 'bg-green-500';

  const handleInitRoll = async () => { if(onDiceRoll) { const r = await onDiceRoll(20); if(onLogAction) onLogAction(`Init: ${r+init}`); } };
  const handleLongRest = () => { recoverSlots(); updateHP('current', character.hp.max); setIsExpanded(false); };
  const handleShortRest = () => { const h = prompt("Heal amount:"); if(h) shortRest(parseInt(h)); setIsExpanded(false); };
  
  const handleImageUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setIsUploading(true);
      try {
          const compressedData = await compressImage(file, 500, 0.7); 
          updateInfo('image', compressedData);
      } catch (err) { alert("Upload failed."); }
      setIsUploading(false);
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-lg shrink-0">
        
        {/* --- COMPACT STRIP --- */}
        <div className="flex items-center gap-3 p-3 h-16">
            {onBack && <button onClick={onBack} className="text-slate-400 hover:text-white p-1 mr-1"><Icon name="arrow-left" size={24}/></button>}
            
            <div onClick={() => setIsExpanded(!isExpanded)} className="relative w-12 h-12 shrink-0 cursor-pointer group">
                <img src={character.image || `https://ui-avatars.com/api/?name=${character.name}`} className="w-full h-full rounded-full object-cover border-2 border-slate-600 group-hover:border-amber-500"/>
                {isNpc && <div className="absolute -top-1 -right-1 bg-red-600 text-[8px] font-bold text-white px-1 rounded">NPC</div>}
            </div>

            <div className="flex-1 flex flex-col justify-center min-w-0">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white truncate">{character.name}</span>
                    <span className="text-xs font-mono text-slate-400">{character.hp.current}/{character.hp.max}</span>
                </div>
                <div className="relative h-5 bg-slate-800 rounded-md overflow-hidden border border-slate-700 flex items-center">
                    <div className={`absolute top-0 left-0 h-full ${hpColor} transition-all duration-500 opacity-30`} style={{ width: `${hpPercent}%` }}></div>
                    <button onClick={() => updateHP('current', character.hp.current - 1)} className="relative z-10 w-8 flex items-center justify-center hover:bg-black/20 text-slate-400 hover:text-red-400 h-full"><Icon name="minus" size={12}/></button>
                    <div className="flex-1"></div>
                    <button onClick={() => updateHP('current', character.hp.current + 1)} className="relative z-10 w-8 flex items-center justify-center hover:bg-black/20 text-slate-400 hover:text-green-400 h-full"><Icon name="plus" size={12}/></button>
                </div>
            </div>

            <div className="flex gap-2 shrink-0">
                <div className="flex flex-col items-center justify-center w-10 bg-slate-800 rounded border border-slate-700 p-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">AC</span>
                    <span className="text-lg font-bold text-white">{ac}</span>
                </div>
                <div onClick={handleInitRoll} className="flex flex-col items-center justify-center w-10 bg-slate-800 rounded border border-slate-700 p-1 cursor-pointer hover:border-amber-500">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">INIT</span>
                    <span className="text-lg font-bold text-white">{init >= 0 ? `+${init}` : init}</span>
                </div>
            </div>
            
            <button onClick={() => setIsExpanded(!isExpanded)} className={`p-2 text-slate-500 hover:text-white ${isExpanded?'rotate-180':''}`}><Icon name="chevron-down" size={20}/></button>
        </div>

        {/* --- EXPANDED DRAWER --- */}
        {isExpanded && (
            <div className="border-t border-slate-800 bg-slate-900/50 p-4 animate-in slide-in-from-top-2">
                
                {/* 1. RESTORED STATS EDITOR */}
                <div className="grid grid-cols-6 gap-2 mb-4 bg-slate-800/50 p-2 rounded-xl border border-slate-700">
                    {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((stat) => {
                        const val = character.stats?.[stat] || 10;
                        const mod = calcMod(val);
                        return (
                            <div key={stat} className="flex flex-col items-center">
                                <label className="text-[9px] uppercase font-bold text-slate-500 mb-1">{stat}</label>
                                <input 
                                    type="number" 
                                    className="w-full bg-slate-900 border border-slate-700 rounded text-center text-sm font-bold text-white py-1 focus:border-amber-500 outline-none" 
                                    value={val} 
                                    onChange={(e) => updateStat(stat, parseInt(e.target.value))} 
                                />
                                <span className={`text-[9px] mt-1 font-mono ${mod >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {mod >= 0 ? '+' : ''}{mod}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* 2. Tools & Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <button onClick={handleShortRest} className="bg-slate-800 border border-slate-600 py-2 rounded text-xs font-bold text-slate-300">Short Rest</button>
                    <button onClick={handleLongRest} className="bg-indigo-900/50 border border-indigo-700 py-2 rounded text-xs font-bold text-indigo-200">Long Rest</button>
                    {onPossess && (
                        <button 
                            onClick={onPossess} 
                            className="bg-red-900/80 border border-red-600 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold text-white animate-pulse"
                        >
                            <Icon name="ghost" size={14}/> Possess
                        </button>
                    )}
                    <div 
                        onClick={() => updateInfo('inspiration', !character.inspiration)}
                        className={`py-2 rounded border flex items-center justify-center gap-2 text-xs font-bold cursor-pointer select-none transition-colors ${character.inspiration ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                    >
                        <Icon name="flame" size={14} className={character.inspiration ? "fill-amber-500" : ""}/> Inspiration
                    </div>
                </div>
                
                {/* 3. Passive Senses & Image */}
                <div className="flex gap-4 items-end">
                    <div className="flex-1 grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-800 p-1 rounded border border-slate-700"><div className="text-[9px] text-slate-500">Perc</div><div className="text-sm font-bold text-white">{passPerc}</div></div>
                        <div className="bg-slate-800 p-1 rounded border border-slate-700"><div className="text-[9px] text-slate-500">Inv</div><div className="text-sm font-bold text-white">{passInv}</div></div>
                        <div className="bg-slate-800 p-1 rounded border border-slate-700"><div className="text-[9px] text-slate-500">Ins</div><div className="text-sm font-bold text-white">{passIns}</div></div>
                    </div>
                    <div className="flex gap-2 w-1/3">
                         <label className={`w-full bg-slate-700 hover:bg-slate-600 text-white p-2 rounded cursor-pointer border border-slate-600 flex flex-col items-center justify-center ${isUploading ? 'opacity-50' : ''}`} title="Upload Avatar">
                            {isUploading ? <Icon name="loader-2" className="animate-spin" size={16}/> : <Icon name="upload" size={16}/>}
                            <span className="text-[9px] mt-1">Avatar</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading}/>
                        </label>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default HeaderStats;