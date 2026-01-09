import React, { useState } from 'react';
import { useCharacterStore } from '../../stores/useCharacterStore';
import Icon from '../Icon';
import { compressImage } from '../../utils/imageCompressor';

const HeaderStats = ({ onDiceRoll, onLogAction, onBack }) => {
  const { character, updateHP, getModifier, recoverSlots, shortRest, updateInfo, updateStat } = useCharacterStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  if (!character) return null;

  const dexMod = getModifier('dex');
  const wisMod = getModifier('wis');
  const intMod = getModifier('int');
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

  const handleInitRoll = async () => {
      if (!onDiceRoll) return;
      try {
          const roll = await onDiceRoll(20);
          if (typeof roll !== 'number') return;
          const total = roll + init;
          if (onLogAction) onLogAction(`<div class="font-bold">Initiative</div>d20(${roll}) ${init>=0?'+':''}${init} = <span class="text-xl font-bold text-amber-500">${total}</span>`);
      } catch (e) { console.error(e); }
  };

  const handleLongRest = () => {
      if(confirm("Long Rest? (Restore Full HP & Slots)")) {
          recoverSlots();
          updateHP('current', character.hp.max);
          if(onLogAction) onLogAction(`💤 **${character.name}** finishes a Long Rest.`);
          setIsExpanded(false);
      }
  };

  const handleShortRest = () => {
      const heal = prompt("HP to recover:", "0");
      if(heal) {
          shortRest(parseInt(heal) || 0);
          if(onLogAction) onLogAction(`☕ **${character.name}** takes a Short Rest (+${heal} HP).`);
          setIsExpanded(false);
      }
  };

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
        
        {/* --- COMPACT STRIP (ALWAYS VISIBLE) --- */}
        <div className="flex items-center gap-3 p-3 h-16">
            
            {/* 0. Back Button (Left of Avatar) */}
            {onBack && (
                <button onClick={onBack} className="text-slate-400 hover:text-white p-1 mr-1">
                    <Icon name="arrow-left" size={24}/>
                </button>
            )}

            {/* 1. Avatar (Click to Expand) */}
            <div onClick={() => setIsExpanded(!isExpanded)} className="relative w-12 h-12 shrink-0 cursor-pointer group">
                <img 
                    src={character.image && character.image.length > 5 ? character.image : `https://ui-avatars.com/api/?name=${character.name}&background=random`} 
                    className="w-full h-full rounded-full object-cover border-2 border-slate-600 group-hover:border-amber-500 transition-colors" 
                    alt="Char"
                />
                <div className="absolute -bottom-1 -right-1 bg-slate-800 text-[9px] font-bold text-slate-300 border border-slate-600 px-1 rounded-full">
                    {character.level}
                </div>
            </div>

            {/* 2. Vital Stats (HP) */}
            <div className="flex-1 flex flex-col justify-center min-w-0">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white truncate">{character.name}</span>
                    <span className="text-xs font-mono text-slate-400">
                        <span className={character.hp.current < character.hp.max / 2 ? "text-red-400 font-bold" : "text-slate-200"}>{character.hp.current}</span>
                        <span className="text-slate-600">/</span>
                        {character.hp.max}
                    </span>
                </div>
                {/* Compact HP Controls */}
                <div className="relative h-5 bg-slate-800 rounded-md overflow-hidden border border-slate-700 flex items-center">
                    <div className={`absolute top-0 left-0 h-full ${hpColor} transition-all duration-500 opacity-30`} style={{ width: `${hpPercent}%` }}></div>
                    <button onClick={() => updateHP('current', character.hp.current - 1)} className="relative z-10 w-8 flex items-center justify-center hover:bg-black/20 text-slate-400 hover:text-red-400 h-full"><Icon name="minus" size={12}/></button>
                    <div className="flex-1"></div>
                    <button onClick={() => updateHP('current', character.hp.current + 1)} className="relative z-10 w-8 flex items-center justify-center hover:bg-black/20 text-slate-400 hover:text-green-400 h-full"><Icon name="plus" size={12}/></button>
                </div>
            </div>

            {/* 3. Combat Metrics (AC / Init) */}
            <div className="flex gap-2 shrink-0">
                <div className="flex flex-col items-center justify-center w-10 bg-slate-800 rounded border border-slate-700 p-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase leading-none">AC</span>
                    <span className="text-lg font-bold text-white leading-none mt-0.5">{ac}</span>
                </div>
                <div onClick={handleInitRoll} className="flex flex-col items-center justify-center w-10 bg-slate-800 rounded border border-slate-700 p-1 cursor-pointer hover:border-amber-500 group">
                    <span className="text-[9px] text-slate-500 font-bold uppercase leading-none group-hover:text-amber-500">INIT</span>
                    <span className="text-lg font-bold text-white leading-none mt-0.5">{init >= 0 ? `+${init}` : init}</span>
                </div>
            </div>

            {/* 4. Expander Button */}
            <button onClick={() => setIsExpanded(!isExpanded)} className={`p-2 rounded text-slate-500 hover:text-white transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                <Icon name="chevron-down" size={20}/>
            </button>
        </div>

        {/* --- EXPANDED DRAWER (Details & Tools) --- */}
        {isExpanded && (
            <div className="border-t border-slate-800 bg-slate-900/50 p-4 animate-in slide-in-from-top-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <button onClick={handleShortRest} className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold transition-colors">
                        <Icon name="coffee" size={14}/> Short Rest
                    </button>
                    <button onClick={handleLongRest} className="bg-indigo-900/50 hover:bg-indigo-900 text-indigo-200 border border-indigo-700 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold transition-colors">
                        <Icon name="moon" size={14}/> Long Rest
                    </button>
                    <div 
                        onClick={() => updateInfo('inspiration', !character.inspiration)}
                        className={`py-2 rounded border flex items-center justify-center gap-2 text-xs font-bold cursor-pointer select-none transition-colors ${character.inspiration ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                    >
                        <Icon name="flame" size={14} className={character.inspiration ? "fill-amber-500" : ""}/> Inspiration
                    </div>
                    <div className="bg-slate-800 border border-slate-700 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold text-slate-300">
                        <Icon name="footprints" size={14}/> {character.speed || "30 ft."}
                    </div>
                </div>

                {/* Passive Senses */}
                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div className="bg-slate-800 p-1.5 rounded border border-slate-700">
                        <div className="text-[9px] text-slate-500 uppercase">Passive Perc</div>
                        <div className="text-sm font-bold text-white">{passPerc}</div>
                    </div>
                    <div className="bg-slate-800 p-1.5 rounded border border-slate-700">
                        <div className="text-[9px] text-slate-500 uppercase">Passive Inv</div>
                        <div className="text-sm font-bold text-white">{passInv}</div>
                    </div>
                    <div className="bg-slate-800 p-1.5 rounded border border-slate-700">
                        <div className="text-[9px] text-slate-500 uppercase">Passive Ins</div>
                        <div className="text-sm font-bold text-white">{passIns}</div>
                    </div>
                </div>

                {/* Core Stats Editor (Mini) */}
                <div className="grid grid-cols-6 gap-2 mb-4">
                    {Object.entries(character.stats).map(([key, val]) => (
                        <div key={key} className="flex flex-col items-center">
                            <label className="text-[9px] uppercase font-bold text-slate-500">{key}</label>
                            <input 
                                type="number" 
                                className="w-full bg-slate-800 border border-slate-700 rounded text-center text-xs text-white py-1 focus:border-amber-500 outline-none" 
                                value={val} 
                                onChange={(e) => updateStat(key, e.target.value)} 
                            />
                        </div>
                    ))}
                </div>

                {/* Image & Basic Info Edit */}
                <div className="flex gap-2">
                    <input className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white" value={character.image || ''} onChange={e => updateInfo('image', e.target.value)} placeholder="Image URL..." />
                    <label className={`bg-slate-700 hover:bg-slate-600 text-white p-2 rounded cursor-pointer border border-slate-600 flex items-center justify-center ${isUploading ? 'opacity-50' : ''}`} title="Upload">
                        {isUploading ? <Icon name="loader-2" className="animate-spin" size={16}/> : <Icon name="upload" size={16}/>}
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading}/>
                    </label>
                </div>
            </div>
        )}
    </div>
  );
};

export default HeaderStats;