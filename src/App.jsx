import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
import { collection, query, orderBy, limit, onSnapshot, addDoc, setDoc, deleteDoc, doc } from './firebase';
import Icon from './components/Icon';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Lobby from './components/Lobby';
import JournalView from './components/JournalView';
import SessionView from './components/SessionView';
import PartyView from './components/PartyView';
import SettingsView from './components/SettingsView';
import OnboardingWizard from './components/OnboardingWizard';
import WorldView from './components/WorldView';
import WorldCreator from './components/WorldCreator'; 
import NpcView from './components/NpcView';
import DiceOverlay from './components/DiceOverlay';
import HandoutEditor from './components/HandoutEditor';
import { useCharacterStore } from './stores/useCharacterStore'; 

const DB_INIT_DATA = { 
    hostId: null,
    dmIds: [], 
    locations: [], 
    npcs: [], 
    handouts: [],
    activeUsers: {}, 
    bannedUsers: [], 
    assignments: {}, 
    onboardingComplete: false, 
    config: { edition: '2014', strictMode: true }, 
    campaign: { 
        genesis: { tone: 'Heroic', conflict: 'Dragon vs Kingdom', campaignName: 'New Campaign' }, 
        activeMap: { url: null, revealPaths: [], tokens: [] }, 
        savedMaps: [],
        activeHandout: null, 
        location: "Start" 
    }
};

const INITIAL_APP_STATE = { ...DB_INIT_DATA, players: [], journal_pages: {}, chatLog: [] };

function App() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('session'); 
  const [gameParams, setGameParams] = useState(null); 
  const [data, setData] = useState(INITIAL_APP_STATE);
  const saveTimer = useRef(null);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);
  const [possessedNpcId, setPossessedNpcId] = useState(null);
  const [showHandout, setShowHandout] = useState(false);
  const [showHandoutCreator, setShowHandoutCreator] = useState(false);
  const [rollingDice, setRollingDice] = useState(null);
  const addLogEntry = useCharacterStore((state) => state.addLogEntry);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dm_api_key') || '');
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('dm_ai_provider') || 'puter');
  const [openAiModel, setOpenAiModel] = useState(() => localStorage.getItem('dm_openai_model') || 'gpt-4o');
  const [puterModel, setPuterModel] = useState(() => localStorage.getItem('dm_puter_model') || 'mistral-large-latest');

  useEffect(() => { localStorage.setItem('dm_api_key', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('dm_ai_provider', aiProvider); }, [aiProvider]);

  useEffect(() => {
    const unsub = fb.onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u && !gameParams) {
          const lastCode = localStorage.getItem('dm_last_code');
          if (lastCode) setGameParams({ code: lastCode, role: 'player', uid: u.uid, isOffline: false });
      }
    });
    return () => unsub();
  }, [gameParams]); 

  // --- SYNC ENGINE ---
  useEffect(() => {
      if (!gameParams) return;
      const { code, isOffline, uid } = gameParams;
      if (isOffline) {
          const local = localStorage.getItem('dm_local_data');
          setData(local ? JSON.parse(local) : INITIAL_APP_STATE);
          return;
      }
      const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
      const unsubRoot = onSnapshot(rootRef, (snap) => {
          if (snap.exists()) {
              const d = snap.data();
              if (d.bannedUsers?.includes(uid)) {
                  localStorage.removeItem('dm_last_code'); setGameParams(null); return;
              }
              setData(prev => ({ ...prev, ...d })); 
              if (d.campaign?.activeHandout && d.campaign.activeHandout.timestamp > (Date.now() - 5000)) setShowHandout(true);
          } else if (gameParams.role === 'dm') {
              fb.setDoc(rootRef, { ...DB_INIT_DATA, hostId: user?.uid, dmIds: [user?.uid] });
          } else {
              localStorage.removeItem('dm_last_code'); setGameParams(null);
          }
      });
      const playersRef = collection(rootRef, 'players');
      const unsubPlayers = onSnapshot(playersRef, (snap) => setData(prev => ({ ...prev, players: snap.docs.map(d => ({id: d.id, ...d.data()})) })));
      const journalRef = collection(rootRef, 'journal');
      const unsubJournal = onSnapshot(journalRef, (snap) => {
          const j = {}; snap.docs.forEach(d => { j[d.id] = {id: d.id, ...d.data()}; });
          setData(prev => ({ ...prev, journal_pages: j }));
      });
      const chatRef = query(collection(rootRef, 'chat'), orderBy('timestamp', 'asc'), limit(100));
      const unsubChat = onSnapshot(chatRef, (snap) => setData(prev => ({ ...prev, chatLog: snap.docs.map(d => ({id: d.id, ...d.data()})) })));

      if (user && !isOffline) fb.updateDoc(rootRef, { [`activeUsers.${user.uid}`]: user.email || "Anonymous" }).catch(console.error);
      return () => { unsubRoot(); unsubPlayers(); unsubJournal(); unsubChat(); };
  }, [gameParams]);

  const effectiveRole = (data && user && data.dmIds?.includes(user.uid)) ? 'dm' : 'player';

  // --- ACTIONS ---
  const savePlayer = async (player) => {
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'players', player.id.toString());
      await setDoc(ref, player, { merge: true });
  };
  const deletePlayer = async (playerId) => {
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'players', playerId.toString());
      await deleteDoc(ref);
  };
  const saveJournalEntry = async (pageId, pageData) => {
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId.toString());
      await setDoc(ref, pageData, { merge: true });
  };
  const deleteJournalEntryFunc = async (pageId) => {
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId.toString());
      await deleteDoc(ref);
  };
  const updateCloud = (newData, immediate = false) => {
      const { players, chatLog, journal_pages, ...rootData } = newData;
      setData(prev => ({ ...prev, ...rootData })); 
      if (gameParams?.isOffline) { localStorage.setItem('dm_local_data', JSON.stringify(newData)); return; }
      const doSave = () => {
          const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
          fb.setDoc(ref, rootData, { merge: true });
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) doSave(); else saveTimer.current = setTimeout(doSave, 1000); 
  };

  const updateMapState = (action, payload) => {
      const currentMap = data.campaign?.activeMap || { url: null, revealPaths: [], tokens: [] };
      const savedMaps = data.campaign?.savedMaps || [];
      let newMap = { ...currentMap };
      let newSavedMaps = [...savedMaps];

      if (action === 'set_image') { 
          if (newMap.url && !newSavedMaps.find(m => m.url === newMap.url)) {
             newSavedMaps.push({ id: Date.now(), name: `Map ${newSavedMaps.length + 1}`, url: newMap.url });
          }
          newMap.url = payload; newMap.revealPaths = []; 
      } else if (action === 'load_map') {
          newMap.url = payload.url; newMap.revealPaths = []; 
      } else if (action === 'start_path') { newMap.revealPaths = [...newMap.revealPaths, payload]; 
      } else if (action === 'append_point') {
          const lastPath = { ...newMap.revealPaths[newMap.revealPaths.length - 1] };
          lastPath.points = [...lastPath.points, payload];
          const newPaths = [...newMap.revealPaths];
          newPaths[newPaths.length - 1] = lastPath;
          newMap.revealPaths = newPaths;
      } else if (action === 'clear_fog') { newMap.revealPaths = []; }
      updateCloud({ ...data, campaign: { ...data.campaign, activeMap: newMap, savedMaps: newSavedMaps } });
  };

  const queryAiService = async (messages) => {
      const hasKey = aiProvider === 'puter' || apiKey;
      if (!hasKey) { alert("Error: No AI Provider set."); return "Config Error."; }
      try {
          if(aiProvider === 'puter') {
              if (!window.puter) throw new Error("Puter.js not loaded");
              if (!window.puter.auth.isSignedIn()) await window.puter.auth.signIn();
              const response = await window.puter.ai.chat(messages, { model: puterModel });
              return response?.message?.content;
          } else if(aiProvider === 'gemini') {
                const combined = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
                const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts:[{text:combined}]}]}) });
                const j = await r.json();
                return j.candidates?.[0]?.content?.parts?.[0]?.text;
          } else {
              const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model: openAiModel, messages: messages}) });
              const j = await r.json();
              return j.choices?.[0]?.message?.content;
          }
      } catch(e) { console.error(e); return "AI Error"; }
  };

  const getSenderName = () => possessedNpcId ? (data.npcs?.find(n => n.id === possessedNpcId)?.name + " (NPC)") : (data.players?.find(p => p.id === data.assignments?.[user?.uid])?.name || "User");
  const sendChatMessage = async (content, type = 'chat-public', targetId = null) => {
      if (!content.trim()) return;
      setIsLoading(true);
      const newMessage = { id: Date.now(), role: 'user', content, timestamp: Date.now(), senderId: user?.uid, senderName: getSenderName(), type, targetId };
      const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
      await addDoc(chatRef, newMessage);

      if (type === 'ai-public' || type === 'ai-private') {
          const aiRes = await queryAiService([{ role: "system", content: `Context: ${data.campaign.genesis.tone}. You are the Dungeon Master.` }, { role: "user", content }]);
          await addDoc(chatRef, { id: Date.now()+1, role: 'ai', content: aiRes, timestamp: Date.now(), senderId: 'system', senderName: 'DungeonMind', type, replyTo: user?.uid });
      }
      setIsLoading(false);
  };

  const handleDiceRoll = (d) => {
    return new Promise((resolve) => {
        setRollingDice(null);
        setTimeout(() => {
            const result = Math.floor(Math.random() * d) + 1;
            setRollingDice({ die: d, result, id: Date.now() });
            setShowTools(false); 
            setTimeout(() => {
                setDiceLog(prev => [{id: Date.now(), die: `d${d}`, result}, ...prev]);
                addLogEntry({ message: `<div class="font-bold text-white">Manual Roll</div><div class="text-xl text-amber-500 font-bold">d${d} -> ${result}</div>`, id: Date.now() });
                resolve(result); 
            }, 1000);
            setTimeout(() => { setRollingDice(null); }, 4000); 
        }, 50);
    });
  };

  const generateLoc = async (type, note) => {
      const res = await queryAiService([{role:'user', content:`Create Location JSON {name, type, desc} for ${type} ${note}`}]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };
  const generateNpc = async (name, ctx) => {
      const res = await queryAiService([{role:'user', content:`Create NPC JSON {name, race, class, quirk, stats} for ${name} ${ctx}`}]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };
  const handleHandoutSave = (h) => {
      const newH = [...(data.handouts||[])]; h.id ? newH[newH.findIndex(x=>x.id===h.id)] = h : newH.unshift({...h, id: Date.now()});
      updateCloud({...data, handouts:newH, campaign:{...data.campaign, activeHandout:h}}); setShowHandoutCreator(false);
  };

  if (!isAuthReady) return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Summoning DungeonMind...</div>;
  if (!gameParams || !data) return <Lobby fb={fb} user={user} onJoin={(c, r, u) => { localStorage.setItem('dm_last_code', c); setGameParams({code:c, role:r, isOffline:false, uid:u}) }} onOffline={() => setGameParams({code:'LOCAL', role:'dm', isOffline:true, uid:'admin'})} />;

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row bg-slate-900 text-slate-200 font-sans overflow-hidden">
       <Sidebar view={currentView} setView={setCurrentView} onExit={() => { localStorage.removeItem('dm_last_code'); setGameParams(null); setData(INITIAL_APP_STATE); }} />
       <main className="flex-1 flex flex-col overflow-hidden relative w-full h-full">
           <div className="shrink-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 pt-safe z-50">
               <div className="h-14 flex items-center justify-between px-4">
                   <div className="flex gap-2 items-center">
                       <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] ${gameParams?.isOffline ? 'bg-slate-500' : 'bg-green-500'}`}></div>
                       <span className="text-sm font-bold text-amber-500 truncate fantasy-font tracking-wide">{gameParams?.code} • {possessedNpcId ? "POSSESSING NPC" : data?.campaign?.location}</span>
                   </div>
                   <div className="flex gap-2">
                       {effectiveRole === 'dm' && <button onClick={() => setShowHandoutCreator(true)} className="text-xs bg-amber-900/50 hover:bg-amber-800 px-3 py-1 rounded border border-amber-800 text-amber-200 flex items-center gap-2"><Icon name="scroll" size={14}/> <span>Handout</span></button>}
                       <button onClick={() => {}} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1 rounded flex items-center gap-2 text-slate-300 hover:text-white"><Icon name="save" size={14}/> Log</button>
                   </div>
               </div>
           </div>

           <div className="flex-1 overflow-hidden relative p-0 md:p-0">
              {currentView === 'session' && <SessionView data={data} chatLog={data.chatLog} inputText={inputText} setInputText={setInputText} onSendMessage={sendChatMessage} onEditMessage={()=>{}} onDeleteMessage={()=>{}} isLoading={isLoading} role={effectiveRole} user={user} showTools={showTools} setShowTools={setShowTools} diceLog={diceLog} handleDiceRoll={handleDiceRoll} />}
              {currentView === 'journal' && <JournalView data={data} role={effectiveRole} userId={user?.uid} onSavePage={saveJournalEntry} onDeletePage={deleteJournalEntryFunc} aiHelper={queryAiService} />}
              
              {/* ATLAS VIEW */}
              {currentView === 'atlas' && (
                  <WorldCreator 
                      data={data} 
                      setData={setData} 
                      role={effectiveRole} 
                      updateCloud={updateCloud} 
                      updateMapState={updateMapState} 
                      aiHelper={queryAiService} 
                      apiKey={apiKey} 
                  />
              )}
              
              {/* MAP VIEW */}
              {currentView === 'map' && <WorldView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} updateMapState={updateMapState} onDiceRoll={handleDiceRoll} user={user} apiKey={apiKey} />}
              
              {currentView === 'party' && <PartyView data={data} role={effectiveRole} activeChar={data.assignments?.[user?.uid]} updateCloud={updateCloud} savePlayer={savePlayer} deletePlayer={deletePlayer} setView={setCurrentView} user={user} aiHelper={queryAiService} onDiceRoll={handleDiceRoll} apiKey={apiKey} edition={data.config?.edition} />}
              
              {/* FIXED: PASSING onDiceRoll HANDLER */}
              {currentView === 'npcs' && <NpcView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateNpc={generateNpc} setChatInput={setInputText} setView={setCurrentView} onPossess={setPossessedNpcId} aiHelper={queryAiService} apiKey={apiKey} edition={data.config?.edition} onDiceRoll={handleDiceRoll} />}
              
              {currentView === 'settings' && <SettingsView data={data} setData={setData} apiKey={apiKey} setApiKey={setApiKey} role={effectiveRole} updateCloud={updateCloud} code={gameParams.code} user={user} onExit={() => { setGameParams(null); }} aiProvider={aiProvider} setAiProvider={setAiProvider} openAiModel={openAiModel} setOpenAiModel={setOpenAiModel} puterModel={puterModel} setPuterModel={setPuterModel} banPlayer={()=>{}} kickPlayer={()=>{}} unbanPlayer={()=>{}} />}
           </div>
       </main>
       
       {showHandoutCreator && <HandoutEditor savedHandouts={data.handouts || []} onSave={handleHandoutSave} onCancel={() => setShowHandoutCreator(false)} />}
       {showHandout && data.campaign?.activeHandout && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowHandout(false)}><div className="p-8 max-w-2xl w-full bg-white text-black rounded relative" onClick={e=>e.stopPropagation()}><div dangerouslySetInnerHTML={{__html: data.campaign.activeHandout.content}} /></div></div>}
       <div className="fixed inset-0 pointer-events-none z-[99999]">{rollingDice && <DiceOverlay roll={rollingDice} />}</div>
       <MobileNav view={currentView} setView={setCurrentView} />
       {effectiveRole === 'dm' && !data.onboardingComplete && <OnboardingWizard onComplete={() => updateCloud({...data, onboardingComplete:true})} aiHelper={queryAiService} />}
    </div>
  );
}
export default App;