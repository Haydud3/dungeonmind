import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Icon from './Icon';
import { retrieveContext, buildPrompt, buildCastList } from '../utils/loreEngine';
// START CHANGE: Import Character Store for Targeting
import { useCharacterStore } from '../stores/useCharacterStore';
import ResolvedImage from './ResolvedImage';
import { compressImage } from '../utils/imageCompressor';
import { storeChunkedMap } from '../utils/storageUtils';
import { getMapRef, updateMap } from '../utils/mapService';
import { getDoc } from 'firebase/firestore';
import { useResolvedUrl } from '../utils/useResolvedUrl';
// END CHANGE

const SafeAvatar = ({ src, alt }) => {
    const resolved = useResolvedUrl(src);
    if (!resolved && src?.startsWith('chunked:')) return <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse border border-slate-600" />;
    return <img src={resolved || src} alt={alt} className="w-10 h-10 rounded-full object-cover shadow-lg border border-slate-600" referrerPolicy="no-referrer" />;
};

// START CHANGE: Add clearChat to destructured props
import { useNewCampaign } from '../contexts/NewCampaignProvider';

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
            <span key={char.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isNegative ? 'bg-red-900/50 text-red-300 border border-red-800/50' : 'bg-slate-800 text-slate-300 border border-slate-600'}`}>
                {char.name} ({modDisplay})
            </span>
        );
    });

    return (
        <div className="mt-2 w-full pt-2 border-t border-slate-700/50 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mr-1">Targets:</span>
                {targetBadges.length > 0 ? targetBadges : (
                    <span className="text-[10px] text-slate-500 italic">{role === 'dm' ? 'Select tokens on the map' : 'No character assigned'}</span>
                )}
            </div>
            <div className="flex bg-slate-900 border border-slate-700/50 rounded overflow-hidden shadow-inner w-full mt-1">
                <button 
                    onClick={(e) => { e.stopPropagation(); setAdvMode('dis'); }} 
                    className={`flex-1 py-1.5 text-[9px] uppercase font-bold tracking-widest transition-colors ${advMode === 'dis' ? 'bg-red-900/50 text-red-400' : 'text-slate-500 hover:bg-slate-800'}`}
                >
                    Disadvantage
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); setAdvMode('normal'); }} 
                    className={`flex-1 py-1.5 text-[9px] uppercase font-bold tracking-widest transition-colors border-x border-slate-700/50 ${advMode === 'normal' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:bg-slate-800'}`}
                >
                    Normal
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); setAdvMode('adv'); }} 
                    className={`flex-1 py-1.5 text-[9px] uppercase font-bold tracking-widest transition-colors ${advMode === 'adv' ? 'bg-green-900/50 text-green-400' : 'text-slate-500 hover:bg-slate-800'}`}
                >
                    Advantage
                </button>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); handleRollSave(dcInfo, previewTargets, advMode); setAdvMode('normal'); }}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold py-1.5 rounded shadow-lg transition-colors flex items-center justify-center gap-1 mt-1"
            ><Icon name="dices" size={12}/> Roll DC {dcInfo.value} {dcInfo.stat.toUpperCase()} Save</button>
        </div>
    );
};

const SessionView = ({ 
    inputText, setInputText, 
    onSendMessage, onEditMessage, onDeleteMessage, 
    showTools, setShowTools, diceLog, handleDiceRoll,
    possessedNpcId, onSavePage, aiHelper,
    compact, role
}) => {
    const context = useNewCampaign();
    if (!context) return null;

    const { campaign, chatLog, journal_pages, loreChunks, user, gameParams, sendMessage, editMessage, deleteMessage, clearChat, saveJournalPage } = context;
    const data = campaign;
    const players = campaign?.players || [];
    const castList = buildCastList(campaign || {}); // Guard against null campaign
    const myCharId = campaign?.assignments?.[user?.uid];

    // START CHANGE: Target Preview State
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
    // END CHANGE

    const saveMessageToJournal = useCallback((content) => {
        const newPageId = Date.now().toString();
        const newPage = {
            id: newPageId,
            title: `Chat Log - ${new Date().toLocaleDateString()}`,
            content: content,
            timestamp: Date.now()
        };
        saveJournalPage(newPageId, newPage);
    }, [saveJournalPage]);

    // ... (rest of the component)
// END CHANGE
    const [sendMode, setSendMode] = useState('chat-public'); 
    const [targetUser, setTargetUser] = useState(''); 
    const [aiContextMode, setAiContextMode] = useState('fast'); 
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [showRecapMenu, setShowRecapMenu] = useState(false);
    // START CHANGE: Add Ghost Message State
    const [ghostMessage, setGhostMessage] = useState(null);
    // END CHANGE
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const compressed = await compressImage(file, 800, 0.7);
            const id = await storeChunkedMap(compressed, `chat_img_${Date.now()}`);
            onSendMessage(id, sendMode, targetUser);
        } catch (err) {
            console.error("Upload failed", err);
            alert("Failed to upload image.");
        }
        setIsUploading(false);
        e.target.value = null;
    };

    // START CHANGE: Apply Damage Handler
    const handleApplyDamage = useCallback(async (amount) => {
        const { selectedTokenIds } = useCharacterStore.getState();
        if (!selectedTokenIds || selectedTokenIds.length === 0) return alert("No target selected!");

        const activeMapId = data?.activeMapId;
        const code = gameParams?.code;

        if (activeMapId && code) {
            try {
                const mapRef = getMapRef(code, activeMapId);
                const mapSnap = await getDoc(mapRef);
                if (mapSnap.exists()) {
                    const mapData = mapSnap.data();
                    const updates = {};
                    let alertText = [];
                    
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
                                return; // Skip if no HP tracking found
                            }
                            
                            const newHp = Math.max(0, currentHp - amount);
                            updates[`tokens.${id}.hp`] = { ...token.hp, current: newHp, max: maxHp };
                            
                            alertText.push(`${char ? char.name : 'Token'}: ${currentHp} -> ${newHp}`);
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
                        
                        alert(`Applied ${amount} damage:\n${alertText.join('\\n')}`);
                    } else {
                        alert("Selected tokens don't have HP tracking enabled.");
                    }
                }
            } catch(e) {
                console.error("Failed to apply damage", e);
                alert("Failed to apply damage. See console.");
            }
        } else {
            alert("No active map found.");
        }
    }, [data, gameParams, context]);
    // END CHANGE

    // START CHANGE: Interactive Save Handler
    const handleRollSave = useCallback((dcData, targetsToRoll, advMode = 'normal') => {
        if (!targetsToRoll || targetsToRoll.length === 0) {
            if (role === 'dm') return alert("Select tokens on the map to roll their saves.");
            return alert("No character selected or assigned to roll the save.");
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

            // Stagger by 50ms to prevent React state batching from overwriting simultaneous rolls
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
    }, [handleDiceRoll, role]);
    // END CHANGE

    // START CHANGE: Enhanced Formatter with Table Support
    const formatMessage = (text) => {
        if (!text) return "";
        
        // 1. Parse Tables: Find blocks that look like markdown tables and convert to HTML
        let formatted = text.replace(/((?:\|.*\|(?:\n|$))+)/g, (match) => {
            const rows = match.trim().split('\n').filter(r => !r.includes('---')); // Remove separator lines
            const htmlRows = rows.map((row, i) => {
                const cells = row.split('|').filter(c => c.trim()).map(c => `<td class="border border-slate-700 p-2 ${i===0 ? 'font-bold bg-slate-800 text-amber-500' : ''}">${c.trim()}</td>`).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            return `<div class="overflow-x-auto my-2 rounded border border-slate-700"><table class="w-full text-xs text-left border-collapse"><tbody class="divide-y divide-slate-700">${htmlRows}</tbody></table></div>`;
        });

        // 2. Standard Markdown Formatting
        return formatted
            .replace(/^### (.*$)/gm, '<div class="text-lg font-bold text-amber-500 mt-2 mb-1 fantasy-font">$1</div>')
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
            .replace(/^- (.*$)/gm, '<div class="ml-4 flex items-start gap-2"><span class="text-slate-500">•</span><span>$1</span></div>')
            .replace(/\n/g, '<br/>');
    };
    // END CHANGE

    // The New "Brain" Logic
    const handleSmartSend = async (type) => {
        if (!inputText.trim()) return;
        
        onSendMessage(inputText, 'chat-public');
        const query = inputText;
        setInputText("");

        if (type === 'ai-public' || type === 'ai-private') {
            setGhostMessage({
                id: 'ghost', role: 'ai', senderName: 'DungeonMind',
                content: '<span class="animate-pulse">Consulting the archives...</span>',
                timestamp: Date.now(), type: type, isGhost: true
            });

            // B. Build Context
            const recentChat = chatLog.slice(-10).map(m => `${m.senderName}: ${m.content}`).join('\n');
            
            // START CHANGE: Pass the 'players' and 'castList' variables into the functions
            // 'players' is the 4th argument, 'castList' is the 5th argument of buildPrompt
            const aiContext = retrieveContext(query, loreChunks || [], journal_pages || {}, players, role, myCharId);
            
            const isPublic = (type === 'ai-public');
            const prompt = buildPrompt(query, aiContext, recentChat, isPublic, castList);
            // END CHANGE

            // START CHANGE: Debug logging to verify the AI's "Brain"
            console.log("DEBUG AI PROMPT:", prompt);
            // END CHANGE

            if (aiHelper) {
                let answer = await aiHelper([{ role: 'user', content: prompt }]);
                if (typeof answer !== 'string') {
                    let extracted = answer;
                    if (answer?.message?.content) extracted = answer.message.content;
                    else if (typeof answer?.response?.text === 'function') extracted = await answer.response.text();
                    else if (typeof answer?.text === 'function') extracted = await answer.text();
                    else if (answer?.text) extracted = answer.text;
                    answer = typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
                }
                setGhostMessage(null);
                
                if (answer && typeof answer === 'string') {
                    onSendMessage(answer, type, null); 
                } else {
                    onSendMessage("The DungeonMind is currently unreachable. (Connection blocked or AI returned no response)", 'system', null);
                }
            } else {
                setGhostMessage(null);
            }
        }
    };

    // START CHANGE: Logic for the Recap Button
    const [isLoading, setIsLoading] = useState(false);

    const generateRecap = async (scope = 'recent') => {
        setIsLoading(true);
        
        // 1. Filter Chat Log based on scope ('recent' = last 4h gap, 'full' = all)
        const sessionThreshold = 4 * 60 * 60 * 1000; 
        let relevantLogs = chatLog;
        
        if (scope === 'recent') {
            let lastBreakIndex = 0;
            for (let i = 1; i < chatLog.length; i++) {
                if (chatLog[i].timestamp - chatLog[i-1].timestamp > sessionThreshold) {
                    lastBreakIndex = i;
                }
            }
            relevantLogs = chatLog.slice(lastBreakIndex);
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
        let summary = await aiHelper([{ role: 'user', content: prompt }]);
        if (typeof summary !== 'string') {
            let extracted = summary;
            if (summary?.message?.content) extracted = summary.message.content;
            else if (typeof summary?.response?.text === 'function') extracted = await summary.response.text();
            else if (typeof summary?.text === 'function') extracted = await summary.text();
            else if (summary?.text) extracted = summary.text;
            summary = typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
        }
        
        // 4. Create Journal Entry
        const newPageId = Date.now().toString();
        const newPage = {
            id: newPageId,
            title: `Session Recap - ${new Date().toLocaleDateString()}`,
            content: (summary && typeof summary === 'string') ? summary : "<i>The Scribe's quill broke. The AI was unreachable or blocked by the network.</i>",
            timestamp: Date.now()
        };
        
        await saveJournalPage(newPageId, newPage);
        
        setIsLoading(false);
        return summary;
    };
    // END CHANGE

    useEffect(() => { if (!editingId) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatLog, isLoading, editingId]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (!inputText.trim()) return;

        // START CHANGE: Route AI modes to the new Brain logic
        if (sendMode === 'ai-public' || sendMode === 'ai-private') {
            handleSmartSend(sendMode);
            return;
        }
        // END CHANGE

        if (sendMode === 'chat-private' && !targetUser) return alert("Select a player.");
        onSendMessage(inputText, sendMode, targetUser, aiContextMode);
        setInputText('');
    };

    const submitEdit = (id) => {
        onEditMessage(id, editContent);
        setEditingId(null);
    };

    const visibleMessages = useMemo(() => {
        const msgs = chatLog.filter(msg => {
            if (msg.type === 'chat-public' || msg.type === 'ai-public') return true;
            if (msg.role === 'system') return true;
            if (msg.senderId === user?.uid || msg.targetId === user?.uid) return true;
            if (msg.type === 'ai-private' && msg.senderId === user?.uid) return true;
            if (role === 'dm') return true; 
            if (msg.type === 'roll-public') return true;
            if (msg.type === 'roll-private' && (role === 'dm' || msg.senderId === user?.uid)) return true;
            return false;
        });
        if (ghostMessage) {
            msgs.push(ghostMessage);
        }
        return msgs;
    }, [chatLog, user?.uid, role, ghostMessage]);

    const getMessageStyle = (msg) => {
        if (msg.role === 'ai') return "border-l-4 border-amber-500 bg-amber-900/10"; 
        if (msg.type === 'chat-private') return "border-l-4 border-purple-500 bg-purple-900/10"; 
        if (msg.type === 'ai-private') return "border-l-4 border-cyan-500 bg-cyan-900/10";
        if (msg.role === 'system') return "opacity-75 text-center text-sm italic bg-slate-800/50 py-1";
        return "bg-transparent"; 
    };

    const formatTime = (ts) => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    return (
        <div className="flex h-full relative flex-col bg-slate-900">
            {role === 'dm' && !compact && (
                <div className="absolute top-2 right-4 z-20 flex gap-2">
                    <button onClick={clearChat} className="bg-red-900/50 border border-red-700 text-red-200 px-3 py-1 rounded-full text-xs shadow-lg flex items-center gap-1 hover:bg-red-900 hover:text-white transition-colors opacity-50 hover:opacity-100">
                        <Icon name="trash-2" size={14}/> Clear
                    </button>
                    
                    <div className="relative">
                        <button onClick={() => setShowRecapMenu(!showRecapMenu)} className="bg-slate-800 border border-slate-600 text-white px-3 py-1 rounded-full text-xs shadow-lg flex items-center gap-2 hover:bg-amber-700 hover:border-amber-500 transition-colors">
                            <Icon name="scroll-text" size={14}/> Recap <Icon name="chevron-down" size={12}/>
                        </button>
                        {showRecapMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden z-30">
                                <button onClick={() => { handleSmartRecap('full'); setShowRecapMenu(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 text-slate-200 flex items-center gap-2">
                                    <Icon name="book-open" size={14}/> Full Story (All)
                                </button>
                                <button onClick={() => { handleSmartRecap('recent'); setShowRecapMenu(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 text-slate-200 flex items-center gap-2">
                                    <Icon name="clock" size={14}/> Last Session
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-1 pb-4">
                    {visibleMessages.length === 0 && <div className="text-center text-slate-600 mt-10">No messages yet.</div>}
                    
                    {visibleMessages.map((msg, i) => {
                        const isSystem = msg.role === 'system';
                        const showHeader = i === 0 || visibleMessages[i-1].senderId !== msg.senderId || (msg.timestamp - visibleMessages[i-1].timestamp > 60000);
                        
                        // START CHANGE: Define charId and canEdit before the return block
                        const charId = data.assignments?.[msg.senderId];
                        const canEdit = role === 'dm' || msg.senderId === user?.uid || (msg.role === 'ai' && msg.replyTo === user?.uid);
                        // END CHANGE
                        
                        const assignedCharacter = players?.find(p => String(p.id) === String(charId));
                        const resolvedSenderName = (() => {
                            if (msg.role === 'ai') return 'Dungeon Master (AI)';
                            if (data.dmIds?.includes(msg.senderId) || msg.senderName === 'Dungeon Master') return 'Dungeon Master';
                            return assignedCharacter ? assignedCharacter.name : msg.senderName;
                        })();

                        if (isSystem) {
                            return (
                                <div key={i} className="flex justify-center my-2 group">
                                    <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full flex items-center gap-2 pr-2">
                                        <span dangerouslySetInnerHTML={{__html: msg.content.replace(/\*\*/g, '')}} />
                                        {role === 'dm' && (
                                            <button onClick={() => onDeleteMessage(msg.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity -mr-1" title="Delete">
                                                <Icon name="x" size={12}/>
                                            </button>
                                        )}
                                    </span>
                                </div>
                            );
                        }

                        return (
                            <div key={i} className={`group flex gap-3 px-2 py-1 rounded hover:bg-slate-800/50 ${getMessageStyle(msg)} ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
                                <div className="w-10 flex-shrink-0">
                                    {/* START CHANGE: Dynamic Avatar (DM Icon vs Character Image) */}
                                    {showHeader && (() => {
                                        // 1. Is it AI?
                                        if (msg.role === 'ai') return (
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-amber-600 to-purple-700 shadow-amber-500/20">
                                                <Icon name="sparkles" size={20}/>
                                            </div>
                                        );

                                        // 2. Is it the DM? (Check ID or Name)
                                        const isDm = data.dmIds?.includes(msg.senderId) || msg.senderName === 'Dungeon Master';
                                        if (isDm) return (
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg bg-slate-700 border border-amber-500/30">
                                                <Icon name="crown" size={20} className="text-amber-500"/>
                                            </div>
                                        );

                                        // 3. Is it a Player Character?
                                        if (assignedCharacter?.image) return (
                                            <SafeAvatar src={assignedCharacter.image} alt={resolvedSenderName} />
                                        );

                                        // 4. Fallback Initials
                                        return (
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg bg-slate-700">
                                                {(resolvedSenderName?.[0] || '?').toUpperCase()}
                                            </div>
                                        );
                                    })()}
                                    {/* END CHANGE */}
                                </div>
                                <div className="flex-1 min-w-0 relative">
                                    {showHeader && (
                                        <div className="flex items-center gap-2">
                                            {/* START CHANGE: Dynamic Name Resolution with String Fix */}
                                            <span className={`font-bold text-sm ${msg.role === 'ai' ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-purple-400' : 'text-slate-200'}`}>
                                                {resolvedSenderName}
                                            </span>
                                            {/* END CHANGE */}
                                            {msg.type === 'chat-private' && <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1 rounded border border-purple-500/30 flex items-center gap-1"><Icon name="lock" size={8}/> WHISPER</span>}
                                            {msg.type === 'ai-private' && <span className="text-[10px] text-cyan-400 bg-cyan-900/30 px-1 rounded border border-cyan-500/30 flex items-center gap-1"><Icon name="eye-off" size={8}/> SECRET</span>}
                                            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{formatTime(msg.timestamp)}</span>
                                        </div>
                                    )}
                                    {/* END CHANGE */}
                                    
                                    {editingId === msg.id ? (
                                        <div className="mt-1">
                                            <textarea className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-slate-200" value={editContent} onChange={e => setEditContent(e.target.value)}/>
                                            <div className="flex gap-2 mt-1">
                                                <button onClick={() => submitEdit(msg.id)} className="text-xs bg-green-700 px-2 py-1 rounded text-white">Save</button>
                                                <button onClick={() => setEditingId(null)} className="text-xs bg-slate-700 px-2 py-1 rounded text-white">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-300 text-[15px] leading-relaxed break-words whitespace-pre-wrap group-hover:text-white transition-colors relative">
                                            {msg.content && msg.content.startsWith('chunked:') ? (
                                                <div className="-my-2">
                                                    <ResolvedImage id={msg.content} />
                                                </div>
                                            ) : (
                                                /* START CHANGE: Interactive Dice Rolls */
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
                                                            const isCrit = rollData.formula.includes('d20') && finalNatural === 20;
                                                            const isFumble = rollData.formula.includes('d20') && finalNatural === 1;
                                                            
                                                            const displayCharName = (!rollData.characterName || rollData.characterName === msg.senderName || rollData.characterName === 'Dungeon Master') ? resolvedSenderName : rollData.characterName;
                                                            const naturalClass = isCrit ? "text-green-400 font-bold" : isFumble ? "text-red-400 font-bold" : "text-slate-300";
                                                            
                                                            const hasDetails = rollData.weaponName || rollData.damageType || rollData.actionType || rollData.alias;
                                                            const isDamageRoll = rollData.actionType === 'damage' || rollData.actionType === 'spell' || !!rollData.damageType || (rollData.alias && rollData.alias.toLowerCase().includes('damage'));
                                                            
                                                            const renderApplyDamage = () => {
                                                                if (role === 'dm' && isDamageRoll) {
                                                                    return (
                                                                        <button 
                                                                            onClick={() => handleApplyDamage(finalTotal)}
                                                                            className="mt-2 inline-flex items-center gap-1 bg-red-900/50 hover:bg-red-700 border border-red-500/30 text-[10px] text-red-200 px-2 py-1 rounded cursor-pointer transition-colors whitespace-nowrap"
                                                                            title={`Apply ${finalTotal} damage to target`}
                                                                        >
                                                                            <Icon name="sword" size={10}/> -{finalTotal} HP
                                                                        </button>
                                                                    );
                                                                }
                                                                return null;
                                                            };

                                                            if (rollData.actionType === 'use' || (rollData.formula === '1d0' && rollData.total === 0 && rollData.alias)) {
                                                                return (
                                                                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 w-full max-w-sm shadow-xl flex flex-col items-start text-left relative overflow-hidden">
                                                                        {msg.type === 'roll-private' && (
                                                                            <button 
                                                                                onClick={() => role === 'dm' && onEditMessage(msg.id, msg.content, 'roll-public')}
                                                                                className={`absolute top-2 right-2 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                                title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                            >
                                                                                <Icon name="eye-off" size={14} />
                                                                            </button>
                                                                        )}
                                                                    <div className="font-bold text-amber-500 text-sm">{displayCharName}</div>
                                                                        <div className="font-bold text-indigo-300 text-base">{rollData.alias || rollData.weaponName || 'Used Feature'}</div>
                                                                        {rollData.description && <div className="text-slate-400 text-xs mt-1 whitespace-pre-wrap">{rollData.description}</div>}
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
                                                                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 w-full max-w-sm shadow-xl flex flex-col items-start text-left relative overflow-hidden">
                                                                        {msg.type === 'roll-private' && (
                                                                            <button 
                                                                                onClick={() => role === 'dm' && onEditMessage(msg.id, msg.content, 'roll-public')}
                                                                                className={`absolute top-2 right-2 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                                title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                            >
                                                                                <Icon name="eye-off" size={14} />
                                                                            </button>
                                                                        )}
                                                                    <div className="font-bold text-amber-500 mb-2 text-sm">{rollData.alias || `DC ${actualSaveDc} Save Results:`}</div>
                                                                        <div className={`w-full flex flex-col bg-slate-900/50 p-2 rounded border ${isSuccess ? 'border-green-900/30' : 'border-red-900/30'}`}>
                                                                        <span className="font-bold text-slate-200 text-xs">{displayCharName}</span>
                                                                            <div className="flex items-center gap-2 text-[11px] mt-1">
                                                                                <span className="text-slate-500">[<span className={naturalClass}>{rollsNode}</span>] {actualMod >= 0 ? '+'+actualMod : actualMod} =</span>
                                                                                <span className={`font-bold ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>{finalTotal} {isSuccess ? '✅ (Success)' : '❌ (Fail)'}</span>
                                                                            </div>
                                                                        </div>
                                                                        {renderApplyDamage()}
                                                                    </div>
                                                                );
                                                            }

                                                            if (hasDetails) {
                                                                return (
                                                                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 w-full max-w-sm shadow-xl flex flex-col items-start text-left relative overflow-hidden">
                                                                        {msg.type === 'roll-private' && (
                                                                            <button 
                                                                                onClick={() => role === 'dm' && onEditMessage(msg.id, msg.content, 'roll-public')}
                                                                                className={`absolute top-2 right-2 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                                title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                            >
                                                                                <Icon name="eye-off" size={14} />
                                                                            </button>
                                                                        )}
                                                                    <div className="font-bold text-amber-500 text-sm">{displayCharName}</div>
                                                                        {rollData.weaponName && <div className="font-bold text-slate-200 text-base">{rollData.weaponName}</div>}
                                                                        {rollData.damageType && <div className="text-slate-400 text-xs mb-1">{rollData.damageType}</div>}
                                                                        {rollData.alias && <div className="text-slate-300 text-xs mb-1">{rollData.alias}</div>}
                                                                        <div className="mt-2 pt-2 border-t border-slate-700/50 w-full flex flex-row items-center flex-wrap gap-2">
                                                                            <span className="text-slate-400 text-sm break-all">{rollData.formula}{rollData.modifier !== 0 ? (rollData.modifier > 0 ? `+${rollData.modifier}` : rollData.modifier) : ''}</span>
                                                                            <span className="text-slate-400 text-sm">➜</span>
                                                                            <div className="flex items-baseline gap-1 flex-wrap">
                                                                                <span className={`${naturalClass} text-lg font-bold break-words`}>[{rollsNode}]</span>
                                                                                {actualMod !== 0 && <span className="text-slate-400 text-sm">{actualMod > 0 ? '+' : ''}{actualMod}</span>}
                                                                            </div>
                                                                            <span className="text-slate-500 text-sm font-bold">=</span>
                                                                            <span className="text-xl font-bold text-amber-500 drop-shadow-md">{finalTotal}</span>
                                                                        </div>
                                                                        {renderApplyDamage()}
                                                                        <ChatSaveCard rollData={rollData} previewTargets={previewTargets} role={role} handleRollSave={handleRollSave} />
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <div className="bg-slate-800/80 border border-slate-700/50 rounded-lg p-2 w-full max-w-sm flex flex-col items-start relative overflow-hidden">
                                                                    {msg.type === 'roll-private' && (
                                                                        <button 
                                                                            onClick={() => role === 'dm' && onEditMessage(msg.id, msg.content, 'roll-public')}
                                                                            className={`absolute top-2 right-2 ${role === 'dm' ? 'text-amber-500 hover:text-amber-400 cursor-pointer' : 'text-slate-500 cursor-default'}`} 
                                                                            title={role === 'dm' ? "Click to reveal roll to players" : "Private DM Roll"}
                                                                        >
                                                                            <Icon name="eye-off" size={12} />
                                                                        </button>
                                                                    )}
                                                                    <div className="text-slate-400 text-xs break-all">{displayCharName} rolled {rollData.formula}</div>
                                                                    <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                                                                        <span className={`${naturalClass} text-lg font-bold break-words`}>[{rollsNode}]</span>
                                                                        {actualMod !== 0 && <span className="text-slate-400 text-sm">{actualMod > 0 ? '+' : ''}{actualMod}</span>}
                                                                        <span className="text-slate-500 font-bold">=</span>
                                                                        <span className="text-xl font-bold text-amber-500">{finalTotal}</span>
                                                                    </div>
                                                                    {renderApplyDamage()}
                                                                    <ChatSaveCard rollData={rollData} previewTargets={previewTargets} role={role} handleRollSave={handleRollSave} />
                                                                </div>
                                                            );

                                                        } catch (e) {
                                                            // Fallback for old HTML messages
                                                            const html = msg.content;
                                                            const damageMatch = msg.content && (msg.content.match(/Rolled\s+(\d+)/i) || msg.content.match(/data-total="(\d+)"/));
                                                            const isHtmlDamage = msg.content && (msg.content.toLowerCase().includes('damage') || msg.content.toLowerCase().includes('dmg'));
                                                            if (role === 'dm' && damageMatch && isHtmlDamage) {
                                                                const dmg = parseInt(damageMatch[1]);
                                                                return (
                                                                    <div>
                                                                        <span dangerouslySetInnerHTML={{__html: html}} />
                                                                        <button 
                                                                            onClick={() => handleApplyDamage(dmg)}
                                                                            className="ml-2 inline-flex items-center gap-1 bg-red-900/50 hover:bg-red-700 border border-red-500/30 text-[10px] text-red-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                                                            title={`Apply ${dmg} damage to target`}
                                                                        >
                                                                            <Icon name="sword" size={10}/> -{dmg} HP
                                                                        </button>
                                                                    </div>
                                                                );
                                                            }
                                                            return <span dangerouslySetInnerHTML={{__html: html}} />;
                                                        }
                                                    }

                                                    // Regular chat message handling
                                                    const html = formatMessage(msg.content);
                                                    return <span dangerouslySetInnerHTML={{__html: html}} />;
                                                })()
                                            )}
                                            {/* END CHANGE */}
                                        </div>
                                    )}

                                    <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 flex gap-1 bg-slate-900/90 rounded px-1 transition-opacity border border-slate-700 shadow-xl z-10">
                                        <button onClick={() => saveMessageToJournal(msg.content)} className="text-slate-400 hover:text-green-400 p-1" title="Save to Journal"><Icon name="book-plus" size={12}/></button>
                                        {canEdit && !editingId && (
                                            <>
                                                <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="text-slate-400 hover:text-amber-400 p-1" title="Edit"><Icon name="pencil" size={12}/></button>
                                                <button onClick={() => onDeleteMessage(msg.id)} className="text-slate-400 hover:text-red-400 p-1" title="Delete"><Icon name="trash-2" size={12}/></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isLoading && <div className="flex gap-3 px-2 mt-2 animate-pulse opacity-50"><div className="w-10 h-10 rounded-full bg-slate-700"></div><div className="flex-1 space-y-2 py-1"><div className="h-4 bg-slate-700 rounded w-1/4"></div><div className="h-4 bg-slate-700 rounded w-3/4"></div></div></div>}
                     <div ref={chatEndRef}></div>
                </div>
                
                {/* FIX: Removed 'mb-20 md:mb-0' so it sits flush against the bottom padding defined in App.jsx */}
                <div className="p-2 bg-slate-900 border-t border-slate-800 flex flex-col gap-2 shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {/* FIX: sendMode is now flex-1 to share space, instead of w-full */}
                        <select value={sendMode} onChange={(e) => setSendMode(e.target.value)} className="flex-1 min-w-[100px] bg-slate-800 text-xs font-bold text-slate-300 border border-slate-600 rounded px-2 py-1.5 outline-none focus:border-amber-500 md:w-36 md:flex-none">
                            <option value="chat-public">📢 Chat</option>
                            <option value="ai-public">🤖 AI (Public)</option>
                            <option value="ai-private">🧠 AI (Private)</option>
                            <option value="chat-private">🕵️ Whisper</option>
                        </select>

                        {sendMode === 'chat-private' && (
                            <select value={targetUser} onChange={(e) => setTargetUser(e.target.value)} className="flex-1 min-w-0 md:w-32 bg-purple-900/20 text-xs text-purple-200 border border-purple-500/50 rounded px-2 py-1.5 outline-none">
                                <option value="">To whom?</option>
                                {Object.entries(data.activeUsers || {}).map(([uid, userName]) => {
                                    if (uid === user.uid) return null;
                                    if (data.dmIds?.includes(uid)) return <option key={uid} value={uid}>Dungeon Master</option>;
                                    const charId = data.assignments?.[uid];
                                    const char = data.players?.find(p => p.id == charId);
                                    const displayName = char ? `${char.name} (${char.class})` : (userName?.includes('@') ? userName.split('@')[0] : userName);
                                    return <option key={uid} value={uid}>{displayName}</option>;
                                })}
                            </select>
                        )}

                        {(sendMode === 'ai-public' || sendMode === 'ai-private') && (
                            <button 
                                onClick={() => setAiContextMode(prev => prev === 'fast' ? 'deep' : 'fast')}
                                className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-bold transition-colors whitespace-nowrap ${aiContextMode === 'fast' ? 'bg-blue-900/30 border-blue-700 text-blue-300' : 'bg-amber-900/30 border-amber-700 text-amber-300'}`}
                                title={aiContextMode === 'fast' ? "Fast: Reads last 4k chars" : "Deep: Reads last 30k chars (Slower)"}
                            >
                                <Icon name={aiContextMode === 'fast' ? 'zap' : 'book-open'} size={12}/>
                                {aiContextMode === 'fast' ? 'Fast' : 'Deep'}
                            </button>
                        )}

                        <button onClick={() => setShowTools(!showTools)} className={`rounded p-1.5 transition-colors shrink-0 ${showTools ? 'text-amber-500 bg-amber-900/20' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="dices" size={20}/></button>
                    </div>
                    
                    {/* START CHANGE: Dynamic Input Styling based on Mode */}
                    <div className={`relative flex gap-2 items-end rounded-lg p-2 border transition-all ${
                        sendMode === 'chat-private' ? 'bg-purple-900/10 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 
                        sendMode.includes('ai') ? 'bg-amber-900/10 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 
                        'bg-slate-800 border-slate-700 focus-within:border-slate-500'
                    }`}>
                        <textarea 
                            value={inputText} 
                            onChange={e => setInputText(e.target.value)} 
                            onKeyDown={handleKeyDown} 
                            placeholder={
                                sendMode === 'chat-private' ? `Whispering to ${data.activeUsers?.[targetUser]?.includes('@') ? data.activeUsers[targetUser].split('@')[0] : (data.activeUsers?.[targetUser] || 'Player')}...` :
                                sendMode.includes('ai') ? "Ask the DungeonMind..." :
                                possessedNpcId ? `Speaking as ${data.npcs?.find(n=>n.id===possessedNpcId)?.name}...` : 
                                "Message..."
                            } 
                            className="flex-1 bg-transparent text-slate-200 resize-none h-10 max-h-32 focus:ring-0 outline-none custom-scroll text-sm leading-relaxed py-2 placeholder:text-slate-500/50" 
                            rows={1} 
                            style={{ height: inputText.length > 50 ? 'auto' : '40px' }} 
                        />
                        <button onClick={() => fileInputRef.current.click()} disabled={isUploading} className="p-2 rounded-md transition-all shrink-0 text-slate-400 hover:text-white hover:bg-slate-700" title="Upload Image">
                            {isUploading ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="image" size={18}/>}
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                        <button onClick={handleSend} disabled={!inputText.trim()} className={`p-2 rounded-md transition-all shrink-0 ${inputText.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}><Icon name="send" size={18}/></button>
                    </div>
                    {/* END CHANGE */}
                </div>
            </div>
        </div>
    );
};
export default SessionView;
