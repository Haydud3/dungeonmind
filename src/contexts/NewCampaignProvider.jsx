import React, { createContext, useContext, useState, useEffect } from 'react';
import { useDialog } from '../components/DialogProvider';
import * as fb from '../firebase';
import { doc, onSnapshot, updateDoc, deleteField, arrayUnion, arrayRemove, setDoc, deleteDoc, collection, query, orderBy, addDoc, writeBatch, getDocs, getDoc } from '../firebase';

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
    const dialog = useDialog();
    const [campaign, setCampaign] = useState(null);
    const [chatLog, setChatLog] = useState([]);
    const [journal_pages, setJournalPages] = useState({});
    const [error, setError] = useState(null);
    const [user, setUser] = useState(undefined);

    useEffect(() => {
        const unsubscribe = fb.onAuthStateChanged(fb.auth, setUser);
        return unsubscribe;
    }, []);

    const [loreChunks, setLoreChunks] = useState([]);
    const [loreVolumes, setLoreVolumes] = useState([]);

    useEffect(() => {
        if (!gameParams || gameParams.isOffline) {
            setCampaign(null);
            setChatLog([]);
            setJournalPages({});
            setLoreChunks([]);
            return;
        }

        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);

        let localCampaign = null;
        let localCharacters = [];

        const updateMergedCampaign = () => {
            if (localCampaign) {
                const combinedPlayers = [...(localCampaign.players || [])];
                const combinedNpcs = [...(localCampaign.npcs || [])];
                
                localCharacters.forEach(char => {
                    if (char.type === 'player') {
                        const idx = combinedPlayers.findIndex(p => String(p.id) === String(char.id));
                        if (idx !== -1) combinedPlayers[idx] = char;
                        else combinedPlayers.push(char);
                    } else if (char.type === 'npc') {
                        const idx = combinedNpcs.findIndex(n => String(n.id) === String(char.id));
                        if (idx !== -1) combinedNpcs[idx] = char;
                        else combinedNpcs.push(char);
                    }
                });

                setCampaign({
                    ...localCampaign,
                    players: combinedPlayers,
                    npcs: combinedNpcs
                });
            }
        };

        const unsubCampaign = onSnapshot(campaignRef, (doc) => {
            if (doc.exists()) {
                localCampaign = doc.data();
                setError(null);
                updateMergedCampaign();
            } else {
                setError("Campaign not found.");
                setCampaign(null);
            }
        }, (err) => {
            console.error("Error listening to campaign:", err);
            setError("Failed to listen to campaign updates.");
            setCampaign(null);
        });

        const charsRef = collection(campaignRef, 'characters');
        const unsubChars = onSnapshot(charsRef, (snap) => {
            localCharacters = snap.docs.map(d => ({id: d.id, ...d.data()}));
            updateMergedCampaign();
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
            let allVols = [];
            snap.docs.forEach(doc => { 
                const v = { ...doc.data(), id: doc.id };
                allVols.push(v);
                if (v.chunks) allChunks = [...allChunks, ...v.chunks]; 
            });
            setLoreChunks(allChunks);
            setLoreVolumes(allVols);
        });

        return () => {
            unsubCampaign();
            unsubChars();
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
            // Expand dot-notation keys into nested objects so setDoc({merge: true}) deeply merges them properly
            const expandDotNotation = (obj) => {
                const result = {};
                for (const key in obj) {
                    if (key.includes('.')) {
                        const parts = key.split('.');
                        let current = result;
                        for (let i = 0; i < parts.length - 1; i++) {
                            if (!current[parts[i]]) current[parts[i]] = {};
                            current = current[parts[i]];
                        }
                        current[parts[parts.length - 1]] = obj[key];
                    } else {
                        result[key] = obj[key];
                    }
                }
                return result;
            };

            const expandedUpdates = expandDotNotation(updates);
            const updatesCopy = { ...expandedUpdates };
            let hasBatch = false;

            if (updatesCopy.players || updatesCopy.npcs) {
                const batch = writeBatch(fb.db);
                const charCollection = collection(campaignRef, 'characters');
                
                const currentCharsSnap = await getDocs(charCollection);
                const currentChars = currentCharsSnap.docs.map(d => ({ id: d.id, type: d.data().type }));

                if (updatesCopy.players) {
                    updatesCopy.players.forEach(p => {
                        const charRef = doc(charCollection, String(p.id));
                        batch.set(charRef, sanitize({ ...p, type: 'player' }), { merge: true });
                        hasBatch = true;
                    });
                    
                    const incomingIds = updatesCopy.players.map(p => String(p.id));
                    currentChars.filter(c => c.type === 'player').forEach(c => {
                        if (!incomingIds.includes(String(c.id))) {
                            batch.delete(doc(charCollection, String(c.id)));
                            hasBatch = true;
                        }
                    });
                    updatesCopy.players = [];
                }

                if (updatesCopy.npcs) {
                    updatesCopy.npcs.forEach(n => {
                        const charRef = doc(charCollection, String(n.id));
                        batch.set(charRef, sanitize({ ...n, type: 'npc' }), { merge: true });
                        hasBatch = true;
                    });
                    
                    const incomingIds = updatesCopy.npcs.map(n => String(n.id));
                    currentChars.filter(c => c.type === 'npc').forEach(c => {
                        if (!incomingIds.includes(String(c.id))) {
                            batch.delete(doc(charCollection, String(c.id)));
                            hasBatch = true;
                        }
                    });
                    updatesCopy.npcs = [];
                }

                if (Object.keys(updatesCopy).length > 0) {
                    batch.set(campaignRef, sanitize(updatesCopy), { merge: true });
                    hasBatch = true;
                }

                if (hasBatch) {
                    await batch.commit();
                    console.log("Successfully Forged/Updated Campaign with characters subcollection:", gameParams.code);
                    return;
                }
            }

            if (Object.keys(updatesCopy).length > 0) {
                await setDoc(campaignRef, sanitize(updatesCopy), { merge: true });
                console.log("Successfully Forged/Updated Campaign:", gameParams.code);
            }
        } catch (err) {
            console.error("FIREBASE ERROR:", err);
            dialog.alert("Database Error: Check your Firestore Rules in the Firebase Console!");
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

    const editMessage = async (messageId, newContent, newType = null) => {
        if (!gameParams?.code) return;
        const messageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', messageId);
        let updates = {};
        if (typeof newContent === 'object' && newContent !== null) {
            updates = { ...newContent };
        } else {
            updates = { content: newContent };
            if (newType) updates.type = newType;
        }
        await updateDoc(messageRef, updates);
    };

    const deleteMessage = async (messageId) => {
        if (!gameParams?.code) return;
        const messageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', messageId);
        await deleteDoc(messageRef);
    };

    const clearChat = async () => {
        if (!gameParams?.code) return;
        if (!(await dialog.confirm("Delete all chat history?"))) return;

        const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
        const batch = writeBatch(fb.db);
        const snapshot = await getDocs(chatRef);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    };

    const joinCampaign = async (code, role, uid, isNew = false, initialData = {}, selectedCharacter = null) => {
        // Path: artifacts -> dungeonmind -> public -> data -> campaigns -> CODE
        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);

        if (isNew && role === 'dm') {
            try {
                await setDoc(campaignRef, {
                    hostId: uid,
                    dmIds: [uid],
                    onboardingComplete: initialData.onboardingComplete ?? false,
                    createdAt: Date.now(),
                    players: [],
                    npcs: [],
                    journal_pages: {},
                    activeUsers: { [uid]: user?.displayName || 'DM' },
                    campaign: {
                        genesis: {
                            campaignName: initialData.campaignName || 'New Campaign',
                            tone: initialData.tone || 'Heroic',
                            conflict: initialData.conflict || 'Evil Arising'
                        }
                    },
                    ...initialData
                }, { merge: true });
                console.log("Database initialized for", code);
            } catch (e) {
                console.error("Initialization failed:", e);
            }
        } else if (uid && uid !== 'anon') {
            try {
                // Register player presence in the activeUsers map so they show up in DM Settings
                await updateDoc(campaignRef, {
                    [`activeUsers.${uid}`]: user?.displayName || 'Player'
                });
                
                // If a character was selected from the vault, we should add it to the players array
                if (selectedCharacter) {
                    const docSnap = await getDoc(campaignRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const players = data.players || [];
                        
                        // Check if a character with this ownerId already exists in this campaign
                        const existingIndex = players.findIndex(p => p.ownerId === uid && p.id === selectedCharacter.id);
                        
                        let updatedPlayers = [...players];
                        const charData = { 
                            ...selectedCharacter, 
                            ownerId: uid,
                            // Ensure the character has the correct shape for the campaign
                            hp: selectedCharacter.hp || { current: 10, max: 10, temp: 0 }
                        };
                        
                        if (existingIndex >= 0) {
                            // Update existing
                            updatedPlayers[existingIndex] = charData;
                        } else {
                            // Add new
                            updatedPlayers.push(charData);
                        }
                        
                        await updateDoc(campaignRef, { 
                            players: updatedPlayers, 
                            [`assignments.${uid}`]: selectedCharacter.id 
                        });
                    }
                }
                
            } catch (e) {
                console.error("Failed to register player presence:", e);
            }
        }

        // Now set params to trigger the switch to the game view
        setGameParams({ code, role, uid });
    };

    const leaveCampaign = () => {
        setGameParams(null);
        localStorage.removeItem('dungeonmind_last_campaign');
    };

    const saveJournalPage = async (pageId, pageData) => {
        if (!gameParams?.code) return;
        let actualId = pageId;
        let actualData = pageData;
        if (typeof pageId === 'object' && !pageData) {
            actualData = pageId;
            actualId = pageId.id || pageId.pageId || `page_${Date.now()}`;
        }
        if (!actualId || typeof actualId !== 'string') {
            actualId = `page_${Date.now()}`;
        }
        if (actualData && !actualData.id) {
            actualData.id = actualId;
        }
        const pageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', actualId);
        
        try {
            await setDoc(pageRef, sanitize(actualData), { merge: true });
            console.log("Journal Page Saved:", actualId);
        } catch (err) {
            console.error("Error saving journal page:", err);
            throw err;
        }
    };

    const deleteJournalPage = async (pageId) => {
        if (!gameParams?.code) return;
        const pageRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId);
        await deleteDoc(pageRef);
    };

    const uploadLore = async (volumes, docMetadata = null) => {
        if (!gameParams?.code) return;
        
        try {
            // 1. Upload each volume (Using loop instead of batch to avoid size limits on large PDFs)
            for (let i = 0; i < volumes.length; i++) {
                const volId = `vol_${Date.now()}_${i}`;
                const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'lore', volId);
                const payload = {
                    id: volId,
                    chunks: volumes[i],
                    timestamp: Date.now(),
                    type: docMetadata?.type || 'pdf_volume',
                    docId: docMetadata?.docId || `doc_${Date.now()}`,
                    docTitle: docMetadata?.title || docMetadata?.fileName || (volumes[i]?.[0]?.source) || 'Campaign Tome',
                    totalPages: docMetadata?.totalPages || volumes[i]?.[0]?.totalPages || volumes[i]?.length || 1
                };
                if (docMetadata?.category) payload.category = docMetadata.category;
                await setDoc(ref, payload);
            }
        } catch (e) {
            console.error("Error uploading lore:", e);
            dialog.alert("Failed to save to cloud. Check console.");
        }
    };

    const deleteLoreDoc = async (docIdentifier) => {
        if (!gameParams?.code) return;
        try {
            const loreRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'lore');
            const snap = await getDocs(loreRef);
            const toDelete = [];
            snap.docs.forEach(d => {
                const data = d.data();
                const matchesDocId = data.docId === docIdentifier || data.id === docIdentifier;
                const matchesTitle = data.docTitle === docIdentifier;
                const matchesSource = data.chunks?.some(c => c.source === docIdentifier || c.docId === docIdentifier || c.docTitle === docIdentifier);
                if (matchesDocId || matchesTitle || matchesSource) {
                    toDelete.push(d.id);
                }
            });
            for (const id of toDelete) {
                const dRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'lore', id);
                await deleteDoc(dRef);
            }
        } catch (e) {
            console.error("Error deleting lore document:", e);
            dialog.alert("Failed to remove tome from the archives.");
        }
    };

    const clearAllLore = async () => {
        if (!gameParams?.code) return;
        if (!(await dialog.confirm("Are you sure you want to clear all books from the High Archives? This cannot be undone."))) return;
        try {
            const loreRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'lore');
            const snap = await getDocs(loreRef);
            for (const d of snap.docs) {
                await deleteDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'lore', d.id));
            }
        } catch (e) {
            console.error("Error clearing lore:", e);
            dialog.alert("Failed to clear archives.");
        }
    };

    const addCustomLoreEntry = async ({ title, content, category = 'Custom Codex', tags = [] }) => {
        if (!gameParams?.code || !title?.trim()) return;
        const docId = `custom_${Date.now()}`;
        const chunk = {
            id: `chunk_${Date.now()}`,
            docId: docId,
            docTitle: title.trim(),
            source: title.trim(),
            category: category,
            tags: tags,
            page: 1,
            totalPages: 1,
            content: content.trim()
        };
        await uploadLore([[chunk]], {
            docId: docId,
            title: title.trim(),
            totalPages: 1,
            type: 'custom_codex',
            category: category
        });
    };

    const deleteHandout = async (handoutId) => {
        if (!gameParams?.code) return;
        const newHandouts = campaign.handouts.filter(h => h.id !== handoutId);
        await updateCampaign({ handouts: newHandouts });
    };

    return (
        <NewCampaignContext.Provider value={{ user, campaign, chatLog, journal_pages, loreChunks, loreVolumes, error, gameParams, joinCampaign, leaveCampaign, updateCampaign, kickPlayer, banPlayer, unbanPlayer, sendMessage, editMessage, deleteMessage, clearChat, saveJournalPage, deleteJournalPage, uploadLore, deleteLoreDoc, clearAllLore, addCustomLoreEntry, deleteHandout }}>
            {children}
        </NewCampaignContext.Provider>
    );
};
