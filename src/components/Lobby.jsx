import React, { useState, useEffect } from 'react';
import Icon from './Icon';

const Lobby = ({ fb, user, onJoin, onOffline }) => {
    const [joinCode, setJoinCode] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [recents, setRecents] = useState([]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('dm_recents');
            if (saved) setRecents(JSON.parse(saved));
        } catch(e) {}
    }, []);

    const handleLogin = async () => {
        if(!fb) return;
        setIsLoggingIn(true);
        try {
            await fb.signInWithPopup(fb.auth, fb.googleProvider);
        } catch (e) { alert("Login Error: " + e.message); setIsLoggingIn(false); }
    };

    const addToRecents = (code, role) => {
        const newItem = { code, role, date: Date.now() };
        const newRecents = [newItem, ...recents.filter(r => r.code !== code)].slice(0, 5);
        setRecents(newRecents);
        localStorage.setItem('dm_recents', JSON.stringify(newRecents));
    };

    const createNew = () => {
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        addToRecents(newCode, 'dm');
        onJoin(newCode, 'dm', user ? user.uid : 'anon');
    };

    const joinExisting = () => {
        if(!joinCode) return;
        addToRecents(joinCode.toUpperCase(), 'player');
        onJoin(joinCode.toUpperCase(), 'player', user ? user.uid : 'anon');
    };

    const deleteCampaign = async (e, item) => {
        e.stopPropagation();
        if (confirm("Remove from history? (This does not delete the cloud data)")) {
            const newRecents = recents.filter(r => r.code !== item.code);
            setRecents(newRecents);
            localStorage.setItem('dm_recents', JSON.stringify(newRecents));
        }
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=2544&auto=format&fit=crop')] bg-cover bg-center relative">
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>
            <div className="relative z-10 w-full max-w-md p-8 glass-panel md:rounded-2xl shadow-2xl border-none md:border border-slate-700 h-full md:h-auto flex flex-col justify-center bg-slate-900/50">
                <div className="text-center mb-6">
                    <h1 className="text-4xl fantasy-font text-amber-500 mb-2 text-shadow">DungeonMind</h1>
                    <p className="text-slate-400 text-sm">AI-Enhanced TTRPG Assistant</p>
                </div>

                {user ? (
                    <div className="bg-slate-800/80 p-4 rounded-lg mb-6 text-center border border-slate-700">
                        <div className="text-sm text-slate-400 mb-1">Logged in as</div>
                        <div className="font-bold text-green-400">{user.email}</div>
                        <button onClick={() => fb.signOut(fb.auth)} className="text-xs text-red-400 mt-2 hover:underline">Sign Out</button>
                    </div>
                ) : (
                    <button onClick={handleLogin} disabled={isLoggingIn} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-bold mb-6 flex justify-center items-center gap-2 transition-all shadow-lg">
                        {isLoggingIn ? "Connecting..." : <><Icon name="log-in" size={20}/> Login with Google</>}
                    </button>
                )}

                <div className="space-y-3">
                    <button onClick={createNew} className="w-full bg-amber-700 hover:bg-amber-600 text-white py-3 rounded-lg font-bold border border-amber-500/30 shadow-lg">Start New Campaign (DM)</button>
                    <div className="flex gap-2">
                        <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="ENTER CODE" className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 text-center font-mono tracking-widest text-lg outline-none focus:border-amber-500 text-white placeholder:text-slate-600"/>
                        <button onClick={joinExisting} disabled={!joinCode} className={`px-6 rounded-lg font-bold ${joinCode ? 'bg-slate-600 hover:bg-slate-500 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Join</button>
                    </div>
                </div>

                {recents.length > 0 && (
                    <div className="mt-6">
                        <div className="text-xs uppercase font-bold text-slate-500 mb-2 ml-1">Recent Adventures</div>
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll">
                            {recents.map((r, i) => (
                                <div key={i} onClick={() => onJoin(r.code, r.role, user ? user.uid : 'anon')} className="group flex items-center justify-between bg-slate-800/50 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/30 p-3 rounded-lg cursor-pointer transition-all">
                                    <div className="flex flex-col"><span className="font-mono font-bold text-amber-500 tracking-wider">{r.code}</span><span className="text-[10px] text-slate-400 uppercase">{r.role}</span></div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-500 mr-2">{new Date(r.date).toLocaleDateString()}</span>
                                        <button onClick={(e) => deleteCampaign(e, r)} className="text-slate-500 hover:text-red-400 p-2 rounded hover:bg-slate-900"><Icon name="x" size={16}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                <button onClick={onOffline} className="w-full text-slate-500 hover:text-slate-300 text-xs mt-4 py-2">Continue Offline (Local Only)</button>
            </div>
        </div>
    );
};

export default Lobby;