import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

function SheetContainer({ 
    character, 
    onSave, 
    onDiceRoll, 
    diceLog, 
    onLogAction, 
    onBack, 
    role, 
    isNpc = false, 
    onOpenModelPicker, 
    data, 
    isOwner: isOwnerProp, 
    onOpenDiceTray, 
    initialTab 
}) {
    const { loadCharacter } = useCharacterStore();
    const isDirty = useCharacterStore((state) => state.isDirty);
    const storeCharacter = useCharacterStore((state) => state.character);
    const markSaved = useCharacterStore((state) => state.markSaved);
    const [activeTab, setActiveTab] = useState(initialTab || 'actions');
    const [advMode, setAdvMode] = useState('normal'); // 'normal', 'adv', 'dis'

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

    useEffect(() => {
        if (isDirty && storeCharacter && onSave) {
            onSave(storeCharacter);
            markSaved();
        }
    }, [isDirty, storeCharacter, onSave, markSaved]);

    // Determine if the current user is the owner of this character
    const isOwner = isOwnerProp !== undefined ? isOwnerProp : (role === 'dm' || 
        (data?.user?.uid && (
            (isNpc && character.ownerId === data.user.uid) || 
            (!isNpc && (character.ownerId === data.user.uid || data.campaign?.assignments?.[data.user.uid] === character.id))
        )));

    // Wrapped Dice Roll to handle Global Advantage/Disadvantage
    const handleWrappedDiceRoll = useCallback(async (formula, options = {}) => {
        if (!onDiceRoll) return;
        
        let finalFormula = String(formula);
        let finalAlias = options.alias || 'Roll';
        let hasDice = false;
        
        if (finalFormula.includes('d') && options.actionType !== 'damage') {
            hasDice = true;
        }

        if (hasDice && advMode !== 'normal') {
            if (advMode === 'adv') {
                finalFormula = finalFormula.replace(/(\d*)d(\d+)/g, (match, p1, p2) => {
                    const count = parseInt(p1, 10) || 1;
                    return `${Math.max(2, count + 1)}d${p2}kh${count}`;
                });
                finalAlias = `${finalAlias} (Advantage)`;
            } else if (advMode === 'dis') {
                finalFormula = finalFormula.replace(/(\d*)d(\d+)/g, (match, p1, p2) => {
                    const count = parseInt(p1, 10) || 1;
                    return `${Math.max(2, count + 1)}d${p2}kl${count}`;
                });
                finalAlias = `${finalAlias} (Disadvantage)`;
            }
        }

        const result = await onDiceRoll(finalFormula, { 
            ...options, 
            alias: finalAlias, 
            advMode: advMode !== 'normal' ? advMode : undefined 
        });
        
        if (hasDice) setAdvMode('normal'); // Reset after roll
        
        return result;
    }, [onDiceRoll, advMode]);

    // Dynamic Tab Badge Counts
    const counts = useMemo(() => {
        const char = storeCharacter || character || {};
        return {
            actions: (char.inventory?.filter(i => i.equipped && i.combat)?.length || 0) + (char.customActions?.length || 0),
            spells: char.spells?.length || 0,
            inventory: char.inventory?.length || 0,
            features: char.features?.length || 0
        };
    }, [storeCharacter, character]);

    if (!character || !character.name) {
        return (
            <div className="p-8 text-slate-400 text-center flex flex-col items-center justify-center h-full bg-slate-950">
                <Icon name="user-x" size={32} className="text-slate-600 mb-2" />
                <p className="text-sm font-semibold">No character selected or loaded.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 relative select-none">
            <HeaderStats 
                character={character}
                onDiceRoll={handleWrappedDiceRoll} 
                onLogAction={onLogAction} 
                onBack={onBack} 
                role={role}
                onOpenModelPicker={onOpenModelPicker}
                onOpenDiceTray={onOpenDiceTray}
            />

            <RollToast />

            {/* Global Roll Advantage / Disadvantage Segmented Bar */}
            <div className="flex bg-slate-950 border-b border-slate-800/80 px-3 py-2 shrink-0 z-10 relative">
                <div className="flex w-full max-w-sm mx-auto bg-slate-900 border border-slate-800 rounded-xl p-0.5 shadow-inner">
                    <button 
                        type="button"
                        onClick={() => setAdvMode('dis')} 
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            advMode === 'dis' 
                                ? 'bg-rose-950 text-rose-200 border border-rose-600/50 shadow-sm' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <span>DIS</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => setAdvMode('normal')} 
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            advMode === 'normal' 
                                ? 'bg-slate-800 text-white shadow-sm' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <span>NORM</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => setAdvMode('adv')} 
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            advMode === 'adv' 
                                ? 'bg-emerald-950 text-emerald-200 border border-emerald-600/50 shadow-sm' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <span>ADV</span>
                    </button>
                </div>
            </div>

            {/* Modern Tab Navigation Ribbon */}
            <div className="flex-none bg-slate-950 border-b border-slate-800/90 shadow-sm z-20">
                <div className="flex overflow-x-auto no-scrollbar snap-x text-xs font-bold text-slate-400 justify-start sm:justify-around px-1">
                    <TabButton 
                        name="actions" 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        icon="sword" 
                        label="Actions" 
                        badge={counts.actions > 0 ? counts.actions : null}
                    />
                    <TabButton 
                        name="spells" 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        icon="sparkles" 
                        label="Spells" 
                        badge={counts.spells > 0 ? counts.spells : null}
                    />
                    <TabButton 
                        name="skills" 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        icon="target" 
                        label="Skills" 
                    />
                    <TabButton 
                        name="inventory" 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        icon="backpack" 
                        label="Inventory" 
                        badge={counts.inventory > 0 ? counts.inventory : null}
                    />
                    <TabButton 
                        name="features" 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        icon="scroll-text" 
                        label="Features" 
                        badge={counts.features > 0 ? counts.features : null}
                    />
                    <TabButton 
                        name="bio" 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        icon="user" 
                        label="Bio" 
                    />
                    {role === 'dm' && (
                        <TabButton 
                            name="dmNotes" 
                            activeTab={activeTab} 
                            setActiveTab={setActiveTab} 
                            icon="eye-off" 
                            label="DM Notes" 
                        />
                    )}
                </div>
            </div>

            {/* Tab Content Panel */}
            <div className="flex-1 overflow-y-auto custom-scroll p-3 sm:p-4 bg-slate-950/60">
                {activeTab === 'actions' && (
                    <ActionsTab 
                        onDiceRoll={handleWrappedDiceRoll} 
                        onLogAction={onLogAction} 
                        isOwner={isOwner} 
                    />
                )}
                {activeTab === 'spells' && (
                    <SpellsTab 
                        onDiceRoll={handleWrappedDiceRoll} 
                        onLogAction={onLogAction} 
                        isOwner={isOwner} 
                    />
                )}
                {activeTab === 'skills' && (
                    <SkillsTab 
                        onDiceRoll={handleWrappedDiceRoll} 
                        onLogAction={onLogAction} 
                    />
                )}
                {activeTab === 'inventory' && (
                    <InventoryTab 
                        onDiceRoll={handleWrappedDiceRoll} 
                        onLogAction={onLogAction} 
                        isOwner={isOwner} 
                    />
                )}
                {activeTab === 'features' && (
                    <FeaturesTab 
                        onDiceRoll={handleWrappedDiceRoll} 
                        onLogAction={onLogAction} 
                        isOwner={isOwner} 
                    />
                )}
                {activeTab === 'bio' && (
                    <BioTab onOpenModelPicker={onOpenModelPicker} />
                )}
                {activeTab === 'dmNotes' && role === 'dm' && (
                    <DmNotesTab />
                )}
            </div>
        </div>
    );
}

export default SheetContainer;

// Helper component for tab buttons
const TabButton = ({ name, activeTab, setActiveTab, icon, label, badge = null }) => {
    const isActive = activeTab === name;
    return (
        <button
            type="button"
            onClick={() => setActiveTab(name)}
            className={`flex-1 shrink-0 min-w-[75px] sm:min-w-0 snap-center py-2.5 px-2 flex items-center justify-center gap-1.5 transition-all relative group cursor-pointer ${
                isActive 
                    ? 'text-amber-300 font-bold bg-amber-500/10 border-b-2 border-amber-400' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
        >
            <Icon name={icon} size={15} className={isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-400'} />
            <span className="truncate">{label}</span>
            {badge !== null && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-800 text-slate-400'
                }`}>
                    {badge}
                </span>
            )}
        </button>
    );
};