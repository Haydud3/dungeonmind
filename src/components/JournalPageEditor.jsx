import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import QuillCursors from 'quill-cursors';
import 'react-quill-new/dist/quill.snow.css';
import 'quill-mention/dist/quill.mention.css';

import { useToast } from './ToastProvider';
import { useDialog } from './DialogProvider';
import Icon from './Icon';
import { resolveChunkedHtml, storeChunkedMap, retrieveChunkedMap } from '../utils/storageUtils';
import { compressImage } from '../utils/imageCompressor';
import { rtdb } from '../firebase';
import { ref as dbRef, onValue, set, onDisconnect, remove } from 'firebase/database';

Quill.register('modules/cursors', QuillCursors);

// Register ChunkedImage Blot so chunked images render seamlessly inside Quill
const BlockEmbed = Quill.import('blots/block/embed');
class ChunkedImageBlot extends BlockEmbed {
    static create(value) {
        let node = super.create(value);
        if (typeof value === 'string' && value.startsWith('chunked:')) {
            node.setAttribute('data-chunked-src', value);
            node.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
            retrieveChunkedMap(value).then(base64 => {
                if (node && base64) node.setAttribute('src', base64);
            });
        } else if (typeof value === 'string') {
            node.setAttribute('src', value);
        }
        return node;
    }
    static value(node) {
        return node.getAttribute('data-chunked-src') || node.getAttribute('src');
    }
}
ChunkedImageBlot.blotName = 'chunkedImage';
ChunkedImageBlot.tagName = 'img';
Quill.register(ChunkedImageBlot, true);

const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

export const PAPER_THEMES = [
    { id: 'slate', name: 'Dark Slate', desc: 'Midnight slate, high contrast text', class: 'journal-sheet-slate', dot: 'bg-slate-400' },
    { id: 'parchment', name: 'Aged Parchment', desc: 'Antique scroll, warm sepia ink', class: 'journal-sheet-parchment', dot: 'bg-amber-600' },
    { id: 'grimoire', name: 'Arcane Grimoire', desc: 'Deep violet, mystic celestial tones', class: 'journal-sheet-grimoire', dot: 'bg-purple-500' }
];

const JournalPageEditor = ({
    page,
    onSave,
    onDelete,
    onBack,
    isDm,
    players = [],
    npcs = [],
    locations = [],
    onEntitySelect,
    userId,
    campaignCode,
    assignments = {},
    isSidebar = false,
    onClose
}) => {
    const [pageTitle, setPageTitle] = useState(page.title || 'Untitled Entry');
    const [category, setCategory] = useState(page.category || 'general');
    const [theme, setTheme] = useState(page.theme || 'slate');
    const [isPinned, setIsPinned] = useState(page.isPinned || false);
    const [tags, setTags] = useState(page.tags || []);
    const [newTagInput, setNewTagInput] = useState('');
    const [showTagInput, setShowTagInput] = useState(false);

    const [localContent, setLocalContent] = useState(page.content || "");
    const [isEditing, setIsEditing] = useState(false);
    const [syncStatus, setSyncStatus] = useState("idle");
    const [activeTypers, setActiveTypers] = useState([]);
    
    // Dropdown UI states
    const [showPermMenu, setShowPermMenu] = useState(false);
    const [showTableMenu, setShowTableMenu] = useState(false);
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const [showCategoryMenu, setShowCategoryMenu] = useState(false);

    const permMenuRef = useRef(null);
    const tableMenuRef = useRef(null);
    const themeMenuRef = useRef(null);
    const categoryMenuRef = useRef(null);

    const sessionId = useMemo(() => Math.random().toString(36).substr(2, 9), []);
    const toast = useToast();
    const dialog = useDialog();
    const quillRef = useRef(null);
    const debounceRef = useRef(null);
    const lastLoadedPageRef = useRef(null);
    
    const [zoom, setZoom] = useState(1);

    const me = useMemo(() => {
        if (isDm) return { name: 'DM' };
        const assignedCharId = assignments[userId];
        const assignedChar = assignedCharId ? players.find(p => String(p.id) === String(assignedCharId)) : null;
        if (assignedChar) return assignedChar;
        return players.find(p => String(p.ownerId) === String(userId)) || { name: 'Player' };
    }, [players, userId, isDm, assignments]);

    const myColor = useMemo(() => stringToColor(userId || 'anon'), [userId]);

    const adjustZoom = (delta) => {
        setZoom(prev => {
            const newZoom = Math.max(0.6, Math.min(1.8, prev + delta));
            return parseFloat(newZoom.toFixed(1));
        });
    };

    // Close open menus and Quill dropdowns on outside click or item select
    useEffect(() => {
        const closeExpandedQuillPickers = (exceptElement = null) => {
            document.querySelectorAll('#journal-toolbar-container .ql-picker.ql-expanded').forEach(picker => {
                if (exceptElement && picker.contains(exceptElement)) return;
                picker.classList.remove('ql-expanded');
                picker.querySelector('.ql-picker-label')?.setAttribute('aria-expanded', 'false');
                picker.querySelector('.ql-picker-options')?.setAttribute('aria-hidden', 'true');
            });
        };

        const handleClickOutside = (event) => {
            if (permMenuRef.current && !permMenuRef.current.contains(event.target)) setShowPermMenu(false);
            if (tableMenuRef.current && !tableMenuRef.current.contains(event.target)) setShowTableMenu(false);
            if (themeMenuRef.current && !themeMenuRef.current.contains(event.target)) setShowThemeMenu(false);
            if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target)) setShowCategoryMenu(false);

            // When a color swatch or picker item is selected, close the picker
            const pickerItem = event.target.closest('.ql-picker-item');
            if (pickerItem) {
                setTimeout(() => closeExpandedQuillPickers(), 30);
                return;
            }

            // Close pickers if clicking outside the currently active picker
            const activePicker = event.target.closest('.ql-picker');
            closeExpandedQuillPickers(activePicker);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setShowPermMenu(false);
                setShowTableMenu(false);
                setShowThemeMenu(false);
                setShowCategoryMenu(false);
                closeExpandedQuillPickers();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const TOOLBAR_ID = "journal-toolbar-container";

    // Keep page metadata in local state when page prop updates
    useEffect(() => {
        if (page.id !== lastLoadedPageRef.current?.id) {
            setPageTitle(page.title || 'Untitled Entry');
            setCategory(page.category || 'general');
            setTheme(page.theme || 'slate');
            setIsPinned(page.isPinned || false);
            setTags(page.tags || []);
        }
    }, [page.id, page.title, page.category, page.theme, page.isPinned, page.tags]);

    // Load initial content or live updates when NOT editing
    useEffect(() => {
        if (page.content !== lastLoadedPageRef.current?.content || page.id !== lastLoadedPageRef.current?.id) {
            lastLoadedPageRef.current = { id: page.id, content: page.content };
            if (!isEditing) {
                setLocalContent(page.content || "");
            }
        }
    }, [page.id, page.content, isEditing]);

    // Save helper to persist current metadata + content to Firestore
    const persistPageData = (overrides = {}) => {
        const updated = {
            ...page,
            title: pageTitle,
            category,
            theme,
            isPinned,
            tags,
            content: localContent,
            updatedAt: Date.now(),
            ...overrides
        };
        onSave(page.id, updated);
        return updated;
    };

    // Live Draft Sync
    useEffect(() => {
        if (!campaignCode || !page.id) return;
        const draftRef = dbRef(rtdb, `live_drags/journal_${campaignCode}_${page.id}/_draft`);
        const unsub = onValue(draftRef, (snapshot) => {
            const data = snapshot.val();
            if (data && data.content && data.lastUpdatedBy !== sessionId) {
                if (data.delta && quillRef.current) {
                    const editor = quillRef.current.getEditor();
                    editor.setContents(data.delta, 'silent');
                }
                setLocalContent(data.content);
                if (quillRef.current) {
                    const cursorsModule = quillRef.current.getEditor()?.getModule('cursors');
                    if (cursorsModule) setTimeout(() => cursorsModule.update(), 50);
                }
            }
        });
        return () => unsub();
    }, [campaignCode, page.id, sessionId]);

    // Live Cursor & Presence Tracking
    useEffect(() => {
        if (!campaignCode || !userId || !page.id || !quillRef.current) return;

        const timer = setTimeout(() => {
            const editor = quillRef.current?.getEditor();
            if (!editor) return;
            const cursorsModule = editor.getModule('cursors');
            if (!cursorsModule) return;

            const cursorsRef = dbRef(rtdb, `live_drags/journal_${campaignCode}_${page.id}`);
            const myCursorRef = dbRef(rtdb, `live_drags/journal_${campaignCode}_${page.id}/${sessionId}`);

            const handleSelectionChange = (range, oldRange, source) => {
                if (source !== 'user') return;
                if (range) {
                    set(myCursorRef, {
                        range: { index: range.index, length: range.length },
                        name: me.name || 'User',
                        color: myColor,
                        lastSeen: Date.now(),
                        isTyping: isEditing
                    }).catch(err => console.warn('cursor error', err));
                } else {
                    remove(myCursorRef).catch(() => {});
                }
            };

            editor.on('selection-change', handleSelectionChange);
            onDisconnect(myCursorRef).remove();

            const unsub = onValue(cursorsRef, (snapshot) => {
                const data = snapshot.val();
                if (!data) return;

                const typers = [];
                Object.entries(data).forEach(([sId, val]) => {
                    if (sId.startsWith('_') || sId === sessionId) return;
                    if (val && val.range) {
                        try {
                            cursorsModule.createCursor(sId, val.name, val.color);
                            cursorsModule.moveCursor(sId, val.range);
                            if (val.isTyping) {
                                typers.push({ id: sId, name: val.name, color: val.color });
                            }
                        } catch (e) {}
                    } else {
                        try { cursorsModule.removeCursor(sId); } catch (e) {}
                    }
                });
                setActiveTypers(typers);
            });

            return () => {
                editor.off('selection-change', handleSelectionChange);
                remove(myCursorRef).catch(() => {});
                unsub();
            };
        }, 100);

        return () => clearTimeout(timer);
    }, [campaignCode, userId, page.id, me.name, myColor, isEditing, sessionId]);

    const handleChange = (content, delta, source, editor) => {
        if (source !== 'user' || !isEditing) return;
        if (!editor) return;

        setLocalContent(content);
        setSyncStatus("typing");

        if (campaignCode && page.id) {
            const draftRef = dbRef(rtdb, `live_drags/journal_${campaignCode}_${page.id}/_draft`);
            let safeDelta = null;
            try { safeDelta = JSON.parse(JSON.stringify(editor.getContents())); } catch (e) {}

            set(draftRef, {
                content,
                delta: safeDelta,
                lastUpdatedBy: sessionId,
                timestamp: Date.now()
            }).catch(e => console.warn('draft sync error', e));
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setSyncStatus("saving");
            persistPageData({ content });
            setTimeout(() => {
                setSyncStatus("saved");
                setTimeout(() => setSyncStatus("idle"), 2000);
            }, 400);
        }, 2000);
    };

    const toggleEditMode = () => {
        if (isEditing) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            persistPageData();
            setSyncStatus("saved");
            setTimeout(() => setSyncStatus("idle"), 2000);
        }
        setIsEditing(!isEditing);
    };

    const handleTitleChange = (val) => {
        setPageTitle(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            persistPageData({ title: val });
        }, 1000);
    };

    const handleCategoryChange = (newCat) => {
        setCategory(newCat);
        setShowCategoryMenu(false);
        persistPageData({ category: newCat });
        toast(`Category changed to ${newCat}`, 'info');
    };

    const handleThemeChange = (newTheme) => {
        setTheme(newTheme);
        setShowThemeMenu(false);
        persistPageData({ theme: newTheme });
        toast(`Theme set to ${newTheme}`, 'info');
    };

    const handleTogglePin = () => {
        const next = !isPinned;
        setIsPinned(next);
        persistPageData({ isPinned: next });
        toast(next ? 'Note pinned' : 'Note unpinned', 'info');
    };

    const handleAddTag = () => {
        const clean = newTagInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (clean && !tags.includes(clean)) {
            const next = [...tags, clean];
            setTags(next);
            persistPageData({ tags: next });
            setNewTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        const next = tags.filter(t => t !== tagToRemove);
        setTags(next);
        persistPageData({ tags: next });
    };

    const toggleVisibility = () => {
        const updatedIsPublic = !page.isPublic;
        persistPageData({ isPublic: updatedIsPublic });
    };

    const toggleCharacterPermission = (targetCharId) => {
        const currentList = page.visibleTo || [];
        let newList;
        if (currentList.includes(targetCharId)) {
            newList = currentList.filter(id => id !== targetCharId);
        } else {
            newList = [...currentList, targetCharId];
        }
        persistPageData({ visibleTo: newList });
    };

    // Images
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
                toast("Compressing and attaching image...", "info");
                const compressedBase64 = await compressImage(file, 900);
                const chunkedId = await storeChunkedMap(compressedBase64, `journal_img_${file.name}`);

                const range = editor.getSelection(true);
                editor.insertEmbed(range.index, 'chunkedImage', chunkedId, 'user');
                editor.setSelection(range.index + 1, 'silent');
                toast("Image inserted", "success");
            } catch (err) {
                console.error(err);
                toast("Image insertion failed", "error");
            }
        };
    };

    const resizeImage = async () => {
        if (!isEditing || !quillRef.current) return;
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
            const newWidth = await dialog.prompt("Enter new width (e.g., '60%', '400px'):", currentWidth);
            if (newWidth) {
                img.style.width = newWidth;
                handleChange(quill.root.innerHTML, null, 'user', quill);
                toast(`Image resized to ${newWidth}`, 'info');
            }
        } else {
            toast("Please click directly on an image first to select it.", "warning");
        }
    };

    // Table Tools
    const insertTablePreset = (rows, cols) => {
        if (!isEditing || !quillRef.current) return;
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);

        let tableHTML = `<table style="width:100%; border-collapse:collapse; margin:12px 0; border:1px solid #475569;"><thead><tr style="background:#334155; color:#f8fafc;">`;
        for (let c = 0; c < cols; c++) {
            tableHTML += `<th style="border:1px solid #475569; padding:8px 10px; text-align:left; font-weight:600;">Header ${c + 1}</th>`;
        }
        tableHTML += `</tr></thead><tbody>`;

        for (let r = 0; r < rows - 1; r++) {
            tableHTML += `<tr>`;
            for (let c = 0; c < cols; c++) {
                tableHTML += `<td style="border:1px solid #475569; padding:8px 10px;">...</td>`;
            }
            tableHTML += `</tr>`;
        }
        tableHTML += `</tbody></table><p><br/></p>`;

        quill.clipboard.dangerouslyPasteHTML(range ? range.index : 0, tableHTML);
        setShowTableMenu(false);
        toast(`Inserted ${rows}x${cols} table`, 'success');
    };

    const insertCustomTable = async () => {
        if (!isEditing) return;
        const rowsStr = await dialog.prompt("How many rows?", "3");
        const colsStr = await dialog.prompt("How many columns?", "3");
        const rows = parseInt(rowsStr);
        const cols = parseInt(colsStr);
        if (rows > 0 && cols > 0) {
            insertTablePreset(rows, cols);
        }
    };

    const addTableRow = (below = true) => {
        if (!isEditing || !quillRef.current) return;
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;
        const [leaf] = quill.getLeaf(range.index);
        let tr = leaf?.domNode;
        while (tr && tr.tagName !== 'TR' && tr !== quill.root) {
            tr = tr.parentNode;
        }

        if (tr && tr.tagName === 'TR') {
            const colCount = tr.children.length;
            const newTr = document.createElement('tr');
            for (let i = 0; i < colCount; i++) {
                const td = document.createElement('td');
                td.style.border = '1px solid #475569';
                td.style.padding = '8px 10px';
                td.innerHTML = '&nbsp;';
                newTr.appendChild(td);
            }
            if (below) {
                tr.parentNode.insertBefore(newTr, tr.nextSibling);
            } else {
                tr.parentNode.insertBefore(newTr, tr);
            }
            handleChange(quill.root.innerHTML, null, 'user', quill);
            setShowTableMenu(false);
            toast('Row added', 'info');
        } else {
            toast('Place cursor inside a table row first.', 'warning');
        }
    };

    const addTableCol = (right = true) => {
        if (!isEditing || !quillRef.current) return;
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;
        const [leaf] = quill.getLeaf(range.index);
        let td = leaf?.domNode;
        while (td && td.tagName !== 'TD' && td.tagName !== 'TH' && td !== quill.root) {
            td = td.parentNode;
        }

        if (td && (td.tagName === 'TD' || td.tagName === 'TH')) {
            const tr = td.parentNode;
            const table = tr.closest('table');
            const colIndex = Array.from(tr.children).indexOf(td);

            const allRows = table.querySelectorAll('tr');
            allRows.forEach(row => {
                const isHeader = row.parentElement.tagName === 'THEAD';
                const cell = document.createElement(isHeader ? 'th' : 'td');
                cell.style.border = '1px solid #475569';
                cell.style.padding = '8px 10px';
                cell.innerHTML = isHeader ? 'Header' : '&nbsp;';
                const target = row.children[colIndex];
                if (right) {
                    row.insertBefore(cell, target ? target.nextSibling : null);
                } else {
                    row.insertBefore(cell, target);
                }
            });
            handleChange(quill.root.innerHTML, null, 'user', quill);
            setShowTableMenu(false);
            toast('Column added', 'info');
        } else {
            toast('Place cursor inside a table cell first.', 'warning');
        }
    };

    const deleteRow = () => {
        if (!isEditing || !quillRef.current) return;
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
            setShowTableMenu(false);
            toast("Row deleted", "info");
        } else {
            toast("Cursor must be inside a table row to delete it.", "warning");
        }
    };

    const deleteCol = () => {
        if (!isEditing || !quillRef.current) return;
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;
        const [leaf] = quill.getLeaf(range.index);

        let td = leaf.domNode;
        while (td && td.tagName !== 'TD' && td.tagName !== 'TH' && td !== quill.root) {
            td = td.parentNode;
        }

        if (td && (td.tagName === 'TD' || td.tagName === 'TH')) {
            const tr = td.parentNode;
            const table = tr.closest('table');
            const colIndex = Array.from(tr.children).indexOf(td);

            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                if (row.children[colIndex]) row.children[colIndex].remove();
            });
            handleChange(quill.root.innerHTML, null, 'user', quill);
            setShowTableMenu(false);
            toast("Column deleted", "info");
        } else {
            toast("Cursor must be inside a table cell to delete the column.", "warning");
        }
    };

    const dataRef = useRef({ players, npcs, locations, isDm, onEntitySelect });
    useEffect(() => {
        dataRef.current = { players, npcs, locations, isDm, onEntitySelect };
    }, [players, npcs, locations, isDm, onEntitySelect]);

    // Quill Modules Configuration (Clean, NO AI)
    const modules = useMemo(() => ({
        toolbar: {
            container: `#${TOOLBAR_ID}`,
            handlers: {
                'image': handleImageUpload
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
            source: (searchTerm, renderList) => {
                const { players, npcs, locations, isDm } = dataRef.current;
                const values = [
                    ...players.map(p => ({ id: p.id, value: p.name, type: 'player', icon: 'user' })),
                    ...npcs.filter(n => isDm || !n.isHidden).map(n => ({ id: n.id, value: n.name, type: 'npc', icon: 'skull' })),
                    ...locations.filter(l => isDm || !l.isHidden).map(l => ({ id: l.id, value: l.name, type: 'location', icon: 'map-pin' }))
                ];
                if (searchTerm.length === 0) {
                    renderList(values, searchTerm);
                } else {
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

    // Reading statistics
    const stats = useMemo(() => {
        const text = stripHtml(localContent);
        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
        const chars = text.length;
        const readTime = Math.max(1, Math.ceil(words / 200));
        return { words, chars, readTime };
    }, [localContent]);

    return (
        <div className="infinite-desk flex flex-col h-full bg-slate-950 select-none overflow-hidden relative">
            {/* Top HUD Toolbar - Note overflow: visible so Quill dropdowns float freely */}
            <div className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md flex flex-col justify-center px-3 sm:px-4 py-2 z-50 shrink-0 shadow-md gap-1.5" style={{ overflow: 'visible' }}>
                {/* Row 1: Navigation, Category, Pin, Actions & Window Controls */}
                <div className="flex items-center justify-between w-full gap-2" style={{ overflow: 'visible' }}>
                    {/* Left: Back button & Category */}
                    <div className="flex items-center gap-1.5 shrink-0" style={{ overflow: 'visible' }}>
                        <button
                            onClick={() => {
                                if (isEditing) {
                                    if (debounceRef.current) clearTimeout(debounceRef.current);
                                    persistPageData();
                                }
                                onBack();
                            }}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            title="Back to Journal Hub"
                        >
                            <Icon name="arrow-left" size={18} />
                        </button>

                        {/* Category Dropdown */}
                        <div className="relative" ref={categoryMenuRef}>
                            <button
                                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                                className="px-2 py-1 rounded-md text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 transition-colors shadow-sm"
                                title="Change Category"
                            >
                                <span className="capitalize">{category}</span>
                                <Icon name="chevron-down" size={11} className="text-slate-400" />
                            </button>

                            {showCategoryMenu && (
                                <div className="absolute top-full left-0 mt-1.5 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-[100000] animate-in zoom-in-95 duration-100">
                                    {['session', 'quest', 'npc', 'loot', 'general'].map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => handleCategoryChange(cat)}
                                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize flex items-center justify-between ${category === cat ? 'bg-amber-600/30 text-amber-300' : 'text-slate-300 hover:bg-slate-800'}`}
                                        >
                                            <span>{cat}</span>
                                            {category === cat && <Icon name="check" size={12} className="text-amber-400" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Pin Star Toggle */}
                        <button
                            onClick={handleTogglePin}
                            className={`p-1.5 rounded-lg transition-colors ${isPinned ? 'text-amber-400 bg-amber-950/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                            title={isPinned ? "Unpin entry" : "Pin entry to top"}
                        >
                            <Icon name="star" size={16} className={isPinned ? "fill-amber-400" : ""} />
                        </button>
                    </div>

                    {/* Right: Actions, Permissions, Delete, and Close */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0" style={{ overflow: 'visible' }}>
                        {/* Primary View / Edit Toggle Button */}
                        <button
                            onClick={toggleEditMode}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors shadow-sm ${isEditing ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}`}
                            title={isEditing ? "Done Editing (Save)" : "Enter Edit Mode"}
                        >
                            {isEditing ? (
                                <>
                                    <Icon name="eye" size={13} />
                                    <span>Viewing</span>
                                </>
                            ) : (
                                <>
                                    <Icon name="pencil" size={13} />
                                    <span>Edit</span>
                                </>
                            )}
                        </button>

                        {/* Paper Theme Picker */}
                        <div className="relative" ref={themeMenuRef}>
                            <button
                                onClick={() => setShowThemeMenu(!showThemeMenu)}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                title="Paper Theme"
                            >
                                <Icon name="palette" size={16} />
                            </button>

                            {showThemeMenu && (
                                <div className="absolute top-full right-0 mt-1.5 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-[100000] animate-in zoom-in-95 duration-100">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 tracking-wider">
                                        Paper Style
                                    </div>
                                    {PAPER_THEMES.map(th => (
                                        <button
                                            key={th.id}
                                            onClick={() => handleThemeChange(th.id)}
                                            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2.5 transition-colors ${theme === th.id ? 'bg-amber-600/20 text-amber-300' : 'hover:bg-slate-800 text-slate-200'}`}
                                        >
                                            <span className={`w-3 h-3 rounded-full shrink-0 ${th.dot}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold">{th.name}</div>
                                                <div className="text-[10px] text-slate-400 truncate">{th.desc}</div>
                                            </div>
                                            {theme === th.id && <Icon name="check" size={14} className="text-amber-400 shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Zoom Controls (hidden in sidebar mode or small screens) */}
                        {!isSidebar && (
                            <div className="hidden md:flex items-center bg-slate-800/80 rounded-lg border border-slate-700">
                                <button onClick={() => adjustZoom(-0.1)} className="p-1 hover:text-white text-slate-400 border-r border-slate-700">
                                    <Icon name="minus" size={11} />
                                </button>
                                <span className="text-[10px] w-8 text-center font-mono text-slate-300">{Math.round(zoom * 100)}%</span>
                                <button onClick={() => adjustZoom(0.1)} className="p-1 hover:text-white text-slate-400 border-l border-slate-700">
                                    <Icon name="plus" size={11} />
                                </button>
                            </div>
                        )}

                        {/* Cloud / Sync Status */}
                        {(() => {
                            const statusMap = {
                                idle: { icon: 'cloud', color: 'text-slate-500', title: 'Synced' },
                                typing: { icon: 'pencil', color: 'text-amber-500', title: 'Editing' },
                                saving: { icon: 'loader', color: 'text-blue-500', anim: 'animate-spin', title: 'Saving...' },
                                saved: { icon: 'check', color: 'text-emerald-400', title: 'Saved' }
                            };
                            const current = statusMap[syncStatus] || statusMap.idle;
                            return (
                                <div className="hidden sm:block" title={current.title}>
                                    <Icon name={current.icon} size={15} className={`${current.color} ${current.anim || ''}`} />
                                </div>
                            );
                        })()}

                        {/* Permissions Dropdown */}
                        <div className="relative" ref={permMenuRef}>
                            <button
                                onClick={() => setShowPermMenu(!showPermMenu)}
                                className={`p-1.5 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 ${page.isPublic ? 'text-emerald-400' : (page.visibleTo?.length > 0 ? 'text-indigo-400' : 'text-slate-400')}`}
                                title="Access Permissions"
                            >
                                <Icon name={page.isPublic ? "globe" : (page.visibleTo?.length > 0 ? "users" : "lock")} size={16} />
                            </button>

                            {showPermMenu && (
                                <div className="absolute top-full right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100000] p-3 animate-in zoom-in-95 duration-100">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Access Rights</h4>

                                    <div
                                        onClick={toggleVisibility}
                                        className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800 cursor-pointer mb-2 border border-slate-800"
                                    >
                                        <span className="text-xs font-semibold text-white flex items-center gap-2">
                                            <Icon name="globe" size={14} className="text-emerald-400" />
                                            <span>Everyone (Public)</span>
                                        </span>
                                        {page.isPublic && <Icon name="check" size={14} className="text-emerald-400" />}
                                    </div>

                                    <div className="text-[10px] font-bold text-slate-500 uppercase px-1 mb-1 tracking-wider">
                                        Specific Players
                                    </div>
                                    <div className="space-y-1 max-h-52 overflow-y-auto custom-scroll">
                                        {players && players.length > 0 ? players.map(p => {
                                            const targetId = p.id;
                                            const isSelected = page.visibleTo?.includes(targetId);

                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => toggleCharacterPermission(targetId)}
                                                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs ${isSelected ? 'bg-indigo-950/40 border border-indigo-500/40 text-indigo-200' : 'hover:bg-slate-800 text-slate-300 border border-transparent'}`}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <div className="w-5 h-5 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                                                            {p.image ? <img src={p.image} className="w-full h-full object-cover" alt="" /> : <div className="flex items-center justify-center h-full text-[9px] text-slate-400 font-bold">{p.name?.[0]}</div>}
                                                        </div>
                                                        <span className="font-semibold truncate">{p.name}</span>
                                                    </div>
                                                    {isSelected && <Icon name="check" size={13} className="text-indigo-400 shrink-0" />}
                                                </div>
                                            );
                                        }) : (
                                            <div className="p-3 text-center text-xs text-slate-500 italic">No player characters configured.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Delete Button */}
                        {(isDm || String(page.ownerId) === String(userId)) && (
                            <button
                                onClick={async () => {
                                    if (await dialog.confirm(`Permanently delete "${pageTitle}"?`, 'Delete Entry')) {
                                        onDelete(page.id);
                                        toast("Entry deleted", "warning");
                                    }
                                }}
                                className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Delete Entry"
                            >
                                <Icon name="trash-2" size={16} />
                            </button>
                        )}

                        {/* Close button for sidebar */}
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors ml-0.5"
                                title="Close Editor"
                            >
                                <Icon name="x" size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Row 2: Formatting Toolbar (Visible, Dropdowns float down freely) */}
                <div className={`flex items-center justify-between w-full gap-2 ${!isEditing ? 'opacity-35 pointer-events-none' : ''}`} style={{ overflow: 'visible' }}>
                    <div id={TOOLBAR_ID} className="ql-toolbar ql-snow flex items-center flex-wrap gap-1" style={{ overflow: 'visible', border: 'none', padding: 0 }}>
                        {/* Text Type Picker (Normal, Heading 1, Heading 2) */}
                        <span className="ql-formats">
                            <select className="ql-header" defaultValue="">
                                <option value="1"></option>
                                <option value="2"></option>
                                <option value=""></option>
                            </select>
                        </span>

                        {/* Text Formatting */}
                        <span className="ql-formats">
                            <button className="ql-bold"></button>
                            <button className="ql-italic"></button>
                            <button className="ql-underline"></button>
                            <button className="ql-strike"></button>
                        </span>

                        {/* Colors */}
                        <span className="ql-formats">
                            <select className="ql-color"></select>
                            <select className="ql-background"></select>
                        </span>

                        {/* Lists */}
                        <span className="ql-formats">
                            <button className="ql-list" value="ordered"></button>
                            <button className="ql-list" value="bullet"></button>
                        </span>

                        {/* Link & Image */}
                        <span className="ql-formats">
                            <button className="ql-link"></button>
                            <button className="ql-image"></button>
                        </span>

                        {/* Custom Extra Tools: Table Dropdown & Image Resize */}
                        <div className="relative inline-flex items-center gap-1 pl-1 border-l border-slate-700/80" ref={tableMenuRef} style={{ overflow: 'visible' }}>
                            <button
                                onClick={() => setShowTableMenu(!showTableMenu)}
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded flex items-center gap-0.5"
                                title="Insert Table"
                            >
                                <Icon name="table" size={16} />
                                <Icon name="chevron-down" size={10} />
                            </button>

                            {showTableMenu && isEditing && (
                                <div className="absolute top-full left-0 mt-1.5 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-[100000] animate-in zoom-in-95 duration-100">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 tracking-wider">
                                        Insert Table
                                    </div>
                                    <button
                                        onClick={() => insertTablePreset(2, 2)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                                    >
                                        <span>2x2 Table</span>
                                        <span className="text-[10px] text-slate-500 font-mono">2 cols</span>
                                    </button>
                                    <button
                                        onClick={() => insertTablePreset(3, 3)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                                    >
                                        <span>3x3 Table</span>
                                        <span className="text-[10px] text-slate-500 font-mono">3 cols</span>
                                    </button>
                                    <button
                                        onClick={() => insertTablePreset(4, 4)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                                    >
                                        <span>4x4 Table</span>
                                        <span className="text-[10px] text-slate-500 font-mono">4 cols</span>
                                    </button>
                                    <button
                                        onClick={insertCustomTable}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-amber-400 font-medium"
                                    >
                                        Custom Size...
                                    </button>

                                    <div className="h-px bg-slate-800 my-1.5" />
                                    <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 tracking-wider">
                                        Table Cursor Tools
                                    </div>
                                    <button
                                        onClick={() => addTableRow(true)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300"
                                    >
                                        + Add Row Below
                                    </button>
                                    <button
                                        onClick={() => addTableCol(true)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300"
                                    >
                                        + Add Column Right
                                    </button>
                                    <button
                                        onClick={deleteRow}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-red-950/40 text-red-400"
                                    >
                                        - Delete Row
                                    </button>
                                    <button
                                        onClick={deleteCol}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-red-950/40 text-red-400"
                                    >
                                        - Delete Column
                                    </button>
                                </div>
                            )}

                            {/* Image Resize button */}
                            <button
                                onClick={resizeImage}
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                                title="Resize Selected Image"
                            >
                                <Icon name="scaling" size={15} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row 3: Tags & Stats */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/70 text-xs">
                    <div className="flex items-center flex-wrap gap-1 flex-1 min-w-0">
                        <Icon name="tag" size={12} className="text-slate-400 shrink-0" />
                        {tags.map((tag, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px] border border-slate-700 font-mono"
                            >
                                #{tag}
                                {isEditing && (
                                    <button
                                        onClick={() => handleRemoveTag(tag)}
                                        className="hover:text-red-400 text-slate-500 ml-0.5"
                                        title="Remove tag"
                                    >
                                        <Icon name="x" size={9} />
                                    </button>
                                )}
                            </span>
                        ))}

                        {isEditing && (
                            showTagInput ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ',') {
                                                e.preventDefault();
                                                handleAddTag();
                                            } else if (e.key === 'Escape') {
                                                setShowTagInput(false);
                                            }
                                        }}
                                        placeholder="tag-name..."
                                        className="bg-slate-800 text-slate-200 border border-slate-700 rounded-md px-1.5 py-0.5 text-[10px] w-20 focus:outline-none focus:border-amber-500"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleAddTag}
                                        className="p-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[9px]"
                                    >
                                        <Icon name="check" size={10} />
                                    </button>
                                    <button
                                        onClick={() => setShowTagInput(false)}
                                        className="p-0.5 rounded hover:bg-slate-800 text-slate-400 text-[9px]"
                                    >
                                        <Icon name="x" size={10} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowTagInput(true)}
                                    className="text-[10px] text-slate-400 hover:text-amber-400 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-slate-800/80 transition-colors"
                                >
                                    <Icon name="plus" size={10} />
                                    <span>Tag</span>
                                </button>
                            )
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium shrink-0">
                        <span>{stats.words} words</span>
                        <span>•</span>
                        <span>~{stats.readTime} min read</span>
                    </div>
                </div>
            </div>

            {/* Document Viewport */}
            <div className={`desk-viewport flex-1 overflow-y-auto custom-scroll flex justify-center ${isSidebar ? 'sidebar-viewport p-0' : 'p-2 sm:p-6'}`}>
                <div
                    className={`journal-sheet ${isSidebar ? 'journal-sheet-sidebar' : ''} journal-sheet-${theme} transition-all duration-200 ease-out shadow-2xl flex flex-col`}
                    style={{
                        transform: !isSidebar ? `scale(${zoom})` : undefined,
                        transformOrigin: 'top center',
                        cursor: !isEditing ? 'text' : 'auto'
                    }}
                    onClick={() => {
                        if (!isEditing) setIsEditing(true);
                    }}
                >
                    {/* Top Sheet Header */}
                    <div className="p-3 sm:p-5 pb-2 border-b border-slate-700/60 flex flex-col gap-1.5">
                        <input
                            type="text"
                            value={pageTitle}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="DOCUMENT TITLE"
                            className="journal-title-input w-full bg-transparent border-none outline-none font-bold text-xl sm:text-3xl tracking-tight transition-colors"
                            readOnly={!isEditing}
                        />

                        {/* Active Collab Typers Banner */}
                        {activeTypers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {activeTypers.map(t => (
                                    <div
                                        key={t.id}
                                        className="text-[10px] px-2 py-0.5 rounded-full text-white flex items-center gap-1 shadow-md bg-opacity-90 backdrop-blur"
                                        style={{ backgroundColor: t.color }}
                                    >
                                        <Icon name="pencil" size={10} className="animate-bounce" />
                                        <span>{t.name} is writing...</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Rich Text Editor */}
                    <div className="flex-1 p-2 sm:p-5 pt-2">
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

                    {/* Bottom Document Status Bar */}
                    <div className="px-3 sm:p-4 py-2 border-t border-slate-700/40 text-[10px] text-slate-400 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span>{stats.words} words</span>
                            <span>({stats.chars} characters)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span>Last edited: {new Date(page.updatedAt || page.created || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JournalPageEditor;