import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { useDialog } from './DialogProvider';
import { useCharacterStore } from '../stores/useCharacterStore';
import ResolvedImage from './ResolvedImage';
import { compressImage } from '../utils/imageCompressor';
import { storeChunkedMap } from '../utils/storageUtils';
import { getMapRef, updateMap } from '../utils/mapService';
import { getDoc } from 'firebase/firestore';
import { useResolvedUrl } from '../utils/useResolvedUrl';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import GroupRollCard from './chat/GroupRollCard';

const SafeAvatar = ({ src, alt }) => {
    const resolved = useResolvedUrl(src);
    if (!resolved && src?.startsWith('chunked:')) return <div className="w-9 h-9 rounded-full bg-slate-850 animate-pulse border border-amber-500/30 shadow-inner" />;
    return (
        <img 
            src={resolved || src} 
            alt={alt} 
            className="w-9 h-9 rounded-full object-cover shadow-md ring-1 ring-amber-500/30 border border-slate-800" 
            referrerPolicy="no-referrer" 
        />
    );
};

const ChatSaveCard = ({ rollData, previewTargets, role, handleRollSave }) => {
    const [advMode, setAdvMode] = useState('normal'); // 'normal', 'adv', 'dis'
    
    let dcInfo = rollData.dc;
    if (!dcInfo) {
        const textToSearch = `${rollData.description || ''} ${rollData.alias || ''}`;
        const match = String(textToSearch).match(/DC\s*(\d+)(?:\s*([a-zA-Z]+))?/i);
        if (match) {
            dcInfo = { value: parseInt(match[1], 10), stat: (match[2] || 'dex').toLowerCase().substring(0,3) };
        }
    }
    
    if (!dcInfo || !dcInfo.value || !dcInfo.stat) return null;

    const stat = dcInfo.stat.toLowerCase();
    const targetBadges = previewTargets.map(char => {
        const score = char.stats?.[stat] || 10;
        let mod = Math.floor((score - 10) / 2);
        if (char.savingThrows?.[stat]) mod += (char.profBonus || 2);
        const modDisplay = `${mod >= 0 ? '+' : ''}${mod}`;
        const isNegative = mod < 0;
        return (
            <span key={char.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                isNegative 
                    ? 'bg-red-950/70 text-red-300 border border-red-800/60 shadow-sm' 
                    : 'bg-slate-800/80 text-amber-200 border border-amber-500/30 shadow-sm'
            }`}>
                <span>{char.name}</span>
                <span className="opacity-75">({modDisplay})</span>
            </span>
        );
    });

    return (
        <div className="mt-2.5 w-full pt-2.5 border-t border-slate-700/60 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider mr-0.5">Targets:</span>
                {targetBadges.length > 0 ? targetBadges : (
                    <span className="text-[10px] text-slate-500 italic">{role === 'dm' ? 'Select tokens on map' : 'No character assigned'}</span>
                )}
            </div>
            <div className="flex bg-slate-950/90 border border-slate-700/80 rounded-lg p-0.5 shadow-inner w-full mt-0.5">
                <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAdvMode('dis'); }} 
                    className={`flex-1 py-1 text-[9px] uppercase font-bold tracking-wider rounded-md transition-all ${
                        advMode === 'dis' 
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40 shadow-sm' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                >
                    Disadvantage
                </button>
                <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAdvMode('normal'); }} 
                    className={`flex-1 py-1 text-[9px] uppercase font-bold tracking-wider rounded-md transition-all ${
                        advMode === 'normal' 
                            ? 'bg-slate-800 text-slate-100 border border-slate-600/50 shadow-sm' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                >
                    Normal
                </button>
                <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAdvMode('adv'); }} 
                    className={`flex-1 py-1 text-[9px] uppercase font-bold tracking-wider rounded-md transition-all ${
                        advMode === 'adv' 
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                >
                    Advantage
                </button>
            </div>
            <button 
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRollSave(dcInfo, previewTargets, advMode); setAdvMode('normal'); }}
                className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-slate-950 text-xs font-black py-2 rounded-lg shadow-lg border border-amber-400/40 transition-all flex items-center justify-center gap-1.5 mt-0.5 active:scale-[0.98] cursor-pointer"
            >
                <Icon name="shield" size={13}/> Roll DC {dcInfo.value} {dcInfo.stat.toUpperCase()} Save
            </button>
        </div>
    );
};

const QUICK_EMOJIS = ['⚔️', '🛡️', '🎲', '💀', '❤️', '👍'];

const SessionView = ({ 
    inputText, setInputText, 
    onSendMessage, onEditMessage, onDeleteMessage, 
    showTools, setShowTools, diceLog, handleDiceRoll,
    possessedNpcId, onSavePage,
    compact, role
}) => {
    const toast = useToast();
    const dialog = useDialog();
    const context = useNewCampaign();
    if (!context) return null;

    const { campaign, chatLog, user, gameParams, sendMessage, editMessage, deleteMessage, clearChat, saveJournalPage } = context;
    const data = campaign || {};
    const myCharId = data?.assignments?.[user?.uid];

    // Channels state: 'all', 'rp', 'dice', 'whisper', 'pinned'
    const [activeChannel, setActiveChannel] = useState('all');

    // UI state
    const [sendMode, setSendMode] = useState('chat-public'); 
    const [targetUser, setTargetUser] = useState(''); 
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [showPersonaMenu, setShowPersonaMenu] = useState(false);
    const [showSlashHelp, setShowSlashHelp] = useState(false);
    const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [bannerManualRoll, setBannerManualRoll] = useState('');

    const chatEndRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const fileInputRef = useRef(null);

    // Target Preview State
    const selectedTokenIds = useCharacterStore(state => state.selectedTokenIds) || [];
    const [previewTargets, setPreviewTargets] = useState([]);

    useEffect(() => {
        const resolveTargets = async () => {
            const activeMapId = data?.activeMapId;
            const code = gameParams?.code;
            let targetCharacters = [];
            
            if (selectedTokenIds.length > 0 && activeMapId && code) {
                try {
                    const mapRef = getMapRef(code, activeMapId);
                    const mapSnap = await getDoc(mapRef);
                    if (mapSnap.exists()) {
                        const mapData = mapSnap.data();
                        selectedTokenIds.forEach(id => {
                            const token = mapData.tokens?.[id];
                            if (token) {
                                const char = [...(data?.players || []), ...(data?.npcs || [])].find(c => String(c.id) === String(token.characterId));
                                if (char && (role === 'dm' || String(char.ownerId) === String(user?.uid) || String(char.id) === String(myCharId) || token.isSharedControl)) {
                                    targetCharacters.push(char);
                                }
                            }
                        });
                    }
                } catch (e) {
                    console.error("Failed to fetch map for preview targets", e);
                }
            }
            
            if (targetCharacters.length === 0 && role !== 'dm' && myCharId) {
                const myChar = data?.players?.find(p => String(p.id) === String(myCharId));
                if (myChar) targetCharacters.push(myChar);
            }
            
            setPreviewTargets(targetCharacters);
        };
        resolveTargets();
    }, [selectedTokenIds, data?.activeMapId, gameParams?.code, role, user?.uid, myCharId, data?.players, data?.npcs]);

    // Persona Storage & State
    const personaStorageKey = useMemo(() => {
        return `dungeonmind_persona_${gameParams?.code || 'default'}_${user?.uid || 'anon'}`;
    }, [gameParams?.code, user?.uid]);

    const [selectedPersonaId, setSelectedPersonaId] = useState(() => {
        try {
            const key = `dungeonmind_persona_${gameParams?.code || 'default'}_${user?.uid || 'anon'}_id`;
            return localStorage.getItem(key) || null;
        } catch (e) {
            return null;
        }
    });

    const [cachedPersona, setCachedPersona] = useState(() => {
        try {
            const key = `dungeonmind_persona_${gameParams?.code || 'default'}_${user?.uid || 'anon'}_obj`;
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    });

    const handleSelectPersona = useCallback((persona) => {
        setSelectedPersonaId(persona.id);
        setCachedPersona(persona);
        try {
            localStorage.setItem(`${personaStorageKey}_id`, persona.id);
            localStorage.setItem(`${personaStorageKey}_obj`, JSON.stringify(persona));
        } catch (e) {}
        setShowPersonaMenu(false);
    }, [personaStorageKey]);

    // Available Personas
    const availablePersonas = useMemo(() => {
        const list = [];
        const myChar = data?.players?.find(p => String(p.id) === String(myCharId) || p.ownerId === user?.uid);
        if (myChar) {
            list.push({
                id: `char-${myChar.id}`,
                name: myChar.name,
                type: 'character',
                image: myChar.image,
                badge: `${myChar.class || 'Adventurer'} Lvl ${myChar.level || 1}`
            });
        }

        if (role === 'dm' || data?.dmIds?.includes(user?.uid)) {
            list.push({
                id: 'dm',
                name: 'Dungeon Master',
                type: 'dm',
                image: null,
                badge: 'DM / Narrator'
            });
        }

        if (possessedNpcId) {
            const npc = data?.npcs?.find(n => n.id === possessedNpcId);
            if (npc) {
                list.push({
                    id: `npc-${npc.id}`,
                    name: npc.name,
                    type: 'npc',
                    image: npc.image || npc.tokenImage,
                    badge: 'Possessed NPC'
                });
            }
        } else if (previewTargets && previewTargets.length > 0) {
            previewTargets.forEach(t => {
                if (!list.some(p => p.name === t.name)) {
                    list.push({
                        id: `target-${t.id}`,
                        name: t.name,
                        type: 'token',
                        image: t.image || t.tokenImage,
                        badge: 'Selected Token'
                    });
                }
            });
        }

        // Campaign NPCs for DM
        if (role === 'dm' && data?.npcs && data.npcs.length > 0) {
            data.npcs.slice(0, 15).forEach(npc => {
                if (!list.some(p => p.id === `npc-${npc.id}` || p.name === npc.name)) {
                    list.push({
                        id: `npc-${npc.id}`,
                        name: npc.name,
                        type: 'npc',
                        image: npc.image || npc.tokenImage,
                        badge: 'Campaign NPC'
                    });
                }
            });
        }

        const oocName = user?.displayName || user?.email?.split('@')[0] || 'Player';
        list.push({
            id: 'ooc',
            name: `[OOC] ${oocName}`,
            type: 'ooc',
            image: null,
            badge: 'Out-of-Character'
        });

        // If previously saved persona is not in the list, keep it accessible
        if (cachedPersona && !list.some(p => p.id === cachedPersona.id)) {
            list.push(cachedPersona);
        }

        return list;
    }, [data?.players, data?.npcs, data?.dmIds, myCharId, user, role, possessedNpcId, previewTargets, cachedPersona]);

    const activePersona = useMemo(() => {
        if (selectedPersonaId) {
            const found = availablePersonas.find(p => p.id === selectedPersonaId);
            if (found) return found;
            if (cachedPersona && cachedPersona.id === selectedPersonaId) return cachedPersona;
        }
        return availablePersonas[0] || {
            id: 'default',
            name: role === 'dm' ? 'Dungeon Master' : (user?.displayName || 'Player'),
            type: role === 'dm' ? 'dm' : 'character',
            image: null,
            badge: role === 'dm' ? 'DM' : 'Player'
        };
    }, [availablePersonas, selectedPersonaId, cachedPersona, role, user]);

    // Save to Journal
    const saveMessageToJournal = useCallback((content) => {
        const newPageId = Date.now().toString();
        const newPage = {
            id: newPageId,
            title: `Chat Note - ${new Date().toLocaleDateString()}`,
            content: content,
            timestamp: Date.now()
        };
        saveJournalPage(newPageId, newPage);
        toast("Saved note to Journal", "success");
    }, [saveJournalPage, toast]);

    // File Upload
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const compressed = await compressImage(file, 800, 0.7);
            const id = await storeChunkedMap(compressed, `chat_img_${Date.now()}`);
            postCustomMessage({
                content: id,
                type: sendMode === 'chat-private' ? 'chat-private' : 'chat-public',
                targetId: sendMode === 'chat-private' ? targetUser : null
            });
        } catch (err) {
            console.error("Upload failed", err);
            toast("Failed to upload image.", "error");
        }
        setIsUploading(false);
        e.target.value = null;
    };

    // Apply Damage
    const handleApplyDamage = useCallback(async (amount) => {
        const { selectedTokenIds } = useCharacterStore.getState();
        if (!selectedTokenIds || selectedTokenIds.length === 0) return toast("No target selected!", "warning");

        const activeMapId = data?.activeMapId;
        const code = gameParams?.code;

        if (activeMapId && code) {
            try {
                const mapRef = getMapRef(code, activeMapId);
                const mapSnap = await getDoc(mapRef);
                if (mapSnap.exists()) {
                    const mapData = mapSnap.data();
                    const updates = {};
                    
                    selectedTokenIds.forEach(id => {
                        const token = mapData.tokens?.[id];
                        if (token) {
                            const char = [...(data?.players || []), ...(data?.npcs || [])].find(c => String(c.id) === String(token.characterId));
                            
                            let currentHp = 0;
                            let maxHp = 10;
                            
                            if (token.hp && token.hp.current !== undefined) {
                                currentHp = token.hp.current;
                                maxHp = token.hp.max || 10;
                            } else if (char && char.hp && char.hp.current !== undefined) {
                                currentHp = char.hp.current;
                                maxHp = char.hp.max || 10;
                            } else {
                                return;
                            }
                            
                            const newHp = Math.max(0, currentHp - amount);
                            updates[`tokens.${id}.hp`] = { ...token.hp, current: newHp, max: maxHp };
                        }
                    });
                    
                    if (Object.keys(updates).length > 0) {
                        await updateMap(code, activeMapId, updates);
                        
                        const newPlayers = [...(data.players || [])];
                        const newNpcs = [...(data.npcs || [])];
                        let campaignUpdated = false;
                        
                        selectedTokenIds.forEach(id => {
                             const token = mapData.tokens?.[id];
                             if (token) {
                                 const pIdx = newPlayers.findIndex(p => String(p.id) === String(token.characterId));
                                 if (pIdx > -1) {
                                     newPlayers[pIdx] = { ...newPlayers[pIdx], hp: { ...newPlayers[pIdx].hp, current: Math.max(0, (newPlayers[pIdx].hp.current || 0) - amount) } };
                                     campaignUpdated = true;
                                 } else {
                                     const nIdx = newNpcs.findIndex(n => String(n.id) === String(token.characterId));
                                     if (nIdx > -1) {
                                         newNpcs[nIdx] = { ...newNpcs[nIdx], hp: { ...newNpcs[nIdx].hp, current: Math.max(0, (newNpcs[nIdx].hp.current || 0) - amount) } };
                                         campaignUpdated = true;
                                     }
                                 }
                             }
                        });
                        
                        if (campaignUpdated) {
                            context.updateCampaign({ players: newPlayers, npcs: newNpcs });
                        }
                        
                        toast(`Applied ${amount} damage`, "success");
                    } else {
                        toast("Selected tokens do not have HP tracking enabled.", "warning");
                    }
                }
            } catch(e) {
                console.error("Failed to apply damage", e);
                toast("Failed to apply damage. See console.", "error");
            }
        } else {
            toast("No active map found.", "error");
        }
    }, [data, gameParams, context, toast]);

    // Roll Save Handler
    const handleRollSave = useCallback((dcData, targetsToRoll, advMode = 'normal') => {
        if (!targetsToRoll || targetsToRoll.length === 0) {
            if (role === 'dm') return toast("Select tokens on the map to roll their saves.", "warning");
            return toast("No character selected or assigned to roll the save.", "warning");
        }
        
        targetsToRoll.forEach((char, idx) => {
            const stat = dcData.stat?.toLowerCase() || 'dex';
            const score = char.stats?.[stat] || 10;
            let mod = Math.floor((score - 10) / 2);
            if (char.savingThrows?.[stat]) mod += (char.profBonus || 2);
            
            let formula = '1d20';
            let rollAlias = `${dcData.stat.toUpperCase()} Save vs DC ${dcData.value}`;

            if (advMode === 'adv') {
                formula = '2d20kh1';
                rollAlias += ' (Advantage)';
            } else if (advMode === 'dis') {
                formula = '2d20kl1';
                rollAlias += ' (Disadvantage)';
            }

            if (mod !== 0) {
                formula += mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`;
            }

            setTimeout(() => {
                handleDiceRoll(formula, {
                    alias: rollAlias,
                    characterName: char.name,
                    isSave: true,
                    saveDc: dcData.value,
                    advMode: advMode !== 'normal' ? advMode : undefined
                });
            }, idx * 50); 
        });
    }, [handleDiceRoll, role, toast]);

    // Formatter with Table and Clickable Inline Dice Support
    const formatMessage = useCallback((text) => {
        if (!text) return "";
        
        // 1. Tables
        let formatted = text.replace(/((?:\|.*\|(?:\n|$))+)/g, (match) => {
            const rows = match.trim().split('\n').filter(r => !r.includes('---'));
            const htmlRows = rows.map((row, i) => {
                const cells = row.split('|').filter(c => c.trim()).map(c => `<td class="border border-slate-700 p-2 ${i===0 ? 'font-bold bg-slate-800 text-amber-500' : ''}">${c.trim()}</td>`).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            return `<div class="overflow-x-auto my-2 rounded border border-slate-700"><table class="w-full text-xs text-left border-collapse"><tbody class="divide-y divide-slate-700">${htmlRows}</tbody></table></div>`;
        });

        // 2. Headings, bold, bullets
        formatted = formatted
            .replace(/^### (.*$)/gm, '<div class="text-lg font-bold text-amber-500 mt-2 mb-1 fantasy-font">$1</div>')
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
            .replace(/^- (.*$)/gm, '<div class="ml-4 flex items-start gap-2"><span class="text-slate-500">•</span><span>$1</span></div>')
            .replace(/\n/g, '<br/>');

        // 3. Inline dice (e.g. 1d20, 2d6+4, 1d8-1, 4d6)
        formatted = formatted.replace(/\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\b/gi, (match) => {
            const cleanFormula = match.replace(/\s+/g, '');
            return `<span class="inline-dice-pill" data-formula="${cleanFormula}" title="Click to roll ${cleanFormula}">🎲 ${cleanFormula}</span>`;
        });

        return formatted;
    }, []);

    // Post Custom Message
    const postCustomMessage = useCallback(({ content, type = 'chat-public', targetId = null, targetName = null }) => {
        const isDm = role === 'dm' || data?.dmIds?.includes(user?.uid);
        const senderRole = isDm ? 'dm' : 'player';

        const msgObj = {
            content,
            type,
            role: senderRole,
            senderId: user?.uid || 'anon',
            senderName: activePersona.name,
            personaType: activePersona.type,
            targetId: targetId || null,
            targetName: targetName || null,
            timestamp: Date.now(),
            reactions: {},
            isPinned: false
        };
        if (activePersona.image) {
            msgObj.senderAvatar = activePersona.image;
        }
        sendMessage(msgObj);
    }, [role, data?.dmIds, user?.uid, activePersona, sendMessage]);

    // Slash Commands Engine
    const handleSlashCommand = useCallback((rawText) => {
        const trimmed = rawText.trim();
        const spaceIdx = trimmed.indexOf(' ');
        const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
        const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

        if (cmd === '/help') {
            const helpContent = `**VTT Chat Slash Commands:**
- **/r [formula]** or **/roll [formula]** (or **!r**) - Roll dice (e.g. \`/r 1d20+5\`, \`/r 2d6+3\`)
- **/m [number]** or **/manual [number]** - Log physical / manual dice roll (e.g. \`/m 18\` or \`/m 14+3\`)
- **/w [player] [msg]** or **/whisper [player] [msg]** - Secret whisper to player
- **/gm [msg]** or **/dm [msg]** - Send private whisper directly to the Dungeon Master
- **/me [action]** - In-character narrative emote (e.g. \`/me bows gracefully\`)
- **/desc [text]** - DM boxed narrative scene card
- **/ooc [msg]** - Out-of-Character message
- **/clear** - Clear session chat history (DM only)`;
            
            sendMessage({
                content: helpContent,
                type: 'chat-public',
                role: 'system',
                senderId: 'system',
                senderName: 'System',
                timestamp: Date.now()
            });
            setInputText('');
            return true;
        }

        if (cmd === '/r' || cmd === '/roll' || cmd === '!r' || cmd === '!roll') {
            if (!args) {
                toast("Usage: /roll [formula] (e.g. /roll 1d20+4 or /r 2d6+3)", "warning");
                return true;
            }
            const diceFn = handleDiceRoll || onDiceRoll;
            if (diceFn) {
                diceFn(args, {
                    alias: `${activePersona.name} Roll`,
                    characterName: activePersona.name
                });
            }
            setInputText('');
            return true;
        }

        if (cmd === '/manual' || cmd === '/m') {
            if (!args) {
                toast("Usage: /manual [result] (e.g. /manual 18 or /m 14+3)", "warning");
                return true;
            }
            try {
                const sanitized = args.replace(/[^0-9+\-*\/\s]/g, '');
                const evalVal = Function(`'use strict'; return (${sanitized})`)();
                const total = Number(evalVal);
                if (!isNaN(total)) {
                    const nat = Math.min(20, Math.max(1, total));
                    const isCrit = total === 20 || args.trim() === '20';
                    const isFumble = total === 1 || args.trim() === '1';
                    const payload = {
                        formula: `Manual (${args})`,
                        naturalRoll: nat,
                        rolls: [total],
                        modifier: 0,
                        total: total,
                        characterName: activePersona.name,
                        isDmRoll: role === 'dm',
                        isCrit: isCrit,
                        isFumble: isFumble,
                        alias: `${activePersona.name} (Manual Roll)`,
                        isManual: true,
                        type: sendMode === 'chat-private' ? 'roll-private' : 'roll-public'
                    };
                    if (sendMessage) {
                        sendMessage({
                            content: JSON.stringify(payload),
                            type: payload.type,
                            senderId: user?.uid || 'anon',
                            senderName: activePersona.name,
                            timestamp: Date.now()
                        });
                    }
                    toast(`Manual roll of ${total} recorded!`, 'success');
                    setInputText('');
                    return true;
                }
            } catch (e) {
                toast("Invalid manual roll number. Example: /manual 17", "error");
                return true;
            }
        }

        if (cmd === '/me') {
            if (!args) {
                toast("Usage: /me [action] (e.g. /me readies a spell)", "warning");
                return true;
            }
            postCustomMessage({ content: args, type: 'chat-emote' });
            setInputText('');
            return true;
        }

        if (cmd === '/desc') {
            if (!args) {
                toast("Usage: /desc [narration text]", "warning");
                return true;
            }
            postCustomMessage({ content: args, type: 'chat-desc' });
            setInputText('');
            return true;
        }

        if (cmd === '/ooc') {
            if (!args) {
                toast("Usage: /ooc [message]", "warning");
                return true;
            }
            postCustomMessage({ content: args, type: 'chat-ooc' });
            setInputText('');
            return true;
        }

        if (cmd === '/w' || cmd === '/whisper') {
            const whisperSpace = args.indexOf(' ');
            if (whisperSpace === -1) {
                toast("Usage: /w [player] [message]", "warning");
                return true;
            }
            const targetQuery = args.slice(0, whisperSpace).toLowerCase();
            const whisperMsg = args.slice(whisperSpace + 1).trim();

            let matchedUid = null;
            let matchedName = null;

            for (const [uid, uName] of Object.entries(data?.activeUsers || {})) {
                const cleanName = (uName?.includes('@') ? uName.split('@')[0] : uName || '').toLowerCase();
                const charId = data?.assignments?.[uid];
                const char = data?.players?.find(p => p.id == charId);
                const charName = (char?.name || '').toLowerCase();

                if (cleanName.includes(targetQuery) || charName.includes(targetQuery)) {
                    matchedUid = uid;
                    matchedName = char?.name || cleanName;
                    break;
                }
            }

            if (!matchedUid && (targetQuery === 'dm' || targetQuery === 'gm' || targetQuery === 'dungeonmaster')) {
                matchedUid = data?.dmIds?.[0];
                matchedName = 'Dungeon Master';
            }

            if (matchedUid) {
                postCustomMessage({
                    content: whisperMsg,
                    type: 'chat-private',
                    targetId: matchedUid,
                    targetName: matchedName
                });
                setInputText('');
            } else {
                toast(`Player "${targetQuery}" not found in session.`, "warning");
            }
            return true;
        }

        if (cmd === '/gm' || cmd === '/dm') {
            if (!args) {
                toast("Usage: /gm [message]", "warning");
                return true;
            }
            const dmUid = data?.dmIds?.[0];
            postCustomMessage({
                content: args,
                type: 'chat-private',
                targetId: dmUid,
                targetName: 'Dungeon Master'
            });
            setInputText('');
            return true;
        }

        if (cmd === '/clear') {
            if (role === 'dm' || data?.dmIds?.includes(user?.uid)) {
                clearChat();
            } else {
                toast("Only the DM can clear chat history.", "warning");
            }
            setInputText('');
            return true;
        }

        return false;
    }, [handleDiceRoll, postCustomMessage, activePersona, data, role, user?.uid, clearChat, toast, sendMessage, setInputText]);

    // Send Message
    const handleSend = () => {
        const trimmed = inputText.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('/') || trimmed.startsWith('!')) {
            const handled = handleSlashCommand(trimmed);
            if (handled) return;
        }

        // Direct dice formula auto-roll check: e.g. "1d20+5", "2d6+3", "4d6kh3", "d20", "1d100"
        const DICE_FORMULA_REGEX = /^\s*([0-9]*d[0-9]+(?:k[hl][0-9]+)?(?:\s*[+\-*\/]\s*[0-9]+)*)\s*$/i;
        if (DICE_FORMULA_REGEX.test(trimmed)) {
            const diceFn = handleDiceRoll || onDiceRoll;
            if (diceFn) {
                diceFn(trimmed, {
                    alias: `${activePersona.name} Roll`,
                    characterName: activePersona.name
                });
                setInputText('');
                return;
            }
        }

        if (sendMode === 'chat-private') {
            if (!targetUser) return toast("Please select a recipient for the whisper.", "warning");
            const targetName = data?.activeUsers?.[targetUser] || 'Player';
            postCustomMessage({
                content: inputText,
                type: 'chat-private',
                targetId: targetUser,
                targetName: targetName
            });
        } else {
            postCustomMessage({
                content: inputText,
                type: 'chat-public'
            });
        }
        setInputText('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const submitEdit = (id) => {
        onEditMessage(id, { content: editContent });
        setEditingId(null);
    };

    // Toggle Reaction
    const handleToggleReaction = useCallback(async (msgId, emoji) => {
        const msg = chatLog.find(m => m.id === msgId);
        if (!msg) return;
        const currentReactions = { ...(msg.reactions || {}) };
        const userList = Array.isArray(currentReactions[emoji]) ? [...currentReactions[emoji]] : [];
        const uid = user?.uid || 'anon';
        const index = userList.indexOf(uid);
        if (index > -1) {
            userList.splice(index, 1);
        } else {
            userList.push(uid);
        }
        if (userList.length === 0) {
            delete currentReactions[emoji];
        } else {
            currentReactions[emoji] = userList;
        }
        await onEditMessage(msgId, { reactions: currentReactions });
        setActiveReactionMsgId(null);
    }, [chatLog, user?.uid, onEditMessage]);

    // Toggle Pin
    const handleTogglePin = useCallback(async (msgId) => {
        const msg = chatLog.find(m => m.id === msgId);
        if (!msg) return;
        const newPinned = !msg.isPinned;
        await onEditMessage(msgId, { isPinned: newPinned });
        toast(newPinned ? "Message pinned to ⭐ Pinned tab" : "Message unpinned", "info");
    }, [chatLog, onEditMessage, toast]);

    // Permissions Filter (Room Security)
    const allPermittedMessages = useMemo(() => {
        return chatLog.filter(msg => {
            if (msg.role === 'system') return true;
            if (msg.type === 'chat-public' || msg.type === 'chat-emote' || msg.type === 'chat-desc' || msg.type === 'chat-ooc' || msg.type === 'boxed') return true;
            if (msg.type === 'roll-public' || msg.type === 'group-roll') return true;
            if (role === 'dm') return true;
            if (msg.type === 'chat-private') {
                return msg.senderId === user?.uid || msg.targetId === user?.uid;
            }
            if (msg.type === 'roll-private') {
                return msg.senderId === user?.uid;
            }
            return false;
        });
    }, [chatLog, user?.uid, role]);

    // Channel Counts
    const channelCounts = useMemo(() => {
        let rp = 0, dice = 0, whisper = 0, pinned = 0;
        allPermittedMessages.forEach(msg => {
            if (msg.isPinned) pinned++;
            if (msg.type?.startsWith('roll-') || msg.type === 'group-roll') dice++;
            else if (msg.type === 'chat-private') whisper++;
            else if (['chat-public', 'chat-emote', 'chat-desc', 'chat-ooc', 'boxed'].includes(msg.type)) rp++;
        });
        return { all: allPermittedMessages.length, rp, dice, whisper, pinned };
    }, [allPermittedMessages]);

    // Channel Filter
    const visibleMessages = useMemo(() => {
        if (activeChannel === 'all') return allPermittedMessages;
        if (activeChannel === 'rp') return allPermittedMessages.filter(m => ['chat-public', 'chat-emote', 'chat-desc', 'chat-ooc', 'boxed'].includes(m.type));
        if (activeChannel === 'dice') return allPermittedMessages.filter(m => m.type?.startsWith('roll-') || m.type === 'group-roll');
        if (activeChannel === 'whisper') return allPermittedMessages.filter(m => m.type === 'chat-private');
        if (activeChannel === 'pinned') return allPermittedMessages.filter(m => !!m.isPinned);
        return allPermittedMessages;
    }, [allPermittedMessages, activeChannel]);

    // Scroll Management
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setShowScrollBottom(false);
    };

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        setShowScrollBottom(distanceFromBottom > 140);
    };

    useEffect(() => {
        if (!editingId && !showScrollBottom) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [visibleMessages.length, editingId]);

    const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Sender Info Resolution
    const getSenderInfo = useCallback((msg) => {
        let parsedRollData = null;
        if (msg.type?.startsWith('roll-')) {
            try { parsedRollData = JSON.parse(msg.content); } catch (e) {}
        }
        
        let charName = null;
        if (parsedRollData?.characterName && parsedRollData.characterName !== 'Dungeon Master') {
            charName = parsedRollData.characterName;
        }

        if (charName) {
            const char = [...(data.players || []), ...(data.npcs || [])].find(c => c.name === charName);
            return { name: charName, character: char, isDm: false, avatar: char?.image };
        }

        if (data.dmIds?.includes(msg.senderId) || msg.senderName === 'Dungeon Master') {
            return { name: 'Dungeon Master', character: null, isDm: true, avatar: null };
        }

        if (msg.senderAvatar) {
            return { name: msg.senderName || 'Player', character: null, isDm: false, avatar: msg.senderAvatar };
        }
        
        const charId = data.assignments?.[msg.senderId];
        const assignedCharacter = data.players?.find(p => String(p.id) === String(charId));
        return { 
            name: assignedCharacter ? assignedCharacter.name : (msg.senderName || 'Player'), 
            character: assignedCharacter, 
            isDm: false, 
            avatar: assignedCharacter?.image 
        };
    }, [data.dmIds, data.assignments, data.players, data.npcs]);

    // Click Delegation for Inline Dice
    const handleChatContainerClick = (e) => {
        const pill = e.target.closest('.inline-dice-pill');
        if (pill) {
            e.preventDefault();
            e.stopPropagation();
            const formula = pill.getAttribute('data-formula');
            if (formula && handleDiceRoll) {
                handleDiceRoll(formula, {
                    alias: `${activePersona.name} Quick Roll`,
                    characterName: activePersona.name
                });
            }
        }
    };

    // Active Group Roll Detection for Current Player
    const pendingGroupRollForMe = useMemo(() => {
        if (!chatLog || chatLog.length === 0) return null;
        const groupRolls = chatLog.filter(m => m.type === 'group-roll');
        if (groupRolls.length === 0) return null;
        const latest = groupRolls[groupRolls.length - 1];
        try {
            const parsed = typeof latest.content === 'object' ? latest.content : JSON.parse(latest.content);
            if (!parsed || parsed.status === 'completed') return null;
            const myAssignedCharId = data?.assignments?.[user?.uid];
            const unrolledParticipant = parsed.participants?.find(p => {
                if (p.roll) return false;
                if (user?.uid && p.ownerId === user.uid) return true;
                if (user?.uid && p.assignedUid === user.uid) return true;
                if (myAssignedCharId && String(p.characterId) === String(myAssignedCharId)) return true;
                return false;
            });
            if (unrolledParticipant) {
                return {
                    msg: latest,
                    groupData: parsed,
                    participant: unrolledParticipant
                };
            }
        } catch (e) {}
        return null;
    }, [chatLog, user?.uid, data?.assignments]);

    const handleRollPendingForMe = async (pendingInfo, adv = 'normal') => {
        if (!pendingInfo) return;
        const { msg, groupData, participant } = pendingInfo;
        const mod = participant.modifier || 0;
        const sign = mod >= 0 ? `+${mod}` : `${mod}`;
        let formula = `1d20${sign}`;
        if (adv === 'adv') formula = `2d20kh1${sign}`;
        else if (adv === 'dis') formula = `2d20kl1${sign}`;

        let rollResult = null;
        const diceFn = handleDiceRoll || onDiceRoll;
        if (diceFn) {
            try {
                const res = await diceFn(formula, {
                    alias: `${participant.characterName} Group ${groupData.rollType}`,
                    characterName: participant.characterName,
                    actionType: 'check',
                    skipChat: true
                });
                const rawTotal = (res && typeof res.total === 'number') ? res.total : (Number(res) || 10 + mod);
                const rawNatural = (res && typeof res.natural === 'number') ? res.natural : (rawTotal - mod);
                rollResult = {
                    total: rawTotal,
                    natural: rawNatural,
                    formula,
                    advMode: adv,
                    isCrit: res?.isCrit || rawNatural === 20,
                    isFumble: res?.isFumble || rawNatural === 1,
                    rolledAt: Date.now(),
                    rolledBy: user?.displayName || 'Player'
                };
            } catch (e) {
                console.error(e);
            }
        }
        if (!rollResult) {
            const nat = Math.floor(Math.random() * 20) + 1;
            rollResult = {
                total: nat + mod,
                natural: nat,
                formula,
                advMode: adv,
                isCrit: nat === 20,
                isFumble: nat === 1,
                rolledAt: Date.now(),
                rolledBy: user?.displayName || 'Player'
            };
        }
        const updatedParticipants = groupData.participants.map(p => {
            if (p.characterId === participant.characterId) {
                return { ...p, roll: rollResult };
            }
            return p;
        });
        const updatedGroupData = { ...groupData, participants: updatedParticipants };
        const editFn = onEditMessage || editMessage;
        if (editFn) {
            await editFn(msg.id, { content: JSON.stringify(updatedGroupData) });
        }
    };

    const handleManualPendingRoll = async (pendingInfo, rawVal) => {
        if (!pendingInfo || !rawVal) return;
        const val = parseInt(rawVal, 10);
        if (isNaN(val)) return;

        const { msg, groupData, participant } = pendingInfo;
        const mod = participant.modifier || 0;
        let natural = val;
        let total = val + mod;
        if (val > 20) {
            total = val;
            natural = Math.max(1, Math.min(20, total - mod));
        }

        const rollResult = {
            total,
            natural,
            formula: `Manual (${natural}) ${mod >= 0 ? '+' : ''}${mod}`,
            advMode: 'manual',
            isCrit: natural === 20,
            isFumble: natural === 1,
            isManual: true,
            rolledAt: Date.now(),
            rolledBy: `${user?.displayName || 'Player'} (Manual)`
        };

        const updatedParticipants = groupData.participants.map(p => {
            if (p.characterId === participant.characterId) {
                return { ...p, roll: rollResult };
            }
            return p;
        });

        const updatedGroupData = { ...groupData, participants: updatedParticipants };
        const editFn = onEditMessage || editMessage;
        if (editFn) {
            await editFn(msg.id, { content: JSON.stringify(updatedGroupData) });
        }
        setBannerManualRoll('');
    };

    return (
        <div className="flex h-full relative flex-col bg-slate-950 text-slate-200">
            {/* Top Bar: Channel Tabs & DM Clear */}
            <div className="bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-3 py-2 flex items-center justify-between gap-2 shrink-0 z-20 shadow-md">
                {/* Channel Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {[
                        { id: 'all', label: 'All', icon: 'message-circle', count: channelCounts.all },
                        { id: 'rp', label: 'Roleplay', icon: 'feather', count: channelCounts.rp },
                        { id: 'dice', label: 'Dice', icon: 'dices', count: channelCounts.dice },
                        { id: 'whisper', label: 'Whispers', icon: 'lock', count: channelCounts.whisper },
                        { id: 'pinned', label: 'Pinned', icon: 'star', count: channelCounts.pinned }
                    ].map(tab => {
                        const isActive = activeChannel === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveChannel(tab.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                                    isActive 
                                        ? 'bg-gradient-to-r from-amber-500/25 to-amber-600/15 text-amber-200 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]' 
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/60'
                                }`}
                            >
                                <Icon name={tab.icon} size={13} className={isActive && tab.id === 'pinned' ? 'fill-amber-400 text-amber-400' : isActive ? 'text-amber-400' : 'text-slate-400'}/>
                                <span>{tab.label}</span>
                                {tab.count > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                                        isActive ? 'bg-amber-500/30 text-amber-100 border border-amber-500/40' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* DM Clear Button */}
                {role === 'dm' && !compact && (
                    <button 
                        onClick={clearChat} 
                        className="bg-red-950/40 hover:bg-red-900/70 border border-red-500/40 hover:border-red-400/60 text-red-300 hover:text-red-100 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
                        title="Clear Chat History"
                    >
                        <Icon name="trash-2" size={12}/>
                        <span>Clear</span>
                    </button>
                )}
            </div>

            {/* Chat Messages Stream */}
            <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950">
                <div 
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    onClick={handleChatContainerClick}
                    className="flex-1 overflow-y-auto custom-scroll p-3 sm:p-4 space-y-2 pb-6"
                >
                    {visibleMessages.length === 0 && (
                        <div className="text-center text-slate-500 mt-16 text-sm flex flex-col items-center gap-3 p-6 max-w-sm mx-auto">
                            <div className="w-14 h-14 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-600 shadow-inner">
                                <Icon name="message-square-dashed" size={26} className="text-amber-500/60"/>
                            </div>
                            <div className="font-serif text-slate-300 font-bold text-base">Quiet in the Realm</div>
                            <span className="text-xs text-slate-500 text-center leading-relaxed">
                                No messages in {activeChannel === 'all' ? 'chat' : `the ${activeChannel} channel`}. Speak forth below or type <code className="font-mono text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">/help</code> for commands.
                            </span>
                        </div>
                    )}
                    
                    {visibleMessages.map((msg, i) => {
                        const isSystem = msg.role === 'system';
                        const senderInfo = getSenderInfo(msg);
                        const resolvedSenderName = senderInfo.name;
                        const assignedCharacter = senderInfo.character;
                        
                        const prevMsg = i > 0 ? visibleMessages[i-1] : null;
                        const prevSenderInfo = prevMsg ? getSenderInfo(prevMsg) : null;
                        
                        const showHeader = i === 0 || 
                                           prevMsg.senderId !== msg.senderId || 
                                           (prevSenderInfo && prevSenderInfo.name !== resolvedSenderName) ||
                                           (msg.timestamp - prevMsg.timestamp > 60000);
                        
                        const canEdit = role === 'dm' || msg.senderId === user?.uid;
                        const isPinned = !!msg.isPinned;

                        // System Message
                        if (isSystem) {
                            return (
                                <div key={msg.id || i} className="flex justify-center my-2.5 group">
                                    <div className="text-xs text-amber-200/90 bg-slate-950/80 border border-amber-500/30 px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-md flex items-center gap-2 max-w-xl">
                                        <Icon name="sparkles" size={13} className="text-amber-400 shrink-0"/>
                                        <div className="leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                                        {role === 'dm' && (
                                            <button onClick={() => onDeleteMessage(msg.id)} className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 p-0.5" title="Delete">
                                                <Icon name="x" size={12}/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // Group Roll Interactive Card
                        if (msg.type === 'group-roll') {
                            return (
                                <div key={msg.id || i} className="flex justify-center my-2 w-full">
                                    <GroupRollCard
                                        msg={msg}
                                        user={user}
                                        role={role}
                                        players={data?.players || []}
                                        assignments={data?.assignments || {}}
                                        onDiceRoll={handleDiceRoll || onDiceRoll}
                                        onEditMessage={onEditMessage || editMessage}
                                        onDeleteMessage={onDeleteMessage}
                                        formatTime={formatTime}
                                    />
                                </div>
                            );
                        }

                        // DM Narrative Card (/desc or boxed)
                        if (msg.type === 'chat-desc' || msg.type === 'boxed') {
                            return (
                                <div key={msg.id || i} className={`chat-desc-card p-4 my-2.5 text-slate-200 group relative border border-amber-600/50 shadow-2xl rounded-xl ${isPinned ? 'ring-1 ring-amber-500/60' : ''}`}>
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-500/25">
                                        <div className="flex items-center gap-2 text-xs font-serif font-bold text-amber-400 tracking-wider">
                                            <div className="p-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                                <Icon name="scroll" size={13}/>
                                            </div>
                                            <span>DM NARRATIVE</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isPinned && (
                                                <span className="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-sm">
                                                    <Icon name="star" size={10} className="fill-amber-400"/> Pinned
                                                </span>
                                            )}
                                            <span className="font-mono text-[10px] text-amber-400/70">{formatTime(msg.timestamp)}</span>
                                        </div>
                                    </div>
                                    <div className="font-serif italic text-[14px] text-amber-100/95 leading-relaxed break-words px-0.5" dangerouslySetInnerHTML={{ __html: formatMessage(msg.content || msg.text || '') }} />
                                    
                                    {/* Reactions */}
                                    {renderReactions(msg, handleToggleReaction, user?.uid)}

                                    {/* Action Hover Bar */}
                                    {renderActionBar({ msg, canEdit, isPinned, setEditingId, setEditContent, onDeleteMessage, saveMessageToJournal, handleTogglePin, setActiveReactionMsgId, activeReactionMsgId, handleToggleReaction })}
                                </div>
                            );
                        }

                        // Emote Message (/me)
                        if (msg.type === 'chat-emote') {
                            return (
                                <div key={msg.id || i} className="group relative py-1.5 px-3.5 my-1 rounded-xl bg-slate-900/40 hover:bg-slate-900/80 border border-transparent hover:border-slate-800 transition-all flex items-start gap-2.5 text-sm chat-emote-text">
                                    <span className="text-amber-400 font-bold shrink-0 text-base leading-none mt-0.5">*</span>
                                    <div className="flex-1 leading-relaxed min-w-0">
                                        <strong className="text-amber-300 mr-2 not-italic font-semibold">{resolvedSenderName}</strong>
                                        <span className="text-slate-300" dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                                    </div>
                                    <span className="font-mono text-[10px] text-slate-500 shrink-0 mt-0.5">{formatTime(msg.timestamp)}</span>
                                    {renderActionBar({ msg, canEdit, isPinned, setEditingId, setEditContent, onDeleteMessage, saveMessageToJournal, handleTogglePin, setActiveReactionMsgId, activeReactionMsgId, handleToggleReaction })}
                                </div>
                            );
                        }

                        // Regular or Whisper or Dice Message
                        const isWhisper = msg.type === 'chat-private';

                        return (
                            <div key={msg.id || i} className={`group flex gap-3 px-3 py-2 rounded-xl transition-all relative ${
                                isWhisper 
                                    ? 'chat-whisper-card' 
                                    : 'hover:bg-slate-900/60 border border-transparent hover:border-slate-800/80'
                            } ${isPinned ? 'border-l-2 border-amber-400 bg-amber-950/15' : ''} ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
                                {/* Avatar */}
                                <div className="w-9 flex-shrink-0 pt-0.5">
                                    {showHeader && (() => {
                                        if (senderInfo.avatar) {
                                            return <SafeAvatar src={senderInfo.avatar} alt={resolvedSenderName} />;
                                        }

                                        if (senderInfo.isDm) {
                                            return (
                                                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900 border border-amber-400/60 ring-1 ring-amber-500/30">
                                                    <Icon name="crown" size={17} className="text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]"/>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-slate-200 shadow-md bg-gradient-to-br from-slate-750 to-slate-850 border border-slate-700 ring-1 ring-slate-700/50">
                                                {(resolvedSenderName?.[0] || '?').toUpperCase()}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Message Body */}
                                <div className="flex-1 min-w-0 relative">
                                    {showHeader && (
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className={`font-bold text-sm tracking-wide ${senderInfo.isDm ? 'text-amber-400 flex items-center gap-1' : 'text-slate-200'}`}>
                                                {resolvedSenderName}
                                                {senderInfo.isDm && <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 ml-1">DM</span>}
                                            </span>
                                            
                                            {isWhisper && (
                                                <span className="text-[10px] text-purple-200 bg-purple-950/70 px-2 py-0.5 rounded-full border border-purple-500/50 flex items-center gap-1 font-bold shadow-[0_0_8px_rgba(168,85,247,0.2)]">
                                                    <Icon name="lock" size={10} className="text-purple-300"/> WHISPER {msg.targetName ? `to ${msg.targetName}` : ''}
                                                </span>
                                            )}

                                            {msg.type === 'chat-ooc' && (
                                                <span className="text-[10px] text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700/80 font-mono font-bold">
                                                    OOC
                                                </span>
                                            )}

                                            {isPinned && (
                                                <span className="inline-flex items-center gap-1 text-amber-300 text-[10px] font-bold bg-amber-950/50 border border-amber-500/40 px-2 py-0.5 rounded-full shadow-sm">
                                                    <Icon name="star" size={10} className="fill-amber-400"/> Pinned
                                                </span>
                                            )}

                                            <span className="font-mono text-[10px] text-slate-500 ml-auto">{formatTime(msg.timestamp)}</span>
                                        </div>
                                    )}

                                    {/* Inline Edit Form */}
                                    {editingId === msg.id ? (
                                        <div className="mt-1">
                                            <textarea className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-slate-200" value={editContent} onChange={e => setEditContent(e.target.value)}/>
                                            <div className="flex gap-2 mt-1">
                                                <button onClick={() => submitEdit(msg.id)} className="text-xs bg-green-700 hover:bg-green-600 px-2.5 py-1 rounded text-white font-bold">Save</button>
                                                <button onClick={() => setEditingId(null)} className="text-xs bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded text-white">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-300 text-[14px] leading-relaxed break-words whitespace-pre-wrap group-hover:text-white transition-colors relative">
                                            {msg.content && msg.content.startsWith('chunked:') ? (
                                                <div className="-my-1 max-w-sm rounded-lg overflow-hidden border border-slate-700 shadow-md">
                                                    <ResolvedImage id={msg.content} />
                                                </div>
                                            ) : (
                                                /* Dice Roll Card Renderer */
                                                (() => {
                                                    const isRoll = msg.type?.startsWith('roll-');
                                                    if (isRoll) {
                                                        try {
                                                            const rollData = JSON.parse(msg.content);
                                                            const { rollsNode, finalNatural, finalTotal } = (() => {
                                                                const activeNatural = rollData.natural ?? rollData.naturalRoll ?? 0;
                                                                const activeTotal = rollData.total ?? rollData.result ?? 0;
                                                                const getRollVal = (r) => {
                                                                    if (r === null || r === undefined) return 0;
                                                                    if (typeof r === 'object') return Number(r.value ?? r.total ?? r.result ?? 0);
                                                                    return Number(r);
                                                                };
                                                                
                                                                let inferredAdvMode = rollData.advMode;
                                                                if ((!inferredAdvMode || inferredAdvMode === 'normal') && rollData.alias && typeof rollData.alias === 'string') {
                                                                    const lowerAlias = rollData.alias.toLowerCase();
                                                                    if (lowerAlias.includes('advantage') && !lowerAlias.includes('disadvantage')) inferredAdvMode = 'adv';
                                                                    else if (lowerAlias.includes('disadvantage')) inferredAdvMode = 'dis';
                                                                }

                                                                const formulaStr = String(rollData.formulaDisplay || '') + ' ' + String(rollData.formula || '') + ' ' + String(rollData.die || '');
                                                                const lowerFormula = formulaStr.toLowerCase();
                                                                if (lowerFormula.includes('kh1')) inferredAdvMode = 'adv';
                                                                if (lowerFormula.includes('kl1')) inferredAdvMode = 'dis';

                                                                if (!inferredAdvMode || inferredAdvMode === 'normal' || !rollData.rolls || rollData.rolls.length < 2) {
                                                                    return {
                                                                        rollsNode: rollData.rolls ? rollData.rolls.map(r => getRollVal(r)).join(' + ') : activeNatural,
                                                                        finalNatural: activeNatural,
                                                                        finalTotal: activeTotal
                                                                    };
                                                                }
                                                                const r1 = getRollVal(rollData.rolls[0]);
                                                                const r2 = getRollVal(rollData.rolls[1]);
                                                                let keptIdx = (inferredAdvMode === 'adv') ? (r1 >= r2 ? 0 : 1) : (r1 <= r2 ? 0 : 1);
                                                                const droppedIdx = keptIdx === 0 ? 1 : 0;
                                                                const rollsNode = (
                                                                    <>
                                                                        {rollData.rolls.map((rObj, i) => {
                                                                            const r = getRollVal(rObj);
                                                                            return (
                                                                            <React.Fragment key={i}>
                                                                                {i === droppedIdx ? (
                                                                                    <span className="opacity-40 line-through decoration-red-500">{r}</span>
                                                                                ) : i === keptIdx ? (
                                                                                    <span className="text-amber-400 font-bold">{r}</span>
                                                                                ) : (
                                                                                    <span>{r}</span>
                                                                                )}
                                                                                {i < rollData.rolls.length - 1 && <span className="text-slate-500 mx-1">, </span>}
                                                                            </React.Fragment>
                                                                            );
                                                                        })}
                                                                    </>
                                                                );
                                                                let calculatedTotal = activeTotal - getRollVal(rollData.rolls[droppedIdx]);
                                                                return { rollsNode, finalNatural: getRollVal(rollData.rolls[keptIdx]), finalTotal: calculatedTotal };
                                                            })();

                                                            const actualMod = rollData.modifier ?? rollData.mod ?? 0;
                                                            const isCrit = (rollData.formula?.includes('d20') && finalNatural === 20) || !!rollData.isCrit;
                                                            const isFumble = (rollData.formula?.includes('d20') && finalNatural === 1 && !isCrit) || (!!rollData.isFumble && !isCrit);
                                                            
                                                            const displayCharName = resolvedSenderName;
                                                            const naturalClass = isCrit ? "text-amber-400 font-bold drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" : isFumble ? "text-red-400 font-bold" : "text-slate-300";
                                                            
                                                            const hasDetails = rollData.weaponName || rollData.damageType || rollData.actionType || rollData.alias;
                                                            const isDamageRoll = rollData.actionType === 'damage' || rollData.actionType === 'spell' || !!rollData.damageType || (rollData.alias && rollData.alias.toLowerCase().includes('damage'));
                                                            
                                                            // DM damage application buttons (Full & Half)
                                                            const renderApplyDamage = () => {
                                                                if (role === 'dm' && isDamageRoll && finalTotal > 0) {
                                                                    const halfTotal = Math.floor(finalTotal / 2);
                                                                    return (
                                                                        <div className="mt-2.5 pt-2 border-t border-slate-700/60 w-full flex items-center gap-2 flex-wrap">
                                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DM Apply:</span>
                                                                            <button 
                                                                                onClick={() => handleApplyDamage(finalTotal)}
                                                                                className="inline-flex items-center gap-1.5 bg-red-950/70 hover:bg-red-800/80 border border-red-500/50 text-[11px] font-bold text-red-200 hover:text-white px-2.5 py-1 rounded-lg cursor-pointer transition-all shadow-sm active:scale-95"
                                                                                title={`Apply ${finalTotal} full damage to selected token`}
                                                                            >
                                                                                <Icon name="sword" size={11}/> -{finalTotal} Full
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => handleApplyDamage(halfTotal)}
                                                                                className="inline-flex items-center gap-1.5 bg-amber-950/70 hover:bg-amber-800/80 border border-amber-500/50 text-[11px] font-bold text-amber-200 hover:text-white px-2.5 py-1 rounded-lg cursor-pointer transition-all shadow-sm active:scale-95"
                                                                                title={`Apply ${halfTotal} half damage to selected token`}
                                                                            >
                                                                                <Icon name="shield" size={11}/> -{halfTotal} Half
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            };

                                                            // Chained Damage Roll Button (for attacks)
                                                            const renderChainedDamageButton = () => {
                                                                const dmgFormula = rollData.damageRoll;
                                                                if (!dmgFormula || !handleDiceRoll || isDamageRoll) return null;

                                                                let critDmgFormula = dmgFormula;
                                                                if (isCrit) {
                                                                    critDmgFormula = String(dmgFormula).replace(/(\d*)d(\d+)/g, (m, countStr, faces) => {
                                                                        const count = countStr ? parseInt(countStr) : 1;
                                                                        return `${count * 2}d${faces}`;
                                                                    });
                                                                }

                                                                return (
                                                                    <div className="mt-2.5 pt-2 border-t border-slate-700/60 w-full">
                                                                        <button
                                                                            onClick={() => {
                                                                                const formulaToRoll = isCrit ? critDmgFormula : dmgFormula;
                                                                                handleDiceRoll(formulaToRoll, {
                                                                                    actionType: 'damage',
                                                                                    weaponName: rollData.weaponName || rollData.alias || 'Attack',
                                                                                    damageType: rollData.damageType || '',
                                                                                    alias: isCrit ? 'CRITICAL DAMAGE!' : 'Damage Roll',
                                                                                    characterName: rollData.characterName || displayCharName
                                                                                });
                                                                            }}
                                                                            className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 ${
                                                                                isCrit
                                                                                    ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 hover:brightness-110 text-white shadow-amber-600/30 animate-pulse border border-amber-400/50'
                                                                                    : 'bg-gradient-to-r from-indigo-700 to-indigo-600 hover:from-indigo-600 hover:to-indigo-500 text-white border border-indigo-400/40'
                                                                            }`}
                                                                        >
                                                                            <Icon name={isCrit ? "flame" : "sword"} size={13} />
                                                                            <span>{isCrit ? `🔥 Roll Critical Damage (${critDmgFormula})` : `⚔️ Roll Damage (${dmgFormula})`}</span>
                                                                        </button>
                                                                    </div>
                                                                );
                                                            };

                                                            // Crit / Fumble Badge
                                                            const renderCritBadge = () => {
                                                                if (isCrit) {
                                                                    return (
                                                                        <div className="flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-amber-500/20 via-amber-500/35 to-amber-500/20 text-amber-200 border border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse">
                                                                            <Icon name="sparkles" size={12} className="text-amber-300"/>
                                                                            <span>NATURAL 20 • CRITICAL HIT!</span>
                                                                        </div>
                                                                    );
                                                                }
                                                                if (isFumble) {
                                                                    return (
                                                                        <div className="flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-red-950/80 via-red-900/60 to-red-950/80 text-red-300 border border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.3)]">
                                                                            <Icon name="skull" size={12} className="text-red-400"/>
                                                                            <span>NATURAL 1 • CRITICAL FUMBLE!</span>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            };

                                                            const cardBorderClass = isCrit
                                                                ? "border-amber-500/80 shadow-[0_0_24px_rgba(245,158,11,0.25),inset_0_0_15px_rgba(245,158,11,0.08)] bg-gradient-to-b from-amber-950/40 via-slate-900/95 to-slate-950/95 backdrop-blur-md"
                                                                : isFumble
                                                                    ? "border-red-500/80 shadow-[0_0_24px_rgba(239,68,68,0.25),inset_0_0_15px_rgba(239,68,68,0.08)] bg-gradient-to-b from-red-950/40 via-slate-900/95 to-slate-950/95 backdrop-blur-md"
                                                                    : "border-slate-700/80 shadow-[0_4px_20px_rgba(0,0,0,0.5)] bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 backdrop-blur-md";

                                                            if (rollData.actionType === 'use' || (rollData.formula === '1d0' && rollData.total === 0 && rollData.alias)) {
                                                                return (
                                                                    <div className="bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 w-full max-w-md shadow-2xl backdrop-blur-md flex flex-col items-start text-left relative overflow-hidden">
                                                                        {msg.type === 'roll-private' && (
                                                                            <button 
                                                                                onClick={() => role === 'dm' && onEditMessage(msg.id, { type: 'roll-public' })}
                                                                                className={`absolute top-2.5 right-2.5 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                                title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                            >
                                                                                <Icon name="eye-off" size={14} />
                                                                            </button>
                                                                        )}
                                                                        <div className="text-[11px] uppercase font-bold tracking-wider text-amber-500/90">{displayCharName}</div>
                                                                        <div className="font-bold text-amber-300 text-base flex items-center gap-1.5 mt-0.5">
                                                                            <Icon name="sparkles" size={15} className="text-amber-400"/>
                                                                            <span>{rollData.alias || rollData.weaponName || 'Used Feature'}</span>
                                                                        </div>
                                                                        {rollData.description && <div className="text-slate-300 text-xs mt-1.5 leading-relaxed whitespace-pre-wrap bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 w-full">{rollData.description}</div>}
                                                                        <ChatSaveCard rollData={rollData} previewTargets={previewTargets} role={role} handleRollSave={handleRollSave} />
                                                                    </div>
                                                                );
                                                            }

                                                            let isParsedSave = false;
                                                            let parsedSaveDc = undefined;
                                                            if (rollData.alias && typeof rollData.alias === 'string' && rollData.alias.toLowerCase().includes('save vs dc')) {
                                                                isParsedSave = true;
                                                                const match = rollData.alias.match(/DC\s*(\d+)/i);
                                                                if (match) parsedSaveDc = parseInt(match[1], 10);
                                                            }

                                                            if (rollData.isSave || rollData.saveDc !== undefined || isParsedSave) {
                                                                const actualSaveDc = rollData.saveDc !== undefined ? rollData.saveDc : parsedSaveDc;
                                                                const isSuccess = finalTotal >= actualSaveDc;
                                                                return (
                                                                    <div className={`${cardBorderClass} border rounded-xl p-3.5 w-full max-w-md shadow-2xl flex flex-col items-start text-left relative overflow-hidden transition-all`}>
                                                                        {msg.type === 'roll-private' && (
                                                                            <button 
                                                                                onClick={() => role === 'dm' && onEditMessage(msg.id, { type: 'roll-public' })}
                                                                                className={`absolute top-2.5 right-2.5 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                                title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                            >
                                                                                <Icon name="eye-off" size={14} />
                                                                            </button>
                                                                        )}
                                                                        {renderCritBadge()}
                                                                        <div className="font-bold text-amber-400 mb-2 text-sm flex items-center gap-1.5">
                                                                            <Icon name="shield" size={14}/>
                                                                            <span>{rollData.alias || `DC ${actualSaveDc} Save Results:`}</span>
                                                                        </div>
                                                                        <div className={`w-full flex flex-col p-2.5 rounded-lg border ${isSuccess ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'bg-rose-950/30 border-rose-500/40'}`}>
                                                                            <span className="font-bold text-slate-200 text-xs">{displayCharName}</span>
                                                                            <div className="flex items-center justify-between gap-2 text-xs mt-1">
                                                                                <span className="text-slate-400 font-mono">[<span className={naturalClass}>{rollsNode}</span>] {actualMod >= 0 ? '+'+actualMod : actualMod}</span>
                                                                                <span className={`font-mono font-black text-sm flex items-center gap-1.5 ${isSuccess ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                    <span>{finalTotal}</span>
                                                                                    <span className="text-xs font-sans uppercase tracking-wider font-bold">({isSuccess ? 'Success' : 'Fail'})</span>
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {renderApplyDamage()}
                                                                    </div>
                                                                );
                                                            }

                                                            if (hasDetails) {
                                                                return (
                                                                    <div className={`${cardBorderClass} border rounded-xl p-3.5 w-full max-w-md shadow-2xl flex flex-col items-start text-left relative overflow-hidden transition-all`}>
                                                                        {msg.type === 'roll-private' && (
                                                                            <button 
                                                                                onClick={() => role === 'dm' && onEditMessage(msg.id, { type: 'roll-public' })}
                                                                                className={`absolute top-2.5 right-2.5 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                                title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                            >
                                                                                <Icon name="eye-off" size={14} />
                                                                            </button>
                                                                        )}
                                                                        {renderCritBadge()}
                                                                        <div className="text-[11px] uppercase font-bold tracking-wider text-amber-500/90">{displayCharName}</div>
                                                                        {rollData.weaponName && <div className="font-bold text-slate-100 text-base">{rollData.weaponName}</div>}
                                                                        {rollData.damageType && <div className="text-amber-300/80 text-xs font-medium">{rollData.damageType}</div>}
                                                                        {rollData.alias && !rollData.weaponName && <div className="text-slate-200 text-xs font-semibold">{rollData.alias}</div>}
                                                                        <div className="mt-2.5 pt-2 border-t border-slate-700/60 w-full flex items-center justify-between gap-2 flex-wrap">
                                                                            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                                                                                <span>{rollData.formula}{rollData.modifier !== 0 ? (rollData.modifier > 0 ? `+${rollData.modifier}` : rollData.modifier) : ''}</span>
                                                                                <span className="text-slate-600">➜</span>
                                                                                <span className="px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700/70 text-slate-200 font-bold">
                                                                                    [{rollsNode}]
                                                                                </span>
                                                                                {actualMod !== 0 && <span className="text-amber-300 font-bold">{actualMod > 0 ? '+' : ''}{actualMod}</span>}
                                                                            </div>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-slate-500 font-bold text-sm">=</span>
                                                                                <span className={`text-2xl font-black font-mono drop-shadow-md ${isCrit ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]' : isFumble ? 'text-red-400' : 'text-amber-300'}`}>
                                                                                    {finalTotal}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {renderChainedDamageButton()}
                                                                        {renderApplyDamage()}
                                                                        <ChatSaveCard rollData={rollData} previewTargets={previewTargets} role={role} handleRollSave={handleRollSave} />
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <div className={`${cardBorderClass} border rounded-xl p-3 w-full max-w-md flex flex-col items-start relative overflow-hidden transition-all shadow-2xl`}>
                                                                    {msg.type === 'roll-private' && (
                                                                        <button 
                                                                            onClick={() => role === 'dm' && onEditMessage(msg.id, { type: 'roll-public' })}
                                                                            className={`absolute top-2.5 right-2.5 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                            title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                        >
                                                                            <Icon name="eye-off" size={13} />
                                                                        </button>
                                                                    )}
                                                                    {renderCritBadge()}
                                                                    <div className="text-slate-400 text-xs"><strong className="text-slate-200">{displayCharName}</strong> rolled <span className="font-mono text-amber-300">{rollData.formula}</span></div>
                                                                    <div className="mt-2 pt-2 border-t border-slate-700/60 w-full flex items-center justify-between gap-2 flex-wrap">
                                                                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                                                                            <span className="px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700/70 text-slate-200 font-bold">
                                                                                [{rollsNode}]
                                                                            </span>
                                                                            {actualMod !== 0 && <span className="text-amber-300 font-bold">{actualMod > 0 ? '+' : ''}{actualMod}</span>}
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="text-slate-500 font-bold text-sm">=</span>
                                                                            <span className={`text-2xl font-black font-mono ${isCrit ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]' : isFumble ? 'text-red-400' : 'text-amber-300'}`}>
                                                                                {finalTotal}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    {renderChainedDamageButton()}
                                                                    {renderApplyDamage()}
                                                                    <ChatSaveCard rollData={rollData} previewTargets={previewTargets} role={role} handleRollSave={handleRollSave} />
                                                                </div>
                                                            );

                                                        } catch (e) {
                                                            return <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content || msg.text || '') }} />;
                                                        }
                                                    }

                                                    // Regular formatted text
                                                    return <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content || msg.text || '') }} />;
                                                })()
                                            )}
                                        </div>
                                    )}

                                    {/* Active Emoji Reactions */}
                                    {renderReactions(msg, handleToggleReaction, user?.uid)}

                                    {/* Action Hover Bar */}
                                    {renderActionBar({ msg, canEdit, isPinned, setEditingId, setEditContent, onDeleteMessage, saveMessageToJournal, handleTogglePin, setActiveReactionMsgId, activeReactionMsgId, handleToggleReaction })}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={chatEndRef}></div>
                </div>

                {/* Active Group Roll Prompt Banner Popup */}
                {pendingGroupRollForMe && (
                    <div className="absolute bottom-16 left-3 right-3 sm:left-6 sm:right-6 bg-gradient-to-r from-amber-950/95 via-slate-900/95 to-amber-950/95 border border-amber-500/60 rounded-xl p-3 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-30 animate-in slide-in-from-bottom-3 duration-300">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                                <Icon name="dices" size={18} className="animate-pulse" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                    <span>Group {pendingGroupRollForMe.groupData.rollType} Check</span>
                                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-400 border border-amber-500/30">Action Required</span>
                                </div>
                                <div className="text-[11px] text-slate-300 mt-0.5 truncate">
                                    Roll for <strong className="text-white">{pendingGroupRollForMe.participant.characterName}</strong> (Modifier: <span className="font-bold text-amber-300 font-mono">{pendingGroupRollForMe.participant.modifier >= 0 ? '+' : ''}{pendingGroupRollForMe.participant.modifier}</span>)
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => handleRollPendingForMe(pendingGroupRollForMe)}
                                className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-lg shadow-lg flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
                            >
                                <Icon name="dices" size={14} /> Roll 1d20{pendingGroupRollForMe.participant.modifier >= 0 ? '+' : ''}{pendingGroupRollForMe.participant.modifier}
                            </button>

                            {/* Manual Roll Input */}
                            <div className="flex items-center gap-1 bg-slate-950/90 border border-amber-500/50 rounded-lg p-0.5 shadow-sm">
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    placeholder="Type roll..."
                                    value={bannerManualRoll}
                                    onChange={(e) => setBannerManualRoll(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleManualPendingRoll(pendingGroupRollForMe, bannerManualRoll);
                                        }
                                    }}
                                    className="w-16 h-7 bg-transparent text-center font-mono text-xs font-bold text-amber-300 outline-none placeholder:text-slate-500"
                                    title="Type a manual roll result (e.g. from physical dice)"
                                />
                                <button
                                    onClick={() => handleManualPendingRoll(pendingGroupRollForMe, bannerManualRoll)}
                                    disabled={!bannerManualRoll}
                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white text-xs font-bold rounded transition-colors"
                                    title="Submit manual roll"
                                >
                                    ✓
                                </button>
                            </div>

                            <button
                                onClick={scrollToBottom}
                                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                                title="Scroll to Card in Chat"
                            >
                                <Icon name="chevron-down" size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Floating "Jump to Present" Button */}
                {showScrollBottom && (
                    <button 
                        onClick={scrollToBottom} 
                        className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-indigo-600/90 hover:bg-indigo-600 border border-indigo-400/50 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-xl flex items-center gap-1.5 transition-all z-30 animate-bounce"
                    >
                        <Icon name="arrow-down" size={13}/> Jump to latest
                    </button>
                )}

                {/* Slash Command Help Popover */}
                {showSlashHelp && (
                    <div className="absolute bottom-20 left-4 right-4 max-w-md bg-slate-950/95 border border-amber-500/40 rounded-2xl p-3.5 shadow-2xl z-40 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-amber-500/20">
                            <span className="text-xs font-bold text-amber-400 flex items-center gap-2 font-serif tracking-wider">
                                <div className="p-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                    <Icon name="terminal" size={13}/>
                                </div>
                                <span>SLASH COMMANDS</span>
                            </span>
                            <button onClick={() => setShowSlashHelp(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
                                <Icon name="x" size={14}/>
                            </button>
                        </div>
                        <div className="space-y-1 text-xs text-slate-300 max-h-52 overflow-y-auto custom-scroll pr-1">
                            {[
                                { cmd: '/r 1d20+5', desc: 'Roll any dice formula directly' },
                                { cmd: '/m 18', desc: 'Log manual physical dice result' },
                                { cmd: '/w [player] [msg]', desc: 'Whisper privately to a player' },
                                { cmd: '/gm [msg]', desc: 'Whisper directly to the DM' },
                                { cmd: '/me [action]', desc: 'In-character narrative action' },
                                { cmd: '/desc [text]', desc: 'DM module boxed narrative card' },
                                { cmd: '/ooc [msg]', desc: 'Out-of-Character table talk' },
                                { cmd: '/clear', desc: 'Clear chat history (DM only)' }
                            ].map(item => (
                                <button
                                    key={item.cmd}
                                    onClick={() => {
                                        const baseCmd = item.cmd.split(' ')[0] + ' ';
                                        setInputText(baseCmd);
                                        setShowSlashHelp(false);
                                    }}
                                    className="w-full text-left p-2 rounded-xl hover:bg-slate-900/90 border border-transparent hover:border-slate-800 flex items-center justify-between group transition-all"
                                >
                                    <span className="font-mono text-amber-400 group-hover:text-amber-300 font-semibold">{item.cmd}</span>
                                    <span className="text-[11px] text-slate-500 group-hover:text-slate-400">{item.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bottom Input Area */}
                <div className="p-3 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 flex flex-col gap-2.5 shrink-0 z-20 shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
                    {/* Controls Row: Speaking As Persona + Mode Dropdown + Dice Launcher */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* "Speaking As..." Persona Switcher */}
                        <div className="relative">
                            <button 
                                onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                                className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-850 border border-slate-700/80 hover:border-amber-500/40 rounded-xl px-3 py-1.5 text-xs transition-all shadow-sm cursor-pointer"
                                title="Change Persona"
                            >
                                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">As:</span>
                                {activePersona.image ? (
                                    <img src={activePersona.image} alt={activePersona.name} className="w-4 h-4 rounded-full object-cover ring-1 ring-amber-500/40"/>
                                ) : activePersona.type === 'dm' ? (
                                    <Icon name="crown" size={13} className="text-amber-400"/>
                                ) : (
                                    <Icon name="user" size={13} className="text-slate-400"/>
                                )}
                                <span className="font-bold text-amber-300 truncate max-w-[120px]">{activePersona.name}</span>
                                <Icon name="chevron-down" size={11} className="text-slate-500"/>
                            </button>

                            {/* Persona Dropdown */}
                            {showPersonaMenu && (
                                <div className="absolute left-0 bottom-full mb-2 w-64 bg-slate-950/95 border border-slate-700/80 rounded-2xl shadow-2xl p-2 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                                    <div className="text-[10px] uppercase font-bold tracking-widest text-amber-400/80 px-2.5 py-1.5 border-b border-slate-800/80 mb-1">
                                        Speaking As:
                                    </div>
                                    <div className="space-y-1 max-h-52 overflow-y-auto custom-scroll">
                                        {availablePersonas.map(persona => {
                                            const isSelected = activePersona.id === persona.id;
                                            return (
                                                <button
                                                    key={persona.id}
                                                    onClick={() => handleSelectPersona(persona)}
                                                    className={`w-full text-left p-2 rounded-xl flex items-center gap-2.5 transition-all cursor-pointer ${
                                                        isSelected 
                                                            ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm' 
                                                            : 'hover:bg-slate-900 text-slate-300 border border-transparent'
                                                    }`}
                                                >
                                                    {persona.image ? (
                                                        <img src={persona.image} alt={persona.name} className="w-7 h-7 rounded-full object-cover border border-slate-700"/>
                                                    ) : persona.type === 'dm' ? (
                                                        <div className="w-7 h-7 rounded-full bg-amber-900/50 border border-amber-500/40 flex items-center justify-center">
                                                            <Icon name="crown" size={14} className="text-amber-400"/>
                                                        </div>
                                                    ) : (
                                                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
                                                            {(persona.name?.[0] || '?').toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-bold text-xs truncate">{persona.name}</div>
                                                        <div className="text-[10px] text-slate-500 truncate">{persona.badge}</div>
                                                    </div>
                                                    {isSelected && (
                                                        <Icon name="check" size={14} className="text-amber-400 shrink-0"/>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Message Type Selector */}
                        <select 
                            value={sendMode} 
                            onChange={(e) => setSendMode(e.target.value)} 
                            className="bg-slate-900/90 text-xs font-semibold text-slate-300 border border-slate-700/80 hover:border-slate-600 rounded-xl px-3 py-1.5 outline-none focus:border-amber-500/70 transition-all cursor-pointer shadow-sm"
                        >
                            <option value="chat-public">📢 Public Chat</option>
                            <option value="chat-private">🕵️ Secret Whisper</option>
                        </select>

                        {/* Whisper Target Selector */}
                        {sendMode === 'chat-private' && (
                            <select 
                                value={targetUser} 
                                onChange={(e) => setTargetUser(e.target.value)} 
                                className="bg-purple-950/50 text-xs font-semibold text-purple-200 border border-purple-500/60 rounded-xl px-3 py-1.5 outline-none max-w-[160px] shadow-[0_0_10px_rgba(168,85,247,0.2)] transition-all cursor-pointer"
                            >
                                <option value="">Select recipient...</option>
                                {Object.entries(data.activeUsers || {}).map(([uid, userName]) => {
                                    if (uid === user.uid) return null;
                                    if (data.dmIds?.includes(uid)) return <option key={uid} value={uid}>👑 Dungeon Master</option>;
                                    const charId = data.assignments?.[uid];
                                    const char = data.players?.find(p => p.id == charId);
                                    const displayName = char ? `${char.name} (${char.class})` : (userName?.includes('@') ? userName.split('@')[0] : userName);
                                    return <option key={uid} value={uid}>{displayName}</option>;
                                })}
                            </select>
                        )}

                        <div className="ml-auto flex items-center gap-1.5">
                            {/* Slash Command Helper Button */}
                            <button 
                                onClick={() => setShowSlashHelp(!showSlashHelp)} 
                                className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-black bg-slate-900/90 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-slate-700/80 hover:border-amber-500/40 transition-all shadow-sm active:scale-95 cursor-pointer"
                                title="Slash Commands (/help)"
                            >
                                /
                            </button>

                            {/* Dice Tool Toggle Button */}
                            <button 
                                onClick={() => setShowTools(!showTools)} 
                                className={`rounded-xl p-2 transition-all border cursor-pointer active:scale-95 ${
                                    showTools 
                                        ? 'text-amber-300 bg-amber-500/20 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]' 
                                        : 'text-slate-400 hover:text-slate-200 bg-slate-900/90 hover:bg-slate-800 border-slate-700/80'
                                }`}
                                title="Toggle Dice Tray"
                            >
                                <Icon name="dices" size={16}/>
                            </button>
                        </div>
                    </div>
                    
                    {/* Text Input & Actions */}
                    <div className={`relative flex gap-2 items-end rounded-2xl p-2.5 border transition-all ${
                        sendMode === 'chat-private' 
                            ? 'bg-purple-950/25 border-purple-500/50 focus-within:border-purple-400 focus-within:ring-1 focus-within:ring-purple-500/40 shadow-[0_0_16px_rgba(168,85,247,0.18)]' 
                            : 'bg-slate-900/90 border-slate-700/80 focus-within:border-amber-500/70 focus-within:ring-1 focus-within:ring-amber-500/30 focus-within:shadow-[0_0_16px_rgba(245,158,11,0.15)] shadow-inner'
                    }`}>
                        <textarea 
                            value={inputText} 
                            onChange={e => setInputText(e.target.value)} 
                            onKeyDown={handleKeyDown} 
                            placeholder={
                                sendMode === 'chat-private' ? `Whispering secretly...` :
                                `Message as ${activePersona.name} (type / for commands)...`
                            } 
                            className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-500 resize-none min-h-[38px] max-h-32 focus:ring-0 outline-none custom-scroll text-sm leading-relaxed py-1.5 px-1" 
                            rows={1} 
                            style={{ height: inputText.length > 50 ? 'auto' : '38px' }} 
                        />

                        {/* Image Upload Button */}
                        <button 
                            onClick={() => fileInputRef.current?.click()} 
                            disabled={isUploading} 
                            className="p-2 rounded-xl transition-all shrink-0 text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 cursor-pointer" 
                            title="Upload Image"
                        >
                            {isUploading ? <Icon name="loader" size={17} className="animate-spin text-amber-400"/> : <Icon name="image" size={17}/>}
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

                        {/* Send Button */}
                        <button 
                            onClick={handleSend} 
                            disabled={!inputText.trim()} 
                            className={`p-2.5 rounded-xl transition-all shrink-0 flex items-center justify-center ${
                                inputText.trim() 
                                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black shadow-[0_0_12px_rgba(245,158,11,0.3)] active:scale-95 cursor-pointer' 
                                    : 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
                            }`}
                            title="Send Message (Enter)"
                        >
                            <Icon name="send" size={16}/>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper: Render Active Reactions Bar
function renderReactions(msg, handleToggleReaction, currentUid) {
    const reactions = msg.reactions || {};
    const entries = Object.entries(reactions).filter(([_, uids]) => Array.isArray(uids) && uids.length > 0);
    if (entries.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {entries.map(([emoji, uids]) => {
                const userReacted = uids.includes(currentUid);
                return (
                    <button
                        key={emoji}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg.id, emoji); }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all cursor-pointer ${
                            userReacted
                                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.2)] font-semibold'
                                : 'bg-slate-900/80 text-slate-300 border border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                        title={uids.length > 1 ? `${uids.length} reactions` : '1 reaction'}
                    >
                        <span>{emoji}</span>
                        <span className="font-mono text-[11px] font-bold">{uids.length}</span>
                    </button>
                );
            })}
        </div>
    );
}

// Helper: Render Hover Action Bar
function renderActionBar({ msg, canEdit, isPinned, setEditingId, setEditContent, onDeleteMessage, saveMessageToJournal, handleTogglePin, setActiveReactionMsgId, activeReactionMsgId, handleToggleReaction }) {
    const isPickerOpen = activeReactionMsgId === msg.id;

    return (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-slate-950/90 border border-slate-750 rounded-xl p-1 shadow-2xl transition-all z-10 backdrop-blur-md">
            {/* Quick Reactions Trigger */}
            <div className="relative">
                <button
                    onClick={() => setActiveReactionMsgId(isPickerOpen ? null : msg.id)}
                    className="text-slate-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-850 transition-all cursor-pointer"
                    title="Add Reaction"
                >
                    <Icon name="smile" size={13}/>
                </button>

                {/* Quick Emoji Popover */}
                {isPickerOpen && (
                    <div className="absolute right-0 bottom-full mb-1.5 flex items-center gap-1 bg-slate-950/95 border border-slate-700/80 rounded-xl p-1.5 shadow-2xl z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                        {QUICK_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                className="hover:scale-125 p-1 rounded-lg text-base transition-transform cursor-pointer hover:bg-slate-800/60"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Pin Toggle */}
            <button 
                onClick={() => handleTogglePin(msg.id)} 
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${isPinned ? 'text-amber-400 bg-amber-950/50' : 'text-slate-400 hover:text-amber-300 hover:bg-slate-850'}`}
                title={isPinned ? "Unpin message" : "Pin message"}
            >
                <Icon name="star" size={13} className={isPinned ? 'fill-amber-400' : ''}/>
            </button>

            {/* Save Note to Journal */}
            <button 
                onClick={() => saveMessageToJournal(msg.content)} 
                className="text-slate-400 hover:text-emerald-300 p-1.5 rounded-lg hover:bg-slate-850 transition-all cursor-pointer" 
                title="Save to Journal"
            >
                <Icon name="book-plus" size={13}/>
            </button>

            {/* Edit / Delete */}
            {canEdit && (
                <>
                    <button 
                        onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} 
                        className="text-slate-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-850 transition-all cursor-pointer" 
                        title="Edit"
                    >
                        <Icon name="pencil" size={13}/>
                    </button>
                    <button 
                        onClick={() => onDeleteMessage(msg.id)} 
                        className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-850 transition-all cursor-pointer" 
                        title="Delete"
                    >
                        <Icon name="trash-2" size={13}/>
                    </button>
                </>
            )}
        </div>
    );
}

export default SessionView;
