import React, { useEffect, useRef } from 'react';
import Icon from './Icon';
import DiceTray from './DiceTray';

const SessionView = (props) => {
    const { 
        data, chatHistory, inputText, setInputText, 
        generateResponse, isLoading, role, activeChar, 
        showTools, setShowTools, diceLog, handleDiceRoll,
        generateRecap, possessedNpcId 
    } = props;

    const chatEndRef = useRef(null);
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, isLoading]);

    const handleAction = (mode) => {
        if (!inputText.trim() && mode !== 'chaos') return; 
        generateResponse(null, mode);
    };

    return (
        <div className="flex h-full relative flex-col">
            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6 pb-24 md:pb-4">
                    <div className="text-center py-4 opacity-50 text-sm">
                        {role === 'dm' ? <span className="text-amber-500 font-bold">👑 DM Mode Active</span> : <span className="text-blue-400 font-bold">🛡️ Player Mode Active</span>}
                    </div>

                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`p-4 rounded-lg max-w-[95%] md:max-w-[85%] ${
                            msg.role === 'user' ? 'bg-slate-800 ml-auto text-right' : 
                            msg.role === 'system' ? 'bg-slate-800/50 mx-auto text-center text-xs text-slate-500' : 
                            'bg-indigo-900/20 border border-indigo-500/30 mr-auto'
                        }`}>
                            <div className="break-words" dangerouslySetInnerHTML={{__html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}} />
                        </div>
                    ))}
                    {isLoading && <div className="text-center text-xs text-slate-500 animate-pulse">Thinking...</div>}
                    <div ref={chatEndRef}></div>
                </div>
                
                <div className="p-2 md:p-4 bg-slate-900 border-t border-slate-800 flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2 overflow-x-auto custom-scroll pb-1 w-full no-scrollbar">
                        {role === 'dm' && (
                            <button onClick={generateRecap} className="bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white border border-amber-500 rounded-full px-4 py-2 text-xs flex items-center gap-2 shrink-0 shadow-lg">
                                <Icon name="scroll-text" size={14}/> Generate Recap
                            </button>
                        )}
                        <button onClick={() => setShowTools(!showTools)} className={`ml-auto rounded-full px-3 py-2 text-xs flex items-center gap-1 transition-colors ${showTools ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Icon name="dices" size={14}/> Dice</button>
                    </div>

                    <div className="relative flex gap-2">
                        <textarea value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAction('standard'); }}} placeholder={possessedNpcId ? "Speak as NPC..." : role === 'dm' ? "What happens next?" : "What does your character do?"} className={`w-full bg-slate-800 text-white rounded-lg p-3 pr-12 resize-none h-14 focus:ring-1 outline-none custom-scroll text-base ${role==='dm' ? 'focus:ring-amber-500' : 'focus:ring-blue-500'}`} />
                        <button onClick={() => handleAction('standard')} className={`px-4 rounded-lg text-white h-14 flex items-center justify-center shrink-0 w-14 ${role==='dm' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}`}><Icon name="send" size={24}/></button>
                    </div>
                </div>
            </div>
            {showTools && (<div className="absolute z-40 right-0 top-0 bottom-0 w-64 bg-slate-900/95 backdrop-blur border-l border-slate-700 p-4 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col"><div className="flex justify-between items-center mb-4"><span className="fantasy-font text-amber-500 text-lg">Dice Roller</span><button onClick={() => setShowTools(false)} className="text-slate-400 hover:text-white"><Icon name="x" size={24}/></button></div><DiceTray diceLog={diceLog} handleDiceRoll={handleDiceRoll} /></div>)}
        </div>
    );
};

export default SessionView;
