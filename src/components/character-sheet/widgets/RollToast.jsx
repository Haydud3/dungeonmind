import React, { useEffect, useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';

const RollToast = () => {
    const logs = useCharacterStore((state) => state.logs);
    const removeLog = useCharacterStore((state) => state.removeLog);
    const [toasts, setToasts] = useState([]);

    // Sync store logs to local state, but prioritize NEWEST
    useEffect(() => {
        if (!logs) return;
        
        // Create a copy, reverse it to get newest first, take top 3
        const recentLogs = [...logs].reverse().slice(0, 3);
        setToasts(recentLogs);

        // Optional: Auto-dismiss the oldest visible toast after 4 seconds
        // This keeps the feed feeling "live"
        const timer = setTimeout(() => {
            if (logs.length > 0) {
                // Remove the oldest log currently in the store to keep it clean
                // (Be careful with this if you want a permanent history elsewhere)
                // If you just want to hide it visually, we rely on the slice above.
            }
        }, 4000);

        return () => clearTimeout(timer);
    }, [logs]);

    if (!toasts || toasts.length === 0) return null;

    return (
        <div className="absolute bottom-24 right-2 w-72 z-[100] pointer-events-none flex flex-col gap-2 items-end">
            {toasts.map((log) => (
                <div 
                    key={log.id} 
                    className="
                        bg-slate-900/95 border border-slate-600 text-slate-100 
                        p-3 rounded-lg shadow-2xl text-center text-sm 
                        animate-in slide-in-from-right-20 fade-in duration-300 
                        w-full pointer-events-auto relative backdrop-blur-sm
                    "
                >
                    <button 
                        onClick={() => removeLog(log.id)} 
                        className="absolute top-1 right-2 text-slate-500 hover:text-white font-bold text-xs"
                    >
                        ✕
                    </button>
                    
                    {/* Render HTML for colors (Crit fails/successes) */}
                    <div 
                        className="font-medium tracking-wide"
                        dangerouslySetInnerHTML={{ __html: log.message }} 
                    />
                </div>
            ))}
        </div>
    );
};

export default RollToast;