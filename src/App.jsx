import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
import { deleteField } from './firebase';
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
import WorldView from './components/WorldView';
import NpcView from './components/NpcView';
import MapBoard from './components/MapBoard'; 
import DiceOverlay from './components/DiceOverlay';

const DEFAULT_DATA = { 
    hostId: null,
    journal_pages: {}, 
    chatLog: [], // NEW: Persistent Chat
    players: [], 
    locations: [], 
    npcs: [], 
    activeUsers: {}, 
    bannedUsers: [], 
    assignments: {}, 
    onboardingComplete: false, 
    config: { edition: '2014', strictMode: true }, 
    campaign: { 
        genesis: { tone: 'Heroic', conflict: 'Dragon vs Kingdom', campaignName: 'New Campaign' }, 
        activeMap: { url: null, revealPaths: [] }, 
        activeHandout: null, 
        location: "Start" 
    }
};

// --- HELPER: Strip HTML & Limit Size ---
const cleanText = (html) => {
   const tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
};

function App() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('session'); 
  const [gameParams, setGameParams] = useState(null); 
  const [data, setData] = useState(null);
  const saveTimer = useRef(null);

  // States
  const [showTour, setShowTour] = useState(false);
  // Removed local chatHistory state, using data.chatLog now
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);
  const [possessedNpcId, setPossessedNpcId] = useState(null);
  const [showHandout, setShowHandout] = useState(false);
  const [rollingDice, setRollingDice] = useState(null);

  // AI Config
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dm_api_key') || '');
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('dm_ai_provider') || 'puter');
  const [openAiModel, setOpenAiModel] = useState(() => localStorage.getItem('dm_openai_model') || 'gpt-4o');
  const [puterModel, setPuterModel] = useState(() => localStorage.getItem('dm_puter_model') || 'mistral-large-latest');

  useEffect(() => { localStorage.setItem('dm_api_key', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('dm_ai_provider', aiProvider); }, [aiProvider]);
  useEffect(() => { localStorage.setItem('dm_openai_model', openAiModel); }, [openAiModel]);
  useEffect(() => { localStorage.setItem('dm_puter_model', puterModel); }, [puterModel]);

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

  // Data Sync
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
              if (!d.chatLog) d.chatLog = []; // Ensure chatLog exists
              if (!d.journal_pages) d.journal_pages = {};
              if (!d.savedSessions) d.savedSessions = [];
              if (!d.players) d.players = [];
              if (!d.npcs) d.npcs = [];
              if (!d.activeUsers) d.activeUsers = {};
              if (!d.campaign) d.campaign = DEFAULT_DATA.campaign;
              if (!d.campaign.activeMap) d.campaign.activeMap = { url: null, revealPaths: [] };
              
              setData(d);

              if (d.campaign.activeHandout && d.campaign.activeHandout.timestamp > (Date.now() - 5000)) {
                  setShowHandout(true);
              }
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

  const updateCloud = (newData, immediate = false) => {
      setData(newData);
      if (gameParams?.isOffline) {
          localStorage.setItem('dm_local_data', JSON.stringify(newData));
          return;
      }
      
      const doSave = () => {
          const ref = fb.doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
          fb.setDoc(ref, newData, { merge: true });
      };

      if (saveTimer.current) clearTimeout(saveTimer.current);
      
      if (immediate) {
          doSave(); 
      } else {
          saveTimer.current = setTimeout(doSave, 1000); 
      }
  };

  const deleteJournalEntry = async (id) => {
      const newPages = { ...data.journal_pages };
      delete newPages[id];
      const cleanData = { ...data, journal_pages: newPages };
      setData(cleanData); 

      if (gameParams?.isOffline) {
          localStorage.setItem('dm_local_data', JSON.stringify(cleanData));
          return;
      }

      const ref = fb.doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
      try {
          await fb.updateDoc(ref, {
              [`journal_pages.${id}`]: deleteField()
          });
      } catch (e) {
          console.error("Delete failed:", e);
          alert("Failed to delete journal from cloud.");
      }
  };

  const updateMapState = (action, payload) => {
      const currentMap = data.campaign?.activeMap || { url: null, revealPaths: [] };
      let newMap = { ...currentMap };

      if (action === 'set_image') { newMap.url = payload; newMap.revealPaths = []; } 
      else if (action === 'start_path') { newMap.revealPaths = [...newMap.revealPaths, payload]; } 
      else if (action === 'append_point') {
          const lastPath = { ...newMap.revealPaths[newMap.revealPaths.length - 1] };
          lastPath.points = [...lastPath.points, payload];
          const newPaths = [...newMap.revealPaths];
          newPaths[newPaths.length - 1] = lastPath;
          newMap.revealPaths = newPaths;
      } else if (action === 'clear_fog') { newMap.revealPaths = []; }

      const newData = { ...data, campaign: { ...data.campaign, activeMap: newMap } };
      setData(newData);
      
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
          const ref = fb.doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
          fb.updateDoc(ref, { 'campaign.activeMap': newMap });
      }, 500);
  };

  // --- AI SERVICE WRAPPER ---
  const queryAiService = async (messages) => {
      const hasKey = aiProvider === 'puter' || apiKey;
      if (!hasKey) {
          alert("Error: No AI Provider set. Go to Settings.");
          return "Configuration Error: No AI Key.";
      }
      
      let attempts = 0; 
      const maxRetries = 2; 

      while(attempts < maxRetries) {
          try {
              attempts++;
              if(aiProvider === 'puter') {
                  if (!window.puter) throw new Error("Puter.js not loaded");
                  if (!window.puter.auth.isSignedIn()) await window.puter.auth.signIn();
                  const safeModel = puterModel || 'mistral-large-latest';
                  const response = await window.puter.ai.chat(messages, { model: safeModel });
                  if (!response || !response.message || !response.message.content) throw new Error("Invalid response structure from Puter AI");
                  return response.message.content;
              } else if(aiProvider === 'gemini') {
                   const combinedPrompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
                   const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts:[{text:combinedPrompt}]}]}) });
                   if(!r.ok) throw new Error(`Gemini Error ${r.status}`);
                   const j = await r.json();
                   return j.candidates?.[0]?.content?.parts?.[0]?.text;
              } else {
                  const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model: openAiModel, messages: messages}) });
                  if(!r.ok) throw new Error(`OpenAI Error ${r.status}`);
                  const j = await r.json();
                  return j.choices?.[0]?.message?.content;
              }
          } catch(e) { 
              console.error(e); 
              if(attempts === maxRetries) {
                  alert("AI Error: " + (e.message || e));
                  return "System Error.";
              }
              await new Promise(res => setTimeout(res, 1000));
          }
      }
  };

  // --- NEW: CENTRALIZED MESSAGE SENDER ---
  const sendChatMessage = async (content, type = 'chat-public', targetId = null) => {
      if (!content.trim()) return;
      setIsLoading(true);

      const newMessage = {
          id: Date.now(),
          role: 'user',
          content: content,
          timestamp: Date.now(),
          senderId: user?.uid,
          senderName: user?.email.split('@')[0],
          type: type, // 'chat-public', 'chat-private', 'ai-public', 'ai-private'
          targetId: targetId
      };

      // 1. Add User Message to Cloud
      let currentLog = [...(data.chatLog || [])];
      currentLog.push(newMessage);
      
      // We optimize local update for speed, then cloud
      const updatedData = { ...data, chatLog: currentLog };
      setData(updatedData);
      updateCloud(updatedData, true);

      // 2. Handle AI Logic
      if (type === 'ai-public' || type === 'ai-private') {
          // Construct Context
          const genesis = data.campaign?.genesis || {};
          const derivedCharId = data.assignments?.[user?.uid];
          const char = data.players.find(p => p.id === derivedCharId);
          const iden = effectiveRole === 'dm' ? "DM" : (char ? `${char.name} (${char.race})` : "Player");
          
          let partyContext = "";
          if (effectiveRole === 'dm') {
              partyContext = data.players.map(p => `${p.name} (${p.race} ${p.class})`).join(' | ');
          } else {
              partyContext = `Me: ${char ? char.name : "Spectator"}. Party: ${data.players.map(p => p.name).join(', ')}`;
          }

          const loreContext = genesis.loreText || "Generic Fantasy";
          const recentChat = currentLog.slice(-10).map(m => `${m.senderName}: ${m.content}`).join('\n');

          const systemPrompt = `
          Role: Dungeon Master. User: ${iden}.
          World: ${genesis.tone}. Context: ${loreContext}.
          Location: ${data.campaign.location}.
          Party: ${partyContext}.
          Recent Log: ${recentChat}.
          Action: Respond to "${content}".
          `;

          const aiRes = await queryAiService([{ role: "system", content: systemPrompt }, { role: "user", content: content }]);
          
          const aiMessage = {
              id: Date.now() + 1,
              role: 'ai',
              content: aiRes || "AI Error",
              timestamp: Date.now(),
              senderId: 'system',
              senderName: 'DungeonMind',
              type: type // matches user intention (public vs private)
          };

          currentLog.push(aiMessage);
          const finalData = { ...data, chatLog: currentLog };
          setData(finalData);
          updateCloud(finalData, true);
      }

      setIsLoading(false);
  };

  const generateRecap = async () => { /* ... existing logic using chatLog instead of chatHistory ... */ };

  // --- UPDATED DICE LOGIC ---
  // Now puts text into box instead of auto-sending
  const handleDiceRoll = (d) => {
    const result = Math.floor(Math.random() * d) + 1;
    const rollId = Date.now();
    setRollingDice({ die: d, result, id: rollId });
    setShowTools(false); 

    setTimeout(() => {
        setDiceLog(prev => [{id: rollId, die: `d${d}`, result}, ...prev]);
        
        // NEW BEHAVIOR: Populate Input Box
        if (d === 20 && result === 20) {
            setInputText(prev => prev + `[NATURAL 20!] I critically hit! `);
        } else if (d === 20 && result === 1) {
            setInputText(prev => prev + `[NATURAL 1] Critical failure! `);
        } else {
            // Optional: for normal rolls, maybe just log it or add small text?
            // For now, let's just log normal rolls to system chat
            const sysMsg = {
                id: Date.now(), role: 'system', content: `Rolled d${d}: **${result}**`,
                timestamp: Date.now(), senderId: 'system', type: 'chat-public'
            };
            const nd = { ...data, chatLog: [...(data.chatLog||[]), sysMsg] };
            updateCloud(nd, true);
        }
        setTimeout(() => setRollingDice(null), 1000); 
    }, 1000);
  };

  // ... [Rest of render logic] ...
  
  if (!isAuthReady) return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Summoning DungeonMind...</div>;

  if (!gameParams || !data) {
      return <Lobby fb={fb} user={user} onJoin={(code, role, uid) => { localStorage.setItem('dm_last_code', code); setGameParams({code, role, isOffline:false, uid}) }} onOffline={() => setGameParams({code:'LOCAL', role:'dm', isOffline:true, uid: 'local-admin'})} />;
  }

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-200 overflow-hidden font-sans">
       <Sidebar view={currentView} setView={setCurrentView} onExit={() => { localStorage.removeItem('dm_last_code'); setGameParams(null); setData(null); }} />
       
       <main className="flex-1 h-full overflow-hidden relative w-full flex flex-col mb-16 md:mb-0">
           {/* Header */}
           <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/90 backdrop-blur shrink-0">
               <div className="flex gap-2 items-center">
                   <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] ${gameParams?.isOffline ? 'bg-slate-500' : 'bg-green-500'}`}></div>
                   <span className="text-sm font-bold text-amber-500 truncate fantasy-font tracking-wide">
                       {gameParams?.code} • {possessedNpcId ? `POSSESSING: ${data.npcs.find(n=>n.id===possessedNpcId)?.name}` : (data?.campaign?.location || "Unknown")}
                   </span>
               </div>
               <div className="flex gap-2">
                   {/* ... [Header Buttons] ... */}
                   <button onClick={() => updateCloud({...data}, true)} className="text-xs bg-slate-800 px-3 py-1 rounded hover:text-white"><Icon name="refresh-ccw" size={14}/> Sync</button>
               </div>
           </div>

           <div className="flex-1 overflow-hidden relative p-0 md:p-0">
              {currentView === 'session' && (
                  <SessionView 
                      data={data}
                      // Pass chatLog from data now
                      chatLog={data.chatLog || []} 
                      inputText={inputText}
                      setInputText={setInputText}
                      onSendMessage={sendChatMessage}
                      isLoading={isLoading}
                      role={effectiveRole}
                      user={user} // Needed for filtering
                      activeChar={data.assignments?.[user?.uid]}
                      showTools={showTools}
                      setShowTools={setShowTools}
                      diceLog={diceLog}
                      handleDiceRoll={handleDiceRoll}
                      possessedNpcId={possessedNpcId}
                  />
              )}
              {currentView === 'journal' && <JournalView data={data} setData={setData} updateCloud={updateCloud} role={effectiveRole} updateJournalField={()=>{}} userId={user?.uid} aiHelper={queryAiService} deleteJournalEntry={deleteJournalEntry} />}
              {currentView === 'world' && <WorldView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateLoc={generateLoc} updateMapState={updateMapState} />}
              {currentView === 'party' && <PartyView data={data} setData={setData} role={effectiveRole} activeChar={data.assignments?.[user?.uid]} updateCloud={updateCloud} />}
              {currentView === 'npcs' && <NpcView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateNpc={generateNpc} setChatInput={setInputText} setView={setCurrentView} onPossess={(id) => { setPossessedNpcId(id); setCurrentView('session'); }} />}
              {currentView === 'settings' && <SettingsView data={data} setData={setData} apiKey={apiKey} setApiKey={setApiKey} role={effectiveRole} updateCloud={updateCloud} code={gameParams.code} user={user} onExit={() => { localStorage.removeItem('dm_last_code'); setGameParams(null); setData(null); }} aiProvider={aiProvider} setAiProvider={setAiProvider} openAiModel={openAiModel} setOpenAiModel={setOpenAiModel} puterModel={puterModel} setPuterModel={setPuterModel} banPlayer={(uid) => { if(!confirm("Ban?")) return; const nd = {...data, activeUsers: {...data.activeUsers}, bannedUsers: [...(data.bannedUsers||[]), uid]}; delete nd.activeUsers[uid]; updateCloud(nd, true); }} kickPlayer={(uid) => { const nd = {...data, activeUsers: {...data.activeUsers}}; delete nd.activeUsers[uid]; updateCloud(nd, true); }} unbanPlayer={(uid) => { const nd = {...data, bannedUsers: data.bannedUsers.filter(u=>u!==uid)}; updateCloud(nd, true); }} />}
           </div>
       </main>

       {showHandout && data.campaign?.activeHandout && (
           <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowHandout(false)}>
               <div className="parchment-modal p-8 max-w-lg w-full rounded-lg text-center transform scale-100 animate-in zoom-in duration-300 relative" onClick={e => e.stopPropagation()}>
                   <button onClick={() => setShowHandout(false)} className="absolute top-2 right-2 text-slate-800/50 hover:text-slate-800"><Icon name="x" size={24}/></button>
                   <h2 className="text-3xl mb-4 font-bold opacity-80">Notice</h2>
                   <div className="text-xl leading-relaxed whitespace-pre-wrap">{data.campaign.activeHandout.text}</div>
               </div>
           </div>
       )}

       {rollingDice && <DiceOverlay roll={rollingDice} />}

       <MobileNav view={currentView} setView={setCurrentView} />
       {showTour && <TourGuide setView={setCurrentView} onClose={() => { setShowTour(false); localStorage.setItem('dm_tour_completed', 'true'); }} />}
       {effectiveRole === 'dm' && !data.onboardingComplete && <OnboardingWizard onComplete={handleOnboardingComplete} aiHelper={queryAiService} />}
    </div>
  );
}

export default App;
