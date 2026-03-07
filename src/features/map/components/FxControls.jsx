import React from 'react';
import Icon from '../Icon';

const FX_TYPES = [
    { id: 'breath', label: 'Breath', icon: 'rss' },
    { id: 'beam', label: 'Beam', icon: 'move-diagonal-2' },
    { id: 'burst', label: 'Burst', icon: 'bomb' },
    { id: 'aura', label: 'Aura', icon: 'circle-dashed' },
    { id: 'rocket', label: 'Rocket', icon: 'rocket' },
];

const FX_FLAVORS = [
    { id: 'fire', color: '#ff4400', label: 'Fire' },
    { id: 'frost', color: '#00ffff', label: 'Frost' },
    { id: 'acid', color: '#88ff00', label: 'Acid' },
    { id: 'death', color: '#440088', label: 'Necro' },
    { id: 'magic', color: '#ff00ff', label: 'Arcane' },
    { id: 'gold', color: '#ffcc00', label: 'Holy' },
];

const WEATHER_TYPES = [
    { id: null, label: 'Clear', icon: 'sun' },
    { id: 'rain', label: 'Rain', icon: 'cloud-rain' },
    { id: 'snow', label: 'Snow', icon: 'cloud-snow' },
    { id: 'ash', label: 'Ash', icon: 'wind' },
];

const FxControls = ({ settings, onUpdate, currentWeather, onWeatherChange, role, onClose }) => {
    return (
        <div 
            className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-2xl w-72 animate-in slide-in-from-bottom-5 z-[100] pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Icon name="wand-2" size={16} className="text-purple-400"/> 
                    FX Caster
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><Icon name="x" size={16}/></button>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Shape</label>
                    <div className="grid grid-cols-5 gap-2">
                        {FX_TYPES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => onUpdate({ ...settings, type: t.id })}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${settings.type === t.id ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                            >
                                <Icon name={t.icon} size={18} />
                                <span className="text-[9px] mt-1 font-bold">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Element</label>
                    <div className="grid grid-cols-6 gap-1">
                        {FX_FLAVORS.map(f => (
                            <button
                                key={f.id}
                                onClick={() => onUpdate({ ...settings, flavor: f.id })}
                                className={`h-8 rounded-md border-2 transition-all ${settings.flavor === f.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                style={{ backgroundColor: f.color }}
                                title={f.label}
                            />
                        ))}
                    </div>
                </div>
                
                {role === 'dm' && (
                    <div className="pt-4 border-t border-slate-800">
                        <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Weather</label>
                        <div className="grid grid-cols-4 gap-2">
                            {WEATHER_TYPES.map(w => (
                                <button
                                    key={w.id}
                                    onClick={() => onWeatherChange(w.id)}
                                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${currentWeather === w.id ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                >
                                    <Icon name={w.icon} size={16} />
                                    <span className="text-[9px] mt-1 font-bold">{w.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="text-[10px] text-slate-400 text-center italic">
                    {settings.type === 'burst' || settings.type === 'aura' ? 'Click map to cast.' : 'Drag on map to aim.'}
                </div>
            </div>
        </div>
    );
};

export default FxControls;