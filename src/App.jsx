import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
import { collection, query, orderBy, limit, onSnapshot, addDoc, setDoc, deleteDoc, doc } from './firebase';
import Icon from './components/Icon';
import Sidebar from './components/Sidebar';
import { CampaignProvider, useCampaign } from './contexts/CampaignContext';
import { ToastProvider, useToast } from './components/ToastProvider';
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
import LoreView from './components/LoreView';
import { useCharacterStore } from './stores/useCharacterStore'; 
import { retrieveContext, buildPrompt, buildCastList } from './utils/loreEngine';

// START CHANGE: Import SheetContainer
import SheetContainer from './components/character-sheet/SheetContainer';
// END CHANGE

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
        location: "Start",
        combat: { active: false, round: 1, turn: 0, combatants: [] }
    }
};

const INITIAL_APP_STATE = { ...DB_INIT_DATA, players: [], journal_pages: {}, chatLog: [] };

function DungeonMindApp() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // START CHANGE: Use Contexts
  const { data, setData, gameParams, joinCampaign, leaveCampaign, updateCloud, savePlayer, deletePlayer, loreChunks, setLoreChunks } = useCampaign();
  const toast = useToast(); 
  // END CHANGE

  // START CHANGE: Deep Linking Router Logic
  const BASE_PATH = '/dungeonmind';
  
  // 1. Map internal IDs to friendly URL slugs
  const VIEW_SLUGS = {
      'session': 'session',
      // START CHANGE: Add Sheet Route
      'sheet': 'sheet',
      // END CHANGE
      'journal': 'journal',
      'map': 'tactical',
      'party': 'player-character',
      'npcs': 'bestiary',
      'lore': 'lore',
      'settings': 'settings'
  };

  // 2. Initialize view based on current URL
  const getInitialView = () => {
      const path = window.location.pathname.replace(BASE_PATH, '').replace(/^\//, '').split('/')[0];
      const foundEntry = Object.entries(VIEW_SLUGS).find(([id, slug]) => slug === path);
      return foundEntry ? foundEntry[0] : 'session';
  };

  const [currentView, setCurrentView] = useState(getInitialView);

  // START CHANGE: Remove Local State (data, gameParams, saveTimer)
  // const [gameParams, setGameParams] = useState(null); 
  // const [data, setData] = useState(INITIAL_APP_STATE);
  // const saveTimer = useRef(null);
  // END CHANGE

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);
  const [possessedNpcId, setPossessedNpcId] = useState(null);
  const [showHandout, setShowHandout] = useState(false);
  const [showHandoutCreator, setShowHandoutCreator] = useState(false);
  const [rollingDice, setRollingDice] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null); // NEW: Track active spell template
  const addLogEntry = useCharacterStore((state) => state.addLogEntry);

  // START CHANGE: Handler to clear dice history
  const handleClearRolls = () => {
      setDiceLog([]);
      toast("Combat ended: Dice history cleared.", "info");
  };
  // END CHANGE

  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dm_api_key') || '');
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('dm_ai_provider') || 'puter');
  // START CHANGE: Remove Lore State (Handled in Context)
  // const [loreChunks, setLoreChunks] = useState([]);
  // END CHANGE
  const [openAiModel, setOpenAiModel] = useState(() => localStorage.getItem('dm_openai_model') || 'gpt-4o');
  const [puterModel, setPuterModel] = useState(() => localStorage.getItem('dm_puter_model') || 'mistral-large-latest');

  useEffect(() => { localStorage.setItem('dm_api_key', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('dm_ai_provider', aiProvider); }, [aiProvider]);

  // --- AUTH RESTORATION (CRITICAL FIX) ---
  useEffect(() => {
    const unsub = fb.onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      // Auto-join logic moved inside to prevent dependency cycles
      const lastCode = localStorage.getItem('dm_last_code');
      // Only auto-join if we aren't already in a game and have a code
      if (u && lastCode && !window.location.pathname.includes(lastCode)) {
           // We defer this check to the Lobby or separate logic to avoid loop
      }
    });
    return () => unsub();
  }, [gameParams]); 

  // START CHANGE: Listen for "Reveal" events to auto-open handouts
  useEffect(() => {
      if (!data?.campaign?.activeHandout) return;
      
      const h = data.campaign.activeHandout;
      // Only pop up if marked 'revealed' and the timestamp is recent (< 10 seconds)
      // This prevents it from popping up every time you refresh the page
      const isNew = (Date.now() - h.timestamp) < 10000;
      
      if (h.revealed && isNew) {
          setShowHandout(true);
          toast(`New Handout: ${h.title}`, "info");
      }
  }, [data.campaign?.activeHandout]);
  // END CHANGE

  const effectiveRole = (data && user && data.dmIds?.includes(user.uid)) ? 'dm' : 'player';

  // --- HELPER FUNCTIONS ---
  // START CHANGE: Add missing save functions needed for Journal/Session views
  const saveJournalEntry = async (pageId, pageData) => {
      if (!gameParams?.isOffline) {
        const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId.toString());
        await setDoc(ref, pageData, { merge: true });
      }
  };

  const deleteJournalEntryFunc = async (pageId) => {
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'journal', pageId.toString());
      await deleteDoc(ref);
  };
  // END CHANGE

  const updateMapState = (action, payload) => {
      const currentMap = data.campaign?.activeMap || { url: null, revealPaths: [], tokens: [] };
      const savedMaps = data.campaign?.savedMaps || [];
      let newMap = { ...currentMap };
      let newSavedMaps = [...savedMaps];

      // Helper: Save current map state before switching
      if ((action === 'set_image' || action === 'load_map') && currentMap.url) {
          const idx = newSavedMaps.findIndex(m => m.url === currentMap.url);
          if (idx > -1) newSavedMaps[idx] = { ...newSavedMaps[idx], ...currentMap };
          else newSavedMaps.push({ id: Date.now(), name: "Unsaved Map", ...currentMap });
      }

      if (action === 'set_image') { 
          if (payload && !newSavedMaps.find(m => m.url === payload)) {
             newSavedMaps.push({ id: Date.now(), name: `Map ${newSavedMaps.length + 1}`, url: payload });
          }
          newMap = { url: payload, revealPaths: [], walls: [], tokens: [], view: { zoom: 1, pan: {x:0,y:0} } };
      } else if (action === 'load_map') {
          const existing = newSavedMaps.find(m => m.url === payload.url);
          if (existing) newMap = { ...existing }; 
          else newMap = { url: payload.url, revealPaths: [], walls: [], tokens: [], view: { zoom: 1, pan: {x:0,y:0} } };
      } else if (action === 'start_path') { newMap.revealPaths = [...newMap.revealPaths, payload]; 
      } else if (action === 'append_point') {
          const lastPath = { ...newMap.revealPaths[newMap.revealPaths.length - 1] };
          lastPath.points = [...lastPath.points, payload];
          const newPaths = [...newMap.revealPaths];
          newPaths[newPaths.length - 1] = lastPath;
          newMap.revealPaths = newPaths;
      } else if (action === 'clear_fog') { newMap.revealPaths = []; 
      } else if (action === 'delete_map') {
          const target = newSavedMaps.find(m => m.id === payload);
          newSavedMaps = newSavedMaps.filter(m => m.id !== payload);
          // If deleting the active map, reset the board
          if (target && target.url === newMap.url) {
              newMap = { url: null, revealPaths: [], walls: [], tokens: [], view: { zoom: 1, pan: {x:0,y:0} } };
          }
      // START CHANGE: Add update_token case to Map State engine
      } else if (action === 'update_token') {
          newMap.tokens = newMap.tokens.map(t => t.id === payload.id ? { ...t, ...payload } : t);
      }
      // END CHANGE
      updateCloud({ ...data, campaign: { ...data.campaign, activeMap: newMap, savedMaps: newSavedMaps } });
  };

  const queryAiService = async (messages) => {
      const hasKey = aiProvider === 'puter' || apiKey;
      if (!hasKey) { toast("Error: No AI Provider set.", "error"); return "Config Error."; }
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

  const getSenderName = () => {
      // 1. NPC Possession (Highest Priority)
      if (possessedNpcId) return (data.npcs?.find(n => n.id === possessedNpcId)?.name || "Unknown NPC") + " (NPC)";
      
      // 2. DM Identity
      if (effectiveRole === 'dm') return "Dungeon Master";
      
      // 3. Player Character Identity
      const charId = data.assignments?.[user?.uid];
      const character = data.players?.find(p => p.id === charId);
      if (character) return character.name;
      
      // 4. Fallback
      return user?.email?.split('@')[0] || "User";
  };
  // END CHANGE

  const sendChatMessage = async (content, type = 'chat-public', targetId = null) => {
      if (!content.trim()) return;
      setIsLoading(true);
      const newMessage = { id: Date.now(), role: 'user', content, timestamp: Date.now(), senderId: user?.uid, senderName: getSenderName(), type, targetId };
      const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
      await addDoc(chatRef, newMessage);

      // START CHANGE: Removed automatic AI logic from here (moved to SessionView)
      // Old logic deleted: if (type === 'ai-public' || type === 'ai-private') { ... }
      // END CHANGE
      // START CHANGE: Add Delete and Clear functions
      setIsLoading(false);
  };

  const deleteMessage = async (id) => {
      const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', id);
      await deleteDoc(ref);
  };

  const clearChat = async () => {
      if (!confirm("Delete all chat history?")) return;
      const batch = fb.writeBatch(fb.db);
      data.chatLog.forEach(msg => {
          const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat', msg.id.toString());
          batch.delete(ref);
      });
      await batch.commit();
  };
  // END CHANGE

  const handleDiceRoll = (d, silent = false) => {
    return new Promise((resolve) => {
        setRollingDice(null);
        setTimeout(() => {
            const result = Math.floor(Math.random() * d) + 1;
            setRollingDice({ die: d, result, id: Date.now() });
            setShowTools(false); 
            setTimeout(() => {
                setDiceLog(prev => [{id: Date.now(), die: `d${d}`, result}, ...prev]);
                if (!silent) addLogEntry({ message: `<div class="font-bold text-white">Manual Roll</div><div class="text-xl text-amber-500 font-bold">d${d} -> ${result}</div>`, id: Date.now() });
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

  // START CHANGE: Unified Context-Aware Forge (NPCs & PCs)
  const forgeEntity = async (name, type, instructions = "") => {
      const myCharId = data.assignments?.[user?.uid];
      const castList = buildCastList(data); // Option B: Identity Mapping

      // 1. Search Lore (Option A: Character Sheets + Books + Journal)
      const context = retrieveContext(name, loreChunks, data.journal_pages || {}, data.players, effectiveRole, myCharId);
      
      // 2. Build the System Prompt using the new engine logic
      // Note: We are using buildPrompt here to wrap the schema and instructions
      const systemPrompt = buildPrompt(
          `Forge a D&D 5e ${type === 'pc' ? 'Player' : 'NPC'} for "${name}"`,
          context,
          "", // No chat history needed for forge
          effectiveRole === 'player',
          castList
      );

      // START CHANGE: Use the systemPrompt variable to send context to the AI
      const isPc = type === 'pc';
      
      // Define Schemas
      const npcSchema = `{ name, race, class, cr, hp: { current, max }, ac, speed, stats: { STR, DEX, CON, INT, WIS, CHA }, senses: { darkvision, passivePerception }, customActions: [{ name, desc, type, hit, dmg }], features: [{ name, desc }], bio: { backstory, appearance } }`;
      const pcSchema = `{ name, race, class, background, alignment, stats: { STR, DEX, CON, INT, WIS, CHA }, hp, ac, speed, senses, skills: [], features: [], equipment: [], image_prompt }`;

      const finalAIPrompt = `
      ${systemPrompt}
      
      TASK: Output valid JSON matching this schema: ${isPc ? pcSchema : npcSchema}
      ADDITIONAL USER INSTRUCTIONS: ${instructions}
      JSON ONLY. NO MARKDOWN WRAPPERS.
      `;

      const res = await queryAiService([{ role: 'user', content: finalAIPrompt }]);
      // END CHANGE
      
      try { 
          const rawJson = JSON.parse(res.match(/\{[\s\S]*\}/)[0]);
          
          // 3. Sanitizer (The Safety Net)
          // Fix capitalization or missing fields that break the UI
          const sanitized = { ...rawJson };

          // Fix HP if it came back as a number
          if (typeof sanitized.hp === 'number') {
              sanitized.hp = { current: sanitized.hp, max: sanitized.hp };
          }
          
          // Fix Actions if they came back as 'actions' instead of 'customActions'
          if (!sanitized.customActions && sanitized.actions) {
              sanitized.customActions = sanitized.actions;
          }

          // Ensure basic strings exist
          if (!sanitized.race && sanitized.Race) sanitized.race = sanitized.Race;
          if (!sanitized.class && sanitized.Class) sanitized.class = sanitized.Class;
          if (!sanitized.quirk) sanitized.quirk = "Forged by AI";

          return sanitized;

      } catch (e) { 
          console.error("Forge Error:", e); 
          return null; 
      }
  };

  const generateNpc = (name, ctx) => forgeEntity(name, 'npc', ctx);
  const generatePlayer = (name, ctx) => forgeEntity(name, 'pc', ctx);
  // END CHANGE

  const handleHandoutSave = (h) => {
      const newH = [...(data.handouts||[])]; h.id ? newH[newH.findIndex(x=>x.id===h.id)] = h : newH.unshift({...h, id: Date.now()});
      updateCloud({...data, handouts:newH, campaign:{...data.campaign, activeHandout:h}}); setShowHandoutCreator(false);
  };

  const handlePlaceTemplate = (spell) => { setActiveTemplate(spell); setCurrentView('map'); };

  // START CHANGE: Enhanced Initiative Handler
  const handleInitiative = (char, roll = null) => {
      const c = data.campaign?.combat;
      // Auto-start combat if needed
      const combatState = (c && c.active) ? c : { active: true, round: 1, turn: 0, combatants: [] };
      
      let combatants = [...(combatState.combatants || [])];
      const idx = combatants.findIndex(x => x.id === char.id);
      
      // Determine type & Image
      const isPlayer = data.players.some(p => p.id === char.id);
      const type = isPlayer ? 'pc' : 'npc';
      
      // Find linked Token ID for map integration
      const linkedToken = data.campaign?.activeMap?.tokens?.find(t => t.characterId === char.id);
      const tokenId = linkedToken ? linkedToken.id : null;
      
      // Grab image from Character OR Token (fallback)
      const image = char.image || linkedToken?.image || null;

      const entry = { 
          id: char.id, 
          name: char.name, 
          init: roll, // Can be null (Pending)
          type, 
          tokenId,
          image
      };
      
      if (idx > -1) {
          // Update existing
          combatants[idx] = { ...combatants[idx], ...entry };
          // If roll is null (just adding to tracker), keep existing init if present
          if (roll === null && combatants[idx].init !== undefined) {
              entry.init = combatants[idx].init;
          }
      } else {
          combatants.push(entry);
      }
      
      // Sort: High numbers top, Nulls bottom
      combatants.sort((a,b) => {
          if (a.init === null) return 1;
          if (b.init === null) return -1;
          return b.init - a.init;
      });
      
      updateCloud({ 
          ...data, 
          campaign: { 
              ...data.campaign, 
              combat: { ...combatState, combatants } 
          } 
      }, true);
  };

  const updateCombatant = (id, changes) => {
      const c = data.campaign?.combat;
      if (!c) return;
      let combatants = [...c.combatants];
      const idx = combatants.findIndex(x => x.id === id);
      if (idx > -1) {
          combatants[idx] = { ...combatants[idx], ...changes };
          
          // Re-sort if init changed
          if (changes.init !== undefined) {
              combatants.sort((a,b) => {
                  if (a.init === null) return 1;
                  if (b.init === null) return -1;
                  return b.init - a.init;
              });
          }
          
          updateCloud({ ...data, campaign: { ...data.campaign, combat: { ...c, combatants } } });
      }
  };
  // END CHANGE

  // START CHANGE: Robust "Auto-Scribe" Recap
  const generateRecap = async (scope = 'recent') => {
      setIsLoading(true);
      
      // 1. Filter Chat Log based on scope ('recent' = last 4h gap, 'full' = all)
      const sessionThreshold = 4 * 60 * 60 * 1000; 
      let relevantLogs = data.chatLog;
      
      if (scope === 'recent') {
          let lastBreakIndex = 0;
          for (let i = 1; i < data.chatLog.length; i++) {
              if (data.chatLog[i].timestamp - data.chatLog[i-1].timestamp > sessionThreshold) {
                  lastBreakIndex = i;
              }
          }
          relevantLogs = data.chatLog.slice(lastBreakIndex);
      }
      
      const logText = relevantLogs.map(m => `${m.senderName}: ${m.content}`).join('\n');

      // 2. Build the Scribe Prompt
      const prompt = `
      You are the Campaign Scribe. Analyze this D&D session log and generate a structured summary.
      
      FORMAT AS HTML (Use <h3>, <ul>, <li>, <b>):
      
      <h3>⚔️ The Story So Far</h3>
      (A dramatic, 2-paragraph narrative summary of the events)
      
      <h3>💰 The Ledger</h3>
      <ul>
         <li><b>Loot:</b> (List items found and who took them)</li>
         <li><b>Gold:</b> (Total gp found)</li>
         <li><b>Monsters:</b> (List defeated enemies)</li>
      </ul>
      
      <h3>📜 Quest Log</h3>
      <ul>
         <li><b>Updates:</b> (New info on existing quests)</li>
         <li><b>New Goals:</b> (Any new objectives started)</li>
      </ul>

      LOGS:
      ${logText}
      `;

      // 3. Ask AI
      const summary = await queryAiService([{ role: 'user', content: prompt }]);
      
      // 4. Create Journal Entry
      const newPageId = Date.now().toString();
      const newPage = {
          id: newPageId,
          title: `Session Recap - ${new Date().toLocaleDateString()}`,
          content: summary,
          timestamp: Date.now()
      };
      
      await saveJournalEntry(newPageId, newPage);
      
      // 5. Open Journal
      setCurrentView('journal');
      setIsLoading(false);
      return summary;
  };
  // END CHANGE

  // NEW: Upload Lore
  const uploadLore = async (volumes) => {
      if (!gameParams?.code) return;
      
      try {
          // 1. Upload each volume (Using loop instead of batch to avoid size limits on large PDFs)
          for (let i = 0; i < volumes.length; i++) {
              const volId = `vol_${Date.now()}_${i}`;
              const ref = doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'lore', volId);
              await setDoc(ref, {
                  id: volId,
                  chunks: volumes[i],
                  timestamp: Date.now(),
                  type: 'pdf_volume'
              });
          }
          
          // 2. Optimistic Update (Immediate access)
          const allChunks = volumes.flat();
          setLoreChunks(prev => [...prev, ...allChunks]);
          
      } catch (e) {
          console.error("Error uploading lore:", e);
          alert("Failed to save to cloud. Check console.");
      }
  };

  if (!isAuthReady) return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Summoning DungeonMind...</div>;
  
  // START CHANGE: enhanced Lobby logic to handle auto-join safely
  if (!gameParams) {
      // Check for auto-join only if we are authenticated and not currently in a game
      if (user) {
          const lastCode = localStorage.getItem('dm_last_code');
          if (lastCode) {
             // We return null briefly while we trigger the join, to avoid flashing the Lobby
             // This is a side-effect in render, which is generally bad, but safe here if we strictly guard it
             setTimeout(() => joinCampaign(lastCode, 'player', user.uid, false), 0);
             return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Returning to Session...</div>;
          }
      }
      return <Lobby fb={fb} user={user} onJoin={(c, r, u) => { localStorage.setItem('dm_last_code', c); joinCampaign(c, r, u, false); }} onOffline={() => joinCampaign('LOCAL', 'dm', 'admin', true)} />;
  }
  // END CHANGE

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col md:flex-row bg-slate-900 text-slate-200 font-sans overflow-hidden">
       <Sidebar view={currentView} setView={setCurrentView} onExit={() => { localStorage.removeItem('dm_last_code'); leaveCampaign(); }} />
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
           {/* END CHANGE */}

           <div className="flex-1 overflow-hidden relative p-0 md:p-0">
             {/* 1. CHAT (Session) */}
              {/* START CHANGE: Connect deleteMessage and clearChat props */}
              {currentView === 'session' && <SessionView data={data} chatLog={data.chatLog} inputText={inputText} setInputText={setInputText} 
                  onSendMessage={sendChatMessage} 
                  onEditMessage={()=>{}} 
                  onDeleteMessage={deleteMessage} 
                  clearChat={clearChat}
                  isLoading={isLoading} role={effectiveRole} user={user} showTools={showTools} setShowTools={setShowTools} diceLog={diceLog} handleDiceRoll={handleDiceRoll} 
                  onSavePage={saveJournalEntry} generateRecap={generateRecap} loreChunks={loreChunks} aiHelper={queryAiService}
                  players={data.players}
                  castList={buildCastList(data)}
                  myCharId={data.assignments?.[user?.uid]}
              />}
              {/* END CHANGE */}
              
              {/* 2. JOURNAL */}
              {currentView === 'journal' && <JournalView 
                  data={data} 
                  role={effectiveRole} 
                  userId={user?.uid} 
                  // START CHANGE: Pass Character ID for granular permissions
                  myCharId={data.assignments?.[user?.uid]}
                  // END CHANGE
                  onSavePage={saveJournalEntry} 
                  onDeletePage={deleteJournalEntryFunc} 
                  aiHelper={queryAiService} 
              />}
              
              {/* 3. TACTICAL (Map) */}
              {currentView === 'map' && <WorldView 
                  data={data} 
                  setData={setData} 
                  role={effectiveRole} 
                  updateCloud={updateCloud} 
                  updateMapState={updateMapState} 
                  onDiceRoll={handleDiceRoll} 
                  user={user} 
                  apiKey={apiKey} 
                  savePlayer={savePlayer} 
                  activeTemplate={activeTemplate} 
                  onClearTemplate={() => setActiveTemplate(null)} 
                  onInitiative={handleInitiative}
                  updateCombatant={updateCombatant} // Pass new function
                  // START CHANGE: Pass the clear function down
                  onClearRolls={handleClearRolls}
                  // END CHANGE
                  removeCombatant={(id) => { // Pass inline delete function
                      const c = data.campaign?.combat;
                      const newCombatants = c.combatants.filter(x => x.id !== id);
                      updateCloud({ ...data, campaign: { ...data.campaign, combat: { ...c, combatants: newCombatants } } });
                  }}
              />}
              {currentView === 'atlas' && <WorldCreator data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} updateMapState={updateMapState} aiHelper={queryAiService} apiKey={apiKey} />}

              {/* 4. PARTY (PCs) */}
              {currentView === 'party' && <PartyView data={data} role={effectiveRole} activeChar={data.assignments?.[user?.uid]} updateCloud={updateCloud} savePlayer={savePlayer} deletePlayer={deletePlayer} setView={setCurrentView} user={user} aiHelper={queryAiService} onDiceRoll={handleDiceRoll} apiKey={apiKey} edition={data.config?.edition} onPlaceTemplate={handlePlaceTemplate} onInitiative={handleInitiative} 
                  generatePlayer={generatePlayer}
              />}

              {/* 5. BESTIARY (NPCs) */}
              {currentView === 'npcs' && <NpcView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateNpc={generateNpc} setChatInput={setInputText} setView={setCurrentView} onPossess={setPossessedNpcId} aiHelper={queryAiService} apiKey={apiKey} edition={data.config?.edition} onDiceRoll={handleDiceRoll} onPlaceTemplate={handlePlaceTemplate} onInitiative={handleInitiative} />}
              
              {/* START CHANGE: Ensure 'sheet' view only renders when explicitly active and not overriding others */}
              {currentView === 'sheet' && (
                  <div className="flex-1 h-full overflow-hidden">
                      <SheetContainer 
                          characterId={data.assignments?.[user?.uid]} 
                          onSave={savePlayer} 
                          onDiceRoll={handleDiceRoll} 
                          // --- FIX: PASS ROLE HERE ---
                          role={effectiveRole}
                          // ---------------------------
                          isOwner={true}
                          onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                      />
                  </div>
              )}
              {/* END CHANGE */}

              {/* 6. LORE (Bible) */}
              {currentView === 'lore' && <LoreView data={data} aiHelper={queryAiService} pdfChunks={loreChunks} setPdfChunks={setLoreChunks} onUploadLore={uploadLore} />}
              {currentView === 'lore' && <LoreView data={data} aiHelper={queryAiService} pdfChunks={loreChunks} setPdfChunks={setLoreChunks} onUploadLore={uploadLore} />}
              
              {/* 7. SETTINGS */}
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

// START CHANGE: Export Wrapper with Providers
export default function App() {
    return (
        <CampaignProvider>
            <ToastProvider>
                <DungeonMindApp />
            </ToastProvider>
        </CampaignProvider>
    );
}