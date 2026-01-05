import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import DiceTray from './DiceTray';

const SessionView = (props) => {
    const { 
        data, chatLog, inputText, setInputText, 
        onSendMessage, onEditMessage, onDeleteMessage, 
        isLoading, role, user, generateRecap, saveMessageToJournal, clearChat,
        showTools, setShowTools, diceLog, handleDiceRoll,
        possessedNpcId 
    } = props;

    const [sendMode, setSendMode] = useState('chat-public'); 
    const [targetUser, setTargetUser] = useState(''); 
    const [aiContextMode, setAiContextMode] = useState('fast'); 
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [showRecapMenu, setShowRecapMenu] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => { if (!editingId) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatLog, isLoading, editingId]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (!inputText.trim()) return;
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
        return false;
    });

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
            {role === 'dm' && (
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
                                <button onClick={() => { generateRecap('full'); setShowRecapMenu(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 text-slate-200 flex items-center gap-2">
                                    <Icon name="book-open" size={14}/> Full Story (All)
                                </button>
                                <button onClick={() => { generateRecap('recent'); setShowRecapMenu(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 text-slate-200 flex items-center gap-2">
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
                        const canEdit = role === 'dm' || msg.senderId === user?.uid || (msg.role === 'ai' && msg.replyTo === user?.uid);

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
                                    {showHeader && <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg ${msg.role === 'ai' ? 'bg-amber-600' : 'bg-slate-700'}`}>{msg.role === 'ai' ? <Icon name="brain" size={20}/> : (msg.senderName?.[0] || '?').toUpperCase()}</div>}
                                </div>
                                <div className="flex-1 min-w-0 relative">
                                    {showHeader && (
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold text-sm ${msg.role === 'ai' ? 'text-amber-400' : 'text-slate-200'}`}>{msg.senderName}</span>
                                            {msg.type === 'chat-private' && <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1 rounded border border-purple-500/30">WHISPER</span>}
                                            {msg.type === 'ai-private' && <span className="text-[10px] text-cyan-400 bg-cyan-900/30 px-1 rounded border border-cyan-500/30">AI PRIVATE</span>}
                                            <span className="text-[10px] text-slate-500">{formatTime(msg.timestamp)}</span>
                                        </div>
                                    )}
                                    
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
                                            <span dangerouslySetInnerHTML={{__html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}} />
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
                
                {/* FIX: mb-20 on mobile lifts chat above MobileNav. md:mb-0 resets it for desktop. */}
                <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2 shrink-0 z-10 mb-20 md:mb-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center gap-2 flex-wrap">
                        <select value={sendMode} onChange={(e) => setSendMode(e.target.value)} className="w-full md:w-36 bg-slate-800 text-xs font-bold text-slate-300 border border-slate-600 rounded px-2 py-1.5 outline-none focus:border-amber-500">
                            <option value="chat-public">📢 Chat</option>
                            <option value="ai-public">🤖 AI (Public)</option>
                            <option value="ai-private">🧠 AI (Private)</option>
                            <option value="chat-private">🕵️ Whisper</option>
                        </select>

                        {sendMode === 'chat-private' && (
                            <select value={targetUser} onChange={(e) => setTargetUser(e.target.value)} className="flex-1 md:flex-none md:w-32 bg-purple-900/20 text-xs text-purple-200 border border-purple-500/50 rounded px-2 py-1.5 outline-none">
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
                                className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-bold transition-colors ${aiContextMode === 'fast' ? 'bg-blue-900/30 border-blue-700 text-blue-300' : 'bg-amber-900/30 border-amber-700 text-amber-300'}`}
                                title={aiContextMode === 'fast' ? "Fast: Reads last 4k chars" : "Deep: Reads last 30k chars (Slower)"}
                            >
                                <Icon name={aiContextMode === 'fast' ? 'zap' : 'book-open'} size={12}/>
                                {aiContextMode === 'fast' ? 'Fast' : 'Deep'}
                            </button>
                        )}

                        <button onClick={() => setShowTools(!showTools)} className={`ml-auto rounded p-1.5 transition-colors ${showTools ? 'text-amber-500 bg-amber-900/20' : 'text-slate-500 hover:text-slate-300'}`}><Icon name="dices" size={20}/></button>
                    </div>
                    
                    <div className="relative flex gap-2 items-end bg-slate-800 rounded-lg p-2 border border-slate-700 focus-within:border-slate-500 transition-colors">
                        <textarea value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} placeholder={possessedNpcId ? `Speaking as ${data.npcs?.find(n=>n.id===possessedNpcId)?.name}...` : "Message..."} className="flex-1 bg-transparent text-slate-200 resize-none h-10 max-h-32 focus:ring-0 outline-none custom-scroll text-sm leading-relaxed py-2" rows={1} style={{ height: inputText.length > 50 ? 'auto' : '40px' }} />
                        <button onClick={handleSend} disabled={!inputText.trim()} className={`p-2 rounded-md transition-all shrink-0 ${inputText.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}><Icon name="send" size={18}/></button>
                    </div>
                </div>
            </div>
            {showTools && (<div className="absolute z-40 right-0 top-0 bottom-0 w-64 bg-slate-900/95 backdrop-blur border-l border-slate-700 p-4 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col"><div className="flex justify-between items-center mb-4"><span className="fantasy-font text-amber-500 text-lg">Dice Roller</span><button onClick={() => setShowTools(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={24}/></button></div><DiceTray diceLog={diceLog} handleDiceRoll={handleDiceRoll} /></div>)}
        </div>
    );
};
export default SessionView;
