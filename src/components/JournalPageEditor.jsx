import React, { useState, useEffect, useRef } from 'react';
import ReactQuill from 'react-quill-new'; // <--- CHANGED THIS
import 'react-quill-new/dist/quill.snow.css'; // <--- CHANGED THIS
import Icon from './Icon';

const JournalPageEditor = ({ page, onSave, onDelete, onBack, aiHelper }) => {
    const [content, setContent] = useState(page.content || "");
    const [saveStatus, setSaveStatus] = useState("saved");
    const [aiWorking, setAiWorking] = useState(false);
    const quillRef = useRef(null);
    const saveTimerRef = useRef(null);

    // Sync local state when page changes
    useEffect(() => {
        setContent(page.content || "");
    }, [page.id]);

    const handleChange = (value) => {
        setContent(value);
        setSaveStatus("saving");
        
        // Debounce save
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            onSave(page.id, { ...page, content: value });
            setSaveStatus("saved");
        }, 1000);
    };

    const toggleVisibility = () => { 
        onSave(page.id, { ...page, isPublic: !page.isPublic }); 
    };

    const insertTable = () => {
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection();
        const position = range ? range.index : 0;
        
        const tableHTML = `
            <table style="width:100%; border-collapse: collapse; margin: 10px 0;">
                <tbody>
                    <tr><td style="border:1px solid #475569; padding:8px;">Header 1</td><td style="border:1px solid #475569; padding:8px;">Header 2</td></tr>
                    <tr><td style="border:1px solid #475569; padding:8px;">Data 1</td><td style="border:1px solid #475569; padding:8px;">Data 2</td></tr>
                </tbody>
            </table><br/>`;
        
        quill.clipboard.dangerouslyPasteHTML(position, tableHTML);
    };

    const handleAiSpark = async () => {
        if(aiWorking || !aiHelper) return;
        setAiWorking(true);
        const quill = quillRef.current.getEditor();
        const currentText = quill.getText(); // Get plain text for context
        
        try {
            const prompt = `Continue this D&D text. Maintain the tone. Max 3 sentences:\n\n${currentText.slice(-500)}`;
            const res = await aiHelper([{role: 'user', content: prompt}]);
            
            if(res) {
                const range = quill.getSelection();
                const position = range ? range.index : quill.getLength();
                quill.insertText(position, ` ${res}`);
            }
        } catch(e) { alert("AI Brainstorm Failed"); }
        setAiWorking(false);
    };

    // Custom Toolbar Options
    const modules = {
        toolbar: {
            container: [
                [{ 'header': [1, 2, false] }], // h1, h2, normal
                [{ 'size': ['small', false, 'large', 'huge'] }], // text size
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean'] // "Remove Formatting" button
            ],
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900/50">
            {/* Top Bar */}
            <div className="p-2 md:p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                    <button onClick={onBack} className="md:hidden text-slate-400 hover:text-white p-2 -ml-2"><Icon name="arrow-left" size={24} /></button>
                    <h3 className="font-bold text-base md:text-lg text-slate-200 truncate max-w-[120px] md:max-w-xs">{page.title}</h3>
                    <button onClick={toggleVisibility} className={`text-[10px] md:text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors flex-shrink-0 ${page.isPublic ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
                        <Icon name={page.isPublic ? "eye" : "eye-off"} size={12}/> <span className="hidden sm:inline">{page.isPublic ? "Public" : "Private"}</span>
                    </button>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${saveStatus === 'saved' ? 'text-green-500 bg-green-900/10' : 'text-yellow-500 bg-yellow-900/10'}`}>{saveStatus === 'saved' ? 'Saved' : 'Saving...'}</span>
                </div>
                <div className="flex gap-2">
                    {/* Custom Actions injected outside Quill's toolbar */}
                    <button onClick={insertTable} title="Insert Table" className="text-slate-400 hover:text-white p-2 bg-slate-700 rounded"><Icon name="table" size={16}/></button>
                    <button onClick={handleAiSpark} disabled={aiWorking} className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded ${aiWorking ? 'bg-slate-700 text-slate-500' : 'bg-indigo-600 text-white'}`}>
                        <Icon name="sparkles" size={14}/> AI
                    </button>
                    <div className="w-px h-8 bg-slate-700 mx-2"></div>
                    <button onClick={() => onDelete(page.id)} className="text-slate-500 hover:text-red-500 p-2"><Icon name="trash-2" size={20}/></button>
                </div>
            </div>

            {/* The Editor */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <ReactQuill 
                    ref={quillRef}
                    theme="snow"
                    value={content}
                    onChange={handleChange}
                    modules={modules}
                    className="flex-1 overflow-hidden flex flex-col"
                />
            </div>
        </div>
    );
};

export default JournalPageEditor;