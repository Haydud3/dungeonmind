import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
import Icon from './components/Icon';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Lobby from './components/Lobby';
import JournalView from './components/JournalView';
import SessionView from './components/SessionView';
import PartyView from './components/PartyView';
import SettingsView from './components/SettingsView';
import OnboardingWizard from './components/OnboardingWizard';
import TourGuide from './components/TourGuide';

// --- HELPER TO PREVENT CRASHES ---
const safeText = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string' || typeof val === 'number') return val;
    if (typeof val === 'object') {
        if (val.primary) return `${val.primary} ${val.level ? "(Lvl " + val.level + ")" : ""}`;
        if (val.name) return val.name;
        return JSON.stringify(val); 
    }
    return String(val);
};

const DEFAULT_DATA = { 
    hostId: null,
    journal_pages: {}, 
    savedSessions: [], 
    players: [], 
    locations: [],
    npcs: [],
    activeUsers: {},
    bannedUsers: [],
    assignments: {},
    onboardingComplete: false,
    config: { edition: '2014', strictMode: false },
    campaign: { genesis: { tone: 'Heroic', conflict: 'Dragon vs Kingdom', campaignName: 'New Campaign' } }
};

// --- COMPONENT DEFINITIONS (Internal to ensure prop passing works perfectly) ---

const WorldView = ({ data, setData, role, updateCloud, generateLoc }) => {
    const [genType, setGenType] = useState("Town");
    const [genNote, setGenNote] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [editingLoc, setEditingLoc] = useState(null);

    const locations = data.locations || [];
    const genesis = data.campaign?.genesis || {};

    const updateGenesis = (field, val) => {
        const nd = { ...data, campaign: { ...data.campaign, genesis: { ...genesis, [field]: val } } };
        setData(nd); updateCloud(nd);
    };

    const handleGen = async () => {
        if(isGenerating) return;
        setIsGenerating(true);
        const loc = await generateLoc(genType, genNote, genesis);
        if(loc) {
            const nd = { ...data, locations: [{id:Date.now(), ...loc}, ...locations] };
            setData(nd); updateCloud(nd);
        }
        setIsGenerating(false);
    };

    const updateLocation = (id, field, val) => {
        const newLocs = locations.map(l => l.id === id ? { ...l, [field]: val } : l);
        const nd = { ...data, locations: newLocs };
        setData(nd); updateCloud(nd);
    };

    const deleteLoc = (id) => {
        if(confirm("Delete Location?")) {
            const nd = { ...data, locations: locations.filter(l => l.id !== id) };
            setData(nd); updateCloud(nd);
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 h-full flex flex-col md:flex-row gap-6 overflow-hidden pb-20 md:pb-6">
            <div className="w-full md:w-1/3 flex flex-col glass-panel rounded-xl overflow-hidden max-h-full">
                <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                    <h3 className="fantasy-font text-xl text-amber-500 mb-2">Campaign Bible</h3>
                    <p className="text-xs text-slate-400">The core truths of your world.</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4">
                    <div><label className="text-xs font-bold text-slate-500 uppercase">Tone</label><input disabled={role!=='dm'} value={genesis.tone || ""} onChange={e => updateGenesis('tone', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200"/></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase">Conflict</label><textarea disabled={role!=='dm'} value={genesis.conflict || ""} onChange={e => updateGenesis('conflict', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200 h-24 resize-none"/></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase">Lore / Concept</label><textarea disabled={role!=='dm'} value={genesis.loreText || genesis.conceptDesc || ""} onChange={e => updateGenesis(genesis.loreText ? 'loreText' : 'conceptDesc', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200 h-64 resize-none custom-scroll"/></div>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col glass-panel rounded-xl overflow-hidden max-h-full">
                <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center"><h3 className="fantasy-font text-xl text-amber-500">Atlas</h3></div>
                {role === 'dm' && (
                    <div className="p-4 bg-slate-900/30 border-b border-slate-700 flex flex-col md:flex-row gap-2">
                        <div className="flex gap-2 flex-1">
                            <input list="loc-types" value={genType} onChange={e => setGenType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white outline-none w-32" placeholder="Type..." />
                            <datalist id="loc-types"><option value="Town"/><option value="Dungeon"/><option value="Region"/><option value="Shop"/><option value="Tavern"/><option value="Landmark"/></datalist>
                            <input value={genNote} onChange={e => setGenNote(e.target.value)} placeholder="Theme / Note (e.g. 'Underwater')" className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white outline-none"/>
                        </div>
                        <button onClick={handleGen} disabled={isGenerating} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded font-bold text-sm flex items-center justify-center gap-2">
                            {isGenerating ? <Icon name="loader-2" size={16} className="animate-spin"/> : <Icon name="wand-2" size={16}/>} Generate
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto custom-scroll p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {locations.map(loc => (
                        <div key={loc.id} className="bg-slate-900/50 border border-slate-700 rounded p-4 relative hover:border-amber-500/30 transition-colors group">
                            {editingLoc === loc.id ? (
                                <div className="space-y-2">
                                    <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm font-bold text-amber-400" value={loc.name} onChange={e => updateLocation(loc.id, 'name', e.target.value)} />
                                    <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs uppercase text-slate-400" value={loc.type} onChange={e => updateLocation(loc.id, 'type', e.target.value)} />
                                    <textarea className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300 h-24" value={loc.desc} onChange={e => updateLocation(loc.id, 'desc', e.target.value)} />
                                    <button onClick={() => setEditingLoc(null)} className="bg-green-700 text-white text-xs px-2 py-1 rounded">Done</button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-amber-400">{safeText(loc.name)}</h4>
                                        <span className="text-[10px] uppercase bg-slate-800 px-2 py-1 rounded text-slate-400">{safeText(loc.type)}</span>
                                    </div>
                                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{safeText(loc.desc)}</p>
                                    {role === 'dm' && (
                                        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditingLoc(loc.id)} className="text-slate-500 hover:text-white p-1 bg-slate-800 rounded"><Icon name="pencil" size={14}/></button>
                                            <button onClick={() => deleteLoc(loc.id)} className="text-slate-500 hover:text-red-500 p-1 bg-slate-800 rounded"><Icon name="trash-2" size={14}/></button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                    {locations.length === 0 && <div className="col-span-full text-center text-slate-500 mt-10">No locations mapped yet.</div>}
                </div>
            </div>
        </div>
    );
};

const NpcView = ({ data, setData, role, updateCloud, generateNpc, setChatInput, setView }) => {
    const [genName, setGenName] = useState("");
    const [genContext, setGenContext] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    const npcs = (data.npcs || []).filter(n => n && n.id);
    const visibleNpcs = role === 'dm' ? npcs : npcs.filter(n => !n.isHidden);

    const handleGen = async () => {
        if(isGenerating) return; 
        setIsGenerating(true);
        const npcData = await generateNpc(genName, genContext);
        if(npcData) { 
            const newNpc = { 
                id: Date.now(), 
                isHidden: false, 
                name: "Unknown", 
                race: "???", 
                class: "Commoner", 
                quirk: "None",
                ...npcData 
            }; 
            const newNpcs = [...npcs, newNpc]; 
            const nd = { ...data, npcs: newNpcs }; 
            setData(nd); updateCloud(nd); 
            setGenName(""); setGenContext(""); 
            setSelectedNpc(newNpc); setIsEditing(false); 
        }
        setIsGenerating(false);
    };

    const deleteNpc = (id, e) => {
        if(e) e.stopPropagation(); 
        if(!confirm("Delete this NPC?")) return;
        const newNpcs = npcs.filter(n => n.id !== id); 
        const nd = { ...data, npcs: newNpcs }; 
        setData(nd); updateCloud(nd); 
        if(selectedNpc?.id === id) setSelectedNpc(null);
    };
    
    const toggleHidden = (npc) => {
        const updated = { ...npc, isHidden: !npc.isHidden }; 
        const newNpcs = npcs.map(n => n.id === npc.id ? updated : n); 
        const nd = { ...data, npcs: newNpcs }; 
        setData(nd); updateCloud(nd); 
        if(selectedNpc?.id === npc.id) setSelectedNpc(updated);
    };

    const updateNpcField = (field, value) => {
        if(!selectedNpc) return;
        const updated = { ...selectedNpc, [field]: value };
        setSelectedNpc(updated);
        const newNpcs = npcs.map(n => n.id === updated.id ? updated : n);
        const nd = { ...data, npcs: newNpcs }; 
        setData(nd); updateCloud(nd);
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 h-full flex flex-col md:flex-row gap-6 pb-20 md:pb-6">
            <div className={`${selectedNpc ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 flex-col glass-panel rounded-xl overflow-hidden max-h-full`}>
                <div className="p-4 border-b border-slate-700 bg-slate-800/50"><h3 className="fantasy-font text-xl text-amber-500 mb-2">NPC Registry</h3>
                {role === 'dm' && (<div className="space-y-2 p-3 bg-slate-900/50 rounded border border-slate-700"><div className="text-xs font-bold text-slate-400 uppercase">Generator</div><input value={genName} onChange={e=>setGenName(e.target.value)} placeholder="Name (e.g. 'Strahd')" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"/><input value={genContext} onChange={e=>setGenContext(e.target.value)} placeholder="Role/Context (e.g. Shopkeeper)" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"/><button onClick={handleGen} disabled={isGenerating} className="w-full bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold py-3 rounded flex justify-center gap-2 items-center">{isGenerating ? <Icon name="loader-2" size={14} className="animate-spin"/> : <Icon name="wand-2" size={14}/>} Generate NPC</button></div>)}</div>
                <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
                    {visibleNpcs.map(npc => (
                        <div key={npc.id} onClick={() => { setSelectedNpc(npc); setIsEditing(false); }} className={`p-3 rounded cursor-pointer border transition-all relative group ${selectedNpc?.id === npc.id ? 'bg-amber-900/20 border-amber-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500'} ${npc.isHidden ? 'opacity-50' : ''}`}>
                            <div className="font-bold text-slate-200 flex items-center gap-2">{safeText(npc.name)}{role === 'dm' && npc.isHidden && <Icon name="eye-off" size={14} className="text-slate-500"/>}</div>
                            <div className="text-xs text-slate-500 truncate">{safeText(npc.race)} {safeText(npc.class)}</div>
                            {role === 'dm' && (<button onClick={(e) => deleteNpc(npc.id, e)} className="absolute top-2 right-2 text-slate-600 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="trash-2" size={14}/></button>)}
                        </div>
                    ))}
                    {visibleNpcs.length === 0 && <div className="text-center text-slate-500 text-xs mt-4">No NPCs recorded.</div>}
                </div>
            </div>
            
            <div className={`${selectedNpc ? 'flex' : 'hidden md:flex'} flex-1 glass-panel rounded-xl p-4 md:p-6 overflow-y-auto custom-scroll relative flex-col`}>
                {selectedNpc && <button onClick={() => setSelectedNpc(null)} className="md:hidden absolute top-4 left-4 text-slate-400 bg-slate-800 rounded-full p-2 z-10"><Icon name="arrow-left" size={20}/></button>}
                {selectedNpc ? (
                    <div className="space-y-4 pt-10 md:pt-0">
                        <div className="flex flex-col md:flex-row justify-between items-start border-b border-slate-700 pb-4 gap-4">
                            <div className="flex-1 w-full">
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <input className="text-3xl font-bold bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full text-white" value={selectedNpc.name} onChange={e => updateNpcField('name', e.target.value)} placeholder="Name"/>
                                        <div className="flex gap-2">
                                            <input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-amber-500 w-1/2" value={safeText(selectedNpc.race)} onChange={e => updateNpcField('race', e.target.value)} placeholder="Race"/>
                                            <input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-amber-500 w-1/2" value={safeText(selectedNpc.class)} onChange={e => updateNpcField('class', e.target.value)} placeholder="Class"/>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h2 className="text-3xl fantasy-font text-white">{safeText(selectedNpc.name)}</h2>
                                        <div className="text-amber-500 font-mono text-sm">{safeText(selectedNpc.race)} {safeText(selectedNpc.class)}</div>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-2 w-full md:w-auto justify-end">
                                {role === 'dm' && (
                                    <>
                                        <button onClick={() => toggleHidden(selectedNpc)} className={`p-3 rounded text-sm ${selectedNpc.isHidden ? 'bg-slate-700 text-slate-300' : 'bg-green-900/50 text-green-300'}`} title="Toggle Visibility"><Icon name={selectedNpc.isHidden ? "eye-off" : "eye"} size={16}/></button>
                                        <button onClick={() => setIsEditing(!isEditing)} className={`p-3 rounded text-sm ${isEditing ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300'}`} title="Edit NPC"><Icon name={isEditing ? "check" : "pencil"} size={16}/></button>
                                    </>
                                )}
                                <button onClick={() => { setChatInput(`(Playing as ${selectedNpc.name}) `); setView('session'); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm flex items-center gap-2"><Icon name="message-circle" size={16}/> Chat</button>
                                {role === 'dm' && <button onClick={(e) => deleteNpc(selectedNpc.id, e)} className="bg-red-900/50 hover:bg-red-900 text-red-200 px-4 py-2 rounded text-sm"><Icon name="trash" size={16}/></button>}
                            </div>
                        </div>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700"><div className="text-xs font-bold text-slate-500 uppercase mb-1">Quirk</div>{isEditing ? <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" value={selectedNpc.quirk || ""} onChange={e => updateNpcField('quirk', e.target.value)}/> : <div className="text-slate-300 text-sm">{safeText(selectedNpc.quirk)}</div>}</div>
                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700"><div className="text-xs font-bold text-slate-500 uppercase mb-1">Goal</div>{isEditing ? <input className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" value={selectedNpc.goal || ""} onChange={e => updateNpcField('goal', e.target.value)}/> : <div className="text-slate-300 text-sm">{safeText(selectedNpc.goal)}</div>}</div>
                        </div>
                        <div className="bg-red-950/20 p-3 rounded border border-red-900/30"><div className="text-xs font-bold text-red-400 uppercase mb-1 flex items-center gap-2"><Icon name="eye-off" size={12}/> Secret</div>{isEditing ? <input className="w-full bg-slate-900 border border-red-900/50 rounded px-2 py-1 text-sm text-red-200" value={selectedNpc.secret || ""} onChange={e => updateNpcField('secret', e.target.value)}/> : <div className="text-slate-300 text-sm">{safeText(selectedNpc.secret)}</div>}</div>
                        <div className="bg-slate-900/30 p-4 rounded border border-slate-700"><div className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><Icon name="swords" size={14}/> Combat Stats & Abilities</div><textarea className="w-full h-48 bg-slate-900/80 border border-slate-700 rounded p-3 text-sm text-green-300 font-mono leading-relaxed resize-none focus:outline-none focus:border-amber-500" value={typeof selectedNpc.stats === 'object' ? JSON.stringify(selectedNpc.stats, null, 2) : (selectedNpc.stats || "No stats generated.")} onChange={(e) => updateNpcField('stats', e.target.value)} /></div>
                        
                        <div className="mt-2">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Personality</div>
                            {isEditing ? (
                                <textarea 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-2 text-sm text-slate-200 h-24 resize-none focus:border-amber-500 outline-none" 
                                    value={selectedNpc.personality || ""} 
                                    onChange={e => updateNpcField('personality', e.target.value)}
                                />
                            ) : (
                                <div className="text-slate-400 text-sm italic">{safeText(selectedNpc.personality)}</div>
                            )}
                        </div>
                    </div>
                ) : (<div className="h-full flex flex-col items-center justify-center text-slate-500"><Icon name="skull" size={48} className="mb-4 opacity-20"/><p>Select or Generate an NPC to view details.</p></div>)}
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

function App() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('session'); 
  const [gameParams, setGameParams] = useState(null); 
  const [data, setData] = useState(null);
  const saveTimer = useRef(null);
  const [showTour, setShowTour] = useState(false);
  const [chatHistory, setChatHistory] = useState([{role:'system', content: 'Connected to DungeonMind.'}]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);

  // AI Config
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dm_api_key') || '');
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('dm_ai_provider') || 'puter');
  const [openAiModel, setOpenAiModel] = useState(() => localStorage.getItem('dm_openai_model') || 'gpt-4o');
  const [puterModel, setPuterModel] = useState(() => localStorage.getItem('dm_puter_model') || 'mistral-large-latest');

  useEffect(() => { localStorage.setItem('dm_api_key', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('dm_ai_provider', aiProvider); }, [aiProvider]);
  useEffect(() => { localStorage.setItem('dm_openai_model', openAiModel); }, [openAiModel]);
  useEffect(() => { localStorage.setItem('dm_puter_model', puterModel); }, [puterModel]);

  // Auth & Auto-Rejoin
  useEffect(() => {
    const unsub = fb.onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u && !gameParams) {
          const lastCode = localStorage.getItem('dm_last_code');
          if (lastCode) {
              setGameParams({ code: lastCode, role: 'player', uid: u.uid, isOffline: false });
          }
      }
    });
    return () => unsub();
  }, [gameParams]); 

  useEffect(() => {
      if (data && !localStorage.getItem('dm_tour_completed')) {
          if (gameParams?.role === 'player' || data.onboardingComplete) {
              setShowTour(true);
          }
      }
  }, [data, gameParams]);

  // Data Sync & Presence
  useEffect(() => {
      if (!gameParams) return;
      const { code, isOffline, uid } = gameParams;

      if (isOffline) {
          const local = localStorage.getItem('dm_local_data');
          setData(local ? JSON.parse(local) : DEFAULT_DATA);
          return;
      }

      const ref = fb.doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
      const unsub = fb.onSnapshot(ref, (snap) => {
          if (snap.exists()) {
              const d = snap.data();
              if (d.bannedUsers?.includes(uid)) {
                  alert("You have been banned.");
                  setGameParams(null);
                  return;
              }
              // Defaults
              if (!d.journal_pages) d.journal_pages = {};
              if (!d.savedSessions) d.savedSessions = [];
              if (!d.players) d.players = [];
              if (!d.npcs) d.npcs = [];
              if (!d.activeUsers) d.activeUsers = {};
              setData(d);
          } else {
              if (gameParams.role === 'dm') {
                  const initData = { ...DEFAULT_DATA, hostId: user?.uid };
                  fb.setDoc(ref, initData).catch(e => alert("Create Error: " + e.message));
              } else {
                  alert("Campaign not found!");
                  setGameParams(null);
              }
          }
      });

      if (user && !isOffline) {
          fb.updateDoc(ref, { [`activeUsers.${user.uid}`]: user.email || "Anonymous" }).catch(console.error);
      }

      return () => unsub();
  }, [gameParams]);

  const effectiveRole = (data && user && data.hostId === user.uid) ? 'dm' : (gameParams?.role || 'player');

  const updateCloud = (newData) => {
      setData(newData);
      if (gameParams?.isOffline) {
          localStorage.setItem('dm_local_data', JSON.stringify(newData));
          return;
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
          const ref = fb.doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
          fb.setDoc(ref, newData, { merge: true });
      }, 1000);
  };

  // --- AI LOGIC ---
  const queryAiService = async (messages) => {
      const hasKey = aiProvider === 'puter' || apiKey;
      if (!hasKey) throw new Error("No API Key/Provider");
      try {
          if(aiProvider === 'puter') {
              if (!window.puter) throw new Error("Puter.js not loaded");
              if (!window.puter.auth.isSignedIn()) await window.puter.auth.signIn();
              const response = await window.puter.ai.chat(messages, { model: puterModel });
              return response.message.content;
          } else if(aiProvider === 'gemini') {
               const combinedPrompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
               const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts:[{text:combinedPrompt}]}]}) });
               const j = await r.json();
               return j.candidates?.[0]?.content?.parts?.[0]?.text;
          } else {
              const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model: openAiModel, messages: messages}) });
              const j = await r.json();
              return j.choices?.[0]?.message?.content;
          }
      } catch(e) { console.error(e); return null; }
  };

  const generateResponse = async (overrideText, mode = 'standard') => {
      const q = overrideText || inputText;
      if (!q && mode !== 'chaos') return;
      setChatHistory(p => [...p, { role: 'user', content: q || "CHAOS!" }]);
      setInputText('');
      setIsLoading(true);
      const systemPrompt = `Role: DM. Context: ${data.campaign.genesis.tone}. Answer as DM.`; 
      const res = await queryAiService([{ role: 'system', content: systemPrompt }, { role: 'user', content: q }]);
      setChatHistory(p => [...p, { role: 'ai', content: res || "AI Error." }]);
      setIsLoading(false);
  };

  // 2. Context-Aware NPC Generator
  const generateNpc = async (name, context) => {
      if (!apiKey && aiProvider !== 'puter') { alert("Please set API Key in Settings."); return null; }
      
      const campaignName = data.campaign?.genesis?.campaignName || "Generic Fantasy";
      const lore = data.campaign?.genesis?.loreText || data.campaign?.genesis?.conceptDesc || "";
      const tone = data.campaign?.genesis?.tone || "Adventure";

      const prompt = `
      Role: D&D 5e Expert.
      Campaign Module: "${campaignName}".
      Setting Lore: ${lore.slice(0, 800)}.
      Tone: ${tone}.

      Task: Generate a JSON object for an NPC named "${name || 'Random'}" with role/context "${context || 'Any'}".

      CRITICAL INSTRUCTION:
      1. If the name "${name}" matches a Canonical/Official character from "${campaignName}", return their OFFICIAL 5e stats, secrets, and goals.
      2. If "${name}" is generic or does not exist in official lore, create a NEW ORIGINAL character that fits the setting.

      Return ONLY valid JSON with these keys:
      {
        "name": "String",
        "race": "String",
        "class": "String",
        "quirk": "String",
        "goal": "String",
        "secret": "String",
        "stats": "String",
        "personality": "String"
      }
      `;

      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { console.error(e); return null; }
  };

  const generateLoc = async (type, note, genesis) => {
      if (!apiKey && aiProvider !== 'puter') { alert("Please set API Key."); return null; }
      const prompt = `Create a 5e Location JSON. Type: ${type}, Theme: ${note}. Return JSON ONLY: {name, type, desc}.`;
      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };

  const handleOnboardingComplete = (onboardingData) => {
      if (!onboardingData) { updateCloud({...data, onboardingComplete: true}); return; }
      const newData = { ...data, onboardingComplete: true, campaign: { ...data.campaign, genesis: onboardingData } };
      const genId = 'genesis_doc';
      newData.journal_pages[genId] = {
          id: genId, title: 'Campaign Bible',
          content: `<h1>${onboardingData.campaignName || "New Campaign"}</h1><p>${onboardingData.loreText || onboardingData.conceptDesc}</p>`,
          ownerId: 'system', isPublic: true, created: Date.now()
      };
      updateCloud(newData);
  };

  const handleSaveToJournal = () => {
      if (chatHistory.length < 2) return alert("Nothing to save!");
      const htmlLog = chatHistory.map(m => `<p><b>${m.role.toUpperCase()}:</b> ${m.content}</p>`).join("");
      
      const existingPages = Object.values(data.journal_pages).filter(p => p.isPublic || p.ownerId === user.uid);
      const choice = prompt(`Save Chat.\nType 'NEW' for a new page.\nType the exact name of an existing page to append.`);
      
      if (!choice) return;
      
      if (choice.toUpperCase() === 'NEW') {
          const title = prompt("Page Title:");
          if(!title) return;
          const newId = `page_${Date.now()}`;
          const newPage = { id: newId, title: title, content: htmlLog, ownerId: user.uid, isPublic: true, created: Date.now() };
          updateCloud({...data, journal_pages: {...data.journal_pages, [newId]: newPage}});
      } else {
          const target = existingPages.find(p => p.title.toLowerCase() === choice.toLowerCase());
          if (target) {
              const updatedPage = { ...target, content: target.content + "<hr/><h3>Session Log</h3>" + htmlLog };
              updateCloud({...data, journal_pages: {...data.journal_pages, [target.id]: updatedPage}});
          } else {
              alert("Page not found.");
          }
      }
  };

  const handleDiceRoll = (d) => {
    const result = Math.floor(Math.random() * d) + 1;
    setDiceLog(prev => [{id: Date.now(), die: `d${d}`, result}, ...prev]);
    if ((d === 20 && result === 20) || (d === 20 && result === 1)) {
        generateResponse(`I rolled a nat ${result} on a d20! Describe the result!`, 'narrate');
    } else {
        setChatHistory(prev => [...prev, { role: 'system', content: `Rolled d${d}: **${result}**` }]);
    }
  };

  if (!isAuthReady) return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Summoning DungeonMind...</div>;

  if (!gameParams || !data) {
      return (
        <Lobby 
            fb={fb} 
            user={user} 
            onJoin={(code, role, uid) => {
                localStorage.setItem('dm_last_code', code); 
                setGameParams({code, role, isOffline:false, uid})
            }} 
            onOffline={() => setGameParams({code:'LOCAL', role:'dm', isOffline:true, uid: 'local-admin'})} 
        />
      );
  }

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-200 overflow-hidden font-sans">
       <Sidebar view={currentView} setView={setCurrentView} onExit={() => { localStorage.removeItem('dm_last_code'); setGameParams(null); setData(null); }} />
       
       <main className="flex-1 h-full overflow-hidden relative w-full flex flex-col mb-16 md:mb-0">
           <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/90 backdrop-blur shrink-0">
               <div className="flex gap-2 items-center">
                   <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] ${gameParams?.isOffline ? 'bg-slate-500' : 'bg-green-500'}`}></div>
                   <span className="text-sm font-bold text-amber-500 truncate fantasy-font tracking-wide">
                       {gameParams?.code} • {data?.campaign?.location || "Unknown"}
                   </span>
               </div>
               <button onClick={handleSaveToJournal} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1 rounded flex items-center gap-2 text-slate-300 hover:text-white"><Icon name="save" size={14}/> Save Chat</button>
               <div className="text-xs text-slate-500 hidden sm:block">Logged in as {user?.email || "Guest"}</div>
           </div>

           <div className="flex-1 overflow-hidden relative p-0 md:p-0">
              {currentView === 'session' && (
                  <SessionView 
                      data={data}
                      chatHistory={chatHistory}
                      inputText={inputText}
                      setInputText={setInputText}
                      generateResponse={generateResponse}
                      isLoading={isLoading}
                      role={effectiveRole}
                      activeChar={data.assignments?.[user?.uid]}
                      showTools={showTools}
                      setShowTools={setShowTools}
                      diceLog={diceLog}
                      handleDiceRoll={handleDiceRoll}
                      aiProvider={aiProvider}
                  />
              )}
              {currentView === 'journal' && <JournalView data={data} setData={setData} updateCloud={updateCloud} role={effectiveRole} updateJournalField={()=>{}} userId={user?.uid} aiHelper={queryAiService} />}
              {currentView === 'world' && <WorldView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateLoc={generateLoc} />}
              {currentView === 'party' && <PartyView data={data} setData={setData} role={effectiveRole} activeChar={data.assignments?.[user?.uid]} updateCloud={updateCloud} />}
              {currentView === 'npcs' && <NpcView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateNpc={generateNpc} setChatInput={setInputText} setView={setCurrentView} />}
              
              {currentView === 'settings' && (
                  <SettingsView 
                      data={data} 
                      setData={setData} 
                      apiKey={apiKey} 
                      setApiKey={setApiKey} 
                      role={effectiveRole} 
                      updateCloud={updateCloud} 
                      code={gameParams.code} 
                      user={user} 
                      onExit={() => { localStorage.removeItem('dm_last_code'); setGameParams(null); setData(null); }} 
                      aiProvider={aiProvider} 
                      setAiProvider={setAiProvider}
                      openAiModel={openAiModel}
                      setOpenAiModel={setOpenAiModel}
                      puterModel={puterModel}
                      setPuterModel={setPuterModel}
                      banPlayer={(uid) => {
                          if(!confirm("Ban?")) return;
                          const newData = {...data, activeUsers: {...data.activeUsers}, bannedUsers: [...(data.bannedUsers||[]), uid]};
                          delete newData.activeUsers[uid];
                          updateCloud(newData);
                      }}
                      kickPlayer={(uid) => {
                          const newData = {...data, activeUsers: {...data.activeUsers}};
                          delete newData.activeUsers[uid];
                          updateCloud(newData);
                      }}
                      unbanPlayer={(uid) => {
                          const newData = {...data, bannedUsers: data.bannedUsers.filter(u=>u!==uid)};
                          updateCloud(newData);
                      }}
                  />
              )}
           </div>
       </main>

       <MobileNav view={currentView} setView={setCurrentView} />
       
       {showTour && <TourGuide setView={setCurrentView} onClose={() => { setShowTour(false); localStorage.setItem('dm_tour_completed', 'true'); }} />}
       {effectiveRole === 'dm' && !data.onboardingComplete && <OnboardingWizard onComplete={handleOnboardingComplete} aiHelper={queryAiService} />}
    </div>
  );
}

export default App;