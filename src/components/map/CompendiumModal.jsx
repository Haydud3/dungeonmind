import React, { useState } from 'react';
import Icon from '../Icon';

const CompendiumModal = ({ onClose, importFromApi }) => {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const performSearch = async () => {
        if(!search.trim()) return;
        setIsLoading(true);
        try {
            const r = await fetch(`https://www.dnd5eapi.co/api/monsters/?name=${search}`);
            const j = await r.json();
            setResults(j.results || []);
        } catch(e) { setResults([]); }
        setIsLoading(false);
    };

    // START CHANGE: Fetch details before passing to parent
    const handleSelect = async (url) => {
        setIsLoading(true);
        try {
            const r = await fetch(`https://www.dnd5eapi.co${url}`);
            const data = await r.json();
            importFromApi(data); // Now we pass the FULL JSON object, not just the URL
        } catch(e) {
            console.error(e);
            alert("Failed to fetch monster details.");
        }
        setIsLoading(false);
        onClose();
    };
    // END CHANGE

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="max-w-xl w-full bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                    <h3 className="font-bold text-white flex items-center gap-2"><Icon name="globe" size={18}/> D&D 5e API Search</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                </div>
                <div className="p-4 border-b border-slate-700">
                    <div className="flex gap-2">
                        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && performSearch()} placeholder="Search (e.g. Owlbear, Lich)..." className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500"/>
                        <button onClick={performSearch} disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 px-4 rounded text-white font-bold">{isLoading ? <Icon name="loader" size={18} className="animate-spin"/> : <Icon name="search" size={18}/>}</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900">
                    {results.map(r => (
                        <div key={r.index} 
                            // START CHANGE: Use handleSelect instead of direct prop call
                            onClick={() => handleSelect(r.url)} 
                            // END CHANGE
                            className="p-3 bg-slate-800 border border-slate-700 rounded hover:border-blue-500 cursor-pointer flex justify-between items-center group">
                            <div className="font-bold text-white group-hover:text-blue-400 capitalize">{r.name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1 group-hover:text-blue-300">Import <Icon name="download" size={14}/></div>
                        </div>
                    ))}
                    {results.length === 0 && !isLoading && <div className="text-center text-slate-500 py-8 italic">Search for a creature to begin.</div>}
                </div>
            </div>
        </div>
    );
};

export default CompendiumModal;