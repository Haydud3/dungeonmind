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

const HandoutEditor = ({ onSave, onCancel, savedHandouts = [], onDelete, campaignCode, role }) => {
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

    const imageHandler = () => {
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
        if (!title.trim()) return toast("Please title this document.", "error");
        
        onSave({
            id: id || Date.now(),
            title,
            theme,
            imageUrl,
            content,
            timestamp: Date.now(),
            // START CHANGE: Implement isDraft status
            isDraft: !reveal,
            revealed: reveal // New flag to trigger auto-open for players
            // END CHANGE
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
            toast("Image processed and stored", "success");
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
                ['image', 'clean']
            ],
            handlers: {
                image: imageHandler
            }
        },
        clipboard: { matchVisual: false }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in-95">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">
                
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
                <div className="flex-1 overflow-y-auto custom-scroll p-6 bg-slate-950">
                    
                    {/* COMPOSE TAB */}
                    {activeTab === 'compose' && (
                        <div className="flex flex-col lg:flex-row gap-6 h-full">
                            {/* Left Column: Settings */}
                            <div className="w-full lg:w-1/3 space-y-4 shrink-0">
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Title</label>
                                    <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none" placeholder="e.g. The King's Letter"/>
                                </div>
                                
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Theme</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['parchment', 'stone', 'letter'].map(t => (
                                            <button key={t} onClick={() => setTheme(t)} className={`p-2 rounded border capitalize text-xs ${theme === t ? 'border-amber-500 bg-amber-900/20 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Header Image</label>
                                    <div className="flex gap-2">
                                        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white" placeholder="Image URL..."/>
                                        <button onClick={() => fileInputRef.current.click()} disabled={isUploading} className="bg-slate-800 border border-slate-600 px-2 rounded text-slate-300 hover:text-white">
                                            {isUploading ? <Icon name="loader" size={16} className="animate-spin"/> : <Icon name="upload" size={16}/>}
                                        </button>
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload}/>
                                    </div>
                                </div>

                                {/* Preview of Theme */}
                                <div className={`h-32 rounded border p-4 shadow-inner overflow-hidden relative ${theme === 'parchment' ? 'bg-[#f5e6c8] text-amber-900 border-amber-800' : theme === 'stone' ? 'bg-[#1c1917] text-slate-300 border-slate-600' : 'bg-white text-black border-slate-200'}`}>
                                    {resolvedImageUrl && <img src={resolvedImageUrl} className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" alt=""/>}
                                    <div className="font-bold text-lg mb-1 relative z-10">{title || "Title Preview"}</div>
                                    <div className="text-xs opacity-80 relative z-10">This is how the document will look to your players...</div>
                                    <div className="absolute bottom-2 right-2 text-[10px] uppercase font-bold opacity-50 z-10">Theme Preview</div>
                                </div>
                            </div>

                            {/* Right Column: Editor */}
                            <div className="flex-1 flex flex-col h-[500px] lg:h-auto">
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Body Content</label>
                                <div className={`flex-1 flex flex-col rounded border overflow-hidden handout-editor-wrapper ${theme === 'stone' ? 'border-slate-600' : 'border-slate-300'}`}>
                                    <ReactQuill ref={quillRef} theme="snow" value={content} onChange={setContent} modules={modules} className="flex-1 bg-white text-black flex flex-col h-full"/>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* HISTORY TAB */}
                    {activeTab === 'history' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {savedHandouts
                                .filter(h => role === 'dm' || h.revealed)
                                .map((h) => (
                                <div key={h.id} className="bg-slate-900 border border-slate-700 p-4 rounded-xl hover:border-amber-500 transition-all cursor-pointer group" onClick={() => loadHandout(h)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-white truncate">{h.title}</h4>
                                        {role === 'dm' && <button onClick={(e) => { e.stopPropagation(); onDelete(h.id); }} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100"><Icon name="trash-2" size={16}/></button>}
                                    </div>
                                    <p className="text-xs text-slate-500 mb-3">{new Date(h.timestamp).toLocaleDateString()}</p>
                                    <div className={`h-24 rounded p-2 text-[10px] overflow-hidden opacity-80 ${h.theme === 'parchment' ? 'bg-[#f5e6c8] text-amber-900' : h.theme === 'stone' ? 'bg-[#1c1917] text-slate-400' : 'bg-white text-black'}`}>
                                        <div dangerouslySetInnerHTML={{__html: h.content || "No content"}} />
                                    </div>
                                </div>
                            ))}
                            {savedHandouts.length === 0 && <div className="col-span-full text-center text-slate-500 py-20 italic">No saved handouts.</div>}
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                {activeTab === 'compose' && (
                    <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-3">
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