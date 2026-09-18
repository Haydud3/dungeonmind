import React from 'react';
import Icon from './Icon';
import MonsterStatblockView from './MonsterStatblockView';

const MonsterStatblockDrawer = ({ 
    npc, 
    isOpen, 
    onClose, 
    onOpenSheet, 
    onDuplicate, 
    onToggleFavorite, 
    onDiceRoll,
    onLogAction,
    onHpChange,
    role = 'dm'
}) => {
    if (!isOpen || !npc) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Backdrop click to close */}
            <div className="flex-1 cursor-pointer" onClick={onClose} />

            {/* Slide-over Container */}
            <div className="w-full max-w-2xl bg-slate-900 border-l border-amber-900/40 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
                
                {/* Header Toolbar */}
                <div className="p-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <Icon name="skull" size={18} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider truncate">
                            5e Monster Statblock
                        </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        {/* Favorite Button */}
                        {onToggleFavorite && (
                            <button
                                onClick={() => onToggleFavorite(npc)}
                                className={`p-1.5 rounded-lg border transition-all ${
                                    npc.isFavorite 
                                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border-slate-700'
                                }`}
                                title={npc.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                            >
                                <Icon name="star" size={16} className={npc.isFavorite ? "fill-amber-400" : ""} />
                            </button>
                        )}

                        {/* Duplicate Button */}
                        {onDuplicate && (
                            <button
                                onClick={() => onDuplicate(npc)}
                                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                                title="Duplicate Monster (Clone)"
                            >
                                <Icon name="copy" size={16} />
                            </button>
                        )}

                        {/* Edit Full Sheet Button */}
                        {onOpenSheet && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onOpenSheet(npc);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-semibold text-xs transition-colors"
                                title="Open in Full Character Sheet Editor"
                            >
                                <Icon name="edit-3" size={14} />
                                <span className="hidden sm:inline">Full Sheet</span>
                            </button>
                        )}

                        {/* Close Drawer */}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
                            title="Close (Esc)"
                        >
                            <Icon name="x" size={20} />
                        </button>
                    </div>
                </div>

                {/* Statblock View */}
                <MonsterStatblockView 
                    npc={npc}
                    onOpenSheet={onOpenSheet ? () => {
                        onClose();
                        onOpenSheet(npc);
                    } : undefined}
                    onDuplicate={onDuplicate ? () => onDuplicate(npc) : undefined}
                    onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(npc) : undefined}
                    onDiceRoll={onDiceRoll}
                    onLogAction={onLogAction}
                    onHpChange={onHpChange ? (newHp) => onHpChange(npc, newHp) : undefined}
                    role={role}
                />

                {/* Footer Controls */}
                <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-slate-500">
                        ID: <span className="font-mono">{npc.id}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        {onDuplicate && (
                            <button
                                onClick={() => onDuplicate(npc)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                            >
                                <Icon name="copy" size={14}/> Duplicate
                            </button>
                        )}
                        {onOpenSheet && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onOpenSheet(npc);
                                }}
                                className="px-4 py-1.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-lg shadow-lg transition-all flex items-center gap-1.5"
                            >
                                <Icon name="external-link" size={14}/> Open Full Sheet
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default MonsterStatblockDrawer;
