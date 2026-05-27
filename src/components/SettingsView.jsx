import React, { useState } from 'react';
import Icon from './Icon';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import { useVfxStore } from '../stores/useVfxStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
    const { campaign, updateCampaign, kickPlayer, banPlayer, unbanPlayer } = useNewCampaign();
    const data = campaign; // for compatibility
    const [activeTab, setActiveTab] = useState('general');
    
    const [autoJoin, setAutoJoin] = useState(() => localStorage.getItem('dm_auto_join') === 'true');
    const ambientLifeLevel = useVfxStore(state => state.ambientLifeLevel);
    const setAmbientLifeLevel = useVfxStore(state => state.setAmbientLifeLevel);

    
    // START CHANGE: Robust character detection (handles string/number mismatches)
    const myCharId = data.assignments?.[user?.uid];
    const myChar = data.players?.find(p => String(p.id) === String(myCharId));
    // END CHANGE

    // Campaign Bible State (Local edit before save)
    const [bibleData, setBibleData] = useState(data.campaign?.genesis || { tone: '', conflict: '', campaignName: '' });

    // START CHANGE: Local state for Character Integration to prevent input locking
    const [localCharUrl, setLocalCharUrl] = useState(myChar?.externalSheetUrl || "");
    const [localUseExternal, setLocalUseExternal] = useState(myChar?.useExternalSheet || false);
    const [hfToken, setHfToken] = useState(() => localStorage.getItem('hf_token') || '');
    const [forgeEngine, setForgeEngine] = useState(() => localStorage.getItem('forge_engine') || 'stabilityai/TripoSR');

    // Profile Edit State
    const [localDisplayName, setLocalDisplayName] = useState(user?.displayName || 'Adventurer');
    const [localPhotoUrl, setLocalPhotoUrl] = useState(user?.photoURL || '');

    React.useEffect(() => {
        if (user) {
            setLocalDisplayName(user.displayName || 'Adventurer');
            setLocalPhotoUrl(user.photoURL || '');
        }
    }, [user]);

    const handleSaveProfile = async () => {
        const newName = localDisplayName.trim() || 'Adventurer';
        const newPhoto = localPhotoUrl.trim();
        try {
            await user.updateProfile({ displayName: newName, photoURL: newPhoto });
            updateCampaign({ [`activeUsers.${user.uid}`]: newName });
            alert("Profile updated successfully!");
            window.location.reload(); // Refresh to instantly apply the name to the global chat handlers
        } catch (err) {
            console.error("Failed to update profile", err);
            alert("Failed to update profile.");
        }
    };

    // Sync local state if props change (e.g. on initial load)
    React.useEffect(() => {
        if (myChar) {
            setLocalCharUrl(myChar.externalSheetUrl || "");
            setLocalUseExternal(myChar.useExternalSheet || false);
        }
    }, [myCharId, data.players]);

    const handleCharSave = () => {
        if (!myCharId) return;
        const updatedPlayers = data.players.map(p => 
            String(p.id) === String(myCharId) 
            ? { ...p, externalSheetUrl: localCharUrl, useExternalSheet: localUseExternal } 
            : p
        );
        
        updateCampaign({ players: updatedPlayers });
        alert("Character Integration Updated!");
    };
    // END CHANGE

    const handleBibleSave = () => {
        updateCampaign({ 'campaign.genesis': bibleData });
        alert("Campaign Bible Updated!");
    };

    // --- PLAYER MANAGEMENT LOGIC ---
    const handleAssignCharacter = (uid, charId) => {
        // START CHANGE: Set to empty string instead of deleting to force DB overwrite
        const newAssignments = { ...data.assignments, [uid]: charId };
        // (Removed the 'delete' line so the empty value actually saves to the cloud)
        
        updateCampaign({ assignments: newAssignments });
        // END CHANGE
    };

    const toggleDmStatus = (uid) => {
        let newDmIds = [...(data.dmIds || [])];
        
        // If already DM, remove (Renounce)
        if (newDmIds.includes(uid)) {
            if (newDmIds.length <= 1) {
                alert("Cannot renounce: You are the only DM left!");
                return;
            }
            if (!confirm("Are you sure you want to renounce your Dungeon Master status? You will lose access to DM tools immediately.")) return;
            newDmIds = newDmIds.filter(id => id !== uid);
        } 
        // If not DM, add (Promote)
        else {
            if (!confirm("Promote this user to Dungeon Master? They will have full control over the campaign settings.")) return;
            newDmIds.push(uid);
        }

        updateCampaign({ dmIds: newDmIds });
    };

    // START CHANGE: Safe Exit Handler to prevent Auto-Join loop
    const handleSafeExit = () => {
        if (window.confirm("Disconnect from session?")) {
            localStorage.removeItem('dm_last_session'); // Prevent auto-join loop
            sessionStorage.removeItem('dm_auto_join_attempted');
            if (onExit) onExit(); // Now exit the view
        }
    };
    // END CHANGE
    
    // Generate the secure URL (fall back to direct code join for legacy realms)
    const currentInviteParam = data.campaign?.inviteToken ? `invite=${data.campaign.inviteToken}` : `join=${code}`;
    const inviteUrl = `${window.location.origin}${import.meta.env.BASE_URL}?${currentInviteParam}`;

    // [DELETED handleRetroactiveFix FUNCTION]

    return (
        <div className="h-full bg-slate-900 p-4 md:p-8 overflow-y-auto custom-scroll">
            <div className="max-w-3xl mx-auto space-y-8">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center border-b border-slate-700 pb-6 gap-4">
                    <div>
                        <h2 className="text-3xl fantasy-font text-amber-500">Realms & Rules</h2>
                        <p className="text-slate-400">Configure your campaign settings.</p>
                    </div>
                    <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-600 flex items-center gap-3">
                        <span className="text-xs text-slate-500 uppercase font-bold">Game Code</span>
                    <span className="text-xl font-mono text-white tracking-widest">{hideInviteCode ? '••••••' : code}</span>
                        <button onClick={() => navigator.clipboard.writeText(code)} className="text-indigo-400 hover:text-white"><Icon name="copy" size={16}/></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg overflow-x-auto">
                    <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'general' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>General</button>
                    {myChar && <button onClick={() => setActiveTab('character')} className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'character' ? 'bg-slate-700 text-indigo-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}>My Character</button>}
                    <button onClick={() => setActiveTab('bible')} className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'bible' ? 'bg-slate-700 text-amber-500 shadow' : 'text-slate-400 hover:text-slate-200'}`}>Campaign Bible</button>
                    <button onClick={() => setActiveTab('ai')} className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ai' ? 'bg-slate-700 text-purple-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}>AI Config</button>
                    {role === 'dm' && (
                        <button onClick={() => setActiveTab('players')} className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all whitespace-nowrap relative ${activeTab === 'players' ? 'bg-slate-700 text-red-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                            Players
                            {joinRequests.length > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white shadow-lg">{joinRequests.length}</span>
                            )}
                        </button>
                    )}
                </div>

                {/* --- GENERAL SETTINGS --- */}
                {activeTab === 'general' && (
                    <div className="space-y-6 animate-in fade-in">
                        {/* User Profile Settings (Visible to everyone) */}
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Icon name="user" size={20}/> My Profile</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Display Name</label>
                                    <input 
                                        value={localDisplayName} 
                                        onChange={(e) => setLocalDisplayName(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:border-indigo-500 outline-none"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1">This name appears in chat if you don't have an active character assigned.</p>
                                </div>
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Profile Avatar URL</label>
                                    <input 
                                        value={localPhotoUrl} 
                                        onChange={(e) => setLocalPhotoUrl(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:border-indigo-500 outline-none font-mono text-sm"
                                    />
                                </div>
                                <button 
                                    onClick={handleSaveProfile}
                                    className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded text-white font-bold transition-colors w-full sm:w-auto"
                                >
                                    Save Profile
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Icon name="settings" size={20}/> Game Options</h3>
                            <div className="space-y-4">
                                {role === 'dm' && (
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Realm Name</label>
                                        <div className="flex gap-2">
                                            <input 
                                                value={bibleData.campaignName || ''} 
                                                onChange={(e) => setBibleData(prev => ({...prev, campaignName: e.target.value}))}
                                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:border-indigo-500 outline-none"
                                            />
                                            <button 
                                                onClick={handleBibleSave}
                                                className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded text-white font-bold transition-colors"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Invite Link</label>
                                    <div className="flex gap-2">
                                        <input 
                                            readOnly
                                            value={hideInviteCode ? "•••••••••••••••••••••••••••• (HIDDEN)" : inviteUrl} 
                                            className={`w-full bg-slate-900 border border-slate-600 rounded p-2 outline-none font-mono text-sm ${hideInviteCode ? 'text-slate-500 select-none pointer-events-none' : 'text-slate-300'}`}
                                        />
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(inviteUrl);
                                                alert("Invite link copied to clipboard!");
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded text-white font-bold transition-colors whitespace-nowrap"
                                        >
                                            Copy Link
                                        </button>
                                        {role === 'dm' && (
                                            <button 
                                                onClick={() => {
                                                    if(window.confirm("Invalidate the old invite link and generate a new one?")) {
                                                        updateCampaign({ 'campaign.inviteToken': Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) });
                                                    }
                                                }}
                                                className="bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-white px-4 py-2 rounded font-bold transition-colors whitespace-nowrap"
                                                title="Generate a new secure invite token"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">Share this secure link with your players. It hides your 6-character room code from streams.</p>
                                </div>
                                
                                {role === 'dm' && (
                                    <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={data.campaign?.requireApproval || false} 
                                            onChange={(e) => updateCampaign({ 'campaign.requireApproval': e.target.checked })}
                                            className="w-5 h-5 accent-indigo-500"
                                        />
                                        <div>
                                            <div className="font-bold text-slate-200">Require DM Approval (Waiting Room)</div>
                                            <div className="text-xs text-slate-500">Players joining via the invite link will need your approval before entering the game.</div>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Edition / Ruleset</label>
                                    <select 
                                        value={data.config?.edition || '2014'} 
                                        onChange={(e) => updateCampaign({ 'config.edition': e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:border-indigo-500 outline-none"
                                        disabled={role !== 'dm'}
                                    >
                                        <option value="2014">D&D 5e (2014)</option>
                                        <option value="2024">D&D 5e (2024 Remaster)</option>
                                        <option value="homebrew">Homebrew / Custom</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                                    <input 
                                        type="checkbox" 
                                        checked={data.config?.strictMode || false} 
                                        onChange={(e) => updateCampaign({ 'config.strictMode': e.target.checked })}
                                        disabled={role !== 'dm'}
                                        className="w-5 h-5 accent-indigo-500"
                                    />
                                    <div>
                                        <div className="font-bold text-slate-200">Strict Mode</div>
                                        <div className="text-xs text-slate-500">Prevent players from editing their stats manually during sessions.</div>
                                    </div>
                                </div>

                                {/* NEW: Compact UI Toggle */}
                                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                                    <input 
                                        type="checkbox" 
                                        checked={data.config?.mobileCompact || false} 
                                        onChange={(e) => updateCampaign({ 'config.mobileCompact': e.target.checked })}
                                        className="w-5 h-5 accent-indigo-500"
                                    />
                                    <div>
                                        <div className="font-bold text-slate-200">Compact Mobile HUD</div>
                                        <div className="text-xs text-slate-500">Lowers the toolbar to maximize screen space on phones.</div>
                                    </div>
                                </div>

                                {/* START CHANGE: Performance Toggle */}
                                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                                    <input 
                                        type="checkbox" 
                                        checked={localStorage.getItem('vtt_low_performance') === 'true'} 
                                        onChange={(e) => {
                                            localStorage.setItem('vtt_low_performance', e.target.checked);
                                            window.location.reload(); // Force reload to re-init canvas quality
                                        }}
                                        className="w-5 h-5 accent-purple-500"
                                    />
                                    <div>
                                        <div className="font-bold text-slate-200">Low Performance Mode</div>
                                        <div className="text-xs text-slate-500">Reduces vision quality and shadow effects for older devices.</div>
                                    </div>
                                </div>
                                {/* END CHANGE */}

                            {/* Streamer Mode Toggle */}
                            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer" onClick={() => {
                                if (setHideInviteCode) {
                                    const newValue = !hideInviteCode;
                                    setHideInviteCode(newValue);
                                }
                            }}>
                                <input 
                                    type="checkbox" 
                                    checked={hideInviteCode || false} 
                                    onChange={(e) => {
                                        if (setHideInviteCode) {
                                            const newValue = e.target.checked;
                                            setHideInviteCode(newValue);
                                        }
                                    }}
                                    className="w-5 h-5 accent-red-500 cursor-pointer pointer-events-none"
                                />
                                <div>
                                    <div className="font-bold text-slate-200">Streamer Mode (Hide Invite Code)</div>
                                    <div className="text-xs text-slate-500">Masks your game code in the UI to prevent unwanted players from joining your stream.</div>
                                </div>
                            </div>

                            {/* Auto-Join Toggle */}
                            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer" onClick={() => {
                                const newValue = !autoJoin;
                                setAutoJoin(newValue);
                                localStorage.setItem('dm_auto_join', String(newValue));
                            }}>
                                <input 
                                    type="checkbox" 
                                    checked={autoJoin} 
                                    onChange={() => {}} // Handled by parent div
                                    className="w-5 h-5 accent-indigo-500 cursor-pointer pointer-events-none"
                                />
                                <div>
                                    <div className="font-bold text-slate-200">Auto-Join Previous Session</div>
                                    <div className="text-xs text-slate-500">Skips the dashboard and loads directly into your last active realm when opening DungeonMind.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* [DELETED DANGER ZONE BUTTON BLOCK] */}

                    {/* START CHANGE: Use handleSafeExit instead of onExit */}
                    <button onClick={handleSafeExit} className="w-full py-4 rounded-xl border-2 border-red-900/50 text-red-400 hover:bg-red-900/20 hover:border-red-500 hover:text-white transition-all font-bold flex items-center justify-center gap-2">
                        <Icon name="log-out" size={20}/> Leave Campaign
                    </button>
                    {/* END CHANGE */}
                    </div>
                )}

                {/* --- MY CHARACTER SETTINGS --- */}
                {activeTab === 'character' && myChar && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                            <h3 className="text-lg font-bold text-indigo-400 mb-1 flex items-center gap-2">
                                <Icon name="user" size={20}/> {myChar.name}
                            </h3>
                            <p className="text-sm text-slate-400 mb-6">Configure your external character sheet integration.</p>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-2">D&D Beyond Character URL</label>
                                    <input 
                                        type="text"
                                        value={localCharUrl}
                                        onChange={(e) => setLocalCharUrl(e.target.value)}
                                        placeholder="https://www.dndbeyond.com/characters/..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-indigo-500 outline-none font-mono text-sm"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-2 italic">Requires the DungeonMind Helper browser extension to bypass security headers.</p>
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                                    <input 
                                        type="checkbox" 
                                        checked={localUseExternal} 
                                        onChange={(e) => setLocalUseExternal(e.target.checked)}
                                        className="w-6 h-6 accent-indigo-500"
                                    />
                                    <div>
                                        <div className="font-bold text-slate-200 text-sm">Enable External Sheet</div>
                                        <div className="text-xs text-slate-500">When you click your token, the D&D Beyond sheet will load in the sidebar instead of the standard UI.</div>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleCharSave} 
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
                                >
                                    <Icon name="save" size={18}/> Save Character Link
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- CAMPAIGN BIBLE --- */}
                {activeTab === 'bible' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                            <h3 className="text-lg font-bold text-amber-500 mb-1 flex items-center gap-2"><Icon name="book-open" size={20}/> Campaign Bible</h3>
                            <p className="text-sm text-slate-400 mb-6">Core truths and themes of your world.</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Campaign Name</label>
                                    <input 
                                        value={bibleData.campaignName} 
                                        onChange={(e) => setBibleData({ ...bibleData, campaignName: e.target.value })}
                                        disabled={role !== 'dm'}
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white font-bold text-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Tone & Theme</label>
                                    <input 
                                        value={bibleData.tone} 
                                        onChange={(e) => setBibleData({ ...bibleData, tone: e.target.value })}
                                        disabled={role !== 'dm'}
                                        placeholder="e.g. Dark Fantasy, High Magic, Gritty Realism"
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Central Conflict</label>
                                    <textarea 
                                        value={bibleData.conflict} 
                                        onChange={(e) => setBibleData({ ...bibleData, conflict: e.target.value })}
                                        disabled={role !== 'dm'}
                                        placeholder="e.g. The Kingdom is crumbling under the weight of a dragon's curse..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white h-32 resize-none"
                                    />
                                </div>
                                {role === 'dm' && (
                                    <button onClick={handleBibleSave} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded font-bold self-end">
                                        Save Changes
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- AI CONFIGURATION --- */}
                {activeTab === 'ai' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                            <h3 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2"><Icon name="sparkles" size={20}/> Intelligence Engine</h3>
                            
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-2">AI Provider</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['puter', 'openai', 'gemini'].map(p => (
                                            <button 
                                                key={p} 
                                                onClick={() => setAiProvider(p)} 
                                                className={`py-2 px-3 rounded border capitalize ${aiProvider === p ? 'bg-purple-900/50 border-purple-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                                            >
                                                {p === 'puter' ? 'Puter.js (Free)' : p}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {aiProvider === 'openai' && (
                                    <>
                                        <div>
                                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1">OpenAI API Key</label>
                                            <input 
                                                type="password" 
                                                value={apiKey} 
                                                onChange={(e) => setApiKey(e.target.value)} 
                                                placeholder="sk-..."
                                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Model</label>
                                            <select value={openAiModel} onChange={e => setOpenAiModel(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white">
                                                <option value="gpt-4o">GPT-4o (Fast & Smart)</option>
                                                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Cheap)</option>
                                            </select>
                                        </div>
                                    </>
                                )}

                                {aiProvider === 'gemini' && (
                                    <>
                                        <div>
                                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Google Gemini API Key</label>
                                            <input 
                                                type="password" 
                                                value={apiKey} 
                                                onChange={(e) => setApiKey(e.target.value)} 
                                                placeholder="AIza..."
                                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white font-mono"
                                            />
                                        </div>
                                        <div className="text-xs text-slate-500">Using model: <span className="font-mono text-purple-400">gemini-1.5-flash</span></div>
                                    </>
                                )}

                                {aiProvider === 'puter' && (
                                    <div>
                                        <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Model</label>
                                        <select value={puterModel} onChange={e => setPuterModel(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white">
                                            <option value="mistral-large-latest">Mistral Large (Smart)</option>
                                            <option value="gpt-4o-mini">GPT-4o Mini (Balanced)</option>
                                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Creative)</option>
                                </select>
                                {/* START CHANGE: Restore Manual Auth Controls */}
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => window.puter?.auth?.signIn()} className="flex-1 bg-indigo-900/30 border border-indigo-500 text-indigo-200 hover:bg-indigo-800 text-xs font-bold py-2 rounded transition-colors">Sign In</button>
                                    <button onClick={() => window.location.reload()} className="flex-1 bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 text-xs font-bold py-2 rounded transition-colors">Reload App</button>
                                </div>
                                {/* END CHANGE */}
                            </div>
                        )}

                        <div className="pt-4 border-t border-slate-700 mt-6">
                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Hugging Face Access Token (Optional)</label>
                            <input 
                                type="password" 
                                value={hfToken} 
                                onChange={(e) => {
                                    setHfToken(e.target.value);
                                    localStorage.setItem('hf_token', e.target.value);
                                }}
                                placeholder="hf_..."
                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white font-mono mb-1"
                            />
                            <div className="text-xs text-slate-500">Provides priority access to the 3D Forge (TripoSR) to wake the server if it's asleep.</div>
                        </div>

                        <div className="pt-4 border-t border-slate-700 mt-6">
                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1">3D Forge Engine</label>
                            <select 
                                value={forgeEngine} 
                                onChange={(e) => {
                                    setForgeEngine(e.target.value);
                                    localStorage.setItem('forge_engine', e.target.value);
                                }}
                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white mb-1 outline-none focus:border-purple-500"
                            >
                                <option value="VAST-AI/TripoSG">TripoSG (High Quality, Best)</option>
                                <option value="stabilityai/TripoSR">TripoSR (Fast Fallback)</option>
                            </select>
                            <div className="text-xs text-slate-500">Select the AI engine used to forge 3D tokens.</div>
                        </div>
                    </div>
                        </div>
                    </div>
                )}

                {/* --- PLAYER MANAGEMENT (DM ONLY) --- */}
                {role === 'dm' && activeTab === 'players' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                            <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2"><Icon name="shield" size={20}/> Player Management</h3>
                            
                            <div className="space-y-4">
                                {Object.entries(data.activeUsers || {}).map(([uid, name]) => {
                                    const isDm = data.dmIds?.includes(uid);
                                    const isMe = uid === user.uid;
                                    const assignedCharId = data.assignments?.[uid] || "";

                                    return (
                                        <div key={uid} className="flex flex-col bg-slate-900 p-4 rounded border border-slate-700 gap-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
                                                    <div className="flex flex-col">
                                                        <span className="text-white font-bold text-sm">{name}</span>
                                                        <span className="text-xs text-slate-500 font-mono">{uid.slice(0,6)}...</span>
                                                    </div>
                                                    {isDm && <span className="text-[10px] font-bold bg-amber-600/20 text-amber-500 px-2 py-0.5 rounded border border-amber-600/50 uppercase">Dungeon Master</span>}
                                                </div>
                                                
                                                <div className="flex flex-wrap gap-2">
                                                    {isMe ? (
                                                        isDm && (
                                                            <button onClick={() => toggleDmStatus(uid)} className="text-xs bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 border border-slate-600 px-3 py-1 rounded">
                                                                Renounce DM
                                                            </button>
                                                        )
                                                    ) : (
                                                        <>
                                                            {!isDm && <button onClick={() => toggleDmStatus(uid)} className="text-xs bg-indigo-900/40 hover:bg-indigo-700 text-indigo-300 border border-indigo-700 px-3 py-1 rounded">Promote</button>}
                                                            <button onClick={() => kickPlayer(uid)} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded">Kick</button>
                                                            <button onClick={() => banPlayer(uid)} className="text-xs bg-red-900 hover:bg-red-800 text-white px-3 py-1 rounded">Ban</button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Character Assignment Dropdown */}
                                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
                                                <label className="text-xs text-slate-500 font-bold uppercase">Assign:</label>
                                                <select 
                                                    value={assignedCharId} 
                                                    onChange={(e) => handleAssignCharacter(uid, e.target.value)}
                                                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
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

                            {data.bannedUsers?.length > 0 && (
                                <div className="mt-6 pt-6 border-t border-slate-700">
                                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Banned Souls</h4>
                                    <div className="space-y-2">
                                        {data.bannedUsers.map(uid => (
                                            <div key={uid} className="flex justify-between items-center text-sm text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
                                                <span>ID: {uid.substring(0,8)}...</span>
                                                <button onClick={() => unbanPlayer(uid)} className="text-green-400 hover:underline text-xs font-bold">Forgive</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(data.campaign?.requireApproval || joinRequests.length > 0) && (
                                <div className="mt-6 pt-6 border-t border-slate-700">
                                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-4 flex items-center justify-between">
                                        Pending Join Requests
                                        {joinRequests.length > 0 && <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-xs">{joinRequests.length}</span>}
                                    </h4>
                                    {joinRequests.length === 0 ? (
                                        <div className="text-slate-500 text-sm italic bg-slate-900/50 p-6 rounded-lg border border-slate-700/50 text-center">No pending requests at the moment.</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {joinRequests.map(req => (
                                                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-900/80 rounded-lg border border-indigo-500/30 gap-4 shadow-md hover:border-indigo-500/50 transition-colors">
                                                    <div>
                                                        <div className="font-bold text-base text-white">{req.name}</div>
                                                        <div className="text-xs text-slate-400">ID: {req.uid?.substring(0,8)}...</div>
                                                        {req.characterName && <div className="text-xs text-indigo-400 mt-1 font-medium flex items-center gap-1"><Icon name="user" size={12}/> Joining as: {req.characterName}</div>}
                                                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Icon name="clock" size={10}/> {new Date(req.timestamp).toLocaleString()}</div>
                                                    </div>
                                                    <div className="flex gap-2 w-full sm:w-auto">
                                                        <button 
                                                            onClick={() => updateDoc(doc(db, 'campaigns', code, 'joinRequests', req.id), { status: 'approved' })} 
                                                            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-6 py-2.5 rounded-lg transition-colors shadow-lg shadow-indigo-900/20"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button 
                                                            onClick={() => updateDoc(doc(db, 'campaigns', code, 'joinRequests', req.id), { status: 'denied' })} 
                                                            className="flex-1 sm:flex-none bg-slate-800 hover:bg-red-900/80 text-slate-300 hover:text-white border border-slate-600 hover:border-red-500/50 text-sm font-bold px-6 py-2.5 rounded-lg transition-colors"
                                                        >
                                                            Deny
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default SettingsView;