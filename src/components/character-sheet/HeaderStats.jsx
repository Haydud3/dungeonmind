import React, { useState } from 'react';
import { useCharacterStore } from '../../stores/useCharacterStore';
import StatBox from './widgets/StatBox';
import Icon from '../Icon';

const HeaderStats = ({ onDiceRoll, onLogAction }) => {
  const { character, updateHP, getModifier, recoverSlots, shortRest, updateStat, updateInfo } = useCharacterStore();
  const [showEdit, setShowEdit] = useState(false);

  if (!character) return null;

  const dexMod = getModifier('dex');
  const ac = 10 + dexMod;

  const handleInitRoll = async () => {
      if (!onDiceRoll) return;

      try {
          const roll = await onDiceRoll(20);
          if (typeof roll !== 'number') return;

          const total = roll + dexMod;
          
          if (onLogAction) {
              const msg = `
                <div class="font-bold text-white">Initiative Roll</div>
                <div class="flex items-center gap-2 text-sm text-slate-300 mt-1">
                    <span class="font-mono">d20 (${roll}) ${dexMod >= 0 ? '+' : ''}${dexMod}</span>
                    <span>=</span>
                    <span class="text-xl text-amber-500 font-bold">${total}</span>
                </div>
              `;
              onLogAction(msg);
          }
      } catch (e) {
          console.error("Init roll interrupted");
      }
  };

  const handleLongRest = () => {
      if(confirm("Long Rest? (Restore Full HP & Slots)")) {
          recoverSlots();
          if(onLogAction) onLogAction(`💤 **${character.name}** finishes a Long Rest.`);
          setShowEdit(false);
      }
  };

  const handleShortRest = () => {
      const heal = prompt("Short Rest: How much HP to recover?", "0");
      if(heal !== null) {
          shortRest(parseInt(heal) || 0);
          if(onLogAction) onLogAction(`☕ **${character.name}** takes a Short Rest (Recovered ${heal} HP).`);
          setShowEdit(false);
      }
  };

   const handleImageUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => updateInfo('image', evt.target.result);
      reader.readAsDataURL(file);
  };

  return (
    <>
        <div className="bg-slate-900 border-b border-slate-800 p-4 flex gap-4 items-center sticky top-0 z-30 shadow-xl backdrop-blur-sm bg-slate-900/95">
            <div className="relative w-16 h-16 shrink-0 group cursor-pointer" onClick={() => setShowEdit(true)}>
                <img 
                    src={character.image && character.image.length > 5 ? character.image : `https://ui-avatars.com/api/?name=${character.name}&background=random`} 
                    className="w-full h-full rounded-xl object-cover border-2 border-slate-700 shadow-inner bg-slate-800" 
                />
                <div className="absolute -bottom-2 -right-2 bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-400 z-10">
                    LVL {character.level}
                </div>
            </div>

            <div className="flex-1 grid grid-cols-4 gap-2">
                <div className="col-span-2 bg-slate-800 rounded-lg border border-slate-700 p-2 flex flex-col justify-center relative overflow-hidden group">
                    <div className="flex justify-between items-end mb-1 relative z-10">
                        <span className="text-[10px] font-bold text-red-400">HP</span>
                        <span className="text-[10px] text-slate-500">MAX {character.hp.max}</span>
                    </div>
                    <div className="flex items-center gap-1 relative z-10">
                        <button onClick={() => updateHP('current', character.hp.current - 1)} className="text-slate-500 hover:text-red-400"><Icon name="minus" size={14}/></button>
                        <input type="number" className="w-full bg-transparent text-center font-mono font-bold text-xl text-white outline-none" value={character.hp.current} onChange={(e) => updateHP('current', e.target.value)} />
                        <button onClick={() => updateHP('current', character.hp.current + 1)} className="text-slate-500 hover:text-green-400"><Icon name="plus" size={14}/></button>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 bg-red-600 transition-all duration-500" style={{ width: `${Math.min((character.hp.current / character.hp.max) * 100, 100)}%` }}></div>
                </div>
                <StatBox label="AC" value={ac} subLabel="Armor" />
                <StatBox label="INIT" value={dexMod > 0 ? `+${dexMod}` : dexMod} subLabel="Dex" onClick={handleInitRoll} highlight />
            </div>
        </div>

        {showEdit && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-slate-900 rounded-xl w-full max-w-md border border-slate-700 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in duration-200">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800">
                        <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="settings" size={18}/> Character Settings</h3>
                        <button onClick={() => setShowEdit(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                    </div>
                    <div className="p-6 overflow-y-auto custom-scroll space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={handleShortRest} className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 py-3 rounded-lg flex flex-col items-center justify-center gap-1">
                                <Icon name="coffee" size={18}/> <span className="text-xs font-bold">Short Rest</span>
                            </button>
                            <button onClick={handleLongRest} className="bg-indigo-900/50 hover:bg-indigo-900 text-indigo-200 border border-indigo-700 py-3 rounded-lg flex flex-col items-center justify-center gap-1">
                                <Icon name="moon" size={18}/> <span className="text-xs font-bold">Long Rest</span>
                            </button>
                        </div>
                        <div className="h-px bg-slate-700"></div>
                        <div className="space-y-4">
                            <div><label className="text-xs uppercase font-bold text-slate-500 block mb-1">Name</label><input className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" value={character.name} onChange={e => updateInfo('name', e.target.value)} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs uppercase font-bold text-slate-500 block mb-1">Class</label><input className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" value={character.class} onChange={e => updateInfo('class', e.target.value)} /></div>
                                <div><label className="text-xs uppercase font-bold text-slate-500 block mb-1">Level</label><input type="number" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" value={character.level} onChange={e => updateInfo('level', e.target.value)} /></div>
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Avatar</label>
                                <div className="flex gap-2">
                                    <input className="flex-1 bg-slate-800 border border-slate-600 rounded p-2 text-xs text-slate-300 font-mono" value={character.image || ''} onChange={e => updateInfo('image', e.target.value)} placeholder="https://..." />
                                    <label className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded cursor-pointer border border-slate-600"><Icon name="upload" size={20}/><input type="file" accept="image/*" className="hidden" onChange={handleImageUpload}/></label>
                                </div>
                            </div>
                        </div>
                         <div className="h-px bg-slate-700"></div>
                        <div>
                            <h4 className="text-sm font-bold text-white mb-3">Core Stats</h4>
                            <div className="grid grid-cols-3 gap-3">
                                {Object.entries(character.stats).map(([key, val]) => (
                                    <div key={key} className="flex flex-col items-center bg-slate-800 p-2 rounded border border-slate-700">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">{key}</label>
                                        <input type="number" value={val} onChange={(e) => updateStat(key, e.target.value)} className="bg-transparent text-white font-bold text-xl text-center outline-none w-full" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </>
  );
};

export default HeaderStats;