import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import DiceTray from './DiceTray';
import { retrieveContext, buildPrompt } from '../utils/loreEngine';
// START CHANGE: Import Character Store for Targeting
import { useCharacterStore } from '../stores/useCharacterStore';
// END CHANGE

// START CHANGE: Add clearChat to destructured props
const SessionView = ({ 
    data, chatLog, inputText, setInputText, 
    onSendMessage, onEditMessage, onDeleteMessage, clearChat,
    isLoading, role, user, generateRecap, saveMessageToJournal, 
    showTools, setShowTools, diceLog, handleDiceRoll,
    possessedNpcId, onSavePage, loreChunks, aiHelper,
    players, castList, myCharId, compact 
}) => {
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

    // START CHANGE: Apply Damage Handler
    const handleApplyDamage = (amount) => {
        const { targetId, updateHP } = useCharacterStore.getState();
        if (!targetId) return alert("No token targeted! Click a token on the map first.");

        // We need to update the token's HP in the GLOBAL cloud data, not just local state.
        // Since SessionView doesn't have direct access to 'updateToken', we must rely on 'data.campaign.activeMap'
        // But for safety, we will just alert if this deep integration is missing.
        // Ideally, SessionView should receive an 'onApplyDamage' prop from App.jsx or WorldView.
        
        // TEMPORARY LOCAL FIX: Use the store if the target is the LOADED character
        const storeChar = useCharacterStore.getState().character;
        if (storeChar && (storeChar.id === targetId || storeChar.tokenIds?.includes(targetId))) {
            updateHP('current', storeChar.hp.current - amount);
            alert(`Applied ${amount} damage to ${storeChar.name}!`);
        } else {
             // Fallback: This requires the parent to pass a handler, or we need to access Firebase directly.
             // For this "Lite" version, we will assume the DM has the sheet open or we add a prop later.
             alert(`Target ID: ${targetId} selected. (To fix HP, open their sheet!)`);
        }
    };
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
            const context = retrieveContext(query, loreChunks || [], data.journal_pages || {}, players, role, myCharId);
            
            const isPublic = (type === 'ai-public');
            const prompt = buildPrompt(query, context, recentChat, isPublic, castList);
            // END CHANGE

            // START CHANGE: Debug logging to verify the AI's "Brain"
            console.log("DEBUG AI PROMPT:", prompt);
            // END CHANGE

            if (aiHelper) {
                const answer = await aiHelper([{ role: 'user', content: prompt }]);
                setGhostMessage(null);
                onSendMessage(answer, type, null); 
            } else {
                setGhostMessage(null);
            }
        }
    };

    // START CHANGE: Logic for the Recap Button
    const handleSmartRecap = async (scope) => {
        if (!generateRecap) return;
        
        // 1. Show Feedback (Ghost Scribe)
        setGhostMessage({
            id: 'scribe-ghost', role: 'ai', senderName: 'DungeonMind Scribe',
            content: '<span class="animate-pulse">Reading logs and writing journal entry...</span>',
            timestamp: Date.now(), type: 'ai-private', isGhost: true
        });

        // 2. Generate (App.jsx will handle the redirect to JournalView on success)
        await generateRecap(scope);
        
        // 3. Cleanup (If we haven't unmounted yet)
        setGhostMessage(null);
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

    const visibleMessages = chatLog.filter(msg => {
        if (msg.type === 'chat-public' || msg.type === 'ai-public') return true;
        if (msg.role === 'system') return true;
        if (msg.senderId === user?.uid || msg.targetId === user?.uid) return true;
        if (msg.type === 'ai-private' && msg.senderId === user?.uid) return true;
        if (role === 'dm') return true; 
        if (msg.type === 'roll-public') return true;
        if (msg.type === 'roll-private' && (role === 'dm' || msg.senderId === user?.uid)) return true;
        return false;
    });

    // START CHANGE: Append Ghost Message if it exists
    if (ghostMessage) {
        visibleMessages.push(ghostMessage);
    }
    // END CHANGE

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
                                                            // Find the character assigned to this senderId
                                                            const character = players?.find(p => String(p.id) === String(charId));
                                        
                                        if (character?.image) return (
                                            <img src={character.image} alt={msg.senderName} className="w-10 h-10 rounded-full object-cover shadow-lg border border-slate-600"/>
                                        );

                                        // 4. Fallback Initials
                                        return (
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg bg-slate-700">
                                                {(msg.senderName?.[0] || '?').toUpperCase()}
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
                                                {(() => {
                                            if (msg.role === 'ai') return 'Dungeon Master (AI)';
                                            if (data.dmIds?.includes(msg.senderId) || msg.senderName === 'Dungeon Master') return 'Dungeon Master';
                                            
                                            const charId = data.assignments?.[msg.senderId];
                                            // START CHANGE: Ensure String comparison for Name resolution
                                            const character = players?.find(p => String(p.id) === String(charId));
                                            
                                            return character ? character.name : msg.senderName;
                                        })()}
                                            </span>
                                            {/* END CHANGE */}
                                            {msg.type === 'chat-private' && <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1 rounded border border-purple-500/30 flex items-center gap-1"><Icon name="lock" size={8}/> WHISPER</span>}
                                            {msg.type === 'ai-private' && <span className="text-[10px] text-cyan-400 bg-cyan-900/30 px-1 rounded border border-cyan-500/30 flex items-center gap-1"><Icon name="eye-off" size={8}/> SECRET</span>}
                                            <span className="text-[10px] text-slate-500">{formatTime(msg.timestamp)}</span>
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
                                            {/* START CHANGE: Interactive Dice Rolls */}
                                            {(() => {
                                                const html = formatMessage(msg.content);
                                                // Check for "Rolled 15" or similar patterns from DiceTray
                                                // Regex matches: "Rolled [Result] (Formula)" or just numbers
                                                // FIX: Added safety check (msg.content && ...)
                                                const damageMatch = msg.content && msg.content.match(/Rolled\s+(\d+)/i);
                                                
                                                if (role === 'dm' && damageMatch) {
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
                                            })()}
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
                                {Object.entries(data.activeUsers || {}).map(([uid, email]) => {
                                    if (uid === user.uid) return null;
                                    if (data.dmIds?.includes(uid)) return <option key={uid} value={uid}>Dungeon Master</option>;
                                    const charId = data.assignments?.[uid];
                                    const char = data.players?.find(p => p.id == charId);
                                    const displayName = char ? `${char.name} (${char.class})` : email.split('@')[0];
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
                                sendMode === 'chat-private' ? `Whispering to ${data.activeUsers?.[targetUser]?.split('@')[0] || 'Player'}...` :
                                sendMode.includes('ai') ? "Ask the DungeonMind..." :
                                possessedNpcId ? `Speaking as ${data.npcs?.find(n=>n.id===possessedNpcId)?.name}...` : 
                                "Message..."
                            } 
                            className="flex-1 bg-transparent text-slate-200 resize-none h-10 max-h-32 focus:ring-0 outline-none custom-scroll text-sm leading-relaxed py-2 placeholder:text-slate-500/50" 
                            rows={1} 
                            style={{ height: inputText.length > 50 ? 'auto' : '40px' }} 
                        />
                        <button onClick={handleSend} disabled={!inputText.trim()} className={`p-2 rounded-md transition-all shrink-0 ${inputText.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}><Icon name="send" size={18}/></button>
                    </div>
                    {/* END CHANGE */}
                </div>
            </div>
            {showTools && (<div className="absolute z-40 right-0 top-0 bottom-0 w-64 bg-slate-900/95 backdrop-blur border-l border-slate-700 p-4 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col"><div className="flex justify-between items-center mb-4"><span className="fantasy-font text-amber-500 text-lg">Dice Roller</span><button onClick={() => setShowTools(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={24}/></button></div><DiceTray diceLog={diceLog} handleDiceRoll={handleDiceRoll} /></div>)}
        </div>
    );
};
export default SessionView;
