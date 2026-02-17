import React from 'react';

const DiceTray = ({ diceLog = [], handleDiceRoll }) => {
    return (
        <div className="glass-panel p-4 rounded-lg mb-4 bg-slate-800/80 border border-slate-700">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Dice Roller</h3>
            <div className="grid grid-cols-4 gap-2 mb-3">
                {[4, 6, 8, 10, 12, 20, 100].map(d => (
                    <button 
                        key={d} 
                        onClick={() => handleDiceRoll(`1d${d}`, { alias: `d${d} Roll` })} 
                        className="bg-slate-700 hover:bg-amber-700 text-xs font-mono py-2 rounded border border-slate-600 transition-colors text-white"
                    >
                        d{d}
                    </button>
                ))}
            </div>
            
            <div className="h-24 overflow-y-auto custom-scroll bg-slate-900/50 rounded p-2 font-mono text-xs space-y-1">
                {diceLog.map(log => (
                    <div key={log.id} className="flex flex-col border-b border-slate-800 pb-2 mb-1 last:border-0">
                        <div className="flex justify-between items-baseline">
                            <span className="font-bold text-slate-300">{log.die}</span>
                            <span className="text-[10px] text-slate-500">{log.formulaDisplay}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <div className="flex items-center gap-1 text-slate-400">
                                <span className={log.natural == 20 ? "text-green-400 font-bold" : log.natural == 1 ? "text-red-400 font-bold" : ""}>
                                    {log.natural}
                                </span>
                                {log.mod !== undefined && log.mod !== 0 && <span>{log.mod >= 0 ? '+' : ''}{log.mod}</span>}
                            </div>
                            <span className="text-lg font-bold text-amber-500">= {log.result}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DiceTray;