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

    // --- TABLE MANAGEMENT ---
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
        
        quill.clipboard.dangerouslyPasteHTML(range ? range.index : 0, tableHTML);
    };

    const deleteRow = () => {
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
            handleChange(quill.root.innerHTML); // Force save
        } else {
            alert("Cursor must be inside a table row to delete it.");
        }
    };

    const deleteCol = () => {
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
            // Calculate column index
            const colIndex = Array.from(tr.children).indexOf(td);
            
            // Remove that cell from EVERY row
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                if (row.children[colIndex]) row.children[colIndex].remove();
            });
            handleChange(quill.root.innerHTML);
        } else {
            alert("Cursor must be inside a table cell to delete the column.");
        }
    };

    // --- IMAGE RESIZING ---
    const resizeImage = () => {
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        if (!range) return;

        // Check if we clicked ON an image or cursor is near one
        const [leaf] = quill.getLeaf(range.index);
        let img = null;

        if (leaf.domNode.tagName === 'IMG') img = leaf.domNode;
        // Sometimes selection is just after the image
        else if (leaf.domNode.previousSibling && leaf.domNode.previousSibling.tagName === 'IMG') {
            img = leaf.domNode.previousSibling;
        }

        if (img) {
            const currentWidth = img.style.width || "100%";
            const newWidth = prompt("Enter new width (e.g., '50%', '300px'):", currentWidth);
            if (newWidth) {
                img.style.width = newWidth;
                handleChange(quill.root.innerHTML);
            }
        } else {
            alert("Please select (highlight) an image or place your cursor immediately after it.");
        }
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
                quill.insertText(range ? range.index : quill.getLength(), ` ${res}`);
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
            <div className="p-2 md:p-4 border-b border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/80 shrink-0 gap-2">
                <div className="flex items-center gap-2 overflow-hidden w-full md:w-auto">
                    <button onClick={onBack} className="md:hidden text-slate-400 hover:text-white p-2 -ml-2"><Icon name="arrow-left" size={24} /></button>
                    <h3 className="font-bold text-base md:text-lg text-slate-200 truncate max-w-[120px] md:max-w-xs">{page.title}</h3>
                    
                    <button onClick={toggleVisibility} className={`text-[10px] md:text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors flex-shrink-0 ${page.isPublic ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
                        <Icon name={page.isPublic ? "eye" : "eye-off"} size={12}/> <span className="hidden sm:inline">{page.isPublic ? "Public" : "Private"}</span>
                    </button>

                    <span className={`text-[10px] px-2 py-0.5 rounded ${saveStatus === 'saved' ? 'text-green-500 bg-green-900/10' : 'text-yellow-500 bg-yellow-900/10'}`}>{saveStatus === 'saved' ? 'Saved' : 'Saving...'}</span>
                </div>
                
                {/* EDITOR TOOLS */}
                <div className="flex gap-1 md:gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar">
                    {/* Table Group */}
                    <div className="flex bg-slate-700/50 rounded p-1 gap-1 border border-slate-600">
                        <button onClick={insertDynamicTable} title="Insert Table" className="text-slate-300 hover:text-white p-1 hover:bg-slate-600 rounded"><Icon name="table" size={16}/></button>
                        <button onClick={deleteRow} title="Delete Row" className="text-red-300 hover:text-red-100 p-1 hover:bg-red-900/50 rounded"><Icon name="minus-square" size={16}/></button>
                        <button onClick={deleteCol} title="Delete Column" className="text-red-300 hover:text-red-100 p-1 hover:bg-red-900/50 rounded"><Icon name="columns" size={16}/></button>
                    </div>

                    {/* Image Group */}
                    <div className="flex bg-slate-700/50 rounded p-1 gap-1 border border-slate-600">
                        <button onClick={resizeImage} title="Resize Image" className="text-blue-300 hover:text-blue-100 p-1 hover:bg-blue-900/50 rounded flex items-center gap-1"><Icon name="image" size={16}/><span className="text-[10px] font-bold">SIZE</span></button>
                    </div>

                    <button onClick={handleAiSpark} disabled={aiWorking} className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded ${aiWorking ? 'bg-slate-700 text-slate-500' : 'bg-indigo-600 text-white'}`}><Icon name="sparkles" size={14}/> AI</button>
                    <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
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
