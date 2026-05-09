import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
import Icon from './components/Icon';
import Sidebar from './components/Sidebar';
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
import DiceTray from './components/DiceTray';
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

import { useNewCampaign } from './contexts/NewCampaignProvider';

function DungeonMindApp() {
    const context = useNewCampaign();
    const isCastMode = new URLSearchParams(window.location.search).get('cast') === 'true' || window.location.hash.includes('cast=true');
    
    // Safety guard: If context is not yet initialized, show loader
    if (!context) {
        return <div className="h-screen bg-slate-900 flex items-center justify-center text-amber-500 font-bold animate-pulse">Initializing Context...</div>;
    }

    const { 
        campaign: data, gameParams, joinCampaign, leaveCampaign, user,
        updateCampaign, updateToken,
        sendMessage, editMessage, deleteMessage
    } = context;
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
  const [isFullscreenImage, setIsFullscreenImage] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState(null); // NEW: Track active spell template
  const addLogEntry = useCharacterStore((state) => state.addLogEntry);
  const rollTimeoutRef = useRef(null);

  const [rightPanel, setRightPanel] = useState({ mode: 'closed', data: null });
  const [vttSidebar, setVttSidebar] = useState(null); // 'chat' | 'journal' | null
  
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

  useEffect(() => {
      const h = localHandout || data?.activeHandout;
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
                  const result = await retrieveChunkedMap(h.imageUrl);
                  resolvedHeader = result instanceof Blob ? URL.createObjectURL(result) : result;
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
  }, [data?.activeHandout, localHandout]);

  // Add a debug log right above it to see what's happening
  console.log("DEBUG ROLE:", { 
      myId: user?.uid, 
      dmList: data?.dmIds, 
      isMatch: data?.dmIds?.includes(user?.uid) 
  });

  const effectiveRole = (
    gameParams?.role === 'dm' || 
    (data?.dmIds && user?.uid && data.dmIds.map(id => String(id)).includes(String(user.uid)))
) ? 'dm' : 'player';

  // --- HELPER FUNCTIONS ---
  const handleDiceRoll = (formula, options = {}) => {
      try {
          let strFormula = String(formula).trim().toLowerCase();
          if (/^\d+$/.test(strFormula)) {
              strFormula = `1d${strFormula}`;
          }
          
          let totalNatural = 0;
          let rollsDetails = [];
          let mod = 0;

          // Parse formula: split by + or - and keep operators
          const parts = strFormula.replace(/\s+/g, '').split(/(?=[+-])/);
          if (parts.length === 0 || parts[0] === '') {
              console.error("Invalid dice formula", formula);
              return 0;
          }

          parts.forEach(part => {
              const sign = part.startsWith('-') ? -1 : 1;
              const cleanPart = part.replace(/^[+-]/, '');
              
              if (cleanPart.includes('d')) {
                  const [c, s] = cleanPart.split('d');
                  const count = parseInt(c) || 1;
                  const sides = parseInt(s) || 1;
                  
                  for(let i=0; i<count; i++) {
                      const r = Math.floor(Math.random() * sides) + 1;
                      rollsDetails.push({ side: sides, result: r, sign });
                      totalNatural += r * sign;
                  }
              } else if (cleanPart) {
                  mod += (parseInt(cleanPart) || 0) * sign;
              }
          });
          
          const rolls = rollsDetails.map(r => r.result * r.sign);
          const safeTotalNatural = Number.isFinite(totalNatural) ? totalNatural : 0;
          const safeResult = Number.isFinite(totalNatural + mod) ? (totalNatural + mod) : 0;


          // Debugging: Log the calculated values to console
          console.log("DEBUG: handleDiceRoll calculated values - totalNatural:", safeTotalNatural, "result:", safeResult);
          
          // Determine character name for display, prioritizing options.characterName
          const isDm = effectiveRole === 'dm';
          const myChar = data?.players?.find(p => p.ownerId === user?.uid);
          const defaultSenderName = possessedNpcId
              ? data?.npcs?.find(n => n.id === possessedNpcId)?.name
              : (isDm ? 'Dungeon Master' : (myChar?.name || user?.email?.split('@')[0] || 'Player'));
          const derivedCharacterName = options.characterName || defaultSenderName;

          const rollLog = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
              die: strFormula,
              formulaDisplay: options.alias || strFormula,
              natural: safeTotalNatural,
              rolls: rolls,
              mod: mod,
              result: safeResult,
              characterName: derivedCharacterName, // Add to log for consistency
          };
          
          setDiceLog(prev => [rollLog, ...prev].slice(0, 50));
          
          const isUseAction = options.actionType === 'use' || rollsDetails.some(r => r.side === 0) || strFormula === '1d0';

          if (!isUseAction) {
              const newAnimations = rollsDetails.map(r => ({ die: r.side, result: r.result }));
              if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
              setRollingDice(newAnimations);
              rollTimeoutRef.current = setTimeout(() => setRollingDice(null), 4000);

              const isCrit = rollsDetails.length === 1 && rollsDetails[0].side === 20 && rollsDetails[0].result === 20;
              const isFumble = rollsDetails.length === 1 && rollsDetails[0].side === 20 && rollsDetails[0].result === 1;
              const naturalClass = isCrit ? "text-green-400" : isFumble ? "text-red-400" : "text-slate-300";
              const rollsStr = rolls.length > 1 ? rolls.join(' + ').replace(/\+ -/g, '- ') : rolls[0];
              const toastHtml = `
                    <div class="space-y-1 text-left w-full">
                        <div class="font-bold text-amber-500 border-b border-amber-900/50 pb-1 flex justify-between">
                            <span>${options.weaponName || options.alias || 'Dice Roll'}</span>
                            <span class="text-xs text-slate-500 font-normal self-end">${options.actionType || 'Roll'}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300 mt-1 w-full">
                            <span class="bg-slate-800 px-2 py-1 rounded text-xs font-mono break-all">${strFormula}</span>
                            <span>➜</span>
                            <span class="font-mono text-xs ${naturalClass} break-words">[${rollsStr}]${mod !== 0 ? (mod > 0 ? '+' : '') + mod : ''}</span>
                            <span>=</span>
                            <span class="text-xl font-bold ${naturalClass.includes('green') ? 'text-green-400 glow' : naturalClass.includes('red') ? 'text-red-500' : 'text-white'}">${safeResult}</span>
                        </div>
                    </div>
              `;
              if (addLogEntry) {
                  addLogEntry({ message: toastHtml, id: Date.now() });
              }
          } else if (addLogEntry) {
              // Simpler log for 'use' actions
              const useHtml = `
                    <div class="space-y-1 text-left w-full">
                        <div class="font-bold text-indigo-300">Used: ${options.alias || 'Feature'}</div>
                        ${options.description ? `<div class="text-xs text-slate-400 mt-1 whitespace-pre-wrap">${options.description}</div>` : ''}
                    </div>
              `;
              addLogEntry({ message: useHtml, id: Date.now() });
          }

          const payload = {
              formula: strFormula,
              naturalRoll: safeTotalNatural,
              rolls: rolls,
              modifier: mod,
              total: safeResult,
              characterName: derivedCharacterName,
              isDmRoll: isDm,
              actionType: options.actionType || null,
              weaponName: options.weaponName || null,
              damageType: options.damageType || null,
              alias: options.alias || null,
              description: options.description || null
          };

          sendMessage({
              content: JSON.stringify(payload),
              type: isDm ? 'roll-private' : 'roll-public',
              senderId: user?.uid || 'anon',
              senderName: derivedCharacterName,
              targetId: null,
              timestamp: Date.now()
          });
          
          return safeResult;
      } catch (err) {
          console.error("Dice error", err);
          return 0;
      }
  };

  const queryAiService = async (messages) => {
      console.log('queryAiService called with provider:', aiProvider);
      
      try {
          if (aiProvider === 'puter') {
              if (!window.puter) {
                  throw new Error("Puter.js script is missing or blocked.");
              }
              // Puter expects the chat format
              const response = await window.puter.ai.chat(messages, { model: puterModel });
              return response?.message?.content || response;
          }
          
          // Add OpenAI / Gemini logic here later
          return "AI Provider not fully configured yet.";
          
      } catch (error) {
          console.error("AI Service Error:", error);
          // Return a safe string so Firebase doesn't crash
          return `[System: The AI is currently unreachable. Error: ${error.message}]`;
      }
  };

  const handleInitiative = () => console.log('handleInitiative called');

  // Strict Template to mirror dndBeyondParser.js output
  const DND_BEYOND_SCHEMA = JSON.stringify({
      name: "string", avatarUrl: "", race: "string", class: "string", level: 1, xp: 0,
      classes: [{ name: "string", subclass: null, level: 1 }],
      hp: { max: 10, current: 10, temp: 0 },
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      modifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      speed: 30, profBonus: 2, initiative: 0, ac: 10, acFormula: "10 + DEX",
      proficiencies: { armor: "string", weapons: "string", tools: "string", languages: "string" },
      skills: { Acrobatics: false, Athletics: true },
      savingThrows: { str: true, dex: false, con: false, int: false, wis: false, cha: false },
      defenses: { resistances: "", immunities: "", vulnerabilities: "" },
      inventory: [{ name: "Weapon", quantity: 1, description: "", equipped: true, weight: 2, combat: { hit: 5, dmg: "1d8+3", type: "Action", category: "Attack", range: "5 ft", notes: "Slashing" } }],
      customActions: [{ name: "Action", desc: "Desc", hit: "5", dmg: "1d6", type: "Action", category: "Feature" }],
      features: [{ name: "Feature", description: "Desc", source: "Class" }],
      spells: [], spellSlots: {},
      bio: { appearance: "", traits: "", ideals: "", bonds: "", flaws: "", backstory: "" }
  });

  // Failsafe: LLMs are bad at math. Recalculate basic modifiers before passing the sheet on.
  const sanitizeAiCharacter = (char) => {
      if (!char) return null;
      if (char.stats) {
          char.modifiers = {
              str: Math.floor(((char.stats.str || 10) - 10) / 2),
              dex: Math.floor(((char.stats.dex || 10) - 10) / 2),
              con: Math.floor(((char.stats.con || 10) - 10) / 2),
              int: Math.floor(((char.stats.int || 10) - 10) / 2),
              wis: Math.floor(((char.stats.wis || 10) - 10) / 2),
              cha: Math.floor(((char.stats.cha || 10) - 10) / 2)
          };
      }
      if (typeof char.hp === 'number') char.hp = { max: char.hp, current: char.hp, temp: 0 };
      else if (!char.hp) char.hp = { max: 10, current: 10, temp: 0 };
      
      char.conditions = char.conditions || [];
      char.spellSlots = char.spellSlots || {};
      return char;
  };

  // Helper to generate an image and convert it to a Base64 string for storage
  const generatePortrait = async (char) => {
      if (window.puter && aiProvider === 'puter') {
          try {
              const race = char.race || 'Humanoid';
              const charClass = char.class || 'Creature';
              const appearance = char.bio?.appearance || '';
              
              const imagePrompt = `D&D Beyond official digital character illustration of a ${race} ${charClass}. ${appearance.substring(0, 150)}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
              
              const imgEl = await window.puter.ai.txt2img(imagePrompt, { model: 'dall-e-3' });
              const response = await fetch(imgEl.src);
              const blob = await response.blob();
              return await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
              });
          } catch (e) {
              console.error("Image generation failed", e);
          }
      }
      return "";
  };

  const generatePlayer = async (name, contextStr) => {
      const prompt = `Generate a D&D 5e player character JSON for ${name}. Context: ${contextStr}.\nCRITICAL INSTRUCTION: Output ONLY pure JSON matching EXACTLY this schema. Do not add markdown or backticks:\n${DND_BEYOND_SCHEMA}`;
      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { 
          const char = sanitizeAiCharacter(JSON.parse(res.match(/\{[\s\S]*\}/)[0])); 
          if (char) {
              const img = await generatePortrait(char);
              if (img) { char.image = img; char.avatarUrl = img; }
          }
          return char;
      } 
      catch (e) { return null; }
  };

  const generateNpc = async (name, contextStr) => {
      const prompt = `Generate a D&D 5e monster/NPC JSON for ${name}. Context: ${contextStr}.\nCRITICAL INSTRUCTION: Output ONLY pure JSON matching EXACTLY this schema. Do not add markdown or backticks:\n${DND_BEYOND_SCHEMA}`;
      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { 
          const char = sanitizeAiCharacter(JSON.parse(res.match(/\{[\s\S]*\}/)[0])); 
          if (char) {
              const img = await generatePortrait(char);
              if (img) { char.image = img; char.avatarUrl = img; }
          }
          return char;
      } 
      catch (e) { return null; }
  };

  const savePlayer = () => console.log('savePlayer called');
  const handleHandoutSave = () => console.log('handleHandoutSave called');
  const handleHandoutDelete = () => console.log('handleHandoutDelete called');
  const updateCloud = () => console.log('updateCloud called');
  
  const sendChatMessage = (content, type = 'chat-public', targetId = null) => {
      const isDm = data?.dmIds?.includes(user?.uid);
      const myChar = data?.players?.find(p => p.ownerId === user?.uid);
      sendMessage({
          content,
          type,
          role: type.includes('ai') ? 'user' : (isDm ? 'dm' : 'player'),
          senderId: user?.uid || 'anon',
          senderName: possessedNpcId ? data?.npcs?.find(n=>n.id===possessedNpcId)?.name : (isDm ? 'Dungeon Master' : (myChar?.name || user?.email?.split('@')[0] || 'Player')),
          targetId: targetId || null,
          timestamp: Date.now()
      });
  };

  const isConnected = true; // Placeholder for connection status


    // 1. If we are still checking if a user is logged in (Initial load)
    if (user === undefined) { 
        return (
            <div className="h-screen bg-slate-900 flex flex-col items-center justify-center text-amber-500 font-bold">
                <div className="animate-pulse">Summoning DungeonMind...</div>
                <div className="text-[10px] text-slate-600 mt-2 font-mono">Checking Authentication</div>
            </div>
        );
    }

    // 2. If NO game is active (We are at the Lobby)
    if (!gameParams) {
        // Note: user might be null here if not logged in; Lobby handles the login button
        return <Lobby user={user} />;
    }

    // 3. If a game is active but no DATA has arrived from Firestore yet
    if (!data) {
        return (
            <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
                <div className="flex flex-col items-center gap-4 bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl">
                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-center">
                        <h2 className="text-amber-500 font-bold text-xl">Entering Realm {gameParams?.code}</h2>
                        <p className="text-slate-500 text-xs mt-1 font-mono">Status: Awaiting Archive Data...</p>
                    </div>

                    {/* SAFETY VALVE 1: If it hangs for more than 3 seconds, show these */}
                    <div className="flex flex-col gap-3 w-full mt-4">
                        {gameParams?.role === 'dm' && (
                            <button 
                                onClick={() => updateCampaign({
                                    hostId: user.uid,
                                    dmIds: [user.uid],
                                    onboardingComplete: false,
                                    campaign: { genesis: { campaignName: 'New Adventure' } }
                                })}
                                className="w-full px-6 py-2 bg-amber-600 text-white rounded font-bold hover:bg-amber-500 transition-all"
                            >
                                Force Forge Realm
                            </button>
                        )}
                        
                        <button 
                            onClick={leaveCampaign}
                            className="w-full px-6 py-2 bg-slate-700 text-slate-300 rounded font-bold hover:bg-slate-600 transition-all flex items-center justify-center gap-2"
                        >
                            <Icon name="arrow-left" size={16}/> Return to Lobby
                        </button>
                    </div>
                </div>
            </div>
        );
    }


  return (
    <div className="fixed inset-0 w-full h-full flex flex-col md:flex-row bg-slate-900 text-slate-200 font-sans overflow-hidden pt-safe pb-safe pl-safe pr-safe">
       {!isCastMode && <Sidebar view={currentView} setView={setCurrentView} onExit={leaveCampaign} />}
       <main className="flex-1 flex flex-col overflow-hidden relative w-full h-full">
           {currentView !== 'map' && !isCastMode && (
               <div className="shrink-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 pt-safe z-50">
                   <div className="h-14 flex items-center justify-between px-4">
                       <div className="flex gap-2 items-center">
                           <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] ${gameParams?.isOffline || !isConnected ? 'bg-slate-500' : 'bg-green-500'}`}></div>
                           <span className="text-sm font-bold text-amber-500 truncate fantasy-font tracking-wide">{gameParams?.code} • {possessedNpcId ? "POSSESSING NPC" : data?.campaign?.location}</span>
                       </div>
                       <div className="flex gap-2">
                           <button onClick={() => setShowHandoutCreator(true)} className="text-xs bg-amber-900/50 hover:bg-amber-800 px-3 py-1 rounded border border-amber-800 text-amber-200 flex items-center gap-2"><Icon name="scroll" size={14}/> <span>Handouts</span></button>
                       </div>
                   </div>
               </div>
           )}

           {/* UPDATED: Changed compact padding from 50px to 52px to match the new MobileNav height exactly */}
           <div className={`flex-1 overflow-hidden relative p-0 md:pb-0 ${isCastMode ? 'pb-0' : (data.config?.mobileCompact ? 'pb-[52px]' : 'pb-[70px]')}`}>
             {/* 1. CHAT (Session) */}
              {currentView === 'session' && (
                  <SessionView 
                      inputText={inputText} 
                      setInputText={setInputText} 
                      onSendMessage={sendChatMessage} 
                      onEditMessage={editMessage}
                      onDeleteMessage={deleteMessage}
                      isLoading={isLoading} 
                      showTools={showTools} 
                      setShowTools={setShowTools} 
                      diceLog={diceLog} 
                      handleDiceRoll={handleDiceRoll} 
                      aiHelper={queryAiService}
                      role={effectiveRole}
                  />
              )}
              
              {/* 2. JOURNAL */}
              {currentView === 'journal' && (
                  <JournalView 
                      role={effectiveRole}
                      userId={user?.uid}
                      aiHelper={queryAiService} 
                  />
              )}
              
              {/* 3. TACTICAL MAP */}
              {currentView === 'map' && (
                  <TacticalMapView 
                      campaignCode={gameParams?.code} 
                      activeMapId={data.activeMapId || 'test-map'} 
                      onOpenSheet={handleOpenSheet} 
                      role={effectiveRole} 
                      onOpenHandouts={() => setShowHandoutCreator(true)}
                      onOpenChat={() => setVttSidebar('chat')}
                      onOpenJournal={() => setVttSidebar('journal')}
                      onOpenDiceTray={() => setShowTools(p => !p)}
                  />
              )}
              
              {/* 4. PARTY (PCs) */}
              {currentView === 'party' && <PartyView 
                  data={data}
                  user={user}
                  role={effectiveRole}
                  setView={setCurrentView} 
                  aiHelper={queryAiService} 
                  onDiceRoll={handleDiceRoll} 
                  diceLog={diceLog} 
                  apiKey={apiKey} 
                  edition={data.config?.edition} 
                  onInitiative={handleInitiative} 
                  generatePlayer={generatePlayer} 
                  onOpenDiceTray={() => setShowTools(p => !p)}
                  onLogAction={(msg) => {
                      if (effectiveRole !== 'dm') {
                          sendChatMessage(msg, 'chat-public');
                      }
                  }}
              />}

              {/* 5. BESTIARY (NPCs) */}
              {currentView === 'npcs' && <NpcView 
                  data={data}
                  role={effectiveRole}
                  generateNpc={generateNpc} 
                  setChatInput={setInputText} 
                  setView={setCurrentView} 
                  aiHelper={queryAiService} 
                  apiKey={apiKey} 
                  edition={data.config?.edition} 
                  onDiceRoll={handleDiceRoll} 
                  diceLog={diceLog} 
                  onInitiative={handleInitiative} 
              />}
              
              {currentView === 'sheet' && (
                  <div className="flex-1 h-full overflow-hidden">
                      <SheetContainer 
                          character={data.players?.find(p => String(p.id) === String(data.assignments?.[user?.uid])) || data.players?.find(p => p.ownerId === user?.uid)} 
                          onSave={savePlayer} 
                          onDiceRoll={handleDiceRoll} 
                          diceLog={diceLog}
                          // --- FIX: PASS ROLE HERE ---
                          role={effectiveRole}
                          // ---------------------------
                          isOwner={true}
                          onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                          onOpenDiceTray={() => setShowTools(p => !p)}
                      />
                  </div>
              )}

              {/* 6. LORE (Bible) */}
              {currentView === 'lore' && <LoreView aiHelper={queryAiService} />}
              
              {/* 7. SETTINGS */}
              {currentView === 'settings' && <SettingsView 
                  apiKey={apiKey} setApiKey={setApiKey} 
                  role={effectiveRole}
                  user={user}
                  code={gameParams.code} 
                  onExit={leaveCampaign} 
                  aiProvider={aiProvider} setAiProvider={setAiProvider} 
                  openAiModel={openAiModel} setOpenAiModel={setOpenAiModel} 
                  puterModel={puterModel} setPuterModel={setPuterModel} 
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
                      onOpenDiceTray={() => setShowTools(p => !p)}
                  />
              )}

              {/* VTT SIDEBARS */}
              {!isCastMode && vttSidebar === 'chat' && currentView === 'map' && (
                  <div className="absolute top-0 right-0 bottom-0 w-[350px] bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
                      <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
                          <h3 className="font-bold text-indigo-500 flex items-center gap-2"><Icon name="message-circle" size={18}/> Chat</h3>
                          <button onClick={() => setVttSidebar(null)} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                      </div>
                      <div className="flex-1 relative overflow-hidden">
                          <SessionView 
                              inputText={inputText} 
                              setInputText={setInputText} 
                              onSendMessage={sendChatMessage} 
                              onEditMessage={editMessage}
                              onDeleteMessage={deleteMessage}
                              isLoading={isLoading} 
                              showTools={showTools} 
                              setShowTools={setShowTools} 
                              diceLog={diceLog} 
                              handleDiceRoll={handleDiceRoll} 
                              aiHelper={queryAiService}
                              role={effectiveRole}
                              compact={true}
                          />
                      </div>
                  </div>
              )}

              {!isCastMode && vttSidebar === 'journal' && currentView === 'map' && (
                  <div className="absolute top-0 right-0 bottom-0 w-[500px] max-w-full bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
                      <JournalView role={effectiveRole} userId={user?.uid} aiHelper={queryAiService} onClose={() => setVttSidebar(null)} />
                  </div>
              )}
            </div>
       </main>
       
       {showHandoutCreator && <HandoutEditor role={effectiveRole} campaignCode={gameParams?.code} savedHandouts={data.handouts || []} onSave={handleHandoutSave} onDelete={handleHandoutDelete} onCancel={() => setShowHandoutCreator(false)} onLocalReveal={(h) => { setLocalHandout(h); setShowHandoutCreator(false); }} />}
       {showHandout && (localHandout || data?.activeHandout) && (
           <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-hidden" onClick={() => { setShowHandout(false); setLocalHandout(null); }}>
               <div 
                   className={`max-w-4xl w-full rounded-xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden ${
                       (localHandout || data?.activeHandout).theme === 'parchment' ? 'bg-[#f5e6c8] text-amber-900 border-4 border-amber-800' :
                       (localHandout || data?.activeHandout).theme === 'stone' ? 'bg-[#1c1917] text-slate-300 border-4 border-slate-700' :
                       'bg-white text-black border-4 border-slate-200'
                   }`} 
                   onClick={e=>e.stopPropagation()}
               >
                   <div className="flex-1 overflow-y-auto custom-scroll w-full h-full relative flex flex-col">
                       {((localHandout || data?.activeHandout)?.title || ((localHandout || data?.activeHandout).content && (localHandout || data?.activeHandout).content !== '<p><br></p>')) && (
                           <div className="px-6 md:px-10 pt-6 md:pt-10 shrink-0">
                               {((localHandout || data?.activeHandout)?.title) && (
                                   <h2 className={`fantasy-font text-3xl border-b border-current/20 pb-2 ${((localHandout || data?.activeHandout).content && (localHandout || data?.activeHandout).content !== '<p><br></p>') ? 'mb-4' : 'mb-2'}`}>{(localHandout || data?.activeHandout)?.title}</h2>
                               )}
                               {((localHandout || data?.activeHandout).content && (localHandout || data?.activeHandout).content !== '<p><br></p>') && (
                                   activeHandoutBlocks.length === 0 ? (
                                       <div className="py-10 text-center animate-pulse italic opacity-50 font-bold">DECIPHERING SCRIPT...</div>
                                   ) : (
                                       <div className="handout-content-stream pb-2">
                                           {activeHandoutBlocks.map((block, idx) => (
                                               block.type === 'image' ? (
                                                   <ResolvedImage key={idx} id={block.id} />
                                               ) : (
                                                   <div key={idx} className="mb-4 text-lg leading-relaxed" dangerouslySetInnerHTML={{__html: block.content}} />
                                               )
                                           ))}
                                       </div>
                                   )
                               )}
                           </div>
                       )}
                       
                       {activeHandoutImageUrl && (
                           <div className={`w-full flex justify-center px-6 md:px-10 pb-6 md:pb-10 ${((localHandout || data?.activeHandout)?.title || ((localHandout || data?.activeHandout).content && (localHandout || data?.activeHandout).content !== '<p><br></p>')) ? 'pt-2' : 'pt-6 md:pt-10'}`}>
                               <div className="relative inline-block max-w-full">
                                   <img src={activeHandoutImageUrl} className={`max-w-full object-contain drop-shadow-2xl rounded-md ${((localHandout || data?.activeHandout)?.title || ((localHandout || data?.activeHandout).content && (localHandout || data?.activeHandout).content !== '<p><br></p>')) ? 'max-h-[55vh]' : 'max-h-[75vh]'}`} alt="Handout Image"/>
                                   <button 
                                       onClick={(e) => { e.stopPropagation(); setIsFullscreenImage(true); }} 
                                       className="absolute top-2 right-2 bg-black/60 hover:bg-black/90 text-white rounded p-1.5 transition-colors backdrop-blur-sm group shadow-md border border-white/10"
                                       title="View Fullscreen"
                                   >
                                       <Icon name="maximize" size={16} className="opacity-70 group-hover:opacity-100" />
                                   </button>
                               </div>
                           </div>
                       )}
                   </div>
                   <button onClick={() => { setShowHandout(false); setLocalHandout(null); setIsFullscreenImage(false); }} className="absolute top-4 right-4 z-20 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors"><Icon name="x" size={24}/></button>
               </div>
               
               {/* Fullscreen Image Overlay */}
               {isFullscreenImage && (
                   <div 
                       className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
                       onClick={(e) => { e.stopPropagation(); setIsFullscreenImage(false); }}
                   >
                       <img 
                           src={activeHandoutImageUrl} 
                           className="max-w-full max-h-full object-contain drop-shadow-2xl animate-in zoom-in-95 duration-200" 
                           alt="Fullscreen Handout"
                       />
                       <button 
                           onClick={(e) => { e.stopPropagation(); setIsFullscreenImage(false); }} 
                           className="absolute top-6 right-6 bg-black/50 hover:bg-white/20 text-white rounded-full p-3 transition-colors border border-white/20"
                       >
                           <Icon name="x" size={28}/>
                       </button>
                   </div>
               )}
           </div>
       )}
       <div className="fixed inset-0 pointer-events-none z-[99999]">{rollingDice && <DiceOverlay roll={rollingDice} />}</div>
       
       {/* Global Dice Tray Sidebar */}
       {!isCastMode && showTools && (
           <div className="fixed top-0 right-0 bottom-0 w-80 max-w-full bg-slate-900 border-l border-slate-700 shadow-2xl z-[100] flex flex-col animate-in slide-in-from-right duration-300">
               <DiceTray diceLog={diceLog} handleDiceRoll={handleDiceRoll} onClose={() => setShowTools(false)} />
           </div>
       )}

       {/* UPDATED: Pass compact prop */}
       {!isCastMode && <MobileNav view={currentView} setView={setCurrentView} compact={data.config?.mobileCompact} />}
       {!isCastMode && effectiveRole === 'dm' && !data.onboardingComplete && (
           <OnboardingWizard 
               onComplete={(wizData) => {
                   // This is the signal that turns off the wizard and starts the game
                   updateCampaign({ 
                       onboardingComplete: true,
                       'campaign.genesis': {
                           tone: wizData?.tone || 'Heroic',
                           conflict: wizData?.conflict || 'Evil Arising',
                           campaignName: wizData?.campaignName || 'New Campaign'
                       }
                   });
               }} 
               aiHelper={queryAiService} 
           />
       )}
    </div>
  );
}

import { NewCampaignProvider } from './contexts/NewCampaignProvider';

function App() {
    return (
        <NewCampaignProvider>
            <ToastProvider>
                <DungeonMindApp />
            </ToastProvider>
        </NewCampaignProvider>
    );
}

export default App;