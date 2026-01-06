import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Icon from './Icon';

const JournalView = ({ data, updateCloud, role, userId, aiHelper, deleteJournalEntry }) => {
    const [activePageId, setActivePageId] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Sort by date descending
    const pages = Object.values(data.journal_pages || {}).sort((a,b) => b.created - a.created);
    const activePage = activePageId ? data.journal_pages[activePageId] : null;

    useEffect(() => {
        if (activePage) {
            setEditTitle(activePage.title);
            setEditContent(activePage.content);
        }
    }, [activePage]);

    const handleCreate = () => {
        const newId = `page_${Date.now()}`;
        const newPage = {
            id: newId,
            title: 'New Entry',
            content: '',
            ownerId: userId,
            isPublic: role === 'dm', 
            created: Date.now()
        };
        const newData = { ...data, journal_pages: { ...data.journal_pages, [newId]: newPage } };
        updateCloud(newData, true);
        setActivePageId(newId);
        setIsEditing(true);
    };

    const handleSave = () => {
        if (!activePage) return;
        const updated = { ...activePage, title: editTitle, content: editContent };
        const newData = { ...data, journal_pages: { ...data.journal_pages, [activePage.id]: updated } };
        updateCloud(newData, true);
        setIsEditing(false);
    };

    const handleDelete = () => {
        if(window.confirm("Delete this page?")) {
            deleteJournalEntry(activePageId);
            setActivePageId(null);
        }
    };

    const handleAiEnhance = async () => {
        if (!editContent.trim()) return;
        setIsAiLoading(true);
        const plainText = editContent.replace(/<[^>]*>?/gm, '');
        const prompt = `Rewrite the following RPG journal entry to be more immersive, descriptive, and fix grammar. Keep the same facts.\n\n${plainText}`;
        const res = await aiHelper([{ role: "user", content: prompt }]);
        if (res && !res.includes("Error")) {
            setEditContent(prev => prev + `<br/><br/><strong>--- AI Enhanced ---</strong><br/>${res.replace(/\n/g, '<br/>')}`);
        }
        setIsAiLoading(false);
    };

    const getPreviewText = (html) => {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        let text = (tmp.textContent || tmp.innerText || "").replace(/\u00A0/g, " ");
        return text;
    };

    // --- LIST VIEW ---
    if (!activePageId) {
        return (
            <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-32">
                <div className="w-full max-w-5xl mx-auto space-y-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl text-amber-500 fantasy-font">Journal</h2>
                        <button onClick={handleCreate} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded flex items-center gap-2 shadow-lg"><Icon name="plus" size={16}/> <span className="hidden xs:inline">New Entry</span></button>
                    </div>

                    {pages.length === 0 && <div className="text-center text-slate-500 mt-10">No journal entries yet.</div>}

                    <div className="grid gap-3">
                        {pages.map(p => (
                            <div 
                                key={p.id} 
                                onClick={() => setActivePageId(p.id)} 
                                role="button"
                                className="w-full text-left bg-slate-800 border border-slate-700 p-4 rounded hover:border-amber-500 transition-colors group cursor-pointer min-w-0 shadow-sm"
                            >
                                <div className="flex justify-between items-start w-full">
                                    <div className="min-w-0 flex-1"> 
                                        <h3 className="font-bold text-slate-200 text-lg group-hover:text-amber-400 truncate">{p.title}</h3>
                                        <div className="text-xs text-slate-500 mt-1 flex gap-2">
                                            <span>{new Date(p.created).toLocaleDateString()}</span>
                                            {p.isPublic && <span className="text-green-500 bg-green-900/20 px-1 rounded">Public</span>}
                                            {!p.isPublic && <span className="text-slate-500 bg-slate-700/50 px-1 rounded">Private</span>}
                                        </div>
                                    </div>
                                    <Icon name="chevron-right" size={16} className="text-slate-600 group-hover:text-amber-500 shrink-0 ml-2"/>
                                </div>
                                <div className="text-sm text-slate-400 mt-2 line-clamp-2 opacity-70 break-words whitespace-normal w-full">
                                    {getPreviewText(p.content)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // --- DETAIL / EDIT VIEW ---
    return (
        <div className="h-full flex flex-col bg-slate-900">
            {/* Header Toolbar */}
            <div className="shrink-0 h-14 border-b border-slate-700 bg-slate-800 flex justify-center px-2 z-20">
                <div className="flex items-center justify-between w-full max-w-5xl">
                    <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                        <button onClick={() => setActivePageId(null)} className="text-slate-400 hover:text-white shrink-0 p-2"><Icon name="arrow-left" size={20}/></button>
                        {isEditing ? (
                            <input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white font-bold w-full min-w-0" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Entry Title" />
                        ) : (
                            <h2 className="font-bold text-slate-200 truncate">{activePage.title}</h2>
                        )}
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                        {isEditing ? (
                            <>
                                <button onClick={handleAiEnhance} disabled={isAiLoading} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded flex items-center gap-1 shadow-lg">
                                    {isAiLoading ? <Icon name="loader-2" className="animate-spin" size={14}/> : <Icon name="sparkles" size={14}/>} <span className="hidden sm:inline">AI Fix</span>
                                </button>
                                <button onClick={handleSave} className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded shadow-lg font-bold">Save</button>
                            </>
                        ) : (
                            <>
                                {(role === 'dm' || activePage.ownerId === userId) && (
                                    <>
                                        <button onClick={() => {
                                            const newData = {...data, journal_pages: {...data.journal_pages, [activePage.id]: {...activePage, isPublic: !activePage.isPublic}}};
                                            updateCloud(newData, true);
                                        }} className={`text-xs px-2 py-1 rounded border hidden sm:block ${activePage.isPublic ? 'border-green-600 text-green-400' : 'border-slate-600 text-slate-400'}`}>
                                            {activePage.isPublic ? 'Public' : 'Private'}
                                        </button>
                                        <button onClick={() => { setIsEditing(true); setEditTitle(activePage.title); setEditContent(activePage.content); }} className="text-slate-400 hover:text-amber-400 p-2"><Icon name="pencil" size={18}/></button>
                                        <button onClick={handleDelete} className="text-slate-400 hover:text-red-400 p-2"><Icon name="trash-2" size={18}/></button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {/* PB-32 added to ensure text clears the mobile navbar */}
            <div className="flex-1 overflow-hidden relative bg-slate-900">
                {isEditing ? (
                    <div className="h-full flex flex-col w-full max-w-5xl mx-auto relative">
                        <ReactQuill 
                            theme="snow" 
                            value={editContent} 
                            onChange={setEditContent} 
                            className="h-full flex flex-col mobile-quill-fix"
                            // Custom modules to simplify toolbar on mobile if needed
                            modules={{ 
                                toolbar: [
                                    [{ 'header': [1, 2, false] }], 
                                    ['bold', 'italic', 'underline', 'strike'], 
                                    [{'list': 'ordered'}, {'list': 'bullet'}],
                                    ['clean']
                                ] 
                            }}
                        />
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto custom-scroll pb-32">
                        <div className="p-6 w-full max-w-5xl mx-auto">
                            <div 
                                className="prose prose-invert prose-p:text-slate-300 prose-headings:text-amber-500 max-w-none break-words whitespace-pre-wrap" 
                                dangerouslySetInnerHTML={{__html: activePage.content}} 
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JournalView;
