import React, { useState } from 'react';
// START CHANGE: Import Enricher
import { enrichCharacter } from '../../../utils/srdEnricher';
// END CHANGE
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const InventoryTab = ({ onDiceRoll, onLogAction, isOwner }) => {
    // START CHANGE: Add toggleEquip and loadCharacter to destructuring
    const { character, updateCurrency, addItem, removeItem, toggleEquip, loadCharacter } = useCharacterStore();
    // END CHANGE
    const [newItemName, setNewItemName] = useState("");
    
    // SRD State
    const [showSrd, setShowSrd] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [srdResults, setSrdResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleAddItem = (e) => {
        e.preventDefault();
        if(!newItemName.trim()) return;
        addItem({ name: newItemName, qty: 1, weight: 0 });
        setNewItemName("");
    };

    // START CHANGE: Delete the local toggleEquip function (it is now imported from store)
    // The previous code block for toggleEquip was here. Delete it entirely.
    // END CHANGE

    // --- SRD INTEGRATION ---
    const searchSrd = async () => {
        if (!searchTerm) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/equipment?name=${searchTerm}`);
            const data = await res.json();
            setSrdResults(data.results.slice(0, 10)); 
        } catch (e) { console.error(e); }
        setIsSearching(false);
    };

    // START CHANGE: Enrichment Handler
    const handleEnrich = async () => {
        if (!confirm("This will scan your inventory against the 5e SRD to fix missing stats. Continue?")) return;
        setIsSearching(true); // Re-use searching state for spinner
        try {
            const enriched = await enrichCharacter(character);
            loadCharacter(enriched);
            alert("Inventory enriched with 5e stats!");
        } catch (e) {
            console.error(e);
            alert("Enrichment failed.");
        }
        setIsSearching(false);
    };
    // END CHANGE

    return (
        <div className="space-y-6 pb-24 relative">
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

            {/* START CHANGE: Enrichment Toolbar */}
            {isOwner && (
                <div className="flex justify-end mb-2">
                    <button 
                        onClick={handleEnrich} 
                        disabled={isSearching}
                        className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                        <Icon name={isSearching ? "loader-2" : "wand"} size={12} className={isSearching ? "animate-spin" : ""}/>
                        {isSearching ? "Scanning Archives..." : "Fix Missing Stats (SRD)"}
                    </button>
                </div>
            )}
            {/* END CHANGE */}

            {/* Quick Add Bar */}
            <form onSubmit={handleAddItem} className="flex gap-2">
                <input 
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Add item..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
                <button type="submit" className="bg-slate-700 hover:bg-amber-700 text-white px-3 rounded">
                    <Icon name="plus" size={18}/>
                </button>
                <button type="button" onClick={() => setShowSrd(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 rounded flex items-center gap-1 font-bold text-xs">
                    <Icon name="search" size={14}/> SRD
                </button>
            </form>

            {/* Inventory List */}
            <div className="space-y-1">
                {(character.inventory || []).length === 0 ? (
                    <div className="text-center text-slate-600 py-6 italic">
                        Empty Backpack
                    </div>
                ) : (
                    character.inventory.map((item, i) => (
                        <div key={i} className={`border p-3 rounded flex justify-between items-center transition-colors ${item.equipped ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-800 border-slate-700'}`}>
                            <div className="flex items-center gap-3 overflow-hidden">
                                {/* START CHANGE: Use store's toggleEquip and verify owner */}
                                <div onClick={() => isOwner && toggleEquip(i)} className={`w-8 h-8 shrink-0 rounded flex items-center justify-center transition-all ${item.equipped ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/50' : 'bg-slate-900 text-slate-600'} ${isOwner ? 'cursor-pointer hover:text-indigo-400' : 'opacity-50 cursor-default'}`}>
                                    <Icon name={item.combat ? "sword" : "backpack"} size={16}/>
                                </div>
                                {/* END CHANGE */}
                                <div className="flex flex-col min-w-0">
                                    <span className={`font-bold text-sm truncate ${item.equipped ? 'text-indigo-300' : 'text-slate-200'}`}>{typeof item === 'string' ? item : item.name}</span>
                                    {(item.weight || item.qty > 1) && <span className="text-xs text-slate-500">x{item.qty || 1} {item.weight ? `• ${item.weight}lb` : ''}</span>}
                                </div>
                            </div>
                            <button onClick={() => removeItem(i)} className="text-slate-600 hover:text-red-500 p-2"><Icon name="trash-2" size={14}/></button>
                        </div>
                    ))
                )}
            </div>

            {/* SRD Modal (Same as before) */}
            {showSrd && (
                <div className="absolute inset-0 bg-slate-900 z-50 flex flex-col animate-in fade-in rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 p-2 border-b border-slate-700 bg-slate-800">
                        <input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => e.key==='Enter' && searchSrd()} placeholder="Search Equipment..." className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white outline-none"/>
                        <button onClick={searchSrd} disabled={isSearching} className="bg-indigo-600 px-3 py-2 rounded text-white"><Icon name="search" size={18}/></button>
                        <button onClick={() => setShowSrd(false)} className="text-slate-400 p-2"><Icon name="x" size={24}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900">
                        {srdResults.map(r => (
                            <div key={r.index} onClick={() => addSrdItem(r.url)} className="p-3 bg-slate-800 border border-slate-700 rounded hover:border-green-500 cursor-pointer flex justify-between items-center">
                                <span className="font-bold text-slate-200">{r.name}</span>
                                <Icon name="download" size={16} className="text-slate-500"/>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryTab;