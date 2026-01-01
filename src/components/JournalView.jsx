import React, { useState } from 'react';
import Icon from './Icon';
import JournalPageEditor from './JournalPageEditor';

const JournalView = ({ data = {}, setData, updateCloud, role, aiHelper }) => {
    const pages = data.journal_pages || {};
    const [selectedPageId, setSelectedPageId] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newPageTitle, setNewPageTitle] = useState("");

    const availablePages = Object.values(pages).sort((a,b) => b.created - a.created);

    const handleCreate = () => {
        if (!newPageTitle.trim()) return;
        const newId = "page_" + Date.now();
        const newPage = { id: newId, title: newPageTitle, content: "<p>New entry...</p>", isPublic: true, created: Date.now() };
        const newData = { ...data, journal_pages: { ...pages, [newId]: newPage } };
        setData(newData); updateCloud(newData, true);
        setSelectedPageId(newId); setIsCreating(false); setNewPageTitle("");
    };

    const handleSavePage = (id, updatedPage) => {
        const newData = { ...data, journal_pages: { ...pages, [id]: updatedPage } };
        setData(newData); updateCloud(newData);
    };

    const handleDeletePage = (id) => {
        if(confirm("Delete this page permanently?")) {
            if (selectedPageId === id) setSelectedPageId(null);
            const newPages = { ...pages };
            delete newPages[id];
            const newData = { ...data, journal_pages: newPages };
            setData(newData); updateCloud(newData, true); // FIXED: Immediate Save
        }
    };

    return (
        <div className="flex h-full w-full max-w-7xl mx-auto md:glass-panel md:rounded-xl overflow-hidden m-0 md:m-6 md:border border-slate-700 bg-slate-900">
            <div className={`flex-col bg-slate-900 border-r border-slate-700 w-full md:w-64 ${selectedPageId ? 'hidden md:flex' : 'flex'} h-full`}>
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50"><h3 className="fantasy-font text-amber-500 text-lg">Journal</h3><button onClick={() => setIsCreating(true)} className="bg-amber-600 hover:bg-amber-500 text-white p-2 rounded"><Icon name="plus" size={20}/></button></div>
                {isCreating && (<div className="p-3 bg-slate-800 border-b border-slate-700"><input autoFocus value={newPageTitle} onChange={e=>setNewPageTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-2 text-base text-white mb-2" placeholder="Page Title"/><div className="flex gap-2"><button onClick={handleCreate} className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs py-2 rounded">Create</button><button onClick={() => setIsCreating(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 rounded">Cancel</button></div></div>)}
                <div className="flex-1 overflow-y-auto custom-scroll pb-20 md:pb-0">{availablePages.map(page => (<div key={page.id} onClick={() => setSelectedPageId(page.id)} className={`p-4 border-b border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors ${selectedPageId === page.id ? 'bg-slate-800 border-l-4 border-l-amber-500' : 'border-l-4 border-l-transparent'}`}><div className="font-bold text-slate-200 text-base md:text-sm truncate">{page.title}</div><div className="flex justify-between items-center mt-1"><span className="text-xs md:text-[10px] text-slate-500">{new Date(page.created).toLocaleDateString()}</span><Icon name={page.isPublic ? "eye" : "lock"} size={12} className={page.isPublic ? "text-green-500" : "text-slate-500"}/></div></div>))}</div>
            </div>
            <div className={`flex-1 h-full overflow-hidden bg-slate-900/30 ${selectedPageId ? 'flex' : 'hidden md:flex'} flex-col`}>{selectedPageId && pages[selectedPageId] ? (<JournalPageEditor page={pages[selectedPageId]} onSave={handleSavePage} onDelete={handleDeletePage} onBack={() => setSelectedPageId(null)} aiHelper={aiHelper} />) : (<div className="h-full flex flex-col items-center justify-center text-slate-500"><Icon name="book-open" size={48} className="mb-4 opacity-20"/><p>Select a page or create a new one.</p></div>)}</div>
        </div>
    );
};

export default JournalView;
