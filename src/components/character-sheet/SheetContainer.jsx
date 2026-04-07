import React, { useState, useEffect, useRef } from 'react';
import { useCharacterStore } from '../../stores/useCharacterStore';
import Icon from '../Icon';

// Import all the tab components
import HeaderStats from './HeaderStats';
import BioTab from './tabs/BioTab';
import SkillsTab from './tabs/SkillsTab';
import FeaturesTab from './tabs/FeaturesTab';
import ActionsTab from './tabs/ActionsTab';
import InventoryTab from './tabs/InventoryTab'; 
import SpellsTab from './tabs/SpellsTab';
import DmNotesTab from './tabs/DmNotesTab';

function SheetContainer({ character, onSave, onDiceRoll, diceLog, onLogAction, onBack, role, isNpc = false, onOpenModelPicker, data }) {
  const { loadCharacter, updateCharacter } = useCharacterStore();
  const [activeTab, setActiveTab] = useState('bio');

  // Load the character into the store whenever the character prop changes
  useEffect(() => {
    if (character) {
      loadCharacter(character);
    }
  }, [character, loadCharacter]);

  // Determine if the current user is the owner of this character
  // This logic needs to be robust, considering both player characters and NPCs
  const isOwner = useRef(false);
  useEffect(() => {
    if (character && data?.user?.uid) {
      if (role === 'dm') {
        isOwner.current = true; // DM is always considered the owner for editing purposes
      } else if (isNpc) {
        isOwner.current = (character.ownerId === data.user.uid);
      } else { // Player character
        isOwner.current = (character.ownerId === data.user.uid) || (data.campaign?.assignments?.[data.user.uid] === character.id);
      }
    } else {
      isOwner.current = false;
    }
  }, [character, data, role, isNpc]);

  if (!character || !character.name) {
    return (
      <div className="p-4 text-white text-center">
        <p>No character selected or loaded.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <HeaderStats 
        onDiceRoll={onDiceRoll} 
        onLogAction={onLogAction} 
        onBack={onBack} 
        isNpc={isNpc} 
        role={role}
      />

      {/* Tabs Navigation */}
      <div className="flex-none bg-slate-900 border-t border-b border-slate-800 shadow-inner z-20">
        <div className="flex justify-around text-sm font-bold text-slate-400">
          <TabButton name="bio" activeTab={activeTab} setActiveTab={setActiveTab} icon="user" label="Bio" />
          <TabButton name="skills" activeTab={activeTab} setActiveTab={setActiveTab} icon="target" label="Skills" />
          <TabButton name="inventory" activeTab={activeTab} setActiveTab={setActiveTab} icon="backpack" label="Inventory" />
          <TabButton name="actions" activeTab={activeTab} setActiveTab={setActiveTab} icon="sword" label="Actions" />
          <TabButton name="spells" activeTab={activeTab} setActiveTab={setActiveTab} icon="sparkles" label="Spells" />
          <TabButton name="features" activeTab={activeTab} setActiveTab={setActiveTab} icon="scroll-text" label="Features" />
          {role === 'dm' && <TabButton name="dmNotes" activeTab={activeTab} setActiveTab={setActiveTab} icon="eye-off" label="DM Notes" />}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scroll p-4">
        {activeTab === 'bio' && <BioTab onOpenModelPicker={onOpenModelPicker} />}
        {activeTab === 'skills' && <SkillsTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} />}
        {activeTab === 'actions' && <ActionsTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner.current} />}
        {activeTab === 'inventory' && <InventoryTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner.current} />}
        {activeTab === 'spells' && <SpellsTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner.current} />}
        {activeTab === 'features' && <FeaturesTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner.current} />}
        {activeTab === 'dmNotes' && role === 'dm' && <DmNotesTab />}
      </div>
    </div>
  );
}

export default SheetContainer;

// Helper component for tab buttons
const TabButton = ({ name, activeTab, setActiveTab, icon, label }) => (
  <button
    onClick={() => setActiveTab(name)}
    className={`flex-1 py-3 px-2 flex items-center justify-center gap-2 transition-colors relative group
      ${activeTab === name ? 'text-amber-500 bg-slate-800/50 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/20'}`}
  >
    <Icon name={icon} size={18} />
    <span className="hidden md:inline">{label}</span>
    {/* Underline effect */}
    <span className={`absolute bottom-0 left-0 w-full h-0.5 bg-amber-500 transform transition-transform duration-300 ${activeTab === name ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50'}`}></span>
  </button>
);