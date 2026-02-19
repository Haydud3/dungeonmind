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

const INITIAL_APP_STATE = { ...DB_INIT_DATA, players: [], journal_pages: {}, chatLog: [], ui: { sidebar: null } };

export const CampaignProvider = ({ children }) => {
    const [gameParams, setGameParams] = useState(null); 
// --- CHANGES: Internal Auth State & Presence Trigger ---
    const [user, setUser] = useState(null);
    const [data, setData] = useState(INITIAL_APP_STATE);
    const [isConnected, setIsConnected] = useState(true); // Track connection status

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
            setIsConnected(true); // Offline mode is considered "connected" locally
            return;
        }

        const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
        
        // Listeners
        const unsubRoot = onSnapshot(rootRef, { includeMetadataChanges: true }, (snap) => {
            setIsConnected(!snap.metadata.fromCache); // Update connection status based on cache state

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

        // START CHANGE: Tokens Sub-collection Listener
        const tokensRef = collection(rootRef, 'tokens');
        const unsubTokens = onSnapshot(tokensRef, (snap) => {
            const tokens = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                // Step 3: Client-side filtering of hidden tokens for players to reduce state bloat
                .filter(t => {
                    return gameParams.role === 'dm' || !t.isHidden;
                });
            setData(prev => ({
                ...prev,
                campaign: {
                    ...prev.campaign,
                    activeMap: { ...prev.campaign.activeMap, tokens }
                }
            }));
        });
        // END CHANGE

        // Presence
        if (user && !isOffline) updateDoc(rootRef, { [`activeUsers.${user.uid}`]: user.email || "Anonymous" }).catch(console.error);

        return () => { unsubRoot(); unsubPlayers(); unsubJournal(); unsubChat(); unsubLore(); unsubTokens(); };
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
        if (newData.campaign) {
            updateCampaign({ 'campaign': newData.campaign }, immediate);
        }
    };

    // START CHANGE: Atomic Token Operations
    const addToken = (token) => {
        if (!gameParams?.code) return;
        // Optimistic Update
        setData(prev => {
            const currentTokens = prev.campaign?.activeMap?.tokens || [];
            return { ...prev, campaign: { ...prev.campaign, activeMap: { ...prev.campaign.activeMap, tokens: [...currentTokens, token] } } };
        });
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'tokens', String(token.id));
        setDoc(ref, token);
    };

    const updateToken = (tokenId, changes) => {
        if (!gameParams?.code) return;
        // Optimistic Update
        let tokenExists = false;
        setData(prev => {
            const currentTokens = prev.campaign?.activeMap?.tokens || [];
            tokenExists = currentTokens.some(t => String(t.id) === String(tokenId));
            if (!tokenExists) return prev; // Don't update if not found locally
            
            const newTokens = currentTokens.map(t => String(t.id) === String(tokenId) ? { ...t, ...changes } : t);
            return { ...prev, campaign: { ...prev.campaign, activeMap: { ...prev.campaign.activeMap, tokens: newTokens } } };
        });
        
        if (!tokenExists) return; // Stop if token was deleted locally

        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'tokens', String(tokenId));
        // Use setDoc with merge to handle potential sync race conditions without crashing
        setDoc(ref, changes, { merge: true }).catch(err => {
            console.warn("Token update failed (likely deleted):", err.message);
        });
    };

    const deleteToken = (tokenId) => {
        if (!gameParams?.code) return;
        // Optimistic Update
        setData(prev => {
            const currentTokens = prev.campaign?.activeMap?.tokens || [];
            const newTokens = currentTokens.filter(t => String(t.id) !== String(tokenId));
            return { ...prev, campaign: { ...prev.campaign, activeMap: { ...prev.campaign.activeMap, tokens: newTokens } } };
        });
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'tokens', String(tokenId));
        deleteDoc(ref);
    };
    // END CHANGE

    const updateMapState = (action, payload) => {
        const currentMap = data.campaign?.activeMap || {};

        switch (action) {
            case 'move_token':
                updateToken(payload.tokenId, { x: payload.x, y: payload.y });
                break;
            case 'update_token':
                updateToken(payload.id, payload);
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

    // START CHANGE: Chat & Journal Helpers for Sidebar Views
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
    // END CHANGE

    // --- MEMOIZED VALUE (Prevents Infinite Renders & "1, M" Errors) ---
    const value = useMemo(() => ({
        data, setData, gameParams, 
// --- CHANGES: Add user to exports ---
        user, 
        joinCampaign, leaveCampaign, 
// --- 2 lines after changes ---
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