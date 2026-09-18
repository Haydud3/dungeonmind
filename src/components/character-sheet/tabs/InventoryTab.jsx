import React, { useState } from 'react';
import { enrichCharacter } from '../../../utils/srdEnricher';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import { useDialog } from '../../DialogProvider';
import Icon from '../../Icon';

const CURRENCIES = [
    { key: 'cp', label: 'CP', name: 'Copper', color: 'border-orange-700/50 text-orange-400 bg-orange-950/20' },
    { key: 'sp', label: 'SP', name: 'Silver', color: 'border-slate-500/50 text-slate-300 bg-slate-800/40' },
    { key: 'ep', label: 'EP', name: 'Electrum', color: 'border-emerald-600/40 text-emerald-300 bg-emerald-950/20' },
    { key: 'gp', label: 'GP', name: 'Gold', color: 'border-amber-500/50 text-amber-300 bg-amber-950/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]' },
    { key: 'pp', label: 'PP', name: 'Platinum', color: 'border-cyan-500/50 text-cyan-300 bg-cyan-950/20' },
];

const InventoryTab = ({ onDiceRoll, onLogAction, isOwner = true }) => {
    const dialog = useDialog();
    const { 
        character, 
        updateCurrency, 
        addItem, 
        removeItem, 
        toggleEquip, 
        toggleAttune, 
        loadCharacter, 
        useItemCharge, 
        resetItemCharges 
    } = useCharacterStore();

    const [newItemName, setNewItemName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    
    // SRD State
    const [showSrd, setShowSrd] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [srdResults, setSrdResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    
    // Encumbrance & Attunement calculations
    const strScore = character.stats?.str || 10;
    const carryCapacity = strScore * 15;
    const inventory = character.inventory || [];
    const totalWeight = inventory.reduce((acc, item) => acc + (parseFloat(item.weight || 0) * (item.qty || 1)), 0);
    const encumbrancePct = Math.min((totalWeight / carryCapacity) * 100, 100);
    const isEncumbered = totalWeight > (strScore * 5);
    const isOverCapacity = totalWeight > carryCapacity;
    
    const attunedCount = inventory.filter(i => i.attuned).length;

    const handleAddItem = (e) => {
        e.preventDefault();
        if (!newItemName.trim()) return;
        addItem({ name: newItemName.trim(), qty: 1, weight: 0 });
        setNewItemName('');
    };

    // --- SRD INTEGRATION ---
    const searchSrd = async () => {
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/equipment?name=${encodeURIComponent(searchTerm)}`);
            const data = await res.json();
            setSrdResults(data.results ? data.results.slice(0, 12) : []); 
        } catch (e) { 
            console.error('SRD equipment search error:', e); 
        }
        setIsSearching(false);
    };

    const addSrdItem = async (url) => {
        setIsSearching(true);
        try {
            const res = await fetch(`https://www.dnd5eapi.co${url}`);
            const data = await res.json();
            
            const newItem = {
                name: data.name,
                qty: 1,
                weight: data.weight || 0,
                cost: data.cost ? `${data.cost.quantity} ${data.cost.unit}` : '',
                category: data.equipment_category?.name || 'Item',
                desc: data.desc ? data.desc.join('\n') : '',
                equipped: false,
                attuned: false,
                combat: data.equipment_category?.name === 'Weapon' || data.equipment_category?.name === 'Armor',
                damage: data.damage ? `${data.damage.damage_dice} ${data.damage.damage_type?.name || ''}` : '',
                armorClass: data.armor_class?.base || null
            };

            addItem(newItem);
            setShowSrd(false);
            setSrdResults([]);
            setSearchTerm('');
        } catch (e) {
            console.error('Failed to fetch SRD item details:', e);
            dialog.alert('Failed to fetch item details.');
        }
        setIsSearching(false);
    };

    const handleEnrich = async () => {
        if (!(await dialog.confirm('Scan your inventory against the 5e SRD to fix missing stats and descriptions?'))) return;
        setIsSearching(true);
        try {
            const enriched = await enrichCharacter(character);
            loadCharacter(enriched);
            dialog.alert('Inventory successfully enriched with 5e SRD stats!');
        } catch (e) {
            console.error(e);
            dialog.alert('Enrichment failed.');
        }
        setIsSearching(false);
    };

    // Filter items
    const filteredInventory = inventory.filter(item => {
        const name = (typeof item === 'string' ? item : item.name) || '';
        if (searchQuery.trim() && !name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        if (activeFilter === 'all') return true;
        if (activeFilter === 'equipped') return item.equipped;
        if (activeFilter === 'attuned') return item.attuned;
        if (activeFilter === 'combat') return item.combat;
        return true;
    });

    return (
        <div className="space-y-6 pb-24 relative">
            {/* Currency Vault Header */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800/80 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Currency Vault</h3>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">D&D 5e Standard Coinage</span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                    {CURRENCIES.map(({ key, label, name, color }) => (
                        <div 
                            key={key} 
                            className={`p-2 rounded-xl border flex flex-col items-center transition-all ${color}`}
                        >
                            <span className="text-[10px] uppercase font-bold tracking-wider mb-1 font-mono">{label}</span>
                            <input 
                                type="number"
                                min="0"
                                disabled={!isOwner}
                                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg p-1.5 text-center text-sm font-bold text-white outline-none focus:border-amber-500 font-mono transition-colors" 
                                value={character.currency?.[key] ?? 0} 
                                onChange={(e) => updateCurrency(key, parseInt(e.target.value) || 0)}
                            />
                            <span className="text-[9px] text-slate-400 mt-1 truncate max-w-full">{name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Encumbrance & Attunement HUD */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Encumbrance Bar */}
                <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-3.5 border border-slate-800/80 shadow-lg flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 mb-2">
                        <span className="flex items-center gap-1.5">
                            <Icon name="backpack" size={13} className="text-slate-500" />
                            Encumbrance
                        </span>
                        <span className="font-mono text-slate-200 font-bold">
                            {totalWeight.toFixed(1)} / {carryCapacity} lb
                        </span>
                    </div>

                    <div className="h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                        <div 
                            className={`h-full transition-all duration-500 rounded-full ${
                                isOverCapacity 
                                    ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]' 
                                    : isEncumbered 
                                        ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' 
                                        : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            }`} 
                            style={{ width: `${encumbrancePct}%` }} 
                        />
                    </div>

                    {isOverCapacity && (
                        <div className="text-[10px] text-rose-400 font-bold mt-2 text-center bg-rose-950/30 border border-rose-900/50 py-0.5 rounded-lg">
                            ⚠️ Over Encumbered (Speed dropped by 20 ft)
                        </div>
                    )}
                </div>

                {/* Attunement Crystals */}
                <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-3.5 border border-slate-800/80 shadow-lg flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 mb-2">
                        <span className="flex items-center gap-1.5">
                            <Icon name="gem" size={13} className="text-cyan-400" />
                            Attunement
                        </span>
                        <span className={`font-mono font-bold ${attunedCount > 3 ? 'text-rose-400' : 'text-cyan-400'}`}>
                            {attunedCount} / 3 Items
                        </span>
                    </div>

                    <div className="flex gap-2">
                        {[1, 2, 3].map(i => {
                            const isFilled = i <= attunedCount;
                            const isOver = attunedCount > 3 && isFilled;
                            return (
                                <div 
                                    key={i} 
                                    className={`flex-1 h-3 rounded-full border transition-all ${
                                        isOver
                                            ? 'bg-rose-500 border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                                            : isFilled
                                                ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                                                : 'bg-slate-950 border-slate-800'
                                    }`} 
                                />
                            );
                        })}
                    </div>

                    {isOwner && (
                        <div className="flex justify-end mt-2">
                            <button 
                                type="button"
                                onClick={handleEnrich}
                                disabled={isSearching}
                                className="text-[11px] flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                <Icon name={isSearching ? 'loader-2' : 'sparkles'} size={12} className={isSearching ? 'animate-spin' : ''}/>
                                <span>{isSearching ? 'Scanning 5e SRD...' : 'Enrich Stats via SRD'}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Add & Toolbar */}
            <div className="space-y-3">
                <form onSubmit={handleAddItem} className="flex gap-2">
                    <input 
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="Add equipment, weapon, potion..."
                        disabled={!isOwner}
                        className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 outline-none transition-colors"
                    />
                    {isOwner && (
                        <>
                            <button 
                                type="submit" 
                                className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-3.5 rounded-xl flex items-center gap-1 text-xs font-semibold shadow-sm transition-all"
                            >
                                <Icon name="plus" size={14}/> Add
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setShowSrd(true)} 
                                className="bg-indigo-600/80 hover:bg-indigo-500 text-white border border-indigo-500/50 px-3.5 rounded-xl flex items-center gap-1.5 font-bold text-xs shadow-sm transition-all"
                            >
                                <Icon name="sparkles" size={13}/> SRD
                            </button>
                        </>
                    )}
                </form>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                    <div className="relative flex-1 max-w-sm">
                        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter inventory..."
                            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
                        />
                        {searchQuery && (
                            <button 
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                <Icon name="x" size={13} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'equipped', label: 'Equipped' },
                            { id: 'attuned', label: 'Attuned' },
                            { id: 'combat', label: 'Combat' },
                        ].map(f => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setActiveFilter(f.id)}
                                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                    activeFilter === f.id
                                        ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                        : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Inventory Item List */}
            <div className="space-y-2.5">
                {filteredInventory.length === 0 ? (
                    <div className="text-center text-slate-500 py-12 italic border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                        {inventory.length === 0 ? 'Empty Backpack' : 'No items match your filter.'}
                    </div>
                ) : (
                    filteredInventory.map((item, i) => {
                        const originalIndex = inventory.indexOf(item);
                        const itemName = typeof item === 'string' ? item : item.name;

                        return (
                            <div 
                                key={`${itemName}-${i}`} 
                                className={`p-3.5 rounded-2xl border transition-all flex flex-wrap justify-between items-center gap-3 ${
                                    item.equipped 
                                        ? 'bg-indigo-950/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                                        : 'bg-slate-900/60 backdrop-blur-md border-slate-800/80 hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-[180px]">
                                    {/* Equipped Toggle / Icon */}
                                    <button 
                                        type="button"
                                        onClick={() => isOwner && toggleEquip(originalIndex)} 
                                        disabled={!isOwner}
                                        title={item.equipped ? 'Equipped (Click to unequip)' : 'Unequipped (Click to equip)'}
                                        className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center transition-all ${
                                            item.equipped 
                                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]' 
                                                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                                        } ${!isOwner ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                                    >
                                        <Icon name={item.combat ? 'sword' : 'backpack'} size={16} />
                                    </button>

                                    {/* Item Info */}
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-semibold text-xs truncate ${
                                                item.equipped ? 'text-indigo-200 font-bold' : 'text-slate-200'
                                            }`}>
                                                {itemName}
                                            </span>
                                            {item.equipped && (
                                                <span className="text-[9px] bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.2 rounded font-mono uppercase">
                                                    Equipped
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                                            <span>x{item.qty || 1}</span>
                                            {item.weight ? (
                                                <>
                                                    <span>•</span>
                                                    <span>{(parseFloat(item.weight) * (item.qty || 1)).toFixed(1)} lb</span>
                                                </>
                                            ) : null}
                                            {item.cost && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-amber-400">{item.cost}</span>
                                                </>
                                            )}
                                        </div>
                                        
                                        {/* Item Charges UI */}
                                        {item.limitedUse && item.limitedUse.maxUses > 0 && (
                                            <div className="flex flex-col mt-2 gap-1.5 bg-slate-950/50 p-2 rounded-xl border border-slate-800">
                                                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400">
                                                    <span>Charges ({item.limitedUse.maxUses - (item.limitedUse.numberUsed || 0)} / {item.limitedUse.maxUses})</span>
                                                    {isOwner && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => resetItemCharges(originalIndex)} 
                                                            className="text-amber-400 hover:text-amber-300 px-1 rounded flex items-center gap-1 text-[10px]"
                                                        >
                                                            <Icon name="rotate-ccw" size={10} /> Reset
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 py-0.5">
                                                    {Array.from({ length: item.limitedUse.maxUses }).map((_, chargeIdx) => {
                                                        const isUsed = chargeIdx < (item.limitedUse.numberUsed || 0);
                                                        return (
                                                            <button 
                                                                key={chargeIdx} 
                                                                type="button"
                                                                disabled={!isOwner}
                                                                onClick={() => {
                                                                    if (!isOwner) return;
                                                                    if (isUsed) {
                                                                        useItemCharge(originalIndex, chargeIdx - (item.limitedUse.numberUsed || 0));
                                                                    } else {
                                                                        useItemCharge(originalIndex, (chargeIdx + 1) - (item.limitedUse.numberUsed || 0));
                                                                    }
                                                                }}
                                                                className={`w-3.5 h-3.5 rounded-full border transition-all ${
                                                                    isUsed 
                                                                        ? 'bg-slate-900 border-slate-700' 
                                                                        : 'bg-amber-500 border-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)] hover:scale-110'
                                                                }`}
                                                                title={isUsed ? 'Used Charge' : 'Available Charge'}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Side Actions */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {/* Attunement Gem */}
                                    <button 
                                        type="button"
                                        onClick={() => isOwner && toggleAttune(originalIndex)} 
                                        disabled={!isOwner}
                                        className={`p-2 rounded-lg border transition-all ${
                                            item.attuned 
                                                ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                                                : 'bg-slate-900/60 border-slate-800 text-slate-600 hover:text-cyan-400 hover:border-slate-700'
                                        } ${!isOwner ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
                                        title={item.attuned ? 'Attuned (Click to remove attunement)' : 'Attune to Item'}
                                    >
                                        <Icon name="gem" size={14}/>
                                    </button>

                                    {/* Delete Button */}
                                    {isOwner && (
                                        <button 
                                            type="button"
                                            onClick={() => removeItem(originalIndex)} 
                                            className="text-slate-600 hover:text-rose-400 p-2 rounded-lg hover:bg-slate-800 transition-colors"
                                            title="Delete Item"
                                        >
                                            <Icon name="trash-2" size={14}/>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* SRD Modal */}
            {showSrd && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-3 shadow-2xl flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                                <Icon name="sparkles" size={16} className="text-indigo-400" />
                                Search 5e SRD Equipment Compendium
                            </h3>
                            <button 
                                type="button" 
                                onClick={() => setShowSrd(false)} 
                                className="text-slate-500 hover:text-slate-300"
                            >
                                <Icon name="x" size={18} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    autoFocus 
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && searchSrd()} 
                                    placeholder="e.g. Longsword, Shield, Potion of Healing..." 
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                                />
                            </div>
                            <button 
                                type="button"
                                onClick={searchSrd} 
                                disabled={isSearching} 
                                className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm transition-all"
                            >
                                {isSearching ? 'Searching...' : 'Search'}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 py-2 custom-scroll">
                            {srdResults.map(r => (
                                <div 
                                    key={r.index} 
                                    onClick={() => addSrdItem(r.url)} 
                                    className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl hover:border-indigo-500/50 hover:bg-slate-800 cursor-pointer flex justify-between items-center transition-all group"
                                >
                                    <span className="font-bold text-slate-200 text-xs group-hover:text-indigo-300">
                                        {r.name}
                                    </span>
                                    <Icon name="download" size={14} className="text-slate-500 group-hover:text-indigo-400" />
                                </div>
                            ))}
                            {isSearching && (
                                <div className="text-center p-6 text-slate-500 text-xs italic">
                                    Searching the Armory...
                                </div>
                            )}
                            {!isSearching && srdResults.length === 0 && searchTerm && (
                                <div className="text-center p-6 text-slate-500 text-xs italic">
                                    No equipment found matching "{searchTerm}".
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryTab;