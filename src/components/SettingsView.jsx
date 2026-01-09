import React, { useState } from 'react';
import Icon from './Icon';
// Import Firebase tools needed for migration
import { doc, writeBatch, deleteField } from '../firebase'; 
import * as fb from '../firebase'; // Import main instance to access db

const SettingsView = ({ 
    data, setData, apiKey, setApiKey, role, updateCloud, 
    code, user, onExit, aiProvider, setAiProvider,
    openAiModel, setOpenAiModel, puterModel, setPuterModel,
    banPlayer, kickPlayer, unbanPlayer 
}) => {
    
    const [isMigrating, setIsMigrating] = useState(false);

    const copyCode = () => { navigator.clipboard.writeText(code); alert("Copied: " + code); };
    const activeUsers = data.activeUsers || {};
    const bannedUsers = data.bannedUsers || [];
    const userId = user ? user.uid : 'offline';
    const assignments = data.assignments || {};
    const dmIds = data.dmIds || [];
    
    const updateConfig = (key, val) => {
        const newData = { ...data, config: { ...data.config, [key]: val } };
        setData(newData);
        if(updateCloud) updateCloud(newData);
    };

    const updateAssignment = (uid, charId) => {
        const newAssignments = { ...assignments, [uid]: charId };
        const newData = { ...data, assignments: newAssignments };
        setData(newData);
        if(updateCloud) updateCloud(newData);
    };

    const toggleDmStatus = (uid) => {
        let newDmIds = [...dmIds];
        if (newDmIds.includes(uid)) {
            if (newDmIds.length <= 1) return alert("Cannot remove last DM.");
            if (!confirm("Remove DM permissions?")) return;
            newDmIds = newDmIds.filter(id => id !== uid);
        } else {
            if (!confirm("Promote to DM?")) return;
            newDmIds.push(uid);
        }
        const newData = { ...data, dmIds: newDmIds };
        setData(newData);
        updateCloud(newData, true);
    };

    // --- MIGRATION LOGIC ---
    const handleMigration = async () => {
        if (!confirm("⚠️ WARNING: This will reorganize your database into folders.\n\nOnly do this if you have data from the old version that is missing or causing lag.\n\nContinue?")) return;
        
        setIsMigrating(true);
        const batch = writeBatch(fb.db);
        const campaignRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
        let count = 0;

        // 1. Migrate Players
        if (Array.isArray(data.players) && data.players.length > 0) {
            console.log("Migrating players...");
            data.players.forEach(p => {
                // Create ref in subcollection
                const pRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code, 'players', p.id.toString());
                batch.set(pRef, p);
                count++;
            });
            // Delete old array from root
            batch.update(campaignRef, { players: deleteField() });
        }

        // 2. Migrate Journal
        if (data.journal_pages && Object.keys(data.journal_pages).length > 0) {
            console.log("Migrating journal...");
            Object.values(data.journal_pages).forEach(page => {
                const jRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code, 'journal', page.id.toString());
                batch.set(jRef, page);
                count++;
            });
            // Delete old object from root
            batch.update(campaignRef, { journal_pages: deleteField() });
        }

        try {
            await batch.commit();
            alert(`Migration Complete! Moved ${count} items to new folders.`);
            window.location.reload(); // Reload to refresh listeners
        } catch (e) {
            console.error(e);
            alert("Migration Failed: " + e.message);
        }
        setIsMigrating(false);
    };

    // --- EMERGENCY CLEANUP TOOLS ---
    const clearFog = () => {
        if(!confirm("Emergency: Clear all Map Fog data to reduce DB size?")) return;
        const newData = { ...data, campaign: { ...data.campaign, activeMap: { ...data.campaign.activeMap, revealPaths: [] } } };
        updateCloud(newData, true);
        alert("Fog cleared. Try saving now.");
    };

    const clearJournal = () => {
        if(!confirm("Emergency: Delete ALL Journal entries to reduce DB size?")) return;
        const newData = { ...data, journal_pages: {} };
        updateCloud(newData, true);
        alert("Journal cleared. Try saving now.");
    };

    const nukeImages = () => {
        if(!confirm("Emergency: Remove ALL character avatars to reduce DB size?")) return;
        const newPlayers = data.players.map(p => ({ ...p, image: "" }));
        const newData = { ...data, players: newPlayers };
        updateCloud(newData, true);
        alert("Avatars removed.");
    };

    const downloadBackup = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Campaign_${code}_Backup.json`;
        link.click();
    };

    const handleRestore = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target.result);
                if (confirm("Overwrite ALL data with backup?")) {
                    setData(json);
                    if(updateCloud) updateCloud(json);
                    alert("Restored.");
                }
            } catch (err) { alert("Error: " + err.message); }
        };
        reader.readAsText(file);
        e.target.value = null;
    };

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-8 overflow-y-auto h-full custom-scroll w-full pb-24 md:pb-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-2">
                <h2 className="text-3xl fantasy-font text-amber-500">Settings</h2>
            </div>
            
            {/* Invite Code Panel */}
            <div className="glass-panel p-8 rounded-xl mb-8 flex flex-col items-center text-center border-2 border-indigo-500/30 bg-indigo-900/10">
                <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-2">Campaign Code</h3>
                <div className="text-4xl md:text-5xl font-mono font-bold text-white tracking-widest mb-4 drop-shadow-lg select-all">{code || "LOCAL"}</div>
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                    <button onClick={copyCode} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm flex items-center gap-2 shadow-lg"><Icon name="copy" size={16}/> Copy Code</button>
                    <button onClick={onExit} className="bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800 px-4 py-2 rounded text-sm flex items-center justify-center gap-2"><Icon name="log-out" size={16}/> Exit Campaign</button>
                </div>
            </div>

            {/* --- DATABASE MIGRATION ZONE --- */}
            {role === 'dm' && (
                <div className="glass-panel p-6 rounded-xl mb-6 border-l-4 border-blue-500 bg-blue-950/10">
                    <h3 className="text-lg font-bold mb-4 text-blue-400 flex items-center gap-2"><Icon name="database" size={18}/> Database Migration</h3>
                    <p className="text-xs text-slate-400 mb-4">
                        Move your old data (Players, Journals) into the new scalable folder structure. This prevents the "Database Full" error.
                    </p>
                    <button onClick={handleMigration} disabled={isMigrating} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2">
                        {isMigrating ? "Moving Data..." : "Migrate Data to Folders"}
                    </button>
                </div>
            )}

            {/* --- EMERGENCY ZONE --- */}
            <div className="glass-panel p-6 rounded-xl mb-6 border-l-4 border-red-500 bg-red-950/10">
                <h3 className="text-lg font-bold mb-4 text-red-400 flex items-center gap-2"><Icon name="alert-triangle" size={18}/> Emergency Database Cleanup</h3>
                <p className="text-xs text-slate-400 mb-4">
                    If you get a "Document exceeds 1MB" error, your campaign is too big. Use these buttons to delete heavy data so you can save again.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button onClick={clearFog} className="bg-red-900 hover:bg-red-800 text-white px-3 py-2 rounded text-xs font-bold border border-red-700">Clear Fog of War</button>
                    <button onClick={clearJournal} className="bg-red-900 hover:bg-red-800 text-white px-3 py-2 rounded text-xs font-bold border border-red-700">Clear All Journals</button>
                    <button onClick={nukeImages} className="bg-red-900 hover:bg-red-800 text-white px-3 py-2 rounded text-xs font-bold border border-red-700">Remove All Avatars</button>
                </div>
            </div>

            {/* Moderation Panel */}
            {role === 'dm' && (
                <div className="glass-panel p-6 rounded-xl mb-6 border-l-4 border-purple-500 bg-slate-900/50">
                    <h3 className="text-lg font-bold mb-4 text-slate-200 flex items-center gap-2"><Icon name="shield-alert" size={18}/> Moderation</h3>
                    <div className="space-y-3 mb-6">
                        {Object.entries(activeUsers).map(([uid, email]) => {
                            const isUserDm = dmIds.includes(uid);
                            return (
                                <div key={uid} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-3 rounded border border-slate-700 gap-3">
                                    <div className="text-sm w-full md:flex-1 flex flex-col">
                                        <div className="truncate font-bold text-slate-200 flex items-center gap-2">
                                            {email}
                                            {uid === userId && <span className="text-xs text-green-500">(You)</span>}
                                            {isUserDm && <span className="text-[10px] bg-amber-900/50 text-amber-400 px-1 rounded border border-amber-600/50">DM</span>}
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 w-full">
                                            <span className="text-[10px] text-slate-500 uppercase whitespace-nowrap">Assign:</span>
                                            <select 
                                                className="bg-slate-800 border border-slate-600 text-xs rounded px-2 py-1 text-white outline-none w-full md:w-auto flex-1" 
                                                value={assignments[uid] || ""} 
                                                onChange={(e) => updateAssignment(uid, e.target.value)}
                                            >
                                                <option value="">Spectator</option>
                                                {data.players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.race})</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 w-full md:w-auto justify-end flex-wrap">
                                        <button 
                                            onClick={() => toggleDmStatus(uid)} 
                                            className={`text-xs px-3 py-2 rounded flex-1 md:flex-none border ${isUserDm ? 'bg-amber-900/20 border-amber-700 text-amber-200 hover:bg-amber-900/40' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                                        >
                                            {isUserDm ? "Revoke DM" : "Make DM"}
                                        </button>
                                        {uid !== userId && (
                                            <>
                                                <button onClick={() => kickPlayer(uid)} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-2 rounded flex-1 md:flex-none text-white">Kick</button>
                                                <button onClick={() => banPlayer(uid)} className="bg-red-900/50 hover:bg-red-800 text-xs px-3 py-2 rounded flex-1 md:flex-none text-red-200">Ban</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* AI Settings */}
            <div className="glass-panel p-6 rounded-xl mb-6 border-l-4 border-amber-500 bg-slate-900/50">
                <h3 className="text-lg font-bold mb-2 text-slate-200">AI Intelligence</h3>
                <div className="mb-3">
                    <label className="block text-xs text-slate-400 mb-1">Provider</label>
                    <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none mb-3">
                        <option value="puter">Puter.js (Free & Premium)</option>
                        <option value="openai">OpenAI (Direct API)</option>
                        <option value="gemini">Google Gemini (Direct API)</option>
                    </select>
                    
                    {aiProvider === 'puter' && (
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Puter Model</label>
                            <select value={puterModel} onChange={e => setPuterModel(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none mb-3">
                                <option value="mistral-large-latest">Mistral Large (Recommended)</option>
                                <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                                <option value="gpt-4o">GPT-4o</option>
                            </select>
                        </div>
                    )}
                    {aiProvider === 'openai' && (<div><label className="block text-xs text-slate-400 mb-1">OpenAI Model</label><select value={openAiModel} onChange={e => setOpenAiModel(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none mb-2"><option value="gpt-4o">GPT-4o</option><option value="gpt-4-turbo">GPT-4 Turbo</option></select><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none" placeholder="sk-..."/></div>)}
                    {aiProvider === 'gemini' && (<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none" placeholder="AIza..."/>)}
                </div>
            </div>

            {/* DM Config */}
            {role === 'dm' && (
                <div className="glass-panel p-6 rounded-xl border-l-4 border-blue-500 mb-6 bg-slate-900/50">
                    <h3 className="text-lg font-bold mb-4 text-slate-200">DM Rules</h3>
                    <div className="grid md:grid-cols-2 gap-6 mb-4">
                        <div><label className="block text-xs font-bold text-slate-400 uppercase mb-2">Edition</label><select value={data.config?.edition || '2014'} onChange={e => updateConfig('edition', e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none"><option value="2014">5e (2014)</option><option value="2024">5e (2024 Revised)</option></select></div>
                        <div><label className="block text-xs font-bold text-slate-400 uppercase mb-2">AI Context</label><button onClick={() => updateConfig('strictMode', !data.config?.strictMode)} className={`w-full p-3 rounded text-sm font-bold border ${data.config?.strictMode ? 'bg-green-900/50 border-green-600 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>{data.config?.strictMode ? "Strict Rules" : "General Assist"}</button></div>
                    </div>
                </div>
            )}

            {/* Backup/Restore */}
            <div className="glass-panel p-6 rounded-xl mb-6 bg-slate-900/50">
                <h3 className="text-lg font-bold mb-4 text-slate-200 flex items-center gap-2"><Icon name="save" size={18}/> Backup & Restore</h3>
                <div className="flex flex-col md:flex-row gap-4">
                    <button onClick={downloadBackup} className="flex-1 bg-slate-700 hover:bg-slate-600 p-3 rounded text-slate-200 flex items-center justify-center gap-2"><Icon name="download" size={16}/> Download JSON</button>
                    <label className="flex-1 bg-slate-700 hover:bg-slate-600 p-3 rounded text-slate-200 flex items-center justify-center gap-2 cursor-pointer"><Icon name="upload" size={16}/> Restore JSON<input type="file" accept=".json" onChange={handleRestore} className="hidden" /></label>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;