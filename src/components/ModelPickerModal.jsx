import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from './Icon';
import ModelViewer from './ModelViewer';
import { searchGithubModels, getAvailableCategories } from '../utils/miniManifest';
import { retrieveChunkedMap, storeChunkedMap } from '../utils/storageUtils';
import { useToast } from './ToastProvider';
import { Client } from "@gradio/client";
import { installGradioCorsFix } from '../utils/gradioPolyfill';

const MATERIAL_PRESETS = [
    { id: 'original', label: 'Painted (Original)', icon: 'palette' },
    { id: 'stone', label: 'Stone Statue', icon: 'shield' },
    { id: 'bronze', label: 'Pewter / Bronze', icon: 'award' },
    { id: 'marble', label: 'Polished Marble', icon: 'gem' },
    { id: 'silver', label: 'Silver Miniature', icon: 'sparkles' }
];

const SIZE_PRESETS = [
    { label: 'Tiny', scale: 0.5 },
    { label: 'Medium', scale: 1.0 },
    { label: 'Large', scale: 1.8 },
    { label: 'Huge', scale: 2.5 },
    { label: 'Gargantuan', scale: 3.5 }
];

const ELEVATION_PRESETS = [
    { label: 'Grounded', offset: 0 },
    { label: 'Hovering', offset: 0.25 },
    { label: 'Flying', offset: 0.8 }
];

const ROTATION_SNAPS = [
    { label: 'N (0°)', deg: 0 },
    { label: 'E (90°)', deg: 90 },
    { label: 'S (180°)', deg: 180 },
    { label: 'W (270°)', deg: 270 }
];

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const MiniThumbnail = ({ model, isSelected }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const category = (model.category || "").toLowerCase();

    // Thematic styling based on creature category
    const categoryStyle = useMemo(() => {
        if (category === 'undead') {
            return {
                gradient: 'from-emerald-950 via-slate-900 to-teal-950',
                border: 'border-emerald-500/30',
                icon: 'skull',
                iconColor: 'text-emerald-400',
                glow: 'shadow-[inset_0_0_15px_rgba(16,185,129,0.15)]',
                accent: 'bg-emerald-500/20 text-emerald-300'
            };
        }
        if (category === 'dragons') {
            return {
                gradient: 'from-red-950 via-slate-900 to-amber-950',
                border: 'border-red-500/30',
                icon: 'flame',
                iconColor: 'text-red-400',
                glow: 'shadow-[inset_0_0_15px_rgba(239,68,68,0.15)]',
                accent: 'bg-red-500/20 text-red-300'
            };
        }
        if (category === 'fiends') {
            return {
                gradient: 'from-purple-950 via-slate-900 to-rose-950',
                border: 'border-purple-500/30',
                icon: 'flame',
                iconColor: 'text-purple-400',
                glow: 'shadow-[inset_0_0_15px_rgba(168,85,247,0.15)]',
                accent: 'bg-purple-500/20 text-purple-300'
            };
        }
        if (category === 'beasts') {
            return {
                gradient: 'from-amber-950 via-slate-900 to-emerald-950',
                border: 'border-amber-500/30',
                icon: 'paw-print',
                iconColor: 'text-amber-400',
                glow: 'shadow-[inset_0_0_15px_rgba(245,158,11,0.15)]',
                accent: 'bg-amber-500/20 text-amber-300'
            };
        }
        if (category === 'heroes') {
            return {
                gradient: 'from-blue-950 via-slate-900 to-indigo-950',
                border: 'border-blue-500/30',
                icon: 'shield',
                iconColor: 'text-blue-400',
                glow: 'shadow-[inset_0_0_15px_rgba(59,130,246,0.15)]',
                accent: 'bg-blue-500/20 text-blue-300'
            };
        }
        if (category === 'aberrations') {
            return {
                gradient: 'from-fuchsia-950 via-slate-900 to-violet-950',
                border: 'border-fuchsia-500/30',
                icon: 'eye',
                iconColor: 'text-fuchsia-400',
                glow: 'shadow-[inset_0_0_15px_rgba(217,70,239,0.15)]',
                accent: 'bg-fuchsia-500/20 text-fuchsia-300'
            };
        }
        if (category === 'constructs') {
            return {
                gradient: 'from-slate-800 via-slate-900 to-zinc-800',
                border: 'border-slate-500/30',
                icon: 'cpu',
                iconColor: 'text-slate-300',
                glow: 'shadow-[inset_0_0_15px_rgba(148,163,184,0.15)]',
                accent: 'bg-slate-500/20 text-slate-300'
            };
        }
        if (category === 'elementals') {
            return {
                gradient: 'from-cyan-950 via-slate-900 to-blue-950',
                border: 'border-cyan-500/30',
                icon: 'zap',
                iconColor: 'text-cyan-400',
                glow: 'shadow-[inset_0_0_15px_rgba(6,182,212,0.15)]',
                accent: 'bg-cyan-500/20 text-cyan-300'
            };
        }
        return {
            gradient: 'from-slate-900 via-slate-950 to-amber-950/40',
            border: 'border-slate-700/50',
            icon: 'box',
            iconColor: 'text-amber-400/80',
            glow: '',
            accent: 'bg-slate-800 text-slate-400'
        };
    }, [category]);

    const hasValidImage = model.thumb && !imgFailed;

    return (
        <div className={`aspect-square rounded-lg mb-1.5 flex items-center justify-center relative overflow-hidden border transition-all ${
            categoryStyle.border
        } ${categoryStyle.glow} bg-gradient-to-br ${categoryStyle.gradient}`}>
            {hasValidImage ? (
                <img 
                    src={model.thumb} 
                    alt={model.name} 
                    onError={() => setImgFailed(true)}
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" 
                />
            ) : (
                <div className="flex flex-col items-center justify-center p-2 text-center w-full h-full">
                    <div className="w-10 h-10 rounded-full bg-slate-900/80 border border-slate-700/60 flex items-center justify-center shadow-md mb-1 group-hover:scale-110 transition-transform">
                        <Icon name={categoryStyle.icon} size={20} className={categoryStyle.iconColor} />
                    </div>
                    <div className="w-10 h-1.5 bg-slate-700/70 rounded-full mb-1 shadow" />
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${categoryStyle.accent}`}>
                        {model.category || 'Mini'}
                    </span>
                </div>
            )}

            {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 shadow-md ring-2 ring-slate-950">
                    <Icon name="check" size={12} className="stroke-[3]" />
                </div>
            )}
        </div>
    );
};

const ModelPickerModal = ({
    isOpen,
    entity,
    onClose,
    onSave,
    onDeleteModel
}) => {
    const toast = useToast();
    const fileInputRef = useRef(null);
    const glbFileInputRef = useRef(null);
    const [isUploadingGlb, setIsUploadingGlb] = useState(false);

    // Navigation Tabs
    const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'upload' | 'forge'
    const [mobileView, setMobileView] = useState('picker'); // 'picker' | 'preview'

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState(entity?.name || entity?.race || "");
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [availableCategories, setAvailableCategories] = useState(['All']);
    const [availableModels, setAvailableModels] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Live Staged 3D Configuration
    const initialUrl = entity?.modelUrl || entity?.model3d || null;
    const [stagedModel, setStagedModel] = useState({
        url: initialUrl,
        name: initialUrl ? (entity?.name ? `${entity.name}'s Mini` : 'Current Model') : null,
        scale: entity?.modelScale !== undefined ? entity.modelScale : 1.0,
        yOffset: entity?.modelYOffset !== undefined ? entity.modelYOffset : 0,
        rotation: entity?.modelRotation !== undefined ? entity.modelRotation : 0,
        materialStyle: entity?.materialStyle || (entity?.forceStatue ? 'stone' : 'original'),
        forceStatue: !!entity?.forceStatue
    });

    const [autoRotate, setAutoRotate] = useState(false);

    // AI 3D Forge State
    const [forgeImageSource, setForgeImageSource] = useState(entity?.image || null);
    const [isForging, setIsForging] = useState(false);
    const [forgeProgress, setForgeProgress] = useState(0);
    const [forgeStatus, setForgeStatus] = useState("");
    const [forgeStageIndex, setForgeStageIndex] = useState(0);
    const [forgeError, setForgeError] = useState(null);
    const [hfTokenInput, setHfTokenInput] = useState(() => localStorage.getItem('hf_token') || "");
    const [showHfTokenConfig, setShowHfTokenConfig] = useState(false);

    // Load Categories & Initial Search
    useEffect(() => {
        if (!isOpen) return;

        getAvailableCategories().then(cats => {
            if (cats && cats.length > 0) setAvailableCategories(cats);
        });

        // Trigger initial search based on entity name or race
        performSearch(entity?.name || entity?.race || "", 'all');
    }, [isOpen]);

    const performSearch = async (query, category) => {
        setIsSearching(true);
        try {
            const results = await searchGithubModels(query, category);
            setAvailableModels(results);
        } catch (e) {
            console.error("Search failed", e);
            toast("Failed to search 3D mini compendium", "error");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSearchSubmit = (e) => {
        if (e) e.preventDefault();
        performSearch(searchQuery, selectedCategory);
    };

    const handleCategorySelect = (cat) => {
        setSelectedCategory(cat);
        performSearch(searchQuery, cat);
    };

    // Staging Model Selection
    const handleSelectModelToPreview = (model) => {
        setStagedModel(prev => ({
            ...prev,
            url: model.url,
            name: model.name,
            scale: model.scale || prev.scale || 1.0,
            yOffset: model.yOffset || 0
        }));
        setMobileView('preview');
        toast(`Staged ${model.name} in 3D viewport!`, "info");
    };

    // Custom 3D Model File Upload (.glb / .gltf)
    const handleGlbUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingGlb(true);
        try {
            const base64 = await fileToBase64(file);
            const chunkedId = await storeChunkedMap(base64, file.name);
            setStagedModel(prev => ({
                ...prev,
                url: chunkedId,
                name: file.name.replace(/\.[^/.]+$/, ""),
                scale: 1.0,
                yOffset: 0
            }));
            setMobileView('preview');
            toast(`Loaded custom 3D model: ${file.name}`, "success");
        } catch (err) {
            console.error("Failed to store chunked model, falling back to Blob URL:", err);
            try {
                const blobUrl = URL.createObjectURL(file);
                setStagedModel(prev => ({
                    ...prev,
                    url: blobUrl,
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    scale: 1.0,
                    yOffset: 0
                }));
                setMobileView('preview');
                toast(`Loaded 3D miniature: ${file.name}`, "info");
            } catch (bErr) {
                toast("Failed to load 3D file: " + err.message, "error");
            }
        } finally {
            setIsUploadingGlb(false);
            if (e.target) e.target.value = null;
        }
    };

    // AI 3D Forge Logic with Multi-Stage Progress & Automatic Retry
    const handleForge3D = async () => {
        if (!forgeImageSource) {
            toast("Please provide an image or character portrait to forge a 3D mini.", "warning");
            return;
        }

        setIsForging(true);
        setForgeError(null);
        setForgeProgress(10);
        setForgeStageIndex(1);
        setForgeStatus("Connecting to Neural 3D Forge Space...");

        let imageBlob;
        try {
            if (typeof forgeImageSource === 'string' && forgeImageSource.startsWith('chunked:')) {
                const b64 = await retrieveChunkedMap(forgeImageSource);
                const res = await fetch(b64);
                imageBlob = await res.blob();
            } else if (typeof forgeImageSource === 'string') {
                const res = await fetch(forgeImageSource);
                imageBlob = await res.blob();
            } else if (forgeImageSource instanceof Blob) {
                imageBlob = forgeImageSource;
            } else {
                throw new Error("Invalid image format provided for 3D Forge.");
            }
        } catch (err) {
            console.error("Image conversion error:", err);
            setIsForging(false);
            setForgeError("Could not process portrait image: " + err.message);
            toast("Could not process portrait image: " + err.message, "error");
            return;
        }

        installGradioCorsFix();

        const hfToken = hfTokenInput?.trim() || import.meta.env.VITE_HF_TOKEN || localStorage.getItem('hf_token');
        const options = hfToken ? { hf_token: hfToken } : {};

        const imageFile = imageBlob instanceof File 
            ? imageBlob 
            : new File([imageBlob], "portrait.png", { type: imageBlob.type || "image/png" });

        // Fallback space sequence with per-space auto-retry
        const SPACES = [
            {
                name: "VAST-AI/TripoSG",
                label: "TripoSG Neural Mesh",
                fn: async (app) => {
                    try { await app.predict("/start_session", {}); } catch (e) {}
                    let meshResult = null;
                    try {
                        meshResult = await app.predict("/image_to_3d", {
                            image: imageFile,
                            seed: 42,
                            num_inference_steps: 8,
                            guidance_scale: 0,
                            simplify: true,
                            target_face_num: 12000
                        });
                    } catch (objErr) {
                        meshResult = await app.predict("/image_to_3d", [imageFile, 42, 8, 0, true, 12000]);
                    }
                    return meshResult?.data?.[0]?.url;
                }
            },
            {
                name: "stabilityai/TripoSR",
                label: "StabilityAI TripoSR",
                fn: async (app) => {
                    let res = null;
                    try {
                        res = await app.predict("/predict", [imageFile, 0.85]);
                    } catch (e) {
                        res = await app.predict("/predict", [imageFile]);
                    }
                    return res?.data?.[0]?.url;
                }
            },
            {
                name: "camenduru/TripoSR",
                label: "TripoSR Fast Generator",
                fn: async (app) => {
                    const result = await app.predict("/predict", [imageFile]);
                    return result?.data?.[0]?.url;
                }
            },
            {
                name: "TencentARC/InstantMesh",
                label: "InstantMesh High-Fidelity",
                fn: async (app) => {
                    const result = await app.predict("/check_input_image", [imageFile]);
                    const processedImage = result.data[0];
                    const meshResult = await app.predict("/generate_mvs", [processedImage, 42]);
                    const finalMesh = await app.predict("/make3d", [meshResult.data[0]]);
                    return finalMesh?.data?.[0]?.url;
                }
            }
        ];

        let generatedModelUrl = null;
        let lastErrorMsg = null;

        for (let sIdx = 0; sIdx < SPACES.length && !generatedModelUrl; sIdx++) {
            const space = SPACES[sIdx];
            const maxRetries = 2; // Automatic retry per space on failure

            for (let attempt = 1; attempt <= maxRetries && !generatedModelUrl; attempt++) {
                try {
                    const isRetry = attempt > 1;
                    setForgeStatus(isRetry 
                        ? `Transient issue encountered. Retrying ${space.label} (Attempt ${attempt}/${maxRetries})...`
                        : `Connecting to ${space.label}...`
                    );
                    setForgeProgress(Math.min(88, 15 + sIdx * 20 + attempt * 7));
                    setForgeStageIndex(1);

                    const app = await Client.connect(space.name, options);

                    setForgeProgress(Math.min(92, 35 + sIdx * 18 + attempt * 5));
                    setForgeStageIndex(2);
                    setForgeStatus(`Synthesizing 3D mesh with ${space.label}...`);

                    const url = await space.fn(app);
                    if (url) {
                        generatedModelUrl = url;
                        break;
                    }
                } catch (err) {
                    console.warn(`Space ${space.name} (attempt ${attempt}/${maxRetries}) failed:`, err);
                    lastErrorMsg = err?.message || String(err);
                    
                    if (attempt < maxRetries) {
                        setForgeStatus(`${space.label} connection paused. Automatically retrying in 1.5s...`);
                        await new Promise(res => setTimeout(res, 1500));
                    } else if (sIdx < SPACES.length - 1) {
                        setForgeStatus(`${space.label} unavailable. Automatically trying alternative engine...`);
                        await new Promise(res => setTimeout(res, 800));
                    }
                }
            }
        }

        if (generatedModelUrl) {
            setForgeProgress(100);
            setForgeStageIndex(4);
            setForgeStatus("3D Miniature ready! Loading into viewport...");

            // Stage model in preview without immediately exiting!
            setStagedModel(prev => ({
                ...prev,
                url: generatedModelUrl,
                name: `Forged: ${entity?.name || 'Custom Mini'}`,
                scale: 1.0,
                yOffset: 0
            }));

            // Switch to preview mode so user can inspect and customize
            setActiveTab('browse');
            setMobileView('preview');
            toast("3D Miniature forged successfully! Tune adjustments below.", "success");
        } else {
            const errDetail = lastErrorMsg ? ` (${lastErrorMsg})` : "";
            setForgeError(`The AI 3D spaces are currently sleeping or reaching rate limits${errDetail}. Spaces take ~30-60s to wake up on first call. You can retry automatically or provide a free Hugging Face token.`);
            toast("3D Forge was unable to generate a model. Auto-retry or provide an HF token.", "error");
        }

        setIsForging(false);
    };

    // Custom Image Upload for AI Forge
    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setForgeImageSource(file);
        toast("Loaded custom image for 3D Forge.", "info");
    };

    // Final Commit & Save
    const handleConfirmSave = () => {
        if (!stagedModel.url) {
            toast("No 3D miniature staged. Select or forge a model first.", "warning");
            return;
        }

        const config = {
            modelUrl: stagedModel.url,
            model3d: stagedModel.url,
            modelScale: Number(stagedModel.scale) || 1,
            modelYOffset: Number(stagedModel.yOffset) || 0,
            modelRotation: Number(stagedModel.rotation) || 0,
            materialStyle: stagedModel.materialStyle || 'original',
            forceStatue: stagedModel.materialStyle !== 'original'
        };

        onSave(config);
        toast(`Applied 3D mini to ${entity?.name || 'character'}!`, "success");
        onClose();
    };

    // Revert to 2D token
    const handleDeleteModel = () => {
        onDeleteModel();
        toast(`Removed 3D mini from ${entity?.name || 'character'}.`, "info");
        onClose();
    };

    if (!isOpen || !entity) return null;

    return (
        <div className="fixed inset-0 z-[10000] bg-black/85 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md animate-in fade-in">
            <div className="max-w-6xl w-full bg-slate-900 rounded-2xl border border-slate-700/80 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col h-[94vh] max-h-[900px]">
                
                {/* Header Bar */}
                <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                            <Icon name="box" size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white text-base sm:text-lg tracking-wide">
                                    3D Mini Studio: <span className="text-amber-400">{entity.name}</span>
                                </h3>
                                {entity.race && (
                                    <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                        {entity.race}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400 hidden sm:block">
                                Search 3D tokens, synthesize with AI, and fine-tune scale, height, and orientation.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Mobile Segmented Toggle */}
                        <div className="flex md:hidden bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                            <button
                                onClick={() => setMobileView('picker')}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                                    mobileView === 'picker' ? 'bg-amber-600 text-white shadow' : 'text-slate-400'
                                }`}
                            >
                                Catalog
                            </button>
                            <button
                                onClick={() => setMobileView('preview')}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                                    mobileView === 'preview' ? 'bg-amber-600 text-white shadow' : 'text-slate-400'
                                }`}
                            >
                                3D View
                            </button>
                        </div>

                        {/* Revert / Delete 3D Model button */}
                        {(entity.modelUrl || entity.model3d) && (
                            <button
                                type="button"
                                onClick={handleDeleteModel}
                                className="px-3 py-1.5 bg-red-950/70 hover:bg-red-900 border border-red-500/40 text-red-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                                title="Clear 3D model and use flat 2D token"
                            >
                                <Icon name="trash-2" size={13} />
                                <span className="hidden sm:inline">Delete 3D</span>
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            <Icon name="x" size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Content Area (Split 2-Column on Desktop) */}
                <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-900 overflow-hidden">

                    {/* LEFT PANEL: Search & Browse OR AI Forge */}
                    <div className={`w-full md:w-1/2 flex flex-col border-r border-slate-800 bg-slate-950/60 min-h-0 ${
                        mobileView === 'picker' ? 'flex' : 'hidden md:flex'
                    }`}>
                        {/* Tab Selector: Browse vs Upload GLB vs AI Forge */}
                        <div className="flex border-b border-slate-800 bg-slate-900/80 px-4 pt-2 gap-2 shrink-0">
                            <button
                                onClick={() => setActiveTab('browse')}
                                className={`pb-2.5 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
                                    activeTab === 'browse'
                                        ? 'border-amber-500 text-amber-400'
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Icon name="search" size={16} />
                                Miniature Library
                            </button>
                            <button
                                onClick={() => setActiveTab('upload')}
                                className={`pb-2.5 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
                                    activeTab === 'upload'
                                        ? 'border-blue-500 text-blue-400'
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Icon name="upload-cloud" size={16} className="text-blue-400" />
                                Upload .GLB
                            </button>
                            <button
                                onClick={() => setActiveTab('forge')}
                                className={`pb-2.5 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
                                    activeTab === 'forge'
                                        ? 'border-purple-500 text-purple-400'
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Icon name="sparkles" size={16} className="text-purple-400" />
                                AI 3D Forge
                            </button>
                        </div>

                        {/* TAB 1: BROWSE & SEARCH */}
                        {activeTab === 'browse' && (
                            <div className="flex-1 flex flex-col min-h-0">
                                {/* Search Bar */}
                                <div className="p-3 border-b border-slate-800 bg-slate-900 flex gap-2 shrink-0">
                                    <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                placeholder="Search mini by name, race, class (e.g. Orc, Wizard, Dragon)..."
                                                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                                            />
                                            <Icon name="search" size={16} className="absolute left-3 top-2.5 text-slate-500" />
                                            {searchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setSearchQuery(""); performSearch("", selectedCategory); }}
                                                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                                                >
                                                    <Icon name="x" size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isSearching}
                                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
                                        >
                                            {isSearching ? <Icon name="loader-2" size={16} className="animate-spin" /> : "Search"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => glbFileInputRef.current?.click()}
                                            disabled={isUploadingGlb}
                                            className="px-3 py-2 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-500/40 text-blue-300 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                                            title="Upload custom .GLB file from computer"
                                        >
                                            {isUploadingGlb ? <Icon name="loader-2" size={14} className="animate-spin" /> : <Icon name="upload-cloud" size={14} />}
                                            <span className="hidden sm:inline">Upload .GLB</span>
                                        </button>
                                    </form>
                                </div>

                                {/* Category Pills Carousel */}
                                <div className="px-3 py-2 border-b border-slate-800 bg-slate-950 flex gap-1.5 overflow-x-auto custom-scroll shrink-0">
                                    {availableCategories.slice(0, 10).map((cat) => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => handleCategorySelect(cat.toLowerCase())}
                                            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                                                selectedCategory === cat.toLowerCase()
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700/50'
                                            }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Model Grid */}
                                <div className="flex-1 p-3 overflow-y-auto custom-scroll bg-slate-950/30">
                                    {isSearching ? (
                                        <div className="flex flex-col items-center justify-center h-48 text-amber-400 gap-2">
                                            <Icon name="loader-2" size={32} className="animate-spin" />
                                            <span className="text-xs tracking-wider uppercase">Searching 3D Compendium...</span>
                                        </div>
                                    ) : availableModels.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
                                            <Icon name="search-x" size={36} className="opacity-40" />
                                            <p className="text-sm">No models found matching "{searchQuery}"</p>
                                            <button
                                                onClick={() => { setSearchQuery(""); setSelectedCategory("all"); performSearch("", "all"); }}
                                                className="text-xs text-amber-400 hover:underline"
                                            >
                                                Clear filters & show all
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                            {/* Upload Custom GLB CTA Tile inside grid */}
                                            <div
                                                onClick={() => glbFileInputRef.current?.click()}
                                                className="bg-blue-950/20 border border-blue-500/40 hover:border-blue-400 rounded-xl p-3 cursor-pointer flex flex-col items-center justify-center text-center transition-all group hover:bg-blue-900/30"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-blue-900/40 border border-blue-500/50 flex items-center justify-center mb-2 text-blue-300 group-hover:scale-110 transition-transform">
                                                    {isUploadingGlb ? <Icon name="loader-2" size={20} className="animate-spin" /> : <Icon name="upload-cloud" size={20} />}
                                                </div>
                                                <div className="font-bold text-xs text-blue-300">{isUploadingGlb ? "Uploading..." : "Upload .GLB"}</div>
                                                <div className="text-[10px] text-blue-400/80 mt-0.5">Custom / Hero Forge</div>
                                            </div>

                                            {/* AI Forge CTA Tile inside grid */}
                                            <div
                                                onClick={() => setActiveTab('forge')}
                                                className="bg-purple-950/20 border border-purple-500/40 hover:border-purple-400 rounded-xl p-3 cursor-pointer flex flex-col items-center justify-center text-center transition-all group hover:bg-purple-900/30"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-purple-900/40 border border-purple-500/50 flex items-center justify-center mb-2 text-purple-300 group-hover:scale-110 transition-transform">
                                                    <Icon name="sparkles" size={20} />
                                                </div>
                                                <div className="font-bold text-xs text-purple-300">Forge with AI</div>
                                                <div className="text-[10px] text-purple-400/80 mt-0.5">From Character Portrait</div>
                                            </div>

                                            {/* Model Items */}
                                            {availableModels.map((model) => {
                                                const isSelected = stagedModel.url === model.url;
                                                return (
                                                    <div
                                                        key={model.id}
                                                        onClick={() => handleSelectModelToPreview(model)}
                                                        className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                                                            isSelected
                                                                ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500/50'
                                                                : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-500 hover:bg-slate-800'
                                                        }`}
                                                    >
                                                        <div>
                                                            <MiniThumbnail model={model} isSelected={isSelected} />
                                                            <div className="font-semibold text-xs text-slate-200 group-hover:text-white truncate" title={model.name}>
                                                                {model.name}
                                                            </div>
                                                            {model.category && (
                                                                <div className="text-[10px] text-slate-400 truncate">
                                                                    {model.category}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleSelectModelToPreview(model); }}
                                                            className={`mt-2 w-full py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                                                                isSelected
                                                                    ? 'bg-amber-600 text-white'
                                                                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                                            }`}
                                                        >
                                                            <Icon name="eye" size={12} />
                                                            {isSelected ? "Previewing" : "Preview"}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB 2: UPLOAD CUSTOM 3D MINI (.GLB / .GLTF) */}
                        {activeTab === 'upload' && (
                            <div className="flex-1 p-5 overflow-y-auto custom-scroll bg-slate-950/40 flex flex-col justify-between">
                                <div className="space-y-4">
                                    <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
                                        <Icon name="upload-cloud" size={24} className="text-blue-400 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-blue-200">Custom 3D Miniature Upload</h4>
                                            <p className="text-xs text-blue-300/80 mt-1 leading-relaxed">
                                                Load your custom 3D tabletop miniatures (.glb / .gltf) directly into Dungeonmind.
                                                Compatible with models from <b>Hero Forge</b>, <b>Titancraft</b>, <b>Eldritch Foundry</b>, <b>Thingiverse</b>, and <b>Blender</b>.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Upload Dropzone */}
                                    <div
                                        onClick={() => glbFileInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const files = e.dataTransfer.files;
                                            if (files && files[0]) {
                                                handleGlbUpload({ target: { files } });
                                            }
                                        }}
                                        className="border-2 border-dashed border-blue-500/40 hover:border-blue-400 bg-slate-900/60 hover:bg-slate-900/90 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group shadow-inner"
                                    >
                                        <div className="w-16 h-16 rounded-2xl bg-blue-900/30 border border-blue-500/40 flex items-center justify-center mb-4 text-blue-400 group-hover:scale-110 transition-transform shadow-lg">
                                            {isUploadingGlb ? (
                                                <Icon name="loader-2" size={32} className="animate-spin text-blue-300" />
                                            ) : (
                                                <Icon name="box" size={32} />
                                            )}
                                        </div>
                                        <h5 className="font-bold text-white text-sm mb-1">
                                            {isUploadingGlb ? "Reading 3D Geometry..." : "Drop your .GLB or .GLTF file here"}
                                        </h5>
                                        <p className="text-xs text-slate-400 max-w-sm mb-4">
                                            Click anywhere to browse files, or drag and drop your miniature from your desktop.
                                        </p>
                                        <button
                                            type="button"
                                            disabled={isUploadingGlb}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-colors"
                                        >
                                            <Icon name="folder-open" size={14} />
                                            Browse 3D Model File
                                        </button>
                                        <input
                                            ref={glbFileInputRef}
                                            type="file"
                                            accept=".glb,.gltf"
                                            onChange={handleGlbUpload}
                                            className="hidden"
                                        />
                                    </div>

                                    {/* Feature compatibility info */}
                                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                                        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                            <Icon name="check-circle" size={13} className="text-emerald-400" />
                                            Supported Miniature Features
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                                            <div className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                                                <Icon name="sparkles" size={14} className="text-amber-400" />
                                                <span>PBR Textures & Colors</span>
                                            </div>
                                            <div className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                                                <Icon name="shield" size={14} className="text-blue-400" />
                                                <span>Stone & Metal Finishes</span>
                                            </div>
                                            <div className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                                                <Icon name="compass" size={14} className="text-emerald-400" />
                                                <span>Compass Facing Arrow</span>
                                            </div>
                                            <div className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                                                <Icon name="maximize-2" size={14} className="text-purple-400" />
                                                <span>Live Scale & Elevation</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => glbFileInputRef.current?.click()}
                                        disabled={isUploadingGlb}
                                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Icon name="upload-cloud" size={18} />
                                        Select .GLB File
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: AI 3D FORGE */}
                        {activeTab === 'forge' && (
                            <div className="flex-1 p-5 overflow-y-auto custom-scroll bg-slate-950/40 flex flex-col justify-between">
                                <div className="space-y-4">
                                    <div className="bg-purple-950/30 border border-purple-500/30 rounded-xl p-4 flex items-start gap-3">
                                        <Icon name="sparkles" size={24} className="text-purple-400 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-purple-200">Neural 3D Miniature Sculptor</h4>
                                            <p className="text-xs text-purple-300/80 mt-1 leading-relaxed">
                                                Converts a 2D portrait into a full 3D tabletop miniature with multi-view neural depth extraction.
                                                Generated models stage directly into the live 3D previewer for inspection and tuning before saving.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Source Image Selector */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Source Portrait Image</label>
                                        <div className="flex items-center gap-4 bg-slate-900 border border-slate-700/80 rounded-xl p-3">
                                            <div className="w-20 h-20 rounded-lg bg-slate-950 border border-slate-700 overflow-hidden relative shrink-0 flex items-center justify-center">
                                                {forgeImageSource ? (
                                                    <img
                                                        src={typeof forgeImageSource === 'string' ? forgeImageSource : URL.createObjectURL(forgeImageSource)}
                                                        alt="Portrait preview"
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Icon name="image" size={28} className="text-slate-600" />
                                                )}
                                            </div>

                                            <div className="flex-1 space-y-2">
                                                <div className="text-xs text-slate-400">
                                                    {forgeImageSource ? "Using character portrait" : "No portrait set. Upload an image below."}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputRef.current?.click()}
                                                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <Icon name="upload" size={13} />
                                                        Upload Image
                                                    </button>
                                                    <input
                                                        ref={fileInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleImageUpload}
                                                        className="hidden"
                                                    />
                                                    {entity?.image && forgeImageSource !== entity.image && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setForgeImageSource(entity.image)}
                                                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg"
                                                        >
                                                            Reset to Portrait
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Optional Hugging Face Token Settings */}
                                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                                        <div 
                                            onClick={() => setShowHfTokenConfig(!showHfTokenConfig)} 
                                            className="flex items-center justify-between cursor-pointer text-xs text-slate-400 hover:text-slate-200"
                                        >
                                            <span className="flex items-center gap-1.5 font-semibold">
                                                <Icon name="key" size={13} className="text-amber-400" />
                                                Hugging Face Access Token (Optional)
                                            </span>
                                            <Icon name={showHfTokenConfig ? "chevron-up" : "chevron-down"} size={14} />
                                        </div>

                                        {showHfTokenConfig && (
                                            <div className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-2">
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Free Hugging Face spaces can sleep when idle. Adding a free HF Access Token wakes spaces immediately and provides faster queue times.
                                                </p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="password"
                                                        value={hfTokenInput}
                                                        onChange={(e) => setHfTokenInput(e.target.value)}
                                                        placeholder="hf_xxxxxxxxxxxxxxxx..."
                                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-purple-500 font-mono"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            localStorage.setItem('hf_token', hfTokenInput.trim());
                                                            toast("Saved Hugging Face token!", "success");
                                                        }}
                                                        className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Progress Bar & Status */}
                                    {isForging && (
                                        <div className="bg-slate-900/90 border border-purple-500/40 rounded-xl p-4 space-y-3 animate-in fade-in">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-bold text-purple-300 flex items-center gap-2">
                                                    <Icon name="loader-2" size={14} className="animate-spin text-purple-400" />
                                                    {forgeStatus}
                                                </span>
                                                <span className="font-mono text-purple-400 font-bold">{forgeProgress}%</span>
                                            </div>

                                            {/* Progress Bar Track */}
                                            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-700/60 p-0.5">
                                                <div
                                                    className="bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                                                    style={{ width: `${forgeProgress}%` }}
                                                />
                                            </div>

                                            {/* Stage Indicators */}
                                            <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-400 text-center font-medium">
                                                <span className={forgeStageIndex >= 1 ? 'text-purple-300 font-bold' : ''}>1. Connect</span>
                                                <span className={forgeStageIndex >= 2 ? 'text-purple-300 font-bold' : ''}>2. Depth</span>
                                                <span className={forgeStageIndex >= 3 ? 'text-purple-300 font-bold' : ''}>3. Neural Mesh</span>
                                                <span className={forgeStageIndex >= 4 ? 'text-purple-300 font-bold' : ''}>4. Staging</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Forge Error & Retry Notification */}
                                    {forgeError && !isForging && (
                                        <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-3.5 space-y-2 text-xs text-rose-200 animate-in fade-in">
                                            <div className="flex items-center gap-2 font-bold text-rose-300">
                                                <Icon name="alert-triangle" size={16} />
                                                <span>AI Forge Server Notification</span>
                                            </div>
                                            <p className="text-rose-200/80 leading-relaxed text-[11px]">
                                                {forgeError}
                                            </p>
                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={handleForge3D}
                                                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow"
                                                >
                                                    <Icon name="rotate-cw" size={13} />
                                                    Retry Forge Now
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowHfTokenConfig(true)}
                                                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                                                >
                                                    Add HF Token
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Forge Trigger Button */}
                                <div className="pt-4 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={handleForge3D}
                                        disabled={isForging || !forgeImageSource}
                                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-500 hover:to-amber-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isForging ? (
                                            <>
                                                <Icon name="loader-2" size={18} className="animate-spin" />
                                                Sculpting 3D Miniature...
                                            </>
                                        ) : (
                                            <>
                                                <Icon name="sparkles" size={18} />
                                                Forge 3D Miniature Now
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT PANEL: LIVE 3D VIEWPORT & FINE-TUNING SUITE */}
                    <div className={`w-full md:w-1/2 flex flex-col bg-slate-900 min-h-0 overflow-hidden ${
                        mobileView === 'preview' ? 'flex' : 'hidden md:flex'
                    }`}>
                        {/* 3D Viewport Controls Top Bar */}
                        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                    <Icon name="box" size={14} className="text-amber-400" />
                                    {stagedModel.name || "No Model Staged"}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAutoRotate(r => !r)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                                        autoRotate ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                                    }`}
                                    title="Toggle automatic turntable rotation"
                                >
                                    <Icon name="refresh-cw" size={12} className={autoRotate ? "animate-spin" : ""} />
                                    Turntable
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStagedModel(prev => ({ ...prev, rotation: 0, yOffset: 0, scale: 1.0 }))}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                    title="Reset orientation and scale to defaults"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* Interactive 3D Canvas Viewport */}
                        <div className="relative shrink-0 h-[210px] sm:h-[250px] md:h-[270px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
                            {stagedModel.url ? (
                                <ModelViewer
                                    modelUrl={stagedModel.url}
                                    scale={stagedModel.scale}
                                    yOffset={stagedModel.yOffset}
                                    modelRotation={stagedModel.rotation}
                                    materialStyle={stagedModel.materialStyle}
                                    forceStatue={stagedModel.forceStatue}
                                    autoRotate={autoRotate}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-3">
                                    <Icon name="box" size={48} className="opacity-30" />
                                    <p className="text-sm font-medium">Select a miniature on the left to preview</p>
                                </div>
                            )}

                            {/* Orbit Controls Hint Overlay */}
                            {stagedModel.url && (
                                <div className="absolute bottom-2 left-3 pointer-events-none bg-slate-950/70 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5 shadow">
                                    <Icon name="mouse-pointer" size={11} />
                                    <span>Drag to orbit • Scroll to zoom • Right-drag to pan</span>
                                </div>
                            )}
                        </div>

                        {/* Tuning Controls Accordion / Panel */}
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-4 pb-8 bg-slate-950/90 border-t border-slate-800 space-y-3.5 overscroll-contain">
                            
                            {/* 1. Scale Control */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                        <Icon name="maximize-2" size={12} className="text-amber-400" />
                                        Miniature Scale
                                    </label>
                                    <span className="font-mono text-xs text-amber-400 font-bold bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/30">
                                        {Number(stagedModel.scale || 1).toFixed(2)}x
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0.2"
                                    max="4.0"
                                    step="0.05"
                                    value={stagedModel.scale || 1}
                                    onChange={e => setStagedModel(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                                <div className="flex gap-1 mt-1.5">
                                    {SIZE_PRESETS.map((p) => (
                                        <button
                                            key={p.label}
                                            type="button"
                                            onClick={() => setStagedModel(prev => ({ ...prev, scale: p.scale }))}
                                            className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${
                                                Math.abs(stagedModel.scale - p.scale) < 0.05
                                                    ? 'bg-amber-600 text-white'
                                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Elevation / Height Offset */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                        <Icon name="arrow-up" size={12} className="text-cyan-400" />
                                        Height / Elevation (Y-Offset)
                                    </label>
                                    <span className="font-mono text-xs text-cyan-400 font-bold bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/30">
                                        {stagedModel.yOffset > 0 ? `+${Number(stagedModel.yOffset).toFixed(2)}m` : `${Number(stagedModel.yOffset).toFixed(2)}m`}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="-1.0"
                                    max="2.0"
                                    step="0.05"
                                    value={stagedModel.yOffset || 0}
                                    onChange={e => setStagedModel(prev => ({ ...prev, yOffset: parseFloat(e.target.value) }))}
                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                />
                                <div className="flex gap-1 mt-1.5">
                                    {ELEVATION_PRESETS.map((p) => (
                                        <button
                                            key={p.label}
                                            type="button"
                                            onClick={() => setStagedModel(prev => ({ ...prev, yOffset: p.offset }))}
                                            className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${
                                                Math.abs(stagedModel.yOffset - p.offset) < 0.05
                                                    ? 'bg-cyan-600 text-white'
                                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 3. Facing Rotation (Yaw) */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                        <Icon name="compass" size={12} className="text-emerald-400" />
                                        Facing Orientation (Rotation)
                                    </label>
                                    <span className="font-mono text-xs text-emerald-400 font-bold bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">
                                        {Math.round(stagedModel.rotation || 0)}°
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    step="5"
                                    value={stagedModel.rotation || 0}
                                    onChange={e => setStagedModel(prev => ({ ...prev, rotation: parseInt(e.target.value) }))}
                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                />
                                <div className="flex gap-1 mt-1.5">
                                    {ROTATION_SNAPS.map((snap) => (
                                        <button
                                            key={snap.label}
                                            type="button"
                                            onClick={() => setStagedModel(prev => ({ ...prev, rotation: snap.deg }))}
                                            className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${
                                                Math.round(stagedModel.rotation) === snap.deg
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {snap.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 4. Material Finish */}
                            <div>
                                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-1.5">
                                    <Icon name="sparkles" size={12} className="text-amber-400" />
                                    Miniature Material Finish
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                    {MATERIAL_PRESETS.map((mat) => {
                                        const isSelected = stagedModel.materialStyle === mat.id;
                                        return (
                                            <button
                                                key={mat.id}
                                                type="button"
                                                onClick={() => setStagedModel(prev => ({
                                                    ...prev,
                                                    materialStyle: mat.id,
                                                    forceStatue: mat.id !== 'original'
                                                }))}
                                                className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                                    isSelected
                                                        ? 'bg-amber-500/20 border border-amber-500 text-amber-300'
                                                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                                                }`}
                                            >
                                                <Icon name={mat.icon} size={13} />
                                                <span className="truncate">{mat.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Modal Action Bar */}
                        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition-colors"
                            >
                                Cancel
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleConfirmSave}
                                    disabled={!stagedModel.url}
                                    className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Icon name="check" size={16} className="stroke-[3]" />
                                    Confirm & Save 3D Mini
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ModelPickerModal;

