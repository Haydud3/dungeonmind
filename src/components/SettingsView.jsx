import React, { useState } from 'react';
import Icon from './Icon';

const SettingsView = ({ data, setData, apiKey, setApiKey, role, updateCloud, code, user, onExit, aiProvider, setAiProvider, openAiModel, setOpenAiModel, puterModel, setPuterModel, banPlayer, kickPlayer, unbanPlayer }) => {
    const [activeTab, setActiveTab] = useState('general');
    
    // Campaign Bible State (Local edit before save)
    const [bibleData, setBibleData] = useState(data.campaign?.genesis || { tone: '', conflict: '', campaignName: '' });

    const handleBibleSave = () => {
        updateCloud({ ...data, campaign: { ...data.campaign, genesis: bibleData } });
        alert("Campaign Bible Updated!");
    };

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
                        <span className="text-xl font-mono text-white tracking-widest">{code}</span>
                        <button onClick={() => navigator.clipboard.writeText(code)} className="text-indigo-400 hover:text-white"><Icon name="copy" size={16}/></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'general' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>General</button>
                    <button onClick={() => setActiveTab('bible')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'bible' ? 'bg-slate-700 text-amber-500 shadow' : 'text-slate-400 hover:text-slate-200'}`}>Campaign Bible</button>
                    <button onClick={() => setActiveTab('ai')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'ai' ? 'bg-slate-700 text-purple-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}>AI Config</button>
                    {role === 'dm' && <button onClick={() => setActiveTab('players')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'players' ? 'bg-slate-700 text-red-400 shadow' : 'text-slate-400 hover:text-slate-200'}`}>Players</button>}
                </div>

                {/* --- GENERAL SETTINGS --- */}
                {activeTab === 'general' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Icon name="settings" size={20}/> Game Options</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Edition / Ruleset</label>
                                    <select 
                                        value={data.config?.edition || '2014'} 
                                        onChange={(e) => updateCloud({ ...data, config: { ...data.config, edition: e.target.value } })}
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
                                        onChange={(e) => updateCloud({ ...data, config: { ...data.config, strictMode: e.target.checked } })}
                                        disabled={role !== 'dm'}
                                        className="w-5 h-5 accent-indigo-500"
                                    />
                                    <div>
                                        <div className="font-bold text-slate-200">Strict Mode</div>
                                        <div className="text-xs text-slate-500">Prevent players from editing their stats manually during sessions.</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button onClick={onExit} className="w-full py-4 rounded-xl border-2 border-red-900/50 text-red-400 hover:bg-red-900/20 hover:border-red-500 hover:text-white transition-all font-bold flex items-center justify-center gap-2">
                            <Icon name="log-out" size={20}/> Leave Campaign
                        </button>
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
                                    </div>
                                )}
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
                                {Object.entries(data.activeUsers || {}).map(([uid, name]) => (
                                    <div key={uid} className="flex items-center justify-between bg-slate-900 p-3 rounded border border-slate-700">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            <span className="text-white font-bold">{name}</span>
                                            {uid === data.hostId && <span className="text-xs bg-amber-900 text-amber-200 px-2 py-0.5 rounded border border-amber-700">DM</span>}
                                        </div>
                                        {uid !== data.hostId && (
                                            <div className="flex gap-2">
                                                <button onClick={() => kickPlayer(uid)} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded">Kick</button>
                                                <button onClick={() => banPlayer(uid)} className="text-xs bg-red-900 hover:bg-red-800 text-white px-3 py-1 rounded">Ban</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {data.bannedUsers?.length > 0 && (
                                <div className="mt-6 pt-6 border-t border-slate-700">
                                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Banned Souls</h4>
                                    <div className="space-y-2">
                                        {data.bannedUsers.map(uid => (
                                            <div key={uid} className="flex justify-between items-center text-sm text-slate-400 bg-slate-900/50 p-2 rounded">
                                                <span>ID: {uid.substring(0,8)}...</span>
                                                <button onClick={() => unbanPlayer(uid)} className="text-green-400 hover:underline">Forgive</button>
                                            </div>
                                        ))}
                                    </div>
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