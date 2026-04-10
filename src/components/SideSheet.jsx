import React, { useMemo, useEffect, useState, useCallback } from 'react';
import SheetContainer from './character-sheet/SheetContainer';
import { useCharacterStore } from '../stores/useCharacterStore';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { searchGithubModels } from '../utils/miniManifest';
import Icon from './Icon';
import { subscribeToMap, updateMap } from '../utils/mapService';

const SideSheet = ({ characterId, onClose, role, onDiceRoll, onOpenDiceTray }) => {
    const { campaign: data, user, updateCampaign, gameParams } = useNewCampaign();
    const activeMapId = data?.activeMapId;
    
    const isVirtual = typeof characterId === 'object' && characterId !== null && characterId.isToken;
    const actualCharId = isVirtual ? characterId.characterId : characterId;
    const tokenId = isVirtual ? characterId.tokenId : null;
    
    // START CHANGE: Enhance isOwner logic to correctly identify the DM and the assigned player
    const isOwner = role === 'dm' || 
                    String(data?.assignments?.[user?.uid]) === String(actualCharId) || 
                    data?.players?.some(p => String(p.id) === String(actualCharId) && p.ownerId === user?.uid);
    // END CHANGE
    
    const addLogEntry = useCharacterStore((state) => state.addLogEntry);

    const [liveHp, setLiveHp] = useState(null);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [miniSearchQuery, setMiniSearchQuery] = useState("");
    const [isSearchingMinis, setIsSearchingMinis] = useState(false);
    const [editableName, setEditableName] = useState('');
    const [sheetWidth, setSheetWidth] = useState(550);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sheetWidth;

        const handleMouseMove = (moveEvent) => {
            const deltaX = startX - moveEvent.clientX;
            const newWidth = Math.max(400, Math.min(1000, startWidth + deltaX));
            setSheetWidth(newWidth);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [sheetWidth]);

    const handleMiniSearch = async (overrideQuery, typeFallback) => {
        const q = overrideQuery !== undefined ? overrideQuery : miniSearchQuery;
        if (!q) return;
        setIsSearchingMinis(true);
        let results = await searchGithubModels(q);
        if (results.length === 0 && typeFallback) results = await searchGithubModels(typeFallback);
        setAvailableModels(results);
        setIsSearchingMinis(false);
    };

    useEffect(() => {
        setLiveHp(null);
        if (!isVirtual || !tokenId || !gameParams?.code || !activeMapId) return;

        const unsub = subscribeToMap(gameParams.code, activeMapId, (map) => {
            if (map?.tokens?.[tokenId]) {
                setLiveHp(map.tokens[tokenId].hp || null);
            } else {
                setLiveHp(null);
            }
        });
        return () => unsub();
    }, [isVirtual, tokenId, gameParams?.code, activeMapId]);

    const handleSave = useCallback((char) => {
        if (isVirtual && tokenId) {
            if (activeMapId) updateMap(gameParams.code, activeMapId, { [`tokens.${tokenId}.hp`]: char.hp });
            const isPc = data?.players?.some(p => String(p.id) === String(actualCharId));
            if (isPc) {
                const newPlayers = (data.players || []).map(p => String(p.id) === String(actualCharId) ? { ...char, hp: p.hp, id: actualCharId } : p);
                updateCampaign({ players: newPlayers });
            } else {
                const newNpcs = (data.npcs || []).map(n => String(n.id) === String(actualCharId) ? { ...char, hp: n.hp, id: actualCharId } : n);
                updateCampaign({ npcs: newNpcs });
            }
        } else {
            const isPc = data?.players?.some(p => String(p.id) === String(char.id));
            if (isPc) {
                const newPlayers = (data.players || []).map(p => p.id === char.id ? char : p);
                updateCampaign({ players: newPlayers });
            } else {
                const newNpcs = (data.npcs || []).map(n => String(n.id) === String(char.id) ? char : n);
                updateCampaign({ npcs: newNpcs });
            }
        }
    }, [isVirtual, tokenId, activeMapId, gameParams?.code, data, updateCampaign, actualCharId]);

    const character = useMemo(() => {
        if (!data) return null;
        const allChars = [...(data.players || []), ...(data.npcs || [])];
        return allChars.find(c => String(c.id) === String(actualCharId));
    }, [actualCharId, data]);

    useEffect(() => {
        if (character) {
            setEditableName(character.name);
        }
    }, [character]);

    const handleNameSave = () => {
        if (character && editableName && character.name !== editableName) {
            handleSave({ ...character, name: editableName });
        }
    };

    const handleOpenModelPicker = () => {
        if (!character) return;
        setAvailableModels([]);
        setShowModelPicker(true);
        setMiniSearchQuery(character.name);
        handleMiniSearch(character.name, character.race);
    };

    const handleModelSelect = (model, forceStatue = false) => {
        if (!character) return;
        const finalChar = { ...character };
        if (model) {
            finalChar.modelUrl = model.url;
            finalChar.modelScale = model.scale;
            finalChar.modelYOffset = model.yOffset;
            finalChar.forceStatue = forceStatue;
        } else {
            delete finalChar.modelUrl;
            delete finalChar.modelScale;
            delete finalChar.modelYOffset;
            delete finalChar.forceStatue;
        }
        handleSave(finalChar);
        setShowModelPicker(false);
    };

    const modifiedData = useMemo(() => {
        if (!isVirtual || !tokenId) return data;
        const baseChar = [...(data?.players || []), ...(data?.npcs || [])].find(c => String(c.id) === String(actualCharId));
        if (!baseChar) return data;
        
        const virtualChar = { 
            ...baseChar, 
            id: `virtual_${tokenId}`,
            hp: liveHp || (characterId.hp !== undefined && characterId.hp !== null ? { current: characterId.hp, max: characterId.maxHp } : baseChar.hp)
        };
        
        const isPc = data?.players?.some(p => String(p.id) === String(actualCharId));

        if (isPc) {
            return {
                ...data,
                players: [...(data?.players || []), virtualChar]
            };
        } else {
            return {
                ...data,
                npcs: [...(data?.npcs || []), virtualChar]
            };
        }
    }, [data, isVirtual, actualCharId, tokenId, characterId, liveHp]);

    const displayId = isVirtual && tokenId ? `virtual_${tokenId}` : actualCharId;

    useEffect(() => {
        const charList = [...(modifiedData?.players || []), ...(modifiedData?.npcs || [])];
        const charToLoad = charList.find(c => String(c.id) === String(displayId));
        
        if (!charToLoad) return;

        const storeState = useCharacterStore.getState();
        const currentStoreChar = storeState.character;

        if (!currentStoreChar || String(currentStoreChar.id) !== String(displayId)) {
            storeState.loadCharacter(charToLoad);
        } else if (liveHp && currentStoreChar.hp?.current !== liveHp.current) {
            storeState.updateHP('current', liveHp.current);
            if (liveHp.max !== undefined) storeState.updateHP('max', liveHp.max);
        }
    }, [displayId, modifiedData, liveHp]);

    return (
        <div 
            className="absolute top-0 right-0 bottom-0 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300"
            style={{ width: `${sheetWidth}px` }}
        >
            <div 
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-500/50 z-10"
                onMouseDown={handleMouseDown}
            />
            <div className="p-4 border-b border-slate-700 flex items-center gap-4 shrink-0">
                <input 
                    type="text"
                    value={editableName}
                    onChange={e => setEditableName(e.target.value)}
                    onBlur={handleNameSave}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                    className="text-xl font-bold text-white bg-transparent outline-none focus:bg-slate-800 rounded px-2 -mx-2 w-full"
                />
                <button onClick={onClose} className="text-slate-400 hover:text-white">
                    <Icon name="x" size={24} />
                </button>
            </div>
            <div className="flex-1 min-h-0 relative">
                <SheetContainer 
                    key={displayId} // Keep key for re-render on ID change
                    character={character} // Pass the actual character object
                    data={modifiedData}
                    onClose={onClose}
                    onBack={onClose}
                    onSave={handleSave}
                    role={role}
                    onDiceRoll={onDiceRoll}
                    onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                    isOwner={isOwner}
                        onOpenModelPicker={role === 'dm' ? handleOpenModelPicker : undefined}
                    onOpenDiceTray={onOpenDiceTray}
                />
                {showModelPicker && character && (
                <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                            <h3 className="font-bold text-white flex items-center gap-2"><Icon name="box" size={18}/> Select 3D Mini: {character.name}</h3>
                            <button onClick={() => setShowModelPicker(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-700 bg-slate-900 flex gap-2">
                            <input 
                                autoFocus
                                value={miniSearchQuery} 
                                onChange={e => setMiniSearchQuery(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && handleMiniSearch()}
                                placeholder="Search 3D Models (e.g. Dragon, Goblin)..." 
                                className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-amber-500"
                            />
                            <button 
                                onClick={() => handleMiniSearch()} 
                                disabled={isSearchingMinis} 
                                className="bg-amber-600 hover:bg-amber-500 px-4 rounded text-white font-bold flex items-center justify-center"
                            >
                                {isSearchingMinis ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scroll bg-slate-950 flex-1">
                            {isSearchingMinis ? (
                                <div className="text-center py-10 text-amber-500"><Icon name="loader" size={32} className="animate-spin mx-auto mb-2"/> Searching the Repository...</div>
                            ) : (
                                <>
                                    <p className="text-slate-400 mb-4 text-sm">We found {availableModels.length} compatible 3D models.</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {availableModels.map((model, i) => (
                                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-2 flex flex-col justify-between transition-all group">
                                        <div>
                                            <div className="aspect-square bg-slate-900 rounded-md mb-2 overflow-hidden border border-slate-700 relative">
                                            {model.thumb ? <img src={model.thumb} className="w-full h-full object-cover" /> : <Icon name="box" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600"/>}
                                        </div>
                                            <div className="font-bold text-sm text-slate-200 truncate">{model.name}</div>
                                            <div className="text-[10px] text-slate-500 truncate">Scale: {model.scale}x</div>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => handleModelSelect(model)} className="flex-1 text-center text-xs px-2 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-white font-bold transition-colors">Select</button>
                                            <button onClick={() => handleModelSelect(model, true)} className="text-center text-xs p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors" title="Select as stone statue">
                                                <Icon name="gem" size={14}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                
                                <div onClick={() => handleModelSelect(null)} className="bg-slate-800 border border-slate-700 border-dashed rounded-lg p-2 cursor-pointer hover:border-blue-500 hover:bg-slate-700 transition-all group flex flex-col items-center justify-center">
                                    <div className="w-16 h-16 bg-slate-900 rounded-full mb-2 flex items-center justify-center border border-slate-700 group-hover:border-blue-500/50">
                                        <Icon name="image" size={24} className="text-slate-500 group-hover:text-blue-400"/>
                                    </div>
                                    <div className="font-bold text-sm text-slate-200 group-hover:text-blue-400 text-center">2D Token Only</div>
                                    <div className="text-[10px] text-slate-500 text-center">Skip 3D Model</div>
                                </div>
                            </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                )}
            </div>
        </div>
    );
};

export default SideSheet;
