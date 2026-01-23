import React from 'react';
import Icon from '../Icon';

const MapToolbar = ({ 
    mode, setMode, 
    showGrid, setShowGrid, 
    snapToGrid, setSnapToGrid, 
    gridSize, handleGridChange, 
    showTokenBar, setShowTokenBar, 
    showMapBar, setShowMapBar, 
    role,
    zoom, setZoom,
    lightingMode, onToggleLight,
    // START CHANGE: Destructure Theater Props
    theaterMode, setTheaterMode
    // END CHANGE
}) => {
    return (
        <div className={`p-2 bg-slate-800 border-b border-slate-700 flex flex-wrap gap-2 items-center shrink-0 z-30 shadow-md ${theaterMode ? 'opacity-20 hover:opacity-100 transition-opacity absolute top-0 left-0 right-0' : ''}`}>
            {role === 'dm' && (
                <div className="flex gap-2">
                    <button onClick={() => setShowMapBar(!showMapBar)} className={`px-3 py-1.5 rounded text-xs font-bold border ${showMapBar ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                        <Icon name="map" size={14}/> Maps
                    </button>
                    {/* START CHANGE: Theater Toggle */}
                    <button onClick={() => setTheaterMode(!theaterMode)} className={`px-3 py-1.5 rounded text-xs font-bold border ${theaterMode ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)]' : 'bg-slate-700 border-slate-600 text-slate-300'}`} title="Cinematic Immersion Mode">
                        <Icon name="projector" size={14}/> {theaterMode ? 'On' : 'Cinema'}
                    </button>
                    {/* END CHANGE */}
                </div>
            )}
            
            <div className="flex bg-slate-900 rounded p-1 gap-1 border border-slate-700">
                <button onClick={() => setMode('move')} className={`p-1.5 rounded ${mode==='move' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Move Token"><Icon name="mouse-pointer-2" size={18}/></button>
                <button onClick={() => setMode('pan')} className={`p-1.5 rounded ${mode==='pan' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Pan Map"><Icon name="hand" size={18}/></button>
                <button onClick={() => setMode('ruler')} className={`p-1.5 rounded ${mode==='ruler' ? 'bg-amber-600 text-white' : 'text-slate-400'}`} title="Measure Distance"><Icon name="ruler" size={18}/></button>
                <button onClick={() => setMode('radius')} className={`p-1.5 rounded ${mode==='radius' ? 'bg-amber-600 text-white' : 'text-slate-400'}`} title="Measure Radius"><Icon name="circle-dashed" size={18}/></button>
                
                {role === 'dm' && (
                    <>
                        <div className="w-px bg-slate-700 mx-1"></div>
                        {/* WALL TOOLS (Replaced old fog tools) */}
                        <button onClick={() => setMode('wall')} className={`p-1.5 rounded ${mode==='wall' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`} title="Draw Walls (Vision Blockers)"><Icon name="pen-tool" size={18}/></button>
                        {/* START CHANGE: Add Door Tool */}
                        <button onClick={() => setMode('door')} className={`p-1.5 rounded ${mode==='door' ? 'bg-amber-600 text-white' : 'text-slate-400'}`} title="Door Tool (Click wall to convert/toggle)"><Icon name="door-open" size={18}/></button>
                        {/* END CHANGE */}
                        <button onClick={() => setMode('wall-erase')} className={`p-1.5 rounded ${mode==='wall-erase' ? 'bg-red-600 text-white' : 'text-slate-400'}`} title="Delete Walls"><Icon name="eraser" size={18}/></button>
                        
                        <div className="w-px bg-slate-700 mx-1"></div>
                        {/* LIGHTING TOGGLE */}
                        <button onClick={onToggleLight} className={`p-1.5 rounded ${lightingMode==='daylight' ? 'text-amber-400' : 'text-indigo-400'}`} title={lightingMode==='daylight' ? "Daylight Mode (Global Vis)" : "Cave Mode (Darkness)"}>
                            <Icon name={lightingMode==='daylight' ? "sun" : "moon"} size={18}/>
                        </button>
                    </>
                )}
            </div>

            {/* HIDE ON MOBILE: Secondary Tools */}
            <div className="hidden md:flex bg-slate-900 rounded p-1 gap-1 border border-slate-700 items-center px-2">
                <button onClick={() => setShowGrid(!showGrid)} className={`p-1 rounded ${showGrid ? 'text-green-400' : 'text-slate-500'}`} title="Toggle Grid"><Icon name="grid" size={18}/></button>
                <button onClick={() => setSnapToGrid(!snapToGrid)} className={`p-1 rounded ${snapToGrid ? 'text-green-400' : 'text-slate-500'}`} title="Snap to Grid"><Icon name="magnet" size={18}/></button>
                {showGrid && <input type="range" min="2" max="15" step="0.5" value={gridSize} onChange={handleGridChange} className="w-16 accent-green-500 h-1 bg-slate-700 rounded-lg cursor-pointer"/>}
            </div>

            {/* ZOOM SLIDER - Hide on mobile since we have pinch zoom now */}
            <div className="flex items-center gap-2 bg-slate-900 rounded p-1 px-2 border border-slate-700 hidden md:flex">
                <Icon name="zoom-in" size={14} className="text-slate-500"/>
                <input 
                    type="range" min="0.1" max="5" step="0.1" 
                    value={zoom} 
                    onChange={(e) => setZoom(parseFloat(e.target.value))} 
                    className="w-16 accent-indigo-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                />
            </div>

            <button onClick={() => setShowTokenBar(!showTokenBar)} className="p-1.5 px-3 rounded bg-slate-700 text-slate-300 flex items-center gap-2 text-xs font-bold hover:text-white ml-auto">
                <Icon name="users" size={16}/> Tokens
            </button>
        </div>
    );
};

export default MapToolbar;