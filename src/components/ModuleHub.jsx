import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { storeChunkedMap } from '../utils/storageUtils';
import { createMap } from '../utils/mapService';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { searchGithubModels } from '../utils/miniManifest';
import MapSourcingModal from './MapSourcingModal';
import { fulfillMapData } from '../utils/moduleFulfillment';
import { useToast } from './ToastProvider';

const ModuleHub = ({ data, updateCampaign, aiHelper, loreChunks, campaignCode, generateNpc }) => {
    const toast = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [promptText, setPromptText] = useState('');
    const skeleton = data?.moduleSkeleton || data?.campaign?.moduleSkeleton;

    // Sourcing States
    const [sourcingMap, setSourcingMap] = useState(null); 
    const [uploadTargetMap, setUploadTargetMap] = useState(null);
    const fileInputRef = useRef(null);

    // Edit & Add States
    const [editingChapterId, setEditingChapterId] = useState(null);
    const [addingToItem, setAddingToItem] = useState(null); // { chapterId, mapId, type: 'maps' | 'monsters' | 'lore' }
    
    // Can be used for adding OR editing
    const [editingItemId, setEditingItemId] = useState(null);
    const [newItemName, setNewItemName] = useState('');
    const [newItemCount, setNewItemCount] = useState(1);

    // Drag and Drop States
    const [draggedChapterIdx, setDraggedChapterIdx] = useState(null);
    const [draggedMapData, setDraggedMapData] = useState(null);

    const handleChapterDragStart = (e, index) => {
        setDraggedChapterIdx(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData('text/plain', 'chapter');
    };

    const handleChapterDragOver = (e) => {
        if (draggedChapterIdx !== null) {
            e.preventDefault();
        }
    };

    const handleChapterDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedChapterIdx === null || draggedChapterIdx === dropIndex) return;
        
        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
        const [draggedItem] = newSkeleton.chapters.splice(draggedChapterIdx, 1);
        newSkeleton.chapters.splice(dropIndex, 0, draggedItem);
        
        updateCampaign({ 'moduleSkeleton': newSkeleton });
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
            updateCampaign({ 'moduleSkeleton': newSkeleton });
        }
        setDraggedMapData(null);
    };

    const handleDeleteItem = (chapterId, itemType, itemId, mapId = null) => {
        const msg = itemType === 'chapter' 
            ? "Are you sure you want to delete this entire chapter and all its contents?" 
            : "Are you sure you want to remove this requirement?";
        if (!confirm(msg)) return;
        
        const newSkeleton = JSON.parse(JSON.stringify(skeleton));
        
        if (itemType === 'chapter') {
            newSkeleton.chapters = newSkeleton.chapters.filter(c => c.id !== chapterId);
            updateCampaign({ 'moduleSkeleton': newSkeleton });
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
            updateCampaign({ 'moduleSkeleton': newSkeleton });
        }
    };

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
                const newChapter = { id: `c_${Date.now()}`, title: newItemName.trim(), maps: [] };
                newSkeleton.chapters.push(newChapter);
            }
            updateCampaign({ 'moduleSkeleton': newSkeleton });
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
                updateCampaign({ 'moduleSkeleton': newSkeleton });
            }
        }
        }
        
        setAddingToItem(null);
        setEditingItemId(null);
        setNewItemName('');
        setNewItemCount(1);
    };

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

    const fetchMonsterFrom5eApi = async (monsterName) => {
        if (!monsterName || monsterName.toLowerCase() === 'unknown') return null;
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/monsters?name=${encodeURIComponent(monsterName)}`);
            const data = await res.json();
            if (data.count > 0) {
                const match = data.results.find(r => r?.name?.toLowerCase() === monsterName?.toLowerCase()) || data.results[0];
                const detailRes = await fetch(`https://www.dnd5eapi.co${match.url}`);
                const m = await detailRes.json();
                
                const acVal = Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class;
                const speedStr = typeof m.speed === 'object' ? Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;

                const getMod = (score) => Math.floor((score - 10) / 2);
                const modifiers = {
                    str: getMod(m.strength), dex: getMod(m.dexterity), con: getMod(m.constitution),
                    int: getMod(m.intelligence), wis: getMod(m.wisdom), cha: getMod(m.charisma)
                };

                const mapAction = (a, type) => {
                    let dmgString = (a.damage || []).map(d => `${d.damage_dice || ''} ${d.damage_type?.name || ''}`).join(' + ').trim();
                    let hitString = a.attack_bonus ? `+${a.attack_bonus}` : "";
                    let dcString = a.dc ? `DC ${a.dc.dc_value} ${a.dc.dc_type?.name || ''}` : "";
                    return {
                        name: a.name + (a.usage ? ` (${a.usage.type} ${a.usage.times || a.usage.dice || ''})` : ""),
                        desc: a.desc || "",
                        type: type,
                        category: "Attack",
                        hit: hitString || dcString,
                        dmg: dmgString
                    };
                };

                return {
                    id: Date.now(),
                    isHidden: true,
                    name: m.name,
                    race: `${m.size} ${m.type} (${m.alignment})`,
                    class: "Monster",
                    level: m.challenge_rating,
                    hp: { current: m.hit_points, max: m.hit_points },
                    ac: acVal,
                    speed: speedStr,
                    stats: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
                    modifiers: modifiers,
                    image: m.image ? `https://www.dnd5eapi.co${m.image}` : null,
                    quirk: "SRD Import",
                    bio: { backstory: `Imported from D&D 5e API.\nXP: ${m.xp}`, appearance: `A ${m.size} ${m.type}.` },
                    customActions: [
                        ...(m.actions || []).map(a => mapAction(a, 'Action')),
                        ...(m.legendary_actions || []).map(a => mapAction(a, 'Legendary Action')),
                        ...(m.reactions || []).map(a => mapAction(a, 'Reaction'))
                    ],
                    features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" }))
                };
            }
        } catch (e) {}
        return null;
    };

    const fetchRedditMaps = async (mapObj, chapterId) => {
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

    const generateSkeleton = async () => {
        if (!promptText.trim() && (!loreChunks || loreChunks.length === 0)) return alert("Enter a prompt or upload a PDF to the Archives.");
        setIsGenerating(true);

        let contextSource = promptText ? `Based on the following request: "${promptText}"` : "Based on the uploaded lore archives.";
        if (loreChunks && loreChunks.length > 0) {
            const archiveSummary = loreChunks.slice(0, 20).map(c => c.content).join('\n').substring(0, 15000);
            contextSource += `\n\nArchive Context:\n${archiveSummary}`;
        }

        const prompt = `
You are the DungeonMind Module Assembler.
${contextSource}
Create a "Campaign Skeleton" JSON. Output ONLY valid JSON, no markdown, no backticks.
The JSON must follow this exact schema:
{
  "title": "Campaign Title",
  "chapters": [
    {
      "id": "unique_string_id",
      "title": "Chapter 1: Name",
              "maps": [
                { 
                  "id": "m1", 
                  "name": "Map Name", 
                  "status": "missing",
                  "monsters": [{ "id": "mon1", "name": "Monster Name", "status": "missing", "count": 1 }],
                  "lore": [{ "id": "l1", "name": "Lore Snippet Name", "status": "missing" }]
                }
              ]
    }
  ]
}
Ensure there are at least 2 chapters. Include essential maps, monsters, and lore locations.
CRITICAL INSTRUCTION: Do NOT use placeholders like "Unknown". If there are no specific enemies or lore items, omit them or leave the array empty.
`;
        try {
            let res = await localAiHelper([{ role: 'user', content: prompt }]);
            console.log("Raw AI Response:", res);
            
            if (!res) throw new Error("Empty response from AI");
            
            const match = typeof res === 'string' ? res.match(/\{[\s\S]*\}/) : null;
            if (!match) {
                console.error("Failed to parse JSON from AI string. The string was:", res);
                throw new Error("No JSON found in response");
            }
            
            const newSkeleton = JSON.parse(match[0]);
            
            // Add unique IDs to everything just to be safe
            newSkeleton.chapters.forEach((chap, cIdx) => {
                chap.id = chap.id || `c_${Date.now()}_${cIdx}`;
                chap.maps?.forEach((m, i) => {
                    m.id = m.id || `m_${Date.now()}_${cIdx}_${i}`;
                    m.monsters?.forEach((mon, j) => mon.id = mon.id || `mon_${Date.now()}_${cIdx}_${i}_${j}`);
                    m.lore?.forEach((l, j) => l.id = l.id || `l_${Date.now()}_${cIdx}_${i}_${j}`);
                });
                
                // Fallback for older schemas
                chap.monsters?.forEach((m, i) => m.id = m.id || `mon_${Date.now()}_${cIdx}_${i}`);
                chap.lore?.forEach((m, i) => m.id = m.id || `l_${Date.now()}_${cIdx}_${i}`);
            });

            await updateCampaign({
                'moduleSkeleton': newSkeleton
            });
        } catch (e) {
            console.error("Failed to generate skeleton:", e);
            alert("Failed to generate campaign skeleton. See console.");
        } finally {
            setIsGenerating(false);
        }
    };

    const createManualSkeleton = async () => {
        const emptySkeleton = {
            title: "Custom Campaign",
            chapters: [
                { id: `c_${Date.now()}`, title: "Chapter 1", maps: [] }
            ]
        };
        try {
            await updateCampaign({ 'moduleSkeleton': emptySkeleton });
            toast("Manual campaign created.", "success");
        } catch (err) {
            console.error(err);
            toast("Failed to create manual campaign.", "error");
        }
    };

    const clearSkeleton = async () => {
        if(confirm("Are you sure you want to delete the current module skeleton?")) {
            try {
                await updateCampaign({
                    'moduleSkeleton': null,
                    'campaign.moduleSkeleton': null
                });
                toast("Module cleared.", "info");
            } catch (err) {
                console.error(err);
                toast("Failed to clear module.", "error");
            }
        }
    };

    const exportModule = () => {
        if (!skeleton) return;
        
        // In a full implementation, you would also fetch all the actual Maps, NPCs, and Assets
        // from Firestore to bundle them into a single massive JSON.
        // For this prototype, we export the skeleton and the current NPCs as a proof of concept.
        const exportData = {
            version: '1.0',
            type: 'DungeonMind_Module',
            skeleton: skeleton,
            npcs: data?.npcs || []
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${skeleton.title.replace(/\s+/g, '_')}_Module.json`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    if (!skeleton) {
        return (
            <div className="h-full bg-slate-900 flex flex-col items-center justify-center p-6 overflow-hidden">
                <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-8 text-center shadow-2xl">
                    <Icon name="book-plus" size={48} className="text-amber-500 mb-4 mx-auto" />
                    <h2 className="text-2xl font-bold text-white mb-2 fantasy-font">Construct Campaign from Source</h2>
                    <p className="text-slate-400 text-sm mb-6">
                        Enter a module name (e.g. "Dragon of Icespire Peak") or a short description to generate a structured campaign skeleton.
                        {loreChunks && loreChunks.length > 0 && <span className="block mt-2 text-amber-500 font-bold"><Icon name="library" size={14} className="inline mr-1"/> Archives Loaded: ({loreChunks.length} pages available for context)</span>}
                    </p>
                    <textarea 
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-amber-500 outline-none mb-4 h-24 resize-none"
                        placeholder={loreChunks && loreChunks.length > 0 ? "Leave blank to auto-generate from archives, or add specific instructions..." : "Build a module for 'Curse of Strahd'..."}
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                    />
                    <button 
                        onClick={generateSkeleton} 
                        disabled={isGenerating}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isGenerating ? <Icon name="loader" className="animate-spin" size={20} /> : <Icon name="hammer" size={20} />}
                        {isGenerating ? 'Forging Skeleton...' : 'Generate Skeleton'}
                    </button>
                    
                    <div className="flex items-center gap-4 my-4 opacity-50">
                        <div className="flex-1 h-px bg-slate-500"></div>
                        <span className="text-xs font-bold text-slate-400 uppercase">Or</span>
                        <div className="flex-1 h-px bg-slate-500"></div>
                    </div>
                    
                    <button 
                        onClick={createManualSkeleton} 
                        disabled={isGenerating}
                        className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 disabled:opacity-50 text-slate-300 hover:text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Icon name="pencil" size={20} />
                        Create Manually
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-slate-950 flex flex-col p-0 overflow-hidden">
            <div className="max-w-7xl w-full mx-auto flex flex-col h-full gap-6 p-6 md:p-10">
                
                {/* HEADER */}
                <div className="shrink-0 flex justify-between items-center border-b border-slate-700 pb-4">
                    <div>
                        <h2 
                            className="text-3xl fantasy-font text-amber-500 cursor-pointer hover:underline flex items-center gap-2 group"
                            onClick={() => {
                                const newTitle = prompt("Enter new campaign title:", skeleton.title);
                                if (newTitle && newTitle.trim()) {
                                    const newSkeleton = JSON.parse(JSON.stringify(skeleton));
                                    newSkeleton.title = newTitle.trim();
                                    updateCampaign({ moduleSkeleton: newSkeleton });
                                }
                            }}
                            title="Edit Campaign Title"
                        >
                            {skeleton.title}
                            <Icon name="edit-2" size={16} className="opacity-0 group-hover:opacity-100 text-amber-500/50 transition-opacity" />
                        </h2>
                        <p className="text-slate-400 text-sm">Module Command Center</p>
                    </div>
                    <div className="text-right flex gap-2">
                        <button onClick={exportModule} className="text-xs bg-indigo-900/30 hover:bg-indigo-900/60 text-indigo-400 border border-indigo-800/50 px-3 py-1.5 rounded transition-colors flex items-center gap-1">
                            <Icon name="download" size={14} /> Export JSON
                        </button>
                        <button onClick={clearSkeleton} className="text-xs bg-red-900/30 hover:bg-red-900/60 text-red-400 border border-red-800/50 px-3 py-1.5 rounded transition-colors flex items-center gap-1">
                            <Icon name="trash-2" size={14} /> Clear Module
                        </button>
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-6">
                    {skeleton.chapters?.map((chapter, cIdx) => {
                        return (
                        <div key={chapter.id} 
                             className={`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-xl hover:shadow-amber-900/10 transition-all ${draggedChapterIdx === cIdx ? 'opacity-50 border-amber-500/50' : 'hover:border-amber-500/50'}`}
                             draggable={draggedMapData === null}
                             onDragStart={(e) => handleChapterDragStart(e, cIdx)}
                             onDragOver={handleChapterDragOver}
                             onDrop={(e) => handleChapterDrop(e, cIdx)}
                             onDragEnd={() => setDraggedChapterIdx(null)}
                        >
                            <div className="bg-slate-800/80 border-b border-slate-700 p-4 font-bold text-lg text-white flex items-center justify-between group">
                                <div className="flex items-center gap-2">
                                    <Icon name="grip-vertical" className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing" size={20} />
                                    <Icon name="bookmark" className="text-amber-500" size={20} /> 
                                    <span 
                                        className="cursor-pointer hover:text-amber-400 hover:underline"
                                        onClick={() => handleEditItem(chapter.id, 'chapter', { id: chapter.id, title: chapter.title })}
                                    >
                                        {chapter.title}
                                    </span>
                                </div>
                                <button onClick={() => handleDeleteItem(chapter.id, 'chapter', chapter.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete Chapter">
                                    <Icon name="trash-2" size={16} />
                                </button>
                            </div>
                            
                            <div className="p-4 flex flex-col gap-4"
                                 onDragOver={handleMapDragOver}
                                 onDrop={(e) => {
                                     if (draggedMapData) {
                                         handleMapDrop(e, chapter.id, chapter.maps?.length || 0);
                                     }
                                 }}
                            >
                                {chapter.maps?.map((map, mIdx) => {
                                    const monsters = map.monsters || [];
                                    const lore = map.lore || [];
                                    return (
                                        <div key={map.id} 
                                             className={`bg-slate-950/40 border border-slate-800 rounded-lg overflow-hidden shadow-sm hover:border-slate-700 transition-colors ${draggedMapData?.mapIdx === mIdx && draggedMapData?.chapterId === chapter.id ? 'opacity-50 border-amber-500/50' : ''}`}
                                             draggable
                                             onDragStart={(e) => handleMapDragStart(e, chapter.id, mIdx)}
                                             onDragOver={handleMapDragOver}
                                             onDrop={(e) => handleMapDrop(e, chapter.id, mIdx)}
                                             onDragEnd={(e) => { e.stopPropagation(); setDraggedMapData(null); }}
                                        >
                                            <div className="p-3 bg-slate-900/60 border-b border-slate-700/50 flex justify-between items-center group">
                                                <div className="flex items-center gap-2">
                                                    <Icon name="grip-vertical" className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0" size={16} />
                                                    <button onClick={() => handleDeleteItem(chapter.id, 'maps', map.id)} className="text-red-500 hover:text-red-400 shrink-0">
                                                        <Icon name="minus-circle" size={14} />
                                                    </button>
                                                    <Icon name="map" size={16} className="text-indigo-400" />
                                                    <span 
                                                        className="font-bold text-slate-200 cursor-pointer hover:text-amber-400 hover:underline"
                                                        onClick={() => handleEditItem(chapter.id, 'maps', map)}
                                                    >{map.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {map.status === 'ready' ? 
                                                        <Icon name="check-circle" size={16} className="text-green-500" /> : 
                                                        <div className="flex gap-1 shrink-0">
                                                            <button onClick={() => fetchRedditMaps(map, chapter.id)} className="text-[10px] bg-indigo-900/50 hover:bg-indigo-600 text-indigo-300 hover:text-white px-2 py-1 rounded border border-indigo-700 transition-colors flex items-center gap-1 shadow">
                                                                <Icon name="search" size={10}/> Source
                                                            </button>
                                                            <button onClick={() => { setUploadTargetMap({...map, chapterId: chapter.id}); fileInputRef.current?.click(); }} className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-2 py-1 rounded border border-slate-600 transition-colors flex items-center shadow">
                                                                <Icon name="upload" size={10}/>
                                                            </button>
                                                        </div>
                                                    }
                                                </div>
                                            </div>
                                            
                                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1"><Icon name="skull" size={12}/> Monsters</h5>
                                                    <ul className="space-y-1">
                                                        {monsters.map(m => (
                                                            <li key={m.id} className="flex items-center justify-between text-xs bg-slate-950/50 rounded p-1.5 border border-slate-800/50 hover:border-slate-700 group">
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    <button onClick={() => handleDeleteItem(chapter.id, 'monsters', m.id, map.id)} className="text-red-500/70 hover:text-red-400 shrink-0">
                                                                        <Icon name="minus-circle" size={12} />
                                                                    </button>
                                                                    <span onClick={() => handleEditItem(chapter.id, 'monsters', m, map.id)} className="truncate cursor-pointer hover:text-amber-400">
                                                                        <span className="text-amber-500/70 mr-1">{m.count}x</span> {m.name}
                                                                    </span>
                                                                </div>
                                                                {m.status === 'ready' ? 
                                                                    <Icon name="check-circle" size={12} className="text-green-500" /> : 
                                                                    <span className="text-[9px] text-red-500">Missing</span>
                                                                }
                                                            </li>
                                                        ))}
                                                        <li>
                                                            <button onClick={() => setAddingToItem({ chapterId: chapter.id, mapId: map.id, type: 'monsters' })} className="w-full text-[10px] text-slate-500 hover:text-amber-400 bg-slate-900/30 border border-dashed border-slate-700 hover:border-amber-500/50 rounded py-1 transition-colors flex items-center justify-center gap-1 mt-1">
                                                                <Icon name="plus" size={12} /> Add Monster
                                                            </button>
                                                        </li>
                                                    </ul>
                                                </div>
                                                
                                                <div>
                                                    <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1"><Icon name="scroll" size={12}/> Lore</h5>
                                                    <ul className="space-y-1">
                                                        {lore.map(l => (
                                                            <li key={l.id} className="flex items-center justify-between text-xs bg-slate-950/50 rounded p-1.5 border border-slate-800/50 hover:border-slate-700 group">
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    <button onClick={() => handleDeleteItem(chapter.id, 'lore', l.id, map.id)} className="text-red-500/70 hover:text-red-400 shrink-0">
                                                                        <Icon name="minus-circle" size={12} />
                                                                    </button>
                                                                    <span onClick={() => handleEditItem(chapter.id, 'lore', l, map.id)} className="truncate cursor-pointer hover:text-amber-400">
                                                                        {l.name}
                                                                    </span>
                                                                </div>
                                                                {l.status === 'ready' ? 
                                                                    <Icon name="check-circle" size={12} className="text-green-500" /> : 
                                                                    <span className="text-[9px] text-red-500">Missing</span>
                                                                }
                                                            </li>
                                                        ))}
                                                        <li>
                                                            <button onClick={() => setAddingToItem({ chapterId: chapter.id, mapId: map.id, type: 'lore' })} className="w-full text-[10px] text-slate-500 hover:text-amber-400 bg-slate-900/30 border border-dashed border-slate-700 hover:border-amber-500/50 rounded py-1 transition-colors flex items-center justify-center gap-1 mt-1">
                                                                <Icon name="plus" size={12} /> Add Lore
                                                            </button>
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}

                                {(chapter.monsters?.length > 0 || chapter.lore?.length > 0) && (
                                    <div className="bg-slate-900/20 border border-dashed border-amber-500/30 rounded-lg p-3 mt-4">
                                        <h4 className="text-xs uppercase tracking-widest text-amber-500/70 font-bold mb-3 flex items-center gap-2"><Icon name="alert-circle" size={14}/> Legacy Chapter Items</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {chapter.monsters?.length > 0 && (
                                                <div>
                                                    <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Monsters</h5>
                                                    <ul className="space-y-1">
                                                        {chapter.monsters.map(m => (
                                                            <li key={m.id} className="flex items-center justify-between text-xs bg-slate-950/50 rounded p-1.5 border border-slate-800/50 group">
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    <button onClick={() => handleDeleteItem(chapter.id, 'monsters', m.id)} className="text-red-500/70 hover:text-red-400 shrink-0"><Icon name="minus-circle" size={12} /></button>
                                                                    <span onClick={() => handleEditItem(chapter.id, 'monsters', m)} className="truncate cursor-pointer hover:text-amber-400"><span className="text-amber-500/70 mr-1">{m.count}x</span> {m.name}</span>
                                                                </div>
                                                                {m.status === 'ready' ? <Icon name="check-circle" size={12} className="text-green-500" /> : <span className="text-[9px] text-red-500">Missing</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {chapter.lore?.length > 0 && (
                                                <div>
                                                    <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Lore</h5>
                                                    <ul className="space-y-1">
                                                        {chapter.lore.map(l => (
                                                            <li key={l.id} className="flex items-center justify-between text-xs bg-slate-950/50 rounded p-1.5 border border-slate-800/50 group">
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    <button onClick={() => handleDeleteItem(chapter.id, 'lore', l.id)} className="text-red-500/70 hover:text-red-400 shrink-0"><Icon name="minus-circle" size={12} /></button>
                                                                    <span onClick={() => handleEditItem(chapter.id, 'lore', l)} className="truncate cursor-pointer hover:text-amber-400">{l.name}</span>
                                                                </div>
                                                                {l.status === 'ready' ? <Icon name="check-circle" size={12} className="text-green-500" /> : <span className="text-[9px] text-red-500">Missing</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {(!chapter.maps || chapter.maps.length === 0) && <div className="text-xs text-slate-600 italic px-2">No maps required.</div>}
                                
                                <button onClick={() => setAddingToItem({ chapterId: chapter.id, type: 'maps' })} className="w-full text-xs text-slate-400 hover:text-amber-400 bg-slate-900/50 border border-dashed border-slate-700 hover:border-amber-500/50 rounded py-2 transition-colors flex items-center justify-center gap-1 mt-2">
                                    <Icon name="plus" size={14} /> Add Map
                                </button>
                            </div>
                        </div>
                    )})}
                    
                    <div className="pt-4 pb-12">
                        <button onClick={() => setAddingToItem({ type: 'chapter' })} className="w-full py-4 border-2 border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl text-slate-500 hover:text-amber-400 font-bold flex items-center justify-center gap-2 transition-colors">
                            <Icon name="plus-circle" size={20} /> Add New Chapter
                        </button>
                    </div>
                </div>
            </div>

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
            
            {/* MANUAL ADD/EDIT MODAL */}
            {addingToItem && (
                <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-6 backdrop-blur-sm animate-in zoom-in-95">
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
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none"
                                    placeholder={`e.g. "Secret Room"`}
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            
                            {addingToItem.type === 'monsters' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">Count</label>
                                    <input 
                                        type="number"
                                        min="1"
                                        max="50"
                                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none"
                                        value={newItemCount}
                                        onChange={(e) => setNewItemCount(parseInt(e.target.value) || 1)}
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => { setAddingToItem(null); setEditingItemId(null); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleManualAdd} disabled={!newItemName.trim()} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded transition-colors shadow">
                                {editingItemId ? 'Save Changes' : (addingToItem.type === 'chapter' ? 'Add Chapter' : (addingToItem.mapId ? 'Add to Map' : 'Add to Chapter'))}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleMapUpload} 
                accept="image/*" 
                className="hidden" 
            />
        </div>
    );
};

export default ModuleHub;