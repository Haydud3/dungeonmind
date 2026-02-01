import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import * as fb from '../firebase';
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, deleteDoc, updateDoc, arrayUnion } from '../firebase';

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
    campaignMembers: [], 
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

        return () => { unsubRoot(); unsubPlayers(); unsubJournal(); unsubChat(); unsubLore(); };
    }, [gameParams, user]);

    // --- 2. ROBUST SESSION HANDSHAKE (Current User) ---
    useEffect(() => {
        if (!user || !gameParams?.code || gameParams.isOffline) return;

        const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        
        // Force write presence AND roster history immediately
        setDoc(rootRef, {
            [`activeUsers.${user.uid}`]: user.email || "Anonymous",
            campaignMembers: arrayUnion({
                uid: user.uid,
                email: user.email || "Anonymous",
                role: gameParams.role,
                joined: Date.now()
            })
        }, { merge: true }).catch(err => console.error("[HANDSHAKE ERROR]", err));
    }, [user?.uid, gameParams?.code, gameParams?.isOffline, gameParams?.role]);

    // --- 3. HOST SCAVENGER (Backfill missing members) ---
    // This runs ONLY on the DM's computer to fix the database for other players
    useEffect(() => {
        if (!data || !user || !gameParams?.code || gameParams.isOffline) return;
        
        // Only the Host runs this cleanup
        if (data.hostId === user.uid) {
            const currentMembers = data.campaignMembers || [];
            const memberIds = new Set(currentMembers.map(m => m.uid));
            const updates = [];

            // A. Scavenge from Active Users (Online right now but missing from Roster)
            Object.entries(data.activeUsers || {}).forEach(([uid, email]) => {
                if (!memberIds.has(uid)) {
                    updates.push({ uid, email, role: 'player', joined: Date.now() });
                    memberIds.add(uid); // Add to set to prevent duplicates
                }
            });

            // B. Scavenge from Character Sheets (Offline but have history)
            (data.players || []).forEach(p => {
                if (p.ownerId && p.ownerId !== 'anon' && !memberIds.has(p.ownerId)) {
                    // Use a placeholder name if we don't have their email in activeUsers
                    const email = data.activeUsers?.[p.ownerId] || "Offline Hero (Recovered)";
                    updates.push({ uid: p.ownerId, email: email, role: 'player', joined: Date.now() });
                    memberIds.add(p.ownerId);
                }
            });

            // C. Batch Update if missing members found
            if (updates.length > 0) {
                console.log("[HOST] Recovering missing members:", updates);
                const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
                
                // We use loop + arrayUnion because arrayUnion takes varargs, not an array of objects
                updates.forEach(m => {
                    updateDoc(rootRef, {
                        campaignMembers: arrayUnion(m)
                    }).catch(console.error);
                });
            }
        }
    }, [data.activeUsers, data.players, data.hostId, user?.uid, data.campaignMembers]);

     // --- 4. DATA ACTIONS ---
    const updateCloud = (newData, immediate = false) => {
        const sanitize = (obj) => {
            return JSON.parse(JSON.stringify(obj, (key, value) =>
                value === undefined ? null : value
            ));
        };

        const sanitizedData = sanitize(newData);
        const { players, chatLog, journal_pages, ...rootData } = sanitizedData;
        
        setData(prev => ({ ...prev, ...sanitizedData })); 

        if (gameParams?.isOffline) {
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
    };

    const leaveCampaign = () => {
        setGameParams(null);
        setData(INITIAL_APP_STATE);
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

    const value = useMemo(() => ({
        data, setData, gameParams, 
        joinCampaign, leaveCampaign, 
        updateCloud, savePlayer, deletePlayer, 
        loreChunks, setLoreChunks,
        sendPing
    }), [data, gameParams, loreChunks]);

    return (
        <CampaignContext.Provider value={value}>
            {children}
        </CampaignContext.Provider>
    );
};