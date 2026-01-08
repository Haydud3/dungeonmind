import React, { useState, useEffect } from 'react';
import HeaderStats from './HeaderStats';
import ActionsTab from './tabs/ActionsTab';
import SkillsTab from './tabs/SkillsTab';
import SpellsTab from './tabs/SpellsTab'; 
import InventoryTab from './tabs/InventoryTab';
import BioTab from './tabs/BioTab';
import FeaturesTab from './tabs/FeaturesTab';
import RollToast from './widgets/RollToast';
import Icon from '../Icon';
import { useCharacterStore } from '../../stores/useCharacterStore';

const SheetContainer = ({ characterId, onSave, onDiceRoll, onLogAction }) => {
    const [activeTab, setActiveTab] = useState('actions');
    
    const character = useCharacterStore((state) => state.character);
    const isDirty = useCharacterStore((state) => state.isDirty);
    const markSaved = useCharacterStore((state) => state.markSaved);
    const addLogEntry = useCharacterStore((state) => state.addLogEntry);

    // FIX: Intercept the log action to update BOTH the local Toast and the global Chat
    const handleLogAction = (msg) => {
        // 1. Show Local Toast
        addLogEntry(msg);
        
        // 2. Send to Global Chat (if function provided)
        if (onLogAction) onLogAction(msg);
    };

    useEffect(() => {
        const interval = setInterval(() => {
            if (isDirty && character) {
                console.log("Auto-saving character...");
                if(onSave) onSave(character);
                markSaved();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [isDirty, character, onSave, markSaved]);

    if (!character) return <div className="text-slate-500 p-10 text-center animate-pulse">Loading Hero...</div>;

    return (
        <div className="h-full flex flex-col bg-slate-950 font-sans relative">
            
            <HeaderStats onDiceRoll={onDiceRoll} onLogAction={handleLogAction} />

            <div className="flex-1 overflow-y-auto custom-scroll bg-slate-900 relative">
                <div className="p-4 max-w-2xl mx-auto pb-28">
                    <div className="mb-6 text-center">
                        <h1 className="text-3xl fantasy-font text-white tracking-wide">{character.name}</h1>
                        <p className="text-amber-500 font-bold uppercase text-xs tracking-widest">{character.race} {character.class} (Lvl {character.level})</p>
                    </div>

                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {activeTab === 'actions' && <ActionsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} />}
                        {activeTab === 'skills' && <SkillsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} />}
                        {activeTab === 'spells' && <SpellsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} />}
                        {activeTab === 'inventory' && <InventoryTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} />}
                        {activeTab === 'features' && <FeaturesTab />}
                        {activeTab === 'bio' && <BioTab />}
                    </div>
                </div>
            </div>

            {/* This component watches the store and pops up when addLogEntry is called */}
            <RollToast />

            <div className="flex-none bg-slate-950 border-t border-slate-800 pb-safe px-2 pt-2 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] overflow-x-auto no-scrollbar">
                <div className="flex justify-between items-center min-w-max md:min-w-0 md:max-w-lg md:mx-auto gap-2 px-2">
                    <NavButton id="actions" icon="sword" label="Actions" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="spells" icon="sparkles" label="Spells" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="inventory" icon="backpack" label="Inv" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="skills" icon="dices" label="Skills" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="features" icon="medal" label="Feats" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="bio" icon="book-user" label="Bio" active={activeTab} onClick={setActiveTab} />
                </div>
            </div>
        </div>
    );
};

const NavButton = ({ id, icon, label, active, onClick }) => (
    <button 
        onClick={() => onClick(id)}
        className={`flex flex-col items-center p-2 rounded-xl transition-all w-14 shrink-0 group ${active === id ? 'bg-slate-900' : 'hover:bg-slate-900/50'}`}
    >
        <Icon name={icon} size={24} className={`transition-colors ${active === id ? 'text-amber-500 fill-amber-500/20' : 'text-slate-500 group-hover:text-slate-300'}`} />
        <span className={`text-[9px] font-bold mt-1 transition-colors truncate w-full text-center ${active === id ? 'text-amber-500' : 'text-slate-500 group-hover:text-slate-300'}`}>{label}</span>
    </button>
);

export default SheetContainer;