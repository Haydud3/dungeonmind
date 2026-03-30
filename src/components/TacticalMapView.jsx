import React, { useState, useEffect, Suspense, useRef, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, Grid, useTexture, DragControls, Html, useCursor, Line, Text, RoundedBox, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { subscribeToMap, updateMap } from '../utils/mapService';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import AssetManager from './AssetManager';
import Icon from './Icon';
import { retrieveChunkedMap } from '../utils/storageUtils';
import CharacterModel from './CharacterModel';
import CameraController from '../utils/CameraController';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { searchGithubModels } from '../utils/miniManifest';

const ENV_SETTINGS = {
    day: {
        ambient: { color: '#ffffff', intensity: 0.8 },
        dir: { color: '#fffaed', intensity: 1.5, position: [10, 20, 10] },
        bg: '#1a1a2e',
        fog: null
    },
    night: {
        ambient: { color: '#4a4a65', intensity: 0.15 },
        dir: { color: '#a0a0ff', intensity: 0.3, position: [5, 10, 5] },
        bg: '#050510',
        fog: null
    },
    sunset: {
        ambient: { color: '#ffb380', intensity: 0.4 },
        dir: { color: '#ff7b00', intensity: 1.2, position: [-15, 5, 10] },
        bg: '#2d1b19',
        fog: { color: '#ffb380', near: 15, far: 60 }
    },
    fog: {
        ambient: { color: '#888899', intensity: 0.5 },
        dir: { color: '#aaaaaa', intensity: 0.5, position: [0, 10, 0] },
        bg: '#888899',
        fog: { color: '#888899', near: 5, far: 30 }
    },
    rain: {
        ambient: { color: '#555566', intensity: 0.4 },
        dir: { color: '#777788', intensity: 0.6, position: [0, 15, 0] },
        bg: '#1a1a22',
        fog: { color: '#555566', near: 10, far: 45 }
    }
};

const segmentsIntersect = (p1, p2, p3, p4) => {
    const d1 = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x);
    if (Math.abs(d1) < 1e-6) return false; // Prevent division by absolute zero and parallel artifacts
    const uA = ((p4.x - p3.x) * (p1.z - p3.z) - (p4.z - p3.z) * (p1.x - p3.x)) / d1;
    const uB = ((p2.x - p1.x) * (p1.z - p3.z) - (p2.z - p1.z) * (p1.x - p3.x)) / d1;
    // Tiny epsilon buffer ensures perfect grid-snapped edges are caught as line-of-sight blockers
    return uA >= -1e-5 && uA <= 1 + 1e-5 && uB >= -1e-5 && uB <= 1 + 1e-5;
};

const checkLineOfSight = (srcPt, targetPt, walls) => {
    if (!walls) return true;
    for (const wall of Object.values(walls)) {
        if (wall.isOpen || !wall.points || wall.points.length < 2) continue;
        for (let i = 0; i < wall.points.length - 1; i++) {
            if (segmentsIntersect(srcPt, targetPt, wall.points[i], wall.points[i+1])) return false;
        }
    }
    return true;
};

const useResolvedUrl = (url) => {
    const [resolvedUrl, setResolvedUrl] = useState(null);
    useEffect(() => {
        if (!url) {
            setResolvedUrl(null);
            return;
        }
        let isActive = true;
        if (url.startsWith('chunked:')) {
            let objectUrl = null;
            retrieveChunkedMap(url).then(blob => {
                if (isActive && blob) {
                    objectUrl = URL.createObjectURL(blob);
                    setResolvedUrl(objectUrl);
                }
            }).catch(console.error);
            return () => { 
                isActive = false; 
                if (objectUrl) URL.revokeObjectURL(objectUrl); 
            };
        } else {
            setResolvedUrl(url);
        }
        return () => { isActive = false; }
    }, [url]);
    return resolvedUrl;
};

const MapPlaneContent = ({ backgroundUrl, scale = 20 }) => {
  const [aspect, setAspect] = useState(1);
  const texture = useMemo(() => {
      if (!backgroundUrl) return null;
      const loader = new THREE.TextureLoader();
      return loader.load(backgroundUrl, (tex) => {
          if (tex.image) {
              setAspect(tex.image.width / tex.image.height);
          }
      });
  }, [backgroundUrl]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[scale * aspect, scale]} />
      <meshBasicMaterial map={texture} transparent={true} />
    </mesh>
  );
};

const MapPlane = ({ backgroundUrl, scale = 20 }) => {
  const resolvedUrl = useResolvedUrl(backgroundUrl);

  if (!resolvedUrl) return null;
  return <MapPlaneContent backgroundUrl={resolvedUrl} scale={scale} />;
};

const MarqueeSelector = ({ tokens, onSelectTokens }) => {
    const { camera, size, gl, controls } = useThree();

    useEffect(() => {
        const container = gl.domElement.parentNode;
        let isSelecting = false;
        let startPos = { x: 0, y: 0 };
        let boxOverlay = null;

        const onPointerDown = (e) => {
            // Button 2 is Right-Click
            if (e.button === 2) {
                isSelecting = true;
                startPos = { x: e.clientX, y: e.clientY };
                
                if (controls) controls.enabled = false;

                boxOverlay = document.createElement('div');
                boxOverlay.style.position = 'fixed';
                boxOverlay.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                boxOverlay.style.border = '1px solid rgba(59, 130, 246, 0.8)';
                boxOverlay.style.pointerEvents = 'none';
                boxOverlay.style.zIndex = '9999';
                boxOverlay.style.left = `${startPos.x}px`;
                boxOverlay.style.top = `${startPos.y}px`;
                boxOverlay.style.width = '0px';
                boxOverlay.style.height = '0px';
                document.body.appendChild(boxOverlay);
            }
        };

        const onPointerMove = (e) => {
            if (isSelecting && boxOverlay) {
                const minX = Math.min(startPos.x, e.clientX);
                const minY = Math.min(startPos.y, e.clientY);
                const width = Math.abs(startPos.x - e.clientX);
                const height = Math.abs(startPos.y - e.clientY);

                boxOverlay.style.left = `${minX}px`;
                boxOverlay.style.top = `${minY}px`;
                boxOverlay.style.width = `${width}px`;
                boxOverlay.style.height = `${height}px`;
            }
        };

        const onPointerUp = (e) => {
            if (isSelecting) {
                isSelecting = false;
                if (controls) controls.enabled = true;
                if (boxOverlay && document.body.contains(boxOverlay)) {
                    document.body.removeChild(boxOverlay);
                    boxOverlay = null;
                }

                const endPos = { x: e.clientX, y: e.clientY };
                const minX = Math.min(startPos.x, endPos.x);
                const maxX = Math.max(startPos.x, endPos.x);
                const minY = Math.min(startPos.y, endPos.y);
                const maxY = Math.max(startPos.y, endPos.y);

                // If the box is tiny, treat it as a normal click and ignore
                if (maxX - minX < 5 && maxY - minY < 5) return;

                const rect = gl.domElement.getBoundingClientRect();
                const selected = [];

                tokens.forEach(token => {
                    const vec = new THREE.Vector3(token.x || 0, token.y || 0, token.z || 0);
                    vec.project(camera);

                    // Map 3D projection to 2D screen pixels
                    const screenX = rect.left + (vec.x + 1) / 2 * size.width;
                    const screenY = rect.top + (-vec.y + 1) / 2 * size.height;

                    if (
                        screenX >= minX && screenX <= maxX &&
                        screenY >= minY && screenY <= maxY
                    ) {
                        selected.push(token.id);
                    }
                });

                onSelectTokens(prev => {
                    // If holding shift, append to current selection. Otherwise, replace.
                    return e.shiftKey ? [...new Set([...prev, ...selected])] : selected;
                });
            }
        };

        container.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        return () => {
            container.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            if (boxOverlay && document.body.contains(boxOverlay)) {
                document.body.removeChild(boxOverlay);
            }
        };
    }, [camera, size, gl, controls, tokens, onSelectTokens]);

    return null;
};

const HeightmapContent = ({ resolvedHeightmapUrl, resolvedBackgroundUrl, heightScale, scale }) => {
    const [aspect, setAspect] = useState(1);
    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const backgroundTexture = useMemo(() => {
        if (!resolvedBackgroundUrl) return null;
        const tex = new THREE.TextureLoader().load(resolvedBackgroundUrl, (t) => {
             if (t.image) setAspect(t.image.width / t.image.height);
        });
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }, [resolvedBackgroundUrl]);

    const heightmapTexture = useMemo(() => {
        if (!resolvedHeightmapUrl) return null;
        return new THREE.TextureLoader().load(resolvedHeightmapUrl);
    }, [resolvedHeightmapUrl]);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[scale * aspect, scale, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={backgroundTexture}
                displacementMap={heightmapTexture}
                displacementScale={heightScale}
            />
        </mesh>
    );
};

const Heightmap = ({ heightmapUrl, backgroundUrl, heightScale, scale = 20 }) => {
    const resolvedHeightmapUrl = useResolvedUrl(heightmapUrl);
    const resolvedBackgroundUrl = useResolvedUrl(backgroundUrl);

    if (!resolvedHeightmapUrl || !resolvedBackgroundUrl) {
        return null;
    }

    return <HeightmapContent 
        resolvedHeightmapUrl={resolvedHeightmapUrl}
        resolvedBackgroundUrl={resolvedBackgroundUrl}
        heightScale={heightScale}
        scale={scale}
    />
};

const WallSegment = ({ start, end, onContextMenu, onToggleDoor, wall }) => {
    const vec = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
    const midpoint = useMemo(() => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5), [start, end]);
    const quat = useMemo(() => {
        const quaternion = new THREE.Quaternion();
        const axis = new THREE.Vector3(0, 1, 0);
        quaternion.setFromUnitVectors(axis, vec.clone().normalize());
        return quaternion;
    }, [vec]);
    
    const length = vec.length();

    return (
        <mesh 
            position={midpoint} 
            quaternion={quat}
            renderOrder={200}
            onClick={(e) => {
                if (wall.type === 'door') {
                    e.stopPropagation();
                    if (onToggleDoor) onToggleDoor(e, wall.id);
                }
            }}
            onContextMenu={(e) => {
                e.stopPropagation();
                if (onContextMenu) onContextMenu(e, wall.id);
            }}
        >
            <cylinderGeometry args={[0.4, 0.4, length, 8]} />
            <meshBasicMaterial visible={false} />
        </mesh>
    );
};

const Wall = ({ wall, onContextMenu, onToggleDoor, showWalls, role }) => {
    const points = wall.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const type = wall.type || 'wall';
    const color = type === 'door' ? '#3b82f6' : type === 'window' ? '#06b6d4' : '#ef4444';

    // Hide structural walls unless editing (doors and windows stay visible)
    const isVisible = type === 'wall' ? showWalls : true;
    if (!isVisible) return null;

    const segments = [];
    if (onContextMenu) {
        for (let i = 0; i < points.length - 1; i++) {
            segments.push(
                <WallSegment 
                    key={i} 
                    start={points[i]} 
                    end={points[i+1]} 
                    onContextMenu={onContextMenu}
                    onToggleDoor={onToggleDoor}
                    wall={wall}
                />
            );
        }
    }
    
    return (
        <group>
            <Line 
                points={points} 
                color={color} 
                lineWidth={type === 'door' ? 8 : 5} 
                dashed={wall.isOpen}
                dashScale={wall.isOpen ? 2 : 1}
                transparent={true}
                opacity={wall.isOpen ? 0.3 : 1}
                renderOrder={200}
                depthTest={false}
            />
            {segments}
        </group>
    );
};

const Walls = ({ walls, onWallContextMenu, onToggleDoor, showWalls, role }) => {
    if (!walls) return null;
    return (
        <group>
            {Object.values(walls).map(wall => (
                <Wall key={wall.id} wall={wall} onContextMenu={onWallContextMenu} onToggleDoor={onToggleDoor} showWalls={showWalls} role={role} />
            ))}
        </group>
    );
};

const CombatRibbon = ({ combat, tokens, role }) => {
    if (role === 'dm' || !combat?.active || !combat?.combatants?.length) return null;

    const combatants = combat.combatants;
    const turn = combat.turn || 0;
    const activeIndex = turn % combatants.length;
    
    // Build the display order (Active first, then the rest wrapping around)
    const displayOrder = [
        combatants[activeIndex],
        ...combatants.slice(activeIndex + 1),
        ...combatants.slice(0, activeIndex)
    ];

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 bg-slate-900/90 backdrop-blur border border-slate-700 p-2 rounded-2xl shadow-2xl">

            <div className="flex items-center gap-2 overflow-hidden max-w-[60vw]">
                {displayOrder.map((c, i) => {
                    const t = tokens.find(t => t.id === c.tokenId);
                    const isActive = i === 0;
                    
                    return (
                        <div 
                            key={c.tokenId + i} 
                            className={`relative flex items-center gap-2 rounded-xl border p-1 transition-all ${isActive ? 'bg-slate-800 border-amber-500 scale-100 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-slate-800 border-slate-600 scale-90 opacity-80 hover:opacity-100'}`}
                        >
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 shrink-0">
                                {t?.image || t?.img ? <img src={t.image || t.img} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{t?.name?.[0] || c.name[0] || '?'}</div>}
                            </div>
                            {isActive && (
                                <div className="flex flex-col pr-3">
                                    <span className="text-sm font-bold text-white whitespace-nowrap">{t?.name || c.name}</span>
                                    <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Init: {c.initiative}</span>
                                </div>
                            )}
                            {!isActive && (
                                <div className="absolute -top-2 -right-2 bg-slate-700 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-slate-500 shadow-md">
                                    {c.initiative}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const EditableHP = ({ currentHp, maxHp, onSave }) => {
    const [val, setVal] = useState(currentHp);
    useEffect(() => setVal(currentHp), [currentHp]);
    
    return (
        <div className="flex items-center bg-slate-900 border border-slate-600 rounded overflow-hidden">
            <input 
                className="w-10 bg-transparent text-center text-xs font-bold text-green-400 outline-none py-1"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={() => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num !== currentHp) onSave(num);
                    else setVal(currentHp);
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                onFocus={(e) => e.target.select()}
            />
            <span className="text-[10px] text-slate-500 px-1.5 border-l border-slate-700 bg-slate-800 leading-none flex items-center h-full">/ {maxHp}</span>
        </div>
    );
};

const CombatTrackerSidebar = ({ combat, updateCampaign, updateToken, tokens, role, campaignData, allCharacters, onOpenSheet, data }) => {
    if (role !== 'dm' || !combat?.active || !combat?.combatants?.length) return null;

    const combatants = combat.combatants;
    const turn = combat.turn || 0;
    const activeIndex = turn % combatants.length;
    
    // Display all combatants from highest to lowest initiative
    const sortedCombatants = [...combatants].sort((a,b) => b.initiative - a.initiative);
    const activeCombatant = combatants[activeIndex];

    const handleNext = () => updateCampaign({ campaign: { ...campaignData, combat: { ...combat, turn: turn + 1 } } });
    const handlePrev = () => updateCampaign({ campaign: { ...campaignData, combat: { ...combat, turn: Math.max(0, turn - 1) } } });
    const handleEnd = () => {
        if (window.confirm("End combat and clear initiative tracker?")) {
            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, active: false, combatants: [], turn: 0 } } });
        }
    };

    const editInit = (tokenId, currentInit) => {
        if (role !== 'dm') return;
        const newVal = window.prompt("Set new initiative:", currentInit);
        if (!newVal || isNaN(newVal)) return;
        
        const newCombatants = [...combatants];
        const idx = newCombatants.findIndex(c => c.tokenId === tokenId);
        if (idx !== -1) {
            newCombatants[idx].initiative = Number(newVal);
            updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants } } });
        }
    };

    const updateCharHp = (tokenId, charId, isNpc, newHp) => {
        if (isNpc) {
            const token = tokens.find(t => t.id === tokenId);
            if (token) {
                const oldHp = token.hp || allCharacters.find(ch => String(ch.id) === String(charId))?.hp || {};
                updateToken(tokenId, { hp: { ...oldHp, current: newHp } });
            } else {
                const newNpcs = (data?.npcs || []).map(n => String(n.id) === String(charId) ? { ...n, hp: { ...n.hp, current: newHp } } : n);
                updateCampaign({ npcs: newNpcs });
            }
        } else {
            const newPlayers = (data?.players || []).map(p => String(p.id) === String(charId) ? { ...p, hp: { ...p.hp, current: newHp } } : p);
            updateCampaign({ players: newPlayers });
        }
    };

    return (
        <div className="absolute top-44 left-4 bottom-24 w-72 bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl rounded-xl z-[60] flex flex-col overflow-hidden transition-all">
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-amber-500 flex items-center gap-2"><Icon name="sword" size={16}/> Initiative</h3>
                {role === 'dm' && (
                    <div className="flex gap-1">
                        <button onClick={handlePrev} className="p-1.5 hover:bg-slate-600 rounded text-slate-400 hover:text-white" title="Previous Turn"><Icon name="chevron-left" size={14}/></button>
                        <button onClick={handleNext} className="p-1.5 hover:bg-slate-600 rounded text-slate-400 hover:text-white" title="Next Turn"><Icon name="chevron-right" size={14}/></button>
                        <button onClick={handleEnd} className="p-1.5 hover:bg-red-900/50 rounded text-red-500 hover:text-red-400 ml-1" title="End Combat"><Icon name="x" size={14}/></button>
                    </div>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
                {sortedCombatants.map((c, i) => {
                    const t = tokens.find(tok => tok.id === c.tokenId);
                    const char = allCharacters.find(ch => String(ch.id) === String(t?.characterId || c.characterId || c.tokenId));
                    const isActive = activeCombatant?.tokenId === c.tokenId;
                    
                    const isNpc = c.isNpc;
                    const hp = isNpc ? (t?.hp?.current ?? char?.hp?.current ?? '-') : (char?.hp?.current ?? '-');
                    const maxHp = isNpc ? (t?.hp?.max ?? char?.hp?.max ?? '-') : (char?.hp?.max ?? '-');
                    const ac = char?.ac ?? '-';
                    
                    const displayName = t?.name || char?.name || c.name;
                    const displayImage = t?.image || t?.img || char?.image;
                    const charIdForSheet = t?.characterId || char?.id;
                    
                    return (
                        <div key={c.tokenId} className={`relative flex flex-col rounded-lg border p-2 transition-all ${isActive ? 'bg-slate-800 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'bg-slate-800/50 border-slate-700'}`}>
                            <div className="flex items-center gap-3">
                                {/* Avatar (Click to open sheet) */}
                                <div 
                                    className="w-10 h-10 rounded bg-slate-900 border border-slate-600 shrink-0 overflow-hidden cursor-pointer hover:border-amber-400 transition-colors"
                                    onClick={() => {
                                        if (charIdForSheet && onOpenSheet) {
                                            const tokenHp = t?.hp?.current ?? char?.hp?.current;
                                            const tokenMaxHp = t?.hp?.max ?? char?.hp?.max;
                                            onOpenSheet({ isToken: true, tokenId: c.tokenId, characterId: charIdForSheet, hp: tokenHp, maxHp: tokenMaxHp });
                                        }
                                    }}
                                    title={`Open ${displayName}'s Sheet`}
                                >
                                    {displayImage ? <img src={displayImage} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 text-lg">{displayName?.[0] || '?'}</div>}
                                </div>
                                
                                {/* Info */}
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <div className="font-bold text-sm text-white truncate pr-5">{displayName}</div>
                                    <div className="flex items-center gap-3 mt-1">
                                        {/* Init */}
                                        <div 
                                            className={`flex items-center gap-1 text-[10px] uppercase font-bold cursor-pointer hover:text-amber-400 ${isActive ? 'text-amber-500' : 'text-slate-400'}`}
                                            onClick={() => editInit(c.tokenId, c.initiative)}
                                            title="Edit Initiative"
                                        >
                                            <Icon name="clock" size={10}/> {c.initiative}
                                        </div>
                                        {/* AC */}
                                        <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-400" title="Armor Class">
                                            <Icon name="shield" size={10}/> {ac}
                                        </div>
                                    </div>
                                </div>

                                {/* HP (Editable) */}
                                {char && (role === 'dm' || !isNpc) && (
                                    <div className="shrink-0 flex flex-col items-end">
                                        <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">HP</div>
                                        {role === 'dm' ? (
                                            <EditableHP currentHp={hp} maxHp={maxHp} onSave={(val) => updateCharHp(c.tokenId, charIdForSheet, isNpc, val)} />
                                        ) : (
                                            <div className="text-xs font-bold text-green-400">{hp} <span className="text-slate-500 text-[10px]">/ {maxHp}</span></div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {role === 'dm' && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newCombatants = combatants.filter(x => x.tokenId !== c.tokenId);
                                        updateCampaign({ campaign: { ...campaignData, combat: { ...combat, combatants: newCombatants, active: newCombatants.length > 0 } } });
                                    }}
                                    className="absolute top-1 right-1 text-slate-600 hover:text-red-500 transition-colors p-1"
                                    title="Remove from Combat"
                                >
                                    <Icon name="x" size={12} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {role === 'dm' && (
                <div className="p-2 bg-slate-900 border-t border-slate-700">
                    <button onClick={handleNext} className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 transition-all">
                        Next Turn <Icon name="arrow-right" size={16}/>
                    </button>
                </div>
            )}
        </div>
    );
};

const CombatCameraDirector = ({ activeTokenId, tokensList }) => {
    const { camera, controls } = useThree();
    const [targetData, setTargetData] = useState(null);
    const prevActiveId = useRef(null); // Init as null so it pans on first load if combat is active

    useEffect(() => {
        if (activeTokenId && activeTokenId !== prevActiveId.current) {
            const t = tokensList.find(x => x.id === activeTokenId);
            if (t && controls) {
                const newTarget = new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0);
                const delta = new THREE.Vector3().subVectors(newTarget, controls.target);
                const newCamPos = camera.position.clone().add(delta);
                setTargetData({ target: newTarget, camPos: newCamPos });
            }
        }
        prevActiveId.current = activeTokenId;
    }, [activeTokenId, tokensList, camera, controls]);

    useEffect(() => {
        if (!controls) return;
        const cancelPan = () => setTargetData(null);
        controls.addEventListener('start', cancelPan); // Yield to user if they touch the map
        return () => controls.removeEventListener('start', cancelPan);
    }, [controls]);

    useFrame(() => {
        if (targetData && controls) {
            controls.target.lerp(targetData.target, 0.08);
            camera.position.lerp(targetData.camPos, 0.08);
            if (controls.target.distanceTo(targetData.target) < 0.05) setTargetData(null);
        }
    });
    return null;
};

const ArchitectPenController = ({ isEnabled, onCommitSegment, getTerrainHeight }) => {
    const { controls } = useThree();
    const [nodes, setNodes] = useState([]);
    const [cursorPos, setCursorPos] = useState(null);

    useEffect(() => {
        if (controls) controls.enabled = !isEnabled;
        if (!isEnabled) { setNodes([]); setCursorPos(null); }
    }, [isEnabled, controls]);

    const applySnap = (pt, lastNode) => {
        const dx = pt.x - lastNode.x;
        const dz = pt.z - lastNode.z;
        const angle = Math.atan2(dz, dx);
        const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.sqrt(dx*dx + dz*dz);
        pt.x = lastNode.x + Math.cos(snappedAngle) * dist;
        pt.z = lastNode.z + Math.sin(snappedAngle) * dist;
        return pt;
    };

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (e.shiftKey && nodes.length > 0) pt = applySnap(pt, nodes[nodes.length - 1]);

        const newNodes = [...nodes, pt];
        setNodes(newNodes);

        if (newNodes.length >= 2) {
            onCommitSegment(newNodes[newNodes.length - 2], newNodes[newNodes.length - 1]);
            setNodes([newNodes[newNodes.length - 1]]); // Chain the next segment
        }
    };

    const handlePointerMove = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (e.shiftKey && nodes.length > 0) pt = applySnap(pt, nodes[nodes.length - 1]);
        setCursorPos(pt);
    };

    const handleContextMenu = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        setNodes([]); // Break the chain
    };

    useEffect(() => {
        const handleKeyDown = (e) => { if (e.key === 'Escape') setNodes([]); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!isEnabled) return null;

    return (
        <group>
            {nodes.length > 0 && cursorPos && (
                <Line points={[nodes[nodes.length - 1], cursorPos]} color="#ef4444" lineWidth={3} dashed dashScale={10} renderOrder={200} depthTest={false} />
            )}
            {nodes.map((n, i) => (
                <mesh key={i} position={n} renderOrder={200}>
                    <sphereGeometry args={[0.2]} />
                    <meshBasicMaterial color="#ef4444" depthTest={false} />
                </mesh>
            ))}
            <mesh onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onContextMenu={handleContextMenu} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </group>
    );
};

const LightPlacementController = ({ isEnabled, onPlaceLight, getTerrainHeight }) => {
    const { controls } = useThree();
    const [cursorPos, setCursorPos] = useState(null);

    useEffect(() => {
        if (controls) controls.enabled = !isEnabled;
        if (!isEnabled) setCursorPos(null);
    }, [isEnabled, controls]);

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        onPlaceLight(pt);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setCursorPos(pt);
    };

    if (!isEnabled) return null;

    return (
        <group>
            {cursorPos && (
                <mesh position={cursorPos} raycast={() => null} renderOrder={200}>
                    <sphereGeometry args={[0.5]} />
                    <meshBasicMaterial color="#fef08a" transparent opacity={0.5} depthTest={false} />
                </mesh>
            )}
            <mesh onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </group>
    );
};

const MapLights = ({ lights, onContextMenu, role, gridSize = 1, showLightRadius }) => {
    if (!lights || role !== 'dm') return null;
    return (
        <group>
            {Object.values(lights).map(light => {
                const radiusInMapUnits = (light.radius || 15) / 5 * gridSize; 
                return (
                    <group key={light.id} position={[light.position.x, light.position.y || 1, light.position.z]}>
                        <mesh 
                            renderOrder={200}
                            onContextMenu={(e) => {
                                e.stopPropagation();
                                if (onContextMenu) onContextMenu(e, light.id);
                            }}
                        >
                            <sphereGeometry args={[0.4]} />
                            <meshBasicMaterial color={light.color || "#fef08a"} transparent opacity={0.8} depthTest={false} />
                        </mesh>
                        {showLightRadius && (
                            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} renderOrder={200}>
                                <ringGeometry args={[Math.max(0.1, radiusInMapUnits - 0.1), radiusInMapUnits, 32]} />
                                <meshBasicMaterial color={light.color || "#fef08a"} transparent opacity={0.3} depthTest={false} />
                            </mesh>
                        )}
                    </group>
                );
            })}
        </group>
    );
};

const GpuFogOfWar = ({ enabled, walls, lights, gridSize, mapData, aspect, resolvedHeightmapUrl, playerVisionSources, role }) => {
    const { gl } = useThree();
    const scale = mapData?.scale || 20;
    const width = scale * aspect;
    const height = scale;

    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const heightmapTexture = useMemo(() => {
        if (!resolvedHeightmapUrl) return null;
        return new THREE.TextureLoader().load(resolvedHeightmapUrl);
    }, [resolvedHeightmapUrl]);

    const fowScene = useMemo(() => new THREE.Scene(), []);
    const fowCamera = useMemo(() => {
        if (!width || !height || isNaN(width) || isNaN(height)) return null;
        const cam = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
        cam.position.z = 5;
        return cam;
    }, [width, height]);
    
    const fowTarget = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(1024, 1024, { stencilBuffer: true });
        rt.texture.generateMipmaps = false;
        rt.texture.minFilter = THREE.LinearFilter;
        rt.texture.magFilter = THREE.LinearFilter;
        return rt;
    }, []);
    const exploredTarget = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(1024, 1024);
        rt.texture.generateMipmaps = false;
        rt.texture.minFilter = THREE.LinearFilter;
        rt.texture.magFilter = THREE.LinearFilter;
        return rt;
    }, []);
    const hasClearedExplored = useRef(false);

    // Reset exploration memory if the map changes or FOW is toggled off/on
    useEffect(() => {
        hasClearedExplored.current = false;
    }, [width, height, enabled]);

    const accumulatorScene = useMemo(() => new THREE.Scene(), []);
    const accumulatorCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
    const accumulatorMaterial = useMemo(() => new THREE.MeshBasicMaterial({
        map: fowTarget.texture,
        blending: THREE.MultiplyBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    }), [fowTarget]);

    useEffect(() => {
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accumulatorMaterial);
        accumulatorScene.add(quad);
        return () => { accumulatorScene.remove(quad); quad.geometry.dispose(); };
    }, [accumulatorScene, accumulatorMaterial]);
    
    const visionGeometry = useMemo(() => new THREE.CircleGeometry(1, 32), []); // Unit circle

    const visionMaterial = useMemo(() => new THREE.MeshBasicMaterial({ 
        color: 0x000000, depthTest: false, depthWrite: false,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.EqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp
    }), []);

    // Material for shadow polygons to write to stencil buffer without touching color
    const shadowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ 
        color: 0xffffff, depthTest: false, depthWrite: false, colorWrite: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
        side: THREE.DoubleSide
    }), []);

    useFrame((state, delta) => {
        if (!fowCamera) return;

        const oldColor = gl.getClearColor(new THREE.Color());
        const oldAlpha = gl.getClearAlpha();

        const oldAutoClear = gl.autoClear;
        gl.autoClear = false;

        gl.setRenderTarget(fowTarget);
        gl.setClearColor(0xffffff, 1); // 1. Clear to white (fully fogged)
        gl.clear(true, true, true); // color, depth, stencil

        const allSources = [...playerVisionSources];
        // Only factor in lights if FOW is actually enabled.
        if (enabled && lights) {
            Object.values(lights).forEach(light => {
                // FIX: Use light.radius, not light.range. The value is in feet.
                const lightRangeInMapUnits = (light.radius || 15) / 5 * gridSize; 
                
                let isVisibleToPlayers = role === 'dm';
                if (!isVisibleToPlayers && playerVisionSources.length > 0) {
                    const lightPt = { x: light.position.x, z: light.position.z };
                    for (const src of playerVisionSources) {
                        if (checkLineOfSight(src, lightPt, walls)) {
                            isVisibleToPlayers = true;
                            break;
                        }
                    }
                }

                if (isVisibleToPlayers) {
                    allSources.push({
                        x: light.position.x,
                        z: light.position.z,
                        range: lightRangeInMapUnits
                    });
                }
            });
        }

        allSources.forEach(source => {
            gl.clear(false, false, true); // Clear stencil buffer to 0 for this light
            fowScene.clear();

            let shadowGeo = null;
            if (walls) {
                const vertices = [];
                Object.values(walls).forEach(wall => {
                    if (wall.isOpen || !wall.points || wall.points.length < 2) return;
                    for (let i = 0; i < wall.points.length - 1; i++) {
                        const p1 = wall.points[i];
                        const p2 = wall.points[i+1];
                        const A = new THREE.Vector2(p1.x, -p1.z);
                        const B = new THREE.Vector2(p2.x, -p2.z);
                        const S = new THREE.Vector2(source.x, -source.z);

                        const SA = new THREE.Vector2().subVectors(A, S);
                        const SB = new THREE.Vector2().subVectors(B, S);
                        
                        const far = 1000;
                        const A_far = new THREE.Vector2().copy(A).add(SA.clone().multiplyScalar(far));
                        const B_far = new THREE.Vector2().copy(B).add(SB.clone().multiplyScalar(far));

                        // Create 2 triangles to form the occlusion quad
                        vertices.push(
                            A.x, A.y, 0,
                            B.x, B.y, 0,
                            B_far.x, B_far.y, 0,
                            A.x, A.y, 0,
                            B_far.x, B_far.y, 0,
                            A_far.x, A_far.y, 0
                        );
                    }
                });

                if (vertices.length > 0) {
                    shadowGeo = new THREE.BufferGeometry();
                    shadowGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMaterial);
                    shadowMesh.renderOrder = 1;
                    fowScene.add(shadowMesh);
                }
            }

            const visionMesh = new THREE.Mesh(visionGeometry, visionMaterial);
            visionMesh.scale.set(source.range, source.range, 1);
            visionMesh.position.set(source.x, -source.z, 0); // INVERT Z
            visionMesh.renderOrder = 2;
            fowScene.add(visionMesh);

            gl.render(fowScene, fowCamera);
            if (shadowGeo) shadowGeo.dispose(); // Prevent Memory leaks
        });

        gl.setRenderTarget(exploredTarget);
        if (!hasClearedExplored.current) {
            gl.setClearColor(0xffffff, 1);
            gl.clear(true, true, true);
            hasClearedExplored.current = true;
        }
        gl.render(accumulatorScene, accumulatorCamera);
        
        gl.autoClear = oldAutoClear;

        gl.setRenderTarget(null);
        gl.setClearColor(oldColor, oldAlpha); // Restore map background color
    });

    if (!width || !height || isNaN(width) || isNaN(height)) {
        return null;
    }

    return (
        <group>
            {/* Shroud: Permanent Memory of Explored Areas (Pitch Black) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} renderOrder={99}>
                <planeGeometry args={[width, height, resolvedHeightmapUrl ? subdivisions : 1, resolvedHeightmapUrl ? subdivisions : 1]} />
                {resolvedHeightmapUrl ? (
                    <meshStandardMaterial
                        color={0x000000}
                        roughness={1}
                        metalness={0}
                        alphaMap={exploredTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.3 : 0.98}
                        displacementMap={heightmapTexture}
                        displacementScale={mapData?.heightScale || 1}
                        depthWrite={false}
                    />
                ) : (
                    <meshBasicMaterial
                        color={0x000000}
                        alphaMap={exploredTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.3 : 0.98}
                        depthWrite={false}
                    />
                )}
            </mesh>

            {/* Current Vision: Shadows for unseen areas (Grayed Out) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={100}>
                <planeGeometry args={[width, height, resolvedHeightmapUrl ? subdivisions : 1, resolvedHeightmapUrl ? subdivisions : 1]} />
                {resolvedHeightmapUrl ? (
                    <meshStandardMaterial
                        color={0x000000}
                        roughness={1}
                        metalness={0}
                        alphaMap={fowTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.2 : 0.6}
                        displacementMap={heightmapTexture}
                        displacementScale={mapData?.heightScale || 1}
                        depthWrite={false}
                    />
                ) : (
                    <meshBasicMaterial
                        color={0x000000}
                        alphaMap={fowTarget.texture}
                        transparent
                        opacity={role === 'dm' ? 0.2 : 0.6}
                        depthWrite={false}
                    />
                )}
            </mesh>
        </group>
    );
};

const ZoomHandler = ({ zoomRef }) => {
    const { camera, controls } = useThree();
    const targetDistance = useRef(null);

    useEffect(() => {
        if (zoomRef) {
            zoomRef.current = {
                zoomIn: () => {
                    if (!controls) return;
                    if (camera.isOrthographicCamera) {
                        const z = targetDistance.current || camera.zoom;
                        targetDistance.current = Math.min(controls.maxZoom || 10, z * 1.3);
                    } else {
                        const dist = targetDistance.current || camera.position.distanceTo(controls.target);
                        targetDistance.current = Math.max(controls.minDistance || 3, dist * 0.7);
                    }
                },
                zoomOut: () => {
                    if (!controls) return;
                    if (camera.isOrthographicCamera) {
                        const z = targetDistance.current || camera.zoom;
                        targetDistance.current = Math.max(controls.minZoom || 0.1, z * 0.7);
                    } else {
                        const dist = targetDistance.current || camera.position.distanceTo(controls.target);
                        targetDistance.current = Math.min(controls.maxDistance || 40, dist * 1.4);
                    }
                }
            };
        }
    }, [camera, controls, zoomRef]);

    useEffect(() => {
        if (!controls) return;
        const cancelZoom = () => { targetDistance.current = null; };
        controls.addEventListener('start', cancelZoom); // User started dragging map
        if (controls.domElement) controls.domElement.addEventListener('wheel', cancelZoom); // User scrolled wheel
        return () => {
            controls.removeEventListener('start', cancelZoom);
            if (controls.domElement) controls.domElement.removeEventListener('wheel', cancelZoom);
        };
    }, [controls]);

    useFrame(() => {
        if (controls && targetDistance.current !== null) {
            if (camera.isOrthographicCamera) {
                const currentZoom = camera.zoom;
                const diff = targetDistance.current - currentZoom;
                if (Math.abs(diff) < 0.05) {
                    targetDistance.current = null;
                } else {
                    camera.zoom = currentZoom + diff * 0.15;
                    camera.updateProjectionMatrix();
                    controls.update();
                }
            } else {
                const currentDist = camera.position.distanceTo(controls.target);
                const diff = targetDistance.current - currentDist;
                if (Math.abs(diff) < 0.1) {
                    targetDistance.current = null;
                } else {
                    const dir = camera.position.clone().sub(controls.target).normalize();
                    camera.position.copy(controls.target).add(dir.multiplyScalar(currentDist + diff * 0.15));
                    controls.update();
                }
            }
        }
    });

    return null;
};

const WallDrawingController = ({ isEnabled, onDrawEnd, getTerrainHeight }) => {
    const { controls } = useThree();
    const [isDrawing, setIsDrawing] = useState(false);
    const [points, setPoints] = useState([]);

    useCursor(isEnabled, 'crosshair', 'auto');

    // This effect handles enabling/disabling controls
    useEffect(() => {
        if (controls) {
            controls.enabled = !isDrawing;
        }
    }, [isDrawing, controls]);

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        
        setIsDrawing(true);
        const pt = e.point;
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;
        setPoints([pt]);
    };

    const handlePointerMove = (e) => {
        if (!isEnabled || !isDrawing) return;
        e.stopPropagation();

        const pt = e.point;
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (points.length > 0 && points[points.length-1].distanceTo(pt) < 0.1) return;

        setPoints(prev => [...prev, pt]);
    };

    const handlePointerUp = (e) => {
        if (!isEnabled || !isDrawing || e.button !== 0) return;
        e.stopPropagation();

        setIsDrawing(false);
        
        if (points.length > 1) {
            onDrawEnd(points);
        }
        setPoints([]);
    };
    
    if (!isEnabled) return null;

    return (
        <>
            {/* Show the line being actively drawn */}
            {points.length > 1 && <Line points={points} color="magenta" lineWidth={5} renderOrder={200} depthTest={false} />}

            {/* The large invisible plane to capture drawing events */}
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </>
    );
};

const TokenImage = ({ imageUrl, size }) => {
    const texture = useMemo(() => {
        if (!imageUrl) return null;
        return new THREE.TextureLoader().load(imageUrl);
    }, [imageUrl]);
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.051, 0]}>
            <circleGeometry args={[size * 0.45, 32]} />
            <meshBasicMaterial map={texture} transparent />
        </mesh>
    )
}

// Interactive 3D Token
const Token3D = ({ token, updateTokenPosition, gridSize = 1, isSelected, onSelect, onContextMenu, role, getTerrainHeight, isSnapToGrid, isTerrainReady, draggedTokenId, setDraggedTokenId, viewMode, showNameplates, selectedTokenIds, groupDragData, onGroupDragEnd, isActiveTurn, canControl }) => {
  const meshRef = useRef();
  const visualsRef = useRef();
  const rotationRef = useRef();
  const { controls } = useThree();
  const [hovered, setHover] = useState(false);
  const [resolvedImage, setResolvedImage] = useState(null);
  const polarAngleRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null

  const rulerRef = useRef();
  const rulerLabelRef = useRef();
  const rulerTextRef = useRef();

  const isTopDownView = viewMode === 'top-down';
  const showModel = !!token.modelUrl && !isTopDownView;

  if (token.isHidden && role !== 'dm') return null;
  const opacity = token.isHidden ? 0.4 : 1;

  useCursor(hovered, 'pointer', 'auto');

  const isPc = token.type === 'pc' || token.characterId;
  const baseColor = isPc ? "#22c55e" : "#ef4444";
  const size = (token.size || 1) * gridSize;
  const safeSize = !Number.isFinite(size) || size < 0.001 ? gridSize : size;
  const scale = hovered ? 1.1 : 1;

  const isRightDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStartY = useRef(0);
  const isLeftDragging = useRef(false);
  const startMouseY = useRef(0);
  const dragStartPos = useRef(new THREE.Vector3());
  const velocity = useRef(new THREE.Vector3());
  const previousPos = useRef(new THREE.Vector3(token.x || 0, token.y || 0.025, token.z || 0));
  const targetRotationY = useRef(token.rotationY || 0);
  const dragControlsRef = useRef();
  const pulseRef = useRef();

  // START CHANGE: Make token position reactive to props
  useEffect(() => {
    if (meshRef.current && !isLeftDragging.current) {
        const targetPosition = new THREE.Vector3(token.x || 0, token.y || 0.025, token.z || 0);
        // Directly check distance to avoid unnecessary updates for minor floating point differences
        if (meshRef.current.position.distanceTo(targetPosition) > 0.001) {
            // Do not lerp here, just set the target for the useFrame loop
        }
    }
  }, [token.x, token.y, token.z]);

  useFrame((state, delta) => {
    if (isActiveTurn && pulseRef.current) {
        pulseRef.current.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 5) * 0.3;
        pulseRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.05);
    }

    // --- Main animation loop ---
    if (meshRef.current && visualsRef.current && rotationRef.current && getTerrainHeight) {

      // If another user is dragging, smoothly move the token
      if (!isLeftDragging.current) {
          if (rulerRef.current) rulerRef.current.visible = false;
          if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
          if (rulerTextRef.current) rulerTextRef.current.style.display = 'none';

          visualsRef.current.position.x = 0;
          visualsRef.current.position.z = 0;

          let targetPosition = new THREE.Vector3(token.x || 0, token.y || 0.025, token.z || 0);

          if (isSelected && groupDragData?.current?.activeTokenId && groupDragData.current.activeTokenId !== token.id) {
              targetPosition.add(groupDragData.current.delta);
              const terrainY = getTerrainHeight ? getTerrainHeight(targetPosition.x, targetPosition.z) : 0;
              targetPosition.y = terrainY + (token.elevationOffset || 0) + 0.025;
          }

          const p = meshRef.current.position;
          if (isRightDragging.current) targetPosition.y = p.y;
          p.lerp(targetPosition, 0.3); // Follow smoothly but tightly

          // Update rotation smoothly as well
          const targetRotY = token.rotationY || 0;
          const diff = targetRotY - rotationRef.current.rotation.y;
          rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.15;
          return; // Skip the rest of the logic if we're just observing
      }
      
      // If the current user is dragging
      const worldPos = new THREE.Vector3();
      meshRef.current.getWorldPosition(worldPos);
      
      let displayX = worldPos.x;
      let displayZ = worldPos.z;

      if (isSnapToGrid) {
          const tokenSize = token.size || 1;
          const isEvenSize = Math.round(tokenSize) % 2 === 0;
          displayX = isEvenSize ? Math.round(worldPos.x / gridSize) * gridSize : Math.floor(worldPos.x / gridSize) * gridSize + gridSize / 2;
          displayZ = isEvenSize ? Math.round(worldPos.z / gridSize) * gridSize : Math.floor(worldPos.z / gridSize) * gridSize + gridSize / 2;
      }

      visualsRef.current.position.x = displayX - worldPos.x;
      visualsRef.current.position.z = displayZ - worldPos.z;

      if (groupDragData?.current?.activeTokenId === token.id) {
          groupDragData.current.delta.subVectors(new THREE.Vector3(displayX, 0, displayZ), dragStartPos.current);
      }

      const terrainY = getTerrainHeight(displayX, displayZ);
      const targetY = terrainY + (token.elevationOffset || 0) + 0.025;
      
      meshRef.current.position.y = targetY; // Stick to terrain locally
      
      // --- Ruler and Velocity Logic (for local drag only) ---
      const start = dragStartPos.current;
      const end = new THREE.Vector3(displayX, targetY, displayZ);
      const distSq = end.clone().sub(start).lengthSq();
      
      if (distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          if (rulerRef.current) {
              rulerRef.current.scale.y = dist;
              rulerRef.current.position.copy(start).lerp(end, 0.5);
              rulerRef.current.position.y = Math.max(start.y, end.y) + 0.1;
              const dir = end.clone().sub(start).normalize();
              rulerRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
              rulerRef.current.visible = true;
          }
          if (rulerLabelRef.current) {
              rulerLabelRef.current.position.copy(start).lerp(end, 0.5);
              rulerLabelRef.current.position.y = Math.max(start.y, end.y) + 0.4;
              rulerLabelRef.current.visible = true;
              if (rulerTextRef.current) {
                  rulerTextRef.current.innerText = `${Math.round((dist / gridSize) * 5)} ft`;
              rulerTextRef.current.style.display = 'block';
              }
          }

          const frameDelta = worldPos.clone().sub(previousPos.current);
          frameDelta.y = 0;
          velocity.current.add(frameDelta);
          velocity.current.multiplyScalar(0.8);
          
          if (velocity.current.lengthSq() > 0.0001) {
              targetRotationY.current = Math.atan2(velocity.current.x, velocity.current.z);
          }
      } else {
          if (rulerRef.current) rulerRef.current.visible = false;
          if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
      }

      previousPos.current.copy(worldPos);
      
      // --- Rotation Lerping (for local drag only) ---
      const diff = targetRotationY.current - rotationRef.current.rotation.y;
      rotationRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.3;
    }
  });
  // END CHANGE

  useEffect(() => {
    targetRotationY.current = token.rotationY || 0;
  }, [token.rotationY]);

  const handlePointerDown = (e) => {
    if (!isTerrainReady || e.button === 2) {
      e.stopPropagation();
      // Stop the native event so the MarqueeSelector doesn't accidentally trigger
      // when you are right-clicking a token to change its elevation.
      if (e.nativeEvent) e.nativeEvent.stopPropagation();
      if (!canControl) return; // Prevent elevation change if not controllable
      e.target.setPointerCapture(e.pointerId);
      isRightDragging.current = true;
      hasDragged.current = false;
      dragStartY.current = meshRef.current.position.y;
      startMouseY.current = e.clientY;
      if (controls) controls.enabled = false;
    }
  };

  const handlePointerMove = (e) => {
    if (isRightDragging.current) {
      e.stopPropagation();
      if (Math.abs(e.clientY - startMouseY.current) > 5) {
        hasDragged.current = true;
      }
      const deltaY = -(e.clientY - startMouseY.current) * 0.05;
      meshRef.current.position.y = Math.max(0.025, dragStartY.current + deltaY);
    }
  };

  const handlePointerUp = (e) => {
    if (isRightDragging.current) {
      e.stopPropagation();
      e.target.releasePointerCapture(e.pointerId);
      isRightDragging.current = false;
      if (controls) controls.enabled = true;
      
      if (hasDragged.current && meshRef.current) {
          const p = meshRef.current.position;
          const tokenSize = token.size || 1;
          const isEvenSize = Math.round(tokenSize) % 2 === 0;
          const x = isSnapToGrid ? (isEvenSize ? Math.round(p.x / gridSize) * gridSize : Math.floor(p.x / gridSize) * gridSize + gridSize / 2) : p.x;
          const z = isSnapToGrid ? (isEvenSize ? Math.round(p.z / gridSize) * gridSize : Math.floor(p.z / gridSize) * gridSize + gridSize / 2) : p.z;
          const terrainY = getTerrainHeight ? getTerrainHeight(x, z) : 0;
          const offset = p.y - terrainY - 0.025;
          const isFlying = Math.abs(offset) > 0.1;
          
          setSaveStatus('saving');
          const updates = { 
              x, 
              y: p.y, 
              z,
              elevationOffset: isFlying ? offset : 0
          };
          console.log("[Token3D] Right-drag ended, requesting position update:", updates);
          updateTokenPosition(token.id, updates).then(() => {
              console.log("[Token3D] Right-drag position update successful!");
              setSaveStatus('saved');
              setTimeout(() => setSaveStatus(null), 2000);
          }).catch(err => {
              console.error("[Token3D] Right-drag position update failed:", err);
              setSaveStatus(null);
          });
      }
    }
  };

  useEffect(() => {
    const imgUrl = token.image || token.img;
    if (!imgUrl) {
        setResolvedImage(null);
        return;
    }
    if (imgUrl.startsWith('chunked:')) {
      let isActive = true;
      let objectUrl = null;
      retrieveChunkedMap(imgUrl).then(blob => {
        if (isActive && blob) {
          objectUrl = URL.createObjectURL(blob);
          setResolvedImage(objectUrl);
        }
      }).catch(console.error);
      return () => { isActive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    } else {
      setResolvedImage(imgUrl);
    }
  }, [token.image, token.img]);

  const nameplatePos = useMemo(() => {
      return viewMode === 'top-down' 
          ? [0, 0, safeSize * 0.75] 
          : [0, 0.2, safeSize * 0.85]; // Hover slightly off the ground, shifted South (towards camera)
  }, [safeSize, viewMode]);

  const initials = useMemo(() => {
      const name = token.name || "Unknown";
      const parts = name.split(/[\s-]+/).filter(p => p.length > 0);
      if (parts.length >= 2) {
          return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
  }, [token.name]);

  const tokenContent = (
    <group 
      ref={meshRef} 
      position={[token.x || 0, token.y || 0.025, token.z || 0]}
      scale={[scale, scale, scale]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerOver={(e) => { e.stopPropagation(); if (isTerrainReady) setHover(true); }}
      onPointerOut={(e) => { if (isTerrainReady) setHover(false); }}
      onClick={(e) => { e.stopPropagation(); if (isTerrainReady) onSelect(token.id, e.shiftKey); }}
      onContextMenu={(e) => {
        e.stopPropagation();
        if (e.nativeEvent) e.nativeEvent.preventDefault();
        if (canControl && !hasDragged.current) {
            if (onContextMenu) onContextMenu(e, token);
        }
      }}
    >
      <group ref={visualsRef}>
        <group ref={rotationRef}>
          {showModel && (
            <Suspense fallback={null}>
              <group position={[0, (token.modelYOffset || 0) * safeSize, 0]}>
                <CharacterModel modelUrl={token.modelUrl} scale={(token.modelScale || 1) * safeSize} />
              </group>
            </Suspense>
          )}

          {!showModel && (
              <>
                {resolvedImage ? (
                    <Suspense fallback={null}>
                        <TokenImage imageUrl={resolvedImage} size={safeSize} />
                    </Suspense>
                ) : (
                  <mesh position={[0, 0.051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <circleGeometry args={[safeSize * 0.45, 32]} />
                      <meshStandardMaterial color="#1e293b" />
                      <Text
                          position={[0, 0, 0.01]}
                          fontSize={safeSize * 0.35}
                          color={baseColor}
                          anchorX="center"
                          anchorY="middle"
                          fontWeight="bold"
                      >
                          {initials}
                      </Text>
                  </mesh>
                )}
              </>
          )}

          {/* Stone Pedestal Base */}
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[safeSize * 0.48, safeSize * 0.5, 0.04, 32]} />
            <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.1} transparent={true} opacity={opacity} />
          </mesh>
          
          {/* Inner colored accent ring */}
          <mesh position={[0, 0.045, 0]}>
            <cylinderGeometry args={[safeSize * 0.46, safeSize * 0.46, 0.01, 32]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />
          </mesh>

          <mesh position={[0, 0.05, safeSize * 0.45]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[safeSize * 0.15, safeSize * 0.2, 3]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.2} emissive={baseColor} emissiveIntensity={hovered ? 0.5 : 0.1} transparent={true} opacity={opacity} />
          </mesh>

          {isSelected && (
            <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[safeSize * 0.55, safeSize * 0.6, 32]} />
              <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
            </mesh>
          )}
        </group>

        {showNameplates && (
          <Billboard position={nameplatePos}>
            <group>
                {/* Stone Plaque Background */}
                <RoundedBox args={[safeSize * 1.4, safeSize * 0.28, 0.02]} radius={safeSize * 0.05} smoothness={4} position={[0, 0, -0.01]}>
                    <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.3} transparent opacity={opacity * 0.9} depthTest={true} />
                </RoundedBox>
                
                {/* Metal Inner Border */}
                <RoundedBox args={[safeSize * 1.35, safeSize * 0.23, 0.02]} radius={safeSize * 0.04} smoothness={4} position={[0, 0, -0.005]}>
                    <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.8} transparent opacity={opacity * 0.9} depthTest={true} />
                </RoundedBox>

                {/* NAME */}
                <Text
                    position={[0, 0, 0.01]}
                    fontSize={safeSize * 0.14}
                    color="#e2e8f0"
                    anchorX="center"
                    anchorY="middle"
                    fontWeight="bold"
                    fillOpacity={opacity}
                    depthTest={true}
                    maxWidth={safeSize * 1.3}
                >
                    {token.name || "Unknown"}
                </Text>

                {/* ELEVATION */}
                {Math.abs(token.elevationOffset || 0) > 0.1 && (
                    <Text
                        position={[0, safeSize * 0.25, 0]}
                        fontSize={safeSize * 0.12}
                        color="#93c5fd"
                        outlineWidth={safeSize * 0.02}
                        outlineColor="#1e3a8a"
                        anchorX="center"
                        anchorY="middle"
                        fontWeight="bold"
                        fillOpacity={opacity}
                        outlineOpacity={opacity}
                        depthTest={true}
                    >
                        {token.elevationOffset > 0 ? '↑ ' : '↓ '}{Math.round((token.elevationOffset || 0) * 5)}ft
                    </Text>
                )}
                
                {/* SAVE STATUS */}
                {saveStatus && (
                    <Text
                        position={[0, -safeSize * 0.25, 0]}
                        fontSize={safeSize * 0.1}
                        color="#fbbf24"
                        outlineWidth={safeSize * 0.015}
                        outlineColor="#78350f"
                        anchorX="center"
                        anchorY="middle"
                        fontWeight="bold"
                        fillOpacity={opacity}
                        outlineOpacity={opacity}
                        depthTest={true}
                    >
                        {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                    </Text>
                )}
            </group>
        </Billboard>
      )}
    </group>
    </group>
  );

  return (
    <group>
      <mesh ref={rulerRef} visible={false} raycast={() => null}>
        <cylinderGeometry args={[0.08, 0.08, 1, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} depthTest={false} />
      </mesh>
      
      <group ref={rulerLabelRef} visible={false}>
        <Html center className="pointer-events-none select-none z-50" distanceFactor={8}>
          <div 
            ref={rulerTextRef} 
            className="bg-amber-600/90 text-white border border-amber-400 text-[10px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap"
            style={{ display: 'none' }}
          >
            0 ft
          </div>
        </Html>
      </group>

      {canControl ? (
        <DragControls
          ref={dragControlsRef}
          axisLock="y"
          enabled={isTerrainReady && (draggedTokenId === null || draggedTokenId === token.id)}
          onDragStart={() => {
            if (controls) controls.enabled = false;
            isLeftDragging.current = true;
            
            const worldPos = new THREE.Vector3();
            if (meshRef.current) meshRef.current.getWorldPosition(worldPos);
            
            dragStartPos.current.copy(worldPos);
            previousPos.current.copy(worldPos);
            velocity.current.set(0, 0, 0);
            setDraggedTokenId(token.id);

            if (selectedTokenIds && selectedTokenIds.includes(token.id) && selectedTokenIds.length > 1) {
                if (groupDragData) {
                    groupDragData.current.activeTokenId = token.id;
                    groupDragData.current.delta.set(0, 0, 0);
                }
            } else {
                if (groupDragData) groupDragData.current.activeTokenId = null;
            }
          }}
          onDragEnd={() => {
            console.log("[Token3D] onDragEnd triggered for", token.id);
            if (controls) controls.enabled = true;
            isLeftDragging.current = false;
            
            if (rulerRef.current) rulerRef.current.visible = false;
            if (rulerLabelRef.current) rulerLabelRef.current.visible = false;
            if (rulerTextRef.current) rulerTextRef.current.style.display = 'none';
            
            if (meshRef.current && dragControlsRef.current) {
              const worldPos = new THREE.Vector3();
              meshRef.current.getWorldPosition(worldPos);
              
              dragControlsRef.current.position.set(0, 0, 0);
              dragControlsRef.current.matrix.identity();
              dragControlsRef.current.updateMatrixWorld();
              
              const tokenSize = token.size || 1;
              const isEvenSize = Math.round(tokenSize) % 2 === 0;
              const snapX = isSnapToGrid ? (isEvenSize ? Math.round(worldPos.x / gridSize) * gridSize : Math.floor(worldPos.x / gridSize) * gridSize + gridSize / 2) : worldPos.x;
              const snapZ = isSnapToGrid ? (isEvenSize ? Math.round(worldPos.z / gridSize) * gridSize : Math.floor(worldPos.z / gridSize) * gridSize + gridSize / 2) : worldPos.z;
              
              if (groupDragData?.current?.activeTokenId === token.id) {
                  const snappedDelta = new THREE.Vector3(snapX - dragStartPos.current.x, 0, snapZ - dragStartPos.current.z);
                  if (onGroupDragEnd) onGroupDragEnd(token.id, snappedDelta);
                  groupDragData.current.activeTokenId = null;
                  groupDragData.current.delta.set(0, 0, 0);
              }

              const terrainY = getTerrainHeight ? getTerrainHeight(snapX, snapZ) : 0;
              const targetY = terrainY + (token.elevationOffset || 0) + 0.025;
              
              meshRef.current.position.set(snapX, targetY, snapZ);
              
              setSaveStatus('saving');
              const updates = { 
                x: snapX, 
                y: targetY, 
                z: snapZ,
                elevationOffset: token.elevationOffset || 0,
                rotationY: targetRotationY.current
              };
              console.log("[Token3D] Requesting position update with:", updates);
              updateTokenPosition(token.id, updates).then(() => {
                  console.log("[Token3D] Position update successful!");
                  setSaveStatus('saved');
                  setTimeout(() => setSaveStatus(null), 2000);
              }).catch(err => {
                  console.error("[Token3D] Position update failed:", err);
                  setSaveStatus(null);
              });
            }
            setDraggedTokenId(null);
          }}
        >
          {tokenContent}
        </DragControls>
      ) : (
        tokenContent
      )}
    </group>
  );
};

const DropZone = ({ onMapDrop }) => {
    const { camera, gl } = useThree();
    const onMapDropRef = useRef(onMapDrop);

    useEffect(() => {
        onMapDropRef.current = onMapDrop;
    }, [onMapDrop]);

    useEffect(() => {
        const handleDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = gl.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            const intersect = raycaster.ray.intersectPlane(plane, target);

            if (onMapDropRef.current) {
                onMapDropRef.current(e, intersect || new THREE.Vector3(0, 0, 0));
            }
        };
        const handleDragOver = (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy'; 
        };

        const container = gl.domElement.parentElement;
        if (container) {
            container.addEventListener('drop', handleDrop);
            container.addEventListener('dragover', handleDragOver);
            return () => { container.removeEventListener('drop', handleDrop); container.removeEventListener('dragover', handleDragOver); };
        }
    }, [camera, gl]);

    return null;
};

const DisplacedGrid = ({ mapData, aspect, resolvedHeightmapUrl }) => {
    const { scale = 20, gridSize = 1, heightScale = 1 } = mapData;
    const width = scale * aspect;
    const height = scale;

    const isLowPerf = localStorage.getItem('vtt_low_performance') === 'true';
    const subdivisions = isLowPerf ? 128 : 256;

    const heightmapTexture = useMemo(() => {
        if (!resolvedHeightmapUrl) return null;
        return new THREE.TextureLoader().load(resolvedHeightmapUrl);
    }, [resolvedHeightmapUrl]);

    const gridTexture = useMemo(() => {
        if (!gridSize || gridSize <= 0) return null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 256; // Higher resolution for crispness
        canvas.width = size;
        canvas.height = size;
        
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Lighter overlay to contrast map features
        ctx.lineWidth = 4;
        
        // Draw lines at the edge to form a grid when tiled
        ctx.beginPath();
        ctx.moveTo(0, size);
        ctx.lineTo(size, size);
        ctx.lineTo(size, 0);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        const repeatX = width / gridSize;
        const repeatY = height / gridSize;
        texture.repeat.set(repeatX, repeatY);
        
        // Ensure that world origin (0,0) is always exactly on a grid intersection
        texture.offset.set(-(width / 2) / gridSize, -(height / 2) / gridSize);

        return texture;
    }, [width, height, gridSize]);

    return (
        // Placed at y=0.016 to render slightly above the Fog of War (y=0.015)
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]} renderOrder={101}>
            <planeGeometry args={[width, height, subdivisions, subdivisions]} />
            <meshStandardMaterial
                map={gridTexture}
                displacementMap={heightmapTexture}
                displacementScale={heightScale}
                transparent={true}
                roughness={1}
                metalness={0}
                depthWrite={false}
            />
        </mesh>
    );
};

export default function TacticalMapView({ campaignCode, activeMapId, onOpenSheet, role, onOpenHandouts, onOpenChat, onOpenJournal }) {
  const { campaign, updateCampaign, updateToken, addToken, deleteToken, user } = useNewCampaign();
  const data = campaign;
  const cameraControllerRef = useRef();
  const zoomRef = useRef();
  const [mapData, setMapData] = useState(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showTokenManager, setShowTokenManager] = useState(false);
  const [isDrawingWalls, setIsDrawingWalls] = useState(false);
  const [isArchitectMode, setIsArchitectMode] = useState(false);
  const [isPlacingLights, setIsPlacingLights] = useState(false);
  const [wallContextMenu, setWallContextMenu] = useState(null);
  const [lightContextMenu, setLightContextMenu] = useState(null);
  const [isSnapToGrid, setIsSnapToGrid] = useState(true);
  const [viewMode, setViewMode] = useState('isometric');
  const [draggedTokenId, setDraggedTokenId] = useState(null);
  const [remountKey, setRemountKey] = useState(0);
  const [assetTab, setAssetTab] = useState('library');

  // Added States for List View and 5e API
  const [actorViewMode, setActorViewMode] = useState('grid');
  const [showCompendium, setShowCompendium] = useState(false);
  const [compendiumSearch, setCompendiumSearch] = useState("");
  const [compendiumResults, setCompendiumResults] = useState([]);
  const [isLoadingCompendium, setIsLoadingCompendium] = useState(false);

  const [pendingNpc, setPendingNpc] = useState(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [miniSearchQuery, setMiniSearchQuery] = useState("");
  const [isSearchingMinis, setIsSearchingMinis] = useState(false);

  const handleMiniSearch = async (overrideQuery, typeFallback) => {
      const q = overrideQuery !== undefined ? overrideQuery : miniSearchQuery;
      if (!q) return;
      setIsSearchingMinis(true);
      let results = await searchGithubModels(q);
      if (results.length === 0 && typeFallback) results = await searchGithubModels(typeFallback);
      setAvailableModels(results);
      setIsSearchingMinis(false);
  };

  // --- FIX: Listen directly to the tokens_v2 subcollection ---
  const [liveTokens, setLiveTokens] = useState({});
  useEffect(() => {
      if (!campaignCode) return;
      const tokensRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'tokens_v2');
      const unsub = onSnapshot(tokensRef, (snap) => {
          const t = {};
          snap.docs.forEach(doc => { t[doc.id] = doc.data(); });
          setLiveTokens(t);
      });
      return () => unsub();
  }, [campaignCode]);

  // Helper to open manager to a specific tab
  const openAssets = (tab) => {
    setAssetTab(tab);
    setShowAssetManager(true);
    setShowTokenManager(false);
    setIsDrawingWalls(false);
  };

  // Setup CPU-side Terrain Matrix logic
  const [aspect, setAspect] = useState(1);
  const [isAspectReady, setIsAspectReady] = useState(false);
  const [terrainData, setTerrainData] = useState(null);

  const resolvedBackgroundUrl = useResolvedUrl(mapData?.backgroundUrl);
  const resolvedHeightmapUrl = useResolvedUrl(mapData?.heightmapUrl);

  useEffect(() => {
    if (!resolvedBackgroundUrl) {
        setIsAspectReady(!mapData?.backgroundUrl); // If no background, aspect is ready (defaults to 1)
        return;
    }
    setIsAspectReady(false);
    const img = new Image();
    img.onload = () => {
        setAspect(img.width / img.height || 1);
        setIsAspectReady(true);
    }
    img.src = resolvedBackgroundUrl;
  }, [resolvedBackgroundUrl, mapData?.backgroundUrl]);

  useEffect(() => {
    if (!resolvedHeightmapUrl) {
      setTerrainData(null);
      return;
    }
    let isActive = true;
    const img = new Image();
    if (!resolvedHeightmapUrl.startsWith('blob:') && !resolvedHeightmapUrl.startsWith('data:')) {
        img.crossOrigin = "Anonymous";
    }
    img.onload = () => {
      if (!isActive) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        setTerrainData({
          data: imageData.data,
          width: img.width,
          height: img.height
        });
      } catch (err) {
        console.warn("Failed to read heightmap data (CORS?)", err);
      }
    };
    img.src = resolvedHeightmapUrl;
    return () => { isActive = false; };
  }, [resolvedHeightmapUrl]);

  const getTerrainHeight = useCallback((x, z) => {
    if (!terrainData || !mapData || !mapData.heightmapUrl) {
      return 0;
    }
    const scale = mapData.scale || 20;
    const heightScale = mapData.heightScale || 1;
    
    const u = (x / (scale * aspect)) + 0.5;
    const v = (z / scale) + 0.5;

    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return 0;
    }

    const pixelX = Math.floor(u * terrainData.width);
    const pixelY = Math.floor(v * terrainData.height);
    
    const safeX = Math.max(0, Math.min(pixelX, terrainData.width - 1));
    const safeY = Math.max(0, Math.min(pixelY, terrainData.height - 1));

    const index = (safeY * terrainData.width + safeX) * 4;
    const r = terrainData.data[index]; // Red channel for height

    const calculatedHeight = (r / 255.0) * heightScale;
    return calculatedHeight;
  }, [terrainData, mapData, aspect]);

  // Subscribe to real-time map updates from Firebase
  useEffect(() => {
    if (!campaignCode || !activeMapId) return;
    const unsubscribe = subscribeToMap(campaignCode, activeMapId, (data) => {
      setMapData(data);
    });
    return () => unsubscribe();
  }, [campaignCode, activeMapId]);

  const gridSize = mapData?.gridSize || 1;
  const showPlane = mapData?.backgroundUrl && mapData.backgroundUrl.trim() !== '';
  const legacyTokens = data?.campaign?.activeMap?.tokens || {};
  const showNameplates = mapData?.showNameplates !== false;
  
  // Safely merge legacy map tokens with the realtime token updates so they aren't overwritten
  const mergedTokens = useMemo(() => {
      const result = {};
      
      // 1. Ensure legacy tokens are mapped by their actual ID, not an array index
      const legacyArray = Array.isArray(legacyTokens) ? legacyTokens : Object.values(legacyTokens || {});
      legacyArray.forEach(t => {
          if (t && t.id) result[t.id] = { ...t };
      });
      // 2. Merge realtime Firestore tokens over them
      for (const tId in liveTokens) {
          const liveT = liveTokens[tId];
          if (liveT && liveT.id) {
              if (result[liveT.id]) result[liveT.id] = { ...result[liveT.id], ...liveT };
              else result[liveT.id] = liveT;
          }
      }
      return result;
  }, [legacyTokens, liveTokens]);
  
  const latestTokensRef = useRef({});
  useEffect(() => {
      latestTokensRef.current = mergedTokens;
  }, [mergedTokens]);

  const groupDragData = useRef({ activeTokenId: null, delta: new THREE.Vector3() });

  const handleGroupDragEnd = useCallback((leaderId, delta) => {
      selectedTokenIds.forEach(id => {
          if (id === leaderId) return;
          const t = latestTokensRef.current[id];
          if (!t) return;

          if (role !== 'dm') {
              const character = allCharacters.find(c => String(c.id) === String(t.characterId));
              const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || 
                              (t.ownerId && String(t.ownerId) === String(user?.uid));
              const myCharId = data?.assignments?.[user?.uid];
              const myCharAssigned = myCharId && String(t.characterId) === String(myCharId);
              const canControl = isOwner || myCharAssigned || t.isSharedControl;
              if (!canControl) return;
          }

          const newX = (t.x || 0) + delta.x;
          const newZ = (t.z || 0) + delta.z;

          const tokenSize = t.size || 1;
          const isEvenSize = Math.round(tokenSize) % 2 === 0;
          const finalX = isSnapToGrid ? (isEvenSize ? Math.round(newX / gridSize) * gridSize : Math.floor(newX / gridSize) * gridSize + gridSize / 2) : newX;
          const finalZ = isSnapToGrid ? (isEvenSize ? Math.round(newZ / gridSize) * gridSize : Math.floor(newZ / gridSize) * gridSize + gridSize / 2) : newZ;

          const terrainY = getTerrainHeight ? getTerrainHeight(finalX, finalZ) : 0;
          const finalY = terrainY + (t.elevationOffset || 0) + 0.025;

          updateToken(id, { x: finalX, y: finalY, z: finalZ, elevationOffset: t.elevationOffset || 0 });
      });
  }, [selectedTokenIds, isSnapToGrid, gridSize, getTerrainHeight, updateToken]);

  const tokensList = Object.values(mergedTokens);
  const allCharacters = [...(data?.players || []), ...(data?.npcs || [])];

  // Calculate Player Vision Sources (Used by both Fog Renderer and CPU Visibility checks)
  const playerVisionSources = useMemo(() => {
      if (!tokensList || !allCharacters) return [];

      let relevantTokens;
      if (role === 'dm') {
          const playerCharIds = new Set((data?.players || []).map(p => String(p.id)));
          relevantTokens = tokensList.filter(t => t.characterId && playerCharIds.has(String(t.characterId)));
      } else {
          const myCharId = data?.assignments?.[user?.uid];
          relevantTokens = tokensList.filter(t => {
              if (!t.characterId) return false;
              if (t.isSharedControl) return true;
              if (myCharId && String(t.characterId) === String(myCharId)) return true;
              const char = allCharacters.find(c => String(c.id) === String(t.characterId));
              return char && String(char.ownerId) === String(user?.uid);
          });
      }
      
      return relevantTokens.map(t => {
          const character = allCharacters.find(c => String(c.id) === String(t.characterId));
          if (!character) return null;
          if (mapData?.fowEnabled === false) return { id: t.id, x: t.x || 0, z: t.z || 0, range: 9999 };
          
          let visionRange = 5; 
          let parsedDv = 0;

          if (typeof character?.senses === 'object' && character.senses !== null && !Array.isArray(character.senses)) {
              const dv = character.senses.darkvision || character.senses.Darkvision;
              if (dv) {
                  const match = String(dv).match(/(\d+)/);
                  if (match) parsedDv = parseInt(match[1], 10);
              }
          }
          if (character?.darkvision) {
              const match = String(character.darkvision).match(/(\d+)/);
              if (match) parsedDv = Math.max(parsedDv, parseInt(match[1], 10));
          }

          if (parsedDv === 0 && character?.senses) {
              let sensesStr = "";
              if (typeof character.senses === 'string') {
                  sensesStr = character.senses;
              } else if (Array.isArray(character.senses)) {
                  sensesStr = character.senses.map(s => typeof s === 'object' ? JSON.stringify(s) : String(s)).join(" ");
              } else if (typeof character.senses === 'object') {
                  sensesStr = Object.values(character.senses).map(String).join(" ");
              }
              
              if (sensesStr.toLowerCase().includes('darkvision')) {
                  const match = sensesStr.match(/darkvision[^0-9a-z]*(\d+)/i) || sensesStr.match(/(\d+)[^0-9a-z]*darkvision/i);
                  if (match) parsedDv = parseInt(match[1], 10);
                  else parsedDv = 60;
              }
          }

          if (parsedDv === 0 && Array.isArray(character?.features)) {
              const dvFeature = character.features.find(f => f.name?.toLowerCase().includes('darkvision'));
              if (dvFeature) {
                  const desc = typeof dvFeature === 'object' ? (dvFeature.desc || JSON.stringify(dvFeature)) : String(dvFeature);
                  const matches = desc.match(/\b(30|60|90|120|150)\b/);
                  if (matches) {
                      parsedDv = parseInt(matches[1], 10);
                  } else {
                      const match = desc.match(/(\d+)/);
                      if (match) parsedDv = parseInt(match[1], 10);
                      else parsedDv = 60;
                  }
              }
          }

          if (parsedDv > visionRange) {
              visionRange = parsedDv;
          }

          return { id: t.id, x: t.x || 0, z: t.z || 0, range: (visionRange / 5) * gridSize };
      }).filter(Boolean);
  }, [tokensList, role, user?.uid, data?.assignments, allCharacters, gridSize, data?.players, mapData?.fowEnabled]);

  // CPU-based Line of Sight / Token Visibility Filter
  const visibleTokenIds = useMemo(() => {
      if (role === 'dm') return new Set(tokensList.map(t => t.id)); // DM sees everything
      const visibleIds = new Set();

      tokensList.forEach(t => {
          if (t.isHidden) return; // Hidden tokens are completely excluded
          
          const character = allCharacters.find(c => String(c.id) === String(t.characterId));
          const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || (t.ownerId && String(t.ownerId) === String(user?.uid));
          const myCharAssigned = data?.assignments?.[user?.uid] && String(t.characterId) === String(data.assignments[user.uid]);
          
          // You can always see yourself and tokens you share control over
          if (isOwner || myCharAssigned || t.isSharedControl) {
              visibleIds.add(t.id);
              return;
          }

          const targetPt = { x: t.x || 0, z: t.z || 0 };

          // Check visibility from each of the player's vision sources
          for (const src of playerVisionSources) {
              // Condition 1: Is the target within darkvision range AND there is line of sight?
              const dist = Math.sqrt(Math.pow(src.x - targetPt.x, 2) + Math.pow(src.z - targetPt.z, 2));
              if (dist <= src.range && checkLineOfSight(src, targetPt, mapData?.walls)) {
                  visibleIds.add(t.id);
                  return; // Visible, no need to check further for this token
              }

              // Condition 2: Is the target illuminated by a light source AND does the player have line of sight to it?
              if (mapData?.lights && mapData?.fowEnabled !== false) {
                  // First, check if the player has LOS to the target token. If not, no light can make it visible to them.
                  if (checkLineOfSight(src, targetPt, mapData?.walls)) {
                      // Now, check if any light source illuminates the target token.
                      for (const light of Object.values(mapData.lights)) {
                          const lightRange = (light.radius || 15) / 5 * gridSize;
                          const lightPt = { x: light.position.x, z: light.position.z };
                          const distToLight = Math.sqrt(Math.pow(lightPt.x - targetPt.x, 2) + Math.pow(lightPt.z - targetPt.z, 2));
                          
                          // A token is illuminated if it's within a light's range AND the light has LOS to it.
                          if (distToLight <= lightRange && checkLineOfSight(lightPt, targetPt, mapData?.walls)) {
                              visibleIds.add(t.id);
                              return; // Visible, no need to check further for this token
                          }
                      }
                  }
              }
          }
      });
      return visibleIds;
  }, [tokensList, role, playerVisionSources, mapData?.walls, mapData?.lights, mapData?.fowEnabled, allCharacters, user?.uid, data?.assignments, gridSize]);

  // Extract active combatant early so the Camera Director can hook into it
  const activeCombatantId = mapData && data?.campaign?.combat?.active && data?.campaign?.combat?.combatants?.length 
      ? data.campaign.combat.combatants[(data.campaign.combat.turn || 0) % data.campaign.combat.combatants.length].tokenId 
      : null;

  // Handle clicking a token to both select it and open the side sheet
  const handleSelectToken = (tokenId, isMulti) => {
    if (isMulti) {
        setSelectedTokenIds(prev => prev.includes(tokenId) ? prev.filter(id => id !== tokenId) : [...prev, tokenId]);
    } else {
        setSelectedTokenIds([tokenId]);
    }
    setContextMenu(null);
  };

  // Group Initiative Roller
  const rollGroupInitiative = (tokenIds) => {
      const currentCombat = data?.campaign?.combat || { active: false, round: 1, turn: 0, combatants: [] };
      const currentCombatants = currentCombat.combatants || [];
      
      const newEntries = tokenIds.map(tId => {
          const token = tokensList.find(t => t.id === tId);
          const char = allCharacters.find(c => String(c.id) === String(token?.characterId));
          const dex = char?.stats?.dex || 10;
          const mod = Math.floor((dex - 10) / 2);
          const roll = Math.floor(Math.random() * 20) + 1;
          const isNpc = !data?.players?.some(p => String(p.id) === String(token?.characterId));
          return { 
              tokenId: tId, 
              initiative: roll + mod,
              name: token?.name || char?.name || 'Unknown',
              isNpc: isNpc
          };
      });

      const merged = [...currentCombatants];
      newEntries.forEach(ne => {
          const existingIdx = merged.findIndex(m => m.tokenId === ne.tokenId);
          if (existingIdx >= 0) merged[existingIdx] = ne;
          else merged.push(ne);
      });
      merged.sort((a,b) => b.initiative - a.initiative);

      updateCampaign({ campaign: { ...(data?.campaign || {}), combat: { ...currentCombat, active: true, combatants: merged } } });
  };

  // Handler to add a single character directly from the Actors Tab into combat
  const handleAddActorToCombat = (actor, isNpc) => {
      const currentCombat = data?.campaign?.combat || { active: false, round: 1, turn: 0, combatants: [] };
      const combatants = currentCombat.combatants || [];
      
      const dex = actor?.stats?.dex || 10;
      const mod = Math.floor((dex - 10) / 2);
      const roll = Math.floor(Math.random() * 20) + 1;
      
      const newCombatant = {
          tokenId: `tracker_${actor.id}_${Date.now()}`,
          characterId: actor.id,
          initiative: roll + mod,
          name: actor.name || 'Unknown',
          isNpc: isNpc
      };
      
      const newCombatants = [...combatants, newCombatant].sort((a,b) => b.initiative - a.initiative);
      updateCampaign({ campaign: { ...(data?.campaign || {}), combat: { ...currentCombat, active: true, combatants: newCombatants } } });
  };

  const searchCompendium = async () => {
      if (!compendiumSearch.trim()) return;
      setIsLoadingCompendium(true);
      try {
          const res = await fetch('https://www.dnd5eapi.co/api/monsters?name=' + compendiumSearch);
          const apiData = await res.json();
          if (apiData.count === 0) {
              alert("No monsters found in the SRD with that name.");
              setCompendiumResults([]);
          } else {
              setCompendiumResults(apiData.results.slice(0, 20));
          }
      } catch (e) {
          console.error(e);
          alert("Could not connect to D&D 5e API.");
      }
      setIsLoadingCompendium(false);
  };

  const importFromApi = async (monsterIndexUrl) => {
      setIsLoadingCompendium(true);
      try {
          const res = await fetch(`https://www.dnd5eapi.co${monsterIndexUrl}`);
          const m = await res.json();
          let imageUrl = "";
          if (m.image) {
              imageUrl = `https://www.dnd5eapi.co${m.image}`;
          } else if (window.puter) {
              try {
                  const imgEl = await window.puter.ai.txt2img(`fantasy rpg token portrait of a ${m.name} ${m.type}, white background, high quality`);
                  const response = await fetch(imgEl.src);
                  const blob = await response.blob();
                  imageUrl = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result);
                      reader.readAsDataURL(blob);
                  });
              } catch (e) { console.error("Image gen failed", e); }
          }
          const acVal = Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class;
          const speedStr = typeof m.speed === 'object' ? Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;
          const sensesObj = {
              darkvision: m.senses?.darkvision || "",
              passivePerception: m.senses?.passive_perception || 10,
              blindsight: m.senses?.blindsight || "",
              tremorsense: m.senses?.tremorsense || "",
              truesight: m.senses?.truesight || ""
          };
          const newNpc = {
              id: Date.now(),
              isHidden: true,
              name: m.name,
              race: `${m.size} ${m.type} (${m.alignment})`,
              class: "Monster",
              level: m.challenge_rating,
              hp: { current: m.hit_points, max: m.hit_points },
              ac: acVal,
              speed: speedStr,
              stats: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
              senses: sensesObj,
              image: imageUrl,
              quirk: "SRD Import",
              bio: { backstory: `Imported from D&D 5e API.\nXP: ${m.xp}\nLanguages: ${m.languages}`, appearance: `A ${m.size} ${m.type}.` },
              customActions: (m.actions || []).map(a => {
                  let dmgString = "";
                  if (a.damage && a.damage[0] && a.damage[0].damage_dice) {
                      dmgString = a.damage[0].damage_dice;
                      if(a.damage[0].damage_type?.name) dmgString += ` ${a.damage[0].damage_type.name}`;
                  }
                  return { name: a.name, desc: a.desc, type: "Action", hit: a.attack_bonus ? `+${a.attack_bonus}` : "", dmg: dmgString };
              }),
              features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" })),
              legendaryActions: (m.legendary_actions || []).map(l => ({ name: l.name, desc: l.desc }))
          };
          
          setPendingNpc(newNpc);
          setAvailableModels([]);
          setShowCompendium(false);
          setShowModelPicker(true);
          setMiniSearchQuery(m.name);
          handleMiniSearch(m.name, m.type);
      } catch (e) {
          console.error(e);
          alert("Failed to import monster details.");
      }
      setIsLoadingCompendium(false);
  };

  const handleModelSelect = async (model) => {
      const finalNpc = { ...pendingNpc };
      if (model) {
          finalNpc.modelUrl = model.url;
          finalNpc.modelScale = model.scale;
          finalNpc.modelYOffset = model.yOffset;
      }
      
      updateCampaign({ npcs: [...(data?.npcs || []), finalNpc] });
      
      const dropX = 0;
      const dropZ = 0;
      const terrainY = getTerrainHeight ? getTerrainHeight(dropX, dropZ) : 0;
      
      const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await addToken({
          id: newTokenId,
          characterId: finalNpc.id,
          name: finalNpc.name,
          type: 'npc',
          x: dropX,
          y: terrainY + 0.025,
          z: dropZ,
          image: finalNpc.image || '',
          size: finalNpc.size || 1,
          hp: finalNpc.hp
      });
      
      setPendingNpc(null);
      setShowModelPicker(false);
  };

  const handleContextMenu = (e, token) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tokenId: token.id,
      characterId: token.characterId,
      elevationOffset: token.elevationOffset,
      isHidden: token.isHidden,
      isSharedControl: token.isSharedControl,
      size: token.size || 1
    });
  };

  const handleWallContextMenu = (e, wallId) => {
    e.stopPropagation();
    setContextMenu(null); // Close token context menu
    setWallContextMenu({
      x: e.clientX,
      y: e.clientY,
      wallId: wallId,
    });
  };

  const handleLightContextMenu = (e, lightId) => {
      e.stopPropagation();
      setContextMenu(null);
      setWallContextMenu(null);
      setLightContextMenu({
          x: e.clientX,
          y: e.clientY,
          lightId: lightId
      });
  };

  const handleToggleDoor = (e, wallId) => {
      e.stopPropagation();
      const wall = mapData?.walls?.[wallId];
      if (wall && wall.type === 'door') {
          updateMap(campaignCode, activeMapId, { [`walls.${wallId}.isOpen`]: !wall.isOpen });
      }
  };

  // Handler triggered by Token3D when a drag ends
  const handleUpdateTokenPosition = async (tokenId, position) => {
    console.log("[TacticalMapView] handleUpdateTokenPosition called for", tokenId, "with", position);
    try {
      await updateToken(tokenId, position);
      console.log("[TacticalMapView] Successfully pushed updateToken to Firestore");
    } catch (e) {
      console.error("[TacticalMapView] Failed to updateToken in Firestore:", e);
      throw e;
    }
  };

  // Handle dragging an image from the AssetManager directly onto the map
  const handleDrop = async (e, position) => {
    if (!position) return;

    let payload = null;
    
    try {
       // 1. Try parsing text/plain (Maximum browser compatibility)
       const plainText = e.dataTransfer.getData('text/plain');
       if (plainText) {
          const parsed = JSON.parse(plainText);
          if (parsed.format) payload = parsed;
       }
    } catch(err) {  }

    // 2. Fallback to custom mime types
    if (!payload) {
        const assetDataStr = e.dataTransfer.getData('application/dungeonmind-asset');
        const characterDataStr = e.dataTransfer.getData('application/dungeonmind-character');
        
        if (assetDataStr) {
            try {
                payload = { format: 'dungeonmind-asset', ...JSON.parse(assetDataStr) };
            } catch(err) {  }
        } else if (characterDataStr) {
            try {
                payload = { format: 'dungeonmind-character', ...JSON.parse(characterDataStr) };
            } catch(err) {  }
        }
    }


    if (!payload || !campaignCode || !activeMapId) {
        return;
    }

    // Calculate grid snapping and elevation
    const tokenSize = payload.size || 1;
    const isEvenSize = Math.round(tokenSize) % 2 === 0;
    const dropX = isSnapToGrid ? (isEvenSize ? Math.round(position.x / gridSize) * gridSize : Math.floor(position.x / gridSize) * gridSize + gridSize / 2) : position.x;
    const dropZ = isSnapToGrid ? (isEvenSize ? Math.round(position.z / gridSize) * gridSize : Math.floor(position.z / gridSize) * gridSize + gridSize / 2) : position.z;
    const terrainY = getTerrainHeight ? getTerrainHeight(dropX, dropZ) : 0;

    const newTokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let tokenData;

    if (payload.format === 'dungeonmind-asset' || payload.url) {
        tokenData = {
            id: newTokenId,
            name: 'New Token',
            type: 'npc',
            x: dropX, y: terrainY + 0.025, z: dropZ,
            image: payload.url || payload.image || '',
            size: 1,
            isHidden: false
        };
    } else if (payload.format === 'dungeonmind-character' || payload.characterId || payload.id) {
        tokenData = {
            id: newTokenId,
            characterId: payload.id || null, 
            name: payload.name || 'Unknown',
            type: payload.type || 'npc',
            x: dropX, y: terrainY + 0.025, z: dropZ,
            image: payload.image || '',
            size: payload.size || 1,
        };
        
        if (payload.hp !== undefined) {
            tokenData.hp = payload.hp;
        }
    }

    if (tokenData) {
        await addToken(tokenData);
    }
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore shortcuts if the user is typing in a text field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedTokenIds.length > 0) {
              if (role === 'dm') {
                  selectedTokenIds.forEach(id => deleteToken(id));
                  setSelectedTokenIds([]);
              } else {
                  const tokensToDelete = [];
                  selectedTokenIds.forEach(id => {
                      const t = latestTokensRef.current[id];
                      if (!t) return;
                      const allChars = [...(data?.players || []), ...(data?.npcs || [])];
                      const character = allChars.find(c => String(c.id) === String(t.characterId));
                      const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || (t.ownerId && String(t.ownerId) === String(user?.uid));
                      if (isOwner) tokensToDelete.push(id);
                  });
                  tokensToDelete.forEach(id => deleteToken(id));
                  setSelectedTokenIds(prev => prev.filter(id => !tokensToDelete.includes(id)));
              }
          }
          return;
      }

      if (e.key === 'Escape') {
          setSelectedTokenIds([]); setContextMenu(null); setWallContextMenu(null); setLightContextMenu(null);
          if (role === 'dm') { setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); }
          return;
      }

      if (e.key.toLowerCase() === 'v') { setViewMode(prev => prev === 'isometric' ? 'top-down' : 'isometric'); return; }

      if (role === 'dm') {
          switch(e.key.toLowerCase()) {
              case 'a': setShowAssetManager(false); setShowTokenManager(false); setIsDrawingWalls(false); setIsPlacingLights(false); setIsArchitectMode(p => !p); break;
              case 'd': setShowAssetManager(false); setShowTokenManager(false); setIsArchitectMode(false); setIsPlacingLights(false); setIsDrawingWalls(p => !p); break;
              case 'l': setShowAssetManager(false); setShowTokenManager(false); setIsArchitectMode(false); setIsDrawingWalls(false); setIsPlacingLights(p => !p); break;
              case 't': setShowAssetManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowTokenManager(p => !p); break;
              case 'm': setShowTokenManager(false); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); setShowAssetManager(p => !p); break;
          }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [role, selectedTokenIds, deleteToken, data, user]);

  const envSetting = ENV_SETTINGS[mapData?.environment || 'day'] || ENV_SETTINGS.day;
  const lightingMultiplier = mapData?.lightingIntensity ?? 1.0;

  return (
    <div 
      className="w-full h-full relative bg-slate-950" 
      style={{ display: 'block' }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => e.preventDefault()}
    >
      <Canvas 
        frameloop="demand"
        key={remountKey}
        camera={{ position: [0, 8, 8], fov: 50 }} 
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                console.warn('WebGL context lost. Attempting to restore...');
            });
            gl.domElement.addEventListener('webglcontextrestored', () => {
                console.info('WebGL context restored. Re-initializing...');
                setRemountKey(k => k + 1);
            });
        }}
        /* Clear selection and context menu when clicking the background void */
        onPointerMissed={(e) => {
          if (isDrawingWalls || isArchitectMode || isPlacingLights) return;
          if (e.target.tagName !== 'CANVAS') return;
          if (e.button === 2) return; // Don't clear selection on right-click so Marquee can work
          setSelectedTokenIds([]);
          setContextMenu(null);
          setWallContextMenu(null);
          setLightContextMenu(null);
        }}
        onContextMenu={(e) => { e.preventDefault(); setWallContextMenu(null); setLightContextMenu(null); }}
      >
        <DropZone onMapDrop={handleDrop} />
        {/* Explicitly set the 3D scene background color */}
        <color attach="background" args={[envSetting.bg]} />
        {envSetting.fog && <fog attach="fog" args={[envSetting.fog.color, envSetting.fog.near, envSetting.fog.far]} />}
        
        {/* Lighting setup */}
        <ambientLight color={envSetting.ambient.color} intensity={envSetting.ambient.intensity * lightingMultiplier} />
        <directionalLight color={envSetting.dir.color} position={envSetting.dir.position} intensity={envSetting.dir.intensity * lightingMultiplier} />
        
        {/* Suspense is required when using useTexture to catch the loading state */}
        <Suspense fallback={null}>
            {mapData?.heightmapUrl ? (
                <Heightmap 
                    heightmapUrl={mapData.heightmapUrl}
                    backgroundUrl={mapData.backgroundUrl}
                    heightScale={mapData.heightScale || 1}
                    scale={mapData.scale || 20}
                />
            ) : (
                showPlane && <MapPlane backgroundUrl={mapData.backgroundUrl} scale={mapData.scale || 20} />
            )}
        </Suspense>

        <MarqueeSelector tokens={role === 'dm' ? tokensList : tokensList.filter(t => visibleTokenIds.has(t.id))} onSelectTokens={setSelectedTokenIds} />

        {mapData?.showGrid !== false && (
            mapData?.heightmapUrl ? (
                <DisplacedGrid 
                    mapData={mapData}
                    aspect={aspect}
                    resolvedHeightmapUrl={resolvedHeightmapUrl}
                />
            ) : (
                <Grid 
                  position={[0, 0.016, 0]}
                  renderOrder={101}
                  infiniteGrid 
                  fadeDistance={60} 
                  sectionColor="#888" 
                  cellColor="#444" 
                  cellSize={gridSize}
                  sectionSize={gridSize * 5}
                />
            )
        )}

        {/* Active Combat Tracker Integration */}
        <CombatCameraDirector activeTokenId={activeCombatantId} tokensList={tokensList} />
        
        {/* Render all tokens on the map */}
        {mapData && isAspectReady && (!mapData.heightmapUrl || terrainData) && tokensList.map(token => {
            if (role !== 'dm' && (!visibleTokenIds.has(token.id) || token.isHidden)) {
                return null; // Skip rendering if invisible
            }

            // Find the linked character if one exists
            const character = allCharacters.find(c => String(c.id) === String(token.characterId));
            const displayToken = { ...token };
            
            if (character) {
                displayToken.name = character.name || token.name;
                displayToken.image = character.image || token.image || token.img;
                displayToken.type = data?.players?.some(p => String(p.id) === String(character.id)) ? 'pc' : 'npc';
                displayToken.modelUrl = character.modelUrl;
                displayToken.modelScale = character.modelScale;
                displayToken.modelYOffset = character.modelYOffset;
            }
            
            const isOwner = (character?.ownerId && String(character.ownerId) === String(user?.uid)) || 
                            (token.ownerId && String(token.ownerId) === String(user?.uid));
            const myCharId = data?.assignments?.[user?.uid];
            const myCharAssigned = myCharId && String(token.characterId) === String(myCharId);
            const canControl = role === 'dm' || isOwner || myCharAssigned || token.isSharedControl;
            
            return (
                <Token3D 
                    key={token.id} 
                    token={displayToken} 
                    updateTokenPosition={handleUpdateTokenPosition}
                    gridSize={gridSize}
                    isSelected={selectedTokenIds.includes(token.id)}
                    onSelect={handleSelectToken}
                    onContextMenu={handleContextMenu}
                    role={role}
                    getTerrainHeight={getTerrainHeight}
                    isSnapToGrid={isSnapToGrid}
                    isTerrainReady={!mapData.heightmapUrl || !!terrainData}
                    draggedTokenId={draggedTokenId}
                    setDraggedTokenId={setDraggedTokenId}
                    viewMode={viewMode}
                    showNameplates={showNameplates}
                    selectedTokenIds={selectedTokenIds}
                    groupDragData={groupDragData}
                    onGroupDragEnd={handleGroupDragEnd}
                    isActiveTurn={activeCombatantId === token.id}
                    canControl={canControl}
                />
            );
        })}

        <Walls 
            walls={mapData?.walls} 
            onWallContextMenu={handleWallContextMenu} 
            onToggleDoor={handleToggleDoor} 
            showWalls={role === 'dm' && (isDrawingWalls || isArchitectMode)}
            role={role}
        />

        {/* The Dynamic Fog of War layer */}
        {mapData && <GpuFogOfWar 
            key={`fow-${activeMapId}-${mapData?.scale}-${aspect}`}
            enabled={mapData?.fowEnabled} 
            walls={mapData?.walls} 
            lights={mapData?.lights}
            gridSize={gridSize}
            mapData={mapData}
            aspect={aspect}
            resolvedHeightmapUrl={resolvedHeightmapUrl}
            playerVisionSources={playerVisionSources}
            role={role}
        />}

        {role === 'dm' && (
            <>
                <MapLights 
                    lights={mapData?.lights} 
                    onContextMenu={handleLightContextMenu} 
                    role={role} 
                    gridSize={gridSize} 
                    showLightRadius={isPlacingLights} 
                />
                <WallDrawingController
                    isEnabled={isDrawingWalls}
                    getTerrainHeight={getTerrainHeight}
                    onDrawEnd={(points) => {
                        const wallId = `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        const storablePoints = points.map(p => ({ x: p.x, y: p.y, z: p.z }));
                        updateMap(campaignCode, activeMapId, { [`walls.${wallId}`]: { id: wallId, type: 'wall', points: storablePoints } });
                    }}
                />
                <ArchitectPenController 
                    isEnabled={isArchitectMode}
                    getTerrainHeight={getTerrainHeight}
                    onCommitSegment={(start, end) => {
                        const wallId = `wall_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        const storablePoints = [{ x: start.x, y: start.y, z: start.z }, { x: end.x, y: end.y, z: end.z }];
                        updateMap(campaignCode, activeMapId, { [`walls.${wallId}`]: { id: wallId, type: 'wall', points: storablePoints } });
                    }}
                />
                <LightPlacementController 
                    isEnabled={isPlacingLights}
                    getTerrainHeight={getTerrainHeight}
                    gridSize={gridSize}
                    onPlaceLight={(pt, radiusInMapUnits) => {
                        const lightId = `light_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        const radiusFt = Math.round((radiusInMapUnits / gridSize) * 5);
                        updateMap(campaignCode, activeMapId, { 
                            [`lights.${lightId}`]: { 
                                id: lightId, 
                                position: { x: pt.x, y: pt.y, z: pt.z }, 
                                color: '#fef08a', 
                                radius: radiusFt, 
                                intensity: 1.5 
                            } 
                        });
                    }}
                />
            </>
        )}

        {/* MapControls maps left-click to pan, right-click to rotate, scroll to zoom */}
        <MapControls 
          makeDefault 
          maxPolarAngle={Math.PI / 2 - 0.05} // Prevent camera from going under the board
          minDistance={3} // Limit max zoom in
          maxDistance={40} // Limit max zoom out
          enableDamping={true} // Smooth camera movements
          enableRotate={false}
        />
        <CameraController ref={cameraControllerRef} view={viewMode} />
        <ZoomHandler zoomRef={zoomRef} />
      </Canvas>

      {/* Toolbar for Map */}
      <div className="absolute top-4 left-4 z-[70] flex flex-col items-start gap-2">
        <div className="h-10 px-3 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg shadow-lg flex items-center gap-2 cursor-help" title={`Connected to Realm: ${campaignCode}`}>
            <div className="w-2 h-2 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] bg-green-500"></div>
            <span className="text-sm font-bold text-amber-500 fantasy-font tracking-widest">{campaignCode}</span>
        </div>
        <div className="flex gap-2">
            <button
              onClick={() => {
                cameraControllerRef.current?.reset();
              }}
              className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all"
              title="Reset View"
            >
              <Icon name="camera" size={18} />
            </button>
            <button
              onClick={() => setViewMode(prev => prev === 'isometric' ? 'top-down' : 'isometric')}
              className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all"
              title={viewMode === 'isometric' ? 'Switch to Top-Down (V)' : 'Switch to Isometric (V)'}
            >
              <Icon name={viewMode === 'isometric' ? 'layout-grid' : 'box'} size={18} />
            </button>
        </div>
        <div className="flex gap-2">
            <button
              onClick={() => zoomRef.current?.zoomIn()}
              className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all"
              title="Zoom In"
            >
              <Icon name="zoom-in" size={18} />
            </button>
            <button
              onClick={() => zoomRef.current?.zoomOut()}
              className="w-10 h-10 bg-slate-900/80 backdrop-blur border border-slate-700 hover:border-blue-500 hover:bg-slate-800 text-white rounded-lg shadow-lg flex items-center justify-center transition-all"
              title="Zoom Out"
            >
              <Icon name="zoom-out" size={18} />
            </button>
        </div>
      </div>

      {/* Combat Ribbon HUD Overlay (Visible to everyone) */}
      <CombatRibbon 
          combat={data?.campaign?.combat} 
          updateCampaign={updateCampaign} 
          tokens={tokensList} 
          role={role} 
          campaignData={data?.campaign}
      />

      {/* Combat Tracker Sidebar HUD Overlay (DM Only) */}
      <CombatTrackerSidebar 
          combat={data?.campaign?.combat} 
          updateCampaign={updateCampaign} 
          tokens={tokensList} 
          role={role} 
          campaignData={data?.campaign}
          allCharacters={allCharacters}
          data={data}
          onOpenSheet={onOpenSheet}
          updateToken={updateToken}
      />

      {/* Top-Right: Tools Dock */}
      <div className="absolute top-4 right-4 z-[70] flex flex-col gap-2">
        {role === 'dm' && (
          <>
            {isDrawingWalls && (
                <button 
                    onClick={() => {
                        if (window.confirm('Are you sure you want to clear all walls?')) {
                            updateMap(campaignCode, activeMapId, { walls: null });
                        }
                    }}
                    className="w-10 h-10 bg-red-900/80 backdrop-blur border border-red-500 text-red-200 hover:bg-red-700 hover:text-white rounded-xl shadow-2xl flex items-center justify-center transition-all"
                    title="Clear All Walls"
                >
                    <Icon name="trash-2" size={18} />
                </button>
            )}
            {isPlacingLights && (
                <button 
                    onClick={() => {
                        if (window.confirm('Are you sure you want to clear all lights?')) {
                            updateMap(campaignCode, activeMapId, { lights: null });
                        }
                    }}
                    className="w-10 h-10 bg-red-900/80 backdrop-blur border border-red-500 text-red-200 hover:bg-red-700 hover:text-white rounded-xl shadow-2xl flex items-center justify-center transition-all"
                    title="Clear All Lights"
                >
                    <Icon name="trash-2" size={18} />
                </button>
            )}
            
            <button 
              onClick={() => { setShowAssetManager(false); setShowTokenManager(false); setIsDrawingWalls(false); setIsPlacingLights(false); setIsArchitectMode(!isArchitectMode); }}
              className={`w-10 h-10 backdrop-blur rounded-xl border shadow-2xl flex items-center justify-center transition-all hover:scale-105 ${isArchitectMode ? 'bg-red-900/80 border-red-500 text-red-300' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-red-500 hover:bg-slate-800'}`}
              title={isArchitectMode ? "Stop Architect (A)" : "Architect Pen Tool (A)"}
            >
              <Icon name="pen-tool" size={18} />
            </button>

            <button 
              onClick={() => { setShowAssetManager(false); setShowTokenManager(false); setIsArchitectMode(false); setIsPlacingLights(false); setIsDrawingWalls(!isDrawingWalls); }}
              className={`w-10 h-10 backdrop-blur rounded-xl border shadow-2xl flex items-center justify-center transition-all hover:scale-105 ${isDrawingWalls ? 'bg-blue-900/80 border-blue-500 text-blue-300' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-blue-500 hover:bg-slate-800'}`}
              title={isDrawingWalls ? "Stop Drawing (D)" : "Freehand Draw Tool (D)"}
            >
              <Icon name="pencil" size={18} />
            </button>

            <button 
              onClick={() => { setShowAssetManager(false); setShowTokenManager(false); setIsArchitectMode(false); setIsDrawingWalls(false); setIsPlacingLights(!isPlacingLights); }}
              className={`w-10 h-10 backdrop-blur rounded-xl border shadow-2xl flex items-center justify-center transition-all hover:scale-105 ${isPlacingLights ? 'bg-yellow-900/80 border-yellow-500 text-yellow-300' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-yellow-500 hover:bg-slate-800'}`}
              title={isPlacingLights ? "Stop Placing Lights (L)" : "Place Light Source (L)"}
            >
              <Icon name="lightbulb" size={18} />
            </button>

            <button 
              onClick={() => { setShowAssetManager(false); setShowTokenManager(!showTokenManager); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); }}
              className={`w-10 h-10 backdrop-blur rounded-xl border shadow-2xl flex items-center justify-center transition-all hover:scale-105 ${showTokenManager ? 'bg-indigo-900/80 border-indigo-500 text-indigo-300' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-indigo-500 hover:bg-slate-800'}`}
              title="Actors & Tokens (T)"
            >
              <Icon name="users" size={18} />
            </button>

            <div className="w-6 h-px bg-slate-700/50 my-1 mx-auto rounded-full"></div>

            <button 
              onClick={() => { setShowTokenManager(false); setShowAssetManager(!showAssetManager); setIsDrawingWalls(false); setIsArchitectMode(false); setIsPlacingLights(false); }}
              className={`w-10 h-10 backdrop-blur rounded-xl border shadow-2xl flex items-center justify-center transition-all hover:scale-105 ${showAssetManager ? 'bg-amber-900/80 border-amber-500 text-amber-300' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-amber-500 hover:bg-slate-800'}`}
              title="Map Editor (M)"
            >
              <Icon name="map" size={18} />
            </button>

            <div className="w-6 h-px bg-slate-700/50 my-1 mx-auto rounded-full"></div>
          </>
        )}

        {onOpenHandouts && (
          <button 
            onClick={onOpenHandouts}
            className="w-10 h-10 bg-amber-900/60 backdrop-blur border border-amber-700 hover:border-amber-500 hover:bg-amber-800 text-amber-200 rounded-xl shadow-2xl flex items-center justify-center transition-all hover:scale-105"
            title="Handouts"
          >
            <Icon name="scroll" size={18} />
          </button>
        )}

        {(onOpenChat || onOpenJournal) && (
          <div className="w-6 h-px bg-slate-700/50 my-1 mx-auto rounded-full"></div>
        )}

        {onOpenChat && (
          <button 
            onClick={onOpenChat}
            className="w-10 h-10 bg-indigo-900/60 backdrop-blur border border-indigo-700 hover:border-indigo-500 hover:bg-indigo-800 text-indigo-200 rounded-xl shadow-2xl flex items-center justify-center transition-all hover:scale-105"
            title="Chat & Dice"
          >
            <Icon name="message-circle" size={18} />
          </button>
        )}

        {onOpenJournal && (
          <button 
            onClick={onOpenJournal}
            className="w-10 h-10 bg-emerald-900/60 backdrop-blur border border-emerald-700 hover:border-emerald-500 hover:bg-emerald-800 text-emerald-200 rounded-xl shadow-2xl flex items-center justify-center transition-all hover:scale-105"
            title="Journal"
          >
            <Icon name="book" size={18} />
          </button>
        )}
      </div>

      {/* Actors Manager Drawer */}
      {showTokenManager && role === 'dm' && (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="font-bold text-indigo-500 flex items-center gap-2"><Icon name="users" size={18} /> Actors</h3>
                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                        <button onClick={() => setActorViewMode('grid')} className={`p-1 rounded ${actorViewMode === 'grid' ? 'bg-slate-700 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="layout-grid" size={14}/></button>
                        <button onClick={() => setActorViewMode('list')} className={`p-1 rounded ${actorViewMode === 'list' ? 'bg-slate-700 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="list" size={14}/></button>
                    </div>
                    <button onClick={() => setShowTokenManager(false)} className="text-slate-400 hover:text-white p-1"><Icon name="x" size={18} /></button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
                <div>
                  <h4 className="text-xs uppercase font-bold text-slate-500 mb-3 tracking-wider">Party</h4>
                  <div className={actorViewMode === 'grid' ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2"}>
                      {data?.players?.map((p, i) => (
                          actorViewMode === 'grid' ? (
                              <div key={`pc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: p.id, name: p.name, type: 'pc', image: p.image });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="aspect-square bg-slate-800 rounded-lg border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-green-500 transition-colors relative group shadow-lg"
                              >
                                  {p.image ? (
                                    <img src={p.image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={p.name} draggable={false} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-slate-600 bg-slate-700 opacity-80 group-hover:opacity-100 transition-opacity">{p.name?.[0] || '?'}</div>
                                  )}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-4 pb-1 px-2 text-[10px] font-bold text-white truncate pointer-events-none text-center shadow-black drop-shadow-md">{p.name}</div>
                                  <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(p, false); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md shadow-lg transition-all z-10" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button>
                              </div>
                          ) : (
                              <div key={`pc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: p.id, name: p.name, type: 'pc', image: p.image });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="flex items-center gap-3 bg-slate-800 rounded-lg border border-slate-700 p-2 cursor-grab active:cursor-grabbing hover:border-green-500 transition-colors group shadow-lg"
                              >
                                  <div className="w-10 h-10 rounded bg-slate-700 shrink-0 overflow-hidden relative">
                                      {p.image ? <img src={p.image} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{p.name?.[0] || '?'}</div>}
                                  </div>
                                  <div className="flex-1 min-w-0 font-bold text-sm text-slate-200 truncate">{p.name}</div>
                                  <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(p, false); }} className="opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded shadow-lg transition-all" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button>
                              </div>
                          )
                      ))}
                      {(!data?.players || data.players.length === 0) && <div className="col-span-2 text-slate-500 text-xs text-center italic">No players found.</div>}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider">Bestiary</h4>
                      <button onClick={() => setShowCompendium(true)} className="text-[10px] bg-blue-900/40 text-blue-400 hover:text-blue-300 hover:bg-blue-900/60 border border-blue-800/50 px-2 py-0.5 rounded flex items-center gap-1 transition-colors">
                          <Icon name="book" size={12}/> 5e API
                      </button>
                  </div>
                  <div className={actorViewMode === 'grid' ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2"}>
                      {data?.npcs?.map((n, i) => (
                          actorViewMode === 'grid' ? (
                              <div key={`npc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: n.id, name: n.name, type: 'npc', image: n.image, size: n.size || 1, hp: n.hp });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="aspect-square bg-slate-800 rounded-lg border border-slate-700 overflow-hidden cursor-grab active:cursor-grabbing hover:border-red-500 transition-colors relative group shadow-lg"
                              >
                                  {n.image ? (
                                    <img src={n.image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={n.name} draggable={false} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-slate-600 bg-slate-700 opacity-80 group-hover:opacity-100 transition-opacity">{n.name?.[0] || '?'}</div>
                                  )}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-4 pb-1 px-2 text-[10px] font-bold text-white truncate pointer-events-none text-center shadow-black drop-shadow-md">{n.name}</div>
                                  <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(n, true); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md shadow-lg transition-all z-10" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button>
                              </div>
                          ) : (
                              <div key={`npc-${i}`} draggable 
                                  onDragStart={(e) => {
                                      const payload = JSON.stringify({ format: 'dungeonmind-character', id: n.id, name: n.name, type: 'npc', image: n.image, size: n.size || 1, hp: n.hp });
                                      e.dataTransfer.setData('application/dungeonmind-character', payload);
                                      e.dataTransfer.setData('text/plain', payload);
                                  }}
                                  className="flex items-center gap-3 bg-slate-800 rounded-lg border border-slate-700 p-2 cursor-grab active:cursor-grabbing hover:border-red-500 transition-colors group shadow-lg"
                              >
                                  <div className="w-10 h-10 rounded bg-slate-700 shrink-0 overflow-hidden relative">
                                      {n.image ? <img src={n.image} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{n.name?.[0] || '?'}</div>}
                                  </div>
                                  <div className="flex-1 min-w-0 font-bold text-sm text-slate-200 truncate">{n.name}</div>
                                  <button onClick={(e) => { e.stopPropagation(); handleAddActorToCombat(n, true); }} className="opacity-0 group-hover:opacity-100 p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded shadow-lg transition-all" title="Add to Initiative Tracker"><Icon name="plus" size={14}/></button>
                              </div>
                          )
                      ))}
                      {(!data?.npcs || data.npcs.length === 0) && <div className="col-span-2 text-slate-500 text-xs text-center italic">No enemies found.</div>}
                  </div>
                </div>
            </div>
        </div>
      )}

      {/* Asset Manager Drawer */}
      {showAssetManager && role === 'dm' && (
        <AssetManager 
          campaignCode={campaignCode} 
          mapData={mapData}
          activeMapId={activeMapId}
          updateMap={updateMap}
          onClose={() => setShowAssetManager(false)} 
          onSetBackground={(url) => updateMap(campaignCode, activeMapId, { backgroundUrl: url })}
          onSetHeightmap={(url) => updateMap(campaignCode, activeMapId, { heightmapUrl: url })}
          onGenerateMap={({ backgroundUrl, heightmapUrl }) => {
              updateMap(campaignCode, activeMapId, { backgroundUrl, heightmapUrl });
          }}
          isSnapToGrid={isSnapToGrid}
          setIsSnapToGrid={setIsSnapToGrid}
        />
      )}

      {/* Context Menu Overlay */}
      {contextMenu && (
        <>
          {/* Invisible backdrop to catch clicks outside the menu */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setContextMenu(null)} 
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          ></div>
          
          <div 
            className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[150px] overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {contextMenu.characterId && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors"
                onClick={() => {
                  if (onOpenSheet) {
                      const token = tokensList.find(t => t.id === contextMenu.tokenId);
                      const char = allCharacters.find(c => String(c.id) === String(contextMenu.characterId));
                      const hp = token?.hp?.current ?? char?.hp?.current ?? null;
                      const maxHp = token?.hp?.max ?? char?.hp?.max ?? null;
                      onOpenSheet({ isToken: true, tokenId: contextMenu.tokenId, characterId: contextMenu.characterId, hp, maxHp });
                  }
                  setContextMenu(null);
                }}
              >
                Open Sheet
              </button>
            )}
            
            {/* Reset Elevation is only visible if the token is currently flying */}
            {Math.abs(contextMenu.elevationOffset || 0) > 0.01 && (
              <button 
                className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-blue-400 font-bold"
                onClick={() => {
                  updateToken(contextMenu.tokenId, { elevationOffset: 0 });
                  setContextMenu(null);
                }}
              >
                Reset Elevation
              </button>
            )}

            {role === 'dm' && (
              <>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-green-400 font-bold"
                  onClick={() => {
                    const idsToToggle = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 
                        ? selectedTokenIds 
                        : [contextMenu.tokenId];
                    idsToToggle.forEach(id => {
                        updateToken(id, { isSharedControl: !contextMenu.isSharedControl });
                    });
                    setContextMenu(null);
                  }}
                >
                  <Icon name="unlock" size={14} className="inline mr-2"/>
                  {contextMenu.isSharedControl ? "Revoke Shared Control" : "Allow Shared Control"}
                </button>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-amber-400 font-bold"
                  onClick={() => {
                    const idsToRoll = selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 
                        ? selectedTokenIds 
                        : [contextMenu.tokenId];
                    rollGroupInitiative(idsToRoll);
                    setContextMenu(null);
                  }}
                >
                  <Icon name="sword" size={14} className="inline mr-2"/>
                  {selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? "Roll Group Initiative" : "Roll Initiative"}
                </button>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors"
                  onClick={() => {
                    updateToken(contextMenu.tokenId, { isHidden: !contextMenu.isHidden });
                    setContextMenu(null);
                  }}
                >
                  {contextMenu.isHidden ? "Reveal to Players" : "Hide from Players"}
                </button>
                
                <div className="border-t border-slate-700 my-1"></div>
                <div className="flex items-center justify-between px-4 py-1">
                    <span className="text-xs font-bold text-slate-400">Size</span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => {
                            const newSize = Math.max(0.5, (contextMenu.size || 1) - 0.5);
                            updateToken(contextMenu.tokenId, { size: newSize });
                            setContextMenu({ ...contextMenu, size: newSize }); // Keeps menu open!
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="minus" size={12}/></button>
                        <span className="text-sm font-bold w-6 text-center tabular-nums">{contextMenu.size || 1}</span>
                        <button onClick={() => {
                            const newSize = (contextMenu.size || 1) + 0.5;
                            updateToken(contextMenu.tokenId, { size: newSize });
                            setContextMenu({ ...contextMenu, size: newSize }); // Keeps menu open!
                        }} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"><Icon name="plus" size={12}/></button>
                    </div>
                </div>
                <div className="border-t border-slate-700 my-1"></div>
                
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors"
                  onClick={() => {
                    if (selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1) {
                        selectedTokenIds.forEach(id => deleteToken(id));
                        setSelectedTokenIds([]);
                    } else {
                        deleteToken(contextMenu.tokenId);
                    }
                    setContextMenu(null);
                  }}
                >
                  {selectedTokenIds.includes(contextMenu.tokenId) && selectedTokenIds.length > 1 ? `Delete Selected (${selectedTokenIds.length})` : "Delete Token"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {wallContextMenu && (
        <>
            <div 
                className="fixed inset-0 z-40" 
                onClick={() => setWallContextMenu(null)} 
                onContextMenu={(e) => { e.preventDefault(); setWallContextMenu(null); }}
            ></div>
            <div 
                className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[150px] overflow-hidden"
                style={{ top: wallContextMenu.y, left: wallContextMenu.x }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="text-xs uppercase font-bold text-slate-500 px-4 py-1">Set Type</div>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-red-400"
                    onClick={() => {
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}.type`]: 'wall' });
                        setWallContextMenu(null);
                    }}
                >
                    Make Wall
                </button>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-blue-400"
                    onClick={() => {
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}.type`]: 'door' });
                        setWallContextMenu(null);
                    }}
                >
                    Make Door
                </button>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-cyan-400"
                    onClick={() => {
                        updateMap(campaignCode, activeMapId, { [`walls.${wallContextMenu.wallId}.type`]: 'window' });
                        setWallContextMenu(null);
                    }}
                >
                    Make Window
                </button>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors"
                    onClick={() => {
                        const newWalls = { ...mapData.walls };
                        delete newWalls[wallContextMenu.wallId];
                        updateMap(campaignCode, activeMapId, { walls: newWalls });
                        setWallContextMenu(null);
                    }}
                >
                    Delete Wall
                </button>
            </div>
        </>
      )}

      {lightContextMenu && (
        <>
            <div 
                className="fixed inset-0 z-40" 
                onClick={() => setLightContextMenu(null)} 
                onContextMenu={(e) => { e.preventDefault(); setLightContextMenu(null); }}
            ></div>
            <div 
                className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 text-sm text-slate-200 min-w-[150px] overflow-hidden"
                style={{ top: lightContextMenu.y, left: lightContextMenu.x }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="text-xs uppercase font-bold text-slate-500 px-4 py-1">Light Source</div>
                <div className="border-t border-slate-700 my-1"></div>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors text-amber-400"
                    onClick={() => {
                        const light = mapData.lights[lightContextMenu.lightId];
                        const currentRadiusFt = light?.radius || 30;
                        const newRadius = window.prompt("Enter new light radius in feet (e.g. 15, 30, 60):", currentRadiusFt);
                        if (newRadius && !isNaN(newRadius)) {
                            updateMap(campaignCode, activeMapId, { [`lights.${lightContextMenu.lightId}.radius`]: Number(newRadius) });
                        }
                        setLightContextMenu(null);
                    }}
                >
                    Change Radius
                </button>
                <button 
                    className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 transition-colors"
                    onClick={() => {
                        const newLights = { ...mapData.lights };
                        delete newLights[lightContextMenu.lightId];
                        updateMap(campaignCode, activeMapId, { lights: newLights });
                        setLightContextMenu(null);
                    }}
                >
                    Delete Light
                </button>
            </div>
        </>
      )}

      {showCompendium && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="max-w-xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                      <h3 className="font-bold text-white flex items-center gap-2"><Icon name="globe" size={18}/> D&D 5e API Search</h3>
                      <button onClick={() => setShowCompendium(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                  </div>
                  <div className="p-4 border-b border-slate-700">
                      <div className="flex gap-2">
                          <input autoFocus value={compendiumSearch} onChange={(e) => setCompendiumSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCompendium()} placeholder="Search (e.g. Owlbear, Lich)..." className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500"/>
                          <button onClick={searchCompendium} disabled={isLoadingCompendium} className="bg-blue-600 hover:bg-blue-500 px-4 rounded text-white font-bold">{isLoadingCompendium ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}</button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900 custom-scroll">
                      {compendiumResults.map(r => (
                          <div key={r.index} onClick={() => importFromApi(r.url)} className="p-3 bg-slate-800 border border-slate-700 rounded hover:border-blue-500 cursor-pointer flex justify-between items-center group">
                              <div className="font-bold text-white group-hover:text-blue-400 capitalize">{r.name}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1 group-hover:text-blue-300">Import <Icon name="download" size={14}/></div>
                          </div>
                      ))}
                      {compendiumResults.length === 0 && !isLoadingCompendium && <div className="text-center text-slate-500 py-8 italic">Search for a creature to begin.</div>}
                  </div>
              </div>
          </div>
      )}

      {showModelPicker && pendingNpc && (
          <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="max-w-2xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                      <h3 className="font-bold text-white flex items-center gap-2"><Icon name="box" size={18}/> Select 3D Mini: {pendingNpc.name}</h3>
                      <button onClick={() => { setPendingNpc(null); setShowModelPicker(false); }} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
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
                              <div key={i} onClick={() => handleModelSelect(model)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 cursor-pointer hover:border-amber-500 hover:bg-slate-700 transition-all group">
                                  <div className="aspect-square bg-slate-900 rounded-md mb-2 overflow-hidden border border-slate-700 group-hover:border-amber-500/50 relative">
                                      {model.thumb ? <img src={model.thumb} className="w-full h-full object-cover" /> : <Icon name="box" size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600"/>}
                                  </div>
                                  <div className="font-bold text-sm text-slate-200 group-hover:text-amber-400 truncate">{model.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate">Scale: {model.scale}x</div>
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
  );
}