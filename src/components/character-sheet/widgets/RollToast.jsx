import React, { useEffect, useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';
import Icon from '../../Icon';

const RollToast = () => {
    const history = useCharacterStore(state => state.rollHistory);
    const [visibleLog, setVisibleLog] = useState(null);

    // FIX: Only update when history CHANGES, not when 'visibleLog' changes.
    useEffect(() => {
        if (history.length > 0) {
            const latest = history[0];
            setVisibleLog(latest);
        }
    }, [history]);

    if (!visibleLog) return null;

    return (
        <div className="fixed bottom-28 left-4 right-4 md:left-auto md:right-8 md:bottom-32 z-[9999] animate-in slide-in-from-bottom-10 fade-in duration-300 pointer-events-none">
            <div className="bg-slate-900 border-2 border-amber-500 text-white rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.3)] max-w-sm ml-auto md:ml-0 relative overflow-hidden flex flex-col pointer-events-auto">
                
                {/* Header */}
                <div className="bg-slate-800 p-2 flex justify-between items-center border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <div className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">RESULT</div>
                        <span className="text-xs text-slate-400 font-mono">{new Date(visibleLog.id).toLocaleTimeString()}</span>
                    </div>
                    <button 
                        onClick={() => setVisibleLog(null)}
                        className="text-slate-400 hover:text-white hover:bg-slate-700 rounded p-1 transition-colors cursor-pointer"
                    >
                        <Icon name="x" size={18}/>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 text-sm leading-relaxed bg-slate-900/95 backdrop-blur-md">
                    <div dangerouslySetInnerHTML={{__html: visibleLog.message}} />
                </div>
            </div>
        </div>
    );
};

export default RollToast;