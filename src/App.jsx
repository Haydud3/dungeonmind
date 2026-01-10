import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
import { deleteField, collection, query, orderBy, limit, onSnapshot, addDoc, setDoc, deleteDoc, doc } from './firebase';
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
import DiceOverlay from './components/DiceOverlay';
import HandoutEditor from './components/HandoutEditor';
import { useCharacterStore } from './stores/useCharacterStore'; 

// --- DATABASE CONFIG (CLEAN) ---
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
        activeMap: { url: null, revealPaths: [] }, 
        activeHandout: null, 
        location: "Start" 
    }
};

// --- APP STATE (SAFE) ---
const INITIAL_APP_STATE = {
    ...DB_INIT_DATA,
    players: [],
    journal_pages: {},
    chatLog: []
};

const cleanText = (html) => {
   const tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   let text = (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
   return text.replace(/kill/gi, "defeat").replace(/murder/gi, "eliminate");
};

function App() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('session'); 
  const [gameParams, setGameParams] = useState(null); 
  const [data, setData] = useState(INITIAL_APP_STATE);
  const saveTimer = useRef(null);

  const [showTour, setShowTour] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);
  const [possessedNpcId, setPossessedNpcId] = useState(null);
  const [showHandout, setShowHandout] = useState(false);
  const [showHandoutCreator, setShowHandoutCreator] = useState(false);
  const [rollingDice, setRollingDice] = useState(null);

  // Access the Toast store action
  const addLogEntry = useCharacterStore((state) => state.addLogEntry);

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
          if (lastCode) {
              // Optimistically try to join, Sync Engine will validate existence
              setGameParams({ code: lastCode, role: 'player', uid: u.uid, isOffline: false });
          }
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

      // Root Listener
      const rootRef = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', code);
      const unsubRoot = onSnapshot(rootRef, (snap) => {
          if (snap.exists()) {
              const d = snap.data();
              if (d.bannedUsers?.includes(uid)) {
                  alert("You have been banned.");
                  localStorage.removeItem('dm_last_code'); // Ensure banned user doesn't loop
                  setGameParams(null);
                  return;
              }
              setData(prev => ({ ...prev, ...d })); 
              
              if (d.campaign?.activeHandout && d.campaign.activeHandout.timestamp > (Date.now() - 5000)) {
                  setShowHandout(true);
              }
          } else if (gameParams.role === 'dm') {
              // Creating new campaign
              fb.setDoc(rootRef, { ...DB_INIT_DATA, hostId: user?.uid, dmIds: [user?.uid] });
          } else {
              // --- FIX: CAMPAIGN NOT FOUND LOGIC ---
              console.warn(`Campaign ${code} does not exist. Cleaning up.`);
              localStorage.removeItem('dm_last_code'); // Remove invalid code so it doesn't auto-join next time
              setGameParams(null); // Return to Lobby
          }
      }, (err) => {
          console.error("Sync Error:", err);
          if (err.code === 'permission-denied') {
              alert("Access Denied.");
              localStorage.removeItem('dm_last_code');
              setGameParams(null);
          }
      });

      // Subcollection Listeners
      const playersRef = collection(rootRef, 'players');
      const unsubPlayers = onSnapshot(playersRef, (snap) => {
          const playerList = snap.docs.map(d => ({id: d.id, ...d.data()}));
          setData(prev => ({ ...prev, players: playerList }));
      });

      const journalRef = collection(rootRef, 'journal');
      const unsubJournal = onSnapshot(journalRef, (snap) => {
          const journalObj = {};
          snap.docs.forEach(d => { journalObj[d.id] = {id: d.id, ...d.data()}; });
          setData(prev => ({ ...prev, journal_pages: journalObj }));
      });

      const chatRef = query(collection(rootRef, 'chat'), orderBy('timestamp', 'asc'), limit(100));
      const unsubChat = onSnapshot(chatRef, (snap) => {
          const messages = snap.docs.map(d => ({id: d.id, ...d.data()}));
          setData(prev => ({ ...prev, chatLog: messages }));
      });

      if (user && !isOffline) {
          fb.updateDoc(rootRef, { [`activeUsers.${user.uid}`]: user.email || "Anonymous" }).catch(console.error);
      }

      return () => { unsubRoot(); unsubPlayers(); unsubJournal(); unsubChat(); };
  }, [gameParams]);

  const effectiveRole = (data && user && data.dmIds?.includes(user.uid)) ? 'dm' : 'player';

  // --- SUBCOLLECTION HELPERS ---
  const savePlayer = async (player) => {
      if(!gameParams) return;
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

      if (gameParams?.isOffline) {
          localStorage.setItem('dm_local_data', JSON.stringify(newData));
          return;
      }
      
      const doSave = () => {
          const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);
          fb.setDoc(ref, rootData, { merge: true });
      };

      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) doSave(); else saveTimer.current = setTimeout(doSave, 1000); 
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
      updateCloud(newData);
  };

  const queryAiService = async (messages, allowRetry = true) => {
      const hasKey = aiProvider === 'puter' || apiKey;
      if (!hasKey) { alert("Error: No AI Provider set."); return "Config Error."; }
      
      let attempts = 0; 
      const maxRetries = 2; 

      while(attempts < maxRetries) {
          try {
              attempts++;
              let responseText = "";

              if(aiProvider === 'puter') {
                  if (!window.puter) throw new Error("Puter.js not loaded");
                  if (!window.puter.auth.isSignedIn()) await window.puter.auth.signIn();
                  const safeModel = puterModel || 'mistral-large-latest';
                  const response = await window.puter.ai.chat(messages, { model: safeModel });
                  responseText = response?.message?.content;
              } else if(aiProvider === 'gemini') {
                   const combined = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
                   const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts:[{text:combined}]}]}) });
                   if(!r.ok) throw new Error(`Gemini Error ${r.status}`);
                   const j = await r.json();
                   responseText = j.candidates?.[0]?.content?.parts?.[0]?.text;
              } else {
                  const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model: openAiModel, messages: messages}) });
                  if(!r.ok) throw new Error(`OpenAI Error ${r.status}`);
                  const j = await r.json();
                  responseText = j.choices?.[0]?.message?.content;
              }
              return responseText;

          } catch(e) { 
              const errObj = e.response || e;
              const errStr = typeof errObj === 'object' ? JSON.stringify(errObj) : String(errObj);
              console.error(`AI Attempt ${attempts} Failed:`, errStr);

              if (errStr.includes("moderation") || errStr.includes("422")) {
                  if (allowRetry) {
                      const lastMsg = messages[messages.length - 1];
                      return await queryAiService([{ role: 'user', content: lastMsg.content }], false);
                  }
                  return "⚠️ AI Safety Filter: Content rejected.";
              }
              if(attempts === maxRetries) return "AI Error: " + errStr.slice(0, 100); 
              await new Promise(res => setTimeout(res, 1000));
          }
      }
  };

  const getSenderName = () => {
      if (effectiveRole === 'dm') return "Dungeon Master";
      if (possessedNpcId) {
          const npc = data.npcs?.find(n => n.id === possessedNpcId);
          return npc ? `${npc.name} (NPC)` : "Unknown NPC";
      }
      const charId = data.assignments?.[user?.uid];
      const char = data.players?.find(p => p.id === charId);
      return char ? char.name : (user?.email?.split('@')[0] || "Spectator");
  };

  const buildSmartContext = (userMessage, players) => {
      let context = "--- ACTIVE ROSTER (Identity Map) ---\n";
      const relevantPlayers = [];
      const msgLower = userMessage.toLowerCase();
      const forceAll = msgLower.includes("/party") || msgLower.includes("everyone") || msgLower.includes("all characters");

      players.forEach(p => {
          // Explicit mapping for the AI
          const alias = p.alias || "None";
          context += `• ${p.name} (Alias/Player: "${alias}") | ${p.race} ${p.class} Lvl ${p.level} | HP: ${p.hp?.current}/${p.hp?.max}\n`;

          // Check if message matches Name OR Alias
          if (forceAll || msgLower.includes(p.name.toLowerCase()) || (p.alias && msgLower.includes(p.alias.toLowerCase()))) {
              relevantPlayers.push(p);
          }
      });

      if (relevantPlayers.length > 0) {
          context += "\n--- DETAILED SHEETS (Relevant to Query) ---\n";
          relevantPlayers.forEach(p => {
              const { image, ...leanPlayer } = p; 
              context += JSON.stringify(leanPlayer, null, 2) + "\n\n";
          });
      }

      return context;
  };

  const sendChatMessage = async (content, type = 'chat-public', targetId = null, contextMode = 'fast') => {
      if (!content.trim()) return;
      setIsLoading(true);

      const newMessage = {
          id: Date.now(),
          role: 'user',
          content: content,
          timestamp: Date.now(),
          senderId: user?.uid,
          senderName: getSenderName(),
          type: type, 
          targetId: targetId
      };

      const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
      await addDoc(chatRef, newMessage);

      if (type === 'ai-public' || type === 'ai-private') {
          const accessiblePages = Object.values(data.journal_pages || {}).filter(p => p.isPublic || p.ownerId === user?.uid);
          const journalContext = accessiblePages.map(p => `[${p.title}]: ${cleanText(p.content)}`).join('\n').slice(-4000); 
          const partyContext = buildSmartContext(content, data.players);

          const systemPrompt = `Role: DM AI. Context: ${data.campaign.genesis.tone}. ${partyContext} JOURNAL: ${journalContext}.`;
          
          const aiRes = await queryAiService([{ role: "system", content: systemPrompt }, { role: "user", content: content }]);
          
          const aiMessage = {
              id: Date.now() + 1,
              role: 'ai',
              content: aiRes || "...",
              timestamp: Date.now(),
              senderId: 'system',
              senderName: 'DungeonMind',
              type: type,
              replyTo: user?.uid
          };
          await addDoc(chatRef, aiMessage);
      }
      setIsLoading(false);
  };

  const editChatMessage = async (msgId, newContent) => {
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', msgId);
      await setDoc(ref, { content: newContent }, { merge: true });
  };

  const deleteChatMessage = async (msgId) => {
      if(!confirm("Delete?")) return;
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', msgId);
      await deleteDoc(ref);
  };

  const clearChat = async () => {
      if(!confirm("Clear Chat?")) return;
      const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
      data.chatLog.forEach(async msg => await deleteDoc(doc(chatRef, msg.id)));
  };

  const handleSaveToJournal = () => {
      const log = (data.chatLog || []).map(m => `<p><b>${m.senderName}:</b> ${m.content}</p>`).join("");
      const newId = Date.now().toString();
      const newPage = { id: newId, title: `Log ${new Date().toLocaleDateString()}`, content: log, ownerId: user?.uid, isPublic: true, created: Date.now() };
      saveJournalEntry(newId, newPage);
      alert("Saved to Journal!");
  };

  const saveMessageToJournal = (msgContent) => {
      const title = prompt("Entry Title:", "Log Entry");
      if (!title) return;
      const newId = Date.now().toString();
      const newPage = { id: newId, title, content: `<p>${msgContent}</p>`, ownerId: user?.uid, isPublic: true, created: Date.now() };
      saveJournalEntry(newId, newPage);
      alert("Saved to Journal!");
  };

  const handleDiceRoll = (d) => {
    return new Promise((resolve) => {
        setRollingDice(null);
        setTimeout(() => {
            const result = Math.floor(Math.random() * d) + 1;
            const rollId = Date.now();
            setRollingDice({ die: d, result, id: rollId });
            setShowTools(false); 
            setTimeout(() => {
                setDiceLog(prev => [{id: rollId, die: `d${d}`, result}, ...prev]);
                if (d===20 && (result===20 || result===1)) {
                    setInputText(prev => prev + `[${result===20 ? "CRIT!" : "FAIL!"}] `);
                } else {
                    sendChatMessage(`Rolled d${d}: **${result}**`, 'system');
                }
                
                addLogEntry({
                    message: `<div class="font-bold text-white">Manual Roll</div><div class="text-xl text-amber-500 font-bold">d${d} -> ${result}</div>`,
                    id: rollId
                });

                resolve(result); 
            }, 1000);
            setTimeout(() => { setRollingDice(null); }, 4000); 
        }, 50);
    });
  };

  const generateRecap = () => alert("Feature coming to subcollections soon.");
  const generateNpc = async (name, ctx) => {
      const res = await queryAiService([{role:'user', content:`Create NPC JSON {name, race, class, quirk, stats} for ${name} ${ctx}`}]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };
  const generateLoc = async (type, note) => {
      const res = await queryAiService([{role:'user', content:`Create Location JSON {name, type, desc} for ${type} ${note}`}]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };
  const handleOnboardingComplete = (data) => updateCloud({...data, onboardingComplete:true, campaign:{...data.campaign, genesis:data}});
  const handleHandoutSave = (h) => {
      const newH = [...(data.handouts||[])];
      if(!h.id) h.id = Date.now();
      const idx = newH.findIndex(x=>x.id===h.id);
      if(idx>=0) newH[idx]=h; else newH.unshift(h);
      updateCloud({...data, handouts:newH, campaign:{...data.campaign, activeHandout:h}});
      setShowHandoutCreator(false);
  };
  const handleHandoutDelete = (id) => updateCloud({...data, handouts:data.handouts.filter(h=>h.id!==id)});
  const closeHandoutViewer = () => setShowHandout(false);

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
                       <span className="text-sm font-bold text-amber-500 truncate fantasy-font tracking-wide">
                           {gameParams?.code} • {possessedNpcId ? `POSSESSING: ${data.npcs?.find(n=>n.id===possessedNpcId)?.name || 'NPC'}` : (data?.campaign?.location || "Unknown")}
                       </span>
                   </div>
                   <div className="flex gap-2">
                       {effectiveRole === 'dm' && <button onClick={() => setShowHandoutCreator(true)} className="text-xs bg-amber-900/50 hover:bg-amber-800 px-3 py-1 rounded border border-amber-800 text-amber-200 flex items-center gap-2"><Icon name="scroll" size={14}/> <span>Handout</span></button>}
                       {possessedNpcId && <button onClick={() => setPossessedNpcId(null)} className="text-xs bg-red-900/80 text-white px-3 py-1 rounded">End Possession</button>}
                       <button onClick={handleSaveToJournal} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1 rounded flex items-center gap-2 text-slate-300 hover:text-white"><Icon name="save" size={14}/> Save Log</button>
                   </div>
               </div>
           </div>

           <div className="flex-1 overflow-hidden relative p-0 md:p-0">
              {currentView === 'session' && <SessionView data={data} chatLog={data.chatLog} inputText={inputText} setInputText={setInputText} onSendMessage={sendChatMessage} onEditMessage={editChatMessage} onDeleteMessage={deleteChatMessage} isLoading={isLoading} role={effectiveRole} user={user} saveMessageToJournal={saveMessageToJournal} clearChat={clearChat} showTools={showTools} setShowTools={setShowTools} diceLog={diceLog} handleDiceRoll={handleDiceRoll} possessedNpcId={possessedNpcId} />}
              {currentView === 'journal' && <JournalView data={data} role={effectiveRole} userId={user?.uid} onSavePage={saveJournalEntry} onDeletePage={deleteJournalEntryFunc} aiHelper={queryAiService} />}
              {currentView === 'world' && <WorldView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateLoc={generateLoc} updateMapState={updateMapState} />}
              {currentView === 'party' && <PartyView data={data} role={effectiveRole} activeChar={data.assignments?.[user?.uid]} updateCloud={updateCloud} savePlayer={savePlayer} deletePlayer={deletePlayer} setInputText={setInputText} setView={setCurrentView} user={user} aiHelper={queryAiService} onDiceRoll={handleDiceRoll} onLogAction={(msg) => sendChatMessage(msg, 'system')} edition={data.config?.edition || '2014'} />}
              {currentView === 'npcs' && <NpcView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateNpc={generateNpc} setChatInput={setInputText} setView={setCurrentView} onPossess={(id) => { setPossessedNpcId(id); setCurrentView('session'); }} />}
              {currentView === 'settings' && <SettingsView data={data} setData={setData} apiKey={apiKey} setApiKey={setApiKey} role={effectiveRole} updateCloud={updateCloud} code={gameParams.code} user={user} onExit={() => { setGameParams(null); }} aiProvider={aiProvider} setAiProvider={setAiProvider} openAiModel={openAiModel} setOpenAiModel={setOpenAiModel} puterModel={puterModel} setPuterModel={setPuterModel} banPlayer={()=>{}} kickPlayer={()=>{}} unbanPlayer={()=>{}} />}
           </div>
       </main>
       
       {showHandoutCreator && <HandoutEditor savedHandouts={data.handouts || []} onSave={handleHandoutSave} onDelete={handleHandoutDelete} onCancel={() => setShowHandoutCreator(false)} />}
       {showHandout && data.campaign?.activeHandout && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={closeHandoutViewer}><div className={`p-8 max-w-2xl w-full rounded-lg text-center transform scale-100 animate-in zoom-in duration-300 relative shadow-2xl handout-theme-${data.campaign.activeHandout.theme || 'parchment'}`} onClick={e => e.stopPropagation()}><button onClick={closeHandoutViewer} className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity"><Icon name="x" size={24}/></button><div className="flex flex-col items-center max-h-[85vh] overflow-y-auto custom-scroll">{data.campaign.activeHandout.title && <h2 className="text-3xl mb-6 font-bold border-b-2 border-current pb-2 inline-block px-8">{data.campaign.activeHandout.title}</h2>}{data.campaign.activeHandout.imageUrl && <img src={data.campaign.activeHandout.imageUrl} className="max-h-64 object-contain mb-6 rounded shadow-md border-4 border-white/20" alt="Handout Visual"/>}<div className="text-lg leading-relaxed w-full text-left handout-content prose prose-p:text-inherit prose-headings:text-inherit max-w-none" dangerouslySetInnerHTML={{__html: data.campaign.activeHandout.content || data.campaign.activeHandout.text}} /></div></div></div>}
       <div className="fixed inset-0 pointer-events-none z-[99999]">{rollingDice && <DiceOverlay roll={rollingDice} />}</div>
       <MobileNav view={currentView} setView={setCurrentView} />
       {effectiveRole === 'dm' && !data.onboardingComplete && <OnboardingWizard onComplete={handleOnboardingComplete} aiHelper={queryAiService} />}
    </div>
  );
}
export default App;