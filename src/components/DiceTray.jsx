import React from 'react';

const DiceTray = ({ diceLog = [], handleDiceRoll }) => {
    return (
        <div className="glass-panel p-4 rounded-lg mb-4 bg-slate-800/80 border border-slate-700">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Dice Roller</h3>
            <div className="grid grid-cols-4 gap-2 mb-3">
                {[4, 6, 8, 10, 12, 20, 100].map(d => (
                    <button 
                        key={d} 
                        onClick={() => handleDiceRoll(d)} 
                        className="bg-slate-700 hover:bg-amber-700 text-xs font-mono py-2 rounded border border-slate-600 transition-colors text-white"
                    >
                        d{d}
                    </button>
                ))}
            </div>
            
            <div className="h-24 overflow-y-auto custom-scroll bg-slate-900/50 rounded p-2 font-mono text-xs space-y-1">
                {diceLog.map(log => (
                    <div key={log.id} className="flex justify-between border-b border-slate-800 pb-1">
                        <span className="text-slate-400">{log.die}</span>
                        <span className={`font-bold ${
                            log.result == 20 && log.die === 'd20' ? 'text-green-400' : 
                            log.result == 1 && log.die === 'd20' ? 'text-red-400' : 'text-amber-400'
                        }`}>
                            {log.result}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DiceTray;