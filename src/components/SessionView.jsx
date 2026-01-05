import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import DiceTray from './DiceTray';

const SessionView = (props) => {
    const { 
        data, chatLog, inputText, setInputText, 
        onSendMessage, isLoading, role, user,
        showTools, setShowTools, diceLog, handleDiceRoll,
        possessedNpcId 
    } = props;

    const [sendMode, setSendMode] = useState('chat-public'); // chat-public, chat-private, ai-public, ai-private
    const [targetUser, setTargetUser] = useState(''); // for chat-private
    const chatEndRef = useRef(null);

    // Auto-scroll on new messages
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatLog, isLoading]);

    // Handle Enter Key
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (!inputText.trim()) return;
        if (sendMode === 'chat-private' && !targetUser) return alert("Select a player to whisper to.");
        onSendMessage(inputText, sendMode, targetUser);
        setInputText('');
    };

    // Filter messages for the current user
    const visibleMessages = chatLog.filter(msg => {
        // Public messages (Chat or AI)
        if (msg.type === 'chat-public' || msg.type === 'ai-public') return true;
        // System messages
        if (msg.role === 'system') return true;
        // Private messages (Sender OR Receiver)
        if (msg.senderId === user?.uid) return true;
        if (msg.targetId === user?.uid) return true; // Direct whisper
        // AI Private (Only sender sees it)
        if (msg.type === 'ai-private' && msg.senderId === user?.uid) return true;
        return false;
    });

    // Formatting Helpers
    const getMessageStyle = (msg) => {
        if (msg.role === 'ai') return "border-l-4 border-amber-500 bg-amber-900/10"; // AI Gold
        if (msg.type === 'chat-private') return "border-l-4 border-purple-500 bg-purple-900/10"; // Whisper Purple
        if (msg.type === 'ai-private') return "border-l-4 border-cyan-500 bg-cyan-900/10"; // AI Private Cyan
        if (msg.role === 'system') return "opacity-75 text-center text-sm italic bg-slate-800/50 py-1";
        return "bg-transparent"; // Standard
    };

    const formatTime = (ts) => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    return (
        <div className="flex h-full relative flex-col bg-slate-900">
            {/* --- MESSAGE FEED (Discord Style) --- */}
            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-1 pb-24 md:pb-4">
                    {visibleMessages.length === 0 && <div className="text-center text-slate-600 mt-10">No messages yet. Be the first to speak!</div>}
                    
                    {visibleMessages.map((msg, i) => {
                        const isSystem = msg.role === 'system';
                        const showHeader = i === 0 || visibleMessages[i-1].senderId !== msg.senderId || (msg.timestamp - visibleMessages[i-1].timestamp > 60000);

                        if (isSystem) {
                            return (
                                <div key={i} className="flex justify-center my-2">
                                    <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">{msg.content.replace(/\*\*/g, '')}</span>
                                </div>
                            );
                        }

                        return (
                            <div key={i} className={`group flex gap-3 px-2 py-1 rounded hover:bg-slate-800/50 ${getMessageStyle(msg)} ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
                                {/* Avatar (Only show on new block) */}
                                <div className="w-10 flex-shrink-0">
                                    {showHeader && (
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg ${msg.role === 'ai' ? 'bg-amber-600' : 'bg-slate-700'}`}>
                                            {msg.role === 'ai' ? <Icon name="brain" size={20}/> : (msg.senderName?.[0] || '?').toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    {/* Header (Name + Time) */}
                                    {showHeader && (
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold text-sm hover:underline cursor-pointer ${msg.role === 'ai' ? 'text-amber-400' : 'text-slate-200'}`}>
                                                {msg.senderName || 'Unknown'}
                                            </span>
                                            {msg.type === 'chat-private' && <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1 rounded border border-purple-500/30">WHISPER</span>}
                                            {msg.type === 'ai-private' && <span className="text-[10px] text-cyan-400 bg-cyan-900/30 px-1 rounded border border-cyan-500/30">AI PRIVATE</span>}
                                            <span className="text-[10px] text-slate-500">{formatTime(msg.timestamp)}</span>
                                        </div>
                                    )}
                                    
                                    {/* Content */}
                                    <div className="text-slate-300 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                                        <span dangerouslySetInnerHTML={{__html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isLoading && (
                        <div className="flex gap-3 px-2 mt-2 animate-pulse opacity-50">
                            <div className="w-10 h-10 rounded-full bg-slate-700"></div>
                            <div className="flex-1 space-y-2 py-1">
                                <div className="h-4 bg-slate-700 rounded w-1/4"></div>
                                <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef}></div>
                </div>
                
                {/* --- INPUT AREA --- */}
                <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2 shrink-0 z-10">
                    <div className="flex items-center gap-2">
                        {/* 1. Mode Selector */}
                        <div className="relative flex-1 md:flex-none">
                            <select 
                                value={sendMode} 
                                onChange={(e) => setSendMode(e.target.value)}
                                className="w-full md:w-40 bg-slate-800 text-xs font-bold text-slate-300 border border-slate-600 rounded px-2 py-1.5 outline-none focus:border-amber-500"
                            >
                                <option value="chat-public">📢 Public Chat</option>
                                <option value="ai-public">🤖 AI (Public)</option>
                                <option value="ai-private">🧠 AI (Private)</option>
                                <option value="chat-private">🕵️ Whisper</option>
                            </select>
                        </div>

                        {/* 2. Target Selector (Only for Whisper) */}
                        {sendMode === 'chat-private' && (
                            <select 
                                value={targetUser} 
                                onChange={(e) => setTargetUser(e.target.value)}
                                className="flex-1 md:flex-none md:w-32 bg-purple-900/20 text-xs text-purple-200 border border-purple-500/50 rounded px-2 py-1.5 outline-none"
                            >
                                <option value="">To whom?</option>
                                {Object.entries(data.activeUsers || {}).map(([uid, email]) => (
                                    uid !== user.uid && <option key={uid} value={uid}>{email.split('@')[0]}</option>
                                ))}
                            </select>
                        )}

                        {/* Tools Toggle */}
                        <button onClick={() => setShowTools(!showTools)} className={`ml-auto rounded p-1.5 transition-colors ${showTools ? 'text-amber-500 bg-amber-900/20' : 'text-slate-500 hover:text-slate-300'}`}>
                            <Icon name="dices" size={20}/>
                        </button>
                    </div>

                    <div className="relative flex gap-2 items-end bg-slate-800 rounded-lg p-2 border border-slate-700 focus-within:border-slate-500 transition-colors">
                        {/* Text Area */}
                        <textarea 
                            value={inputText} 
                            onChange={e => setInputText(e.target.value)} 
                            onKeyDown={handleKeyDown} 
                            placeholder={
                                sendMode === 'ai-public' ? "Ask the Dungeon Master (Public)..." :
                                sendMode === 'ai-private' ? "Ask silently (Private)..." :
                                sendMode === 'chat-private' ? "Whisper something..." :
                                possessedNpcId ? `Speaking as ${data.npcs.find(n=>n.id===possessedNpcId)?.name}...` :
                                "Message the party..."
                            } 
                            className="flex-1 bg-transparent text-slate-200 resize-none h-10 max-h-32 focus:ring-0 outline-none custom-scroll text-sm leading-relaxed py-2" 
                            rows={1}
                            style={{ height: inputText.length > 50 ? 'auto' : '40px' }} // Auto-grow hack
                        />
                        
                        {/* Send Button */}
                        <button 
                            onClick={handleSend} 
                            disabled={!inputText.trim()}
                            className={`p-2 rounded-md transition-all shrink-0 ${inputText.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                        >
                            <Icon name="send" size={18}/>
                        </button>
                    </div>
                    
                    {/* Helper Text */}
                    <div className="text-[10px] text-slate-600 flex justify-between px-1">
                        <span>{possessedNpcId && <span className="text-amber-500 font-bold">POSSESSING NPC</span>}</span>
                        <span>{sendMode === 'chat-public' ? 'Everyone sees this' : sendMode.includes('private') ? 'Only you/target see this' : 'AI will respond to everyone'}</span>
                    </div>
                </div>
            </div>

            {/* --- SLIDE-OVER DICE TRAY --- */}
            {showTools && (
                <div className="absolute z-40 right-0 top-0 bottom-0 w-64 bg-slate-900/95 backdrop-blur border-l border-slate-700 p-4 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <span className="fantasy-font text-amber-500 text-lg">Dice Roller</span>
                        <button onClick={() => setShowTools(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                    </div>
                    <DiceTray diceLog={diceLog} handleDiceRoll={handleDiceRoll} />
                </div>
            )}
        </div>
    );
};

export default SessionView;
