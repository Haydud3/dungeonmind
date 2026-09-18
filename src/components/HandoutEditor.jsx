import React, { useState, useEffect, useRef } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Icon from './Icon';
import { useDialog } from './DialogProvider';
import { useToast } from './ToastProvider';
import { storeChunkedMap, retrieveChunkedMap, resolveChunkedHtml } from '../utils/storageUtils';
import { compressImage } from '../utils/imageCompressor';
import ResolvedImage from './ResolvedImage';
import { useNewCampaign } from '../contexts/NewCampaignProvider';

// Register ChunkedImage Blot globally once
const ImageBlot = Quill.import('formats/image');
class ChunkedImage extends ImageBlot {
    static create(value) {
        let node = super.create(value);
        if (typeof value === 'string' && value.startsWith('chunked:')) {
            node.setAttribute('data-chunked-src', value);
            node.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'); 
            retrieveChunkedMap(value).then(base64 => {
                if (node) node.setAttribute('src', base64);
            });
        }
        return node;
    }
    static value(node) {
        return node.getAttribute('data-chunked-src') || node.getAttribute('src');
    }
}
ChunkedImage.blotName = 'chunkedImage';
ChunkedImage.tagName = 'img';
Quill.register(ChunkedImage, true);

// THEMES CONFIGURATION
const THEMES = [
    { id: 'parchment', name: 'Aged Scroll', description: 'Classic aged paper with double-bordered antique frame', icon: 'scroll', class: 'handout-theme-parchment' },
    { id: 'decree', name: 'Royal Decree', description: 'Gilded ivory proclamation with royal mandate styling', icon: 'crown', class: 'handout-theme-decree' },
    { id: 'bounty', name: 'Wanted Poster', description: 'Weathered woodblock tavern notice with bounty frame', icon: 'crosshair', class: 'handout-theme-bounty' },
    { id: 'stone', name: 'Carved Tablet', description: 'Dark granite stone tablet with chiseled runic script', icon: 'square', class: 'handout-theme-stone' },
    { id: 'grimoire', name: 'Arcane Tome', description: 'Midnight obsidian & celestial violet arcane script', icon: 'book-open', class: 'handout-theme-grimoire' },
    { id: 'torn', name: 'Torn Note', description: 'Hastily scrawled cursive note on frayed deckle paper', icon: 'file-text', class: 'handout-theme-torn' },
];

// WAX SEAL OPTIONS
const SEAL_COLORS = [
    { id: 'crimson', name: 'Crimson Red', class: 'wax-seal-crimson', dot: 'bg-red-600' },
    { id: 'gold', name: 'Imperial Gold', class: 'wax-seal-gold', dot: 'bg-amber-500' },
    { id: 'blue', name: 'Royal Blue', class: 'wax-seal-blue', dot: 'bg-sky-500' },
    { id: 'emerald', name: 'Emerald Green', class: 'wax-seal-emerald', dot: 'bg-emerald-600' },
    { id: 'obsidian', name: 'Obsidian Black', class: 'wax-seal-obsidian', dot: 'bg-slate-700' },
];

const SEAL_EMBLEMS = [
    { id: 'crown', name: 'Crown', icon: 'crown' },
    { id: 'shield', name: 'Crest', icon: 'shield' },
    { id: 'skull', name: 'Skull', icon: 'skull' },
    { id: 'swords', name: 'Swords', icon: 'swords' },
    { id: 'feather', name: 'Quill', icon: 'feather' },
    { id: 'eye', name: 'Eye', icon: 'eye' },
];

// STARTER TEMPLATES (Non-AI)
const STARTER_TEMPLATES = [
    {
        name: 'Wanted Bounty',
        icon: 'crosshair',
        data: {
            title: 'WANTED: DEAD OR ALIVE',
            subtitle: '1,000 GOLD COIN BOUNTY',
            theme: 'bounty',
            imageLayout: 'frame',
            content: '<p><strong>CHARGES:</strong> High treason, theft of the Royal Reliquary, and arson in the lower ward.</p><p>Known to frequent the docks under the alias <em>"The Cinder Crow"</em>. Considered armed and dangerous.</p><p><em>Deliver in chains to the High Watch of Neverwinter to claim reward.</em></p>',
            seal: { enabled: true, color: 'crimson', emblem: 'skull', text: 'Seal of the High Watch' },
            secretNotes: 'DC 14 Investigation reveals the wanted poster has an invisible thieves\' cant mark in the corner pointing to the Sewers.',
        }
    },
    {
        name: 'Royal Decree',
        icon: 'crown',
        data: {
            title: 'BY DECREE OF THE CROWN',
            subtitle: 'MANDATE OF SPECIAL INQUEST',
            theme: 'decree',
            imageLayout: 'hero',
            content: '<p>Be it known to all citizens, sellswords, and noble houses:</p><p>By order of Lord Neverember, the Whispering Woods are hereby placed under total quarantine following sightings of aberrant horrors.</p><p>Any party of vetted adventurers who ventures forth and retrieves the lost scouting regiment shall receive royal commendation and 500 gold pieces.</p>',
            seal: { enabled: true, color: 'gold', emblem: 'crown', text: 'Royal Seal of the Lord Protector' },
            secretNotes: 'The King knows the regiment was ambushed by a mind flayer scout, but omitted this from the decree to prevent panic.',
        }
    },
    {
        name: 'Dungeon Riddle',
        icon: 'square',
        data: {
            title: 'THE STONE OF FOUR TEARS',
            subtitle: 'INSCRIPTION UPON THE VAULT DOOR',
            theme: 'stone',
            imageLayout: 'hero',
            content: '<p><em>"Four sisters weep in endless gloom,<br>One of fire, one of tomb.<br>One of rivers flowing deep,<br>One where storms forever sleep.<br><br>Turn the red tear toward the sun,<br>And the locked vault will be undone."</em></p>',
            seal: { enabled: true, color: 'obsidian', emblem: 'eye', text: 'Rune of the Arch-Mage' },
            secretNotes: 'Solution: Rotate the Ruby dial north, Obsidian dial south, Sapphire east, and Topaz west.',
        }
    },
    {
        name: 'Tavern Tab & Rumor',
        icon: 'file-text',
        data: {
            title: 'THE SALTY GOBLIN TAVERN',
            subtitle: 'BILL OF FARE & BACK-ALLEY CHATTER',
            theme: 'torn',
            imageLayout: 'contained',
            content: '<p><strong>Order:</strong> 4x Roasted Boar Ribs, 3x Dwarven Stout, 1x Broken Chair (compensation).</p><p><em>Total: 4 Gold, 6 Silver.</em></p><p>---</p><p><em>(Scrawled note on back):</em><br>The Redbrand ruffians meet by the old mill at the stroke of midnight. Word is their boss carries a staff of glass.</p>',
            seal: { enabled: false, color: 'crimson', emblem: 'feather', text: '' },
            secretNotes: 'The tavern keeper is secretly being blackmailed by the Redbrands.',
        }
    },
    {
        name: 'Spell Scroll / Relic',
        icon: 'book-open',
        data: {
            title: 'SCROLL OF THE ASTRAL DRIFT',
            subtitle: '7TH CIRCLE ARCANE SCRIPT',
            theme: 'grimoire',
            imageLayout: 'hero',
            content: '<p><strong>School:</strong> Conjuration (Teleportation)</p><p><strong>Casting Time:</strong> 1 Action | <strong>Range:</strong> Self & 4 Allies</p><p>Upon uttering the command phrase <em>"Vaelis Kor"</em>, a swirling rift of starlight enfolds the caster, carrying the party across planar thresholds.</p><p><em>Requires DC 15 Arcana check if cast by non-wizards.</em></p>',
            seal: { enabled: true, color: 'blue', emblem: 'feather', text: 'Vault of Candlekeep' },
            secretNotes: 'If failed by 5 or more, the caster is deposited in the Astral Sea for 1 round.',
        }
    }
];

export default function HandoutEditor({ onCancel, onLocalReveal }) {
    const { campaign, updateCampaign, deleteHandout, user } = useNewCampaign();
    const savedHandouts = campaign?.handouts || [];
    const role = (campaign && campaign.dmIds?.includes(user?.uid)) ? 'dm' : 'player';
    const toast = useToast();
    const dialog = useDialog();

    // Navigation & View Modes
    const [activeTab, setActiveTab] = useState(role === 'dm' ? 'compose' : 'history');
    const [craftSubTab, setCraftSubTab] = useState('craft'); // 'craft' | 'secrets'
    const [viewMode, setViewMode] = useState('split'); // 'split' | 'edit' | 'preview'
    const [previewPerspective, setPreviewPerspective] = useState('dm'); // 'dm' | 'player'
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'revealed' | 'drafts'

    // Form State
    const [id, setId] = useState(null);
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [theme, setTheme] = useState('parchment');
    const [imageUrl, setImageUrl] = useState('');
    const [resolvedImageUrl, setResolvedImageUrl] = useState('');
    const [imageLayout, setImageLayout] = useState('hero'); // 'hero' | 'contained' | 'frame'
    const [content, setContent] = useState('');
    const [resolvedContent, setResolvedContent] = useState('');
    const [secretNotes, setSecretNotes] = useState('');
    const [isSecretNotesOpen, setIsSecretNotesOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isFullscreenPreviewImg, setIsFullscreenPreviewImg] = useState(false);

    // Wax Seal State
    const [sealEnabled, setSealEnabled] = useState(false);
    const [sealColor, setSealColor] = useState('crimson');
    const [sealEmblem, setSealEmblem] = useState('crown');
    const [sealText, setSealText] = useState('');
    const quillRef = useRef(null);
    const fileInputRef = useRef(null);
    const secretNotesSectionRef = useRef(null);
    const secretNotesInputRef = useRef(null);

    const openAndFocusSecretNotes = () => {
        setActiveTab('compose');
        setCraftSubTab('secrets');
        setIsSecretNotesOpen(true);
        setTimeout(() => {
            secretNotesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            secretNotesInputRef.current?.focus();
        }, 60);
    };

    // Resolve chunked images and HTML body for live preview
    useEffect(() => {
        let isMounted = true;
        const resolve = async () => {
            if (imageUrl?.startsWith('chunked:')) {
                const img = await retrieveChunkedMap(imageUrl);
                if (isMounted) {
                    setResolvedImageUrl(img instanceof Blob ? URL.createObjectURL(img) : img);
                }
            } else {
                if (isMounted) setResolvedImageUrl(imageUrl);
            }
            
            const html = await resolveChunkedHtml(content);
            if (isMounted) setResolvedContent(html);
        };
        resolve();
        return () => { isMounted = false; };
    }, [imageUrl, content]);

    // Apply template
    const handleApplyTemplate = (tpl) => {
        const d = tpl.data;
        setTitle(d.title || '');
        setSubtitle(d.subtitle || '');
        setTheme(d.theme || 'parchment');
        setImageLayout(d.imageLayout || 'hero');
        setContent(d.content || '');
        setSecretNotes(d.secretNotes || '');
        if (d.secretNotes) setIsSecretNotesOpen(true);
        if (d.seal) {
            setSealEnabled(!!d.seal.enabled);
            setSealColor(d.seal.color || 'crimson');
            setSealEmblem(d.seal.emblem || 'crown');
            setSealText(d.seal.text || '');
        } else {
            setSealEnabled(false);
        }
        toast(`Loaded "${tpl.name}" template`, 'info');
    };

    // Resize inline image in Quill
    const resizeImage = async () => {
        const quill = quillRef.current?.getEditor();
        if (!quill) return;
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
            const newWidth = await dialog.prompt("Enter new width (e.g., '50%', '300px'):", currentWidth);
            if (newWidth) {
                img.style.width = newWidth;
                setContent(quill.root.innerHTML);
            }
        } else {
            toast("Please click on an inline image in the editor to resize it.", "warning");
        }
    };

    // Insert inline image into Quill
    const imageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            
            try {
                toast("Processing inline image...", "info");
                const compressedBase64 = await compressImage(file, 800);
                const chunkedId = await storeChunkedMap(compressedBase64, `body_img_${file.name}`);
                
                const editor = quillRef.current.getEditor();
                const range = editor.getSelection(true);
                editor.insertEmbed(range.index, 'chunkedImage', chunkedId, 'user');
                editor.setSelection(range.index + 1, 'silent');
            } catch (err) {
                console.error(err);
                toast("Image insertion failed", "error");
            }
        };
    };

    // Handle primary image upload
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const compressedBase64 = await compressImage(file, 1200);
            const chunkedId = await storeChunkedMap(compressedBase64, `handout_${file.name}`);
            setImageUrl(chunkedId);
            toast("Primary image processed and attached", "success");
        } catch (err) {
            console.error(err);
            toast("Primary image upload failed", "error");
        }
        setIsUploading(false);
    };

    // Save or Reveal Handout
    const handleSubmit = (reveal = false) => {
        if (!title.trim() && !imageUrl && !content.trim()) {
            return toast("Please provide a title, image, or text for the handout.", "error");
        }

        const handout = {
            id: id || Date.now(),
            title: title.trim() || 'Untitled Handout',
            subtitle: subtitle.trim() || '',
            theme,
            imageUrl,
            imageLayout,
            content,
            secretNotes: secretNotes.trim(),
            seal: {
                enabled: sealEnabled,
                color: sealColor,
                emblem: sealEmblem,
                text: sealText.trim(),
            },
            timestamp: Date.now(),
            isDraft: !reveal,
            revealed: reveal,
        };

        const isExisting = handout.id && savedHandouts.some(x => x.id === handout.id);
        const updatedHandouts = isExisting
            ? savedHandouts.map(x => x.id === handout.id ? handout : x)
            : [handout, ...savedHandouts];

        const updatePayload = {
            handouts: updatedHandouts,
        };

        if (reveal) {
            updatePayload['campaign.activeHandout'] = handout;
        }

        updateCampaign(updatePayload);
        toast(reveal ? "Handout Revealed to Players!" : "Handout Saved as Private Draft", "success");

        if (reveal && onLocalReveal) {
            onLocalReveal(handout);
        }
    };

    // Load Handout from Archives
    const loadHandout = (h) => {
        setId(h.id);
        setTitle(h.title || '');
        setSubtitle(h.subtitle || '');
        setTheme(h.theme || 'parchment');
        setImageUrl(h.imageUrl || '');
        setImageLayout(h.imageLayout || 'hero');
        setContent(h.content || '');
        setSecretNotes(h.secretNotes || '');
        if (h.secretNotes) setIsSecretNotesOpen(true);
        if (h.seal) {
            setSealEnabled(!!h.seal.enabled);
            setSealColor(h.seal.color || 'crimson');
            setSealEmblem(h.seal.emblem || 'crown');
            setSealText(h.seal.text || '');
        } else {
            setSealEnabled(false);
        }
        setActiveTab('compose');
    };

    // Duplicate Handout
    const duplicateHandout = (e, h) => {
        e.stopPropagation();
        const clone = {
            ...h,
            id: Date.now(),
            title: `${h.title || 'Untitled'} (Copy)`,
            isDraft: true,
            revealed: false,
            timestamp: Date.now(),
        };
        updateCampaign({ handouts: [clone, ...savedHandouts] });
        toast(`Duplicated "${h.title}"`, "success");
    };

    // Delete Handout
    const handleDelete = async (e, handoutId) => {
        e.stopPropagation();
        if (await dialog.confirm("Are you sure you want to delete this handout?", "Delete Handout")) {
            deleteHandout(handoutId);
            toast("Handout deleted", "info");
        }
    };

    // Reset Form for New Handout
    const handleNewHandout = () => {
        setId(null);
        setTitle('');
        setSubtitle('');
        setTheme('parchment');
        setImageUrl('');
        setImageLayout('hero');
        setContent('');
        setSecretNotes('');
        setSealEnabled(false);
        setSealColor('crimson');
        setSealEmblem('crown');
        setSealText('');
    };

    const modules = {
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'align': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['image', 'clean'],
                ['imageResize'] 
            ],
            handlers: {
                image: imageHandler,
                imageResize: resizeImage
            }
        },
        clipboard: { matchVisual: false }
    };

    const selectedThemeObj = THEMES.find(t => t.id === theme) || THEMES[0];
    const selectedSealColorObj = SEAL_COLORS.find(c => c.id === sealColor) || SEAL_COLORS[0];

    // Filtered Saved Handouts
    const filteredHandouts = savedHandouts.filter(h => {
        const matchesSearch = !searchQuery.trim() || 
            h.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            h.subtitle?.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (!matchesSearch) return false;
        if (filterCategory === 'revealed') return h.revealed;
        if (filterCategory === 'drafts') return h.isDraft;
        return true;
    });

    return (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200 select-none">
            <div className="bg-slate-950 border border-slate-700/80 w-full max-w-7xl rounded-2xl shadow-2xl flex flex-col h-[94vh] overflow-hidden">
                
                {/* HEADER */}
                <div className="p-3.5 px-5 border-b border-slate-800 bg-slate-900/90 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                <Icon name="scroll" size={18} />
                            </span>
                            <h3 className="fantasy-font text-amber-400 text-lg font-bold tracking-wide">
                                Handout Studio
                            </h3>
                        </div>

                        {/* Top Tab Bar: Compose vs Archives vs DM Secrets */}
                        <div className="flex bg-slate-950/80 rounded-xl p-0.5 border border-slate-800">
                            {role === 'dm' && (
                                <button
                                    onClick={() => { setActiveTab('compose'); setCraftSubTab('craft'); }}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                                        activeTab === 'compose' && craftSubTab === 'craft'
                                            ? 'bg-amber-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    <Icon name="pen-tool" size={13} />
                                    <span>Studio</span>
                                </button>
                            )}
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                                    activeTab === 'history'
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <Icon name="archive" size={13} />
                                <span>{role === 'dm' ? `Archives (${savedHandouts.length})` : 'Archives'}</span>
                            </button>
                            {role === 'dm' && (
                                <button
                                    onClick={openAndFocusSecretNotes}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer border ${
                                        activeTab === 'compose' && craftSubTab === 'secrets'
                                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                                            : secretNotes.trim()
                                            ? 'border-amber-500/30 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40'
                                            : 'border-transparent text-slate-400 hover:text-white'
                                    }`}
                                    title="Open private DM secret notes"
                                >
                                    <Icon name="lock" size={12} className="text-amber-400" />
                                    <span>DM Secrets</span>
                                    {secretNotes.trim() ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    ) : (
                                        <span className="text-[10px] text-amber-400/60 font-normal">+ Add</span>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* View Controls & Close */}
                    <div className="flex items-center gap-2.5">
                        {activeTab === 'compose' && (
                            <>
                                {/* View Mode Selector (Desktop only) */}
                                <div className="hidden md:flex bg-slate-950/80 rounded-xl p-0.5 border border-slate-800 text-xs">
                                    <button
                                        onClick={() => setViewMode('split')}
                                        className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                            viewMode === 'split' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
                                        }`}
                                        title="Split Studio: Editor & Live Preview"
                                    >
                                        <Icon name="columns" size={12} />
                                        <span>Split</span>
                                    </button>
                                    <button
                                        onClick={() => setViewMode('edit')}
                                        className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                            viewMode === 'edit' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
                                        }`}
                                        title="Editor Only"
                                    >
                                        <Icon name="edit-3" size={12} />
                                        <span>Editor</span>
                                    </button>
                                    <button
                                        onClick={() => setViewMode('preview')}
                                        className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                            viewMode === 'preview' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
                                        }`}
                                        title="Preview Only"
                                    >
                                        <Icon name="eye" size={12} />
                                        <span>Preview</span>
                                    </button>
                                </div>

                                {/* Perspective Switch (DM vs Player) */}
                                <button
                                    onClick={() => setPreviewPerspective(p => p === 'dm' ? 'player' : 'dm')}
                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                                        previewPerspective === 'player'
                                            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                                            : 'bg-amber-950/40 border-amber-500/50 text-amber-300'
                                    }`}
                                    title="Toggle between DM View (with secret notes) and true Player View"
                                >
                                    <Icon name={previewPerspective === 'player' ? 'users' : 'shield'} size={12} />
                                    <span>{previewPerspective === 'player' ? 'Player View' : 'DM View'}</span>
                                </button>
                            </>
                        )}

                        <button
                            onClick={onCancel}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <Icon name="x" size={20} />
                        </button>
                    </div>
                </div>

                {/* MAIN BODY */}
                <div className="flex-1 overflow-hidden flex flex-col bg-slate-950 select-text">
                    
                    {/* ===================== COMPOSE STUDIO TAB ===================== */}
                    {activeTab === 'compose' && (
                        <div className="flex-1 flex overflow-hidden">
                            
                            {/* --- LEFT CRAFTING PANE --- */}
                            {(viewMode === 'split' || viewMode === 'edit') && (
                                <div className={`flex flex-col border-r border-slate-800/80 bg-slate-900/40 overflow-y-auto custom-scroll p-4 space-y-5 ${
                                    viewMode === 'split' ? 'w-full md:w-1/2 lg:w-[48%]' : 'w-full max-w-4xl mx-auto'
                                }`}>
                                    
                                    {/* Left Pane Sub-Tabs: Content vs Secrets */}
                                    {role === 'dm' && (
                                        <div className="flex items-center justify-between p-1 bg-slate-950/90 rounded-xl border border-slate-800 shrink-0 shadow-inner">
                                            <div className="flex items-center gap-1 w-full">
                                                <button
                                                    type="button"
                                                    onClick={() => setCraftSubTab('craft')}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                                        craftSubTab === 'craft'
                                                            ? 'bg-slate-800 text-white shadow-sm'
                                                            : 'text-slate-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Icon name="file-text" size={13} />
                                                    <span>Document Content</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCraftSubTab('secrets');
                                                        setIsSecretNotesOpen(true);
                                                    }}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                                                        craftSubTab === 'secrets'
                                                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                                                            : secretNotes.trim()
                                                            ? 'border-amber-500/30 text-amber-300 hover:bg-amber-950/30'
                                                            : 'border-transparent text-slate-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Icon name="lock" size={13} className="text-amber-400" />
                                                    <span>DM Secret Notes</span>
                                                    {secretNotes.trim() && (
                                                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-bold font-mono">
                                                            ✓ Active
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* DEDICATED DM SECRETS WORKSPACE (when selected on the left) */}
                                    {craftSubTab === 'secrets' ? (
                                        <div className="space-y-4 animate-in fade-in duration-150">
                                            <div className="p-4 rounded-2xl bg-amber-950/20 border-2 border-amber-500/50 shadow-xl space-y-3">
                                                <div className="flex items-center justify-between pb-2 border-b border-amber-500/30">
                                                    <div className="flex items-center gap-2">
                                                        <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                            <Icon name="lock" size={16} />
                                                        </span>
                                                        <div>
                                                            <h4 className="font-bold text-amber-300 text-sm">DM's Eyes Only (Secret Notes & Clues)</h4>
                                                            <p className="text-[11px] text-amber-400/80">These notes are saved with the handout and hidden from players.</p>
                                                        </div>
                                                    </div>
                                                    {secretNotes.trim() && (
                                                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono px-2 py-0.5 rounded font-bold">
                                                            ✓ Note Active
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-xs text-slate-300 leading-relaxed">
                                                    Use this private workspace for DC check targets, puzzle keys, hidden traps, or true NPC motives. Players will never see this text when the handout is revealed.
                                                </p>

                                                {/* Quick Clue Starters */}
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                                                        1-Click Clue Starters:
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {[
                                                            'DC 14 Investigation: ',
                                                            'DC 15 History: ',
                                                            'DC 13 Perception: ',
                                                            'Puzzle Solution: ',
                                                            'Secret Compartment: ',
                                                            'Invisible Ink: ',
                                                        ].map(starter => (
                                                            <button
                                                                key={starter}
                                                                type="button"
                                                                onClick={() => setSecretNotes(prev => prev ? `${prev}\n${starter}` : starter)}
                                                                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-amber-950/60 text-amber-300/90 border border-slate-800 hover:border-amber-500/50 text-[11px] font-mono font-medium transition-all cursor-pointer"
                                                            >
                                                                + {starter}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <textarea
                                                    ref={secretNotesInputRef}
                                                    value={secretNotes}
                                                    onChange={e => setSecretNotes(e.target.value)}
                                                    rows={8}
                                                    placeholder="Type your secret DM notes here... e.g. DC 14 Investigation reveals the seal has an invisible thieves' cant mark in the corner pointing to the Sewers."
                                                    className="w-full bg-slate-950 border border-amber-500/50 rounded-xl p-3 text-xs text-amber-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 placeholder:text-amber-900/60 leading-relaxed font-sans"
                                                />

                                                <div className="flex items-center justify-between pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setCraftSubTab('craft')}
                                                        className="text-xs text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer"
                                                    >
                                                        ← Back to Handout Content
                                                    </button>
                                                    {secretNotes && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSecretNotes('')}
                                                            className="text-xs text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                                        >
                                                            Clear Notes
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* 1. Quick Starter Templates */}
                                            <div>
                                        <div className="text-[11px] uppercase font-bold text-slate-400 mb-2 flex items-center justify-between">
                                            <span className="flex items-center gap-1.5">
                                                <Icon name="sparkles" size={13} className="text-amber-400" />
                                                Starter Templates (1-Click Fill)
                                            </span>
                                            {id && (
                                                <button
                                                    onClick={handleNewHandout}
                                                    className="text-[10px] text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer"
                                                >
                                                    + New Blank
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {STARTER_TEMPLATES.map(tpl => (
                                                <button
                                                    key={tpl.name}
                                                    onClick={() => handleApplyTemplate(tpl)}
                                                    className="px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-amber-300 border border-slate-700/80 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
                                                >
                                                    <Icon name={tpl.icon} size={13} className="text-amber-400" />
                                                    <span>{tpl.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 2. Visual Theme Picker */}
                                    <div>
                                        <label className="text-[11px] uppercase font-bold text-slate-400 mb-2 block">
                                            Handout Theme & Texture
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {THEMES.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => setTheme(t.id)}
                                                    className={`p-2 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                                                        theme === t.id
                                                            ? 'border-amber-500 bg-amber-500/10 text-amber-200 shadow-md ring-1 ring-amber-500/40'
                                                            : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-1.5 font-bold text-xs">
                                                        <Icon name={t.icon} size={14} className={theme === t.id ? 'text-amber-400' : 'text-slate-400'} />
                                                        <span>{t.name}</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 leading-tight">
                                                        {t.description}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 3. Title & Subtitle */}
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[11px] uppercase font-bold text-slate-400 mb-1 block">
                                                Document Title / Header
                                            </label>
                                            <input
                                                value={title}
                                                onChange={e => setTitle(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-serif text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-600"
                                                placeholder="e.g. Royal Decree of Neverwinter"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] uppercase font-bold text-slate-400 mb-1 block">
                                                Subtitle / Caption (Optional)
                                            </label>
                                            <input
                                                value={subtitle}
                                                onChange={e => setSubtitle(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-xs focus:border-amber-500 outline-none transition-all placeholder:text-slate-600"
                                                placeholder="e.g. By Order of the Lord Protector, 3rd Day of Eleint"
                                            />
                                        </div>
                                    </div>

                                    {/* 4. DM's Eyes Only (Secret Notes & Clues) */}
                                    <div ref={secretNotesSectionRef} className="border-2 border-amber-500/50 rounded-xl overflow-hidden bg-amber-950/20 shadow-md transition-all">
                                        <button
                                            type="button"
                                            onClick={() => setIsSecretNotesOpen(o => !o)}
                                            className="w-full p-3 flex items-center justify-between text-left cursor-pointer hover:bg-amber-950/30 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 font-bold text-xs text-amber-400">
                                                <span className="p-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">
                                                    <Icon name="lock" size={13} />
                                                </span>
                                                <span>DM's Eyes Only (Secret Notes & Clues)</span>
                                                {secretNotes.trim() ? (
                                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono px-1.5 py-0.5 rounded font-bold">
                                                        ✓ Active Note
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-amber-400/60 font-normal">
                                                        (Click to add secret DC checks / puzzle clues)
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-amber-400/80 font-mono uppercase font-semibold">
                                                    {isSecretNotesOpen ? 'Hide' : 'Expand'}
                                                </span>
                                                <Icon name={isSecretNotesOpen ? 'chevron-up' : 'chevron-down'} size={14} className="text-amber-400" />
                                            </div>
                                        </button>

                                        {isSecretNotesOpen && (
                                            <div className="p-3.5 pt-0 space-y-2 border-t border-amber-500/25 animate-in fade-in duration-150">
                                                <p className="text-[11px] text-amber-300/80 italic">
                                                    These notes are <strong>strictly hidden from players</strong> when revealed. Use for puzzle solutions, check DCs, or NPC motivations.
                                                </p>
                                                <textarea
                                                    ref={secretNotesInputRef}
                                                    value={secretNotes}
                                                    onChange={e => setSecretNotes(e.target.value)}
                                                    rows={3}
                                                    placeholder="e.g. DC 14 History reveals the seal is from an extinct house. Hidden cache is under the floorboards."
                                                    className="w-full bg-slate-950 border border-amber-500/40 rounded-lg p-2.5 text-xs text-amber-200 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 placeholder:text-amber-900/60 leading-relaxed font-sans"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* 5. Standalone / Header Image */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[11px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                                <Icon name="image" size={13} className="text-amber-400" />
                                                Header / Artwork Image
                                            </label>
                                            {imageUrl && (
                                                <button
                                                    onClick={() => setImageUrl('')}
                                                    className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                                                >
                                                    Remove Artwork
                                                </button>
                                            )}
                                        </div>

                                        {!imageUrl ? (
                                            <div className="flex flex-col gap-2">
                                                <div 
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="w-full h-24 border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-amber-300 cursor-pointer bg-slate-950/60 transition-all group"
                                                >
                                                    {isUploading ? (
                                                        <>
                                                            <Icon name="loader" size={20} className="animate-spin mb-1 text-amber-500" />
                                                            <span className="font-bold text-xs text-amber-400">Processing image...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Icon name="upload-cloud" size={20} className="mb-1 text-slate-500 group-hover:text-amber-400 transition-colors" />
                                                            <span className="font-semibold text-xs">Click to upload image (Map, Portrait, Painting)</span>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Or paste direct image URL (https://...)"
                                                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500 placeholder:text-slate-600"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && e.target.value.trim()) {
                                                                setImageUrl(e.target.value.trim());
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <div className="w-full h-36 rounded-xl overflow-hidden border border-slate-700 relative group bg-black/60 flex items-center justify-center">
                                                    {resolvedImageUrl && (
                                                        <img src={resolvedImageUrl} alt="Handout Artwork" className="w-full h-full object-contain" />
                                                    )}
                                                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                                                        <button
                                                            onClick={() => fileInputRef.current?.click()}
                                                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-1 px-3 rounded-lg text-xs shadow-md cursor-pointer"
                                                        >
                                                            Change Image
                                                        </button>
                                                        <button
                                                            onClick={() => setImageUrl('')}
                                                            className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-1 px-3 rounded-lg text-xs shadow-md cursor-pointer"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Image Layout Selector */}
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-[10px] uppercase font-bold text-slate-500">Presentation:</span>
                                                    {[
                                                        { id: 'hero', label: 'Hero Banner' },
                                                        { id: 'contained', label: 'Contained Art' },
                                                        { id: 'frame', label: 'Framed Portrait' },
                                                    ].map(l => (
                                                        <button
                                                            key={l.id}
                                                            onClick={() => setImageLayout(l.id)}
                                                            className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                                                                imageLayout === l.id
                                                                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                                            }`}
                                                        >
                                                            {l.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                                    </div>

                                    {/* 5. Rich Text Editor */}
                                    <div className="space-y-2">
                                        <label className="text-[11px] uppercase font-bold text-slate-400 flex items-center justify-between">
                                            <span>Body Content (Rich Text)</span>
                                            <span className="text-[10px] text-slate-500 normal-case">Supports bold, lists, and inline images</span>
                                        </label>
                                        <div className="rounded-xl border border-slate-700/80 overflow-hidden bg-white handout-editor-wrapper">
                                            <ReactQuill
                                                ref={quillRef}
                                                theme="snow"
                                                value={content}
                                                onChange={setContent}
                                                modules={modules}
                                                className="min-h-[160px] text-slate-900"
                                            />
                                        </div>
                                    </div>

                                    {/* 6. Wax Seal & Signature Stamp */}
                                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={sealEnabled}
                                                    onChange={e => setSealEnabled(e.target.checked)}
                                                    className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                                />
                                                <span className="text-xs font-bold text-slate-300">
                                                    Attach Wax Seal & Signatory Stamp
                                                </span>
                                            </label>
                                            {sealEnabled && (
                                                <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">
                                                    Enabled
                                                </span>
                                            )}
                                        </div>

                                        {sealEnabled && (
                                            <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-in fade-in">
                                                {/* Wax Color Picker */}
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                                                        Wax Color
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {SEAL_COLORS.map(sc => (
                                                            <button
                                                                key={sc.id}
                                                                onClick={() => setSealColor(sc.id)}
                                                                className={`px-2 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                                                                    sealColor === sc.id
                                                                        ? 'border-amber-400 bg-slate-800 text-white shadow-sm'
                                                                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                                                                }`}
                                                            >
                                                                <span className={`w-3 h-3 rounded-full ${sc.dot}`} />
                                                                <span>{sc.name}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Emblem Picker */}
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                                                        Emblem
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {SEAL_EMBLEMS.map(se => (
                                                            <button
                                                                key={se.id}
                                                                onClick={() => setSealEmblem(se.id)}
                                                                className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-all cursor-pointer ${
                                                                    sealEmblem === se.id
                                                                        ? 'border-amber-400 bg-slate-800 text-amber-300 shadow-sm'
                                                                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                                                                }`}
                                                                title={se.name}
                                                            >
                                                                <Icon name={se.icon} size={14} />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Signatory Caption */}
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                                                        Signatory Line / Caption
                                                    </span>
                                                    <input
                                                        value={sealText}
                                                        onChange={e => setSealText(e.target.value)}
                                                        placeholder="e.g. Signed, High Commander Valen"
                                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 placeholder:text-slate-600"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    </>
                                )}
                                </div>
                            )}

                            {/* --- RIGHT LIVE PREVIEW PANE --- */}
                            {(viewMode === 'split' || viewMode === 'preview') && (
                                <div className={`flex-1 bg-slate-950 flex flex-col overflow-hidden ${
                                    viewMode === 'split' ? 'w-full md:w-1/2 lg:w-[52%]' : 'w-full'
                                }`}>
                                    {/* Live Canvas Top Indicator */}
                                    <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="font-bold text-[11px] uppercase tracking-wider text-slate-300">
                                                Live Real-Time Preview
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {role === 'dm' && (
                                                <button
                                                    type="button"
                                                    onClick={openAndFocusSecretNotes}
                                                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer underline decoration-amber-500/40 hover:decoration-amber-300"
                                                    title="Jump directly to DM secret notes editor"
                                                >
                                                    <Icon name="lock" size={11} />
                                                    <span>{secretNotes.trim() ? 'Edit DM Secret' : '+ Add DM Secret'}</span>
                                                </button>
                                            )}
                                            <span className="text-[10px] text-slate-500">
                                                Theme: <strong className="text-amber-400 capitalize">{selectedThemeObj.name}</strong>
                                            </span>
                                        </div>
                                    </div>

                                    {/* The Authentic Handout Canvas */}
                                    <div className="flex-1 overflow-y-auto custom-scroll p-4 md:p-8 flex items-start justify-center bg-slate-950/90">
                                        <div className={`w-full max-w-2xl rounded-2xl p-6 md:p-8 transition-all relative ${selectedThemeObj.class}`}>
                                            
                                            {/* DM Secret Badge (Visible only in DM Preview) */}
                                            {previewPerspective === 'dm' && secretNotes.trim() && (
                                                <div className="mb-4 p-2.5 rounded-xl bg-amber-950/80 border border-amber-500 text-amber-200 text-xs shadow-lg">
                                                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-amber-400 mb-0.5">
                                                        <Icon name="lock" size={11} />
                                                        <span>DM Secret Clue (Hidden from Players)</span>
                                                    </div>
                                                    <p className="italic text-[11px]">{secretNotes}</p>
                                                </div>
                                            )}

                                            {/* Title & Subtitle */}
                                            {(title || subtitle) && (
                                                <div className="border-b border-current/25 pb-3 mb-4 text-center">
                                                    {title && (
                                                        <h1 className="text-2xl md:text-3xl font-bold tracking-wide leading-tight">
                                                            {title}
                                                        </h1>
                                                    )}
                                                    {subtitle && (
                                                        <p className="text-xs md:text-sm uppercase tracking-widest opacity-75 mt-1 font-semibold">
                                                            {subtitle}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Header Image Presentation */}
                                            {resolvedImageUrl && (
                                                <div className="mb-5 flex justify-center">
                                                    {imageLayout === 'frame' ? (
                                                        <div className="p-2 bg-black/10 border-2 border-current/40 rounded-xl shadow-lg relative group max-w-xs w-full">
                                                            <img
                                                                src={resolvedImageUrl}
                                                                alt="Handout"
                                                                className="w-full h-48 object-cover rounded-lg"
                                                            />
                                                            <button
                                                                onClick={() => setIsFullscreenPreviewImg(true)}
                                                                className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded p-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                                                title="Fullscreen"
                                                            >
                                                                <Icon name="maximize" size={14} />
                                                            </button>
                                                        </div>
                                                    ) : imageLayout === 'contained' ? (
                                                        <div className="relative group max-w-md w-full">
                                                            <img
                                                                src={resolvedImageUrl}
                                                                alt="Handout"
                                                                className="w-full max-h-64 object-contain rounded-lg drop-shadow-md"
                                                            />
                                                            <button
                                                                onClick={() => setIsFullscreenPreviewImg(true)}
                                                                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded p-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                                                title="Fullscreen"
                                                            >
                                                                <Icon name="maximize" size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        // Hero banner
                                                        <div className="w-full relative group rounded-xl overflow-hidden shadow-md">
                                                            <img
                                                                src={resolvedImageUrl}
                                                                alt="Handout"
                                                                className="w-full max-h-72 object-cover"
                                                            />
                                                            <button
                                                                onClick={() => setIsFullscreenPreviewImg(true)}
                                                                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded p-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                                                title="Fullscreen"
                                                            >
                                                                <Icon name="maximize" size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Body Content */}
                                            {resolvedContent ? (
                                                <div 
                                                    className="handout-content-display text-sm md:text-base leading-relaxed mb-6"
                                                    dangerouslySetInnerHTML={{ __html: resolvedContent }}
                                                />
                                            ) : !resolvedImageUrl && (
                                                <div className="py-12 text-center opacity-40 italic text-sm">
                                                    Start typing in the Crafting Studio to see your handout come to life...
                                                </div>
                                            )}

                                            {/* Wax Seal & Signatory Stamp */}
                                            {sealEnabled && (
                                                <div className="mt-8 pt-4 border-t border-current/20 flex items-center justify-between">
                                                    <div className="text-xs font-serif italic opacity-80 font-semibold">
                                                        {sealText || 'Official Handout'}
                                                    </div>
                                                    <div className={`wax-seal ${selectedSealColorObj.class}`} title={sealText || 'Seal of Authenticity'}>
                                                        <Icon name={sealEmblem} size={20} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===================== SAVED HANDOUTS / ARCHIVES TAB ===================== */}
                    {activeTab === 'history' && (
                        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                            {/* Archive Toolbar */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5 shrink-0">
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="flex bg-slate-900 rounded-xl p-0.5 border border-slate-800 text-xs">
                                        {[
                                            { id: 'all', label: `All (${savedHandouts.length})` },
                                            { id: 'revealed', label: `Revealed (${savedHandouts.filter(h => h.revealed).length})` },
                                            { id: 'drafts', label: `Drafts (${savedHandouts.filter(h => h.isDraft).length})` },
                                        ].map(fc => (
                                            <button
                                                key={fc.id}
                                                onClick={() => setFilterCategory(fc.id)}
                                                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                                    filterCategory === fc.id
                                                        ? 'bg-amber-600 text-white shadow-sm'
                                                        : 'text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                {fc.label}
                                            </button>
                                        ))}
                                    </div>

                                    {role === 'dm' && (
                                        <button
                                            onClick={() => {
                                                handleNewHandout();
                                                setActiveTab('compose');
                                            }}
                                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ml-auto sm:ml-0"
                                        >
                                            <Icon name="plus" size={13} />
                                            <span>New Handout</span>
                                        </button>
                                    )}
                                </div>

                                {/* Search Bar */}
                                <div className="relative w-full sm:w-64">
                                    <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Search handouts..."
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-amber-500 placeholder:text-slate-600"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                        >
                                            <Icon name="x" size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Cards Grid */}
                            <div className="flex-1 overflow-y-auto custom-scroll">
                                {filteredHandouts.length === 0 ? (
                                    <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
                                        <Icon name="scroll" size={32} className="opacity-40" />
                                        <p className="text-sm font-semibold">No handouts found matching criteria.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                                        {filteredHandouts.map(h => {
                                            const hTheme = THEMES.find(t => t.id === h.theme) || THEMES[0];
                                            return (
                                                <div
                                                    key={h.id}
                                                    onClick={() => role === 'dm' ? loadHandout(h) : (onLocalReveal && onLocalReveal(h))}
                                                    className="bg-slate-900/80 border border-slate-800 hover:border-amber-500/60 p-4 rounded-2xl transition-all cursor-pointer group flex flex-col justify-between gap-3 shadow-md hover:shadow-amber-500/5 hover:-translate-y-0.5"
                                                >
                                                    <div className="space-y-2">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <h4 className="font-bold text-slate-100 text-sm truncate group-hover:text-amber-400 transition-colors">
                                                                    {h.title || 'Untitled Handout'}
                                                                </h4>
                                                                {h.subtitle && (
                                                                    <p className="text-[11px] text-slate-400 truncate">
                                                                        {h.subtitle}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* Status Badge */}
                                                            {h.revealed ? (
                                                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                                                                    <Icon name="eye" size={10} />
                                                                    <span>Revealed</span>
                                                                </span>
                                                            ) : (
                                                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                                                                    <Icon name="lock" size={10} />
                                                                    <span>Draft</span>
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* DM Secret Note Snippet */}
                                                        {role === 'dm' && h.secretNotes && h.secretNotes.trim() && (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/25 px-2 py-1 rounded-lg">
                                                                <Icon name="lock" size={11} className="text-amber-400 shrink-0" />
                                                                <span className="truncate" title={h.secretNotes}>
                                                                    Secret: {h.secretNotes}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Mini Thematic Preview Window */}
                                                        <div className={`h-24 rounded-xl p-2.5 text-[10px] overflow-hidden relative shadow-inner border border-black/20 ${hTheme.class}`}>
                                                            {h.imageUrl && (
                                                                <div className="absolute inset-0 z-0 pointer-events-none opacity-30">
                                                                    <ResolvedImage id={h.imageUrl} className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <div className="relative z-10 line-clamp-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: h.content || '' }} />
                                                        </div>
                                                    </div>

                                                    {/* Card Actions Footer */}
                                                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-xs">
                                                        <span className="text-[10px] text-slate-500 font-mono">
                                                            {new Date(h.timestamp || Date.now()).toLocaleDateString()}
                                                        </span>

                                                        {role === 'dm' && (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (onLocalReveal) onLocalReveal(h);
                                                                    }}
                                                                    className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                                                                    title="Quick View (with DM Secrets)"
                                                                >
                                                                    <Icon name="eye" size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => duplicateHandout(e, h)}
                                                                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                                                                    title="Duplicate handout"
                                                                >
                                                                    <Icon name="copy" size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDelete(e, h.id)}
                                                                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                                                                    title="Delete handout"
                                                                >
                                                                    <Icon name="trash-2" size={13} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* BOTTOM ACTION FOOTER (Only on Compose Tab) */}
                {activeTab === 'compose' && role === 'dm' && (
                    <div className="p-3.5 px-5 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            {id && (
                                <button
                                    onClick={handleNewHandout}
                                    className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                                >
                                    + Start New Blank
                                </button>
                            )}

                            {role === 'dm' && (
                                <button
                                    type="button"
                                    onClick={openAndFocusSecretNotes}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm ${
                                        craftSubTab === 'secrets'
                                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-amber-300 hover:border-slate-700'
                                    }`}
                                    title="Open and edit private DM secret notes"
                                >
                                    <Icon name="lock" size={13} className="text-amber-400" />
                                    <span>DM Secrets</span>
                                    {secretNotes.trim() ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    ) : (
                                        <span className="text-[10px] text-amber-400/60 font-normal">+ Add</span>
                                    )}
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                            <button
                                onClick={onCancel}
                                className="px-3.5 py-1.5 text-slate-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                            >
                                Close
                            </button>

                            <button
                                onClick={() => handleSubmit(false)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer active:scale-95 shadow-sm flex items-center gap-1.5"
                            >
                                <Icon name="lock" size={13} className="text-amber-400" />
                                <span>Save Private Draft</span>
                            </button>

                            <button
                                onClick={() => handleSubmit(true)}
                                className="px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 cursor-pointer active:scale-95 hover:shadow-amber-500/20"
                            >
                                <Icon name="eye" size={14} />
                                <span>Reveal to All Players</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Fullscreen Image Inspection Modal */}
            {isFullscreenPreviewImg && resolvedImageUrl && (
                <div 
                    className="fixed inset-0 z-[150] bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
                    onClick={() => setIsFullscreenPreviewImg(false)}
                >
                    <img
                        src={resolvedImageUrl}
                        alt="Fullscreen Artwork"
                        className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-lg animate-in zoom-in-95 duration-150"
                    />
                    <button
                        onClick={() => setIsFullscreenPreviewImg(false)}
                        className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full cursor-pointer"
                    >
                        <Icon name="x" size={24} />
                    </button>
                </div>
            )}
        </div>
    );
}