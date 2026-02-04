import React, { useState, useEffect, useRef } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
// --- CHANGES: Explicitly register both the Module and the Blot to fix Parchment errors ---
import * as QuillMention from 'quill-mention';
import 'quill-mention/dist/quill.mention.css';

if (Quill) {
    // 1. Resolve the Module (Logic)
    const MentionModule = QuillMention.default || QuillMention.Mention || QuillMention;
    
    // 2. Resolve the Blot (Visual UI)
    // QuillMention usually exports MentionBlot. If not, we check the module's properties.
    const MentionBlot = QuillMention.MentionBlot || MentionModule.MentionBlot;

    // 3. Register 'blots/mention' (Crucial for rendering the chip)
    if (MentionBlot && !Quill.import('blots/mention')) {
        Quill.register('blots/mention', MentionBlot);
    }

    // 4. Register 'modules/mention' (Crucial for the popup menu)
    if (MentionModule && typeof MentionModule === 'function' && !Quill.import('modules/mention')) {
        Quill.register('modules/mention', MentionModule);
    }
}
// --- END OF CHANGES ---
import { useToast } from './ToastProvider'; 
import Icon from './Icon';
import { resolveChunkedHtml, storeChunkedMap } from '../utils/storageUtils';
import { compressImage } from '../utils/imageCompressor';

// --- CHANGES: Ensure component receives all necessary props for privacy-gated mentions ---
const JournalPageEditor = ({ 
    page, onSave, onDelete, onBack, aiHelper,
    isDm, players = [], npcs = [], locations = [], onEntitySelect 
}) => {
    const [localContent, setLocalContent] = useState(page.content || "");
// --- END OF CHANGES ---
    const [resolvedContent, setResolvedContent] = useState("");
    const [syncStatus, setSyncStatus] = useState("idle");
    const [aiWorking, setAiWorking] = useState(false);
    const toast = useToast();
    const quillRef = useRef(null);
    const debounceRef = useRef(null);
    
    // --- CHANGES: Add state and handlers for Permission Menu ---
    const [showPermMenu, setShowPermMenu] = useState(false);
    const permMenuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (permMenuRef.current && !permMenuRef.current.contains(event.target)) {
                setShowPermMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleCharacterPermission = (targetCharId) => {
        const currentList = page.visibleTo || [];
        let newList;
        if (currentList.includes(targetCharId)) {
            newList = currentList.filter(id => id !== targetCharId);
        } else {
            newList = [...currentList, targetCharId];
        }
        onSave(page.id, { ...page, visibleTo: newList });
    };
    // --- END OF CHANGES ---

    // --- CHANGES: Define Custom Toolbar ID and Update Modules ---
    // We define a Custom Toolbar ID to link the HTML container to Quill
    const TOOLBAR_ID = "journal-toolbar-container";
    // --- END OF CHANGES ---

    // START CHANGE: Resolve images on load/edit
    useEffect(() => {
        const resolve = async () => {
            if (page.content) {
                // We resolve the content before pasting it to Quill
                const html = await resolveChunkedHtml(page.content);
                setResolvedContent(html);
            } else {
                setResolvedContent("");
            }
        };
        resolve();
    }, [page.id, page.content]);

    useEffect(() => { 
        // --- CHANGES: Guard against non-instantiated editor to fix "Accessing non-instantiated editor" error ---
        if (quillRef.current && resolvedContent) {
            try {
                const editor = quillRef.current.getEditor();
                if (editor && !editor.getText().trim()) {
                    editor.clipboard.dangerouslyPasteHTML(0, resolvedContent);
                }
            } catch (e) {
                console.warn("Quill editor not yet ready for content injection.");
            }
        }
        // --- END OF CHANGES ---
    }, [resolvedContent]);
    // END CHANGE

    // --- CHANGES: Implement debounced auto-save (1500ms) with sync status tracking ---
    const handleChange = (value) => {
        setLocalContent(value);
        setSyncStatus("typing");
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setSyncStatus("saving");
            onSave(page.id, { ...page, content: value });
            setTimeout(() => {
                setSyncStatus("saved");
                setTimeout(() => setSyncStatus("idle"), 2000);
            }, 500);
        }, 1500);
    };
    // --- END OF CHANGES ---

    const toggleVisibility = () => { 
        onSave(page.id, { ...page, isPublic: !page.isPublic }); 
    };

    // --- CUSTOM HANDLERS FOR QUILL TOOLBAR ---

    const handleImageUpload = () => {
        // --- CHANGES: Guard editor access in image upload handler ---
        if (!quillRef.current) return;
        const editor = quillRef.current.getEditor();
        // --- END OF CHANGES ---
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            
            try {
                toast("Processing image...", "info");
                const compressedBase64 = await compressImage(file, 800);
                const chunkedId = await storeChunkedMap(compressedBase64, `journal_img_${file.name}`);
                
                // --- CHANGES: Use local editor reference for insertion ---
                const range = editor.getSelection(true);
                editor.insertEmbed(range.index, 'chunkedImage', chunkedId, 'user');
                editor.setSelection(range.index + 1, 'silent');
                // --- END OF CHANGES ---
            } catch (err) {
                console.error(err);
                toast("Image insertion failed", "error");
            }
        };
    };

    const insertDynamicTable = () => {
        const rows = prompt("How many rows?", "3");
        const cols = prompt("How many columns?", "3");
        if (!rows || !cols) return;

        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        
        let tableHTML = `<table style="width:100%; border-collapse:collapse; margin:10px 0; border:1px solid #475569;"><tbody>`;
        for (let r = 0; r < parseInt(rows); r++) {
            tableHTML += `<tr>`;
            for (let c = 0; c < parseInt(cols); c++) {
                tableHTML += `<td style="border:1px solid #475569; padding:8px; min-width:30px;">...</td>`;
            }
            tableHTML += `</tr>`;
        }
        tableHTML += `</tbody></table><p><br/></p>`;
        
        quill.clipboard.dangerouslyPasteHTML(range ? range.index : 0, tableHTML);
    };

    const deleteRow = () => {
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;
        const [leaf] = quill.getLeaf(range.index);
        
        let current = leaf.domNode;
        while (current && current.tagName !== 'TR' && current !== quill.root) {
            current = current.parentNode;
        }

        if (current && current.tagName === 'TR') {
            current.remove();
            handleChange(quill.root.innerHTML); // Force save
        } else {
            toast("Cursor must be inside a table row to delete it.", "warning");
        }
    };

    const deleteCol = () => {
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;
        const [leaf] = quill.getLeaf(range.index);

        let td = leaf.domNode;
        while (td && td.tagName !== 'TD' && td !== quill.root) {
            td = td.parentNode;
        }

        if (td && td.tagName === 'TD') {
            const tr = td.parentNode;
            const tbody = tr.parentNode;
            // Calculate column index
            const colIndex = Array.from(tr.children).indexOf(td);
            
            // Remove that cell from EVERY row
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                if (row.children[colIndex]) row.children[colIndex].remove();
            });
            handleChange(quill.root.innerHTML);
        } else {
            toast("Cursor must be inside a table cell to delete the column.", "warning");
        }
    };

    const resizeImage = () => {
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;

        // Check if we clicked ON an image or cursor is near one
        const [leaf] = quill.getLeaf(range.index);
        let img = null;

        if (leaf.domNode.tagName === 'IMG') img = leaf.domNode;
        // Sometimes selection is just after the image
        else if (leaf.domNode.previousSibling && leaf.domNode.previousSibling.tagName === 'IMG') {
            img = leaf.domNode.previousSibling;
        }

        if (img) {
            const currentWidth = img.style.width || "100%";
            const newWidth = prompt("Enter new width (e.g., '50%', '300px'):", currentWidth);
            if (newWidth) {
                img.style.width = newWidth;
                handleChange(quill.root.innerHTML);
            }
        } else {
            toast("Please select an image to resize.", "warning");
        }
    };

    const handleAiSpark = async () => {
        if(aiWorking || !aiHelper) return;
        setAiWorking(true);
// --- CHANGES: Update Modules to use Detached Toolbar container ---
        const quill = quillRef.current.getEditor();
        const currentText = quill.getText();
        try {
            const prompt = `Continue this D&D text. Maintain tone. Max 3 sentences:\n\n${currentText.slice(-500)}`;
            const res = await aiHelper([{role: 'user', content: prompt}]);
            if(res) {
                const range = quill.getSelection(true);
                quill.insertText(range ? range.index : quill.getLength(), ` ${res}`);
            }
        } catch(e) { alert("AI Brainstorm Failed"); }
        setAiWorking(false);
    };

    const modules = {
        toolbar: {
            container: `#${TOOLBAR_ID}`, // Tell Quill to render tools HERE
            handlers: {
                'image': handleImageUpload,
                // Custom handlers for consolidation
                'tableInsert': insertDynamicTable,
                'tableRowDelete': deleteRow,
                'tableColDelete': deleteCol,
                'imageResize': resizeImage,
                'aiSpark': handleAiSpark
            }
        },
        // --- Implement Privacy-Aware @ Mentions logic ---
        mention: {
// --- 2 lines after changes ---
            allowedChars: /^[A-Za-z\sÅÄÖåäö]*$/,
            mentionDenotationChars: ["@"],
            source: (searchTerm, renderList, mentionChar) => {
                const values = [
                    ...players.map(p => ({ id: p.id, value: p.name, type: 'player', icon: 'user' })),
                    ...npcs
                        .filter(n => isDm || !n.isHidden)
                        .map(n => ({ id: n.id, value: n.name, type: 'npc', icon: 'skull' })),
                    ...locations
                        .filter(l => isDm || !l.isHidden)
                        .map(l => ({ id: l.id, value: l.name, type: 'location', icon: 'map-pin' }))
                ];

                if (searchTerm.length === 0) {
                    renderList(values, searchTerm);
                } else {
                    const matches = values.filter(item => 
                        item.value.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                    renderList(matches, searchTerm);
                }
            },
            renderItem: (item) => {
                return `<span><i class="vtt-mention-icon" data-icon="${item.icon}"></i>${item.value}</span>`;
            },
            onSelect: (item, insertItem) => {
                insertItem(item);
                if (onEntitySelect) onEntitySelect(item.type, item.id);
            }
        }
        // --- END OF CHANGES ---
    };

    return (
        <div className="infinite-desk">
            {/* --- CHANGES: HUD Header with Embedded Toolbar --- */}
            <div className="h-16 border-b border-slate-700 bg-slate-900/95 backdrop-blur flex items-center justify-between px-4 z-50 shrink-0 shadow-md">
                
                {/* Left: Navigation */}
                <button onClick={onBack} className="text-slate-400 hover:text-white mr-4">
                    <Icon name="arrow-left" size={24} />
                </button>

                {/* Center: THE DETACHED TOOLBAR (Quill fills this div) */}
                <div id={TOOLBAR_ID} className="flex-1 flex justify-center items-center ql-toolbar ql-snow z-[100]">
                    {/* Quill will inject buttons here. We provide the skeleton structure matches modules.toolbar */}
                    <span className="ql-formats">
                        <select className="ql-header" defaultValue="">
                            <option value="1"></option>
                            <option value="2"></option>
                            <option value=""></option>
                            <option value=""></option>
                        </select>
                    </span>
                    <span className="ql-formats">
                        <button className="ql-bold"></button>
                        <button className="ql-italic"></button>
                        <button className="ql-underline"></button>
                        <button className="ql-strike"></button>
                    </span>
                    <span className="ql-formats">
                        <button className="ql-list" value="ordered"></button>
                        <button className="ql-list" value="bullet"></button>
                    </span>
                    <span className="ql-formats">
                        <button className="ql-link"></button>
                        <button className="ql-image"></button>
                    </span>
                     {/* Custom Buttons need specific classes matching handlers */}
                    <span className="ql-formats">
                        <button className="ql-aiSpark">
                            <Icon name="sparkles" size={16} />
                        </button>
                    </span>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3 ml-4">
                     {/* Sync Status */}
                     {(() => {
                        const statusMap = {
                            idle: { icon: 'cloud-off', color: 'text-slate-500' },
                            typing: { icon: 'pencil', color: 'text-amber-500' },
                            saving: { icon: 'loader', color: 'text-blue-500', anim: 'animate-spin' },
                            saved: { icon: 'check', color: 'text-green-500' }
                        };
                        const current = statusMap[syncStatus] || statusMap.idle;
                        return <Icon name={current.icon} size={18} className={`${current.color} ${current.anim || ''}`} />;
                    })()}

                    {/* --- CHANGES: Restore Granular Permission Dropdown Menu --- */}
                    <div className="relative" ref={permMenuRef}>
                        <button onClick={() => setShowPermMenu(!showPermMenu)} className={`p-2 rounded hover:bg-slate-800 transition-colors flex items-center gap-1 ${page.isPublic ? 'text-green-400' : (page.visibleTo?.length > 0 ? 'text-indigo-400' : 'text-red-400')}`}>
                            <Icon name={page.isPublic ? "globe" : (page.visibleTo?.length > 0 ? "users" : "lock")} size={20}/>
                        </button>

                        {showPermMenu && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-[1000] p-2 animate-in zoom-in-95 duration-100">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 px-2">Visible To...</h4>
                                
                                <div onClick={toggleVisibility} className="flex items-center justify-between p-2 rounded hover:bg-slate-700 cursor-pointer mb-2 border-b border-slate-700">
                                    <span className="text-sm font-bold text-white flex items-center gap-2"><Icon name="globe" size={14}/> <span>Everyone</span></span>
                                    {page.isPublic && <Icon name="check" size={16} className="text-green-500"/>}
                                </div>

                                <div className="space-y-1 max-h-60 overflow-y-auto custom-scroll">
                                    {players && players.length > 0 ? players.map(p => {
                                        const targetId = p.id; 
                                        const isSelected = page.visibleTo?.includes(targetId);
                                        
                                        return (
                                            <div key={p.id} onClick={() => toggleCharacterPermission(targetId)} className={`flex items-center justify-between p-2 rounded cursor-pointer ${isSelected ? 'bg-indigo-900/30 border border-indigo-500/30' : 'hover:bg-slate-700 border border-transparent'}`}>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded bg-slate-900 overflow-hidden shrink-0 border border-slate-700">
                                                        {p.image ? <img src={p.image} className="w-full h-full object-cover"/> : <div className="flex items-center justify-center h-full text-[10px] text-slate-500 font-bold">{p.name[0]}</div>}
                                                    </div>
                                                    <span className="text-sm text-slate-200 font-bold truncate">{p.name}</span>
                                                </div>
                                                {isSelected && <Icon name="check" size={14} className="text-indigo-400 shrink-0"/>}
                                            </div>
                                        );
                                    }) : <div className="p-4 text-center text-xs text-slate-500 italic">No characters found.</div>}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* --- END OF CHANGES --- */}
                    
                    <button onClick={() => onDelete(page.id)} className="text-slate-500 hover:text-red-500 p-2 rounded hover:bg-slate-800 transition-colors">
                        <Icon name="trash-2" size={20}/>
                    </button>
                </div>
            </div>

            {/* THE VIEWPORT: This is where the paper floats */}
            <div className="desk-viewport custom-scroll">
                <div className="journal-sheet">
                    {/* The Title sits ON the paper now */}
                    <input 
                        type="text"
                        value={page.title}
                        onChange={(e) => onSave(page.id, { ...page, title: e.target.value })}
                        placeholder="SESSION TITLE"
                        className="journal-title-input"
                    />

                    <ReactQuill 
                        ref={quillRef} 
// --- 2 lines after changes ---
                        theme="snow" 
                        value={localContent} 
                        onChange={handleChange} 
                        modules={modules} 
                        className="h-full" 
                    />
                </div>
            </div>
        </div>
    );
};

export default JournalPageEditor;