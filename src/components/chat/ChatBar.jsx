import React, { useState, useEffect, useRef } from 'react';
import Icon from '../Icon';

const ChatBar = ({ messages, user, onSend }) => {
    const [input, setInput] = useState("");
    const endRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim()) return;
        onSend(input);
        setInput("");
    };

    return (
        <div className="flex flex-col w-80 bg-slate-950 border-l border-slate-800 h-full shrink-0">
            {/* Header */}
            <div className="p-3 border-b border-slate-800 bg-slate-900 shadow-md">
                <h3 className="text-amber-500 font-bold fantasy-font text-lg flex items-center gap-2">
                    <Icon name="message-circle" size={18} /> Party Chat
                </h3>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                {messages.length === 0 && (
                    <div className="text-slate-600 text-center text-sm italic mt-10">
                        The scrolls are empty...
                    </div>
                )}
                
                {messages.map((msg) => {
                    const isMe = msg.role === 'user' || (user && msg.senderId === user.uid);
                    const isSystem = msg.role === 'system';
                    const isAi = msg.role === 'assistant';

                    if (isSystem) {
                        return (
                            <div key={msg.id} className="text-center text-xs text-slate-500 italic my-2 px-2">
                                <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                            </div>
                        );
                    }

                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`text-[10px] mb-1 font-bold ${isAi ? 'text-purple-400' : 'text-slate-400'}`}>
                                {isAi ? 'Dungeon Master AI' : msg.name || 'Unknown'}
                            </div>
                            <div className={`p-2 rounded-lg text-sm max-w-[90%] break-words whitespace-pre-wrap ${
                                isMe ? 'bg-indigo-600 text-white rounded-br-none' : 
                                isAi ? 'bg-purple-900/40 border border-purple-500/30 text-purple-100' :
                                'bg-slate-800 text-slate-200 rounded-bl-none'
                            }`}>
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="p-3 bg-slate-900 border-t border-slate-800">
                <div className="flex gap-2">
                    <input
                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                        placeholder="Type a message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <button 
                        type="submit" 
                        disabled={!input.trim()}
                        className="bg-amber-600 hover:bg-amber-500 text-white p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon name="send" size={16} />
                    </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 text-center">
                    Type <b>/ai [query]</b> to ask the DM.
                </div>
            </form>
        </div>
    );
};

export default ChatBar;