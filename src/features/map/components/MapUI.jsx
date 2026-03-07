import React from 'react';
import Icon from '../../../components/Icon';
import MapToolbar from './MapToolbar';
import GridControls from './GridControls';
import CombatTracker from './CombatTracker';
import MapLibrary from './MapLibrary';
import TokenManager from './TokenManager';
import FxControls from './FxControls';
import ObjectControls from './ObjectControls';
import RadialHUD from './RadialHUD';

const MapUI = ({
    role,
    data,
    code,
    mapData,
    mapDimensions,
    isDebugging,
    DebugOverlay,
    isConnected,
    sidebarIsOpen,
    hudClass,
    activeSidebar,
    setShowHandoutCreator,
    updateMapState,
    handleZoom,
    centerOnTarget,
    toggleFullscreen,
    isFullscreen,
    showLibrary,
    setShowLibrary,
    showTokens,
    setShowTokens,
    showCombat,
    setShowCombat,
    handleStartCombat,
    handleEndCombat,
    handleNextTurn,
    activeTool,
    setActiveTool,
    mapGrid,
    handleGridUpdate,
    activeLightId,
    setActiveLightId,
    lights,
    handleDragStart,
    onDiceRoll,
    handleClearTokens,
    handleClearAllMaps,
    updateCombatant,
    removeCombatant,
    onClearRolls,
    addManualCombatant,
    players,
    npcs,
    fxSettings,
    setFxSettings,
    objectSettings,
    setObjectSettings,
    pings,
    spawningToken,
    mapReady,
    selectedTokenId,
    tokens,
    handleUpdateToken,
    handleDeleteToken,
    handleOpenSheet,
    setSelectedTokenId,
    activeStack,
    setActiveStack,
    setIsPanning,
    setIsDraggingToken,
    setDragStartPx,
    movingTokenPosRef,
    setMovingTokenId,
    triggerHaptic,
    sidebarDragEntity,
    dragPosition
}) => {
    return (
        <>
            {isDebugging && <DebugOverlay />}

            {isFullscreen && (
                <style>{`
                    #app-sidebar { display: none !important; }
                `}</style>
            )}

            {!isConnected && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[200] bg-red-600/90 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-pulse pointer-events-none backdrop-blur-sm border border-red-400/50">
                    <Icon name="wifi-off" size={14}/>
                    <span>Connection Lost</span>
                </div>
            )}

            <div 
                className={`absolute z-[100] flex gap-2 pointer-events-auto transition-all duration-300 ${sidebarIsOpen ? 'right-[10px]' : 'right-4'} ${hudClass}`}
                style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
            >
                <div 
                    className="bg-slate-900/90 border border-slate-700 rounded-xl p-1.5 flex gap-1.5 shadow-xl"
                    onPointerDown={(e) => e.stopPropagation()} 
                >
                    <button onClick={() => setShowHandoutCreator(true)} className="p-3 md:p-2 text-amber-500 hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" title="Handouts">
                        <Icon name="scroll" size={20}/>
                    </button>
                    <button onClick={() => {
                        updateMapState('toggle_journal');
                        updateMapState('close_sheet');
                    }} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${activeSidebar === 'journal' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title={activeSidebar === 'journal' ? "Close Journal" : "Open Journal"}>
                        <Icon name="book-open" size={20}/>
                    </button>
                    <button onClick={() => {
                        updateMapState('toggle_chat');
                        updateMapState('close_sheet');
                    }} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${activeSidebar === 'chat' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title={activeSidebar === 'chat' ? "Close Chat" : "Open Chat"}>
                        <Icon name={activeSidebar === 'chat' ? "x" : "message-square"} size={20}/>
                    </button>
                    <div className="w-px h-8 bg-slate-700 my-auto"></div>
                    {role === 'dm' && (
                        <>
                            <button onClick={() => setShowLibrary(true)} className="p-3 md:p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" title="Maps">
                                <Icon name="map" size={20}/>
                            </button>
                            <button onClick={() => setShowTokens(!showTokens)} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${showTokens ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Tokens">
                                <Icon name="users" size={20}/>
                            </button>
                        </>
                    )}
                    {(role === 'dm' || data.campaign?.combat?.active) && (
                        <button onClick={() => showCombat ? setShowCombat(false) : (role === 'dm' ? handleStartCombat() : setShowCombat(true))} className={`p-3 md:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${showCombat || data.campaign?.combat?.active ? 'bg-red-600 text-white animate-pulse' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Combat Tracker">
                            <Icon name="swords" size={20}/>
                        </button>
                    )}
                    <div className="w-px h-8 bg-slate-700 my-auto"></div>
                    
                    <button onClick={() => handleZoom(1 / 1.2)} className="p-3 md:p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"><Icon name="minus" size={20}/></button>
                    <button onClick={centerOnTarget} className="p-3 md:p-2 text-amber-500 hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" title={role === 'dm' ? "Center Map" : "Center on My Character"}>
                        <Icon name="crosshair" size={20}/>
                    </button>
                    <button onClick={() => handleZoom(1.2)} className="p-2 md:p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"><Icon name="plus" size={20}/></button>
                    <button onClick={toggleFullscreen} className={`p-2 md:p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isFullscreen ? 'text-indigo-400 bg-indigo-900/20' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`} title="Toggle Fullscreen"><Icon name={isFullscreen ? "minimize" : "maximize"} size={20}/></button>
                </div>
            </div>

            <div 
                className={`absolute z-[100] pointer-events-auto transition-all duration-300 ${
                    isFullscreen 
                        ? (hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none')
                        : (sidebarIsOpen 
                            ? 'max-[1500px]:opacity-0 max-[1500px]:pointer-events-none' 
                            : 'max-[1100px]:opacity-0 max-[1100px]:pointer-events-none opacity-100')
                }`}
                style={{ top: 'calc(1rem + env(safe-area-inset-top))', left: 'calc(1rem + env(safe-area-inset-left))' }}
            >
                <div 
                    className="bg-slate-900/90 backdrop-blur border border-slate-700 px-3 py-2 rounded-lg shadow-xl flex items-center gap-3"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className={`w-3 h-3 rounded-full ${data.activeUsers ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`}></div>
                    <div>
                        <div className="text-xs font-bold text-amber-500 fantasy-font tracking-widest"> {data.campaign?.genesis?.campaignName || "Unknown Realm"}</div>
                        <div className="text-[9px] text-slate-400 font-mono uppercase tracking-tighter">
                            [{code}] • LOCATION: {mapData.url ? (mapData.name || "Unnamed Map") : "The Void"}
                        </div>
                    </div>
                </div>
            </div>

            <div 
                className={`absolute ${data.config?.mobileCompact ? 'bottom-[0px]' : 'bottom-0'} md:bottom-6 left-0 w-full flex justify-center pointer-events-none transition-all duration-300 z-[70] ${
                    sidebarIsOpen ? 'md:pr-[384px]' : ''
                } ${hudClass}`}
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div onPointerDown={(e) => e.stopPropagation()}>
                    <MapToolbar 
                        role={role}
                        activeTool={activeTool} 
                        setTool={setActiveTool} 
                        visionActive={mapData.visionActive}
                        onToggleVision={() => updateCampaign({ 'campaign.activeMap.visionActive': !mapData.visionActive })}
                        />
                    </div>
                </div>

            {role === 'dm' && activeTool === 'grid' && (
                <GridControls 
                    grid={mapGrid} 
                    onUpdate={handleGridUpdate} 
                    onClose={() => setActiveTool('move')} 
                    activeTool={activeTool}
                    setActiveTool={setActiveTool}
                />
            )}
            
            {role === 'dm' && activeTool === 'light' && activeLightId && (() => {
                const light = lights.find(l => l.id === activeLightId);
                if (!light) return null;

                const updateLight = (changes) => {
                };

                return (
                    <div 
                        className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-2xl w-64 z-50 pointer-events-auto"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                                <Icon name="lamp" size={14}/> Light Settings
                            </h4>
                            <button onClick={() => setActiveLightId(null)} className="text-slate-500 hover:text-white"><Icon name="x" size={14}/></button>
                        </div>
                    </div>
                );
            })()}

            {showTokens && (
                <div 
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-20 right-4 bottom-24 w-64 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl z-[100] p-4 animate-in slide-in-from-right pointer-events-auto"
                >
                    <TokenManager 
                        data={data} 
                        onDragStart={handleDragStart} 
                        onDiceRoll={onDiceRoll} 
                        onClearTokens={handleClearTokens}
                        onClearAllMaps={handleClearAllMaps}
                    />
                </div>
            )}

            {showCombat && (
                <div onPointerDown={(e) => e.stopPropagation()}>
                    <CombatTracker 
                        combat={data.campaign?.combat} 
                        onNextTurn={handleNextTurn} 
                        onEndCombat={handleEndCombat}
                        role={role}
                        updateCombatant={updateCombatant}
                        onRemove={removeCombatant}
                        onClearRolls={onClearRolls}
                        onAutoRoll={() => setActiveTool('init_select')}
                        addManualCombatant={addManualCombatant}
                        players={players}
                        npcs={npcs}
                        onDiceRoll={onDiceRoll}
                    />
                </div>
            )}

            {showLibrary && (
                <div onPointerDown={(e) => e.stopPropagation()}>
                    <MapLibrary 
                        savedMaps={data.campaign?.savedMaps || []} 
                        user={user}
                        onAdd={(newMap) => {
                            const mapData = { ...newMap };
                            delete mapData.isNew;
                            const savedMaps = data.campaign?.savedMaps || [];
                            if (!savedMaps.some(m => m.url === newMap.url)) {
                                updateCampaign({ 'campaign.savedMaps': [...savedMaps, mapData] });
                            }
                        }}
                        onSelect={(selectedMap) => { 
                            const mapData = { ...selectedMap };
                            delete mapData.isNew;

                            updateCampaign({ 'campaign.activeMap': mapData });
                            updateMapState('load_map', selectedMap); 
                            setShowLibrary(false); 
                        }} 
                        onClose={() => setShowLibrary(false)} 
                        onDelete={(id) => {
                            if (typeof id === 'object') {
                                if (id.action === 'rename') updateMapState('rename_map', id);
                                else if (id.action === 'update_map') updateMapState('update_map', id);
                            } else {
                                updateMapState('delete_map', id);
                            }
                        }}
                    />
                </div>
            )}

            {activeTool === 'fx' && (
                <FxControls 
                    settings={fxSettings} 
                    onUpdate={setFxSettings} 
                    currentWeather={mapData.weather}
                    onWeatherChange={(w) => updateCampaign({ 'campaign.activeMap.weather': w })}
                    role={role}
                    onClose={() => setActiveTool('move')} 
                />
            )}

            {activeTool === 'objects' && (
                <ObjectControls 
                    settings={objectSettings} 
                    onUpdate={setObjectSettings} 
                    onClose={() => setActiveTool('move')} 
                />
            )}

            {mapData.url && !mapReady && (
                <div className="absolute inset-0 z-[140] bg-slate-950 flex flex-col items-center justify-center animate-in fade-in duration-300 pointer-events-auto">
                    <h2 className="text-2xl font-bold text-amber-500">ENTERING REGION</h2>
                </div>
            )}

            {sidebarDragEntity && dragPosition && (
                <div 
                    className="fixed z-[9999] pointer-events-none"
                    style={{ left: dragPosition.x, top: dragPosition.y }}
                >
                    {/* Ghost token UI */}
                </div>
            )}
        </>
    );
}

export default MapUI;
