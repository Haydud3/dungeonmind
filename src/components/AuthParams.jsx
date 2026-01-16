import React, { useState } from 'react';
import Icon from './Icon';

const AuthParams = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [isEntering, setIsEntering] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!username.trim()) return;
        setIsEntering(true);
        // Small delay for effect
        setTimeout(() => {
            onLogin(username);
        }, 800);
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Atmosphere */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />
            
            <div className={`relative z-10 max-w-md w-full transition-all duration-700 ${isEntering ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                
                {/* Logo / Title */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl mx-auto shadow-2xl flex items-center justify-center mb-6 transform rotate-3 border border-slate-600">
                        <Icon name="d20" size={48} className="text-white drop-shadow-md" />
                    </div>
                    <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-amber-600 fantasy-font tracking-wide drop-shadow-sm">
                        DUNGEONMIND
                    </h1>
                    <p className="text-slate-500 mt-2 font-mono text-sm tracking-widest uppercase">Virtual Tabletop Engine</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl p-8 shadow-2xl">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Identify Yourself</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Icon name="user" size={18} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors"/>
                                </div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-bold"
                                    placeholder="Enter your name..."
                                    autoFocus
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={!username.trim()}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-lg shadow-lg transform transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                        >
                            <span>Enter the Realm</span>
                            <Icon name="arrow-right" size={16} />
                        </button>
                    </div>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-600">
                        By entering, you agree to roll for initiative.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AuthParams;