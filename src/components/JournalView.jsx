import React, { useState } from 'react';
// --- CHANGES: Import the new Editor and Icon ---
import JournalPageEditor from './JournalPageEditor';
import Icon from './Icon';
// --- END OF CHANGES ---

const JournalView = ({ data, role, userId, aiHelper, onSavePage, onDeletePage }) => {
    const [activePageId, setActivePageId] = useState(null);

    // --- CHANGES: Keep filtering logic, but removed isEditing/Outline state ---
    const allPages = Object.values(data.journal_pages || {}).sort((a,b) => b.created - a.created);
    
    const visiblePages = allPages.filter(p => {
        // DM sees all
        if (role === 'dm') return true;
        // Owners see their own
        if (p.ownerId === userId) return true;
        // Public pages
        if (p.isPublic) return true;
        // Shared with specific user
        return p.visibleTo?.includes(userId);
    });

    const handleCreate = () => {
        const newId = Date.now().toString();
        const newPage = {
            id: newId,
            title: '', // Empty title triggers placeholder in Editor
            content: '',
            ownerId: userId,
            isPublic: false,
            created: Date.now()
        };
        if (onSavePage) onSavePage(newId, newPage);
        setActivePageId(newId);
    };

    // --- CHANGES: Direct render of Editor if activePageId exists (No Read Mode) ---
    if (activePageId) {
        const activePage = data.journal_pages[activePageId];
        // Guard clause in case page was deleted while open
        if (!activePage) { setActivePageId(null); return null; }

        return (
            <JournalPageEditor
                page={activePage}
                onSave={onSavePage}
// --- CHANGES: Pass players list to Editor for permission handling ---
                onDelete={(id) => { onDeletePage(id); setActivePageId(null); }}
                onBack={() => setActivePageId(null)}
                aiHelper={aiHelper}
                players={data.players || []} 
                userId={userId}
// --- 2 lines after changes ---
            />
        );
    }
    // --- END OF CHANGES ---

    // --- CHANGES: Simplified List View ---
    return (
        <div className="h-full bg-slate-900 p-4 overflow-y-auto custom-scroll pb-32">
            <div className="w-full max-w-5xl mx-auto space-y-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl text-amber-500 fantasy-font">Journal</h2>
                    <button onClick={handleCreate} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded shadow-lg flex items-center gap-2">
                        <Icon name="plus" size={18}/> <span>New Entry</span>
                    </button>
                </div>

                <div className="grid gap-3">
                    {visiblePages.map(p => (
                        <div 
                            key={p.id} 
                            onClick={() => setActivePageId(p.id)} 
                            className="bg-slate-800 border border-slate-700 p-4 rounded-lg cursor-pointer hover:border-amber-500/50 hover:bg-slate-700 transition-all shadow-sm group"
                        >
                            <h3 className="font-bold text-slate-200 text-lg group-hover:text-amber-400">
                                {p.title || "Untitled Entry"}
                            </h3>
                            <div className="text-xs text-slate-500 mt-1 flex gap-2">
                                <span>{new Date(p.created).toLocaleDateString()}</span>
                                {p.isPublic && <span className="text-green-500 flex items-center gap-1"><Icon name="globe" size={10}/> Public</span>}
                            </div>
                        </div>
                    ))}
                    {visiblePages.length === 0 && (
                        <div className="text-center text-slate-500 italic py-10">No journals found. Start writing!</div>
                    )}
                </div>
            </div>
        </div>
    );
    // --- END OF CHANGES ---
};

export default JournalView;