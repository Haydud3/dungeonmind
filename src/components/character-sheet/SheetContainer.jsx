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
import RollToast from './widgets/RollToast';

function SheetContainer({ character, onSave, onDiceRoll, diceLog, onLogAction, onBack, role, isNpc = false, onOpenModelPicker, data, isOwner: isOwnerProp, onOpenDiceTray, initialTab }) {
  const { loadCharacter, updateCharacter } = useCharacterStore();
  const isDirty = useCharacterStore((state) => state.isDirty);
  const storeCharacter = useCharacterStore((state) => state.character);
  const markSaved = useCharacterStore((state) => state.markSaved);
  const [activeTab, setActiveTab] = useState(initialTab || 'actions');

  useEffect(() => {
      if (initialTab) {
          setActiveTab(initialTab);
      }
  }, [initialTab]);

  // Load the character into the store whenever the character prop changes
  useEffect(() => {
    if (character) {
      loadCharacter(character);
    }
  }, [character, loadCharacter]);

  // Add inside SheetContainer function before the return:
  useEffect(() => {
      console.log("SheetContainer: Character Data Loaded:", character);
  }, [character]);

  useEffect(() => {
      if (isDirty && storeCharacter && onSave) {
          onSave(storeCharacter);
          markSaved();
      }
  }, [isDirty, storeCharacter, onSave, markSaved]);

  // Determine if the current user is the owner of this character
  // This logic needs to be robust, considering both player characters and NPCs
  const isOwner = isOwnerProp !== undefined ? isOwnerProp : (role === 'dm' || 
    (data?.user?.uid && (
      (isNpc && character.ownerId === data.user.uid) || 
      (!isNpc && (character.ownerId === data.user.uid || data.campaign?.assignments?.[data.user.uid] === character.id))
    )));

  if (!character || !character.name) {
    return (
      <div className="p-4 text-white text-center">
        <p>No character selected or loaded.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 relative">
      <HeaderStats 
        character={character}
        onDiceRoll={onDiceRoll} 
        onLogAction={onLogAction} 
        onBack={onBack} 
        role={role}
        onOpenModelPicker={onOpenModelPicker}
        onOpenDiceTray={onOpenDiceTray}
      />

      {/* Make sure RollToast is imported and placed here, or in App.jsx */}
      <RollToast />

      {/* Tabs Navigation */}
      <div className="flex-none bg-slate-900 border-t border-b border-slate-800 shadow-inner z-20">
        <div className="flex justify-around text-sm font-bold text-slate-400">
          <TabButton name="actions" activeTab={activeTab} setActiveTab={setActiveTab} icon="sword" label="Actions" />
          <TabButton name="spells" activeTab={activeTab} setActiveTab={setActiveTab} icon="sparkles" label="Spells" />
          <TabButton name="skills" activeTab={activeTab} setActiveTab={setActiveTab} icon="target" label="Skills" />
          <TabButton name="inventory" activeTab={activeTab} setActiveTab={setActiveTab} icon="backpack" label="Inventory" />
          <TabButton name="features" activeTab={activeTab} setActiveTab={setActiveTab} icon="scroll-text" label="Features" />
          <TabButton name="bio" activeTab={activeTab} setActiveTab={setActiveTab} icon="user" label="Bio" />
          {role === 'dm' && <TabButton name="dmNotes" activeTab={activeTab} setActiveTab={setActiveTab} icon="eye-off" label="DM Notes" />}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scroll p-4">
        {activeTab === 'actions' && <ActionsTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner} />}
        {activeTab === 'spells' && <SpellsTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner} />}
        {activeTab === 'skills' && <SkillsTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} />}
        {activeTab === 'inventory' && <InventoryTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner} />}
        {activeTab === 'features' && <FeaturesTab onDiceRoll={onDiceRoll} onLogAction={onLogAction} isOwner={isOwner} />}
        {activeTab === 'bio' && <BioTab onOpenModelPicker={onOpenModelPicker} />}
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