import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from './Icon';
import { useDialog } from './DialogProvider';
import { useToast } from './ToastProvider';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { useResolvedUrl } from '../utils/useResolvedUrl';
import { fulfillMapData, fetchMonsterFrom5eApi } from '../utils/moduleFulfillment';
import { searchGithubModels } from '../utils/miniManifest';
import MapSourcingModal from './MapSourcingModal';

// --- SUB-COMPONENT: Live Map Thumbnail Preview ---
const MapThumbnail = ({ mapUrl, name }) => {
    const resolved = useResolvedUrl(mapUrl);
    if (!resolved) {
        return (
            <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-700/80 flex items-center justify-center text-slate-500 shrink-0 shadow-inner">
                <Icon name="map" size={20} className="text-slate-600" />
            </div>
        );
    }
    return (
        <div className="w-14 h-14 rounded-lg overflow-hidden border border-amber-500/40 shrink-0 bg-black relative group shadow">
            <img src={resolved} alt={name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
        </div>
    );
};

// --- PRESET ADVENTURE TEMPLATES ---
const ADVENTURE_PRESETS = [
    {
        id: 'dungeon-crawl',
        title: 'The Sunken Crypt',
        genre: 'Dungeon Crawl',
        icon: 'castle',
        desc: 'A multi-level exploration of an ancient flooded subterranean temple.',
        skeleton: {
            title: 'The Sunken Crypt',
            chapters: [
                {
                    id: 'c_preset_1',
                    title: 'Chapter 1: The Flooded Threshold',
                    levelRange: 'Level 1–2',
                    status: 'active',
                    synopsis: 'Water drips through ancient masonry. A collapsed stairway descends into the damp, echoing chambers of the forgotten sepulcher.',
                    notes: 'DC 12 Perception to hear skittering in the shadows. Submerged chests require DC 13 Athletics to open without triggering the water siphon trap.',
                    maps: [
                        {
                            id: 'm_preset_1_1',
                            name: 'Sunken Entrance Courtyard',
                            status: 'missing',
                            monsters: [{ id: 'p_mon_1', name: 'Skeleton', count: 4, status: 'missing' }, { id: 'p_mon_2', name: 'Zombie', count: 2, status: 'missing' }],
                            lore: [{ id: 'p_l_1', name: 'Altar of the Drowned God', status: 'missing' }]
                        }
                    ]
                },
                {
                    id: 'c_preset_2',
                    title: 'Chapter 2: Hall of the Necromancer',
                    levelRange: 'Level 2–3',
                    status: 'planned',
                    synopsis: 'Bioluminescent moss illuminates arcane circles etched across the stone floor. The smell of brimstone and cold iron hangs heavy.',
                    notes: 'The necromancer initiates ritual if combat in the previous room exceeds 3 rounds.',
                    maps: [
                        {
                            id: 'm_preset_2_1',
                            name: 'Ritual Chamber & Catacombs',
                            status: 'missing',
                            monsters: [{ id: 'p_mon_3', name: 'Cult Fanatic', count: 1, status: 'missing' }, { id: 'p_mon_4', name: 'Ghoul', count: 3, status: 'missing' }],
                            lore: [{ id: 'p_l_2', name: 'Tome of Dark Resonances', status: 'missing' }]
                        }
                    ]
                }
            ]
        }
    },
    {
        id: 'wilderness-hexcrawl',
        title: 'The Whispering Fen',
        genre: 'Wilderness Exploration',
        icon: 'trees',
        desc: 'Treacherous bog expedition hunting a reclusive hag coven.',
        skeleton: {
            title: 'The Whispering Fen',
            chapters: [
                {
                    id: 'c_fen_1',
                    title: 'Chapter 1: The Murkwood Borderlands',
                    levelRange: 'Level 3–4',
                    status: 'active',
                    synopsis: 'A suffocating mist clings to the black water. Twisted cypress trees hide eyes that watch from the rotting canopy.',
                    notes: 'Difficult terrain throughout. DC 14 Survival check to prevent sinking bogs.',
                    maps: [
                        {
                            id: 'm_fen_1_1',
                            name: 'Foggy Causeway & Rotten Ferry',
                            status: 'missing',
                            monsters: [{ id: 'p_fen_m1', name: 'Lizardfolk', count: 4, status: 'missing' }, { id: 'p_fen_m2', name: 'Giant Constrictor Snake', count: 1, status: 'missing' }],
                            lore: [{ id: 'p_fen_l1', name: 'Ferryman Totem', status: 'missing' }]
                        }
                    ]
                },
                {
                    id: 'c_fen_2',
                    title: 'Chapter 2: The Hag’s Sunken Lair',
                    levelRange: 'Level 4–5',
                    status: 'planned',
                    synopsis: 'A crooked wooden house perched on gigantic spider-like stilts above a bubbling black pond.',
                    notes: 'Hag uses illusions of lost children to lure party members into isolated traps.',
                    maps: [
                        {
                            id: 'm_fen_2_1',
                            name: 'The Stilthouse of the Green Hag',
                            status: 'missing',
                            monsters: [{ id: 'p_fen_m3', name: 'Green Hag', count: 1, status: 'missing' }, { id: 'p_fen_m4', name: 'Swarm of Insects', count: 2, status: 'missing' }],
                            lore: [{ id: 'p_fen_l2', name: 'Cauldron of Murmurs', status: 'missing' }]
                        }
                    ]
                }
            ]
        }
    },
    {
        id: 'urban-heist',
        title: 'Shadows Over the Grand Vault',
        genre: 'Urban Heist',
        icon: 'key',
        desc: 'Infiltration and escape through high-society ballrooms and security vaults.',
        skeleton: {
            title: 'Shadows Over the Grand Vault',
            chapters: [
                {
                    id: 'c_heist_1',
                    title: 'Chapter 1: The Masquerade Infiltration',
                    levelRange: 'Level 3–5',
                    status: 'active',
                    synopsis: 'Music, velvet gowns, and jeweled domino masks conceal poisoned daggers and secret whispered transactions.',
                    notes: 'Disguises required. Suspicion meter: Each loud action adds +1 suspicion.',
                    maps: [
                        {
                            id: 'm_heist_1_1',
                            name: 'Grand Ballroom & Balcony',
                            status: 'missing',
                            monsters: [{ id: 'p_h_m1', name: 'Spy', count: 2, status: 'missing' }, { id: 'p_h_m2', name: 'Guard', count: 4, status: 'missing' }],
                            lore: [{ id: 'p_h_l1', name: 'Guild Ledger of Nobles', status: 'missing' }]
                        }
                    ]
                },
                {
                    id: 'c_heist_2',
                    title: 'Chapter 2: The Gilded Vault Chambers',
                    levelRange: 'Level 4–5',
                    status: 'planned',
                    synopsis: 'Rows of runic pressure plates guard the ironclad vault door holding the royal regalia.',
                    notes: 'Runic lock requires DC 16 Arcana or Thieves Tools to disarm without triggering alarm bells.',
                    maps: [
                        {
                            id: 'm_heist_2_1',
                            name: 'Underground Vault & Sewer Escape',
                            status: 'missing',
                            monsters: [{ id: 'p_h_m3', name: 'Animated Armor', count: 2, status: 'missing' }, { id: 'p_h_m4', name: 'Veteran', count: 1, status: 'missing' }],
                            lore: [{ id: 'p_h_l2', name: 'The Star of Valoria Gem', status: 'missing' }]
                        }
                    ]
                }
            ]
        }
    }
];

const ModuleHub = ({ data, updateCampaign, aiHelper, loreChunks: propLoreChunks, campaignCode, generateNpc, setView }) => {
    const toast = useToast();
    const dialog = useDialog();

    // Context integration for Lore, Journal, and Chat broadcasting
    const campaignContext = useNewCampaign();
    const loreVolumes = campaignContext?.loreVolumes || [];
    const loreChunks = propLoreChunks || campaignContext?.loreChunks || [];
    const saveJournalPage = campaignContext?.saveJournalPage;
    const sendMessage = campaignContext?.sendMessage;

    // Module Skeleton
    const skeleton = data?.moduleSkeleton || data?.campaign?.moduleSkeleton;

    // UI States
    const [isGenerating, setIsGenerating] = useState(false);
    const [promptText, setPromptText] = useState('');
    const [selectedTomeId, setSelectedTomeId] = useState('all');
    const [filterMode, setFilterMode] = useState('all'); // 'all' | 'missing' | 'ready'
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedChapters, setCollapsedChapters] = useState({});

    // Sourcing & Upload States
    const [sourcingMap, setSourcingMap] = useState(null); 
    const [uploadTargetMap, setUploadTargetMap] = useState(null);
    const fileInputRef = useRef(null);
    const importFileInputRef = useRef(null);

    // Inspector & Modals
    const [inspectedMonster, setInspectedMonster] = useState(null);
    const [editingChapterDetails, setEditingChapterDetails] = useState(null);
    const [isExpandingChapter, setIsExpandingChapter] = useState(null);
    const [forgingMonsterId, setForgingMonsterId] = useState(null);

    // Manual Add / Edit generic modal
    const [addingToItem, setAddingToItem] = useState(null); // { chapterId, mapId, type: 'chapter'|'maps'|'monsters'|'lore' }
    const [editingItemId, setEditingItemId] = useState(null);
    const [newItemName, setNewItemName] = useState('');
    const [newItemCount, setNewItemCount] = useState(1);

    // Drag and Drop States
    const [draggedChapterIdx, setDraggedChapterIdx] = useState(null);
    const [draggedMapData, setDraggedMapData] = useState(null);

    // --- COMPUTED STATS ---
    const campaignStats = useMemo(() => {
        if (!skeleton || !skeleton.chapters) return { totalChapters: 0, totalMaps: 0, readyMaps: 0, totalMonsters: 0, readyMonsters: 0, completionPct: 0 };
        let totalMaps = 0;
        let readyMaps = 0;
        let totalMonsters = 0;
        let readyMonsters = 0;

        const currentNpcs = data?.npcs || [];

        skeleton.chapters.forEach(chap => {
            const chapMonsters = chap.monsters || [];
            chapMonsters.forEach(m => {
                totalMonsters += (m.count || 1);
                const isReady = m.status === 'ready' || currentNpcs.some(n => n?.name?.toLowerCase() === m.name?.toLowerCase());
                if (isReady) readyMonsters += (m.count || 1);
            });

            (chap.maps || []).forEach(map => {
                totalMaps++;
                if (map.status === 'ready' || map.mapUrl || map.activeMapId) readyMaps++;

                (map.monsters || []).forEach(m => {
                    totalMonsters += (m.count || 1);
                    const isReady = m.status === 'ready' || currentNpcs.some(n => n?.name?.toLowerCase() === m.name?.toLowerCase());
                    if (isReady) readyMonsters += (m.count || 1);
                });
            });
        });

        const totalItems = totalMaps + totalMonsters;
        const readyItems = readyMaps + readyMonsters;
        const completionPct = totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;

        return {
            totalChapters: skeleton.chapters.length,
            totalMaps,
            readyMaps,
            totalMonsters,
            readyMonsters,
            completionPct
        };
    }, [skeleton, data?.npcs]);

    // --- AI HELPER WRAPPER ---
    const localAiHelper = async (messages) => {
        if (typeof aiHelper === 'function') {
            const res = await aiHelper(messages);
            let extracted = res;
            if (typeof res === 'string') return res;
            if (res?.message?.content) extracted = res.message.content;
            else if (typeof res?.response?.text === 'function') extracted = await res.response.text();
            else if (typeof res?.text === 'function') extracted = await res.text();
            else if (res?.text) extracted = res.text;
            return typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
        }
        return null;
    };

    // --- LAUNCH SCENE TO BATTLEMAP ---
    const handleLaunchScene = async (map) => {
        try {
            if (map.activeMapId) {
                await updateCampaign({ activeMapId: map.activeMapId });
            }
            if (typeof setView === 'function') {
                setView('map');
            }
            toast(`Entering Tactical Battlemap: ${map.name}`, "info");
        } catch (err) {
            console.error("Failed to launch map", err);
            toast("Could not switch to map scene.", "error");
        }
    };

    // --- TABLETOP NARRATIVE ACTIONS ---
    const handleBroadcastChapterIntro = (chapter) => {
        if (!sendMessage) {
            toast("Chat system not connected.", "error");
            return;
        }
        const introText = chapter.synopsis || chapter.notes || 'The party steps into the scene...';
        const formattedText = `**${chapter.title}** ${chapter.levelRange ? `*(${chapter.levelRange})*` : ''}\n\n${introText}`;
        sendMessage({
            content: formattedText,
            text: formattedText,
            type: 'chat-desc',
            senderName: 'Dungeon Master',
            senderId: campaignContext?.user?.uid || 'dm',
            role: 'dm',
            timestamp: Date.now()
        });
        toast(`Broadcasted "${chapter.title}" intro to Chat!`, "success");
    };

    const handleClipChapterToJournal = async (chapter) => {
        if (!saveJournalPage) {
            toast("Journal not available.", "error");
            return;
        }
        try {
            const pageId = `page_${Date.now()}`;
            const pageData = {
                id: pageId,
                title: `${skeleton?.title || 'Adventure'} - ${chapter.title}`,
                category: 'Adventure Notes',
                content: `<h2>${chapter.title}</h2><p><strong>Recommended Level:</strong> ${chapter.levelRange || 'All Levels'}</p><p><strong>Status:</strong> ${chapter.status || 'Planned'}</p><hr/><h3>Synopsis</h3><p>${chapter.synopsis ? chapter.synopsis.replace(/\n/g, '<br/>') : 'No synopsis provided.'}</p><h3>DM Notes & Secrets</h3><p>${chapter.notes ? chapter.notes.replace(/\n/g, '<br/>') : 'None recorded.'}</p>`,
                updatedAt: Date.now(),
                createdAt: Date.now()
            };
            await saveJournalPage(pageId, pageData);
            toast(`Saved "${chapter.title}" to DM Journal!`, "success");
        } catch (err) {
            console.error("Clip to journal failed:", err);
            toast("Failed to clip to journal.", "error");
        }
    };

    // --- MONSTER STAT BLOCK INSPECTION & FORGING ---
    const handleInspectMonster = (monster) => {
        const found = (data?.npcs || []).find(n => n?.name?.toLowerCase() === monster.name?.toLowerCase());
        if (found) {
            setInspectedMonster(found);
        } else {
            // Missing: ask if they want to forge it
            handleForgeSingleMonster(monster);
        }
    };

    const handleForgeSingleMonster = async (monster) => {
        setForgingMonsterId(monster.id);
        toast(`Forging ${monster.name}...`, "info");
        try {
            let currentNpcs = [...(data?.npcs || [])];
            let newNpc = await fetchMonsterFrom5eApi(monster.name);

            if (newNpc) {
                toast(`Imported ${monster.name} from 5e SRD!`, "success");
            } else if (typeof generateNpc === 'function') {
                newNpc = await generateNpc(monster.name, `Standard 5e Statblock for adventure: ${skeleton?.title || 'D&D'}`);
            } else {
                // Direct fallback AI generator
                const prompt = `Role: Fantasy 5e bestiary designer. Create a balanced 5e monster statblock for "${monster.name}".
Output ONLY valid JSON:
{
  "name": "${monster.name}",
  "race": "Medium Monstrosity (Neutral)",
  "class": "Monster",
  "level": 3,
  "hp": { "current": 35, "max": 35 },
  "ac": 13,
  "speed": "30 ft.",
  "stats": { "str": 14, "dex": 12, "con": 14, "int": 6, "wis": 10, "cha": 6 },
  "bio": { "appearance": "A fearsome creature.", "backstory": "Lurks in dark caverns." },
  "customActions": [{ "name": "Claw", "desc": "Melee Weapon Attack", "type": "Action", "hit": "+4", "dmg": "1d8+2 slashing" }]
}`;
                const res = await localAiHelper([{ role: 'user', content: prompt }]);
                const match = res?.match(/\{[\s\S]*\}/);
                if (match) newNpc = JSON.parse(match[0]);
            }

            if (newNpc) {
                if (!newNpc.image) {
                    const prompt = `D&D monster token art, ${newNpc.name}, flat color, circular token, white background`;
                    newNpc.image = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
                }
                const npcId = `char_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                const createdNpc = { ...newNpc, id: npcId };
                currentNpcs.push(createdNpc);

                // Update monster status in skeleton
                const newSkeleton = JSON.parse(JSON.stringify(skeleton));
                newSkeleton.chapters.forEach(c => {
                    (c.monsters || []).forEach(m => {
                        if (m.name.toLowerCase() === monster.name.toLowerCase()) m.status = 'ready';
                    });
                    (c.maps || []).forEach(map => {
                        (map.monsters || []).forEach(m => {
                            if (m.name.toLowerCase() === monster.name.toLowerCase()) m.status = 'ready';
                        });
                    });
                });

                await updateCampaign({
                    npcs: currentNpcs,
                    moduleSkeleton: newSkeleton
                });

                setInspectedMonster(createdNpc);
                toast(`${monster.name} forged and added to Bestiary!`, "success");
            } else {
                toast(`Could not generate stats for ${monster.name}.`, "error");
            }
        } catch (err) {
            console.error("Failed to forge monster", err);
            toast(`Failed to forge ${monster.name}.`, "error");
        } finally {
            setForgingMonsterId(null);
        }
    };

    const handleBatchForgeChapterMonsters = async (chapter) => {
        const missingMonsters = [];
        const currentNpcs = data?.npcs || [];

        (chapter.monsters || []).forEach(m => {
            if (m.status !== 'ready' && !currentNpcs.some(n => n?.name?.toLowerCase() === m.name?.toLowerCase())) {
                missingMonsters.push(m);
            }
        });
        (chapter.maps || []).forEach(map => {
            (map.monsters || []).forEach(m => {
                if (m.status !== 'ready' && !currentNpcs.some(n => n?.name?.toLowerCase() === m.name?.toLowerCase())) {
                    missingMonsters.push(m);
                }
            });
        });

        if (missingMonsters.length === 0) {
            return toast("All monsters in this chapter are already forged!", "info");
        }

        if (!(await dialog.confirm(`Forge ${missingMonsters.length} missing monsters for "${chapter.title}" into the Bestiary?`))) return;

        toast(`Forging ${missingMonsters.length} creatures...`, "info");
        for (const mon of missingMonsters) {
            await handleForgeSingleMonster(mon);
        }
        toast(`Chapter bestiary completed!`, "success");
    };

    // --- AI EXPAND CHAPTER ---
    const handleExpandChapterWithAi = async (chapter) => {
        setIsExpandingChapter(chapter.id);
        toast(`Consulting AI to expand "${chapter.title}"...`, "info");
        try {
            const prompt = `You are a D&D 5e adventure designer.
Expand this adventure chapter: "${chapter.title}".
Current synopsis: "${chapter.synopsis || ''}"
Existing maps: ${chapter.maps?.map(m => m.name).join(', ') || 'None'}
Existing monsters: ${chapter.maps?.flatMap(m => m.monsters || []).map(m => m.name).join(', ') || 'None'}

Generate an expansion JSON with:
1. "newMaps": array of 1 new map location { "name": string, "monsters": [{ "name": string, "count": number }], "lore": [{ "name": string }] }
2. "additionalMonsters": array of 1-2 extra encounter creatures { "name": string, "count": number }
3. "synopsis": an enhanced 2-3 sentence atmospheric DM read-aloud synopsis.
4. "secrets": array of 2 secret room clues, traps, or environmental hazards.

Output ONLY valid JSON, no markdown, no backticks.`;

            const res = await localAiHelper([{ role: 'user', content: prompt }]);
            const match = res?.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("Could not parse AI JSON");
            const parsed = JSON.parse(match[0]);

            const newSkeleton = JSON.parse(JSON.stringify(skeleton));
            const targetChapter = newSkeleton.chapters.find(c => c.id === chapter.id);
            if (targetChapter) {
                if (parsed.synopsis) targetChapter.synopsis = parsed.synopsis;
                if (parsed.secrets && parsed.secrets.length > 0) {
                    targetChapter.notes = (targetChapter.notes ? targetChapter.notes + '\n\n' : '') + '### Secrets & Hazards\n' + parsed.secrets.map(s => `• ${s}`).join('\n');
                }
                if (parsed.newMaps && parsed.newMaps.length > 0) {
                    targetChapter.maps = targetChapter.maps || [];
                    parsed.newMaps.forEach((nm, idx) => {
                        targetChapter.maps.push({
                            id: `m_${Date.now()}_${idx}`,
                            name: nm.name,
                            status: 'missing',
                            monsters: (nm.monsters || []).map((m, j) => ({ id: `mon_${Date.now()}_${idx}_${j}`, name: m.name, count: m.count || 1, status: 'missing' })),
                            lore: (nm.lore || []).map((l, j) => ({ id: `l_${Date.now()}_${idx}_${j}`, name: l.name, status: 'missing' }))
                        });
                    });
                }
                if (parsed.additionalMonsters && parsed.additionalMonsters.length > 0) {
                    targetChapter.monsters = targetChapter.monsters || [];
                    parsed.additionalMonsters.forEach((am, idx) => {
                        targetChapter.monsters.push({
                            id: `mon_${Date.now()}_add_${idx}`,
                            name: am.name,
                            count: am.count || 1,
                            status: 'missing'
                        });
                    });
                }
                await updateCampaign({ moduleSkeleton: newSkeleton });
                toast(`Chapter "${chapter.title}" expanded with new maps & secrets!`, "success");
            }
        } catch (err) {
            console.error("Failed to expand chapter", err);
            toast("Failed to expand chapter with AI.", "error");
        } finally {
            setIsExpandingChapter(null);
        }
    };

    // --- CHAPTER COLLAPSE TOGGLE ---
    const toggleChapterCollapse = (chapId) => {
        setCollapsedChapters(prev => ({ ...prev, [chapId]: !prev[chapId] }));
    };

    const toggleAllChapters = (collapse) => {
        const newObj = {};
        skeleton?.chapters?.forEach(c => {
            newObj[c.id] = collapse;
        });
        setCollapsedChapters(newObj);
    };

    // --- DRAG AND DROP ---
    const handleChapterDragStart = (e, index) => {
        setDraggedChapterIdx(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData('text/plain', 'chapter');
    };

    const handleChapterDragOver = (e) => {
        if (draggedChapterIdx !== null) e.preventDefault();
    };

    const handleChapterDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedChapterIdx === null || draggedChapterIdx === dropIndex) return;
        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
        const [draggedItem] = newSkeleton.chapters.splice(draggedChapterIdx, 1);
        newSkeleton.chapters.splice(dropIndex, 0, draggedItem);
        updateCampaign({ moduleSkeleton: newSkeleton });
        setDraggedChapterIdx(null);
    };

    const handleMapDragStart = (e, chapterId, mapIdx) => {
        e.stopPropagation();
        setDraggedMapData({ chapterId, mapIdx });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData('text/plain', 'map');
    };

    const handleMapDragOver = (e) => {
        if (draggedMapData !== null) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const handleMapDrop = (e, targetChapterId, dropMapIdx) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedMapData) return;
        if (draggedMapData.chapterId === targetChapterId && draggedMapData.mapIdx === dropMapIdx) {
            setDraggedMapData(null);
            return;
        }
        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
        const sourceChapter = newSkeleton.chapters.find(c => c.id === draggedMapData.chapterId);
        const targetChapter = newSkeleton.chapters.find(c => c.id === targetChapterId);
        if (sourceChapter && targetChapter) {
            sourceChapter.maps = sourceChapter.maps || [];
            targetChapter.maps = targetChapter.maps || [];
            const [draggedMap] = sourceChapter.maps.splice(draggedMapData.mapIdx, 1);
            targetChapter.maps.splice(dropMapIdx, 0, draggedMap);
            updateCampaign({ moduleSkeleton: newSkeleton });
        }
        setDraggedMapData(null);
    };

    // --- DELETE ITEM ---
    const handleDeleteItem = async (chapterId, itemType, itemId, mapId = null) => {
        const msg = itemType === 'chapter' 
            ? "Are you sure you want to delete this entire chapter and all its contents?" 
            : "Are you sure you want to remove this requirement?";
        if (!(await dialog.confirm(msg))) return;
        
        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
        if (itemType === 'chapter') {
            newSkeleton.chapters = newSkeleton.chapters.filter(c => c.id !== chapterId);
            updateCampaign({ moduleSkeleton: newSkeleton });
            toast("Chapter removed.", "info");
            return;
        }
        
        const chapter = newSkeleton.chapters.find(c => c.id === chapterId);
        if (chapter) {
            if (mapId) {
                const map = chapter.maps?.find(m => m.id === mapId);
                if (map && map[itemType]) {
                    map[itemType] = map[itemType].filter(i => i.id !== itemId);
                }
            } else if (chapter[itemType]) {
                chapter[itemType] = chapter[itemType].filter(i => i.id !== itemId);
            }
            updateCampaign({ moduleSkeleton: newSkeleton });
            toast("Requirement removed.", "info");
        }
    };

    // --- EDIT / ADD MANUAL ITEMS ---
    const handleEditItem = (chapterId, type, item, mapId = null) => {
        setAddingToItem({ chapterId, mapId, type });
        setEditingItemId(item.id);
        setNewItemName(item.name || item.title || '');
        setNewItemCount(item.count || 1);
    };

    const handleManualAdd = () => {
        if (!addingToItem || !newItemName.trim()) return;
        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
        
        if (addingToItem.type === 'chapter') {
            if (!newSkeleton.chapters) newSkeleton.chapters = [];
            if (editingItemId) {
                const chapter = newSkeleton.chapters.find(c => c.id === editingItemId);
                if (chapter) chapter.title = newItemName.trim();
            } else {
                const newChapter = {
                    id: `c_${Date.now()}`,
                    title: newItemName.trim(),
                    levelRange: 'Level 1–3',
                    status: 'planned',
                    synopsis: '',
                    notes: '',
                    maps: []
                };
                newSkeleton.chapters.push(newChapter);
            }
            updateCampaign({ moduleSkeleton: newSkeleton });
        } else {
            const chapter = newSkeleton.chapters.find(c => c.id === addingToItem.chapterId);
            if (chapter) {
                let targetList;
                if (addingToItem.mapId) {
                    const map = chapter.maps?.find(m => m.id === addingToItem.mapId);
                    if (map) {
                        if (!map[addingToItem.type]) map[addingToItem.type] = [];
                        targetList = map[addingToItem.type];
                    }
                } else {
                    if (!chapter[addingToItem.type]) chapter[addingToItem.type] = [];
                    targetList = chapter[addingToItem.type];
                }
                
                if (targetList) {
                    if (editingItemId) {
                        const item = targetList.find(i => i.id === editingItemId);
                        if (item) {
                            item.name = newItemName.trim();
                            if (addingToItem.type === 'monsters') item.count = newItemCount;
                        }
                    } else {
                        const newItemId = `${addingToItem.type}_${Date.now()}`;
                        const newItem = { id: newItemId, name: newItemName.trim(), status: 'missing' };
                        if (addingToItem.type === 'monsters') newItem.count = newItemCount;
                        targetList.push(newItem);
                    }
                    updateCampaign({ moduleSkeleton: newSkeleton });
                }
            }
        }
        
        setAddingToItem(null);
        setEditingItemId(null);
        setNewItemName('');
        setNewItemCount(1);
    };

    // --- SAVE CHAPTER DETAILS EDIT ---
    const handleSaveChapterDetails = () => {
        if (!editingChapterDetails) return;
        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
        const chap = newSkeleton.chapters.find(c => c.id === editingChapterDetails.id);
        if (chap) {
            chap.title = editingChapterDetails.title;
            chap.levelRange = editingChapterDetails.levelRange;
            chap.status = editingChapterDetails.status;
            chap.synopsis = editingChapterDetails.synopsis;
            chap.notes = editingChapterDetails.notes;
            updateCampaign({ moduleSkeleton: newSkeleton });
            toast("Chapter details updated!", "success");
        }
        setEditingChapterDetails(null);
    };

    // --- MAP SOURCING & UPLOADING ---
    const fetchRedditMaps = (mapObj, chapterId) => {
        setSourcingMap({ ...mapObj, chapterId });
    };

    const handleMapUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file || !uploadTargetMap) return;
        
        toast(`Uploading ${uploadTargetMap.name}...`, "info");
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                await fulfillMapData({
                    imgUrl: reader.result,
                    targetMap: { ...uploadTargetMap, id: uploadTargetMap.mapId || uploadTargetMap.id },
                    campaignCode,
                    skeleton,
                    data: {
                        ...data,
                        npcs: (data?.npcs || []).filter(n => n && n.name),
                        players: (data?.players || []).filter(p => p && p.name)
                    },
                    aiHelper: localAiHelper,
                    generateNpc,
                    updateCampaign,
                    setProcessingStep: (step) => toast(step, "info")
                });
                toast(`Map "${uploadTargetMap.name}" imported successfully!`, "success");
            } catch (err) {
                console.error(err);
                toast("Failed to process and save map.", "error");
            } finally {
                setUploadTargetMap(null);
            }
            e.target.value = null;
        };
        reader.readAsDataURL(file);
    };

    // --- GENERATE SKELETON FROM AI OR ARCHIVES ---
    const generateSkeleton = async () => {
        if (!promptText.trim() && (!loreChunks || loreChunks.length === 0)) {
            return dialog.alert("Enter an adventure description or select a Tome from the Archives.");
        }
        setIsGenerating(true);

        let contextSource = promptText ? `Based on request: "${promptText}"` : "Based on the campaign lore.";
        
        // Filter chunks by selected Tome if specified
        let relevantChunks = loreChunks;
        if (selectedTomeId !== 'all') {
            relevantChunks = loreChunks.filter(c => c.docId === selectedTomeId || c.source?.includes(selectedTomeId));
        }

        if (relevantChunks && relevantChunks.length > 0) {
            const archiveSummary = relevantChunks.slice(0, 25).map(c => c.content).join('\n').substring(0, 16000);
            contextSource += `\n\nArchive Source Context:\n${archiveSummary}`;
        }

        const prompt = `You are the DungeonMind Adventure Module Architect.
${contextSource}

Create a structured "Campaign Skeleton" JSON. Output ONLY valid JSON, no markdown, no backticks.
Schema:
{
  "title": "Adventure Title",
  "chapters": [
    {
      "id": "c1",
      "title": "Chapter 1: The Gathering Gloom",
      "levelRange": "Level 1–3",
      "status": "active",
      "synopsis": "Atmospheric 2-3 sentence DM read-aloud introduction.",
      "notes": "Key room secrets, traps, and NPC motivations.",
      "maps": [
        { 
          "id": "m1", 
          "name": "Map Name (e.g. Ruined Watchtower)", 
          "status": "missing",
          "monsters": [{ "id": "mon1", "name": "Goblin", "status": "missing", "count": 4 }],
          "lore": [{ "id": "l1", "name": "Mysterious Carving", "status": "missing" }]
        }
      ]
    }
  ]
}
Ensure there are at least 2 to 3 chapters. Provide distinct tactical maps, realistic monster encounters, and key lore discoveries. Do NOT use placeholders like "Unknown".`;

        try {
            const res = await localAiHelper([{ role: 'user', content: prompt }]);
            if (!res) throw new Error("Empty response from AI");
            
            const match = res.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("No JSON found in response");
            
            const newSkeleton = JSON.parse(match[0]);
            
            // Normalize IDs
            newSkeleton.chapters.forEach((chap, cIdx) => {
                chap.id = chap.id || `c_${Date.now()}_${cIdx}`;
                chap.levelRange = chap.levelRange || 'Level 1–3';
                chap.status = chap.status || (cIdx === 0 ? 'active' : 'planned');
                chap.synopsis = chap.synopsis || '';
                chap.notes = chap.notes || '';
                chap.maps?.forEach((m, i) => {
                    m.id = m.id || `m_${Date.now()}_${cIdx}_${i}`;
                    m.monsters?.forEach((mon, j) => mon.id = mon.id || `mon_${Date.now()}_${cIdx}_${i}_${j}`);
                    m.lore?.forEach((l, j) => l.id = l.id || `l_${Date.now()}_${cIdx}_${i}_${j}`);
                });
            });

            await updateCampaign({ moduleSkeleton: newSkeleton });
            toast(`Campaign "${newSkeleton.title}" generated!`, "success");
        } catch (e) {
            console.error("Failed to generate skeleton:", e);
            dialog.alert("Failed to generate campaign skeleton. Check console.");
        } finally {
            setIsGenerating(false);
        }
    };

    // --- APPLY PRESET ADVENTURE ---
    const handleApplyPreset = async (preset) => {
        if (await dialog.confirm(`Construct campaign using the "${preset.title}" preset template?`)) {
            await updateCampaign({ moduleSkeleton: preset.skeleton });
            toast(`Loaded "${preset.title}" preset!`, "success");
        }
    };

    // --- MANUAL SKELETON CREATION ---
    const createManualSkeleton = async () => {
        const emptySkeleton = {
            title: "Custom Campaign",
            chapters: [
                { 
                    id: `c_${Date.now()}`, 
                    title: "Chapter 1: The Adventure Begins", 
                    levelRange: "Level 1–3",
                    status: "active",
                    synopsis: "The adventurers meet and receive their first quest...",
                    notes: "Town rumors, NPC contacts, and initial tavern encounters.",
                    maps: [] 
                }
            ]
        };
        try {
            await updateCampaign({ moduleSkeleton: emptySkeleton });
            toast("Manual campaign created.", "success");
        } catch (err) {
            console.error(err);
            toast("Failed to create manual campaign.", "error");
        }
    };

    // --- CLEAR SKELETON ---
    const clearSkeleton = async () => {
        if (await dialog.confirm("Are you sure you want to delete the current module skeleton? All chapter structures will be reset.")) {
            try {
                await updateCampaign({
                    moduleSkeleton: null,
                    'campaign.moduleSkeleton': null
                });
                toast("Module cleared.", "info");
            } catch (err) {
                console.error(err);
                toast("Failed to clear module.", "error");
            }
        }
    };

    // --- EXPORT & IMPORT MODULE JSON ---
    const exportModule = () => {
        if (!skeleton) return;
        const currentNpcs = data?.npcs || [];
        const exportData = {
            version: '2.0',
            type: 'DungeonMind_Module',
            title: skeleton.title,
            skeleton: skeleton,
            npcs: currentNpcs.filter(npc => {
                const allReqNames = (skeleton.chapters || []).flatMap(c => [
                    ...(c.monsters || []).map(m => m.name?.toLowerCase()),
                    ...(c.maps || []).flatMap(m => (m.monsters || []).map(x => x.name?.toLowerCase()))
                ]);
                return allReqNames.includes(npc.name?.toLowerCase());
            }),
            exportedAt: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${skeleton.title.replace(/\s+/g, '_')}_Module.json`;
        a.click();
        URL.revokeObjectURL(a);
        toast("Module JSON exported successfully!", "success");
    };

    const handleImportModuleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                const importedSkeleton = imported.skeleton || (imported.chapters ? imported : null);
                if (!importedSkeleton || !Array.isArray(importedSkeleton.chapters)) {
                    throw new Error("Invalid module format. File must contain a valid 'chapters' array.");
                }

                let mergedNpcs = [...(data?.npcs || [])];
                if (Array.isArray(imported.npcs)) {
                    imported.npcs.forEach(impNpc => {
                        if (!mergedNpcs.some(n => n.name.toLowerCase() === impNpc.name.toLowerCase())) {
                            mergedNpcs.push(impNpc);
                        }
                    });
                }

                await updateCampaign({
                    moduleSkeleton: importedSkeleton,
                    npcs: mergedNpcs
                });
                toast(`Imported module: "${importedSkeleton.title || 'Adventure'}"!`, "success");
            } catch (err) {
                console.error("Import failed", err);
                toast(`Import failed: ${err.message}`, "error");
            }
            e.target.value = null;
        };
        reader.readAsText(file);
    };

    // ==========================================
    // RENDER: EMPTY / SKELETON BUILDER STATE
    // ==========================================
    if (!skeleton) {
        return (
            <div className="h-full bg-slate-950 flex flex-col p-6 overflow-y-auto custom-scroll">
                <div className="max-w-4xl w-full mx-auto my-auto py-8">
                    
                    {/* Hero Title */}
                    <div className="text-center mb-8">
                        <div className="inline-flex p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-4 text-amber-500 shadow-lg shadow-amber-950/20">
                            <Icon name="book-plus" size={40} />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white fantasy-font tracking-wide">Campaign Command Center</h2>
                        <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mt-2">
                            Forge complete structured campaigns with chapters, tactical battlemaps, bestiary monsters, and 3D tabletop lore pins.
                        </p>
                    </div>

                    {/* Generator Box */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl mb-8 backdrop-blur-md">
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
                                <Icon name="sparkles" size={16} /> AI Adventure Architect
                            </label>
                            {loreVolumes.length > 0 && (
                                <span className="text-xs text-amber-400/80 flex items-center gap-1 bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                    <Icon name="library" size={12} /> {loreVolumes.length} Archive Tomes available
                                </span>
                            )}
                        </div>

                        {/* Tome Selector dropdown if volumes exist */}
                        {loreVolumes.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Ground in Uploaded Sourcebook (Optional)
                                </label>
                                <select 
                                    value={selectedTomeId} 
                                    onChange={(e) => setSelectedTomeId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500"
                                >
                                    <option value="all">All Uploaded Archive Tomes ({loreChunks.length} pages)</option>
                                    {loreVolumes.map(vol => (
                                        <option key={vol.id} value={vol.docId || vol.title}>
                                            {vol.title} ({vol.totalPages || 1} pages)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <textarea 
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white focus:border-amber-500 outline-none h-28 resize-none text-sm transition-colors mb-4 placeholder:text-slate-600"
                            placeholder={loreVolumes.length > 0 ? "Leave blank to auto-generate chapters from selected tome, or add custom notes (e.g., 'Focus on the vampire crypt encounter in Chapter 3')..." : "Enter module name or concept (e.g. 'Dragon of Icespire Peak', 'Curse of Strahd', or 'Deep Dwarven Stronghold')..."}
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                        />

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button 
                                onClick={generateSkeleton} 
                                disabled={isGenerating}
                                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 text-sm"
                            >
                                {isGenerating ? <Icon name="loader" className="animate-spin" size={18} /> : <Icon name="sparkles" size={18} />}
                                {isGenerating ? 'Forging Campaign Skeleton...' : 'Generate Skeleton with AI'}
                            </button>
                            <button 
                                onClick={createManualSkeleton} 
                                disabled={isGenerating}
                                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                            >
                                <Icon name="pencil" size={16} /> Blank Campaign
                            </button>
                            <button 
                                onClick={() => importFileInputRef.current?.click()} 
                                disabled={isGenerating}
                                className="px-6 py-3 bg-indigo-900/30 hover:bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 hover:text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                                title="Import Module JSON"
                            >
                                <Icon name="upload" size={16} /> Import JSON
                            </button>
                        </div>
                    </div>

                    {/* Quick-Start Adventure Presets */}
                    <div className="mt-8">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                            <Icon name="bookmark" size={14} className="text-amber-500" /> Or Start with an Adventure Preset
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {ADVENTURE_PRESETS.map(preset => (
                                <div 
                                    key={preset.id}
                                    onClick={() => handleApplyPreset(preset)}
                                    className="bg-slate-900/80 border border-slate-800 hover:border-amber-500/50 rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] shadow-lg group flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                                                {preset.genre}
                                            </span>
                                            <Icon name={preset.icon} size={18} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
                                        </div>
                                        <h5 className="font-bold text-white text-base group-hover:text-amber-300 transition-colors mb-1">{preset.title}</h5>
                                        <p className="text-slate-400 text-xs line-clamp-2">{preset.desc}</p>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 group-hover:text-slate-300">
                                        <span>{preset.skeleton.chapters.length} Chapters</span>
                                        <span className="flex items-center gap-1 text-amber-500 font-bold group-hover:translate-x-1 transition-transform">
                                            Load <Icon name="chevron-right" size={14} />
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <input 
                        type="file" 
                        ref={importFileInputRef} 
                        onChange={handleImportModuleFile} 
                        accept=".json" 
                        className="hidden" 
                    />
                </div>
            </div>
        );
    }

    // Filter chapters and maps based on search and status mode
    const filteredChapters = skeleton.chapters?.filter(chap => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const titleMatch = chap.title?.toLowerCase().includes(q);
        const mapMatch = (chap.maps || []).some(m => m.name?.toLowerCase().includes(q));
        const monsterMatch = (chap.monsters || []).some(m => m.name?.toLowerCase().includes(q)) || 
            (chap.maps || []).some(m => (m.monsters || []).some(x => x.name?.toLowerCase().includes(q)));
        return titleMatch || mapMatch || monsterMatch;
    });

    return (
        <div className="h-full bg-slate-950 flex flex-col overflow-hidden">
            {/* TOP COMMAND HEADER */}
            <div className="shrink-0 bg-slate-900 border-b border-slate-800 p-4 sm:p-6 shadow-xl">
                <div className="max-w-7xl w-full mx-auto flex flex-col gap-4">
                    
                    {/* Campaign Title & Global Actions */}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                                    Module Command Center
                                </span>
                                <span className="text-xs text-slate-500">•</span>
                                <span className="text-xs text-slate-400 font-medium">Session Planning & Tabletop Operations</span>
                            </div>
                            <h2 
                                className="text-2xl sm:text-3xl fantasy-font text-white cursor-pointer hover:text-amber-400 flex items-center gap-2 group transition-colors mt-0.5"
                                onClick={async () => {
                                    const newTitle = await dialog.prompt("Enter campaign title:", skeleton.title);
                                    if (newTitle && newTitle.trim()) {
                                        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
                                        newSkeleton.title = newTitle.trim();
                                        updateCampaign({ moduleSkeleton: newSkeleton });
                                    }
                                }}
                                title="Click to rename campaign"
                            >
                                {skeleton.title}
                                <Icon name="edit-2" size={16} className="opacity-0 group-hover:opacity-100 text-amber-500 transition-opacity" />
                            </h2>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button 
                                onClick={exportModule} 
                                className="text-xs bg-indigo-900/30 hover:bg-indigo-900/60 text-indigo-300 hover:text-white border border-indigo-700/50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                            >
                                <Icon name="download" size={14} /> Export JSON
                            </button>
                            <button 
                                onClick={() => importFileInputRef.current?.click()} 
                                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                            >
                                <Icon name="upload" size={14} /> Import JSON
                            </button>
                            <button 
                                onClick={clearSkeleton} 
                                className="text-xs bg-red-950/30 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-800/40 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                            >
                                <Icon name="trash-2" size={14} /> Clear
                            </button>
                        </div>
                    </div>

                    {/* LIVE METRICS DASHBOARD BAR */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        {/* 1. Readiness % */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 font-bold text-sm">
                                {campaignStats.completionPct}%
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Campaign Ready</p>
                                <div className="w-24 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${campaignStats.completionPct}%` }} />
                                </div>
                            </div>
                        </div>

                        {/* 2. Chapters */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                                <Icon name="book" size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Chapters</p>
                                <p className="text-base font-bold text-white">{campaignStats.totalChapters} Act{campaignStats.totalChapters === 1 ? '' : 's'}</p>
                            </div>
                        </div>

                        {/* 3. Maps */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                                <Icon name="map" size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Maps Prepared</p>
                                <p className="text-base font-bold text-white">
                                    <span className="text-emerald-400">{campaignStats.readyMaps}</span> / {campaignStats.totalMaps}
                                </p>
                            </div>
                        </div>

                        {/* 4. Bestiary */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                                <Icon name="skull" size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Monsters Forged</p>
                                <p className="text-base font-bold text-white">
                                    <span className="text-rose-400">{campaignStats.readyMonsters}</span> / {campaignStats.totalMonsters}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-slate-800/60">
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:w-64">
                                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    type="text"
                                    placeholder="Search chapters, maps, monsters..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-amber-500"
                                />
                            </div>

                            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                                <button 
                                    onClick={() => setFilterMode('all')}
                                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${filterMode === 'all' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    All
                                </button>
                                <button 
                                    onClick={() => setFilterMode('missing')}
                                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${filterMode === 'missing' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Missing
                                </button>
                                <button 
                                    onClick={() => setFilterMode('ready')}
                                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${filterMode === 'ready' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Ready
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-slate-400">
                            <button onClick={() => toggleAllChapters(false)} className="hover:text-amber-400 transition-colors">Expand All</button>
                            <span>•</span>
                            <button onClick={() => toggleAllChapters(true)} className="hover:text-amber-400 transition-colors">Collapse All</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN CHAPTER LIST */}
            <div className="flex-1 overflow-y-auto custom-scroll p-4 sm:p-6">
                <div className="max-w-7xl w-full mx-auto space-y-6 pb-16">
                    {filteredChapters?.map((chapter, cIdx) => {
                        const isCollapsed = !!collapsedChapters[chapter.id];
                        const currentNpcs = data?.npcs || [];

                        return (
                            <div 
                                key={chapter.id} 
                                className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all ${draggedChapterIdx === cIdx ? 'opacity-50 border-amber-500/50' : 'hover:border-slate-700'}`}
                                draggable={draggedMapData === null}
                                onDragStart={(e) => handleChapterDragStart(e, cIdx)}
                                onDragOver={handleChapterDragOver}
                                onDrop={(e) => handleChapterDrop(e, cIdx)}
                                onDragEnd={() => setDraggedChapterIdx(null)}
                            >
                                {/* CHAPTER HEADER */}
                                <div className="bg-slate-800/80 border-b border-slate-700/80 p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                        <Icon name="grip-vertical" className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0" size={18} />
                                        
                                        <button 
                                            onClick={() => toggleChapterCollapse(chapter.id)} 
                                            className="text-slate-400 hover:text-amber-400 transition-colors p-1"
                                            title={isCollapsed ? "Expand Chapter" : "Collapse Chapter"}
                                        >
                                            <Icon name={isCollapsed ? "chevron-right" : "chevron-down"} size={18} />
                                        </button>

                                        {/* Status Tag */}
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                                            chapter.status === 'completed' 
                                                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400' 
                                                : chapter.status === 'active' 
                                                    ? 'bg-amber-950/60 border-amber-500/30 text-amber-400' 
                                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                        }`}>
                                            {chapter.status || 'Planned'}
                                        </span>

                                        {/* Chapter Title */}
                                        <div className="overflow-hidden">
                                            <div className="flex items-center gap-2">
                                                <h3 
                                                    className="font-bold text-white text-base sm:text-lg hover:text-amber-400 cursor-pointer transition-colors truncate"
                                                    onClick={() => setEditingChapterDetails(chapter)}
                                                >
                                                    {chapter.title}
                                                </h3>
                                                {chapter.levelRange && (
                                                    <span className="text-xs text-slate-400 shrink-0 font-medium">({chapter.levelRange})</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Shortcuts */}
                                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                        {/* Broadcast Intro to Chat */}
                                        <button 
                                            onClick={() => handleBroadcastChapterIntro(chapter)}
                                            className="text-xs bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 hover:text-amber-200 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                                            title="Broadcast Boxed Text Card to Chat"
                                        >
                                            <Icon name="message-square" size={13} /> Broadcast to Chat
                                        </button>

                                        {/* Clip to Journal */}
                                        <button 
                                            onClick={() => handleClipChapterToJournal(chapter)}
                                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow"
                                            title="Save chapter details to DM Journal"
                                        >
                                            <Icon name="book-marked" size={13} /> Journal
                                        </button>

                                        {/* Batch Forge Monsters */}
                                        <button 
                                            onClick={() => handleBatchForgeChapterMonsters(chapter)}
                                            className="text-xs bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 border border-rose-500/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow"
                                            title="Forge all missing chapter monsters into Bestiary"
                                        >
                                            <Icon name="hammer" size={13} /> Forge Bestiary
                                        </button>

                                        {/* AI Expand */}
                                        <button 
                                            onClick={() => handleExpandChapterWithAi(chapter)}
                                            disabled={isExpandingChapter === chapter.id}
                                            className="text-xs bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-400 hover:text-indigo-200 border border-indigo-500/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow disabled:opacity-50"
                                            title="AI: Add random encounters, traps, and maps"
                                        >
                                            {isExpandingChapter === chapter.id ? <Icon name="loader" size={13} className="animate-spin" /> : <Icon name="sparkles" size={13} />}
                                            AI Expand
                                        </button>

                                        {/* Edit Details */}
                                        <button 
                                            onClick={() => setEditingChapterDetails(chapter)}
                                            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                                            title="Edit Chapter Details"
                                        >
                                            <Icon name="settings" size={16} />
                                        </button>

                                        {/* Delete Chapter */}
                                        <button 
                                            onClick={() => handleDeleteItem(chapter.id, 'chapter', chapter.id)}
                                            className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30 transition-colors"
                                            title="Delete Chapter"
                                        >
                                            <Icon name="trash-2" size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* COLLAPSIBLE CHAPTER BODY */}
                                {!isCollapsed && (
                                    <div className="p-4 sm:p-5 flex flex-col gap-4">
                                        
                                        {/* Synopsis / Boxed Text Banner if present */}
                                        {chapter.synopsis && (
                                            <div className="bg-amber-950/20 border-l-4 border-amber-500/60 rounded-r-lg p-3 text-xs text-amber-200/90 italic font-serif leading-relaxed">
                                                <span className="font-sans font-bold text-amber-400 not-italic block mb-1 text-[10px] uppercase tracking-wider">
                                                    Read-Aloud Boxed Text:
                                                </span>
                                                {chapter.synopsis}
                                            </div>
                                        )}

                                        {/* MAPS LIST FOR CHAPTER */}
                                        <div 
                                            className="flex flex-col gap-4"
                                            onDragOver={handleMapDragOver}
                                            onDrop={(e) => {
                                                if (draggedMapData) handleMapDrop(e, chapter.id, chapter.maps?.length || 0);
                                            }}
                                        >
                                            {chapter.maps?.map((map, mIdx) => {
                                                const monsters = map.monsters || [];
                                                const lore = map.lore || [];
                                                const isMapReady = map.status === 'ready' || !!map.mapUrl || !!map.activeMapId;

                                                return (
                                                    <div 
                                                        key={map.id}
                                                        className={`bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-slate-700 transition-colors ${draggedMapData?.mapIdx === mIdx && draggedMapData?.chapterId === chapter.id ? 'opacity-50 border-amber-500/50' : ''}`}
                                                        draggable
                                                        onDragStart={(e) => handleMapDragStart(e, chapter.id, mIdx)}
                                                        onDragOver={handleMapDragOver}
                                                        onDrop={(e) => handleMapDrop(e, chapter.id, mIdx)}
                                                        onDragEnd={(e) => { e.stopPropagation(); setDraggedMapData(null); }}
                                                    >
                                                        {/* Map Card Header */}
                                                        <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex justify-between items-center gap-3">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                <Icon name="grip-vertical" className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0" size={16} />
                                                                
                                                                {/* Map Thumbnail */}
                                                                <MapThumbnail mapUrl={map.mapUrl} name={map.name} />

                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span 
                                                                            className="font-bold text-slate-100 hover:text-amber-400 cursor-pointer hover:underline transition-colors text-sm"
                                                                            onClick={() => handleEditItem(chapter.id, 'maps', map)}
                                                                        >
                                                                            {map.name}
                                                                        </span>
                                                                        {isMapReady ? (
                                                                            <span className="text-[10px] bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                                                                                <Icon name="check" size={10} /> Ready
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[10px] bg-rose-950/60 border border-rose-500/30 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                                                                                Missing Map
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                                        {monsters.length} encounter{monsters.length === 1 ? '' : 's'} • {lore.length} 3D lore pin{lore.length === 1 ? '' : 's'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Map Action Controls */}
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {isMapReady ? (
                                                                    <>
                                                                        {/* 1-Click Launch Scene */}
                                                                        <button 
                                                                            onClick={() => handleLaunchScene(map)}
                                                                            className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-amber-950/40"
                                                                            title="Launch directly into the 3D Tactical Battlemap"
                                                                        >
                                                                            <Icon name="play" size={13} /> Launch Scene
                                                                        </button>
                                                                        
                                                                        {/* Re-source or Replace Map */}
                                                                        <button 
                                                                            onClick={() => fetchRedditMaps(map, chapter.id)}
                                                                            className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800 transition-colors"
                                                                            title="Re-source map art"
                                                                        >
                                                                            <Icon name="refresh-cw" size={14} />
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <button 
                                                                            onClick={() => fetchRedditMaps(map, chapter.id)}
                                                                            className="text-xs bg-indigo-900/60 hover:bg-indigo-600 text-indigo-200 hover:text-white px-3 py-1.5 rounded-lg border border-indigo-700/60 transition-colors flex items-center gap-1.5 shadow"
                                                                        >
                                                                            <Icon name="search" size={13} /> Source Map
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => { setUploadTargetMap({ ...map, chapterId: chapter.id }); fileInputRef.current?.click(); }}
                                                                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center shadow"
                                                                            title="Upload Map File"
                                                                        >
                                                                            <Icon name="upload" size={13} />
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                <button 
                                                                    onClick={() => handleDeleteItem(chapter.id, 'maps', map.id)}
                                                                    className="text-slate-500 hover:text-red-400 p-1.5 rounded hover:bg-red-950/30 transition-colors"
                                                                    title="Delete Map"
                                                                >
                                                                    <Icon name="trash-2" size={14} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Map Details: Monsters & Lore Grid */}
                                                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/30">
                                                            
                                                            {/* Monsters Column */}
                                                            <div>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <h5 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                                                                        <Icon name="skull" size={12} className="text-rose-400" /> Bestiary Creatures
                                                                    </h5>
                                                                    <button 
                                                                        onClick={() => setAddingToItem({ chapterId: chapter.id, mapId: map.id, type: 'monsters' })}
                                                                        className="text-[10px] text-amber-500 hover:text-amber-400 font-medium flex items-center gap-0.5"
                                                                    >
                                                                        <Icon name="plus" size={11} /> Add
                                                                    </button>
                                                                </div>

                                                                <ul className="space-y-1.5">
                                                                    {monsters.map(m => {
                                                                        const existingNpc = currentNpcs.find(n => n?.name?.toLowerCase() === m.name?.toLowerCase());
                                                                        const isReady = m.status === 'ready' || !!existingNpc;

                                                                        return (
                                                                            <li key={m.id} className="flex items-center justify-between text-xs bg-slate-900/70 rounded-lg p-2 border border-slate-800/80 hover:border-slate-700 group">
                                                                                <div 
                                                                                    className="flex items-center gap-2 overflow-hidden cursor-pointer flex-1 mr-2"
                                                                                    onClick={() => handleInspectMonster(m)}
                                                                                    title="Click to view stat block or forge"
                                                                                >
                                                                                    <span className="text-amber-500/80 font-bold shrink-0">{m.count || 1}x</span>
                                                                                    <span className="text-slate-200 group-hover:text-amber-300 transition-colors truncate font-medium">
                                                                                        {m.name}
                                                                                    </span>
                                                                                </div>

                                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                                    {isReady ? (
                                                                                        <button 
                                                                                            onClick={() => handleInspectMonster(m)}
                                                                                            className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold hover:bg-emerald-900/60 transition-colors"
                                                                                            title="View Statblock"
                                                                                        >
                                                                                            Ready
                                                                                        </button>
                                                                                    ) : (
                                                                                        <button 
                                                                                            onClick={() => handleForgeSingleMonster(m)}
                                                                                            disabled={forgingMonsterId === m.id}
                                                                                            className="text-[10px] bg-rose-950/60 text-rose-400 hover:text-white border border-rose-500/30 hover:bg-rose-600 px-2 py-0.5 rounded font-bold transition-colors flex items-center gap-1"
                                                                                            title="Forge creature into Bestiary"
                                                                                        >
                                                                                            {forgingMonsterId === m.id ? <Icon name="loader" size={10} className="animate-spin" /> : <Icon name="hammer" size={10} />}
                                                                                            Forge
                                                                                        </button>
                                                                                    )}
                                                                                    <button 
                                                                                        onClick={() => handleDeleteItem(chapter.id, 'monsters', m.id, map.id)}
                                                                                        className="text-slate-600 hover:text-red-400 p-0.5 rounded"
                                                                                    >
                                                                                        <Icon name="x" size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                    {monsters.length === 0 && (
                                                                        <li className="text-[11px] text-slate-600 italic py-1">No monsters assigned to this scene.</li>
                                                                    )}
                                                                </ul>
                                                            </div>

                                                            {/* Lore Pins Column */}
                                                            <div>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <h5 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                                                                        <Icon name="scroll" size={12} className="text-amber-400" /> 3D Lore Pins & Secrets
                                                                    </h5>
                                                                    <button 
                                                                        onClick={() => setAddingToItem({ chapterId: chapter.id, mapId: map.id, type: 'lore' })}
                                                                        className="text-[10px] text-amber-500 hover:text-amber-400 font-medium flex items-center gap-0.5"
                                                                    >
                                                                        <Icon name="plus" size={11} /> Add
                                                                    </button>
                                                                </div>

                                                                <ul className="space-y-1.5">
                                                                    {lore.map(l => (
                                                                        <li key={l.id} className="flex items-center justify-between text-xs bg-slate-900/70 rounded-lg p-2 border border-slate-800/80 hover:border-slate-700 group">
                                                                            <span 
                                                                                onClick={() => handleEditItem(chapter.id, 'lore', l, map.id)}
                                                                                className="text-slate-300 hover:text-amber-300 cursor-pointer transition-colors truncate font-medium"
                                                                            >
                                                                                {l.name}
                                                                            </span>
                                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                                {l.status === 'ready' ? (
                                                                                    <span className="text-[10px] text-emerald-400 font-bold">Placed</span>
                                                                                ) : (
                                                                                    <span className="text-[10px] text-slate-500">Unplaced</span>
                                                                                )}
                                                                                <button 
                                                                                    onClick={() => handleDeleteItem(chapter.id, 'lore', l.id, map.id)}
                                                                                    className="text-slate-600 hover:text-red-400 p-0.5 rounded"
                                                                                >
                                                                                    <Icon name="x" size={12} />
                                                                                </button>
                                                                            </div>
                                                                        </li>
                                                                    ))}
                                                                    {lore.length === 0 && (
                                                                        <li className="text-[11px] text-slate-600 italic py-1">No interactive lore pins defined.</li>
                                                                    )}
                                                                </ul>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {(!chapter.maps || chapter.maps.length === 0) && (
                                                <div className="bg-slate-950/30 border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                                                    No battlemaps in this chapter yet. Click below to add one.
                                                </div>
                                            )}

                                            <button 
                                                onClick={() => setAddingToItem({ chapterId: chapter.id, type: 'maps' })} 
                                                className="w-full text-xs text-slate-400 hover:text-amber-400 bg-slate-950/40 hover:bg-slate-900 border border-dashed border-slate-800 hover:border-amber-500/50 rounded-xl py-2.5 transition-colors flex items-center justify-center gap-1.5 mt-1"
                                            >
                                                <Icon name="plus" size={14} /> Add Tactical Battlemap to Chapter
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* ADD NEW CHAPTER BUTTON */}
                    <div className="pt-2">
                        <button 
                            onClick={() => setAddingToItem({ type: 'chapter' })} 
                            className="w-full py-4 border-2 border-dashed border-slate-800 hover:border-amber-500/60 rounded-2xl text-slate-400 hover:text-amber-400 font-bold flex items-center justify-center gap-2 transition-all bg-slate-900/30 hover:bg-slate-900/70 shadow-lg text-sm"
                        >
                            <Icon name="plus-circle" size={18} /> Add New Adventure Chapter
                        </button>
                    </div>
                </div>
            </div>

            {/* SOURCING MODAL */}
            {sourcingMap && (
                <MapSourcingModal 
                    sourcingMap={sourcingMap}
                    onClose={() => setSourcingMap(null)}
                    campaignCode={campaignCode}
                    skeleton={skeleton}
                    updateCampaign={updateCampaign}
                    data={data}
                    aiHelper={aiHelper}
                    generateNpc={generateNpc}
                />
            )}

            {/* MANUAL ADD / EDIT ITEM MODAL */}
            {addingToItem && (
                <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-6 backdrop-blur-sm animate-in zoom-in-95">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-sm w-full">
                        <h3 className="text-lg font-bold text-amber-500 mb-4 flex items-center gap-2">
                            <Icon name={editingItemId ? 'edit-2' : 'plus-circle'} size={20} />
                            {editingItemId ? 'Edit' : 'Add'} {addingToItem.type.replace(/s$/, '')}
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Name / Title</label>
                                <input 
                                    type="text"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-amber-500 outline-none text-sm"
                                    placeholder={addingToItem.type === 'chapter' ? 'e.g. Chapter 2: The Catacombs' : 'e.g. Underground Throne Room'}
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            
                            {addingToItem.type === 'monsters' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Creature Count</label>
                                    <input 
                                        type="number"
                                        min="1"
                                        max="50"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-amber-500 outline-none text-sm"
                                        value={newItemCount}
                                        onChange={(e) => setNewItemCount(parseInt(e.target.value) || 1)}
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-6 flex justify-end gap-2">
                            <button 
                                onClick={() => { setAddingToItem(null); setEditingItemId(null); }} 
                                className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleManualAdd} 
                                disabled={!newItemName.trim()} 
                                className="px-4 py-2 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow"
                            >
                                {editingItemId ? 'Save Changes' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CHAPTER DETAILS & NOTES MODAL */}
            {editingChapterDetails && (
                <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-6 backdrop-blur-sm animate-in zoom-in-95">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto custom-scroll">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 fantasy-font">
                                <Icon name="bookmark" className="text-amber-500" size={20} />
                                Chapter Settings & Synopsis
                            </h3>
                            <button onClick={() => setEditingChapterDetails(null)} className="text-slate-400 hover:text-white">
                                <Icon name="x" size={18} />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div>
                                <label className="block font-bold text-slate-400 mb-1">Chapter Title</label>
                                <input 
                                    type="text" 
                                    value={editingChapterDetails.title || ''}
                                    onChange={(e) => setEditingChapterDetails({ ...editingChapterDetails, title: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-amber-500 text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-bold text-slate-400 mb-1">Recommended Level</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Levels 3–5"
                                        value={editingChapterDetails.levelRange || ''}
                                        onChange={(e) => setEditingChapterDetails({ ...editingChapterDetails, levelRange: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-amber-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-400 mb-1">Pacing Status</label>
                                    <select 
                                        value={editingChapterDetails.status || 'planned'}
                                        onChange={(e) => setEditingChapterDetails({ ...editingChapterDetails, status: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-amber-500 text-sm"
                                    >
                                        <option value="planned">Planned</option>
                                        <option value="active">Active Session</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-slate-400 mb-1">
                                    Read-Aloud Synopsis / Boxed Narrative
                                </label>
                                <textarea 
                                    rows={4}
                                    placeholder="Atmospheric boxed text to read to players upon arrival..."
                                    value={editingChapterDetails.synopsis || ''}
                                    onChange={(e) => setEditingChapterDetails({ ...editingChapterDetails, synopsis: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-amber-500 text-xs resize-none"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-slate-400 mb-1">
                                    DM Secrets, Room Traps & Objectives
                                </label>
                                <textarea 
                                    rows={4}
                                    placeholder="Secrets to discover, DC checks, enemy tactics..."
                                    value={editingChapterDetails.notes || ''}
                                    onChange={(e) => setEditingChapterDetails({ ...editingChapterDetails, notes: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-amber-500 text-xs resize-none"
                                />
                            </div>
                        </div>

                        <div className="mt-6 pt-3 border-t border-slate-800 flex justify-end gap-2">
                            <button 
                                onClick={() => setEditingChapterDetails(null)}
                                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveChapterDetails}
                                className="px-5 py-2 text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors shadow"
                            >
                                Save Chapter Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MONSTER 5E STAT BLOCK INSPECTOR MODAL */}
            {inspectedMonster && (
                <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in-95">
                    <div className="bg-stone-900 border-2 border-amber-600/60 rounded-2xl p-6 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto custom-scroll text-stone-200">
                        {/* 5e Stat Block Header */}
                        <div className="flex justify-between items-start border-b-2 border-red-900/60 pb-3 mb-3">
                            <div>
                                <h3 className="text-2xl font-bold font-serif text-amber-500 tracking-wide">{inspectedMonster.name}</h3>
                                <p className="text-xs italic text-stone-400">{inspectedMonster.race || 'Creature'} • {inspectedMonster.class || 'Monster'}</p>
                            </div>
                            <button onClick={() => setInspectedMonster(null)} className="text-stone-400 hover:text-white p-1">
                                <Icon name="x" size={20} />
                            </button>
                        </div>

                        {/* AC, HP, Speed */}
                        <div className="text-xs space-y-1 py-1 border-b border-stone-800">
                            <p><strong className="text-amber-400 font-serif">Armor Class:</strong> {inspectedMonster.ac || 10}</p>
                            <p><strong className="text-amber-400 font-serif">Hit Points:</strong> {inspectedMonster.hp?.max || inspectedMonster.hp?.current || 10}</p>
                            <p><strong className="text-amber-400 font-serif">Speed:</strong> {inspectedMonster.speed || '30 ft.'}</p>
                        </div>

                        {/* Ability Scores */}
                        <div className="grid grid-cols-6 gap-1 my-3 text-center bg-stone-950/60 p-2 rounded-lg border border-stone-800">
                            {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(stat => {
                                const score = inspectedMonster.stats?.[stat] || 10;
                                const mod = Math.floor((score - 10) / 2);
                                return (
                                    <div key={stat}>
                                        <p className="text-[10px] font-bold uppercase text-amber-500 font-serif">{stat}</p>
                                        <p className="text-sm font-bold text-white">{score}</p>
                                        <p className="text-[10px] text-stone-400">{mod >= 0 ? `+${mod}` : mod}</p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Actions */}
                        {inspectedMonster.customActions && inspectedMonster.customActions.length > 0 && (
                            <div className="my-3 border-t border-stone-800 pt-2">
                                <h4 className="text-xs font-bold uppercase font-serif tracking-wider text-red-400 mb-2">Actions</h4>
                                <div className="space-y-2">
                                    {inspectedMonster.customActions.map((action, idx) => (
                                        <div key={idx} className="text-xs bg-stone-950/40 p-2 rounded border border-stone-800">
                                            <p className="font-bold text-amber-300 font-serif">{action.name} {action.hit && <span className="font-mono text-stone-400">({action.hit})</span>}</p>
                                            <p className="text-stone-300 text-[11px] mt-0.5">{action.desc}</p>
                                            {action.dmg && <p className="text-[10px] text-red-400 mt-0.5 font-mono">Damage: {action.dmg}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 pt-3 border-t border-stone-800 flex justify-end">
                            <button 
                                onClick={() => setInspectedMonster(null)}
                                className="px-5 py-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold rounded-lg transition-colors"
                            >
                                Close Inspector
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden File Inputs */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleMapUpload} 
                accept="image/*" 
                className="hidden" 
            />
            <input 
                type="file" 
                ref={importFileInputRef} 
                onChange={handleImportModuleFile} 
                accept=".json" 
                className="hidden" 
            />
        </div>
    );
};

export default ModuleHub;