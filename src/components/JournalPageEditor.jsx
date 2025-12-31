import React, { useState, useEffect, useRef } from 'react';
import ReactQuill from 'react-quill-new'; 
import 'react-quill-new/dist/quill.snow.css'; 
import Icon from './Icon';

const JournalPageEditor = ({ page, onSave, onDelete, onBack, aiHelper }) => {
    const [content, setContent] = useState(page.content || "");
    const [saveStatus, setSaveStatus] = useState("saved");
    const [aiWorking, setAiWorking] = useState(false);
    const quillRef = useRef(null);
    const saveTimerRef = useRef(null);

    useEffect(() => { setContent(page.content || ""); }, [page.id]);

    const handleChange = (value) => {
        setContent(value);
        setSaveStatus("saving");
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            onSave(page.id, { ...page, content: value });
            setSaveStatus("saved");
        }, 1000);
    };

    const toggleVisibility = () => { 
        onSave(page.id, { ...page, isPublic: !page.isPublic }); 
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
        
        quill.clipboard.dangerouslyPasteHTML(range.index, tableHTML);
    };

    const handleAiSpark = async () => {
        if(aiWorking || !aiHelper) return;
        setAiWorking(true);
        const quill = quillRef.current.getEditor();
        const currentText = quill.getText();
        try {
            const prompt = `Continue this D&D text. Maintain tone. Max 3 sentences:\n\n${currentText.slice(-500)}`;
            const res = await aiHelper([{role: 'user', content: prompt}]);
            if(res) {
                const range = quill.getSelection(true);
                quill.insertText(range.index, ` ${res}`);
            }
        } catch(e) { alert("AI Brainstorm Failed"); }
        setAiWorking(false);
    };

    const modules = {
        toolbar: {
            container: [
                [{ 'header': [1, 2, false] }], 
                [{ 'size': ['small', false, 'large', 'huge'] }], 
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'align': [] }],
                ['link', 'image'],
                ['clean']
            ],
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900/50">
            <div className="p-2 md:p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                    <button onClick={onBack} className="md:hidden text-slate-400 hover:text-white p-2 -ml-2"><Icon name="arrow-left" size={24} /></button>
                    <h3 className="font-bold text-base md:text-lg text-slate-200 truncate max-w-[120px] md:max-w-xs">{page.title}</h3>
                    
                    {/* RESTORED VISIBILITY TOGGLE BUTTON */}
                    <button onClick={toggleVisibility} className={`text-[10px] md:text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors flex-shrink-0 ${page.isPublic ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
                        <Icon name={page.isPublic ? "eye" : "eye-off"} size={12}/> <span className="hidden sm:inline">{page.isPublic ? "Public" : "Private"}</span>
                    </button>

                    <span className={`text-[10px] px-2 py-0.5 rounded ${saveStatus === 'saved' ? 'text-green-500 bg-green-900/10' : 'text-yellow-500 bg-yellow-900/10'}`}>{saveStatus === 'saved' ? 'Saved' : 'Saving...'}</span>
                </div>
                <div className="flex gap-2">
                    <button onClick={insertDynamicTable} title="Insert Custom Table" className="text-slate-400 hover:text-white p-2 bg-slate-700 rounded"><Icon name="table" size={16}/></button>
                    <button onClick={handleAiSpark} disabled={aiWorking} className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded ${aiWorking ? 'bg-slate-700 text-slate-500' : 'bg-indigo-600 text-white'}`}><Icon name="sparkles" size={14}/> AI</button>
                    <div className="w-px h-8 bg-slate-700 mx-2"></div>
                    <button onClick={() => onDelete(page.id)} className="text-slate-500 hover:text-red-500 p-2"><Icon name="trash-2" size={20}/></button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
                <ReactQuill ref={quillRef} theme="snow" value={content} onChange={handleChange} modules={modules} className="flex-1 overflow-hidden flex flex-col" />
            </div>
        </div>
    );
};

export default JournalPageEditor;