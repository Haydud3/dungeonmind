import React, { useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const InventoryTab = ({ onDiceRoll, onLogAction }) => {
    const { character, updateCurrency, addItem, removeItem } = useCharacterStore();
    const [newItemName, setNewItemName] = useState("");

    const handleAddItem = (e) => {
        e.preventDefault();
        if(!newItemName.trim()) return;
        addItem({ name: newItemName, qty: 1, weight: 0 });
        setNewItemName("");
    };

    return (
        <div className="space-y-6 pb-24">
            {/* Currency Header */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-lg">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/50 flex items-center justify-center text-amber-500"><Icon name="coins" size={18}/></div>
                    <h3 className="text-sm font-bold text-white">Currency</h3>
                </div>
                <div className="flex gap-2">
                    {['cp', 'sp', 'ep', 'gp', 'pp'].map(c => (
                        <div key={c} className="flex-1 relative">
                             <input 
                                type="number"
                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-center text-sm text-white font-bold outline-none focus:border-amber-500" 
                                value={character.currency?.[c] || 0} 
                                onChange={(e) => updateCurrency(c, e.target.value)}
                            />
                            <label className="text-[10px] uppercase text-slate-500 block text-center mt-1 font-bold">{c}</label>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Add */}
            <form onSubmit={handleAddItem} className="flex gap-2">
                <input 
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Add equipment..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
                <button type="submit" className="bg-slate-700 hover:bg-amber-700 text-white px-3 rounded">
                    <Icon name="plus" size={18}/>
                </button>
            </form>

            {/* Inventory List */}
            <div className="space-y-1">
                {(character.inventory || []).length === 0 ? (
                    <div className="text-center text-slate-600 py-6 italic">
                        Empty Backpack (Import PDF to populate)
                    </div>
                ) : (
                    character.inventory.map((item, i) => (
                        <div key={i} className="bg-slate-800 border border-slate-700 p-3 rounded flex justify-between items-center group hover:border-slate-500 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-8 h-8 shrink-0 rounded bg-slate-900 flex items-center justify-center text-slate-600"><Icon name="backpack" size={16}/></div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-slate-200 font-bold text-sm truncate">{typeof item === 'string' ? item : item.name}</span>
                                    {(item.weight || item.qty > 1) && <span className="text-xs text-slate-500">x{item.qty || 1} {item.weight ? `• ${item.weight}lb` : ''}</span>}
                                </div>
                            </div>
                            <button onClick={() => removeItem(i)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2"><Icon name="trash-2" size={14}/></button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default InventoryTab;