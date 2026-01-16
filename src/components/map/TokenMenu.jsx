import React from 'react';
import Icon from '../Icon';

const TokenMenu = ({ selectedTokenId, openTokenSheet, updateTokenStatus, updateTokenSize, deleteToken, onClose }) => {
    if (!selectedTokenId) return null;

    return (
        <div className="absolute bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-500 rounded-full shadow-2xl p-2 flex gap-2 animate-in slide-in-from-bottom-2 items-center">
            <button onClick={() => openTokenSheet(selectedTokenId)} title="Open Sheet" className="p-2 hover:bg-slate-800 rounded-full text-amber-400 bg-amber-900/20 border border-amber-600/50"><Icon name="scroll-text" size={20}/></button>
            <div className="w-px h-6 bg-slate-700 mx-1"></div>
            <button onClick={() => updateTokenStatus(selectedTokenId, 'dead')} className="p-2 hover:bg-slate-800 rounded-full text-white"><Icon name="skull" size={20}/></button>
            <button onClick={() => updateTokenStatus(selectedTokenId, 'bloodied')} className="p-2 hover:bg-slate-800 rounded-full text-red-500"><Icon name="droplet" size={20}/></button>
            <button onClick={() => updateTokenStatus(selectedTokenId, 'poisoned')} className="p-2 hover:bg-slate-800 rounded-full text-green-500"><Icon name="flask-conical" size={20}/></button>
            <button onClick={() => updateTokenStatus(selectedTokenId, 'concentrating')} className="p-2 hover:bg-slate-800 rounded-full text-cyan-500"><Icon name="brain" size={20}/></button>
            <div className="w-px h-6 bg-slate-700"></div>
            <button onClick={() => updateTokenSize(selectedTokenId, 'medium')} className="text-xs font-bold text-white px-2 py-1 hover:bg-slate-800 rounded border border-slate-700">1x</button>
            <button onClick={() => updateTokenSize(selectedTokenId, 'large')} className="text-xs font-bold text-white px-2 py-1 hover:bg-slate-800 rounded border border-slate-700">2x</button>
            <button onClick={() => updateTokenSize(selectedTokenId, 'huge')} className="text-xs font-bold text-white px-2 py-1 hover:bg-slate-800 rounded border border-slate-700">3x</button>
            <div className="w-px h-6 bg-slate-700"></div>
            <button onClick={() => deleteToken(selectedTokenId)} className="p-2 hover:bg-red-900 rounded-full text-red-400"><Icon name="trash-2" size={20}/></button>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400"><Icon name="x" size={20}/></button>
        </div>
    );
};

export default TokenMenu;