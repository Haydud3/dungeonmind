import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import * as fb from '../firebase';
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, deleteDoc, updateDoc } from '../firebase';

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
    campaignMembers: [], // START CHANGE: New persistent member roster
    campaign: { 
        genesis: { tone: 'Heroic', conflict: 'Dragon vs Kingdom', campaignName: 'New Campaign' }, 
        activeMap: { url: null, revealPaths: [], tokens: [] }, 
        savedMaps: [], activeHandout: null, location: "Start", 
        combat: { active: false, round: 1, turn: 0, combatants: [] }
    }
};

const INITIAL_APP_STATE = { ...DB_INIT_DATA, players: [], journal_pages: {}, chatLog: [] };

export const CampaignProvider = ({ children, user }) => {
    const [gameParams, setGameParams] = useState(null); 
    const [data, setData] = useState(INITIAL_APP_STATE);
    const [loreChunks, setLoreChunks] = useState([]);
    const saveTimer = useRef(null);

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
        const unsubRoot = onSnapshot(rootRef, (snap) => {
            if (snap.exists()) {
                const d = snap.data();
                if (d.bannedUsers?.includes(uid)) {
                    localStorage.removeItem('dm_last_code'); setGameParams(null); return;
                }
                setData(prev => ({ ...prev, ...d })); 
            } else if (gameParams.role === 'dm') {
                setDoc(rootRef, { ...DB_INIT_DATA, hostId: uid, dmIds: [uid] });
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
    
    // START CHANGE: Persistent Member Management
    const addCampaignMember = (member) => {
        if (data.campaignMembers?.some(m => m.uid === member.uid)) return;

        const newMembers = [...(data.campaignMembers || []), { 
            uid: member.uid, 
            email: member.email || "Anonymous", 
            role: member.role,
            joined: Date.now()
        }];

        updateCloud({ ...data, campaignMembers: newMembers }, true);
    };

    const updateCloud = (newData, immediate = false) => {
// ---------------------------------------------------------
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
            if (!gameParams || gameParams.isOffline) return;
            const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
            setDoc(ref, rootData, { merge: true });
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

        // CRITICAL: Immediately add user to the persistent roster if online
        if (!isOffline && fb.auth.currentUser) {
            addCampaignMember({ uid, email: fb.auth.currentUser.email, role });
        }
    };

    const leaveCampaign = () => {
        setGameParams(null);
        setData(INITIAL_APP_STATE);
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

    // --- MEMOIZED VALUE (Prevents Infinite Renders & "1, M" Errors) ---
    const value = useMemo(() => ({
        data, setData, gameParams, 
        joinCampaign, leaveCampaign, 
        updateCloud, savePlayer, deletePlayer, 
        loreChunks, setLoreChunks,
        sendPing,
        addCampaignMember // Add to exports for initial join
    }), [data, gameParams, loreChunks]);

    return (
        <CampaignContext.Provider value={value}>
            {children}
        </CampaignContext.Provider>
    );
};