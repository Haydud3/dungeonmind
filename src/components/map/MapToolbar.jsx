import React from 'react';
import Icon from '../Icon';

// START CHANGE: Updated Toolbar with Vision Toggle
const MapToolbar = ({ activeTool, setTool, visionActive, onToggleVision }) => {
    // No more fog-reveal/shroud tools
    const tools = [
        { id: 'move', icon: 'mouse-pointer-2', label: 'Move' },
        { id: 'ruler', icon: 'ruler', label: 'Ruler' },
        { id: 'sphere', icon: 'circle-dot', label: 'Sphere AoE' },
        { id: 'wall', icon: 'brick-wall', label: 'Wall' },
        { id: 'door', icon: 'door-closed', label: 'Door' },
        // START CHANGE: Add Delete Tool
        { id: 'delete', icon: 'trash-2', label: 'Delete Wall' },
        // END CHANGE
        { id: 'grid', icon: 'grid', label: 'Grid' },
    ];

    return (
        <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur border border-slate-700 p-2 rounded-2xl shadow-2xl flex gap-2 pointer-events-auto z-50">
            {tools.map(tool => (
                <button
                    key={tool.id}
                    onClick={() => setTool(tool.id)}
                    className={`p-3 rounded-xl transition-all relative group ${activeTool === tool.id ? 'bg-indigo-600 text-white shadow-lg scale-110' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    title={tool.label}
                >
                    <Icon name={tool.icon} size={24} />
                    {activeTool === tool.id && (
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {tool.label}
                        </span>
                    )}
                </button>
            ))}

            <div className="w-px h-8 bg-slate-700 mx-1 my-auto"></div>
            
            <button
                onClick={onToggleVision}
                className={`p-3 rounded-xl transition-all relative group ${visionActive ? 'bg-amber-900/50 text-amber-500 border border-amber-500/50' : 'text-slate-500 hover:text-white'}`}
                title={visionActive ? "Vision: ON" : "Vision: OFF"}
            >
                <Icon name={visionActive ? "eye" : "eye-off"} size={24} />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {visionActive ? "Lights On" : "Lights Off"}
                </span>
            </button>
        </div>
    );
};
// END CHANGE

export default MapToolbar;