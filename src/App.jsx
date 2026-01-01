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
import WorldView from './components/WorldView';
import NpcView from './components/NpcView';
import MapBoard from './components/MapBoard'; 

// --- SYSTEM PROMPTS ---

const PROMPT_CONDENSER = `
Role: You are a D&D Scribe Assistant.
Task: You will receive a chunk of raw session text. Your goal is to condense it into a dense list of facts. 
Rules:
1. Remove all banter, jokes, and pauses.
2. PRESERVE strictly: proper nouns (names/places), specific numbers (gold amounts, damage dealt), and key plot events.
3. Do not format this as a story yet. Just output raw, factual bullet points.
`;

const PROMPT_MASTER_RECAP = `
Role: Act as a professional Tabletop RPG Dungeon Master and Campaign Manager.
Task: You will be given a compiled list of factual notes from a game session. Convert these facts into a structured, atmospheric "Session Recap."

Input Context: The input you receive is a summary of events. Do not omit any loot or quests mentioned in the summary.

Output Sections:
1. Intro: A cinematic opening line addressing the party.
2. The Story So Far: A 3-paragraph narrative summary. Group events by "Chapter" or "Location" rather than a chronological list. Use an engaging, storytelling tone.
3. Active Quest Log: A bulleted list of unfinished business. Include the quest name, the goal, and any promised rewards or key NPCs.
4. The Party Ledger: A clear breakdown of Currency (GP, SP, CP) and a list of "Key Inventory & Magic Items" (potions, artifacts, quest items).
5. DM’s Note: A closing "cliffhanger" describing exactly where the party is standing right now and an interactive prompt for what they should do next.

Style Guidelines:
- Use Markdown for bolding and headers.
- Use Emojis (📜, ⚔️, 💰) for visual section anchors.
- Ensure the tone is immersive and professional.
`;

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

// --- HELPER: Chunk String for Map-Reduce ---
const chunkString = (str, size = 12000) => {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size);
    }
    return chunks;
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
  const [chatHistory, setChatHistory] = useState([{role:'system', content: 'Connected to DungeonMind.'}]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);
  const [possessedNpcId, setPossessedNpcId] = useState(null);
  const [showHandout, setShowHandout] = useState(false);

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

  const queryAiService = async (messages) => {
      const hasKey = aiProvider === 'puter' || apiKey;
      if (!hasKey) {
          alert("Error: No AI Provider set. Go to Settings.");
          return "Configuration Error: No AI Key.";
      }
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
               if (j.error) throw new Error(j.error.message);
               return j.candidates?.[0]?.content?.parts?.[0]?.text;
          } else {
              const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model: openAiModel, messages: messages}) });
              const j = await r.json();
              if (j.error) throw new Error(j.error.message);
              return j.choices?.[0]?.message?.content;
          }
      } catch(e) { 
          console.error(e); 
          alert("AI Error: " + e.message); // ALERT THE USER
          return "System Error: " + e.message; 
      }
  };

  // --- SAFETY LIMITER: Returns context ---
  const getFullContext = () => {
      const allJournals = Object.values(data.journal_pages)
          .sort((a,b) => b.created - a.created) // Newest first
          .map(p => `[JOURNAL: ${p.title}]: ${cleanText(p.content)}`)
          .join('\n\n');

      const partyData = data.players.map(p => 
          `- ${p.name} (${p.race} ${p.class}). Motivation: ${p.motivation || "None"}. Notes: ${p.notes || "None"}.`
      ).join('\n');

      const npcData = data.npcs
          .filter(n => !n.isHidden || effectiveRole === 'dm')
          .map(n => `NPC ${n.name}: ${n.personality}. ${n.quirk ? "Quirk: "+n.quirk : ""}`)
          .join('\n');

      // Note: For Map-Reduce, we don't slice strictly, but let the generateRecap handle chunking
      return { allJournals, partyData, npcData };
  };

  const generateResponse = async (overrideText, mode = 'standard') => {
      const q = overrideText || inputText;
      if (!q && mode !== 'chaos') return;
      setChatHistory(p => [...p, { role: 'user', content: q || "CHAOS!" }]);
      setInputText('');
      setIsLoading(true);

      const { allJournals, partyData, npcData } = getFullContext();
      
      // For standard chat, we still limit context to avoid lag, but keep it generous (50k)
      const safeContext = allJournals.slice(0, 50000);

      const genesis = data.campaign?.genesis || {};
      const derivedCharId = data.assignments?.[user?.uid];
      const char = data.players.find(p => p.id === derivedCharId);
      
      let systemPrompt = "";
      
      if (possessedNpcId) {
          const npc = data.npcs.find(n => n.id === possessedNpcId);
          systemPrompt = `You are POSSESSING the NPC named "${npc.name}". Act ONLY as them. Your personality: ${npc.personality}. Your secret: ${npc.secret}. Do not narrate the world, only speak/act as ${npc.name}.`;
      } else if (effectiveRole === 'dm') {
          systemPrompt = `
          You are the Dungeon Master. 
          Setting: ${genesis.campaignName}. Tone: ${genesis.tone}.
          Location: ${data.campaign?.location || "Unknown"}.
          
          SOURCE MATERIAL (ABSOLUTE TRUTH):
          ${safeContext}

          INSTRUCTIONS:
          1. Rely entirely on the SOURCE MATERIAL for history. Do not invent new ruins, villains, or plot points unless explicitly asked to improvise.
          2. If the user asks about the story, summarize the Journals.
          `;
      } else {
          // PLAYER MODE
          systemPrompt = `
          You are a Muse for the player character: ${char ? char.name : "Adventurer"}.
          Bio: ${char ? char.backstory : ""}
          Motivation: ${char ? char.motivation : ""}
          
          KNOWN HISTORY:
          ${safeContext}

          RULES:
          1. Do NOT act as the DM. Do not narrate events.
          2. Only suggest what ${char ? char.name : "I"} might think or say.
          3. Do NOT reveal secrets or look ahead.
          `;
      }

      const res = await queryAiService([
          { role: 'system', content: systemPrompt }, 
          { role: 'user', content: q }
      ]);
      
      setChatHistory(p => [...p, { role: 'ai', content: res || "AI Error." }]);
      setIsLoading(false);
  };

  const createHandout = () => {
      const text = prompt("Enter text for the parchment handout:");
      if (!text) return;
      const newHandout = { text, timestamp: Date.now() };
      const newData = { ...data, campaign: { ...data.campaign, activeHandout: newHandout } };
      updateCloud(newData, true);
  };

  // --- SMART RECAP GENERATOR (MAP-REDUCE) ---
  const generateRecap = async () => {
      setIsLoading(true);
      
      try {
          const { allJournals } = getFullContext();
          const recentChat = chatHistory.slice(-100).map(m => `${m.role}: ${m.content}`).join('\n');
          
          // Combine all available data
          const fullRawData = `EXISTING JOURNALS:\n${allJournals}\n\nRECENT CHAT LOG:\n${recentChat}`;
          
          let finalSummaryContext = "";

          // 1. CHECK SIZE - If > 15,000 chars, we split and Map-Reduce
          if (fullRawData.length > 15000) {
              setChatHistory(p => [...p, { role: 'system', content: "📜 Text is huge. Dividing into chunks for analysis..." }]);
              
              const chunks = chunkString(fullRawData, 12000); // 12k chars per chunk
              const condensedSummaries = [];

              for (let i = 0; i < chunks.length; i++) {
                   // Notify user of progress (Map Step)
                   setChatHistory(p => {
                       const last = p[p.length - 1];
                       if (last.content.startsWith("📜 Analyzing chunk")) {
                           return [...p.slice(0, -1), { role: 'system', content: `📜 Analyzing chunk ${i+1} of ${chunks.length}...` }];
                       }
                       return [...p, { role: 'system', content: `📜 Analyzing chunk ${i+1} of ${chunks.length}...` }];
                   });
                   
                   const chunkRes = await queryAiService([
                       { role: 'system', content: PROMPT_CONDENSER },
                       { role: 'user', content: chunks[i] }
                   ]);
                   condensedSummaries.push(chunkRes);
              }

              finalSummaryContext = condensedSummaries.join("\n\n");
          } else {
              // Fast Path (Small enough for one shot)
              finalSummaryContext = fullRawData;
          }

          setChatHistory(p => [...p, { role: 'system', content: "✨ Writing final recap..." }]);

          // 2. FINAL REDUCE STEP
          const res = await queryAiService([
              { role: 'system', content: PROMPT_MASTER_RECAP }, 
              { role: 'user', content: finalSummaryContext }
          ]);
          
          if (res && !res.includes("Error")) {
              setChatHistory(p => [...p, { role: 'ai', content: `### 📜 Session Recap\n\n${res}` }]);
              if (effectiveRole === 'dm' && confirm("Save Recap to Journal?")) {
                  const newId = `page_recap_${Date.now()}`;
                  const newPage = { id: newId, title: `Recap: ${new Date().toLocaleDateString()}`, content: `<p>${res.replace(/\n/g, '<br/>')}</p>`, ownerId: 'system', isPublic: true, created: Date.now() };
                  updateCloud({...data, journal_pages: {...data.journal_pages, [newId]: newPage}}, true);
              }
          }

      } catch (e) {
          console.error(e);
          setChatHistory(p => [...p, { role: 'system', content: `❌ Error generating recap: ${e.message}` }]);
      }
      
      setIsLoading(false);
  };

  const generateNpc = async (name, context) => {
      if (!apiKey && aiProvider !== 'puter') { alert("Please set API Key."); return null; }
      const campaignName = data.campaign?.genesis?.campaignName || "Generic Fantasy";
      const prompt = `Role: D&D 5e Expert. Module: "${campaignName}". Task: JSON for NPC "${name||'Random'}" context "${context}". Return JSON keys: name, race, class, quirk, goal, secret, stats, personality.`;
      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
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
      newData.journal_pages[genId] = { id: genId, title: 'Campaign Bible', content: `<h1>${onboardingData.campaignName || "New Campaign"}</h1><p>${onboardingData.loreText || onboardingData.conceptDesc}</p>`, ownerId: 'system', isPublic: true, created: Date.now() };
      updateCloud(newData, true);
  };

  const handleSaveToJournal = () => {
      if (chatHistory.length < 2) return alert("Nothing to save!");
      const htmlLog = chatHistory.map(m => `<p><b>${m.role.toUpperCase()}:</b> ${m.content}</p>`).join("");
      const choice = prompt(`Save Chat.\nType 'NEW' for a new page.\nType page name to append.`);
      if (!choice) return;
      if (choice.toUpperCase() === 'NEW') {
          const title = prompt("Page Title:"); if(!title) return;
          const newId = `page_${Date.now()}`;
          const newPage = { id: newId, title: title, content: htmlLog, ownerId: user.uid, isPublic: true, created: Date.now() };
          updateCloud({...data, journal_pages: {...data.journal_pages, [newId]: newPage}}, true);
      } else {
          const existingPages = Object.values(data.journal_pages).filter(p => p.isPublic || p.ownerId === user.uid);
          const target = existingPages.find(p => p.title.toLowerCase() === choice.toLowerCase());
          if (target) {
              const updatedPage = { ...target, content: target.content + "<hr/><h3>Session Log</h3>" + htmlLog };
              updateCloud({...data, journal_pages: {...data.journal_pages, [target.id]: updatedPage}}, true);
          } else { alert("Page not found."); }
      }
  };

  const handleDiceRoll = (d) => {
    const result = Math.floor(Math.random() * d) + 1;
    setDiceLog(prev => [{id: Date.now(), die: `d${d}`, result}, ...prev]);
    if ((d === 20 && result === 20) || (d === 20 && result === 1)) { generateResponse(`I rolled a nat ${result} on a d20! Describe the result!`, 'narrate'); } else { setChatHistory(prev => [...prev, { role: 'system', content: `Rolled d${d}: **${result}**` }]); }
  };

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
                   {effectiveRole === 'dm' && (
                       <>
                           <button onClick={createHandout} className="text-xs bg-amber-900/50 hover:bg-amber-800 px-3 py-1 rounded flex items-center gap-1 text-amber-200 border border-amber-800"><Icon name="scroll" size={14}/> Handout</button>
                           {possessedNpcId && <button onClick={() => setPossessedNpcId(null)} className="text-xs bg-red-900/80 text-white px-3 py-1 rounded">End Possession</button>}
                       </>
                   )}
                   <button onClick={handleSaveToJournal} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1 rounded flex items-center gap-2 text-slate-300 hover:text-white"><Icon name="save" size={14}/> Save Chat</button>
               </div>
           </div>

           <div className="flex-1 overflow-hidden relative p-0 md:p-0">
              {currentView === 'session' && (
                  <SessionView 
                      data={data}
                      chatHistory={chatHistory}
                      setChatHistory={setChatHistory}
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
                      generateRecap={generateRecap}
                      possessedNpcId={possessedNpcId}
                  />
              )}
              {currentView === 'journal' && <JournalView data={data} setData={setData} updateCloud={updateCloud} role={effectiveRole} updateJournalField={()=>{}} userId={user?.uid} aiHelper={queryAiService} />}
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

       <MobileNav view={currentView} setView={setCurrentView} />
       {showTour && <TourGuide setView={setCurrentView} onClose={() => { setShowTour(false); localStorage.setItem('dm_tour_completed', 'true'); }} />}
       {effectiveRole === 'dm' && !data.onboardingComplete && <OnboardingWizard onComplete={handleOnboardingComplete} aiHelper={queryAiService} />}
    </div>
  );
}

export default App;
