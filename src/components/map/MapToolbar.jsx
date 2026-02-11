import React from 'react';
import Icon from '../Icon';

// START CHANGE: Updated Toolbar with Vision Toggle and Tool Switching Logic
const MapToolbar = ({ role, activeTool, setTool, visionActive, onToggleVision, onUpdateMapState }) => {
    
    // START CHANGE: Clear drawing state when tool changes
    React.useEffect(() => {
        if (onUpdateMapState) {
            onUpdateMapState('clear_active_path');
        }
    }, [activeTool]);
    // END CHANGE

    const allTools = [
        { id: 'move', icon: 'mouse-pointer-2', label: 'Move', roles: ['dm', 'player'] },
        { id: 'ruler', icon: 'ruler', label: 'Ruler', roles: ['dm', 'player'] },
        { id: 'sphere', icon: 'circle-dot', label: 'Sphere AoE', roles: ['dm', 'player'] },
        { id: 'wall', icon: 'brick-wall', label: 'Wall', roles: ['dm'] },
        { id: 'door', icon: 'door-closed', label: 'Door', roles: ['dm'] },
        { id: 'light', icon: 'lamp', label: 'Light', roles: ['dm'] },
        { id: 'delete', icon: 'trash-2', label: 'Delete', roles: ['dm'] },
        { id: 'grid', icon: 'grid', label: 'Grid', roles: ['dm'] },
    ];

    const tools = allTools.filter(t => t.roles.includes(role));

    return (
        <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur border border-slate-700 p-2 rounded-2xl shadow-2xl flex gap-2 pointer-events-auto z-[70]">
            {tools.map(tool => {
                const isActive = activeTool === tool.id || (tool.id === 'sphere' && activeTool === 'sphere_stamp');
                const isStampMode = tool.id === 'sphere' && activeTool === 'sphere_stamp';

                return (
                    <button
                        key={tool.id}
                        onClick={() => {
                            if (tool.id === 'sphere' && activeTool === 'sphere') setTool('sphere_stamp');
                            else if (tool.id === 'sphere' && activeTool === 'sphere_stamp') setTool('sphere');
                            else setTool(tool.id);
                        }}
                        className={`p-3 rounded-xl transition-all relative group ${isActive ? 'bg-indigo-600 text-white shadow-lg scale-110 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                        title={isStampMode ? "Stamp Mode (Persistent)" : tool.label}
                    >
                        <Icon name={isStampMode ? "target" : tool.icon} size={24} />
                        {(isActive) && (
                            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                {isStampMode ? "Mode: Stamp Template" : tool.label}
                            </span>
                        )}
                    </button>
                );
            })}

            <div className="w-px h-8 bg-slate-700 mx-1 my-auto"></div>
            
            {role === 'dm' && (
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
            )}
        </div>
    );
};
// END CHANGE

export default MapToolbar;