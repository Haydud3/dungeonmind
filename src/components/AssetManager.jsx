import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { storeChunkedMap, deleteChunkedMap, retrieveChunkedMap } from '../utils/storageUtils';
import { exportMapPreset, importMapPreset } from '../utils/presetManager';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { useDialog } from './DialogProvider';
import SketchfabImporter from './SketchfabImporter';
import MapGenerator from './MapGenerator';
import ResolvedImage from './ResolvedImage';

import { useResolvedUrl } from '../utils/useResolvedUrl';
import { fulfillMapData } from '../utils/moduleFulfillment';
import { subscribeToMap } from '../utils/mapService';
import { searchBattlemaps, getProxiedImageUrl } from '../utils/mapSearchService';

// Helper to generate a lightweight thumbnail so the gallery loads instantly
const generateThumbnail = (dataUrl) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 150;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const scale = Math.max(size / img.width, size / img.height);
            const x = (size - img.width * scale) / 2;
            const y = (size - img.height * scale) / 2;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => {
            console.warn("Failed to generate thumbnail for image");
            resolve(null);
        };
        img.src = dataUrl;
    });
};

const ThrottledSlider = ({ value, min, max, step, onChange, onDragStart, onDragEnd, className, disabled }) => {
    const [localVal, setLocalVal] = useState(value);
    const isDragging = useRef(false);

    useEffect(() => { 
        if (!isDragging.current) setLocalVal(value); 
    }, [value]);

    return (
        <input 
            type="range" min={min} max={max} step={step} 
            value={localVal}
            disabled={disabled}
            onPointerDown={() => { isDragging.current = true; if (onDragStart) onDragStart(); }}
            onPointerUp={() => { isDragging.current = false; setLocalVal(value); if (onDragEnd) onDragEnd(); }}
            onChange={(e) => {
                const v = parseFloat(e.target.value);
                setLocalVal(v);
                if (onChange) onChange(v);
            }}
            className={className}
        />
    );
};

// Stepper control for fine-tuning numeric properties with [-] and [+] nudge buttons
const NudgeStepper = ({ value, onChange, min = 0, max = 100, step = 0.05, unit = '', precision = 2 }) => {
    const numVal = typeof value === 'number' && !isNaN(value) ? value : 0;

    const handleStep = (delta) => {
        const next = Math.max(min, Math.min(max, parseFloat((numVal + delta).toFixed(precision))));
        onChange(next);
    };

    return (
        <div className="flex items-center gap-1 shrink-0">
            <button
                type="button"
                onClick={() => handleStep(-step)}
                className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                title={`Decrease by ${step}`}
            >
                <Icon name="minus" size={13} />
            </button>
            <input
                type="number"
                step={step}
                value={numVal}
                onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) {
                        onChange(Math.max(min, Math.min(max, parseFloat(v.toFixed(precision)))));
                    }
                }}
                className="w-16 h-7 bg-slate-900 border border-slate-700 rounded px-1.5 text-xs text-center text-white font-mono outline-none focus:border-amber-500"
            />
            {unit && <span className="text-[10px] text-slate-400 font-mono select-none">{unit}</span>}
            <button
                type="button"
                onClick={() => handleStep(step)}
                className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                title={`Increase by ${step}`}
            >
                <Icon name="plus" size={13} />
            </button>
        </div>
    );
};

const ENVIRONMENT_PRESETS = [
    { id: 'day', label: 'Sunny Day', icon: 'sun', activeClass: 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]' },
    { id: 'sunset', label: 'Sunset', icon: 'sunset', activeClass: 'border-orange-500 bg-orange-500/20 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.2)]' },
    { id: 'night', label: 'Midnight', icon: 'moon', activeClass: 'border-indigo-500 bg-indigo-500/20 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.2)]' },
    { id: 'fog', label: 'Thick Fog', icon: 'cloud', activeClass: 'border-slate-400 bg-slate-400/20 text-slate-200 shadow-[0_0_12px_rgba(148,163,184,0.2)]' },
    { id: 'rain', label: 'Rainstorm', icon: 'cloud-rain', activeClass: 'border-cyan-500 bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]' },
    { id: 'snow', label: 'Winter Snow', icon: 'snowflake', activeClass: 'border-sky-400 bg-sky-400/20 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.2)]' },
    { id: 'ash', label: 'Volcanic Ash', icon: 'flame', activeClass: 'border-red-500 bg-red-500/20 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.2)]' },
    { id: 'spores', label: 'Bioluminescent', icon: 'sparkles', activeClass: 'border-purple-500 bg-purple-500/20 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.2)]' },
    { id: 'swamp', label: 'Gloomy Swamp', icon: 'droplets', activeClass: 'border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]' },
];

const AssetThumbnail = ({ asset }) => {
    let imgUrl = asset.thumbnail || asset.url;
    if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && !imgUrl.includes('firebasestorage.googleapis.com') && !imgUrl.includes('wsrv.nl')) {
        imgUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&cors=1&w=256`;
    }

    const resolvedUrl = useResolvedUrl(imgUrl);

    if (resolvedUrl || (imgUrl && typeof imgUrl === 'string' && !imgUrl.startsWith('chunked:'))) {
        return <img src={resolvedUrl || imgUrl} className="w-full h-full object-cover" alt={asset.name} draggable={false} referrerPolicy="no-referrer" />;
    }
    return <div className="w-full h-full flex items-center justify-center bg-slate-900 border border-slate-700"><Icon name={asset.is3D ? "box" : "image"} size={32} className="text-slate-600 animate-pulse"/></div>;
};

const ResolvedMapImage = ({ url, name, className }) => {
    const resolvedUrl = useResolvedUrl(url);
    if (!resolvedUrl && url && url.startsWith('chunked:')) {
        return <div className="w-full h-full flex items-center justify-center bg-slate-800"><Icon name="loader" className="animate-spin text-slate-600" size={24} /></div>;
    }
    if (resolvedUrl || url) {
        return <img src={resolvedUrl || url} className={className} alt={name} referrerPolicy="no-referrer" />;
    }
    return <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-800"><Icon name="map" size={24} /></div>;
};

// 3-dot dropdown menu component mounted via Portal to avoid overflow-hidden clipping
const CardActionsMenu = ({ isOpen, onToggle, items }) => {
    const buttonRef = useRef(null);
    const [coords, setCoords] = useState(null);

    const updatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const menuHeight = items.length * 30 + 16;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

        setCoords({
            top: openUpwards ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
            right: Math.max(8, window.innerWidth - rect.right),
        });
    }, [items.length]);

    useEffect(() => {
        if (!isOpen) return;
        updatePosition();

        const handleClickOutside = (e) => {
            if (buttonRef.current && buttonRef.current.contains(e.target)) return;
            const menuEl = document.getElementById('floating-card-menu');
            if (menuEl && menuEl.contains(e.target)) return;
            onToggle(false);
        };

        const handleCloseOnScrollOrResize = () => {
            onToggle(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleCloseOnScrollOrResize, true);
        window.addEventListener('resize', handleCloseOnScrollOrResize);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleCloseOnScrollOrResize, true);
            window.removeEventListener('resize', handleCloseOnScrollOrResize);
        };
    }, [isOpen, onToggle, updatePosition]);

    const menuContent = isOpen && coords && typeof document !== 'undefined' ? (
        createPortal(
            <div 
                id="floating-card-menu"
                style={{
                    position: 'fixed',
                    top: `${coords.top}px`,
                    right: `${coords.right}px`,
                    zIndex: 99999,
                }}
                className="w-44 bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl py-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
            >
                {items.map((item, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => {
                            onToggle(false);
                            item.onClick();
                        }}
                        className={`w-full px-3 py-1.5 text-xs flex items-center gap-2 text-left transition-colors ${item.danger ? 'text-red-400 hover:bg-red-950/40 hover:text-red-300' : 'text-slate-200 hover:bg-slate-800 hover:text-amber-400'}`}
                    >
                        <Icon name={item.icon} size={14} className={item.danger ? 'text-red-400' : 'text-slate-400'} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>,
            document.body
        )
    ) : null;

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle(!isOpen);
                }}
                className="w-7 h-7 rounded-md bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white flex items-center justify-center backdrop-blur shadow transition-colors border border-slate-700"
                title="Map Actions"
            >
                <Icon name="more-vertical" size={14} />
            </button>

            {menuContent}
        </div>
    );
};

const AssetManager = ({ 
    campaignCode, 
    mapData: propMapData, 
    activeMapId: propActiveMapId, 
    updateMap, 
    onClose, 
    onSetBackground, 
    onSetHeightmap, 
    onGenerateMap, 
    onNewBlankMap, 
    allCharacters, 
    campaignData, 
    updateCampaign, 
    onSelectStamper, 
    importTarget, 
    aiHelper, 
    generateNpc,
    width = 420,
    onResizeMouseDown
}) => {
    const toast = useToast();
    const dialog = useDialog();
    const [assets, setAssets] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);
    const importPresetRef = useRef(null);
    const [activeTab, setActiveTab] = useState(importTarget ? 'web' : 'library');
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [assetCategory, setAssetCategory] = useState('Maps');
    const [editingMapData, setEditingMapData] = useState(null);

    // Dropdown menu state to ensure only one card menu is open at a time
    const [openMenuId, setOpenMenuId] = useState(null);

    // Sourcing / Discovery state
    const [redditQuery, setRedditQuery] = useState(importTarget?.name || '');
    const [redditResults, setRedditResults] = useState([]);
    const [isSourcing, setIsSourcing] = useState(false);
    const [inspectedMap, setInspectedMap] = useState(null);
    const [directUrlInput, setDirectUrlInput] = useState('');
    const [internalImportTarget, setInternalImportTarget] = useState(importTarget || null);

    // Settings Collapsible Sections
    const [expandedSections, setExpandedSections] = useState({
        atmosphere: true,
        grid: true,
        vision: true,
        elevation: false,
        backup: false
    });

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Target Map ID logic
    const targetMapId = (activeTab === 'settings' || activeTab === 'ai') && selectedAsset?.isSkeletonMap && selectedAsset?.activeMapId
        ? selectedAsset.activeMapId
        : propActiveMapId;

    const isEditingDifferentMap = targetMapId !== propActiveMapId;

    // Subscribe to map data for the settings tab when it's not the active map
    useEffect(() => {
        let unsubscribe = null;
        if (isEditingDifferentMap && targetMapId) {
            unsubscribe = subscribeToMap(campaignCode, targetMapId, (data) => {
                setEditingMapData(data || {});
            });
        } else {
            setEditingMapData(null);
        }
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [isEditingDifferentMap, targetMapId, campaignCode]);

    const mapData = isEditingDifferentMap ? editingMapData : propMapData;
    const activeMapId = targetMapId;

    const [isProcessingMap, setIsProcessingMap] = useState(false);
    const [processingStep, setProcessingStep] = useState('');

    const [uploadTargetMap, setUploadTargetMap] = useState(null);
    const mapFileInputRef = useRef(null);

    const [expandedChapters, setExpandedChapters] = useState(() => {
        const skeleton = campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton;
        const initial = {};
        if (skeleton?.chapters) {
            let foundActive = false;
            skeleton.chapters.forEach(c => {
                if (c.maps?.some(m => m.activeMapId === activeMapId)) {
                    initial[c.id] = true;
                    foundActive = true;
                }
            });
            if (!foundActive && skeleton.chapters.length > 0) {
                initial[skeleton.chapters[0].id] = true;
            }
        }
        return initial;
    });

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
        
        try {
            if (window.puter?.ai?.chat) {
                const promptString = Array.isArray(messages) ? messages.map(m => m.content).join('\n') : messages;
                const response = await window.puter.ai.chat(promptString);
                let extracted = response;
                if (typeof response === 'string') return response;
                if (response?.message?.content) extracted = response.message.content;
                else if (typeof response?.response?.text === 'function') extracted = await response.response.text();
                else if (typeof response?.text === 'function') extracted = await response.text();
                else if (response?.text) extracted = response.text;
                return typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
            }
        } catch (e) {
            console.error("Fallback AI failed", e);
        }
        toast("AI functions are not available in this view.", "warning");
        return null;
    };

    const localGenerateNpc = async (monsterName, instruction) => {
        if (!monsterName || monsterName.toLowerCase() === 'unknown') return null;
        if (typeof generateNpc === 'function') return generateNpc(monsterName, instruction);
        
        toast(`Searching 5e Archives for: ${monsterName}...`, "info");
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

                const npc = {
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
                
                if (!npc.image) {
                    const imagePrompt = `Dungeons and dragons official digital character illustration of a ${npc.name} ${npc.race || ''}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
                    let imageUrl = null;
                    if (window.puter?.ai?.txt2img) {
                        try {
                            const imgEl = await window.puter.ai.txt2img(imagePrompt, { provider: 'replicate-image-generation', model: 'black-forest-labs/flux-schnell', ratio: { w: 1, h: 1 } });
                            const response = await fetch(imgEl.src);
                            const blob = await response.blob();
                            imageUrl = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(blob);
                            });
                        } catch (e) {
                            console.error("Puter image gen failed", e);
                        }
                    }
                    npc.image = imageUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
                }
                return npc;
            }
        } catch (e) {
            console.error("5e API error", e);
        }
        
        toast(`Forging missing monster: ${monsterName} with AI...`, "info");
        const prompt = `Role: Fantasy bestiary writer. Task: Create a D&D 5e statblock for "${monsterName}". ${instruction || ''}\nOutput ONLY valid JSON.\n{\n  "name": "${monsterName}",\n  "race": "Medium Humanoid (Any Alignment)",\n  "class": "Monster",\n  "stats": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },\n  "hp": { "current": 15, "max": 15 },\n  "ac": 12,\n  "speed": "30 ft.",\n  "bio": { "appearance": "...", "backstory": "..." },\n  "customActions": [{ "name": "Shortsword", "desc": "Melee Weapon Attack", "type": "Action", "hit": "+4", "dmg": "1d6+2" }]\n}`;
        try {
            const res = await localAiHelper([{ role: 'user', content: prompt }]);
            if (!res) return null;
            const match = res.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(match[0]);
            
            const imagePrompt = `Dungeons and dragons official digital character illustration of a ${parsed.name} ${parsed.race || ''}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
            let imageUrl = null;
            if (window.puter?.ai?.txt2img) {
                try {
                    const imgEl = await window.puter.ai.txt2img(imagePrompt, { provider: 'replicate-image-generation', model: 'black-forest-labs/flux-schnell', ratio: { w: 1, h: 1 } });
                    const response = await fetch(imgEl.src);
                    const blob = await response.blob();
                    imageUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.error("Puter image gen failed", e);
                }
            }
            parsed.image = imageUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
            
            return parsed;
        } catch (e) {
            console.error("AI Generation failed", e);
        }
        return null;
    };

    useEffect(() => {
        if (importTarget) {
            setInternalImportTarget(importTarget);
            setRedditQuery(importTarget.name);
            setActiveTab('web');
            handleRedditSearch(importTarget.name);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRedditSearch = async (queryToSearch = redditQuery) => {
        if (!queryToSearch || !queryToSearch.trim()) return;
        setIsSourcing(true);
        setRedditResults([]);
        try {
            const results = await searchBattlemaps(queryToSearch);
            setRedditResults(results);
        } catch (e) {
            console.error("Battlemap search failed", e);
            toast("Search failed. Check console.", "error");
        }
        setIsSourcing(false);
    };

    // Grid Auto-Detection States
    const [isDetectingGrid, setIsDetectingGrid] = useState(false);
    const [gridDetectionResult, setGridDetectionResult] = useState(null);
    const [gridSubdivision, setGridSubdivision] = useState(1);
    const workerRef = useRef(null);

    const pendingMapUpdates = useRef({});
    const mapUpdateThrottle = useRef(null);

    const throttledUpdateMap = useCallback((updates) => {
        for (const key in updates) {
            if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
                pendingMapUpdates.current[key] = { ...pendingMapUpdates.current[key], ...updates[key] };
            } else {
                pendingMapUpdates.current[key] = updates[key];
            }
        }
        if (!mapUpdateThrottle.current) {
            mapUpdateThrottle.current = setTimeout(() => {
                updateMap(campaignCode, activeMapId, { ...pendingMapUpdates.current });
                pendingMapUpdates.current = {};
                mapUpdateThrottle.current = null;
            }, 100);
        }
    }, [campaignCode, activeMapId, updateMap]);

    useEffect(() => {
        return () => {
            if (mapUpdateThrottle.current) clearTimeout(mapUpdateThrottle.current);
        };
    }, []);

    const fetchAssets = async () => {
        if (!campaignCode) return;
        const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
        const q = query(assetsRef, orderBy('createdAt', 'desc'));
        try {
            const res = await getDocs(q);
            const fetched = res.docs.map(d => ({ id: d.id, ...d.data() }));
            setAssets([...fetched]);
        } catch (err) {
            console.error("Failed to fetch assets", err);
        }
    };

    useEffect(() => {
        if (activeTab === 'library') {
            fetchAssets();
        }
    }, [campaignCode, activeTab]);

    useEffect(() => {
        workerRef.current = new Worker(new URL('./gridDetection.worker.js', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'GRID_DETECTED') {
                setIsDetectingGrid(false);
                setGridDetectionResult(payload);
                setGridSubdivision(1);
            }
        };
        return () => workerRef.current?.terminate();
    }, []);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const isModel = file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf');
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64 = reader.result;
                    let thumbBase64 = null;
                    
                    if (!isModel) {
                        thumbBase64 = await generateThumbnail(base64);
                    }
                    
                    const chunkedId = await storeChunkedMap(base64, file.name);
                    
                    const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
                    
                    const assetData = { 
                        name: file.name, 
                        url: chunkedId, 
                        thumbnail: thumbBase64, 
                        createdAt: serverTimestamp(), 
                        category: assetCategory === 'All' ? (isModel ? 'Props' : 'Maps') : assetCategory 
                    };
                    if (isModel) {
                        assetData.is3D = true;
                        assetData.modelUrl = chunkedId;
                    }
                    
                    await addDoc(assetsRef, assetData);
                    await fetchAssets();
                    toast("Asset uploaded successfully!", "success");
                } catch (err) { 
                    console.error(err); 
                    toast("Processing failed.", "error"); 
                }
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error(err);
            toast("Upload failed.", "error");
            setIsUploading(false);
        }
        if (e.target) e.target.value = null;
    };

    const handleDeleteAsset = async (asset) => {
        if (!(await dialog.confirm(`Permanently delete "${asset.name}"?`))) return;

        try {
            const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
            await deleteDoc(assetRef);
            await deleteChunkedMap(asset.url);
            
            if (asset.thumbnailId) await deleteChunkedMap(asset.thumbnailId);
            if (asset.generatedMapUrl) await deleteChunkedMap(asset.generatedMapUrl);
            if (asset.generatedHeightmapUrl) await deleteChunkedMap(asset.generatedHeightmapUrl);

            setAssets(prev => prev.filter(a => a.id !== asset.id));

            if (mapData?.backgroundUrl === asset.url || mapData?.backgroundUrl === asset.generatedMapUrl) {
                onNewBlankMap(true);
            }
            toast("Asset deleted.", "info");
        } catch (err) {
            console.error("Error deleting asset:", err);
            toast("Failed to delete asset.", "error");
        }
    };

    const handleUpdateAssetLayer = async (asset, layerType, data) => {
        const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
        const updates = {};
        const mapUpdates = {};

        if (layerType === 'baseMap') {
            updates.generatedMapUrl = data;
            mapUpdates.backgroundUrl = data;
        } else if (layerType === 'heightMap') {
            updates.generatedHeightmapUrl = data;
            mapUpdates.heightmapUrl = data;
        } else if (layerType === 'normalMap') {
            updates.generatedNormalMapUrl = data;
            mapUpdates.normalMapUrl = data;
        } else if (layerType === 'materialMask') {
            updates.generatedMaterialMaskUrl = data;
            mapUpdates.materialMaskUrl = data;
        } else if (layerType === 'architectMask') {
            const currentFeatures = asset.generatedFeatures || { walls: {}, lights: [] };
            updates.generatedFeatures = { ...currentFeatures, walls: data.walls };
            
            const preservedWalls = {};
            if (mapData?.walls) {
                Object.values(mapData.walls).filter(Boolean).forEach(w => {
                    if (!w.id.includes('_gen_')) {
                        preservedWalls[w.id] = w;
                    }
                });
            }
            mapUpdates.walls = { ...preservedWalls, ...(data.walls || {}) };
        } else if (layerType === 'illuminationMask') {
            const currentFeatures = asset.generatedFeatures || { walls: {}, lights: [] };
            updates.generatedFeatures = { ...currentFeatures, lights: data.lights };
            mapUpdates.lights = data.lights || {};
        }

        if (asset.isSkeletonMap) {
            const newSkeleton = JSON.parse(JSON.stringify(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton));
            let skeletonUpdated = false;
            newSkeleton.chapters.forEach(c => {
                c.maps?.forEach(m => {
                    if (m.id === asset.id) {
                        if (layerType === 'baseMap') {
                            m.mapUrl = data;
                            m.image = data;
                            m.backgroundUrl = data;
                        } else if (layerType === 'heightMap') {
                            m.generatedHeightmapUrl = data;
                        } else if (layerType === 'normalMap') {
                            m.generatedNormalMapUrl = data;
                        } else if (layerType === 'materialMask') {
                            m.generatedMaterialMaskUrl = data;
                        } else if (layerType === 'architectMask' || layerType === 'illuminationMask') {
                            m.generatedFeatures = m.generatedFeatures || {};
                            if (layerType === 'architectMask') m.generatedFeatures.walls = data.walls;
                            if (layerType === 'illuminationMask') m.generatedFeatures.lights = data.lights;
                        }
                        skeletonUpdated = true;
                    }
                });
            });
            if (skeletonUpdated && updateCampaign) {
                await updateCampaign({ moduleSkeleton: newSkeleton });
            }
        } else {
            await updateDoc(assetRef, updates);
        }
        
        if (selectedAsset && selectedAsset.id === asset.id) {
            setSelectedAsset(prev => ({ ...prev, ...updates }));
        }
        
        const isActiveMap = mapData?.backgroundUrl === asset.generatedMapUrl || 
                            mapData?.backgroundUrl === asset.url || 
                            (layerType === 'baseMap' && mapData?.backgroundUrl === data);
                            
        if (isActiveMap && Object.keys(mapUpdates).length > 0) {
            updateMap(campaignCode, activeMapId, mapUpdates);
        }
    };

    const handleAutoDetectGrid = async (overrideUrl) => {
        const imageUrl = typeof overrideUrl === 'string' ? overrideUrl : mapData?.backgroundUrl;
        if (!imageUrl) {
            dialog.alert("Please set a map background first.");
            return;
        }
        setIsDetectingGrid(true);
        setGridDetectionResult(null);

        try {
            let finalUrl = imageUrl;
            let objectUrl = null;

            if (imageUrl.startsWith('chunked:')) {
                const blob = await retrieveChunkedMap(imageUrl);
                if (blob) {
                    objectUrl = URL.createObjectURL(blob);
                    finalUrl = objectUrl;
                } else {
                    throw new Error("Failed to retrieve chunked image");
                }
            } else if (finalUrl.startsWith('http')) {
                let cleanUrl = finalUrl;
                if (cleanUrl.includes('corsproxy.io/?')) cleanUrl = decodeURIComponent(cleanUrl.split('corsproxy.io/?')[1] || cleanUrl);
                if (cleanUrl.includes('api.allorigins.win/raw?url=')) cleanUrl = decodeURIComponent(cleanUrl.split('api.allorigins.win/raw?url=')[1] || cleanUrl);
                if (!cleanUrl.includes('firebasestorage.googleapis.com') && !cleanUrl.includes('wsrv.nl')) {
                    finalUrl = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&cors=1`;
                } else {
                    finalUrl = cleanUrl;
                }
            }

            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                workerRef.current.postMessage({
                    type: 'DETECT_GRID',
                    imageData: imageData.data,
                    width: img.width,
                    height: img.height
                });

                if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
            };
            img.onerror = () => {
                console.error("Failed to load image for grid detection.");
                setIsDetectingGrid(false);
                dialog.alert("Could not load image. Cross-Origin Resource Sharing (CORS) might be preventing it.");
                if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
            };
            img.src = finalUrl;
        } catch (err) {
            console.error("Failed to prepare image for grid detection:", err);
            setIsDetectingGrid(false);
        }
    };

    const handleApplyGridAlignment = (result, subdivision) => {
        const { cellSize, offsetX, offsetY, imageWidth, imageHeight } = result;
        
        const subdividedCellSize = cellSize / subdivision;
        const scale = mapData?.scale || 20;
        
        const unitsPerPixel = scale / imageHeight;
        const newGridSize = subdividedCellSize * unitsPerPixel;

        const worldWidth = imageWidth * unitsPerPixel;
        const topLeftX = -worldWidth / 2;
        const topLeftZ = -scale / 2; 

        const ix = topLeftX + (offsetX * unitsPerPixel);
        const iz = topLeftZ + (offsetY * unitsPerPixel);

        const modX = ((ix % newGridSize) + newGridSize) % newGridSize;
        const modZ = ((iz % newGridSize) + newGridSize) % newGridSize;
        const finalOffsetX = modX > newGridSize / 2 ? modX - newGridSize : modX;
        const finalOffsetY = modZ > newGridSize / 2 ? modZ - newGridSize : modZ;

        updateMap(campaignCode, activeMapId, {
            gridSize: parseFloat(newGridSize.toFixed(4)),
            gridOffsetX: parseFloat(finalOffsetX.toFixed(4)),
            gridOffsetY: parseFloat(finalOffsetY.toFixed(4))
        });

        setGridDetectionResult(null);
        toast("Grid alignment applied!", "success");
    };

    const handleExportPreset = async () => {
        setIsExporting(true);
        try {
            const mapSettings = {
                gridSize: mapData?.gridSize || 1,
                gridOffsetX: mapData?.gridOffsetX || 0,
                gridOffsetY: mapData?.gridOffsetY || 0,
                gridColor: mapData?.gridColor || '#888888',
                gridThickness: mapData?.gridThickness || 0.5,
                scale: mapData?.scale || 20,
                environment: mapData?.environment || 'day',
                lightingIntensity: mapData?.lightingIntensity || 1,
                tokenElevationOffset: mapData?.tokenElevationOffset ?? (!mapData?.heightmapUrl ? 0.04 : -0.12),
                showGrid: mapData?.showGrid !== false,
                isSnapToGrid: mapData?.isSnapToGrid !== false,
                showNameplates: mapData?.showNameplates !== false,
                fowEnabled: mapData?.fowEnabled || false,
                fowWallsEnabled: mapData?.fowWallsEnabled || false,
                playerDoorVisibility: mapData?.playerDoorVisibility || false,
                mapImageUrl: mapData?.backgroundUrl || null,
                heightmapUrl: mapData?.heightmapUrl || null,
                normalMapUrl: mapData?.normalMapUrl || null,
                heightScale: mapData?.heightScale || 1,
            };

            const geometry = { walls: mapData?.walls || {} };
            const lights = mapData?.lights ? Object.values(mapData.lights).filter(Boolean) : [];
            const tokens = mapData?.tokens ? Object.values(mapData.tokens).filter(Boolean) : [];
            
            const characters = [];
            if (allCharacters && tokens.length > 0) {
                tokens.forEach(t => {
                    if (!t || !t.characterId) return;
                    const char = allCharacters.find(c => c && String(c.id) === String(t.characterId));
                    if (char && !characters.find(c => c.id === char.id)) {
                        characters.push(char);
                    }
                });
            }

            await exportMapPreset(mapSettings, geometry, lights, tokens, characters);
            toast("Map preset exported!", "success");
        } catch (err) {
            console.error("Failed to export preset:", err);
            toast("Failed to export preset.", "error");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportPresetClick = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const preset = await importMapPreset(file);
            
            const currentNpcs = campaignData?.npcs || [];
            const newNpcs = [...currentNpcs];
            const characterIdMap = {};

            if (preset.characters) {
                for (const char of preset.characters) {
                    let existing = currentNpcs.find(c => c.name === char.name);
                    let newCharId;
                    if (existing) {
                        newCharId = existing.id;
                    } else {
                        newCharId = `char_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                        const newChar = { ...char, id: newCharId };
                        
                        if (char.modelBase64 && char.modelBase64.startsWith('data:')) {
                            try {
                               const chunkedId = await storeChunkedMap(char.modelBase64, `${char.name}_model.glb`);
                               newChar.modelUrl = chunkedId;
                            } catch (err) {
                               console.error("Failed to store model:", err);
                            }
                        }
                        delete newChar.modelBase64;
                        newNpcs.push(newChar);
                    }
                    characterIdMap[char.id] = newCharId;
                }
                if (updateCampaign) updateCampaign({ npcs: newNpcs });
            }

            let backgroundUrl = preset.mapSettings?.mapImageUrl;
            let heightmapUrl = preset.mapSettings?.heightmapUrl;
            let normalMapUrl = preset.mapSettings?.normalMapUrl;

            if (preset.mapSettings?.mapImageBase64) {
                if (preset.mapSettings.mapImageBase64.startsWith('blob:')) {
                    dialog.alert("This preset was exported incorrectly and is missing its background image data. Please re-export the preset.");
                    setIsImporting(false);
                    if (e.target) e.target.value = null;
                    return;
                }
                
                const mapName = preset.mapSettings?.name || 'Imported Map';
                backgroundUrl = await storeChunkedMap(preset.mapSettings.mapImageBase64, mapName);
                
                const thumbBase64 = await generateThumbnail(preset.mapSettings.mapImageBase64);
                const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
                await addDoc(assetsRef, { 
                    name: mapName, 
                    url: backgroundUrl, 
                    thumbnail: thumbBase64, 
                    createdAt: serverTimestamp() 
                });
                await fetchAssets();
            }
            if (preset.mapSettings?.heightmapBase64) {
                heightmapUrl = await storeChunkedMap(preset.mapSettings.heightmapBase64, 'preset_heightmap');
            }
            if (preset.mapSettings?.normalMapBase64) {
                normalMapUrl = await storeChunkedMap(preset.mapSettings.normalMapBase64, 'preset_normalmap');
            }

            const updates = {
                ...preset.mapSettings,
                backgroundUrl,
                heightmapUrl,
                normalMapUrl,
                walls: preset.geometry?.walls || {},
                lights: preset.lights?.reduce((acc, l) => { acc[l.id] = l; return acc; }, {}) || {}
            };
            
            delete updates.mapImageBase64;
            delete updates.heightmapBase64;
            delete updates.normalMapBase64;
            delete updates.mapImageUrl;

            const tokensUpdate = {};
            if (preset.tokens) {
                preset.tokens.forEach(t => {
                    const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    tokensUpdate[newTokenId] = {
                        ...t,
                        id: newTokenId,
                        characterId: characterIdMap[t.characterId] || t.characterId
                    };
                });
                updates.tokens = tokensUpdate;
            } else {
                updates.tokens = {};
            }

            const newMapId = doc(collection(db, 'maps')).id;
            
            updates.name = updates.name || preset.mapSettings?.name || 'Imported Map';
            updates.gridSize = updates.gridSize || 1;
            updates.scale = updates.scale || 20;
            updates.environment = updates.environment || 'day';
            
            await updateMap(campaignCode, newMapId, updates);
            
            if (updateCampaign) {
                await updateCampaign({ activeMapId: newMapId });
            }
            toast("Map preset loaded!", "success");
            if (onClose) onClose();
            
        } catch (err) {
            console.error("Failed to import preset:", err);
            dialog.alert("Failed to import preset. Make sure it's a valid DungeonMind preset JSON file.");
        } finally {
            setIsImporting(false);
        }
        if (e.target) e.target.value = null;
    };

    const handleMapUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file || !uploadTargetMap) return;
        
        setIsProcessingMap(true);
        setProcessingStep(`Uploading ${uploadTargetMap.name}...`);
        
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const targetMap = { ...uploadTargetMap, id: uploadTargetMap.mapId || uploadTargetMap.id };
                const newMapId = await fulfillMapData({
                    imgUrl: reader.result,
                    targetMap,
                    campaignCode,
                    skeleton: campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton,
                    data: {
                        ...campaignData,
                        npcs: (campaignData?.npcs || []).filter(n => n && n.name),
                        players: (campaignData?.players || []).filter(p => p && p.name)
                    },
                    aiHelper: localAiHelper,
                    generateNpc: localGenerateNpc,
                    updateCampaign,
                    setProcessingStep: setProcessingStep
                });
                toast(`${targetMap.name} is now Ready!`, "success");
                setProcessingStep('Populating Entities...');
                await new Promise(r => setTimeout(r, 3500));
                await updateCampaign({ activeMapId: newMapId });
                setInternalImportTarget(null);
                setSelectedAsset({ ...targetMap, url: reader.result, isSkeletonMap: true, activeMapId: newMapId });
                setActiveTab('settings');
                handleAutoDetectGrid(reader.result);
            } catch (err) {
                console.error(err);
                toast("Fulfillment failed.", "error");
            } finally {
                setIsProcessingMap(false);
                setProcessingStep('');
                setUploadTargetMap(null);
            }
            if (mapFileInputRef.current) mapFileInputRef.current.value = null;
        };
        reader.readAsDataURL(file);
    };

    // Handler to accept a battlemap directly
    const handleAcceptBattlemap = async (mapItem) => {
        if (!mapItem?.url) return;
        if (internalImportTarget) {
            setIsProcessingMap(true);
            try {
                const targetMap = { ...internalImportTarget, id: internalImportTarget.mapId };
                const newMapId = await fulfillMapData({
                    imgUrl: mapItem.url,
                    targetMap,
                    campaignCode,
                    skeleton: campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton,
                    data: {
                        ...campaignData,
                        npcs: (campaignData?.npcs || []).filter(n => n && n.name),
                        players: (campaignData?.players || []).filter(p => p && p.name)
                    },
                    aiHelper: localAiHelper,
                    generateNpc: localGenerateNpc,
                    updateCampaign,
                    setProcessingStep: setProcessingStep
                });
                toast(`${internalImportTarget.name} is now Ready!`, "success");
                setProcessingStep('Populating Entities...');
                await new Promise(r => setTimeout(r, 3500));
                await updateCampaign({ activeMapId: newMapId });
                setInternalImportTarget(null);
                setSelectedAsset({ ...targetMap, url: mapItem.url, isSkeletonMap: true, activeMapId: newMapId });
                setActiveTab('settings');
                handleAutoDetectGrid(mapItem.url);
            } catch (e) {
                console.error(e);
                toast("Fulfillment failed.", "error");
            } finally {
                setIsProcessingMap(false);
                setProcessingStep('');
            }
        } else {
            const isNew = await onSetBackground({ name: mapItem.title || 'Discovered Map', url: mapItem.url }, false);
            setSelectedAsset({ name: mapItem.title, url: mapItem.url });
            setActiveTab('settings');
            if (isNew) {
                handleAutoDetectGrid(mapItem.url);
            }
        }
        setInspectedMap(null);
    };

    const handleApplyDirectUrl = async () => {
        if (!directUrlInput || !directUrlInput.trim()) return;
        const cleanUrl = directUrlInput.trim();
        await handleAcceptBattlemap({ title: 'Imported Web Map', url: cleanUrl });
        setDirectUrlInput('');
    };

    return (
        <div 
            className="absolute top-0 right-0 bottom-0 max-w-full bg-slate-950/95 backdrop-blur-md border-l border-slate-800 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300 pb-safe"
            style={{ width: typeof window !== 'undefined' && window.innerWidth < 640 ? '100vw' : `${width}px` }}
        >
            {/* Left Edge Drag-to-Resize Handle */}
            {typeof window !== 'undefined' && window.innerWidth >= 640 && onResizeMouseDown && (
                <div 
                    className="absolute left-0 top-0 bottom-0 w-3 -ml-1.5 cursor-col-resize hover:bg-amber-500/40 active:bg-amber-500/60 z-30 transition-colors touch-none flex items-center justify-center group"
                    onMouseDown={onResizeMouseDown}
                    onTouchStart={onResizeMouseDown}
                    title="Drag to resize Map Studio"
                >
                    <div className="w-1 h-12 rounded-full bg-slate-700/80 group-hover:bg-amber-400 group-active:bg-amber-400 transition-colors shadow-sm" />
                </div>
            )}

            {/* Loading Overlay */}
            {(isDetectingGrid || isImporting || isProcessingMap) && (
                <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6">
                    {isProcessingMap ? (
                        <>
                            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_20px_rgba(245,158,11,0.5)]"></div>
                            <h3 className="text-2xl font-bold text-white mb-2 tracking-wider fantasy-font">Forging Battlemap</h3>
                            <p className="text-amber-400 animate-pulse font-mono bg-black/60 px-4 py-2 rounded-lg border border-amber-500/20">{processingStep || 'Processing...'}</p>
                        </>
                    ) : (
                        <>
                            <Icon name="loader" className="animate-spin text-amber-500 mb-4" size={48} />
                            <h3 className="text-xl font-bold text-white mb-2 fantasy-font">{isImporting ? 'Importing Preset...' : 'Analyzing Grid Frequencies...'}</h3>
                            <p className="text-sm text-slate-400">{isImporting ? 'Loading scene geometry and assets.' : 'Computer Vision is detecting grid alignment & cell sizes.'}</p>
                        </>
                    )}
                </div>
            )}

            {/* Verification UI Overlay */}
            {gridDetectionResult && (
                <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 border border-amber-500/80 rounded-2xl p-4 shadow-2xl z-[100] animate-in slide-in-from-bottom mb-safe mr-safe ml-safe backdrop-blur-md">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-amber-400 flex items-center gap-2 text-sm">
                            <Icon name="check-circle" size={16} className="text-amber-400" /> Grid Auto-Detected
                        </h3>
                        <button onClick={() => setGridDetectionResult(null)} className="text-slate-400 hover:text-white p-1">
                            <Icon name="x" size={16} />
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-center">
                            <div className="text-[9px] uppercase text-slate-500 font-bold mb-0.5">Cell Size</div>
                            <div className="font-mono text-white text-sm">{(gridDetectionResult.cellSize / gridSubdivision).toFixed(1)}<span className="text-[9px] text-slate-500 ml-0.5">px</span></div>
                        </div>
                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-center">
                            <div className="text-[9px] uppercase text-slate-500 font-bold mb-0.5">Offset X</div>
                            <div className="font-mono text-white text-sm">{gridDetectionResult.offsetX.toFixed(1)}<span className="text-[9px] text-slate-500 ml-0.5">px</span></div>
                        </div>
                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-center">
                            <div className="text-[9px] uppercase text-slate-500 font-bold mb-0.5">Offset Y</div>
                            <div className="font-mono text-white text-sm">{gridDetectionResult.offsetY.toFixed(1)}<span className="text-[9px] text-slate-500 ml-0.5">px</span></div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-3 bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <span className="text-xs font-bold text-slate-400">Subdivide Grid</span>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4].map(num => (
                                <button 
                                    key={num}
                                    onClick={() => setGridSubdivision(num)}
                                    className={`px-2.5 py-0.5 text-xs font-bold rounded-md transition-colors ${gridSubdivision === num ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                >
                                    {num}x
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">
                            Confidence: <span className={gridDetectionResult.confidence > 0.7 ? "text-green-400 font-bold" : gridDetectionResult.confidence > 0.4 ? "text-amber-400 font-bold" : "text-red-400 font-bold"}>{Math.round(gridDetectionResult.confidence * 100)}%</span>
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setGridDetectionResult(null)}
                                className="px-3 py-1 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                            >
                                Discard
                            </button>
                            <button 
                                onClick={() => handleApplyGridAlignment(gridDetectionResult, gridSubdivision)}
                                className="px-3.5 py-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold rounded-lg shadow-md transition-all"
                            >
                                Apply Grid
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Header */}
            <div className="flex-none p-3.5 pt-safe-min pr-safe-min pl-safe-min border-b border-slate-800/80 flex justify-between items-center bg-slate-950/80 backdrop-blur">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                        <Icon name="map" size={16} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-slate-100 text-sm tracking-wide truncate flex items-center gap-2">
                            <span>Map Studio</span>
                            {mapData?.name && (
                                <span className="text-[10px] text-amber-400/90 font-mono font-normal bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 truncate max-w-[150px]">
                                    {mapData.name}
                                </span>
                            )}
                        </h3>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => onNewBlankMap()} 
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors" 
                        title="Create New Blank Map"
                    >
                        <Icon name="file-plus" size={17} />
                    </button>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Close Sidebar (Esc)"
                    >
                        <Icon name="x" size={17} />
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex-none border-b border-slate-800 bg-slate-950/50 flex overflow-x-auto no-scrollbar">
                <TabButton name="library" activeTab={activeTab} onClick={setActiveTab} icon="map">Maps & Atlas</TabButton>
                <TabButton name="web" activeTab={activeTab} onClick={setActiveTab} icon="compass">Discover</TabButton>
                <TabButton name="settings" activeTab={activeTab} onClick={(tab) => { setSelectedAsset(null); setActiveTab(tab); }} icon="sliders-horizontal">Tuning</TabButton>
                <TabButton name="sketchfab" activeTab={activeTab} onClick={setActiveTab} icon="box">3D Props</TabButton>
                {activeTab === 'ai' && <TabButton name="ai" activeTab={activeTab} onClick={setActiveTab} icon="layers">Layers & AI</TabButton>}
            </div>

            {/* TAB: DISCOVER / WEB SEARCH */}
            {activeTab === 'web' && (
                <div className="flex-1 min-h-0 flex flex-col bg-slate-900/60">
                    {/* Search & Filter Header */}
                    <div className="p-3 border-b border-slate-800 bg-slate-950/70 flex flex-col gap-2 shrink-0">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <input 
                                    value={redditQuery} 
                                    onChange={(e) => setRedditQuery(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleRedditSearch()}
                                    placeholder="Search battlemaps (Tavern, Dungeon, Forest)..." 
                                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-white outline-none focus:border-amber-500 text-xs shadow-inner transition-colors"
                                />
                                <div className="absolute left-2.5 top-2.5 text-slate-500 pointer-events-none">
                                    <Icon name="search" size={14} />
                                </div>
                            </div>
                            <button 
                                onClick={() => handleRedditSearch()} 
                                disabled={isSourcing} 
                                className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-3.5 rounded-xl text-white font-bold text-xs flex items-center justify-center transition-all shadow-md shrink-0 disabled:opacity-50"
                            >
                                {isSourcing ? <Icon name="loader" size={14} className="animate-spin" /> : "Search"}
                            </button>
                        </div>

                        {/* Quick Suggestion Tags */}
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-500 shrink-0">Tags:</span>
                            {['Tavern', 'Dungeon', 'Forest', 'Cave', 'Castle', 'Crypt', 'Swamp', 'Ship', 'Snow', 'Desert', 'City', 'Volcano', 'Dragon', 'Tower', 'Sewers'].map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => { setRedditQuery(tag); handleRedditSearch(tag); }}
                                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800/80 hover:bg-amber-600/30 text-slate-300 hover:text-amber-300 border border-slate-700/70 transition-colors shrink-0"
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>

                        {/* Direct URL Import Accordion Bar */}
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                            <input
                                type="text"
                                value={directUrlInput}
                                onChange={(e) => setDirectUrlInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleApplyDirectUrl()}
                                placeholder="Or paste direct image URL (jpg, png, webp)..."
                                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 outline-none focus:border-amber-500"
                            />
                            <button
                                type="button"
                                onClick={handleApplyDirectUrl}
                                disabled={!directUrlInput.trim()}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white rounded-lg text-[11px] font-bold border border-slate-700 transition-colors"
                            >
                                Import
                            </button>
                        </div>
                    </div>

                    {/* Results Visual Grid */}
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3">
                        {isSourcing ? (
                            <div className="h-64 flex flex-col items-center justify-center text-center animate-pulse">
                                <Icon name="loader" size={36} className="animate-spin text-amber-500 mb-3" />
                                <div className="text-slate-300 font-bold text-sm">Searching Battlemap Archives...</div>
                                <div className="text-slate-500 text-xs mt-1">Gathering top-down maps from Reddit & Cartographers</div>
                            </div>
                        ) : redditResults.length > 0 ? (
                            <>
                                <div className="flex justify-between items-center mb-2.5 px-0.5">
                                    <span className="text-xs font-semibold text-slate-400">
                                        Found <span className="text-amber-400">{redditResults.length}</span> battlemaps
                                    </span>
                                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                        <button 
                                            onClick={() => window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent((redditQuery || 'fantasy') + ' dnd battlemap top down grid')}`, '_blank')}
                                            className="hover:text-blue-400 transition-colors flex items-center gap-1"
                                        >
                                            <Icon name="external-link" size={10} /> Google
                                        </button>
                                        <span>•</span>
                                        <button 
                                            onClick={() => window.open(`https://www.reddit.com/r/battlemaps/search/?q=${encodeURIComponent(redditQuery || '')}&restrict_sr=1`, '_blank')}
                                            className="hover:text-orange-400 transition-colors flex items-center gap-1"
                                        >
                                            <Icon name="external-link" size={10} /> Reddit
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    {redditResults.map((mapItem, idx) => (
                                        <div 
                                            key={idx}
                                            onClick={() => setInspectedMap(mapItem)}
                                            className="group relative aspect-square bg-slate-950 rounded-xl border border-slate-800 hover:border-amber-500/80 shadow-md overflow-hidden cursor-pointer transition-all duration-200"
                                        >
                                            <img 
                                                src={getProxiedImageUrl(mapItem.url, 400)}
                                                alt={mapItem.title}
                                                referrerPolicy="no-referrer"
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity" />
                                            
                                            <div className="absolute inset-x-0 bottom-0 p-2 flex flex-col justify-end pointer-events-none">
                                                <div className="text-xs font-bold text-white truncate drop-shadow" title={mapItem.title}>
                                                    {mapItem.title}
                                                </div>
                                                <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                                                    <span>{mapItem.source || 'Reddit'}</span>
                                                    {mapItem.author && <span>• {mapItem.author}</span>}
                                                </div>
                                            </div>

                                            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAcceptBattlemap(mapItem);
                                                    }}
                                                    className="w-7 h-7 rounded-md bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg transition-colors"
                                                    title="Use as Map"
                                                >
                                                    <Icon name="check" size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 p-6">
                                <Icon name="search" size={36} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm font-semibold text-slate-400">Search for any battlemap keyword</p>
                                <p className="text-xs text-slate-500 mt-1">E.g. "Tavern", "Swamp", "Dungeon", "Catacombs"</p>
                            </div>
                        )}
                    </div>

                    {/* Battlemap Inspection Flyout Modal */}
                    {inspectedMap && (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
                                <div className="p-3.5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                                    <h4 className="font-bold text-white text-sm truncate pr-2" title={inspectedMap.title}>
                                        {inspectedMap.title}
                                    </h4>
                                    <button 
                                        onClick={() => setInspectedMap(null)}
                                        className="text-slate-400 hover:text-white p-1"
                                    >
                                        <Icon name="x" size={18} />
                                    </button>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col items-center justify-center bg-slate-950/60">
                                    <img 
                                        src={getProxiedImageUrl(inspectedMap.url, 1200)}
                                        alt={inspectedMap.title}
                                        referrerPolicy="no-referrer"
                                        className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-xl border border-slate-800"
                                    />
                                    <div className="mt-3 text-center">
                                        <div className="text-xs text-slate-400">
                                            {inspectedMap.source && <span className="font-semibold text-slate-300">{inspectedMap.source}</span>}
                                            {inspectedMap.author && <span> • by {inspectedMap.author}</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setInspectedMap(null)}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedAsset({ name: inspectedMap.title, url: inspectedMap.url });
                                            setActiveTab('ai');
                                            setInspectedMap(null);
                                        }}
                                        className="px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors border border-purple-500/50"
                                    >
                                        <Icon name="sparkles" size={14} /> Use AI Layers
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAcceptBattlemap(inspectedMap)}
                                        className="px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg transition-all"
                                    >
                                        <Icon name="check" size={16} /> Load as Active Map
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: SKETCHFAB 3D MODELS */}
            {activeTab === 'sketchfab' && (
                <SketchfabImporter 
                    onSelectStamper={onSelectStamper} 
                    onImportCompleted={async (assetData) => {
                        if (assetData && campaignCode) {
                            const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
                            await addDoc(assetsRef, {
                                name: assetData.name,
                                url: assetData.url,
                                modelUrl: assetData.modelUrl,
                                thumbnail: assetData.image,
                                is3D: assetData.is3D,
                                category: 'Props',
                                createdAt: serverTimestamp()
                            });
                        }
                        fetchAssets();
                    }} 
                />
            )}

            {/* TAB: LAYERS & AI FORGE */}
            {activeTab === 'ai' && (selectedAsset || importTarget) && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scroll bg-slate-900/60">
                    <MapGenerator 
                        asset={selectedAsset || { name: internalImportTarget?.name || importTarget?.name }}
                        mapData={mapData} 
                        importTarget={internalImportTarget || importTarget}
                        onUpdateLayer={async (layerType, data) => {
                            if (selectedAsset) {
                                handleUpdateAssetLayer(selectedAsset, layerType, data);
                            } else if (layerType === 'baseMap' && (internalImportTarget || importTarget)) {
                                const target = internalImportTarget || importTarget;
                                setIsProcessingMap(true);
                                try {
                                    const targetMap = { ...target, id: target.mapId || target.id };
                                    const newMapId = await fulfillMapData({
                                        imgUrl: data,
                                        targetMap,
                                        campaignCode,
                                        skeleton: campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton,
                                        data: {
                                            ...campaignData,
                                            npcs: (campaignData?.npcs || []).filter(n => n && n.name),
                                            players: (campaignData?.players || []).filter(p => p && p.name)
                                        },
                                        aiHelper: localAiHelper,
                                        generateNpc: localGenerateNpc,
                                        updateCampaign,
                                        setProcessingStep: setProcessingStep
                                    });
                                    toast(`${target.name} is now Ready!`, "success");
                                    setProcessingStep('Populating Entities...');
                                    await new Promise(r => setTimeout(r, 3500));
                                    await updateCampaign({ activeMapId: newMapId });
                                    setInternalImportTarget(null);
                                    setSelectedAsset({ ...targetMap, url: data, isSkeletonMap: true, activeMapId: newMapId });
                                    setActiveTab('settings');
                                    handleAutoDetectGrid(data);
                                } catch (e) {
                                    console.error(e);
                                    toast("Fulfillment failed.", "error");
                                } finally {
                                    setIsProcessingMap(false);
                                    setProcessingStep('');
                                }
                            }
                        }} 
                    />
                </div>
            )}

            {/* TAB: MAPS & ATLAS (LIBRARY) */}
            {activeTab === 'library' && (
                <div className="flex-1 min-h-0 flex flex-col bg-slate-900/60">
                    {/* Top Actions & Filters */}
                    <div className="flex-none p-3 border-b border-slate-800 bg-slate-950/70 flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleUpload}
                                className="hidden"
                                accept="image/png, image/jpeg, image/gif, image/webp, video/mp4, video/webm, .glb, .gltf"
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()} 
                                disabled={isUploading} 
                                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow transition-colors"
                            >
                                {isUploading ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="upload" size={14} />}
                                {isUploading ? "Uploading..." : "Upload Map / Prop"}
                            </button>
                            
                            <input
                                type="file"
                                ref={importPresetRef}
                                onChange={handleImportPresetClick}
                                className="hidden"
                                accept=".json"
                            />
                            <button 
                                onClick={() => importPresetRef.current?.click()} 
                                disabled={isImporting} 
                                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-slate-700 transition-colors shadow"
                            >
                                {isImporting ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="download" size={14} />}
                                {isImporting ? "Importing..." : "Import Preset"}
                            </button>
                        </div>

                        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                            {['Maps', 'Props', 'All', 'Uncategorized'].map(cat => (
                                <button 
                                    key={cat} 
                                    onClick={() => setAssetCategory(cat)} 
                                    className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${assetCategory === cat ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-800'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Gallery Content */}
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 space-y-4">
                        {/* ACTIVE MAP HERO CARD */}
                        {mapData && (mapData.backgroundUrl || mapData.name) && (
                            <div className="bg-gradient-to-r from-amber-950/30 via-slate-900/80 to-slate-900/80 rounded-2xl border border-amber-500/30 p-3 shadow-lg flex items-center gap-3">
                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 relative shadow">
                                    <ResolvedMapImage 
                                        url={mapData.backgroundUrl || mapData.mapUrl || mapData.image} 
                                        name={mapData.name} 
                                        className="w-full h-full object-cover" 
                                    />
                                    <div className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" title="Active on Tabletop" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">Current Map</span>
                                    </div>
                                    <h4 className="font-bold text-white text-sm truncate" title={mapData.name || 'Unnamed Map'}>
                                        {mapData.name || 'Unnamed Map'}
                                    </h4>
                                    <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                        <span>Grid: {mapData.gridSize ?? 1}x</span>
                                        <span>•</span>
                                        <span>Scale: {mapData.scale || 20}u</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedAsset(null);
                                        setActiveTab('settings');
                                    }}
                                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors shrink-0 shadow"
                                    title="Open Map Tuning"
                                >
                                    <Icon name="sliders-horizontal" size={13} />
                                    <span>Tune</span>
                                </button>
                            </div>
                        )}

                        {/* CAMPAIGN ATLAS / MODULE SKELETON */}
                        {['Maps', 'All'].includes(assetCategory) && (campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton)?.chapters && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 border-b border-amber-500/30 pb-2">
                                    <Icon name="book-open" className="text-amber-400" size={16} />
                                    <h3 className="text-sm font-bold text-amber-400 fantasy-font truncate">
                                        {(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton).title || 'Campaign Module Atlas'}
                                    </h3>
                                </div>
                                
                                {(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton).chapters.map(chapter => {
                                    const isExpanded = expandedChapters[chapter.id];
                                    const totalMaps = chapter.maps?.length || 0;

                                    return (
                                        <div key={chapter.id} className="bg-slate-900/80 rounded-xl border border-slate-800/80 overflow-hidden shadow-sm">
                                            <div 
                                                className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
                                                onClick={() => setExpandedChapters(prev => ({ ...prev, [chapter.id]: !prev[chapter.id] }))}
                                            >
                                                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2 min-w-0">
                                                    <Icon name={isExpanded ? "folder-open" : "folder"} size={14} className="text-indigo-400 shrink-0" />
                                                    <span className="truncate">{chapter.title}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                                                        {totalMaps}
                                                    </span>
                                                </h4>
                                                <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={15} className="text-slate-500" />
                                            </div>

                                            {isExpanded && (
                                                <div className="p-2.5 pt-1 grid grid-cols-2 gap-2.5 border-t border-slate-800/60">
                                                    {chapter.maps?.map(map => {
                                                        const isMissing = map.status === 'missing';
                                                        if (isMissing) {
                                                            return (
                                                                <div key={map.id} className="flex flex-col gap-1 group">
                                                                    <div className="relative aspect-square rounded-xl bg-indigo-950/20 border border-dashed border-indigo-500/40 hover:border-indigo-400 hover:bg-indigo-900/30 overflow-hidden transition-all shadow-inner">
                                                                        <div 
                                                                            onClick={() => {
                                                                                setInternalImportTarget({ ...map, chapterId: chapter.id, mapId: map.id });
                                                                                setRedditQuery(map.name);
                                                                                setActiveTab('web');
                                                                                handleRedditSearch(map.name);
                                                                            }}
                                                                            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer p-2 text-center"
                                                                        >
                                                                            <Icon name="search" size={20} className="text-indigo-400 mb-1 group-hover:scale-110 transition-transform" />
                                                                            <span className="text-[11px] font-bold text-indigo-300 leading-tight">Source Map</span>
                                                                        </div>
                                                                        <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                                            <button 
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setUploadTargetMap({ ...map, chapterId: chapter.id, mapId: map.id });
                                                                                    mapFileInputRef.current?.click();
                                                                                }}
                                                                                className="w-7 h-7 rounded-md bg-black/80 text-slate-300 hover:text-white flex items-center justify-center shadow border border-slate-700"
                                                                                title="Upload Custom File"
                                                                            >
                                                                                <Icon name="upload" size={13} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-center px-1">
                                                                        <div className="text-xs font-semibold text-slate-300 truncate" title={map.name}>{map.name}</div>
                                                                        <div className="text-[9px] text-amber-500/80 font-mono uppercase tracking-widest">Missing</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        } else {
                                                            const lowerUrl = (map.mapUrl || map.image || map.backgroundUrl || '').toLowerCase();
                                                            const lowerName = (map.name || '').toLowerCase();
                                                            const isAnimated = lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.gif');
                                                            const isActiveThisMap = map.activeMapId && map.activeMapId === activeMapId;

                                                            const mapMenuItems = [
                                                                {
                                                                    label: 'Set as Active Map',
                                                                    icon: 'map',
                                                                    onClick: async () => {
                                                                        if (map.activeMapId) {
                                                                            if (updateCampaign) await updateCampaign({ activeMapId: map.activeMapId });
                                                                        } else {
                                                                            const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                            const isNew = await onSetBackground({ name: map.name, url: mapImg }, false);
                                                                            if (isNew && mapImg) {
                                                                                setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true });
                                                                                setActiveTab('settings');
                                                                                handleAutoDetectGrid(mapImg);
                                                                            }
                                                                        }
                                                                        toast(`Switched to ${map.name}`, "success");
                                                                    }
                                                                },
                                                                {
                                                                    label: 'Map Tuning',
                                                                    icon: 'sliders-horizontal',
                                                                    onClick: () => {
                                                                        const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                        setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true });
                                                                        setActiveTab('settings');
                                                                    }
                                                                },
                                                                {
                                                                    label: 'Layers & AI',
                                                                    icon: 'layers',
                                                                    onClick: () => {
                                                                        const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                        setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true });
                                                                        setActiveTab('ai');
                                                                    }
                                                                },
                                                                {
                                                                    label: 'Rename Map',
                                                                    icon: 'pencil',
                                                                    onClick: async () => {
                                                                        const newName = await dialog.prompt("Enter new name for map:", map.name);
                                                                        if (newName && newName !== map.name) {
                                                                            const newSkeleton = JSON.parse(JSON.stringify(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton));
                                                                            const chap = newSkeleton.chapters.find(c => c.id === chapter.id);
                                                                            const mapToUpdate = chap?.maps.find(m => m.id === map.id);
                                                                            if (mapToUpdate) {
                                                                                mapToUpdate.name = newName.trim();
                                                                                if (updateCampaign) updateCampaign({ moduleSkeleton: newSkeleton });
                                                                            }
                                                                        }
                                                                    }
                                                                },
                                                                {
                                                                    label: 'Download Image',
                                                                    icon: 'download',
                                                                    onClick: async () => {
                                                                        try {
                                                                            const url = map.mapUrl || map.image || map.backgroundUrl;
                                                                            if (!url) return;
                                                                            let downloadUrl = url;
                                                                            if (url.startsWith('chunked:')) {
                                                                                const blob = await retrieveChunkedMap(url);
                                                                                if (blob) downloadUrl = URL.createObjectURL(blob);
                                                                            }
                                                                            const a = document.createElement('a');
                                                                            a.href = downloadUrl;
                                                                            a.download = `${map.name || 'map'}.png`;
                                                                            document.body.appendChild(a);
                                                                            a.click();
                                                                            document.body.removeChild(a);
                                                                            if (url.startsWith('chunked:')) URL.revokeObjectURL(downloadUrl);
                                                                        } catch (err) {
                                                                            console.error(err);
                                                                        }
                                                                    }
                                                                },
                                                                {
                                                                    label: 'Remove Map',
                                                                    icon: 'trash',
                                                                    danger: true,
                                                                    onClick: async () => {
                                                                        if (await dialog.confirm(`Remove "${map.name}" and mark as missing?`)) {
                                                                            const newSkeleton = JSON.parse(JSON.stringify(campaignData?.moduleSkeleton || campaignData?.campaign?.moduleSkeleton));
                                                                            const chap = newSkeleton.chapters.find(c => c.id === chapter.id);
                                                                            const mapToUpdate = chap?.maps.find(m => m.id === map.id);
                                                                            if (mapToUpdate) {
                                                                                mapToUpdate.status = 'missing';
                                                                                delete mapToUpdate.image;
                                                                                delete mapToUpdate.mapUrl;
                                                                                delete mapToUpdate.backgroundUrl;
                                                                                delete mapToUpdate.generatedHeightmapUrl;
                                                                                delete mapToUpdate.generatedNormalMapUrl;
                                                                                delete mapToUpdate.generatedMaterialMaskUrl;
                                                                                delete mapToUpdate.generatedFeatures;
                                                                                if (updateCampaign) updateCampaign({ moduleSkeleton: newSkeleton });
                                                                                
                                                                                if (selectedAsset?.id === map.id) {
                                                                                    setSelectedAsset(null);
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            ];

                                                            return (
                                                                <div key={map.id} className="flex flex-col gap-1 group">
                                                                    <div 
                                                                        className={`relative aspect-square rounded-xl bg-slate-950 border shadow-md overflow-hidden cursor-pointer transition-all duration-200 ${isActiveThisMap ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'border-slate-800 hover:border-amber-500/80'}`}
                                                                        onClick={async () => {
                                                                            if (map.activeMapId) {
                                                                                if (updateCampaign) await updateCampaign({ activeMapId: map.activeMapId });
                                                                                toast(`Loaded ${map.name}`, "success");
                                                                            } else {
                                                                                const mapImg = map.mapUrl || map.image || map.backgroundUrl || '';
                                                                                const isNew = await onSetBackground({ name: map.name, url: mapImg }, false);
                                                                                if (isNew && mapImg) {
                                                                                    setSelectedAsset({ ...map, url: mapImg, isSkeletonMap: true });
                                                                                    setActiveTab('settings');
                                                                                    handleAutoDetectGrid(mapImg);
                                                                                }
                                                                            }
                                                                        }}
                                                                    >
                                                                        <ResolvedMapImage url={map.mapUrl || map.image || map.backgroundUrl} name={map.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                        
                                                                        {isAnimated && (
                                                                            <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-amber-400 p-1 rounded-md backdrop-blur-sm pointer-events-none shadow" title="Animated Map">
                                                                                <Icon name="film" size={12} />
                                                                            </div>
                                                                        )}

                                                                        {isActiveThisMap && (
                                                                            <div className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)]" title="Active on Tabletop" />
                                                                        )}

                                                                        <div className="absolute top-1.5 right-1.5 z-20">
                                                                            <CardActionsMenu 
                                                                                isOpen={openMenuId === `skeleton-${map.id}`}
                                                                                onToggle={(isOpen) => setOpenMenuId(isOpen ? `skeleton-${map.id}` : null)}
                                                                                items={mapMenuItems}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-center px-1">
                                                                        <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-amber-400 transition-colors" title={map.name}>
                                                                            {map.name}
                                                                        </div>
                                                                        <div className="text-[9px] text-green-500/80 font-mono uppercase tracking-widest mt-0.5">Ready</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                    })}
                                                    {(!chapter.maps || chapter.maps.length === 0) && (
                                                        <div className="col-span-full text-slate-500 text-xs italic text-center py-2">No maps registered in this chapter.</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* SANDBOX ASSETS & PROPS */}
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <div className="flex items-center gap-2">
                                    <Icon name="globe" className="text-slate-400" size={15} />
                                    <h3 className="text-xs font-bold text-slate-300 tracking-wider uppercase">Saved Assets & Props</h3>
                                </div>
                                <span className="text-[11px] text-slate-500 font-mono">{assets.length} items</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                {assets.filter(a => assetCategory === 'All' || (a.category || 'Uncategorized') === assetCategory).map((asset) => {
                                    const lowerUrl = (asset.url || '').toLowerCase();
                                    const lowerName = (asset.name || '').toLowerCase();
                                    const isAnimated = lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.gif');

                                    const sandboxMenuItems = [
                                        ...(asset.category !== 'Props' ? [
                                            {
                                                label: 'Set as Map Background',
                                                icon: 'map',
                                                onClick: async () => {
                                                    const isNew = await onSetBackground(asset, false);
                                                    if (isNew) {
                                                        setSelectedAsset(asset);
                                                        setActiveTab('settings');
                                                        handleAutoDetectGrid(asset.generatedMapUrl || asset.url);
                                                    }
                                                }
                                            },
                                            {
                                                label: 'Map Tuning',
                                                icon: 'sliders-horizontal',
                                                onClick: () => {
                                                    setSelectedAsset(asset);
                                                    setActiveTab('settings');
                                                }
                                            },
                                            {
                                                label: 'Layers & AI',
                                                icon: 'layers',
                                                onClick: () => {
                                                    setSelectedAsset(asset);
                                                    setActiveTab('ai');
                                                }
                                            }
                                        ] : []),
                                        {
                                            label: 'Rename Asset',
                                            icon: 'pencil',
                                            onClick: async () => {
                                                const newName = await dialog.prompt("Enter new name for asset:", asset.name);
                                                if (newName && newName !== asset.name) {
                                                    const assetRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets', asset.id);
                                                    updateDoc(assetRef, { name: newName.trim() }).then(() => {
                                                        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, name: newName.trim() } : a));
                                                    }).catch(err => {
                                                        console.error("Error renaming asset", err);
                                                        toast("Failed to rename asset.", "error");
                                                    });
                                                }
                                            }
                                        },
                                        {
                                            label: 'Delete Asset',
                                            icon: 'trash',
                                            danger: true,
                                            onClick: () => handleDeleteAsset(asset)
                                        }
                                    ];

                                    return (
                                        <div 
                                            key={asset.id} 
                                            draggable 
                                            onClick={() => {
                                                if (onSelectStamper) onSelectStamper(asset);
                                            }}
                                            onDragStart={(e) => {
                                                const payload = JSON.stringify({ format: 'dungeonmind-asset', url: asset.url, is3D: asset.is3D, modelUrl: asset.modelUrl, category: asset.category, name: asset.name });
                                                e.dataTransfer.setData('application/dungeonmind-asset', payload);
                                                e.dataTransfer.setData('text/plain', payload);
                                            }}
                                            className="group relative aspect-square bg-slate-950 rounded-xl border border-slate-800 hover:border-amber-500/80 shadow-md overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-200"
                                        >
                                            <AssetThumbnail asset={asset} />
                                            
                                            {isAnimated && (
                                                <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-amber-400 p-1 rounded-md backdrop-blur-sm pointer-events-none shadow" title="Animated Asset">
                                                    <Icon name="film" size={12} />
                                                </div>
                                            )}

                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-1.5 pointer-events-none">
                                                <div className="text-[11px] font-semibold text-white truncate drop-shadow">{asset.name}</div>
                                            </div>

                                            <div className="absolute top-1.5 right-1.5 z-20">
                                                <CardActionsMenu 
                                                    isOpen={openMenuId === `asset-${asset.id}`}
                                                    onToggle={(isOpen) => setOpenMenuId(isOpen ? `asset-${asset.id}` : null)}
                                                    items={sandboxMenuItems}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {assets.length === 0 && (
                                    <div className="col-span-2 text-center text-slate-500 text-xs py-8 flex flex-col items-center">
                                        <Icon name="image" size={32} className="opacity-20 mb-2" />
                                        <span>No assets uploaded yet.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: MAP TUNING & ATMOSPHERE (SETTINGS) */}
            {activeTab === 'settings' && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-4 space-y-4 bg-slate-900/40">
                    
                    {/* SECTION 1: MAP IDENTITY */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 p-3.5 shadow-sm space-y-3">
                        <label className="block text-[11px] uppercase font-bold text-slate-400 tracking-wider">Map Identity</label>
                        <input
                            type="text"
                            value={mapData?.name || ''}
                            placeholder="Unnamed Map"
                            onChange={(e) => updateMap(campaignCode, activeMapId, { name: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500 shadow-inner"
                        />

                        {(() => {
                            const bg = mapData?.backgroundUrl || mapData?.mapUrl || mapData?.image || selectedAsset?.url || '';
                            const name = mapData?.name || selectedAsset?.name || '';
                            const lowerBg = bg.toLowerCase();
                            const lowerName = name.toLowerCase();
                            const isAnimated = lowerBg.includes('.mp4') || lowerBg.includes('.webm') || lowerBg.includes('.gif') || lowerName.includes('.mp4') || lowerName.includes('.webm') || lowerName.includes('.gif');
                            if (isAnimated) {
                                return (
                                    <div className="pt-2 border-t border-slate-800/80">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[11px] font-semibold text-slate-300">Playback Speed</span>
                                            <span className="text-xs text-amber-400 font-mono">{mapData?.playbackRate ?? 1}x</span>
                                        </div>
                                        <ThrottledSlider 
                                            type="range" 
                                            min="0.1" 
                                            max="3" 
                                            step="0.1" 
                                            value={mapData?.playbackRate ?? 1} 
                                            onChange={(val) => throttledUpdateMap({ playbackRate: val })}
                                            className="w-full accent-amber-500"
                                        />
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>

                    {/* SECTION 2: ATMOSPHERE & WEATHER */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 overflow-hidden shadow-sm">
                        <div 
                            className="p-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                            onClick={() => toggleSection('atmosphere')}
                        >
                            <div className="flex items-center gap-2">
                                <Icon name="sun" size={16} className="text-amber-400" />
                                <h4 className="text-xs font-bold text-slate-200 tracking-wide">Atmosphere & Mood</h4>
                            </div>
                            <Icon name={expandedSections.atmosphere ? "chevron-up" : "chevron-down"} size={16} className="text-slate-500" />
                        </div>

                        {expandedSections.atmosphere && (
                            <div className="p-3.5 pt-0 space-y-3.5 border-t border-slate-800/50">
                                <div>
                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Weather & Environmental Preset</span>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {ENVIRONMENT_PRESETS.map((preset) => {
                                            const isActive = (mapData?.environment || 'day') === preset.id;
                                            return (
                                                <button
                                                    key={preset.id}
                                                    type="button"
                                                    onClick={() => updateMap(campaignCode, activeMapId, { environment: preset.id })}
                                                    className={`py-2 px-1.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${isActive ? preset.activeClass : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}
                                                >
                                                    <Icon name={preset.icon} size={15} />
                                                    <span className="text-[10px] font-semibold truncate max-w-full">{preset.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-300">Brightness Multiplier</span>
                                        <span className="text-xs text-amber-400 font-mono">{mapData?.lightingIntensity ?? 1}x</span>
                                    </div>
                                    <ThrottledSlider 
                                        type="range" 
                                        min="0" 
                                        max="5" 
                                        step="0.05" 
                                        value={mapData?.lightingIntensity ?? 1} 
                                        onChange={(val) => throttledUpdateMap({ lightingIntensity: val })}
                                        className="w-full accent-amber-500" 
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ambient Life Effects</span>
                                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                                        {[
                                            { id: 'off', label: 'Off' },
                                            { id: 'low', label: 'Particles' },
                                            { id: 'high', label: 'Fauna' }
                                        ].map(lvl => (
                                            <button
                                                key={lvl.id}
                                                type="button"
                                                onClick={() => {
                                                    const updates = { ambientLifeLevel: lvl.id };
                                                    if (lvl.id === 'off') updates.particleDensity = 0;
                                                    else if (mapData?.particleDensity === 0) updates.particleDensity = 1;
                                                    updateMap(campaignCode, activeMapId, updates);
                                                }}
                                                className={`py-1 text-xs font-semibold rounded-lg transition-colors ${(mapData?.ambientLifeLevel || 'high') === lvl.id ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                            >
                                                {lvl.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {mapData?.ambientLifeLevel !== 'off' && (
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-semibold text-slate-300">Particle Density</span>
                                            <span className="text-xs text-indigo-400 font-mono">{mapData?.particleDensity ?? 1.0}x</span>
                                        </div>
                                        <ThrottledSlider 
                                            type="range" 
                                            min="0" 
                                            max="5" 
                                            step="0.1" 
                                            value={mapData?.particleDensity ?? 1.0} 
                                            onChange={(val) => throttledUpdateMap({ particleDensity: val })}
                                            className="w-full accent-indigo-500"
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ecosystem Biome</span>
                                    <select 
                                        value={mapData?.biomeType || 'forest'} 
                                        onChange={(e) => updateMap(campaignCode, activeMapId, { biomeType: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-2 text-white text-xs outline-none focus:border-amber-500"
                                    >
                                        <option value="generic">Generic (Dust, Motes)</option>
                                        <option value="dungeon">Dungeon (Spores, Critters)</option>
                                        <option value="forest">Forest (Leaves, Birds, Butterflies)</option>
                                        <option value="city">City (Dust, Shadows)</option>
                                        <option value="coast">Coast (Birds, Spray)</option>
                                        <option value="desert">Desert (Heat Shimmer, Dust)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SECTION 3: PRECISION GRID ALIGNMENT */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 overflow-hidden shadow-sm">
                        <div 
                            className="p-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                            onClick={() => toggleSection('grid')}
                        >
                            <div className="flex items-center gap-2">
                                <Icon name="grid" size={16} className="text-indigo-400" />
                                <h4 className="text-xs font-bold text-slate-200 tracking-wide">Grid Calibration & Scale</h4>
                            </div>
                            <Icon name={expandedSections.grid ? "chevron-up" : "chevron-down"} size={16} className="text-slate-500" />
                        </div>

                        {expandedSections.grid && (
                            <div className="p-3.5 pt-0 space-y-3.5 border-t border-slate-800/50">
                                {/* AI Auto-Detect Grid Banner */}
                                <button 
                                    onClick={handleAutoDetectGrid}
                                    disabled={!mapData?.backgroundUrl || isDetectingGrid}
                                    className="w-full py-2.5 bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                                >
                                    <Icon name="scan" size={15} />
                                    <span>Auto-Detect Grid Alignment (AI)</span>
                                </button>

                                {/* Grid Size with Stepper */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-300">Grid Cell Size</span>
                                        <NudgeStepper 
                                            value={mapData?.gridSize ?? 1} 
                                            min={0.1} 
                                            max={10} 
                                            step={0.05} 
                                            onChange={(val) => throttledUpdateMap({ gridSize: val })} 
                                        />
                                    </div>
                                    <ThrottledSlider 
                                        type="range" 
                                        min="0.1" 
                                        max="5" 
                                        step="0.01" 
                                        value={mapData?.gridSize ?? 1} 
                                        onChange={(val) => throttledUpdateMap({ gridSize: val })}
                                        className="w-full accent-amber-500"
                                    />
                                </div>

                                {/* Offset X with Stepper */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-300">Grid Offset X</span>
                                        <NudgeStepper 
                                            value={mapData?.gridOffsetX ?? 0} 
                                            min={-5} 
                                            max={5} 
                                            step={0.05} 
                                            onChange={(val) => throttledUpdateMap({ gridOffsetX: val })} 
                                        />
                                    </div>
                                    <ThrottledSlider 
                                        type="range" 
                                        min="-5" 
                                        max="5" 
                                        step="0.01" 
                                        value={mapData?.gridOffsetX ?? 0} 
                                        onChange={(val) => throttledUpdateMap({ gridOffsetX: val })}
                                        className="w-full accent-amber-500"
                                    />
                                </div>

                                {/* Offset Y with Stepper */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-300">Grid Offset Y</span>
                                        <NudgeStepper 
                                            value={mapData?.gridOffsetY ?? 0} 
                                            min={-5} 
                                            max={5} 
                                            step={0.05} 
                                            onChange={(val) => throttledUpdateMap({ gridOffsetY: val })} 
                                        />
                                    </div>
                                    <ThrottledSlider 
                                        type="range" 
                                        min="-5" 
                                        max="5" 
                                        step="0.01" 
                                        value={mapData?.gridOffsetY ?? 0} 
                                        onChange={(val) => throttledUpdateMap({ gridOffsetY: val })}
                                        className="w-full accent-amber-500"
                                    />
                                </div>

                                {/* Map Scale */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-300">Map Scale (World Units)</span>
                                        <span className="text-xs text-amber-400 font-mono">{mapData?.scale || 20}u</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="5" 
                                        max="100" 
                                        step="1" 
                                        value={mapData?.scale || 20} 
                                        onChange={(e) => {
                                            const newScale = parseFloat(e.target.value);
                                            const oldScale = mapData?.scale || 20;
                                            const ratio = newScale / oldScale;
                                            const updates = { scale: newScale };

                                            if (mapData?.walls) {
                                                updates.walls = {};
                                                for (const [id, wall] of Object.entries(mapData.walls)) {
                                                    updates.walls[id] = {
                                                        ...wall,
                                                        points: wall.points.map(p => ({
                                                            ...p,
                                                            x: p.x * ratio,
                                                            z: p.z * ratio,
                                                        }))
                                                    };
                                                }
                                            }

                                            if (mapData?.lights) {
                                                updates.lights = {};
                                                for (const [id, light] of Object.entries(mapData.lights)) {
                                                    updates.lights[id] = {
                                                        ...light,
                                                        position: {
                                                            ...light.position,
                                                            x: light.position.x * ratio,
                                                            z: light.position.z * ratio,
                                                        },
                                                        radius: (light.radius || 15) * ratio,
                                                    };
                                                }
                                            }
                                            throttledUpdateMap(updates);
                                        }}
                                        className="w-full accent-amber-500"
                                    />
                                </div>

                                {/* Grid Color & Thickness */}
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Grid Color</span>
                                        <div className="flex gap-2 items-center bg-slate-900 border border-slate-700/80 rounded-xl p-1.5">
                                            <input 
                                                type="color" 
                                                value={mapData?.gridColor || '#888888'} 
                                                onChange={(e) => throttledUpdateMap({ gridColor: e.target.value })}
                                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                                            />
                                            <span className="text-[11px] text-slate-300 uppercase font-mono">{mapData?.gridColor || '#888888'}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Grid Line Width</span>
                                        <ThrottledSlider 
                                            type="range" 
                                            min="0.5" 
                                            max="4" 
                                            step="0.5" 
                                            value={mapData?.gridThickness || 0.5} 
                                            onChange={(val) => throttledUpdateMap({ gridThickness: val })}
                                            className="w-full accent-amber-500 mt-2"
                                        />
                                    </div>
                                </div>

                                {/* Toggles: Visibility, Snapping, Nameplates */}
                                <div className="grid grid-cols-3 gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => updateMap(campaignCode, activeMapId, { showGrid: mapData?.showGrid === false ? true : false })}
                                        className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${mapData?.showGrid !== false ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}
                                    >
                                        <Icon name={mapData?.showGrid !== false ? "grid" : "layout-grid"} size={14} />
                                        <span className="text-[10px]">{mapData?.showGrid !== false ? 'Grid ON' : 'Grid OFF'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => updateMap(campaignCode, activeMapId, { isSnapToGrid: mapData?.isSnapToGrid === false ? true : false })}
                                        className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${mapData?.isSnapToGrid !== false ? 'border-green-500/50 bg-green-500/10 text-green-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}
                                    >
                                        <Icon name="magnet" size={14} />
                                        <span className="text-[10px]">{mapData?.isSnapToGrid !== false ? 'Snap ON' : 'Snap OFF'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => updateMap(campaignCode, activeMapId, { showNameplates: mapData?.showNameplates === false ? true : false })}
                                        className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${mapData?.showNameplates !== false ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}
                                    >
                                        <Icon name={mapData?.showNameplates !== false ? "eye" : "eye-off"} size={14} />
                                        <span className="text-[10px]">{mapData?.showNameplates !== false ? 'Names ON' : 'Names OFF'}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SECTION 4: VISION & FOG OF WAR */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 overflow-hidden shadow-sm">
                        <div 
                            className="p-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                            onClick={() => toggleSection('vision')}
                        >
                            <div className="flex items-center gap-2">
                                <Icon name="eye" size={16} className="text-purple-400" />
                                <h4 className="text-xs font-bold text-slate-200 tracking-wide">Vision & Dynamic Fog</h4>
                            </div>
                            <Icon name={expandedSections.vision ? "chevron-up" : "chevron-down"} size={16} className="text-slate-500" />
                        </div>

                        {expandedSections.vision && (
                            <div className="p-3.5 pt-0 space-y-3 border-t border-slate-800/50">
                                <div>
                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Vision Mode</span>
                                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                                        {[
                                            { id: 'off', label: 'Vision Off', icon: 'eye-off' },
                                            { id: 'fow', label: 'Fog of War', icon: 'eye' },
                                            { id: 'darkness', label: 'Darkness', icon: 'moon' }
                                        ].map(vMode => {
                                            const current = mapData?.visionMode || 'off';
                                            const isSelected = current === vMode.id;
                                            return (
                                                <button
                                                    key={vMode.id}
                                                    type="button"
                                                    onClick={() => updateMap(campaignCode, activeMapId, { visionMode: vMode.id })}
                                                    className={`py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${isSelected ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                                >
                                                    <Icon name={vMode.icon} size={13} />
                                                    <span className="text-[11px]">{vMode.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => updateMap(campaignCode, activeMapId, { fowWallsEnabled: mapData?.fowWallsEnabled === true ? false : true })}
                                        className={`p-2 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${mapData?.fowWallsEnabled ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}
                                    >
                                        <Icon name={mapData?.fowWallsEnabled ? "shield" : "shield-off"} size={13} />
                                        <span>FoW Walls</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => updateMap(campaignCode, activeMapId, { playerDoorVisibility: mapData?.playerDoorVisibility === true ? false : true })}
                                        className={`p-2 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${mapData?.playerDoorVisibility ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}
                                    >
                                        <Icon name={mapData?.playerDoorVisibility ? "door-open" : "door-closed"} size={13} />
                                        <span>Door Vis</span>
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (await dialog.confirm("Reset all explored Fog of War back to pitch black?")) {
                                            const currentReset = mapData?.fowResetCounter || 0;
                                            updateMap(campaignCode, activeMapId, { 
                                                fowExploredState: null, 
                                                fowResetCounter: currentReset + 1 
                                            });
                                            toast("Fog of war reset.", "info");
                                        }
                                    }}
                                    className="w-full py-2 bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 rounded-xl text-center text-xs font-bold text-red-300 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Icon name="rotate-ccw" size={13} />
                                    <span>Reset Explored Fog</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* SECTION 5: 3D TERRAIN & ELEVATION */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 overflow-hidden shadow-sm">
                        <div 
                            className="p-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                            onClick={() => toggleSection('elevation')}
                        >
                            <div className="flex items-center gap-2">
                                <Icon name="mountain" size={16} className="text-cyan-400" />
                                <h4 className="text-xs font-bold text-slate-200 tracking-wide">3D Terrain & Elevation</h4>
                            </div>
                            <Icon name={expandedSections.elevation ? "chevron-up" : "chevron-down"} size={16} className="text-slate-500" />
                        </div>

                        {expandedSections.elevation && (
                            <div className="p-3.5 pt-0 space-y-3.5 border-t border-slate-800/50">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-300">Token Elevation Offset</span>
                                        <NudgeStepper 
                                            value={mapData?.tokenElevationOffset ?? (!mapData?.heightmapUrl ? 0.04 : -0.12)}
                                            min={-0.5}
                                            max={0.5}
                                            step={0.02}
                                            onChange={(val) => throttledUpdateMap({ tokenElevationOffset: val })}
                                        />
                                    </div>
                                    <ThrottledSlider 
                                        type="range" 
                                        min="-0.5" 
                                        max="0.5" 
                                        step="0.01" 
                                        value={mapData?.tokenElevationOffset ?? (!mapData?.heightmapUrl ? 0.04 : -0.12)} 
                                        onChange={(val) => throttledUpdateMap({ tokenElevationOffset: val })}
                                        className="w-full accent-cyan-500"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-slate-300">3D Heightmap Scale</span>
                                        <span className="text-xs text-cyan-400 font-mono">{mapData?.heightScale || 1}x</span>
                                    </div>
                                    <ThrottledSlider 
                                        type="range" 
                                        min="0" 
                                        max="10" 
                                        step="0.1" 
                                        value={mapData?.heightScale || 1} 
                                        onChange={(val) => throttledUpdateMap({ heightScale: val })}
                                        className="w-full accent-cyan-500"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={() => updateMap(campaignCode, activeMapId, { hide3DTokenBases: mapData?.hide3DTokenBases !== false ? false : true })}
                                    className={`w-full py-2 border rounded-xl text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mapData?.hide3DTokenBases !== false ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 bg-slate-900 text-slate-400'}`}
                                >
                                    <Icon name={mapData?.hide3DTokenBases !== false ? "eye-off" : "eye"} size={14} />
                                    <span>{mapData?.hide3DTokenBases !== false ? '3D Bases Hidden' : '3D Bases Visible'}</span>
                                </button>

                                {mapData?.heightmapUrl && (
                                    <button 
                                        onClick={() => updateMap(campaignCode, activeMapId, { heightmapUrl: null, heightScale: 1 })} 
                                        className="w-full py-2 border border-red-900/50 rounded-xl text-center text-xs font-bold text-red-400 hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <Icon name="trash-2" size={13} /> Remove Heightmap
                                    </button>
                                )}

                                {mapData?.normalMapUrl && (
                                    <button 
                                        onClick={() => updateMap(campaignCode, activeMapId, { normalMapUrl: null })} 
                                        className="w-full py-2 border border-red-900/50 rounded-xl text-center text-xs font-bold text-red-400 hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <Icon name="trash-2" size={13} /> Remove Normal Map
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* SECTION 6: EXPORT & BACKUP */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 overflow-hidden shadow-sm">
                        <div 
                            className="p-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                            onClick={() => toggleSection('backup')}
                        >
                            <div className="flex items-center gap-2">
                                <Icon name="save" size={16} className="text-emerald-400" />
                                <h4 className="text-xs font-bold text-slate-200 tracking-wide">Backup & Export</h4>
                            </div>
                            <Icon name={expandedSections.backup ? "chevron-up" : "chevron-down"} size={16} className="text-slate-500" />
                        </div>

                        {expandedSections.backup && (
                            <div className="p-3.5 pt-0 space-y-2.5 border-t border-slate-800/50">
                                <button 
                                    onClick={handleExportPreset} 
                                    disabled={isExporting} 
                                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors border border-slate-700 shadow"
                                >
                                    {isExporting ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="download" size={14} />}
                                    <span>{isExporting ? "Packaging Preset..." : "Export Map Preset JSON"}</span>
                                </button>
                                <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                                    Exports a shareable JSON file containing the battlemap image, 3D heightmaps, lighting, walls, tokens, and character data.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <input 
                type="file" 
                ref={mapFileInputRef} 
                onChange={handleMapUpload} 
                accept="image/*, video/mp4, video/webm" 
                className="hidden" 
            />
        </div>
    );
};

const TabButton = ({ name, activeTab, onClick, icon, children }) => (
    <button
        onClick={() => onClick(name)}
        className={`flex-1 py-3 px-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-all relative ${activeTab === name ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'}`}
    >
        <Icon name={icon} size={15} />
        <span className="truncate">{children}</span>
        {activeTab === name && (
            <div className="absolute bottom-0 inset-x-2 h-0.5 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full" />
        )}
    </button>
);

export default AssetManager;
