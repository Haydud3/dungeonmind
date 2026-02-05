import React, { useState } from 'react';
import Icon from '../Icon';

const ExternalSheetBridge = ({ url, onClose }) => {
    // START CHANGE: Force Refresh Logic
    const [refreshKey, setRefreshKey] = useState(0);
    const handleRefresh = () => setRefreshKey(prev => prev + 1);
    const handleLinkAccount = () => window.open('https://www.dndbeyond.com/login', '_blank');
    // END CHANGE

    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-3 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">Character Sheet</span>
                </div>
                <div className="flex items-center gap-1">
                    {/* START CHANGE: New Header Controls for Session Management */}
                    <button 
                        onClick={handleLinkAccount}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                        title="Sign in to D&D Beyond in a new tab"
                    >
                        <Icon name="user" size={14} /> Link Account
                    </button>
                    <button 
                        onClick={handleRefresh}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                        title="Refresh Iframe"
                    >
                        <Icon name="refresh-cw" size={18} />
                    </button>
                    {/* END CHANGE */}
                    <a 
                        href={url}  
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                        title="Open in New Tab"
                    >
                        <Icon name="external-link" size={18} />
                    </a>
                    <button 
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                        title="Close Sheet"
                    >
                        <Icon name="x" size={20} />
                    </button>
                </div>
            </div>

            {/* Bypass Warning Banner */}
            <div className="bg-indigo-950/40 border-b border-indigo-500/30 p-2 text-center">
                <p className="text-[10px] text-indigo-200/70 leading-tight">
                    Login failed? Click <span className="text-indigo-400 font-bold underline cursor-pointer" onClick={handleLinkAccount}>Link Account</span>, sign in, then <span className="text-indigo-400 font-bold underline cursor-pointer" onClick={handleRefresh}>Refresh</span>. 
                    <span className="opacity-50 ml-1">(Extension still required)</span>
                </p>
            </div>

            {/* Iframe Container */}
            <div className="flex-1 relative overflow-hidden bg-slate-950">
                <iframe 
                    key={refreshKey}
                    src={url}
                    className="w-full h-full border-none bg-white"
                    title="Character Sheet"
                    // Allow same-origin is required for the extension to interact and for DDB to load styles
                    sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
                />
            </div>

            {/* Mobile Helper (Bottom Bar) */}
            <div className="md:hidden p-4 bg-slate-800 border-t border-slate-700">
                <button 
                    onClick={() => window.open(url, '_blank')}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg"
                >
                    <Icon name="external-link" size={18} />
                    Open Mobile Sheet
                </button>
            </div>
        </div>
    );
};

export default ExternalSheetBridge;