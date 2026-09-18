import React, { useState, useRef, useEffect, useMemo } from 'react';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { useDialog } from './DialogProvider';
import SheetContainer from './character-sheet/SheetContainer'; 
import { useCharacterStore } from '../stores/useCharacterStore';
import DndBeyondImporter from './character-sheet/DndBeyondImporter';
import { parseDndBeyondJson } from './character-sheet/dndBeyondParser.js';
import CharacterBuilder from '../utils/CharacterBuilder';
import { enrichCharacter } from '../utils/srdEnricher.js';
import { fetchDndBeyondCharacter } from '../utils/dndBeyondService.js';
import { retrieveChunkedMap, storeChunkedMap, fileToBase64 } from '../utils/storageUtils';
import { searchGithubModels } from '../utils/miniManifest';
import { Client } from "@gradio/client";
import PartyPassivesModal from './PartyPassivesModal';
import PartyCreationHubModal from './PartyCreationHubModal';

import * as fb from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { createGroupRollPayload } from '../utils/groupRollUtils';

const ALL_CONDITIONS = [
    "Blinded", "Charmed", "Deafened", "Frightened", "Grappled", 
    "Incapacitated", "Invisible", "Paralyzed", "Petrified", 
    "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion"
];

export const PartyView = ({ 
    data, 
    role, 
    setView, 
    user, 
    aiHelper, 
    onDiceRoll, 
    diceLog, 
    onLogAction, 
    edition, 
    apiKey, 
    onOpenDiceTray, 
    initialAction, 
    onClearInitialAction,
    generatePlayer 
}) => {
    const { updateCampaign, gameParams, sendMessage } = useNewCampaign();
    const dialog = useDialog();
    const toast = useToast();
    
    const playersList = data?.players || []; 

    const [viewMode, setViewMode] = useState(() => localStorage.getItem('dm_party_view_mode') || 'grid');
    useEffect(() => {
        localStorage.setItem('dm_party_view_mode', viewMode);
    }, [viewMode]);

    // Modals
    const [showCreationHub, setShowCreationHub] = useState(false);
    const [showPassivesModal, setShowPassivesModal] = useState(false);
    const [showGroupRollDropdown, setShowGroupRollDropdown] = useState(false);
    const [showDndBeyondImport, setShowDndBeyondImport] = useState(initialAction === 'dndbeyond');
    const [quickActorModal, setQuickActorModal] = useState(null);
    const [showBuilder, setShowBuilder] = useState(initialAction === 'builder');
    const [refreshCharacter, setRefreshCharacter] = useState(null);

    const triggerQuickGroupRoll = async (rollType, category = 'skill') => {
        if (playersList.length === 0) {
            toast("No heroes in party to roll", "warning");
            return;
        }
        const payload = createGroupRollPayload({
            rollType,
            category,
            dc: null,
            players: playersList,
            assignments: data?.assignments || {},
            user,
            role
        });
        try {
            if (sendMessage) {
                await sendMessage({
                    type: 'group-roll',
                    role: 'group-roll',
                    senderId: user?.uid || 'dm',
                    senderName: user?.displayName || (role === 'dm' ? 'Dungeon Master' : 'Player'),
                    timestamp: Date.now(),
                    content: JSON.stringify(payload)
                });
                toast(`🎲 Group ${rollType} prompt sent to chat!`, "success");
            }
        } catch (e) {
            console.error(e);
            toast("Failed to dispatch group roll", "error");
        }
    };

    // Search, Filter, Sort
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all' | 'wounded' | 'down' | 'inspired' | 'casters' | 'online'
    const [sortBy, setSortBy] = useState('level'); // 'level' | 'hp_low' | 'name' | 'ac' | 'perception'

    // Inline HP adjust state: { [charId]: { delta: '', show: bool } }
    const [hpAdjustState, setHpAdjustState] = useState({});

    useEffect(() => {
        if (initialAction === 'dndbeyond') {
            setShowDndBeyondImport(true);
            onClearInitialAction?.();
        } else if (initialAction === 'builder') {
            setShowBuilder(true);
            onClearInitialAction?.();
        }
    }, [initialAction, onClearInitialAction]);

    const [viewingCharacterId, setViewingCharacterId] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState("Initializing...");

    const [characterForModelSelection, setCharacterForModelSelection] = useState(null);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [miniSearchQuery, setMiniSearchQuery] = useState("");
    const [isSearchingMinis, setIsSearchingMinis] = useState(false);
    const [isForging3D, setIsForging3D] = useState(false);
    const [forge3DStatus, setForge3DStatus] = useState("");

    // Stale state fix
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    const viewingCharacter = useMemo(() => {
        if (!viewingCharacterId) return null;
        return (data?.players || []).find(p => String(p.id) === String(viewingCharacterId));
    }, [viewingCharacterId, data?.players]);

    const isOwnerOf = (char) => {
        if (!char) return false;
        const myAssignedCharId = data?.assignments?.[user?.uid];
        return String(char.ownerId) === String(user?.uid) || (myAssignedCharId && String(char.id) === String(myAssignedCharId));
    };

    // Helper functions for stats
    const getMod = (score) => Math.floor(((score || 10) - 10) / 2);

    const getProfBonus = (p) => {
        if (p.profBonus) return p.profBonus;
        const lvl = parseInt(p.level, 10) || 1;
        return Math.floor((lvl - 1) / 4) + 2;
    };

    const getHeroHp = (p) => {
        const cur = typeof p.hp === 'object' ? (p.hp?.current ?? p.hp?.max ?? 20) : (p.hp || 20);
        const max = typeof p.hp === 'object' ? (p.hp?.max ?? 20) : (p.maxHp || 20);
        const temp = typeof p.hp === 'object' ? (p.hp?.temp || 0) : 0;
        const percent = Math.max(0, Math.min(100, Math.round((cur / (max || 1)) * 100)));
        return { cur, max, temp, percent };
    };

    const getHeroAc = (p) => {
        if (typeof p.ac === 'object' && p.ac !== null) return p.ac.value || 10;
        return parseInt(p.ac, 10) || 10;
    };

    const getHeroPassive = (p, skillName, statKey) => {
        const stats = p.stats || {};
        const mod = p.modifiers?.[statKey] ?? getMod(stats[statKey]);
        const prof = getProfBonus(p);
        const isProf = p.skills?.[skillName] || p.skills?.[skillName.toLowerCase()];
        return 10 + mod + (isProf ? prof : 0);
    };

    const isHeroOnline = (ownerId) => {
        if (!ownerId || !data?.activeUsers) return false;
        return !!data.activeUsers[ownerId];
    };

    const getPlayerDisplayName = (ownerId) => {
        if (!ownerId) return 'Unassigned';
        const raw = data?.activeUsers?.[ownerId];
        if (!raw) return 'Player';
        const name = typeof raw === 'object' ? raw?.displayName : raw;
        return name?.includes('@') ? name.split('@')[0] : (name || 'Player');
    };

    // Party Telemetry Calculations
    const partyTelemetry = useMemo(() => {
        let totalCur = 0;
        let totalMax = 0;
        let totalLevels = 0;
        let inspiredTotal = 0;
        let totalGold = 0;

        playersList.forEach(p => {
            const { cur, max } = getHeroHp(p);
            totalCur += cur;
            totalMax += max;
            totalLevels += parseInt(p.level, 10) || 1;
            if (p.inspiration) inspiredTotal++;

            // Currency calculation
            if (p.currency) {
                const gp = parseFloat(p.currency.gp) || 0;
                const pp = (parseFloat(p.currency.pp) || 0) * 10;
                const sp = (parseFloat(p.currency.sp) || 0) * 0.1;
                const cp = (parseFloat(p.currency.cp) || 0) * 0.01;
                totalGold += Math.round(gp + pp + sp + cp);
            }
        });

        const count = playersList.length || 1;
        const avgLevel = (totalLevels / count).toFixed(1);
        const vitalityPercent = totalMax > 0 ? Math.round((totalCur / totalMax) * 100) : 100;

        return {
            totalHeroes: playersList.length,
            avgLevel,
            totalCur,
            totalMax,
            vitalityPercent,
            inspiredTotal,
            totalGold
        };
    }, [playersList]);

    // Filtered & Sorted Hero List
    const filteredPlayers = useMemo(() => {
        let list = [...playersList];

        // Search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => 
                p.name?.toLowerCase().includes(q) ||
                p.race?.toLowerCase().includes(q) ||
                p.class?.toLowerCase().includes(q) ||
                getPlayerDisplayName(p.ownerId).toLowerCase().includes(q)
            );
        }

        // Filter chips
        if (filterType === 'wounded') {
            list = list.filter(p => {
                const { percent } = getHeroHp(p);
                return percent < 50 && percent > 0;
            });
        } else if (filterType === 'down') {
            list = list.filter(p => getHeroHp(p).cur <= 0);
        } else if (filterType === 'inspired') {
            list = list.filter(p => !!p.inspiration);
        } else if (filterType === 'casters') {
            list = list.filter(p => (Array.isArray(p.spells) && p.spells.length > 0) || ['Wizard', 'Sorcerer', 'Cleric', 'Druid', 'Bard', 'Warlock'].some(c => p.class?.includes(c)));
        } else if (filterType === 'online') {
            list = list.filter(p => isHeroOnline(p.ownerId));
        }

        // Sorting
        list.sort((a, b) => {
            if (sortBy === 'level') {
                return (parseInt(b.level, 10) || 1) - (parseInt(a.level, 10) || 1);
            }
            if (sortBy === 'hp_low') {
                return getHeroHp(a).percent - getHeroHp(b).percent;
            }
            if (sortBy === 'name') {
                return (a.name || '').localeCompare(b.name || '');
            }
            if (sortBy === 'ac') {
                return getHeroAc(b) - getHeroAc(a);
            }
            if (sortBy === 'perception') {
                return getHeroPassive(b, 'Perception', 'wis') - getHeroPassive(a, 'Perception', 'wis');
            }
            return 0;
        });

        return list;
    }, [playersList, searchQuery, filterType, sortBy, data?.activeUsers]);

    // Short Rest
    const handlePartyShortRest = async () => {
        const confirmed = await dialog.confirm("Take a Short Rest for the entire party? This resets short-rest abilities (Warlock spell slots, Action Surge, Ki, etc.).");
        if (!confirmed) return;

        const updated = playersList.map(p => {
            const clean = JSON.parse(JSON.stringify(p));
            // Reset warlock slots if present
            if (clean.spellSlots && clean.class?.toLowerCase().includes('warlock')) {
                Object.keys(clean.spellSlots).forEach(lvl => {
                    clean.spellSlots[lvl].current = clean.spellSlots[lvl].max;
                });
            }
            return clean;
        });

        updateCampaign({ players: updated });
        onLogAction?.("The party completed a Short Rest. (Hit Dice & short-rest features refreshed)");
        toast("The party completed a Short Rest.", "success");
    };

    // Long Rest
    const handlePartyLongRest = async () => {
        const confirmed = await dialog.confirm("Take a Long Rest for the entire party? This restores all heroes to 100% HP, resets all spell slots to maximum, and clears death saves & temporary unconsciousness.");
        if (!confirmed) return;

        const updated = playersList.map(p => {
            const clean = JSON.parse(JSON.stringify(p));
            const max = typeof clean.hp === 'object' ? (clean.hp?.max || 20) : (clean.maxHp || 20);
            
            if (typeof clean.hp === 'object') {
                clean.hp.current = max;
                clean.hp.temp = 0;
            } else {
                clean.hp = max;
            }

            // Reset all spell slots
            if (clean.spellSlots && typeof clean.spellSlots === 'object') {
                Object.keys(clean.spellSlots).forEach(lvl => {
                    if (clean.spellSlots[lvl]) {
                        clean.spellSlots[lvl].current = clean.spellSlots[lvl].max;
                    }
                });
            }

            // Reset death saves
            clean.deathSaves = { successes: 0, failures: 0 };

            // Clear unconscious condition if downed
            if (Array.isArray(clean.conditions)) {
                clean.conditions = clean.conditions.filter(c => c !== 'Unconscious');
            }

            return clean;
        });

        updateCampaign({ players: updated });
        onLogAction?.("The party completed a Long Rest. All heroes restored to full HP and spell slots.");
        toast("The party completed a Long Rest! All heroes restored.", "success");
    };

    // Heroic Inspiration Toggle
    const handleToggleInspiration = (hero, e) => {
        e?.stopPropagation?.();
        const nextState = !hero.inspiration;
        const updated = { ...hero, inspiration: nextState };
        handleSheetSave(updated);

        if (nextState) {
            toast(`${hero.name} received Heroic Inspiration! ⭐`, "success");
            onLogAction?.(`${hero.name} was granted Heroic Inspiration ⭐`);
        } else {
            toast(`${hero.name} spent Heroic Inspiration.`, "info");
            onLogAction?.(`${hero.name} spent Heroic Inspiration.`);
        }
    };

    // Quick HP Adjustments (Damage, Heal, Temp HP)
    const handleAdjustHp = (hero, amount, mode) => {
        const amt = parseInt(amount, 10);
        if (isNaN(amt) || amt <= 0) return;

        const { cur, max, temp } = getHeroHp(hero);
        let newCur = cur;
        let newTemp = temp;

        if (mode === 'damage') {
            let rem = amt;
            if (newTemp > 0) {
                if (rem <= newTemp) {
                    newTemp -= rem;
                    rem = 0;
                } else {
                    rem -= newTemp;
                    newTemp = 0;
                }
            }
            newCur = Math.max(0, newCur - rem);

            // Add unconscious condition if at 0 HP
            let conditions = Array.isArray(hero.conditions) ? [...hero.conditions] : [];
            if (newCur === 0 && !conditions.includes('Unconscious')) {
                conditions.push('Unconscious');
            }

            const updated = {
                ...hero,
                hp: typeof hero.hp === 'object' ? { ...hero.hp, current: newCur, temp: newTemp } : newCur,
                conditions
            };
            handleSheetSave(updated);
            onLogAction?.(`${hero.name} took ${amt} damage (HP: ${newCur}/${max})`);
            toast(`${hero.name} took ${amt} damage!`, "info");
        } else if (mode === 'heal') {
            newCur = Math.min(max, cur + amt);
            let conditions = Array.isArray(hero.conditions) ? [...hero.conditions] : [];
            if (cur === 0 && newCur > 0) {
                conditions = conditions.filter(c => c !== 'Unconscious');
            }
            const updated = {
                ...hero,
                hp: typeof hero.hp === 'object' ? { ...hero.hp, current: newCur } : newCur,
                conditions,
                deathSaves: { successes: 0, failures: 0 }
            };
            handleSheetSave(updated);
            onLogAction?.(`${hero.name} healed ${amt} HP (HP: ${newCur}/${max})`);
            toast(`${hero.name} healed ${amt} HP!`, "success");
        } else if (mode === 'temp') {
            const updated = {
                ...hero,
                hp: typeof hero.hp === 'object' ? { ...hero.hp, temp: amt } : hero.hp
            };
            handleSheetSave(updated);
            onLogAction?.(`${hero.name} gained ${amt} Temp HP`);
            toast(`${hero.name} gained ${amt} Temp HP!`, "info");
        }

        // Reset popover input
        setHpAdjustState(prev => ({
            ...prev,
            [hero.id]: { ...prev[hero.id], delta: '' }
        }));
    };

    // Death Saves Toggle
    const handleToggleDeathSave = (hero, type, index, e) => {
        e?.stopPropagation?.();
        const saves = hero.deathSaves || { successes: 0, failures: 0 };
        const currentCount = saves[type] || 0;
        const newCount = index < currentCount ? index : index + 1;

        const updated = {
            ...hero,
            deathSaves: { ...saves, [type]: newCount }
        };
        handleSheetSave(updated);
        onLogAction?.(`${hero.name} Death Save ${type}: ${newCount}/3`);
    };

    // Player Re-assignment
    const handleAssignPlayer = (hero, newOwnerId, e) => {
        e?.stopPropagation?.();
        const updated = { ...hero, ownerId: newOwnerId || null };
        handleSheetSave(updated);
        toast(`Assigned ${hero.name} to ${getPlayerDisplayName(newOwnerId)}`, "success");
    };

    // Sheet Save
    const handleSheetSave = async (updatedChar) => {
        const cleanChar = JSON.parse(JSON.stringify(updatedChar, (k, v) => v === undefined ? null : v));
        const currentData = dataRef.current;
        const newPlayers = (currentData.players || []).map(p => p.id === cleanChar.id ? cleanChar : p);
        updateCampaign({ players: newPlayers });
    };

    const handleCharacterClick = (p) => {
        if (role !== 'dm' && !isOwnerOf(p)) {
            toast("This character is private to their player and the DM.", "info");
            return;
        }
        openSheet(p);
    };

    const openSheet = (character) => {
        if (character.isSimple || character.noSheet) {
            setQuickActorModal({
                isOpen: true,
                category: 'pc',
                editId: character.id,
                name: character.name,
                image: character.image,
                size: character.size || 1,
                ownerId: character.ownerId || null
            });
            return;
        }
        useCharacterStore.getState().loadCharacter(character);
        setViewingCharacterId(character.id);
    };

    const handleDelete = async (id, e) => {
        e?.stopPropagation?.();
        const currentData = dataRef.current || {};
        const pList = currentData.players || [];
        const charToDelete = pList.find(p => p.id === id);
        
        if (!(await dialog.confirm(`Are you sure you want to delete ${charToDelete?.name || 'this character'}?`))) {
            return;
        }

        const newPlayers = pList.filter(p => p.id !== id);
        updateCampaign({ players: newPlayers });
        toast("Character deleted.", "info");
    };

    const handleRefreshDndBeyond = async (mode) => {
        if (!refreshCharacter?.dndBeyondId) return;
        setIsImporting(true);
        setImportStatus("Fetching from D&D Beyond...");
        try {
            const jsonData = await fetchDndBeyondCharacter(refreshCharacter.dndBeyondId);
            const parsedData = parseDndBeyondJson(jsonData);
            const enrichedChar = await enrichCharacter(parsedData);
            
            const currentData = dataRef.current || {};
            const pList = currentData.players || [];
            const existingIndex = pList.findIndex(p => String(p.id) === String(refreshCharacter.id));
            
            if (existingIndex !== -1) {
                const existing = pList[existingIndex];
                let cleanChar;
                
                if (mode === 'combine') {
                    cleanChar = JSON.parse(JSON.stringify({
                        ...enrichedChar,
                        id: existing.id,
                        ownerId: existing.ownerId,
                        image: existing.image || enrichedChar.image,
                        hp: existing.hp,
                        inventory: existing.inventory,
                        conditions: existing.conditions,
                        bio: { ...enrichedChar.bio, notes: existing.bio?.notes || enrichedChar.bio?.notes },
                        spellSlots: existing.spellSlots,
                        currency: existing.currency
                    }, (k, v) => v === undefined ? null : v));
                    toast(`Combined updates for ${cleanChar.name}`, "success");
                } else {
                    cleanChar = JSON.parse(JSON.stringify({
                        ...enrichedChar,
                        id: existing.id,
                        ownerId: existing.ownerId,
                        image: existing.image || enrichedChar.image,
                        bio: { ...enrichedChar.bio, notes: existing.bio?.notes || enrichedChar.bio?.notes }
                    }, (k, v) => v === undefined ? null : v));
                    toast(`Overwrote ${cleanChar.name} with fresh D&D Beyond data.`, "success");
                }
                
                const newPlayers = [...pList];
                newPlayers[existingIndex] = cleanChar;
                updateCampaign({ players: newPlayers });
            }
        } catch(err) {
            toast("Refresh failed: " + err.message, "error");
        }
        setRefreshCharacter(null);
        setIsImporting(false);
    };

    const handleSaveQuickHero = async ({ editId, name, image, size, ownerId }) => {
        const cleanName = (name || '').trim() || 'New Hero';
        const cleanImage = (image || '').trim();
        const cleanSize = Number(size) || 1;
        const cleanOwnerId = ownerId || null;

        const currentData = dataRef.current || {};
        const currentPlayers = currentData.players || [];

        if (editId) {
            const updatedPlayers = currentPlayers.map(p => String(p.id) === String(editId) ? {
                ...p,
                name: cleanName,
                image: cleanImage,
                size: cleanSize,
                ownerId: cleanOwnerId,
                isSimple: true,
                noSheet: true
            } : p);
            updateCampaign({ players: updatedPlayers });
        } else {
            const newChar = {
                id: `hero_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                name: cleanName,
                image: cleanImage,
                size: cleanSize,
                type: 'pc',
                hp: 20,
                maxHp: 20,
                ac: 10,
                speed: 30,
                ownerId: cleanOwnerId,
                isSimple: true,
                noSheet: true
            };
            updateCampaign({ players: [...currentPlayers, newChar] });
        }

        setQuickActorModal(null);
        toast(`Saved ${cleanName}`, "success");
    };

    const handleDeleteQuickHero = async (modalData) => {
        if (!modalData?.editId) return;
        if (!(await dialog.confirm(`Delete ${modalData.name || 'this hero'}?`))) return;
        const currentData = dataRef.current || {};
        const currentPlayers = (currentData.players || []).filter(p => String(p.id) !== String(modalData.editId));
        updateCampaign({ players: currentPlayers });
        setQuickActorModal(null);
        toast(`Deleted ${modalData.name || 'hero'}`, "info");
    };

    const handleNewCharacter = (newChar) => {
        const currentData = dataRef.current || {};
        const pList = currentData.players || [];
        const existingIndex = pList.findIndex(p => p.name === newChar.name);
        
        let finalChar;
        if (existingIndex !== -1) {
            const existing = pList[existingIndex];
            finalChar = {
                ...newChar,
                id: existing.id,
                image: existing.image || newChar.image,
                ownerId: existing.ownerId || user?.uid,
                bio: { ...newChar.bio, notes: existing.bio?.notes || newChar.bio?.notes } 
            };
        } else {
            finalChar = { 
                ...newChar, 
                id: Date.now(), 
                ownerId: user?.uid || "anon" 
            };
        }
        
        const cleanChar = JSON.parse(JSON.stringify(finalChar, (k, v) => v === undefined ? null : v));
        let newPlayers;
        if (existingIndex !== -1) {
            newPlayers = [...pList];
            newPlayers[existingIndex] = cleanChar;
            toast(`Updated existing hero: ${cleanChar.name}`, "success");
        } else {
            newPlayers = [...pList, cleanChar];
        }
        updateCampaign({ players: newPlayers });
        
        // Save to Hub for the user
        if (user && user.uid) {
            try {
                const charRef = collection(fb.db, 'users', user.uid, 'characters');
                const { id, ...charWithoutId } = cleanChar;
                const campName = data?.campaign?.genesis?.campaignName || data?.campaignName || "Unknown Campaign";
                
                const safeHubChar = { 
                    ...charWithoutId, 
                    dateCreated: Date.now(),
                    campaignId: gameParams?.code || data?.id || null,
                    campaignName: campName
                };
                
                addDoc(charRef, safeHubChar)
                    .then(() => toast("Character saved to your personal Hub!", "success"))
                    .catch(e => console.error(e));
            } catch(e) {
                console.error(e);
            }
        }
    };

    const handleMiniSearch = async (query, race) => {
        setIsSearchingMinis(true);
        const q = query || miniSearchQuery;
        let results = await searchGithubModels(q);
        if (results.length === 0 && race) results = await searchGithubModels(race);
        setAvailableModels(results);
        setIsSearchingMinis(false);
    };

    const handleModelSelect = (model, isStatue = false) => {
        if (!characterForModelSelection) return;
        const finalChar = { ...characterForModelSelection };
        if (model) {
            finalChar.model3d = model.url;
            finalChar.modelScale = model.scale || 1;
            finalChar.modelYOffset = model.yOffset || 0;
            if (isStatue) finalChar.forceStatue = true;
            else delete finalChar.forceStatue;
        } else {
            delete finalChar.model3d;
            delete finalChar.modelScale;
            delete finalChar.modelYOffset;
            delete finalChar.forceStatue;
        }
        
        handleSheetSave(finalChar);
        toast(`Updated 3D model for ${finalChar.name}!`, "success");
        if (viewingCharacterId === finalChar.id) {
            useCharacterStore.getState().loadCharacter(finalChar);
        }
        
        setCharacterForModelSelection(null);
        setShowModelPicker(false);
    };

    const openModelPickerForExisting = (charId) => {
        const currentData = dataRef.current || {};
        const char = (currentData.players || []).find(n => String(n.id) === String(charId));
        if (!char) return;
        setCharacterForModelSelection(char);
        setAvailableModels([]);
        setShowModelPicker(true);
        setMiniSearchQuery(char.name);
        handleMiniSearch(char.name, char.race);
    };

    const handleForge3D = async (character) => {
        if (!character.image) {
            toast("Character needs a portrait image to forge a 3D mini.", "warning");
            return;
        }
        setIsForging3D(true);
        setForge3DStatus("Connecting to Neural 3D Forge...");
        try {
            const client = await Client.connect("TencentARC/InstantMesh");
            setForge3DStatus("Synthesizing 3D Geometry...");
            let imageBlob;
            if (character.image.startsWith('chunked:')) {
                const b64 = await retrieveChunkedMap(character.image);
                const res = await fetch(b64);
                imageBlob = await res.blob();
            } else {
                const res = await fetch(character.image);
                imageBlob = await res.blob();
            }
            const result = await client.predict("/check_input_image", [imageBlob]);
            const processedImage = result.data[0];
            setForge3DStatus("Extracting High-Poly Mesh (.obj)...");
            const meshResult = await client.predict("/generate_mvs", [processedImage, 42]);
            const finalMesh = await client.predict("/make3d", [meshResult.data[0]]);
            const objUrl = finalMesh.data[0].url;
            
            const finalChar = {
                ...character,
                model3d: objUrl,
                modelScale: 1,
                modelYOffset: 0
            };
            handleSheetSave(finalChar);
            toast("Forged custom 3D mini successfully!", "success");
            setShowModelPicker(false);
            setCharacterForModelSelection(null);
        } catch(e) {
            console.error("3D Forge error:", e);
            toast("3D Forge failed: " + e.message, "error");
        }
        setIsForging3D(false);
    };

    // If a full sheet is currently open
    if (viewingCharacterId) {
        return (
            <div className="flex flex-col h-full w-full bg-slate-950">
                <div className="flex-1 min-h-0">
                    <SheetContainer 
                        character={viewingCharacter}
                        isOwner={role === 'dm' || isOwnerOf(viewingCharacter)}
                        onSave={handleSheetSave} 
                        onDiceRoll={async (formula, options) => {
                            if (onDiceRoll) {
                                return await onDiceRoll(formula, { ...options, chat: true });
                            }
                        }}
                        diceLog={diceLog}
                        onLogAction={onLogAction}
                        onBack={() => setViewingCharacterId(null)} 
                        role={role}
                        onOpenModelPicker={() => openModelPickerForExisting(viewingCharacterId)}
                        onOpenDiceTray={onOpenDiceTray}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-y-auto custom-scroll p-4 sm:p-6 pb-28">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* 1. HEROIC COMMAND HEADER & TELEMETRY */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
                    <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-amber-600/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -left-16 -top-16 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                        {/* Title & Description */}
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] tracking-widest font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                    Adventurer&apos;s War Room
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                    APL {partyTelemetry.avgLevel}
                                </span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl fantasy-font text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 drop-shadow">
                                Heroes of the Realm
                            </h1>
                            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-lg">
                                Manage adventurer vital signs, passive awareness, heroic inspiration, and party rest recoveries.
                            </p>
                        </div>

                        {/* Telemetry Cards & Action Controls */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Party Passives Inspector */}
                            <button
                                type="button"
                                onClick={() => setShowPassivesModal(true)}
                                className="bg-slate-800/90 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 border border-indigo-500/30 hover:border-indigo-500/60 transition-all"
                                title="Open Comparative Party Passives Table"
                            >
                                <Icon name="eye" size={16}/> <span>Passive Senses</span>
                            </button>

                            {/* Group Checks Quick Dropdown */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowGroupRollDropdown(prev => !prev)}
                                    className="bg-slate-800/90 hover:bg-slate-700 text-amber-300 hover:text-amber-200 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 border border-amber-500/30 hover:border-amber-500/60 transition-all"
                                    title="Call Group Roll into Campaign Chat"
                                >
                                    <Icon name="dices" size={16}/> <span>Group Checks</span>
                                    <Icon name="chevron-down" size={12} className={showGroupRollDropdown ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                </button>
                                {showGroupRollDropdown && (
                                    <div className="absolute top-full mt-2 left-0 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                                        <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 tracking-wider">
                                            Call Group Check into Chat
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { triggerQuickGroupRoll('Perception', 'skill'); setShowGroupRollDropdown(false); }}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-slate-200 hover:text-amber-300 flex items-center gap-2 transition-colors"
                                        >
                                            <Icon name="eye" size={14} className="text-amber-400"/> Group Perception
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { triggerQuickGroupRoll('Stealth', 'skill'); setShowGroupRollDropdown(false); }}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-slate-200 hover:text-indigo-300 flex items-center gap-2 transition-colors"
                                        >
                                            <Icon name="footprints" size={14} className="text-indigo-400"/> Group Stealth
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { triggerQuickGroupRoll('Initiative', 'initiative'); setShowGroupRollDropdown(false); }}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-slate-200 hover:text-emerald-300 flex items-center gap-2 transition-colors"
                                        >
                                            <Icon name="swords" size={14} className="text-emerald-400"/> Group Initiative
                                        </button>
                                        <div className="my-1 border-t border-slate-800" />
                                        <button
                                            type="button"
                                            onClick={() => { setShowPassivesModal(true); setShowGroupRollDropdown(false); }}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-slate-400 hover:text-white flex items-center gap-2 transition-colors"
                                        >
                                            <Icon name="sliders" size={14}/> Custom Check or Save...
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Rest Controls (DM Only) */}
                            {role === 'dm' && (
                                <div className="flex items-center bg-slate-950/80 rounded-xl p-1 border border-slate-800 shadow-inner">
                                    <button
                                        type="button"
                                        onClick={handlePartyShortRest}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
                                        title="Short Rest: Recover hit dice & short rest slots"
                                    >
                                        <Icon name="coffee" size={14}/> <span>Short Rest</span>
                                    </button>
                                    <span className="text-slate-700 mx-1">|</span>
                                    <button
                                        type="button"
                                        onClick={handlePartyLongRest}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
                                        title="Long Rest: Full HP & spell slot reset"
                                    >
                                        <Icon name="moon" size={14}/> <span>Long Rest</span>
                                    </button>
                                </div>
                            )}

                            {/* Summon Hero Hub Button */}
                            <button
                                type="button"
                                onClick={() => setShowCreationHub(true)}
                                className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-lg shadow-amber-950/50 flex items-center gap-2 transform transition-all hover:scale-[1.02] border border-amber-400/50"
                            >
                                <Icon name="user-plus" size={16}/> <span>Summon Hero</span>
                            </button>

                            {/* View Toggle */}
                            <div className="flex bg-slate-950/80 rounded-xl p-1 border border-slate-700/80 shadow-inner">
                                <button 
                                    onClick={() => setViewMode('grid')} 
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                        viewMode === 'grid' 
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm' 
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                    title="Grid Cards View"
                                >
                                    <Icon name="layout-grid" size={14}/>
                                    <span className="hidden sm:inline">Grid</span>
                                </button>
                                <button 
                                    onClick={() => setViewMode('list')} 
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                        viewMode === 'list' 
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm' 
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                    title="Tactical Table View"
                                >
                                    <Icon name="list" size={14}/>
                                    <span className="hidden sm:inline">Table</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Live Party Telemetry Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-5 border-t border-slate-800/80">
                        {/* 1. Party Size & APL */}
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                                <Icon name="users" size={18}/>
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Party Roster</div>
                                <div className="text-base font-extrabold text-white font-mono flex items-center gap-1.5">
                                    {partyTelemetry.totalHeroes} Heroes
                                    <span className="text-xs text-amber-400 font-sans font-normal">({partyTelemetry.avgLevel} APL)</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Total Party Vitality */}
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex flex-col justify-center gap-1.5">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Icon name="heart" size={12} className="text-red-400"/> Party Vitality
                                </div>
                                <span className={`text-xs font-mono font-bold ${
                                    partyTelemetry.vitalityPercent > 50 ? 'text-emerald-400' :
                                    partyTelemetry.vitalityPercent > 25 ? 'text-amber-400' : 'text-red-400'
                                }`}>
                                    {partyTelemetry.vitalityPercent}%
                                </span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                                <div 
                                    className={`h-full transition-all duration-300 ${
                                        partyTelemetry.vitalityPercent > 50 ? 'bg-emerald-500' :
                                        partyTelemetry.vitalityPercent > 25 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${partyTelemetry.vitalityPercent}%` }}
                                />
                            </div>
                        </div>

                        {/* 3. Heroic Inspiration Tracker */}
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shrink-0">
                                <Icon name="star" size={18}/>
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inspiration</div>
                                <div className="text-base font-extrabold text-white font-mono flex items-center gap-1">
                                    {partyTelemetry.inspiredTotal} / {partyTelemetry.totalHeroes}
                                    <span className="text-xs text-yellow-400 font-sans font-normal">Active</span>
                                </div>
                            </div>
                        </div>

                        {/* 4. Party Group Wealth */}
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                <Icon name="coins" size={18}/>
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Party Wealth</div>
                                <div className="text-base font-extrabold text-white font-mono flex items-center gap-1">
                                    {partyTelemetry.totalGold.toLocaleString()}
                                    <span className="text-xs text-amber-400 font-sans font-bold">GP</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. FILTER, SEARCH & SORT TOOLBAR */}
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Search Input */}
                    <div className="w-full md:w-80 relative flex items-center">
                        <Icon name="search" size={16} className="absolute left-3.5 text-slate-400 pointer-events-none"/>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search hero, class, or player..."
                            className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-amber-500/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 p-1 text-slate-400 hover:text-white"
                            >
                                <Icon name="x" size={14}/>
                            </button>
                        )}
                    </div>

                    {/* Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                        {[
                            { id: 'all', label: 'All Heroes' },
                            { id: 'wounded', label: '🩸 Wounded' },
                            { id: 'down', label: '💀 Down (0 HP)' },
                            { id: 'inspired', label: '⭐ Inspired' },
                            { id: 'casters', label: '🔮 Casters' },
                            { id: 'online', label: '🟢 Online' }
                        ].map((chip) => (
                            <button
                                key={chip.id}
                                type="button"
                                onClick={() => setFilterType(chip.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                    filterType === chip.id
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                                        : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>

                    {/* Sorting & Counter */}
                    <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Sort:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-bold outline-none cursor-pointer"
                            >
                                <option value="level">Level (High → Low)</option>
                                <option value="hp_low">Lowest HP (Triage)</option>
                                <option value="name">Name (A → Z)</option>
                                <option value="ac">Armor Class</option>
                                <option value="perception">Passive Perception</option>
                            </select>
                        </div>

                        <span className="text-xs text-slate-500 font-mono">
                            {filteredPlayers.length} / {playersList.length}
                        </span>
                    </div>
                </div>

                {/* 3. HEROES ROSTER (GRID OR TABLE VIEW) */}
                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredPlayers.map((p) => {
                            const { cur, max, temp, percent } = getHeroHp(p);
                            const ac = getHeroAc(p);
                            const passPerc = getHeroPassive(p, 'Perception', 'wis');
                            const passInsight = getHeroPassive(p, 'Insight', 'wis');
                            const online = isHeroOnline(p.ownerId);
                            const ownerName = getPlayerDisplayName(p.ownerId);
                            const isDown = cur <= 0;
                            const hpState = hpAdjustState[p.id] || { show: false, delta: '' };

                            return (
                                <div
                                    key={p.id}
                                    onClick={() => handleCharacterClick(p)}
                                    className="group relative bg-slate-900/90 border border-slate-800 hover:border-amber-500/60 rounded-2xl overflow-hidden shadow-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl flex flex-col cursor-pointer"
                                >
                                    {/* 16:9 Banner Header */}
                                    <div className="h-32 bg-slate-950 relative overflow-hidden shrink-0">
                                        {p.image ? (
                                            <img
                                                src={p.image}
                                                alt={p.name}
                                                className="w-full h-full object-cover opacity-60 group-hover:opacity-85 group-hover:scale-105 transition-all duration-300"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-slate-900 opacity-20">
                                                <Icon name="user" size={64}/>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>

                                        {/* Level Badge */}
                                        <div className="absolute top-3 right-3 bg-amber-600 text-white text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-lg shadow-md border border-amber-400 flex items-center gap-1">
                                            <span>LVL</span> {p.level || 1}
                                        </div>

                                        {/* Heroic Inspiration Star Toggle */}
                                        <button
                                            type="button"
                                            onClick={(e) => handleToggleInspiration(p, e)}
                                            className={`absolute top-3 left-3 p-1.5 rounded-xl border shadow-lg transition-all ${
                                                p.inspiration
                                                    ? 'bg-yellow-500 text-slate-950 border-yellow-300 shadow-[0_0_12px_rgba(234,179,8,0.6)] scale-110'
                                                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-yellow-300 border-slate-700'
                                            }`}
                                            title={p.inspiration ? "Heroic Inspiration Active (Click to spend)" : "Grant Heroic Inspiration"}
                                        >
                                            <Icon name="star" size={15}/>
                                        </button>

                                        {/* Quick Actions (Hover Overlay) */}
                                        <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {p.dndBeyondId && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setRefreshCharacter(p); }}
                                                    className="p-1.5 bg-slate-900/90 hover:bg-blue-600 text-blue-300 hover:text-white rounded-lg border border-blue-500/40 shadow transition-colors"
                                                    title="Refresh from D&D Beyond"
                                                >
                                                    <Icon name="refresh-cw" size={13}/>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); openModelPickerForExisting(p.id); }}
                                                className="p-1.5 bg-slate-900/90 hover:bg-amber-600 text-amber-300 hover:text-white rounded-lg border border-amber-500/40 shadow transition-colors"
                                                title="Select 3D Mini Model"
                                            >
                                                <Icon name="box" size={13}/>
                                            </button>
                                            {(role === 'dm' || isOwnerOf(p)) && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDelete(p.id, e)}
                                                    className="p-1.5 bg-slate-900/90 hover:bg-red-700 text-red-400 hover:text-white rounded-lg border border-red-500/40 shadow transition-colors"
                                                    title="Delete Hero"
                                                >
                                                    <Icon name="trash-2" size={13}/>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Content */}
                                    <div className="p-4 relative -mt-7 flex-1 flex flex-col justify-between space-y-3">
                                        {/* Identity Strip */}
                                        <div className="flex items-start gap-3">
                                            {/* Avatar with Presence Indicator */}
                                            <div className="relative shrink-0">
                                                <div className="w-14 h-14 rounded-2xl bg-slate-800 border-2 border-amber-500 shadow-xl overflow-hidden flex items-center justify-center font-bold text-xl text-slate-400">
                                                    {p.image ? (
                                                        <img src={p.image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        p.name?.[0] || '?'
                                                    )}
                                                </div>
                                                {/* Online Dot */}
                                                <span
                                                    className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                                                        online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-600'
                                                    }`}
                                                    title={online ? `Connected: ${ownerName}` : `Offline: ${ownerName}`}
                                                />
                                            </div>

                                            {/* Name, Class, Player Owner */}
                                            <div className="min-w-0 flex-1 pt-4">
                                                <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                                                    {p.name}
                                                </h3>
                                                <p className="text-[11px] text-amber-500/90 font-bold uppercase tracking-wider truncate">
                                                    {p.race} {p.class}
                                                </p>
                                                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5 truncate">
                                                    <Icon name="user" size={11} className={online ? "text-emerald-400" : "text-slate-500"}/>
                                                    <span>{ownerName}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Combat Vitals Ribbon (AC, Speed, Passives) */}
                                        <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-950/70 rounded-xl border border-slate-800 text-center font-mono">
                                            <div>
                                                <div className="text-[9px] uppercase font-bold text-slate-400 flex items-center justify-center gap-0.5">
                                                    <Icon name="shield" size={10} className="text-blue-400"/> AC
                                                </div>
                                                <div className="text-xs font-bold text-white">{ac}</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] uppercase font-bold text-slate-400 flex items-center justify-center gap-0.5">
                                                    <Icon name="zap" size={10} className="text-emerald-400"/> Spd
                                                </div>
                                                <div className="text-xs font-bold text-white truncate">{p.speed || 30}</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] uppercase font-bold text-slate-400 flex items-center justify-center gap-0.5">
                                                    <Icon name="eye" size={10} className="text-amber-400"/> Perc
                                                </div>
                                                <div className="text-xs font-bold text-amber-300">{passPerc}</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] uppercase font-bold text-slate-400 flex items-center justify-center gap-0.5">
                                                    <Icon name="brain" size={10} className="text-purple-400"/> Ins
                                                </div>
                                                <div className="text-xs font-bold text-purple-300">{passInsight}</div>
                                            </div>
                                        </div>

                                        {/* Health Bar & Quick Adjuster Toggle */}
                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex items-center justify-between text-xs font-mono">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400">HP:</span>
                                                    <span className={`font-extrabold ${
                                                        isDown ? 'text-red-400 animate-pulse' :
                                                        percent <= 25 ? 'text-red-400' :
                                                        percent <= 50 ? 'text-amber-400' : 'text-emerald-400'
                                                    }`}>
                                                        {cur} / {max}
                                                    </span>
                                                    {temp > 0 && (
                                                        <span className="text-[10px] bg-blue-900/80 text-blue-200 px-1 rounded font-bold">
                                                            +{temp}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Quick Adjust Button */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setHpAdjustState(prev => ({
                                                            ...prev,
                                                            [p.id]: { ...hpState, show: !hpState.show }
                                                        }));
                                                    }}
                                                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors flex items-center gap-1 ${
                                                        hpState.show
                                                            ? 'bg-red-600 text-white border-red-500'
                                                            : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:border-slate-600'
                                                    }`}
                                                    title="Quick Damage & Healing"
                                                >
                                                    <Icon name="plus-minus" size={11}/> Damage/Heal
                                                </button>
                                            </div>

                                            {/* Health Bar */}
                                            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                                                <div 
                                                    className={`h-full transition-all duration-300 ${
                                                        isDown ? 'bg-slate-700' :
                                                        percent > 50 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                                                        percent > 25 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                                                        'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                                    }`}
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>

                                            {/* Expandable Quick Damage / Heal Popover */}
                                            {hpState.show && (
                                                <div 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="p-3 bg-slate-950 border border-slate-700 rounded-xl space-y-2 mt-2 shadow-2xl animate-in zoom-in-95 duration-150"
                                                >
                                                    <div className="flex gap-1 justify-between">
                                                        {[-10, -5, -1, 1, 5, 10].map(val => (
                                                            <button
                                                                key={val}
                                                                type="button"
                                                                onClick={() => handleAdjustHp(p, Math.abs(val), val < 0 ? 'damage' : 'heal')}
                                                                className={`px-1.5 py-1 text-[11px] font-bold rounded font-mono ${
                                                                    val < 0 
                                                                        ? 'bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/60' 
                                                                        : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60'
                                                                }`}
                                                            >
                                                                {val > 0 ? `+${val}` : val}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-1.5 items-center">
                                                        <input
                                                            type="number"
                                                            placeholder="Custom amt..."
                                                            value={hpState.delta || ''}
                                                            onChange={(e) => setHpAdjustState(prev => ({
                                                                ...prev,
                                                                [p.id]: { ...hpState, delta: e.target.value }
                                                            }))}
                                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAdjustHp(p, hpState.delta, 'damage')}
                                                            className="px-2.5 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-bold"
                                                        >
                                                            Damage
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAdjustHp(p, hpState.delta, 'heal')}
                                                            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold"
                                                        >
                                                            Heal
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAdjustHp(p, hpState.delta, 'temp')}
                                                            className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold"
                                                            title="Add Temp HP"
                                                        >
                                                            Temp
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Death Saves Widget (Displayed if at 0 HP) */}
                                        {isDown && (
                                            <div 
                                                onClick={(e) => e.stopPropagation()} 
                                                className="p-2.5 bg-red-950/40 border border-red-900/60 rounded-xl space-y-1.5"
                                            >
                                                <div className="flex items-center justify-between text-[10px] uppercase font-bold text-red-300">
                                                    <span>💀 Death Saving Throws</span>
                                                    <span className="font-mono text-slate-400">3 of each</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] text-emerald-400 font-bold mr-1">Succ:</span>
                                                        {[0, 1, 2].map(idx => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={(e) => handleToggleDeathSave(p, 'successes', idx, e)}
                                                                className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                                                    idx < (p.deathSaves?.successes || 0)
                                                                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                                                        : 'bg-slate-900 border-slate-700 text-transparent'
                                                                }`}
                                                            >
                                                                ✓
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] text-red-400 font-bold mr-1">Fail:</span>
                                                        {[0, 1, 2].map(idx => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={(e) => handleToggleDeathSave(p, 'failures', idx, e)}
                                                                className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                                                    idx < (p.deathSaves?.failures || 0)
                                                                        ? 'bg-red-500 text-white border-red-400'
                                                                        : 'bg-slate-900 border-slate-700 text-transparent'
                                                                }`}
                                                            >
                                                                ✕
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Conditions Badges */}
                                        {Array.isArray(p.conditions) && p.conditions.length > 0 && (
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {p.conditions.map((cond, i) => (
                                                    <span
                                                        key={i}
                                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 shadow-sm"
                                                    >
                                                        {cond}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Tactical Table (List View) */
                    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-950/60">
                                    <th className="p-3.5">Hero</th>
                                    <th className="p-3.5">Player Owner</th>
                                    <th className="p-3.5 text-center">AC</th>
                                    <th className="p-3.5 text-center">Speed</th>
                                    <th className="p-3.5 text-center">Health</th>
                                    <th className="p-3.5 text-center">Pass. Perception</th>
                                    <th className="p-3.5 text-center">Pass. Insight</th>
                                    <th className="p-3.5 text-center">Inspiration</th>
                                    <th className="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {filteredPlayers.map((p) => {
                                    const { cur, max, temp, percent } = getHeroHp(p);
                                    const ac = getHeroAc(p);
                                    const passPerc = getHeroPassive(p, 'Perception', 'wis');
                                    const passInsight = getHeroPassive(p, 'Insight', 'wis');
                                    const online = isHeroOnline(p.ownerId);
                                    const ownerName = getPlayerDisplayName(p.ownerId);

                                    return (
                                        <tr
                                            key={p.id}
                                            onClick={() => handleCharacterClick(p)}
                                            className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                                        >
                                            {/* Hero Identity */}
                                            <td className="p-3.5 flex items-center gap-3">
                                                <div className="relative shrink-0">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-bold text-slate-300">
                                                        {p.image ? (
                                                            <img src={p.image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            p.name?.[0] || '?'
                                                        )}
                                                    </div>
                                                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${online ? 'bg-emerald-500' : 'bg-slate-600'}`}/>
                                                </div>
                                                <div>
                                                    <div className="font-bold text-white text-sm hover:text-amber-400 transition-colors">
                                                        {p.name}
                                                    </div>
                                                    <div className="text-[10px] text-amber-500/90 font-bold uppercase tracking-wider">
                                                        Lvl {p.level || 1} • {p.race} {p.class}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Player Owner */}
                                            <td className="p-3.5 text-slate-400 text-xs">
                                                <span className="flex items-center gap-1.5">
                                                    <Icon name="user" size={12} className={online ? "text-emerald-400" : "text-slate-500"}/>
                                                    {ownerName}
                                                </span>
                                            </td>

                                            {/* AC */}
                                            <td className="p-3.5 text-center font-mono font-bold text-slate-200">
                                                <span className="px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-900/40">
                                                    {ac}
                                                </span>
                                            </td>

                                            {/* Speed */}
                                            <td className="p-3.5 text-center font-mono text-slate-300">
                                                {p.speed || 30} ft.
                                            </td>

                                            {/* Health & Bar */}
                                            <td className="p-3.5 text-center min-w-[140px]">
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between text-[11px] font-mono">
                                                        <span className={`font-bold ${
                                                            cur <= 0 ? 'text-red-400' :
                                                            percent <= 25 ? 'text-red-400' :
                                                            percent <= 50 ? 'text-amber-400' : 'text-emerald-400'
                                                        }`}>
                                                            {cur}/{max} {temp > 0 ? `(+${temp})` : ''}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500">{percent}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                                                        <div 
                                                            className={`h-full ${
                                                                cur <= 0 ? 'bg-slate-700' :
                                                                percent > 50 ? 'bg-emerald-500' :
                                                                percent > 25 ? 'bg-amber-500' : 'bg-red-500'
                                                            }`}
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Passive Perception */}
                                            <td className="p-3.5 text-center font-mono font-bold text-amber-300">
                                                {passPerc}
                                            </td>

                                            {/* Passive Insight */}
                                            <td className="p-3.5 text-center font-mono font-bold text-purple-300">
                                                {passInsight}
                                            </td>

                                            {/* Inspiration */}
                                            <td className="p-3.5 text-center">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleToggleInspiration(p, e)}
                                                    className={`p-1.5 rounded-lg border transition-all ${
                                                        p.inspiration
                                                            ? 'bg-yellow-500 text-slate-950 border-yellow-300 shadow'
                                                            : 'bg-slate-800 text-slate-500 hover:text-yellow-300 border-slate-700'
                                                    }`}
                                                    title="Toggle Heroic Inspiration"
                                                >
                                                    <Icon name="star" size={14}/>
                                                </button>
                                            </td>

                                            {/* Actions */}
                                            <td className="p-3.5 text-right space-x-1.5">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); openModelPickerForExisting(p.id); }}
                                                    className="p-1.5 bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
                                                    title="3D Mini"
                                                >
                                                    <Icon name="box" size={14}/>
                                                </button>
                                                {p.dndBeyondId && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setRefreshCharacter(p); }}
                                                        className="p-1.5 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
                                                        title="Sync D&D Beyond"
                                                    >
                                                        <Icon name="refresh-cw" size={14}/>
                                                    </button>
                                                )}
                                                {(role === 'dm' || isOwnerOf(p)) && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleDelete(p.id, e)}
                                                        className="p-1.5 bg-slate-800 hover:bg-red-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-colors"
                                                        title="Delete Hero"
                                                    >
                                                        <Icon name="trash-2" size={14}/>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Empty State */}
                {filteredPlayers.length === 0 && (
                    <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                        <Icon name="users" size={48} className="mx-auto text-slate-600 mb-3"/>
                        <h4 className="text-slate-300 font-bold mb-1">No Heroes Found</h4>
                        <p className="text-slate-500 text-xs mb-4">
                            {playersList.length === 0 
                                ? "Your party has no heroes yet. Summon your first adventurer to begin!" 
                                : "No heroes matched your search filters."}
                        </p>
                        {playersList.length === 0 && (
                            <button
                                type="button"
                                onClick={() => setShowCreationHub(true)}
                                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg"
                            >
                                Summon First Hero
                            </button>
                        )}
                    </div>
                )}

            </div>

            {/* 4. MODALS & DRAWERS */}

            {/* Party Passives Inspector Modal */}
            <PartyPassivesModal
                isOpen={showPassivesModal}
                onClose={() => setShowPassivesModal(false)}
                players={playersList}
                onDiceRoll={onDiceRoll}
                onLogAction={onLogAction}
            />

            {/* Unified Hero Creation Hub Modal */}
            <PartyCreationHubModal
                isOpen={showCreationHub}
                onClose={() => setShowCreationHub(false)}
                onSelectBuilder={() => setShowBuilder(true)}
                onSelectDndBeyond={() => setShowDndBeyondImport(true)}
                onSelectQuickHero={() => setQuickActorModal({
                    isOpen: true,
                    editId: null,
                    name: '',
                    image: '',
                    size: 1,
                    ownerId: null
                })}
                onCharacterCreated={handleNewCharacter}
                generatePlayer={generatePlayer}
                aiHelper={aiHelper}
            />

            {/* Native Builder Modal */}
            {showBuilder && (
                <CharacterBuilder 
                    onClose={() => setShowBuilder(false)}
                    onComplete={(finalSheet) => {
                        handleNewCharacter(finalSheet);
                        setShowBuilder(false);
                    }}
                />
            )}

            {/* D&D Beyond Importer Modal */}
            {showDndBeyondImport && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <DndBeyondImporter 
                        onImport={(charData) => {
                            if (charData) handleNewCharacter(charData);
                            setShowDndBeyondImport(false);
                        }} 
                        onCancel={() => setShowDndBeyondImport(false)} 
                    />
                </div>
            )}

            {/* Refresh from D&D Beyond Modal */}
            {refreshCharacter && (
                <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-md w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700 p-6 relative">
                        <button onClick={() => setRefreshCharacter(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Icon name="refresh-cw" className="text-blue-400"/> Refresh {refreshCharacter.name}</h3>
                        
                        {isImporting ? (
                            <div className="py-8 text-center">
                                <Icon name="loader-2" size={48} className="animate-spin text-blue-500 mx-auto mb-4"/>
                                <p className="text-blue-400 font-bold animate-pulse">{importStatus}</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-slate-400 mb-6">How would you like to apply the fresh data from D&D Beyond?</p>
                                <div className="space-y-4">
                                    <button onClick={() => handleRefreshDndBeyond('combine')} className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-4 group transition-colors">
                                        <div className="font-bold text-white group-hover:text-blue-400 flex items-center gap-2 mb-1"><Icon name="git-merge" size={16}/> Combine (Recommended)</div>
                                        <p className="text-xs text-slate-400">Updates stats, spells, and features but keeps your current Inventory, HP, and Conditions.</p>
                                    </button>
                                    <button onClick={() => handleRefreshDndBeyond('overwrite')} className="w-full text-left bg-slate-800 hover:bg-red-900/50 border border-slate-600 hover:border-red-500/50 rounded-lg p-4 group transition-colors">
                                        <div className="font-bold text-white group-hover:text-red-400 flex items-center gap-2 mb-1"><Icon name="alert-triangle" size={16}/> Overwrite</div>
                                        <p className="text-xs text-slate-400">Completely replaces this character with the D&D Beyond sheet. You will lose local inventory changes.</p>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Quick Hero Modal (Name & Photo Only) */}
            {quickActorModal?.isOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                                    <Icon name="zap" size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-base">
                                        {quickActorModal.editId ? 'Edit Quick Hero' : 'New Quick Hero'}
                                    </h3>
                                    <p className="text-xs text-slate-400">Name &amp; Photo Only (No Sheet)</p>
                                </div>
                            </div>
                            <button onClick={() => setQuickActorModal(null)} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18}/></button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scroll">
                            {/* Photo / Avatar Section */}
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-24 h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                                    {quickActorModal.image ? (
                                        <img src={quickActorModal.image} className="w-full h-full object-cover" alt="Preview" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="font-bold text-3xl text-slate-500 uppercase">{quickActorModal.name?.[0] || '?'}</div>
                                    )}
                                </div>

                                <div className="w-full space-y-2">
                                    <input 
                                        type="text"
                                        value={quickActorModal.image || ''}
                                        onChange={(e) => setQuickActorModal(prev => ({ ...prev, image: e.target.value }))}
                                        placeholder="Paste Image URL (https://...)"
                                        className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors"
                                    />
                                    <div className="flex items-center justify-center gap-2">
                                        <label className="cursor-pointer text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 flex items-center gap-1.5 transition-colors">
                                            <Icon name="upload" size={13} /> Upload File
                                            <input 
                                                type="file" 
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    try {
                                                        const b64 = await fileToBase64(file);
                                                        const chunkedUrl = await storeChunkedMap(b64, file.name);
                                                        setQuickActorModal(prev => ({ ...prev, image: chunkedUrl }));
                                                    } catch(err) {
                                                        dialog.alert("Failed to upload image: " + err.message);
                                                    }
                                                }} 
                                                accept="image/*" 
                                                className="hidden" 
                                            />
                                        </label>
                                        {quickActorModal.image && (
                                            <button
                                                type="button"
                                                onClick={() => setQuickActorModal(prev => ({ ...prev, image: '' }))}
                                                className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Name Input */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Hero Name</label>
                                <input 
                                    type="text"
                                    value={quickActorModal.name || ''}
                                    onChange={(e) => setQuickActorModal(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Sir Reginald, Shadow Thief..."
                                    className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors"
                                />
                            </div>

                            {/* Grid Size */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Grid Size</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { val: 1, label: '1x1 (Med)' },
                                        { val: 2, label: '2x2 (Lrg)' },
                                        { val: 3, label: '3x3 (Huge)' },
                                        { val: 4, label: '4x4 (Garg)' },
                                    ].map(s => (
                                        <button
                                            key={s.val}
                                            type="button"
                                            onClick={() => setQuickActorModal(prev => ({ ...prev, size: s.val }))}
                                            className={`py-1.5 text-xs font-semibold rounded border transition-all ${
                                                Number(quickActorModal.size || 1) === s.val ? 'bg-amber-950/80 border-amber-500 text-amber-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Player Assignment */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Player Assignment (Optional)</label>
                                <select
                                    value={quickActorModal.ownerId || ''}
                                    onChange={(e) => setQuickActorModal(prev => ({ ...prev, ownerId: e.target.value || null }))}
                                    className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                                >
                                    <option value="">-- No Player Assigned --</option>
                                    {Object.entries(data?.activeUsers || {}).map(([uid, rawName]) => {
                                        const displayName = typeof rawName === 'object' ? rawName?.displayName : rawName;
                                        const clean = displayName?.includes('@') ? displayName.split('@')[0] : (displayName || 'Player');
                                        return <option key={uid} value={uid}>{clean}</option>;
                                    })}
                                </select>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
                            <div>
                                {quickActorModal.editId && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteQuickHero(quickActorModal)}
                                        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/50 px-2.5 py-1.5 rounded border border-red-900/50 flex items-center gap-1 transition-colors"
                                    >
                                        <Icon name="trash-2" size={13} /> Delete
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setQuickActorModal(null)}
                                    className="px-4 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaveQuickHero(quickActorModal)}
                                    className="px-5 py-1.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs rounded-lg shadow-lg transition-all"
                                >
                                    {quickActorModal.editId ? 'Save Changes' : 'Create Hero'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 3D Mini Model Picker Modal */}
            {showModelPicker && characterForModelSelection && (
                <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                            <h3 className="font-bold text-white flex items-center gap-2"><Icon name="box" size={18}/> Select 3D Mini: {characterForModelSelection.name}</h3>
                            <button onClick={() => { setCharacterForModelSelection(null); setShowModelPicker(false); }} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-700 bg-slate-900 flex gap-2">
                            <input 
                                autoFocus
                                value={miniSearchQuery} 
                                onChange={e => setMiniSearchQuery(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && handleMiniSearch()}
                                placeholder="Search 3D Models (e.g. Knight, Wizard, Elf)..." 
                                className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-amber-500"
                            />
                            <button 
                                onClick={() => handleMiniSearch()} 
                                disabled={isSearchingMinis} 
                                className="bg-amber-600 hover:bg-amber-500 px-4 rounded text-white font-bold flex items-center justify-center"
                            >
                                {isSearchingMinis ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scroll bg-slate-950 flex-1">
                            {isSearchingMinis ? (
                                <div className="text-center py-10 text-amber-500"><Icon name="loader" size={32} className="animate-spin mx-auto mb-2"/> Searching Repository...</div>
                            ) : isForging3D ? (
                                <div className="text-center py-10 text-purple-500">
                                    <Icon name="loader-2" size={48} className="animate-spin mx-auto mb-4"/>
                                    <p className="font-bold animate-pulse">{forge3DStatus}</p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-slate-400 mb-4 text-sm">Found {availableModels.length} compatible 3D models.</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {availableModels.map((model, i) => (
                                            <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-2 flex flex-col justify-between transition-all group">
                                                <div>
                                                    <div className="aspect-square bg-slate-900 rounded-md mb-2 overflow-hidden border border-slate-700 relative">
                                                        {model.thumb ? <img src={model.thumb} className="w-full h-full object-cover" alt="" /> : <Icon name="box" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600"/>}
                                                    </div>
                                                    <div className="font-bold text-sm text-slate-200 truncate">{model.name}</div>
                                                    <div className="text-[10px] text-slate-500 truncate">Scale: {model.scale}x</div>
                                                </div>
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={() => handleModelSelect(model)} className="flex-1 text-center text-xs px-2 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-white font-bold transition-colors">Select</button>
                                                    <button onClick={() => handleModelSelect(model, true)} className="text-center text-xs p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors" title="Select as stone statue">
                                                        <Icon name="gem" size={14}/>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        <div onClick={() => handleForge3D(characterForModelSelection)} className="bg-slate-800 border border-purple-500/50 border-dashed rounded-lg p-2 cursor-pointer hover:border-purple-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                                            <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-purple-500/30 group-hover:border-purple-500 group-hover:scale-110 transition-transform">
                                                <Icon name="sparkles" size={24} className="text-purple-500 group-hover:text-purple-400"/>
                                            </div>
                                            <div className="font-bold text-sm text-purple-400 group-hover:text-purple-300 text-center">Forge 3D Mini</div>
                                            <div className="text-[10px] text-purple-500/70 text-center">AI Generate (Free)</div>
                                        </div>
                                        
                                        <div onClick={() => handleModelSelect(null)} className="bg-slate-800 border border-slate-700 border-dashed rounded-lg p-2 cursor-pointer hover:border-blue-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-slate-700 group-hover:border-blue-500/50">
                                                <Icon name="image" size={24} className="text-slate-500 group-hover:text-blue-400"/>
                                            </div>
                                            <div className="font-bold text-sm text-slate-200 group-hover:text-blue-400 text-center">2D Token Only</div>
                                            <div className="text-[10px] text-slate-500 text-center">Skip 3D Model</div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PartyView;