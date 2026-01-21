import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone'; 
// START CHANGE: Import the new engine tools
import { ingestPDF, packLore } from '../utils/loreEngine';
// END CHANGE
import Icon from './Icon';

const LoreView = ({ data, aiHelper, pdfChunks, setPdfChunks, onUploadLore }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // --- PDF PARSER (Connected to Lore Engine) ---
    const processFile = async (file) => {
        setIsProcessing(true);
        setUploadProgress(10);
        
        try {
            // 1. Ingest (Read PDF using the Engine)
            const chunks = await ingestPDF(file, (progress) => {
                setUploadProgress(progress);
            });

            // 2. Pack (Split into safe volumes)
            const volumes = packLore(chunks);
            
            // 3. Upload (Send to App.jsx -> Firebase)
            await onUploadLore(volumes);
            
            alert(`Successfully assimilated ${file.name} (${chunks.length} pages).`);
            
        } catch (e) {
            console.error(e);
            alert("Failed to process PDF: " + e.message);
        }
        setIsProcessing(false);
        setUploadProgress(0);
    };

    // Dropzone Handler
    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles?.length) processFile(acceptedFiles[0]);
    }, []);
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: {'application/pdf': ['.pdf'], 'text/plain': ['.txt']} });

    // --- SEARCH LOGIC ---
    const handleSearch = () => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        
        // Simple client-side search of loaded chunks
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
                    
                    {/* LEFT: RESULTS */}
                    <div className="flex-1 overflow-y-auto custom-scroll space-y-4 pr-2">
                        {searchResults.length > 0 ? (
                            searchResults.map((hit, i) => (
                                <div key={i} className="bg-slate-800 border border-slate-700 p-4 rounded-lg hover:border-cyan-500/50 transition-colors">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-cyan-400 uppercase bg-cyan-900/20 px-2 py-1 rounded">{hit.title || "Unknown Source"}</span>
                                        <span className="text-[10px] text-slate-500">Result #{i+1}</span>
                                    </div>
                                    <p className="text-sm text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                                        {hit.content.replace(new RegExp(`(${searchQuery})`, 'gi'), '<mark class="bg-amber-500/30 text-white rounded px-0.5">$1</mark>').split('<mark').map((part, idx) => idx === 0 ? part : <span key={idx}><mark dangerouslySetInnerHTML={{__html: '<mark' + part}} /></span>)}
                                    </p>
                                </div>
                            ))
                        ) : searchQuery ? (
                            <div className="text-center text-slate-500 mt-10">No lore found matching "{searchQuery}".</div>
                        ) : (
                            <div className="text-center text-slate-600 mt-20 flex flex-col items-center">
                                <Icon name="library" size={48} className="mb-4 opacity-50"/>
                                <p>Search the archives to verify knowledge.</p>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: UPLOAD */}
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
                                    <p className="text-xs text-slate-500 mt-2">Reading & Chunking PDF</p>
                                </>
                            ) : (
                                <>
                                    <Icon name="upload-cloud" size={48} className="text-slate-500 mb-4"/>
                                    <p className="font-bold text-slate-300 mb-2">Drop PDF / Text Here</p>
                                    <p className="text-xs text-slate-500">Supports .pdf, .txt</p>
                                    <p className="text-[10px] text-slate-600 mt-4">Large files will be split into AI-readable chunks.</p>
                                </>
                            )}
                        </div>
                        
                        {/* Stats / Info */}
                        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><Icon name="cpu" size={12}/> Lore Engine Status</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Knowledge Base</span>
                                    <span className="text-green-400">Active</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Context Window</span>
                                    <span className="text-slate-300">~128k Tokens</span>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-500 leading-tight">
                                    Uploaded lore is accessible to the AI Forge, Chat, and World Generator.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoreView;