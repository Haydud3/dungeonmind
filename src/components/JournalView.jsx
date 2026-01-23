import React, { useState, useEffect, useRef } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Icon from './Icon';

const JournalView = ({ data, role, userId, myCharId, aiHelper, onSavePage, onDeletePage }) => {
    const [activePageId, setActivePageId] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    
    // Permission Menu State
    const [showPermMenu, setShowPermMenu] = useState(false);
    const permMenuRef = useRef(null);

    // --- 1. SMART FILTERING (CHARACTER BASED) ---
    // DM sees everything. Owners see their own. Public sees public. 
    // SPECIFIC CHARACTERS see what is shared with them via ID.
    const allPages = Object.values(data.journal_pages || {}).sort((a,b) => b.created - a.created);
    
    const visiblePages = allPages.filter(p => {
        if (role === 'dm') return true;
        if (p.ownerId === userId) return true;
        if (p.isPublic) return true;
        
        // Check if my CHARACTER ID is in the list
        if (myCharId && p.visibleTo && p.visibleTo.includes(myCharId)) return true;
        
        // Fallback: Check if my USER ID is in the list (Legacy support)
        if (p.visibleTo && p.visibleTo.includes(userId)) return true;
        
        return false;
    });

    const activePage = activePageId ? data.journal_pages[activePageId] : null;

    useEffect(() => {
        if (activePage) {
            setEditTitle(activePage.title);
            setEditContent(activePage.content);
        }
    }, [activePage]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (permMenuRef.current && !permMenuRef.current.contains(event.target)) {
                setShowPermMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleCreate = () => {
        const newId = Date.now().toString();
        const newPage = {
            id: newId,
            title: 'New Entry',
            content: '',
            ownerId: userId,
            isPublic: false, 
            visibleTo: [], 
            created: Date.now()
        };
        if (onSavePage) onSavePage(newId, newPage);
        setActivePageId(newId);
        setIsEditing(true);
    };

    const handleSave = () => {
        if (!activePage) return;
        const updated = { ...activePage, title: editTitle, content: editContent };
        if (onSavePage) onSavePage(activePage.id, updated);
        setIsEditing(false);
    };

    const handleDelete = () => {
        if(window.confirm("Delete this page?")) {
            if (onDeletePage) onDeletePage(activePageId);
            setActivePageId(null);
        }
    };

    // --- 2. PERMISSION HANDLERS ---
    const togglePublic = () => {
        if (!activePage) return;
        const updated = { ...activePage, isPublic: !activePage.isPublic };
        if (onSavePage) onSavePage(activePage.id, updated);
    };

    // FIX: Toggle by CHARACTER ID, not Owner ID
    const toggleCharacterPermission = (targetCharId) => {
        if (!activePage) return;
        const currentList = activePage.visibleTo || [];
        let newList;
        
        if (currentList.includes(targetCharId)) {
            newList = currentList.filter(id => id !== targetCharId);
        } else {
            newList = [...currentList, targetCharId];
        }

        const updated = { ...activePage, visibleTo: newList };
        if (onSavePage) onSavePage(activePage.id, updated);
    };

    const handleAiEnhance = async () => {
        if (!editContent.trim()) return;
        setIsAiLoading(true);
        const plainText = editContent.replace(/<[^>]*>?/gm, '');
        const prompt = `Rewrite the following RPG journal entry to be more immersive, descriptive, and fix grammar. Keep the same facts.\n\n${plainText}`;
        try {
            const res = await aiHelper([{ role: "user", content: prompt }]);
            if (res && !res.includes("Error")) {
                setEditContent(prev => prev + `<br/><br/><strong>--- AI Enhanced ---</strong><br/>${res.replace(/\n/g, '<br/>')}`);
            }
        } catch(e) { console.error(e); }
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

                    {visiblePages.length === 0 && <div className="text-center text-slate-500 mt-10">No journal entries available.</div>}

                    <div className="grid gap-3">
                        {visiblePages.map(p => (
                            <div 
                                key={p.id} 
                                onClick={() => setActivePageId(p.id)} 
                                role="button"
                                className="w-full text-left bg-slate-800 border border-slate-700 p-4 rounded hover:border-amber-500 transition-colors group cursor-pointer min-w-0 shadow-sm"
                            >
                                <div className="flex justify-between items-start w-full">
                                    <div className="min-w-0 flex-1"> 
                                        <h3 className="font-bold text-slate-200 text-lg group-hover:text-amber-400 truncate">{p.title}</h3>
                                        <div className="text-xs text-slate-500 mt-1 flex gap-2 items-center">
                                            <span>{new Date(p.created).toLocaleDateString()}</span>
                                            {p.isPublic ? (
                                                <span className="text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded flex items-center gap-1"><Icon name="globe" size={10}/> Public</span>
                                            ) : (p.visibleTo && p.visibleTo.length > 0) ? (
                                                <span className="text-indigo-400 bg-indigo-900/30 px-1.5 py-0.5 rounded flex items-center gap-1"><Icon name="users" size={10}/> Shared</span>
                                            ) : (
                                                <span className="text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded flex items-center gap-1"><Icon name="lock" size={10}/> Private</span>
                                            )}
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

    // --- DETAIL VIEW ---
    if (!activePage) return <div className="p-4 text-slate-500">Page not found... <button onClick={()=>setActivePageId(null)}>Back</button></div>;

    return (
        <div className="h-full flex flex-col bg-slate-900">
            {/* Header */}
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
                    
                    <div className="flex gap-2 shrink-0 items-center">
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
                                    <div className="relative" ref={permMenuRef}>
                                        <button onClick={() => setShowPermMenu(!showPermMenu)} className={`text-xs px-2 py-1 rounded border flex items-center gap-1 hover:bg-slate-700 ${activePage.isPublic ? 'border-green-600 text-green-400' : (activePage.visibleTo?.length > 0 ? 'border-indigo-500 text-indigo-400' : 'border-slate-600 text-slate-400')}`}>
                                            <Icon name={activePage.isPublic ? "globe" : "lock"} size={12}/>
                                            <span className="hidden sm:inline">{activePage.isPublic ? 'Public' : 'Visibility'}</span>
                                        </button>

                                        {showPermMenu && (
                                            <div className="absolute top-full right-0 mt-2 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 p-2 animate-in zoom-in-95 duration-100">
                                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 px-2">Visible To...</h4>
                                                
                                                <div onClick={togglePublic} className="flex items-center justify-between p-2 rounded hover:bg-slate-700 cursor-pointer mb-2 border-b border-slate-700">
                                                    <span className="text-sm font-bold text-white flex items-center gap-2"><Icon name="globe" size={14}/> <span>Everyone</span></span>
                                                    {activePage.isPublic && <Icon name="check" size={16} className="text-green-500"/>}
                                                </div>

                                                <div className="space-y-1 max-h-60 overflow-y-auto custom-scroll">
                                                    {data.players && data.players.length > 0 ? data.players.map(p => {
                                                        // FIX: Use Character ID (p.id) for permissions
                                                        const targetId = p.id; 
                                                        const isSelected = activePage.visibleTo?.includes(targetId);
                                                        
                                                        return (
                                                            <div key={p.id} onClick={() => toggleCharacterPermission(targetId)} className={`flex items-center justify-between p-2 rounded cursor-pointer ${isSelected ? 'bg-indigo-900/30 border border-indigo-500/30' : 'hover:bg-slate-700 border border-transparent'}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-8 h-8 rounded bg-slate-900 overflow-hidden shrink-0 border border-slate-700">
                                                                        {p.image ? <img src={p.image} className="w-full h-full object-cover"/> : <div className="flex items-center justify-center h-full text-[10px] text-slate-500 font-bold">{p.name[0]}</div>}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm text-slate-200 font-bold truncate">{p.name}</div>
                                                                        <div className="text-[10px] text-slate-500 truncate">{p.race} {p.class}</div>
                                                                    </div>
                                                                </div>
                                                                {isSelected && <Icon name="check" size={14} className="text-indigo-400 shrink-0"/>}
                                                            </div>
                                                        );
                                                    }) : <div className="p-4 text-center text-xs text-slate-500 italic">No characters found.</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <button onClick={() => { setIsEditing(true); setEditTitle(activePage.title); setEditContent(activePage.content); }} className="text-slate-400 hover:text-amber-400 p-2"><Icon name="pencil" size={18}/></button>
                                <button onClick={handleDelete} className="text-slate-400 hover:text-red-400 p-2"><Icon name="trash-2" size={18}/></button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative bg-slate-900">
                {isEditing ? (
                    <div className="h-full flex flex-col w-full max-w-5xl mx-auto relative">
                        <ReactQuill theme="snow" value={editContent} onChange={setEditContent} className="h-full flex flex-col mobile-quill-fix" modules={{ toolbar: [[{ 'header': [1, 2, false] }], ['bold', 'italic', 'underline', 'strike'], [{'list': 'ordered'}, {'list': 'bullet'}], ['clean']] }} />
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto custom-scroll pb-32">
                        <div className="p-6 w-full max-w-5xl mx-auto">
                            <div className="prose prose-invert max-w-none [&>h3]:text-xl [&>h3]:font-bold [&>h3]:text-amber-500 [&>h3]:mt-6 [&>h3]:mb-2 [&>h3]:fantasy-font [&>h3]:border-b [&>h3]:border-amber-900/30 [&>h3]:pb-1 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1 [&>ul]:text-slate-300 [&>ul]:mb-4 [&>li>b]:text-white [&>li>b]:font-bold [&>p]:mb-4 [&>p]:leading-relaxed" dangerouslySetInnerHTML={{__html: activePage.content}} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JournalView;