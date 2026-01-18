import React, { useState, useEffect } from 'react';
import HeaderStats from './HeaderStats';
import ActionsTab from './tabs/ActionsTab';
import SkillsTab from './tabs/SkillsTab';
import SpellsTab from './tabs/SpellsTab'; 
import InventoryTab from './tabs/InventoryTab';
import BioTab from './tabs/BioTab';
import FeaturesTab from './tabs/FeaturesTab';
import RollToast from './widgets/RollToast';
import { useCharacterStore } from '../../stores/useCharacterStore';
import Icon from '../Icon';

// UPDATE: Added isOwner to props (defaulting to true temporarily to prevent breakage)
const SheetContainer = ({ characterId, onSave, onDiceRoll, onLogAction, onBack, onPossess, isNpc, combatActive, onInitiative, onPlaceTemplate, isOwner = true }) => {
    const [activeTab, setActiveTab] = useState('actions');
    
    const character = useCharacterStore((state) => state.character);
    const isDirty = useCharacterStore((state) => state.isDirty);
    const markSaved = useCharacterStore((state) => state.markSaved);
    const addLogEntry = useCharacterStore((state) => state.addLogEntry);

    const handleLogAction = (msg) => {
        addLogEntry(msg);
        if (onLogAction) onLogAction(msg);
    };

    // --- FIX: FORCE SAVE ON EXIT ---
    const handleBack = () => {
        if (isDirty && character && onSave) {
            console.log("Saving changes before exit...", character.name);
            
            // MERGE the isNpc prop back into the character object to prevent data loss
            const safeCharacter = { 
                ...character, 
                isNpc: (character.isNpc || isNpc) 
            };
            
            onSave(safeCharacter); 
            markSaved(); 
        }
        if (onBack) onBack(); 
    };

    // Auto-save timer (keep this for backup)
    useEffect(() => {
        const interval = setInterval(() => {
            if (isDirty && character) {
                if(onSave) onSave(character);
                markSaved();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [isDirty, character, onSave, markSaved]);

    if (!character) return <div className="text-slate-500 p-10 text-center animate-pulse">Loading...</div>;

    return (
        <div className="h-full flex flex-col bg-slate-950 font-sans relative overflow-hidden">
            
            {/* Header gets handleBack instead of raw onBack */}
            <HeaderStats 
                onDiceRoll={onDiceRoll} 
                onLogAction={handleLogAction} 
                onBack={handleBack} 
                onPossess={onPossess} 
                isNpc={isNpc} 
                combatActive={combatActive}
                onInitiative={onInitiative}
                isOwner={isOwner}
            />

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scroll bg-slate-900 relative">
                <div className="p-4 max-w-2xl mx-auto pb-32"> 
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {activeTab === 'actions' && <ActionsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} isOwner={isOwner} />}
                        {activeTab === 'skills' && <SkillsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} isOwner={isOwner} />}
                        {activeTab === 'spells' && <SpellsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} onPlaceTemplate={onPlaceTemplate} isOwner={isOwner} />}
                        {activeTab === 'inventory' && <InventoryTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} isOwner={isOwner} />}
                        {activeTab === 'features' && <FeaturesTab isOwner={isOwner} />}
                        {activeTab === 'bio' && <BioTab isOwner={isOwner} />}
                    </div>
                </div>
            </div>

            <RollToast />

            {/* Navbar */}
            <div className="flex-none bg-slate-950 border-t border-slate-800 pb-safe px-2 pt-2 z-40 shadow-2xl">
                <div className="flex justify-between items-center max-w-md mx-auto gap-1">
                    <NavButton id="actions" icon="sword" label="Actions" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="spells" icon="sparkles" label="Spells" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="inventory" icon="backpack" label="Items" active={activeTab} onClick={setActiveTab} />
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
        className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ${active === id ? 'bg-slate-800 text-amber-500 translate-y-[-2px]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
    >
        <Icon name={icon} size={22} className={active === id ? 'fill-amber-500/20' : ''} />
        <span className="text-[10px] font-bold mt-1 leading-none">{label}</span>
    </button>
);

export default SheetContainer;