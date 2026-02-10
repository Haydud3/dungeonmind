import React from 'react';
import Icon from '../Icon';

const GridControls = ({ grid, onUpdate, onClose, activeTool, setActiveTool }) => {
    const handleChange = (key, val) => {
        onUpdate({ ...grid, [key]: val });
    };

    const isCalibrating = activeTool === 'grid_cal';

    return (
        <div 
            className={`absolute bottom-24 md:bottom-22 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border p-4 rounded-xl shadow-2xl w-72 animate-in slide-in-from-bottom-5 z-50 pointer-events-auto transition-all ${
                isCalibrating ? 'border-cyan-500 ring-4 ring-cyan-500/20 scale-105' : 'border-slate-700'
            }`}
            onPointerDown={(e) => e.stopPropagation()} 
        >
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Icon name={isCalibrating ? "maximize" : "grid"} size={16} className={isCalibrating ? "text-cyan-400" : ""}/> 
                    {isCalibrating ? 'Calibrating...' : 'Grid Config'}
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={16}/></button>
            </div>

            <div className="space-y-4">
                {/* 0. Calibration HUD Mode */}
                <div className={`${isCalibrating ? 'bg-cyan-950/40' : 'bg-slate-800/50'} p-3 rounded-lg border ${isCalibrating ? 'border-cyan-500/50' : 'border-slate-700'} transition-colors`}>
                    {!isCalibrating ? (
                        <>
                            <button 
                                onClick={() => setActiveTool('grid_cal')}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center gap-2 text-xs font-bold shadow-lg transition-transform active:scale-95"
                            >
                                <Icon name="maximize" size={14}/> Calibrate by Drawing
                            </button>
                            <p className="text-[10px] text-slate-500 mt-2 text-center">Locks the map. Drag a box over one square to align.</p>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-cyan-400 text-[11px] font-bold animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                                ACTION: DRAW ONE SQUARE
                            </div>
                            <p className="text-[10px] text-slate-300 leading-relaxed italic">
                                Map panning and zooming are locked. Frame a single printed square on your map image.
                            </p>
                            <button 
                                onClick={() => setActiveTool('move')}
                                className="w-full py-2 bg-slate-700 hover:bg-red-900 text-white rounded border border-slate-600 text-[10px] font-bold uppercase transition-colors"
                            >
                                Cancel Calibration
                            </button>
                        </div>
                    )}
                </div>

                {!isCalibrating && (
                    <div className="space-y-4 animate-in fade-in duration-300">
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

                        {/* 2. Cell Size Slider */}
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

                        {/* 3. Manual Offset Overrides */}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                            <div>
                                <label className="text-[9px] text-slate-500 font-bold uppercase mb-1 block">X Offset</label>
                                <input 
                                    type="number" value={grid.offsetX}
                                    onChange={(e) => handleChange('offsetX', parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded text-xs p-1 text-white text-center focus:border-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500 font-bold uppercase mb-1 block">Y Offset</label>
                                <input 
                                    type="number" value={grid.offsetY}
                                    onChange={(e) => handleChange('offsetY', parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded text-xs p-1 text-white text-center focus:border-indigo-500 outline-none"
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
                )}
            </div>
        </div>
    );
};

export default GridControls;