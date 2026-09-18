import React, { useState, useEffect, useRef } from 'react';
import * as fb from './firebase'; 
import Icon from './components/Icon';
import Sidebar from './components/Sidebar';
import { ToastProvider, useToast } from './components/ToastProvider';
import { DialogProvider } from './components/DialogProvider';
import MobileNav from './components/MobileNav';
import DungeonmindLogo from './components/DungeonmindLogo';
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
import ModuleHub from './components/ModuleHub';
import ResolvedImage from './components/ResolvedImage';
import HandoutEditor from './components/HandoutEditor';
import LoreView from './components/LoreView';
import { useCharacterStore } from './stores/useCharacterStore'; 
import { retrieveContext, buildPrompt, buildCastList } from './utils/loreEngine';
import { retrieveChunkedMap, resolveChunkedHtml, parseHandoutBody } from './utils/storageUtils';
import { searchGithubModels } from './utils/miniManifest';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';

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
      'module': 'module',
      'settings': 'settings'
  };

  // 2. Initialize view based on current URL
  const getInitialView = () => {
      const path = window.location.pathname.replace(BASE_PATH, '').replace(/^\//, '').split('/')[0];
      const foundEntry = Object.entries(VIEW_SLUGS).find(([id, slug]) => slug === path);
      return foundEntry ? foundEntry[0] : 'session';
  };

  const [currentView, setCurrentView] = useState(getInitialView);
  const [previousView, setPreviousView] = useState('session');
  const [partyInitialAction, setPartyInitialAction] = useState(null);
  const [hasVisitedMap, setHasVisitedMap] = useState(() => getInitialView() === 'map');

  // Keep TacticalMapView mounted once visited for 0ms instant tab switching
  useEffect(() => {
      if (currentView === 'map') {
          setHasVisitedMap(true);
      }
  }, [currentView]);

  // Track previous view for VTT Back button
  useEffect(() => {
      setPreviousView(prev => {
          if (currentView !== 'map') return currentView;
          return prev;
      });
  }, [currentView]);

  // 3. Update URL when view changes
  useEffect(() => {
      if (!gameParams) {
          const dashboardUrl = `${BASE_PATH}/dashboard`;
          if (window.location.pathname !== dashboardUrl) {
              window.history.replaceState({ view: 'dashboard' }, document.title, dashboardUrl + window.location.search);
          }
          return;
      }

      const slug = VIEW_SLUGS[currentView] || 'session';
      const url = `${BASE_PATH}/${slug}`;
      
      // Only push if different (prevents loop)
      if (window.location.pathname !== url) {
          window.history.pushState({ view: currentView }, '', url + window.location.search);
      }
  }, [currentView, gameParams]);

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
  const [rollMode, setRollMode] = useState(() => localStorage.getItem('roll_mode'));
  const addLogEntry = useCharacterStore((state) => state.addLogEntry);
  const rollTimeoutRef = useRef(null);

  const [rightPanel, setRightPanel] = useState({ mode: 'closed', data: null });
  const [vttSidebar, setVttSidebar] = useState(null); // 'chat' | 'journal' | null
  const [joinRequests, setJoinRequests] = useState([]);

  const effectiveRole = (
    gameParams?.role === 'dm' || 
    (data?.dmIds && user?.uid && data.dmIds.map(id => String(id)).includes(String(user.uid)))
  ) ? 'dm' : 'player';

  // DM Waiting Room Listener
  useEffect(() => {
      if (effectiveRole !== 'dm' || !gameParams?.code) return;
      const q = query(collection(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'joinRequests'), where('status', '==', 'pending'));
      const unsub = onSnapshot(q, (snapshot) => {
          const reqs = [];
          snapshot.forEach(d => reqs.push({ id: d.id, ...d.data() }));
          setJoinRequests(reqs);
      });
      return () => unsub();
  }, [effectiveRole, gameParams?.code]);
  
  const closeAllSidebars = () => {
      setRightPanel({ mode: 'closed', data: null });
      setVttSidebar(null);
      setShowTools(false);
      setShowHandoutCreator(false);
  };

  const handleOpenSheet = (id) => { closeAllSidebars(); setRightPanel({ mode: 'sheet', data: id }); };
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

  const [hideInviteCode, setHideInviteCode] = useState(() => localStorage.getItem('dm_hide_invite_code') === 'true');
  useEffect(() => { localStorage.setItem('dm_hide_invite_code', hideInviteCode); }, [hideInviteCode]);

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

          let droppedRollsDetails = [];

          parts.forEach(part => {
              const sign = part.startsWith('-') ? -1 : 1;
              const cleanPart = part.replace(/^[+-]/, '');
              
              if (cleanPart.includes('d')) {
                  const match = cleanPart.match(/^(\d*)d(\d+)(k[hl]\d+)?$/i);
                  if (match) {
                      const count = parseInt(match[1]) || 1;
                      const sides = parseInt(match[2]) || 1;
                      const keepMod = match[3];

                      let localRolls = [];
                      for(let i=0; i<count; i++) {
                          const r = Math.floor(Math.random() * sides) + 1;
                          localRolls.push({ side: sides, result: r, sign });
                      }

                      if (keepMod) {
                          const keepType = keepMod.substring(0, 2).toLowerCase();
                          const keepCount = parseInt(keepMod.substring(2)) || 1;
                          
                          let sorted = [...localRolls].sort((a, b) => 
                              keepType === 'kh' ? b.result - a.result : a.result - b.result
                          );
                          
                          const kept = sorted.slice(0, keepCount);
                          const dropped = sorted.slice(keepCount);
                          
                          localRolls = kept;
                          droppedRollsDetails.push(...dropped);
                      }

                      localRolls.forEach(rollObj => {
                          rollsDetails.push(rollObj);
                          totalNatural += rollObj.result * rollObj.sign;
                      });
                  } else {
                      const [c, s] = cleanPart.split('d');
                      const count = parseInt(c) || 1;
                      const sides = parseInt(s) || 1;
                      
                      for(let i=0; i<count; i++) {
                          const r = Math.floor(Math.random() * sides) + 1;
                          rollsDetails.push({ side: sides, result: r, sign });
                          totalNatural += r * sign;
                      }
                  }
              } else if (cleanPart) {
                  mod += (parseInt(cleanPart) || 0) * sign;
              }
          });
          
          const rolls = rollsDetails.map(r => r.result * r.sign);
          const safeTotalNatural = Number.isFinite(totalNatural) ? totalNatural : 0;
          const safeResult = Number.isFinite(totalNatural + mod) ? (totalNatural + mod) : 0;

          let isRollPrivate = false;
          const currentRollMode = rollMode || (effectiveRole === 'dm' ? 'private' : 'public');
          if (options.isPrivate !== undefined) {
              isRollPrivate = options.isPrivate;
          } else {
              isRollPrivate = currentRollMode === 'private';
          }


          // Determine character name for display, prioritizing options.characterName
          const isDm = effectiveRole === 'dm';
          const myChar = data?.players?.find(p => p.ownerId === user?.uid);
          const defaultSenderName = possessedNpcId
              ? data?.npcs?.find(n => n.id === possessedNpcId)?.name
              : (isDm ? 'Dungeon Master' : (myChar?.name || user?.displayName || 'Player'));
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

          // Determine if we have a critical hit or fumble based ONLY on kept dice (which is what rollsDetails contains)
          const keptD20s = rollsDetails.filter(r => r.side === 20);
          const isCrit = !isUseAction && keptD20s.some(r => r.result === 20);
          const isFumble = !isUseAction && keptD20s.some(r => r.result === 1) && !isCrit;
          
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
              damageRoll: options.damageRoll || null,
              isCrit: isCrit,
              isFumble: isFumble,
              alias: options.alias || null,
              description: options.description || null,
              type: isRollPrivate ? 'roll-private' : 'roll-public'
          };

          if (!isUseAction) {
              const overlayPayload = {
                  ...payload,
                  diceAnimations: [...rollsDetails, ...droppedRollsDetails].map(r => ({ die: r.side, result: r.result }))
              };

              if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
              setRollingDice(overlayPayload);
              rollTimeoutRef.current = setTimeout(() => setRollingDice(null), 4000);

              const naturalClass = isCrit ? "text-green-400" : isFumble ? "text-red-400" : "text-slate-300";
              const rollsStr = rolls.length > 1 ? rolls.join(' + ').replace(/\+ -/g, '- ') : rolls[0];
              
              let droppedHtml = '';
              if (droppedRollsDetails.length > 0) {
                  const droppedStr = droppedRollsDetails.map(r => r.result).join(', ');
                  droppedHtml = `<span class="text-slate-500 line-through text-[10px] ml-1">(${droppedStr})</span>`;
              }

              const isCoinRoll = strFormula === '1d2' || strFormula === 'd2' || (typeof options.alias === 'string' && options.alias.toLowerCase().includes('coin'));

              const toastHtml = `
                    <div class="space-y-1 text-left w-full">
                        <div class="font-bold text-amber-500 border-b border-amber-900/50 pb-1 flex justify-between">
                            <span>${options.weaponName || options.alias || 'Dice Roll'}</span>
                            <span class="text-xs text-slate-500 font-normal self-end">${options.actionType || 'Roll'}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300 mt-1 w-full">
                            <span class="bg-slate-800 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-widest text-slate-400 break-all">${strFormula}</span>
                            <span class="text-slate-500">➜</span>
                            <span class="font-mono text-[10px] uppercase tracking-widest ${naturalClass} break-words">[${rollsStr}]${droppedHtml}${mod !== 0 ? (mod > 0 ? '+' : '') + mod : ''}</span>
                            <span class="text-slate-500">=</span>
                            <span class="text-xl font-bold ${isCoinRoll ? 'text-amber-400' : (naturalClass.includes('green') ? 'text-green-400 glow' : naturalClass.includes('red') ? 'text-red-500' : 'text-white')}">${isCoinRoll ? (safeResult === 1 ? '🪙 Heads' : '🪙 Tails') : safeResult}</span>
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

          if (!options.skipChat && sendMessage) {
              sendMessage({
                  content: JSON.stringify(payload),
                  type: payload.type,
                  senderId: user?.uid || 'anon',
                  senderName: derivedCharacterName,
                  targetId: null,
                  timestamp: Date.now()
              });
          }
          
          // Return an object but implement valueOf so it can be used as a number in existing math
          const resultObj = {
              total: safeResult,
              isCrit: isCrit,
              isFumble: isFumble,
              natural: safeTotalNatural,
              valueOf: () => safeResult
          };
          return resultObj;
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

  // Strict Template to mirror dndBeyondParser.js output (For Player Characters)
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
      defenses: { resistances: "", immunities: "", vulnerabilities: "", conditionImmunities: "" },
      inventory: [{ name: "Weapon", quantity: 1, description: "", equipped: true, weight: 2, combat: { hit: 5, dmg: "1d8+3", type: "Action", category: "Attack", range: "5 ft", notes: "Slashing" } }],
      customActions: [{ name: "Action", desc: "Desc", hit: "5", dmg: "1d6", type: "Action", category: "Feature" }],
      features: [{ name: "Feature", description: "Desc", source: "Class" }],
      spells: [], spellSlots: {},
      bio: { appearance: "", traits: "", ideals: "", bonds: "", flaws: "", backstory: "" }
  });

  // Dedicated 5e Monster Statblock Schema for AI Monster Forging
  const MONSTER_STATBLOCK_SCHEMA = JSON.stringify({
      name: "Monster Name",
      cr: "5",
      level: "5",
      xp: "1,800 XP",
      race: "Large monstrosity, chaotic evil",
      size: "Large",
      type: "Monstrosity",
      alignment: "Chaotic Evil",
      hp: { max: 120, current: 120, temp: 0, formula: "16d10 + 32" },
      stats: { str: 18, dex: 14, con: 16, int: 6, wis: 12, cha: 8 },
      modifiers: { str: 4, dex: 2, con: 3, int: -2, wis: 1, cha: -1 },
      speed: "40 ft., climb 30 ft.",
      profBonus: 3,
      initiative: 2,
      ac: 15,
      acFormula: "natural armor",
      proficiencies: { armor: "", weapons: "", tools: "", languages: "understands Abyssal but can't speak" },
      skills: { Perception: true, Stealth: true, Athletics: false },
      savingThrows: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
      defenses: {
          vulnerabilities: "",
          resistances: "cold, fire",
          immunities: "poison",
          conditionImmunities: "poisoned, frightened"
      },
      senses: { darkvision: "60 ft.", blindsight: "30 ft.", passivePerception: 14 },
      darkvision: 60,
      passivePerception: 14,
      features: [
          { name: "Pack Tactics", desc: "The monster has advantage on an attack roll against a creature if at least one of the monster's allies is within 5 feet of the creature and the ally isn't incapacitated." }
      ],
      customActions: [
          { name: "Multiattack", desc: "The monster makes two attacks: one with its bite and one with its claws.", type: "Action" },
          { name: "Bite", desc: "Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) piercing damage plus 7 (2d6) poison damage.", hit: "+7", dmg: "2d8+4 piercing + 2d6 poison", type: "Action" },
          { name: "Claws", desc: "Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.", hit: "+7", dmg: "2d6+4 slashing", type: "Action" },
          { name: "Nimble Escape", desc: "The creature can take the Disengage or Hide action as a bonus action on each of its turns.", type: "Bonus Action" }
      ],
      spells: [],
      spellSlots: {},
      bio: { appearance: "Fierce beast with obsidian scales and glowing crimson eyes.", backstory: "Stalks the cavernous depths of the Underdark." }
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

  // Dedicated 5e Monster Sanitizer ensuring valid CR, actions, vitals, and math
  const sanitizeAiMonster = (char) => {
      if (!char) return null;
      if (!char.stats) char.stats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      char.modifiers = {
          str: Math.floor(((char.stats.str || 10) - 10) / 2),
          dex: Math.floor(((char.stats.dex || 10) - 10) / 2),
          con: Math.floor(((char.stats.con || 10) - 10) / 2),
          int: Math.floor(((char.stats.int || 10) - 10) / 2),
          wis: Math.floor(((char.stats.wis || 10) - 10) / 2),
          cha: Math.floor(((char.stats.cha || 10) - 10) / 2)
      };

      // CR & Level alignment (Strictly ensure CR is preserved and doesn't display as "Level 1")
      const rawCr = String(char.cr || char.level || '1').replace(/^cr\s*/i, '').trim();
      char.cr = rawCr;
      char.level = rawCr;
      delete char.classes;

      // Proficiency Bonus from CR
      const crVal = parseFloat(rawCr.includes('/') ? (parseFloat(rawCr.split('/')[0]) / parseFloat(rawCr.split('/')[1])) : rawCr) || 1;
      const calcProf = crVal < 5 ? 2 : crVal < 9 ? 3 : crVal < 13 ? 4 : crVal < 17 ? 5 : crVal < 21 ? 6 : crVal < 25 ? 7 : crVal < 29 ? 8 : 9;
      char.profBonus = char.profBonus || calcProf;

      // HP calculation
      if (typeof char.hp === 'number') {
          char.hp = { max: char.hp, current: char.hp, temp: 0 };
      } else if (!char.hp) {
          const defaultHp = Math.max(10, Math.round(crVal * 18 + 10));
          char.hp = { max: defaultHp, current: defaultHp, temp: 0 };
      } else {
          const maxHp = parseInt(char.hp.max || char.hp.current || 10, 10);
          char.hp.max = maxHp;
          char.hp.current = parseInt(char.hp.current ?? maxHp, 10);
          char.hp.temp = parseInt(char.hp.temp || 0, 10);
      }

      // AC & Speed
      if (typeof char.ac === 'object' && char.ac !== null) {
          char.acFormula = char.ac.formula || char.acFormula || 'natural armor';
          char.ac = parseInt(char.ac.value || 10, 10);
      } else {
          char.ac = parseInt(char.ac || 10, 10);
      }
      if (typeof char.speed === 'number') char.speed = `${char.speed} ft.`;
      if (!char.speed) char.speed = "30 ft.";

      // Race line (Size Type, Alignment)
      if (!char.race || char.race === 'string' || char.race.toLowerCase() === 'monster') {
          const s = char.size || 'Medium';
          const t = char.type || 'Monstrosity';
          const a = char.alignment || 'unaligned';
          char.race = `${s} ${t.toLowerCase()}, ${a}`;
      }

      // Senses & Passive Perception
      char.senses = char.senses || {};
      const wisMod = char.modifiers.wis || 0;
      const isPerceptionProf = char.skills?.Perception || char.skills?.perception;
      const calcPassive = 10 + wisMod + (isPerceptionProf ? char.profBonus : 0);
      if (!char.passivePerception) char.passivePerception = char.senses.passivePerception || calcPassive;
      char.senses.passivePerception = char.passivePerception;

      // Custom Actions cleaning & hit formatting
      if (Array.isArray(char.customActions)) {
          char.customActions = char.customActions.map(action => {
              let hit = action.hit !== undefined && action.hit !== null ? String(action.hit).trim() : '';
              if (hit && !hit.startsWith('+') && !hit.startsWith('-') && !isNaN(parseInt(hit, 10))) {
                  hit = `+${hit}`;
              }
              return {
                  ...action,
                  hit,
                  type: action.type || 'Action'
              };
          });
      } else {
          char.customActions = [];
      }

      // Defenses & Conditions
      char.defenses = char.defenses || {};
      char.defenses.resistances = char.defenses.resistances || "";
      char.defenses.immunities = char.defenses.immunities || "";
      char.defenses.vulnerabilities = char.defenses.vulnerabilities || "";
      char.defenses.conditionImmunities = char.defenses.conditionImmunities || "";
      char.conditions = char.conditions || [];

      // Features / Traits
      char.features = Array.isArray(char.features) ? char.features : [];

      return char;
  };

  // Helper to generate an image and convert it to a Base64 string for storage
  const generatePortrait = async (char) => {
      try {
          const race = char.race || 'Humanoid';
          const charClass = char.class || 'Creature';
          const appearance = char.bio?.appearance || '';
          
          const imagePrompt = `High quality fantasy digital character illustration of a ${char.name || ''}, ${race} ${charClass}. ${appearance.substring(0, 150)}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
          
          if (window.puter?.ai?.txt2img) {
              try {
                  const imgEl = await window.puter.ai.txt2img(imagePrompt, { provider: 'replicate-image-generation', model: 'black-forest-labs/flux-schnell', ratio: { w: 1, h: 1 } });
                  const response = await fetch(imgEl.src);
                  const blob = await response.blob();
                  return await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result);
                      reader.readAsDataURL(blob);
                  });
              } catch (e) {
                  console.error("Puter image generation failed, falling back to pollinations...", e);
              }
          }

          // Pollinations.ai is a free image generation API that returns an image buffer directly
          const response = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`);
          const blob = await response.blob();
          return await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
          });
      } catch (e) {
          console.error("Image generation failed", e);
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
      let apiContext = "";
      try {
          const searchRes = await fetch(`https://www.dnd5eapi.co/api/monsters/?name=${encodeURIComponent(name)}`);
          const searchData = await searchRes.json();
          if (searchData.count > 0) {
              const exactMatch = await fetch(`https://www.dnd5eapi.co${searchData.results[0].url}`);
              const exactData = await exactMatch.json();
              apiContext = `\n\nFound Official 5e SRD Data for this creature:\n${JSON.stringify(exactData)}`;
          }
      } catch (e) {
          console.error("5eAPI fetch failed for NPC", e);
      }

      const prompt = `You are an expert D&D 5e Monster Designer. Create an authentic, balanced, fully playable 5e Monster Statblock for: "${name}".
Context / Design Parameters: ${contextStr}.${apiContext}

CRITICAL 5e DESIGN RULES:
1. BALANCE ACCORDING TO 5e DUNGEON MASTER'S GUIDE CR BENCHMARKS:
   - CR 0–1/2: HP 1–49, AC 11–13, Atk +3, Dmg 1–5/rnd
   - CR 1–2: HP 50–85, AC 13, Atk +3 to +4, Dmg 6–20/rnd
   - CR 3–4: HP 86–130, AC 13–14, Atk +4 to +5, Dmg 21–32/rnd
   - CR 5–7: HP 131–175, AC 15, Atk +6 to +7, Dmg 33–50/rnd
   - CR 8–10: HP 176–220, AC 16–17, Atk +7 to +8, Dmg 51–68/rnd
   - CR 11–14: HP 221–280, AC 17–18, Atk +8 to +9, Dmg 69–92/rnd
   - CR 15–19: HP 281–350, AC 18–19, Atk +9 to +10, Dmg 93–122/rnd
   - CR 20+: HP 351+, AC 19+, Atk +10 to +14, Dmg 123+/rnd
2. ACTIONS & ATTACKS:
   - Always include Multiattack for martial/predatory creatures of CR 3+.
   - Attack rolls MUST specify "hit" with a plus sign, e.g. "+7".
   - Damage MUST include standard 5e dice formula and damage type, e.g. "2d8+4 piercing plus 1d6 fire".
   - For breath weapons or special abilities, include the save DC, damage formula, and recharge (e.g. Recharge 5-6) in the description.
   - Include Bonus Actions (e.g. Nimble Escape, Misty Step) or Reactions (e.g. Parry, Shield) where thematic.
   - If CR 10+ Boss, include 3 Legendary Actions (type: "Legendary Action").
3. DEFENSES & SENSES:
   - Include appropriate damage resistances, immunities, vulnerabilities, and condition immunities (e.g. charmed, frightened, poisoned).
   - Include darkvision / blindsight and passivePerception.
4. Output ONLY valid JSON matching EXACTLY this schema with no markdown or backticks:
${MONSTER_STATBLOCK_SCHEMA}`;
      
      const res = await queryAiService([{ role: 'user', content: prompt }]);
      try { 
          const match = res.match(/\{[\s\S]*\}/);
          if (!match) throw new Error("No JSON returned from AI for NPC");
          const char = sanitizeAiMonster(JSON.parse(match[0])); 
          if (char) {
              const img = await generatePortrait(char);
              if (img) { char.image = img; char.avatarUrl = img; }
              
              let results = await searchGithubModels(char.name);
              if (results.length === 0 && char.type) results = await searchGithubModels(char.type);
              if (results.length > 0) char.model3d = results[0].url;
          }
          return char;
      } 
      catch (e) { 
          console.error("Failed to generate NPC:", e);
          return null; 
      }
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
              senderName: possessedNpcId ? data?.npcs?.find(n=>n.id===possessedNpcId)?.name : (isDm ? 'Dungeon Master' : (myChar?.name || user?.displayName || 'Player')),
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
        return <Lobby user={user} hideInviteCode={hideInviteCode} setHideInviteCode={setHideInviteCode} />;
    }

    // 3. If a game is active but no DATA has arrived from Firestore yet
    if (!data) {
        return (
            <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
                <div className="flex flex-col items-center gap-4 bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl">
                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-center">
                        <h2 className="text-amber-500 font-bold text-xl">Entering Realm {hideInviteCode ? '••••••' : gameParams?.code}</h2>
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


  let rightOffset = 0;
  if (rightPanel.mode === 'sheet') rightOffset = 550;
  else if (vttSidebar === 'journal') rightOffset = 500;
  else if (vttSidebar === 'chat') rightOffset = 350;
  else if (!isCastMode && showTools) rightOffset = 320;

  return (
    <div className={`fixed inset-0 w-full h-full flex flex-col md:flex-row bg-slate-900 text-slate-200 font-sans overflow-hidden ${currentView === 'map' || isCastMode ? '' : 'pt-safe pb-safe pl-safe pr-safe'}`}>
       {!isCastMode && currentView !== 'map' && <Sidebar view={currentView} setView={setCurrentView} onExit={leaveCampaign} />}
       <main className="flex-1 flex flex-col overflow-hidden relative w-full h-full">
           {currentView !== 'map' && !isCastMode && (
               <div className="shrink-0 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 shadow-[0_4px_25px_rgba(0,0,0,0.5)] pt-safe z-50">
                   <div className="h-16 flex items-center justify-between px-3 sm:px-6 gap-2">
                       
                       {/* DM Join Requests Toasts */}
                       {joinRequests.length > 0 && effectiveRole === 'dm' && (
                           <div className="absolute top-16 right-4 z-[999] flex flex-col gap-2 pointer-events-none">
                               {joinRequests.map(req => (
                                   <div key={req.id} className="pointer-events-auto bg-slate-950/95 border border-indigo-500/80 rounded-2xl p-3.5 shadow-2xl w-80 animate-in slide-in-from-top-4 backdrop-blur-xl ring-1 ring-indigo-500/30">
                                       <div className="flex items-center gap-3 mb-2.5">
                                           <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                                               <Icon name="user" size={16} />
                                           </div>
                                           <div className="min-w-0 flex-1">
                                               <div className="font-black text-sm text-white fantasy-font tracking-wide">Knock knock!</div>
                                               <div className="text-xs text-slate-300 truncate">
                                                   <span className="text-indigo-400 font-bold">{req.name?.includes('@') ? req.name.split('@')[0] : req.name}</span> wants to join.
                                               </div>
                                               {req.characterName && <div className="text-[10px] text-amber-400/80 mt-0.5 font-medium truncate">As: {req.characterName}</div>}
                                           </div>
                                       </div>
                                       <div className="flex gap-2">
                                           <button 
                                               onClick={() => updateDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'joinRequests', req.id), { status: 'approved' })} 
                                               className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-black py-2 rounded-xl transition-all shadow-md active:scale-95"
                                           >
                                               Let In
                                           </button>
                                           <button 
                                               onClick={() => updateDoc(doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code, 'joinRequests', req.id), { status: 'denied' })} 
                                               className="flex-1 bg-slate-900 hover:bg-rose-950/80 border border-slate-700/80 hover:border-rose-800 text-slate-300 hover:text-rose-400 text-xs font-bold py-2 rounded-xl transition-all active:scale-95"
                                           >
                                               Deny
                                           </button>
                                       </div>
                                   </div>
                               ))}
                           </div>
                       )}

                       {/* Left: Mobile Brand + Realm Code Capsule + Location */}
                       <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
                           {/* Mobile Brand Emblem (hidden on desktop where sidebar exists) */}
                           <div className="md:hidden shrink-0">
                               <button 
                                   type="button" 
                                   onClick={() => setCurrentView('session')} 
                                   className="cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded-xl"
                                   title="Dungeonmind VTT"
                               >
                                   <DungeonmindLogo size={34} />
                               </button>
                           </div>

                           {/* Realm Connection & Code Pill */}
                           <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-2.5 sm:px-3 py-1.5 flex items-center gap-2 shadow-inner ring-1 ring-slate-800/60 shrink-0">
                               <div 
                                   className={`w-2 h-2 rounded-full ${
                                       gameParams?.isOffline || !isConnected 
                                           ? 'bg-slate-500' 
                                           : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                                   }`}
                                   title={gameParams?.isOffline || !isConnected ? "Offline" : "Connected to Realm"}
                               />
                               <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/80 hidden xs:inline">
                                   Realm
                               </span>
                               <span className="text-xs font-black text-slate-100 font-mono tracking-wider select-all">
                                   {hideInviteCode ? '••••••' : gameParams?.code}
                               </span>
                               {/* Copy Code Action */}
                               <button 
                                   type="button"
                                   onClick={() => {
                                       if (gameParams?.code) {
                                           navigator.clipboard.writeText(gameParams.code);
                                           toast("Realm code copied to clipboard!", "success");
                                       }
                                   }}
                                   className="text-slate-400 hover:text-amber-300 p-0.5 rounded hover:bg-slate-800 transition-colors"
                                   title="Copy Realm Code"
                               >
                                   <Icon name="copy" size={13} />
                               </button>
                               {/* Streamer Mode Toggle */}
                               <button 
                                   type="button"
                                   onClick={() => setHideInviteCode(prev => !prev)}
                                   className="text-slate-400 hover:text-amber-300 p-0.5 rounded hover:bg-slate-800 transition-colors"
                                   title={hideInviteCode ? "Show Realm Code" : "Hide Realm Code (Streamer Mode)"}
                               >
                                   <Icon name={hideInviteCode ? "eye-off" : "eye"} size={13} />
                               </button>
                           </div>

                           {/* Location / Campaign Name */}
                           <div className="hidden sm:flex items-center gap-2 min-w-0 truncate">
                               <span className="text-sm sm:text-base font-black text-amber-400 tracking-wide fantasy-font truncate drop-shadow">
                                   {possessedNpcId ? "POSSESSING NPC" : (data?.campaign?.location || data?.campaign?.name || "The Realm")}
                               </span>
                           </div>
                       </div>

                       {/* Right: Handouts & Actions */}
                       <div className="flex items-center gap-2 shrink-0">
                           <button 
                               onClick={() => setShowHandoutCreator(true)} 
                               className="text-xs bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-transparent hover:from-amber-500/30 hover:to-amber-600/20 px-3.5 py-1.5 rounded-xl border border-amber-500/40 text-amber-300 font-bold flex items-center gap-2 shadow-md shadow-amber-950/30 transition-all active:scale-95 group"
                               title="Open Handout Creator & Library"
                           >
                               <Icon name="scroll" size={15} className="text-amber-400 group-hover:scale-110 transition-transform" />
                               <span className="tracking-wide">Handouts</span>
                               {(data?.campaign?.handouts?.length || 0) > 0 && (
                                   <span className="bg-amber-950/80 text-amber-300 text-[10px] font-black px-1.5 py-0.2 rounded-md border border-amber-500/40">
                                       {data.campaign.handouts.length}
                                   </span>
                               )}
                           </button>
                       </div>
                   </div>
               </div>
           )}

           {/* Responsive view wrapper: padding-bottom for MobileNav on mobile, 0 on desktop */}
             <div 
                 className={`flex-1 overflow-hidden relative p-0 ${
                     isCastMode || currentView === 'map' 
                         ? 'pb-0' 
                         : data.config?.mobileCompact 
                             ? 'view-content-wrapper-compact' 
                             : 'view-content-wrapper'
                 }`}
             >
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
                       role={effectiveRole}
                   />
               )}
               
               {/* 2. JOURNAL */}
               {currentView === 'journal' && (
                   <JournalView 
                       role={effectiveRole}
                       userId={user?.uid}
                   />
               )}
               
                {/* 3. TACTICAL MAP (Persistent lazy-keep-alive for 0ms tab switching) */}
                {(hasVisitedMap || currentView === 'map') && (
                    <div 
                        className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
                            currentView === 'map' 
                                ? 'opacity-100 pointer-events-auto z-10' 
                                : 'opacity-0 pointer-events-none -z-10'
                        }`}
                        style={{ visibility: currentView === 'map' ? 'visible' : 'hidden' }}
                    >
                        <TacticalMapView 
                            isActive={currentView === 'map'}
                            campaignCode={gameParams?.code} 
                            activeMapId={data.activeMapId || 'test-map'} 
                            onOpenSheet={handleOpenSheet} 
                            role={effectiveRole} 
                            onOpenHandouts={() => {
                                if (showHandoutCreator) {
                                    setShowHandoutCreator(false);
                                } else {
                                    closeAllSidebars();
                                    setShowHandoutCreator(true);
                                }
                            }}
                            onOpenChat={() => {
                                if (vttSidebar === 'chat') {
                                    setVttSidebar(null);
                                } else {
                                    closeAllSidebars();
                                    setVttSidebar('chat');
                                }
                            }}
                            onOpenJournal={() => {
                                if (vttSidebar === 'journal') {
                                    setVttSidebar(null);
                                } else {
                                    closeAllSidebars();
                                    setVttSidebar('journal');
                                }
                            }}
                            onOpenDiceTray={() => {
                                if (showTools) {
                                    setShowTools(false);
                                } else {
                                    closeAllSidebars();
                                    setShowTools(true);
                                }
                            }}
                            isChatOpen={vttSidebar === 'chat'}
                            isJournalOpen={vttSidebar === 'journal'}
                            isHandoutsOpen={showHandoutCreator}
                            isDiceTrayOpen={showTools}
                            onSidebarOpen={closeAllSidebars}
                            onBack={() => setCurrentView(previousView)}
                            setView={setCurrentView}
                            onNavigate={(view, action) => {
                                if (action) setPartyInitialAction(action);
                                setCurrentView(view);
                            }}
                            rightOffset={rightOffset}
                            aiHelper={queryAiService}
                            generateNpc={generateNpc}
                            hideInviteCode={hideInviteCode}
                            setHideInviteCode={setHideInviteCode}
                            onSendMessage={sendChatMessage}
                            onDiceRoll={handleDiceRoll}
                            diceLog={diceLog}
                        />
                    </div>
                )}
               
               {/* 4. PARTY (PCs) */}
               {currentView === 'party' && <PartyView 
                   data={data}
                   user={user}
                   role={effectiveRole}
                   updateCampaign={updateCampaign}
                   onDiceRoll={handleDiceRoll}
                   onOpenSheet={handleOpenSheet}
                   onOpenDiceTray={() => setShowTools(p => !p)}
                   initialAction={partyInitialAction}
                   onClearInitialAction={() => setPartyInitialAction(null)}
                   generatePlayer={generatePlayer}
                   aiHelper={queryAiService}
               />}

               {/* 5. MONSTERS / NPCS */}
               {currentView === 'npcs' && (
                   <div className="w-full h-full relative overflow-hidden">
                       <NpcView 
                           data={data} 
                           updateCampaign={updateCampaign} 
                           user={user} 
                           onOpenSheet={handleOpenSheet} 
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

                {/* 6. LORE (Archives) */}
                {currentView === 'lore' && <LoreView aiHelper={queryAiService} role={effectiveRole} />}

               {/* MODULE HUB */}
               {currentView === 'module' && <ModuleHub data={data} updateCampaign={updateCampaign} aiHelper={queryAiService} loreChunks={context.loreChunks} campaignCode={gameParams?.code} generateNpc={generateNpc} setView={setCurrentView} />}
               
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
                   hideInviteCode={hideInviteCode}
                   setHideInviteCode={setHideInviteCode}
                   joinRequests={joinRequests}
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
                    <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[380px] max-w-full bg-slate-950/95 border-l border-amber-500/30 shadow-2xl z-[80] flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-300 pb-safe">
                        <div className="p-3 pt-safe-min pr-safe-min pl-safe-min border-b border-amber-500/20 flex justify-between items-center bg-slate-950/90 shrink-0">
                            <h3 className="font-serif font-bold text-amber-400 flex items-center gap-2 tracking-wide text-sm">
                                <div className="p-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                    <Icon name="message-circle" size={15}/>
                                </div>
                                <span>SESSION CHAT</span>
                            </h3>
                            <button onClick={() => setVttSidebar(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
                                <Icon name="x" size={18}/>
                            </button>
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
                               role={effectiveRole}
                               compact={true}
                           />
                       </div>
                   </div>
               )}

               {!isCastMode && vttSidebar === 'journal' && currentView === 'map' && (
                   <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[500px] max-w-full bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300 pb-safe">
                       <JournalView role={effectiveRole} userId={user?.uid} isSidebar={true} onClose={() => setVttSidebar(null)} />
                   </div>
               )}
            </div>
       </main>
       
       {showHandoutCreator && <HandoutEditor role={effectiveRole} campaignCode={gameParams?.code} savedHandouts={data.handouts || []} onSave={handleHandoutSave} onDelete={handleHandoutDelete} onCancel={() => setShowHandoutCreator(false)} onLocalReveal={(h) => { setLocalHandout(h); }} />}
       {showHandout && (localHandout || data?.activeHandout) && (() => {
           const activeH = localHandout || data?.activeHandout;
           const themeClass = activeH.theme === 'decree' ? 'handout-theme-decree' :
               activeH.theme === 'bounty' ? 'handout-theme-bounty' :
               activeH.theme === 'stone' ? 'handout-theme-stone' :
               activeH.theme === 'grimoire' ? 'handout-theme-grimoire' :
               (activeH.theme === 'torn' || activeH.theme === 'letter') ? 'handout-theme-torn' :
               'handout-theme-parchment';

           const sealColorClass = activeH.seal?.color === 'gold' ? 'wax-seal-gold' :
               activeH.seal?.color === 'blue' ? 'wax-seal-blue' :
               activeH.seal?.color === 'emerald' ? 'wax-seal-emerald' :
               activeH.seal?.color === 'obsidian' ? 'wax-seal-obsidian' :
               'wax-seal-crimson';

           return (
               <div className="fixed inset-0 z-[110] bg-black/85 flex items-center justify-center p-3 sm:p-6 backdrop-blur-md overflow-hidden animate-in fade-in" onClick={() => { setShowHandout(false); setLocalHandout(null); }}>
                   <div 
                       className={`max-w-4xl w-full rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden transition-all ${themeClass}`} 
                       onClick={e => e.stopPropagation()}
                   >
                       <div className="flex-1 overflow-y-auto custom-scroll w-full h-full relative flex flex-col p-6 sm:p-10">
                           {/* Title & Subtitle Header */}
                           {(activeH.title || activeH.subtitle) && (
                               <div className="border-b border-current/25 pb-3 mb-5 text-center shrink-0">
                                   {activeH.title && (
                                       <h2 className="fantasy-font text-2xl sm:text-4xl font-bold tracking-wide leading-tight">
                                           {activeH.title}
                                       </h2>
                                   )}
                                   {activeH.subtitle && (
                                       <p className="text-xs sm:text-sm uppercase tracking-widest opacity-75 mt-1 font-semibold">
                                           {activeH.subtitle}
                                       </p>
                                   )}
                               </div>
                           )}

                           {/* Primary Header/Artwork Image */}
                           {activeHandoutImageUrl && (
                               <div className="w-full flex justify-center pb-6">
                                   {activeH.imageLayout === 'frame' ? (
                                       <div className="relative inline-block p-2 bg-black/10 border-2 border-current/40 rounded-xl shadow-xl max-w-sm w-full">
                                           <img src={activeHandoutImageUrl} className="w-full max-h-[50vh] object-cover rounded-lg" alt="Handout Image" />
                                           <button 
                                               onClick={(e) => { e.stopPropagation(); setIsFullscreenImage(true); }} 
                                               className="absolute top-4 right-4 bg-black/60 hover:bg-black/90 text-white rounded p-1.5 transition-colors backdrop-blur-sm shadow-md border border-white/10 cursor-pointer"
                                               title="View Fullscreen"
                                           >
                                               <Icon name="maximize" size={16} />
                                           </button>
                                       </div>
                                   ) : activeH.imageLayout === 'contained' ? (
                                       <div className="relative inline-block max-w-full">
                                           <img src={activeHandoutImageUrl} className="max-w-full max-h-[60vh] object-contain drop-shadow-2xl rounded-xl" alt="Handout Image" />
                                           <button 
                                               onClick={(e) => { e.stopPropagation(); setIsFullscreenImage(true); }} 
                                               className="absolute top-2 right-2 bg-black/60 hover:bg-black/90 text-white rounded p-1.5 transition-colors backdrop-blur-sm shadow-md border border-white/10 cursor-pointer"
                                               title="View Fullscreen"
                                           >
                                               <Icon name="maximize" size={16} />
                                           </button>
                                       </div>
                                   ) : (
                                       // Hero Banner
                                       <div className="relative inline-block w-full max-w-2xl rounded-xl overflow-hidden shadow-xl">
                                           <img src={activeHandoutImageUrl} className="w-full max-h-[55vh] object-cover rounded-xl" alt="Handout Image" />
                                           <button 
                                               onClick={(e) => { e.stopPropagation(); setIsFullscreenImage(true); }} 
                                               className="absolute top-3 right-3 bg-black/60 hover:bg-black/90 text-white rounded p-1.5 transition-colors backdrop-blur-sm shadow-md border border-white/10 cursor-pointer"
                                               title="View Fullscreen"
                                           >
                                               <Icon name="maximize" size={16} />
                                           </button>
                                       </div>
                                   )}
                               </div>
                           )}

                           {/* Body Content Stream */}
                           {activeH.content && activeH.content !== '<p><br></p>' && (
                               activeHandoutBlocks.length === 0 ? (
                                   <div className="py-8 text-center animate-pulse italic opacity-50 font-bold tracking-widest text-xs">
                                       DECIPHERING SCRIPT...
                                   </div>
                               ) : (
                                   <div className="handout-content-stream pb-4 flex-1">
                                       {activeHandoutBlocks.map((block, idx) => (
                                           block.type === 'image' ? (
                                               <ResolvedImage key={idx} id={block.id} />
                                           ) : (
                                               <div key={idx} className="mb-4 text-base sm:text-lg leading-relaxed" dangerouslySetInnerHTML={{ __html: block.content }} />
                                           )
                                       ))}
                                   </div>
                               )
                           )}

                           {/* Wax Seal & Signatory Stamp */}
                           {activeH.seal?.enabled && (
                               <div className="mt-8 pt-4 border-t border-current/20 flex items-center justify-between shrink-0">
                                   <div className="text-xs sm:text-sm font-serif italic opacity-85 font-semibold">
                                       {activeH.seal.text || 'Official Handout'}
                                   </div>
                                   <div className={`wax-seal ${sealColorClass}`} title={activeH.seal.text || 'Wax Seal'}>
                                       <Icon name={activeH.seal.emblem || 'crown'} size={22} />
                                   </div>
                               </div>
                           )}

                           {/* DM Secret Notes (Visible ONLY to the DM in-game) */}
                           {effectiveRole === 'dm' && activeH.secretNotes && activeH.secretNotes.trim() && (
                               <div className="mt-6 p-4 rounded-xl bg-slate-950/90 border-2 border-amber-500/50 text-amber-200 shadow-2xl backdrop-blur-md shrink-0">
                                   <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-amber-500/20">
                                       <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-amber-400">
                                           <Icon name="lock" size={13} />
                                           <span>DM Secret Notes (Hidden from Players)</span>
                                       </div>
                                       <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                           DM Eyes Only
                                       </span>
                                   </div>
                                   <p className="text-xs sm:text-sm font-sans italic leading-relaxed text-amber-200/90 whitespace-pre-wrap">
                                       {activeH.secretNotes}
                                   </p>
                               </div>
                           )}
                       </div>

                       <button 
                           onClick={() => { setShowHandout(false); setLocalHandout(null); setIsFullscreenImage(false); }} 
                           className="absolute top-4 right-4 top-safe right-safe z-20 bg-black/60 hover:bg-black/90 text-white rounded-full p-2 transition-colors cursor-pointer shadow-lg"
                       >
                           <Icon name="x" size={20} />
                       </button>
                   </div>
               </div>
           );
       })()}
               
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
                           className="absolute top-6 right-6 top-safe right-safe bg-black/50 hover:bg-white/20 text-white rounded-full p-3 transition-colors border border-white/20"
                       >
                           <Icon name="x" size={28}/>
                       </button>
                   </div>
               )}
       <div className="fixed inset-0 pointer-events-none z-[99999]"><DiceOverlay roll={rollingDice} /></div>
       
       {/* Global Dice Tray Sidebar */}
       {!isCastMode && showTools && (
           <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[380px] max-w-full bg-slate-950/95 backdrop-blur-md border-l border-slate-800 shadow-2xl z-[100] flex flex-col animate-in slide-in-from-right duration-300 pb-safe">
               <DiceTray 
                   diceLog={diceLog} 
                   handleDiceRoll={handleDiceRoll} 
                   onClose={() => setShowTools(false)} 
                   role={effectiveRole}
                   rollMode={rollMode || (effectiveRole === 'dm' ? 'private' : 'public')}
                   setRollMode={(mode) => {
                       setRollMode(mode);
                       localStorage.setItem('roll_mode', mode);
                   }}
               />
           </div>
       )}

       {/* UPDATED: Pass compact prop */}
       {!isCastMode && currentView !== 'map' && <MobileNav view={currentView} setView={setCurrentView} compact={data.config?.mobileCompact} />}
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
        <DialogProvider>
        <NewCampaignProvider>
            <ToastProvider>
                <DungeonMindApp />
            </ToastProvider>
        </NewCampaignProvider>
        </DialogProvider>
    );
}

export default App;