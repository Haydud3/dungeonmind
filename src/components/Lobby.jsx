import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import * as fb from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, query, where, onSnapshot, deleteField } from 'firebase/firestore';
import SheetContainer from './character-sheet/SheetContainer';
import DndBeyondImporter from './character-sheet/DndBeyondImporter';

const Lobby = ({ user, hideInviteCode, setHideInviteCode }) => {
    const { joinCampaign } = useNewCampaign();
    const [joinCode, setJoinCode] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [recents, setRecents] = useState([]);
    const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'characters'
    const [characters, setCharacters] = useState([]);
    const [editingCharacter, setEditingCharacter] = useState(null);
    const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
    const [newCampaignData, setNewCampaignData] = useState({ name: '', theme: 'Heroic Fantasy', coverImage: '' });
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [showDndBeyondImport, setShowDndBeyondImport] = useState(false);
    const [autoJoin, setAutoJoin] = useState(() => localStorage.getItem('dm_auto_join') === 'true');
    const [localDisplayName, setLocalDisplayName] = useState(user?.displayName || 'Adventurer');
    const [localPhotoUrl, setLocalPhotoUrl] = useState(user?.photoURL || '');
    const [editProfileData, setEditProfileData] = useState({ displayName: '', photoURL: '' });

    useEffect(() => {
        if (user) {
            setLocalDisplayName(user.displayName || 'Adventurer');
            setLocalPhotoUrl(user.photoURL || '');
        }
    }, [user]);

    const openProfileEdit = () => {
        setEditProfileData({ displayName: localDisplayName, photoURL: localPhotoUrl });
        setActiveTab('profile');
    };

    const handleSaveProfile = async () => {
        const newName = editProfileData.displayName.trim() || 'Adventurer';
        const newPhoto = editProfileData.photoURL.trim();
        try {
            await user.updateProfile({ displayName: newName, photoURL: newPhoto });
            setLocalDisplayName(newName);
            setLocalPhotoUrl(newPhoto);
            alert("Profile updated successfully!");
        } catch (err) {
            console.error("Failed to update profile", err);
            alert("Failed to update profile.");
        }
    };
    
    // Waiting Room State
    const [isJoiningCampaign, setIsJoiningCampaign] = useState(false);
    const [joiningCode, setJoiningCode] = useState("");
    const [selectedCharacterId, setSelectedCharacterId] = useState(null);
    const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);

    // Auto-join logic based on URL parameter
    useEffect(() => {
        const checkInviteParams = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const joinCodeParam = urlParams.get('join');
            const inviteTokenParam = urlParams.get('invite');
            
            if (joinCodeParam) {
                handleJoinClick(joinCodeParam);
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (inviteTokenParam) {
                try {
                    const q = query(collection(fb.db, 'campaigns'), where('campaign.inviteToken', '==', inviteTokenParam));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        const campaignDoc = snapshot.docs[0];
                        handleJoinClick(campaignDoc.id);
                    } else {
                        alert("This invite link is invalid or has been reset by the Dungeon Master.");
                    }
                } catch (e) {
                    console.error("Failed to resolve invite link", e);
                }
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (localStorage.getItem('dm_auto_join') === 'true' && !sessionStorage.getItem('dm_auto_join_attempted') && user) {
                sessionStorage.setItem('dm_auto_join_attempted', 'true'); // Prevent infinite loop if they explicitly click "Leave Campaign"
                try {
                    const lastSessionStr = localStorage.getItem('dm_last_session');
                    if (lastSessionStr) {
                        const lastSession = JSON.parse(lastSessionStr);
                        if (lastSession && lastSession.code) {
                            if (lastSession.role === 'dm') {
                                addToRecents(lastSession.code, 'dm');
                                joinCampaign(lastSession.code, 'dm', user.uid);
                            } else {
                                let selectedChar = null;
                                if (lastSession.characterId && user.uid) {
                                    const charRef = doc(fb.db, 'users', user.uid, 'characters', lastSession.characterId);
                                    const charDoc = await getDoc(charRef);
                                    if (charDoc.exists()) {
                                        selectedChar = { id: charDoc.id, ...charDoc.data() };
                                    }
                                }
                                addToRecents(lastSession.code, 'player');
                                joinCampaign(lastSession.code, 'player', user.uid, false, {}, selectedChar);
                            }
                        }
                    }
                } catch(e) {
                    console.error("Auto-join failed", e);
                }
            }
        };
        checkInviteParams();
    }, [user]); // We re-run this when 'user' state changes so it works after login

    const generateCoverImage = async () => {
        if (!newCampaignData.name) return;
        setIsGeneratingImage(true);
        try {
            const prompt = `Fantasy roleplaying game campaign cover art for "${newCampaignData.name}". Theme: ${newCampaignData.theme}. Epic, high quality digital illustration, cinematic lighting, no text, no words.`;
            const seed = Math.floor(Math.random() * 100000);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=400&nologo=true&seed=${seed}`;
            
            // Preload the image to ensure it's ready before showing
            const img = new Image();
            img.onload = () => {
                setNewCampaignData(prev => ({ ...prev, coverImage: imageUrl }));
                setIsGeneratingImage(false);
            };
            img.onerror = () => {
                console.error("Failed to load generated image");
                setIsGeneratingImage(false);
            };
            img.src = imageUrl;
        } catch (e) {
            console.error("Failed to generate cover image", e);
            setIsGeneratingImage(false);
        }
    };

    useEffect(() => {
// ... (rest is the same, so I'll include the fetchRecents logic as is)
        const fetchRecents = async () => {
            let localRecents = [];
            try {
                const saved = localStorage.getItem('dm_recents');
                if (saved) localRecents = JSON.parse(saved);
            } catch(e) {}
            
            if (user && user.uid) {
                try {
                    const userDocRef = doc(fb.db, 'users', user.uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                    const cloudRecents = userDoc.data().recents || [];
                    if (cloudRecents.length > 0) {
                        localRecents = cloudRecents;
                    }
                    }
                } catch(e) {
                    console.error("Failed to fetch recents from cloud", e);
                }

                try {
                    const charRef = collection(fb.db, 'users', user.uid, 'characters');
                    const snapshot = await getDocs(charRef);
                    const chars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setCharacters(chars);
                } catch(e) {
                    console.error("Failed to fetch characters", e);
                }
        }
        
        if (localRecents.length > 0) {
            // Fetch fresh campaign data to ensure names/images are up-to-date for ALL recents
            localRecents = await Promise.all(localRecents.map(async (r) => {
                try {
                    const campDoc = await getDoc(doc(fb.db, 'campaigns', r.code));
                    if (campDoc.exists()) {
                        const cData = campDoc.data();
                        return {
                            ...r,
                            name: cData.campaign?.genesis?.campaignName || cData.campaignName || r.name,
                            coverImage: cData.campaign?.genesis?.coverImage || cData.coverImage || r.coverImage,
                            theme: cData.campaign?.genesis?.tone || cData.tone || r.theme
                        };
                    }
                } catch (e) {
                    console.error("Failed to sync realm info", e);
                }
                return r;
            }));
            setRecents(localRecents);
            localStorage.setItem('dm_recents', JSON.stringify(localRecents));
            } else {
                setRecents(localRecents);
            }
        };
        fetchRecents();
    }, [user]);

    const handleImportCharacter = async (charData) => {
        if (!user || !charData) return;
        try {
            const charRef = collection(fb.db, 'users', user.uid, 'characters');
            const newChar = { ...charData, dateCreated: Date.now() };
            const docRef = await addDoc(charRef, newChar);
            const savedChar = { id: docRef.id, ...newChar };
            setCharacters(prev => [...prev, savedChar]);
            setShowDndBeyondImport(false);
        } catch(e) {
            console.error("Failed to import character", e);
        }
    };

    const handleCreateCharacter = async () => {
        if (!user) return;
        const newChar = {
            name: "New Adventurer",
            class: "Fighter",
            level: 1,
            hp: { max: 10, current: 10, temp: 0 },
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            modifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
            dateCreated: Date.now()
        };
        try {
            const charRef = collection(fb.db, 'users', user.uid, 'characters');
            const docRef = await addDoc(charRef, newChar);
            const savedChar = { id: docRef.id, ...newChar };
            setCharacters(prev => [...prev, savedChar]);
            setEditingCharacter(savedChar);
        } catch(e) {
            console.error("Failed to create character", e);
        }
    };

    const handleSaveCharacter = async (updatedChar) => {
        if (!user) return;
        try {
            const charRef = doc(fb.db, 'users', user.uid, 'characters', updatedChar.id);
            await updateDoc(charRef, updatedChar);
            setCharacters(prev => prev.map(c => c.id === updatedChar.id ? updatedChar : c));
        } catch(e) {
            console.error("Failed to save character", e);
        }
    };

    const handleLogin = async () => {
        if(!fb) return;
        setIsLoggingIn(true);
        try {
            await fb.signInWithPopup(fb.auth, fb.googleProvider);
        } catch (e) { alert("Login Error: " + e.message); setIsLoggingIn(false); }
    };

    const addToRecents = async (code, role, campaignName = null, coverImage = null, theme = null) => {
        const existing = recents.find(r => r.code === code);
        const finalName = campaignName || existing?.name || null;
        const finalCover = coverImage || existing?.coverImage || null;
        const finalTheme = theme || existing?.theme || null;
        
        const newItem = { code, role, date: Date.now(), name: finalName, coverImage: finalCover, theme: finalTheme };
        const newRecents = [newItem, ...recents.filter(r => r.code !== code)];
        setRecents(newRecents);
        localStorage.setItem('dm_recents', JSON.stringify(newRecents));
        
        if (user && user.uid) {
            try {
                const userDocRef = doc(fb.db, 'users', user.uid);
                await setDoc(userDocRef, { recents: newRecents }, { merge: true });
            } catch(e) {
                console.error("Failed to sync recents to cloud", e);
            }
        }
    };

    const openCampaignWizard = () => {
        if (!user) {
            alert("You must be logged in to Forge a new Realm.");
            return;
        }
        setNewCampaignData({ name: '', theme: 'Heroic Fantasy', coverImage: '' });
        setIsCreatingCampaign(true);
    };

    const finalizeCampaignCreation = async () => {
        setIsCreatingCampaign(false);
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const initialData = {
            onboardingComplete: true, // Skip VTT wizard
            campaignName: newCampaignData.name || 'New Realm',
            tone: newCampaignData.theme,
            coverImage: newCampaignData.coverImage,
            inviteToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            campaign: {
                genesis: {
                    campaignName: newCampaignData.name || 'New Realm',
                    tone: newCampaignData.theme,
                    coverImage: newCampaignData.coverImage
                }
            }
        };

        addToRecents(newCode, 'dm', initialData.campaignName, initialData.coverImage, initialData.tone);
        localStorage.setItem('dm_last_session', JSON.stringify({ code: newCode, role: 'dm' }));
        await joinCampaign(newCode, 'dm', user.uid, true, initialData);
    };

    const handleJoinClick = (code, role = 'player') => {
        if (!code) return;
        const formattedCode = code.toUpperCase();
        
        if (!user) {
            joinCampaign(formattedCode, role, 'anon');
            return;
        }

        if (role === 'dm') {
            addToRecents(formattedCode, 'dm');
            localStorage.setItem('dm_last_session', JSON.stringify({ code: formattedCode, role: 'dm' }));
            joinCampaign(formattedCode, 'dm', user.uid);
            return;
        }

        setJoiningCode(formattedCode);
        setIsJoiningCampaign(true);
        if (characters.length > 0 && !selectedCharacterId) {
            setSelectedCharacterId(characters[0].id);
        }
    };

    const finalizeJoin = async () => {
        setIsJoiningCampaign(false);
        
        const selectedChar = characters.find(c => c.id === selectedCharacterId) || null;
        
        try {
            const campDoc = await getDoc(doc(fb.db, 'campaigns', joiningCode));
            if (campDoc.exists() && campDoc.data().campaign?.requireApproval) {
                setIsInWaitingRoom(true);
                const reqRef = doc(fb.db, 'campaigns', joiningCode, 'joinRequests', user.uid);
                
                await setDoc(reqRef, {
                    uid: user.uid,
                    name: user.displayName || 'Player',
                    characterId: selectedCharacterId || null,
                    characterName: selectedChar ? selectedChar.name : null,
                    status: 'pending',
                    timestamp: Date.now()
                });
                
                const unsub = onSnapshot(reqRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const status = docSnap.data().status;
                        if (status === 'approved') {
                            unsub();
                            setIsInWaitingRoom(false);
                            addToRecents(joiningCode, 'player');
                            localStorage.setItem('dm_last_session', JSON.stringify({ code: joiningCode, role: 'player', characterId: selectedCharacterId }));
                            joinCampaign(joiningCode, 'player', user.uid, false, {}, selectedChar);
                        } else if (status === 'denied') {
                            unsub();
                            setIsInWaitingRoom(false);
                            alert("Your request to join was denied by the Dungeon Master.");
                        }
                    }
                });
                return;
            }
        } catch (e) {
            console.error("Failed to check approval setting", e);
        }

        addToRecents(joiningCode, 'player');
        localStorage.setItem('dm_last_session', JSON.stringify({ code: joiningCode, role: 'player', characterId: selectedCharacterId }));
        joinCampaign(joiningCode, 'player', user.uid, false, {}, selectedChar);
    };

    const deleteCampaign = async (e, item) => {
        e.stopPropagation();
        
        const isDm = item.role === 'dm';
        const confirmMessage = isDm 
            ? `Permanently delete the realm "${item.name || item.code}" and all its data? This cannot be undone.` 
            : `Leave the realm "${item.name || item.code}"?`;
            
        if (confirm(confirmMessage)) {
            const newRecents = recents.filter(r => r.code !== item.code);
            setRecents(newRecents);
            localStorage.setItem('dm_recents', JSON.stringify(newRecents));
            
            if (user && user.uid) {
                try {
                    const userDocRef = doc(fb.db, 'users', user.uid);
                    await setDoc(userDocRef, { recents: newRecents }, { merge: true });
                    
                    if (isDm) {
                        await deleteDoc(doc(fb.db, 'campaigns', item.code));
                    } else {
                        const campRef = doc(fb.db, 'campaigns', item.code);
                        const campDoc = await getDoc(campRef);
                        if (campDoc.exists()) {
                            const updates = {};
                            updates[`activeUsers.${user.uid}`] = deleteField();
                            updates[`assignments.${user.uid}`] = deleteField();
                            await updateDoc(campRef, updates);
                        }
                    }
                } catch(err) {
                    console.error("Failed to update campaign connection", err);
                }
            }
        }
    };

    // --- LOGGED OUT VIEW ---
    if (!user) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=2544&auto=format&fit=crop')] bg-cover bg-center relative">
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"></div>
                <div className="relative z-10 w-full max-w-md p-8 glass-panel md:rounded-2xl shadow-2xl border-none md:border border-slate-700/50 flex flex-col justify-center items-center bg-slate-900/60 backdrop-blur-xl">
                    <div className="text-center mb-8 flex flex-col items-center">
                        <img 
                            src={`${import.meta.env.BASE_URL}logo.png`} 
                            className="w-28 h-28 rounded-full border-4 border-amber-500/30 shadow-[0_0_40px_rgba(217,119,6,0.2)] mb-6 object-cover" 
                            alt="Logo"
                        />
                        <h1 className="text-5xl fantasy-font text-amber-500 mb-3 text-shadow tracking-wide">DungeonMind</h1>
                        <p className="text-slate-300 text-sm font-medium tracking-wide">The AI-Powered VTT & Campaign Manager</p>
                    </div>

                    <button onClick={handleLogin} disabled={isLoggingIn} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-bold text-lg mb-4 flex justify-center items-center gap-3 transition-all shadow-lg hover:shadow-indigo-500/25">
                        {isLoggingIn ? "Connecting to realm..." : <><Icon name="log-in" size={24}/> Continue with Google</>}
                    </button>
                    <p className="text-xs text-slate-500 mt-4 text-center">By continuing, you agree to roll with the punches.</p>
                </div>
            </div>
        );
    }

    // --- LOGGED IN DASHBOARD VIEW ---
    return (
        <div className="h-screen w-full flex flex-col md:flex-row bg-slate-950 text-slate-200 font-sans overflow-hidden">
            
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col shrink-0 z-20">
                <div className="p-6 flex items-center gap-3 border-b border-slate-800 shrink-0">
                    <img src={`${import.meta.env.BASE_URL}logo.png`} className="w-10 h-10 rounded-full shadow-[0_0_15px_rgba(217,119,6,0.3)] object-cover" alt="Logo" />
                    <span className="text-xl fantasy-font text-amber-500 tracking-wide text-shadow">DungeonMind</span>
                </div>
                
                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 flex md:flex-col custom-scroll md:overflow-x-hidden overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('campaigns')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all whitespace-nowrap md:whitespace-normal w-full text-left ${activeTab === 'campaigns' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                        <Icon name="map" size={18} /> My Campaigns
                    </button>
                    <button 
                        onClick={() => setActiveTab('characters')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all whitespace-nowrap md:whitespace-normal w-full text-left ${activeTab === 'characters' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                        <Icon name="users" size={18} /> My Characters
                    </button>
                    <button 
                        onClick={openProfileEdit}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-all whitespace-nowrap md:whitespace-normal w-full text-left ${activeTab === 'profile' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                        <Icon name="user" size={18} /> My Profile
                    </button>
                </div>

                <div className="p-4 border-t border-slate-800 shrink-0 bg-slate-900/50">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0 uppercase overflow-hidden border border-slate-600">
                                {localPhotoUrl ? <img src={localPhotoUrl} alt="Profile" className="w-full h-full object-cover" /> : (localDisplayName[0] || '?')}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-slate-200 truncate">{localDisplayName}</span>
                                <span className="text-[10px] text-slate-500 font-mono truncate">ID: {user.uid.substring(0, 8)}</span>
                            </div>
                        </div>
                        <button onClick={openProfileEdit} className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors" title="Edit Profile">
                            <Icon name="edit-2" size={14} />
                        </button>
                    </div>
                    
                    <button 
                        onClick={() => {
                            const newValue = !hideInviteCode;
                            setHideInviteCode(newValue);
                        }} 
                        className={`w-full flex items-center justify-between mb-3 px-3 py-2 rounded transition-colors text-sm font-bold ${hideInviteCode ? 'bg-red-900/40 text-red-400 border border-red-900/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Icon name={hideInviteCode ? "eye-off" : "eye"} size={16} /> Streamer Mode
                        </div>
                        <span className="text-[10px] uppercase tracking-widest">{hideInviteCode ? 'ON' : 'OFF'}</span>
                    </button>

                    <button 
                        onClick={() => {
                            const newValue = !autoJoin;
                            setAutoJoin(newValue);
                            localStorage.setItem('dm_auto_join', String(newValue));
                        }} 
                        className={`w-full flex items-center justify-between mb-3 px-3 py-2 rounded transition-colors text-sm font-bold ${autoJoin ? 'bg-indigo-900/40 text-indigo-400 border border-indigo-900/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Icon name="fast-forward" size={16} /> Auto-Join Session
                        </div>
                        <span className="text-[10px] uppercase tracking-widest">{autoJoin ? 'ON' : 'OFF'}</span>
                    </button>

                    <button onClick={() => fb.signOut(fb.auth)} className="w-full flex items-center justify-center gap-2 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors text-sm font-bold">
                        <Icon name="log-out" size={14} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative bg-slate-950 custom-scroll">
                
                {activeTab === 'campaigns' && (
                    <div className="p-6 md:p-10 max-w-7xl mx-auto">
                        
                        {/* Header & Quick Actions */}
                        <div className="flex flex-col xl:flex-row gap-6 mb-12 items-start xl:items-stretch">
                            <div className="flex-1">
                                <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Welcome Back.</h1>
                                <p className="text-slate-400 mb-6">Create a new realm or join an existing adventure.</p>
                                
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <button onClick={openCampaignWizard} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-amber-900/20 transition-all border border-amber-500/50">
                                        <Icon name="plus-circle" size={20} /> Forge New Realm
                                    </button>
                                    
                                    <div className="flex-1 flex bg-slate-900 p-1 rounded-xl border border-slate-800 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
                                        <input 
                                            value={joinCode} 
                                            onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                                            placeholder="ENTER INVITE CODE" 
                                            className="flex-1 bg-transparent px-4 text-center font-mono tracking-widest text-lg outline-none text-white placeholder:text-slate-600 w-full"
                                            onKeyDown={(e) => e.key === 'Enter' && handleJoinClick(joinCode)}
                                        />
                                        <button 
                                            onClick={() => handleJoinClick(joinCode)} 
                                            disabled={!joinCode} 
                                            className={`px-6 rounded-lg font-bold transition-all ${joinCode ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md' : 'bg-transparent text-slate-600 cursor-not-allowed'}`}
                                        >
                                            Join
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Campaigns Grid */}
                        <div>
                            <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-2">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Icon name="map" size={20} className="text-indigo-400" /> My Realms
                                </h2>
                            </div>

                            {recents.length === 0 ? (
                                <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-slate-800/50 border-dashed">
                                    <Icon name="map" size={48} className="mx-auto text-slate-700 mb-4" />
                                    <h3 className="text-lg font-bold text-slate-400 mb-2">No Active Campaigns</h3>
                                    <p className="text-sm text-slate-500 max-w-sm mx-auto">You haven't joined or created any realms yet. Create a new one or enter a code to get started.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {recents.map((r, i) => {
                                        // Generate a pseudo-random seed based on the campaign code for the placeholder image
                                        const seed = r.code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                                        const bgUrl = r.coverImage || `https://picsum.photos/seed/${seed}/600/300`;
                                        
                                        return (
                                            <div 
                                                key={r.code + i} 
                                                onClick={() => handleJoinClick(r.code, r.role)} 
                                                onContextMenu={(e) => {
                                                    if (r.role === 'dm') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const newName = window.prompt("Rename Campaign:", r.name || `Realm ${r.code}`);
                                                        if (newName && newName.trim() && newName.trim() !== r.name) {
                                                            const finalName = newName.trim();
                                                            // 1. Update Firestore Campaign
                                                            updateDoc(doc(fb.db, 'campaigns', r.code), {
                                                                'campaign.genesis.campaignName': finalName
                                                            }).catch(err => console.error("Rename failed", err));
                                                            
                                                            // 2. Update Local State and User Doc
                                                            const newRecents = recents.map(item => item.code === r.code ? { ...item, name: finalName } : item);
                                                            setRecents(newRecents);
                                                            setDoc(doc(fb.db, 'users', user.uid), { recents: newRecents }, { merge: true });
                                                        }
                                                    }
                                                }}
                                                className="group relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:shadow-amber-900/10 hover:-translate-y-1 flex flex-col"
                                                title={r.role === 'dm' ? "Left-click to join. Right-click to rename." : "Click to join"}
                                            >
                                                {/* Card Header/Banner */}
                                                <div className="h-32 w-full relative">
                                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent z-10"></div>
                                                    <img src={bgUrl} alt="Campaign Cover" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
                                                    <div className="absolute top-3 right-3 z-20">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md ${r.role === 'dm' ? 'bg-amber-600/80 text-white border border-amber-500/50' : 'bg-indigo-600/80 text-white border border-indigo-500/50'}`}>
                                                            {r.role === 'dm' ? 'Dungeon Master' : 'Player'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Card Body */}
                                                <div className="p-5 flex-1 flex flex-col justify-between relative z-20 bg-slate-900">
                                                    <div>
                                                        <h3 className="font-bold text-xl text-white mb-1 tracking-wide truncate">{r.name || `Realm ${r.code}`}</h3>
                                                        <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                                                            <Icon name="calendar" size={12} /> Last active: {new Date(r.date).toLocaleDateString()}
                                                        </p>
                                                        {r.theme && (
                                                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                                                {r.theme}
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="mt-4 flex justify-between items-center border-t border-slate-800/50 pt-4">
                                                        <span className="text-sm font-mono text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                                                            {hideInviteCode ? '••••••' : r.code}
                                                        </span>
                                                        <button 
                                                            onClick={(e) => deleteCampaign(e, r)} 
                                                            className="text-slate-500 hover:text-red-400 p-2 rounded-full hover:bg-slate-800 transition-colors"
                                                            title={r.role === 'dm' ? "Delete Campaign" : "Leave Campaign"}
                                                        >
                                                            {r.role === 'dm' ? <Icon name="trash-2" size={16} /> : <Icon name="log-out" size={16} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'characters' && !editingCharacter && (
                    <div className="p-6 md:p-10 max-w-7xl mx-auto">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                            <div>
                                <h1 className="text-3xl md:text-4xl font-black text-white mb-2">My Characters</h1>
                                <p className="text-slate-400">Manage your heroes across all your campaigns.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowDndBeyondImport(true)} className="bg-slate-800 hover:bg-slate-700 text-white py-3 px-6 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all border border-slate-700 hover:border-indigo-500/50">
                                    <Icon name="download" size={20} /> Import D&D Beyond
                                </button>
                                <button onClick={handleCreateCharacter} className="bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-6 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all border border-indigo-500/50">
                                    <Icon name="user-plus" size={20} /> Create Character
                                </button>
                            </div>
                        </div>

                        {characters.length === 0 ? (
                            <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-slate-800/50 border-dashed">
                                <div className="relative w-24 h-24 mx-auto mb-6">
                                    <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping"></div>
                                    <div className="relative bg-slate-800 rounded-full w-24 h-24 flex items-center justify-center border-2 border-indigo-500/30">
                                        <Icon name="users" size={40} className="text-indigo-400" />
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Your Vault is Empty</h3>
                                <p className="text-sm text-slate-400 max-w-md mx-auto">
                                    Create a new character to get started. You can use this character when joining any compatible campaign.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {characters.map(char => (
                                    <div key={char.id} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer shadow-lg hover:-translate-y-1 flex flex-col">
                                        <div className="p-5 flex items-center gap-4">
                                            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700 overflow-hidden shrink-0 flex items-center justify-center text-slate-500">
                                                {char.avatarUrl ? <img src={char.avatarUrl} className="w-full h-full object-cover" alt="Avatar"/> : <Icon name="user" size={24} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-xl text-white truncate">{char.name || "Unnamed"}</h3>
                                                <p className="text-sm text-slate-400 truncate">Lvl {char.level || 1} {char.class || "Commoner"}</p>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-slate-900/50 border-t border-slate-800 flex justify-between">
                                            <button onClick={() => setEditingCharacter(char)} className="text-indigo-400 hover:text-indigo-300 text-sm font-bold flex items-center gap-1">
                                                <Icon name="edit" size={14} /> Edit
                                            </button>
                                            <button onClick={(e) => {
                                                e.stopPropagation();
                                                if(confirm("Delete this character?")) {
                                                    deleteDoc(doc(fb.db, 'users', user.uid, 'characters', char.id)).then(() => {
                                                        setCharacters(prev => prev.filter(c => c.id !== char.id));
                                                    });
                                                }
                                            }} className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-1">
                                                <Icon name="trash-2" size={14} /> Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {activeTab === 'profile' && (
                    <div className="p-6 md:p-10 max-w-4xl mx-auto animate-in fade-in">
                        <div className="mb-10">
                            <h1 className="text-3xl md:text-4xl font-black text-white mb-2">My Profile</h1>
                            <p className="text-slate-400">Manage your global account settings.</p>
                        </div>
                        
                        <div className="bg-slate-900 p-6 md:p-8 rounded-xl border border-slate-800 shadow-xl space-y-6">
                            <div className="flex items-center gap-6 pb-6 border-b border-slate-800">
                                <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-slate-700 overflow-hidden shrink-0 flex items-center justify-center text-3xl font-bold text-slate-500">
                                    {localPhotoUrl ? <img src={localPhotoUrl} alt="Profile" className="w-full h-full object-cover" /> : (localDisplayName[0] || '?')}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-white">{localDisplayName}</h3>
                                    <p className="text-sm text-slate-500 font-mono mt-1">ID: {user.uid}</p>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-2">Display Name</label>
                                    <input type="text" value={editProfileData.displayName} onChange={(e) => setEditProfileData(prev => ({ ...prev, displayName: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none" />
                                    <p className="text-[10px] text-slate-500 mt-1">This name will be used as your default sender name in chat across all campaigns.</p>
                                </div>
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-2">Profile Avatar URL</label>
                                    <input type="text" value={editProfileData.photoURL} onChange={(e) => setEditProfileData(prev => ({ ...prev, photoURL: e.target.value }))} placeholder="https://..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none font-mono text-sm" />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end">
                                <button onClick={handleSaveProfile} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2"><Icon name="save" size={18} /> Save Profile</button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'characters' && editingCharacter && (
                    <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950 shrink-0">
                            <button onClick={() => setEditingCharacter(null)} className="text-slate-400 hover:text-white flex items-center gap-2">
                                <Icon name="arrow-left" size={20} /> Back to Vault
                            </button>
                            <h2 className="text-xl font-bold text-white">Character Editor</h2>
                            <div className="w-20"></div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <SheetContainer 
                                character={editingCharacter} 
                                onSave={handleSaveCharacter} 
                                isOwner={true}
                                role="player"
                                onDiceRoll={() => {}} 
                            />
                        </div>
                    </div>
                )}

                <div className="absolute bottom-4 right-6 text-xs text-slate-600 font-mono">
                    <button onClick={() => joinCampaign('LOCAL', 'dm', 'admin', true)} className="hover:text-slate-400 transition-colors">Launch Offline Mode</button>
                </div>
                
                {/* Campaign Creation Modal */}
                {isCreatingCampaign && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsCreatingCampaign(false)}>
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black text-amber-500 fantasy-font tracking-wider">Forge New Realm</h2>
                                    <p className="text-sm text-slate-400">Establish the foundation for your next adventure.</p>
                                </div>
                                <button onClick={() => setIsCreatingCampaign(false)} className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors">
                                    <Icon name="x" size={24} />
                                </button>
                            </div>
                            
                            <div className="p-6 space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-2">Realm Name</label>
                                    <input 
                                        type="text" 
                                        value={newCampaignData.name}
                                        onChange={(e) => setNewCampaignData(prev => ({...prev, name: e.target.value}))}
                                        placeholder="e.g., Curse of the Crimson Crown"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                                        autoFocus
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-2">Campaign Theme</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['Heroic Fantasy', 'Dark Fantasy', 'Sci-Fi / Cyberpunk', 'Gothic Horror'].map(theme => (
                                            <button
                                                key={theme}
                                                onClick={() => setNewCampaignData(prev => ({...prev, theme}))}
                                                className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${newCampaignData.theme === theme ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-600'}`}
                                            >
                                                {theme}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-sm font-bold text-slate-300">Cover Image</label>
                                        <button 
                                            onClick={generateCoverImage}
                                            disabled={isGeneratingImage || !newCampaignData.name}
                                            className="text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/40 px-3 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Icon name="wand-2" size={12} /> {isGeneratingImage ? "Scrying..." : "AI Generate"}
                                        </button>
                                    </div>
                                    <div className="w-full h-32 bg-slate-800 border-2 border-dashed border-slate-700 rounded-lg overflow-hidden relative flex items-center justify-center">
                                        {isGeneratingImage && (
                                            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                                <Icon name="loader-2" size={24} className="text-indigo-400 animate-spin mb-2" />
                                                <span className="text-xs text-indigo-300 font-bold animate-pulse">Consulting the arcane...</span>
                                            </div>
                                        )}
                                        {newCampaignData.coverImage ? (
                                            <img src={newCampaignData.coverImage} className="w-full h-full object-cover" alt="Cover" />
                                        ) : (
                                            <div className="text-slate-500 flex flex-col items-center gap-2">
                                                <Icon name="image" size={24} />
                                                <span className="text-xs">Click AI Generate to conjure artwork</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
                                <button onClick={() => setIsCreatingCampaign(false)} className="px-6 py-2 rounded-lg font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={finalizeCampaignCreation} className="px-8 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all flex items-center gap-2">
                                    <Icon name="swords" size={18} /> Launch VTT
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Waiting Room Modal */}
                {isJoiningCampaign && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsJoiningCampaign(false)}>
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black text-indigo-400 tracking-wider">Waiting Room</h2>
                                    <p className="text-sm text-slate-400">Realm Code: <span className="font-mono text-amber-500">{hideInviteCode ? '••••••' : joiningCode}</span></p>
                                </div>
                                <button onClick={() => setIsJoiningCampaign(false)} className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors">
                                    <Icon name="x" size={24} />
                                </button>
                            </div>
                            
                            <div className="p-6 bg-slate-950">
                                <h3 className="text-lg font-bold text-white mb-4">Select Your Character</h3>
                                {characters.length === 0 ? (
                                    <div className="text-center py-8 bg-slate-900 rounded-xl border border-slate-800">
                                        <p className="text-slate-400 mb-4">You don't have any characters in your vault.</p>
                                        <button onClick={() => { setIsJoiningCampaign(false); setActiveTab('characters'); }} className="text-indigo-400 hover:text-indigo-300 font-bold underline">
                                            Go to Character Vault
                                        </button>
                                        <p className="text-xs text-slate-500 mt-4">(Or join without a character and the DM can assign one)</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-64 overflow-y-auto custom-scroll pr-2">
                                        {characters.map(char => (
                                            <div 
                                                key={char.id} 
                                                onClick={() => setSelectedCharacterId(char.id)}
                                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedCharacterId === char.id ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`}
                                            >
                                                <div className="w-12 h-12 rounded-full bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                                    {char.avatarUrl ? <img src={char.avatarUrl} className="w-full h-full object-cover" alt="Avatar"/> : <Icon name="user" size={16} className="text-slate-500" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-white truncate">{char.name}</div>
                                                    <div className="text-xs text-slate-400 truncate">Lvl {char.level || 1} {char.class}</div>
                                                </div>
                                                {selectedCharacterId === char.id && <Icon name="check-circle" size={20} className="text-indigo-400 shrink-0" />}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-6 border-t border-slate-800 bg-slate-900 flex justify-end gap-3">
                                <button onClick={() => setIsJoiningCampaign(false)} className="px-6 py-2 rounded-lg font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={finalizeJoin} className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
                                    Ready to Play <Icon name="arrow-right" size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Waiting Room Overlay */}
                {isInWaitingRoom && (
                    <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in-95 duration-200">
                            <div className="w-20 h-20 bg-indigo-900/30 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Icon name="clock" size={40} className="animate-pulse" />
                            </div>
                            <h2 className="text-2xl font-black text-white mb-2">Knocking on the Door...</h2>
                            <p className="text-slate-400 mb-8">Waiting for the Dungeon Master to let you in to <strong className="text-amber-500">{hideInviteCode ? '••••••' : joiningCode}</strong>.</p>
                            
                            <div className="w-full bg-slate-800 rounded-full h-2 mb-8 overflow-hidden relative">
                                <div className="absolute top-0 bottom-0 bg-indigo-500 w-1/3 rounded-full animate-[ping-pong_2s_ease-in-out_infinite]" style={{ animationName: 'ping-pong', animationDuration: '2s', animationIterationCount: 'infinite' }}></div>
                            </div>
                            
                            <button 
                                onClick={() => { setIsInWaitingRoom(false); updateDoc(doc(fb.db, 'campaigns', joiningCode, 'joinRequests', user.uid), { status: 'canceled' }).catch(()=>{}); }}
                                className="px-6 py-2 rounded-lg font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                Cancel & Leave
                            </button>
                        </div>
                        <style dangerouslySetInnerHTML={{__html: `@keyframes ping-pong { 0% { left: -33%; } 50% { left: 100%; } 100% { left: -33%; } }`}} />
                    </div>
                )}
                
                {/* D&D Beyond Importer Modal */}
                {showDndBeyondImport && (
                    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowDndBeyondImport(false)}>
                        <div onClick={e => e.stopPropagation()}>
                            <DndBeyondImporter 
                                onImport={handleImportCharacter} 
                                onCancel={() => setShowDndBeyondImport(false)} 
                            />
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
};

export default Lobby;