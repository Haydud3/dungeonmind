import React, { useState } from 'react';
import Icon from '../Icon';

const FORGE_TABS = [
    { id: 'fog', label: 'Fog', icon: 'cloud-fog', title: 'Fog of War' },
    { id: 'walls', label: 'Walls', icon: 'shield', title: 'Walls & Doors' },
    { id: 'lights', label: 'Lights', icon: 'lightbulb', title: 'Dynamic Lighting' },
    { id: 'terrain', label: 'Terrain', icon: 'mountain', title: '3D Terrain Sculpt' },
    { id: 'biomes', label: 'Biomes', icon: 'brush', title: 'Surface Painter' }
];

const BIOME_SWATCHES = [
    { type: '#00FF00', name: 'Grass', icon: 'leaf', colorClass: 'bg-emerald-500' },
    { type: '#FF00FF', name: 'Trees / Foliage', icon: 'tree-pine', colorClass: 'bg-fuchsia-500' },
    { type: '#0000FF', name: 'Water', icon: 'droplets', colorClass: 'bg-blue-500' },
    { type: '#FF0000', name: 'Lava', icon: 'flame', colorClass: 'bg-rose-500' },
    { type: '#FFFF00', name: 'Ice / Frost', icon: 'snowflake', colorClass: 'bg-amber-300' },
    { type: '#000000', name: 'Base / Erase', icon: 'eraser', colorClass: 'bg-slate-700' }
];

export default function MapForgePanel({
    isOpen,
    onClose,
    resetAllTools,
    dialog,
    activeTool,
    setActiveTool,
    // Fog
    isFogPainting,
    setIsFogPainting,
    fogBrushMode,
    setFogBrushMode,
    fogBrushShape,
    setFogBrushShape,
    fogBrushSize,
    setFogBrushSize,
    fogBrushSoftness,
    setFogBrushSoftness,
    onClearFog,
    // Walls & Architecture
    isDrawingWalls,
    setIsDrawingWalls,
    drawingWallType,
    setDrawingWallType,
    isArchitectMode,
    setIsArchitectMode,
    isDeleting,
    setIsDeleting,
    onDeleteSelected,
    // Lights
    isPlacingLights,
    setIsPlacingLights,
    // Sculpt
    sculptBrushType,
    setSculptBrushType,
    sculptBrushSize,
    setSculptBrushSize,
    sculptBrushStrength,
    setSculptBrushStrength,
    // Biome / Materials
    materialBrushType,
    setMaterialBrushType,
    materialBrushShape,
    setMaterialBrushShape,
    materialBrushSize,
    setMaterialBrushSize,
    materialBrushSoftness,
    setMaterialBrushSoftness,
    materialLimitToGround,
    setMaterialLimitToGround
}) {
    // Initial tab based on whichever tool is currently active
    const getInitialTab = () => {
        if (isFogPainting) return 'fog';
        if (isDrawingWalls || isArchitectMode || isDeleting) return 'walls';
        if (isPlacingLights) return 'lights';
        if (activeTool === 'sculpt') return 'terrain';
        if (activeTool === 'paintMaterial') return 'biomes';
        return 'fog';
    };

    const [activeTab, setActiveTab] = useState(getInitialTab);

    if (!isOpen) return null;

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        // Automatically prime the primary tool for this tab
        if (tabId === 'fog') {
            resetAllTools();
            setIsFogPainting(true);
        } else if (tabId === 'walls') {
            resetAllTools();
            setIsDrawingWalls(true);
        } else if (tabId === 'lights') {
            resetAllTools();
            setIsPlacingLights(true);
        } else if (tabId === 'terrain') {
            resetAllTools();
            setActiveTool('sculpt');
        } else if (tabId === 'biomes') {
            resetAllTools();
            setActiveTool('paintMaterial');
        }
    };

    const handleDone = () => {
        resetAllTools();
        onClose();
    };

    return (
        <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[340px] max-w-full bg-slate-900/98 backdrop-blur-2xl border-l border-slate-750 shadow-2xl z-[75] flex flex-col animate-in slide-in-from-right duration-300 pb-safe select-none text-slate-200">
            {/* Header */}
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-white shadow-md shadow-amber-900/40">
                        <Icon name="hammer" size={17} />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-white fantasy-font tracking-wide flex items-center gap-1.5 leading-tight">
                            Map Forge
                        </h3>
                        <p className="text-[10px] text-slate-400 font-sans leading-none mt-0.5">
                            Terrain, Walls, Fog & Lights
                        </p>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Close Panel (Tools Remain Active)"
                >
                    <Icon name="x" size={18} />
                </button>
            </div>

            {/* Tab Strip */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 shrink-0 p-1 gap-1">
                {FORGE_TABS.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                                isActive
                                    ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                            }`}
                            title={tab.title}
                        >
                            <Icon name={tab.icon} size={15} />
                            <span className="text-[10px] tracking-tight">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4 text-xs">
                {/* 1. FOG OF WAR */}
                {activeTab === 'fog' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Mode
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        setIsFogPainting(true);
                                        setFogBrushMode('paint');
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        isFogPainting && fogBrushMode === 'paint'
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="cloud" size={16} className="text-slate-400" />
                                    <span>Paint Fog (Hide)</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setIsFogPainting(true);
                                        setFogBrushMode('erase');
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        isFogPainting && fogBrushMode === 'erase'
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="eraser" size={16} className="text-amber-400" />
                                    <span>Reveal Area</span>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Brush Shape
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setFogBrushShape('circle')}
                                    className={`p-2 rounded-lg border flex items-center justify-center gap-2 font-medium transition-colors ${
                                        fogBrushShape === 'circle'
                                            ? 'bg-slate-700 border-amber-500 text-white'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name="circle" size={14} /> Circle
                                </button>
                                <button
                                    onClick={() => setFogBrushShape('square')}
                                    className={`p-2 rounded-lg border flex items-center justify-center gap-2 font-medium transition-colors ${
                                        fogBrushShape === 'square'
                                            ? 'bg-slate-700 border-amber-500 text-white'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name="square" size={14} /> Square
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-800/40 border border-slate-750 p-3 rounded-xl space-y-3">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-slate-300 font-bold">Brush Size</span>
                                    <span className="text-amber-400 font-mono font-bold">{fogBrushSize} ft</span>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="200"
                                    step="5"
                                    value={fogBrushSize}
                                    onChange={e => setFogBrushSize(Number(e.target.value))}
                                    className="w-full accent-amber-500 cursor-pointer"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-slate-300 font-bold">Edge Softness</span>
                                    <span className="text-amber-400 font-mono font-bold">{Math.round(fogBrushSoftness * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={fogBrushSoftness}
                                    onChange={e => setFogBrushSoftness(Number(e.target.value))}
                                    className="w-full accent-amber-500 cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-xl text-slate-300 text-[11px] leading-relaxed">
                            <span className="text-amber-400 font-bold">Tip:</span> Left-click and drag across the battlemap to paint or reveal fog in real time.
                        </div>

                        {onClearFog && (
                            <button
                                onClick={async () => {
                                    if (await dialog.confirm("Are you sure you want to clear ALL manual fog? This will reveal the entire map.")) {
                                        onClearFog();
                                    }
                                }}
                                className="w-full py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 font-bold flex items-center justify-center gap-2 transition-colors mt-2"
                            >
                                <Icon name="trash-2" size={14} /> Clear All Fog
                            </button>
                        )}
                    </div>
                )}

                {/* 2. WALLS & DOORS */}
                {activeTab === 'walls' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Placement Mode
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        resetAllTools();
                                        setIsDrawingWalls(true);
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        isDrawingWalls
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="pencil" size={16} />
                                    <span>Point-to-Point</span>
                                </button>
                                <button
                                    onClick={() => {
                                        resetAllTools();
                                        setIsArchitectMode(true);
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        isArchitectMode
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="pen-tool" size={16} />
                                    <span>Architect Pen</span>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Structure Type
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => {
                                        setDrawingWallType('wall');
                                        if (!isDrawingWalls && !isArchitectMode) setIsDrawingWalls(true);
                                    }}
                                    className={`p-2 rounded-lg border flex flex-col items-center gap-1 font-bold transition-colors ${
                                        drawingWallType === 'wall'
                                            ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name="square" size={16} className="text-red-400" />
                                    <span className="text-[10px]">Solid Wall</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setDrawingWallType('door');
                                        if (!isDrawingWalls && !isArchitectMode) setIsDrawingWalls(true);
                                    }}
                                    className={`p-2 rounded-lg border flex flex-col items-center gap-1 font-bold transition-colors ${
                                        drawingWallType === 'door'
                                            ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name="door-closed" size={16} className="text-blue-400" />
                                    <span className="text-[10px]">Door</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setDrawingWallType('window');
                                        if (!isDrawingWalls && !isArchitectMode) setIsDrawingWalls(true);
                                    }}
                                    className={`p-2 rounded-lg border flex flex-col items-center gap-1 font-bold transition-colors ${
                                        drawingWallType === 'window'
                                            ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name="layout" size={16} className="text-cyan-400" />
                                    <span className="text-[10px]">Window</span>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Remove Structures
                            </label>
                            <button
                                onClick={() => {
                                    if (isDeleting) {
                                        if (onDeleteSelected) onDeleteSelected();
                                        setIsDeleting(false);
                                    } else {
                                        resetAllTools();
                                        setIsDeleting(true);
                                    }
                                }}
                                className={`w-full p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                                    isDeleting
                                        ? 'bg-red-950/70 border-red-500 text-red-200 shadow-lg shadow-red-950/50'
                                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-red-300 hover:bg-slate-800'
                                }`}
                            >
                                <Icon name="trash-2" size={15} />
                                <span>{isDeleting ? 'Delete Tool Active (Click Wall/Door)' : 'Select Eraser Tool'}</span>
                            </button>
                        </div>

                        <div className="p-3 bg-indigo-950/20 border border-indigo-800/30 rounded-xl text-slate-300 text-[11px] leading-relaxed space-y-1">
                            <div className="font-bold text-indigo-400">Controls:</div>
                            <div>• Click map to place start point, click again for next segment.</div>
                            <div>• Right-click any existing wall to toggle Doors or Secret Doors.</div>
                        </div>
                    </div>
                )}

                {/* 3. LIGHTING */}
                {activeTab === 'lights' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Light Placement
                            </label>
                            <button
                                onClick={() => {
                                    if (isPlacingLights) {
                                        setIsPlacingLights(false);
                                    } else {
                                        resetAllTools();
                                        setIsPlacingLights(true);
                                    }
                                }}
                                className={`w-full p-3 rounded-xl border flex items-center justify-center gap-2.5 font-bold transition-all ${
                                    isPlacingLights
                                        ? 'bg-amber-950/60 border-amber-500 text-amber-300 shadow-lg shadow-amber-950/50'
                                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <Icon name="lightbulb" size={18} className="text-amber-400" />
                                <span>{isPlacingLights ? 'Placing Lights Active' : 'Click to Place Light Tool'}</span>
                            </button>
                        </div>

                        <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-xl text-slate-300 text-[11px] leading-relaxed space-y-1.5">
                            <div className="font-bold text-amber-400 flex items-center gap-1.5">
                                <Icon name="sparkles" size={14} /> How Light Placement Works:
                            </div>
                            <div>1. Click and hold on the battlemap where you want the light.</div>
                            <div>2. Drag outward to expand the light's radius, then release.</div>
                            <div>3. Right-click any existing light to change its color, adjust radius, or delete it.</div>
                        </div>
                    </div>
                )}

                {/* 4. 3D TERRAIN SCULPT */}
                {activeTab === 'terrain' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Sculpt Brush Action
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        setActiveTool('sculpt');
                                        setSculptBrushType('raise');
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        activeTool === 'sculpt' && sculptBrushType === 'raise'
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="arrow-up" size={16} className="text-emerald-400" />
                                    <span>Raise Ground</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveTool('sculpt');
                                        setSculptBrushType('lower');
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        activeTool === 'sculpt' && sculptBrushType === 'lower'
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="arrow-down" size={16} className="text-rose-400" />
                                    <span>Lower Ground</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveTool('sculpt');
                                        setSculptBrushType('flatten');
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        activeTool === 'sculpt' && sculptBrushType === 'flatten'
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="minus" size={16} className="text-amber-400" />
                                    <span>Flatten Plateau</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveTool('sculpt');
                                        setSculptBrushType('smooth');
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                                        activeTool === 'sculpt' && sculptBrushType === 'smooth'
                                            ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Icon name="waves" size={16} className="text-cyan-400" />
                                    <span>Smooth Slopes</span>
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-800/40 border border-slate-750 p-3 rounded-xl space-y-3">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-slate-300 font-bold">Brush Radius</span>
                                    <span className="text-amber-400 font-mono font-bold">{sculptBrushSize} units</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="10"
                                    step="0.5"
                                    value={sculptBrushSize}
                                    onChange={e => setSculptBrushSize(Number(e.target.value))}
                                    className="w-full accent-amber-500 cursor-pointer"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-slate-300 font-bold">Sculpt Strength</span>
                                    <span className="text-amber-400 font-mono font-bold">{Math.round((sculptBrushStrength / 0.2) * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.01"
                                    max="0.2"
                                    step="0.01"
                                    value={sculptBrushStrength}
                                    onChange={e => setSculptBrushStrength(Number(e.target.value))}
                                    className="w-full accent-blue-500 cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-xl text-slate-300 text-[11px] leading-relaxed">
                            <span className="text-emerald-400 font-bold">Tip:</span> Left-click & drag on terrain to deform height. Works on any 3D heightmap or procedural terrain.
                        </div>
                    </div>
                )}

                {/* 5. SURFACE BIOMES */}
                {activeTab === 'biomes' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                        <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Biome / Material Shaders
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {BIOME_SWATCHES.map(swatch => {
                                    const isSelected = activeTool === 'paintMaterial' && materialBrushType === swatch.type;
                                    return (
                                        <button
                                            key={swatch.type}
                                            onClick={() => {
                                                setActiveTool('paintMaterial');
                                                setMaterialBrushType(swatch.type);
                                            }}
                                            className={`p-2.5 rounded-xl border flex items-center gap-2.5 font-bold transition-all ${
                                                isSelected
                                                    ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
                                                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                            }`}
                                        >
                                            <span className={`w-3.5 h-3.5 rounded-full ${swatch.colorClass} shadow-sm shrink-0`} />
                                            <span className="truncate text-xs">{swatch.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setMaterialBrushShape('circle')}
                                className={`p-2 rounded-lg border flex items-center justify-center gap-2 font-medium transition-colors ${
                                    materialBrushShape === 'circle'
                                        ? 'bg-slate-700 border-amber-500 text-white'
                                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Icon name="circle" size={14} /> Circle
                            </button>
                            <button
                                onClick={() => setMaterialBrushShape('square')}
                                className={`p-2 rounded-lg border flex items-center justify-center gap-2 font-medium transition-colors ${
                                    materialBrushShape === 'square'
                                        ? 'bg-slate-700 border-amber-500 text-white'
                                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Icon name="square" size={14} /> Square
                            </button>
                        </div>

                        <div className="bg-slate-800/40 border border-slate-750 p-3 rounded-xl space-y-3">
                            <label className="flex items-center gap-2 text-slate-300 font-bold cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={materialLimitToGround}
                                    onChange={e => setMaterialLimitToGround(e.target.checked)}
                                    className="w-4 h-4 rounded accent-amber-500 bg-slate-900 border-slate-700"
                                />
                                <span>Ground Only (Protect Walls)</span>
                            </label>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-slate-300 font-bold">Brush Radius</span>
                                    <span className="text-amber-400 font-mono font-bold">{materialBrushSize} ft</span>
                                </div>
                                <input
                                    type="range"
                                    min="2"
                                    max="100"
                                    step="2"
                                    value={materialBrushSize}
                                    onChange={e => setMaterialBrushSize(Number(e.target.value))}
                                    className="w-full accent-amber-500 cursor-pointer"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-slate-300 font-bold">Edge Softness</span>
                                    <span className="text-amber-400 font-mono font-bold">{Math.round(materialBrushSoftness * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={materialBrushSoftness}
                                    onChange={e => setMaterialBrushSoftness(Number(e.target.value))}
                                    className="w-full accent-blue-500 cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer / Done Action */}
            <div className="p-3.5 border-t border-slate-800 bg-slate-950/80 shrink-0">
                <button
                    onClick={handleDone}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                    <Icon name="check" size={16} />
                    <span>Done Editing (Return to Play)</span>
                </button>
            </div>
        </div>
    );
}

