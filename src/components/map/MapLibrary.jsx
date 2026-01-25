import React from 'react';
import Icon from '../Icon';

const MapLibrary = ({ savedMaps, onSelect, onClose, onDelete }) => {
    return (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl flex flex-col shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"><Icon name="x" size={24}/></button>
                
                <div className="p-8 border-b border-slate-800">
                    <h2 className="text-3xl font-bold text-white fantasy-font mb-2">Map Library</h2>
                    <p className="text-slate-400">Select a stage to project to the table.</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 custom-scroll">
                    {savedMaps.map(map => (
                        <div key={map.id} className="group relative bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-amber-500 transition-all cursor-pointer shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1" onClick={() => onSelect(map)}>
                            <div className="aspect-video bg-black relative">
                                <img src={map.url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt={map.name}/>
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent opacity-90 group-hover:opacity-60 transition-opacity"></div>
                                <div className="absolute bottom-4 left-4 right-4">
                                    <h3 className="font-bold text-white text-lg truncate shadow-black drop-shadow-md">{map.name}</h3>
                                </div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(map.id); }} 
                                className="absolute top-2 right-2 p-2 bg-red-900/90 text-white rounded opacity-0 group-hover:opacity-100 hover:bg-red-700 transition-all shadow-lg"
                                title="Delete Map"
                            >
                                <Icon name="trash-2" size={16}/>
                            </button>
                        </div>
                    ))}
                    {savedMaps.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                            <Icon name="map" size={48} className="mb-4 opacity-50"/>
                            <p>The archives are empty.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MapLibrary;