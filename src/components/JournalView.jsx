import React, { useState, useMemo } from 'react';
import { useNewCampaign } from '../contexts/NewCampaignProvider';
import JournalPageEditor from './JournalPageEditor';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { useDialog } from './DialogProvider';

export const JOURNAL_CATEGORIES = [
    { id: 'all', label: 'All Notes', icon: 'file-text', color: 'slate' },
    { id: 'pinned', label: 'Pinned', icon: 'star', color: 'amber' },
    { id: 'session', label: 'Sessions', icon: 'book-open', color: 'amber' },
    { id: 'quest', label: 'Quests', icon: 'scroll', color: 'purple' },
    { id: 'npc', label: 'NPCs & Lore', icon: 'user', color: 'emerald' },
    { id: 'loot', label: 'Loot & Stash', icon: 'coins', color: 'yellow' },
    { id: 'general', label: 'General', icon: 'bookmark', color: 'blue' }
];

export const JOURNAL_TEMPLATES = {
    session: {
        category: 'session',
        title: 'Session Notes',
        tags: ['session', 'recap'],
        content: `<h2>📅 Session Overview</h2><p><strong>In-Game Date:</strong> &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Real Date:</strong> ${new Date().toLocaleDateString()}</p><p><strong>Party Location:</strong> Current area or dungeon level</p><hr/><h3>⏮️ Last Session Recap</h3><p>Brief summary of preceding events...</p><hr/><h3>⚔️ Major Events & Encounters</h3><ul><li><strong>Event 1:</strong> Description...</li><li><strong>Combat Encounter:</strong> Enemies fought, tactical highlights...</li></ul><hr/><h3>👑 NPCs Encountered</h3><p>Names, allegiances, and key dialogue points...</p><hr/><h3>💎 Loot & Discoveries</h3><ul><li>Gold / Coins: ...</li><li>Magical Items: ...</li></ul><hr/><h3>🎯 Goals for Next Session</h3><ul><li>Immediate priority...</li></ul>`
    },
    quest: {
        category: 'quest',
        title: 'Quest: [Quest Name]',
        tags: ['quest', 'active'],
        content: `<h2>📜 Quest Dossier</h2><p><strong>Quest Giver:</strong> Name / Organization</p><p><strong>Status:</strong> <span style="color: #fbbf24;">Active</span></p><p><strong>Promised Reward:</strong> Gold, Favors, Magic items</p><hr/><h3>🎯 Primary Objective</h3><p>Clear, direct goal of the mission...</p><hr/><h3>✨ Bonus / Optional Objectives</h3><ul><li>Secondary condition or non-lethal outcome...</li></ul><hr/><h3>🔍 Clues & Leads</h3><ul><li><strong>Clue 1:</strong> What the party knows so far...</li><li><strong>Rumor:</strong> Unverified tavern gossip...</li></ul><hr/><h3>📍 Key Locations</h3><p>Dungeons, landmarks, coordinates...</p>`
    },
    npc: {
        category: 'npc',
        title: 'NPC: [Character Name]',
        tags: ['npc', 'lore'],
        content: `<h2>👤 Character Profile</h2><p><strong>Race / Ancestry:</strong> Human / Elf / Dwarf...</p><p><strong>Class / Role:</strong> Merchant, Guard Captain, Archmage...</p><p><strong>Affiliation:</strong> Guild, Faction, or Realm</p><p><strong>Attitude toward Party:</strong> Neutral / Friendly / Suspicious</p><hr/><h3>🎭 Appearance & Voice</h3><p>Distinctive features, clothing, voice mannerisms, quirks...</p><hr/><h3>💡 Motivations & Bonds</h3><p>What does this character truly want? Who do they protect?</p><hr/><h3>🗝️ Secrets & DM Notes</h3><p>Hidden knowledge, weaknesses, or upcoming twists...</p>`
    },
    loot: {
        category: 'loot',
        title: 'Loot & Treasury Stash',
        tags: ['loot', 'treasury'],
        content: `<h2>💰 Party Treasury & Inventory</h2><p><strong>Total Coinage:</strong> 0 PP | 0 GP | 0 SP | 0 CP</p><hr/><h3>📦 Magic Items & Relics</h3><table style="width:100%; border-collapse:collapse; margin:10px 0; border:1px solid #475569;"><thead><tr style="background-color:#1e293b; color:#fbbf24;"><th style="border:1px solid #475569; padding:8px; text-align:left;">Item Name</th><th style="border:1px solid #475569; padding:8px; text-align:left;">Rarity</th><th style="border:1px solid #475569; padding:8px; text-align:left;">Carried By</th><th style="border:1px solid #475569; padding:8px; text-align:left;">Properties & Attunement</th></tr></thead><tbody><tr><td style="border:1px solid #475569; padding:8px;">Potion of Healing</td><td style="border:1px solid #475569; padding:8px;">Common</td><td style="border:1px solid #475569; padding:8px;">Party Bag</td><td style="border:1px solid #475569; padding:8px;">Restores 2d4+2 HP</td></tr><tr><td style="border:1px solid #475569; padding:8px;">Moonlit Dagger</td><td style="border:1px solid #475569; padding:8px;">Uncommon</td><td style="border:1px solid #475569; padding:8px;">Rogue</td><td style="border:1px solid #475569; padding:8px;">+1 Attack, glows near undead</td></tr></tbody></table><hr/><h3>📜 Unidentified Items / Scrolls</h3><p>Awaiting identification or Arcana checks...</p>`
    }
};

const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const JournalView = ({ role, userId, onClose, isSidebar = false }) => {
    const { campaign, journal_pages, saveJournalPage, deleteJournalPage, gameParams } = useNewCampaign();
    const data = { ...campaign, journal_pages };
    const [activePageId, setActivePageId] = useState(null);
    const toast = useToast();
    const dialog = useDialog();

    const isDrawer = Boolean(isSidebar || onClose);

    // Filters and Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [accessFilter, setAccessFilter] = useState('all'); // all, mine, shared, public
    const [sortBy, setSortBy] = useState('recent'); // recent, newest, oldest, alpha
    const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

    const allPages = useMemo(() => {
        return Object.values(data.journal_pages || {});
    }, [data.journal_pages]);

    // Role-based visibility
    const visiblePages = useMemo(() => {
        return allPages.filter(p => {
            if (role === 'dm') return true;
            if (String(p.ownerId) === String(userId)) return true;
            if (p.isPublic) return true;
            return p.visibleTo?.includes(userId);
        });
    }, [allPages, role, userId]);

    // Filter and sort pages
    const filteredPages = useMemo(() => {
        let list = [...visiblePages];

        // 1. Category filter
        if (selectedCategory === 'pinned') {
            list = list.filter(p => p.isPinned);
        } else if (selectedCategory !== 'all') {
            list = list.filter(p => (p.category || 'general') === selectedCategory);
        }

        // 2. Access filter
        if (accessFilter === 'mine') {
            list = list.filter(p => String(p.ownerId) === String(userId));
        } else if (accessFilter === 'shared') {
            list = list.filter(p => !p.isPublic && String(p.ownerId) !== String(userId) && p.visibleTo?.includes(userId));
        } else if (accessFilter === 'public') {
            list = list.filter(p => p.isPublic);
        }

        // 3. Search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(p => {
                const titleMatch = (p.title || '').toLowerCase().includes(q);
                const tagMatch = (p.tags || []).some(t => t.toLowerCase().includes(q));
                const contentMatch = stripHtml(p.content || '').toLowerCase().includes(q);
                return titleMatch || tagMatch || contentMatch;
            });
        }

        // 4. Sort
        list.sort((a, b) => {
            if (sortBy !== 'alpha') {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
            }

            if (sortBy === 'recent') {
                const timeA = a.updatedAt || a.created || 0;
                const timeB = b.updatedAt || b.created || 0;
                return timeB - timeA;
            }
            if (sortBy === 'newest') {
                return (b.created || 0) - (a.created || 0);
            }
            if (sortBy === 'oldest') {
                return (a.created || 0) - (b.created || 0);
            }
            if (sortBy === 'alpha') {
                return (a.title || 'Untitled').localeCompare(b.title || 'Untitled');
            }
            return 0;
        });

        return list;
    }, [visiblePages, selectedCategory, accessFilter, searchQuery, sortBy, userId]);

    // Counts for category badges
    const categoryCounts = useMemo(() => {
        const counts = { all: visiblePages.length, pinned: 0 };
        visiblePages.forEach(p => {
            if (p.isPinned) counts.pinned = (counts.pinned || 0) + 1;
            const cat = p.category || 'general';
            counts[cat] = (counts[cat] || 0) + 1;
        });
        return counts;
    }, [visiblePages]);

    const handleCreate = (templateKey = null) => {
        const newId = Date.now().toString();
        const template = templateKey ? JOURNAL_TEMPLATES[templateKey] : null;

        const newPage = {
            id: newId,
            title: template ? template.title : 'New Entry',
            category: template ? template.category : (selectedCategory !== 'all' && selectedCategory !== 'pinned' ? selectedCategory : 'general'),
            tags: template ? [...template.tags] : [],
            content: template ? template.content : '',
            theme: 'slate',
            isPinned: false,
            ownerId: userId || 'anon',
            isPublic: false,
            created: Date.now(),
            updatedAt: Date.now(),
            visibleTo: []
        };

        saveJournalPage(newId, newPage);
        setActivePageId(newId);
        setShowTemplateDropdown(false);
        toast(`Created ${newPage.title}`, 'success');
    };

    const handleTogglePin = (page, e) => {
        e.stopPropagation();
        const updated = { ...page, isPinned: !page.isPinned, updatedAt: Date.now() };
        saveJournalPage(page.id, updated);
        toast(updated.isPinned ? 'Note pinned' : 'Note unpinned', 'info');
    };

    const handleDuplicate = (page, e) => {
        e.stopPropagation();
        const newId = Date.now().toString();
        const copy = {
            ...page,
            id: newId,
            title: `${page.title || 'Entry'} (Copy)`,
            created: Date.now(),
            updatedAt: Date.now(),
            ownerId: userId || 'anon',
            isPinned: false
        };
        saveJournalPage(newId, copy);
        toast('Entry duplicated', 'success');
    };

    const handleDelete = async (page, e) => {
        e.stopPropagation();
        if (await dialog.confirm(`Are you sure you want to delete "${page.title || 'Untitled'}"?`, 'Delete Entry')) {
            deleteJournalPage(page.id);
            if (activePageId === page.id) setActivePageId(null);
            toast('Entry deleted', 'warning');
        }
    };

    const getCategoryDetails = (catId) => {
        const match = JOURNAL_CATEGORIES.find(c => c.id === catId);
        return match || { id: 'general', label: 'General', icon: 'bookmark', color: 'blue' };
    };

    // If an entry is currently active, render the editor
    if (activePageId) {
        const activePage = data.journal_pages?.[activePageId];
        if (!activePage) {
            setActivePageId(null);
            return null;
        }

        return (
            <JournalPageEditor
                page={activePage}
                onSave={saveJournalPage}
                onDelete={(id) => { deleteJournalPage(id); setActivePageId(null); }}
                onBack={() => setActivePageId(null)}
                players={data.players || []}
                npcs={data.npcs || []}
                locations={data.locations || []}
                userId={userId}
                campaignCode={gameParams?.code}
                isDm={role === 'dm'}
                assignments={data.assignments || {}}
                isSidebar={isDrawer}
                onClose={onClose}
            />
        );
    }

    return (
        <div className="h-full bg-slate-950 flex flex-col overflow-hidden select-none">
            {/* Top Hub Bar */}
            <div className={`border-b border-slate-800 bg-slate-900/90 backdrop-blur-md shrink-0 shadow-lg z-20 ${isDrawer ? 'p-3' : 'px-4 sm:px-6 py-4'}`}>
                <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
                    {/* Header line */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 sm:p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-inner shrink-0">
                                <Icon name="book-marked" size={18} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-base sm:text-xl font-bold text-slate-100 fantasy-font tracking-wide truncate">
                                    {isDrawer ? 'Journal' : 'Chronicle & Journal'}
                                </h2>
                                <p className="text-[10px] sm:text-xs text-slate-400 font-medium truncate">
                                    {visiblePages.length} {visiblePages.length === 1 ? 'note' : 'notes'}
                                </p>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            {/* Templates Dropdown Button */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-md"
                                    title="Starter Templates"
                                >
                                    <Icon name="layout-template" size={14} className="text-amber-400" />
                                    <span className="hidden sm:inline">Templates</span>
                                    <Icon name={showTemplateDropdown ? "chevron-up" : "chevron-down"} size={12} />
                                </button>

                                {showTemplateDropdown && (
                                    <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 animate-in zoom-in-95 duration-100">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 tracking-wider">
                                            Starter Templates
                                        </div>
                                        <button
                                            onClick={() => handleCreate('session')}
                                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 transition-colors"
                                        >
                                            <Icon name="book-open" size={14} className="text-amber-400" />
                                            <div>
                                                <div className="font-semibold">Session Notes</div>
                                                <div className="text-[10px] text-slate-400">Recap, events, loot, goals</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => handleCreate('quest')}
                                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 transition-colors"
                                        >
                                            <Icon name="scroll" size={14} className="text-purple-400" />
                                            <div>
                                                <div className="font-semibold">Quest Dossier</div>
                                                <div className="text-[10px] text-slate-400">Objectives, clues, rewards</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => handleCreate('npc')}
                                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 transition-colors"
                                        >
                                            <Icon name="user" size={14} className="text-emerald-400" />
                                            <div>
                                                <div className="font-semibold">NPC Profile</div>
                                                <div className="text-[10px] text-slate-400">Role, traits, secrets</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => handleCreate('loot')}
                                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 transition-colors"
                                        >
                                            <Icon name="coins" size={14} className="text-yellow-400" />
                                            <div>
                                                <div className="font-semibold">Treasury & Stash</div>
                                                <div className="text-[10px] text-slate-400">Coins & magic items table</div>
                                            </div>
                                        </button>
                                        <div className="h-px bg-slate-800 my-1" />
                                        <button
                                            onClick={() => handleCreate(null)}
                                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-800 flex items-center gap-2.5 text-slate-400 hover:text-slate-200 transition-colors"
                                        >
                                            <Icon name="plus" size={14} />
                                            <span className="font-semibold">Blank Entry</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* New Entry Primary Button */}
                            <button
                                onClick={() => handleCreate(null)}
                                className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold px-3 py-1.5 rounded-lg shadow-lg shadow-amber-900/30 flex items-center gap-1.5 text-xs transition-all transform active:scale-95"
                            >
                                <Icon name="plus" size={15} />
                                <span>New</span>
                            </button>

                            {/* Optional Close Button for VTT Sidebar */}
                            {onClose && (
                                <button
                                    onClick={onClose}
                                    className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors ml-0.5"
                                    title="Close Journal"
                                >
                                    <Icon name="x" size={18} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Search & Secondary Filter Row */}
                    {isDrawer ? (
                        /* Sidebar Layout: 2 dedicated rows for search & access/sort */
                        <div className="flex flex-col gap-2 pt-0.5">
                            {/* Full width search bar */}
                            <div className="relative w-full">
                                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search notes or #tags..."
                                    className="w-full bg-slate-800/90 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 transition-all shadow-inner"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                                    >
                                        <Icon name="x" size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Access tabs & Sort side by side */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/80 text-[11px]">
                                    {[
                                        { id: 'all', label: 'All' },
                                        { id: 'mine', label: 'Mine' },
                                        { id: 'shared', label: 'Shared' },
                                        { id: 'public', label: 'Public' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setAccessFilter(tab.id)}
                                            className={`px-2 py-1 rounded-md font-medium transition-colors ${accessFilter === tab.id ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-300">
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-[11px]"
                                    >
                                        <option value="recent" className="bg-slate-900">Recent</option>
                                        <option value="newest" className="bg-slate-900">Newest</option>
                                        <option value="oldest" className="bg-slate-900">Oldest</option>
                                        <option value="alpha" className="bg-slate-900">A-Z</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Full Screen Layout: Single row with flex-wrap */
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <div className="relative flex-1 min-w-[200px]">
                                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search title, content, or #tags..."
                                    className="w-full bg-slate-800/90 border border-slate-700/80 rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                                    >
                                        <Icon name="x" size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/80 text-xs shrink-0">
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'mine', label: 'Mine' },
                                    { id: 'shared', label: 'Shared' },
                                    { id: 'public', label: 'Public' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setAccessFilter(tab.id)}
                                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors ${accessFilter === tab.id ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
                                <Icon name="arrow-up-down" size={13} className="text-slate-400" />
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
                                >
                                    <option value="recent" className="bg-slate-900">Recent</option>
                                    <option value="newest" className="bg-slate-900">Newest Created</option>
                                    <option value="oldest" className="bg-slate-900">Oldest</option>
                                    <option value="alpha" className="bg-slate-900">A to Z</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Category Tabs Scrollbar */}
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 pt-0.5 -mx-1 px-1">
                        {JOURNAL_CATEGORIES.map(cat => {
                            const count = categoryCounts[cat.id] || 0;
                            const isSelected = selectedCategory === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition-all border ${
                                        isSelected
                                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-sm'
                                            : 'bg-slate-800/50 text-slate-400 border-slate-700/60 hover:bg-slate-800 hover:text-slate-200'
                                    }`}
                                >
                                    <Icon name={cat.icon} size={12} />
                                    <span>{cat.label}</span>
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${isSelected ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-700 text-slate-400'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Main Cards Body */}
            <div className={`flex-1 overflow-y-auto custom-scroll ${isDrawer ? 'p-3' : 'p-4 sm:p-6 lg:p-8'}`}>
                <div className="max-w-7xl mx-auto">
                    {filteredPages.length > 0 ? (
                        <div className={`grid gap-3.5 ${isDrawer ? 'grid-cols-1 w-full' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                            {filteredPages.map(page => {
                                const catDetails = getCategoryDetails(page.category);
                                const excerpt = stripHtml(page.content);
                                const isOwner = String(page.ownerId) === String(userId);

                                return (
                                    <div
                                        key={page.id}
                                        onClick={() => setActivePageId(page.id)}
                                        className={`group relative bg-slate-900/90 border rounded-xl p-3.5 sm:p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl flex flex-col justify-between ${
                                            page.isPinned
                                                ? 'border-amber-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 shadow-amber-900/10'
                                                : 'border-slate-800 hover:border-slate-700 shadow-lg'
                                        }`}
                                    >
                                        {/* Card Top Row: Category pill & Pin / Action Menu */}
                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                                                        <Icon name={catDetails.icon} size={11} className="text-amber-400" />
                                                        {catDetails.label}
                                                    </span>

                                                    {page.isPublic ? (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/40" title="Visible to all players">
                                                            <Icon name="globe" size={9} /> Public
                                                        </span>
                                                    ) : page.visibleTo?.length > 0 ? (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-indigo-950/40 text-indigo-400 border border-indigo-800/40" title={`Shared with ${page.visibleTo.length} players`}>
                                                            <Icon name="users" size={9} /> Shared ({page.visibleTo.length})
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60" title="Private note">
                                                            <Icon name="lock" size={9} /> Private
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-0.5">
                                                    <button
                                                        onClick={(e) => handleTogglePin(page, e)}
                                                        className={`p-1 rounded-md transition-colors ${
                                                            page.isPinned
                                                                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40'
                                                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 opacity-60 group-hover:opacity-100'
                                                        }`}
                                                        title={page.isPinned ? "Unpin entry" : "Pin entry to top"}
                                                    >
                                                        <Icon name="star" size={15} className={page.isPinned ? "fill-amber-400" : ""} />
                                                    </button>

                                                    <button
                                                        onClick={(e) => handleDuplicate(page, e)}
                                                        className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Duplicate Entry"
                                                    >
                                                        <Icon name="copy" size={13} />
                                                    </button>

                                                    {(role === 'dm' || isOwner) && (
                                                        <button
                                                            onClick={(e) => handleDelete(page, e)}
                                                            className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                            title="Delete Entry"
                                                        >
                                                            <Icon name="trash-2" size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card Title */}
                                            <h3 className="font-bold text-slate-100 text-sm sm:text-base group-hover:text-amber-400 transition-colors line-clamp-1 mb-1">
                                                {page.title || "Untitled Entry"}
                                            </h3>

                                            {/* Excerpt */}
                                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-2.5">
                                                {excerpt || <span className="italic text-slate-600">Empty entry. Click to write...</span>}
                                            </p>
                                        </div>

                                        {/* Card Footer: Tags, Author, Date */}
                                        <div className="pt-2.5 border-t border-slate-800/80 flex flex-col gap-1.5">
                                            {page.tags && page.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {page.tags.slice(0, 3).map((tag, idx) => (
                                                        <span key={idx} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                    {page.tags.length > 3 && (
                                                        <span className="text-[9px] text-slate-500 self-center">
                                                            +{page.tags.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                                                <span>
                                                    {new Date(page.updatedAt || page.created || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                                <span className="font-medium text-slate-400">
                                                    {isOwner ? 'You' : (page.ownerId === 'dm' ? 'DM' : 'Player')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* Empty State */
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-3 shadow-xl">
                                <Icon name="book-open" size={24} />
                            </div>
                            <h4 className="text-base font-bold text-slate-300 mb-1">No Journal Entries Found</h4>
                            <p className="text-xs text-slate-500 max-w-xs mb-4">
                                {searchQuery || selectedCategory !== 'all' || accessFilter !== 'all'
                                    ? "No entries match your active filters."
                                    : "Start writing session notes, quests, lore, or loot logs."}
                            </p>
                            <div className="flex items-center gap-2">
                                {(searchQuery || selectedCategory !== 'all' || accessFilter !== 'all') ? (
                                    <button
                                        onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setAccessFilter('all'); }}
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                                    >
                                        Clear Filters
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleCreate(null)}
                                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shadow-lg flex items-center gap-1.5"
                                    >
                                        <Icon name="plus" size={13} />
                                        <span>Create Entry</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default JournalView;