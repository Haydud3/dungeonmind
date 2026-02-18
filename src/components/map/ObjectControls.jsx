import React from 'react';
import Icon from '../Icon';

const OBJECT_TYPES = [
    { id: 'wall', label: 'Wall', icon: 'brick-wall' },
    { id: 'door', label: 'Door', icon: 'door-closed' },
    { id: 'light', label: 'Light', icon: 'lamp' },
];

const ObjectControls = ({ settings, onUpdate, onClose }) => {
    return (
        <div 
            className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-2xl w-64 animate-in slide-in-from-bottom-5 z-[100] pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Icon name="plus-square" size={16} className="text-blue-400"/> 
                    Map Objects
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><Icon name="x" size={16}/></button>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {OBJECT_TYPES.map(t => (
                    <button
                        key={t.id}
                        onClick={() => onUpdate({ ...settings, type: t.id })}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${settings.type === t.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                    >
                        <Icon name={t.icon} size={20} />
                        <span className="text-[10px] mt-1 font-bold">{t.label}</span>
                    </button>
                ))}
            </div>
            
            <div className="text-[10px] text-slate-400 text-center italic mt-4">
                {settings.type === 'light' ? 'Click to place light.' : 'Click to draw segments.'}
            </div>
        </div>
    );
};

export default ObjectControls;