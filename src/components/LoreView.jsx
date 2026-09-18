import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone'; 
import { 
    ingestPDF, 
    ingestText, 
    packLore, 
    retrieveContext, 
    buildMonsterExtractionPrompt, 
    buildChapterMonsterScanPrompt, 
    buildArchiveQAPrompt 
} from '../utils/loreEngine';
import Icon from './Icon';
import { useDialog } from './DialogProvider';
import { useToast } from './ToastProvider';
import { useNewCampaign } from '../contexts/NewCampaignProvider';

const LoreView = ({ aiHelper, role }) => {
    const dialog = useDialog();
    const toast = useToast();
    const context = useNewCampaign();
    if (!context) return null;

    const { 
        campaign: data, 
        loreChunks, 
        loreVolumes, 
        uploadLore, 
        deleteLoreDoc, 
        clearAllLore, 
        addCustomLoreEntry, 
        sendMessage, 
        saveJournalPage, 
        updateCampaign, 
        user 
    } = context;

    // View Tabs: 'reader', 'forge', 'oracle'
    const [activeTab, setActiveTab] = useState('reader');

    // Tome Selection & Search
    const [activeTomeId, setActiveTomeId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [shelfFilter, setShelfFilter] = useState('all'); // 'all', 'sourcebooks', 'codex'
    const [selectedExcerpt, setSelectedExcerpt] = useState('');

    // Modals & Drawers
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showCodexModal, setShowCodexModal] = useState(false);
    const [showForgeModal, setShowForgeModal] = useState(false);

    // Processing & Progress
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatusText, setUploadStatusText] = useState('');

    // AI Bestiary Forge State
    const [forgeInputText, setForgeInputText] = useState('');
    const [forgeInstruction, setForgeInstruction] = useState('');
    const [isForging, setIsForging] = useState(false);
    const [forgedMonster, setForgedMonster] = useState(null);
    const [scannedCreatures, setScannedCreatures] = useState([]);
    const [isScanningCreatures, setIsScanningCreatures] = useState(false);

    // AI Lore Oracle State
    const [oracleQuestion, setOracleQuestion] = useState('');
    const [oracleHistory, setOracleHistory] = useState([]);
    const [isConsultingOracle, setIsConsultingOracle] = useState(false);

    // Custom Codex Entry Form
    const [codexTitle, setCodexTitle] = useState('');
    const [codexCategory, setCodexCategory] = useState('World Lore');
    const [codexContent, setCodexContent] = useState('');

    const readerContentRef = useRef(null);

    // --- Compute Structured Tomes from Chunks and Volumes ---
    const tomes = useMemo(() => {
        const docMap = new Map();
        
        // 1. Volumes
        (loreVolumes || []).forEach(vol => {
            const title = vol.docTitle || vol.title || (vol.chunks?.[0]?.source) || (vol.chunks?.[0]?.docTitle) || 'Campaign Tome';
            const docId = vol.docId || title;
            if (!docMap.has(docId)) {
                docMap.set(docId, {
                    id: docId,
                    title: title,
                    type: vol.type || 'pdf_volume',
                    category: vol.category || (vol.type === 'custom_codex' ? 'Custom Codex' : 'Sourcebook'),
                    totalPages: vol.totalPages || 0,
                    pages: [],
                    timestamp: vol.timestamp || Date.now()
                });
            }
            const item = docMap.get(docId);
            if (vol.chunks) {
                vol.chunks.forEach(c => {
                    item.pages.push(c);
                });
            }
        });

        // 2. Loose Chunks (Backwards Compatibility)
        (loreChunks || []).forEach(c => {
            const title = c.docTitle || c.source || 'Campaign Tome';
            const docId = c.docId || title;
            if (!docMap.has(docId)) {
                docMap.set(docId, {
                    id: docId,
                    title: title,
                    type: c.category ? 'custom_codex' : 'pdf_volume',
                    category: c.category || 'Sourcebook',
                    totalPages: c.totalPages || 0,
                    pages: [],
                    timestamp: Date.now()
                });
            }
            const item = docMap.get(docId);
            if (!item.pages.some(p => p.id === c.id || (p.page === c.page && p.content === c.content))) {
                item.pages.push(c);
            }
        });

        // Sort pages in each doc
        const list = Array.from(docMap.values()).map(doc => {
            doc.pages.sort((a, b) => (a.page || 0) - (b.page || 0));
            if (!doc.totalPages || doc.totalPages < doc.pages.length) {
                doc.totalPages = doc.pages.length;
            }
            return doc;
        });

        return list;
    }, [loreVolumes, loreChunks]);

    // Active Tome
    const activeTome = useMemo(() => {
        if (activeTomeId) {
            const found = tomes.find(t => t.id === activeTomeId || t.title === activeTomeId);
            if (found) return found;
        }
        return tomes[0] || null;
    }, [tomes, activeTomeId]);

    // Ensure active page is within bounds
    useEffect(() => {
        if (activeTome) {
            if (currentPage > (activeTome.totalPages || activeTome.pages.length || 1)) {
                setCurrentPage(1);
            }
        }
    }, [activeTome, currentPage]);

    // Active Page Content
    const activePageData = useMemo(() => {
        if (!activeTome || !activeTome.pages || activeTome.pages.length === 0) return null;
        return activeTome.pages.find(p => p.page === currentPage) || activeTome.pages[currentPage - 1] || activeTome.pages[0];
    }, [activeTome, currentPage]);

    // Filtered Tomes for Shelf
    const filteredTomes = useMemo(() => {
        return tomes.filter(t => {
            if (shelfFilter === 'sourcebooks' && t.type === 'custom_codex') return false;
            if (shelfFilter === 'codex' && t.type !== 'custom_codex') return false;
            return true;
        });
    }, [tomes, shelfFilter]);

    // Search Results across all or active tome
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        const results = [];

        (loreChunks || []).forEach(chunk => {
            if (chunk.content && chunk.content.toLowerCase().includes(q)) {
                const tomeTitle = chunk.docTitle || chunk.source || 'Campaign Tome';
                results.push({
                    id: chunk.id,
                    docId: chunk.docId,
                    tomeTitle: tomeTitle,
                    page: chunk.page || 1,
                    content: chunk.content
                });
            }
        });

        return results.slice(0, 30);
    }, [loreChunks, searchQuery]);

    // Handle Text Selection in Reader
    const handleReaderMouseUp = () => {
        const sel = window.getSelection();
        if (sel && sel.toString().trim().length > 10) {
            setSelectedExcerpt(sel.toString().trim());
        }
    };

    // --- UPLOAD HANDLER (PDF & TXT) ---
    const processFile = async (file) => {
        setIsProcessing(true);
        setUploadProgress(10);
        setUploadStatusText(`Deciphering ${file.name}...`);
        
        try {
            let chunks = [];
            if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md')) {
                const text = await file.text();
                chunks = await ingestText(text, file.name, (p) => setUploadProgress(p));
            } else {
                chunks = await ingestPDF(file, (p) => setUploadProgress(p));
            }

            setUploadStatusText(`Binding ${chunks.length} pages into the archives...`);
            const volumes = packLore(chunks);

            if (uploadLore) {
                await uploadLore(volumes, {
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    fileName: file.name,
                    totalPages: chunks[chunks.length - 1]?.page || chunks.length,
                    type: 'pdf_volume'
                });
                toast(`Tome Assimilated: ${file.name} (${chunks.length} pages)`, "success");
                setShowUploadModal(false);
            }
        } catch (e) {
            console.error(e);
            dialog.alert("Failed to process tome: " + e.message);
        }
        setIsProcessing(false);
        setUploadProgress(0);
        setUploadStatusText('');
    };

    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles?.length) processFile(acceptedFiles[0]);
    }, []);
    
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
        onDrop, 
        accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt', '.md'] } 
    });

    // --- CUSTOM CODEX ENTRY HANDLER ---
    const handleCreateCodexEntry = async (e) => {
        e.preventDefault();
        if (!codexTitle.trim() || !codexContent.trim()) {
            return toast("Please provide a title and content for this entry.", "warning");
        }
        try {
            await addCustomLoreEntry({
                title: codexTitle.trim(),
                content: codexContent.trim(),
                category: codexCategory.trim()
            });
            toast(`Codex Article Created: ${codexTitle}`, "success");
            setCodexTitle('');
            setCodexContent('');
            setShowCodexModal(false);
        } catch (err) {
            console.error(err);
            toast("Failed to create codex entry", "error");
        }
    };

    // --- TABLETOP ACTIONS ---
    const handleSendToChat = (textToSend) => {
        const text = textToSend || selectedExcerpt || activePageData?.content;
        if (!text) return toast("No text selected to broadcast", "warning");

        const citation = activeTome ? `*— ${activeTome.title} (Page ${currentPage})*\n\n` : '';
        sendMessage({
            content: `${citation}${text}`,
            type: 'chat-desc',
            role: role === 'dm' ? 'dm' : 'player',
            senderId: user?.uid || 'dm',
            senderName: 'The High Archives',
            timestamp: Date.now()
        });
        toast("Broadcasted excerpt to Chat as DM Boxed Narrative!", "success");
    };

    const handleClipToJournal = (textToClip) => {
        const text = textToClip || selectedExcerpt || activePageData?.content;
        if (!text) return toast("No text selected to clip", "warning");

        const title = `${activeTome?.title || 'Archive Excerpt'} - p. ${currentPage}`;
        const newId = Date.now().toString();
        saveJournalPage(newId, {
            id: newId,
            title: title,
            content: `<h3>📜 Source: ${activeTome?.title || 'The Archives'} (Page ${currentPage})</h3><blockquote>${text}</blockquote>`,
            timestamp: Date.now()
        });
        toast("Clipped excerpt to Journal!", "success");
    };

    const handleCopyText = (textToCopy) => {
        const text = textToCopy || selectedExcerpt || activePageData?.content;
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast("Copied excerpt to clipboard", "info");
    };

    // --- AI BESTIARY MONSTER FORGE ---
    const handleOpenForgeWithExcerpt = (text) => {
        const excerpt = text || selectedExcerpt || activePageData?.content || '';
        setForgeInputText(excerpt);
        setForgedMonster(null);
        setShowForgeModal(true);
    };

    const handleGenerateStatblock = async () => {
        if (!aiHelper) return toast("AI helper service is not connected.", "error");
        if (!forgeInputText.trim()) return toast("Please provide monster text or lore to forge.", "warning");

        setIsForging(true);
        try {
            const prompt = buildMonsterExtractionPrompt(forgeInputText, forgeInstruction);
            const rawResponse = await aiHelper([{ role: 'user', content: prompt }]);

            let responseText = rawResponse;
            if (typeof rawResponse !== 'string') {
                if (rawResponse?.message?.content) responseText = rawResponse.message.content;
                else if (typeof rawResponse?.text === 'function') responseText = await rawResponse.text();
                else if (rawResponse?.text) responseText = rawResponse.text;
                else responseText = JSON.stringify(rawResponse);
            }

            // Clean markdown JSON wrapper if present
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);

            setForgedMonster(parsed);
            toast(`Forged 5e Statblock for: ${parsed.name}`, "success");
        } catch (err) {
            console.error("Monster Forge failed:", err);
            toast("Failed to forge monster. Ensure text contains creature details.", "error");
        }
        setIsForging(false);
    };

    const handleSaveToBestiary = () => {
        if (!forgedMonster) return;

        const newMonster = {
            id: `npc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: forgedMonster.name || 'Unnamed Creature',
            race: forgedMonster.race || 'Monster',
            class: 'Monster',
            cr: forgedMonster.cr || '1',
            ac: Number(forgedMonster.ac) || 12,
            hp: {
                current: Number(forgedMonster.hp?.max ?? forgedMonster.hp?.current ?? 25),
                max: Number(forgedMonster.hp?.max ?? forgedMonster.hp?.current ?? 25)
            },
            speed: forgedMonster.speed || '30 ft.',
            stats: forgedMonster.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            savingThrows: forgedMonster.savingThrows || {},
            skills: forgedMonster.skills || {},
            bio: {
                appearance: forgedMonster.bio?.appearance || '',
                backstory: forgedMonster.bio?.backstory || `Extracted from ${activeTome?.title || 'The Archives'} (Page ${currentPage})`
            },
            customActions: forgedMonster.customActions || []
        };

        const existingNpcs = data?.npcs || [];
        updateCampaign({ npcs: [...existingNpcs, newMonster] });
        toast(`✨ Added "${newMonster.name}" to Bestiary! Token ready for battlemap.`, "success");
        setShowForgeModal(false);
    };

    // --- SCAN CHAPTER FOR CREATURES ---
    const handleScanChapterCreatures = async () => {
        if (!aiHelper) return toast("AI helper service is not connected.", "error");
        if (!activePageData?.content) return toast("Current page is empty.", "warning");

        setIsScanningCreatures(true);
        try {
            const prompt = buildChapterMonsterScanPrompt(activePageData.content);
            const rawResponse = await aiHelper([{ role: 'user', content: prompt }]);

            let responseText = rawResponse;
            if (typeof rawResponse !== 'string') {
                if (rawResponse?.message?.content) responseText = rawResponse.message.content;
                else if (typeof rawResponse?.text === 'function') responseText = await rawResponse.text();
                else if (rawResponse?.text) responseText = rawResponse.text;
                else responseText = JSON.stringify(rawResponse);
            }

            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed)) {
                setScannedCreatures(parsed);
                toast(`Found ${parsed.length} creatures on this page!`, "info");
            }
        } catch (err) {
            console.error("Scan failed:", err);
            toast("No distinct creature encounters detected on this page.", "info");
        }
        setIsScanningCreatures(false);
    };

    // --- AI LORE ORACLE ("ASK THE ARCHIVES") ---
    const handleAskOracle = async (e) => {
        e?.preventDefault();
        if (!oracleQuestion.trim()) return;
        if (!aiHelper) return toast("AI helper service is not connected.", "error");

        const q = oracleQuestion.trim();
        setOracleQuestion('');
        setIsConsultingOracle(true);

        const currentEntry = {
            id: Date.now(),
            question: q,
            answer: '',
            sources: [],
            isLoading: true
        };
        setOracleHistory(prev => [currentEntry, ...prev]);

        try {
            // Retrieve top relevant chunks across PDFs & Notes
            const relevantChunks = retrieveContext(q, loreChunks, context.journal_pages, data?.players, role, context.myCharId);
            const prompt = buildArchiveQAPrompt(q, relevantChunks);

            const rawResponse = await aiHelper([{ role: 'user', content: prompt }]);
            let responseText = rawResponse;
            if (typeof rawResponse !== 'string') {
                if (rawResponse?.message?.content) responseText = rawResponse.message.content;
                else if (typeof rawResponse?.text === 'function') responseText = await rawResponse.text();
                else if (rawResponse?.text) responseText = rawResponse.text;
                else responseText = JSON.stringify(rawResponse);
            }

            setOracleHistory(prev => prev.map(item => {
                if (item.id === currentEntry.id) {
                    return {
                        ...item,
                        answer: responseText,
                        sources: relevantChunks,
                        isLoading: false
                    };
                }
                return item;
            }));
        } catch (err) {
            console.error("Oracle query failed:", err);
            setOracleHistory(prev => prev.map(item => {
                if (item.id === currentEntry.id) {
                    return {
                        ...item,
                        answer: "The Archives were unable to divine an answer at this time.",
                        isLoading: false
                    };
                }
                return item;
            }));
        }
        setIsConsultingOracle(false);
    };

    // Helper: Highlight Search Matches on Reader Page
    const renderHighlightedContent = (text, query) => {
        if (!text) return "This page is blank.";
        if (!query.trim()) return text;

        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');
        const parts = text.split(regex);

        return parts.map((part, idx) => {
            if (part.toLowerCase() === query.toLowerCase()) {
                return (
                    <mark key={idx} className="bg-amber-500/40 text-amber-200 font-bold px-1 rounded shadow-sm">
                        {part}
                    </mark>
                );
            }
            return part;
        });
    };

    return (
        <div className="h-full bg-slate-900 flex flex-col overflow-hidden text-slate-200">
            {/* Top Bar: Title, Stats & Primary Tabs */}
            <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 shrink-0 flex items-center justify-between gap-4 flex-wrap z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-900 to-slate-900 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-md">
                        <Icon name="library" size={22}/>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold fantasy-font tracking-wide text-cyan-400">The High Archives</h2>
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
                                Campaign Codex
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 hidden sm:block">Sourcebooks, World Lore & AI Bestiary Forge</p>
                    </div>
                </div>

                {/* Primary Mode Switcher */}
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-inner">
                    <button
                        onClick={() => setActiveTab('reader')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'reader'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                    >
                        <Icon name="book-open" size={14}/>
                        <span>Tome Library</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('forge')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'forge'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                    >
                        <Icon name="flame" size={14}/>
                        <span>Bestiary Forge</span>
                        <span className="text-[10px] bg-amber-500/30 text-amber-200 px-1.5 py-0.2 rounded-full font-mono">AI</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('oracle')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'oracle'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                    >
                        <Icon name="sparkles" size={14}/>
                        <span>Ask the Archives</span>
                        <span className="text-[10px] bg-purple-500/30 text-purple-200 px-1.5 py-0.2 rounded-full font-mono">AI</span>
                    </button>
                </div>

                {/* Top Action Buttons (DM Upload & Add) */}
                <div className="flex items-center gap-2 ml-auto sm:ml-0">
                    {role === 'dm' && (
                        <>
                            <button
                                onClick={() => setShowCodexModal(true)}
                                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                                title="Add Custom Lore Article"
                            >
                                <Icon name="plus" size={13}/>
                                <span className="hidden md:inline">New Article</span>
                            </button>

                            <button
                                onClick={() => setShowUploadModal(true)}
                                className="bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-500/50 text-cyan-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                title="Upload Sourcebook PDF or Text"
                            >
                                <Icon name="upload" size={13}/>
                                <span>Upload Tome</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* TAB 1: TOME LIBRARY & PAGINATED READER */}
            {activeTab === 'reader' && (
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* Left Sidebar: Bookshelf & Search */}
                    <div className="w-full md:w-72 bg-slate-950/60 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
                        {/* Search Bar */}
                        <div className="p-3 border-b border-slate-800/80">
                            <div className="relative">
                                <Icon name="search" size={14} className="absolute left-3 top-2.5 text-slate-500"/>
                                <input 
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search lore, monsters..."
                                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-cyan-500/80"
                                />
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                                    >
                                        <Icon name="x" size={12}/>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Shelf Filter Chips */}
                        <div className="px-3 py-2 flex items-center gap-1 border-b border-slate-800/60 overflow-x-auto no-scrollbar">
                            {[
                                { id: 'all', label: `All (${tomes.length})` },
                                { id: 'sourcebooks', label: 'PDFs' },
                                { id: 'codex', label: 'Codex' }
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setShelfFilter(f.id)}
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${
                                        shelfFilter === f.id
                                            ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40'
                                            : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {/* Bookshelf List / Search Results Feed */}
                        <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1.5">
                            {/* If searching, show search matches */}
                            {searchQuery.trim() ? (
                                <>
                                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-2 py-1">
                                        Found {searchResults.length} excerpts:
                                    </div>
                                    {searchResults.map((res, i) => (
                                        <button
                                            key={res.id || i}
                                            onClick={() => {
                                                if (res.docId) setActiveTomeId(res.docId);
                                                setCurrentPage(res.page);
                                            }}
                                            className="w-full text-left p-2.5 rounded-lg border border-slate-800 hover:border-cyan-500/40 bg-slate-900/60 hover:bg-slate-800/60 transition-all group"
                                        >
                                            <div className="flex items-center justify-between text-[11px] font-bold text-cyan-400 mb-1">
                                                <span className="truncate max-w-[130px]">{res.tomeTitle}</span>
                                                <span className="text-slate-500 font-mono text-[10px]">p. {res.page}</span>
                                            </div>
                                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                                {res.content}
                                            </p>
                                        </button>
                                    ))}
                                    {searchResults.length === 0 && (
                                        <div className="text-center text-slate-600 text-xs py-8">
                                            No matching lore found.
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Normal Bookshelf List */
                                <>
                                    {filteredTomes.map(tome => {
                                        const isActive = activeTome?.id === tome.id;
                                        return (
                                            <div
                                                key={tome.id}
                                                onClick={() => {
                                                    setActiveTomeId(tome.id);
                                                    setCurrentPage(1);
                                                }}
                                                className={`p-2.5 rounded-xl border transition-all cursor-pointer group flex items-start justify-between gap-2 ${
                                                    isActive
                                                        ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border-cyan-500/60 shadow-md shadow-cyan-950/20'
                                                        : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2.5 min-w-0">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                                        isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'
                                                    }`}>
                                                        <Icon name={tome.type === 'custom_codex' ? 'file-text' : 'book'} size={16}/>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className={`text-xs font-bold truncate ${isActive ? 'text-cyan-300' : 'text-slate-200'}`}>
                                                            {tome.title}
                                                        </h4>
                                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                                                            <span>{tome.totalPages || tome.pages?.length || 1} pages</span>
                                                            <span>•</span>
                                                            <span className="capitalize">{tome.category || 'Tome'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {role === 'dm' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            dialog.confirm(`Remove tome "${tome.title}" from the High Archives?`).then(ok => {
                                                                if (ok) deleteLoreDoc(tome.id);
                                                            });
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 transition-opacity"
                                                        title="Delete Tome"
                                                    >
                                                        <Icon name="trash-2" size={12}/>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {filteredTomes.length === 0 && (
                                        <div className="text-center text-slate-600 text-xs py-10 px-4">
                                            <Icon name="library" size={28} className="mx-auto text-slate-700 mb-2"/>
                                            <p className="font-bold text-slate-400 mb-1">No tomes in the vault</p>
                                            <p className="text-[11px]">Upload a sourcebook PDF or create a custom codex entry above.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Clear All Button for DM */}
                        {role === 'dm' && tomes.length > 0 && (
                            <div className="p-2 border-t border-slate-800/80">
                                <button
                                    onClick={clearAllLore}
                                    className="w-full py-1 text-[11px] text-slate-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Icon name="trash" size={12}/> Clear All Archives
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Paginated Tome Reader */}
                    <div className="flex-1 flex flex-col bg-slate-900/80 overflow-hidden relative">
                        {activeTome ? (
                            <>
                                {/* Reader Control Header */}
                                <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/40 shrink-0 flex-wrap">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icon name="book" size={16} className="text-cyan-400 shrink-0"/>
                                        <h3 className="text-sm font-bold text-slate-200 truncate">{activeTome.title}</h3>
                                        <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                                            (Page {currentPage} of {activeTome.totalPages || activeTome.pages?.length || 1})
                                        </span>
                                    </div>

                                    {/* Page Flipper Controls */}
                                    <div className="flex items-center gap-1.5 ml-auto">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage <= 1}
                                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1 transition-colors"
                                        >
                                            <Icon name="chevron-left" size={14}/> Prev
                                        </button>

                                        {/* Jump to Page Input */}
                                        <div className="flex items-center gap-1 text-xs font-mono text-slate-400 bg-slate-800/80 border border-slate-700/80 px-2 py-1 rounded-lg">
                                            <span>Page</span>
                                            <input
                                                type="number"
                                                min="1"
                                                max={activeTome.totalPages || activeTome.pages?.length || 1}
                                                value={currentPage}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value);
                                                    if (!isNaN(val)) {
                                                        const max = activeTome.totalPages || activeTome.pages?.length || 1;
                                                        setCurrentPage(Math.min(Math.max(1, val), max));
                                                    }
                                                }}
                                                className="w-10 bg-transparent text-cyan-300 font-bold text-center outline-none"
                                            />
                                            <span className="text-slate-500">/ {activeTome.totalPages || activeTome.pages?.length || 1}</span>
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min((activeTome.totalPages || activeTome.pages?.length || 1), prev + 1))}
                                            disabled={currentPage >= (activeTome.totalPages || activeTome.pages?.length || 1)}
                                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1 transition-colors"
                                        >
                                            Next <Icon name="chevron-right" size={14}/>
                                        </button>
                                    </div>
                                </div>

                                {/* Reader Text Content */}
                                <div 
                                    ref={readerContentRef}
                                    onMouseUp={handleReaderMouseUp}
                                    className="flex-1 overflow-y-auto custom-scroll p-6 md:p-10 max-w-4xl mx-auto w-full leading-relaxed"
                                >
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 sm:p-10 shadow-2xl relative min-h-[500px]">
                                        <div className="flex items-center justify-between pb-3 mb-6 border-b border-slate-800/80 text-xs font-mono text-slate-500">
                                            <span className="uppercase tracking-wider">{activeTome.title}</span>
                                            <span>Page {currentPage}</span>
                                        </div>

                                        {activePageData ? (
                                            <div className="font-serif text-slate-200 text-base sm:text-lg leading-relaxed whitespace-pre-wrap selection:bg-cyan-500/30 selection:text-cyan-200">
                                                {renderHighlightedContent(activePageData.content, searchQuery)}
                                            </div>
                                        ) : (
                                            <div className="text-center text-slate-600 py-20 font-serif italic">
                                                Page {currentPage} does not contain text.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Floating Page Action Bar (Bestiary Forge / Send to Chat / Clip to Journal) */}
                                <div className="p-3 bg-slate-950/90 border-t border-slate-800 shrink-0 flex items-center justify-between gap-3 flex-wrap z-10 backdrop-blur-sm">
                                    <div className="text-xs text-slate-400 flex items-center gap-2">
                                        <Icon name="mouse-pointer" size={13} className="text-slate-500"/>
                                        <span>
                                            {selectedExcerpt 
                                                ? `Selected: "${selectedExcerpt.substring(0, 40)}..."` 
                                                : "Tip: Select text to extract or broadcast"
                                            }
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 ml-auto flex-wrap">
                                        {/* Extract to Bestiary Button */}
                                        <button
                                            onClick={() => handleOpenForgeWithExcerpt(selectedExcerpt || activePageData?.content)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600 to-amber-700 hover:brightness-110 text-white shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
                                            title="Extract Monster Statblock from Page/Selection"
                                        >
                                            <Icon name="flame" size={14}/>
                                            <span>Forge to Bestiary</span>
                                        </button>

                                        {/* Scan Chapter for Monsters */}
                                        <button
                                            onClick={handleScanChapterCreatures}
                                            disabled={isScanningCreatures}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
                                            title="Detect all monsters & encounters on this page"
                                        >
                                            {isScanningCreatures ? (
                                                <Icon name="loader" size={14} className="animate-spin text-amber-400"/>
                                            ) : (
                                                <Icon name="scan" size={14} className="text-cyan-400"/>
                                            )}
                                            <span>Scan Page Creatures</span>
                                        </button>

                                        {/* Send Boxed Text to Chat */}
                                        <button
                                            onClick={() => handleSendToChat()}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
                                            title="Broadcast selected text as DM Narrative Card in Chat"
                                        >
                                            <Icon name="message-square" size={14} className="text-amber-400"/>
                                            <span>To Chat</span>
                                        </button>

                                        {/* Clip to Journal */}
                                        <button
                                            onClick={() => handleClipToJournal()}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
                                            title="Save to Journal Note"
                                        >
                                            <Icon name="book-plus" size={14} className="text-green-400"/>
                                            <span>To Journal</span>
                                        </button>

                                        {/* Copy Text */}
                                        <button
                                            onClick={() => handleCopyText()}
                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                                            title="Copy Text"
                                        >
                                            <Icon name="copy" size={14}/>
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* Empty State */
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 mb-4 shadow-xl">
                                    <Icon name="library" size={32}/>
                                </div>
                                <h3 className="text-lg font-bold text-slate-200 mb-1">High Archives Empty</h3>
                                <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
                                    Feed sourcebook PDFs, adventure modules, or lore notes to enable instant full-text searching, grounded Q&A, and 5e monster extraction.
                                </p>
                                {role === 'dm' && (
                                    <button
                                        onClick={() => setShowUploadModal(true)}
                                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
                                    >
                                        <Icon name="upload" size={16}/> Upload First Tome
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: AI BESTIARY MONSTER FORGE */}
            {activeTab === 'forge' && (
                <div className="flex-1 overflow-y-auto custom-scroll p-4 md:p-8 max-w-5xl mx-auto w-full">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Input & Instructions Column */}
                        <div className="flex flex-col gap-4">
                            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 shadow-xl">
                                <h3 className="text-base font-bold text-amber-400 flex items-center gap-2 mb-2">
                                    <Icon name="flame" size={18}/> Creature Lore & Source Excerpt
                                </h3>
                                <p className="text-xs text-slate-400 mb-3">
                                    Paste lore descriptions, abilities, or stat notes from any book. The AI will forge a balanced D&D 5e monster statblock.
                                </p>
                                <textarea
                                    value={forgeInputText}
                                    onChange={e => setForgeInputText(e.target.value)}
                                    placeholder="e.g. 'Nothic: Once a great wizard who delved too deep into forbidden arcana, now a hunched, cyclopean abomination with rotting claws and a rotting gaze attack...'"
                                    rows={8}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:border-amber-500/80 outline-none leading-relaxed custom-scroll"
                                />

                                <div className="mt-3">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                        Custom Instructions (Optional):
                                    </label>
                                    <input
                                        type="text"
                                        value={forgeInstruction}
                                        onChange={e => setForgeInstruction(e.target.value)}
                                        placeholder="e.g. 'Scale to CR 5, add multiattack, add poison damage'"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-amber-500 outline-none"
                                    />
                                </div>

                                <button
                                    onClick={handleGenerateStatblock}
                                    disabled={isForging || !forgeInputText.trim()}
                                    className={`w-full mt-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                                        isForging || !forgeInputText.trim()
                                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:brightness-110 text-white shadow-amber-950/40 active:scale-95'
                                    }`}
                                >
                                    {isForging ? (
                                        <>
                                            <Icon name="loader" size={16} className="animate-spin"/>
                                            <span>Forging 5e Statblock & CR...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Icon name="flame" size={16}/>
                                            <span>Forge 5e Monster Statblock</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Scanned Creatures Checklist from Reader */}
                            {scannedCreatures.length > 0 && (
                                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 shadow-xl">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-1.5">
                                        <Icon name="scan" size={14}/> Detected Chapter Creatures ({scannedCreatures.length})
                                    </h4>
                                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll">
                                        {scannedCreatures.map((creature, i) => (
                                            <div key={i} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-bold text-xs text-slate-200">{creature.name}</div>
                                                    <div className="text-[10px] text-slate-500">{creature.type} • CR {creature.cr}</div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setForgeInputText(`${creature.name}: ${creature.description || ''}`);
                                                        setForgeInstruction(`Create balanced D&D 5e monster statblock for ${creature.name} (CR ${creature.cr || '1'})`);
                                                    }}
                                                    className="px-2 py-1 bg-amber-600/30 hover:bg-amber-600 text-amber-300 hover:text-white rounded text-[11px] font-bold border border-amber-500/40 transition-colors"
                                                >
                                                    Forge
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Generated Monster Preview Column */}
                        <div className="flex flex-col">
                            {forgedMonster ? (
                                <div className="bg-gradient-to-b from-amber-950/20 via-slate-950 to-slate-950 border-2 border-amber-500/60 rounded-2xl p-6 shadow-2xl relative">
                                    {/* Monster Header */}
                                    <div className="border-b-2 border-amber-600/40 pb-3 mb-3">
                                        <h2 className="text-2xl font-bold font-serif text-amber-400 tracking-wide">{forgedMonster.name}</h2>
                                        <p className="text-xs italic text-slate-400">{forgedMonster.race} • Challenge Rating {forgedMonster.cr}</p>
                                    </div>

                                    {/* Defense & Vitals */}
                                    <div className="text-xs space-y-1 text-slate-300 border-b border-amber-500/20 pb-3 mb-3">
                                        <div><strong className="text-amber-300">Armor Class:</strong> {forgedMonster.ac}</div>
                                        <div><strong className="text-amber-300">Hit Points:</strong> {forgedMonster.hp?.max || forgedMonster.hp?.current}</div>
                                        <div><strong className="text-amber-300">Speed:</strong> {forgedMonster.speed}</div>
                                    </div>

                                    {/* Stats Grid */}
                                    {forgedMonster.stats && (
                                        <div className="grid grid-cols-6 gap-1 bg-slate-900/80 p-2 rounded-lg text-center border border-slate-800 mb-4">
                                            {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(st => {
                                                const score = forgedMonster.stats[st] || 10;
                                                const mod = Math.floor((score - 10) / 2);
                                                return (
                                                    <div key={st} className="p-1">
                                                        <div className="text-[10px] font-bold uppercase text-slate-500">{st}</div>
                                                        <div className="text-sm font-bold text-white">{score}</div>
                                                        <div className="text-[10px] text-amber-400">{mod >= 0 ? `+${mod}` : mod}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    {forgedMonster.customActions && forgedMonster.customActions.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 border-b border-slate-800 pb-1">Actions</h4>
                                            <div className="space-y-2">
                                                {forgedMonster.customActions.map((act, i) => (
                                                    <div key={i} className="text-xs leading-relaxed">
                                                        <strong className="text-white italic">{act.name}.</strong> <span className="text-slate-300">{act.desc}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Save Button */}
                                    <button
                                        onClick={handleSaveToBestiary}
                                        className="w-full mt-4 py-3 bg-gradient-to-r from-green-700 to-emerald-600 hover:brightness-110 text-white font-bold text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
                                    >
                                        <Icon name="check" size={18}/>
                                        <span>Save to Campaign Bestiary ({data?.npcs?.length || 0} existing)</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="h-full border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
                                    <Icon name="skull" size={40} className="text-slate-700 mb-3"/>
                                    <h4 className="text-sm font-bold text-slate-400 mb-1">No Monster Forged Yet</h4>
                                    <p className="text-xs text-slate-500 max-w-xs">
                                        Select text in the reader, paste lore, or scan a chapter to forge a full 5e statblock ready for battle.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: ASK THE ARCHIVES (AI LORE ORACLE) */}
            {activeTab === 'oracle' && (
                <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 md:p-6 overflow-hidden">
                    {/* Header */}
                    <div className="mb-4 text-center shrink-0">
                        <h3 className="text-lg font-bold fantasy-font text-purple-400 flex items-center justify-center gap-2">
                            <Icon name="sparkles" size={18}/> The Lore Oracle
                        </h3>
                        <p className="text-xs text-slate-400">
                            Ask questions grounded in your uploaded campaign sourcebooks, adventure modules, and journals.
                        </p>
                    </div>

                    {/* Q&A Feed */}
                    <div className="flex-1 overflow-y-auto custom-scroll space-y-4 pr-2 pb-4">
                        {oracleHistory.length === 0 && (
                            <div className="text-center py-12 text-slate-600 text-xs flex flex-col items-center gap-2">
                                <Icon name="book-open-check" size={32} className="text-slate-700"/>
                                <span>No questions asked yet. Inquire about locations, NPCs, factions, or dungeon secrets.</span>
                                <div className="flex flex-wrap gap-2 justify-center mt-3 max-w-md">
                                    {[
                                        "Who are the main villains and their motives?",
                                        "What traps are in this dungeon?",
                                        "List the factions in the realm."
                                    ].map((suggest, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                setOracleQuestion(suggest);
                                            }}
                                            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-[11px] text-purple-300 border border-purple-500/30 transition-colors"
                                        >
                                            {suggest}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {oracleHistory.map(item => (
                            <div key={item.id} className="space-y-2">
                                {/* Question */}
                                <div className="flex justify-end">
                                    <div className="bg-purple-950/50 border border-purple-500/40 text-purple-200 text-xs rounded-xl px-4 py-2.5 max-w-lg shadow-md">
                                        <strong>Q:</strong> {item.question}
                                    </div>
                                </div>

                                {/* Answer */}
                                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 shadow-xl text-xs text-slate-200 leading-relaxed max-w-2xl">
                                    {item.isLoading ? (
                                        <div className="flex items-center gap-2 text-purple-400 py-2 animate-pulse">
                                            <Icon name="loader" size={16} className="animate-spin"/>
                                            <span>Consulting the High Archives...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="whitespace-pre-wrap mb-3 font-serif text-sm">
                                                {item.answer}
                                            </div>

                                            {/* Citations / Sources */}
                                            {item.sources && item.sources.length > 0 && (
                                                <div className="mt-3 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5 items-center">
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Sources:</span>
                                                    {item.sources.map((s, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => {
                                                                if (s.docId) setActiveTomeId(s.docId);
                                                                if (s.page) setCurrentPage(s.page);
                                                                setActiveTab('reader');
                                                            }}
                                                            className="text-[10px] bg-slate-900 hover:bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1 transition-colors"
                                                        >
                                                            <Icon name="book" size={10}/>
                                                            <span>{s.source || s.title} (p. {s.page || '?'})</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Question Input */}
                    <form onSubmit={handleAskOracle} className="mt-2 shrink-0 flex gap-2">
                        <input
                            type="text"
                            value={oracleQuestion}
                            onChange={e => setOracleQuestion(e.target.value)}
                            placeholder="Ask the archives a question..."
                            disabled={isConsultingOracle}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:border-purple-500 outline-none shadow-inner"
                        />
                        <button
                            type="submit"
                            disabled={!oracleQuestion.trim() || isConsultingOracle}
                            className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5"
                        >
                            <Icon name="send" size={14}/> Ask
                        </button>
                    </form>
                </div>
            )}

            {/* UPLOAD MODAL */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
                        <button
                            onClick={() => setShowUploadModal(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white"
                        >
                            <Icon name="x" size={18}/>
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                                <Icon name="upload-cloud" size={22}/>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Upload Campaign Tome</h3>
                                <p className="text-xs text-slate-400">Upload PDF sourcebooks or plain text (.txt, .md)</p>
                            </div>
                        </div>

                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                                isDragActive ? 'border-cyan-400 bg-cyan-950/30' : 'border-slate-700 hover:border-cyan-500/60 hover:bg-slate-800/40'
                            }`}
                        >
                            <input {...getInputProps()} />
                            {isProcessing ? (
                                <div className="w-full">
                                    <Icon name="loader" size={36} className="animate-spin text-cyan-400 mx-auto mb-3"/>
                                    <div className="text-sm font-bold text-cyan-300">{uploadStatusText}</div>
                                    <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                                        <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}/>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono mt-1">{uploadProgress}% complete</div>
                                </div>
                            ) : (
                                <>
                                    <Icon name="file-up" size={40} className="text-slate-500 mb-3"/>
                                    <p className="font-bold text-slate-200 text-sm mb-1">Drag & Drop PDF or TXT here</p>
                                    <p className="text-xs text-slate-500">Auto-chunking & document indexing enabled</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTOM CODEX ENTRY MODAL */}
            {showCodexModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
                        <button
                            onClick={() => setShowCodexModal(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white"
                        >
                            <Icon name="x" size={18}/>
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/40 flex items-center justify-center text-purple-400">
                                <Icon name="feather" size={20}/>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Create Custom Codex Article</h3>
                                <p className="text-xs text-slate-400">Add lore, pantheons, factions, or world history</p>
                            </div>
                        </div>

                        <form onSubmit={handleCreateCodexEntry} className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Title</label>
                                <input
                                    type="text"
                                    value={codexTitle}
                                    onChange={e => setCodexTitle(e.target.value)}
                                    placeholder="e.g. The Order of the Silver Gauntlet"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Category</label>
                                <select
                                    value={codexCategory}
                                    onChange={e => setCodexCategory(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                >
                                    <option value="World Lore">World Lore & History</option>
                                    <option value="Factions">Factions & Guilds</option>
                                    <option value="Pantheon">Deities & Pantheons</option>
                                    <option value="Locations">Locations & Geography</option>
                                    <option value="House Rules">House Rules</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Article Content (Markdown supported)</label>
                                <textarea
                                    value={codexContent}
                                    onChange={e => setCodexContent(e.target.value)}
                                    rows={8}
                                    placeholder="Write your lore entry here..."
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:border-purple-500 outline-none custom-scroll leading-relaxed"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
                            >
                                Publish to Archives
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoreView;