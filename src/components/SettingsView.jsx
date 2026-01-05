import React from 'react';
import Icon from './Icon';

const SettingsView = ({ 
    data, setData, apiKey, setApiKey, role, updateCloud, 
    code, user, onExit, aiProvider, setAiProvider,
    openAiModel, setOpenAiModel, puterModel, setPuterModel,
    banPlayer, kickPlayer, unbanPlayer 
}) => {
    
    const copyCode = () => { navigator.clipboard.writeText(code); alert("Copied: " + code); };
    const activeUsers = data.activeUsers || {};
    const bannedUsers = data.bannedUsers || [];
    const userId = user ? user.uid : 'offline';
    const assignments = data.assignments || {};
    
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
            <div className="glass-panel p-8 rounded-xl mb-8 flex flex-col items-center text-center border-2 border-indigo-500/30 bg-indigo-900/10 relative overflow-hidden w-full">
                <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-2">Campaign Code</h3>
                <div className="text-4xl md:text-5xl font-mono font-bold text-white tracking-widest mb-4 drop-shadow-lg break-all">{code || "LOCAL"}</div>
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                    <button onClick={copyCode} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm flex items-center gap-2 shadow-lg"><Icon name="copy" size={16}/> Copy Code</button>
                    <button onClick={onExit} className="bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800 px-4 py-2 rounded text-sm flex items-center justify-center gap-2"><Icon name="log-out" size={16}/> Exit Campaign</button>
                </div>
            </div>

            {/* Moderation Panel (DM Only) */}
            {role === 'dm' && (
                <div className="glass-panel p-6 rounded-xl mb-6 border-l-4 border-purple-500 bg-slate-900/50">
                    <h3 className="text-lg font-bold mb-4 text-slate-200 flex items-center gap-2"><Icon name="shield-alert" size={18}/> Moderation</h3>
                    <div className="space-y-3 mb-6">
                        {Object.entries(activeUsers).map(([uid, email]) => (
                            <div key={uid} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-3 rounded border border-slate-700 gap-3">
                                <div className="text-sm w-full md:flex-1 flex flex-col">
                                    <div className="truncate font-bold text-slate-200">
                                        {email}{uid === userId && <span className="ml-2 text-xs text-green-500">(You)</span>}
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
                                {uid !== userId && (
                                    <div className="flex gap-2 w-full md:w-auto justify-end">
                                        <button onClick={() => kickPlayer(uid)} className="bg-amber-900/50 hover:bg-amber-800 text-xs px-3 py-2 rounded flex-1 md:flex-none text-amber-200">Kick</button>
                                        <button onClick={() => banPlayer(uid)} className="bg-red-900/50 hover:bg-red-800 text-xs px-3 py-2 rounded flex-1 md:flex-none text-red-200">Ban</button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {Object.keys(activeUsers).length === 0 && <div className="text-slate-500 text-sm">No active users.</div>}
                    </div>
                    
                    {bannedUsers.length > 0 && (
                        <div className="space-y-2 border-t border-slate-800 pt-4">
                            <div className="text-xs text-red-400 uppercase font-bold">Banned Users</div>
                            {bannedUsers.map(uid => (
                                <div key={uid} className="flex justify-between items-center bg-red-950/30 p-2 rounded border border-red-900/50">
                                    <span className="text-xs font-mono text-red-300 truncate flex-1">{uid}</span>
                                    <button onClick={() => unbanPlayer(uid)} className="text-xs text-slate-400 hover:text-white ml-2 bg-slate-800 px-2 py-1 rounded">Unban</button>
                                </div>
                            ))}
                        </div>
                    )}
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
                                {/* Mistral Family */}
                                <optgroup label="Mistral">
                                    <option value="mistral-large-latest">Mistral Large (Recommended)</option>
                                    <option value="codestral-latest">Codestral (Code/Rules)</option>
                                </optgroup>
                                
                                {/* Claude Family */}
                                <optgroup label="Anthropic Claude">
                                    <option value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet (New)</option>
                                    <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                                </optgroup>
                                
                                {/* DeepSeek Family */}
                                <optgroup label="DeepSeek">
                                    <option value="deepseek-v3">DeepSeek V3 (Chat)</option>
                                    <option value="deepseek-reasoner">DeepSeek R1 (Reasoning)</option>
                                </optgroup>
                                
                                {/* Meta / Llama Family */}
                                <optgroup label="Meta Llama">
                                    <option value="meta-llama/meta-llama-3.1-70b-instruct">Llama 3.1 (70B)</option>
                                    <option value="meta-llama/meta-llama-3.1-405b-instruct">Llama 3.1 (405B)</option>
                                </optgroup>
                                
                                {/* OpenAI / Google via Puter */}
                                <optgroup label="Others">
                                    <option value="gpt-4o">GPT-4o</option>
                                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                </optgroup>
                            </select>
                            
                            <div className="bg-blue-900/30 border border-blue-600 rounded p-3">
                                <div className="flex items-center gap-2 text-xs text-blue-300 mb-2"><Icon name="cloud" size={14}/><span>Powered by Puter.js (Serverless & Free)</span></div>
                                <button onClick={async () => { 
                                    if(window.puter) {
                                        await window.puter.auth.signIn(); 
                                        window.location.reload(); 
                                    } else { alert("Puter.js not loaded."); }
                                }} className="w-full bg-blue-700 hover:bg-blue-600 text-white text-xs py-3 rounded font-bold transition-colors">
                                    Connect / Re-Login
                                </button>
                            </div>
                        </div>
                    )}

                    {aiProvider === 'openai' && (
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">OpenAI Model</label>
                            <select value={openAiModel} onChange={e => setOpenAiModel(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none mb-2">
                                <option value="gpt-4o">GPT-4o</option>
                                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                            </select>
                            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none" placeholder="sk-..."/>
                        </div>
                    )}
                    {aiProvider === 'gemini' && (
                        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none" placeholder="AIza..."/>
                    )}
                </div>
            </div>

            {/* DM Config */}
            {role === 'dm' && (
                <div className="glass-panel p-6 rounded-xl border-l-4 border-blue-500 mb-6 bg-slate-900/50">
                    <h3 className="text-lg font-bold mb-4 text-slate-200">DM Rules</h3>
                    <div className="grid md:grid-cols-2 gap-6 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Edition</label>
                            <select value={data.config?.edition || '2014'} onChange={e => updateConfig('edition', e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-slate-200 outline-none">
                                <option value="2014">5e (2014)</option>
                                <option value="2024">5e (2024 Revised)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">AI Context</label>
                            <button onClick={() => updateConfig('strictMode', !data.config?.strictMode)} className={`w-full p-3 rounded text-sm font-bold border ${data.config?.strictMode ? 'bg-green-900/50 border-green-600 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                                {data.config?.strictMode ? "Strict Rules" : "General Assist"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Backup/Restore */}
            <div className="glass-panel p-6 rounded-xl mb-6 bg-slate-900/50">
                <h3 className="text-lg font-bold mb-4 text-slate-200 flex items-center gap-2"><Icon name="save" size={18}/> Backup & Restore</h3>
                <div className="flex flex-col md:flex-row gap-4">
                    <button onClick={downloadBackup} className="flex-1 bg-slate-700 hover:bg-slate-600 p-3 rounded text-slate-200 flex items-center justify-center gap-2"><Icon name="download" size={16}/> Download JSON</button>
                    <label className="flex-1 bg-slate-700 hover:bg-slate-600 p-3 rounded text-slate-200 flex items-center justify-center gap-2 cursor-pointer">
                        <Icon name="upload" size={16}/> Restore JSON
                        <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
                    </label>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
