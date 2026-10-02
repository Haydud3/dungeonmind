import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { useDialog } from './DialogProvider';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import * as fb from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, query, where, onSnapshot, deleteField, arrayRemove } from 'firebase/firestore';
import SheetContainer from './character-sheet/SheetContainer';
import DndBeyondImporter from './character-sheet/DndBeyondImporter';
import CharacterBuilder from '../utils/CharacterBuilder';
import ModelPickerModal from './ModelPickerModal';

const Lobby = ({ user, hideInviteCode, setHideInviteCode }) => {
    const { joinCampaign, setLocalGuestUser } = useNewCampaign();
    const toast = useToast();
    const dialog = useDialog();
    const [joinCode, setJoinCode] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [recents, setRecents] = useState([]);
    const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'characters'
    const [characters, setCharacters] = useState([]);
    const [editingCharacter, setEditingCharacter] = useState(null);
    const [showLobbyModelPicker, setShowLobbyModelPicker] = useState(false);
    const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
    const [editingRealm, setEditingRealm] = useState(null);
    const [isGeneratingEditImage, setIsGeneratingEditImage] = useState(false);
    const [newCampaignData, setNewCampaignData] = useState({ name: '', theme: 'Heroic Fantasy', coverImage: '' });

    const openEditRealm = (realm) => {
        setEditingRealm({
            code: realm.code,
            name: realm.name || '',
            theme: realm.theme || 'Heroic Fantasy',
            coverImage: realm.coverImage || ''
        });
    };

    const saveEditedRealm = async () => {
        if (!editingRealm) return;
        const finalName = editingRealm.name.trim() || `Realm ${editingRealm.code}`;
        const finalCover = editingRealm.coverImage;
        const finalTheme = editingRealm.theme;

        try {
            await updateDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', editingRealm.code), {
                'campaignName': finalName,
                'coverImage': finalCover,
                'tone': finalTheme,
                'campaign.genesis.campaignName': finalName,
                'campaign.genesis.coverImage': finalCover,
                'campaign.genesis.tone': finalTheme
            });

            const newRecents = recents.map(item => item.code === editingRealm.code ? { ...item, name: finalName, coverImage: finalCover, theme: finalTheme } : item);
            setRecents(newRecents);
            localStorage.setItem('dm_recents', JSON.stringify(newRecents));
            
            if (user?.uid) {
                await setDoc(doc(fb.db, 'users', user.uid), { recents: newRecents }, { merge: true });
            }
        } catch (err) {
            console.error("Failed to update realm", err);
            toast("Failed to update realm details.", "error");
        }
        setEditingRealm(null);
    };

    const generateEditCoverImage = async () => {
        if (!editingRealm?.name) return;
        setIsGeneratingEditImage(true);
        try {
            const prompt = `Fantasy roleplaying game campaign cover art for "${editingRealm.name}". Theme: ${editingRealm.theme}. Epic, high quality digital illustration, cinematic lighting, no text, no words.`;
            const seed = Math.floor(Math.random() * 100000);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=400&nologo=true&seed=${seed}`;
            
            const img = new Image();
            img.onload = () => {
                setEditingRealm(prev => ({ ...prev, coverImage: imageUrl }));
                setIsGeneratingEditImage(false);
            };
            img.onerror = () => {
                setIsGeneratingEditImage(false);
            };
            img.src = imageUrl;
        } catch (e) {
            setIsGeneratingEditImage(false);
        }
    };
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [showDndBeyondImport, setShowDndBeyondImport] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [autoJoin, setAutoJoin] = useState(() => localStorage.getItem('dm_auto_join') === 'true');
    const [localDisplayName, setLocalDisplayName] = useState(user?.displayName || 'Adventurer');
    const [localPhotoUrl, setLocalPhotoUrl] = useState(user?.photoURL || '');
    const [editProfileData, setEditProfileData] = useState({ displayName: '', photoURL: '' });
    const [emailInvites, setEmailInvites] = useState([]);
    const [isRecovering, setIsRecovering] = useState(false);

    // Auth Portal State
    const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'code'
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authConfirmPassword, setAuthConfirmPassword] = useState('');
    const [authDisplayName, setAuthDisplayName] = useState('');
    const [showAuthPassword, setShowAuthPassword] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [authSuccess, setAuthSuccess] = useState(null);
    const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
    const [directCode, setDirectCode] = useState('');
    const [directName, setDirectName] = useState('');

    // Account Linking State
    const [isLinking, setIsLinking] = useState(false);
    const [showLinkPasswordModal, setShowLinkPasswordModal] = useState(false);
    const [linkEmail, setLinkEmail] = useState('');
    const [linkPassword, setLinkPassword] = useState('');
    const [linkPasswordConfirm, setLinkPasswordConfirm] = useState('');
    const [showLinkPassword, setShowLinkPassword] = useState(false);

    useEffect(() => {
        if (user) {
            setLocalDisplayName(user.displayName || 'Adventurer');
            setLocalPhotoUrl(user.photoURL || '');
            if (user.email && !linkEmail) {
                setLinkEmail(user.email);
            }
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
            if (fb.auth.currentUser) {
                await fb.updateProfile(fb.auth.currentUser, { displayName: newName, photoURL: newPhoto });
            } else if (setLocalGuestUser && user) {
                setLocalGuestUser({ ...user, displayName: newName, photoURL: newPhoto });
            }
            setLocalDisplayName(newName);
            setLocalPhotoUrl(newPhoto);
            toast("Profile updated successfully!", "success");
        } catch (err) {
            console.error("Failed to update profile", err);
            toast("Failed to update profile.", "error");
        }
    };
    
    // Waiting Room & Join Flow State
    const [isJoiningCampaign, setIsJoiningCampaign] = useState(false);
    const [joiningCode, setJoiningCode] = useState("");
    const [selectedCharacterId, setSelectedCharacterId] = useState(null);
    const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
    const [pendingInvite, setPendingInvite] = useState(() => {
        try {
            const saved = sessionStorage.getItem('dm_pending_invite');
            return saved ? JSON.parse(saved) : null;
        } catch(e) {
            return null;
        }
    });
    const [joiningCampaignDetails, setJoiningCampaignDetails] = useState(null);

    const resolveCampaignPreview = async (code) => {
        if (!code) return null;
        const formattedCode = code.toUpperCase();
        try {
            const campDoc = await getDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', formattedCode));
            if (campDoc.exists()) {
                const cData = campDoc.data();
                return {
                    code: formattedCode,
                    name: cData.campaign?.genesis?.campaignName || cData.campaignName || `Realm ${formattedCode}`,
                    coverImage: cData.campaign?.genesis?.coverImage || cData.coverImage || null,
                    theme: cData.campaign?.genesis?.tone || cData.tone || 'Heroic Fantasy',
                    hostName: cData.activeUsers?.[cData.hostId] || 'Dungeon Master',
                    bannedUsers: cData.bannedUsers || [],
                    kickedUsers: cData.kickedUsers || {}
                };
            }
        } catch (e) {
            console.error("Failed to resolve campaign preview", e);
        }
        return {
            code: formattedCode,
            name: `Realm ${formattedCode}`,
            coverImage: null,
            theme: 'Heroic Fantasy',
            hostName: 'Dungeon Master',
            bannedUsers: [],
            kickedUsers: {}
        };
    };

    const openJoinFlow = async (code, preview = null) => {
        if (!code) return;
        const formattedCode = code.toUpperCase();
        
        let meta = preview;
        if (!meta) {
            meta = await resolveCampaignPreview(formattedCode);
        }

        if (user?.uid && meta?.bannedUsers?.includes(user.uid)) {
            dialog.alert("You have been banned from this realm by the Dungeon Master.");
            const filteredRecents = recents.filter(r => r.code !== formattedCode);
            setRecents(filteredRecents);
            try {
                localStorage.setItem('dm_recents', JSON.stringify(filteredRecents));
                localStorage.removeItem('dm_last_session');
            } catch(e){}
            return;
        }

        setJoiningCode(formattedCode);
        setJoiningCampaignDetails(meta);
        setIsJoiningCampaign(true);

        if (characters.length > 0 && !selectedCharacterId) {
            setSelectedCharacterId(characters[0].id);
        }
    };

    // Auto-join & invite link parsing logic
    useEffect(() => {
        const checkInviteParams = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const joinCodeParam = urlParams.get('join');
            const inviteTokenParam = urlParams.get('invite');
            
            let resolvedCode = null;

            if (joinCodeParam) {
                resolvedCode = joinCodeParam.toUpperCase();
            } else if (inviteTokenParam) {
                try {
                    let q = query(collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns'), where('campaign.inviteToken', '==', inviteTokenParam));
                    let snapshot = await getDocs(q);
                    if (snapshot.empty) {
                        q = query(collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns'), where('inviteToken', '==', inviteTokenParam));
                        snapshot = await getDocs(q);
                    }
                    if (!snapshot.empty) {
                        resolvedCode = snapshot.docs[0].id.toUpperCase();
                    } else {
                        dialog.alert("This invite link is invalid or has expired.");
                    }
                } catch (e) {
                    console.error("Failed to resolve invite link", e);
                }
            }

            if (resolvedCode) {
                urlParams.delete('join');
                urlParams.delete('invite');
                const newSearch = urlParams.toString() ? '?' + urlParams.toString() : '';
                window.history.replaceState({}, document.title, window.location.pathname + newSearch + window.location.hash);

                const preview = await resolveCampaignPreview(resolvedCode);
                setPendingInvite(preview);
                setDirectCode(resolvedCode);
                try {
                    sessionStorage.setItem('dm_pending_invite', JSON.stringify(preview));
                } catch(e){}

                if (user) {
                    openJoinFlow(resolvedCode, preview);
                }
                return;
            }

            // If user just logged in / joined as guest and had a pending invite waiting:
            if (user && pendingInvite) {
                const inviteToOpen = pendingInvite;
                setPendingInvite(null);
                try {
                    sessionStorage.removeItem('dm_pending_invite');
                } catch(e){}
                openJoinFlow(inviteToOpen.code, inviteToOpen);
                return;
            }

            // Auto-join to last session if flag enabled
            if (localStorage.getItem('dm_auto_join') === 'true' && user) {
                try {
                    const lastSessionStr = localStorage.getItem('dm_last_session');
                    if (lastSessionStr) {
                        const lastSession = JSON.parse(lastSessionStr);
                        if (lastSession && lastSession.code) {
                            const campDoc = await getDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', lastSession.code));
                            if (!campDoc.exists() || campDoc.data()?.bannedUsers?.includes(user.uid)) {
                                localStorage.removeItem('dm_last_session');
                                return;
                            }

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
                    localStorage.removeItem('dm_last_session');
                }
            }
        };
        checkInviteParams();
    }, [user]);

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
            
            if (user && user.email) {
                try {
                    const q = query(
                        collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns'), 
                        where('pendingEmailInvites', 'array-contains', user.email.toLowerCase())
                    );
                    const snapshot = await getDocs(q);
                    const invites = [];
                    snapshot.forEach(docSnap => {
                        const cData = docSnap.data();
                        invites.push({
                            code: docSnap.id,
                            name: cData.campaign?.genesis?.campaignName || cData.campaignName || `Realm ${docSnap.id}`,
                            coverImage: cData.campaign?.genesis?.coverImage || cData.coverImage || null,
                            theme: cData.campaign?.genesis?.tone || cData.tone || null
                        });
                    });
                    setEmailInvites(invites);
                } catch (err) {
                    console.error("Failed to fetch email invites", err);
                }
            } else {
                setEmailInvites([]);
            }
        
        if (localRecents.length > 0) {
            let needsCloudSync = false;
            // Fetch fresh campaign data to ensure names/images are up-to-date for ALL recents
            localRecents = await Promise.all(localRecents.map(async (r) => {
                try {
                    const campDoc = await getDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', r.code));
                    if (campDoc.exists()) {
                        const cData = campDoc.data();
                        // If user is banned from this realm, remove from recents
                        if (user?.uid && cData.bannedUsers?.includes(user.uid)) {
                            needsCloudSync = true;
                            return null;
                        }

                        const freshName = cData.campaign?.genesis?.campaignName || cData.campaignName || r.name;
                        const freshCover = cData.campaign?.genesis?.coverImage || cData.coverImage || r.coverImage;
                        const freshTheme = cData.campaign?.genesis?.tone || cData.tone || r.theme;
                        
                        if (r.name !== freshName || r.coverImage !== freshCover || r.theme !== freshTheme) {
                            needsCloudSync = true;
                        }
                        return {
                            ...r,
                            name: freshName,
                            coverImage: freshCover,
                            theme: freshTheme
                        };
                    }
                } catch (e) {
                    console.error("Failed to sync realm info", e);
                }
                return r;
            }));
            localRecents = localRecents.filter(Boolean);
            setRecents(localRecents);
            localStorage.setItem('dm_recents', JSON.stringify(localRecents));
            if (needsCloudSync && user?.uid) {
                try {
                    await setDoc(doc(fb.db, 'users', user.uid), { recents: localRecents }, { merge: true });
                } catch (e) {
                    console.error("Failed to sync updated recents to cloud", e);
                }
            }
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
            setSelectedCharacterId(savedChar.id);
            setShowDndBeyondImport(false);
            toast(`Imported ${savedChar.name || 'character'}!`, 'success');
        } catch(e) {
            console.warn("Failed to import character to cloud, storing locally:", e);
            const localId = 'char_' + Date.now();
            const savedChar = { id: localId, ...charData, dateCreated: Date.now() };
            setCharacters(prev => [...prev, savedChar]);
            setSelectedCharacterId(localId);
            try {
                const existing = JSON.parse(localStorage.getItem('dm_local_characters') || '[]');
                localStorage.setItem('dm_local_characters', JSON.stringify([...existing, savedChar]));
            } catch(err){}
            setShowDndBeyondImport(false);
            toast(`Imported ${savedChar.name || 'character'}!`, 'success');
        }
    };

    const handleCreateCharacter = async () => {
        if (!user) return;
        setShowBuilder(true);
    };

    const handleBuilderComplete = async (charData) => {
        if (!user || !charData) return;
        try {
            const charRef = collection(fb.db, 'users', user.uid, 'characters');
            const newChar = { ...charData, dateCreated: Date.now() };
            const docRef = await addDoc(charRef, newChar);
            const savedChar = { id: docRef.id, ...newChar };
            setCharacters(prev => [...prev, savedChar]);
            setSelectedCharacterId(savedChar.id);
            setShowBuilder(false);
            toast(`Created ${savedChar.name || 'character'}!`, 'success');
        } catch(e) {
            console.warn("Failed to save built character to cloud, storing locally:", e);
            const localId = 'char_' + Date.now();
            const savedChar = { id: localId, ...charData, dateCreated: Date.now() };
            setCharacters(prev => [...prev, savedChar]);
            setSelectedCharacterId(localId);
            try {
                const existing = JSON.parse(localStorage.getItem('dm_local_characters') || '[]');
                localStorage.setItem('dm_local_characters', JSON.stringify([...existing, savedChar]));
            } catch(err){}
            setShowBuilder(false);
            toast(`Created ${savedChar.name || 'character'}!`, 'success');
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

    const handleRecoverRealms = async () => {
        if (!user || !user.uid) return;
        setIsRecovering(true);
        try {
            const campaignsRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns');
            const snapshot = await getDocs(campaignsRef);
            
            let recoveredCount = 0;
            
            // Collect all current recents to avoid duplicate work if possible
            let currentCodes = recents.map(r => r.code);

            for (const docSnap of snapshot.docs) {
                const cData = docSnap.data();
                const code = docSnap.id;
                
                if (currentCodes.includes(code)) continue; // Already have this one

                let role = null;
                // Check if user is DM
                if (cData.dmIds && cData.dmIds.includes(user.uid)) {
                    role = 'dm';
                } 
                // Check if user is Player
                else if (
                    (cData.assignments && cData.assignments[user.uid]) || 
                    (cData.players && cData.players.some(p => p.ownerId === user.uid)) ||
                    (cData.activeUsers && cData.activeUsers[user.uid])
                ) {
                    role = 'player';
                }

                if (role) {
                    const freshName = cData.campaign?.genesis?.campaignName || cData.campaignName || `Realm ${code}`;
                    const freshCover = cData.campaign?.genesis?.coverImage || cData.coverImage || null;
                    const freshTheme = cData.campaign?.genesis?.tone || cData.tone || null;
                    
                    await addToRecents(code, role, freshName, freshCover, freshTheme);
                    currentCodes.push(code);
                    recoveredCount++;
                }
            }
            
            toast(recoveredCount > 0 ? `Successfully recovered ${recoveredCount} missing realm(s)!` : "No missing realms found to recover.", "info");
            
        } catch (err) {
            console.error("Failed to recover realms", err);
            toast("An error occurred while scanning for lost realms.", "error");
        } finally {
            setIsRecovering(false);
        }
    };

    const getAuthErrorMessage = (err) => {
        if (!err) return "An unexpected error occurred.";
        const code = err.code || "";
        switch (code) {
            case "auth/invalid-credential":
            case "auth/user-not-found":
            case "auth/wrong-password":
                return "Incorrect email or password. Please verify your credentials.";
            case "auth/email-already-in-use":
                return "An account with this email already exists. Try signing in or resetting your password.";
            case "auth/weak-password":
                return "Password is too weak. Please choose at least 6 characters.";
            case "auth/invalid-email":
                return "Please provide a valid email address.";
            case "auth/missing-email":
                return "Please enter your email address.";
            case "auth/missing-password":
                return "Please enter your password.";
            case "auth/user-disabled":
                return "This account has been disabled. Please contact support.";
            case "auth/popup-closed-by-user":
                return "Sign-in popup was closed before completing.";
            case "auth/credential-already-in-use":
                return "This account credential is already linked to another DungeonMind user.";
            case "auth/requires-recent-login":
                return "For security, this action requires a recent sign-in. Please log out and back in.";
            case "auth/too-many-requests":
                return "Too many unsuccessful attempts. Please wait a moment before trying again.";
            case "auth/network-request-failed":
                return "Network connection issue. Please check your internet connection.";
            case "auth/admin-restricted-operation":
            case "auth/operation-not-allowed":
                return "Anonymous Sign-in is not enabled in Firebase Console (Authentication > Sign-in method > Anonymous).";
            default:
                return err.message || "An authentication error occurred.";
        }
    };

    const handleGoogleLogin = async () => {
        if (!fb) return;
        setIsAuthSubmitting(true);
        setAuthError(null);
        try {
            await fb.signInWithPopup(fb.auth, fb.googleProvider);
        } catch (e) {
            if (e.code !== "auth/popup-closed-by-user") {
                setAuthError(getAuthErrorMessage(e));
            }
        } finally {
            setIsAuthSubmitting(false);
        }
    };

    const handleLogin = handleGoogleLogin;

    const handleEmailSignIn = async (e) => {
        if (e) e.preventDefault();
        const trimmedEmail = authEmail.trim();
        if (!trimmedEmail || !authPassword) {
            setAuthError("Please provide both email and password.");
            return;
        }
        setIsAuthSubmitting(true);
        setAuthError(null);
        setAuthSuccess(null);
        try {
            await fb.signInWithEmailAndPassword(fb.auth, trimmedEmail, authPassword);
        } catch (err) {
            setAuthError(getAuthErrorMessage(err));
        } finally {
            setIsAuthSubmitting(false);
        }
    };

    const handleEmailSignUp = async (e) => {
        if (e) e.preventDefault();
        const trimmedEmail = authEmail.trim();
        const trimmedName = authDisplayName.trim() || 'Adventurer';
        if (!trimmedEmail || !authPassword) {
            setAuthError("Please provide an email and password.");
            return;
        }
        if (authPassword.length < 6) {
            setAuthError("Password must be at least 6 characters long.");
            return;
        }
        if (authPassword !== authConfirmPassword) {
            setAuthError("Passwords do not match.");
            return;
        }
        setIsAuthSubmitting(true);
        setAuthError(null);
        setAuthSuccess(null);
        try {
            const cred = await fb.createUserWithEmailAndPassword(fb.auth, trimmedEmail, authPassword);
            await fb.updateProfile(cred.user, { displayName: trimmedName });
            await setDoc(doc(fb.db, 'users', cred.user.uid), {
                displayName: trimmedName,
                email: trimmedEmail,
                createdAt: Date.now(),
                recents: []
            }, { merge: true });
        } catch (err) {
            setAuthError(getAuthErrorMessage(err));
        } finally {
            setIsAuthSubmitting(false);
        }
    };

    const handleForgotPassword = async (e) => {
        if (e) e.preventDefault();
        const trimmedEmail = authEmail.trim();
        if (!trimmedEmail) {
            setAuthError("Please enter your registered email address.");
            return;
        }
        setIsAuthSubmitting(true);
        setAuthError(null);
        setAuthSuccess(null);
        try {
            await fb.sendPasswordResetEmail(fb.auth, trimmedEmail);
            setAuthSuccess(`Password reset email sent to ${trimmedEmail}! Check your inbox and spam folder.`);
        } catch (err) {
            setAuthError(getAuthErrorMessage(err));
        } finally {
            setIsAuthSubmitting(false);
        }
    };

    const handleGuestLogin = async (customName = null) => {
        setIsAuthSubmitting(true);
        setAuthError(null);
        const name = (customName && customName.trim()) ? customName.trim() : 'Guest Adventurer';
        try {
            const cred = await fb.signInAnonymously(fb.auth);
            await fb.updateProfile(cred.user, { displayName: name });
            toast(`Welcome, ${name}! Entering realm as Guest.`, "info");
        } catch (err) {
            console.warn("Firebase Anonymous Auth warning:", err);
            if (err.code === "auth/admin-restricted-operation" || err.code === "auth/operation-not-allowed") {
                // Seamless fallback to local guest session so the user is never blocked
                const guestObj = {
                    uid: 'guest_' + Math.random().toString(36).substring(2, 9),
                    displayName: name,
                    email: null,
                    photoURL: '',
                    isAnonymous: true,
                    providerData: []
                };
                if (setLocalGuestUser) setLocalGuestUser(guestObj);
                toast(`Welcome, ${name}! Playing as Guest.`, "info");
            } else {
                setAuthError(getAuthErrorMessage(err));
            }
        } finally {
            setIsAuthSubmitting(false);
        }
    };

    const handleDirectCodeJoin = async (e) => {
        if (e) e.preventDefault();
        const code = directCode.trim().toUpperCase();
        if (!code) {
            setAuthError("Please enter a Realm code.");
            return;
        }
        const name = directName.trim() || 'Guest Adventurer';
        setIsAuthSubmitting(true);
        setAuthError(null);
        try {
            const preview = await resolveCampaignPreview(code);
            setPendingInvite(preview);
            try {
                sessionStorage.setItem('dm_pending_invite', JSON.stringify(preview));
            } catch(e){}

            const cred = await fb.signInAnonymously(fb.auth);
            await fb.updateProfile(cred.user, { displayName: name });
        } catch (err) {
            if (err.code === "auth/admin-restricted-operation" || err.code === "auth/operation-not-allowed") {
                const guestObj = {
                    uid: 'guest_' + Math.random().toString(36).substring(2, 9),
                    displayName: name,
                    email: null,
                    photoURL: '',
                    isAnonymous: true,
                    providerData: []
                };
                if (setLocalGuestUser) setLocalGuestUser(guestObj);
            } else {
                setAuthError(getAuthErrorMessage(err));
                setIsAuthSubmitting(false);
            }
        }
    };

    // Account Linking Handlers
    const handleLinkGoogle = async () => {
        if (!fb.auth.currentUser) return;
        setIsLinking(true);
        try {
            await fb.linkWithPopup(fb.auth.currentUser, fb.googleProvider);
            toast("Google account successfully linked!", "success");
        } catch (err) {
            console.error("Link Google error:", err);
            toast(getAuthErrorMessage(err), "error");
        } finally {
            setIsLinking(false);
        }
    };

    const handleLinkPassword = async (e) => {
        if (e) e.preventDefault();
        if (!fb.auth.currentUser) return;
        const trimmedEmail = linkEmail.trim() || user?.email;
        if (!trimmedEmail || !linkPassword) {
            toast("Please provide both email and password.", "warning");
            return;
        }
        if (linkPassword.length < 6) {
            toast("Password must be at least 6 characters.", "warning");
            return;
        }
        if (linkPassword !== linkPasswordConfirm) {
            toast("Passwords do not match.", "warning");
            return;
        }
        setIsLinking(true);
        try {
            const credential = fb.EmailAuthProvider.credential(trimmedEmail, linkPassword);
            await fb.linkWithCredential(fb.auth.currentUser, credential);
            toast("DungeonMind email and password successfully linked!", "success");
            setShowLinkPasswordModal(false);
            setLinkPassword('');
            setLinkPasswordConfirm('');
        } catch (err) {
            console.error("Link password error:", err);
            toast(getAuthErrorMessage(err), "error");
        } finally {
            setIsLinking(false);
        }
    };

    const handleSendProfilePasswordReset = async () => {
        const targetEmail = user?.providerData?.find(p => p.providerId === 'password')?.email || user?.email;
        if (!targetEmail) {
            toast("No email address found for this account.", "error");
            return;
        }
        try {
            await fb.sendPasswordResetEmail(fb.auth, targetEmail);
            toast(`Password reset instructions sent to ${targetEmail}!`, "success");
        } catch (err) {
            toast(getAuthErrorMessage(err), "error");
        }
    };

    const handleUnlinkProvider = async (providerId) => {
        if (!fb.auth.currentUser) return;
        if (fb.auth.currentUser.providerData.length <= 1) {
            toast("Cannot unlink: You must keep at least one login method attached to your account.", "warning");
            return;
        }
        const providerName = providerId === 'google.com' ? 'Google' : 'DungeonMind Password';
        if (await dialog.confirm(`Are you sure you want to unlink ${providerName}? You will not be able to log in with this method unless you re-link it.`)) {
            try {
                await fb.unlink(fb.auth.currentUser, providerId);
                toast(`${providerName} unlinked successfully.`, "info");
            } catch (err) {
                toast(getAuthErrorMessage(err), "error");
            }
        }
    };

    const addToRecents = async (code, role, campaignName = null, coverImage = null, theme = null) => {
        let currentRecents = [];
        
        // 1. Always prioritize fetching the most up-to-date recents from the cloud first
        if (user && user.uid) {
            try {
                const userDocRef = doc(fb.db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists() && userDoc.data().recents) {
                    currentRecents = userDoc.data().recents;
                }
            } catch(e) {
                console.error("Failed to fetch current cloud recents", e);
            }
        }
        
        // 2. Fallback or merge with local storage if cloud was empty
        if (currentRecents.length === 0) {
            try {
                const saved = localStorage.getItem('dm_recents');
                if (saved) currentRecents = JSON.parse(saved);
            } catch(e) {}
        }
        
        const existing = currentRecents.find(r => r.code === code);
        const finalName = campaignName || existing?.name || null;
        const finalCover = coverImage || existing?.coverImage || null;
        const finalTheme = theme || existing?.theme || null;
        
        const newItem = { code, role, date: Date.now(), name: finalName, coverImage: finalCover, theme: finalTheme };
        const newRecents = [newItem, ...currentRecents.filter(r => r.code !== code)];
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
            dialog.alert("You must be logged in to Forge a new Realm.");
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

    const handleJoinClick = async (code, role = 'player') => {
        if (!code) return;
        const formattedCode = code.toUpperCase();
        
        if (role === 'dm') {
            addToRecents(formattedCode, 'dm');
            localStorage.setItem('dm_last_session', JSON.stringify({ code: formattedCode, role: 'dm' }));
            joinCampaign(formattedCode, 'dm', user ? user.uid : 'anon');
            return;
        }

        if (!user) {
            const preview = await resolveCampaignPreview(formattedCode);
            setPendingInvite(preview);
            setDirectCode(formattedCode);
            try {
                sessionStorage.setItem('dm_pending_invite', JSON.stringify(preview));
            } catch(e){}
            return;
        }

        openJoinFlow(formattedCode);
    };

    const finalizeJoin = async () => {
        setIsJoiningCampaign(false);
        
        let selectedChar = characters.find(c => c.id === selectedCharacterId) || null;
        let finalCharId = selectedCharacterId;
        
        let campaignName = joiningCampaignDetails?.name || null;
        let coverImage = joiningCampaignDetails?.coverImage || null;
        let tone = joiningCampaignDetails?.theme || null;
        
        try {
            const campDoc = await getDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', joiningCode));
            if (campDoc.exists()) {
                const cData = campDoc.data();

                // 1. Check if user is banned
                if (user?.uid && cData.bannedUsers?.includes(user.uid)) {
                    dialog.alert("You have been banned from this realm by the Dungeon Master.");
                    const filteredRecents = recents.filter(r => r.code !== joiningCode);
                    setRecents(filteredRecents);
                    try {
                        localStorage.setItem('dm_recents', JSON.stringify(filteredRecents));
                        localStorage.removeItem('dm_last_session');
                    } catch(e){}
                    return;
                }

                // 2. Check if user was kicked
                const isKicked = user?.uid && cData.kickedUsers && Boolean(cData.kickedUsers[user.uid]);
                const requiresApproval = Boolean(cData.campaign?.requireApproval) || isKicked;

                campaignName = cData.campaign?.genesis?.campaignName || cData.campaignName || campaignName || "Unknown Campaign";
                coverImage = cData.campaign?.genesis?.coverImage || cData.coverImage || coverImage;
                tone = cData.campaign?.genesis?.tone || cData.tone || tone;
                
                // Clone the character to tie it uniquely to this campaign if it isn't already
                if (selectedChar && selectedChar.campaignId !== joiningCode && user?.uid && !user.uid.startsWith('guest_')) {
                    try {
                        const { id, ...charWithoutId } = selectedChar;
                        const clonedChar = {
                            ...charWithoutId,
                            campaignId: joiningCode,
                            campaignName: campaignName,
                            dateCreated: Date.now()
                        };
                        const newDocRef = await addDoc(collection(fb.db, 'users', user.uid, 'characters'), clonedChar);
                        selectedChar = { ...clonedChar, id: newDocRef.id };
                        finalCharId = newDocRef.id;
                    } catch (err) {
                        console.error("Failed to clone character for campaign", err);
                    }
                } else if (selectedChar && selectedChar.campaignId === joiningCode && selectedChar.campaignName !== campaignName && user?.uid && !user.uid.startsWith('guest_')) {
                    // Update campaign name if it changed
                    try {
                        await updateDoc(doc(fb.db, 'users', user.uid, 'characters', selectedChar.id), { campaignName });
                        selectedChar.campaignName = campaignName;
                    } catch(e){}
                }

                if (requiresApproval) {
                    const reqRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', joiningCode, 'joinRequests', user.uid);
                    
                    const existingSnap = await getDoc(reqRef);
                    const kickTimestamp = isKicked ? (cData.kickedUsers[user.uid] || 0) : 0;
                    const reqTimestamp = existingSnap.exists() ? (existingSnap.data().timestamp || 0) : 0;

                    // If they were kicked, any old approval created BEFORE the kick is invalid
                    if (existingSnap.exists() && existingSnap.data().status === 'approved' && (!isKicked || reqTimestamp > kickTimestamp)) {
                        addToRecents(joiningCode, 'player', campaignName, coverImage, tone);
                        localStorage.setItem('dm_last_session', JSON.stringify({ code: joiningCode, role: 'player', characterId: finalCharId }));
                        joinCampaign(joiningCode, 'player', user.uid, false, {}, selectedChar);
                        return;
                    }

                    // First time or previously denied — submit a fresh pending request
                    setIsInWaitingRoom(true);
                    await setDoc(reqRef, {
                        uid: user.uid,
                        name: user.displayName || 'Player',
                        characterId: finalCharId || null,
                        characterName: selectedChar ? selectedChar.name : 'Spectator',
                        status: 'pending',
                        timestamp: Date.now()
                    });
                    
                    const unsub = onSnapshot(reqRef, async (docSnap) => {
                        if (docSnap.exists()) {
                            const status = docSnap.data().status;
                            if (status === 'approved') {
                                unsub();
                                setIsInWaitingRoom(false);
                                addToRecents(joiningCode, 'player', campaignName, coverImage, tone);
                                localStorage.setItem('dm_last_session', JSON.stringify({ code: joiningCode, role: 'player', characterId: finalCharId }));
                                joinCampaign(joiningCode, 'player', user.uid, false, {}, selectedChar);
                            } else if (status === 'denied') {
                                unsub();
                                setIsInWaitingRoom(false);
                                dialog.alert("Your request to join was denied by the Dungeon Master.");
                            }
                        }
                    });
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to check approval setting", e);
        }

        addToRecents(joiningCode, 'player', campaignName, coverImage, tone);
        localStorage.setItem('dm_last_session', JSON.stringify({ code: joiningCode, role: 'player', characterId: finalCharId }));
        joinCampaign(joiningCode, 'player', user.uid, false, {}, selectedChar);
    };

    const handleAcceptInvite = async (invite) => {
        if (!user || !user.email) return;
        try {
            const campRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', invite.code);
            await updateDoc(campRef, { pendingEmailInvites: arrayRemove(user.email.toLowerCase()) });
            setEmailInvites(prev => prev.filter(i => i.code !== invite.code));
            openJoinFlow(invite.code, {
                code: invite.code,
                name: invite.name,
                coverImage: invite.coverImage,
                theme: invite.theme
            });
        } catch(err) {
            console.error("Failed to accept invite", err);
            toast("Failed to accept invite.", "error");
        }
    };

    const handleDeclineInvite = async (e, invite) => {
        e.stopPropagation();
        if (!user || !user.email) return;
        if (!(await dialog.confirm(`Decline invite to ${invite.name}?`))) return;
        try {
            const campRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', invite.code);
            await updateDoc(campRef, { pendingEmailInvites: arrayRemove(user.email.toLowerCase()) });
            setEmailInvites(prev => prev.filter(i => i.code !== invite.code));
        } catch(err) {
            console.error("Failed to decline invite", err);
        }
    };

    const deleteCampaign = async (e, item) => {
        e.stopPropagation();
        
        const isDm = item.role === 'dm';
        const confirmMessage = isDm 
            ? `Permanently delete the realm "${item.name || item.code}" and all its data? This cannot be undone.` 
            : `Leave the realm "${item.name || item.code}"?`;
            
        if (await dialog.confirm(confirmMessage)) {
            const newRecents = recents.filter(r => r.code !== item.code);
            setRecents(newRecents);
            localStorage.setItem('dm_recents', JSON.stringify(newRecents));
            
            if (user && user.uid) {
                try {
                    const userDocRef = doc(fb.db, 'users', user.uid);
                    await setDoc(userDocRef, { recents: newRecents }, { merge: true });
                    
                    if (isDm) {
                        await deleteDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', item.code));
                    } else {
                        const campRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', item.code);
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

    // --- LOGGED OUT AUTH PORTAL VIEW ---
    if (!user) {
        return (
            <div className="fixed inset-0 z-50 overflow-y-auto custom-scroll bg-[url('https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=2544&auto=format&fit=crop')] bg-cover bg-center bg-fixed touch-pan-y">
                <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md pointer-events-none"></div>
                <div className="min-h-full w-full flex items-center justify-center p-4 sm:p-6 py-8 sm:py-12 relative z-10">
                    <div className="relative w-full max-w-lg my-auto p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-700/60 flex flex-col justify-center bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
                    
                    {/* Header & Logo */}
                    <div className="text-center mb-6 flex flex-col items-center">
                        <img 
                            src={`${import.meta.env.BASE_URL}logo.png`} 
                            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-amber-500/50 shadow-[0_0_35px_rgba(217,119,6,0.35)] mb-4 object-cover" 
                            alt="DungeonMind Logo"
                        />
                        <h1 className="text-4xl sm:text-5xl fantasy-font text-amber-500 mb-2 text-shadow tracking-wide">DungeonMind</h1>
                        <p className="text-slate-300 text-xs sm:text-sm font-medium tracking-wide">The Modern Virtual Tabletop & Campaign Manager</p>
                    </div>

                    {/* Pending Session Invite Banner */}
                    {pendingInvite && (
                        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-indigo-950/70 border border-amber-500/50 shadow-xl text-left flex items-center gap-4 animate-in fade-in slide-in-from-top-3 duration-300">
                            {pendingInvite.coverImage ? (
                                <img 
                                    src={pendingInvite.coverImage} 
                                    alt="Campaign Cover" 
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-amber-500/40 shadow-md shrink-0" 
                                />
                            ) : (
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400 shadow-md">
                                    <Icon name="castle" size={28} />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-1 border border-amber-500/30">
                                    <Icon name="ticket" size={11} /> Realm Invitation
                                </div>
                                <h2 className="text-base sm:text-lg font-bold text-white truncate text-shadow">
                                    {pendingInvite.name}
                                </h2>
                                <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                                    <span className="font-mono text-amber-400 font-bold tracking-wider">#{pendingInvite.code}</span>
                                    <span>•</span>
                                    <span className="text-slate-400 truncate">{pendingInvite.theme || 'Heroic Fantasy'}</span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Choose how to enter below (sign in, forge account, or play as guest):
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Navigation Tabs (Hidden when in Forgot Password sub-mode) */}
                    {authMode !== 'forgot' ? (
                        <div className="flex bg-slate-950/80 p-1 rounded-xl mb-6 border border-slate-800 text-xs sm:text-sm font-bold">
                            <button
                                type="button"
                                onClick={() => { setAuthMode('signin'); setAuthError(null); setAuthSuccess(null); }}
                                className={`flex-1 py-2 sm:py-2.5 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                                    authMode === 'signin' 
                                        ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30' 
                                        : 'text-slate-400 hover:text-white hover:bg-slate-850'
                                }`}
                            >
                                <Icon name="log-in" size={15} /> Sign In
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAuthMode('signup'); setAuthError(null); setAuthSuccess(null); }}
                                className={`flex-1 py-2 sm:py-2.5 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                                    authMode === 'signup' 
                                        ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30' 
                                        : 'text-slate-400 hover:text-white hover:bg-slate-850'
                                }`}
                            >
                                <Icon name="sparkles" size={15} /> Forge Account
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAuthMode('code'); setAuthError(null); setAuthSuccess(null); }}
                                className={`flex-1 py-2 sm:py-2.5 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                                    authMode === 'code' 
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30' 
                                        : 'text-slate-400 hover:text-white hover:bg-slate-850'
                                }`}
                            >
                                <Icon name="hash" size={15} /> Join Code
                            </button>
                        </div>
                    ) : null}

                    {/* Error Notice */}
                    {authError && (
                        <div className="mb-4 p-3.5 rounded-xl bg-red-950/60 border border-red-500/50 flex items-start gap-2.5 text-xs sm:text-sm text-red-200 animate-in fade-in">
                            <Icon name="alert-triangle" size={18} className="text-red-400 shrink-0 mt-0.5" />
                            <div className="flex-1 leading-relaxed">{authError}</div>
                        </div>
                    )}

                    {/* Success Notice */}
                    {authSuccess && (
                        <div className="mb-4 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 flex items-start gap-2.5 text-xs sm:text-sm text-emerald-200 animate-in fade-in">
                            <Icon name="check-circle" size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                            <div className="flex-1 leading-relaxed">{authSuccess}</div>
                        </div>
                    )}

                    {/* --- TAB 1: SIGN IN --- */}
                    {authMode === 'signin' && (
                        <form onSubmit={handleEmailSignIn} className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="mail" size={16} />
                                    </div>
                                    <input 
                                        type="email"
                                        required
                                        autoComplete="email"
                                        value={authEmail}
                                        onChange={(e) => setAuthEmail(e.target.value)}
                                        placeholder="adventurer@dungeonmind.net"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Password</label>
                                    <button 
                                        type="button" 
                                        onClick={() => { setAuthMode('forgot'); setAuthError(null); setAuthSuccess(null); }}
                                        className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                                    >
                                        Forgot Password?
                                    </button>
                                </div>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="lock" size={16} />
                                    </div>
                                    <input 
                                        type={showAuthPassword ? "text" : "password"}
                                        required
                                        autoComplete="current-password"
                                        value={authPassword}
                                        onChange={(e) => setAuthPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAuthPassword(!showAuthPassword)}
                                        className="absolute right-3 text-slate-500 hover:text-slate-300 transition-colors p-1"
                                        title={showAuthPassword ? "Hide password" : "Show password"}
                                    >
                                        <Icon name={showAuthPassword ? "eye-off" : "eye"} size={16} />
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isAuthSubmitting}
                                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-sm sm:text-base flex justify-center items-center gap-2.5 shadow-lg shadow-amber-900/30 transition-all"
                            >
                                {isAuthSubmitting ? (
                                    <>
                                        <Icon name="loader-2" size={18} className="animate-spin" /> Unlocking Realm...
                                    </>
                                ) : (
                                    <>
                                        <Icon name="log-in" size={18} /> Enter DungeonMind
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* --- TAB 2: FORGE ACCOUNT --- */}
                    {authMode === 'signup' && (
                        <form onSubmit={handleEmailSignUp} className="space-y-3.5">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Adventurer Name</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="user" size={16} />
                                    </div>
                                    <input 
                                        type="text"
                                        value={authDisplayName}
                                        onChange={(e) => setAuthDisplayName(e.target.value)}
                                        placeholder="e.g. Thorin Oakenshield"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="mail" size={16} />
                                    </div>
                                    <input 
                                        type="email"
                                        required
                                        autoComplete="email"
                                        value={authEmail}
                                        onChange={(e) => setAuthEmail(e.target.value)}
                                        placeholder="adventurer@dungeonmind.net"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="lock" size={16} />
                                    </div>
                                    <input 
                                        type={showAuthPassword ? "text" : "password"}
                                        required
                                        autoComplete="new-password"
                                        value={authPassword}
                                        onChange={(e) => setAuthPassword(e.target.value)}
                                        placeholder="At least 6 characters"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAuthPassword(!showAuthPassword)}
                                        className="absolute right-3 text-slate-500 hover:text-slate-300 transition-colors p-1"
                                        title={showAuthPassword ? "Hide password" : "Show password"}
                                    >
                                        <Icon name={showAuthPassword ? "eye-off" : "eye"} size={16} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Confirm Password</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="check" size={16} />
                                    </div>
                                    <input 
                                        type={showAuthPassword ? "text" : "password"}
                                        required
                                        autoComplete="new-password"
                                        value={authConfirmPassword}
                                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                        placeholder="Re-enter password"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isAuthSubmitting}
                                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-sm sm:text-base flex justify-center items-center gap-2.5 shadow-lg shadow-amber-900/30 transition-all mt-1"
                            >
                                {isAuthSubmitting ? (
                                    <>
                                        <Icon name="loader-2" size={18} className="animate-spin" /> Forging Account...
                                    </>
                                ) : (
                                    <>
                                        <Icon name="sparkles" size={18} /> Forge Account & Begin
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* --- TAB 3: DIRECT JOIN WITH CODE --- */}
                    {authMode === 'code' && (
                        <form onSubmit={handleDirectCodeJoin} className="space-y-4">
                            <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-200">
                                Enter your Dungeon Master's invite code to join immediately as a guest. No account required!
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Realm Invite Code</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="hash" size={16} />
                                    </div>
                                    <input 
                                        type="text"
                                        required
                                        maxLength={8}
                                        value={directCode}
                                        onChange={(e) => setDirectCode(e.target.value.toUpperCase())}
                                        placeholder="CODE"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3 text-base text-center text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono tracking-widest uppercase font-bold"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Your Adventurer Name</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="user" size={16} />
                                    </div>
                                    <input 
                                        type="text"
                                        value={directName}
                                        onChange={(e) => setDirectName(e.target.value)}
                                        placeholder="e.g. Robin the Bard"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isAuthSubmitting}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-sm sm:text-base flex justify-center items-center gap-2.5 shadow-lg shadow-indigo-900/30 transition-all"
                            >
                                {isAuthSubmitting ? (
                                    <>
                                        <Icon name="loader-2" size={18} className="animate-spin" /> Entering Realm...
                                    </>
                                ) : (
                                    <>
                                        <Icon name="arrow-right" size={18} /> Join Realm Directly
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* --- SUB-MODE: FORGOT PASSWORD --- */}
                    {authMode === 'forgot' && (
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                            <div className="text-left mb-2">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Icon name="key" size={18} className="text-amber-400" /> Password Recovery
                                </h3>
                                <p className="text-xs text-slate-400 mt-1">
                                    Enter your account email address below. We'll send an official Firebase recovery link to safely reset your password.
                                </p>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Registered Email</label>
                                <div className="relative flex items-center">
                                    <div className="absolute left-3.5 text-slate-500 pointer-events-none">
                                        <Icon name="mail" size={16} />
                                    </div>
                                    <input 
                                        type="email"
                                        required
                                        autoComplete="email"
                                        value={authEmail}
                                        onChange={(e) => setAuthEmail(e.target.value)}
                                        placeholder="adventurer@dungeonmind.net"
                                        className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isAuthSubmitting}
                                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-sm sm:text-base flex justify-center items-center gap-2.5 shadow-lg shadow-amber-900/30 transition-all"
                            >
                                {isAuthSubmitting ? (
                                    <>
                                        <Icon name="loader-2" size={18} className="animate-spin" /> Sending Link...
                                    </>
                                ) : (
                                    <>
                                        <Icon name="send" size={18} /> Send Password Reset Link
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => { setAuthMode('signin'); setAuthError(null); setAuthSuccess(null); }}
                                className="w-full py-2 text-slate-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                            >
                                <Icon name="arrow-left" size={14} /> Back to Sign In
                            </button>
                        </form>
                    )}

                    {/* Divider & Social / Guest Options */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-800"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-mono">
                            <span className="bg-slate-900 px-3 text-slate-500">or connect via</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {/* Google Sign In */}
                        <button 
                            type="button"
                            onClick={handleGoogleLogin} 
                            disabled={isAuthSubmitting} 
                            className="w-full bg-slate-950 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 text-white py-3 px-4 rounded-xl font-bold text-sm flex justify-center items-center gap-3 transition-all shadow-md group disabled:opacity-50"
                        >
                            <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            <span>Continue with Google</span>
                        </button>

                        {/* Play as Guest */}
                        <button 
                            type="button"
                            onClick={() => handleGuestLogin()} 
                            disabled={isAuthSubmitting} 
                            className="w-full bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                        >
                            <Icon name="user-check" size={16} className="text-amber-500" />
                            <span>{pendingInvite ? "Join Session as Guest (No account needed)" : "Play as Guest (Explore without account)"}</span>
                        </button>
                    </div>

                    <p className="text-[11px] text-slate-500 mt-6 text-center">
                        By continuing, you agree to roll with the punches.
                    </p>
                </div>
            </div>
        </div>
    );
}

    // --- LOGGED IN DASHBOARD VIEW ---
    return (
        <div className="h-screen w-full flex flex-col md:flex-row bg-slate-950 text-slate-200 font-sans overflow-hidden">
            
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col shrink-0 z-20">
                <div className="p-4 md:p-6 flex items-center justify-center md:justify-start gap-3 border-b border-slate-800 shrink-0">
                    <img src={`${import.meta.env.BASE_URL}logo.png`} className="w-8 h-8 md:w-10 md:h-10 rounded-xl border border-amber-500/40 shadow-[0_0_15px_rgba(217,119,6,0.3)] object-cover" alt="DungeonMind" />
                    <span className="text-lg md:text-xl fantasy-font text-amber-500 tracking-wide text-shadow">DungeonMind</span>
                </div>
                
                <div className="overflow-x-auto md:overflow-x-hidden overflow-y-hidden md:overflow-y-auto p-2 md:py-4 md:px-3 flex space-x-2 md:space-x-0 md:space-y-1 md:flex-col custom-scroll shrink-0 md:flex-1">
                    <button 
                        onClick={() => setActiveTab('campaigns')}
                        className={`flex items-center justify-center md:justify-start gap-2 md:gap-3 px-4 py-2 md:py-3 rounded-lg font-bold transition-all whitespace-nowrap md:whitespace-normal flex-1 md:w-full text-sm md:text-base ${activeTab === 'campaigns' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                        <Icon name="map" size={18} /> My Campaigns
                    </button>
                    <button 
                        onClick={() => setActiveTab('characters')}
                        className={`flex items-center justify-center md:justify-start gap-2 md:gap-3 px-4 py-2 md:py-3 rounded-lg font-bold transition-all whitespace-nowrap md:whitespace-normal flex-1 md:w-full text-sm md:text-base ${activeTab === 'characters' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                        <Icon name="users" size={18} /> My Characters
                    </button>
                    <button 
                        onClick={openProfileEdit}
                        className={`flex items-center justify-center md:justify-start gap-2 md:gap-3 px-4 py-2 md:py-3 rounded-lg font-bold transition-all whitespace-nowrap md:whitespace-normal flex-1 md:w-full text-sm md:text-base ${activeTab === 'profile' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                        <Icon name="user" size={18} /> My Profile
                    </button>
                </div>

                <div className="hidden md:block p-4 border-t border-slate-800 shrink-0 bg-slate-900/50">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0 uppercase overflow-hidden border border-slate-600">
                                {localPhotoUrl ? <img src={localPhotoUrl} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (localDisplayName[0] || '?')}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-slate-200 truncate">{localDisplayName}</span>
                                <span className="text-[10px] text-slate-500 font-mono truncate">ID: {user.uid.substring(0, 8)}</span>
                            </div>
                        </div>
                        <button onClick={openProfileEdit} className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors" title="Edit Profile">
                            <Icon name="pencil" size={14} />
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

                    <button onClick={() => { if (setLocalGuestUser) setLocalGuestUser(null); fb.signOut(fb.auth); }} className="w-full flex items-center justify-center gap-2 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors text-sm font-bold">
                        <Icon name="log-out" size={14} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative bg-slate-950 custom-scroll">
                
                {activeTab === 'campaigns' && (
                    <div className="p-4 md:p-10 max-w-7xl mx-auto">
                        
                        {/* Header & Quick Actions */}
                        <div className="flex flex-col xl:flex-row gap-6 mb-12 items-start xl:items-stretch">
                            <div className="flex-1 w-full">
                                <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Welcome Back.</h1>
                                <p className="text-slate-400 mb-6 text-sm md:text-base">Create a new realm or join an existing adventure.</p>
                                
                                <div className="flex flex-col sm:flex-row gap-4 w-full">
                                    <button onClick={openCampaignWizard} className="flex-1 w-full bg-amber-600 hover:bg-amber-500 text-white py-3 md:py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-amber-900/20 transition-all border border-amber-500/50">
                                        <Icon name="plus-circle" size={20} /> Forge New Realm
                                    </button>
                                    
                                    <div className="flex-1 w-full flex bg-slate-900 p-1 rounded-xl border border-slate-800 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
                                        <input 
                                            value={joinCode} 
                                            onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                                            placeholder="ENTER INVITE CODE" 
                                            className="flex-1 bg-transparent px-2 md:px-4 text-center font-mono tracking-widest text-base md:text-lg outline-none text-white placeholder:text-slate-600 w-full min-w-0"
                                            onKeyDown={(e) => e.key === 'Enter' && handleJoinClick(joinCode)}
                                        />
                                        <button 
                                            onClick={() => handleJoinClick(joinCode)} 
                                            disabled={!joinCode} 
                                            className={`px-4 md:px-6 rounded-lg font-bold transition-all ${joinCode ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md' : 'bg-transparent text-slate-600 cursor-not-allowed'}`}
                                        >
                                            Join
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Campaigns Grid */}
                        {emailInvites.length > 0 && (
                            <div className="mb-10">
                                <div className="flex items-center justify-between mb-4 border-b border-indigo-500/30 pb-2">
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Icon name="mail" size={20} className="text-indigo-400" /> You're Invited!
                                    </h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {emailInvites.map((invite, i) => {
                                        const seed = invite.code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                                        const bgUrl = invite.coverImage || `https://picsum.photos/seed/${seed}/600/300`;
                                        return (
                                            <div key={invite.code + i} className="group relative bg-slate-900 rounded-xl overflow-hidden border-2 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)] flex flex-col">
                                                <div className="h-32 w-full relative">
                                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent z-10"></div>
                                                    <img src={bgUrl} alt="Campaign Cover" className="w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
                                                    <div className="absolute top-3 right-3 z-20">
                                                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md bg-indigo-600/80 text-white border border-indigo-500/50 flex items-center gap-1">
                                                            <Icon name="mail" size={10} /> Pending Invite
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="p-5 flex-1 flex flex-col justify-between relative z-20 bg-slate-900">
                                                    <div>
                                                        <h3 className="font-bold text-xl text-white mb-1 tracking-wide truncate">{invite.name}</h3>
                                                        {invite.theme && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">{invite.theme}</span>}
                                                    </div>
                                                    <div className="mt-4 pt-4 border-t border-slate-800/50 flex flex-col gap-3">
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleAcceptInvite(invite)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2">
                                                                <Icon name="check" size={16} /> Accept & Join
                                                            </button>
                                                            <button onClick={(e) => handleDeclineInvite(e, invite)} className="text-slate-400 hover:text-white px-3 rounded-lg border border-slate-700 hover:border-red-500 hover:bg-red-900/50 transition-colors flex items-center justify-center" title="Decline Invite">
                                                                <Icon name="x" size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
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
                                                        openEditRealm(r);
                                                    }
                                                }}
                                                className="group relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:shadow-amber-900/10 hover:-translate-y-1 flex flex-col"
                                                title={r.role === 'dm' ? "Left-click to join. Right-click to edit." : "Click to join"}
                                            >
                                                {/* Card Header/Banner */}
                                                <div className="h-32 w-full relative">
                                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent z-10"></div>
                                                    <img src={bgUrl} alt="Campaign Cover" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500" referrerPolicy="no-referrer" />
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
                                                    
                                                    <div className="mt-4 pt-4 border-t border-slate-800/50 flex flex-col gap-3">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Realm Code</span>
                                                            <span className="text-sm font-mono text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                                                                {hideInviteCode ? '••••••' : r.code}
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={(e) => { e.stopPropagation(); handleJoinClick(r.code, r.role); }} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2">
                                                                <Icon name="swords" size={16} /> Launch VTT
                                                            </button>
                                                            {r.role === 'dm' && (
                                                                <button onClick={(e) => { e.stopPropagation(); openEditRealm(r); }} className="text-slate-400 hover:text-white px-3 rounded-lg border border-slate-700 hover:border-amber-500 hover:bg-amber-900/50 transition-colors flex items-center justify-center" title="Edit Realm">
                                                                    <Icon name="pencil" size={16} />
                                                                </button>
                                                            )}
                                                            <button onClick={(e) => deleteCampaign(e, r)} className="text-slate-400 hover:text-white px-3 rounded-lg border border-slate-700 hover:border-red-500 hover:bg-red-900/50 transition-colors flex items-center justify-center" title={r.role === 'dm' ? "Delete Campaign" : "Leave Campaign"}>
                                                                {r.role === 'dm' ? <Icon name="trash-2" size={16} /> : <Icon name="log-out" size={16} />}
                                                            </button>
                                                        </div>
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
                                                {char.avatarUrl ? <img src={char.avatarUrl} className="w-full h-full object-cover" alt="Avatar" referrerPolicy="no-referrer" /> : <Icon name="user" size={24} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-xl text-white truncate">{char.name || "Unnamed"}</h3>
                                                <p className="text-sm text-slate-400 truncate">Lvl {char.level || 1} {char.class || "Commoner"}</p>
                                                {char.campaignName && (
                                                    <p className="text-xs text-indigo-400/80 truncate mt-1 flex items-center gap-1">
                                                        <Icon name="map" size={12} /> {char.campaignName}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-3 bg-slate-900/50 border-t border-slate-800 flex justify-between">
                                            <button onClick={() => setEditingCharacter(char)} className="text-indigo-400 hover:text-indigo-300 text-sm font-bold flex items-center gap-1">
                                                <Icon name="pencil" size={14} /> Edit
                                            </button>
                                            <button onClick={async (e) => {
                                                e.stopPropagation();
                                                if (await dialog.confirm("Delete this character?")) {
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
                    <div className="p-4 md:p-10 max-w-4xl mx-auto animate-in fade-in">
                        <div className="mb-6 md:mb-10">
                            <h1 className="text-3xl md:text-4xl font-black text-white mb-2">My Profile</h1>
                            <p className="text-slate-400">Manage your global account settings.</p>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="bg-slate-900 p-6 md:p-8 rounded-xl border border-slate-800 shadow-xl space-y-6">
                                <div className="flex items-center gap-6 pb-6 border-b border-slate-800">
                                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-800 border-4 border-slate-700 overflow-hidden shrink-0 flex items-center justify-center text-3xl font-bold text-slate-500">
                                        {localPhotoUrl ? <img src={localPhotoUrl} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (localDisplayName[0] || '?')}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xl md:text-2xl font-bold text-white truncate">{localDisplayName}</h3>
                                        <p className="text-xs md:text-sm text-slate-500 font-mono mt-1 truncate">ID: {user.uid}</p>
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
                                    <button onClick={handleSaveProfile} className="w-full md:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all flex justify-center items-center gap-2"><Icon name="save" size={18} /> Save Profile</button>
                                </div>
                            </div>

                            <div className="bg-slate-900 p-6 md:p-8 rounded-xl border border-slate-800 shadow-xl space-y-6">
                                <h3 className="text-xl font-bold text-white mb-4">App Preferences</h3>
                                
                                <button 
                                    onClick={() => {
                                        const newValue = !hideInviteCode;
                                        setHideInviteCode(newValue);
                                    }} 
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors text-sm font-bold border ${hideInviteCode ? 'bg-red-900/20 text-red-400 border-red-900/50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon name={hideInviteCode ? "eye-off" : "eye"} size={18} /> 
                                        <div className="text-left">
                                            <div>Streamer Mode</div>
                                            <div className="text-[10px] font-normal opacity-70 mt-0.5">Masks invite codes globally.</div>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${hideInviteCode ? 'bg-red-900/50 text-red-300' : 'bg-slate-800'}`}>{hideInviteCode ? 'ON' : 'OFF'}</span>
                                </button>

                                <button 
                                    onClick={() => {
                                        const newValue = !autoJoin;
                                        setAutoJoin(newValue);
                                        localStorage.setItem('dm_auto_join', String(newValue));
                                    }} 
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors text-sm font-bold border ${autoJoin ? 'bg-indigo-900/20 text-indigo-400 border-indigo-900/50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon name="fast-forward" size={18} /> 
                                        <div className="text-left">
                                            <div>Auto-Join Session</div>
                                            <div className="text-[10px] font-normal opacity-70 mt-0.5">Skips the dashboard when opening DungeonMind.</div>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${autoJoin ? 'bg-indigo-900/50 text-indigo-300' : 'bg-slate-800'}`}>{autoJoin ? 'ON' : 'OFF'}</span>
                                </button>

                                <div className="pt-6 mt-6 border-t border-slate-800">
                                    <h4 className="text-sm font-bold text-slate-300 mb-3">Troubleshooting</h4>
                                    <button 
                                        onClick={handleRecoverRealms} 
                                        disabled={isRecovering}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors text-sm font-bold border bg-slate-950 text-amber-400 border-slate-800 hover:bg-slate-800 hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon name={isRecovering ? "loader-2" : "search"} size={18} className={isRecovering ? "animate-spin" : ""} /> 
                                            <div className="text-left">
                                                <div>Recover Missing Realms</div>
                                                <div className="text-[10px] font-normal opacity-70 mt-0.5 text-slate-400">Scans the cloud for realms you belong to that are missing from your dashboard.</div>
                                            </div>
                                        </div>
                                    </button>
                                    
                                    <button onClick={() => { if (setLocalGuestUser) setLocalGuestUser(null); fb.signOut(fb.auth); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-900/20 border border-red-900/50 hover:bg-red-900/40 text-red-400 transition-colors text-sm font-bold">
                                        <Icon name="log-out" size={18} /> Sign Out
                                    </button>
                                </div>
                            </div>

                            {/* Account Security & Linked Logins */}
                            <div className="bg-slate-900 p-6 md:p-8 rounded-xl border border-slate-800 shadow-xl space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                            <Icon name="shield-check" size={20} className="text-amber-500" /> Account Security & Linked Logins
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-1">
                                            Link both Google and DungeonMind logins to access your characters from any device.
                                        </p>
                                    </div>
                                    {user?.isAnonymous && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-amber-950/60 border border-amber-500/50 text-amber-300">
                                            Guest Profile
                                        </span>
                                    )}
                                </div>

                                {user?.isAnonymous && (
                                    <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3">
                                        <Icon name="alert-triangle" size={20} className="text-amber-400 shrink-0 mt-0.5" />
                                        <div className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
                                            <span className="font-bold text-amber-300">You are currently playing as a Guest. </span>
                                            Your campaigns and characters are only preserved on this browser. Link your Google account or create a DungeonMind password below so you can sign in anytime and never lose your adventures!
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    {/* Google Provider Card */}
                                    {(() => {
                                        const hasGoogle = (user?.providerData || []).some(p => p.providerId === 'google.com');
                                        const googleEmail = user?.providerData?.find(p => p.providerId === 'google.com')?.email || (hasGoogle ? user?.email : null);
                                        return (
                                            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                                                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm text-white">Google Account</span>
                                                            {hasGoogle && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 flex items-center gap-1">
                                                                    <Icon name="check" size={10} /> Linked
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                                                            {hasGoogle ? (googleEmail || 'Connected') : 'Not linked to this profile'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {hasGoogle ? (
                                                        (user?.providerData?.length > 1) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUnlinkProvider('google.com')}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors"
                                                            >
                                                                Unlink
                                                            </button>
                                                        )
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={isLinking}
                                                            onClick={handleLinkGoogle}
                                                            className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-indigo-900/20 disabled:opacity-50"
                                                        >
                                                            <Icon name="link" size={14} /> Link Google
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* DungeonMind Password Provider Card */}
                                    {(() => {
                                        const hasPassword = (user?.providerData || []).some(p => p.providerId === 'password');
                                        const passEmail = user?.providerData?.find(p => p.providerId === 'password')?.email || (hasPassword ? user?.email : null);
                                        return (
                                            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-amber-400">
                                                        <Icon name="key" size={20} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm text-white">DungeonMind Password</span>
                                                            {hasPassword && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 flex items-center gap-1">
                                                                    <Icon name="check" size={10} /> Active
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                                                            {hasPassword ? (passEmail || 'Configured') : 'No password configured for direct email login'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {hasPassword ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={handleSendProfilePasswordReset}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-slate-800 transition-colors flex items-center gap-1.5"
                                                            >
                                                                <Icon name="send" size={12} /> Reset Password
                                                            </button>
                                                            {(user?.providerData?.length > 1) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUnlinkProvider('password')}
                                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors"
                                                                >
                                                                    Unlink
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setLinkEmail(user?.email || '');
                                                                setLinkPassword('');
                                                                setLinkPasswordConfirm('');
                                                                setShowLinkPasswordModal(true);
                                                            }}
                                                            className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-amber-900/20"
                                                        >
                                                            <Icon name="lock" size={14} /> Set DungeonMind Password
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Set DungeonMind Password Modal */}
                            {showLinkPasswordModal && (
                                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                <Icon name="lock" size={18} className="text-amber-500" /> Set DungeonMind Password
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() => setShowLinkPasswordModal(false)}
                                                className="text-slate-400 hover:text-white p-1 rounded-lg"
                                            >
                                                <Icon name="x" size={18} />
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mb-4">
                                            Attach an email address and password to your profile so you can log in directly without needing Google.
                                        </p>
                                        <form onSubmit={handleLinkPassword} className="space-y-3.5">
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Account Email</label>
                                                <input
                                                    type="email"
                                                    required
                                                    value={linkEmail}
                                                    onChange={(e) => setLinkEmail(e.target.value)}
                                                    placeholder="adventurer@dungeonmind.net"
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-amber-500 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">New Password</label>
                                                <div className="relative flex items-center">
                                                    <input
                                                        type={showLinkPassword ? "text" : "password"}
                                                        required
                                                        value={linkPassword}
                                                        onChange={(e) => setLinkPassword(e.target.value)}
                                                        placeholder="At least 6 characters"
                                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 pr-10 text-sm text-white outline-none focus:border-amber-500 font-mono"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowLinkPassword(!showLinkPassword)}
                                                        className="absolute right-3 text-slate-500 hover:text-slate-300"
                                                    >
                                                        <Icon name={showLinkPassword ? "eye-off" : "eye"} size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Confirm Password</label>
                                                <input
                                                    type={showLinkPassword ? "text" : "password"}
                                                    required
                                                    value={linkPasswordConfirm}
                                                    onChange={(e) => setLinkPasswordConfirm(e.target.value)}
                                                    placeholder="Re-enter password"
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-amber-500 font-mono"
                                                />
                                            </div>
                                            <div className="flex items-center justify-end gap-3 pt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowLinkPasswordModal(false)}
                                                    className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={isLinking}
                                                    className="px-5 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-md disabled:opacity-50"
                                                >
                                                    {isLinking ? <Icon name="loader-2" size={14} className="animate-spin" /> : <Icon name="save" size={14} />}
                                                    Save & Link
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
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
                                onOpenModelPicker={() => setShowLobbyModelPicker(true)}
                            />
                        </div>

                        {showLobbyModelPicker && editingCharacter && (
                            <ModelPickerModal
                                isOpen={showLobbyModelPicker}
                                entity={editingCharacter}
                                onClose={() => setShowLobbyModelPicker(false)}
                                onSave={(config) => {
                                    const updated = {
                                        ...editingCharacter,
                                        model3d: config.modelUrl || null,
                                        modelUrl: config.modelUrl || null,
                                        modelScale: config.modelScale !== undefined ? config.modelScale : 1,
                                        modelYOffset: config.modelYOffset !== undefined ? config.modelYOffset : 0,
                                        modelRotation: config.modelRotation !== undefined ? config.modelRotation : 0,
                                        materialStyle: config.materialStyle || 'original',
                                        forceStatue: !!config.forceStatue
                                    };
                                    handleSaveCharacter(updated);
                                    setEditingCharacter(updated);
                                    setShowLobbyModelPicker(false);
                                }}
                                onDeleteModel={() => {
                                    const updated = {
                                        ...editingCharacter,
                                        model3d: null,
                                        modelUrl: null,
                                        modelScale: 1,
                                        modelYOffset: 0,
                                        modelRotation: 0,
                                        materialStyle: 'original'
                                    };
                                    delete updated.forceStatue;
                                    handleSaveCharacter(updated);
                                    setEditingCharacter(updated);
                                    setShowLobbyModelPicker(false);
                                }}
                            />
                        )}
                    </div>
                )}

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
                                            <img src={newCampaignData.coverImage} className="w-full h-full object-cover" alt="Cover" referrerPolicy="no-referrer" />
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

                {/* Realm Edit Modal */}
                {editingRealm && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingRealm(null)}>
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black text-amber-500 fantasy-font tracking-wider">Edit Realm</h2>
                                    <p className="text-sm text-slate-400">Update your campaign's appearance and details.</p>
                                </div>
                                <button onClick={() => setEditingRealm(null)} className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors">
                                    <Icon name="x" size={24} />
                                </button>
                            </div>
                            
                            <div className="p-6 space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-2">Realm Name</label>
                                    <input 
                                        type="text" 
                                        value={editingRealm.name}
                                        onChange={(e) => setEditingRealm(prev => ({...prev, name: e.target.value}))}
                                        placeholder="e.g., Curse of the Crimson Crown"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-2">Campaign Theme</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['Heroic Fantasy', 'Dark Fantasy', 'Sci-Fi / Cyberpunk', 'Gothic Horror'].map(theme => (
                                            <button
                                                key={theme}
                                                onClick={() => setEditingRealm(prev => ({...prev, theme}))}
                                                className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${editingRealm.theme === theme ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-600'}`}
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
                                            onClick={generateEditCoverImage}
                                            disabled={isGeneratingEditImage || !editingRealm.name}
                                            className="text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/40 px-3 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Icon name="wand-2" size={12} /> {isGeneratingEditImage ? "Scrying..." : "AI Generate"}
                                        </button>
                                    </div>
                                    <div className="w-full h-32 bg-slate-800 border-2 border-dashed border-slate-700 rounded-lg overflow-hidden relative flex items-center justify-center">
                                        {isGeneratingEditImage && (
                                            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                                <Icon name="loader-2" size={24} className="text-indigo-400 animate-spin mb-2" />
                                                <span className="text-xs text-indigo-300 font-bold animate-pulse">Consulting the arcane...</span>
                                            </div>
                                        )}
                                        {editingRealm.coverImage ? (
                                            <img src={editingRealm.coverImage} className="w-full h-full object-cover" alt="Cover" referrerPolicy="no-referrer" />
                                        ) : (
                                            <div className="text-slate-500 flex flex-col items-center gap-2">
                                                <Icon name="image" size={24} />
                                                <span className="text-xs">Click AI Generate to conjure artwork</span>
                                            </div>
                                        )}
                                    </div>
                                    <input 
                                        type="text" 
                                        value={editingRealm.coverImage}
                                        onChange={(e) => setEditingRealm(prev => ({...prev, coverImage: e.target.value}))}
                                        placeholder="Or paste an image URL..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-3 text-xs text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors font-mono"
                                    />
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
                                <button onClick={() => setEditingRealm(null)} className="px-6 py-2 rounded-lg font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={saveEditedRealm} className="px-8 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all flex items-center gap-2">
                                    <Icon name="save" size={18} /> Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Campaign Session Join & Character Selection Modal */}
                {isJoiningCampaign && (
                    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto custom-scroll" onClick={() => setIsJoiningCampaign(false)}>
                        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            
                            {/* Campaign Session Preview Header */}
                            <div className="relative border-b border-slate-800 bg-slate-950 overflow-hidden shrink-0">
                                {joiningCampaignDetails?.coverImage && (
                                    <div className="absolute inset-0 z-0 opacity-25">
                                        <img src={joiningCampaignDetails.coverImage} alt="Cover" className="w-full h-full object-cover filter blur-xs" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent"></div>
                                    </div>
                                )}
                                <div className="relative z-10 p-5 sm:p-6 flex justify-between items-start gap-4">
                                    <div className="flex items-center gap-4 min-w-0">
                                        {joiningCampaignDetails?.coverImage ? (
                                            <img 
                                                src={joiningCampaignDetails.coverImage} 
                                                alt="Cover Thumb" 
                                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border-2 border-amber-500/50 shadow-md shrink-0 hidden sm:block" 
                                            />
                                        ) : (
                                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400 hidden sm:flex">
                                                <Icon name="castle" size={28} />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/30">
                                                    Joining Session
                                                </span>
                                                <span className="text-xs font-mono text-amber-400 font-bold">
                                                    #{hideInviteCode ? '••••••' : joiningCode}
                                                </span>
                                            </div>
                                            <h2 className="text-xl sm:text-2xl font-black text-white truncate fantasy-font tracking-wide">
                                                {joiningCampaignDetails?.name || `Realm ${joiningCode}`}
                                            </h2>
                                            <p className="text-xs text-slate-400 truncate mt-0.5">
                                                Theme: <span className="text-slate-300">{joiningCampaignDetails?.theme || 'Heroic Fantasy'}</span>
                                                {joiningCampaignDetails?.hostName && (
                                                    <> • Host: <span className="text-slate-300">{joiningCampaignDetails.hostName}</span></>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setIsJoiningCampaign(false)} 
                                        className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors shrink-0"
                                        title="Cancel"
                                    >
                                        <Icon name="x" size={20} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Modal Body: Character Sheet Gate */}
                            <div className="p-5 sm:p-6 bg-slate-950 overflow-y-auto flex-1 custom-scroll space-y-5">
                                <div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                        <div>
                                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                                <Icon name="user" size={18} className="text-amber-500" />
                                                Choose Your Character Sheet
                                            </h3>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Select a hero from your vault, forge a new adventurer, or join as a spectator.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={handleCreateCharacter} 
                                                className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/50 text-indigo-200 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                            >
                                                <Icon name="plus" size={14} /> New Sheet
                                            </button>
                                            <button 
                                                onClick={() => setShowDndBeyondImport(true)} 
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                            >
                                                <Icon name="download" size={14} /> Import Beyond
                                            </button>
                                        </div>
                                    </div>

                                    {/* Spectator Mode Option */}
                                    <div 
                                        onClick={() => setSelectedCharacterId(null)}
                                        className={`p-3.5 rounded-xl border cursor-pointer transition-all mb-4 flex items-center justify-between ${
                                            selectedCharacterId === null 
                                                ? 'bg-amber-600/15 border-amber-500 shadow-md shadow-amber-950/30 ring-1 ring-amber-500/50' 
                                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                                selectedCharacterId === null ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                                            }`}>
                                                <Icon name="eye" size={20} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-white flex items-center gap-2">
                                                    Join without Character (Spectator)
                                                    {selectedCharacterId === null && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 uppercase font-mono font-bold">Selected</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                    Observe the map, chat, and roll dice without assigning a character sheet now.
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                            selectedCharacterId === null ? 'border-amber-500 bg-amber-500 text-black font-bold' : 'border-slate-700'
                                        }`}>
                                            {selectedCharacterId === null && <Icon name="check" size={12} />}
                                        </div>
                                    </div>

                                    {/* Characters Vault List */}
                                    {characters.length === 0 ? (
                                        <div className="text-center py-7 px-4 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 flex flex-col items-center">
                                            <div className="w-12 h-12 rounded-full bg-slate-800/80 text-slate-500 flex items-center justify-center mb-2.5">
                                                <Icon name="scroll" size={22} />
                                            </div>
                                            <p className="text-sm text-slate-300 font-medium mb-1">No character sheets in your vault</p>
                                            <p className="text-xs text-slate-500 mb-4 max-w-sm">
                                                Build a character in 60 seconds with our wizard, import from D&D Beyond, or join directly as a spectator.
                                            </p>
                                            <div className="flex flex-wrap items-center justify-center gap-2">
                                                <button 
                                                    onClick={handleCreateCharacter} 
                                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-all"
                                                >
                                                    <Icon name="wand-2" size={14} /> Forge Character Sheet
                                                </button>
                                                <button 
                                                    onClick={() => setShowDndBeyondImport(true)} 
                                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
                                                >
                                                    <Icon name="download" size={14} /> Import Beyond Sheet
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                                                Your Vault Characters ({characters.length})
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto custom-scroll pr-1">
                                                {characters.map(char => {
                                                    const isSelected = selectedCharacterId === char.id;
                                                    return (
                                                        <div 
                                                            key={char.id} 
                                                            onClick={() => setSelectedCharacterId(char.id)}
                                                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                                                isSelected 
                                                                    ? 'bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-950/40 ring-1 ring-indigo-500' 
                                                                    : 'bg-slate-900 border-slate-800 hover:border-slate-600 hover:bg-slate-850'
                                                            }`}
                                                        >
                                                            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                                                                {char.avatarUrl ? (
                                                                    <img src={char.avatarUrl} className="w-full h-full object-cover" alt="Avatar" referrerPolicy="no-referrer" />
                                                                ) : (
                                                                    <Icon name="user" size={18} className="text-slate-500" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-bold text-white text-sm truncate">
                                                                    {char.name}
                                                                </div>
                                                                <div className="text-xs text-slate-400 truncate">
                                                                    Lvl {char.level || 1} {char.race || ''} {char.class || 'Adventurer'}
                                                                </div>
                                                                {char.campaignName && (
                                                                    <div className="text-[10px] text-indigo-400/80 truncate mt-0.5">
                                                                        Realm: {char.campaignName}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                                                isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-700'
                                                            }`}>
                                                                {isSelected && <Icon name="check" size={12} />}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Modal Footer with Enter Realm CTA */}
                            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                                <div className="text-xs text-slate-400 text-center sm:text-left">
                                    {selectedCharacterId 
                                        ? <>Entering with: <strong className="text-indigo-400">{characters.find(c => c.id === selectedCharacterId)?.name || 'Selected Character'}</strong></> 
                                        : <>Entering as: <strong className="text-amber-400">Spectator (No Character)</strong></>
                                    }
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <button 
                                        onClick={() => setIsJoiningCampaign(false)} 
                                        className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={finalizeJoin} 
                                        className="flex-1 sm:flex-none px-7 py-2.5 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2 text-sm"
                                    >
                                        Enter Realm <Icon name="arrow-right" size={16} />
                                    </button>
                                </div>
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
                                onClick={() => { setIsInWaitingRoom(false); updateDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', joiningCode, 'joinRequests', user.uid), { status: 'canceled' }).catch(()=>{}); }}
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

                {/* Native Builder Modal */}
                {showBuilder && (
                    <CharacterBuilder 
                        onClose={() => setShowBuilder(false)}
                        onComplete={handleBuilderComplete}
                    />
                )}

            </main>
        </div>
    );
};

export default Lobby;