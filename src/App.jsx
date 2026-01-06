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
import DiceOverlay from './components/DiceOverlay';

const DEFAULT_DATA = { 
    hostId: null,
    dmIds: [], 
    journal_pages: {}, 
    chatLog: [], 
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

const cleanText = (html) => {
   const tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   let text = (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
   return text
     .replace(/kill/gi, "defeat")
     .replace(/murder/gi, "eliminate")
     .replace(/blood/gi, "essence")
     .replace(/torture/gi, "interrogate");
};

function App() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('session'); 
  const [gameParams, setGameParams] = useState(null); 
  const [data, setData] = useState(null);
  const saveTimer = useRef(null);

  const [showTour, setShowTour] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);
  const [possessedNpcId, setPossessedNpcId] = useState(null);
  const [showHandout, setShowHandout] = useState(false);
  const [rollingDice, setRollingDice] = useState(null);

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
              if (!d.chatLog) d.chatLog = [];
              if (!d.dmIds) d.dmIds = d.hostId ? [d.hostId] : []; 
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
                  const initData = { ...DEFAULT_DATA, hostId: user?.uid, dmIds: [user?.uid] };
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

  const effectiveRole = (data && user && data.dmIds?.includes(user.uid)) ? 'dm' : 'player';

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
      if (immediate) doSave(); else saveTimer.current = setTimeout(doSave, 1000); 
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
      try { await fb.updateDoc(ref, { [`journal_pages.${id}`]: deleteField() }); } catch (e) { alert("Failed to delete."); }
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
                      console.warn("Moderation trigger. Retrying without context...");
                      const lastMsg = messages[messages.length - 1];
                      return await queryAiService([{ role: 'user', content: lastMsg.content }], false);
                  }
                  return "⚠️ AI Safety Filter: Content rejected.";
              }
              
              if (errStr.includes("credit") || errStr.includes("quota") || errStr.includes("402")) {
                  alert("⚠️ Puter.js Credit Limit Reached. Please upgrade Puter or switch providers.");
                  return "System: Out of Credits.";
              }

              if(attempts === maxRetries) { 
                  return "AI Error: " + errStr.slice(0, 100); 
              }
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

      let currentLog = [...(data.chatLog || [])];
      currentLog.push(newMessage);
      
      const updatedData = { ...data, chatLog: currentLog };
      setData(updatedData);
      updateCloud(updatedData, true);

      if (type === 'ai-public' || type === 'ai-private') {
          const genesis = data.campaign?.genesis || {};
          const accessiblePages = Object.values(data.journal_pages || {}).filter(p => p.isPublic || p.ownerId === user?.uid);
          
          const charLimit = contextMode === 'deep' ? 30000 : 4000;
          
          const journalContext = accessiblePages
              .sort((a,b) => a.created - b.created)
              .map(p => `[${p.title}]: ${cleanText(p.content)}`)
              .join('\n')
              .slice(-charLimit); 

          const partyContext = data.players.map(p => {
              const aliasStr = p.aliases ? ` (aka: ${p.aliases})` : "";
              const details = [
                  p.appearance ? `Looks: ${p.appearance}` : '',
                  p.personality ? `Personality: ${p.personality}` : '',
                  p.backstory ? `History: ${p.backstory}` : ''
              ].filter(Boolean).join('. ');
              
              return `• ${p.name} (${p.race} ${p.class} Level ${p.level || 1})${aliasStr}: ${details}`;
          }).join('\n');

          const systemPrompt = `
          Role: Dungeon Master AI for "${genesis.campaignName || "D&D"}" (${genesis.tone || "Fantasy"}).
          Lore: ${genesis.loreText || "Generic"}.
          Location: ${data.campaign.location || "Unknown"}.
          
          PARTY ROSTER:
          ${partyContext}
          
          JOURNAL KNOWLEDGE (${contextMode.toUpperCase()} CONTEXT):
          ${journalContext}
          
          User: ${newMessage.senderName}.
          Action: Answer based on the journal data provided. Use the party roster to understand the characters' personalities, looks, and motivations.
          `;

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
          currentLog.push(aiMessage);
          const finalData = { ...data, chatLog: currentLog };
          setData(finalData);
          updateCloud(finalData, true);
      }
      setIsLoading(false);
  };

  const editChatMessage = (msgId, newContent) => {
      const newLog = data.chatLog.map(m => m.id === msgId ? { ...m, content: newContent } : m);
      const nd = { ...data, chatLog: newLog };
      updateCloud(nd, true);
  };

  const deleteChatMessage = (msgId) => {
      if(!confirm("Delete message?")) return;
      const newLog = data.chatLog.filter(m => m.id !== msgId);
      const nd = { ...data, chatLog: newLog };
      updateCloud(nd, true);
  };

  const clearChat = () => {
      if(!confirm("Are you sure you want to clear the ENTIRE chat history? This cannot be undone.")) return;
      const nd = { ...data, chatLog: [] };
      setData(nd);
      updateCloud(nd, true);
  };

  const saveMessageToJournal = (msgContent) => {
      const title = prompt("Entry Title (e.g., 'Recap: Goblin Ambush'):", "New Entry");
      if (!title) return;
      
      const newId = `page_${Date.now()}`;
      const newPage = {
          id: newId,
          title: title,
          content: `<p>${msgContent.replace(/\n/g, '<br/>')}</p>`,
          ownerId: user?.uid,
          isPublic: true,
          created: Date.now()
      };
      
      const newData = { ...data, journal_pages: { ...data.journal_pages, [newId]: newPage } };
      setData(newData);
      updateCloud(newData, true);
      alert("Saved to Journal!");
  };

  // --- UPDATED DICE LOGIC ---
  const handleDiceRoll = (d) => {
    setRollingDice(null);
    
    // Tiny delay to reset
    setTimeout(() => {
        const result = Math.floor(Math.random() * d) + 1;
        const rollId = Date.now();
        setRollingDice({ die: d, result, id: rollId });
        setShowTools(false); 

        // 1. Add Log almost immediately (so user knows it registered)
        setTimeout(() => {
            setDiceLog(prev => [{id: rollId, die: `d${d}`, result}, ...prev]);
            
            if ((d === 20 && result === 20) || (d === 20 && result === 1)) {
                const flavor = result === 20 ? "CRITICAL HIT!" : "CRITICAL MISS!";
                setInputText(prev => prev + `[${flavor} (Natural ${result} on d20)] `);
            } else {
                const sysMsg = { id: Date.now(), role: 'system', content: `Rolled d${d}: **${result}**`, timestamp: Date.now(), senderId: 'system', type: 'chat-public' };
                const nd = { ...data, chatLog: [...(data.chatLog||[]), sysMsg] };
                updateCloud(nd, true);
            }
        }, 1500);

        // 2. WAIT 4 SECONDS before removing the 3D dice
        setTimeout(() => {
            setRollingDice(null); 
        }, 4000); 
    }, 50);
  };

  const generateRecap = async (mode = 'recent') => {
      setIsLoading(true);
      
      const accessiblePages = Object.values(data.journal_pages || {}).filter(p => p.isPublic);
      let allText = accessiblePages
          .sort((a,b) => a.created - b.created)
          .map(p => `ENTRY: ${p.title}\n${cleanText(p.content)}`)
          .join('\n\n');
      
      if (!allText.trim()) { alert("No journal entries!"); setIsLoading(false); return; }

      if (mode === 'recent') {
          allText = allText.slice(-4000);
      }
      
      const genesis = data.campaign?.genesis || {};
      const chunkSize = 4000;
      let finalSummary = "";

      if (mode === 'full' && allText.length > chunkSize) {
          let summaries = [];
          for (let i = 0; i < allText.length; i += chunkSize) {
              const chunk = allText.slice(i, i + chunkSize);
              const res = await queryAiService([{ role: 'user', content: `Summarize this fragment:\n\n${chunk}` }], false);
              if (res && !res.includes("Error") && !res.includes("Safety")) summaries.push(res);
          }
          finalSummary = await queryAiService([{ role: 'user', content: `Combine these summaries into a narrative:\n\n${summaries.join("\n\n")}` }]);
      } else {
          finalSummary = await queryAiService([{ role: 'user', content: `Summarize this text:\n\n${allText}` }]);
      }

      if (finalSummary && !finalSummary.includes("Error") && !finalSummary.includes("Safety")) {
          sendChatMessage(`**${mode === 'full' ? '📜 FULL STORY RECAP' : '⏱️ RECENT RECAP'}:**\n${finalSummary}`, 'chat-public');
      } else {
          alert("Recap failed (Content Filter or Error).");
      }
      setIsLoading(false);
  };

  const generateNpc = async (name, context) => {
      const prompt = `Create 5e NPC JSON: {name, race, class, quirk, goal, secret, stats, personality} for "${name} ${context}"`;
      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };

  const generateLoc = async (type, note, genesis) => {
      const prompt = `Create 5e Location JSON: {name, type, desc} for "${type} ${note}"`;
      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };

  const handleOnboardingComplete = (onboardingData) => {
      const newData = { ...data, onboardingComplete: true, campaign: { ...data.campaign, genesis: onboardingData } };
      updateCloud(newData, true);
  };

  const createHandout = () => {
      const text = prompt("Handout Text:"); if (!text) return;
      const newData = { ...data, campaign: { ...data.campaign, activeHandout: { text, timestamp: Date.now() } } };
      updateCloud(newData, true);
  };

  const handleSaveToJournal = () => {
      const log = (data.chatLog || []).map(m => `<p><b>${m.senderName}:</b> ${m.content}</p>`).join("");
      const newId = `page_${Date.now()}`;
      const newPage = { id: newId, title: `Log ${new Date().toLocaleDateString()}`, content: log, ownerId: user.uid, isPublic: true, created: Date.now() };
      updateCloud({...data, journal_pages: {...data.journal_pages, [newId]: newPage}}, true);
      alert("Saved to Journal.");
  };

  if (!isAuthReady) return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Summoning DungeonMind...</div>;
  if (!gameParams || !data) return <Lobby fb={fb} user={user} onJoin={(c, r, u) => { localStorage.setItem('dm_last_code', c); setGameParams({code:c, role:r, isOffline:false, uid:u}) }} onOffline={() => setGameParams({code:'LOCAL', role:'dm', isOffline:true, uid:'admin'})} />;

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row bg-slate-900 text-slate-200 font-sans overflow-hidden">
       <Sidebar view={currentView} setView={setCurrentView} onExit={() => { localStorage.removeItem('dm_last_code'); setGameParams(null); setData(null); }} />
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
                       {effectiveRole === 'dm' && <button onClick={createHandout} className="text-xs bg-amber-900/50 hover:bg-amber-800 px-3 py-1 rounded border border-amber-800 text-amber-200"><Icon name="scroll" size={14}/> Handout</button>}
                       {possessedNpcId && <button onClick={() => setPossessedNpcId(null)} className="text-xs bg-red-900/80 text-white px-3 py-1 rounded">End Possession</button>}
                       <button onClick={handleSaveToJournal} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1 rounded flex items-center gap-2 text-slate-300 hover:text-white"><Icon name="save" size={14}/> Save Log</button>
                   </div>
               </div>
           </div>

           <div className="flex-1 overflow-hidden relative p-0 md:p-0">
              {currentView === 'session' && (
                  <SessionView 
                      data={data}
                      chatLog={data.chatLog || []} 
                      inputText={inputText}
                      setInputText={setInputText}
                      onSendMessage={sendChatMessage}
                      onEditMessage={editChatMessage}
                      onDeleteMessage={deleteChatMessage}
                      isLoading={isLoading}
                      role={effectiveRole}
                      user={user} 
                      generateRecap={generateRecap}
                      saveMessageToJournal={saveMessageToJournal} 
                      clearChat={clearChat}
                      showTools={showTools}
                      setShowTools={setShowTools}
                      diceLog={diceLog}
                      handleDiceRoll={handleDiceRoll}
                      possessedNpcId={possessedNpcId}
                  />
              )}
              {currentView === 'journal' && <JournalView data={data} setData={setData} updateCloud={updateCloud} role={effectiveRole} updateJournalField={()=>{}} userId={user?.uid} aiHelper={queryAiService} deleteJournalEntry={deleteJournalEntry} />}
              {currentView === 'world' && <WorldView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateLoc={generateLoc} updateMapState={updateMapState} />}
              {currentView === 'party' && (
                  <PartyView 
                      data={data} 
                      role={effectiveRole} 
                      activeChar={data.assignments?.[user?.uid]} 
                      updateCloud={updateCloud}
                      setInputText={setInputText}
                      setView={setCurrentView}
                  />
              )}
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
       
       <div className="fixed inset-0 pointer-events-none z-[99999]">
           {rollingDice && <DiceOverlay roll={rollingDice} />}
       </div>

       <MobileNav view={currentView} setView={setCurrentView} />
       {showTour && <TourGuide setView={setCurrentView} onClose={() => { setShowTour(false); localStorage.setItem('dm_tour_completed', 'true'); }} />}
       {effectiveRole === 'dm' && !data.onboardingComplete && <OnboardingWizard onComplete={handleOnboardingComplete} aiHelper={queryAiService} />}
    </div>
  );
}
export default App;