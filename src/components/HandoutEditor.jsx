import React, { useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Icon from './Icon';

const HandoutEditor = ({ onSave, onCancel, savedHandouts = [], onDelete }) => {
    // Tab state: 'compose' or 'history'
    const [activeTab, setActiveTab] = useState('compose');
    
    // Editor State
    const [id, setId] = useState(null); // Track ID if editing existing
    const [title, setTitle] = useState('');
    const [theme, setTheme] = useState('parchment');
    const [imageUrl, setImageUrl] = useState('');
    const [content, setContent] = useState('');

    const handleSubmit = () => {
        onSave({
            id: id || Date.now(), // Preserve ID if editing, else new
            title,
            theme,
            imageUrl,
            content,
            timestamp: Date.now()
        });
    };

    const loadHandout = (h) => {
        setId(h.id);
        setTitle(h.title || '');
        setTheme(h.theme || 'parchment');
        setImageUrl(h.imageUrl || '');
        setContent(h.content || h.text || '');
        setActiveTab('compose');
    };

    // Handle Local File Upload
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setImageUrl(event.target.result); // Sets the image to the Base64 data
        };
        reader.readAsDataURL(file);
    };

    const resetForm = () => {
        setId(null);
        setTitle('');
        setTheme('parchment');
        setImageUrl('');
        setContent('');
    };

    const modules = {
        toolbar: [
            [{ 'header': [1, 2, false] }],
            ['bold', 'italic', 'underline'],
            [{ 'align': [] }],
            ['image'], 
            ['clean']
        ]
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in duration-200">
                {/* Header with Tabs */}
                <div className="p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h3 className="fantasy-font text-amber-500 text-xl hidden sm:block">Handout Manager</h3>
                        <div className="flex bg-slate-900 rounded p-1 border border-slate-700">
                            <button 
                                onClick={() => setActiveTab('compose')} 
                                className={`px-3 py-1 text-xs font-bold rounded flex items-center gap-2 ${activeTab === 'compose' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Icon name="pen-tool" size={14}/> Compose
                            </button>
                            <button 
                                onClick={() => setActiveTab('history')} 
                                className={`px-3 py-1 text-xs font-bold rounded flex items-center gap-2 ${activeTab === 'history' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Icon name="history" size={14}/> History
                            </button>
                        </div>
                    </div>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white"><Icon name="x" size={20}/></button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto custom-scroll p-6">
                    
                    {/* COMPOSE TAB */}
                    {activeTab === 'compose' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <h4 className="text-xs font-bold text-slate-500 uppercase">New / Edit Handout</h4>
                                <button onClick={resetForm} className="text-xs text-slate-400 hover:text-amber-500">Clear Form</button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Title</label>
                                    <input 
                                        value={title} 
                                        onChange={e => setTitle(e.target.value)} 
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-amber-500 outline-none"
                                        placeholder="e.g. The King's Decree"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Style Theme</label>
                                    <select 
                                        value={theme} 
                                        onChange={e => setTheme(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-amber-500 outline-none"
                                    >
                                        <option value="parchment">📜 Ancient Parchment</option>
                                        <option value="stone">🌑 Dark Stone Tablet</option>
                                        <option value="letter">🖋️ Royal Letter</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Image Header (Optional)</label>
                                <div className="flex gap-2 items-center">
                                    <input 
                                        value={imageUrl} 
                                        onChange={e => setImageUrl(e.target.value)} 
                                        className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm font-mono placeholder:text-slate-600"
                                        placeholder="https://... or Upload -->"
                                    />
                                    <label className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded cursor-pointer border border-slate-600" title="Upload Image">
                                        <Icon name="upload" size={20}/>
                                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload}/>
                                    </label>
                                    {imageUrl && (
                                        <div className="w-10 h-10 shrink-0 bg-slate-800 rounded border border-slate-600 overflow-hidden group relative">
                                            <img src={imageUrl} className="w-full h-full object-cover" alt="Preview"/>
                                            <button onClick={() => setImageUrl('')} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 text-white"><Icon name="x" size={16}/></button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col h-72">
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Message Content (Live Preview)</label>
                                <div className={`flex-1 overflow-hidden flex flex-col border border-slate-600 rounded handout-editor-wrapper handout-theme-${theme}`}>
                                    <ReactQuill 
                                        theme="snow" 
                                        value={content} 
                                        onChange={setContent} 
                                        modules={modules}
                                        className="flex-1 overflow-y-auto"
                                        placeholder="Write your message here..." 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* HISTORY TAB */}
                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            {savedHandouts.length === 0 ? (
                                <div className="text-center text-slate-500 py-10">No saved handouts yet.</div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {savedHandouts.map((h) => (
                                        <div key={h.id} className="bg-slate-800 border border-slate-700 p-3 rounded flex justify-between items-center group hover:border-amber-500/50 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-10 h-10 shrink-0 rounded border flex items-center justify-center text-xl bg-cover bg-center ${h.theme === 'parchment' ? 'bg-[#f5e6c8] text-amber-900 border-amber-800' : h.theme === 'stone' ? 'bg-[#1c1917] text-slate-400 border-slate-600' : 'bg-white text-black border-slate-300'}`}>
                                                    {h.theme === 'parchment' ? '📜' : h.theme === 'stone' ? '🌑' : '🖋️'}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-slate-200 truncate">{h.title || "Untitled Handout"}</div>
                                                    <div className="text-xs text-slate-500">{new Date(h.timestamp).toLocaleString()}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => loadHandout(h)} 
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1"
                                                >
                                                    <Icon name="upload" size={14}/> Load
                                                </button>
                                                <button 
                                                    onClick={() => onDelete(h.id)} 
                                                    className="bg-slate-700 hover:bg-red-900 text-slate-400 hover:text-white p-1.5 rounded transition-colors"
                                                    title="Delete"
                                                >
                                                    <Icon name="trash-2" size={16}/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Actions (Only visible in Compose Mode) */}
                {activeTab === 'compose' && (
                    <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-3">
                        <button onClick={onCancel} className="px-4 py-2 rounded text-slate-400 hover:text-white font-bold">Cancel</button>
                        <button onClick={handleSubmit} className="px-6 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg flex items-center gap-2">
                            <Icon name="eye" size={18}/> Reveal & Save
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HandoutEditor;