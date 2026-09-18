import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { useDialog } from './DialogProvider';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { useVfxStore } from '../stores/useVfxStore';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { playDiceClatter, playTurnChime, playCritFanfare, playCoinFlip } from '../utils/sfxService';

// --- CUSTOM TOGGLE SWITCH COMPONENT ---
const ToggleSwitch = ({ checked, onChange, disabled, label, description, badge }) => (
    <div 
        onClick={() => !disabled && onChange(!checked)}
        className={`flex items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
            disabled ? 'opacity-50 cursor-not-allowed bg-slate-900/40 border-slate-800' : 
            checked ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/60 cursor-pointer shadow-sm' : 
            'bg-slate-900/60 border-slate-800 hover:border-slate-700 cursor-pointer'
        }`}
    >
        <div className="flex-1">
            <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${checked ? 'text-white' : 'text-slate-300'}`}>{label}</span>
                {badge && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
                        {badge}
                    </span>
                )}
            </div>
            {description && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>}
        </div>
        <div className={`w-12 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${checked ? 'bg-amber-500' : 'bg-slate-700'}`}>
            <div className={`w-5 h-5 rounded-full bg-white transition-transform shadow-md ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
        </div>
    </div>
);

// --- PRESET AVATARS ---
const AVATAR_PRESETS = [
    { name: 'Paladin', url: 'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=200&auto=format&fit=crop&q=80' },
    { name: 'Wizard', url: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=200&auto=format&fit=crop&q=80' },
    { name: 'Rogue', url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=200&auto=format&fit=crop&q=80' },
    { name: 'Cleric', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&auto=format&fit=crop&q=80' },
    { name: 'Dragonborn', url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=200&auto=format&fit=crop&q=80' },
    { name: 'Dungeon Master', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&auto=format&fit=crop&q=80' },
];

// --- 3D DICE THEMES ---
const DICE_THEMES = [
    { id: 'gold', name: 'Dragon Gold', color: '#f59e0b', border: 'border-amber-500', bg: 'bg-amber-500/20' },
    { id: 'ruby', name: 'Blood Ruby', color: '#ef4444', border: 'border-red-500', bg: 'bg-red-500/20' },
    { id: 'obsidian', name: 'Void Obsidian', color: '#94a3b8', border: 'border-slate-500', bg: 'bg-slate-800' },
    { id: 'emerald', name: 'Emerald Grove', color: '#10b981', border: 'border-emerald-500', bg: 'bg-emerald-500/20' },
    { id: 'amethyst', name: 'Amethyst Arcana', color: '#a855f7', border: 'border-purple-500', bg: 'bg-purple-500/20' },
    { id: 'frost', name: 'Sapphire Frost', color: '#06b6d4', border: 'border-cyan-500', bg: 'bg-cyan-500/20' },
];

const SettingsView = ({ 
    apiKey, setApiKey, 
    role, 
    code, user, onExit, 
    aiProvider, setAiProvider, 
    openAiModel, setOpenAiModel, 
    puterModel, setPuterModel,
    hideInviteCode,
    setHideInviteCode,
    joinRequests = []
}) => {
    const { campaign, updateCampaign, kickPlayer, banPlayer, unbanPlayer, clearChat } = useNewCampaign();
    const data = campaign || {};
    const toast = useToast();
    const dialog = useDialog();

    // Active Category Tab
    const [activeTab, setActiveTab] = useState('general');

    // Local / Persistent UI States
    const [autoJoin, setAutoJoin] = useState(() => localStorage.getItem('dm_auto_join') === 'true');
    const [sfxDice, setSfxDice] = useState(() => localStorage.getItem('dm_sfx_dice') !== 'false');
    const [sfxTurn, setSfxTurn] = useState(() => localStorage.getItem('dm_sfx_turn') !== 'false');
    const [screenShake, setScreenShake] = useState(() => localStorage.getItem('dm_screen_shake') !== 'false');
    const [diceTheme, setDiceTheme] = useState(() => localStorage.getItem('dm_dice_theme') || 'gold');
    const [chatScale, setChatScale] = useState(() => localStorage.getItem('dm_chat_scale') || 'standard');

    // VFX Store integration
    const ambientLifeLevel = useVfxStore(state => state.ambientLifeLevel);
    const setAmbientLifeLevel = useVfxStore(state => state.setAmbientLifeLevel);

    // Profile Edit State
    const [localDisplayName, setLocalDisplayName] = useState(user?.displayName || 'Adventurer');
    const [localPhotoUrl, setLocalPhotoUrl] = useState(user?.photoURL || '');

    // Invite Email
    const [inviteEmail, setInviteEmail] = useState('');

    // My Assigned Character
    const myCharId = data.assignments?.[user?.uid];
    const myChar = data.players?.find(p => String(p.id) === String(myCharId));
    const [localCharUrl, setLocalCharUrl] = useState(myChar?.externalSheetUrl || "");
    const [localUseExternal, setLocalUseExternal] = useState(myChar?.useExternalSheet || false);

    // AI & Tokens State
    const [hfToken, setHfToken] = useState(() => localStorage.getItem('hf_token') || '');
    const [forgeEngine, setForgeEngine] = useState(() => localStorage.getItem('forge_engine') || 'VAST-AI/TripoSG');

    // Campaign Bible State
    const [bibleData, setBibleData] = useState(data.campaign?.genesis || { tone: '', conflict: '', campaignName: '' });

    useEffect(() => {
        if (data.campaign?.genesis) {
            setBibleData(data.campaign.genesis);
        }
    }, [data.campaign?.genesis]);

    useEffect(() => {
        if (user) {
            setLocalDisplayName(user.displayName || 'Adventurer');
            setLocalPhotoUrl(user.photoURL || '');
        }
    }, [user]);

    useEffect(() => {
        if (myChar) {
            setLocalCharUrl(myChar.externalSheetUrl || "");
            setLocalUseExternal(myChar.useExternalSheet || false);
        }
    }, [myCharId, data.players]);

    // Save Profile
    const handleSaveProfile = async () => {
        const newName = localDisplayName.trim() || 'Adventurer';
        const newPhoto = localPhotoUrl.trim();
        try {
            if (user?.updateProfile) {
                await user.updateProfile({ displayName: newName, photoURL: newPhoto });
            }
            await updateCampaign({ [`activeUsers.${user.uid}`]: newName });
            toast("Profile updated successfully!", "success");
            window.location.reload();
        } catch (err) {
            console.error("Failed to update profile", err);
            toast("Failed to update profile.", "error");
        }
    };

    // Save External Character Integration
    const handleCharSave = () => {
        if (!myCharId) return;
        const updatedPlayers = (data.players || []).map(p => 
            String(p.id) === String(myCharId) 
            ? { ...p, externalSheetUrl: localCharUrl, useExternalSheet: localUseExternal } 
            : p
        );
        updateCampaign({ players: updatedPlayers });
        toast("Character integration updated!", "success");
    };

    // Save Campaign Bible
    const handleBibleSave = () => {
        updateCampaign({ 
            'campaign.genesis': bibleData,
            'campaignName': bibleData.campaignName
        });
        toast("Campaign Bible updated!", "success");
    };

    // Email Invites
    const handleSendInvite = async () => {
        if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
            toast("Please enter a valid email address.", "error");
            return;
        }
        const cleanEmail = inviteEmail.trim().toLowerCase();
        try {
            const campaignRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
            await updateDoc(campaignRef, {
                pendingEmailInvites: arrayUnion(cleanEmail)
            });
            setInviteEmail('');
            toast(`Invite sent to ${cleanEmail}!`, "success");
        } catch (err) {
            console.error("Failed to send invite", err);
            toast("Failed to send invite: " + err.message, "error");
        }
    };

    const handleRevokeInvite = async (email) => {
        if (!(await dialog.confirm(`Revoke invite for ${email}?`))) return;
        try {
            const campaignRef = doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
            await updateDoc(campaignRef, {
                pendingEmailInvites: arrayRemove(email)
            });
            toast(`Revoked invite for ${email}`, "info");
        } catch (err) {
            console.error("Failed to revoke invite", err);
        }
    };

    // Player Assignments & DM Status
    const handleAssignCharacter = (uid, charId) => {
        const newAssignments = { ...(data.assignments || {}), [uid]: charId };
        updateCampaign({ assignments: newAssignments });
        toast("Character assigned!", "success");
    };

    const toggleDmStatus = async (uid) => {
        let newDmIds = [...(data.dmIds || [])];
        if (newDmIds.includes(uid)) {
            if (newDmIds.length <= 1) {
                dialog.alert("Cannot renounce: You are the only DM left!");
                return;
            }
            if (!(await dialog.confirm("Are you sure you want to renounce your Dungeon Master status? You will lose access to DM tools."))) return;
            newDmIds = newDmIds.filter(id => id !== uid);
        } else {
            if (!(await dialog.confirm("Promote this user to Dungeon Master? They will have full control over the campaign."))) return;
            newDmIds.push(uid);
        }
        updateCampaign({ dmIds: newDmIds });
    };

    // Safe Exit Handler
    const handleSafeExit = async () => {
        if (await dialog.confirm("Disconnect from current session?")) {
            localStorage.removeItem('dm_last_session');
            if (onExit) onExit();
        }
    };

    // Export Full Campaign Backup
    const handleExportCampaignBackup = () => {
        const backupData = {
            version: '2.0',
            exportType: 'DungeonMind_Full_Campaign_Backup',
            campaignCode: code,
            exportedAt: new Date().toISOString(),
            campaignName: data.campaignName || data.campaign?.genesis?.campaignName || 'Campaign',
            campaign: data.campaign || {},
            config: data.config || {},
            players: data.players || [],
            npcs: data.npcs || [],
            assignments: data.assignments || {},
            moduleSkeleton: data.moduleSkeleton || data.campaign?.moduleSkeleton || null
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(data.campaignName || 'Campaign').replace(/\s+/g, '_')}_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a);
        toast("Campaign backup downloaded!", "success");
    };

    // Generate the invite URL
    const currentInviteParam = data.campaign?.inviteToken ? `invite=${data.campaign.inviteToken}` : `join=${code}`;
    const inviteUrl = `${window.location.origin}${import.meta.env.BASE_URL}?${currentInviteParam}`;

    // Category Tabs definition
    const CATEGORIES = [
        { id: 'general', label: 'General & Profile', icon: 'user' },
        { id: 'rules', label: 'Tabletop & 5e Rules', icon: 'shield', badge: role === 'dm' ? 'DM' : null },
        { id: 'sfx', label: 'Audio & Sensory', icon: 'volume-2' },
        { id: 'appearance', label: 'Appearance & Dice', icon: 'palette' },
        { id: 'ai', label: 'AI & Intelligence', icon: 'sparkles' },
        { id: 'players', label: 'Party & Access', icon: 'users', count: joinRequests.length > 0 ? joinRequests.length : null },
        { id: 'bible', label: 'Campaign World', icon: 'book-open' },
        ...(myChar ? [{ id: 'character', label: 'My Character', icon: 'sword' }] : []),
        ...(role === 'dm' ? [{ id: 'maintenance', label: 'Backup & Danger', icon: 'alert-triangle' }] : []),
    ];

    return (
        <div className="h-full bg-slate-950 flex flex-col overflow-hidden">
            
            {/* TOP HEADER */}
            <div className="shrink-0 bg-slate-900 border-b border-slate-800 p-4 sm:p-6 shadow-xl">
                <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                                Realm Configuration
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-slate-400 font-medium">Rules, Audio, Appearance & Player Controls</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl fantasy-font text-white tracking-wide mt-0.5">Realms & Rules</h2>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-700/80 flex items-center gap-2.5 shadow">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Realm Code</span>
                            <span className="text-base font-mono font-bold text-white tracking-widest">{hideInviteCode ? '••••••' : code}</span>
                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(code);
                                    toast("Game code copied to clipboard!", "success");
                                }} 
                                className="text-amber-500 hover:text-amber-300 p-1 transition-colors"
                                title="Copy Code"
                            >
                                <Icon name="copy" size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* CATEGORY NAV PILLS */}
                <div className="max-w-7xl w-full mx-auto mt-5 pt-3 border-t border-slate-800/80 flex gap-1.5 overflow-x-auto pb-1 custom-scroll">
                    {CATEGORIES.map(cat => {
                        const isActive = activeTab === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 relative ${
                                    isActive 
                                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-950/40 border border-amber-500/50' 
                                        : 'bg-slate-950/50 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80'
                                }`}
                            >
                                <Icon name={cat.icon} size={15} className={isActive ? 'text-white' : 'text-amber-500/70'} />
                                <span>{cat.label}</span>
                                {cat.badge && (
                                    <span className={`text-[9px] px-1 py-0.2 rounded font-extrabold ${isActive ? 'bg-amber-800 text-amber-200' : 'bg-slate-800 text-slate-400'}`}>
                                        {cat.badge}
                                    </span>
                                )}
                                {cat.count && (
                                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white animate-pulse">
                                        {cat.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* MAIN SETTINGS CONTENT AREA */}
            <div className="flex-1 overflow-y-auto custom-scroll p-4 sm:p-8">
                <div className="max-w-4xl w-full mx-auto space-y-6 pb-20">

                    {/* =========================================
                        TAB: GENERAL & PROFILE
                    ========================================= */}
                    {activeTab === 'general' && (
                        <div className="space-y-6 animate-in fade-in">
                            {/* Profile Card */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="user" size={18} className="text-amber-500" /> My Profile
                                </h3>
                                <p className="text-xs text-slate-400 mb-5">Your persona and presence at the virtual table.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Display Name</label>
                                        <input 
                                            value={localDisplayName} 
                                            onChange={(e) => setLocalDisplayName(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-sm transition-colors"
                                            placeholder="Your tabletop display name"
                                        />
                                        <p className="text-[11px] text-slate-500 mt-1">Appears in campaign chat when not speaking as an assigned character.</p>
                                    </div>

                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Avatar Image URL</label>
                                        <input 
                                            value={localPhotoUrl} 
                                            onChange={(e) => setLocalPhotoUrl(e.target.value)}
                                            placeholder="https://..."
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none font-mono text-xs transition-colors"
                                        />
                                    </div>

                                    {/* Preset Avatars */}
                                    <div>
                                        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                                            Quick Avatar Presets
                                        </span>
                                        <div className="flex flex-wrap gap-2.5">
                                            {AVATAR_PRESETS.map(preset => (
                                                <button
                                                    key={preset.name}
                                                    type="button"
                                                    onClick={() => setLocalPhotoUrl(preset.url)}
                                                    className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all ${
                                                        localPhotoUrl === preset.url 
                                                            ? 'border-amber-500 bg-amber-950/40 text-amber-300' 
                                                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                                                    }`}
                                                >
                                                    <img src={preset.url} alt={preset.name} className="w-7 h-7 rounded-lg object-cover" />
                                                    <span className="text-xs font-medium pr-1.5">{preset.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <button 
                                            onClick={handleSaveProfile}
                                            className="bg-amber-600 hover:bg-amber-500 px-6 py-2.5 rounded-xl text-white font-bold transition-all shadow-md shadow-amber-950/40 text-xs flex items-center gap-2"
                                        >
                                            <Icon name="save" size={14} /> Save Profile Changes
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Session Preferences */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="sliders" size={18} className="text-amber-500" /> Session Preferences
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Local convenience and privacy options.</p>

                                <ToggleSwitch 
                                    checked={hideInviteCode || false}
                                    onChange={(val) => setHideInviteCode && setHideInviteCode(val)}
                                    label="Streamer Mode (Mask Realm Code)"
                                    description="Masks the 6-character room code and invite links to prevent unauthorized viewers on stream from joining."
                                    badge="Privacy"
                                />

                                <ToggleSwitch 
                                    checked={autoJoin}
                                    onChange={(val) => {
                                        setAutoJoin(val);
                                        localStorage.setItem('dm_auto_join', String(val));
                                    }}
                                    label="Auto-Join Previous Session"
                                    description="Automatically bypasses the campaign select screen and loads directly into this realm when opening DungeonMind."
                                />
                            </div>

                            {/* Disconnect Button */}
                            <button 
                                onClick={handleSafeExit} 
                                className="w-full py-3.5 rounded-xl border border-red-800/40 hover:border-red-500 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-white transition-all font-bold flex items-center justify-center gap-2 text-xs shadow-lg"
                            >
                                <Icon name="log-out" size={16} /> Disconnect & Leave Campaign
                            </button>
                        </div>
                    )}

                    {/* =========================================
                        TAB: TABLETOP & 5E RULES (DM Config)
                    ========================================= */}
                    {activeTab === 'rules' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-base font-bold text-white flex items-center gap-2 fantasy-font">
                                        <Icon name="shield" size={18} className="text-amber-500" /> Tabletop Combat & Mechanics
                                    </h3>
                                    {role !== 'dm' && (
                                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-bold uppercase">
                                            Read-Only (DM Controlled)
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 mb-5">Configure 5e rule interpretations and mechanical constraints.</p>

                                <div className="space-y-5">
                                    {/* Edition / Ruleset */}
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Ruleset & Edition</label>
                                        <select 
                                            value={data.config?.edition || '2014'} 
                                            onChange={(e) => updateCampaign({ 'config.edition': e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                            disabled={role !== 'dm'}
                                        >
                                            <option value="2014">D&D 5e (2014 Original Ruleset)</option>
                                            <option value="2024">D&D 5e (2024 Revised / Remaster)</option>
                                            <option value="homebrew">Custom Homebrew Rules</option>
                                        </select>
                                    </div>

                                    {/* Diagonal Movement Measurement */}
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Diagonal Movement Rule</label>
                                        <select 
                                            value={data.config?.diagonalRule || '5-5-5'} 
                                            onChange={(e) => updateCampaign({ 'config.diagonalRule': e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                            disabled={role !== 'dm'}
                                        >
                                            <option value="5-5-5">5 / 5 / 5 — Standard 5e (All diagonals count as 5 ft.)</option>
                                            <option value="5-10-5">5 / 10 / 5 — Variant Euclidean (Alternating 5 ft. then 10 ft.)</option>
                                        </select>
                                        <p className="text-[11px] text-slate-500 mt-1">Affects distance calculations in the Tactical Battlemap ruler tool.</p>
                                    </div>

                                    {/* Flanking Rule */}
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Flanking Rule</label>
                                        <select 
                                            value={data.config?.flanking || 'disabled'} 
                                            onChange={(e) => updateCampaign({ 'config.flanking': e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                            disabled={role !== 'dm'}
                                        >
                                            <option value="disabled">Disabled (Default 5e core)</option>
                                            <option value="advantage">Advantage on Melee Attacks (DMG Variant)</option>
                                            <option value="bonus2">+2 Flat Bonus to Attack Rolls (Popular Homebrew)</option>
                                        </select>
                                    </div>

                                    {/* Death Saves Visibility */}
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Death Saving Throw Visibility</label>
                                        <select 
                                            value={data.config?.deathSaves || 'public'} 
                                            onChange={(e) => updateCampaign({ 'config.deathSaves': e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                            disabled={role !== 'dm'}
                                        >
                                            <option value="public">Public (All players see successes and failures)</option>
                                            <option value="secret">Secret (Only the DM and the dying player see rolls)</option>
                                        </select>
                                    </div>

                                    {/* Initiative Tie-Breaker */}
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Initiative Tie-Breaker</label>
                                        <select 
                                            value={data.config?.initiativeTieBreaker || 'dex'} 
                                            onChange={(e) => updateCampaign({ 'config.initiativeTieBreaker': e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                            disabled={role !== 'dm'}
                                        >
                                            <option value="dex">Highest Dexterity Modifier Wins</option>
                                            <option value="rolloff">Automated d20 Roll-Off</option>
                                        </select>
                                    </div>

                                    {/* Strict Mode Toggle */}
                                    <ToggleSwitch 
                                        checked={data.config?.strictMode || false}
                                        onChange={(val) => updateCampaign({ 'config.strictMode': val })}
                                        disabled={role !== 'dm'}
                                        label="Strict Mode"
                                        description="Locks player stat values so they cannot be manually edited during active combat sessions."
                                        badge={role === 'dm' ? 'DM' : null}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =========================================
                        TAB: AUDIO & SENSORY (Web Audio SFX)
                    ========================================= */}
                    {activeTab === 'sfx' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="volume-2" size={18} className="text-amber-500" /> Audio & Sound Effects
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">
                                    Zero-latency procedural sound synthesized directly through Web Audio.
                                </p>

                                {/* Dice Sound */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-white">Dice Clatter Sound Effects</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                                                Active
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">Plays physical randomized tumbling and collision sounds when 3D dice are cast.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => playDiceClatter(true)}
                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-white rounded-lg text-xs font-bold transition-colors border border-slate-700 flex items-center gap-1.5"
                                        >
                                            <Icon name="volume-2" size={13} /> Test Clatter
                                        </button>
                                        <div 
                                            onClick={() => {
                                                const newVal = !sfxDice;
                                                setSfxDice(newVal);
                                                localStorage.setItem('dm_sfx_dice', String(newVal));
                                            }}
                                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 p-0.5 ${sfxDice ? 'bg-amber-500' : 'bg-slate-700'}`}
                                        >
                                            <div className={`w-5 h-5 rounded-full bg-white transition-transform shadow-md ${sfxDice ? 'translate-x-6' : 'translate-x-0'}`} />
                                        </div>
                                    </div>
                                </div>

                                {/* Turn Alert Chime */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                                    <div className="flex-1">
                                        <span className="font-bold text-sm text-white">Combat Turn Chime</span>
                                        <p className="text-xs text-slate-400 mt-0.5">Plays an alert chime when your character's turn arrives in the Combat Tracker.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => playTurnChime(true)}
                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-white rounded-lg text-xs font-bold transition-colors border border-slate-700 flex items-center gap-1.5"
                                        >
                                            <Icon name="bell" size={13} /> Test Chime
                                        </button>
                                        <div 
                                            onClick={() => {
                                                const newVal = !sfxTurn;
                                                setSfxTurn(newVal);
                                                localStorage.setItem('dm_sfx_turn', String(newVal));
                                            }}
                                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 p-0.5 ${sfxTurn ? 'bg-amber-500' : 'bg-slate-700'}`}
                                        >
                                            <div className={`w-5 h-5 rounded-full bg-white transition-transform shadow-md ${sfxTurn ? 'translate-x-6' : 'translate-x-0'}`} />
                                        </div>
                                    </div>
                                </div>

                                {/* Crit Fanfare Test */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                                    <div className="flex-1">
                                        <span className="font-bold text-sm text-white">Critical Hit Victory Fanfare</span>
                                        <p className="text-xs text-slate-400 mt-0.5">Sound effect triggered when a player rolls a Natural 20.</p>
                                    </div>
                                    <div>
                                        <button 
                                            onClick={() => playCritFanfare(true)}
                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-white rounded-lg text-xs font-bold transition-colors border border-slate-700 flex items-center gap-1.5"
                                        >
                                            <Icon name="sparkles" size={13} /> Test Fanfare
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Sensory & Motion */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="eye" size={18} className="text-amber-500" /> Sensory & VFX
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Control environmental intensity and visual motion effects.</p>

                                <ToggleSwitch 
                                    checked={screenShake}
                                    onChange={(val) => {
                                        setScreenShake(val);
                                        localStorage.setItem('dm_screen_shake', String(val));
                                    }}
                                    label="Combat Screen Shake"
                                    description="Subtle camera shake on heavy damage and Natural 20s. Disable if you experience motion sensitivity."
                                />

                                <ToggleSwitch 
                                    checked={localStorage.getItem('vtt_low_performance') === 'true'}
                                    onChange={(val) => {
                                        localStorage.setItem('vtt_low_performance', String(val));
                                        window.location.reload();
                                    }}
                                    label="Low Performance Mode"
                                    description="Reduces 3D particle density, shadows, and fog shaders for older laptops."
                                    badge="Performance"
                                />

                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Ambient 3D Ecosystem Density</label>
                                    <select 
                                        value={ambientLifeLevel || 'low'} 
                                        onChange={(e) => setAmbientLifeLevel(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                    >
                                        <option value="off">Off (No ambient creatures or particles)</option>
                                        <option value="low">Low (Subtle dust motes & gentle life)</option>
                                        <option value="medium">Medium (Standard birds, bats, fireflies)</option>
                                        <option value="high">High (Full cinematic atmosphere)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =========================================
                        TAB: APPEARANCE & DICE
                    ========================================= */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="palette" size={18} className="text-amber-500" /> Personal Dice Styling
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Choose the resin and material finish for your 3D dice rolls.</p>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {DICE_THEMES.map(theme => (
                                        <div 
                                            key={theme.id}
                                            onClick={() => {
                                                setDiceTheme(theme.id);
                                                localStorage.setItem('dm_dice_theme', theme.id);
                                                toast(`Selected ${theme.name} dice!`, "info");
                                            }}
                                            className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col items-center gap-2 text-center ${
                                                diceTheme === theme.id 
                                                    ? `${theme.border} ${theme.bg} shadow-lg shadow-black/40 scale-[1.02]` 
                                                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                                            }`}
                                        >
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow" style={{ backgroundColor: theme.color, color: '#000' }}>
                                                d20
                                            </div>
                                            <span className="text-xs font-bold text-white">{theme.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="layout" size={18} className="text-amber-500" /> UI & Typography
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Adjust interface scale and layout dimensions.</p>

                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Chat Log Text Scale</label>
                                    <select 
                                        value={chatScale} 
                                        onChange={(e) => {
                                            setChatScale(e.target.value);
                                            localStorage.setItem('dm_chat_scale', e.target.value);
                                            toast("Updated chat text scale!", "info");
                                        }}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                    >
                                        <option value="compact">Compact (Dense, fits more messages)</option>
                                        <option value="standard">Standard (Default table size)</option>
                                        <option value="large">Large (High readability)</option>
                                    </select>
                                </div>

                                <ToggleSwitch 
                                    checked={data.config?.mobileCompact || false}
                                    onChange={(val) => updateCampaign({ 'config.mobileCompact': val })}
                                    label="Compact Mobile HUD"
                                    description="Lowers the height of navigation bars on mobile devices to give more room to battlemaps."
                                />
                            </div>
                        </div>
                    )}

                    {/* =========================================
                        TAB: AI CONFIGURATION
                    ========================================= */}
                    {activeTab === 'ai' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="sparkles" size={18} className="text-purple-400" /> Intelligence Engine
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Powers the AI Bestiary Forge, High Archives Oracle, and Module Architect.</p>

                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-400 mb-2">AI Provider</label>
                                    <div className="grid grid-cols-3 gap-2.5">
                                        {['puter', 'openai', 'gemini'].map(p => (
                                            <button 
                                                key={p} 
                                                onClick={() => setAiProvider(p)} 
                                                className={`py-2.5 px-3 rounded-xl border capitalize text-xs font-bold transition-all ${
                                                    aiProvider === p 
                                                        ? 'bg-purple-950/60 border-purple-500 text-white shadow' 
                                                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                                                }`}
                                            >
                                                {p === 'puter' ? 'Puter.js (Free)' : p}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {aiProvider === 'openai' && (
                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="block text-xs uppercase font-bold text-slate-400 mb-1">OpenAI API Key</label>
                                            <input 
                                                type="password" 
                                                value={apiKey} 
                                                onChange={(e) => setApiKey(e.target.value)} 
                                                placeholder="sk-..."
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs uppercase font-bold text-slate-400 mb-1">OpenAI Model</label>
                                            <select 
                                                value={openAiModel} 
                                                onChange={e => setOpenAiModel(e.target.value)} 
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-xs"
                                            >
                                                <option value="gpt-4o">GPT-4o (Fast & High Intelligence)</option>
                                                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {aiProvider === 'gemini' && (
                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Google Gemini API Key</label>
                                            <input 
                                                type="password" 
                                                value={apiKey} 
                                                onChange={(e) => setApiKey(e.target.value)} 
                                                placeholder="AIza..."
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-xs"
                                            />
                                        </div>
                                        <p className="text-[11px] text-slate-500">Model: <span className="text-purple-400 font-mono">gemini-1.5-flash</span> (High token throughput)</p>
                                    </div>
                                )}

                                {aiProvider === 'puter' && (
                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Puter Model</label>
                                            <select 
                                                value={puterModel} 
                                                onChange={e => setPuterModel(e.target.value)} 
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-xs"
                                            >
                                                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Creative & Narrative)</option>
                                                <option value="mistral-large-latest">Mistral Large (High Intelligence)</option>
                                                <option value="gpt-4o-mini">GPT-4o Mini (Fast & Balanced)</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button 
                                                onClick={() => window.puter?.auth?.signIn()} 
                                                className="flex-1 bg-purple-950/40 border border-purple-500/40 text-purple-300 hover:bg-purple-900/60 text-xs font-bold py-2 rounded-xl transition-colors"
                                            >
                                                Sign In to Puter
                                            </button>
                                            <button 
                                                onClick={() => window.location.reload()} 
                                                className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-bold py-2 rounded-xl transition-colors"
                                            >
                                                Reload App
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-800 space-y-3">
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">3D Miniature Forge Engine</label>
                                        <select 
                                            value={forgeEngine} 
                                            onChange={(e) => {
                                                setForgeEngine(e.target.value);
                                                localStorage.setItem('forge_engine', e.target.value);
                                            }}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-xs outline-none focus:border-purple-500"
                                        >
                                            <option value="VAST-AI/TripoSG">TripoSG (High Quality Mesh, Recommended)</option>
                                            <option value="stabilityai/TripoSR">TripoSR (Fast Lightweight Fallback)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Hugging Face Access Token (Optional)</label>
                                        <input 
                                            type="password" 
                                            value={hfToken} 
                                            onChange={(e) => {
                                                setHfToken(e.target.value);
                                                localStorage.setItem('hf_token', e.target.value);
                                            }}
                                            placeholder="hf_..."
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-xs"
                                        />
                                        <p className="text-[11px] text-slate-500 mt-1">Provides priority queue access to GPU mini generators.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =========================================
                        TAB: PLAYERS & ACCESS
                    ========================================= */}
                    {activeTab === 'players' && (
                        <div className="space-y-6 animate-in fade-in">
                            {/* Invite Link Card */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="link" size={18} className="text-amber-500" /> Shareable Invite Link
                                </h3>
                                <p className="text-xs text-slate-400">Direct join URL with secure token masking.</p>

                                <div className="flex gap-2">
                                    <input 
                                        readOnly
                                        value={hideInviteCode ? "•••••••••••••••••••••••••••• (HIDDEN FOR STREAM)" : inviteUrl} 
                                        className={`flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none font-mono text-xs ${hideInviteCode ? 'text-slate-600 select-none' : 'text-slate-300'}`}
                                    />
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(inviteUrl);
                                            toast("Invite link copied to clipboard!", "success");
                                        }}
                                        className="bg-amber-600 hover:bg-amber-500 px-4 py-2.5 rounded-xl text-white font-bold transition-colors text-xs shrink-0 shadow"
                                    >
                                        Copy Link
                                    </button>
                                    {role === 'dm' && (
                                        <button 
                                            onClick={async () => {
                                                if (await dialog.confirm("Invalidate old link and generate a fresh invite token?")) {
                                                    const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                                                    updateCampaign({ 'campaign.inviteToken': newToken });
                                                    toast("New invite token generated!", "info");
                                                }
                                            }}
                                            className="bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-white border border-red-800/40 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors shrink-0"
                                            title="Reset Token"
                                        >
                                            Reset Token
                                        </button>
                                    )}
                                </div>

                                {role === 'dm' && (
                                    <ToggleSwitch 
                                        checked={data.campaign?.requireApproval || false}
                                        onChange={(val) => updateCampaign({ 'campaign.requireApproval': val })}
                                        label="Require DM Approval (Waiting Room)"
                                        description="New players entering through the link will sit in the waiting room until you approve them."
                                        badge="DM"
                                    />
                                )}
                            </div>

                            {/* Email Invites */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="mail" size={18} className="text-amber-500" /> Send Email Invite
                                </h3>
                                <p className="text-xs text-slate-400">Invites appear automatically on the player's Dashboard when they log in.</p>

                                <div className="flex gap-2">
                                    <input 
                                        type="email" 
                                        value={inviteEmail} 
                                        onChange={e => setInviteEmail(e.target.value)} 
                                        placeholder="adventurer@example.com"
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none text-xs"
                                        onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                                    />
                                    <button 
                                        onClick={handleSendInvite} 
                                        className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl font-bold transition-colors text-xs shadow"
                                    >
                                        Send Invite
                                    </button>
                                </div>

                                {data.pendingEmailInvites?.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-800">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Pending Invites</h4>
                                        <div className="space-y-1.5">
                                            {data.pendingEmailInvites.map(email => (
                                                <div key={email} className="flex justify-between items-center text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                                                    <span className="flex items-center gap-2 font-mono"><Icon name="mail" size={13} className="text-slate-500"/> {email}</span>
                                                    {role === 'dm' && (
                                                        <button onClick={() => handleRevokeInvite(email)} className="text-red-400 hover:text-red-300 text-[11px] font-bold">Revoke</button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Active Users & Character Assignment */}
                            {role === 'dm' && (
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                    <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                        <Icon name="users" size={18} className="text-amber-500" /> Active Players & Character Assignments
                                    </h3>
                                    <p className="text-xs text-slate-400 mb-4">Assign character sheets and manage permissions for connected adventurers.</p>

                                    <div className="space-y-3">
                                        {Object.entries(data.activeUsers || {}).map(([uid, name]) => {
                                            const isDm = data.dmIds?.includes(uid);
                                            const isMe = uid === user.uid;
                                            const assignedCharId = data.assignments?.[uid] || "";

                                            return (
                                                <div key={uid} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-white font-bold text-sm">
                                                                        {name?.includes('@') ? name.split('@')[0] : name}
                                                                    </span>
                                                                    {isDm && (
                                                                        <span className="text-[9px] font-bold bg-amber-600/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-600/50 uppercase">
                                                                            DM
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] text-slate-500 font-mono">UID: {uid.slice(0, 8)}...</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 self-end sm:self-auto">
                                                            {isMe ? (
                                                                isDm && (
                                                                    <button 
                                                                        onClick={() => toggleDmStatus(uid)} 
                                                                        className="text-xs bg-slate-800 hover:bg-red-950/50 text-slate-400 hover:text-red-400 border border-slate-700 px-3 py-1 rounded-lg"
                                                                    >
                                                                        Renounce DM
                                                                    </button>
                                                                )
                                                            ) : (
                                                                <>
                                                                    {!isDm && (
                                                                        <button 
                                                                            onClick={() => toggleDmStatus(uid)} 
                                                                            className="text-xs bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-lg font-bold"
                                                                        >
                                                                            Promote DM
                                                                        </button>
                                                                    )}
                                                                    <button 
                                                                        onClick={() => kickPlayer(uid)} 
                                                                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded-lg font-bold"
                                                                    >
                                                                        Kick
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => banPlayer(uid)} 
                                                                        className="text-xs bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 px-3 py-1 rounded-lg font-bold"
                                                                    >
                                                                        Ban
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                                                        <label className="text-xs text-slate-400 font-bold uppercase shrink-0">Assigned Character:</label>
                                                        <select 
                                                            value={assignedCharId} 
                                                            onChange={(e) => handleAssignCharacter(uid, e.target.value)}
                                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                                                        >
                                                            <option value="">(Observer / None)</option>
                                                            {data.players?.map(p => (
                                                                <option key={p.id} value={p.id}>{p.name} ({p.race} {p.class})</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Banned Souls */}
                                    {data.bannedUsers?.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-slate-800">
                                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Banned Users</h4>
                                            <div className="space-y-1.5">
                                                {data.bannedUsers.map(bannedUid => (
                                                    <div key={bannedUid} className="flex justify-between items-center text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                                                        <span className="font-mono">ID: {bannedUid.substring(0, 10)}...</span>
                                                        <button onClick={() => unbanPlayer(bannedUid)} className="text-emerald-400 hover:underline font-bold text-xs">Forgive & Unban</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Pending Join Requests */}
                                    {joinRequests.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-slate-800">
                                            <h4 className="text-xs font-bold text-amber-500 uppercase mb-3 flex items-center justify-between">
                                                Pending Waiting Room Requests ({joinRequests.length})
                                            </h4>
                                            <div className="space-y-2">
                                                {joinRequests.map(req => (
                                                    <div key={req.id} className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-amber-500/30 gap-3">
                                                        <div>
                                                            <div className="font-bold text-sm text-white">{req.name}</div>
                                                            <div className="text-[10px] text-slate-400">UID: {req.uid?.slice(0, 8)}...</div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => updateDoc(doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', code, 'joinRequests', req.id), { status: 'approved' })} 
                                                                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors shadow"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button 
                                                                onClick={() => updateDoc(doc(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', code, 'joinRequests', req.id), { status: 'denied' })} 
                                                                className="bg-slate-800 hover:bg-red-900/80 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                Deny
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* =========================================
                        TAB: CAMPAIGN WORLD & BIBLE
                    ========================================= */}
                    {activeTab === 'bible' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="book-open" size={18} className="text-amber-500" /> Campaign Bible & World Genesis
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Core truths, themes, and narrative conflicts grounding your realm.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Realm Name</label>
                                        <input 
                                            value={bibleData.campaignName || ''} 
                                            onChange={(e) => setBibleData({ ...bibleData, campaignName: e.target.value })}
                                            disabled={role !== 'dm'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold text-base focus:border-amber-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Tone & Theme</label>
                                        <input 
                                            value={bibleData.tone || ''} 
                                            onChange={(e) => setBibleData({ ...bibleData, tone: e.target.value })}
                                            disabled={role !== 'dm'}
                                            placeholder="e.g. Dark Fantasy, High Magic, Gritty Realism"
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-xs focus:border-amber-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Central Conflict</label>
                                        <textarea 
                                            value={bibleData.conflict || ''} 
                                            onChange={(e) => setBibleData({ ...bibleData, conflict: e.target.value })}
                                            disabled={role !== 'dm'}
                                            placeholder="e.g. The kingdom trembles under the shadow of an awakening primordial titan..."
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-xs h-32 resize-none focus:border-amber-500 outline-none leading-relaxed"
                                        />
                                    </div>

                                    {role === 'dm' && (
                                        <div className="pt-2">
                                            <button 
                                                onClick={handleBibleSave} 
                                                className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-amber-950/40 text-xs flex items-center gap-2"
                                            >
                                                <Icon name="save" size={14} /> Save Campaign Bible
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =========================================
                        TAB: MY CHARACTER
                    ========================================= */}
                    {activeTab === 'character' && myChar && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-amber-400 mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="sword" size={18} /> {myChar.name}
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">External character sheet integration and token links.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-400 mb-1">D&D Beyond Character URL</label>
                                        <input 
                                            type="text"
                                            value={localCharUrl}
                                            onChange={(e) => setLocalCharUrl(e.target.value)}
                                            placeholder="https://www.dndbeyond.com/characters/..."
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none font-mono text-xs"
                                        />
                                        <p className="text-[11px] text-slate-500 mt-1 italic">Use the DungeonMind Helper browser extension to embed third-party sheets.</p>
                                    </div>

                                    <ToggleSwitch 
                                        checked={localUseExternal}
                                        onChange={setLocalUseExternal}
                                        label="Enable External Sheet in Sidebar"
                                        description="Loads your D&D Beyond character sheet in the sidebar whenever your token is selected."
                                    />

                                    <button 
                                        onClick={handleCharSave} 
                                        className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-xs"
                                    >
                                        <Icon name="save" size={15} /> Save Character Integration
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =========================================
                        TAB: MAINTENANCE & DANGER ZONE (DM Only)
                    ========================================= */}
                    {activeTab === 'maintenance' && role === 'dm' && (
                        <div className="space-y-6 animate-in fade-in">
                            {/* Campaign Backup */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="download" size={18} className="text-emerald-400" /> Complete Campaign Backup
                                </h3>
                                <p className="text-xs text-slate-400">
                                    Download an all-inclusive JSON snapshot containing all characters, bestiary creatures, tactical maps, module structures, and notes.
                                </p>
                                <button 
                                    onClick={handleExportCampaignBackup}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-lg flex items-center gap-2 text-xs"
                                >
                                    <Icon name="download" size={15} /> Export Campaign Backup JSON
                                </button>
                            </div>

                            {/* Danger Actions */}
                            <div className="bg-slate-900 border border-red-900/40 rounded-2xl p-6 shadow-xl space-y-4">
                                <h3 className="text-base font-bold text-red-400 mb-1 flex items-center gap-2 fantasy-font">
                                    <Icon name="alert-triangle" size={18} /> Danger Zone
                                </h3>
                                <p className="text-xs text-slate-400">Irreversible actions for session maintenance.</p>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                                        <div>
                                            <span className="font-bold text-sm text-white">Clear Session Chat Log</span>
                                            <p className="text-xs text-slate-400 mt-0.5">Wipes all chat messages, dice rolls, and whispers from the active campaign.</p>
                                        </div>
                                        <button 
                                            onClick={async () => {
                                                if (await dialog.confirm("Are you sure you want to permanently clear the entire campaign chat log?")) {
                                                    if (clearChat) {
                                                        await clearChat();
                                                        toast("Chat history cleared!", "info");
                                                    }
                                                }
                                            }}
                                            className="px-4 py-2 bg-red-950/60 hover:bg-red-900 text-red-300 hover:text-white border border-red-800/40 rounded-xl text-xs font-bold transition-colors"
                                        >
                                            Clear Chat
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default SettingsView;