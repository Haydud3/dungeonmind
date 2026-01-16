import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from './firebase';
import AuthParams from './components/AuthParams';
import WorldView from './components/WorldView';
import ChatBar from './components/chat/ChatBar';
import SettingsView from './components/SettingsView';
import { useCharacterStore } from './stores/useCharacterStore';
import { processAiRequest } from './utils/aiService';

// --- CONFIG ---
const DEFAULT_CAMPAIGN_ID = "campaign_001";
const SYSTEM_PROMPT = `You are the Dungeon Master (DM) for a D&D 5e campaign. 
Your role is to narrate the adventure, describe scenes, play NPCs, and adjudicate rules.
Keep responses concise (under 200 words) unless describing a major new location.
Use bolding for key terms/checks.
Format:
- Descriptions: Vivid and sensory.
- Checks: Ask clearly (e.g., "**Make a Wisdom (Perception) check**").
- Combat: Track narrative flow.
Context:
- The players are in a VTT environment.
- You have access to their character sheets (provided in prompt).`;

function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null); // Full Cloud State
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [view, setView] = useState('world'); // 'world', 'settings'
  const [apiKey, setApiKey] = useState(localStorage.getItem('dungeon_api_key') || '');
  const [aiProvider, setAiProvider] = useState(localStorage.getItem('dungeon_ai_provider') || 'puter');
  const [openAiModel, setOpenAiModel] = useState(localStorage.getItem('dungeon_openai_model') || 'gpt-4o');
  const [puterModel, setPuterModel] = useState(localStorage.getItem('dungeon_puter_model') || 'mistral-large-latest');

  // Messages State
  const [messages, setMessages] = useState([]);

  // Persistence Timers
  const saveTimer = useRef(null);

  // --- AUTH & INIT ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        // Connect to Live Data
        const unsubDb = onSnapshot(doc(db, "campaigns", DEFAULT_CAMPAIGN_ID), (docSnap) => {
           if (docSnap.exists()) {
             setData(docSnap.data());
             // Sync Local Chat if empty (initial load)
             if (messages.length === 0 && docSnap.data().chatLog) {
                setMessages(docSnap.data().chatLog);
             }
           } else {
             // Create Genesis Data
             const initData = {
                activeUsers: {},
                assignments: {}, // { uid: charId }
                bannedUsers: [],
                dmIds: [], // List of UIDs who are DMs
                chatLog: [{ role: 'system', content: "Welcome to DungeonMind. The saga begins..." }],
                players: [],
                npcs: [],
                campaign: {
                   activeMap: { url: "", revealPaths: [], walls: [], tokens: [], lightingMode: 'daylight', gridSize: 5 },
                   savedMaps: [], // { id, name, url, walls:[], tokens:[], view:{} }
                   genesis: { tone: "Heroic Fantasy", conflict: "The Return of the Lich King" }
                }
             };
             setDoc(doc(db, "campaigns", DEFAULT_CAMPAIGN_ID), initData);
           }
           setLoading(false);
        });
        return () => unsubDb();
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // --- LOCAL PERSISTENCE ---
  useEffect(() => { localStorage.setItem('dungeon_api_key', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('dungeon_ai_provider', aiProvider); }, [aiProvider]);
  useEffect(() => { localStorage.setItem('dungeon_openai_model', openAiModel); }, [openAiModel]);
  useEffect(() => { localStorage.setItem('dungeon_puter_model', puterModel); }, [puterModel]);

  // --- ACTIONS ---
  const handleLogin = async (username) => {
    const u = await signInAnonymously(auth);
    // Register User in Cloud
    const userRef = doc(db, "campaigns", DEFAULT_CAMPAIGN_ID);
    await updateDoc(userRef, {
        [`activeUsers.${u.user.uid}`]: username
    });
  };

  const updateCloud = (newData, immediate = false) => {
      // Optimistic Update
      setData(newData);
      
      // Debounced Save
      const doSave = async () => {
         if (!user) return;
         await setDoc(doc(db, "campaigns", DEFAULT_CAMPAIGN_ID), newData, { merge: true });
      };
      
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) doSave(); else saveTimer.current = setTimeout(doSave, 1000); 
  };

  // --- MAP STATE MANAGEMENT (Fixed Persistence) ---
  const updateMapState = (action, payload) => {
      // 1. Snapshot the CURRENT map state before we change anything
      const currentMap = data.campaign?.activeMap || {};
      
      // 2. Prepare the Library (savedMaps)
      let newSavedMaps = [...(data.campaign?.savedMaps || [])];
      
      // Helper: Commit current map to library
      const saveCurrentToLibrary = () => {
          if (!currentMap.url) return; 
          
          const existingIndex = newSavedMaps.findIndex(m => m.url === currentMap.url);
          
          // The state we want to save
          const stateToSave = {
              ...currentMap,
              lastActive: Date.now() 
          };

          if (existingIndex >= 0) {
              // Update existing entry
              newSavedMaps[existingIndex] = { ...newSavedMaps[existingIndex], ...stateToSave };
          } else {
              // Create new entry 
              newSavedMaps.push({ id: Date.now(), name: "Map " + (newSavedMaps.length + 1), ...stateToSave });
          }
      };

      // 3. Handle Actions
      let newActiveMap = { ...currentMap };
      let shouldUpdateCloud = true;

      if (action === 'set_image') {
          // PAYLOAD: URL string
          saveCurrentToLibrary(); // Save previous map

          // Check if this image already exists in our library
          const existing = newSavedMaps.find(m => m.url === payload);
          if (existing) {
              newActiveMap = { ...existing };
          } else {
              // Fresh Map
              newActiveMap = { 
                  url: payload, 
                  revealPaths: [], 
                  walls: [], 
                  tokens: [], 
                  lightingMode: 'daylight', 
                  gridSize: 5,
                  view: { zoom: 1, pan: {x:0, y:0} } 
              };
              newSavedMaps.push({ id: Date.now(), name: "New Map", ...newActiveMap });
          }

      } else if (action === 'load_map') {
          // PAYLOAD: Map Object (from library)
          saveCurrentToLibrary(); // Save previous map
          
          // Refresh from library to ensure we get the latest version
          const target = newSavedMaps.find(m => m.url === payload.url);
          newActiveMap = target ? { ...target } : { ...payload };

      } else if (action === 'start_path') { 
          // Drawing Fog
          newActiveMap.revealPaths = [...(newActiveMap.revealPaths || []), payload]; 

      } else if (action === 'append_point') {
          // Dragging Fog
          const paths = [...(newActiveMap.revealPaths || [])];
          if (paths.length > 0) {
              const lastPath = { ...paths[paths.length - 1] };
              lastPath.points = [...lastPath.points, payload];
              paths[paths.length - 1] = lastPath;
              newActiveMap.revealPaths = paths;
          }

      } else if (action === 'update_view') {
          // Saving Zoom/Pan 
          newActiveMap.view = payload;

      } else if (action === 'clear_fog') { 
          newActiveMap.revealPaths = []; 
      }

      // 4. Push to Firebase
      if (shouldUpdateCloud) {
          updateCloud({ 
              ...data, 
              campaign: { 
                  ...data.campaign, 
                  savedMaps: newSavedMaps, 
                  activeMap: newActiveMap 
              } 
          });
      }
  };

  const queryAiService = async (messages) => {
      // 1. Context Assembly
      const context = {
          players: data.players.map(p => `${p.name} (${p.race} ${p.class}, LVL ${p.level})`).join(', '),
          bible: JSON.stringify(data.campaign.genesis),
          chatHistory: messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')
      };

      const finalSystemPrompt = `${SYSTEM_PROMPT}\n\n[Current Party]: ${context.players}\n[World Bible]: ${context.bible}`;
      const payloadMessages = [
          { role: 'system', content: finalSystemPrompt },
          ...messages
      ];

      return await processAiRequest({
          provider: aiProvider,
          apiKey: apiKey,
          model: aiProvider === 'openai' ? openAiModel : puterModel,
          messages: payloadMessages
      });
  };

  const handleDiceRoll = (rollData) => {
      // rollData: { total, formula, label, user }
      const newMsg = {
          id: Date.now(),
          role: 'system',
          type: 'roll',
          content: `${rollData.user} rolled ${rollData.label}: **${rollData.total}** (${rollData.formula})`
      };
      const newLog = [...messages, newMsg];
      setMessages(newLog);
      updateCloud({ ...data, chatLog: newLog }, true);
  };
  
  const savePlayer = (updatedChar) => {
      const newPlayers = data.players.map(p => p.id === updatedChar.id ? updatedChar : p);
      updateCloud({ ...data, players: newPlayers });
  };

  // --- PLAYER MANAGEMENT ---
  const kickPlayer = (uid) => {
      const newActive = { ...data.activeUsers };
      delete newActive[uid];
      const newAssignments = { ...data.assignments };
      delete newAssignments[uid];
      updateCloud({ ...data, activeUsers: newActive, assignments: newAssignments });
  };

  const banPlayer = (uid) => {
      const newActive = { ...data.activeUsers };
      delete newActive[uid];
      const newBanned = [...(data.bannedUsers || []), uid];
      updateCloud({ ...data, activeUsers: newActive, bannedUsers: newBanned });
  };

  const unbanPlayer = (uid) => {
      const newBanned = data.bannedUsers.filter(id => id !== uid);
      updateCloud({ ...data, bannedUsers: newBanned });
  };

  // --- RENDER ---
  if (loading) return <div className="h-screen bg-black text-amber-500 flex items-center justify-center font-mono animate-pulse">Summoning Portal...</div>;

  if (!user) return <AuthParams onLogin={handleLogin} />;

  // Permission Check
  if (data?.bannedUsers?.includes(user.uid)) {
      return <div className="h-screen bg-red-950 text-red-500 flex flex-col items-center justify-center font-bold"><span>You have been banished from this realm.</span></div>;
  }

  // Determine Role
  // The first user to ever create/join becomes the default DM if list is empty
  const isDm = data?.dmIds?.includes(user.uid) || (data?.dmIds?.length === 0 && Object.keys(data?.activeUsers || {}).length === 1);

  // Auto-promote first user
  if (data?.dmIds?.length === 0 && Object.keys(data?.activeUsers || {}).length > 0) {
      // We don't want to loop infinite updates, so we assume the first activeUser is DM
      // But we can just rely on the UI logic for now.
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans">
      
      {/* LEFT: WORLD / SETTINGS */}
      <main className="flex-1 flex flex-col min-w-0 relative z-0">
        {view === 'world' ? (
           <WorldView 
                data={data} 
                role={isDm ? 'dm' : 'player'} 
                updateMapState={updateMapState}
                updateCloud={updateCloud}
                user={user}
                apiKey={apiKey}
                onDiceRoll={handleDiceRoll}
                savePlayer={savePlayer}
           />
        ) : (
           <SettingsView 
                data={data} 
                setData={setData}
                role={isDm ? 'dm' : 'player'}
                apiKey={apiKey} 
                setApiKey={setApiKey}
                updateCloud={updateCloud}
                code={DEFAULT_CAMPAIGN_ID}
                user={user}
                onExit={() => { auth.signOut(); window.location.reload(); }}
                aiProvider={aiProvider} setAiProvider={setAiProvider}
                openAiModel={openAiModel} setOpenAiModel={setOpenAiModel}
                puterModel={puterModel} setPuterModel={setPuterModel}
                banPlayer={banPlayer} kickPlayer={kickPlayer} unbanPlayer={unbanPlayer}
           />
        )}

        {/* Floating Toggles */}
        <div className="absolute top-4 right-4 flex gap-2 z-50">
            <button onClick={() => setView('world')} className={`p-2 rounded-full shadow-xl border border-slate-600 ${view==='world' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </button>
            <button onClick={() => setView('settings')} className={`p-2 rounded-full shadow-xl border border-slate-600 ${view==='settings' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
        </div>
      </main>

      {/* RIGHT: CHAT */}
      <ChatBar 
        messages={messages} 
        user={user} 
        onSend={(text) => {
            const newMsg = { id: Date.now(), role: 'user', name: data.activeUsers[user.uid], content: text };
            const newLog = [...messages, newMsg];
            setMessages(newLog);
            updateCloud({ ...data, chatLog: newLog });
            
            // Check for AI Query
            if (text.toLowerCase().startsWith('/ai')) {
                const query = text.replace('/ai', '').trim();
                const tempLog = [...newLog, { id: Date.now()+1, role: 'system', content: "Thinking..." }];
                setMessages(tempLog);
                queryAiService([...messages, { role: 'user', content: query }]).then(res => {
                    const aiMsg = { id: Date.now()+2, role: 'assistant', content: res };
                    const finalLog = [...newLog, aiMsg];
                    setMessages(finalLog);
                    updateCloud({ ...data, chatLog: finalLog });
                });
            }
        }} 
      />

    </div>
  );
}

export default App;