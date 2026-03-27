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
        activeMap: { url: null, revealPaths: [], tokens_v2: {} }, 
        savedMaps: [], activeHandout: null, location: "Start", 
        combat: { active: false, round: 1, turn: 0, combatants: [] }
    }
};

const INITIAL_APP_STATE = { ...DB_INIT_DATA, players: [], journal_pages: {}, chatLog: [], ui: { sidebar: null } };

export const CampaignProvider = ({ children }) => {
    const [gameParams, setGameParams] = useState(null); 
    const [user, setUser] = useState(null);
    const [data, setData] = useState(INITIAL_APP_STATE);
    const [isConnected, setIsConnected] = useState(true); // Track connection status

    // 0. Internal Auth Listener
    useEffect(() => {
        return fb.onAuthStateChanged(fb.auth, (u) => setUser(u));
    }, []);

    // NEW: Auto-rejoin from localStorage
    useEffect(() => {
        if (user && !gameParams) {
            const lastCampaign = localStorage.getItem('dungeonmind_last_campaign');
            if (lastCampaign) {
                try {
                    const { code, role, isOffline } = JSON.parse(lastCampaign);
                    if (code) {
                        joinCampaign(code, role, user.uid, isOffline);
                    }
                } catch (e) {
                    console.error("Failed to parse last campaign data:", e);
                    localStorage.removeItem('dungeonmind_last_campaign');
                }
            }
        }
    }, [user, gameParams]);

    // 1. Presence System (The "I am here" announcer)
    useEffect(() => {
        if (!gameParams || gameParams.isOffline || !user) return;

        const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        const myName = user.displayName || user.email?.split('@')[0] || "Anonymous";
        
        updateDoc(rootRef, { 
            [`activeUsers.${user.uid}`]: myName 
        }).catch(e => console.error("Presence Error:", e));
    }, [gameParams?.code, user]);
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
            setIsConnected(true); // Offline mode is considered "connected" locally
            return;
        }

        const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
        
        // Listeners
        const unsubRoot = onSnapshot(rootRef, { includeMetadataChanges: true }, (snap) => {
            setIsConnected(!snap.metadata.fromCache); // Update connection status based on cache state

            if (snap.exists()) {
                const d = snap.data();
                
                if (user && d.bannedUsers?.includes(user.uid)) {
                    localStorage.removeItem('dm_last_code'); 
                    setGameParams(null); 
                    console.error(`User ${user.uid} is banned from campaign ${code}.`);
                    alert("You have been banished from this realm.");
                    return;
                }

                // Removed console.log statements for brevity and because they served their debugging purpose.
                // console.log("[CampaignContext] Root document snapshot received (raw):", d);
                // console.log("[CampaignContext] Root snapshot d.campaign.activeMap.tokens:", d.campaign?.activeMap?.tokens);
                // console.log("[CampaignContext] Root snapshot d.campaign.activeMap.tokens_v2:", d.campaign?.activeMap?.tokens_v2);
                setData(prev => {
                    const newCampaign = { ...prev.campaign, ...d.campaign };
                    if (d.campaign?.activeMap) {
                        // Perform a deep merge for activeMap, especially for tokens
                        newCampaign.activeMap = {
                            ...prev.campaign?.activeMap,
                            ...d.campaign.activeMap,
                            // The 'tokens' field will now be managed by the tokens_v2 subcollection listener.
                            // We explicitly exclude it from the root document merge to avoid conflicts.
                            // If the UI still relies on 'tokens', it should be updated to use 'tokens_v2'.
                            // For now, we'll assume the tokens_v2 listener will populate the correct path.
                        };
                    }
                    // console.log("[CampaignContext] After merge, newCampaign.activeMap.tokens:", newCampaign.activeMap?.tokens); // Removed debug log
                    return { ...prev, ...d, campaign: newCampaign };
                }); 
            } else if (gameParams.role === 'dm') {
                console.log("[CampaignContext] Root document not found. Initializing new campaign.");
                setDoc(rootRef, { 
                    ...DB_INIT_DATA, 
                    hostId: uid, 
                    dmIds: [uid],
                    activeUsers: { [uid]: user?.email || "Dungeon Master" }
                });
            } else {
                console.warn(`[CampaignContext] Campaign with code ${code} not found for player ${uid}.`);
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

        const tokensRef = collection(rootRef, 'tokens_v2');
        const unsubTokens = onSnapshot(tokensRef, (snap) => {
            const newTokens = {};
            snap.docs.forEach(doc => {
                const token = { id: doc.id, ...doc.data() };
                if (gameParams.role === 'dm' || !token.isHidden) {
                    newTokens[token.id] = token;
                }
            });

            console.log("[CampaignContext] tokens_v2 subcollection snapshot received. Raw docs:", snap.docs.map(d => ({id: d.id, ...d.data()})));
            console.log("[CampaignContext] tokens_v2 subcollection snapshot received. New tokens:", newTokens);

            setData(prev => ({
                ...prev,
                campaign: {
                    ...prev.campaign,
                    activeMap: { ...prev.campaign.activeMap, tokens_v2: newTokens }
                }
            }));
        });

        const mapsRef = collection(rootRef, 'maps');
        const unsubMaps = onSnapshot(mapsRef, (snap) => {
            const mapsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setData(prev => ({ ...prev, maps: mapsData }));
        });

        // Presence
        if (user && !isOffline) updateDoc(rootRef, { [`activeUsers.${user.uid}`]: user.email || "Anonymous" }).catch(console.error);

        return () => { unsubRoot(); unsubPlayers(); unsubJournal(); unsubChat(); unsubLore(); unsubTokens(); unsubMaps(); };
    }, [gameParams, user]);

    // --- 2. ACTIONS ---
    
    // NEW: Internal helper to send changes to Firestore
    const _updateCampaignDocument = (changes, immediate = false) => {
        isPendingSave.current = true; 

        // Sanitizer function to strip 'undefined' which Firebase hates
        const sanitize = (obj) => {
            return JSON.parse(JSON.stringify(obj, (key, value) =>
                value === undefined ? null : value
            ));
        };

        if (gameParams?.isOffline) {
            // Offline mode: apply changes to local storage
            const currentLocal = JSON.parse(localStorage.getItem('dm_local_data') || JSON.stringify(INITIAL_APP_STATE));
            let updatedLocal = { ...currentLocal };
            
            // Simple deep merge for offline simulation
            for (const path in changes) {
                const parts = path.split('.');
                let target = updatedLocal;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = changes[path];
            }
            
            localStorage.setItem('dm_local_data', JSON.stringify(sanitize(updatedLocal)));
            setData(updatedLocal);
            return;
        }
        
        const doSave = () => {
            const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
            // Use updateDoc for granular field updates
            updateDoc(ref, sanitize(changes)).then(() => {
                isPendingSave.current = false; 
            }).catch(err => console.error("Save failed:", err));
        };
        
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (immediate) doSave(); else saveTimer.current = setTimeout(doSave, 1000); 
    };

    // NEW: Public API for updating campaign data
    const updateCampaign = (changes, immediate = false) => {
        // Optimistically update local state
        setData(prev => {
            let newState = { ...prev };
            // Deep clone to avoid mutation
            newState = JSON.parse(JSON.stringify(newState));
            
            for (const path in changes) {
                const parts = path.split('.');
                let target = newState;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = changes[path];
            }
            return newState;
        });
        
        _updateCampaignDocument(changes, immediate);
    };

    // Legacy wrapper for backward compatibility if needed
    const updateCloud = (newData, immediate = false) => {
        console.warn("Deprecated updateCloud called. Please migrate to updateCampaign.");
        
        const changes = {};
        if (newData.campaign) changes.campaign = newData.campaign;
        if (newData.handouts) changes.handouts = newData.handouts;
        if (newData.npcs) changes.npcs = newData.npcs;
        if (newData.locations) changes.locations = newData.locations;
        if (newData.config) changes.config = newData.config;
        if (newData.onboardingComplete !== undefined) changes.onboardingComplete = newData.onboardingComplete;
        
        updateCampaign(changes, immediate);
    };

    const addToken = async (token) => {
        if (!gameParams?.code) return;
        
        // Write to tokens_v2 subcollection (new way)
        const tokenRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'tokens_v2', String(token.id));
        await setDoc(tokenRef, token);
    };

    const sanitizeTokenChanges = (changes) => {
        const sanitizedChanges = { ...changes };
        // Sanitize position data before any updates
        for (const key of ['x', 'y', 'z']) {
            if (key in sanitizedChanges) {
                const originalValue = sanitizedChanges[key];
                let numValue = Number(originalValue);
                if (!Number.isFinite(numValue)) {
                    console.warn(`[Token Sanitizer] Invalid value for ${key}. Got: '${originalValue}'. Defaulting to 0.`);
                    sanitizedChanges[key] = 0;
                    continue;
                }
                
                if (Math.abs(numValue) > 5000) {
                    console.warn(`[Token Sanitizer] Out-of-bounds value for ${key}. Got: ${numValue}. Defaulting to 0.`);
                    sanitizedChanges[key] = 0;
                    continue;
                }

                sanitizedChanges[key] = numValue;
            }
        }
        return sanitizedChanges;
    };

    const updateToken = async (tokenId, changes) => {
        console.log(`[updateToken] Received for tokenId ${tokenId}:`, changes); // Re-add this log
        // Removed previous debug logs as they confirmed successful writes.
        const sanitizedChanges = sanitizeTokenChanges(changes);


        if (Object.keys(sanitizedChanges).length === 0) {
            console.log("[Token Update] All changes were sanitized out. No update will be performed.");
            return;
        }

        // Write to tokens_v2 subcollection (new way)
        const tokenRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'tokens_v2', String(tokenId));
        await setDoc(tokenRef, sanitizedChanges, { merge: true })
            .then(() => console.log(`[Firestore Success] Updated tokens_v2 for token ${tokenId} with:`, sanitizedChanges))
            .catch(error => console.error(`[Firestore Error] Failed to update tokens_v2 for token ${tokenId}:`, error));
    };

    const deleteToken = async (tokenId) => {
        if (!gameParams?.code) return;
        
        // Delete from tokens_v2 subcollection (new way)
        const tokenRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'tokens_v2', String(tokenId));
        await deleteDoc(tokenRef);
    };

    const updateMapState = (action, payload) => {
        const currentMap = data.campaign?.activeMap || {};

        switch (action) {
            case 'move_token':
                console.log(`[updateMapState] move_token payload for ${payload.tokenId}:`, payload); // Add this log
                updateToken(payload.tokenId, { x: payload.x, y: payload.y, z: payload.z }); // Ensure z is also passed
                break;
            case 'update_token':
                console.log(`[updateMapState] update_token payload for ${payload.id}:`, payload); // Add this log
                updateToken(payload.id, payload); // Pass the entire payload
                break;
            case 'delete_token':
                deleteToken(payload);
                break;
            case 'add_token':
                addToken(payload);
                break;
            case 'load_map':
                updateCampaign({ 'campaign.activeMap': { ...payload, id: payload.id || Date.now() } });
                break;
            case 'rename_map':
                const renamedMaps = (data.campaign?.savedMaps || []).map(m => 
                    m.id === payload.id ? { ...m, name: payload.newName } : m
                );
                updateCampaign({ 'campaign.savedMaps': renamedMaps });
                return;
            case 'delete_map':
                const filteredMaps = (data.campaign?.savedMaps || []).filter(m => m.id !== payload);
                updateCampaign({ 'campaign.savedMaps': filteredMaps });
                return;
            case 'update_map':
                const updatedSavedMaps = (data.campaign?.savedMaps || []).map(m => 
                    m.id === payload.id ? { ...m, ...payload } : m
                );
                updateCampaign({ 'campaign.savedMaps': updatedSavedMaps });
                return;
            case 'open_sheet':
                setData(prev => ({ ...prev, activeSheet: payload }));
                return;
            case 'close_sheet':
                setData(prev => ({ ...prev, activeSheet: null }));
                return;
            case 'toggle_journal':
                setData(prev => ({ ...prev, ui: { ...prev.ui, sidebar: prev.ui?.sidebar === 'journal' ? null : 'journal' } }));
                return;
            case 'toggle_chat':
                setData(prev => ({ ...prev, ui: { ...prev.ui, sidebar: prev.ui?.sidebar === 'chat' ? null : 'chat' } }));
                return;
        }
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
        const params = { code, role, uid, isOffline };
        setGameParams(params);
        if (!isOffline) { // Don't persist offline sessions
            localStorage.setItem('dungeonmind_last_campaign', JSON.stringify({ code, role, isOffline }));
        }
    };

    const leaveCampaign = () => {
        setGameParams(null);
        setData(INITIAL_APP_STATE);
        localStorage.removeItem('dungeonmind_last_campaign');
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

    const sendMessage = async (content, type = 'chat-public', targetId = null, contextMode = 'fast') => {
        if (!gameParams?.code) return;
        const msg = {
            content,
            type,
            targetId,
            senderId: user?.uid,
            senderName: user?.displayName || user?.email?.split('@')[0] || "Anonymous",
            timestamp: Date.now(),
            contextMode
        };
        const ref = collection(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code), 'chat');
        await setDoc(doc(ref), msg);
    };

    const deleteJournalPage = async (pageId) => {
        if (!gameParams?.code) return;
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId);
        await deleteDoc(ref);
    };
    
    const saveJournalPage = async (pageId, pageData) => {
        if (!gameParams?.code) return;
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId);
        await setDoc(ref, pageData, { merge: true });
    };

    // --- MEMOIZED VALUE (Prevents Infinite Renders & "1, M" Errors) ---
    const value = useMemo(() => ({
        data, setData, gameParams, 
        user, 
        joinCampaign, leaveCampaign, 
        updateCampaign, updateCloud, updateMapState, savePlayer, deletePlayer, 
        addToken, updateToken, deleteToken, // Exported for atomic access
        loreChunks, setLoreChunks, 
        sendMessage, deleteJournalPage, saveJournalPage, // Sidebar Helpers
        sendPing,
        triggerVfx,
        kickPlayer, banPlayer, unbanPlayer,
        isConnected
    }), [data, gameParams, loreChunks, user, isConnected]);

    return (
        <CampaignContext.Provider value={value}>
            {children}
        </CampaignContext.Provider>
    );
};
