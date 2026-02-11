import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import * as fb from '../firebase';
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, deleteDoc, updateDoc, deleteField, arrayUnion, arrayRemove } from '../firebase';

const CampaignContext = createContext(null);

export const useCampaign = () => {
    const context = useContext(CampaignContext);
    if (!context) {
        throw new Error("useCampaign must be used within a CampaignProvider");
    }
    return context;
};

const DB_INIT_DATA = { 
    hostId: null, dmIds: [], locations: [], npcs: [], handouts: [],
    activeUsers: {}, bannedUsers: [], assignments: {}, onboardingComplete: false, 
    config: { edition: '2014', strictMode: true }, 
    campaign: { 
        genesis: { tone: 'Heroic', conflict: 'Dragon vs Kingdom', campaignName: 'New Campaign' }, 
        activeMap: { url: null, revealPaths: [], tokens: [] }, 
        savedMaps: [], activeHandout: null, location: "Start", 
        combat: { active: false, round: 1, turn: 0, combatants: [] }
    }
};

const INITIAL_APP_STATE = { ...DB_INIT_DATA, players: [], journal_pages: {}, chatLog: [] };

export const CampaignProvider = ({ children }) => {
    const [gameParams, setGameParams] = useState(null); 
// --- CHANGES: Internal Auth State & Presence Trigger ---
    const [user, setUser] = useState(null);
    const [data, setData] = useState(INITIAL_APP_STATE);

    // 0. Internal Auth Listener
    useEffect(() => {
        return fb.onAuthStateChanged(fb.auth, (u) => setUser(u));
    }, []);

    // 1. Presence System (The "I am here" announcer)
    useEffect(() => {
        if (!gameParams || gameParams.isOffline || !user) return;

        const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        const myName = user.displayName || user.email?.split('@')[0] || "Anonymous";
        
        updateDoc(rootRef, { 
            [`activeUsers.${user.uid}`]: myName 
        }).catch(e => console.error("Presence Error:", e));
    }, [gameParams?.code, user]);
// --- 2 lines after changes ---
    const [loreChunks, setLoreChunks] = useState([]);
    const saveTimer = useRef(null);
    const isPendingSave = useRef(false); 

    // --- 1. SYNC ENGINE ---
    useEffect(() => {
        if (!gameParams) return;
        const { code, isOffline, uid } = gameParams;

        if (isOffline) {
            const local = localStorage.getItem('dm_local_data');
            setData(local ? JSON.parse(local) : INITIAL_APP_STATE);
            return;
        }

        const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
        
        // Listeners
        const unsubRoot = onSnapshot(rootRef, { includeMetadataChanges: true }, (snap) => {
            if (snap.exists()) {
                // --- CHANGES: Remove pending save gate to allow fluid real-time updates from other users ---
                const d = snap.data();
                
                // START CHANGE: Ban Enforcement & Auto-Join Registration
                if (user && d.bannedUsers?.includes(user.uid)) {
                    localStorage.removeItem('dm_last_code'); 
                    setGameParams(null); 
                    alert("You have been banished from this realm.");
                    return;
                }

                if (user && !d.activeUsers?.[uid]) {
                    updateDoc(rootRef, { [`activeUsers.${uid}`]: user.email || "Anonymous" }).catch(() => {});
                }
                // END CHANGE

                setData(prev => ({ ...prev, ...d })); 
            } else if (gameParams.role === 'dm') {
                setDoc(rootRef, { 
                    ...DB_INIT_DATA, 
                    hostId: uid, 
                    dmIds: [uid],
                    activeUsers: { [uid]: user?.email || "Dungeon Master" }
                });
            } else {
                setGameParams(null); // Invalid code
            }
        });

        const playersRef = collection(rootRef, 'players');
        const unsubPlayers = onSnapshot(playersRef, (snap) => setData(prev => ({ ...prev, players: snap.docs.map(d => ({id: d.id, ...d.data()})) })));
        
        const journalRef = collection(rootRef, 'journal');
        const unsubJournal = onSnapshot(journalRef, (snap) => {
            const j = {}; snap.docs.forEach(d => { j[d.id] = {id: d.id, ...d.data()}; });
            setData(prev => ({ ...prev, journal_pages: j }));
        });

        const chatRef = query(collection(rootRef, 'chat'), orderBy('timestamp', 'asc'), limit(100));
        const unsubChat = onSnapshot(chatRef, (snap) => setData(prev => ({ ...prev, chatLog: snap.docs.map(d => ({...d.data(), id: d.id})) })));

        const loreRef = collection(rootRef, 'lore');
        const unsubLore = onSnapshot(loreRef, (snap) => {
            let allChunks = [];
            snap.docs.forEach(doc => { const v = doc.data(); if(v.chunks) allChunks = [...allChunks, ...v.chunks]; });
            setLoreChunks(allChunks);
        });

        // Presence
        if (user && !isOffline) updateDoc(rootRef, { [`activeUsers.${user.uid}`]: user.email || "Anonymous" }).catch(console.error);

        return () => { unsubRoot(); unsubPlayers(); unsubJournal(); unsubChat(); unsubLore(); };
    }, [gameParams, user]);

     // --- 2. ACTIONS ---
    const updateMapState = (action, payload) => {
        const currentMap = data.campaign?.activeMap || {};
        let updatedMap = { ...currentMap };

        switch (action) {
            case 'move_token':
                updatedMap.tokens = (currentMap.tokens || []).map(t => 
                    String(t.id) === String(payload.tokenId) ? { ...t, x: payload.x, y: payload.y } : t
                );
                break;
            case 'update_token':
                updatedMap.tokens = (currentMap.tokens || []).map(t => 
                    String(t.id) === String(payload.id) ? { ...t, ...payload } : t
                );
                break;
            case 'delete_token':
                updatedMap.tokens = (currentMap.tokens || []).filter(t => String(t.id) !== String(payload));
                break;
            case 'add_token':
                updatedMap.tokens = [...(currentMap.tokens || []), payload];
                break;
            case 'load_map':
                updatedMap = { ...payload, id: payload.id || Date.now() };
                break;
            case 'rename_map':
                const renamedMaps = (data.campaign?.savedMaps || []).map(m => 
                    m.id === payload.id ? { ...m, name: payload.newName } : m
                );
                updateCloud({ ...data, campaign: { ...data.campaign, savedMaps: renamedMaps } });
                return;
            case 'delete_map':
                const filteredMaps = (data.campaign?.savedMaps || []).filter(m => m.id !== payload);
                updateCloud({ ...data, campaign: { ...data.campaign, savedMaps: filteredMaps } });
                return;
            case 'open_sheet':
                setData(prev => ({ ...prev, activeSheet: payload }));
                return;
        }

        updateCloud({
            ...data,
            campaign: { ...data.campaign, activeMap: updatedMap }
        }, action === 'move_token');
    };

    const updateCloud = (newData, immediate = false) => {
        isPendingSave.current = true; 
// ---------------------------------------------------------
        // NEW: Sanitizer function to strip 'undefined' which Firebase hates
        const sanitize = (obj) => {
            return JSON.parse(JSON.stringify(obj, (key, value) =>
                value === undefined ? null : value
            ));
        };

        const sanitizedData = sanitize(newData);
        const { players, chatLog, journal_pages, ...rootData } = sanitizedData;
        
        setData(prev => ({ ...prev, ...sanitizedData })); // Optimistic UI
// ---------------------------------------------------------

        if (gameParams?.isOffline) {
// context: line 88 (updated to use sanitizedData)
            localStorage.setItem('dm_local_data', JSON.stringify(sanitizedData));
            return;
        }
        
        const doSave = () => {
            const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
            setDoc(ref, rootData, { merge: true }).then(() => {
                isPendingSave.current = false; 
            });
        };
        
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (immediate) doSave(); else saveTimer.current = setTimeout(doSave, 1000); 
    };

    const savePlayer = async (player) => {
        if (!gameParams?.isOffline) {
            const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'players', player.id.toString());
            await setDoc(ref, player, { merge: true });
        }
    };

    const deletePlayer = async (playerId) => {
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'players', playerId.toString());
        await deleteDoc(ref);
    };

    const joinCampaign = (code, role, uid, isOffline) => {
        setGameParams({ code, role, uid, isOffline });
    };

    const leaveCampaign = () => {
        setGameParams(null);
        setData(INITIAL_APP_STATE);
    };

    const kickPlayer = async (targetUid) => {
        if (!gameParams?.code || gameParams.isOffline) return;
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        await updateDoc(ref, { [`activeUsers.${targetUid}`]: fb.deleteField() });
    };

    const banPlayer = async (targetUid) => {
        if (!gameParams?.code || gameParams.isOffline) return;
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        await updateDoc(ref, { 
            [`activeUsers.${targetUid}`]: fb.deleteField(),
            bannedUsers: fb.arrayUnion(targetUid)
        });
    };

    const unbanPlayer = async (targetUid) => {
        if (!gameParams?.code || gameParams.isOffline) return;
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        await updateDoc(ref, { bannedUsers: fb.arrayRemove(targetUid) });
    };

    // START CHANGE: Global Ping Helper
    const sendPing = (coords) => {
        if (!gameParams?.code || gameParams.isOffline) return;
        const ref = collection(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code), 'chat');
        setDoc(doc(ref), {
            type: 'ping',
            x: coords.x,
            y: coords.y,
            senderId: user?.uid,
            timestamp: Date.now()
        });
    };
    // END CHANGE

    // START CHANGE: Global VFX Helper
    const triggerVfx = (payload) => {
        if (!gameParams?.code) return;
        
        const msg = {
            id: `vfx-${Date.now()}-${Math.random()}`,
            type: 'vfx',
            payload,
            senderId: user?.uid,
            timestamp: Date.now()
        };

        if (gameParams.isOffline) {
            setData(prev => ({ ...prev, chatLog: [...prev.chatLog, msg] }));
            return;
        }

        const ref = collection(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code), 'chat');
        setDoc(doc(ref), msg);
    };
    // END CHANGE

    // --- MEMOIZED VALUE (Prevents Infinite Renders & "1, M" Errors) ---
    const value = useMemo(() => ({
        data, setData, gameParams, 
// --- CHANGES: Add user to exports ---
        user, 
        joinCampaign, leaveCampaign, 
// --- 2 lines after changes ---
        updateCloud, updateMapState, savePlayer, deletePlayer, 
        loreChunks, setLoreChunks,
        sendPing,
        triggerVfx,
        kickPlayer, banPlayer, unbanPlayer
    }), [data, gameParams, loreChunks, user]);

    return (
        <CampaignContext.Provider value={value}>
            {children}
        </CampaignContext.Provider>
    );
};