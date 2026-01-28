import React from 'react';
import Icon from '../Icon';

const GridControls = ({ grid, onUpdate, onClose, activeTool, setActiveTool }) => {
    const handleChange = (key, val) => {
        onUpdate({ ...grid, [key]: val });
    };

    // We can't easily read global data here without passing it down, 
    // but we can use a slightly lower default that works for both, or just lower it generally.
    // Let's set it to 'bottom-24' (on mobile) which clears the new compacted toolbar.
    return (
        <div 
            className="absolute bottom-24 md:bottom-22 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-2xl w-64 animate-in slide-in-from-bottom-5 z-50 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()} 
        >
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white flex items-center gap-2"><Icon name="grid" size={16}/> Grid Config</h3>
                {/* FIX: Ensure onClose is actually called */}
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={16}/></button>
            </div>

            <div className="space-y-4">
                {/* 0. Calibration Tool */}
                <button 
                    onClick={() => setActiveTool(activeTool === 'grid_cal' ? 'move' : 'grid_cal')}
                    className={`w-full py-2 rounded-lg border flex items-center justify-center gap-2 text-xs font-bold transition-all ${activeTool === 'grid_cal' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-indigo-500'}`}
                >
                    <Icon name="maximize" size={14}/> 
                    {activeTool === 'grid_cal' ? 'Cancel Calibration' : 'Calibrate by Drawing'}
                </button>

                {/* 1. Visibility Toggle */}
                <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400 font-bold uppercase">Visible</label>
                    <button 
                        onClick={() => handleChange('visible', !grid.visible)} 
                        className={`w-10 h-5 rounded-full transition-colors relative ${grid.visible ? 'bg-green-600' : 'bg-slate-700'}`}
                    >
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${grid.visible ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </button>
                </div>

                {/* 2. Cell Size Slider (Min 5px) */}
                <div>
                    <label className="text-xs text-slate-400 font-bold uppercase flex justify-between">
                        <span>Cell Size</span>
                        <span className="text-white">{grid.size}px</span>
                    </label>
                    <input 
                        type="range" min="5" max="200" step="1" 
                        value={grid.size} 
                        onChange={(e) => handleChange('size', parseInt(e.target.value))}
                        className="w-full accent-indigo-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer mt-1"
                    />
                </div>

                {/* 3. Offset Sliders */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase flex justify-between">
                            <span>Offset X</span>
                            <span className="text-white">{grid.offsetX}px</span>
                        </label>
                        <input 
                            type="range" min="-100" max="100" step="1"
                            value={grid.offsetX} 
                            onChange={(e) => handleChange('offsetX', parseInt(e.target.value))}
                            className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer mt-1"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase flex justify-between">
                            <span>Offset Y</span>
                            <span className="text-white">{grid.offsetY}px</span>
                        </label>
                        <input 
                            type="range" min="-100" max="100" step="1"
                            value={grid.offsetY} 
                            onChange={(e) => handleChange('offsetY', parseInt(e.target.value))}
                            className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer mt-1"
                        />
                    </div>
                </div>

                {/* 4. Snap Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <label className="text-xs text-slate-400 font-bold uppercase">Snap Tokens</label>
                    <input 
                        type="checkbox" 
                        checked={grid.snap} 
                        onChange={(e) => handleChange('snap', e.target.checked)}
                        className="w-4 h-4 accent-indigo-500"
                    />
                </div>
            </div>
        </div>
    );
};

export default GridControls;