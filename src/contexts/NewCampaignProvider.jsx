import React, { createContext, useContext, useState, useEffect } from 'react';
import * as fb from '../firebase';
import { doc, onSnapshot, updateDoc, deleteField, arrayUnion, arrayRemove, setDoc, deleteDoc, collection, query, orderBy, addDoc, writeBatch, getDocs } from '../firebase';

// Add this helper at the top of the file
const sanitize = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));

const NewCampaignContext = createContext(null);

export const useNewCampaign = () => {
    const context = useContext(NewCampaignContext);
    if (!context) {
        throw new Error("useNewCampaign must be used within a NewCampaignProvider");
    }
    return context;
};

export const NewCampaignProvider = ({ children }) => {
    const [gameParams, setGameParams] = useState(null);
    const [campaign, setCampaign] = useState(null);
    const [chatLog, setChatLog] = useState([]);
    const [journal_pages, setJournalPages] = useState({});
    const [error, setError] = useState(null);
    const [user, setUser] = useState(undefined);

    useEffect(() => {
        const unsubscribe = fb.onAuthStateChanged(fb.auth, setUser);
        return unsubscribe;
    }, []);

    useEffect(() => {
        const code = localStorage.getItem('dm_last_code');
        const role = localStorage.getItem('dm_last_role');
        
        if (code) {
            setGameParams({ code, role: role || 'player' });
        } else {
            // Fallback to older session keys
            const lastCampaign = localStorage.getItem('dungeonmind_last_campaign');
            if (lastCampaign) {
                try {
                    const parsed = JSON.parse(lastCampaign);
                    if (parsed.code) {
                        setGameParams(parsed);
                        localStorage.setItem('dm_last_code', parsed.code);
                        localStorage.setItem('dm_last_role', parsed.role || 'player');
                    }
                } catch (e) {
                    console.error("Failed to parse last campaign data:", e);
                    localStorage.removeItem('dungeonmind_last_campaign');
                }
            }
        }
    }, []);

    const [loreChunks, setLoreChunks] = useState([]);

    useEffect(() => {
        if (!gameParams || gameParams.isOffline) {
            setCampaign(null);
            setChatLog([]);
            setJournalPages({});
            setLoreChunks([]);
            return;
        }

        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);

        const unsubCampaign = onSnapshot(campaignRef, (doc) => {
            if (doc.exists()) {
                setCampaign(doc.data());
                setError(null);
            } else {
                setError("Campaign not found.");
                setCampaign(null);
            }
        }, (err) => {
            console.error("Error listening to campaign:", err);
            setError("Failed to listen to campaign updates.");
            setCampaign(null);
        });

        const chatRef = query(collection(campaignRef, 'chat'), orderBy('timestamp', 'asc'));
        const unsubChat = onSnapshot(chatRef, (snap) => {
            setChatLog(snap.docs.map(d => ({...d.data(), id: d.id})));
        });

        const journalRef = query(collection(campaignRef, 'journal'), orderBy('created', 'desc'));
        const unsubJournal = onSnapshot(journalRef, (snap) => {
            const pages = {};
            snap.docs.forEach(doc => {
                pages[doc.id] = { id: doc.id, ...doc.data() };
            });
            setJournalPages(pages);
        });

        const loreRef = collection(campaignRef, 'lore');
        const unsubLore = onSnapshot(loreRef, (snap) => {
            let allChunks = [];
            snap.docs.forEach(doc => { const v = doc.data(); if(v.chunks) allChunks = [...allChunks, ...v.chunks]; });
            setLoreChunks(allChunks);
        });

        return () => {
            unsubCampaign();
            unsubChat();
            unsubJournal();
            unsubLore();
        };
    }, [gameParams]);

    const updateCampaign = async (updates) => {
        if (!gameParams || gameParams.isOffline) {
            console.error("Cannot update campaign: no active campaign or in offline mode.");
            return;
        }
        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        try {
            // FIX: Wrap 'updates' in sanitize()
            await setDoc(campaignRef, sanitize(updates), { merge: true });
            console.log("Successfully Forged/Updated Campaign:", gameParams.code);
        } catch (err) {
            console.error("FIREBASE ERROR:", err);
            alert("Database Error: Check your Firestore Rules in the Firebase Console!");
        }
    };

    const kickPlayer = async (targetUid) => {
        if (!gameParams?.code || gameParams.isOffline) return;
        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        await updateDoc(campaignRef, { [`activeUsers.${targetUid}`]: deleteField() });
    };

    const banPlayer = async (targetUid) => {
        if (!gameParams?.code || gameParams.isOffline) return;
        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        await updateDoc(campaignRef, { 
            [`activeUsers.${targetUid}`]: deleteField(),
            bannedUsers: arrayUnion(targetUid)
        });
    };

    const unbanPlayer = async (targetUid) => {
        if (!gameParams?.code || gameParams.isOffline) return;
        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
        await updateDoc(campaignRef, { bannedUsers: arrayRemove(targetUid) });
    };

    const sendMessage = async (message) => {
        if (!gameParams?.code) return;
        const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
        await addDoc(chatRef, message);
    };

    const editMessage = async (messageId, newContent) => {
        if (!gameParams?.code) return;
        const messageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', messageId);
        await updateDoc(messageRef, { content: newContent });
    };

    const deleteMessage = async (messageId) => {
        if (!gameParams?.code) return;
        const messageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', messageId);
        await deleteDoc(messageRef);
    };

    const clearChat = async () => {
        if (!gameParams?.code) return;
        if (!confirm("Delete all chat history?")) return;

        const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
        const batch = writeBatch(fb.db);
        const snapshot = await getDocs(chatRef);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    };

    const joinCampaign = async (code, role, uid, isNew = false) => {
        // Path: artifacts -> dungeonmind -> public -> data -> campaigns -> CODE
        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);

        if (isNew && role === 'dm') {
            try {
                await setDoc(campaignRef, {
                    hostId: uid,
                    dmIds: [uid],
                    onboardingComplete: false,
                    createdAt: Date.now(),
                    players: [],
                    npcs: [],
                    journal_pages: {},
                    activeUsers: { [uid]: user?.email || 'DM' }
                }, { merge: true });
                console.log("Database initialized for", code);
            } catch (e) {
                console.error("Initialization failed:", e);
            }
        } else if (uid && uid !== 'anon') {
            // Register player presence in the activeUsers map so they show up in DM Settings
            try {
                await setDoc(campaignRef, {
                    activeUsers: { [uid]: user?.email || 'Player' }
                }, { merge: true });
            } catch (e) {
                console.error("Failed to register player presence:", e);
            }
        }

        // Now set params to trigger the switch to the game view
        setGameParams({ code, role, uid });
        localStorage.setItem('dm_last_code', code);
        localStorage.setItem('dm_last_role', role);
    };

    const leaveCampaign = () => {
        setGameParams(null);
        localStorage.removeItem('dungeonmind_last_campaign');
    };

    const saveJournalPage = async (pageId, pageData) => {
        if (!gameParams?.code) return;
        const pageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId);
        
        try {
            await setDoc(pageRef, sanitize(pageData), { merge: true });
            console.log("Journal Page Saved!");
        } catch (err) {
            console.error("Error saving journal page:", err);
        }
    };

    const deleteJournalPage = async (pageId) => {
        if (!gameParams?.code) return;
        const pageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId);
        await deleteDoc(pageRef);
    };

    const uploadLore = async (volumes) => {
        if (!gameParams?.code) return;
        
        try {
            // 1. Upload each volume (Using loop instead of batch to avoid size limits on large PDFs)
            for (let i = 0; i < volumes.length; i++) {
                const volId = `vol_${Date.now()}_${i}`;
                const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'lore', volId);
                await setDoc(ref, {
                    id: volId,
                    chunks: volumes[i],
                    timestamp: Date.now(),
                    type: 'pdf_volume'
                });
            }
        } catch (e) {
            console.error("Error uploading lore:", e);
            alert("Failed to save to cloud. Check console.");
        }
    };

    const deleteHandout = async (handoutId) => {
        if (!gameParams?.code) return;
        const newHandouts = campaign.handouts.filter(h => h.id !== handoutId);
        await updateCampaign({ handouts: newHandouts });
    };

    return (
        <NewCampaignContext.Provider value={{ user, campaign, chatLog, journal_pages, loreChunks, error, gameParams, joinCampaign, leaveCampaign, updateCampaign, kickPlayer, banPlayer, unbanPlayer, sendMessage, editMessage, deleteMessage, clearChat, saveJournalPage, deleteJournalPage, uploadLore, deleteHandout }}>
            {children}
        </NewCampaignContext.Provider>
    );
};
