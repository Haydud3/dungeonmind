import React, { useState, useRef } from 'react';
import { useCharacterStore } from '../../stores/useCharacterStore';
import Icon from '../Icon';
import { compressImage } from '../../utils/imageCompressor';

const HeaderStats = ({ onDiceRoll, onLogAction, onBack, onPossess, isNpc, combatActive, onInitiative }) => {
  const { character, updateHP, updateStat, updateDeathSaves, setDeathSaves, recoverSlots, shortRest, updateInfo } = useCharacterStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeathModal, setShowDeathModal] = useState(false); 
  const fileInputRef = useRef(null);

  if (!character) return null;

  // --- STATS & MODIFIERS ---
  const calcMod = (val) => Math.floor(((val || 10) - 10) / 2);
  const dexMod = calcMod(character.stats?.dex);
  const wisMod = calcMod(character.stats?.wis);
  const intMod = calcMod(character.stats?.int);
  const prof = character.profBonus || 2;
  const ac = character.ac || 10 + dexMod; 
  const init = character.init ? parseInt(character.init) : dexMod;

  // --- PASSIVE SENSES ---
  const getPassive = (mod, skillName) => 10 + mod + (character.skills?.[skillName] ? prof : 0);
  const passPerc = character.senses?.passivePerception || getPassive(wisMod, 'Perception');
  const passInv = character.senses?.passiveInvestigation || getPassive(intMod, 'Investigation');
  const passIns = character.senses?.passiveInsight || getPassive(wisMod, 'Insight');
  
  // --- DARKVISION (NEW) ---
  // Defaults to 0 if not found. This maps to the data extracted by the updated parser.
  const darkvision = character.senses?.darkvision || 0;

  // --- HP LOGIC ---
  const currentHP = character.hp.current;
  const maxHP = character.hp.max;
  const hpPercent = Math.min((currentHP / maxHP) * 100, 100);
  const hpColor = hpPercent < 30 ? 'bg-red-600' : hpPercent < 60 ? 'bg-amber-500' : 'bg-green-500';
  const isDying = currentHP === 0 && !isNpc;

  // --- HANDLERS ---
  const handleInitRoll = async () => { 
      if(onDiceRoll) { 
          const r = await onDiceRoll(20); 
          const total = r + init;
          
          if (combatActive && onInitiative) {
              onInitiative(total);
              if(onLogAction) onLogAction(`<span class="text-amber-500 font-bold">Joined Combat</span>: ${total}`);
          } else {
              if(onLogAction) onLogAction(`Init: ${total}`); 
          }
      } 
  };
  const handleLongRest = () => { recoverSlots(); updateHP('current', maxHP); setIsExpanded(false); };
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

  const triggerUpload = () => { if (fileInputRef.current) fileInputRef.current.click(); };

  // --- DEATH SAVE HANDLER ---
  const handleDeathSave = async () => {
      if(!onDiceRoll) return;
      const roll = await onDiceRoll(20);
      let resultMsg = "";
      
      if (roll === 20) {
          resultMsg = `<span class="text-green-400 font-bold">Natural 20!</span> Regained 1 HP!`;
          updateHP('current', 1); 
          setShowDeathModal(false); 
      } else if (roll === 1) {
          resultMsg = `<span class="text-red-500 font-bold">Natural 1!</span> Two failures.`;
          updateDeathSaves('crit_fail');
      } else if (roll >= 10) {
          resultMsg = `<span class="text-green-300">Success</span> (${roll})`;
          updateDeathSaves('success');
      } else {
          resultMsg = `<span class="text-red-400">Failure</span> (${roll})`;
          updateDeathSaves('failure');
      }

      onLogAction && onLogAction(`
          <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase text-slate-500">Death Save</span>
              <span>${resultMsg}</span>
          </div>
      `);
  };

  const saves = character.deathSaves || { successes: 0, failures: 0 };

  return (
    <>
    <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-lg shrink-0">
        
        <div className="flex items-center gap-3 p-3 h-16">
            {onBack && <button onClick={onBack} className="text-slate-400 hover:text-white p-1 mr-1"><Icon name="arrow-left" size={24}/></button>}
            
            <div onClick={triggerUpload} className="relative w-12 h-12 shrink-0 cursor-pointer group">
                <img src={character.image || `https://ui-avatars.com/api/?name=${character.name}`} className="w-full h-full rounded-full object-cover border-2 border-slate-600 group-hover:border-amber-500 transition-colors"/>
                {isNpc && <div className="absolute -top-1 -right-1 bg-red-600 text-[8px] font-bold text-white px-1 rounded">NPC</div>}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading}/>
            </div>

            <div className="flex-1 flex flex-col justify-center min-w-0" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white truncate">{character.name}</span>
                    <span className={`text-xs font-mono ${isDying ? 'text-red-500 font-bold animate-pulse' : 'text-slate-400'}`}>
                        {isDying ? "CRITICAL" : `${currentHP}/${maxHP}`}
                    </span>
                </div>
                
                {isDying ? (
                    <div 
                        className="h-5 flex items-center justify-center bg-red-900/40 rounded border border-red-500/50 cursor-pointer hover:bg-red-900/60 transition-colors animate-pulse px-1" 
                        onClick={(e) => { e.stopPropagation(); setShowDeathModal(true); }}
                    >
                        <Icon name="skull" size={12} className="text-red-500 mr-1.5"/>
                        <span className="text-[10px] font-bold text-red-200 tracking-widest uppercase truncate">
                            DYING <span className="opacity-50 text-[9px] ml-1">(ROLL)</span>
                        </span>
                    </div>
                ) : (
                    <div className="relative h-5 bg-slate-800 rounded-md overflow-hidden border border-slate-700 flex items-center">
                        <div className={`absolute top-0 left-0 h-full ${hpColor} transition-all duration-500 opacity-30`} style={{ width: `${hpPercent}%` }}></div>
                        <button onClick={(e) => {e.stopPropagation(); updateHP('current', Math.max(0, currentHP - 1))}} className="relative z-10 w-8 flex items-center justify-center hover:bg-black/20 text-slate-400 hover:text-red-400 h-full"><Icon name="minus" size={12}/></button>
                        <div className="flex-1"></div>
                        <button onClick={(e) => {e.stopPropagation(); updateHP('current', Math.min(maxHP, currentHP + 1))}} className="relative z-10 w-8 flex items-center justify-center hover:bg-black/20 text-slate-400 hover:text-green-400 h-full"><Icon name="plus" size={12}/></button>
                    </div>
                )}
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
                <div className="grid grid-cols-6 gap-2 mb-4 bg-slate-800/50 p-2 rounded-xl border border-slate-700">
                    {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((stat) => {
                        const val = character.stats?.[stat] || 10;
                        const mod = calcMod(val);
                        return (
                            <div key={stat} className="flex flex-col items-center">
                                <label className="text-[9px] uppercase font-bold text-slate-500 mb-1">{stat}</label>
                                <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded text-center text-sm font-bold text-white py-1 outline-none" value={val} onChange={(e) => updateStat(stat, parseInt(e.target.value))} />
                                <span className={`text-[9px] mt-1 font-mono ${mod >= 0 ? 'text-green-400' : 'text-red-400'}`}>{mod >= 0 ? '+' : ''}{mod}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <button onClick={handleShortRest} className="bg-slate-800 border border-slate-600 py-2 rounded text-xs font-bold text-slate-300">Short Rest</button>
                    <button onClick={handleLongRest} className="bg-indigo-900/50 border border-indigo-700 py-2 rounded text-xs font-bold text-indigo-200">Long Rest</button>
                    {onPossess && <button onClick={onPossess} className="bg-red-900/80 border border-red-600 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold text-white animate-pulse"><Icon name="ghost" size={14}/> Possess</button>}
                    <div onClick={() => updateInfo('inspiration', !character.inspiration)} className={`py-2 rounded border flex items-center justify-center gap-2 text-xs font-bold cursor-pointer transition-colors ${character.inspiration ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><Icon name="flame" size={14} className={character.inspiration ? "fill-amber-500" : ""}/> Inspiration</div>
                </div>
                
                {/* SENSES ROW: Now 4 columns to include Darkvision */}
                <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-slate-800 p-1 rounded border border-slate-700">
                        <div className="text-[9px] text-slate-500">Perc</div>
                        <div className="text-sm font-bold text-white">{passPerc}</div>
                    </div>
                    <div className="bg-slate-800 p-1 rounded border border-slate-700">
                        <div className="text-[9px] text-slate-500">Inv</div>
                        <div className="text-sm font-bold text-white">{passInv}</div>
                    </div>
                    <div className="bg-slate-800 p-1 rounded border border-slate-700">
                        <div className="text-[9px] text-slate-500">Ins</div>
                        <div className="text-sm font-bold text-white">{passIns}</div>
                    </div>
                    <div className="bg-slate-800 p-1 rounded border border-slate-700 group relative">
                        <div className="text-[9px] text-slate-500">Vision</div>
                        <div className={`text-sm font-bold ${darkvision > 0 ? 'text-cyan-400' : 'text-slate-500'}`}>
                            {darkvision > 0 ? `${darkvision}ft` : '-'}
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>

    {/* --- DEATH SAVE MODAL --- */}
    {showDeathModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowDeathModal(false)}>
            <div className="bg-slate-900 border border-red-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowDeathModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><Icon name="x" size={24}/></button>
                
                <div className="text-center mb-6">
                    <Icon name="skull" size={48} className="text-red-600 mx-auto mb-2 animate-pulse"/>
                    <h2 className="text-2xl fantasy-font text-white">Death Saves</h2>
                    <p className="text-slate-400 text-sm">You are dying. Roll to survive.</p>
                </div>

                <div className="space-y-6">
                    {/* Successes */}
                    <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-green-500 uppercase tracking-widest mb-2">Successes (3 to Stabilize)</span>
                        <div className="flex gap-4">
                            {[...Array(3)].map((_, i) => (
                                <div 
                                    key={`s-big-${i}`} 
                                    onClick={() => setDeathSaves('successes', i < saves.successes ? i : i + 1)}
                                    className={`w-8 h-8 rounded-full border-2 border-green-900 cursor-pointer transition-all ${i < saves.successes ? 'bg-green-500 scale-110 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-slate-800 hover:bg-slate-700'}`}
                                ></div>
                            ))}
                        </div>
                    </div>

                    {/* Failures */}
                    <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Failures (3 to Die)</span>
                        <div className="flex gap-4">
                            {[...Array(3)].map((_, i) => (
                                <div 
                                    key={`f-big-${i}`} 
                                    onClick={() => setDeathSaves('failures', i < saves.failures ? i : i + 1)}
                                    className={`w-8 h-8 rounded-full border-2 border-red-900 cursor-pointer transition-all ${i < saves.failures ? 'bg-red-600 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-800 hover:bg-slate-700'}`}
                                ></div>
                            ))}
                        </div>
                    </div>

                    {/* Roll Button */}
                    <button 
                        onClick={handleDeathSave} 
                        className="w-full py-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold rounded-xl text-lg flex items-center justify-center gap-3 transition-all active:scale-95"
                    >
                        <Icon name="dices" size={24}/> Roll d20
                    </button>
                    
                    {/* Heal Button (Escape Hatch) */}
                    <button 
                        onClick={() => { updateHP('current', 1); setShowDeathModal(false); }}
                        className="w-full py-2 text-green-400 hover:text-green-300 text-xs font-bold flex items-center justify-center gap-2"
                    >
                        <Icon name="heart" size={14}/> Heal (Force Stabilize)
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

export default HeaderStats;