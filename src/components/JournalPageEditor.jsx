import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import QuillCursors from 'quill-cursors';
import 'react-quill-new/dist/quill.snow.css';
import 'quill-mention/dist/quill.mention.css';

import { useToast } from './ToastProvider'; 
import Icon from './Icon';
import { resolveChunkedHtml, storeChunkedMap } from '../utils/storageUtils';
import { compressImage } from '../utils/imageCompressor';
import { rtdb } from '../firebase';
import { ref as dbRef, onValue, set, onDisconnect, remove } from 'firebase/database';

Quill.register('modules/cursors', QuillCursors);

const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

const JournalPageEditor = ({ 
    page, onSave, onDelete, onBack, aiHelper,
    isDm, players = [], npcs = [], locations = [], onEntitySelect, userId, campaignCode
}) => {
    const [localContent, setLocalContent] = useState(page.content || "");
    const [resolvedContent, setResolvedContent] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [syncStatus, setSyncStatus] = useState("idle");
    const [aiWorking, setAiWorking] = useState(false);
    const [toolbarExpanded, setToolbarExpanded] = useState(false);
    const toast = useToast();
    const quillRef = useRef(null);
    const debounceRef = useRef(null);
    const lastLoadedPageRef = useRef(null);
    
    const [showPermMenu, setShowPermMenu] = useState(false);
    const permMenuRef = useRef(null);
    
    const [zoom, setZoom] = useState(1);

    const me = useMemo(() => players.find(p => String(p.ownerId) === String(userId)) || { name: 'Player' }, [players, userId]);
    const myColor = useMemo(() => stringToColor(userId || 'anon'), [userId]);

    const adjustZoom = (delta) => {
        setZoom(prev => {
            const newZoom = Math.max(0.5, Math.min(2.0, prev + delta));
            return parseFloat(newZoom.toFixed(1));
        });
    };
    
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

    const TOOLBAR_ID = "journal-toolbar-container";

    // Load initial content or live updates when NOT editing
    useEffect(() => {
        const resolve = async () => {
            if (page.content !== lastLoadedPageRef.current?.content || page.id !== lastLoadedPageRef.current?.id) {
                lastLoadedPageRef.current = { id: page.id, content: page.content };
                // Update resolved content, which feeds the read-only view seamlessly
                if (page.content) {
                    const html = await resolveChunkedHtml(page.content);
                    setResolvedContent(html);
                    if (!isEditing) setLocalContent(html); // Keep local in sync if we aren't editing
                } else {
                    setResolvedContent("");
                    if (!isEditing) setLocalContent("");
                }
            }
        };
        resolve();
    }, [page.id, page.content, isEditing]);

    // Live Cursor Tracking
    useEffect(() => {
        if (!campaignCode || !userId || !page.id || !quillRef.current) return;

        const editor = quillRef.current.getEditor();
        const cursorsModule = editor.getModule('cursors');
        if (!cursorsModule) return;

        const cursorsRef = dbRef(rtdb, `journal_cursors/${campaignCode}/${page.id}`);
        const myCursorRef = dbRef(rtdb, `journal_cursors/${campaignCode}/${page.id}/${userId}`);

        const onSelectionChange = (range) => {
            if (range) {
                set(myCursorRef, { range, name: me.name, color: myColor, timestamp: Date.now() });
            } else {
                remove(myCursorRef).catch(() => {});
            }
        };
        
        // Listen to cursor movement
        editor.on('selection-change', onSelectionChange);
        
        // Ensure cleanup if disconnected abruptly
        onDisconnect(myCursorRef).remove();

        const unsub = onValue(cursorsRef, (snapshot) => {
            const val = snapshot.val() || {};
            const activeIds = Object.keys(val);

            Object.entries(val).forEach(([uid, data]) => {
                if (uid === userId) return;
                
                try {
                    const existingCursors = cursorsModule.cursors();
                    if (!existingCursors.some(c => c.id === uid)) {
                        cursorsModule.createCursor(uid, data.name, data.color);
                    }
                    if (data.range) {
                        cursorsModule.moveCursor(uid, data.range);
                    }
                } catch (err) {
                    console.warn("Cursor sync warning:", err);
                }
            });

            const existingCursors = cursorsModule.cursors();
            existingCursors.forEach(cursor => {
                if (!activeIds.includes(cursor.id) && cursor.id !== userId) {
                    cursorsModule.removeCursor(cursor.id);
                }
            });
        });

        return () => {
            editor.off('selection-change', onSelectionChange);
            unsub();
            remove(myCursorRef).catch(() => {});
        };
    }, [campaignCode, userId, page.id, me.name, myColor]);

    const handleChange = (content, delta, source, editor) => {
        if (source !== 'user' || !isEditing) return; 
        if (!editor) return;

        setLocalContent(content); 
        setSyncStatus("typing");
        
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setSyncStatus("saving");
            onSave(page.id, { ...page, content: content });
            setTimeout(() => {
                setSyncStatus("saved");
                setTimeout(() => setSyncStatus("idle"), 2000);
            }, 500);
        }, 700);
    };

    const toggleVisibility = () => { 
        onSave(page.id, { ...page, isPublic: !page.isPublic }); 
    };

    const handleImageUpload = () => {
        if (!quillRef.current || !isEditing) return;
        const editor = quillRef.current.getEditor();
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
                
                const range = editor.getSelection(true);
                editor.insertEmbed(range.index, 'chunkedImage', chunkedId, 'user');
                editor.setSelection(range.index + 1, 'silent');
            } catch (err) {
                console.error(err);
                toast("Image insertion failed", "error");
            }
        };
    };

    const insertDynamicTable = () => {
        if (!isEditing) return;
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
        if (!isEditing) return;
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
            handleChange(quill.root.innerHTML, null, 'user', quill);
        } else {
            toast("Cursor must be inside a table row to delete it.", "warning");
        }
    };

    const deleteCol = () => {
        if (!isEditing) return;
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
            const colIndex = Array.from(tr.children).indexOf(td);
            
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                if (row.children[colIndex]) row.children[colIndex].remove();
            });
            handleChange(quill.root.innerHTML, null, 'user', quill);
        } else {
            toast("Cursor must be inside a table cell to delete the column.", "warning");
        }
    };

    const resizeImage = () => {
        if (!isEditing) return;
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;

        const [leaf] = quill.getLeaf(range.index);
        let img = null;

        if (leaf.domNode.tagName === 'IMG') img = leaf.domNode;
        else if (leaf.domNode.previousSibling && leaf.domNode.previousSibling.tagName === 'IMG') {
            img = leaf.domNode.previousSibling;
        }

        if (img) {
            const currentWidth = img.style.width || "100%";
            const newWidth = prompt("Enter new width (e.g., '50%', '300px'):", currentWidth);
            if (newWidth) {
                img.style.width = newWidth;
                handleChange(quill.root.innerHTML, null, 'user', quill);
            }
        } else {
            toast("Please select an image to resize.", "warning");
        }
    };

    const handleAiSpark = async () => {
        if(aiWorking || !aiHelper || !isEditing) return;
        setAiWorking(true);
        // Provide logic if any AI spark integration exists
        setAiWorking(false);
    };

    const dataRef = useRef({ players, npcs, locations, isDm, onEntitySelect });

    useEffect(() => {
        dataRef.current = { players, npcs, locations, isDm, onEntitySelect };
    }, [players, npcs, locations, isDm, onEntitySelect]);

    const modules = useMemo(() => ({
        toolbar: {
            container: `#${TOOLBAR_ID}`,
            handlers: {
                'image': handleImageUpload,
                'tableInsert': insertDynamicTable,
                'tableRowDelete': deleteRow,
                'tableColDelete': deleteCol,
                'imageResize': resizeImage,
                'aiSpark': handleAiSpark
            }
        },
        cursors: true,
        history: {
            delay: 1000,
            maxStack: 500,
            userOnly: true
        },
        mention: {
            allowedChars: /^[A-Za-z\sÅÄÖåäö]*$/,
            mentionDenotationChars: ["@"],
            source: (searchTerm, renderList, mentionChar) => {
                const { players, npcs, locations, isDm } = dataRef.current;
                
                const values = [
                    ...players.map(p => ({ id: p.id, value: p.name, type: 'player', icon: 'user' })),
                    ...npcs.filter(n => isDm || !n.isHidden).map(n => ({ id: n.id, value: n.name, type: 'npc', icon: 'skull' })),
                    ...locations.filter(l => isDm || !l.isHidden).map(l => ({ id: l.id, value: l.name, type: 'location', icon: 'map-pin' }))
                ];
                if (searchTerm.length === 0) { renderList(values, searchTerm); } 
                else {
                    const matches = values.filter(item => item.value.toLowerCase().includes(searchTerm.toLowerCase()));
                    renderList(matches, searchTerm);
                }
            },
            renderItem: (item) => `<span><i class="vtt-mention-icon" data-icon="${item.icon}"></i>${item.value}</span>`,
            onSelect: (item, insertItem) => { 
                insertItem(item); 
                if (dataRef.current.onEntitySelect) dataRef.current.onEntitySelect(item.type, item.id); 
            }
        }
    }), []);

    return (
        <div className="infinite-desk">
            <div className={`border-b border-slate-700 bg-slate-900/95 backdrop-blur flex flex-col justify-center px-4 z-50 shrink-0 shadow-md transition-all duration-300 ${toolbarExpanded ? 'h-28' : 'h-16'}`}>
                <style>{`
                    #${TOOLBAR_ID} {
                        display: flex !important;
                        align-items-center;
                        border: none !important;
                        scrollbar-width: none;
                        -ms-overflow-style: none;
                    }
                    #${TOOLBAR_ID}.collapsed {
                        flex-wrap: nowrap !important;
                        overflow-x: auto !important;
                    }
                    #${TOOLBAR_ID}::-webkit-scrollbar { display: none; }
                    #${TOOLBAR_ID} .ql-formats {
                        display: flex !important;
                        flex-shrink: 0 !important;
                        margin-right: 8px !important;
                    }
                `}</style>
                
                <div className="flex items-center justify-between w-full">
                    <button onClick={onBack} className="text-slate-400 hover:text-white mr-2 shrink-0">
                        <Icon name="arrow-left" size={24} />
                    </button>

                    <div id={TOOLBAR_ID} className={`flex-1 ql-toolbar ql-snow px-2 ${toolbarExpanded ? 'flex-wrap' : 'collapsed'} ${!isEditing ? 'opacity-30 pointer-events-none' : ''}`}>
                        <span className="ql-formats">
                            <select className="ql-header" defaultValue="">
                                <option value="1"></option>
                                <option value="2"></option>
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
                            <select className="ql-color"></select>
                            <select className="ql-background"></select>
                        </span>
                        <span className="ql-formats">
                            <button className="ql-list" value="ordered"></button>
                            <button className="ql-list" value="bullet"></button>
                        </span>
                        <span className="ql-formats">
                            <button className="ql-link"></button>
                            <button className="ql-image"></button>
                        </span>
                        <span className="ql-formats">
                            <button className="ql-aiSpark">
                                <Icon name="sparkles" size={16} />
                            </button>
                        </span>
                    </div>

                    <div className="flex items-center gap-1 md:gap-3 ml-2 shrink-0">
                        <button 
                            onClick={() => setIsEditing(!isEditing)} 
                            className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-2 transition-colors ${isEditing ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
                            title={isEditing ? "Stop Editing" : "Edit Page"}
                        >
                            {isEditing ? <><Icon name="eye" size={14}/> <span>Viewing</span></> : <><Icon name="pencil" size={14}/> <span>Edit</span></>}
                        </button>

                        <button onClick={() => setToolbarExpanded(!toolbarExpanded)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                            <Icon name={toolbarExpanded ? "chevron-up" : "more-horizontal"} size={20} />
                        </button>

                        <div className="flex items-center bg-slate-800 rounded border border-slate-700">
                            <button onClick={() => adjustZoom(-0.1)} className="p-1 hover:text-white text-slate-400 border-r border-slate-700">
                                <Icon name="minus" size={12}/>
                            </button>
                            <span className="text-[10px] w-8 text-center font-mono text-slate-300">{Math.round(zoom * 100)}%</span>
                            <button onClick={() => adjustZoom(0.1)} className="p-1 hover:text-white text-slate-400 border-l border-slate-700">
                                <Icon name="plus" size={12}/>
                            </button>
                        </div>

                        {(() => {
                            const statusMap = {
                                idle: { icon: 'cloud-off', color: 'text-slate-500' },
                                typing: { icon: 'pencil', color: 'text-amber-500' },
                                saving: { icon: 'loader', color: 'text-blue-500', anim: 'animate-spin' },
                                saved: { icon: 'check', color: 'text-green-500' }
                            };
                            const current = statusMap[syncStatus] || statusMap.idle;
                            return <div className="hidden sm:block"><Icon name={current.icon} size={18} className={`${current.color} ${current.anim || ''}`} /></div>;
                        })()}

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
                        
                        <button onClick={() => onDelete(page.id)} className="text-slate-500 hover:text-red-500 p-2 rounded hover:bg-slate-800 transition-colors">
                            <Icon name="trash-2" size={20}/>
                        </button>
                    </div>
                </div>
            </div>

            <div className="desk-viewport custom-scroll">
                <div 
                    className="journal-sheet transition-transform duration-200 ease-out"
                    style={{ 
                        transform: `scale(${zoom})`, 
                        transformOrigin: 'top center',
                        marginTop: '2rem'
                    }}
                >
                    <input 
                        type="text"
                        value={page.title}
                        onChange={(e) => onSave(page.id, { ...page, title: e.target.value })}
                        placeholder="SESSION TITLE"
                        className="journal-title-input"
                        readOnly={!isEditing}
                    />
                    
                    <ReactQuill 
                        ref={quillRef} 
                        theme="snow"
                        value={localContent}
                        readOnly={!isEditing}
                        onChange={handleChange} 
                        modules={modules} 
                        className={`flex-1 ${!isEditing ? 'journal-readonly' : ''}`}
                    />
                </div>
            </div>
        </div>
    );
};

export default JournalPageEditor;