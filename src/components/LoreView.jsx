import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone'; 
import { ingestPDF, packLore } from '../utils/loreEngine';
import Icon from './Icon';

const LoreView = ({ data, aiHelper, pdfChunks, setPdfChunks, onUploadLore }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // --- PDF PARSER ---
    const processFile = async (file) => {
        setIsProcessing(true);
        setUploadProgress(10);
        
        try {
            // 1. Ingest
            const chunks = await ingestPDF(file, (progress) => {
                setUploadProgress(progress);
            });

            // 2. Pack
            const volumes = packLore(chunks);
            
            // 3. Upload (Using destructure, NOT props.onUploadLore)
            if (onUploadLore) {
                await onUploadLore(volumes);
                alert(`Success! Assimilated ${file.name} (${chunks.length} pages).`);
            } else {
                console.error("onUploadLore function is missing!");
                alert("Error: Upload function not connected.");
            }
            
        } catch (e) {
            console.error(e);
            alert("Failed to process PDF: " + e.message);
        }
        setIsProcessing(false);
        setUploadProgress(0);
    };

    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles?.length) processFile(acceptedFiles[0]);
    }, []);
    
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
        onDrop, 
        accept: {'application/pdf': ['.pdf'], 'text/plain': ['.txt']} 
    });

    const handleSearch = () => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        const lowerQ = searchQuery.toLowerCase();
        const hits = (pdfChunks || []).filter(c => c.content.toLowerCase().includes(lowerQ)).slice(0, 10);
        setSearchResults(hits);
    };

    return (
        <div className="h-full bg-slate-900 flex flex-col p-6 overflow-hidden">
            <div className="max-w-5xl w-full mx-auto flex flex-col h-full gap-6">
                
                {/* HEADER */}
                <div className="shrink-0 flex justify-between items-center border-b border-slate-700 pb-4">
                    <div>
                        <h2 className="text-3xl fantasy-font text-cyan-500">The Archives</h2>
                        <p className="text-slate-400 text-sm">Upload campaign books to feed the DungeonMind.</p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white">{(pdfChunks || []).length}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-widest">Pages Indexed</div>
                    </div>
                </div>

                {/* SEARCH BAR */}
                <div className="shrink-0 relative">
                    <input 
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg py-3 pl-12 pr-4 text-white focus:border-cyan-500 outline-none shadow-lg"
                        placeholder="Search the lore (e.g. 'Glasstaff', 'Neverwinter')..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                    <Icon name="search" className="absolute left-4 top-3.5 text-slate-500"/>
                    <button onClick={handleSearch} className="absolute right-2 top-2 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 px-4 py-1 rounded text-sm font-bold border border-cyan-700/50">Search</button>
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 flex gap-6 overflow-hidden">
                    {/* RESULTS */}
                    <div className="flex-1 overflow-y-auto custom-scroll space-y-4 pr-2">
                        {searchResults.map((hit, i) => (
                            <div key={i} className="bg-slate-800 border border-slate-700 p-4 rounded-lg hover:border-cyan-500/50">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-cyan-400 uppercase bg-cyan-900/20 px-2 py-1 rounded">{hit.title}</span>
                                    <span className="text-[10px] text-slate-500">Page {hit.page}</span>
                                </div>
                                <p className="text-sm text-slate-300 font-mono whitespace-pre-wrap">{hit.content}</p>
                            </div>
                        ))}
                        {searchResults.length === 0 && <div className="text-center text-slate-600 mt-20">No results found.</div>}
                    </div>

                    {/* UPLOAD BOX */}
                    <div className="w-80 shrink-0 flex flex-col gap-4">
                        <div {...getRootProps()} className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${isDragActive ? 'border-cyan-400 bg-cyan-900/10' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800'}`}>
                            <input {...getInputProps()} />
                            {isProcessing ? (
                                <>
                                    <Icon name="loader-2" size={48} className="animate-spin text-cyan-500 mb-4"/>
                                    <div className="text-cyan-400 font-bold animate-pulse">Processing...</div>
                                    <div className="w-full bg-slate-700 h-2 rounded-full mt-4 overflow-hidden">
                                        <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Icon name="upload-cloud" size={48} className="text-slate-500 mb-4"/>
                                    <p className="font-bold text-slate-300 mb-2">Drop PDF Here</p>
                                    <p className="text-xs text-slate-500">Auto-chunking enabled</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoreView;