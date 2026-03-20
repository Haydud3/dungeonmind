import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
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
import WorldCreator from './components/WorldCreator'; 
import TacticalMapView from './components/TacticalMapView';
import NpcView from './components/NpcView';
import DiceOverlay from './components/DiceOverlay';
import ResolvedImage from './components/ResolvedImage';
import HandoutEditor from './components/HandoutEditor';
import LoreView from './components/LoreView';
import { useCharacterStore } from './stores/useCharacterStore'; 
import { retrieveContext, buildPrompt, buildCastList } from './utils/loreEngine';
import { retrieveChunkedMap, resolveChunkedHtml, parseHandoutBody } from './utils/storageUtils';

import SheetContainer from './components/character-sheet/SheetContainer';
import SideSheet from './components/SideSheet';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-400 p-4 text-center bg-slate-900">
            <Icon name="alert-triangle" size={48} className="mb-4" />
            <h2 className="text-xl font-bold mb-2">Something went wrong in this view</h2>
            <p className="mb-4 max-w-md opacity-80 font-mono text-sm bg-black/30 p-2 rounded">{this.state.error?.message}</p>
            <button 
                onClick={() => this.setState({ hasError: false })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-white transition-colors border border-slate-700"
            >
                Try Again
            </button>
        </div>
      );
    }
    return this.props.children; 
  }
}

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
        activeHandout: null, 
        location: "Start",
        combat: { active: false, round: 1, turn: 0, combatants: [] }
    }
};

const INITIAL_APP_STATE = { ...DB_INIT_DATA, players: [], journal_pages: {}, chatLog: [] };

function DungeonMindApp() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const { 
    data, setData, gameParams, joinCampaign, leaveCampaign, 
    updateCampaign, updateCloud, savePlayer, deletePlayer, loreChunks, setLoreChunks,
    kickPlayer, banPlayer, unbanPlayer 
  } = useCampaign();
  useEffect(() => {
    if (user !== undefined) setIsAuthReady(true);
  }, [user]);
  const toast = useToast(); 

  const BASE_PATH = '/dungeonmind';
  
  // 1. Map internal IDs to friendly URL slugs
  const VIEW_SLUGS = {
      'session': 'session',
      'sheet': 'sheet',
      'journal': 'journal',
      'map': 'map',
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

  // 3. Update URL when view changes
  useEffect(() => {
      const slug = VIEW_SLUGS[currentView] || 'session';
      const url = `${BASE_PATH}/${slug}`;
      
      // Only push if different (prevents loop)
      if (window.location.pathname !== url) {
          window.history.pushState({ view: currentView }, '', url);
      }
  }, [currentView]);

  // 4. Handle Back/Forward Browser Buttons
  useEffect(() => {
      const handlePopState = () => setCurrentView(getInitialView());
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localHandout, setLocalHandout] = useState(null); 
  const [showTools, setShowTools] = useState(false);
  const [diceLog, setDiceLog] = useState([]);
  const [possessedNpcId, setPossessedNpcId] = useState(null);
  const [showHandout, setShowHandout] = useState(false);
  const [activeHandoutImageUrl, setActiveHandoutImageUrl] = useState('');
  const [activeHandoutBlocks, setActiveHandoutBlocks] = useState([]);
  const [showHandoutCreator, setShowHandoutCreator] = useState(false);
  const [rollingDice, setRollingDice] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null); // NEW: Track active spell template
  const addLogEntry = useCharacterStore((state) => state.addLogEntry);

  const [rightPanel, setRightPanel] = useState({ mode: 'closed', data: null });
  
  const handleOpenSheet = (id) => setRightPanel({ mode: 'sheet', data: id });
  const handleToggleChat = () => setRightPanel(prev => prev.mode === 'chat' ? { mode: 'closed', data: null } : { mode: 'chat', data: null });
  const handleClosePanel = () => setRightPanel({ mode: 'closed', data: null });

  const handleClearRolls = () => {
      setDiceLog([]);
      toast("Combat ended: Dice history cleared.", "info");
  };

  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dm_api_key') || '');
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('dm_ai_provider') || 'puter');
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

  useEffect(() => {
      const h = localHandout || data.campaign?.activeHandout;
      if (!h) {
          setActiveHandoutImageUrl('');
          setActiveHandoutBlocks([]);
          return;
      }
      
      const resolveAndShow = async () => {
          try {
              // 1. Resolve Header Image
              let resolvedHeader = '';
              if (h.imageUrl?.startsWith('chunked:')) {
                  resolvedHeader = await retrieveChunkedMap(h.imageUrl);
              } else {
                  resolvedHeader = h.imageUrl || '';
              }

              // 2. Parse Body into manageable blocks
              const blocks = parseHandoutBody(h.content);

              // 3. Update states atomically
              setActiveHandoutImageUrl(resolvedHeader);
              setActiveHandoutBlocks(blocks);

              // 4. Reveal Check
              if (localHandout) {
                  setShowHandout(true);
              } else {
                  // Global Reveal Logic (Must not be a draft and must be recently revealed)
                  const isNew = (Date.now() - h.timestamp) < 10000;
                  if (h.revealed && !h.isDraft && isNew) {
                      setShowHandout(true);
                      toast(`New Handout: ${h.title}`, "info");
                  }
              }
          } catch (e) {
              console.error("[HANDOUT] Stream Parsing Error:", e);
          }
      };
      resolveAndShow();
  }, [data.campaign?.activeHandout, localHandout]);

  const effectiveRole = (data && user && data.dmIds?.includes(user.uid)) ? 'dm' : 'player';

  // --- HELPER FUNCTIONS ---
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

  const sendChatMessage = async (content, type = 'chat-public', targetId = null) => {
      if (!content.trim()) return;
      setIsLoading(true);
      const newMessage = { id: Date.now(), role: 'user', content, timestamp: Date.now(), senderId: user?.uid, senderName: getSenderName(), type, targetId };
      const chatRef = collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'chat');
      await addDoc(chatRef, newMessage);

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

  const handleDiceRoll = (formula, modifier = 0, label = "Roll") => {
    // Legacy support for (d, silent) signature
    let silent = false;
    let mod = 0;
    let lbl = label;
    let sides = 20;

    // Handle options object (used by character sheet)
    if (typeof modifier === 'object' && modifier !== null) {
        mod = modifier.modifier || 0;
        lbl = modifier.alias || modifier.flavor || label;
        silent = modifier.silent || (modifier.chat === false);
    } else if (typeof modifier === 'number') {
        mod = modifier;
    } else if (typeof modifier === 'boolean') {
        silent = modifier;
    }

    // Robust parsing for formula (e.g. "1d20", "1d20 + 5", 20)
    if (typeof formula === 'string') {
        const match = formula.match(/(\d+)?d(\d+)(?:\s*([+-])\s*(\d+))?/i);
        if (match) {
            sides = parseInt(match[2]);
            if (match[3] && match[4] && mod === 0) {
                const val = parseInt(match[4]);
                mod = match[3] === '+' ? val : -val;
            }
        } else {
            sides = parseInt(formula) || 20;
        }
    } else {
        sides = formula;
    }

    return new Promise((resolve) => {
        setRollingDice(null);
        setTimeout(() => {
            const roll = Math.floor(Math.random() * sides) + 1;
            const total = roll + mod;
            const isCrit = sides === 20 && roll === 20;
            const isFail = sides === 20 && roll === 1;

            setRollingDice({ die: formula, result: roll, id: Date.now(), total });
            setTimeout(() => {
                setDiceLog(prev => [{
                    id: Date.now(), 
                    die: lbl !== "Roll" ? lbl : formula, 
                    formulaDisplay: `d${sides}${mod !== 0 ? (mod > 0 ? `+${mod}` : mod) : ''}`,
                    result: total, 
                    natural: roll,
                    mod: mod
                }, ...prev]);
                
                if (!silent && effectiveRole !== 'dm') {
                    const modStr = mod >= 0 ? `+${mod}` : mod;
                    const html = `<div class="flex flex-col text-xs dice-roll-result" data-total="${total}"><span class="font-bold text-slate-400 uppercase mb-1">${lbl}</span><div class="flex items-baseline gap-1"><span class="text-base ${isCrit ? 'text-green-400 font-bold' : isFail ? 'text-red-400 font-bold' : 'text-white'}">d${sides} (${roll})</span>${mod !== 0 ? `<span class="text-slate-500 text-xs">${modStr}</span>` : ''}<span class="text-slate-500 text-xs">=</span><span class="text-xl font-bold text-amber-500">${total}</span></div></div>`;
                    sendChatMessage(html, 'roll-public');
                }

                resolve(total); 
            }, 1000);
            setTimeout(() => { setRollingDice(null); }, 4000); 
        }, 50);
    });
  };

  const generateLoc = async (type, note) => {
      const res = await queryAiService([{role:'user', content:`Create Location JSON {name, type, desc} for ${type} ${note}`}]);
      try { return JSON.parse(res.match(/\{[\s\S]*\}/)[0]); } catch(e) { return null; }
  };

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

      const isPc = type === 'pc';
      
      // Define Schemas
      const npcSchema = `{ name, race, class, cr, hp: { current, max }, ac, speed, stats: { STR, DEX, CON, INT, WIS, CHA }, senses: { darkvision, passivePerception }, customActions: [{ name, desc, type, hit, dmg }], features: [{ name, desc }], bio: { backstory, appearance } }`;
      const pcSchema = `{ name, race, class, background, alignment, stats: { STR, DEX, CON, INT, WIS, CHA }, hp, ac, speed, senses, skills: [], features: [], equipment: [], image_prompt }`;

      const finalAIPrompt = `
      ${systemPrompt}
      
      TASK: Output valid JSON matching this schema: ${isPc ? pcSchema : npcSchema}
      
      CRITICAL NPC INSTRUCTION: The content in the [BOOK] and [PLAYER NOTES] sections is a STAT BLOCK OVERRIDE. 
      - Use the provided AC, HP, Skill Mods, Spell Save DC, and Action/Spell usages (e.g., 1/day) LITERALLY. 
      - DO NOT invent derived stats (like full Wizard spell slots) unless the source is completely silent and a required field is missing.
      - For actions, prefer the customActions array for stat block entries.
      - Preserve the flavor text exactly as given in the context.

      ADDITIONAL USER INSTRUCTIONS: ${instructions}
      JSON ONLY. NO MARKDOWN WRAPPERS.
      `;

      const res = await queryAiService([{ role: 'user', content: finalAIPrompt }]);
      
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

  const handleHandoutSave = (h) => {
      const currentHandouts = data.handouts || [];
      const isExisting = h.id && currentHandouts.some(x => x.id === h.id);
      
      const updatedHandouts = isExisting 
          ? currentHandouts.map(x => x.id === h.id ? { ...h, timestamp: Date.now() } : x)
          : [{ ...h, id: h.id || Date.now(), timestamp: Date.now() }, ...currentHandouts];

      updateCampaign({ 
          handouts: updatedHandouts, 
          'campaign.activeHandout': h 
      });
      setShowHandoutCreator(false);
  };

  const handleHandoutDelete = (id) => {
      const updatedHandouts = (data.handouts || []).filter(h => h.id !== id);
      
      const changes = { handouts: updatedHandouts };
      if (data.campaign?.activeHandout?.id === id) {
          changes['campaign.activeHandout'] = null;
      }
      updateCampaign(changes);
  };

  const handleInitiative = (charOrToken, roll = null) => {
      // 1. If no manual roll provided, perform the roll automatically
      if (roll === null) {
          handleDiceRoll(20).then(result => {
              // Calculate initiative using the character's stored modifier
              const dex = charOrToken.stats?.dex || 10;
              const dexMod = Math.floor((dex - 10) / 2);
              const total = result + dexMod;
              
              // Recursive call with the final result
              handleInitiative(charOrToken, total);
          });
          return;
      }

      // 2. Proceed with updating the combat tracker
      const c = data.campaign?.combat;
      const combatState = (c && c.active) ? c : { active: true, round: 1, turn: 0, combatants: [] };
      
      let combatants = [...(combatState.combatants || [])];
      
      const uniqueId = charOrToken.tokenId || charOrToken.id;
      const idx = combatants.findIndex(x => x.id === uniqueId);

      // Check for re-roll attempt by player (if they already have initiative)
      if (effectiveRole === 'player' && idx > -1 && combatants[idx].init !== null && combatants[idx].init !== undefined) {
          if (!confirm(`New roll of ${roll} detected. Replace existing score of ${combatants[idx].init}?`)) return;
      }
      
      // FIX: Check if this ID belongs to a Player if type is not explicit
      const isPlayer = data.players?.some(p => p.id === (charOrToken.characterId || charOrToken.id));
      const finalType = charOrToken.type || (isPlayer ? 'pc' : 'npc');

      const entry = { 
          id: uniqueId, 
          characterId: charOrToken.characterId || charOrToken.id,
          name: charOrToken.name, 
          init: roll, 
          type: finalType, // Use the corrected type
          image: charOrToken.image || charOrToken.img
      };
      
      if (idx > -1) {
          combatants[idx] = { ...combatants[idx], ...entry };
      } else {
          combatants.push(entry);
      }
      
      combatants.sort((a,b) => (b.init || 0) - (a.init || 0));
      updateCloud({ ...data, campaign: { ...data.campaign, combat: { ...combatState, combatants } } }, true);
      
      // Announce Initiative to Chat
      if (effectiveRole !== 'dm') {
          sendChatMessage(`rolled Initiative: <span class="text-amber-500 font-bold">${roll}</span>`, 'roll-public');
      }
  };

  const updateCombatant = (id, changes) => {
      const c = data.campaign?.combat;
      if (!c) return;
      let combatants = [...c.combatants];
      let newTurn = c.turn;

      if (id === 'reorder') {
          // Identify who is currently taking their turn to prevent jumping
          const activeCombatantId = combatants[c.turn]?.id;
          combatants = changes;
          
          const newIdx = combatants.findIndex(x => x.id === activeCombatantId);
          if (newIdx > -1) newTurn = newIdx;
      } else {
          const idx = combatants.findIndex(x => x.id === id);
          if (idx > -1) {
              combatants[idx] = { ...combatants[idx], ...changes };
          }
      }
      
      updateCloud({ ...data, campaign: { ...data.campaign, combat: { ...c, combatants, turn: newTurn } } });
  };

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

  if (!data) return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Loading Campaign Data...</div>;


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
                       <button onClick={() => setShowHandoutCreator(true)} className="text-xs bg-amber-900/50 hover:bg-amber-800 px-3 py-1 rounded border border-amber-800 text-amber-200 flex items-center gap-2"><Icon name="scroll" size={14}/> <span>Handouts</span></button>
                   </div>
               </div>
           </div>

           {/* UPDATED: Changed compact padding from 50px to 52px to match the new MobileNav height exactly */}
           <div className={`flex-1 overflow-hidden relative p-0 md:pb-0 ${data.config?.mobileCompact ? 'pb-[52px]' : 'pb-[70px]'}`}>
             {/* 1. CHAT (Session) */}
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
              
              {/* 2. JOURNAL */}
              {currentView === 'journal' && <JournalView 
                  data={data} 
                  role={effectiveRole} 
                  userId={user?.uid} 
                  myCharId={data.assignments?.[user?.uid]}
                  onSavePage={saveJournalEntry} 
                  onDeletePage={deleteJournalEntryFunc} 
                  aiHelper={queryAiService} 
              />}
              
              {/* 3. TACTICAL MAP */}
              {currentView === 'map' && <TacticalMapView campaignCode={gameParams?.code} activeMapId={data.campaign?.activeMapId || 'test-map'} data={data} onOpenSheet={handleOpenSheet} role={effectiveRole} />}
              
              {/* 4. PARTY (PCs) */}
              {currentView === 'party' && <PartyView data={data} role={effectiveRole} activeChar={data.assignments?.[user?.uid]} updateCloud={updateCloud} savePlayer={savePlayer} deletePlayer={deletePlayer} setView={setCurrentView} user={user} aiHelper={queryAiService} onDiceRoll={handleDiceRoll} diceLog={diceLog} apiKey={apiKey} edition={data.config?.edition} onInitiative={handleInitiative} 
                  generatePlayer={generatePlayer} 
                  onLogAction={(msg) => {
                      if (effectiveRole !== 'dm') {
                          sendChatMessage(msg, 'chat-public');
                      }
                  }}
              />}

              {/* 5. BESTIARY (NPCs) */}
              {currentView === 'npcs' && <NpcView data={data} setData={setData} role={effectiveRole} updateCloud={updateCloud} generateNpc={generateNpc} setChatInput={setInputText} setView={setCurrentView} onPossess={setPossessedNpcId} aiHelper={queryAiService} apiKey={apiKey} edition={data.config?.edition} onDiceRoll={handleDiceRoll} diceLog={diceLog} onInitiative={handleInitiative} />}
              
              {currentView === 'sheet' && (
                  <div className="flex-1 h-full overflow-hidden">
                      <SheetContainer 
                          characterId={data.assignments?.[user?.uid]} 
                          onSave={savePlayer} 
                          onDiceRoll={handleDiceRoll} 
                          diceLog={diceLog}
                          // --- FIX: PASS ROLE HERE ---
                          role={effectiveRole}
                          // ---------------------------
                          isOwner={true}
                          onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                      />
                  </div>
              )}

              {/* 6. LORE (Bible) */}
              {currentView === 'lore' && <LoreView data={data} aiHelper={queryAiService} pdfChunks={loreChunks} setPdfChunks={setLoreChunks} onUploadLore={uploadLore} />}
              
              {/* 7. SETTINGS */}
              {currentView === 'settings' && <SettingsView 
                  data={data} setData={setData} 
                  apiKey={apiKey} setApiKey={setApiKey} 
                  role={effectiveRole} updateCloud={updateCloud} 
                  code={gameParams.code} user={user} 
                  onExit={() => { localStorage.removeItem('dm_last_code'); leaveCampaign(); }} 
                  aiProvider={aiProvider} setAiProvider={setAiProvider} 
                  openAiModel={openAiModel} setOpenAiModel={setOpenAiModel} 
                  puterModel={puterModel} setPuterModel={setPuterModel} 
                  banPlayer={banPlayer} kickPlayer={kickPlayer} unbanPlayer={unbanPlayer} 
              />}

              {/* SIDE PANELS */}
              {rightPanel.mode === 'sheet' && rightPanel.data && (
                  <SideSheet 
                      characterId={rightPanel.data} 
                      data={data} 
                      onClose={handleClosePanel} 
                      onSave={(char) => {
                          // Determine if it is a PC or NPC to route the save properly
                          const isPc = data.players?.some(p => String(p.id) === String(char.id));
                          if (isPc) {
                              savePlayer(char);
                          } else {
                              const newNpcs = (data.npcs || []).map(n => String(n.id) === String(char.id) ? char : n);
                              updateCloud({ ...data, npcs: newNpcs }, true);
                          }
                      }}
                      role={effectiveRole}
                      onDiceRoll={handleDiceRoll}
                      user={user}
                  />
              )}
            </div>
       </main>
       
       {showHandoutCreator && <HandoutEditor role={effectiveRole} campaignCode={gameParams?.code} savedHandouts={data.handouts || []} onSave={handleHandoutSave} onDelete={handleHandoutDelete} onCancel={() => setShowHandoutCreator(false)} onLocalReveal={(h) => { setLocalHandout(h); setShowHandoutCreator(false); }} />}
       {showHandout && (localHandout || data.campaign?.activeHandout) && (
           <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-hidden" onClick={() => { setShowHandout(false); setLocalHandout(null); }}>
               <div 
                   className={`max-w-2xl w-full rounded-xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden ${
                       (localHandout || data.campaign.activeHandout).theme === 'parchment' ? 'bg-[#f5e6c8] text-amber-900 border-4 border-amber-800' :
                       (localHandout || data.campaign.activeHandout).theme === 'stone' ? 'bg-[#1c1917] text-slate-300 border-4 border-slate-700' :
                       'bg-white text-black border-4 border-slate-200'
                   }`} 
                   onClick={e=>e.stopPropagation()}
               >
                   {activeHandoutImageUrl && (
                       <div className="w-full h-48 overflow-hidden border-b border-black/10 shrink-0">
                           <img src={activeHandoutImageUrl} className="w-full h-full object-cover opacity-40" alt=""/>
                       </div>
                   )}
                   <div className="flex-1 overflow-y-auto custom-scroll p-8">
                       <h2 className="fantasy-font text-3xl mb-6 border-b border-current/20 pb-2">{(localHandout || data.campaign.activeHandout).title}</h2>
                       {activeHandoutBlocks.length === 0 ? (
                           <div className="py-20 text-center animate-pulse italic opacity-50 font-bold">DECIPHERING SCRIPT...</div>
                       ) : (
                           <div className="handout-content-stream">
                               {activeHandoutBlocks.map((block, idx) => (
                                   block.type === 'image' ? (
                                       <ResolvedImage key={idx} id={block.id} />
                                   ) : (
                                       <div key={idx} className="mb-4 text-lg leading-relaxed" dangerouslySetInnerHTML={{__html: block.content}} />
                                   )
                               ))}
                           </div>
                       )}
                   </div>
                   <button onClick={() => { setShowHandout(false); setLocalHandout(null); }} className="absolute top-4 right-4 z-20 bg-black/20 hover:bg-black/40 text-white rounded-full p-1"><Icon name="x" size={24}/></button>
               </div>
           </div>
       )}
       <div className="fixed inset-0 pointer-events-none z-[99999]">{rollingDice && <DiceOverlay roll={rollingDice} />}</div>
       
       {/* Global Dice Tray Sidebar */}
       {showTools && (
           <div className="fixed z-[100] right-0 top-0 bottom-0 w-64 bg-slate-900/95 backdrop-blur border-l border-slate-700 p-4 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
               <div className="flex justify-between items-center mb-4">
                   <span className="fantasy-font text-amber-500 text-lg">Dice Roller</span>
                   <button onClick={() => setShowTools(false)} className="text-slate-400 hover:text-white">
                       <Icon name="x" size={24}/>
                   </button>
               </div>
           </div>
       )}

       {/* UPDATED: Pass compact prop */}
       <MobileNav view={currentView} setView={setCurrentView} compact={data.config?.mobileCompact} />
       {effectiveRole === 'dm' && !data.onboardingComplete && <OnboardingWizard onComplete={(wizData) => {
           const updates = { onboardingComplete: true };
           if (wizData) {
               updates['campaign.genesis'] = {
                   tone: wizData.tone || 'Heroic',
                   conflict: wizData.conflict || '',
                   campaignName: wizData.campaignName || 'New Campaign'
               };
           }
           updateCampaign(updates);
       }} aiHelper={queryAiService} />}
    </div>
  );
}

export default function App() {
    return (
        <CampaignProvider>
            <ToastProvider>
                <DungeonMindApp />
            </ToastProvider>
        </CampaignProvider>
    );
}