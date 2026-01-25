import React, { useState, useEffect } from 'react';
import HeaderStats from './HeaderStats';
// START CHANGE: Restore correct tab imports
import ActionsTab from './tabs/ActionsTab';
import SkillsTab from './tabs/SkillsTab';
import SpellsTab from './tabs/SpellsTab';
import InventoryTab from './tabs/InventoryTab';
import BioTab from './tabs/BioTab';
import FeaturesTab from './tabs/FeaturesTab';
import DmNotesTab from './tabs/DmNotesTab';
// END CHANGE
import RollToast from './widgets/RollToast';
import { useCharacterStore } from '../../stores/useCharacterStore';
import Icon from '../Icon';

// START CHANGE: Add 'data' to props definition
const SheetContainer = ({ characterId, data, onSave, onDiceRoll, onLogAction, onBack, onPossess, isNpc, combatActive, onInitiative, onPlaceTemplate, isOwner = true, role }) => {
// END CHANGE
    const [activeTab, setActiveTab] = useState('actions');
    
    const character = useCharacterStore((state) => state.character);
    const isDirty = useCharacterStore((state) => state.isDirty);
    const markSaved = useCharacterStore((state) => state.markSaved);
    const addLogEntry = useCharacterStore((state) => state.addLogEntry);

    // START CHANGE: Hot-Swap Effect
    const loadCharacter = useCharacterStore((state) => state.loadCharacter);

    useEffect(() => {
        // If we have an ID and Data, find the character and load it into the store
        if (characterId && data) {
            const allChars = [...(data.players || []), ...(data.npcs || [])];
            const target = allChars.find(c => c.id === characterId);
            if (target) loadCharacter(target);
        }
    }, [characterId, data]);
    // END CHANGE

    const handleLogAction = (msg) => {
        addLogEntry(msg);
        if (onLogAction) onLogAction(msg);
    };

    const handleBack = () => {
        if (isDirty && character && onSave) {
            const safeCharacter = { ...character, isNpc: (character.isNpc || isNpc) };
            onSave(safeCharacter); 
            markSaved(); 
        }
        if (onBack) onBack(); 
    };

    // Auto-save
    useEffect(() => {
        const interval = setInterval(() => {
            if (isDirty && character && onSave) {
                onSave(character);
                markSaved();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [isDirty, character, onSave, markSaved]);

    if (!character) return <div className="text-slate-500 p-10 text-center animate-pulse">Loading Character...</div>;

    return (
        <div className="h-[100dvh] flex flex-col bg-slate-950 font-sans relative overflow-hidden pt-[env(safe-area-inset-top)]">
            
            {/* Header */}
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

            {/* --- VISUAL DEBUGGER (Remove this once fixed) --- */}
            {/* This tells us if App.jsx is actually passing the role correctly */}
            <div className="bg-slate-900 border-b border-slate-800 text-[10px] py-1 text-center flex justify-center gap-4">
                <span className={role === 'dm' ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                    ROLE: {role ? role.toUpperCase() : "UNDEFINED (Check App.jsx)"}
                </span>
                <span className="text-slate-500">
                    TAB: {activeTab.toUpperCase()}
                </span>
            </div>
            {/* ------------------------------------------------ */}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scroll bg-slate-900 relative">
                <div className="p-4 max-w-2xl mx-auto pb-32"> 
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        
                        {activeTab === 'actions' && <ActionsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} isOwner={isOwner} />}
                        
                        {/* THIS IS THE CRITICAL LINE FOR SKILLS */}
                        {activeTab === 'skills' && <SkillsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} isOwner={isOwner} />}
                        
                        {activeTab === 'spells' && <SpellsTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} onPlaceTemplate={onPlaceTemplate} isOwner={isOwner} />}
                        {activeTab === 'inventory' && <InventoryTab onDiceRoll={onDiceRoll} onLogAction={handleLogAction} isOwner={isOwner} />}
                        {activeTab === 'features' && <FeaturesTab isOwner={isOwner} />}
                        {activeTab === 'bio' && <BioTab isOwner={isOwner} />}
                        
                        {/* DM NOTES LOGIC */}
                        {activeTab === 'dm-notes' && role === 'dm' && <DmNotesTab />}
                        
                    </div>
                </div>
            </div>

            <RollToast />

            {/* Navbar */}
            <div className="flex-none bg-slate-950 border-t border-slate-800 px-2 pt-2 z-40 shadow-2xl pb-[env(safe-area-inset-bottom)]">
                <div className="flex justify-between items-center max-w-md mx-auto gap-1">
                    <NavButton id="actions" icon="sword" label="Actions" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="spells" icon="sparkles" label="Spells" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="inventory" icon="backpack" label="Items" active={activeTab} onClick={setActiveTab} />
                    
                    {/* SKILLS BUTTON */}
                    <NavButton id="skills" icon="dices" label="Skills" active={activeTab} onClick={setActiveTab} />
                    
                    <NavButton id="features" icon="medal" label="Feats" active={activeTab} onClick={setActiveTab} />
                    <NavButton id="bio" icon="book-user" label="Bio" active={activeTab} onClick={setActiveTab} />
                    
                    {/* DM BUTTON (Only shows if role is 'dm') */}
                    {role === 'dm' && (
                        <NavButton 
                            id="dm-notes" 
                            icon="eye-off" 
                            label="DM" 
                            active={activeTab} 
                            onClick={setActiveTab} 
                            className="text-purple-500 hover:text-purple-300"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

const NavButton = ({ id, icon, label, active, onClick, className = "" }) => (
    <button 
        onClick={() => onClick(id)}
        className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ${active === id ? 'bg-slate-800 text-amber-500 translate-y-[-2px]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'} ${className}`}
    >
        <Icon name={icon} size={22} className={active === id ? 'fill-amber-500/20' : ''} />
        <span className="text-[10px] font-bold mt-1 leading-none">{label}</span>
    </button>
);

export default SheetContainer;