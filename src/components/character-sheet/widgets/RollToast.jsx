import React, { useEffect, useState } from 'react';
import { useCharacterStore } from '../../../stores/useCharacterStore';

const RollToast = () => {
    const logs = useCharacterStore((state) => state.logs);
    const [visibleLogs, setVisibleLogs] = useState([]);

    useEffect(() => {
        if (logs && logs.length > 0) {
            setVisibleLogs(logs.slice(0, 3));
        }
    }, [logs]);

    if (!visibleLogs || visibleLogs.length === 0) return null;

    return (
        // FIX: Moved to Bottom Right (bottom-24 to clear mobile nav bar)
        <div className="absolute bottom-24 right-2 w-64 z-[100] pointer-events-none flex flex-col gap-2 items-end">
            {visibleLogs.map((log) => (
                <div 
                    key={log.id} 
                    className="bg-slate-900/95 border border-slate-600 text-white p-3 rounded-lg shadow-2xl text-center text-sm animate-in slide-in-from-right-10 fade-in duration-300 w-full"
                >
                    <div dangerouslySetInnerHTML={{ __html: log.message }} />
                </div>
            ))}
        </div>
    );
};

export default RollToast;