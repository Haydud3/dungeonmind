import React, { useState, useEffect, useRef } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { storeChunkedMap, retrieveChunkedMap, resolveChunkedHtml } from '../utils/storageUtils';
import { compressImage } from '../utils/imageCompressor';

// Define and Register Custom Blot globally to ensure registration happens once
const ImageBlot = Quill.import('formats/image');
class ChunkedImage extends ImageBlot {
    static create(value) {
        let node = super.create(value);
        if (typeof value === 'string' && value.startsWith('chunked:')) {
            node.setAttribute('data-chunked-src', value);
            // Transparent 1x1 GIF placeholder
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

import { useNewCampaign } from '../contexts/NewCampaignProvider';

const HandoutEditor = ({ onCancel, onLocalReveal }) => {
    const { campaign, updateCampaign, deleteHandout, user } = useNewCampaign();
    const savedHandouts = campaign?.handouts || [];
    const role = (campaign && campaign.dmIds?.includes(user?.uid)) ? 'dm' : 'player';
    const [activeTab, setActiveTab] = useState(role === 'dm' ? 'compose' : 'history');
    const toast = useToast();
    
    // Editor State
    const [id, setId] = useState(null);
    const [title, setTitle] = useState('');
    const [theme, setTheme] = useState('parchment');
    const [imageUrl, setImageUrl] = useState('');
    const [resolvedImageUrl, setResolvedImageUrl] = useState('');
    const [resolvedContent, setResolvedContent] = useState('');
    const [content, setContent] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const quillRef = useRef(null);
    const fileInputRef = useRef(null);

    // Resolve chunked images and HTML body for preview
    useEffect(() => {
        const resolve = async () => {
            if (imageUrl?.startsWith('chunked:')) {
                const img = await retrieveChunkedMap(imageUrl);
                setResolvedImageUrl(img);
            } else {
                setResolvedImageUrl(imageUrl);
            }
            
            const html = await resolveChunkedHtml(content);
            setResolvedContent(html);
        };
        resolve();
    }, [imageUrl, content]);

    const resizeImage = () => {
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
            const newWidth = prompt("Enter new width (e.g., '50%', '300px'):", currentWidth);
            if (newWidth) {
                img.style.width = newWidth;
                setContent(quill.root.innerHTML);
            }
        } else {
            toast("Please select an inline image to resize.", "warning");
        }
    };

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

    const handleSubmit = (reveal = false) => {
        if (!title.trim() && !imageUrl) return toast("Please provide a title or a standalone image.", "error");
        
        const handout = {
            id: id || Date.now(),
            title: title || 'Untitled Handout',
            theme,
            imageUrl,
            content,
            timestamp: Date.now(),
            isDraft: !reveal,
            revealed: reveal
        };

        const isExisting = handout.id && savedHandouts.some(x => x.id === handout.id);
      
        const updatedHandouts = isExisting 
            ? savedHandouts.map(x => x.id === handout.id ? handout : x)
            : [handout, ...savedHandouts];

        updateCampaign({ 
            handouts: updatedHandouts, 
            'campaign.activeHandout': handout 
        });
        toast(reveal ? "Saved & Revealed to Players!" : "Handout Saved (Draft)", "success");
    };

    const loadHandout = (h) => {
        setId(h.id);
        setTitle(h.title || '');
        setTheme(h.theme || 'parchment');
        setImageUrl(h.imageUrl || '');
        setContent(h.content || '');
        setActiveTab('compose');
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const compressedBase64 = await compressImage(file, 1200);
            const chunkedId = await storeChunkedMap(compressedBase64, `handout_${file.name}`);
            setImageUrl(chunkedId);
            toast("Primary image processed and stored", "success");
        } catch (err) {
            console.error(err);
            toast("Processing failed", "error");
        }
        setIsUploading(false);
    };

    const modules = {
        toolbar: {
            container: [
                [{ 'header': [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                [{ 'align': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['image', 'clean'],
                // custom button for resize
                ['imageResize'] 
            ],
            handlers: {
                image: imageHandler,
                imageResize: resizeImage
            }
        },
        clipboard: { matchVisual: false }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in-95">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col h-[90vh] overflow-hidden">
                
                {/* HEADER */}
                <div className="p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h3 className="fantasy-font text-amber-500 text-xl flex items-center gap-2"><Icon name="scroll" size={20}/> Handout Manager</h3>
                        <div className="flex bg-slate-900 rounded p-1 border border-slate-700">
                            {role === 'dm' && (
                                <button onClick={() => setActiveTab('compose')} className={`px-3 py-1 text-xs font-bold rounded flex items-center gap-2 ${activeTab === 'compose' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                    <Icon name="pen-tool" size={14}/> Compose
                                </button>
                            )}
                            <button onClick={() => setActiveTab('history')} className={`px-3 py-1 text-xs font-bold rounded flex items-center gap-2 ${activeTab === 'history' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                <Icon name="history" size={14}/> {role === 'dm' ? `Saved (${savedHandouts.length})` : 'Archives'}
                            </button>
                        </div>
                    </div>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white"><Icon name="x" size={24}/></button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto custom-scroll p-4 md:p-6 bg-slate-950">
                    
                    {/* COMPOSE TAB */}
                    {activeTab === 'compose' && (
                        <div className="flex flex-col lg:flex-row gap-6 h-full">
                            {/* Left Column: Settings */}
                            <div className="w-full lg:w-64 space-y-6 shrink-0">
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Title / Caption</label>
                                    <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none" placeholder="e.g. The King's Letter"/>
                                </div>
                                
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Text Theme</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {['parchment', 'stone', 'letter'].map(t => (
                                            <button key={t} onClick={() => setTheme(t)} className={`p-2 rounded border capitalize text-xs text-left ${theme === t ? 'border-amber-500 bg-amber-900/20 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'}`}>
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Help Box */}
                                <div className="bg-slate-800/50 border border-slate-700 rounded p-3 text-xs text-slate-400 space-y-2">
                                    <p><strong className="text-amber-500">Standalone Image Mode:</strong> Upload a Primary Image and leave the Body Content empty. The image will be shown full-size to players.</p>
                                    <p><strong className="text-blue-400">Document Mode:</strong> Write in the Body Content. You can mix text and insert inline images via the editor toolbar.</p>
                                </div>
                            </div>

                            {/* Right Column: Editor & Primary Image */}
                            <div className="flex-1 flex flex-col min-h-0 space-y-4">
                                
                                {/* PRIMARY IMAGE DROPZONE */}
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block flex items-center justify-between">
                                        <span>Primary Standalone Image</span>
                                        {imageUrl && <button onClick={() => setImageUrl('')} className="text-red-400 hover:text-red-300">Remove</button>}
                                    </label>
                                    {!imageUrl ? (
                                        <div 
                                            onClick={() => fileInputRef.current.click()}
                                            className="w-full h-32 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:text-white hover:border-slate-500 cursor-pointer bg-slate-900/50 transition-colors"
                                        >
                                            {isUploading ? (
                                                <><Icon name="loader" size={24} className="animate-spin mb-2 text-amber-500"/><span className="font-bold text-amber-500">Uploading...</span></>
                                            ) : (
                                                <><Icon name="image" size={24} className="mb-2"/><span className="font-bold">Click to add a full-page image (e.g. Map, Painting)</span></>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full h-48 rounded-lg overflow-hidden border border-slate-600 relative group bg-black">
                                            {resolvedImageUrl && <img src={resolvedImageUrl} alt="Primary Handout" className="w-full h-full object-contain" />}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <button onClick={() => fileInputRef.current.click()} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded shadow-lg">Change Image</button>
                                            </div>
                                        </div>
                                    )}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload}/>
                                </div>

                                {/* QUILL EDITOR */}
                                <div className="flex-1 flex flex-col min-h-[400px]">
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 flex items-center justify-between">
                                        <span>Body Content (Optional)</span>
                                    </label>
                                    <style>{`.ql-imageResize { padding: 4px; display: flex; align-items: center; justify-content: center; } .ql-imageResize::before { content: '⤡'; font-size: 16px; line-height: 1; }`}</style>
                                    <div className={`flex-1 flex flex-col rounded border overflow-hidden handout-editor-wrapper bg-white ${theme === 'stone' ? 'border-slate-600' : 'border-slate-300'}`}>
                                        <ReactQuill ref={quillRef} theme="snow" value={content} onChange={setContent} modules={modules} className="flex-1 text-black flex flex-col h-full"/>
                                    </div>
                                </div>
                                
                            </div>
                        </div>
                    )}



                    {/* HISTORY TAB */}
                    {activeTab === 'history' && (
                        <div className="space-y-8">
                            {/* DRAFTS SECTION (DM ONLY) */}
                            {role === 'dm' && savedHandouts.filter(h => h.isDraft).length > 0 && (
                                <div>
                                    <h4 className="text-xs uppercase font-bold text-amber-500/50 mb-3 tracking-widest flex items-center gap-2">
                                        <div className="h-px flex-1 bg-amber-500/20"></div>
                                        Drafts (Private)
                                        <div className="h-px flex-1 bg-amber-500/20"></div>
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {savedHandouts.filter(h => h.isDraft).map((h) => (
                                            <div key={h.id} className="bg-slate-900 border border-slate-700 p-4 rounded-xl hover:border-amber-500 transition-all cursor-pointer group" onClick={() => loadHandout(h)}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-white truncate">{h.title}</h4>
                                                    <button onClick={(e) => { e.stopPropagation(); deleteHandout(h.id); }} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100"><Icon name="trash-2" size={16}/></button>
                                                </div>
                                                <p className="text-xs text-slate-500 mb-3">{new Date(h.timestamp).toLocaleDateString()}</p>
                                                <div className={`h-24 rounded p-2 text-[10px] overflow-hidden opacity-80 ${h.theme === 'parchment' ? 'bg-[#f5e6c8] text-amber-900' : h.theme === 'stone' ? 'bg-[#1c1917] text-slate-400' : 'bg-white text-black'} relative`}>
                                                    {h.imageUrl && <div className="absolute top-1 right-1 bg-blue-500 text-white text-[8px] px-1 rounded">IMAGE</div>}
                                                    <div dangerouslySetInnerHTML={{__html: h.content || (h.imageUrl ? "Standalone Image Handout" : "No content")}} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* REVEALED SECTION */}
                            <div>
                                {role === 'dm' && (
                                    <h4 className="text-xs uppercase font-bold text-slate-500 mb-3 tracking-widest flex items-center gap-2">
                                        <div className="h-px flex-1 bg-slate-800"></div>
                                        The Archive (Revealed)
                                        <div className="h-px flex-1 bg-slate-800"></div>
                                    </h4>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {savedHandouts
                                        .filter(h => !h.isDraft || (role === 'player' && h.revealed))
                                        .map((h) => (
                                        <div key={h.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-blue-500 transition-all cursor-pointer group" onClick={() => role === 'dm' ? loadHandout(h) : onLocalReveal(h)}>
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-bold text-slate-200 truncate flex items-center gap-2">
                                                    {h.title}
                                                    <Icon name="eye" size={12} className="text-blue-400 opacity-50"/>
                                                </h4>
                                                {role === 'dm' && <button onClick={(e) => { e.stopPropagation(); deleteHandout(h.id); }} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100"><Icon name="trash-2" size={16}/></button>}
                                            </div>
                                            <p className="text-xs text-slate-500 mb-3">{new Date(h.timestamp).toLocaleDateString()}</p>
                                            <div className={`h-24 rounded p-2 text-[10px] overflow-hidden opacity-60 grayscale-[0.5] ${h.theme === 'parchment' ? 'bg-[#f5e6c8] text-amber-900' : h.theme === 'stone' ? 'bg-[#1c1917] text-slate-400' : 'bg-white text-black'} relative`}>
                                                {h.imageUrl && <div className="absolute top-1 right-1 bg-blue-500 text-white text-[8px] px-1 rounded grayscale-0">IMAGE</div>}
                                                <div dangerouslySetInnerHTML={{__html: h.content || (h.imageUrl ? "Standalone Image Handout" : "No content")}} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {savedHandouts.length === 0 && <div className="col-span-full text-center text-slate-500 py-20 italic">No saved handouts.</div>}
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                {activeTab === 'compose' && (
                    <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-3 shrink-0">
                        <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold">Cancel</button>
                        <button onClick={() => handleSubmit(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-bold border border-slate-600">Save Only</button>
                        <button onClick={() => handleSubmit(true)} className="px-6 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded text-sm font-bold shadow-lg flex items-center gap-2">
                            <Icon name="eye" size={16}/> Reveal to All
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HandoutEditor;